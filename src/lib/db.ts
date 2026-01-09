import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
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
    status TEXT DEFAULT 'unknown',
    last_check DATETIME
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source_server_id INTEGER NOT NULL,
    target_server_id INTEGER NOT NULL,
    schedule TEXT NOT NULL, -- Cron expression
    next_run DATETIME,
    enabled BOOLEAN DEFAULT 1,
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
`);

export default db;
