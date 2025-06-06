#!/bin/sh

# Start Tor in background
su-exec tor tor -f /etc/tor/torrc &

# Wait for Tor to start
sleep 5

# Start Node.js application
su-exec nodejs node src/server.js