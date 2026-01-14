import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const getPaths = () => {
  const cwd = process.cwd();
  const data = path.join(cwd, 'data');
  const backups = path.join(cwd, 'data', 'config-backups');
  return { data, backups };
};

const dirs = getPaths();

if (!fs.existsSync(dirs.data)) {
  fs.mkdirSync(dirs.data, { recursive: true });
}
if (!fs.existsSync(dirs.backups)) {
  fs.mkdirSync(dirs.backups, { recursive: true });
}

const db = new Database(path.join(dirs.data, 'proxhost.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 3000'); // Wait up to 3s for locks

export default db;
export function getBackupDir() {
  return getPaths().backups;
}
