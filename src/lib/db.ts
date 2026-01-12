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
db.pragma('busy_timeout = 3000'); // Wait up to 3s for locks

export default db;
export { backupDir };
