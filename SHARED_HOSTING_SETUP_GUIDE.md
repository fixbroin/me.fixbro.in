# 🌐 Shared Hosting Setup & Database Guide (Hostinger / cPanel / hPanel)

This guide explains step-by-step how to set up your **MySQL Database** and deploy or connect your **Next.js Web Application** using Shared Hosting (Hostinger hPanel or cPanel).

---

## 📌 Option A: Deploying Next.js on Vercel / Render & Connecting Hostinger Shared MySQL

If your web app is hosted on Vercel or Render and you use Hostinger Shared Hosting for your MySQL database:

### Step 1: Create MySQL Database in Hostinger hPanel
1. Log into your **Hostinger hPanel**.
2. Navigate to **Databases** ➔ **MySQL Databases**.
3. Create a new database:
   - **Database Name**: `u205953244_web` (or any database name)
   - **MySQL Username**: `u205953244_web`
   - **Password**: Create a strong password (e.g. `*Sri5565`)
4. Click **Create**.

### Step 2: Enable Remote MySQL Access in Hostinger
1. In hPanel, go to **Databases** ➔ **Remote MySQL**.
2. Under **IP (IPv4 or IPv6)**, check the box **"Any Host (% )"** OR enter your Vercel deployment IP.
3. Select your Database (`u205953244_web`).
4. Click **Create**.
   *(Note down Hostinger DB Host: e.g., `srv841.hstgr.io` or IP `82.25.121.154`)*

### Step 3: Configure Environment Variables in Vercel / Render
In your Vercel / Render Project Settings ➔ **Environment Variables**, add:

```env
MYSQL_HOST=srv841.hstgr.io (or 82.25.121.154)
MYSQL_USER=u205953244_web
MYSQL_PASSWORD=YourPasswordHere
MYSQL_DATABASE=u205953244_web
MYSQL_PORT=3306
```

### Step 4: Run Initial Migration
1. Open your deployed website Admin Panel at `/admin/database-tools`.
2. Click **Migrate Firebase to MySQL** (or run automatic database initialization).
3. All 39 tables will be automatically created with standardized JSON document schemas!

---

## 📌 Option B: Running Next.js Directly on Hostinger Shared Hosting Node.js Application Runner

If Hostinger Shared Hosting includes the **Node.js App** feature:

### Step 1: Create Database locally in Hostinger
1. Create Database & User in Hostinger hPanel (**MySQL Databases**).
2. Since Next.js runs on the same server, set environment variables to:

```env
MYSQL_HOST=localhost
MYSQL_USER=u205953244_web
MYSQL_PASSWORD=YourPasswordHere
MYSQL_DATABASE=u205953244_web
MYSQL_PORT=3306
```

### Step 2: Build & Upload Standalone Next.js App
1. On your local machine, run:
   ```bash
   npm run build
   ```
2. Compress and upload the `.next/standalone` folder and `public/` directory into your Hostinger `public_html` or Node.js app directory.
3. Start the application runner:
   ```bash
   npm run start
   ```

---

## ✅ Verification
1. Visit your domain `https://yourdomain.com`.
2. Open `/admin/database-tools` to verify database health status.
3. Test creating a booking or service to confirm 0-latency MySQL operations!
