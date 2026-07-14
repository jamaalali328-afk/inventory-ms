# Inventory MS — Store / Inventory Management System

A full-featured store/inventory management system built with **Node.js + Express** (backend) and **plain HTML/CSS/JavaScript** (frontend), using **JSON files** for data storage (no database server required).

## Features
- Dashboard with stock stats, low-stock alerts, top products, fast/medium/slow moving classification
- Products (add/edit/delete, search, category filter)
- Stock In / Stock Out (with automatic quantity updates)
- Sales (multi-item sale, auto stock deduction)
- Customers
- Analytics (fast/medium/slow moving, low stock tabs)
- Reports (daily/weekly/monthly/stock in/stock out/fast/slow/low stock) with CSV and printable PDF export
- Item Lookup (combined Stock In + Stock Out history for any product, 1/3/6 month range)
- Branch & Department management (feeds the Stock Out "destination" dropdown dynamically)
- Login/Logout with protected routes (JWT), admin can create new users
- Dark theme (default) + light theme toggle, mobile-friendly layout

---

## 1. Requirements

- **Node.js** version 18 or newer (includes `npm`). Download from https://nodejs.org if you don't have it.

Check your version in Command Prompt / Terminal:
```
node --version
npm --version
```

## 2. Install & Run (Command Prompt)

1. Open Command Prompt (or Terminal) and go into the project folder:
   ```
   cd path\to\store-app
   ```
2. Install dependencies (only needed once, or whenever dependencies change):
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. You'll see:
   ```
   Inventory MS server running at http://localhost:3000
   Default login -> email: admin@store.com | password: admin123
   ```
5. Open **http://localhost:3000** in your browser.

## 3. Default Login

```
Email:    admin@store.com
Password: admin123
```
Log in, then go to **Settings → Users** to create additional staff/admin accounts.

## 4. Where your data lives

All data is stored as JSON files inside the `data/` folder:
- `data/products.json`, `data/stockin.json`, `data/stockout.json`, `data/sales.json`,
  `data/customers.json`, `data/branches.json`, `data/users.json`, `data/settings.json`

Back up this folder to back up your entire store's data. No external database needed.

## 5. Changing the port

By default the app runs on port 3000. To use a different port:
```
set PORT=5000 && npm start        (Windows cmd)
$env:PORT=5000; npm start         (PowerShell)
PORT=5000 npm start               (Mac/Linux)
```

## 6. Publishing / going live (deployment)

This app can be deployed to any host that runs Node.js. A few common, low-cost options:

- **Render.com** or **Railway.app** — connect your GitHub repo, they auto-detect Node.js and run `npm install && npm start`. Free/cheap tiers available.
- **A VPS (DigitalOcean, Hetzner, etc.)** — install Node.js, copy this folder, run with a process manager like `pm2` so it stays running (`pm2 start server.js`), and put Nginx in front for a custom domain + HTTPS.
- **cPanel hosting with Node.js support** — many shared hosts now offer a "Setup Node.js App" option in cPanel.

Whichever you choose, remember to:
1. Set a strong, secret value for `JWT_SECRET` (as an environment variable) instead of the default placeholder in `server.js`.
2. Change the default admin password immediately after first login.
3. Keep the `data/` folder on persistent storage (some free hosts wipe disks on redeploy — check this before relying on it for real data).

---

## Fudud (Somali summary)

1. Rakib **Node.js** (nodejs.org) haddaanad horey u lahayn.
2. Command Prompt fur, u gudub folder-ka `store-app`.
3. Ku qor: `npm install` (hal mar oo keliya u baahan tahay).
4. Ku qor: `npm start` si aad u bilowdo server-ka.
5. Browser-ka ku fur: `http://localhost:3000`
6. Isticmaal: `admin@store.com` / `admin123` si aad u gasho.
7. Marka aad diyaar u tahay in aad **publish** gareyso (internet-ka ku dhig), waxaad u baahan tahay hosting Node.js taageerta sida Render.com, Railway.app, ama VPS. Waan kaa caawin karaa tallaabo-tallaabo marka aad diyaar tahay.
