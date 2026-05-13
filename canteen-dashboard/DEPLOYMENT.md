# Canteen Dashboard — Deployment Guide

A step-by-step guide to deploying the Canteen Dashboard on any Linux server or Windows machine using Docker Compose.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | v2 (plugin) | Bundled with Docker Desktop |
| Node.js | 20+ | Only needed to build the frontend |
| Git | any | To clone the repo |

---

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/canteen-dashboard.git
cd canteen-dashboard
```

---

## 2. Build the Frontend

The Docker image expects a pre-built `dist/` folder. Build it once on any machine:

```bash
# Install frontend dev dependencies
npm install

# Build production bundle (outputs to ./dist/)
npm run build
```

> **Windows PowerShell:**
> ```powershell
> npm install
> npm run build
> ```

You should now see a `dist/` directory with `index.html` and hashed JS/CSS assets.

---

## 3. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set:

```dotenv
# ── Required ──────────────────────────────────────────────────────────────────
PORT=3001

# Generate a strong secret:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET

# Comma-separated list of allowed frontend origins
ALLOWED_ORIGINS=http://your-server-ip,https://your-domain.com

# ── Email Alerts (optional) ───────────────────────────────────────────────────
# Leave blank to disable price-spike email alerts.
# Gmail: use an App Password (not your login password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL_TO=manager@yourcompany.com

# ── Default User Passwords ────────────────────────────────────────────────────
# These are used only for initial database seeding. CHANGE THEM IMMEDIATELY after first login!
DEFAULT_ADMIN_PASSWORD=secureAdminPass123!
DEFAULT_STAFF_PASSWORD=secureStaffPass123!
```

> **Security note:** Never commit `server/.env` to version control. It is listed in `.gitignore`.

---

## 4. Start with Docker Compose

```bash
docker compose up -d
```

This starts two containers:

| Container | Role | Port |
|-----------|------|------|
| `canteen-backend` | Node.js / Express / SQLite | 3001 (internal) |
| `canteen-frontend` | nginx serving `dist/` | **80** (public) |

The frontend container proxies all `/api/*` requests to the backend automatically.

**Verify both containers are running:**

```bash
docker compose ps
```

Expected output:
```
NAME                STATUS          PORTS
canteen-backend     Up              0.0.0.0:3001->3001/tcp
canteen-frontend    Up              0.0.0.0:80->80/tcp
```

Open your browser at `http://your-server-ip` — you should see the login page.

---

## 5. First Login & Admin Setup

The default accounts are created automatically on first start:

| Username | Role | Password |
|----------|------|----------|
| `admin` | Admin | From `DEFAULT_ADMIN_PASSWORD` env var |
| `staff` | Staff | From `DEFAULT_STAFF_PASSWORD` env var |

**⚠️ Change the default passwords immediately** via Settings → Users after logging in.

As admin, you can:
- Create additional users
- Configure vendors, categories, and items
- Set up budgets and alerts

---

## 6. Seed Master Data (Optional)

Pre-load 10 vendors and 62 standard canteen items:

```bash
docker compose exec backend node server/seed.js
```

This is safe to run multiple times — it uses `INSERT OR IGNORE`.

---

## 7. Data Persistence

SQLite database and backups are stored in named Docker volumes:

| Volume | Contents |
|--------|----------|
| `canteen-db` | `canteen.db` — all purchases, users, budgets |
| `canteen-data` | `backups/` — timestamped JSON backup files |

**Volumes survive container restarts and updates.** To back up manually:

```bash
docker compose exec backend node server/backup.js
# or
docker cp canteen-backend:/app/server/canteen.db ./canteen-backup-$(date +%F).db
```

---

## 8. Updating the Application

```bash
# 1. Pull latest code
git pull

# 2. Rebuild frontend
npm run build

# 3. Rebuild and restart containers
docker compose up -d --build
```

---

## 9. HTTPS / SSL (Production)

For HTTPS, place a reverse proxy (Nginx or Caddy) in front on the host machine, or add a Certbot container to the Compose file.

**Quick Caddy example** (add to `docker-compose.yml`):

```yaml
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    networks:
      - canteen-net
```

`Caddyfile`:
```
your-domain.com {
    reverse_proxy frontend:80
}
```

---

## 10. Logs and Troubleshooting

```bash
# Live logs from both containers
docker compose logs -f

# Backend logs only
docker compose logs -f backend

# Frontend (nginx) logs only
docker compose logs -f frontend

# Restart a single container
docker compose restart backend
```

**Common issues:**

| Symptom | Fix |
|---------|-----|
| Blank page / 502 Bad Gateway | Backend not started yet — wait 5 s and refresh |
| `JWT_SECRET not set` error | Ensure `server/.env` exists with a non-empty `JWT_SECRET` |
| API calls return 404 | Check `ALLOWED_ORIGINS` includes your frontend URL |
| Email alerts not sending | Verify SMTP credentials; Gmail requires an App Password |
| Database locked error | Only one backend instance should run — check for duplicate containers |

---

## 11. Running Without Docker (Development)

```bash
# Terminal 1 — Backend
cd server
npm install
node index.js

# Terminal 2 — Frontend dev server
npm install        # from repo root
npm run dev        # starts Vite on http://localhost:5173
```

---

## File Structure Reference

```
canteen-dashboard/
├── dist/                  # Built frontend (generated by npm run build)
├── server/
│   ├── index.js           # Express app entry point
│   ├── db.js              # SQLite schema + connection
│   ├── seed.js            # One-time master data seeder
│   ├── .env               # Your secrets (never commit)
│   └── .env.example       # Template
├── js/                    # Frontend ES modules
├── css/                   # Styles
├── index.html             # SPA entry point
├── Dockerfile             # Node 20 Alpine image
├── docker-compose.yml     # Two-service orchestration
├── nginx.conf             # SPA routing + API proxy
└── executive-overview.html # Printable A4 executive summary
```

---

*Generated for Canteen Dashboard v1.0 — May 2026*
