================================================================================
WeCanFix - On-Demand Handyman Service Booking & Marketplace
Next.js 14 (App Router) + MySQL / MariaDB + Firebase Admin
================================================================================

Thank you for purchasing WeCanFix! This document guides you through installing,
configuring, and running your application smoothly.

--------------------------------------------------------------------------------
1. SYSTEM REQUIREMENTS
--------------------------------------------------------------------------------
- Node.js: 18.18+ or 20.x (LTS recommended)
- Package Manager: npm 9+ or pnpm or yarn
- Database: MySQL 8.0+ or MariaDB 10.5+
- Firebase: Free-tier Firebase project (for Auth & Push Notifications)

--------------------------------------------------------------------------------
2. QUICK START INSTALLATION
--------------------------------------------------------------------------------

STEP 1: Extract and Open Project Folder
   Open your terminal in the extracted root directory:
   cd "wecanfix"

STEP 2: Install Dependencies
   Run:
   npm install --legacy-peer-deps

STEP 3: Configure Environment Variables
   Copy the provided template:
   cp .env.example .env.local
   (On Windows Command Prompt: copy .env.example .env.local)

   Open .env.local in a text editor and fill in your details:
   - MySQL Database:
     MYSQL_HOST=localhost
     MYSQL_PORT=3306
     MYSQL_DATABASE=wecanfix_db
     MYSQL_USER=your_mysql_username
     MYSQL_PASSWORD=your_mysql_password
     (Alternatively, you can set DATABASE_URL=mysql://user:pass@host:3306/db)

   - Security Secrets:
     INTERNAL_API_SECRET=choose_a_strong_random_secret_string
     CRON_SECRET=choose_a_strong_cron_secret

   - Firebase Configuration:
     Add your Firebase web config keys (NEXT_PUBLIC_FIREBASE_*) and service
     account JSON (FIREBASE_ADMIN_SDK_CONFIG).

STEP 4: Initialize the Database
   Create the database schema and all 50+ application tables with one command:
   npm run db:init
   (or npm run db:setup)

   This script will automatically create the database if it doesn't exist and
   provision all required tables and indexes.

STEP 5: Start Development Server
   npm run dev

   Open your browser at:
   http://localhost:3006

--------------------------------------------------------------------------------
3. PRODUCTION BUILD & DEPLOYMENT
--------------------------------------------------------------------------------
To compile and start for production:
   npm run build
   npm run start

For Vercel / Cloud Hosting deployment:
   1. Import the repository into your Vercel / host dashboard.
   2. Add all environment variables from .env.local in Project Settings.
   3. Ensure your MySQL server allows remote connections from your host IP/subnet.
   4. Trigger deployment. The build process automatically verifies the database.

--------------------------------------------------------------------------------
4. CRON JOB CONFIGURATION (Marketing Automation)
--------------------------------------------------------------------------------
WeCanFix features automated marketing reminders for abandoned carts, no-booking
prompts, and re-engagement.
To trigger the marketing cron automatically:
   URL: https://yourdomain.com/api/marketing-cron?secret=YOUR_CRON_SECRET
   Or pass header: Authorization: Bearer YOUR_CRON_SECRET

On Vercel, this is pre-configured via vercel.json. Ensure CRON_SECRET is set
in your Vercel environment variables.

--------------------------------------------------------------------------------
5. SECURITY & BEST PRACTICES
--------------------------------------------------------------------------------
- Never commit your .env or .env.local files to public Git repositories.
- Keep INTERNAL_API_SECRET and CRON_SECRET confidential.
- Configure payment secrets (Razorpay / Stripe) securely via the Admin Panel
  (Settings -> Payment Configuration) or via server-side environment variables.
- All database mutation endpoints, financial balances, and booking amounts are
  strictly verified server-side.

--------------------------------------------------------------------------------
6. SUPPORT & ASSISTANCE
--------------------------------------------------------------------------------
For questions, support, or custom modifications, please reach out via your
CodeCanyon / Envato profile page or email support@wecanfix.in.
