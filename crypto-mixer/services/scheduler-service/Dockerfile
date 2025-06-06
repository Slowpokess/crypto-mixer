# Scheduler Service Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies for building native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for build
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies and build tools
RUN npm prune --production && \
    apk del python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S scheduler -u 1001

# Change ownership of app directory
RUN chown -R scheduler:nodejs /app

USER scheduler

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 3002

CMD ["node", "dist/server.js"]