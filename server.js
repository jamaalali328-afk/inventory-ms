/**
 * Inventory MS - Backend Server
 * Node.js + Express + PostgreSQL (works with any Postgres host, e.g. Neon.tech free tier)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const { pool, initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production-please';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
async function nextId(prefix, table) {
  const { rows } = await pool.query(`SELECT id FROM ${table}`);
  let max = 0;
  rows.forEach((r) => {
    const num = parseInt(String(r.id).replace(prefix, ''), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return `${prefix}${max + 1}`;
}
function asyncHandler(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Server error, please try again' });
  });
}

// ---------- Row -> API shape mappers (snake_case DB -> camelCase JSON) ----------
const mapProduct = (r) => ({
  id: r.id, code: r.code, name: r.name, category: r.category,
  unitType: r.unit_type, quantity: r.quantity, minQuantity: r.min_quantity, description: r.description,
});
const mapBranch = (r) => ({ id: r.id, name: r.name, description: r.description });
const mapCustomer = (r) => ({
  id: r.id, name: r.name, phone: r.phone, address: r.address,
  dateCreated: r.date_created, totalPurchases: r.total_purchases,
});
const mapStockIn = (r) => ({ id: r.id, date: r.date, productId: r.product_id, quantity: r.quantity, referenceNote: r.reference_note });
const mapStockOut = (r) => ({
  id: r.id, date: r.date, productId: r.product_id, quantity: r.quantity,
  destinationId: r.destination_id, referenceNote: r.reference_note,
});
const mapSale = (r) => ({
  id: r.id, date: r.date, reference: r.reference, customerId: r.customer_id,
  items: r.items, totalQty: r.total_qty, status: r.status, notes: r.notes,
});

// ---------- Password hashing (built-in crypto) ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password, salt, hash) {
  const attempt = hashPassword(password, salt);
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Auth middleware ----------
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
function adminRequired(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

// ================= AUTH =================
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', authRequired, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user || !verifyPassword(currentPassword, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  await pool.query('UPDATE users SET salt = $1, hash = $2 WHERE id = $3', [salt, hash, user.id]);
  res.json({ success: true });
}));

app.post('/api/auth/users', authRequired, adminRequired, asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.length) return res.status(409).json({ error: 'A user with this email already exists' });
  const id = await nextId('u', 'users');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const finalRole = role === 'admin' ? 'admin' : 'staff';
  await pool.query('INSERT INTO users (id, name, email, role, salt, hash) VALUES ($1,$2,$3,$4,$5,$6)', [id, name, email, finalRole, salt, hash]);
  res.json({ user: { id, name, email, role: finalRole } });
}));

app.post('/api/auth/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email || '']);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'No account found with that email' });
  const tempPassword = crypto.randomBytes(4).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(tempPassword, salt);
  await pool.query('UPDATE users SET salt = $1, hash = $2 WHERE id = $3', [salt, hash, user.id]);
  res.json({ message: 'Temporary password generated', tempPassword });
}));

// ================= PRODUCTS =================
app.get('/api/products', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY code');
  res.json(rows.map(mapProduct));
}));

app.post('/api/products', authRequired, asyncHandler(async (req, res) => {
  const { code, name, category, unitType, quantity, minQuantity, description } = req.body || {};
  if (!code || !name || !unitType) return res.status(400).json({ error: 'Product code, name and unit type are required' });
  const { rows: existing } = await pool.query('SELECT id FROM products WHERE LOWER(code) = LOWER($1)', [code]);
  if (existing.length) return res.status(409).json({ error: 'A product with this code already exists' });
  const id = await nextId('p', 'products');
  const { rows } = await pool.query(
    `INSERT INTO products (id, code, name, category, unit_type, quantity, min_quantity, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, code, name, category || '', unitType || 'Piece', Number(quantity) || 0, Number(minQuantity) || 10, description || '']
  );
  res.json(mapProduct(rows[0]));
}));

app.put('/api/products/:id', authRequired, asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const { code, name, category, unitType, quantity, minQuantity, description } = req.body || {};
  const updated = {
    code: code || existing.code,
    name: name || existing.name,
    category: category !== undefined ? category : existing.category,
    unit_type: unitType || existing.unit_type,
    quantity: quantity !== undefined ? Number(quantity) : existing.quantity,
    min_quantity: minQuantity !== undefined ? Number(minQuantity) : existing.min_quantity,
    description: description !== undefined ? description : existing.description,
  };
  const { rows } = await pool.query(
    `UPDATE products SET code=$1, name=$2, category=$3, unit_type=$4, quantity=$5, min_quantity=$6, description=$7 WHERE id=$8 RETURNING *`,
    [updated.code, updated.name, updated.category, updated.unit_type, updated.quantity, updated.min_quantity, updated.description, req.params.id]
  );
  res.json(mapProduct(rows[0]));
}));

app.delete('/api/products/:id', authRequired, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// Bulk import - paste a batch of products at once
app.post('/api/products/bulk-import', authRequired, asyncHandler(async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items provided' });

  const created = [];
  const skipped = [];
  for (const item of items) {
    const code = (item.code || '').trim();
    const name = (item.name || '').trim();
    if (!code || !name) {
      skipped.push({ ...item, reason: 'Missing code or name' });
      continue;
    }
    const { rows: existing } = await pool.query('SELECT id FROM products WHERE LOWER(code) = LOWER($1)', [code]);
    if (existing.length) {
      skipped.push({ ...item, reason: 'Code already exists' });
      continue;
    }
    const id = await nextId('p', 'products');
    await pool.query(
      `INSERT INTO products (id, code, name, category, unit_type, quantity, min_quantity, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, code, name, item.category || '', item.unitType || 'Piece', Number(item.quantity) || 0, Number(item.minQuantity) || 10, '']
    );
    created.push({ id, code, name });
  }
  res.json({ created, skipped });
}));

// ================= STOCK IN =================
app.get('/api/stockin', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM stockin ORDER BY date DESC');
  res.json(rows.map(mapStockIn));
}));

app.post('/api/stockin', authRequired, asyncHandler(async (req, res) => {
  const { productId, quantity, referenceNote, date } = req.body || {};
  const qty = Number(quantity);
  if (!productId || !qty || qty <= 0) return res.status(400).json({ error: 'Product and a positive quantity are required' });
  const { rows: productRows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
  if (!productRows[0]) return res.status(404).json({ error: 'Product not found' });

  await pool.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [qty, productId]);
  const id = await nextId('si', 'stockin');
  const entryDate = date || todayStr();
  const { rows } = await pool.query(
    'INSERT INTO stockin (id, date, product_id, quantity, reference_note) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [id, entryDate, productId, qty, referenceNote || '']
  );
  res.json(mapStockIn(rows[0]));
}));

app.delete('/api/stockin/:id', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM stockin WHERE id = $1', [req.params.id]);
  const entry = rows[0];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  await pool.query('UPDATE products SET quantity = GREATEST(0, quantity - $1) WHERE id = $2', [entry.quantity, entry.product_id]);
  await pool.query('DELETE FROM stockin WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ================= STOCK OUT =================
app.get('/api/stockout', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM stockout ORDER BY date DESC');
  res.json(rows.map(mapStockOut));
}));

app.post('/api/stockout', authRequired, asyncHandler(async (req, res) => {
  const { productId, quantity, destinationId, referenceNote, date } = req.body || {};
  const qty = Number(quantity);
  if (!productId || !qty || qty <= 0) return res.status(400).json({ error: 'Product and a positive quantity are required' });
  if (!destinationId) return res.status(400).json({ error: 'Destination branch/department is required' });
  const { rows: productRows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
  const product = productRows[0];
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.quantity < qty) return res.status(400).json({ error: 'Not enough stock available for this product' });

  await pool.query('UPDATE products SET quantity = quantity - $1 WHERE id = $2', [qty, productId]);
  const id = await nextId('so', 'stockout');
  const entryDate = date || todayStr();
  const { rows } = await pool.query(
    'INSERT INTO stockout (id, date, product_id, quantity, destination_id, reference_note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, entryDate, productId, qty, destinationId, referenceNote || '']
  );
  res.json(mapStockOut(rows[0]));
}));

app.delete('/api/stockout/:id', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM stockout WHERE id = $1', [req.params.id]);
  const entry = rows[0];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  await pool.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [entry.quantity, entry.product_id]);
  await pool.query('DELETE FROM stockout WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ================= SALES =================
app.get('/api/sales', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM sales ORDER BY date DESC');
  res.json(rows.map(mapSale));
}));

app.post('/api/sales', authRequired, asyncHandler(async (req, res) => {
  const { customerId, items, notes } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let totalQty = 0;
    for (const item of items) {
      const { rows } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.productId]);
      const product = rows[0];
      if (!product) throw new Error('One of the selected products was not found');
      if (product.quantity < Number(item.qty)) throw new Error(`Not enough stock for ${product.name}`);
      totalQty += Number(item.qty);
    }
    for (const item of items) {
      await client.query('UPDATE products SET quantity = quantity - $1 WHERE id = $2', [Number(item.qty), item.productId]);
    }
    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM sales');
    const id = await nextId('s', 'sales');
    const reference = `SALE-${String(Number(countRows[0].count) + 1).padStart(4, '0')}`;
    const finalCustomerId = customerId || 'c1';
    const { rows } = await client.query(
      `INSERT INTO sales (id, date, reference, customer_id, items, total_qty, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'Completed',$7) RETURNING *`,
      [id, todayStr(), reference, finalCustomerId, JSON.stringify(items), totalQty, notes || '']
    );
    await client.query('UPDATE customers SET total_purchases = total_purchases + $1 WHERE id = $2', [totalQty, finalCustomerId]);
    await client.query('COMMIT');
    res.json(mapSale(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}));

// ================= CUSTOMERS =================
app.get('/api/customers', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM customers ORDER BY name');
  res.json(rows.map(mapCustomer));
}));

app.post('/api/customers', authRequired, asyncHandler(async (req, res) => {
  const { name, phone, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Customer name is required' });
  const id = await nextId('c', 'customers');
  const { rows } = await pool.query(
    'INSERT INTO customers (id, name, phone, address, date_created, total_purchases) VALUES ($1,$2,$3,$4,$5,0) RETURNING *',
    [id, name, phone || '', address || '', todayStr()]
  );
  res.json(mapCustomer(rows[0]));
}));

app.put('/api/customers/:id', authRequired, asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  const { name, phone, address } = req.body || {};
  const { rows } = await pool.query(
    'UPDATE customers SET name=$1, phone=$2, address=$3 WHERE id=$4 RETURNING *',
    [name || existing.name, phone !== undefined ? phone : existing.phone, address !== undefined ? address : existing.address, req.params.id]
  );
  res.json(mapCustomer(rows[0]));
}));

app.delete('/api/customers/:id', authRequired, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ================= BRANCHES / DEPARTMENTS =================
app.get('/api/branches', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM branches ORDER BY name');
  res.json(rows.map(mapBranch));
}));

app.post('/api/branches', authRequired, asyncHandler(async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = await nextId('b', 'branches');
  const { rows } = await pool.query('INSERT INTO branches (id, name, description) VALUES ($1,$2,$3) RETURNING *', [id, name, description || '']);
  res.json(mapBranch(rows[0]));
}));

app.put('/api/branches/:id', authRequired, asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM branches WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Branch not found' });
  const { name, description } = req.body || {};
  const { rows } = await pool.query(
    'UPDATE branches SET name=$1, description=$2 WHERE id=$3 RETURNING *',
    [name || existing.name, description !== undefined ? description : existing.description, req.params.id]
  );
  res.json(mapBranch(rows[0]));
}));

app.delete('/api/branches/:id', authRequired, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM branches WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ================= Shared movement classification helper =================
function classifyMovement(products, stockIn, stockOut) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const activityMap = {};
  [...stockIn, ...stockOut]
    .filter((s) => new Date(s.date) >= cutoff)
    .forEach((s) => {
      activityMap[s.productId] = (activityMap[s.productId] || 0) + s.quantity;
    });
  const ranked = products
    .map((p) => ({ product: p, activity: activityMap[p.id] || 0 }))
    .sort((a, b) => b.activity - a.activity);
  const third = Math.ceil(ranked.length / 3);
  return {
    fast: ranked.slice(0, third).map((r) => r.product),
    medium: ranked.slice(third, third * 2).map((r) => r.product),
    slow: ranked.slice(third * 2).map((r) => r.product),
    ranked,
  };
}

// ================= DASHBOARD =================
app.get('/api/dashboard', authRequired, asyncHandler(async (req, res) => {
  const { rows: productRows } = await pool.query('SELECT * FROM products');
  const { rows: stockInRows } = await pool.query('SELECT * FROM stockin');
  const { rows: branchRows } = await pool.query('SELECT * FROM branches');
  const { rows: stockOutData } = await pool.query('SELECT * FROM stockout');

  const products = productRows.map(mapProduct);
  const stockIn = stockInRows.map(mapStockIn);
  const stockOut = stockOutData.map(mapStockOut);
  const branches = branchRows.map(mapBranch);

  const totalProducts = products.length;
  const totalStockAvailable = products.reduce((sum, p) => sum + p.quantity, 0);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const inThisMonth = stockIn.filter((s) => new Date(s.date) >= cutoff);
  const outThisMonth = stockOut.filter((s) => new Date(s.date) >= cutoff);
  const totalStockAdded = inThisMonth.reduce((sum, s) => sum + s.quantity, 0);
  const totalStockIssued = outThisMonth.reduce((sum, s) => sum + s.quantity, 0);

  const movement = classifyMovement(products, stockIn, stockOut);
  const lowStockItems = products.filter((p) => p.quantity <= p.minQuantity);

  const recentStockIn = [...stockIn]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((s) => ({ ...s, productName: (products.find((p) => p.id === s.productId) || {}).name || 'Unknown' }));

  const recentStockOut = [...stockOut]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((s) => ({
      ...s,
      productName: (products.find((p) => p.id === s.productId) || {}).name || 'Unknown',
      destinationName: (branches.find((b) => b.id === s.destinationId) || {}).name || 'Unknown',
    }));

  const activityMap = {};
  [...stockIn, ...stockOut].forEach((s) => {
    activityMap[s.productId] = (activityMap[s.productId] || 0) + s.quantity;
  });
  const topProducts = Object.entries(activityMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, qty]) => ({ product: products.find((p) => p.id === productId), quantity: qty }))
    .filter((t) => t.product);
  const maxTop = topProducts.length ? topProducts[0].quantity : 1;

  res.json({
    totalProducts,
    totalStockAvailable,
    totalStockAdded,
    totalStockIssued,
    fastMoving: movement.fast.length,
    mediumMoving: movement.medium.length,
    slowMoving: movement.slow.length,
    lowStockCount: lowStockItems.length,
    recentStockIn,
    recentStockOut,
    topProducts: topProducts.map((t) => ({ ...t, percent: Math.round((t.quantity / maxTop) * 100) })),
    lowStockItems,
  });
}));

// ================= ANALYTICS =================
app.get('/api/analytics', authRequired, asyncHandler(async (req, res) => {
  const { rows: productRows } = await pool.query('SELECT * FROM products');
  const { rows: stockInRows } = await pool.query('SELECT * FROM stockin');
  const { rows: stockOutRows } = await pool.query('SELECT * FROM stockout');
  const products = productRows.map(mapProduct);
  const stockIn = stockInRows.map(mapStockIn);
  const stockOut = stockOutRows.map(mapStockOut);

  const movement = classifyMovement(products, stockIn, stockOut);
  const lowStock = products.filter((p) => p.quantity <= p.minQuantity);

  const withActivity = (list) =>
    list.map((p) => {
      const found = movement.ranked.find((r) => r.product.id === p.id);
      return { ...p, activity: found ? found.activity : 0 };
    });
  const maxActivity = Math.max(1, ...movement.ranked.map((r) => r.activity));

  res.json({
    fastMoving: withActivity(movement.fast).map((p) => ({ ...p, percent: Math.round((p.activity / maxActivity) * 100) })),
    mediumMoving: withActivity(movement.medium).map((p) => ({ ...p, percent: Math.round((p.activity / maxActivity) * 100) })),
    slowMoving: withActivity(movement.slow).map((p) => ({ ...p, percent: Math.round((p.activity / maxActivity) * 100) })),
    lowStock: lowStock.map((p) => ({ ...p, percent: Math.round((p.quantity / (p.minQuantity || 1)) * 100) })),
  });
}));

// ================= ITEM LOOKUP =================
app.get('/api/lookup', authRequired, asyncHandler(async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ matches: [] });
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE LOWER(name) LIKE LOWER($1) OR LOWER(code) LIKE LOWER($1)',
    [`%${query}%`]
  );
  res.json({ matches: rows.map(mapProduct) });
}));

app.get('/api/lookup/:productId/history', authRequired, asyncHandler(async (req, res) => {
  const rangeMonths = Number(req.query.months) || 3;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - rangeMonths);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { rows: stockInRows } = await pool.query('SELECT * FROM stockin WHERE product_id = $1 AND date >= $2', [req.params.productId, cutoffStr]);
  const { rows: stockOutRows } = await pool.query('SELECT * FROM stockout WHERE product_id = $1 AND date >= $2', [req.params.productId, cutoffStr]);
  const { rows: branchRows } = await pool.query('SELECT * FROM branches');
  const branches = branchRows.map(mapBranch);

  const timeline = [
    ...stockInRows.map((s) => ({ type: 'in', date: s.date, quantity: s.quantity, referenceNote: s.reference_note })),
    ...stockOutRows.map((s) => ({
      type: 'out',
      date: s.date,
      quantity: s.quantity,
      destination: (branches.find((b) => b.id === s.destination_id) || {}).name || 'Unknown',
      referenceNote: s.reference_note,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ timeline });
}));

// ================= REPORTS =================
app.get('/api/reports', authRequired, asyncHandler(async (req, res) => {
  const { type, from, to } = req.query;
  const { rows: productRows } = await pool.query('SELECT * FROM products');
  const { rows: stockInRows } = await pool.query('SELECT * FROM stockin');
  const { rows: stockOutRows } = await pool.query('SELECT * FROM stockout');
  const products = productRows.map(mapProduct);
  const stockIn = stockInRows.map(mapStockIn);
  const stockOut = stockOutRows.map(mapStockOut);

  const inRange = (dateStr) => {
    const d = new Date(dateStr);
    if (from && d < new Date(from)) return false;
    if (to && d > new Date(to)) return false;
    return true;
  };

  let rows = [];
  const inRows = stockIn
    .filter((s) => inRange(s.date))
    .map((s) => ({
      date: s.date,
      productCode: (products.find((p) => p.id === s.productId) || {}).code || '',
      productName: (products.find((p) => p.id === s.productId) || {}).name || '',
      quantity: s.quantity,
      type: 'Stock In',
    }));
  const outRows = stockOut
    .filter((s) => inRange(s.date))
    .map((s) => ({
      date: s.date,
      productCode: (products.find((p) => p.id === s.productId) || {}).code || '',
      productName: (products.find((p) => p.id === s.productId) || {}).name || '',
      quantity: -s.quantity,
      type: 'Stock Out',
    }));

  switch (type) {
    case 'stockin':
      rows = inRows;
      break;
    case 'stockout':
      rows = outRows;
      break;
    case 'fastmoving': {
      const movement = classifyMovement(products, stockIn, stockOut);
      rows = movement.fast.map((p) => ({ date: todayStr(), productCode: p.code, productName: p.name, quantity: p.quantity, type: 'Fast Moving' }));
      break;
    }
    case 'slowmoving': {
      const movement = classifyMovement(products, stockIn, stockOut);
      rows = movement.slow.map((p) => ({ date: todayStr(), productCode: p.code, productName: p.name, quantity: p.quantity, type: 'Slow Moving' }));
      break;
    }
    case 'lowstock':
      rows = products
        .filter((p) => p.quantity <= p.minQuantity)
        .map((p) => ({ date: todayStr(), productCode: p.code, productName: p.name, quantity: p.quantity, type: 'Low Stock' }));
      break;
    case 'daily':
    case 'weekly':
    case 'monthly':
    default:
      rows = [...inRows, ...outRows].sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
  }
  res.json({ rows });
}));

// ================= SETTINGS =================
app.get('/api/settings', authRequired, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM settings');
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
}));

app.put('/api/settings', authRequired, asyncHandler(async (req, res) => {
  const { theme, language } = req.body || {};
  if (theme) await pool.query('INSERT INTO settings (key, value) VALUES (\'theme\', $1) ON CONFLICT (key) DO UPDATE SET value = $1', [theme]);
  if (language) await pool.query('INSERT INTO settings (key, value) VALUES (\'language\', $1) ON CONFLICT (key) DO UPDATE SET value = $1', [language]);
  const { rows } = await pool.query('SELECT * FROM settings');
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
}));

// Fallback: send index.html for any non-API route (SPA support)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Start server (after DB schema is ready) ----------
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Inventory MS server running at http://localhost:${PORT}`);
      console.log(`Default login -> email: admin@store.com | password: admin123`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
