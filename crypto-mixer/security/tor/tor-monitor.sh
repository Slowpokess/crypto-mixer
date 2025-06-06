#!/bin/bash
# security/tor/tor-monitor.sh
# Tor Monitoring and Management Script

set -e

# Configuration
TOR_CONTROL_PORT=${TOR_CONTROL_PORT:-9051}
TOR_SOCKS_PORT=${TOR_SOCKS_PORT:-9050}
TOR_CONTROL_PASSWORD=${TOR_CONTROL_PASSWORD:-""}
LOG_FILE="/var/log/tor/monitor.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to send commands to Tor control port
tor_control() {
    local command="$1"
    echo -e "AUTHENTICATE \"$TOR_CONTROL_PASSWORD\"\r\n$command\r\nQUIT\r\n" | nc localhost $TOR_CONTROL_PORT
}

# Function to check Tor status
check_tor_status() {
    log "🔍 Checking Tor status..."
    
    # Check if Tor process is running
    if pgrep -f "tor" > /dev/null; then
        log "✅ Tor process is running"
    else
        log "❌ Tor process is not running"
        return 1
    fi
    
    # Check SOCKS proxy
    if nc -z localhost $TOR_SOCKS_PORT; then
        log "✅ SOCKS proxy is responding on port $TOR_SOCKS_PORT"
    else
        log "❌ SOCKS proxy is not responding on port $TOR_SOCKS_PORT"
        return 1
    fi
    
    # Check control port
    if nc -z localhost $TOR_CONTROL_PORT; then
        log "✅ Control port is responding on port $TOR_CONTROL_PORT"
    else
        log "❌ Control port is not responding on port $TOR_CONTROL_PORT"
        return 1
    fi
    
    return 0
}

# Function to get Tor circuit information
get_circuit_info() {
    log "🔄 Getting circuit information..."
    tor_control "GETINFO circuit-status"
}

# Function to get hidden service status
get_hidden_service_status() {
    log "🧅 Checking hidden service status..."
    
    if [ -f /var/lib/tor/mixer_service/hostname ]; then
        local onion_address=$(cat /var/lib/tor/mixer_service/hostname)
        log "✅ Hidden service address: $onion_address"
        
        # Check if hidden service descriptor is published
        tor_control "GETINFO hs/service/all"
    else
        log "❌ Hidden service hostname file not found"
        return 1
    fi
}

# Function to rotate circuits
rotate_circuits() {
    log "🔄 Rotating Tor circuits..."
    tor_control "SIGNAL NEWNYM"
    sleep 5
    log "✅ Circuit rotation completed"
}

# Function to get bandwidth statistics
get_bandwidth_stats() {
    log "📊 Getting bandwidth statistics..."
    tor_control "GETINFO traffic/read traffic/written"
}

# Function to get connection count
get_connection_count() {
    log "🔗 Getting connection count..."
    tor_control "GETINFO network-status"
}

# Function to check for warnings in Tor log
check_tor_warnings() {
    log "⚠️  Checking for warnings in Tor log..."
    
    local tor_log="/var/log/tor/tor.log"
    if [ -f "$tor_log" ]; then
        local warnings=$(tail -100 "$tor_log" | grep -i "warn\|error" | wc -l)
        if [ $warnings -gt 0 ]; then
            log "⚠️  Found $warnings warnings/errors in last 100 log lines"
            tail -20 "$tor_log" | grep -i "warn\|error" | while read line; do
                log "   $line"
            done
        else
            log "✅ No warnings found in recent logs"
        fi
    else
        log "❌ Tor log file not found at $tor_log"
    fi
}

# Function to restart Tor if needed
restart_tor_if_needed() {
    if ! check_tor_status; then
        log "🔄 Tor is not healthy, attempting restart..."
        
        # Kill existing Tor processes
        pkill -f "tor" || true
        sleep 5
        
        # Start Tor again
        su-exec tor tor -f /etc/tor/torrc &
        sleep 10
        
        if check_tor_status; then
            log "✅ Tor restarted successfully"
        else
            log "❌ Failed to restart Tor"
            return 1
        fi
    fi
}

# Function to monitor Tor continuously
monitor_tor() {
    log "👁️  Starting continuous Tor monitoring..."
    
    while true; do
        log "--- Tor Health Check ---"
        
        if check_tor_status; then
            log "✅ Tor is healthy"
            
            # Get additional info every 10 minutes
            if [ $(($(date +%s) % 600)) -eq 0 ]; then
                get_hidden_service_status
                get_bandwidth_stats
                check_tor_warnings
            fi
        else
            log "❌ Tor is unhealthy"
            restart_tor_if_needed
        fi
        
        sleep 60  # Check every minute
    done
}

# Function to display help
show_help() {
    cat << EOF
Tor Monitor Script for Crypto Mixer

Usage: $0 [COMMAND]

Commands:
    status          Check current Tor status
    circuits        Show circuit information
    hidden-service  Check hidden service status
    rotate          Rotate Tor circuits
    bandwidth       Show bandwidth statistics
    connections     Show connection count
    warnings        Check for warnings in logs
    restart         Restart Tor if unhealthy
    monitor         Start continuous monitoring
    help            Show this help message

Examples:
    $0 status
    $0 rotate
    $0 monitor
EOF
}

# Main script logic
case "${1:-monitor}" in
    "status")
        check_tor_status
        ;;
    "circuits")
        get_circuit_info
        ;;
    "hidden-service")
        get_hidden_service_status
        ;;
    "rotate")
        rotate_circuits
        ;;
    "bandwidth")
        get_bandwidth_stats
        ;;
    "connections")
        get_connection_count
        ;;
    "warnings")
        check_tor_warnings
        ;;
    "restart")
        restart_tor_if_needed
        ;;
    "monitor")
        monitor_tor
        ;;
    "help")
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac