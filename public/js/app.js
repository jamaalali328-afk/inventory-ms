// app.js - main frontend application logic (plain JS, no framework)

const state = {
  user: null,
  page: 'dashboard',
  cache: { products: [], branches: [], customers: [] },
};

// ---------------- Boot ----------------
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const userRaw = localStorage.getItem('user');
  if (token && userRaw) {
    state.user = JSON.parse(userRaw);
    showApp();
  } else {
    showLogin();
  }
  bindStaticHandlers();
  applySavedTheme();
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('user-name').textContent = state.user.name;
  document.getElementById('user-role').textContent = state.user.role;
  document.getElementById('user-avatar').textContent = state.user.name.charAt(0).toUpperCase();
  const initialPage = (location.hash || '#dashboard').replace('#', '');
  navigate(initialPage);
}

function bindStaticHandlers() {
  document.getElementById('login-form').addEventListener('submit', onLogin);
  document.getElementById('forgot-password-link').addEventListener('click', onForgotPassword);
  document.getElementById('logout-btn').addEventListener('click', onLogout);
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('hamburger-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('sidebar-nav').addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    navigate(item.dataset.page);
    document.getElementById('sidebar').classList.remove('open');
  });
}

async function onLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');
  try {
    const data = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    state.user = data.user;
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function onForgotPassword() {
  const email = prompt('Enter your account email to reset your password:');
  if (!email) return;
  try {
    const data = await api.post('/api/auth/forgot-password', { email });
    alert(`A temporary password has been generated: ${data.tempPassword}\nPlease log in and note it down.`);
  } catch (err) {
    alert(err.message);
  }
}

function onLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.user = null;
  showLogin();
}

function applySavedTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = saved === 'dark' ? '🌙' : '☀️';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('theme-toggle-btn').textContent = next === 'dark' ? '🌙' : '☀️';
}

// ---------------- Navigation ----------------
const renderers = {
  dashboard: renderDashboard,
  products: renderProducts,
  stockin: renderStockIn,
  stockout: renderStockOut,
  sales: renderSales,
  customers: renderCustomers,
  analytics: renderAnalytics,
  reports: renderReports,
  lookup: renderLookup,
  branches: renderBranches,
  settings: renderSettings,
};

function navigate(page) {
  if (!renderers[page]) page = 'dashboard';
  state.page = page;
  location.hash = page;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const content = document.getElementById('content');
  content.innerHTML = '<p style="color:var(--text-dim)">Loading...</p>';
  renderers[page]().catch((err) => {
    content.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
  });
}

// ---------------- Helpers ----------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
}
function closeModal() {
  const el = document.getElementById('modal-overlay');
  if (el) el.remove();
}

