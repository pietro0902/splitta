/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

// Use dynamic requires to prevent the bundler from tracing these Node.js modules
const mod = "better-sqlite3";
const Database = require(mod) as any;
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const DB_PATH = path.join(process.cwd(), ".wrangler", "state", "local.sqlite");

let _db: any = null;

function getLocalDb(): any {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Apply migrations
  const migrationsDir = path.join(process.cwd(), "migrations");
  const files = fs.readdirSync(migrationsDir).sort();
  _db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");
  for (const file of files) {
    if (!file.endsWith(".sql")) continue;
    const applied = _db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (applied) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    _db.exec(sql);
    _db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }

  return _db;
}

class LocalD1PreparedStatement {
  private stmt: string;
  private params: unknown[] = [];
  private sqliteDb: any;

  constructor(sqliteDb: any, sql: string) {
    this.sqliteDb = sqliteDb;
    this.stmt = sql;
  }

  bind(...values: unknown[]) {
    this.params = values;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const results = this.sqliteDb.prepare(this.stmt).all(...this.params) as T[];
    return { results };
  }

  async first<T>(): Promise<T | null> {
    const result = this.sqliteDb.prepare(this.stmt).get(...this.params) as T | undefined;
    return result ?? null;
  }

  async run(): Promise<{ meta: { last_row_id: number; changes: number } }> {
    const info = this.sqliteDb.prepare(this.stmt).run(...this.params);
    return {
      meta: {
        last_row_id: Number(info.lastInsertRowid),
        changes: info.changes,
      },
    };
  }
}

export class LocalD1Database {
  private sqliteDb: any;

  constructor() {
    this.sqliteDb = getLocalDb();
  }

  prepare(sql: string) {
    return new LocalD1PreparedStatement(this.sqliteDb, sql);
  }

  async batch(statements: LocalD1PreparedStatement[]) {
    const transaction = this.sqliteDb.transaction(() => {
      return statements.map((stmt) => (stmt as any).run());
    });
    return transaction();
  }
}
