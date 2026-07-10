# Apna Mini Mart - PWA Storefront

A lightweight, mobile-first Progressive Web App for ordering groceries, dairy,
snacks, beverages, frozen foods, personal care and household essentials.
Customers order via cart -> checkout -> WhatsApp message to your shop's number.
No payment gateway, no commission fees - you fulfill and collect COD/UPI yourself.

## What's included

```
apna-mini-mart/
├── server.js              # Express backend: serves the app + product/order API
├── package.json
├── data/
│   ├── products.json       # Your product catalog (the "database")
│   └── orders.json         # Orders placed (for your records)
└── public/                 # The actual PWA (served to customers/admin)
    ├── index.html           # Customer storefront
    ├── admin.html           # Admin panel (password protected)
    ├── manifest.json        # PWA install config
    ├── service-worker.js    # Offline caching
    ├── css/style.css
    ├── js/app.js             # Customer logic (cart, checkout, WhatsApp order)
    ├── js/admin.js           # Admin logic (add/edit/delete products)
    ├── icons/                # App icons (green/orange, generated placeholders)
    └── images/               # Category placeholder images + UPI QR code
```

## 1. Before you launch - almost done

**A. WhatsApp number** - ✅ already set to **8882396880** (with India country code 91) in
`public/js/app.js`. No action needed unless this changes.

**B. UPI ID** - still a placeholder (`apnaminimart@upi`). Open `public/js/app.js` and
update:
```js
const CONFIG = {
  ...
  UPI_ID: 'yourrealid@bank',  // <-- put your real UPI ID here
  ...
};
```

**C. UPI QR code image** - `public/images/upi-qr.png` is generated for the placeholder
UPI ID above. Regenerate it for your real UPI ID:
```bash
pip install qrcode[pil]
python3 -c "
import qrcode
img = qrcode.make('upi://pay?pa=YOUR_REAL_UPI_ID&pn=Apna%20Mini%20Mart&cu=INR')
img.save('public/images/upi-qr.png')
"
```

**D. Admin password** - default is `changeme123`. You'll set a real one as an
environment variable when you deploy (see below) - it's not stored in the code.

## 2. Run it locally (to test before deploying)

Requires Node.js 18+.

```bash
npm install
ADMIN_PASSWORD=yourSecretPassword npm start
```

Open `http://localhost:3000` in your phone's browser (same WiFi network - use
your computer's local IP instead of localhost, e.g. `http://192.168.1.5:3000`).

Admin panel: `http://localhost:3000/admin.html`

## 3. Go live - fastest path (Render.com, free tier, ~10 minutes)

I can't create hosting accounts or push this live myself (no access to your
accounts or the ability to run a permanently public server from here), but
this repo includes a `render.yaml` that makes it close to one-click:

1. Create a free account at **render.com** (sign in with GitHub is easiest).
2. Push this folder to a new GitHub repository (or use GitHub's "upload files"
   in the browser - no git command line needed):
   - Go to github.com -> New repository -> name it e.g. `apna-mini-mart`
   - Drag and drop this whole `apna-mini-mart` folder's contents into the
     upload page and commit.
3. On Render: **New -> Blueprint** -> connect the GitHub repo you just
   created. Render will detect `render.yaml` automatically and set everything up.
4. When prompted for the `ADMIN_PASSWORD` environment variable, type a real
   password (not the default).
5. Click **Deploy**. In a few minutes you'll get a live URL like
   `https://apna-mini-mart.onrender.com`.

Note: Render's free tier "sleeps" after 15 minutes of no traffic and takes
~30-50 seconds to wake up on the next visit. Fine for a low-traffic local
shop; if that wake-up delay bothers you, Render's cheapest paid tier ($7/mo)
keeps it always-on, or Railway.app is a similar alternative.

## 4. Generate the QR code for customers

Once you have your live URL, generate a QR code pointing to it:
```bash
python3 -c "
import qrcode
img = qrcode.make('https://YOUR-LIVE-URL-HERE')
img.save('store-qr-code.png')
"
```
Print this QR code and display it at your shop counter / on your signboard.
Scanning it opens the storefront; after the first visit, phones will offer
"Add to Home Screen" so it behaves like an installed app icon.

## 5. Managing products day-to-day

Go to `yourdomain.com/admin.html`, log in with your admin password:
- **Add New Product** - fill the form (name, category, price, unit, variants, stock)
- **Edit Price** / **Change Stock** - quick inline prompts per product
- **Delete** - removes a product

Changes save immediately to `data/products.json` and are visible to all
customers on their next catalog refresh (the app checks for updates
automatically; if a customer is fully offline, they'll see the last-cached
version until they're back online).

## 6. How orders actually work

There's no payment gateway integration - orders are confirmed via WhatsApp:
1. Customer builds their cart, taps Checkout, fills name/phone/address, picks
   COD or UPI.
2. App opens WhatsApp with a pre-filled order message sent to your fixed number.
3. You see the order in WhatsApp and fulfill it, collecting cash or confirming
   UPI payment (they can scan the UPI QR shown in the checkout screen).
4. The order is also logged to `data/orders.json` on your server as a backup
   record (best-effort - if the customer is offline, only the WhatsApp message
   goes through, which is fine since that's the real confirmation channel).

## 7. Performance & offline notes

- No frontend framework - plain HTML/CSS/JS keeps it fast on low-end phones.
- The service worker caches the app shell and category images on first visit,
  so the catalog still loads if a customer opens it with no signal.
- Cart is stored in the browser (`localStorage`) - it survives app restarts on
  the same phone.
- Product images are simple placeholders - replace `public/images/*.png` with
  real product photos when you have them (keep file sizes small, under ~50 KB
  each, for fast loading on slow mobile data).

## 8. Security notes

- Change the default admin password before going live.
- This is intentionally simple (JSON-file storage, no user accounts for
  customers). It's well-suited to a single shop's scale. If you later want
  multiple staff logins, order history search, or analytics, that's a
  natural next upgrade (e.g. swapping the JSON file for a real database).
