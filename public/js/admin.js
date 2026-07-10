// admin.js - Apna Mini Mart admin panel logic

let ADMIN_PASSWORD = sessionStorage.getItem('apna_admin_pw') || '';
let PRODUCTS = [];

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('addProductBtn').addEventListener('click', addProduct);

let changePhotoTargetId = null;
document.getElementById('changePhotoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !changePhotoTargetId) return;
  showToast('Uploading photo...');
  const path = await uploadImage(file, changePhotoTargetId);
  if (path) {
    await updateProduct(changePhotoTargetId, { image: path });
  } else {
    showToast('Photo upload failed');
  }
});

if (ADMIN_PASSWORD) {
  tryEnterDashboard();
} 

async function login() {
  const pw = document.getElementById('adminPassword').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  const data = await res.json();
  if (data.ok) {
    ADMIN_PASSWORD = pw;
    sessionStorage.setItem('apna_admin_pw', pw);
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    loadProducts();
  } else {
    document.getElementById('loginError').textContent = 'Wrong password, try again.';
  }
}

async function tryEnterDashboard() {
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';
  loadProducts();
}

async function loadProducts() {
  const res = await fetch('/api/products');
  PRODUCTS = await res.json();
  renderProductList();
}

function renderProductList() {
  const wrap = document.getElementById('productList');
  wrap.innerHTML = PRODUCTS.map((p) => `
    <div class="admin-card">
      <div class="admin-product-row">
        <img src="${p.image || 'images/placeholder.png'}" alt="${p.name}" />
        <div class="info">
          <div class="name">${p.name}</div>
          <div class="sub">${p.category} · ₹${p.price} / ${p.unit} · ${stockLabel(p.stock)}</div>
        </div>
      </div>
      <div class="admin-actions">
        <button class="edit" data-action="price" data-id="${p.id}">Edit Price</button>
        <button class="edit" data-action="stock" data-id="${p.id}">Change Stock</button>
        <button class="edit" data-action="photo" data-id="${p.id}">Change Photo</button>
        <button class="danger" data-action="delete" data-id="${p.id}">Delete</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset.id));
  });
}

function stockLabel(s) {
  if (s === 'out_of_stock') return 'Out of stock';
  if (s === 'low_stock') return 'Low stock';
  return 'In stock';
}

async function handleAction(action, id) {
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) return;

  if (action === 'price') {
    const newPrice = prompt(`New price for ${product.name} (current ₹${product.price}):`, product.price);
    if (newPrice === null || newPrice === '') return;
    await updateProduct(id, { price: Number(newPrice) });
  }

  if (action === 'stock') {
    const val = prompt(`Stock status for ${product.name}:\nType one of: in_stock, low_stock, out_of_stock`, product.stock);
    if (!val) return;
    if (!['in_stock','low_stock','out_of_stock'].includes(val.trim())) {
      alert('Please type exactly: in_stock, low_stock, or out_of_stock');
      return;
    }
    await updateProduct(id, { stock: val.trim() });
  }

  if (action === 'photo') {
    changePhotoTargetId = id;
    document.getElementById('changePhotoInput').click();
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    await fetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Password': ADMIN_PASSWORD },
    });
    showToast('Product deleted');
    loadProducts();
  }
}

async function uploadImage(file, productId) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('productId', productId);
  try {
    const res = await fetch('/api/admin/upload-image', {
      method: 'POST',
      headers: { 'X-Admin-Password': ADMIN_PASSWORD },
      body: formData,
    });
    const data = await res.json();
    return res.ok ? data.path : null;
  } catch (e) {
    return null;
  }
}

async function updateProduct(id, patch) {
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
    body: JSON.stringify(patch),
  });
  if (res.ok) {
    showToast('Updated');
    loadProducts();
  } else {
    showToast('Update failed - check admin password');
  }
}

async function addProduct() {
  const name = document.getElementById('newName').value.trim();
  const category = document.getElementById('newCategory').value;
  const price = Number(document.getElementById('newPrice').value);
  const unit = document.getElementById('newUnit').value.trim();
  const variantsRaw = document.getElementById('newVariants').value.trim();
  const stock = document.getElementById('newStock').value;

  if (!name || !price || !unit) {
    showToast('Name, price, and unit are required');
    return;
  }

  const variants = variantsRaw ? variantsRaw.split(',').map((v) => v.trim()).filter(Boolean) : [unit];
  const imageMap = {
    Grocery: 'images/grocery.png', Dairy: 'images/dairy.png', Snacks: 'images/snacks.png',
    Beverages: 'images/beverages.png', Frozen: 'images/frozen.png',
    'Personal Care': 'images/personal_care.png', Household: 'images/household.png',
  };

  const newId = 'p' + Date.now();
  let image = imageMap[category];
  const photoFile = document.getElementById('newPhoto').files[0];
  if (photoFile) {
    showToast('Uploading photo...');
    const uploadedPath = await uploadImage(photoFile, newId);
    if (uploadedPath) image = uploadedPath;
  }

  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
    body: JSON.stringify({ id: newId, name, category, price, unit, variants, stock, image }),
  });

  if (res.ok) {
    showToast('Product added');
    document.getElementById('newName').value = '';
    document.getElementById('newPrice').value = '';
    document.getElementById('newUnit').value = '';
    document.getElementById('newVariants').value = '';
    document.getElementById('newPhoto').value = '';
    loadProducts();
  } else {
    showToast('Failed to add product - check admin password');
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 1800);
}
