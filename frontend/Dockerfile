FROM node:22-alpine AS builder

# Add build arguments
ARG NODE_ENV=production
ARG BUILD_DATE
ARG VCS_REF
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Add metadata labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="Harakka-demo-frontend" \
      org.opencontainers.image.description="Harakka Frontend Service" \
      org.opencontainers.image.vendor="Harakka-demo"

WORKDIR /app

# Update Alpine packages
RUN apk update && apk upgrade

# Copy package files first for better layer caching
COPY package.json ./
COPY common/package.json ./common/
COPY frontend/package.json ./frontend/

# Copy TypeScript & build config files needed to resolve project references/types
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/vite.config.ts
COPY frontend/tsconfig.app.json ./frontend/tsconfig.app.json

# Handle circular dependencies by creating temporary package.json files
RUN mkdir -p /app/node_modules /app/common/node_modules && \
    echo '{"name":"harakka","version":"1.2.0"}' > /app/node_modules/package.json && \
    echo '{"name":"full-stack-booking-app","version":"1.2.0"}' > /app/common/node_modules/package.json

# Install dependencies in the correct order
# First install common dependencies
RUN cd common && npm install --prefer-offline --no-audit --progress=false

# Then install frontend dependencies with dev dependencies (so types/plugins exist for tsc)
RUN cd frontend && \
    npm install --include=dev --prefer-offline --no-audit --progress=false \
    --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

# Copy source code after dependencies are installed
COPY common/ ./common/
COPY frontend/ ./frontend/

# Create SVG type declaration file if it doesn't exist properly
RUN echo 'declare module "*.svg?react" { import React from "react"; const SVG: React.FC<React.SVGProps<SVGSVGElement>>; export default SVG; }' > /app/frontend/src/svg-react.d.ts

# Set build-time environment variables
ENV VITE_API_URL=${VITE_API_URL:-http://localhost:3000}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV NODE_ENV=production

# Build the application from the frontend directory
WORKDIR /app/frontend
RUN npm run build

# Production stage
FROM nginx:1.29-alpine AS production

# Update Alpine packages and install gettext for envsubst
RUN apk update && apk upgrade && \
    apk add --no-cache gettext

# Let nginx built-in entrypoint render this into /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template

# Copy built files from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Add health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

# Set default PORT if not provided (Cloud Run will override this)
ENV PORT=8080
ENV NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
EXPOSE 8080