// ================= DASHBOARD =================
async function renderDashboard() {
  const content = document.getElementById('content');
  const d = await api.get('/api/dashboard');
  const lowStockRows = d.lowStockItems.length
    ? d.lowStockItems
        .map(
          (p) => `<tr>
            <td>${escapeHtml(p.code)}</td>
            <td>${escapeHtml(p.name)}</td>
            <td class="text-red">${p.quantity}</td>
            <td>${escapeHtml(p.unitType)}</td>
          </tr>`
        )
        .join('')
    : `<tr class="empty-row"><td colspan="4">No low stock items</td></tr>`;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Dashboard</h2>
        <div class="sub">This Month</div>
      </div>
    </div>

    <div class="grid-2x2">
      <div class="card accent-blue big-stat"><div class="stat-label">Total Products</div><div class="stat-value">${d.totalProducts}</div></div>
      <div class="card accent-blue big-stat"><div class="stat-label">Total Stock Available</div><div class="stat-value">${d.totalStockAvailable}</div></div>
      <div class="card big-stat"><div class="stat-label">Total Stock Added</div><div class="stat-value" style="color:var(--green)">+${d.totalStockAdded}</div></div>
      <div class="card big-stat"><div class="stat-label">Total Stock Issued</div><div class="stat-value" style="color:var(--red)">-${d.totalStockIssued}</div></div>
    </div>

    <div class="grid-3">
      <div class="card"><div class="stat-label">⚡ Fast Moving Items</div><div class="stat-value">${d.fastMoving}</div></div>
      <div class="card"><div class="stat-label">➖ Medium Moving Items</div><div class="stat-value">${d.mediumMoving}</div></div>
      <div class="card"><div class="stat-label">🐢 Slow Moving Items</div><div class="stat-value">${d.slowMoving}</div></div>
    </div>

    ${d.lowStockCount > 0 ? `<div class="alert-banner">⚠️ Low Stock Alert: <strong>${d.lowStockCount}</strong> item(s) are at or below minimum quantity.</div>` : ''}

    <div class="two-col">
      <div class="card">
        <div class="section-title" style="margin-top:0">Stock In (Recent)</div>
        ${
          d.recentStockIn.length
            ? d.recentStockIn.map((s) => `<div class="list-row"><span class="name">${escapeHtml(s.productName)}<br><span class="meta">${s.date}</span></span><span class="qty-plus">+${s.quantity}</span></div>`).join('')
            : '<div class="list-row meta">No stock in records yet</div>'
        }
      </div>
      <div class="card">
        <div class="section-title" style="margin-top:0">Stock Out (Recent)</div>
        ${
          d.recentStockOut.length
            ? d.recentStockOut.map((s) => `<div class="list-row"><span class="name">${escapeHtml(s.productName)}<br><span class="meta">${escapeHtml(s.destinationName)} · ${s.date}</span></span><span class="qty-minus">-${s.quantity}</span></div>`).join('')
            : '<div class="list-row meta">No stock out records yet</div>'
        }
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-title" style="margin-top:0">Top Products</div>
      ${
        d.topProducts.length
          ? d.topProducts
              .map(
                (t) => `<div class="progress-item">
                  <div class="top-row"><span>${escapeHtml(t.product.name)}</span><span>${t.quantity}</span></div>
                  <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${t.percent}%"></div></div>
                </div>`
              )
              .join('')
          : '<p class="meta" style="color:var(--text-dim)">No activity yet</p>'
      }
    </div>

    <div class="section-title">Low Stock Items</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product Code</th><th>Product Name</th><th>Current Qty</th><th>Unit Type</th></tr></thead>
        <tbody>${lowStockRows}</tbody>
      </table>
    </div>
  `;
}

// ================= PRODUCTS =================
async function renderProducts(filterQuery = '', filterCategory = '') {
  const content = document.getElementById('content');
  const products = await api.get('/api/products');
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const filtered = products.filter((p) => {
    const matchesQuery = !filterQuery || p.name.toLowerCase().includes(filterQuery.toLowerCase()) || p.code.toLowerCase().includes(filterQuery.toLowerCase());
    const matchesCategory = !filterCategory || p.category === filterCategory;
    return matchesQuery && matchesCategory;
  });

  content.innerHTML = `
    <div class="page-header">
      <h2>Products</h2>
      <div class="btn-row">
        <button class="btn btn-secondary" id="bulk-import-btn">⬆ Import List</button>
        <button class="btn btn-primary" id="add-product-btn">+ Add Product</button>
      </div>
    </div>
    <div class="toolbar">
      <input type="text" id="product-search" placeholder="Search products..." value="${escapeHtml(filterQuery)}" />
      <select id="category-filter">
        <option value="">All Categories</option>
        ${categories.map((c) => `<option value="${escapeHtml(c)}" ${c === filterCategory ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" id="product-search-btn">Search</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit Type</th><th>Current Qty</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            filtered.length
              ? filtered
                  .map(
                    (p) => `<tr>
                      <td>${escapeHtml(p.code)}</td>
                      <td>${escapeHtml(p.name)}</td>
                      <td>${escapeHtml(p.category || '-')}</td>
                      <td>${escapeHtml(p.unitType)}</td>
                      <td class="${p.quantity <= p.minQuantity ? 'text-red' : 'text-green'}">${p.quantity}</td>
                      <td>
                        <button class="action-icon edit-product-btn" data-id="${p.id}" title="Edit">✏️</button>
                        <button class="action-icon danger delete-product-btn" data-id="${p.id}" title="Delete">🗑️</button>
                      </td>
                    </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="6">No products found</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
  document.getElementById('bulk-import-btn').addEventListener('click', () => openBulkImportModal());
  document.getElementById('product-search-btn').addEventListener('click', () => {
    renderProducts(document.getElementById('product-search').value, document.getElementById('category-filter').value);
  });
  document.getElementById('product-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('product-search-btn').click();
  });
  content.querySelectorAll('.edit-product-btn').forEach((btn) =>
    btn.addEventListener('click', () => openProductModal(products.find((p) => p.id === btn.dataset.id)))
  );
  content.querySelectorAll('.delete-product-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this product? This cannot be undone.')) return;
      await api.delete(`/api/products/${btn.dataset.id}`);
      toast('Product deleted');
      renderProducts(filterQuery, filterCategory);
    })
  );
}

// ================= BULK IMPORT (paste a list of products) =================
function parseBulkProductText(text) {
  const rawLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const items = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const isPureNumber = /^\d+(\.\d+)?$/.test(line);
    if (isPureNumber) {
      // orphan quantity with no preceding name - skip it
      i++;
      continue;
    }
    // This line is a name line, possibly prefixed with a bracketed code like [PC0000001] or [[PC0000001]]
    const codeMatch = line.match(/^\[+\s*([^\]]+?)\s*\]+\s*(.*)$/);
    let code = '';
    let name = line;
    if (codeMatch) {
      code = codeMatch[1].trim();
      name = codeMatch[2].trim();
    }
    let quantity = 0;
    let hasQty = false;
    if (i + 1 < rawLines.length && /^\d+(\.\d+)?$/.test(rawLines[i + 1])) {
      quantity = Number(rawLines[i + 1]);
      hasQty = true;
      i += 2;
    } else {
      i += 1;
    }
    items.push({ code, name, quantity, missingCode: !code, missingQty: !hasQty });
  }
  return items;
}

function openBulkImportModal() {
  openModal(`
    <h3>Import Product List</h3>
    <p style="color:var(--text-dim);font-size:12.5px;margin-top:-10px">
      Paste your list below. Each product can be "[CODE] Name" followed by the quantity on the next line,
      or just "Name" followed by quantity. Products with no code will be flagged so you can fix them before importing.
    </p>
    <div class="field"><label>Category (applied to all items)</label><input id="bulk-category" value="Clothes" /></div>
    <div class="field"><label>Unit Type (applied to all items)</label><input id="bulk-unit-type" value="Piece" /></div>
    <div class="field"><label>Paste your list*</label><textarea id="bulk-text" rows="8" placeholder="[PC0000001] AL Q1 A
52
[PC0000004] F Koox Q1
35"></textarea></div>
    <div class="modal-actions" style="justify-content:space-between">
      <button type="button" class="btn btn-secondary" id="bulk-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="bulk-preview-btn">Preview</button>
    </div>
    <div id="bulk-preview-area" style="margin-top:16px"></div>
  `);
  document.getElementById('bulk-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('bulk-preview-btn').addEventListener('click', () => {
    const text = document.getElementById('bulk-text').value;
    const category = document.getElementById('bulk-category').value.trim();
    const unitType = document.getElementById('bulk-unit-type').value.trim() || 'Piece';
    const items = parseBulkProductText(text).map((it) => ({ ...it, category, unitType }));
    renderBulkPreview(items);
  });
}

