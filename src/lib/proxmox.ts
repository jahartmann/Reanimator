/**
 * Proxmox API Client
 * Handles communication with Proxmox VE and Backup Server
 * Uses undici for proper SSL bypass with self-signed certificates
 */

import { Agent, fetch as undiciFetch } from 'undici';

// Create an agent that ignores SSL certificate errors
// Required for Proxmox servers with self-signed certificates
const insecureAgent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});

interface ProxmoxConfig {
    url: string;
    token?: string; // user@pam!token_id=secret
    username?: string;
    password?: string;
    type: 'pve' | 'pbs';
}

export class ProxmoxClient {
    private config: ProxmoxConfig;
    private ticket: string | null = null;
    private csrfToken: string | null = null;

    constructor(config: ProxmoxConfig) {
        this.config = config;
    }

    // Custom fetch that uses undici with SSL bypass
    private async secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
        console.log(`[Proxmox] Fetching: ${url}`);
        try {
            const response = await undiciFetch(url, {
                ...options,
                dispatcher: insecureAgent
            } as any);
            return response as unknown as Response;
        } catch (error) {
            console.error('[Proxmox] Fetch error:', error);
            throw error;
        }
    }

    // Returns valid headers for requests
    private async getHeaders(): Promise<Record<string, string>> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.config.token) {
            // PVE requires "PVEAPIToken=...", PBS requires "PBSAPIToken=..."
            const prefix = this.config.type === 'pve' ? 'PVEAPIToken' : 'PBSAPIToken';
            headers['Authorization'] = `${prefix}=${this.config.token}`;
        } else {
            if (!this.ticket) await this.authenticate();
            if (this.ticket) {
                // PVEAuthCookie vs PBSAuthCookie
                const cookieName = this.config.type === 'pve' ? 'PVEAuthCookie' : 'PBSAuthCookie';
                headers['Cookie'] = `${cookieName}=${this.ticket}`;
                if (this.csrfToken) headers['CSRFPreventionToken'] = this.csrfToken;
            }
        }
        return headers;
    }

    // Authenticate with username/password to get a session ticket
    async authenticate(): Promise<void> {
        if (!this.config.username || !this.config.password) {
            throw new Error('Username and password required for authentication');
        }

        console.log('[Proxmox] Authenticating with password...');
        const authUrl = `${this.config.url}/api2/json/access/ticket`;

        try {
            const body = new URLSearchParams({
                username: this.config.username,
                password: this.config.password
            }).toString();

            const res = await this.secureFetch(authUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('[Proxmox] Auth failed:', res.status, errText);
                throw new Error(`Authentication failed: ${res.status} - ${errText}`);
            }

            const data = await res.json() as { data: { ticket: string; CSRFPreventionToken: string } };
            this.ticket = data.data.ticket;
            this.csrfToken = data.data.CSRFPreventionToken;
            console.log('[Proxmox] Authentication successful!');
        } catch (e) {
            console.error('[Proxmox] Auth Error:', e);
            throw new Error(`Failed to authenticate: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // Check if the server is reachable
    async checkStatus(): Promise<boolean> {
        try {
            const headers = await this.getHeaders();
            const res = await this.secureFetch(`${this.config.url}/api2/json/version`, {
                method: 'GET',
                headers
            });
            return res.ok;
        } catch (e) {
            console.error('[Proxmox] Connection failed:', e);
            return false;
        }
    }

    // Generate a new API token for the current user
    async generateToken(tokenId: string = 'proxhost-backup'): Promise<string> {
        // Ensure we are authenticated first (Ticket mode)
        if (!this.ticket) {
            await this.authenticate();
        }

        // Determine user ID
        const userId = this.config.username;
        if (!userId) throw new Error("No username provided");

        const headers = await this.getHeaders();
        console.log('[Proxmox] Generating API token for user:', userId);

        try {
            // Try to delete existing token first (ignore errors)
            try {
                const deleteUrl = `${this.config.url}/api2/json/access/users/${encodeURIComponent(userId)}/token/${tokenId}`;
                await this.secureFetch(deleteUrl, {
                    method: 'DELETE',
                    headers
                });
                console.log('[Proxmox] Deleted existing token');
            } catch (e) {
                // Ignore - token might not exist
            }

            // Create new token
            const createUrl = `${this.config.url}/api2/json/access/users/${encodeURIComponent(userId)}/token/${tokenId}`;
            const res = await this.secureFetch(createUrl, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    privsep: '0' // No privilege separation - token inherits user permissions
                }).toString()
            });

            if (!res.ok) {
                const err = await res.text();
                console.error('[Proxmox] Token creation failed:', res.status, err);
                throw new Error(`Failed to create token: ${res.status} - ${err}`);
            }

            const data = await res.json() as { data: { value: string } };
            // Full token format: user@pam!tokenid=secret
            const fullToken = `${userId}!${tokenId}=${data.data.value}`;
            console.log('[Proxmox] Token generated successfully!');
            return fullToken;

        } catch (e) {
            console.error('[Proxmox] Token Generation Failed:', e);
            throw new Error(`Token generation failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
