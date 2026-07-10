// app.js - Apna Mini Mart customer PWA logic
// Vanilla JS, no framework - keeps it fast on low-end phones / slow networks.

// ============== CONFIG - edit these for your shop ==============
const CONFIG = {
  STORE_NAME: 'Apna Mini Mart',
  WHATSAPP_NUMBER: '918882396880', // shop's WhatsApp number (91 = India country code + 8882396880)
  UPI_ID: 'sachinkumar.ibz1@icici',
  CURRENCY: '₹',
  MIN_DELIVERY_VALUE: 1000, // orders below this must be picked up from the store
};
document.getElementById('upiIdText').textContent = CONFIG.UPI_ID;

// ============== State ==============
let PRODUCTS = [];
let currentCategory = 'All';
let searchQuery = '';
let cart = loadCart(); // { key: { productId, name, unit, variant, price, image, qty } }
let customerLocation = null; // { lat, lng, accuracy } captured via Geolocation API

const CATEGORIES = ['All', 'Grocery', 'Dairy', 'Snacks', 'Beverages', 'Frozen', 'Personal Care', 'Household'];

// ============== Init ==============
init();

async function init() {
  registerServiceWorker();
  renderCategoryChips();
  bindGlobalEvents();
  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);

  try {
    const res = await fetch('/api/products');
    PRODUCTS = await res.json();
  } catch (e) {
    console.warn('Could not fetch products (offline?)', e);
    PRODUCTS = [];
  }
  renderProductGrid();
  renderCartUI();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
}

function updateOfflineBanner() {
  document.getElementById('offlineBanner').classList.toggle('show', !navigator.onLine);
}

// ============== Category chips ==============
function renderCategoryChips() {
  const wrap = document.getElementById('categoryScroll');
  wrap.innerHTML = '';
  CATEGORIES.forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cat === currentCategory ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      currentCategory = cat;
      renderCategoryChips();
      renderProductGrid();
    });
    wrap.appendChild(chip);
  });
}

// ============== Product grid ==============
function renderProductGrid() {
  const grid = document.getElementById('productGrid');
  const q = searchQuery.trim().toLowerCase();
  const filtered = PRODUCTS.filter((p) => {
    const catMatch = currentCategory === 'All' || p.category === currentCategory;
    const qMatch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return catMatch && qMatch;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="icon">🛒</div>
      <div>No products found${!navigator.onLine ? ' (you are offline)' : ''}.</div>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(productCardHTML).join('');

  filtered.forEach((p) => {
    const card = grid.querySelector(`[data-product-id="${p.id}"]`);
    if (!card) return;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.product-actions')) return;
      openProductSheet(p);
    });
    bindCardActions(card, p);
  });
}

function defaultVariant(p) {
  return p.variants && p.variants[0] ? p.variants[0] : p.unit;
}

function productActionHTML(p) {
  if (p.stock === 'out_of_stock') {
    return `<button class="add-btn" disabled>Out of Stock</button>`;
  }
  const key = cartKey(p.id, defaultVariant(p));
  const qty = cart[key] ? cart[key].qty : 0;
  if (qty > 0) {
    return `
      <div class="qty-stepper">
        <button data-delta="-1">-</button>
        <span>${qty}</span>
        <button data-delta="1">+</button>
      </div>`;
  }
  return `<button class="add-btn">Add to Cart</button>`;
}

function bindCardActions(card, p) {
  const wrap = card.querySelector('.product-actions');
  const addBtn = wrap.querySelector('.add-btn');
  if (addBtn && !addBtn.disabled) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(p, defaultVariant(p), 1);
      refreshCardActions(card, p);
    });
  }
  wrap.querySelectorAll('.qty-stepper button[data-delta]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      changeQty(cartKey(p.id, defaultVariant(p)), parseInt(btn.dataset.delta, 10));
      refreshCardActions(card, p);
    });
  });
}

function refreshCardActions(card, p) {
  const wrap = card.querySelector('.product-actions');
  wrap.innerHTML = productActionHTML(p);
  bindCardActions(card, p);
}

function stockTagHTML(stock) {
  if (stock === 'out_of_stock') return `<span class="stock-tag stock-out">Out of stock</span>`;
  if (stock === 'low_stock') return `<span class="stock-tag stock-low">Low stock</span>`;
  return `<span class="stock-tag stock-in">In stock</span>`;
}

function productCardHTML(p) {
  return `
  <div class="product-card" data-product-id="${p.id}">
    <img class="thumb" src="${p.image || 'images/placeholder.png'}" loading="lazy" alt="${escapeHTML(p.name)}" />
    <div class="product-info">
      <div class="product-name">${escapeHTML(p.name)}</div>
      <div class="product-unit">${escapeHTML(p.unit)}</div>
      <div class="product-price">${CONFIG.CURRENCY}${p.price}</div>
      ${stockTagHTML(p.stock)}
      <div class="product-actions">${productActionHTML(p)}</div>
    </div>
  </div>`;
}

