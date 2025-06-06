# Blockchain Service Dockerfile
FROM node:20-alpine3.19

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S blockchain -u 1001

# Create workspace directory
WORKDIR /workspace

# Copy root package.json and package-lock.json
COPY package.json package-lock.json ./

# Create directory for blockchain-service
RUN mkdir -p services/blockchain-service

# Copy blockchain-service package.json
COPY ./services/blockchain-service/package.json ./services/blockchain-service/

# Install all workspace dependencies
RUN npm ci && \
    npm cache clean --force

# Switch to blockchain-service directory
WORKDIR /workspace/services/blockchain-service

# Copy source code
COPY ./services/blockchain-service/src ./src
COPY ./services/blockchain-service/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Create directories for keys and logs
RUN mkdir -p /workspace/services/blockchain-service/keys /workspace/services/blockchain-service/logs && \
    chown -R blockchain:nodejs /workspace

USER blockchain

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 3001

CMD ["node", "dist/server.js"]