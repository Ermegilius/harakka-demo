# Docker Setup Guide

This guide explains the Docker configuration for the Harakka application, focusing on local development with Docker Compose and understanding the Dockerfile structure.

> **📝 Note:** For production deployment to Google Cloud Run, see [Docker Deployment Guide](../workflows/docker-deployment.md).

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Docker Compose Setup](#docker-compose-setup)
- [Dockerfile Architecture](#dockerfile-architecture)
- [Building Locally](#building-locally)
- [Testing Containers](#testing-containers)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)
- [Additional Resources](#additional-resources)

---

## Overview

### Docker Usage in Harakka

1. **Local Development**: Docker Compose orchestrates frontend, backend, and their dependencies
2. **Production**: Docker images built via Google Cloud Build and deployed to Cloud Run
3. **CI/CD**: Automated builds and deployments via deployment scripts

### Key Features

- **Multi-stage builds**: Separate builder and production stages for minimal image size
- **Security hardening**: Non-root users, minimal Alpine Linux base images
- **Health checks**: Built-in monitoring endpoints for container orchestration
- **Environment flexibility**: Different configurations for local vs production

---

## Prerequisites

### Required Software

- **Docker Desktop** (Windows/Mac) v20.10+ or **Docker Engine** (Linux) v20.10+
- **Docker Compose** v2.0+
- **Git** for version control
- **Node.js** v22+ (optional, for non-Docker development)

### Verify Installation

```bash
# Check Docker
docker --version
# Expected: Docker version 20.10.0 or higher

# Check Docker Compose
docker-compose --version
# Expected: Docker Compose version 2.0.0 or higher

# Test Docker
docker run hello-world
```

### System Requirements

- **RAM**: 8GB minimum (Docker Desktop needs 4GB+)
- **Disk**: 20GB free space
- **Ports**: 3000, 5180 must be available

---

## Project Structure

```
harakka-demo/
├── backend/
│   ├── Dockerfile              # Backend container definition
│   ├── src/                    # NestJS source code
│   ├── dist/                   # Built output (gitignored)
│   ├── package.json
│   └── config.mts
├── frontend/
│   ├── Dockerfile              # Frontend container definition
│   ├── nginx.conf              # Nginx server configuration
│   ├── src/                    # React source code
│   ├── dist/                   # Built output (gitignored)
│   ├── package.json
│   └── vite.config.ts
├── common/
│   ├── package.json            # Shared types and utilities
│   └── index.ts
├── docker-compose.yml          # Local orchestration
├── .dockerignore               # Files to exclude from builds
├── .env.local                  # Local environment (gitignored)
└── .env.production             # Production environment (gitignored)
```

---

## Environment Configuration

### Create `.env.local`

Create `.env.local` in project root for local development:

```bash
# Supabase Configuration
SUPABASE_PROJECT_ID=rcbddkhvysexkvgqpcud
SUPABASE_URL=https://rcbddkhvysexkvgqpcud.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_STORAGE_URL=https://rcbddkhvysexkvgqpcud.supabase.co/storage/v1/s3

# Backend Configuration
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5180

# Frontend Configuration
VITE_API_URL=http://127.0.0.1:3000
VITE_SUPABASE_URL=https://rcbddkhvysexkvgqpcud.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# S3 Configuration
S3_REGION=eu-north-1
S3_BUCKET=item-images

# Email Configuration
STORAGE_EMAIL=harakka.storage.solutions@gmail.com
STORAGE_EMAIL_PASSWORD=your-app-password

# Cron Configuration
CRON_SECRET=your-cron-secret
CRON_URL=http://localhost:3000/cron/reminders/run
```

### Environment Variables Reference

| Variable            | Used By               | Purpose              | Example                   |
| ------------------- | --------------------- | -------------------- | ------------------------- |
| `SUPABASE_URL`      | Backend, Frontend     | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Backend, Frontend     | Public API key       | `eyJ...`                  |
| `VITE_API_URL`      | Frontend (build-time) | Backend API endpoint | `http://localhost:3000`   |
| `PORT`              | Backend (runtime)     | Server port          | `3000`                    |
| `ALLOWED_ORIGINS`   | Backend (runtime)     | CORS configuration   | `http://localhost:5180`   |

**⚠️ Important Distinction:**

- **Backend variables**: Loaded at **runtime** from environment
- **Frontend variables** (prefixed with `VITE_`): Embedded at **build time** into JavaScript bundle

---

## Docker Compose Setup

### Configuration Overview

The `docker-compose.yml` file orchestrates both services:

```yaml
version: "3.8"

services:
  backend:
    build:
      context: . # Build from project root
      dockerfile: backend/Dockerfile
    container_name: harakka-backend
    env_file:
      - .env.local # Load runtime variables
    restart: unless-stopped
    ports:
      - "3000:3000" # Host:Container
    networks:
      - harakka-network

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
      args:
        # Build-time variables embedded into bundle
        VITE_API_URL: http://localhost:5180/api
        VITE_SUPABASE_URL: https://rcbddkhvysexkvgqpcud.supabase.co
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
    container_name: harakka-frontend
    restart: unless-stopped
    ports:
      - "5180:80"
    depends_on:
      backend:
        condition: service_healthy # Wait for backend health check
    networks:
      - harakka-network

networks:
  harakka-network:
    driver: bridge # Isolated network for services
```

### Common Commands

```bash
# Build and start all services
docker-compose up --build

# Start in detached mode (background)
docker-compose up -d

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f backend

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Rebuild specific service
docker-compose up --build backend

# Check service status
docker-compose ps

# Execute command in running container
docker-compose exec backend sh
```

### Access Points

- **Frontend**: http://localhost:5180
- **Backend API**: http://localhost:3000
- **Backend Health**: http://localhost:3000/health
- **Backend API Docs**: http://localhost:3000/api
- **Frontend via proxy**: http://localhost:5180/api/\* (proxied to backend)

---

## Dockerfile Architecture

### Backend Dockerfile

**Location:** `backend/Dockerfile`

**Multi-stage build structure:**

```dockerfile
# ============================================
# Stage 1: Builder
# ============================================
FROM node:22-alpine3.22 AS builder

WORKDIR /app

# Install system dependencies
RUN apk update && apk upgrade && apk add --no-cache curl

# Copy package files for dependency caching
COPY package.json ./
COPY common/package.json ./common/
COPY backend/package.json ./backend/

# Install ALL dependencies (including devDependencies for build)
RUN cd common && npm install && cd ../backend && npm install --include=dev

# Copy source code
COPY common/ ./common/
COPY backend/ ./backend/

# Build TypeScript to JavaScript
RUN cd backend && npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine3.22 AS production

WORKDIR /app

ENV NODE_ENV=production

# Install runtime tools
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copy built artifacts from builder
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/common ./common/

# Install ONLY production dependencies
RUN npm install --omit=dev && npm cache clean --force

# Set ownership to non-root user
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 8080

# Health check for orchestration
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:8080/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "dist/backend/src/main.js"]
```

**Key Design Decisions:**

1. **Multi-stage build**: Reduces final image size (~500MB → ~200MB)
2. **Alpine Linux**: Minimal base image for security
3. **Non-root user**: Security best practice
4. **Health check**: Enables orchestration tools to monitor container
5. **dumb-init**: Proper signal handling for graceful shutdown

**Build context:** Project root (`.`) to access `common/` directory

### Frontend Dockerfile

**Location:** `frontend/Dockerfile`

**Multi-stage build structure:**

```dockerfile
# ============================================
# Stage 1: Builder
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Build arguments (embedded into JavaScript bundle)
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG NODE_ENV=production

# Set as environment variables for Vite
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV NODE_ENV=${NODE_ENV}

# Copy package files
COPY package.json ./
COPY common/package.json ./common/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN cd common && npm install
RUN cd frontend && npm install --include=dev

# Copy source code
COPY common/ ./common/
COPY frontend/ ./frontend/

# Build React app (Vite embeds env vars)
WORKDIR /app/frontend
RUN npm run build

# ============================================
# Stage 2: Production (Nginx)
# ============================================
FROM nginx:1.29-alpine AS production

# Install gettext for envsubst (dynamic port configuration)
RUN apk add --no-cache gettext

# Copy nginx configuration template
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template

# Copy built static files
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Create health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

# Dynamic port configuration via environment variable
ENV PORT=8080

EXPOSE 8080
```

**Key Design Decisions:**

1. **Build args**: Vite environment variables embedded at build time
2. **Nginx Alpine**: Lightweight static file server
3. **Template substitution**: `envsubst` allows dynamic port configuration
4. **Health endpoint**: Simple text file for container health checks

**Build context:** Project root (`.`) to access `common/` directory

### Nginx Configuration

**Location:** `frontend/nginx.conf`

```nginx
server {
    listen ${PORT};
    listen [::]:${PORT};
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA routing (redirect all routes to index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Why server block only?**

- Nginx Docker image already has main `nginx.conf` with `events{}` and `http{}` blocks
- Files in `/etc/nginx/templates/` are processed by `envsubst` at container startup
- Processed files are output to `/etc/nginx/conf.d/` and included in `http{}` block

**Environment variable substitution:**

- `${PORT}` is replaced with actual value at runtime by Nginx entrypoint script

---

## Building Locally

### Build with Docker Compose

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build backend

# Build with no cache (force clean build)
docker-compose build --no-cache
```

### Build Individual Images

```bash
# Backend (from project root)
docker build -f backend/Dockerfile -t harakka-backend .

# Frontend (from project root)
docker build \
  --build-arg VITE_API_URL=http://localhost:3000 \
  --build-arg VITE_SUPABASE_URL=https://rcbddkhvysexkvgqpcud.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
  -f frontend/Dockerfile \
  -t harakka-frontend \
  .
```

### Verify Build Success

```bash
# List images
docker images | grep harakka

# Expected output:
# harakka-backend    latest    abc123def456    2 minutes ago    200MB
# harakka-frontend   latest    def456ghi789    1 minute ago     50MB

# Inspect image layers
docker history harakka-backend

# Check image metadata
docker inspect harakka-backend
```

---

## Testing Containers

### Run Individual Containers

```bash
# Run backend container
docker run -p 3000:3000 --env-file .env.local harakka-backend

# Run frontend container
docker run -p 5180:8080 harakka-frontend

# Run with custom name
docker run --name my-backend -p 3000:3000 --env-file .env.local harakka-backend

# Run in detached mode
docker run -d -p 3000:3000 --env-file .env.local harakka-backend
```

### Test Health Endpoints

```bash
# Backend health check
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2025-10-23T..."}

# Frontend health check
curl http://localhost:5180/health
# Expected: OK

# Backend API docs
curl http://localhost:3000/api
# Expected: Swagger UI HTML
```

### Verify Build Artifacts

```bash
# Check backend build output
docker run --rm harakka-backend sh -c "ls -la dist/backend/src/"
# Expected: main.js, main.js.map, etc.

# Check frontend build output
docker run --rm harakka-frontend sh -c "ls -la /usr/share/nginx/html/"
# Expected: index.html, assets/, favicon.ico

# Check frontend environment variables are embedded
docker run --rm harakka-frontend sh -c "grep -r 'VITE_API_URL' /usr/share/nginx/html/assets/"
# Expected: lines containing the API URL
```

### Inspect Container Environment

```bash
# List environment variables
docker run --rm harakka-backend env

# Check nginx configuration
docker run --rm harakka-frontend cat /etc/nginx/conf.d/default.conf

# Interactive shell
docker run --rm -it harakka-backend sh

# Inside container:
ls -la /app
env | grep SUPABASE
node --version
```

### Debug Build Stages

```bash
# Build only up to specific stage
docker build --target builder -f backend/Dockerfile -t test-backend .

# Run builder stage to inspect
docker run --rm -it test-backend sh

# Inside builder container:
ls -la /app/backend/dist/
npm list
node --version
```

---

## Troubleshooting

### Common Build Issues

#### Backend: "Cannot find module '/app/dist/main.js'"

**Cause:** Build output path mismatch in CMD

**Solution:**

```bash
# Debug: inspect build output
docker build --target builder -f backend/Dockerfile -t test-backend .
docker run --rm test-backend sh -c "find /app -name 'main.js'"

# Verify CMD matches actual path in Dockerfile
CMD ["node", "dist/backend/src/main.js"]
```

#### Frontend: Blank page with "supabaseUrl is required"

**Cause:** Vite environment variables not embedded during build

**Solution:**

```bash
# Ensure build args are passed
docker build \
  --build-arg VITE_API_URL=http://localhost:3000 \
  --build-arg VITE_SUPABASE_URL=https://rcbddkhvysexkvgqpcud.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-key \
  -f frontend/Dockerfile \
  -t harakka-frontend \
  .

# Verify variables are embedded
docker run --rm harakka-frontend sh -c "grep -r 'supabase.co' /usr/share/nginx/html/assets/"
```

#### Build: "file not found: common/package.json"

**Cause:** Build context doesn't include parent directories

**Solution:**

```bash
# ✅ Correct: build from project root with -f flag
docker build -f backend/Dockerfile -t harakka-backend .

# ❌ Wrong: build from backend/ directory
cd backend && docker build -t harakka-backend .
```

#### Nginx: "events directive not allowed here"

**Cause:** `nginx.conf` contains full config instead of server block only

**Solution:**

```nginx
# ✅ Correct (server block only)
server {
    listen ${PORT};
    # ... config
}

# ❌ Wrong (full config causes duplicate directives)
events { }
http {
    server { }
}
```

### Common Runtime Issues

#### Port Binding Errors

**Error:** `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Solution:**

```bash
# Find process using port (Windows)
netstat -ano | findstr :3000

# Find process using port (macOS/Linux)
lsof -i :3000
sudo netstat -tulpn | grep :3000

# Kill the process
taskkill /PID <PID> /F          # Windows
kill -9 <PID>                   # macOS/Linux

# Or use different host port
docker run -p 3001:3000 --env-file .env.local harakka-backend
```

#### Docker Compose: Services can't communicate

**Cause:** Using `localhost` instead of service name

**Solution:**

```yaml
# ✅ Correct: use service name
services:
  backend:
    environment:
      - ALLOWED_ORIGINS=http://harakka-frontend,http://localhost:5180
# ❌ Wrong: localhost only works on host machine
# - ALLOWED_ORIGINS=http://localhost,http://localhost:5180
```

**Inside containers**, service names resolve to container IPs via Docker's internal DNS.

#### Health Check Failing

**Symptoms:** Container starts but health check fails

**Debug:**

```bash
# Check health status
docker inspect harakka-backend | grep -A 10 Health

# Manual health check
docker exec harakka-backend curl -f http://localhost:3000/health

# Check logs
docker logs harakka-backend

# Check if app is listening
docker exec harakka-backend netstat -tuln
```

**Common causes:**

- Application listening on `127.0.0.1` instead of `0.0.0.0`
- Port mismatch between `EXPOSE` and actual server port
- Health endpoint not implemented
- Startup time too short (increase `--start-period`)

#### Environment Variables Not Loading

**Symptoms:** Application can't find config values

**Debug:**

```bash
# Check what env vars are set in container
docker exec harakka-backend env

# Check .env.local is loaded by Docker Compose
docker-compose config

# Run container with specific env file
docker run --env-file .env.local harakka-backend env | grep SUPABASE
```

**Solution:** Ensure `.env.local` format is correct:

```bash
# ✅ Correct (no spaces around =)
SUPABASE_URL=https://example.supabase.co

# ❌ Wrong (spaces break parsing)
SUPABASE_URL = https://example.supabase.co
```

### Performance Issues

#### Build Takes Too Long

**Solutions:**

```bash
# Use BuildKit for faster builds
DOCKER_BUILDKIT=1 docker build -f backend/Dockerfile .

# Use build cache
docker build -f backend/Dockerfile --cache-from harakka-backend:latest .

# Optimize .dockerignore
echo "node_modules" >> .dockerignore
echo ".git" >> .dockerignore
echo "*.md" >> .dockerignore
```

#### Container Uses Too Much Memory

**Solutions:**

```yaml
# Set resource limits in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          memory: 256M
```

```bash
# Or set limits when running container
docker run -m 512m --cpus="1.0" harakka-backend
```

---

## Security Best Practices

### DO ✅

1. **Use non-root users**

   ```dockerfile
   RUN adduser -S nestjs
   USER nestjs
   ```

2. **Pin image versions**

   ```dockerfile
   FROM node:22-alpine3.22  # ✅ Specific version
   # NOT: FROM node:latest  # ❌ Unpredictable
   ```

3. **Enable health checks**

   ```dockerfile
   HEALTHCHECK --interval=30s --timeout=5s \
     CMD curl -f http://localhost:8080/health || exit 1
   ```

4. **Scan images regularly**

   ```bash
   docker scan harakka-backend
   trivy image harakka-backend
   ```

5. **Use multi-stage builds**

   ```dockerfile
   FROM node AS builder
   # ... build stage ...

   FROM node AS production
   COPY --from=builder /app/dist ./dist
   ```

6. **Keep secrets in environment files**

   ```bash
   # ✅ Store in .env.local (gitignored)
   SUPABASE_SERVICE_ROLE_KEY=secret

   # ✅ Or use Docker secrets
   echo "secret" | docker secret create db_password -
   ```

7. **Use .dockerignore**

   ```
   # .dockerignore
   node_modules
   .git
   .env*
   *.md
   dist
   coverage
   ```

8. **Limit exposed ports**

   ```dockerfile
   EXPOSE 8080  # Only expose what's needed
   ```

### DON'T ❌

1. **Don't commit secrets**

   ```bash
   # ❌ Never commit these
   .env.local
   .env.production
   ```

2. **Don't run as root**

   ```dockerfile
   # ❌ Security risk
   USER root
   ```

3. **Don't hardcode secrets**

   ```dockerfile
   # ❌ Never do this
   ENV DATABASE_PASSWORD=mysecret
   ```

4. **Don't use `latest` tags**

   ```dockerfile
   # ❌ Breaks reproducibility
   FROM node:latest
   ```

5. **Don't expose unnecessary services**

   ```yaml
   # ❌ Don't expose database directly
   ports:
     - "5432:5432" # PostgreSQL
   ```

6. **Don't ignore updates**

   ```dockerfile
   # ✅ Always update packages
   RUN apk update && apk upgrade
   ```

---

## Additional Resources

### Official Documentation

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)

### Nginx

- [Nginx Docker Image](https://hub.docker.com/_/nginx)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [Nginx Template Documentation](https://github.com/docker-library/docs/tree/master/nginx#using-environment-variables-in-nginx-configuration-new-in-119)

### Node.js & NestJS

- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [NestJS Docker Guide](https://docs.nestjs.com/recipes/docker)

### Security

- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Snyk Container Security](https://snyk.io/learn/container-security/)

### Tools

- [Trivy - Vulnerability Scanner](https://github.com/aquasecurity/trivy)
- [Dive - Image Layer Analyzer](https://github.com/wagoodman/dive)
- [Hadolint - Dockerfile Linter](https://github.com/hadolint/hadolint)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

**Last Updated:** October 23, 2025  
**Docker Compose Version:** 3.8  
**Node Version:** 22-alpine3.22  
**Nginx Version:** 1.29-alpine
