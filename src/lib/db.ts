import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure backup directory exists
const backupDir = path.join(process.cwd(), 'data', 'config-backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'proxhost.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('pve', 'pbs')) NOT NULL,
    url TEXT NOT NULL,
    auth_token TEXT,
    username TEXT,
    password TEXT,
    -- SSH connection details
    ssh_host TEXT,
    ssh_port INTEGER DEFAULT 22,
    ssh_user TEXT DEFAULT 'root',
    ssh_key TEXT,
    -- Status
    status TEXT DEFAULT 'unknown',
    last_check DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    job_type TEXT DEFAULT 'backup', -- backup, snapshot, replication, config
    source_server_id INTEGER NOT NULL,
    target_server_id INTEGER,
    schedule TEXT NOT NULL, -- Cron expression
    next_run DATETIME,
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(source_server_id) REFERENCES servers(id),
    FOREIGN KEY(target_server_id) REFERENCES servers(id)
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    status TEXT CHECK(status IN ('success', 'failed', 'running')),
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    log TEXT,
    FOREIGN KEY(job_id) REFERENCES jobs(id)
  );

  -- Config backups table
  CREATE TABLE IF NOT EXISTS config_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    backup_path TEXT NOT NULL, -- Local path where backup is stored
    backup_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_count INTEGER DEFAULT 0,
    total_size INTEGER DEFAULT 0,
    status TEXT DEFAULT 'complete',
    notes TEXT,
    FOREIGN KEY(server_id) REFERENCES servers(id)
  );

  -- Individual files in a config backup
  CREATE TABLE IF NOT EXISTS config_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_id INTEGER NOT NULL,
    file_path TEXT NOT NULL, -- Original path on server (e.g., /etc/pve/storage.cfg)
    local_path TEXT NOT NULL, -- Path in backup directory
    file_size INTEGER DEFAULT 0,
    file_hash TEXT, -- For detecting changes
    FOREIGN KEY(backup_id) REFERENCES config_backups(id)
  );

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Run migrations for existing databases
try {
  db.exec(`ALTER TABLE servers ADD COLUMN ssh_host TEXT`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE servers ADD COLUMN ssh_port INTEGER DEFAULT 22`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE servers ADD COLUMN ssh_user TEXT DEFAULT 'root'`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE servers ADD COLUMN ssh_key TEXT`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE jobs ADD COLUMN job_type TEXT DEFAULT 'backup'`);
} catch (e) { /* Column exists */ }

export default db;
export { backupDir };
