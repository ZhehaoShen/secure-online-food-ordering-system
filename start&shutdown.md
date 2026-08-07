# Project Environment Setup, Startup, and Shutdown Guide

This document provides step-by-step commands to run, backup, restore, and shut down the **Northstar Kitchen** food ordering application on **macOS** (Primary Local Environment) and native **Windows PowerShell** (Fresh Clone Environment).

---

## 1. Primary Local Environment — macOS

### 1.1 Prerequisites
- **Node.js**: `>= 24.18.0` (Verify with `node -v`)
- **PostgreSQL**: Version 14 or higher installed via Homebrew (`brew install postgresql@16`)

### 1.2 PostgreSQL Service Startup
```bash
brew services start postgresql@16
```
*(Or start manually: `pg_ctl -D /usr/local/var/postgres start`)*

Create the local PostgreSQL database:
```bash
createdb food_ordering_dev
```

### 1.3 Environment File Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains valid credentials:
```ini
NODE_ENV=development
HOST=127.0.0.1
PORT=3000

DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=food_ordering_dev
DATABASE_USER=food_ordering_app
DATABASE_PASSWORD=your_secure_app_password

MIGRATION_DATABASE_USER=food_ordering_migrator
MIGRATION_DATABASE_PASSWORD=your_secure_migration_password

SESSION_SECRET=a_random_secret_string_at_least_32_chars_long
```

### 1.4 Install Dependencies
```bash
npm ci --ignore-scripts
```

### 1.5 Database Roles, Migration & Seed Setup
```bash
# 1. Create database roles (requires PostgreSQL superuser or schema owner)
npm run db:roles

# 2. Run database migrations (tables & indexes)
npm run db:migrate

# 3. Seed fictional demonstration data
npm run db:seed
```

### 1.6 Secure Application Startup
Start the secure application in development mode:
```bash
npm start
```
- Access Secure Web Application: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Healthcheck Endpoint: [http://127.0.0.1:3000/health](http://127.0.0.1:3000/health)

### 1.7 Isolated Vulnerable Demo Startup (Local-Only Educational Version)
In a separate terminal window:
```bash
# Initialize vulnerable demo environment & data
npm run demo:vulnerable:setup

# Start isolated local-only vulnerable demo
npm run demo:vulnerable:start
```
- Access Isolated Vulnerable Demo: [http://127.0.0.1:3001](http://127.0.0.1:3001)

### 1.8 Database Backup and Restore
```bash
# Create a timestamped backup in backups/
npm run db:backup

# Restore a backup into the active database
npm run db:restore -- backups/food-ordering-2026-08-07T12-00-00.000Z.dump

# Restore into a separate test database (recommended for verification)
npm run db:restore -- backups/food-ordering-2026-08-07T12-00-00.000Z.dump food_ordering_test
```

### 1.9 Shutdown
```bash
# Graceful application shutdown
npm run shutdown

# Stop PostgreSQL service if needed
brew services stop postgresql@16
```

---

## 2. Windows Environment — Native Windows PowerShell (No WSL Required)

*(Note: All commands must be executed in a standard native Windows PowerShell terminal. Do NOT use WSL, Git Bash, or Cygwin.)*

### 2.1 Fresh GitHub Clone & Preparation
```powershell
git clone https://github.com/ZhehaoShen/secure-online-food-ordering-system.git
cd secure-online-food-ordering-system
```

### 2.2 Prerequisites & PostgreSQL Service Setup
- Install Node.js `v24.x` for Windows.
- Install PostgreSQL for Windows (e.g. PostgreSQL 16 installer from EnterpriseDB).
- Ensure PostgreSQL service is running:
```powershell
Get-Service -Name "postgresql*"
```
If not running, start the PostgreSQL service:
```powershell
Start-Service -Name "postgresql-x64-16"
```

Create the target database in PowerShell using `createdb.exe` or `psql.exe`:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres food_ordering_dev
```

### 2.3 Environment File Configuration
Copy the example environment file in PowerShell:
```powershell
Copy-Item .env.example .env
```
Edit `.env` using Notepad or PowerShell:
```powershell
notepad .env
```

### 2.4 Install Dependencies
```powershell
npm ci --ignore-scripts
```

### 2.5 Database Migration & Seed
Ensure `POSTGRES_BIN` environment variable is set if `psql` is not on your System PATH:
```powershell
$env:POSTGRES_BIN="C:\Program Files\PostgreSQL\16\bin"
```

Execute database setup tasks:
```powershell
# 1. Run roles setup
npm run db:roles

# 2. Run migrations
npm run db:migrate

# 3. Seed data
npm run db:seed
```

### 2.6 Application Startup
```powershell
npm start
```
- Open browser to: [http://127.0.0.1:3000](http://127.0.0.1:3000)

### 2.7 Database Backup and Restore in PowerShell
```powershell
# Backup database
npm run db:backup

# Restore database
npm run db:restore -- backups\food-ordering-2026-08-07T12-00-00.000Z.dump
```

### 2.8 Shutdown
```powershell
# Stop Node.js application
npm run shutdown
```
*(Or press `Ctrl + C` in the PowerShell window)*
