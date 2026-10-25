// Заглушка `sdk/db`: DSL схемы генерирует CREATE TABLE, а сырые запросы `sql`
// выполняются в SQLite из Node (node:sqlite) — так тесты проверяют и схему, и SQL.
import { DatabaseSync } from 'node:sqlite';

let database = null;
export function resetDb() { database = new DatabaseSync(':memory:'); return database; }
function conn() { return database || resetDb(); }

const SQL = Symbol('sql');
export function sql(strings, ...values) {
  return { [SQL]: true, strings, values };
}
sql.raw = (s) => ({ [SQL]: true, strings: [s], values: [] });

function compile(q) {
  let text = '';
  const params = [];
  q.strings.forEach((s, i) => {
    text += s;
    if (i < q.values.length) {
      const v = q.values[i];
      if (v && v[SQL]) { const sub = compile(v); text += sub.text; params.push(...sub.params); }
      else if (v && v.__column) text += v.name;
      else { text += '?'; params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v); }
    }
  });
  return { text, params };
}

function prep(q, params) {
  if (typeof q === 'string') return { text: q, params: params || [] };
  return compile(q);
}

export const db = {
  async run(q, p) {
    const { text, params } = prep(q, p);
    const st = conn().prepare(text);
    if (/\breturning\b/i.test(text)) {
      const rows = st.all(...params);
      return { rowsAffected: rows.length, lastInsertRowid: rows[0] && rows[0].id, rows };
    }
    const r = st.run(...params);
    return { rowsAffected: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid), rows: [] };
  },
  async all(q, p) { const { text, params } = prep(q, p); return conn().prepare(text).all(...params).map((r) => ({ ...r })); },
  async get(q, p) { const { text, params } = prep(q, p); const r = conn().prepare(text).get(...params); return r ? { ...r } : null; },
};
export default db;

// ── DSL схемы → DDL ──
function column(type) {
  return (name, opts) => {
    const c = { __column: true, type, name, mods: [] };
    const chain = {
      __column: true, get name() { return c.name; }, set name(v) { c.name = v; }, c,
      primaryKey(o) { c.mods.push('PRIMARY KEY' + (o && o.autoIncrement ? ' AUTOINCREMENT' : '')); return chain; },
      notNull() { c.mods.push('NOT NULL'); return chain; },
      unique() { c.mods.push('UNIQUE'); return chain; },
      default(v) { c.mods.push('DEFAULT ' + (v && v[SQL] ? compile(v).text : typeof v === 'string' ? `'${v}'` : v)); return chain; },
      references() { throw new Error('FK not supported'); },
    };
    return chain;
  };
}
export const integer = column('INTEGER');
export const text = column('TEXT');
export const real = column('REAL');
export const blob = column('BLOB');
const idx = (unique) => (name) => ({ on: (...cols) => ({ name, unique, cols: cols.map((x) => x.name) }) });
export const index = idx(false);
export const uniqueIndex = idx(true);

export function table(name, cols, extra) {
  for (const [k, ch] of Object.entries(cols)) if (!ch.name) ch.name = k;
  const t = { __table: true, name, cols, extras: [] };
  if (extra) t.extras = Object.values(extra(cols));
  return t;
}

export function applySchema(schema) {
  const d = conn();
  for (const t of Object.values(schema).filter((x) => x && x.__table)) {
    const defs = Object.values(t.cols).map((ch) => `${ch.c.name} ${ch.c.type} ${ch.c.mods.join(' ')}`.trim());
    d.exec(`CREATE TABLE ${t.name} (${defs.join(', ')})`);
    for (const i of t.extras) d.exec(`CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX ${i.name} ON ${t.name} (${i.cols.join(', ')})`);
  }
}
