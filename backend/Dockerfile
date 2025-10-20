# Use specific version pin with security patches
FROM node:22-alpine3.22 AS builder

# Add build arguments for better versioning
ARG NODE_ENV=production
ARG BUILD_DATE
ARG VCS_REF

# Add metadata labels following OCI image spec
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="Harakka-demo-backend" \
      org.opencontainers.image.description="Harakka-demo Backend Service" \
      org.opencontainers.image.vendor="Harakka-demo"

WORKDIR /app

# Update Alpine packages and install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache --virtual .build-deps python3 make g++

# Copy package.json files for better layer caching
COPY package.json ./
COPY common/package.json ./common/
COPY backend/package.json ./backend/

# Install dependencies with explicit CI mode and security checks
RUN npm ci --prefix common && \
    npm ci --prefix backend && \
    npm audit fix --force || true

# Copy source files
COPY common/ ./common/
COPY backend/ ./backend/
COPY tsconfig.json ./

# Build application
RUN npm run build --prefix backend

# Production image with security patches
FROM node:22-alpine3.22 AS production

WORKDIR /app

# Set to production environment
ENV NODE_ENV=production

# Support for Google Cloud Run dynamic port assignment
ENV PORT=3000

# Update Alpine packages and install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built files and dependencies
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/common ./common

# Install only production dependencies
RUN npm ci --only=production && \
    npm prune --production && \
    npm cache clean --force

# Set ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Configure security options
RUN mkdir -p /app/tmp && \
    chmod -R 755 /app && \
    chmod -R 777 /app/tmp && \
    chmod 755 /app/dist/main.js

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE ${PORT}

# Health check with timeout using curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Use dumb-init to handle signals properly (important for Cloud Run graceful shutdown)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]