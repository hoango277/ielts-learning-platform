import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { config } from '../config.ts';
import { MIGRATIONS } from './schema.ts';

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

type Param = SQLInputValue | boolean | undefined;
type Params = Param[] | [Record<string, Param>];

const statements = new Map<string, StatementSync>();

function prepare(sql: string): StatementSync {
  let stmt = statements.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    // Cho phép truyền object tham số dùng chung cho nhiều câu SQL (bỏ qua khoá không dùng)
    stmt.setAllowUnknownNamedParameters(true);
    statements.set(sql, stmt);
  }
  return stmt;
}

// node:sqlite không nhận boolean/undefined → chuẩn hoá trước khi bind
function clean(value: Param): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function bind(params: Params): SQLInputValue[] | [Record<string, SQLInputValue>] {
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !ArrayBuffer.isView(params[0])) {
    const named: Record<string, SQLInputValue> = {};
    for (const [k, v] of Object.entries(params[0] as Record<string, Param>)) named[k] = clean(v);
    return [named];
  }
  return (params as Param[]).map(clean);
}

export function all<T>(sql: string, ...params: Params): T[] {
  return prepare(sql).all(...(bind(params) as SQLInputValue[])) as T[];
}

export function get<T>(sql: string, ...params: Params): T | undefined {
  return prepare(sql).get(...(bind(params) as SQLInputValue[])) as T | undefined;
}

export function run(sql: string, ...params: Params) {
  return prepare(sql).run(...(bind(params) as SQLInputValue[]));
}

let txDepth = 0;
export function tx<T>(fn: () => T): T {
  // Cho phép lồng nhau bằng SAVEPOINT
  const name = `sp_${txDepth}`;
  db.exec(txDepth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
  txDepth++;
  try {
    const result = fn();
    txDepth--;
    db.exec(txDepth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return result;
  } catch (err) {
    txDepth--;
    db.exec(txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}`);
    throw err;
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(all<{ id: number }>('SELECT id FROM _migrations').map((r) => r.id));
  const pending = MIGRATIONS.filter((m) => !applied.has(m.id));
  if (!pending.length) return;
  // Dựng lại bảng (DROP + RENAME) cần tắt khoá ngoại, nếu không DROP TABLE sẽ xoá dây chuyền bảng con.
  // PRAGMA này không đổi được bên trong transaction nên đặt ở ngoài.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const m of pending) {
      tx(() => {
        db.exec(m.sql);
        run("INSERT INTO _migrations (id, applied_at) VALUES (?, datetime('now'))", m.id);
      });
      console.log(`[db] applied migration ${m.id}`);
    }
    const broken = all<{ table: string }>('PRAGMA foreign_key_check');
    if (broken.length) console.warn('[db] cảnh báo khoá ngoại sau migration:', broken);
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

migrate();
