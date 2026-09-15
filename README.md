# WeCanFix - On-Demand Handyman Service Booking & Marketplace

A modern, production-grade on-demand service booking and handyman marketplace platform built with **Next.js 14 (App Router)**, **MySQL / MariaDB**, **Firebase Auth / FCM**, and **Tailwind CSS**.

---

## Features

- **Customer Web & Mobile PWA**: Instant booking, slot selection, address picker, real-time tracking, live chat, multi-currency display, coupon/promo codes, and reviews.
- **Provider Dashboard**: Shift schedules, category assignment, order acceptance, interactive location directions, wallet balance & withdrawal requests.
- **Admin Control Panel**: Full CMS, category & service management, pricing rules, tiered volume discounts, visiting charges, SEO management, email/push/WhatsApp notification templates, analytics, and audit logs.
- **Robust Security**: Strict server-side price recalculation, sanitization of sensitive settings/keys, role-based mutation access controls, XSS filtering, and rate-limited endpoints.
- **Multiple Payment Gateways**: Razorpay, Stripe, and Pay After Service (Cash on Delivery).

---

## System Requirements

- **Node.js**: 18.18+ or 20.x LTS
- **Package Manager**: npm 9+ or pnpm
- **Database**: MySQL 8.0+ or MariaDB 10.5+
- **Firebase**: A standard Firebase project for authentication and FCM push notifications

---

## Installation & Setup

### 1. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Open `.env.local` and configure your database and authentication details:
- **MySQL Configuration**:
  ```env
  MYSQL_HOST=localhost
  MYSQL_PORT=3306
  MYSQL_DATABASE=wecanfix_db
  MYSQL_USER=your_db_user
  MYSQL_PASSWORD=your_db_password
  ```
  *(Alternatively, you can provide `DATABASE_URL=mysql://user:pass@host:3306/wecanfix_db`)*

- **Security Secrets**:
  ```env
  INTERNAL_API_SECRET=your_strong_random_secret
  CRON_SECRET=your_strong_cron_secret
  ```

- **Firebase Configuration**:
  Add your `NEXT_PUBLIC_FIREBASE_*` credentials and `FIREBASE_ADMIN_SDK_CONFIG` JSON.

### 3. Initialize the Database
Initialize the database and all 50+ application tables with one command:
```bash
npm run db:init
```
*(Or use `npm run db:setup`)*

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3006](http://localhost:3006) in your browser.

---

## Production Build & Deployment

### Build for Production
```bash
npm run build
npm run start
```

### Deploying to Vercel / Cloud Platforms
1. Connect your repository to Vercel or your hosting platform.
2. In the project settings, add the environment variables defined in `.env.example`.
3. Ensure your MySQL host allows incoming connections from your deployment IPs.
4. Deploy! Database initialization is automatically checked during build.

---

## Scheduled Marketing Cron Jobs
Marketing automation (abandoned cart reminders, booking follow-ups) can be run on a schedule:
- **Endpoint**: `/api/marketing-cron`
- **Authentication**: Pass query param `?secret=YOUR_CRON_SECRET` or header `Authorization: Bearer YOUR_CRON_SECRET`.

---

## Support
For support, inquiries, or bug reports, please contact us through your CodeCanyon / Envato Market profile or email `support@wecanfix.in`.
