import { createRequire } from "node:module";

// vitest (Vite) の resolver が node:sqlite を解決できないため createRequire 経由で読む
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

type Database = InstanceType<typeof DatabaseSync>;

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  const path = process.env.DATABASE_URL ?? "./data.db";
  db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id         TEXT    PRIMARY KEY,
      title      TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}