// ============== Product detail sheet ==============
function openProductSheet(p) {
  const content = document.getElementById('productSheetContent');
  const variants = p.variants && p.variants.length ? p.variants : [p.unit];
  content.innerHTML = `
    <img src="${p.image || 'images/placeholder.png'}" style="width:100%;max-height:200px;object-fit:cover;border-radius:14px;margin-bottom:10px;" alt="${escapeHTML(p.name)}" />
    <h2>${escapeHTML(p.name)}</h2>
    <div class="product-unit">${escapeHTML(p.description || '')}</div>
    <div class="product-price" style="margin-top:8px;">${CONFIG.CURRENCY}${p.price}</div>
    ${stockTagHTML(p.stock)}
    <div style="margin-top:12px;font-weight:700;font-size:13px;">Choose option</div>
    <div class="variant-row" id="variantRow">
      ${variants.map((v, i) => `<div class="variant-pill${i === 0 ? ' selected' : ''}" data-variant="${escapeHTML(v)}">${escapeHTML(v)}</div>`).join('')}
    </div>
    ${p.stock === 'out_of_stock'
      ? `<button class="primary-btn" disabled style="background:#CBD5E1;">Out of Stock</button>`
      : `<button class="primary-btn" id="sheetAddBtn">Add to Cart - ${CONFIG.CURRENCY}${p.price}</button>`}
  `;

  let selectedVariant = variants[0];
  content.querySelectorAll('.variant-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      content.querySelectorAll('.variant-pill').forEach((el) => el.classList.remove('selected'));
      pill.classList.add('selected');
      selectedVariant = pill.dataset.variant;
    });
  });

  const addBtn = document.getElementById('sheetAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addToCart(p, selectedVariant, 1);
      closeOverlay('productOverlay');
      showToast(`${p.name} added to cart`);
      const card = document.querySelector(`[data-product-id="${p.id}"]`);
      if (card) refreshCardActions(card, p);
    });
  }

  openOverlay('productOverlay');
}

// ============== Cart logic ==============
function cartKey(productId, variant) { return `${productId}::${variant}`; }

function addToCart(product, variant, qty) {
  const key = cartKey(product.id, variant);
  if (cart[key]) {
    cart[key].qty += qty;
  } else {
    cart[key] = {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      variant,
      price: product.price,
      image: product.image,
      qty,
    };
  }
  saveCart();
  renderCartUI();
  showToast(`${product.name} added to cart`);
}

function changeQty(key, delta) {
  if (!cart[key]) return;
  cart[key].qty += delta;
  if (cart[key].qty <= 0) delete cart[key];
  saveCart();
  renderCartUI();
  renderCartSheet();
}

function cartItemCount() {
  return Object.values(cart).reduce((sum, i) => sum + i.qty, 0);
}
function cartTotal() {
  return Object.values(cart).reduce((sum, i) => sum + i.qty * i.price, 0);
}

function saveCart() {
  localStorage.setItem('apna_cart', JSON.stringify(cart));
}
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('apna_cart')) || {};
  } catch (e) {
    return {};
  }
}

function renderCartUI() {
  const count = cartItemCount();
  const badge = document.getElementById('cartBadge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';

  const fab = document.getElementById('checkoutFab');
  if (count > 0) {
    fab.classList.remove('hidden');
    document.getElementById('fabItemCount').textContent = `${count} item${count > 1 ? 's' : ''}`;
    document.getElementById('fabTotal').textContent = `${CONFIG.CURRENCY}${cartTotal()}`;
  } else {
    fab.classList.add('hidden');
  }
}

function renderCartSheet() {
  const lines = document.getElementById('cartLines');
  const entries = Object.entries(cart);
  if (!entries.length) {
    lines.innerHTML = `<div class="empty-state"><div class="icon">🛒</div><div>Your cart is empty</div></div>`;
    document.getElementById('cartSummary').innerHTML = '';
    return;
  }
  lines.innerHTML = entries.map(([key, item]) => `
    <div class="cart-line">
      <img src="${item.image || 'images/placeholder.png'}" alt="${escapeHTML(item.name)}" />
      <div class="info">
        <div class="name">${escapeHTML(item.name)}</div>
        <div class="meta">${escapeHTML(item.variant)} · ${CONFIG.CURRENCY}${item.price} each</div>
      </div>
      <div class="qty-stepper">
        <button data-key="${key}" data-delta="-1">-</button>
        <span>${item.qty}</span>
        <button data-key="${key}" data-delta="1">+</button>
      </div>
    </div>
  `).join('');

  lines.querySelectorAll('button[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(btn.dataset.key, parseInt(btn.dataset.delta, 10)));
  });

  const total = cartTotal();
  document.getElementById('cartSummary').innerHTML = `
    <div class="cart-summary-row total"><span>Total</span><span>${CONFIG.CURRENCY}${total}</span></div>
  `;
}

