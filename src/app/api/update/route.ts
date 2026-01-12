import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

// Get version info
export async function GET() {
    try {
        const projectRoot = process.cwd();

        // Read current version from package.json
        const packagePath = path.join(projectRoot, 'package.json');
        let currentVersion = 'unknown';
        try {
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
            currentVersion = packageJson.version;
        } catch (e) { console.error('Failed to read package.json', e) }

        // Get current git commit
        let currentCommit = 'unknown';
        let updateAvailable = false;
        let remoteCommit = 'unknown';
        let commitsBehind = 0;

        try {
            const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: projectRoot });
            currentCommit = commitHash.trim().substring(0, 7);

            // Fetch latest from remote
            await execAsync('git fetch origin main', { cwd: projectRoot });

            // Check if we're behind
            const { stdout: behindCount } = await execAsync(
                'git rev-list HEAD..origin/main --count',
                { cwd: projectRoot }
            );
            commitsBehind = parseInt(behindCount.trim()) || 0;
            updateAvailable = commitsBehind > 0;

            if (updateAvailable) {
                const { stdout: remoteHash } = await execAsync(
                    'git rev-parse origin/main',
                    { cwd: projectRoot }
                );
                remoteCommit = remoteHash.trim().substring(0, 7);
            }
        } catch (e) {
            console.error('Git check failed:', e);
        }

        return NextResponse.json({
            currentVersion,
            currentCommit,
            updateAvailable,
            remoteCommit,
            commitsBehind
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to check version' },
            { status: 500 }
        );
    }
}

// Perform update
export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (message: string) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ message })}\n\n`));
            };

            try {
                const projectRoot = process.cwd();
                const dbPath = path.join(projectRoot, 'data/proxhost.db');
                const dbBackupPath = path.join(os.tmpdir(), `proxhost-backup-${Date.now()}.db`);

                send('🔄 Starting update process...');

                // 1. Backup Database
                if (fs.existsSync(dbPath)) {
                    send('💾 Backing up database...');
                    fs.copyFileSync(dbPath, dbBackupPath);
                    send(`✅ Database backed up to ${dbBackupPath}`);
                } else {
                    send('⚠️ No database found to backup.');
                }

                // 2. Git Stash (handle local changes)
                send('📥 Stashing local changes...');
                try {
                    await execAsync('git stash', { cwd: projectRoot });
                    send('✅ Local changes stashed');
                } catch (e) {
                    send('ℹ️ No local changes to stash or stash failed (ignoring)');
                }

                // 3. Git Pull
                send('⬇️ Pulling latest changes from git...');
                const { stdout: pullOut, stderr: pullErr } = await execAsync(
                    'git pull origin main',
                    { cwd: projectRoot }
                );
                send(pullOut || pullErr || 'Git pull complete');

                // 4. Restore Database (Vital Step!)
                // If git pull overwrote the DB with a "dummy" one, we overwrite it back with our backup
                if (fs.existsSync(dbBackupPath)) {
                    send('♻️ Restoring database from backup...');
                    try {
                        // Check if file exists and remove it to ensure clean copy
                        if (fs.existsSync(dbPath)) {
                            fs.unlinkSync(dbPath);
                        }
                        fs.copyFileSync(dbBackupPath, dbPath);

                        // Also restore config backups folder if needed? 
                        // Usually config backups are untracked so they are safe, 
                        // but if we want to be paranoid we could have backed them up too.
                        // For now, focusing on the main DB.

                        send('✅ Database restored successfully');
                    } catch (e) {
                        send(`❌ Failed to restore database: ${e}`);
                        // Critical error, but we continue to try and build
                    }
                }

                // 5. Build
                send('📦 Installing dependencies...');
                await execAsync('npm install', { cwd: projectRoot }); // Removed --include=dev for speed if unnecessary, put back if needed
                send('✅ Dependencies installed');

                send('🔨 Building application...');
                await execAsync('npm run build', { cwd: projectRoot });
                send('✅ Build complete');

                // 6. Restart
                send('🔄 Restarting service...');

                // Try systemd restart 
                try {
                    // Start in background to allow response to finish? 
                    // No, usually we want to see the command succeed.
                    // But if we restart THIS process, the connection closes.
                    // We'll schedule the restart in a slightly detached way if possible,
                    // or just run it and expect the connection to drop.

                    send('Scheduling restart in 2 seconds...');
                    setTimeout(() => {
                        exec('sudo systemctl restart proxhost-backup', { cwd: projectRoot }, (error) => {
                            if (error) {
                                console.error('Restart failed:', error);
                            }
                        });
                    }, 2000);

                    send('✅ Restart command issued. Refresh page in ~15 seconds.');
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                } catch (e) {
                    send('⚠️ Could not restart service automatically.');
                    send('Please run: sudo systemctl restart proxhost-backup');
                    console.error('Restart error:', e);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Restart failed' })}\n\n`));
                }

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                send(`❌ Error: ${errorMsg}`);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
            }

            // Don't close immediately if we are restarting, but effectively we are done
            // controller.close(); // Let the frontend close or timeout
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}


