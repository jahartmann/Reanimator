import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Use relative paths to avoid Turbopack analysis issues with process.cwd()
const DATA_DIR = 'data';
const BACKUP_DIR = 'data/config-backups';
const DB_PATH = 'data/proxhost.db';

// Ensure directories exist using literals/constants
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 3000'); // Wait up to 3s for locks

export default db;
export function getBackupDir() {
  // Return relative path string to avoid Turbopack resolving it as a glob
  return BACKUP_DIR;
}
