// SQLite through Node's built-in driver (Node ≥ 22.13). Schema changes are appended to
// MIGRATIONS and applied in order, tracked by PRAGMA user_version.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     name_key TEXT NOT NULL UNIQUE,
     role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
     salt TEXT NOT NULL,
     hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE drafts (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     task_id TEXT NOT NULL,
     token TEXT NOT NULL UNIQUE,
     source_name TEXT NOT NULL,
     root TEXT NOT NULL,
     entry TEXT NOT NULL,
     file_count INTEGER NOT NULL,
     bytes INTEGER NOT NULL,
     digest TEXT NOT NULL,
     checks TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE works (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     owner_id TEXT REFERENCES users (id) ON DELETE SET NULL,
     title TEXT NOT NULL,
     summary TEXT NOT NULL DEFAULT '',
     model_id TEXT,
     model_name TEXT NOT NULL,
     vendor TEXT NOT NULL DEFAULT '',
     effort TEXT NOT NULL DEFAULT '',
     tool TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'questioned')),
     status_reason TEXT NOT NULL DEFAULT '',
     reviewed_by TEXT,
     reviewed_at INTEGER,
     content_key TEXT NOT NULL UNIQUE,
     source_name TEXT NOT NULL,
     root TEXT NOT NULL,
     entry TEXT NOT NULL,
     file_count INTEGER NOT NULL,
     bytes INTEGER NOT NULL,
     digest TEXT NOT NULL,
     checks TEXT NOT NULL,
     trial TEXT NOT NULL DEFAULT '{}',
     captures TEXT NOT NULL DEFAULT '{}',
     cover TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted_at INTEGER,
     deleted_by TEXT
   );
   CREATE INDEX works_task ON works (task_id, status);
   CREATE INDEX works_owner ON works (owner_id);
   CREATE TABLE reactions (
     task_id TEXT NOT NULL,
     work_id TEXT NOT NULL,
     user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     emoji TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (task_id, work_id, user_id, emoji)
   );
   CREATE TABLE matches (
     id TEXT PRIMARY KEY,
     user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
     task_id TEXT NOT NULL,
     a_work TEXT NOT NULL,
     b_work TEXT NOT NULL,
     a_token TEXT NOT NULL UNIQUE,
     b_token TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     choice TEXT CHECK (choice IN ('a', 'b', 'tie', 'skip')),
     decided_at INTEGER
   );
   CREATE INDEX matches_user ON matches (user_id, created_at);
   CREATE TABLE votes (
     id TEXT PRIMARY KEY,
     match_id TEXT NOT NULL UNIQUE,
     user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
     task_id TEXT NOT NULL,
     a_work TEXT NOT NULL,
     b_work TEXT NOT NULL,
     pair_key TEXT NOT NULL,
     choice TEXT NOT NULL CHECK (choice IN ('a', 'b', 'tie')),
     created_at INTEGER NOT NULL,
     UNIQUE (user_id, pair_key)
   );
   CREATE INDEX votes_task ON votes (task_id, created_at);
   CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at INTEGER NOT NULL,
     actor_id TEXT,
     actor_name TEXT NOT NULL,
     action TEXT NOT NULL,
     task_id TEXT,
     work_id TEXT,
     detail TEXT NOT NULL DEFAULT ''
   );`,
  `CREATE TABLE questions (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users (id),
     title TEXT NOT NULL,
     summary TEXT NOT NULL,
     prompt TEXT NOT NULL,
     tags TEXT NOT NULL,
     templates TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX questions_owner ON questions (owner_id);`,
  `ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT '';`,
  `ALTER TABLE matches ADD COLUMN datapack_root TEXT;
   ALTER TABLE matches ADD COLUMN datapack_version TEXT;
   ALTER TABLE matches ADD COLUMN a_identity TEXT;
   ALTER TABLE matches ADD COLUMN b_identity TEXT;
   ALTER TABLE votes ADD COLUMN a_identity TEXT;
   ALTER TABLE votes ADD COLUMN b_identity TEXT;
   ALTER TABLE votes ADD COLUMN identity_source TEXT NOT NULL DEFAULT 'legacy';
   CREATE INDEX matches_datapack_expiry ON matches (datapack_root, expires_at);`,
  `ALTER TABLE votes ADD COLUMN a_correction TEXT;
   ALTER TABLE votes ADD COLUMN b_correction TEXT;`,
];

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  for (let step = version; step < MIGRATIONS.length; step++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[step]);
      db.exec(`PRAGMA user_version = ${step + 1}`);
    });
  }
  return db;
}

export function transaction(db, run) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