// ============== Precise location capture ==============
function captureLocation() {
  const btn = document.getElementById('locBtn');
  const status = document.getElementById('locStatus');

  if (!navigator.geolocation) {
    status.textContent = 'Location is not supported on this device/browser. Please type your address.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Getting your location...';
  status.textContent = '';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      customerLocation = { lat: latitude, lng: longitude, accuracy };
      btn.disabled = false;
      btn.textContent = '📍 Location Captured ✓ (tap to update)';
      const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
      status.innerHTML = `Accurate to ~${Math.round(accuracy)} m · <a href="${mapLink}" target="_blank" rel="noreferrer">View pin on map</a>`;

      // Best-effort: prefill the address box if it's empty, using free reverse geocoding.
      if (!document.getElementById('custAddress').value.trim()) {
        reverseGeocode(latitude, longitude);
      }
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = '📍 Use My Current Location';
      let msg = 'Could not get your location. Please type your address manually.';
      if (err.code === err.PERMISSION_DENIED) {
        msg = 'Location permission denied. You can still type your address, or allow location access and try again.';
      } else if (err.code === err.TIMEOUT) {
        msg = 'Location request timed out. Try again, ideally outdoors or near a window.';
      }
      status.textContent = msg;
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

// Best-effort reverse geocoding using OpenStreetMap's free Nominatim API.
// This is a convenience only - the precise lat/lng + map link is what actually
// guarantees delivery accuracy, and is always sent regardless of this working.
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data && data.display_name) {
      const addressField = document.getElementById('custAddress');
      if (!addressField.value.trim()) addressField.value = data.display_name;
    }
  } catch (e) {
    // Silent failure - reverse geocoding is a nice-to-have, not required.
  }
}


const selectedPayment = 'UPI';
let selectedDelivery = 'delivery';
let deliveryWasForced = false; // true when pickup was auto-forced by low cart value, not chosen by the customer

function openCheckout() {
  // Open first, then fill in details defensively - a stale cached page missing
  // one element (e.g. right after a deploy, before the cache re-syncs) must
  // never silently prevent checkout from opening at all.
  openOverlay('checkoutOverlay');
  try { document.getElementById('checkoutSummary').innerHTML = checkoutSummaryHTML(); } catch (e) { console.error('checkoutSummary failed:', e); }
  try { updateDeliveryOptions(); } catch (e) { console.error('updateDeliveryOptions failed:', e); }
  try { renderUpiQrCode(); } catch (e) { console.error('renderUpiQrCode failed:', e); }
  try {
    document.getElementById('screenshotConfirm').checked = false;
    document.getElementById('placeOrderBtn').disabled = true;
  } catch (e) { console.error('screenshot confirm reset failed:', e); }
}

function renderUpiQrCode() {
  const amount = cartTotal();
  // NOTE: "pa" (the payee VPA) must NOT be percent-encoded - many UPI apps'
  // lightweight link parsers look for a literal "@" and fail ("payment
  // failed"/"invalid payee") if it arrives as %40. Amount must carry 2
  // decimal places or several banking apps reject the link outright.
  const upiUrl = `upi://pay?pa=${CONFIG.UPI_ID}&pn=${encodeURIComponent(CONFIG.STORE_NAME)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Order at ' + CONFIG.STORE_NAME)}`;

  const payBtn = document.getElementById('upiPayBtn');
  payBtn.href = upiUrl;
  document.getElementById('upiPayBtnLabel').textContent = `Pay ${CONFIG.CURRENCY}${amount} via UPI App`;
}

function updateDeliveryOptions() {
  const total = cartTotal();
  const eligible = total >= CONFIG.MIN_DELIVERY_VALUE;
  const deliveryBtn = document.querySelector('#deliveryOptions [data-delivery="delivery"]');
  const pickupBtn = document.querySelector('#deliveryOptions [data-delivery="pickup"]');
  const lockNote = document.getElementById('deliveryLockNote');

  if (!eligible) {
    selectedDelivery = 'pickup';
    deliveryWasForced = true;
    deliveryBtn.classList.add('disabled');
    lockNote.style.display = 'block';
  } else {
    if (deliveryWasForced) {
      selectedDelivery = 'delivery';
      deliveryWasForced = false;
    }
    deliveryBtn.classList.remove('disabled');
    lockNote.style.display = 'none';
  }

  deliveryBtn.classList.toggle('selected', selectedDelivery === 'delivery');
  pickupBtn.classList.toggle('selected', selectedDelivery === 'pickup');
  document.getElementById('deliveryAddressFields').style.display = selectedDelivery === 'delivery' ? 'block' : 'none';
}

