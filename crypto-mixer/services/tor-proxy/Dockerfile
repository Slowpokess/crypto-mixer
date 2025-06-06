FROM alpine:latest

# Install Tor and Node.js
RUN apk add --no-cache tor nodejs npm

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Copy Tor configuration
COPY tor-config/ /etc/tor/

# Create tor data directory
RUN mkdir -p /var/lib/tor && chown -R tor:tor /var/lib/tor

# Create non-root user for the app
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

EXPOSE 3005 9050 9051

# Start script that runs both Tor and the Node.js app
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]