# Use Node.js 18 LTS Alpine for smaller image size
FROM node:18-alpine

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for tsx)
RUN npm install

# Copy source code
COPY . .

# Create uploads directory with proper permissions
RUN mkdir -p uploads/events uploads/messages
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application using tsx (no build needed)
CMD ["npm", "run", "dev"]
