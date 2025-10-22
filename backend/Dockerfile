# Use specific version pin with security patches
FROM node:22-alpine3.22 AS builder

# Add build arguments for better versioning
ARG NODE_ENV=production
ARG BUILD_DATE
ARG VCS_REF

# Add metadata labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="Harakka-demo-backend" \
      org.opencontainers.image.description="Harakka-demo Backend Service" \
      org.opencontainers.image.vendor="Harakka-demo"

WORKDIR /app

# Update Alpine packages and install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache curl

# Copy package files first for better layer caching
COPY package.json ./
COPY common/package.json ./common/
COPY backend/package.json ./backend/

# Handle circular dependencies by creating temporary package.json files
RUN mkdir -p /app/node_modules /app/common/node_modules && \
    echo '{"name":"harakka","version":"1.2.0"}' > /app/node_modules/package.json && \
    echo '{"name":"full-stack-booking-app","version":"1.2.0"}' > /app/common/node_modules/package.json

# Install ALL dependencies (including dev dependencies) needed for build
RUN cd common && npm install && cd .. && \
    cd backend && npm install --include=dev && \
    npm install --save-dev @supabase/postgrest-js    

# Install NestJS CLI globally to make the 'nest' command available
RUN npm install -g @nestjs/cli    

# Copy source code
COPY common/ ./common/
COPY backend/ ./backend/

# Create a patch file to fix the import path
RUN mkdir -p /app/node_modules/@supabase/postgrest-js/dist/cjs/types && \
    echo "// Type patch to fix missing imports\nexport * from '@supabase/postgrest-js';" > /app/node_modules/@supabase/postgrest-js/dist/cjs/types.js && \
    echo "// Type patch to fix missing imports\nexport * from '@supabase/postgrest-js';" > /app/node_modules/@supabase/postgrest-js/dist/cjs/types/index.js

# Build the application
RUN cd backend && npm run build

# Production image with security patches
FROM node:22-alpine3.22 AS production

WORKDIR /app

# Set to production environment
ENV NODE_ENV=production
# ENV PORT=3000

# Expose the application port (Cloud Run will inject PORT env var)
EXPOSE 8080

# Update Alpine and install required tools
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs -s /sbin/nologin -H

# Copy built files and dependencies
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/common ./common/
COPY --from=builder /app/backend/config.mts ./

# Install only production dependencies
RUN npm install --omit=dev && \
    npm cache clean --force

# Security configurations
RUN chown -R nestjs:nodejs /app && \
    chmod -R 755 /app && \
    mkdir -p /app/tmp && \
    chmod -R 777 /app/tmp

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE ${PORT}

# Health check with timeout using curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Use dumb-init to handle signals properly (important for Cloud Run graceful shutdown)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "dist/backend/src/main.js"]