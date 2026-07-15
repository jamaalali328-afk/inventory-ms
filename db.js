/**
 * db.js - PostgreSQL connection + schema setup + seed data
 * Works with any standard Postgres connection string (Neon, Supabase, Render Postgres, local, etc.)
 */
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('Set it to your PostgreSQL connection string (e.g. from Neon.tech) before starting the server.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      salt TEXT NOT NULL,
      hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      date_created TEXT,
      total_purchases INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      unit_type TEXT DEFAULT 'Piece',
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 10,
      description TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stockin (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      reference_note TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stockout (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      destination_id TEXT REFERENCES branches(id),
      reference_note TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      reference TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id),
      items JSONB NOT NULL,
      total_qty INTEGER NOT NULL,
      status TEXT DEFAULT 'Completed',
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const { rows: userRows } = await pool.query('SELECT COUNT(*) FROM users');
  if (Number(userRows[0].count) === 0) {
    // Default admin: admin@store.com / admin123
    await pool.query(
      `INSERT INTO users (id, name, email, role, salt, hash) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        'u1',
        'Admin',
        'admin@store.com',
        'admin',
        '148593182dd07cc3f6df3ed27110d1a7',
        'ba850e223e887fd7fd6f794d9bb953b15475c15461a5c285a1fb27c2c17b25bde2e04004c3feabbb52d617782a8b091d3cc456fbdf219046888a6715adbcb5e8',
      ]
    );
  }

  const { rows: branchRows } = await pool.query('SELECT COUNT(*) FROM branches');
  if (Number(branchRows[0].count) === 0) {
    await pool.query(`
      INSERT INTO branches (id, name, description) VALUES
      ('b1', 'Main Branch', 'Head office branch'),
      ('b2', 'Warehouse', 'Central warehouse'),
      ('b3', 'Sales Department', '')
    `);
  }

  const { rows: custRows } = await pool.query('SELECT COUNT(*) FROM customers');
  if (Number(custRows[0].count) === 0) {
    await pool.query(`
      INSERT INTO customers (id, name, phone, address, date_created, total_purchases) VALUES
      ('c1', 'Walk-in Customer', '', '', to_char(NOW(), 'YYYY-MM-DD'), 0)
    `);
  }

  const { rows: settingsRows } = await pool.query('SELECT COUNT(*) FROM settings');
  if (Number(settingsRows[0].count) === 0) {
    await pool.query(`INSERT INTO settings (key, value) VALUES ('theme', 'dark'), ('language', 'en')`);
  }
}

module.exports = { pool, initSchema };
