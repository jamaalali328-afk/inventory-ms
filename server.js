/**
 * Inventory MS - Backend Server
 * Node.js + Express + JSON file storage (no database server needed)
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production-please';
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Data helpers (JSON file storage) ----------
function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}
function readData(name) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return name === 'settings' ? {} : [];
  }
}
function writeData(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}
function nextId(prefix, list) {
  let max = 0;
  list.forEach((item) => {
    const num = parseInt(String(item.id).replace(prefix, ''), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return `${prefix}${max + 1}`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Password hashing (built-in crypto, no external deps) ----------
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
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const users = readData('users');
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// Admin can create new users
app.post('/api/auth/users', authRequired, adminRequired, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  const users = readData('users');
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const user = { id: nextId('u', users), name, email, role: role === 'admin' ? 'admin' : 'staff', salt, hash };
  users.push(user);
  writeData('users', users);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Logged-in user changes their own password
app.post('/api/auth/change-password', authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const users = readData('users');
  const user = users.find((u) => u.id === req.user.id);
  if (!user || !verifyPassword(currentPassword, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = hashPassword(newPassword, user.salt);
  writeData('users', users);
  res.json({ success: true });
});

// Forgot password (simple reset - generates a temporary password, since no email service is configured)
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const users = readData('users');
  const user = users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user) return res.status(404).json({ error: 'No account found with that email' });
  const tempPassword = crypto.randomBytes(4).toString('hex');
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = hashPassword(tempPassword, user.salt);
  writeData('users', users);
  // No email service configured in this build - the temp password is returned directly.
  res.json({ message: 'Temporary password generated', tempPassword });
});

// ================= PRODUCTS =================
app.get('/api/products', authRequired, (req, res) => {
  res.json(readData('products'));
});

app.post('/api/products', authRequired, (req, res) => {
  const { code, name, category, unitType, quantity, minQuantity, description } = req.body || {};
  if (!code || !name || !unitType) return res.status(400).json({ error: 'Product code, name and unit type are required' });
  const products = readData('products');
  if (products.some((p) => p.code.toLowerCase() === String(code).toLowerCase())) {
    return res.status(409).json({ error: 'A product with this code already exists' });
  }
  const product = {
    id: nextId('p', products),
    code,
    name,
    category: category || '',
    unitType: unitType || 'Piece',
    quantity: Number(quantity) || 0,
    minQuantity: Number(minQuantity) || 10,
    description: description || '',
  };
  products.push(product);
  writeData('products', products);
  res.json(product);
});

app.put('/api/products/:id', authRequired, (req, res) => {
  const products = readData('products');
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const { code, name, category, unitType, quantity, minQuantity, description } = req.body || {};
  if (code) product.code = code;
  if (name) product.name = name;
  if (category !== undefined) product.category = category;
  if (unitType) product.unitType = unitType;
  if (quantity !== undefined) product.quantity = Number(quantity);
  if (minQuantity !== undefined) product.minQuantity = Number(minQuantity);
  if (description !== undefined) product.description = description;
  writeData('products', products);
  res.json(product);
});

app.delete('/api/products/:id', authRequired, (req, res) => {
  let products = readData('products');
  products = products.filter((p) => p.id !== req.params.id);
  writeData('products', products);
  res.json({ success: true });
});

// ================= STOCK IN =================
app.get('/api/stockin', authRequired, (req, res) => {
  res.json(readData('stockin'));
});

app.post('/api/stockin', authRequired, (req, res) => {
  const { productId, quantity, referenceNote, date } = req.body || {};
  const qty = Number(quantity);
  if (!productId || !qty || qty <= 0) return res.status(400).json({ error: 'Product and a positive quantity are required' });
  const products = readData('products');
  const product = products.find((p) => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  product.quantity += qty;
  writeData('products', products);

  const stockIn = readData('stockin');
  const entry = { id: nextId('si', stockIn), date: date || todayStr(), productId, quantity: qty, referenceNote: referenceNote || '' };
  stockIn.push(entry);
  writeData('stockin', stockIn);
  res.json(entry);
});

app.delete('/api/stockin/:id', authRequired, (req, res) => {
  const stockIn = readData('stockin');
  const entry = stockIn.find((s) => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const products = readData('products');
  const product = products.find((p) => p.id === entry.productId);
  if (product) {
    product.quantity = Math.max(0, product.quantity - entry.quantity);
    writeData('products', products);
  }
  writeData('stockin', stockIn.filter((s) => s.id !== req.params.id));
  res.json({ success: true });
});

// ================= STOCK OUT =================
app.get('/api/stockout', authRequired, (req, res) => {
  res.json(readData('stockout'));
});

app.post('/api/stockout', authRequired, (req, res) => {
  const { productId, quantity, destinationId, referenceNote, date } = req.body || {};
  const qty = Number(quantity);
  if (!productId || !qty || qty <= 0) return res.status(400).json({ error: 'Product and a positive quantity are required' });
  if (!destinationId) return res.status(400).json({ error: 'Destination branch/department is required' });
  const products = readData('products');
  const product = products.find((p) => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.quantity < qty) return res.status(400).json({ error: 'Not enough stock available for this product' });

  product.quantity -= qty;
  writeData('products', products);

  const stockOut = readData('stockout');
  const entry = { id: nextId('so', stockOut), date: date || todayStr(), productId, quantity: qty, destinationId, referenceNote: referenceNote || '' };
  stockOut.push(entry);
  writeData('stockout', stockOut);
  res.json(entry);
});

app.delete('/api/stockout/:id', authRequired, (req, res) => {
  const stockOut = readData('stockout');
  const entry = stockOut.find((s) => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const products = readData('products');
  const product = products.find((p) => p.id === entry.productId);
  if (product) {
    product.quantity += entry.quantity;
    writeData('products', products);
  }
  writeData('stockout', stockOut.filter((s) => s.id !== req.params.id));
  res.json({ success: true });
});

// ================= SALES =================
app.get('/api/sales', authRequired, (req, res) => {
  res.json(readData('sales'));
});

app.post('/api/sales', authRequired, (req, res) => {
  const { customerId, items, notes } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
  const products = readData('products');

  // Validate stock availability first
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return res.status(404).json({ error: 'One of the selected products was not found' });
    if (product.quantity < Number(item.qty)) {
      return res.status(400).json({ error: `Not enough stock for ${product.name}` });
    }
  }
  // Deduct stock
  let totalQty = 0;
  items.forEach((item) => {
    const product = products.find((p) => p.id === item.productId);
    product.quantity -= Number(item.qty);
    totalQty += Number(item.qty);
  });
  writeData('products', products);

  const sales = readData('sales');
  const sale = {
    id: nextId('s', sales),
    date: todayStr(),
    reference: `SALE-${String(sales.length + 1).padStart(4, '0')}`,
    customerId: customerId || 'c1',
    items,
    totalQty,
    status: 'Completed',
    notes: notes || '',
  };
  sales.push(sale);
  writeData('sales', sales);

  // Track total purchases for the customer
  if (customerId) {
    const customers = readData('customers');
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      customer.totalPurchases = (customer.totalPurchases || 0) + totalQty;
      writeData('customers', customers);
    }
  }
  res.json(sale);
});

// ================= CUSTOMERS =================
app.get('/api/customers', authRequired, (req, res) => {
  res.json(readData('customers'));
});
app.post('/api/customers', authRequired, (req, res) => {
  const { name, phone, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Customer name is required' });
  const customers = readData('customers');
  const customer = { id: nextId('c', customers), name, phone: phone || '', address: address || '', dateCreated: todayStr(), totalPurchases: 0 };
  customers.push(customer);
  writeData('customers', customers);
  res.json(customer);
});
app.put('/api/customers/:id', authRequired, (req, res) => {
  const customers = readData('customers');
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const { name, phone, address } = req.body || {};
  if (name) customer.name = name;
  if (phone !== undefined) customer.phone = phone;
  if (address !== undefined) customer.address = address;
  writeData('customers', customers);
  res.json(customer);
});
app.delete('/api/customers/:id', authRequired, (req, res) => {
  let customers = readData('customers');
  customers = customers.filter((c) => c.id !== req.params.id);
  writeData('customers', customers);
  res.json({ success: true });
});

// ================= BRANCHES / DEPARTMENTS =================
app.get('/api/branches', authRequired, (req, res) => {
  res.json(readData('branches'));
});
app.post('/api/branches', authRequired, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const branches = readData('branches');
  const branch = { id: nextId('b', branches), name, description: description || '' };
  branches.push(branch);
  writeData('branches', branches);
  res.json(branch);
});
app.put('/api/branches/:id', authRequired, (req, res) => {
  const branches = readData('branches');
  const branch = branches.find((b) => b.id === req.params.id);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  const { name, description } = req.body || {};
  if (name) branch.name = name;
  if (description !== undefined) branch.description = description;
  writeData('branches', branches);
  res.json(branch);
});
app.delete('/api/branches/:id', authRequired, (req, res) => {
  let branches = readData('branches');
  branches = branches.filter((b) => b.id !== req.params.id);
  writeData('branches', branches);
  res.json({ success: true });
});

// ================= DASHBOARD =================
app.get('/api/dashboard', authRequired, (req, res) => {
  const products = readData('products');
  const stockIn = readData('stockin');
  const stockOut = readData('stockout');

  const totalProducts = products.length;
  const totalStockAvailable = products.reduce((sum, p) => sum + p.quantity, 0);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const inThisMonth = stockIn.filter((s) => new Date(s.date) >= cutoff);
  const outThisMonth = stockOut.filter((s) => new Date(s.date) >= cutoff);
  const totalStockAdded = inThisMonth.reduce((sum, s) => sum + s.quantity, 0);
  const totalStockIssued = outThisMonth.reduce((sum, s) => sum + s.quantity, 0);

  const movement = getMovementClassification(products, stockIn, stockOut);
  const lowStockItems = products.filter((p) => p.quantity <= p.minQuantity);

  const recentStockIn = [...stockIn]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((s) => ({ ...s, productName: (products.find((p) => p.id === s.productId) || {}).name || 'Unknown' }));

  const branches = readData('branches');
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
});

function getMovementClassification(products, stockIn, stockOut) {
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

// ================= ANALYTICS =================
app.get('/api/analytics', authRequired, (req, res) => {
  const products = readData('products');
  const stockIn = readData('stockin');
  const stockOut = readData('stockout');
  const movement = getMovementClassification(products, stockIn, stockOut);
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
});

// ================= ITEM LOOKUP (search + history) =================
app.get('/api/lookup', authRequired, (req, res) => {
  const { query, months } = req.query;
  const products = readData('products');
  const matches = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(String(query).toLowerCase()) ||
          p.code.toLowerCase().includes(String(query).toLowerCase())
      )
    : [];
  res.json({ matches });
});

app.get('/api/lookup/:productId/history', authRequired, (req, res) => {
  const rangeMonths = Number(req.query.months) || 3;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - rangeMonths);

  const stockIn = readData('stockin').filter((s) => s.productId === req.params.productId && new Date(s.date) >= cutoff);
  const stockOut = readData('stockout').filter((s) => s.productId === req.params.productId && new Date(s.date) >= cutoff);
  const branches = readData('branches');

  const timeline = [
    ...stockIn.map((s) => ({ type: 'in', date: s.date, quantity: s.quantity, referenceNote: s.referenceNote })),
    ...stockOut.map((s) => ({
      type: 'out',
      date: s.date,
      quantity: s.quantity,
      destination: (branches.find((b) => b.id === s.destinationId) || {}).name || 'Unknown',
      referenceNote: s.referenceNote,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ timeline });
});

// ================= REPORTS =================
app.get('/api/reports', authRequired, (req, res) => {
  const { type, from, to } = req.query;
  const products = readData('products');
  const stockIn = readData('stockin');
  const stockOut = readData('stockout');

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
      const movement = getMovementClassification(products, stockIn, stockOut);
      rows = movement.fast.map((p) => ({ date: todayStr(), productCode: p.code, productName: p.name, quantity: p.quantity, type: 'Fast Moving' }));
      break;
    }
    case 'slowmoving': {
      const movement = getMovementClassification(products, stockIn, stockOut);
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
});

// ================= SETTINGS =================
app.get('/api/settings', authRequired, (req, res) => {
  res.json(readData('settings'));
});
app.put('/api/settings', authRequired, (req, res) => {
  const settings = readData('settings');
  const { theme, language } = req.body || {};
  if (theme) settings.theme = theme;
  if (language) settings.language = language;
  writeData('settings', settings);
  res.json(settings);
});

// Fallback: send index.html for any non-API route (SPA support)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Inventory MS server running at http://localhost:${PORT}`);
  console.log(`Default login -> email: admin@store.com | password: admin123`);
});
