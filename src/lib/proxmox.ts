/**
 * Proxmox API Client
 * Handles communication with Proxmox VE and Backup Server
 */

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

    // Returns valid headers for requests
    private async getHeaders(): Promise<HeadersInit> {
        const headers: HeadersInit = {
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

    private async authenticate() {
        if (!this.config.username || !this.config.password) {
            throw new Error('Username and password required for authentication');
        }

        console.log('Authenticating with password...');
        try {
            const res = await fetch(`${this.config.url}/api2/json/access/ticket`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.config.username,
                    password: this.config.password
                }),
                signal: AbortSignal.timeout(10000)
            });

            if (!res.ok) throw new Error('Authentication failed');
            const data = await res.json();
            this.ticket = data.data.ticket;
            this.csrfToken = data.data.CSRFPreventionToken;
        } catch (e) {
            console.error('Auth Error:', e);
            throw e;
        }
    }

    async checkStatus(): Promise<boolean> {
        try {
            const headers = await this.getHeaders();
            const res = await fetch(`${this.config.url}/api2/json/version`, {
                headers,
                signal: AbortSignal.timeout(5000)
            });
            return res.ok;
        } catch (e) {
            console.error('Proxmox connection failed:', e);
            return false;
        }
    }

    // Generate a new API token for the current user
    async generateToken(tokenId: string = 'proxhost-backup'): Promise<string> {
        // Ensure we are authenticated first (Ticket mode)
        if (!this.ticket) await this.authenticate();

        // Determine user ID (simple extraction usually works, or fetch from /access/ticket response)
        // PROXMOX expects: /access/users/{userid}/token/{tokenid}
        const userId = this.config.username;
        if (!userId) throw new Error("No username provided");

        const headers = await this.getHeaders();

        try {
            // Check if token already exists? No, just try to create. 
            // Note: If it exists, this might fail unless we delete it first or add random suffix. 
            // For robustness, we'll try to delete it first (ignore error) then create.

            // Delete (Cleanup old)
            await fetch(`${this.config.url}/api2/json/access/users/${userId}/token/${tokenId}`, {
                method: 'DELETE',
                headers
            });

            // Create
            const res = await fetch(`${this.config.url}/api2/json/access/users/${userId}/token/${tokenId}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    privsep: 0 // No privilege separation for simplicity in automation
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to create token: ${res.status} ${err}`);
            }

            const data = await res.json();
            // data.data.value contains the SECRET
            // Full token format: user@pam!tokenid=secret
            const fullToken = `${userId}!${tokenId}=${data.data.value}`;
            return fullToken;

        } catch (e) {
            console.error("Token Generation Failed:", e);
            throw e;
        }
    }
}
