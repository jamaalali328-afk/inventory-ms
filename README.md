# Inventory MS — Store / Inventory Management System

Node.js + Express backend, PostgreSQL database, plain HTML/CSS/JS frontend, dark theme, mobile-friendly.

## What changed: now using PostgreSQL (not JSON files)

Data used to live in `data/*.json` files, but those get wiped every time a free hosting service redeploys.
The app now stores everything in a **PostgreSQL database**, which stays intact across redeploys and restarts.
We recommend **Neon.tech** — it has a genuinely free, persistent Postgres tier.

---

## 1. Create your free database (Neon)

1. Go to **https://neon.tech** and sign up (free, no credit card required).
2. Create a new project (any name, e.g. `inventory-ms`).
3. On the project dashboard, find the **Connection string** — it looks like:
   ```
   postgresql://username:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. Copy that whole string — you'll need it in the next steps.

## 2. Run locally (Command Prompt)

1. In the project folder (`store-app`), copy `.env.example` to a new file named `.env`:
   ```
   copy .env.example .env
   ```
2. Open `.env` in Notepad and paste your Neon connection string as `DATABASE_URL`. Also set `JWT_SECRET` to any long random text.
3. Install dependencies:
   ```
   npm install
   ```
4. Start the server:
   ```
   npm start
   ```
   The first time it runs, it automatically creates all the database tables and the default admin account.
5. Open **http://localhost:3000** — log in with:
   ```
   Email:    admin@store.com
   Password: admin123
   ```
   (Change this immediately under Settings → Change Password.)

## 3. Deploy to Render with the new database

1. Push these updated files to your GitHub repo (`server.js`, `db.js`, `package.json`, `.env.example`, `public/`) — replace the old ones.
   **Important:** do NOT upload your real `.env` file to GitHub (it's already excluded via `.gitignore`).
2. In your Render service dashboard, go to **Environment**.
3. Add two Environment Variables:
   - `DATABASE_URL` → your Neon connection string
   - `JWT_SECRET` → a long random string (different from any example)
4. Save, then trigger **Manual Deploy → Deploy latest commit**.
5. Your data will now survive redeploys, restarts, and free-tier sleep cycles — it's only ever wiped if you delete the Neon project itself.

## 4. New: Bulk Import for Products

Go to **Products → Import List**. Paste a list of products (each as `[CODE] Name` followed by quantity on the next line,
or just plain `Name` followed by quantity). Set a category and unit type to apply to the whole batch, click **Preview**,
check the list (products missing a code are flagged and get an auto-generated placeholder code you can edit later), then
click **Import All**.

---

## Fudud (Somali summary)

1. Tag **neon.tech**, samee account bilaash ah, samee project, ka koobiyeeye **connection string**-ka.
2. Folder-ka `store-app`, koobiyeeye `.env.example` una beddel magac `.env`, ku dhex geli connection string-kaaga iyo `JWT_SECRET` (qoraal random ah).
3. `npm install` kadibna `npm start`.
4. Marka aad publish-gareyso Render, ku dar labadaas variable ee `DATABASE_URL` iyo `JWT_SECRET` qeybta **Environment** ee Render dashboard-ka, kadibna **Manual Deploy**.
5. Xogtaadu hadda **ma tirtirmi doonto** marnaba redeploy — waxay ku jirtaa Neon database-ka, mana aha disk-ka Render ee ku meel gaadhka ah.
6. **Import List** (Products bogga) — ku dar boqolaal alaab hal mar, adigoo copy/paste garaynaya liiska.
