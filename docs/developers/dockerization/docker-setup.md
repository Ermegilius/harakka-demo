# Docker Setup Guide

This guide explains how to build, run, and deploy the Harakka Storage & Booking application using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Docker Architecture](#docker-architecture)
- [Environment Variables](#environment-variables)
- [Building and Running](#building-and-running)
- [Configuration Details](#configuration-details)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux) v20.10+
- **Docker Compose** v2.0+
- **Git** for version control

### Verify Installation

```bash
docker --version
docker-compose --version
```

---

## Project Structure

```
harakka-demo/
├── backend/
│   ├── Dockerfile              # Backend container definition
│   ├── src/                    # NestJS source code
│   └── package.json
├── frontend/
│   ├── Dockerfile              # Frontend container definition
│   ├── nginx.conf              # Nginx server configuration
│   ├── src/                    # React source code
│   └── package.json
├── common/
│   ├── package.json            # Shared types and utilities
│   └── index.ts
├── docker-compose.yml          # Multi-container orchestration
├── .env.local                  # Environment variables (DO NOT COMMIT)
└── .dockerignore               # Files to exclude from build
```

---

## Docker Architecture

### Overview

The application uses a **multi-stage build** approach with two services:

1. **Backend Service** (NestJS)

   - Built with `node:22-alpine3.22`
   - Runs on port `3000`
   - Uses non-root user for security
   - Health checks enabled

2. **Frontend Service** (React + Vite)
   - Built with `node:22-alpine`
   - Served by `nginx:1.29-alpine`
   - Runs on port `5180` (maps to container port `80`)
   - API requests proxied to backend

### Network Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (localhost:5180)                   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Frontend Container (Nginx)                 │
│  - Serves React SPA                         │
│  - Proxies /api/* to backend                │
└──────────────┬──────────────────────────────┘
               │ Docker Network
               ▼
┌─────────────────────────────────────────────┐
│  Backend Container (NestJS)                 │
│  - REST API                                 │
│  - Connects to Supabase                     │
└─────────────────────────────────────────────┘
```

---

## Environment Variables

### Setup `.env.local`

Create `.env.local` in the project root with these **fully expanded** values:

```bash
# Supabase Configuration
SUPABASE_PROJECT_ID=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_JWT_SECRET=...
SUPABASE_DB_PASSWORD=...
# Backend Configuration
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5180

# Frontend Configuration (must be fully expanded, no ${VAR} syntax)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://127.0.0.1:3000

# S3 Configuration
SUPABASE_STORAGE_URL=https://rcbddkhvysexkvgqpcud.supabase.co/storage/v1/s3

# Email Configuration
STORAGE_EMAIL=your-email@gmail.com
STORAGE_EMAIL_PASSWORD=your-app-password

# Cron Configuration
CRON_SECRET=your-cron-secret
CRON_URL=https://your-backend-url.com/cron/reminders/run
```

### ⚠️ Important Notes

1. **No Variable Expansion**: Docker Compose does NOT expand variables like `${VAR}` in `.env.local` files
2. **Use Fully Expanded Values**: Replace all `${VARIABLE}` references with actual values
3. **Git Security**: Add `.env.local` to `.gitignore` (already done)
4. **Build-time vs Runtime**:
   - Backend: Uses `.env.local` at **runtime**
   - Frontend: Uses ARGs at **build time** (embedded into bundle)

---

## Building and Running

### Quick Start

```bash
# Build all services
docker-compose build

# Start all services (foreground)
docker-compose up

# Start all services (background)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Individual Service Management

```bash
# Build specific service
docker-compose build backend
docker-compose build frontend

# Start specific service
docker-compose up backend
docker-compose up frontend

# Rebuild and start
docker-compose up --build frontend

# Force clean rebuild
docker-compose build --no-cache frontend
```

### Common Commands

```bash
# Check service status
docker-compose ps

# View logs for specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Execute command in running container
docker-compose exec backend sh
docker-compose exec frontend sh

# Restart services
docker-compose restart

# Stop and remove containers, networks, volumes
docker-compose down -v

# View resource usage
docker stats
```

---

## Configuration Details

### Backend Dockerfile

**Key Features:**

- **Multi-stage build**: Separate builder and production stages
- **Security**: Non-root user (`nestjs:nodejs`)
- **Health checks**: `/health` endpoint monitoring
- **Signal handling**: Uses `dumb-init` for proper process management
- **Layer caching**: Optimized for faster rebuilds

**Build Output:** `dist/backend/src/main.js`

### Frontend Dockerfile

**Key Features:**

- **Build arguments**: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **TypeScript compilation**: Full type checking during build
- **Nginx serving**: Production-grade static file serving
- **API proxying**: `/api/*` requests forwarded to backend
- **SPA routing**: All routes fallback to `index.html`

**Build Output:** `dist/` (static files)

### Nginx Configuration

The `frontend/nginx.conf` is a **server block only** configuration:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://harakka-backend:3000;
        # ... proxy headers
    }

    # Health check
    location /health {
        return 200 "OK\n";
    }

    # Static asset caching
    location ~* \.(js|css|png|jpg|...)$ {
        expires 1y;
    }
}
```

**Why server block only?**

- The nginx Docker image already has a main config with `events{}` and `http{}`
- Files in `/etc/nginx/conf.d/` are included inside the `http{}` block
- Including `events{}` or `http{}` in your config causes errors

---

## Troubleshooting

### Backend Issues

#### Cannot find module '/app/dist/main.js'

**Cause:** Build output path mismatch

**Solution:** Verify the CMD in [`backend/Dockerfile`](../../../backend/Dockerfile):

```dockerfile
CMD ["node", "dist/backend/src/main.js"]
```

Check actual build output:

```bash
docker build -f backend/Dockerfile --target builder -t test-backend .
docker run --rm test-backend sh -c "find /app -name 'main.js'"
```

#### Supabase environment variables missing

**Cause:** Variables not loaded or contain unexpanded references

**Solution:**

1. Ensure `.env.local` has fully expanded values (no `${VAR}`)
2. Verify `env_file` is specified in `docker-compose.yml`
3. Check logs for actual values:

```bash
docker-compose exec backend env | grep SUPABASE
```

### Frontend Issues

#### Blank page: "supabaseUrl is required"

**Cause:** Vite environment variables not embedded during build

**Solution:**

1. Ensure build ARGs are passed in `docker-compose.yml`:

```yaml
frontend:
  build:
    args:
      VITE_API_URL: http://localhost:5180/api
      VITE_SUPABASE_URL: https://your-project.supabase.co
      VITE_SUPABASE_ANON_KEY: ...
```

2. Verify ENV variables are set before build in [`frontend/Dockerfile`](../../../frontend/Dockerfile):

```dockerfile
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
```

3. Rebuild with `--no-cache`:

```bash
docker-compose build --no-cache frontend
```

#### Nginx: "events" directive not allowed here

**Cause:** `nginx.conf` contains full config structure instead of server block only

**Solution:** Remove `events{}` and `http{}` wrappers from `frontend/nginx.conf`

#### Network connection errors

**Cause:** Services can't communicate

**Solution:**

1. Verify services are on same network:

```bash
docker network inspect harakka-demo_harakka-network
```

2. Check service names match:

   - Backend container: `harakka-backend`
   - Frontend proxy: `proxy_pass http://harakka-backend:3000;`

3. Test connectivity:

```bash
docker-compose exec frontend ping harakka-backend
```

### General Issues

#### Build fails with npm network errors

**Solution:**

```bash
# Retry the build
docker-compose build frontend

# Use --no-cache to force fresh build
docker-compose build --no-cache frontend

# Add retry logic to Dockerfile
RUN npm install --fetch-retries=5
```

#### Port already in use

**Solution:**

```bash
# Find process using port
lsof -i :3000    # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Map to different host port
```

#### Docker daemon not running

**Solution:**

- **Windows/Mac:** Start Docker Desktop
- **Linux:** `sudo systemctl start docker`

---

## Security Best Practices

### DO ✅

- Use `.env.local` for secrets (never commit)
- Use non-root users in containers
- Enable health checks
- Use specific image versions (not `latest`)
- Scan images for vulnerabilities: `docker scan harakka-backend`
- Implement proper CORS policies
- Use HTTPS in production

### DON'T ❌

- Don't commit `.env.local` to git
- Don't hardcode secrets in Dockerfiles
- Don't run containers as root
- Don't expose unnecessary ports
- Don't use `latest` tags in production
- Don't store secrets in `docker-compose.yml`

---

## Access Points

After running `docker-compose up`:

- **Frontend:** http://localhost:5180
- **Backend API:** http://localhost:3000
- **Backend Health:** http://localhost:3000/health
- **Frontend Health:** http://localhost:5180/health <!-- TODO: configure later -->
- **API via Proxy:** http://localhost:5180/api/\*

---

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Configuration Guide](https://nginx.org/en/docs/)
- [NestJS Docker Guide](https://docs.nestjs.com/recipes/docker)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

---

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Docker logs: `docker-compose logs -f`
3. Verify environment variables: `docker-compose exec backend env`
4. Consult the [GitHub Issues](https://github.com/Ermegilius/harakka-demo/issues)

---

**Last Updated:** October 21, 2025  
**Docker Compose Version:** 3.8  
**Node Version:** 22-alpine  
**Nginx Version:** 1.29-alpine
