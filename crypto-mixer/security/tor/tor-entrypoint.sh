#!/bin/bash
# security/tor/tor-entrypoint.sh
# Tor Docker Entrypoint Script

set -e

echo "🧅 Starting Tor for Crypto Mixer..."

# Create necessary directories
mkdir -p /var/lib/tor/mixer_service
mkdir -p /var/log/tor

# Set proper permissions
chown -R tor:tor /var/lib/tor
chown -R tor:tor /var/log/tor
chmod 700 /var/lib/tor/mixer_service

# Generate control password if not provided
if [ -z "$TOR_CONTROL_PASSWORD" ]; then
    export TOR_CONTROL_PASSWORD="$(openssl rand -base64 32)"
    echo "🔑 Generated Tor control password: $TOR_CONTROL_PASSWORD"
fi

# Generate hashed control password
HASHED_PASSWORD=$(tor --hash-password "$TOR_CONTROL_PASSWORD" | tail -1)
echo "🔐 Hashed control password: $HASHED_PASSWORD"

# Update torrc with hashed password
sed -i "s/HashedControlPassword .*/HashedControlPassword $HASHED_PASSWORD/" /etc/tor/torrc

# Check if hidden service already exists
if [ ! -f /var/lib/tor/mixer_service/hostname ]; then
    echo "🏗️  Creating new hidden service..."
else
    echo "✅ Hidden service already exists"
    echo "🧅 Hidden service address: $(cat /var/lib/tor/mixer_service/hostname)"
fi

# Function to handle signals
cleanup() {
    echo "🛑 Stopping Tor..."
    kill -TERM $TOR_PID
    wait $TOR_PID
    echo "✅ Tor stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start Tor in background
echo "🚀 Starting Tor daemon..."
su-exec tor tor -f /etc/tor/torrc &
TOR_PID=$!

# Wait for Tor to start and create hidden service
echo "⏳ Waiting for Tor to initialize..."
sleep 10

# Display hidden service information
if [ -f /var/lib/tor/mixer_service/hostname ]; then
    ONION_ADDRESS=$(cat /var/lib/tor/mixer_service/hostname)
    echo "✅ Tor hidden service is ready!"
    echo "🧅 Hidden service address: $ONION_ADDRESS"
    echo "🔗 Access your mixer at: http://$ONION_ADDRESS"
    
    # Save onion address to shared volume if available
    if [ -d /shared ]; then
        echo "$ONION_ADDRESS" > /shared/onion-address.txt
        echo "💾 Onion address saved to /shared/onion-address.txt"
    fi
else
    echo "❌ Failed to create hidden service"
    exit 1
fi

# Health check function
health_check() {
    # Check if Tor process is running
    if ! kill -0 $TOR_PID 2>/dev/null; then
        echo "❌ Tor process died"
        return 1
    fi
    
    # Check if SOCKS proxy is responding
    if ! nc -z localhost 9050; then
        echo "❌ Tor SOCKS proxy not responding"
        return 1
    fi
    
    # Check if control port is responding
    if ! nc -z localhost 9051; then
        echo "❌ Tor control port not responding"
        return 1
    fi
    
    return 0
}

# Monitor Tor process
echo "👁️  Monitoring Tor process..."
while true; do
    if ! health_check; then
        echo "💔 Tor health check failed"
        cleanup
        exit 1
    fi
    
    sleep 30
done

# Wait for Tor process
wait $TOR_PID