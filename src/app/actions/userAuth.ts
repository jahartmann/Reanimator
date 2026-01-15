'use server';

import db from '@/lib/db';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

// ====== LOGGING CONFIG ======
const LOG_FILE = 'auth-debug.log';

function logAuth(message: string) {
    const logPath = path.join(process.cwd(), LOG_FILE);
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logPath, line);
    } catch (e) {
        console.error('Failed to write to auth log:', e);
    }
    console.log(message);
}

// ====== TYPES ======

export interface User {
    id: number;
    username: string;
    email: string | null;
    is_admin: boolean;
    is_active: boolean;
    force_password_change: boolean;
    created_at: string;
    last_login: string | null;
}

export interface Role {
    id: number;
    name: string;
    description: string | null;
}

export interface Permission {
    id: number;
    name: string;
    description: string | null;
}

export interface Session {
    id: string;
    user_id: number;
    expires_at: string;
    created_at: string;
}

export interface ServerAccess {
    server_id: number;
    can_view: boolean;
    can_manage: boolean;
    can_migrate: boolean;
}

// ====== SESSION CONFIG ======
const SESSION_DURATION_HOURS = 24;

// ====== SESSION MANAGEMENT ======

function generateSessionId(): string {
    return randomBytes(32).toString('hex');
}

async function createSession(userId: number): Promise<string> {
    const sessionId = generateSessionId();
    // Using single quotes for 'now' to satisfy SQLite
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
        .run(sessionId, userId, expiresAt);

    return sessionId;
}

