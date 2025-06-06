#!/bin/bash
# security/scripts/security-audit.sh
# Security Audit Script for Crypto Mixer Infrastructure

set -e

# Configuration
AUDIT_DIR="${AUDIT_DIR:-/var/log/security-audit}"
REPORT_FILE="${AUDIT_DIR}/security-audit-$(date +%Y%m%d-%H%M%S).json"
CRITICAL_THRESHOLD=5
HIGH_THRESHOLD=10

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create audit directory
mkdir -p "$AUDIT_DIR"

echo -e "${BLUE}🔍 Starting Security Audit for Crypto Mixer...${NC}"

# Initialize report
cat > "$REPORT_FILE" << EOF
{
  "audit_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "audit_version": "1.0",
  "findings": {
    "critical": [],
    "high": [],
    "medium": [],
    "low": [],
    "info": []
  },
  "summary": {
    "total_checks": 0,
    "critical_count": 0,
    "high_count": 0,
    "medium_count": 0,
    "low_count": 0,
    "info_count": 0
  }
}
EOF

# Function to add finding
add_finding() {
    local severity="$1"
    local title="$2"
    local description="$3"
    local remediation="$4"
    
    python3 << EOF
import json
import sys

with open('$REPORT_FILE', 'r') as f:
    report = json.load(f)

finding = {
    "title": "$title",
    "description": "$description",
    "remediation": "$remediation",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

report['findings']['$severity'].append(finding)
report['summary']['total_checks'] += 1
report['summary']['${severity}_count'] += 1

with open('$REPORT_FILE', 'w') as f:
    json.dump(report, f, indent=2)
EOF
}

# System Security Checks
echo -e "${BLUE}📋 Checking System Security...${NC}"

# Check SSH configuration
if [ -f /etc/ssh/sshd_config ]; then
    if grep -q "PermitRootLogin yes" /etc/ssh/sshd_config; then
        add_finding "critical" "SSH Root Login Enabled" "SSH allows root login which is a security risk" "Set PermitRootLogin to 'no' in /etc/ssh/sshd_config"
    fi
    
    if ! grep -q "Protocol 2" /etc/ssh/sshd_config; then
        add_finding "high" "SSH Protocol Version" "SSH protocol version 2 not explicitly set" "Add 'Protocol 2' to /etc/ssh/sshd_config"
    fi
fi

# Check for default passwords
if [ -f /etc/shadow ]; then
    if grep -q ':\$6\$' /etc/shadow; then
        add_finding "info" "Password Hashing" "Strong password hashing detected (SHA-512)" "Continue using strong password policies"
    fi
fi

# File Permission Checks
echo -e "${BLUE}📁 Checking File Permissions...${NC}"

# Check sensitive files
for file in /etc/passwd /etc/shadow /etc/hosts; do
    if [ -f "$file" ]; then
        perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%A" "$file" 2>/dev/null)
        case "$file" in
            /etc/shadow)
                if [ "$perms" != "640" ] && [ "$perms" != "600" ]; then
                    add_finding "high" "Shadow File Permissions" "/etc/shadow has incorrect permissions: $perms" "Set permissions to 640: chmod 640 /etc/shadow"
                fi
                ;;
            /etc/passwd)
                if [ "$perms" != "644" ]; then
                    add_finding "medium" "Passwd File Permissions" "/etc/passwd has incorrect permissions: $perms" "Set permissions to 644: chmod 644 /etc/passwd"
                fi
                ;;
        esac
    fi
done

# Docker Security Checks
echo -e "${BLUE}🐳 Checking Docker Security...${NC}"

if command -v docker >/dev/null 2>&1; then
    # Check if Docker daemon is running as root
    if docker info >/dev/null 2>&1; then
        add_finding "info" "Docker Available" "Docker daemon is running and accessible" "Ensure Docker security best practices"
        
        # Check for privileged containers
        privileged_containers=$(docker ps --format "table {{.Names}}\t{{.Status}}" --filter "label=privileged=true" 2>/dev/null | wc -l)
        if [ "$privileged_containers" -gt 1 ]; then
            add_finding "high" "Privileged Containers" "Found privileged Docker containers running" "Review and remove privileged flags where possible"
        fi
    fi
