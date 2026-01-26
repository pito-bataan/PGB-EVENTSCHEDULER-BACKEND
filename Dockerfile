# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --include=dev

# Copy source code (this layer changes most often, so it's last)
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Production stage with Nginx
FROM node:18-alpine

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Accept environment variables as build arguments
ARG MONGODB_URI
ARG JWT_SECRET
ARG JWT_EXPIRES_IN
ARG PORT
ARG NODE_ENV
ARG CORS_ORIGINS

# Set environment variables from build arguments
# These will be available at runtime
ENV MONGODB_URI=${MONGODB_URI}
ENV JWT_SECRET=${JWT_SECRET}
ENV JWT_EXPIRES_IN=${JWT_EXPIRES_IN}
ENV PORT=${PORT}
ENV NODE_ENV=${NODE_ENV}
ENV CORS_ORIGINS=${CORS_ORIGINS}

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c 'curl -f "http://localhost:3000/api/health" || exit 1'

# Run Node.js directly (simpler debugging)
CMD ["node", "dist/server.js"]