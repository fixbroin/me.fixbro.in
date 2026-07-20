# 🚀 VPS Setup & Production Deployment Guide (Ubuntu / Debian / Hostinger VPS)

This guide covers complete step-by-step setup of **MySQL Server**, **Node.js**, **Nginx Reverse Proxy**, **SSL Certificates**, and **PM2 Process Manager** on an Ubuntu/Debian VPS.

---

## 📋 Prerequisites
- A VPS running **Ubuntu 20.04 / 22.04 LTS** or **Debian 11/12**.
- SSH access as `root` or a user with `sudo` privileges.
- A domain name (e.g. `fixbro.in`) pointed to your VPS IP address.

---

## 🛠️ Step 1: Update Server & Install Node.js, PM2, and Nginx

Connect to your VPS via SSH and run:

```bash
# 1. Update package list and system packages
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git build-essential

# 3. Verify installations
node -v
npm -v

# 4. Install PM2 globally for background process management
sudo npm install -g pm2
```

---

## 🗄️ Step 2: Install & Secure MySQL Server

```bash
# 1. Install MySQL Server
sudo apt install -y mysql-server

# 2. Start and enable MySQL service
sudo systemctl start mysql
sudo systemctl enable mysql

# 3. Secure MySQL installation (optional)
sudo mysql_secure_installation
```

---

## 🔑 Step 3: Create Production MySQL Database & User

Open the MySQL command line interface:

```bash
sudo mysql
```

Run the following SQL commands:

```sql
-- 1. Create Production Database
CREATE DATABASE fixbro_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create MySQL User with a Strong Password
CREATE USER 'fixbro_user'@'localhost' IDENTIFIED BY 'SuperStrongPassword123!';

-- 3. Grant full permissions to the user on fixbro_db
GRANT ALL PRIVILEGES ON fixbro_db.* TO 'fixbro_user'@'localhost';

-- 4. Apply privileges and exit
FLUSH PRIVILEGES;
EXIT;
```

---

## 📁 Step 4: Clone & Build Your Next.js Application

```bash
# 1. Navigate to /var/www
cd /var/www

# 2. Clone your project (or upload files)
git clone <YOUR_GIT_REPOSITORY_URL> fixbro
cd fixbro

# 3. Create .env file for production
nano .env
```

Paste the following production configuration inside `.env`:

```env
# Production Environment Variables
NODE_ENV=production
PORT=3001

# Local MySQL Database credentials on VPS
MYSQL_HOST=localhost
MYSQL_USER=fixbro_user
MYSQL_PASSWORD=SuperStrongPassword123!
MYSQL_DATABASE=fixbro_db
MYSQL_PORT=3306
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=fixbro_db
DB_USER=fixbro_user
DB_PASSWORD=SuperStrongPassword123!

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

```bash
# 4. Install dependencies
npm install

# 5. Build Next.js Production App
npm run build
```

---

## ⚙️ Step 5: Start Application with PM2

```bash
# Start standalone Next.js server with PM2
pm2 start .next/standalone/server.js --name "fixbro-web"

# Save PM2 process list and configure auto-start on server reboot
pm2 save
pm2 startup
```

*(Run the command outputted by `pm2 startup` to enable boot auto-start)*.

---

## 🌐 Step 6: Configure Nginx Reverse Proxy & SSL (HTTPS)

```bash
# 1. Create Nginx site configuration
sudo nano /etc/nginx/sites-available/fixbro
```

Paste the following Nginx reverse proxy configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

```bash
# 2. Enable site configuration and test Nginx syntax
sudo ln -s /etc/nginx/sites-available/fixbro /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 3. Install Certbot for Free Let's Encrypt SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🎉 Step 7: Verify Everything is Working

1. Open `https://yourdomain.com` in your browser.
2. Log into Admin Panel at `https://yourdomain.com/admin/database-tools`.
3. Check status commands:
   - Check PM2 status: `pm2 status`
   - Check PM2 logs: `pm2 logs fixbro-web`
   - Check MySQL status: `sudo systemctl status mysql`

Your Next.js website and MySQL database are now running on your VPS with SSL, PM2 process management, and maximum security!