function deleteSession(sessionId: string): void {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function cleanExpiredSessions(): void {
    // Single quotes for SQLite literal 'now'
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// ====== AUTHENTICATION ======

export async function login(username: string, password: string): Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }> {
    logAuth(`[Auth] Login attempt for: ${username} (CWD: ${process.cwd()})`);

    try {
        cleanExpiredSessions();

        // 1. HARDCODED BYPASS FOR DIAGNOSIS
        // If this works, the issue is purely bcrypt/DB-read related.
        if (username === 'admin' && password === 'admin') {
            logAuth('[Auth] *** ADMIN BYPASS TRIGGERED ***');

            // Still need a user ID to create session, so ensure user exists
            let user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;

            if (!user) {
                logAuth('[Auth] Admin user missing during bypass! Creating...');
                const adminHash = bcrypt.hashSync('admin', 10);
                db.prepare(`
                    INSERT INTO users (username, password_hash, is_admin, is_active, force_password_change)
                    VALUES ('admin', ?, 1, 1, 1)
                `).run(adminHash);
                user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;
            }

            logAuth(`[Auth] Bypass successful. User ID: ${user.id}`);

            // Create session
            const sessionId = await createSession(user.id);
            const cookieStore = await cookies();
            cookieStore.set('session', sessionId, {
                httpOnly: true,
                secure: false, // process.env.NODE_ENV === 'production', // FORCE FALSE for debugging
                sameSite: 'lax',
                maxAge: SESSION_DURATION_HOURS * 60 * 60,
                path: '/',
            });

            db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

            return { success: true, requiresPasswordChange: !!user.force_password_change };
        }

        // EMERGENCY SELF-HEALING: If logging in as admin and admin doesn't exist, create it.
        // This handles cases where the DB is fresh or paths are messed up.
        if (username === 'admin') {
            const adminCheck = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
            if (!adminCheck) {
                logAuth('[Auth] Admin user missing! Creating default admin user (Self-Healing)...');
                const adminHash = bcrypt.hashSync('admin', 10);
                db.prepare(`
                    INSERT INTO users (username, password_hash, is_admin, is_active, force_password_change)
                    VALUES ('admin', ?, 1, 1, 1)
                `).run(adminHash);
                logAuth('[Auth] Default admin created successfully.');
            }
        }

        // Find user
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
            .get(username) as any;

        logAuth(`[Auth] User found: ${user ? 'YES' : 'NO'}`);

        if (!user) {
            logAuth('[Auth] Login failed: User not found or inactive');
            await new Promise(resolve => setTimeout(resolve, 500));
            return { success: false, error: 'Ungültiger Benutzername oder Passwort' };
        }

        logAuth('[Auth] Verifying password...');
        const validPassword = await bcrypt.compare(password, user.password_hash);
        logAuth(`[Auth] Password valid: ${validPassword}`);

        if (!validPassword) {
            return { success: false, error: 'Ungültiger Benutzername oder Passwort' };
        }

        // Create session
        logAuth('[Auth] Creating session...');
        const sessionId = await createSession(user.id);

        // Set cookie
        const cookieStore = await cookies();
        cookieStore.set('session', sessionId, {
            httpOnly: true,
            secure: false, // process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_DURATION_HOURS * 60 * 60,
            path: '/',
        });

        // Update last login
        db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

        if (user.force_password_change) {
            logAuth('[Auth] Password change required');
            return { success: true, requiresPasswordChange: true };
        }

        logAuth('[Auth] Login successful');
        return { success: true };
    } catch (error) {
        logAuth(`[Auth] Login System Error: ${error}`);
        return { success: false, error: 'Ein interner Fehler ist aufgetreten' };
    }
}

export async function logout(): Promise<void> {
    try {
        const cookieStore = await cookies();
        const sessionId = cookieStore.get('session')?.value;

        if (sessionId) {
            deleteSession(sessionId);
            cookieStore.delete('session');
        }
    } catch (e) {
        // Ignore errors during logout
    }

    redirect('/login');
}

export async function getCurrentUser(): Promise<User | null> {
    try {
        const cookieStore = await cookies();
        const sessionId = cookieStore.get('session')?.value;

        // logAuth(`[Auth] getCurrentUser - Cookie session: ${sessionId ? sessionId.substring(0, 8) + '...' : 'NONE'}`);

        if (!sessionId) {
            logAuth('[Auth] getCurrentUser: No session cookie found');
            return null;
        }

        const session = db.prepare(`
            SELECT s.*, u.id as uid, u.username, u.email, u.is_admin, u.is_active, 
                   u.force_password_change, u.created_at, u.last_login
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
        `).get(sessionId) as any;

        if (!session) {
            logAuth(`[Auth] getCurrentUser: Session not found in DB or expired/inactive. ID: ${sessionId}`);
            return null;
        }

        return {
            id: session.uid,
            username: session.username,
            email: session.email,
            is_admin: !!session.is_admin,
            is_active: !!session.is_active,
            force_password_change: !!session.force_password_change,
            created_at: session.created_at,
            last_login: session.last_login,
        };
    } catch (error) {
        logAuth(`[Auth] getCurrentUser failed: ${error}`);
        console.error('[Auth] getCurrentUser failed:', error);
        return null;
    }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Nicht angemeldet' };

    const dbUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as any;

    const validPassword = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!validPassword) {
        return { success: false, error: 'Aktuelles Passwort ist falsch' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    db.prepare('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?')
        .run(newHash, user.id);

    return { success: true };
}

// ====== USER MANAGEMENT ======

export async function getUsers(): Promise<User[]> {
    const user = await getCurrentUser();
    if (!user?.is_admin) {
        throw new Error('Keine Berechtigung');
    }

    const users = db.prepare(`
        SELECT id, username, email, is_admin, is_active, force_password_change, created_at, last_login
        FROM users ORDER BY username
    `).all() as any[];

    return users.map(u => ({
        ...u,
        is_admin: !!u.is_admin,
        is_active: !!u.is_active,
        force_password_change: !!u.force_password_change,
    }));
}

export async function createUser(data: {
    username: string;
    password: string;
    email?: string;
    is_admin?: boolean;
}): Promise<{ success: boolean; error?: string; user?: User }> {
    const currentUser = await getCurrentUser();
    if (!currentUser?.is_admin) {
        return { success: false, error: 'Keine Berechtigung' };
    }

    try {
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(data.username);
        if (existing) {
            return { success: false, error: 'Benutzername bereits vergeben' };
        }

        const passwordHash = await bcrypt.hash(data.password, 10);

        const result = db.prepare(`
            INSERT INTO users (username, password_hash, email, is_admin, force_password_change)
            VALUES (?, ?, ?, ?, 1)
        `).run(data.username, passwordHash, data.email || null, data.is_admin ? 1 : 0);

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any;

        return {
            success: true,
            user: {
                ...user,
                is_admin: !!user.is_admin,
                is_active: !!user.is_active,
                force_password_change: !!user.force_password_change,
            }
        };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

export async function updateUser(userId: number, data: {
    email?: string;
    is_admin?: boolean;
    is_active?: boolean;
    password?: string;
}): Promise<{ success: boolean; error?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser?.is_admin) {
        return { success: false, error: 'Keine Berechtigung' };
    }

    try {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.email !== undefined) {
            updates.push('email = ?');
            values.push(data.email);
        }
        if (data.is_admin !== undefined) {
            updates.push('is_admin = ?');
            values.push(data.is_admin ? 1 : 0);
        }
        if (data.is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(data.is_active ? 1 : 0);
        }
        if (data.password) {
            updates.push('password_hash = ?');
            values.push(await bcrypt.hash(data.password, 10));
            updates.push('force_password_change = 1');
        }

        if (updates.length === 0) {
            return { success: true };
        }

        values.push(userId);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

export async function deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser?.is_admin) {
        return { success: false, error: 'Keine Berechtigung' };
    }

    if (currentUser.id === userId) {
        return { success: false, error: 'Eigenen Benutzer kann nicht gelöscht werden' };
    }

    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

// ====== ROLES & PERMISSIONS ======

export async function getRoles(): Promise<Role[]> {
    return db.prepare('SELECT * FROM roles ORDER BY name').all() as Role[];
}

export async function getPermissions(): Promise<Permission[]> {
    return db.prepare('SELECT * FROM permissions ORDER BY name').all() as Permission[];
}

export async function getUserRoles(userId: number): Promise<Role[]> {
    return db.prepare(`
        SELECT r.* FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ?
    `).all(userId) as Role[];
}

export async function setUserRoles(userId: number, roleIds: number[]): Promise<{ success: boolean; error?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser?.is_admin) {
        return { success: false, error: 'Keine Berechtigung' };
    }

    try {
        db.transaction(() => {
            db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
            const insert = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
            for (const roleId of roleIds) {
                insert.run(userId, roleId);
            }
        })();
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

export async function getUserServerAccess(userId: number): Promise<ServerAccess[]> {
    return db.prepare('SELECT * FROM user_server_access WHERE user_id = ?')
        .all(userId) as ServerAccess[];
}

export async function setUserServerAccess(userId: number, access: ServerAccess[]): Promise<{ success: boolean; error?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser?.is_admin) {
        return { success: false, error: 'Keine Berechtigung' };
    }

    try {
        db.transaction(() => {
            db.prepare('DELETE FROM user_server_access WHERE user_id = ?').run(userId);
            const insert = db.prepare(`
                INSERT INTO user_server_access (user_id, server_id, can_view, can_manage, can_migrate)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (const a of access) {
                insert.run(userId, a.server_id, a.can_view ? 1 : 0, a.can_manage ? 1 : 0, a.can_migrate ? 1 : 0);
            }
        })();
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

// ====== PERMISSION CHECKS ======

export async function hasPermission(permission: string): Promise<boolean> {
    const user = await getCurrentUser();
    if (!user) return false;
    if (user.is_admin) return true;

    const result = db.prepare(`
        SELECT 1 FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ? AND p.name = ?
        LIMIT 1
    `).get(user.id, permission);

    return !!result;
}

export async function canAccessServer(serverId: number, action: 'view' | 'manage' | 'migrate' = 'view'): Promise<boolean> {
    const user = await getCurrentUser();
    if (!user) return false;
    if (user.is_admin) return true;

    const access = db.prepare('SELECT * FROM user_server_access WHERE user_id = ? AND server_id = ?')
        .get(user.id, serverId) as ServerAccess | undefined;

    if (!access) return false;

    switch (action) {
        case 'view': return access.can_view;
        case 'manage': return access.can_manage;
        case 'migrate': return access.can_migrate;
        default: return false;
    }
}

export async function isAuthenticated(): Promise<boolean> {
    const user = await getCurrentUser();
    return user !== null;
}
