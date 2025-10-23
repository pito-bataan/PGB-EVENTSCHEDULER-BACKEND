# syntax=docker/dockerfile:1.4
# Multi-stage build for faster deployments with BuildKit caching
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install dependencies with cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy source code (this layer changes most often, so it's last)
COPY . .

# Production stage with Nginx
FROM node:18-alpine

RUN apk add --no-cache nginx supervisor curl

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .
COPY nginx.conf /etc/nginx/nginx.conf

RUN mkdir -p uploads/events uploads/messages && chown -R nodejs:nodejs /app

RUN mkdir -p /etc/supervisor.d && \
    echo '[supervisord]' > /etc/supervisor.d/supervisord.ini && \
    echo 'nodaemon=true' >> /etc/supervisor.d/supervisord.ini && \
    echo 'user=root' >> /etc/supervisor.d/supervisord.ini && \
    echo '' >> /etc/supervisor.d/supervisord.ini && \
    echo '[program:nginx]' >> /etc/supervisor.d/supervisord.ini && \
    echo 'command=/usr/sbin/nginx -g "daemon off;"' >> /etc/supervisor.d/supervisord.ini && \
    echo 'autostart=true' >> /etc/supervisor.d/supervisord.ini && \
    echo 'autorestart=true' >> /etc/supervisor.d/supervisord.ini && \
    echo '' >> /etc/supervisor.d/supervisord.ini && \
    echo '[program:nodejs]' >> /etc/supervisor.d/supervisord.ini && \
    echo 'command=npm run dev' >> /etc/supervisor.d/supervisord.ini && \
    echo 'directory=/app' >> /etc/supervisor.d/supervisord.ini && \
    echo 'user=nodejs' >> /etc/supervisor.d/supervisord.ini && \
    echo 'autostart=true' >> /etc/supervisor.d/supervisord.ini && \
    echo 'autorestart=true' >> /etc/supervisor.d/supervisord.ini

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor.d/supervisord.ini"]