fi

# Network Security Checks
echo -e "${BLUE}🌐 Checking Network Security...${NC}"

# Check open ports
if command -v netstat >/dev/null 2>&1; then
    open_ports=$(netstat -tuln | grep LISTEN | wc -l)
    if [ "$open_ports" -gt 20 ]; then
        add_finding "medium" "Multiple Open Ports" "Found $open_ports listening ports" "Review and close unnecessary ports"
    fi
fi

# Tor Security Checks
echo -e "${BLUE}🧅 Checking Tor Configuration...${NC}"

if [ -f "/etc/tor/torrc" ] || [ -f "/usr/local/etc/tor/torrc" ]; then
    add_finding "info" "Tor Configuration Found" "Tor configuration detected" "Ensure Tor is properly configured for anonymity"
fi

# Crypto Mixer Specific Checks
echo -e "${BLUE}💰 Checking Crypto Mixer Security...${NC}"

# Check for wallet files
for wallet_dir in "/var/lib/crypto-mixer/wallets" "./wallets" "~/.crypto-mixer"; do
    if [ -d "$wallet_dir" ]; then
        wallet_perms=$(stat -c "%a" "$wallet_dir" 2>/dev/null || stat -f "%A" "$wallet_dir" 2>/dev/null)
        if [ "$wallet_perms" != "700" ]; then
            add_finding "critical" "Wallet Directory Permissions" "Wallet directory has insecure permissions: $wallet_perms" "Set strict permissions: chmod 700 $wallet_dir"
        fi
    fi
done

# Check SSL/TLS certificates
echo -e "${BLUE}🔐 Checking SSL/TLS Configuration...${NC}"

for cert_dir in "/etc/ssl/certs" "/etc/nginx/ssl" "./ssl"; do
    if [ -d "$cert_dir" ]; then
        expired_certs=$(find "$cert_dir" -name "*.crt" -o -name "*.pem" | xargs -I {} openssl x509 -in {} -noout -checkend 2592000 2>/dev/null | grep -c "will expire" || echo 0)
        if [ "$expired_certs" -gt 0 ]; then
            add_finding "high" "Expiring SSL Certificates" "$expired_certs SSL certificates will expire within 30 days" "Renew SSL certificates before expiration"
        fi
    fi
done

# Generate final report
python3 << EOF
import json

with open('$REPORT_FILE', 'r') as f:
    report = json.load(f)

summary = report['summary']
total = summary['total_checks']
critical = summary['critical_count']
high = summary['high_count']
medium = summary['medium_count']
low = summary['low_count']
info = summary['info_count']

print(f"\n{'='*60}")
print(f"🔍 SECURITY AUDIT REPORT")
print(f"{'='*60}")
print(f"Total Checks: {total}")
print(f"Critical: {critical}")
print(f"High: {high}")
print(f"Medium: {medium}")
print(f"Low: {low}")
print(f"Info: {info}")
print(f"{'='*60}")

if critical > 0:
    print(f"⚠️  CRITICAL ISSUES FOUND: {critical}")
    for finding in report['findings']['critical']:
        print(f"   • {finding['title']}")

if high > 0:
    print(f"⚠️  HIGH PRIORITY ISSUES: {high}")
    for finding in report['findings']['high']:
        print(f"   • {finding['title']}")

print(f"\n📄 Full report saved to: $REPORT_FILE")
print(f"{'='*60}")
EOF

# Set exit code based on findings
python3 << EOF
import json
import sys

with open('$REPORT_FILE', 'r') as f:
    report = json.load(f)

critical = report['summary']['critical_count']
high = report['summary']['high_count']

if critical >= $CRITICAL_THRESHOLD:
    sys.exit(2)  # Critical issues
elif high >= $HIGH_THRESHOLD:
    sys.exit(1)  # High priority issues
else:
    sys.exit(0)  # Success
EOF