# ☁️ FixBro Dual Media Storage & Remote Shared Hosting Guide

This guide explains how to use your **Shared Hosting server** to store and serve all website images while running your **Next.js Website & MySQL Database on a VPS**.

---

## 🎯 Overview

Your website supports **Dual Storage Drivers**:
1. **Local VPS Storage (`local`)**: Stores images directly on your VPS SSD disk (`/public/uploads/`).
2. **Remote Shared Hosting Storage (`remote`)**: Automatically uploads images to a Shared Hosting subdomain (e.g., `https://media.fixbro.in/uploads/...`), saving VPS disk space and bandwidth!

---

## 🛠️ Step 1: Set Up Shared Hosting Subdomain

1. Log into your **Hostinger / Shared Hosting hPanel**.
2. Go to **Domains** -> **Subdomains**.
3. Create a new subdomain: `media` (e.g., `media.fixbro.in` or `img.fixbro.in`).
4. Ensure SSL (HTTPS) is active for `media.fixbro.in`.

---

## 📄 Step 2: Upload `upload.php` to Shared Hosting

1. Open File Manager for your new subdomain `media.fixbro.in` (located at `/public_html/` or `/media.fixbro.in/public_html/`).
2. Copy the file `SHARED_HOSTING_MEDIA_UPLOAD_SCRIPT.php` from your project root.
3. Upload it to the subdomain root and rename it to **`upload.php`**.
4. Open `upload.php` in a text editor and update these 2 lines:

```php
// 1. SET YOUR SECRET KEY (Must match the Secret Key in Admin Panel)
define('SECRET_KEY', 'your_custom_secret_key_123');

// 2. SET YOUR SUBDOMAIN PUBLIC BASE URL (No trailing slash)
define('MEDIA_BASE_URL', 'https://media.fixbro.in');
```

---

## 🎛️ Step 3: Configure Admin Panel

1. Open your Admin Panel: `https://your-domain.com/admin/web-settings`.
2. Click the **Media Storage** tab.
3. Select **Remote Shared Hosting Server**.
4. Fill in the configuration fields:
   - **Remote Upload Script URL**: `https://media.fixbro.in/upload.php`
   - **Security Secret Key**: `your_custom_secret_key_123`
5. Click **Save Storage Settings**.

---

## 🔒 Security & Features

- **Secret Key Protection**: The PHP script rejects unauthorized requests (`403 Forbidden`) if the secret key header (`x-api-secret`) is missing or invalid.
- **Client-Side Compression**: Images are compressed in the browser before upload (< 1.5MB max size, 1920px max dimension).
- **Automatic Fallback**: If the remote Shared Hosting server is ever unreachable, the system automatically falls back to local VPS storage so uploads never fail!

---

## ✅ Verification Checklist

- [ ] Upload an image in `/admin/image-gallery` or `/admin/categories`.
- [ ] Inspect the returned image URL (It should start with `https://media.fixbro.in/uploads/...`).
- [ ] Verify the image loads on the live website.
