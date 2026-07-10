// server.js - Apna Mini Mart PWA backend
// Lightweight Express server: serves the PWA static files and a tiny JSON-file
// "database" for products + orders. No external DB required - good fit for a
// single small shop. Swap the JSON file reads/writes for a real DB later if needed.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Simple admin auth ----
// CHANGE THIS before going live! Set via environment variable in production:
//   ADMIN_PASSWORD=yourSecretPassword node server.js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// Ensure orders file exists
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, '[]', 'utf-8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  // Let the service worker control caching for most assets; keep server
  // caching light so admin edits show up quickly.
  maxAge: '1h'
}));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function requireAdmin(req, res, next) {
  const supplied = req.headers['x-admin-password'];
  if (supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  next();
}

// ---- Public API ----

// Get full product catalog
app.get('/api/products', (req, res) => {
  try {
    res.json(readJSON(PRODUCTS_FILE));
  } catch (e) {
    res.status(500).json({ error: 'Could not read products' });
  }
});

// Log a placed order (best-effort; the real "confirmation" happens via WhatsApp)
app.post('/api/orders', (req, res) => {
  try {
    const orders = readJSON(ORDERS_FILE);
    const order = {
      id: 'ORD' + Date.now(),
      createdAt: new Date().toISOString(),
      ...req.body
    };
    orders.push(order);
    writeJSON(ORDERS_FILE, orders);
    res.json({ ok: true, orderId: order.id });
  } catch (e) {
    res.status(500).json({ error: 'Could not save order' });
  }
});

// ---- Admin API (password-protected) ----

// Admin login check
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Wrong password' });
  }
});

// List orders (admin only)
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(readJSON(ORDERS_FILE));
});

// Add a new product
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const p = req.body;
  if (!p.name || !p.category || p.price == null) {
    return res.status(400).json({ error: 'name, category, and price are required' });
  }
  p.id = p.id || ('p' + Date.now());
  p.stock = p.stock || 'in_stock';
  p.image = p.image || 'images/placeholder.png';
  p.variants = p.variants || [];
  products.push(p);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: p });
});

// Update an existing product (price, stock, name, etc.)
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  products[idx] = { ...products[idx], ...req.body, id: products[idx].id };
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: products[idx] });
});

// Delete a product
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  let products = readJSON(PRODUCTS_FILE);
  const before = products.length;
  products = products.filter(p => p.id !== req.params.id);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, deleted: before - products.length });
});

app.listen(PORT, () => {
  console.log(`Apna Mini Mart PWA running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`Admin password: ${ADMIN_PASSWORD === 'changeme123' ? '(default - CHANGE THIS) ' + ADMIN_PASSWORD : '(set via env var)'}`);
});
