// server.js - Apna Mini Mart PWA backend
// Lightweight Express server: serves the PWA static files and a tiny JSON-file
// "database" for products + orders. No external DB required - good fit for a
// single small shop. Swap the JSON file reads/writes for a real DB later if needed.

const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Simple admin auth ----
// CHANGE THIS before going live! Set via environment variable in production:
//   ADMIN_PASSWORD=yourSecretPassword node server.js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

// ---- UPI payment details ----
const UPI_ID = process.env.UPI_ID || 'sachinkumar.ibz1@icici';
const STORE_NAME = 'Apna Mini Mart';

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const PRODUCT_IMAGES_DIR = path.join(__dirname, 'public', 'images', 'products');

// Ensure orders file exists
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, '[]', 'utf-8');
}
if (!fs.existsSync(PRODUCT_IMAGES_DIR)) {
  fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG or WebP images are allowed'));
    }
    cb(null, true);
  },
});

app.use(express.json());

// The service worker file itself must never be cached by the browser's HTTP
// cache, or the browser won't notice new deploys and will stay stuck on the
// old app version indefinitely.
app.get('/service-worker.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
});

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

// Generate a UPI payment QR code (PNG) for the given amount, rendered
// server-side so it never depends on a client-side QR library working.
app.get('/api/upi-qr', async (req, res) => {
  const amount = Math.max(0, parseFloat(req.query.amount) || 0).toFixed(2);
  const upiUrl = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(STORE_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Order at ' + STORE_NAME)}`;
  try {
    const png = await QRCode.toBuffer(upiUrl, { type: 'png', width: 300, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    res.status(500).end();
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

// Upload a product photo (admin only) - saves to public/images/products/
app.post('/api/admin/upload-image', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${(req.body.productId || 'p' + Date.now())}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(PRODUCT_IMAGES_DIR, filename), req.file.buffer);
    res.json({ ok: true, path: `images/products/${filename}` });
  });
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