function renderBulkPreview(items) {
  const area = document.getElementById('bulk-preview-area');
  if (!items.length) {
    area.innerHTML = '<p style="color:var(--text-dim)">No products detected in the pasted text.</p>';
    return;
  }
  const flaggedCount = items.filter((it) => it.missingCode).length;
  area.innerHTML = `
    ${flaggedCount ? `<div class="alert-banner" style="margin-bottom:12px">⚠️ ${flaggedCount} item(s) have no product code — a placeholder code will be generated. You can edit codes after import in the Products page.</div>` : ''}
    <div class="table-wrap" style="max-height:280px;overflow-y:auto">
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Qty</th></tr></thead>
        <tbody>
          ${items
            .map(
              (it, idx) => `<tr>
                <td class="${it.missingCode ? 'text-red' : ''}">${escapeHtml(it.code || '(auto)')}</td>
                <td>${escapeHtml(it.name)}</td>
                <td>${escapeHtml(it.category)}</td>
                <td>${it.quantity}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-actions">
      <span style="color:var(--text-dim);font-size:12.5px;align-self:center">${items.length} product(s) ready to import</span>
      <button type="button" class="btn btn-primary" id="bulk-confirm-btn">Import All</button>
    </div>
    <div id="bulk-import-error" class="error-text hidden"></div>
  `;
  document.getElementById('bulk-confirm-btn').addEventListener('click', async () => {
    // Auto-generate placeholder codes for items missing one
    let autoCounter = 1;
    const payloadItems = items.map((it) => {
      if (it.missingCode) {
        let code;
        do {
          code = `AUTO-${String(autoCounter).padStart(4, '0')}`;
          autoCounter++;
        } while (items.some((other) => other.code === code));
        return { ...it, code };
      }
      return it;
    });
    try {
      const result = await api.post('/api/products/bulk-import', { items: payloadItems });
      toast(`Imported ${result.created.length} product(s)${result.skipped.length ? `, skipped ${result.skipped.length}` : ''}`);
      closeModal();
      renderProducts();
    } catch (err) {
      const errEl = document.getElementById('bulk-import-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function openProductModal(product) {
  const isEdit = !!product;
  openModal(`
    <h3>${isEdit ? 'Edit Product' : 'Add Product'}</h3>
    <form id="product-form">
      <div class="field"><label>Product Code*</label><input name="code" required value="${isEdit ? escapeHtml(product.code) : ''}" /></div>
      <div class="field"><label>Product Name*</label><input name="name" required value="${isEdit ? escapeHtml(product.name) : ''}" /></div>
      <div class="field"><label>Category</label><input name="category" placeholder="e.g. Groceries" value="${isEdit ? escapeHtml(product.category || '') : ''}" /></div>
      <div class="field"><label>Unit Type*</label><input name="unitType" required value="${isEdit ? escapeHtml(product.unitType) : 'Piece'}" /></div>
      <div class="field"><label>Current Quantity</label><input name="quantity" type="number" min="0" value="${isEdit ? product.quantity : 0}" /></div>
      <div class="field"><label>Minimum Quantity (low stock threshold)</label><input name="minQuantity" type="number" min="0" value="${isEdit ? product.minQuantity : 10}" /></div>
      <div class="field"><label>Description</label><textarea name="description" rows="3">${isEdit ? escapeHtml(product.description || '') : ''}</textarea></div>
      <div id="product-form-error" class="error-text hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="product-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);
  document.getElementById('product-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      if (isEdit) {
        await api.put(`/api/products/${product.id}`, payload);
        toast('Product updated');
      } else {
        await api.post('/api/products', payload);
        toast('Product added');
      }
      closeModal();
      renderProducts();
    } catch (err) {
      const errEl = document.getElementById('product-form-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ================= STOCK IN =================
async function renderStockIn(filterQuery = '', filterProduct = '') {
  const content = document.getElementById('content');
  const [entries, products] = await Promise.all([api.get('/api/stockin'), api.get('/api/products')]);
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  let filtered = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (filterProduct) filtered = filtered.filter((e) => e.productId === filterProduct);
  if (filterQuery) {
    filtered = filtered.filter((e) => {
      const p = productMap[e.productId];
      return p && (p.name.toLowerCase().includes(filterQuery.toLowerCase()) || p.code.toLowerCase().includes(filterQuery.toLowerCase()));
    });
  }
  const total = entries.reduce((sum, e) => sum + e.quantity, 0);

  content.innerHTML = `
    <div class="page-header">
      <h2>Stock In</h2>
      <button class="btn btn-primary" id="add-stockin-btn">+ Add Stock</button>
    </div>
    <div class="toolbar">
      <input type="text" id="stockin-search" placeholder="Search products..." value="${escapeHtml(filterQuery)}" />
      <select id="stockin-product-filter">
        <option value="">All Products</option>
        ${products.map((p) => `<option value="${p.id}" ${p.id === filterProduct ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" id="stockin-filter-btn">Filter</button>
    </div>
    <div class="card accent-blue big-stat" style="margin-bottom:16px;max-width:280px">
      <div class="stat-label">Total Stock Added</div><div class="stat-value">+${total}</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Code</th><th>Product</th><th>Qty Added</th><th>Unit</th><th>Reference</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            filtered.length
              ? filtered
                  .map((e) => {
                    const p = productMap[e.productId] || {};
                    return `<tr>
                      <td>${e.date}</td><td>${escapeHtml(p.code || '')}</td><td>${escapeHtml(p.name || 'Unknown')}</td>
                      <td class="qty-plus">+${e.quantity}</td><td>${escapeHtml(p.unitType || '')}</td>
                      <td>${escapeHtml(e.referenceNote || '-')}</td>
                      <td><button class="action-icon danger delete-stockin-btn" data-id="${e.id}">🗑️</button></td>
                    </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="7">No stock in records</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('add-stockin-btn').addEventListener('click', () => openStockInModal(products));
  document.getElementById('stockin-filter-btn').addEventListener('click', () => {
    renderStockIn(document.getElementById('stockin-search').value, document.getElementById('stockin-product-filter').value);
  });
  content.querySelectorAll('.delete-stockin-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry? Quantity will be reverted.')) return;
      await api.delete(`/api/stockin/${btn.dataset.id}`);
      toast('Entry deleted');
      renderStockIn(filterQuery, filterProduct);
    })
  );
}

function openStockInModal(products) {
  openModal(`
    <h3>Add Stock</h3>
    <form id="stockin-form">
      <div class="field"><label>Product*</label>
        <select name="productId" required>
          <option value="">Select product</option>
          ${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Quantity*</label><input name="quantity" type="number" min="1" required /></div>
      <div class="field"><label>Reference Note</label><input name="referenceNote" placeholder="Invoice #, Purchase reference" /></div>
      <div id="stockin-form-error" class="error-text hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="stockin-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);
  document.getElementById('stockin-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('stockin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api.post('/api/stockin', payload);
      toast('Stock added');
      closeModal();
      renderStockIn();
    } catch (err) {
      const errEl = document.getElementById('stockin-form-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ================= STOCK OUT =================
async function renderStockOut(filterQuery = '', filterProduct = '') {
  const content = document.getElementById('content');
  const [entries, products, branches] = await Promise.all([api.get('/api/stockout'), api.get('/api/products'), api.get('/api/branches')]);
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b]));

  let filtered = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (filterProduct) filtered = filtered.filter((e) => e.productId === filterProduct);
  if (filterQuery) {
    filtered = filtered.filter((e) => {
      const p = productMap[e.productId];
      return p && (p.name.toLowerCase().includes(filterQuery.toLowerCase()) || p.code.toLowerCase().includes(filterQuery.toLowerCase()));
    });
  }
  const total = entries.reduce((sum, e) => sum + e.quantity, 0);

  content.innerHTML = `
    <div class="page-header">
      <h2>Stock Out</h2>
      <button class="btn btn-primary" id="issue-stock-btn">+ Issue Stock</button>
    </div>
    <div class="toolbar">
      <input type="text" id="stockout-search" placeholder="Search products..." value="${escapeHtml(filterQuery)}" />
      <select id="stockout-product-filter">
        <option value="">All Products</option>
        ${products.map((p) => `<option value="${p.id}" ${p.id === filterProduct ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" id="stockout-filter-btn">Filter</button>
    </div>
    <div class="card accent-orange big-stat" style="margin-bottom:16px;max-width:280px">
      <div class="stat-label">Total Stock Issued</div><div class="stat-value" style="color:var(--orange)">-${total}</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Code</th><th>Product</th><th>Qty Issued</th><th>Unit</th><th>Destination</th><th>Reference</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            filtered.length
              ? filtered
                  .map((e) => {
                    const p = productMap[e.productId] || {};
                    const b = branchMap[e.destinationId] || {};
                    return `<tr>
                      <td>${e.date}</td><td>${escapeHtml(p.code || '')}</td><td>${escapeHtml(p.name || 'Unknown')}</td>
                      <td class="qty-minus">-${e.quantity}</td><td>${escapeHtml(p.unitType || '')}</td>
                      <td>${escapeHtml(b.name || 'Unknown')}</td><td>${escapeHtml(e.referenceNote || '-')}</td>
                      <td><button class="action-icon danger delete-stockout-btn" data-id="${e.id}">🗑️</button></td>
                    </tr>`;
                  })
                  .join('')
              : `<tr class="empty-row"><td colspan="8">No stock out records</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('issue-stock-btn').addEventListener('click', () => openStockOutModal(products, branches));
  document.getElementById('stockout-filter-btn').addEventListener('click', () => {
    renderStockOut(document.getElementById('stockout-search').value, document.getElementById('stockout-product-filter').value);
  });
  content.querySelectorAll('.delete-stockout-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry? Quantity will be reverted.')) return;
      await api.delete(`/api/stockout/${btn.dataset.id}`);
      toast('Entry deleted');
      renderStockOut(filterQuery, filterProduct);
    })
  );
}

function openStockOutModal(products, branches) {
  openModal(`
    <h3>Issue Stock</h3>
    <form id="stockout-form">
      <div class="field"><label>Product*</label>
        <select name="productId" required>
          <option value="">Select product</option>
          ${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.code)}) — ${p.quantity} in stock</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Quantity*</label><input name="quantity" type="number" min="1" required /></div>
      <div class="field"><label>Destination Branch/Department*</label>
        <select name="destinationId" required>
          <option value="">Select destination</option>
          ${branches.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Reference Note</label><input name="referenceNote" placeholder="Issue slip #, Department request" /></div>
      <div id="stockout-form-error" class="error-text hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="stockout-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);
  document.getElementById('stockout-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('stockout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api.post('/api/stockout', payload);
      toast('Stock issued');
      closeModal();
      renderStockOut();
    } catch (err) {
      const errEl = document.getElementById('stockout-form-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ================= SALES =================
async function renderSales(filterQuery = '') {
  const content = document.getElementById('content');
  const [sales, customers] = await Promise.all([api.get('/api/sales'), api.get('/api/customers')]);
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));
  let filtered = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (filterQuery) {
    filtered = filtered.filter((s) => {
      const c = customerMap[s.customerId] || {};
      return s.reference.toLowerCase().includes(filterQuery.toLowerCase()) || (c.name || '').toLowerCase().includes(filterQuery.toLowerCase());
    });
  }

  content.innerHTML = `
    <div class="page-header">
      <h2>Sales</h2>
      <button class="btn btn-purple" id="new-sale-btn">+ New Sale</button>
    </div>
    <div class="toolbar">
      <input type="text" id="sales-search" placeholder="Search by reference or customer..." value="${escapeHtml(filterQuery)}" />
      <button class="btn btn-secondary" id="sales-search-btn">Search</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Quantity</th><th>Status</th></tr></thead>
        <tbody>
          ${
            filtered.length
              ? filtered
                  .map(
                    (s) => `<tr>
                      <td>${s.date}</td><td>${escapeHtml(s.reference)}</td>
                      <td>${escapeHtml((customerMap[s.customerId] || {}).name || 'Walk-in Customer')}</td>
                      <td>${s.totalQty}</td>
                      <td><span class="badge badge-completed">${escapeHtml(s.status)}</span></td>
                    </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="5">No data available</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('new-sale-btn').addEventListener('click', async () => {
    const [products, custs] = await Promise.all([api.get('/api/products'), api.get('/api/customers')]);
    openSaleModal(products, custs);
  });
  document.getElementById('sales-search-btn').addEventListener('click', () => renderSales(document.getElementById('sales-search').value));
}

function openSaleModal(products, customers) {
  let itemCount = 0;
  const makeItemRow = () => {
    itemCount++;
    return `<div class="item-row" data-row="${itemCount}">
      <select class="sale-product-select" required>
        <option value="">Select product</option>
        ${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${p.quantity} in stock)</option>`).join('')}
      </select>
      <input class="sale-qty-input" type="number" min="1" placeholder="Qty" required />
      <button type="button" class="remove-item-btn" data-row="${itemCount}">×</button>
    </div>`;
  };

  openModal(`
    <h3>New Sale</h3>
    <form id="sale-form">
      <div class="field"><label>Customer Name (Optional)</label>
        <select name="customerId">
          <option value="c1">Walk-in Customer</option>
          ${customers.filter((c) => c.id !== 'c1').map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-dim)">Items</label>
      <div id="sale-items">${makeItemRow()}</div>
      <button type="button" class="btn btn-secondary" id="add-item-btn" style="margin-bottom:16px">+ Add Item</button>
      <div class="field"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
      <div id="sale-form-error" class="error-text hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="sale-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-purple">Complete Sale</button>
      </div>
    </form>
  `);

  document.getElementById('sale-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('add-item-btn').addEventListener('click', () => {
    document.getElementById('sale-items').insertAdjacentHTML('beforeend', makeItemRow());
    bindRemoveButtons();
  });
  function bindRemoveButtons() {
    document.querySelectorAll('.remove-item-btn').forEach((btn) => {
      btn.onclick = () => {
        const rows = document.querySelectorAll('.item-row');
        if (rows.length <= 1) return;
        document.querySelector(`.item-row[data-row="${btn.dataset.row}"]`).remove();
      };
    });
  }
  bindRemoveButtons();

  document.getElementById('sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customerId = e.target.customerId.value;
    const notes = e.target.notes.value;
    const items = [];
    document.querySelectorAll('.item-row').forEach((row) => {
      const productId = row.querySelector('.sale-product-select').value;
      const qty = row.querySelector('.sale-qty-input').value;
      if (productId && qty) items.push({ productId, qty: Number(qty) });
    });
    const errEl = document.getElementById('sale-form-error');
    if (!items.length) {
      errEl.textContent = 'Add at least one item';
      errEl.classList.remove('hidden');
      return;
    }
    try {
      await api.post('/api/sales', { customerId, items, notes });
      toast('Sale completed');
      closeModal();
      renderSales();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ================= CUSTOMERS =================
async function renderCustomers() {
  const content = document.getElementById('content');
  const customers = await api.get('/api/customers');
  content.innerHTML = `
    <div class="page-header">
      <h2>Customers</h2>
      <button class="btn btn-primary" id="add-customer-btn">+ Add Customer</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Customer Name</th><th>Contact</th><th>Total Purchases</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            customers.length
              ? customers
                  .map(
                    (c) => `<tr>
                      <td>${escapeHtml(c.name)}</td>
                      <td>${escapeHtml(c.phone || '-')}</td>
                      <td>${c.totalPurchases || 0}</td>
                      <td>
                        <button class="action-icon edit-customer-btn" data-id="${c.id}">✏️</button>
                        <button class="action-icon danger delete-customer-btn" data-id="${c.id}">🗑️</button>
                      </td>
                    </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="4">No customers yet</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerModal());
  content.querySelectorAll('.edit-customer-btn').forEach((btn) =>
    btn.addEventListener('click', () => openCustomerModal(customers.find((c) => c.id === btn.dataset.id)))
  );
  content.querySelectorAll('.delete-customer-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this customer?')) return;
      await api.delete(`/api/customers/${btn.dataset.id}`);
      toast('Customer deleted');
      renderCustomers();
    })
  );
}

function openCustomerModal(customer) {
  const isEdit = !!customer;
  openModal(`
    <h3>${isEdit ? 'Edit Customer' : 'Add Customer'}</h3>
    <form id="customer-form">
      <div class="field"><label>Customer Name*</label><input name="name" required value="${isEdit ? escapeHtml(customer.name) : ''}" /></div>
      <div class="field"><label>Phone (Optional)</label><input name="phone" value="${isEdit ? escapeHtml(customer.phone || '') : ''}" /></div>
      <div class="field"><label>Address (Optional)</label><input name="address" value="${isEdit ? escapeHtml(customer.address || '') : ''}" /></div>
      <div id="customer-form-error" class="error-text hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="customer-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);
  document.getElementById('customer-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (isEdit) {
        await api.put(`/api/customers/${customer.id}`, payload);
        toast('Customer updated');
      } else {
        await api.post('/api/customers', payload);
        toast('Customer added');
      }
      closeModal();
      renderCustomers();
    } catch (err) {
      const errEl = document.getElementById('customer-form-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ================= ANALYTICS =================
let analyticsTab = 'fastMoving';
async function renderAnalytics() {
  const content = document.getElementById('content');
  const a = await api.get('/api/analytics');
  const tabs = [
    { key: 'fastMoving', label: 'Fast Moving', icon: '⚡' },
    { key: 'mediumMoving', label: 'Medium Moving', icon: '➖' },
    { key: 'slowMoving', label: 'Slow Moving', icon: '🐢' },
    { key: 'lowStock', label: 'Low Stock', icon: '⚠️' },
  ];
  const counts = { fastMoving: a.fastMoving.length, mediumMoving: a.mediumMoving.length, slowMoving: a.slowMoving.length, lowStock: a.lowStock.length };

  content.innerHTML = `
    <div class="page-header">
      <div><h2>Analytics</h2><div class="sub">This Month - Last 30 days analysis</div></div>
    </div>
    <div class="grid-4">
      ${tabs.map((t) => `<div class="card"><div class="stat-label">${t.icon} ${t.label}</div><div class="stat-value">${counts[t.key]}</div></div>`).join('')}
    </div>
    <div class="tabs">
      ${tabs.map((t) => `<button class="tab-btn ${analyticsTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div class="card" id="analytics-list"></div>
  `;

  function renderList() {
    const list = a[analyticsTab];
    document.getElementById('analytics-list').innerHTML = list.length
      ? list
          .map(
            (p, i) => `<div class="progress-item">
              <div class="top-row"><span><span class="rank-num">${i + 1}</span>${escapeHtml(p.name)} <span class="meta">(${escapeHtml(p.code)})</span></span><span>${p.quantity}</span></div>
              <div class="progress-bar-track"><div class="progress-bar-fill green" style="width:${p.percent}%"></div></div>
            </div>`
          )
          .join('')
      : '<p style="color:var(--text-dim)">No items in this category</p>';
  }
  renderList();
  content.querySelectorAll('.tab-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      analyticsTab = btn.dataset.tab;
      content.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    })
  );
}

// ================= REPORTS =================
let reportTab = 'daily';
async function renderReports() {
  const content = document.getElementById('content');
  const tabs = [
    { key: 'daily', label: 'Daily Report' },
    { key: 'weekly', label: 'Weekly Report' },
    { key: 'monthly', label: 'Monthly Report' },
    { key: 'stockin', label: 'Stock In Report' },
    { key: 'stockout', label: 'Stock Out Report' },
    { key: 'fastmoving', label: 'Fast Moving Report' },
    { key: 'slowmoving', label: 'Slow Moving Report' },
    { key: 'lowstock', label: 'Low Stock Report' },
  ];

  content.innerHTML = `
    <div class="page-header">
      <h2>Reports</h2>
      <div class="btn-row">
        <button class="btn btn-secondary" id="export-pdf-btn">Export to PDF</button>
        <button class="btn btn-secondary" id="export-excel-btn">Export to Excel</button>
      </div>
    </div>
    <div class="tabs">${tabs.map((t) => `<button class="tab-btn ${reportTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>
    <div class="toolbar">
      <div class="field" style="margin-bottom:0"><label>From Date</label><input type="date" id="report-from" /></div>
      <div class="field" style="margin-bottom:0"><label>To Date</label><input type="date" id="report-to" /></div>
      <button class="btn btn-primary" id="generate-report-btn" style="align-self:flex-end">Generate Report</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Product Code</th><th>Product Name</th><th>Quantity</th><th>Type</th></tr></thead>
        <tbody id="report-rows"><tr class="empty-row"><td colspan="5">Choose a date range and generate a report</td></tr></tbody>
      </table>
    </div>
  `;

  content.querySelectorAll('.tab-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      reportTab = btn.dataset.tab;
      content.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    })
  );

  async function generate() {
    const from = document.getElementById('report-from').value;
    const to = document.getElementById('report-to').value;
    const params = new URLSearchParams({ type: reportTab });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/reports?${params.toString()}`);
    document.getElementById('report-rows').innerHTML = data.rows.length
      ? data.rows
          .map(
            (r) => `<tr>
              <td>${r.date}</td><td>${escapeHtml(r.productCode)}</td><td>${escapeHtml(r.productName)}</td>
              <td class="${r.quantity < 0 ? 'text-red' : 'text-green'}">${r.quantity > 0 ? '+' : ''}${r.quantity}</td>
              <td><span class="badge ${r.type === 'Stock In' ? 'badge-in' : r.type === 'Stock Out' ? 'badge-out' : 'badge-completed'}">${escapeHtml(r.type)}</span></td>
            </tr>`
          )
          .join('')
      : `<tr class="empty-row"><td colspan="5">No data for this range</td></tr>`;
    return data.rows;
  }

  document.getElementById('generate-report-btn').addEventListener('click', generate);
  document.getElementById('export-pdf-btn').addEventListener('click', async () => {
    const rows = await generate();
    exportRowsToPdf(rows, reportTab);
  });
  document.getElementById('export-excel-btn').addEventListener('click', async () => {
    const rows = await generate();
    exportRowsToCsv(rows, reportTab);
  });
}

function exportRowsToCsv(rows, name) {
  if (!rows || !rows.length) {
    toast('No data to export', 'error');
    return;
  }
  const header = ['Date', 'Product Code', 'Product Name', 'Quantity', 'Type'];
  const csvRows = [header.join(',')];
  rows.forEach((r) => {
    csvRows.push([r.date, r.productCode, `"${r.productName}"`, r.quantity, r.type].join(','));
  });
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportRowsToPdf(rows, name) {
  if (!rows || !rows.length) {
    toast('No data to export', 'error');
    return;
  }
  const win = window.open('', '_blank');
  const tableRows = rows
    .map((r) => `<tr><td>${r.date}</td><td>${r.productCode}</td><td>${r.productName}</td><td>${r.quantity}</td><td>${r.type}</td></tr>`)
    .join('');
  win.document.write(`
    <html><head><title>${name}-report</title>
    <style>body{font-family:sans-serif;padding:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px}</style>
    </head><body>
    <h2>${name} report</h2>
    <table><thead><tr><th>Date</th><th>Product Code</th><th>Product Name</th><th>Quantity</th><th>Type</th></tr></thead><tbody>${tableRows}</tbody></table>
    <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  win.document.close();
}

// ================= ITEM LOOKUP =================
async function renderLookup() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-header"><h2>Item Lookup</h2></div>
    <div class="toolbar">
      <input type="text" id="lookup-search" placeholder="Search by product name or code..." />
      <select id="lookup-range">
        <option value="1">Last 1 month</option>
        <option value="3" selected>Last 3 months</option>
        <option value="6">Last 6 months</option>
      </select>
      <button class="btn btn-primary" id="lookup-search-btn">Search</button>
    </div>
    <div id="lookup-results"></div>
  `;

  document.getElementById('lookup-search-btn').addEventListener('click', doLookup);
  document.getElementById('lookup-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLookup();
  });

  async function doLookup() {
    const query = document.getElementById('lookup-search').value.trim();
    const resultsEl = document.getElementById('lookup-results');
    if (!query) {
      resultsEl.innerHTML = '';
      return;
    }
    const { matches } = await api.get(`/api/lookup?query=${encodeURIComponent(query)}`);
    if (!matches.length) {
      resultsEl.innerHTML = '<p style="color:var(--text-dim)">No matching products</p>';
      return;
    }
    resultsEl.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        ${matches
          .map((p) => `<div class="list-row"><span class="name">${escapeHtml(p.name)} <span class="meta">(${escapeHtml(p.code)})</span></span><button class="btn btn-secondary view-history-btn" data-id="${p.id}" data-name="${escapeHtml(p.name)}">View History</button></div>`)
          .join('')}
      </div>
      <div id="lookup-history"></div>
    `;
    resultsEl.querySelectorAll('.view-history-btn').forEach((btn) =>
      btn.addEventListener('click', () => showHistory(btn.dataset.id, btn.dataset.name))
    );
  }

  async function showHistory(productId, productName) {
    const months = document.getElementById('lookup-range').value;
    const { timeline } = await api.get(`/api/lookup/${productId}/history?months=${months}`);
    const historyEl = document.getElementById('lookup-history');
    historyEl.innerHTML = `
      <div class="card">
        <div class="section-title" style="margin-top:0">History for ${escapeHtml(productName)}</div>
        ${
          timeline.length
            ? timeline
                .map(
                  (t) =>
                    t.type === 'in'
                      ? `<div class="list-row"><span class="name">Stock In <span class="meta">${t.date}${t.referenceNote ? ' · ' + escapeHtml(t.referenceNote) : ''}</span></span><span class="qty-plus">+${t.quantity}</span></div>`
                      : `<div class="list-row"><span class="name">Stock Out → ${escapeHtml(t.destination)} <span class="meta">${t.date}${t.referenceNote ? ' · ' + escapeHtml(t.referenceNote) : ''}</span></span><span class="qty-minus">-${t.quantity}</span></div>`
                )
                .join('')
            : '<p style="color:var(--text-dim)">No history in this range</p>'
        }
      </div>
    `;
  }
}

// ================= BRANCHES / DEPARTMENTS =================
async function renderBranches() {
  const content = document.getElementById('content');
  const branches = await api.get('/api/branches');
  content.innerHTML = `
    <div class="page-header">
      <h2>Branches &amp; Departments</h2>
      <button class="btn btn-primary" id="add-branch-btn">+ Add Branch/Department</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            branches.length
              ? branches
                  .map(
                    (b) => `<tr>
                      <td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.description || '-')}</td>
                      <td>
                        <button class="action-icon edit-branch-btn" data-id="${b.id}">✏️</button>
                        <button class="action-icon danger delete-branch-btn" data-id="${b.id}">🗑️</button>
                      </td>
                    </tr>`
                  )
                  .join('')
              : `<tr class="empty-row"><td colspan="3">No branches yet</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('add-branch-btn').addEventListener('click', () => openBranchModal());
  content.querySelectorAll('.edit-branch-btn').forEach((btn) =>
    btn.addEventListener('click', () => openBranchModal(branches.find((b) => b.id === btn.dataset.id)))
  );
  content.querySelectorAll('.delete-branch-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this branch/department?')) return;
      await api.delete(`/api/branches/${btn.dataset.id}`);
      toast('Deleted');
      renderBranches();
    })
  );
}