function checkoutSummaryHTML() {
  const entries = Object.values(cart);
  const total = cartTotal();
  return `
    <div style="margin:14px 0;">
      ${entries.map(i => `
        <div class="cart-summary-row"><span>${escapeHTML(i.name)} (${escapeHTML(i.variant)}) x${i.qty}</span><span>${CONFIG.CURRENCY}${i.qty * i.price}</span></div>
      `).join('')}
      <div class="cart-summary-row total"><span>Total</span><span>${CONFIG.CURRENCY}${total}</span></div>
    </div>
  `;
}

function buildWhatsAppMessage(name, phone, address) {
  const entries = Object.values(cart);
  const total = cartTotal();
  let msg = `*New Order - ${CONFIG.STORE_NAME}*\n\n`;
  entries.forEach((i) => {
    msg += `• ${i.name} (${i.variant}) x${i.qty} - ${CONFIG.CURRENCY}${i.qty * i.price}\n`;
  });
  msg += `\n*Total: ${CONFIG.CURRENCY}${total}*\n\n`;
  msg += `Name: ${name}\nPhone: ${phone}\n`;
  msg += `Delivery: ${selectedDelivery === 'delivery' ? 'Home Delivery' : 'Store Pickup'}\n`;
  if (selectedDelivery === 'delivery') {
    msg += `Address: ${address}\n`;
    if (customerLocation) {
      msg += `📍 Precise location: https://www.google.com/maps?q=${customerLocation.lat},${customerLocation.lng} (±${Math.round(customerLocation.accuracy)}m)\n`;
    }
  }
  msg += `Payment: ${selectedPayment}\n\n(Payment screenshot attached below)`;
  return msg;
}

async function placeOrder() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  if (!name || !phone) {
    showToast('Please fill name and phone');
    return;
  }
  if (selectedDelivery === 'delivery' && !address) {
    showToast('Please fill your delivery address');
    return;
  }
  if (!Object.keys(cart).length) {
    showToast('Your cart is empty');
    return;
  }
  if (!document.getElementById('screenshotConfirm').checked) {
    showToast('Please confirm you will attach your payment screenshot');
    return;
  }

  const message = buildWhatsAppMessage(name, phone, address);
  const waUrl = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  // Open WhatsApp synchronously, before any await — otherwise mobile browsers
  // often silently block the popup because it's no longer tied to the tap
  // that triggered it, and we must never clear the cart if that happens.
  const waWindow = window.open(waUrl, '_blank');
  if (!waWindow) {
    showToast('Could not open WhatsApp. Please allow pop-ups for this site and tap Place Order again.');
    return;
  }

  // Best-effort: log order to backend for the shop owner's records.
  try {
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name, phone, address: selectedDelivery === 'delivery' ? address : null },
        deliveryMethod: selectedDelivery,
        location: selectedDelivery === 'delivery' ? customerLocation : null,
        payment: selectedPayment,
        items: Object.values(cart),
        total: cartTotal(),
      }),
    });
  } catch (e) {
    // Offline or backend unreachable - WhatsApp message is the real source of truth anyway.
  }

  cart = {};
  customerLocation = null;
  selectedDelivery = 'delivery';
  saveCart();
  renderCartUI();
  closeOverlay('checkoutOverlay');
  closeOverlay('cartOverlay');
  showToast('Order sent via WhatsApp!');
}

// ============== Overlay helpers ==============
function openOverlay(id) { document.getElementById(id).classList.remove('hidden'); }
function closeOverlay(id) { document.getElementById(id).classList.add('hidden'); }

function bindGlobalEvents() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderProductGrid();
  });

  document.getElementById('cartBtn').addEventListener('click', () => {
    renderCartSheet();
    openOverlay('cartOverlay');
  });
  document.getElementById('fabCheckoutBtn').addEventListener('click', () => {
    renderCartSheet();
    openOverlay('cartOverlay');
  });
  document.getElementById('goToCheckoutBtn').addEventListener('click', () => {
    if (!Object.keys(cart).length) { showToast('Your cart is empty'); return; }
    closeOverlay('cartOverlay');
    openCheckout();
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
  });
  document.querySelectorAll('.overlay').forEach((ov) => {
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.add('hidden'); });
  });

  document.querySelectorAll('#deliveryOptions .pay-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      if (opt.classList.contains('disabled')) return;
      selectedDelivery = opt.dataset.delivery;
      updateDeliveryOptions();
    });
  });

  document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);
  document.getElementById('locBtn').addEventListener('click', captureLocation);
  document.getElementById('screenshotConfirm').addEventListener('change', (e) => {
    document.getElementById('placeOrderBtn').disabled = !e.target.checked;
  });
}

// ============== Utilities ==============
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
