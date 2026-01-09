'use server';

import db, { backupDir } from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import path from 'path';
import fs from 'fs';

interface Server {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_key?: string;
}

interface ConfigBackup {
    id: number;
    server_id: number;
    backup_path: string;
    backup_date: string;
    file_count: number;
    total_size: number;
    status: string;
}

// COMPLETE /etc backup - all configuration files
// Plus additional important system directories
const BACKUP_PATHS = [
    '/etc',           // Complete /etc directory with ALL configs
    '/root/.ssh',     // SSH keys for root
    '/var/spool/cron' // Cron jobs
];

// Get all config backups for a server
export async function getConfigBackups(serverId: number): Promise<ConfigBackup[]> {
    const backups = db.prepare(`
        SELECT * FROM config_backups 
        WHERE server_id = ? 
        ORDER BY backup_date DESC
    `).all(serverId) as ConfigBackup[];
    return backups;
}

// Create a new config backup - backs up ENTIRE /etc directory
export async function createConfigBackup(serverId: number): Promise<{ success: boolean; message: string; backupId?: number }> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as Server | undefined;

    if (!server) {
        return { success: false, message: 'Server nicht gefunden' };
    }

    // Check if SSH is configured
    if (!server.ssh_key) {
        return { success: false, message: 'SSH-Passwort nicht konfiguriert. Bitte Server bearbeiten und SSH-Zugangsdaten eingeben.' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Use string concatenation to avoid "Overly broad patterns" warning with template literals
    const serverDir = 'server-' + serverId;
    const backupPath = path.join(backupDir, serverDir, timestamp);

    console.log(`[ConfigBackup] Starting FULL /etc backup for ${server.name} to ${backupPath}`);

    try {
        // Create backup directory
        fs.mkdirSync(backupPath, { recursive: true });

        // Connect via SSH
        const ssh = createSSHClient(server);
        await ssh.connect();

        let totalFiles = 0;
        const errors: string[] = [];

        // Backup each path (mainly /etc)
        for (const remotePath of BACKUP_PATHS) {
            try {
                // Remove leading slash to ensure we join correctly relative to backup dir
                // and avoid "Overly broad patterns" build warning
                const relativeRemote = remotePath.startsWith('/') ? remotePath.slice(1) : remotePath;
                const localPath = path.join(backupPath, relativeRemote);

                console.log(`[ConfigBackup] Backing up ${remotePath}...`);

                // Check if path exists
                const checkResult = await ssh.exec(`test -e "${remotePath}" && echo "exists" || echo "none"`);

                if (checkResult.trim() === 'exists') {
                    const files = await ssh.downloadDir(remotePath, localPath, (file) => {
                        console.log(`[ConfigBackup] Downloaded: ${file}`);
                    });
                    totalFiles += files;
                    console.log(`[ConfigBackup] ${remotePath}: ${files} files`);
                } else {
                    console.log(`[ConfigBackup] Path does not exist: ${remotePath}`);
                }
            } catch (err) {
                console.error(`[ConfigBackup] Error backing up ${remotePath}:`, err);
                errors.push(`${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // Also save system info for disaster recovery
        try {
            const systemInfo = await ssh.exec('cat /etc/os-release; echo "---"; hostname -f; echo "---"; ip a; echo "---"; lsblk -f; echo "---"; cat /etc/fstab');
            const infoPath = path.join(backupPath, 'SYSTEM_INFO.txt');
            fs.writeFileSync(infoPath, systemInfo);

            // Save disk UUIDs separately for easy reference
            const uuids = await ssh.exec('blkid');
            const uuidPath = path.join(backupPath, 'DISK_UUIDS.txt');
            fs.writeFileSync(uuidPath, uuids);
        } catch (err) {
            console.error('[ConfigBackup] Error saving system info:', err);
        }

        // Create disaster recovery guide
        const recoveryGuide = createRecoveryGuide(server);
        fs.writeFileSync(path.join(backupPath, 'WIEDERHERSTELLUNG.md'), recoveryGuide);

        ssh.disconnect();

        // Calculate total size
        const calculateSize = (dir: string): number => {
            let size = 0;
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        size += calculateSize(filePath);
                    } else {
                        size += stat.size;
                    }
                }
            }
            return size;
        };

        const totalSize = calculateSize(backupPath);

        // Save to database
        const result = db.prepare(`
            INSERT INTO config_backups (server_id, backup_path, file_count, total_size, status, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(serverId, backupPath, totalFiles, totalSize, 'complete', errors.length > 0 ? errors.join('\n') : null);

        console.log(`[ConfigBackup] Backup complete: ${totalFiles} files, ${totalSize} bytes`);

        return {
            success: true,
            message: `Vollständiges Backup erfolgreich: ${totalFiles} Dateien (${formatBytes(totalSize)})${errors.length > 0 ? ` - ${errors.length} Warnung(en)` : ''}`,
            backupId: result.lastInsertRowid as number
        };

    } catch (err) {
        console.error('[ConfigBackup] Backup failed:', err);
        return {
            success: false,
            message: `Backup fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
        };
    }
}

// Create disaster recovery guide
function createRecoveryGuide(server: Server): string {
    return `# Disaster Recovery Anleitung

## Server: ${server.name}
## Typ: ${server.type.toUpperCase()}
## Erstellt: ${new Date().toLocaleString('de-DE')}

---

## ⚠️ WICHTIG: Festplattenwechsel / Änderung von UUIDs

Wenn Sie eine Festplatte austauschen oder das System neu installieren, ändern sich die UUIDs der Partitionen. Das führt zu Bootproblemen!

### Schritt 1: Neue UUIDs ermitteln
\`\`\`bash
blkid
\`\`\`

### Schritt 2: fstab anpassen
Vergleichen Sie die Datei \`DISK_UUIDS.txt\` (alte UUIDs) mit den neuen und passen Sie an:
\`\`\`bash
nano /etc/fstab
\`\`\`

### Schritt 3: Bootloader aktualisieren
\`\`\`bash
update-grub
update-initramfs -u
\`\`\`

---

## Proxmox VE Wiederherstellung

### 1. Proxmox VE neu installieren
- ISO von https://www.proxmox.com/downloads herunterladen
- Installation durchführen mit gleicher IP-Konfiguration

### 2. Konfiguration wiederherstellen
\`\`\`bash
# /etc/pve Inhalte kopieren (Cluster, VMs, Container)
cp -r /pfad/zum/backup/etc/pve/* /etc/pve/

# Netzwerk-Konfiguration
cp /pfad/zum/backup/etc/network/interfaces /etc/network/interfaces

# Storage-Konfiguration prüfen und anpassen (UUIDs!)
nano /etc/pve/storage.cfg

# Dienste neustarten
systemctl restart pvedaemon pveproxy pvestatd
\`\`\`

### 3. ZFS Pools importieren (falls vorhanden)
\`\`\`bash
zpool import -f <poolname>
\`\`\`

---

## Proxmox Backup Server Wiederherstellung

### 1. PBS neu installieren
- ISO herunterladen und installieren

### 2. Konfiguration wiederherstellen
\`\`\`bash
# PBS Konfiguration
cp -r /pfad/zum/backup/etc/proxmox-backup/* /etc/proxmox-backup/

# Netzwerk
cp /pfad/zum/backup/etc/network/interfaces /etc/network/interfaces

# Dienste neustarten
systemctl restart proxmox-backup-proxy proxmox-backup
\`\`\`

### 3. Datastores wiederherstellen
Falls Datastores auf separaten Laufwerken liegen:
\`\`\`bash
# UUID prüfen und in datastore.cfg anpassen
nano /etc/proxmox-backup/datastore.cfg
\`\`\`

---

## Wichtige Dateien in diesem Backup

| Pfad | Beschreibung |
|------|--------------|
| \`/etc/pve/\` | VM/CT Konfigurationen, Cluster-Config |
| \`/etc/proxmox-backup/\` | PBS Datastore Configs |
| \`/etc/network/interfaces\` | Netzwerk-Konfiguration |
| \`/etc/fstab\` | Mount-Punkte (⚠️ UUIDs prüfen!) |
| \`/etc/ssh/\` | SSH Server Konfiguration |
| \`/root/.ssh/\` | SSH Keys |
| \`DISK_UUIDS.txt\` | Alte Disk UUIDs zum Vergleich |
| \`SYSTEM_INFO.txt\` | System-Informationen |

---

## Checkliste nach Wiederherstellung

- [ ] Netzwerk funktioniert (\`ip a\`, \`ping\`)
- [ ] Web-Interface erreichbar
- [ ] Storage gemountet (\`df -h\`)
- [ ] VMs/Container sichtbar
- [ ] Cluster-Verbindung (falls vorhanden)
- [ ] Backup-Jobs konfiguriert
`;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get files in a backup
export async function getBackupFiles(backupId: number): Promise<{ path: string; size: number }[]> {
    console.log(`[ConfigBackup] Getting files for backup ${backupId}`);
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) {
        console.error(`[ConfigBackup] Backup ${backupId} not found in DB`);
        return [];
    }

    if (!fs.existsSync(backup.backup_path)) {
        console.error(`[ConfigBackup] Path not found: ${backup.backup_path}`);
        return [];
    }

    const files: { path: string; size: number }[] = [];

    const walkDir = (dir: string, basePath: string) => {
        if (!fs.existsSync(dir)) return;

        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = path.join(basePath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkDir(fullPath, relativePath);
            } else {
                files.push({
                    path: relativePath,
                    size: stat.size
                });
            }
        }
    };

    walkDir(backup.backup_path, '');
    console.log(`[ConfigBackup] Found ${files.length} files in ${backup.backup_path}`);
    return files;
}

// Read a file from backup
export async function readBackupFile(backupId: number, filePath: string): Promise<string | null> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) {
        console.error(`[ConfigBackup] Backup ${backupId} not found`);
        return null;
    }

    const fullPath = path.join(backup.backup_path, filePath);
    console.log(`[ConfigBackup] Reading file: ${fullPath}`);

    if (!fs.existsSync(fullPath)) {
        console.error(`[ConfigBackup] File does not exist: ${fullPath}`);
        return null;
    }

    // Security check - prevent path traversal
    const realPath = fs.realpathSync(fullPath);
    if (!realPath.startsWith(backup.backup_path)) {
        console.error(`[ConfigBackup] Path traversal attempt: ${realPath} vs ${backup.backup_path}`);
        return null;
    }

    // Check if binary file
    try {
        const content = fs.readFileSync(fullPath);
        // Simple binary check
        if (content.includes(0)) {
            return '[Binärdatei - kann nicht angezeigt werden]';
        }
        return content.toString('utf-8');
    } catch (e) {
        console.error(`[ConfigBackup] Error reading file: ${e}`);
        return null;
    }
}

// Delete a backup
export async function deleteConfigBackup(backupId: number): Promise<{ success: boolean; message: string }> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) {
        return { success: false, message: 'Backup nicht gefunden' };
    }

    try {
        // Delete files
        if (fs.existsSync(backup.backup_path)) {
            fs.rmSync(backup.backup_path, { recursive: true });
        }

        // Delete from database
        db.prepare('DELETE FROM config_backups WHERE id = ?').run(backupId);

        return { success: true, message: 'Backup gelöscht' };
    } catch (err) {
        return { success: false, message: `Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
    }
}

// Restore a file to server
export async function restoreFile(backupId: number, filePath: string, serverId: number): Promise<{ success: boolean; message: string }> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as Server | undefined;

    if (!backup || !server) {
        return { success: false, message: 'Backup oder Server nicht gefunden' };
    }

    const localPath = path.join(backup.backup_path, filePath);

    if (!fs.existsSync(localPath)) {
        return { success: false, message: 'Datei nicht im Backup gefunden' };
    }

    try {
        const ssh = createSSHClient(server);
        await ssh.connect();

        // The file path in backup corresponds to remote path
        await ssh.uploadFile(localPath, filePath);

        ssh.disconnect();

        return { success: true, message: `Datei ${filePath} wiederhergestellt` };
    } catch (err) {
        return { success: false, message: `Wiederherstellung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
    }
}