function openBranchModal(branch) {
  const isEdit = !!branch;
  openModal(`
    <h3>${isEdit ? 'Edit' : 'Add'} Branch/Department</h3>
    <form id="branch-form">
      <div class="field"><label>Name*</label><input name="name" required value="${isEdit ? escapeHtml(branch.name) : ''}" /></div>
      <div class="field"><label>Description / Location (Optional)</label><input name="description" value="${isEdit ? escapeHtml(branch.description || '') : ''}" /></div>
      <div id="branch-form-error" class="error-text hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="branch-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);
  document.getElementById('branch-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('branch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (isEdit) {
        await api.put(`/api/branches/${branch.id}`, payload);
        toast('Updated');
      } else {
        await api.post('/api/branches', payload);
        toast('Added');
      }
      closeModal();
      renderBranches();
    } catch (err) {
      const errEl = document.getElementById('branch-form-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ================= SETTINGS =================
let settingsTab = 'theme';
async function renderSettings() {
  const content = document.getElementById('content');
  const settings = await api.get('/api/settings');
  content.innerHTML = `
    <div class="page-header"><h2>Settings</h2></div>
    <div class="tabs">
      <button class="tab-btn ${settingsTab === 'theme' ? 'active' : ''}" data-tab="theme">Theme &amp; Language</button>
      <button class="tab-btn ${settingsTab === 'lowstock' ? 'active' : ''}" data-tab="lowstock">Low Stock Settings</button>
      <button class="tab-btn ${settingsTab === 'password' ? 'active' : ''}" data-tab="password">Change Password</button>
      <button class="tab-btn ${settingsTab === 'users' ? 'active' : ''}" data-tab="users">Users</button>
    </div>
    <div id="settings-body"></div>
  `;
  content.querySelectorAll('.tab-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      settingsTab = btn.dataset.tab;
      content.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderSettingsBody(settings);
    })
  );
  renderSettingsBody(settings);
}

function renderSettingsBody(settings) {
  const body = document.getElementById('settings-body');
  if (settingsTab === 'theme') {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    body.innerHTML = `
      <div class="settings-block">
        <div class="section-title" style="margin-top:0">Theme</div>
        <div class="theme-options">
          <div class="theme-option ${current === 'dark' ? 'selected' : ''}" data-theme-choice="dark">🌙 Dark</div>
          <div class="theme-option ${current === 'light' ? 'selected' : ''}" data-theme-choice="light">☀️ Light</div>
        </div>
        <div class="section-title">Language</div>
        <div class="field">
          <select id="language-select">
            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
            <option value="so" ${settings.language === 'so' ? 'selected' : ''}>Somali</option>
          </select>
        </div>
        <button class="btn btn-primary" id="save-theme-btn">Save</button>
      </div>
    `;
    body.querySelectorAll('.theme-option').forEach((el) =>
      el.addEventListener('click', () => {
        body.querySelectorAll('.theme-option').forEach((o) => o.classList.remove('selected'));
        el.classList.add('selected');
      })
    );
    document.getElementById('save-theme-btn').addEventListener('click', async () => {
      const chosen = body.querySelector('.theme-option.selected').dataset.themeChoice;
      const language = document.getElementById('language-select').value;
      document.documentElement.setAttribute('data-theme', chosen);
      localStorage.setItem('theme', chosen);
      document.getElementById('theme-toggle-btn').textContent = chosen === 'dark' ? '🌙' : '☀️';
      await api.put('/api/settings', { theme: chosen, language });
      toast('Settings saved');
    });
  } else if (settingsTab === 'lowstock') {
    api.get('/api/products').then((products) => {
      body.innerHTML = `
        <div class="section-title" style="margin-top:0">Set Low Stock Threshold</div>
        <p style="color:var(--text-dim);font-size:13px;margin-top:-6px">Products at or below their minimum quantity will trigger a low stock alert.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Current Qty</th><th>Minimum Qty</th><th>Actions</th></tr></thead>
            <tbody>
              ${products
                .map(
                  (p) => `<tr>
                    <td>${escapeHtml(p.name)} <span class="meta">(${escapeHtml(p.code)})</span></td>
                    <td>${p.quantity}</td>
                    <td class="${p.quantity <= p.minQuantity ? 'text-red' : 'text-green'}">${p.minQuantity}</td>
                    <td><button class="action-icon edit-threshold-btn" data-id="${p.id}">Edit</button></td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
      body.querySelectorAll('.edit-threshold-btn').forEach((btn) =>
        btn.addEventListener('click', async () => {
          const product = products.find((p) => p.id === btn.dataset.id);
          const val = prompt(`New minimum quantity for ${product.name}:`, product.minQuantity);
          if (val === null) return;
          await api.put(`/api/products/${product.id}`, { minQuantity: Number(val) });
          toast('Threshold updated');
          renderSettingsBody({ theme: '', language: '' });
        })
      );
    });
  } else if (settingsTab === 'password') {
    body.innerHTML = `
      <div class="section-title" style="margin-top:0">Change Password</div>
      <form id="password-form" class="settings-block">
        <div class="field"><label>Current Password*</label><input name="currentPassword" type="password" required /></div>
        <div class="field"><label>New Password*</label><input name="newPassword" type="password" required minlength="6" /></div>
        <div class="field"><label>Confirm New Password*</label><input name="confirmPassword" type="password" required minlength="6" /></div>
        <div id="password-form-error" class="error-text hidden"></div>
        <button type="submit" class="btn btn-primary">Update Password</button>
      </form>
    `;
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const currentPassword = fd.get('currentPassword');
      const newPassword = fd.get('newPassword');
      const confirmPassword = fd.get('confirmPassword');
      const errEl = document.getElementById('password-form-error');
      if (newPassword !== confirmPassword) {
        errEl.textContent = 'New password and confirmation do not match';
        errEl.classList.remove('hidden');
        return;
      }
      try {
        await api.post('/api/auth/change-password', { currentPassword, newPassword });
        toast('Password updated');
        e.target.reset();
        errEl.classList.add('hidden');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  } else if (settingsTab === 'users') {
    body.innerHTML = `
      <div class="section-title" style="margin-top:0">Add New User</div>
      <form id="user-form" class="settings-block">
        <div class="field"><label>Name*</label><input name="name" required /></div>
        <div class="field"><label>Email*</label><input name="email" type="email" required /></div>
        <div class="field"><label>Password*</label><input name="password" type="password" required /></div>
        <div class="field"><label>Role</label>
          <select name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select>
        </div>
        <div id="user-form-error" class="error-text hidden"></div>
        <button type="submit" class="btn btn-primary">Create User</button>
      </form>
    `;
    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.post('/api/auth/users', payload);
        toast('User created');
        e.target.reset();
      } catch (err) {
        const errEl = document.getElementById('user-form-error');
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }
}
