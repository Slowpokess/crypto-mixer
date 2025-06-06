#!/bin/bash
# security/scripts/security-hardening.sh
# Security Hardening Script for Crypto Mixer Infrastructure

set -e

echo "🔒 Starting Security Hardening for Crypto Mixer..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root"
   exit 1
fi

# Create log directory
mkdir -p /var/log/security-hardening
LOG_FILE="/var/log/security-hardening/hardening-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔒 Starting security hardening process..."

# 1. System Updates
log "📦 Updating system packages..."
apt-get update && apt-get upgrade -y
apt-get autoremove -y
apt-get autoclean

# 2. Install security tools
log "🛠️  Installing security tools..."
apt-get install -y \
    fail2ban \
    ufw \
    aide \
    rkhunter \
    chkrootkit \
    auditd \
    apparmor \
    apparmor-utils \
    lynis \
    unattended-upgrades \
    logwatch \
    psmisc \
    lsof \
    htop \
    iotop \
    netstat-nat

# 3. Configure UFW Firewall
log "🔥 Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (adjust port as needed)
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow Docker services (internal only)
ufw allow from 172.16.0.0/12
ufw allow from 10.0.0.0/8
ufw allow from 192.168.0.0/16

# Enable UFW
ufw --force enable

log "✅ UFW firewall configured"

# 4. Configure Fail2Ban
log "🚫 Configuring Fail2Ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
ignoreip = 127.0.0.1/8 ::1 192.168.0.0/16 172.16.0.0/12 10.0.0.0/8

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 1800

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

log "✅ Fail2Ban configured"

# 5. SSH Hardening
log "🔑 Hardening SSH configuration..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

cat > /etc/ssh/sshd_config << 'EOF'
# SSH Hardening Configuration
Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# Authentication
LoginGraceTime 30
PermitRootLogin no
StrictModes yes
MaxAuthTries 3
MaxSessions 2
PubkeyAuthentication yes
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes

# Security options
X11Forwarding no
AllowTcpForwarding no
GatewayPorts no
PermitTunnel no
AllowUsers mixer-admin

# Kex, cipher, MAC
KexAlgorithms curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha2-256,hmac-sha2-512

# Logging
SyslogFacility AUTH
LogLevel VERBOSE

# Banner
Banner /etc/issue.net
EOF

# Create SSH banner
cat > /etc/issue.net << 'EOF'
***************************************************************************
UNAUTHORIZED ACCESS TO THIS DEVICE IS PROHIBITED

This system is restricted to authorized users only. All activities on this
system are monitored and recorded. By proceeding, you acknowledge that you
have no expectation of privacy and consent to monitoring.

Unauthorized access is a violation of law and is subject to criminal and
civil penalties.
***************************************************************************
EOF

systemctl restart sshd
log "✅ SSH hardened"

# 6. Kernel Hardening
log "🔧 Applying kernel hardening..."
cat > /etc/sysctl.d/99-security-hardening.conf << 'EOF'
# Network security
net.ipv4.ip_forward = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_rfc1337 = 1

# Memory protection
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.yama.ptrace_scope = 2
net.core.bpf_jit_harden = 2

# File system protection
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.protected_fifos = 2
fs.protected_regular = 2
fs.suid_dumpable = 0

# Process restrictions
kernel.core_uses_pid = 1
kernel.ctrl-alt-del = 0
EOF

sysctl -p /etc/sysctl.d/99-security-hardening.conf
log "✅ Kernel hardening applied"

# 7. Configure Auditd
log "📋 Configuring system auditing..."
cat > /etc/audit/rules.d/audit.rules << 'EOF'
# Delete all existing rules
-D

# Buffer Size
-b 8192

# Failure mode
-f 1

# Monitor file system access
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k identity

# Monitor SSH
-w /etc/ssh/sshd_config -p wa -k ssh

# Monitor network changes
-w /etc/hosts -p wa -k network
-w /etc/network/ -p wa -k network

# Monitor Docker
-w /var/lib/docker/ -p wa -k docker
-w /etc/docker/ -p wa -k docker

# Monitor critical binaries
-w /bin/su -p x -k privileged
-w /usr/bin/sudo -p x -k privileged
-w /usr/bin/ssh -p x -k network

# Monitor file changes in crypto mixer
-w /opt/crypto-mixer/ -p wa -k crypto-mixer

# System calls
-a always,exit -F arch=b64 -S execve -k exec
-a always,exit -F arch=b32 -S execve -k exec
EOF

systemctl enable auditd
systemctl restart auditd
log "✅ System auditing configured"

# 8. Set up log monitoring
log "📊 Setting up log monitoring..."
cat > /etc/logwatch/conf/logwatch.conf << 'EOF'
LogDir = /var/log
MailTo = admin@crypto-mixer.local
MailFrom = logwatch@crypto-mixer.local
Print = Yes
Save = /var/cache/logwatch
Range = yesterday
Detail = Med
Service = All
Format = text
Archives = Yes
EOF

# 9. Configure automatic security updates
log "🔄 Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Package-Blacklist {
    "docker-ce";
    "docker-ce-cli";
    "containerd.io";
    "nginx";
    "postgresql-*";
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
EOF

systemctl enable unattended-upgrades
log "✅ Automatic security updates configured"

# 10. File integrity monitoring with AIDE
log "🔍 Setting up file integrity monitoring..."
aide --init
mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Create AIDE check script
cat > /usr/local/bin/aide-check.sh << 'EOF'
#!/bin/bash
/usr/bin/aide --check | /usr/bin/mail -s "AIDE Report - $(hostname)" admin@crypto-mixer.local
EOF

chmod +x /usr/local/bin/aide-check.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/aide-check.sh") | crontab -

log "✅ File integrity monitoring configured"

# 11. Secure shared memory
log "🔒 Securing shared memory..."
echo "tmpfs /run/shm tmpfs defaults,noexec,nosuid 0 0" >> /etc/fstab

# 12. Disable unused services
log "🚫 Disabling unused services..."
services_to_disable=(
    "bluetooth"
    "cups"
    "avahi-daemon"
    "snapd"
)

for service in "${services_to_disable[@]}"; do
    if systemctl is-active --quiet "$service"; then
        systemctl stop "$service"
        systemctl disable "$service"
        log "   Disabled $service"
    fi
done

# 13. Set file permissions
log "📁 Setting secure file permissions..."
chmod 644 /etc/passwd
chmod 644 /etc/group
chmod 600 /etc/shadow
chmod 600 /etc/gshadow
chmod 644 /etc/services
chmod 755 /etc/init.d/*
chmod 600 /etc/ssh/ssh_host_*_key
chmod 644 /etc/ssh/ssh_host_*_key.pub

# 14. Remove unnecessary packages
log "🗑️  Removing unnecessary packages..."
unnecessary_packages=(
    "telnet"
    "rsh-client"
    "rsh-redone-client"
    "talk"
    "tftp"
    "xinetd"
)

for package in "${unnecessary_packages[@]}"; do
    if dpkg -l | grep -q "^ii.*$package"; then
        apt-get remove --purge -y "$package"
        log "   Removed $package"
    fi
done

# 15. Configure AppArmor
log "🛡️  Configuring AppArmor..."
systemctl enable apparmor
systemctl start apparmor

# Set all profiles to enforce mode
aa-enforce /etc/apparmor.d/*

log "✅ AppArmor configured"

# 16. Create security monitoring script
log "👁️  Creating security monitoring script..."
cat > /usr/local/bin/security-monitor.sh << 'EOF'
#!/bin/bash
# Security monitoring script

LOG_FILE="/var/log/security-monitor.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check for failed login attempts
failed_logins=$(grep "Failed password" /var/log/auth.log | wc -l)
if [ $failed_logins -gt 10 ]; then
    log "WARNING: $failed_logins failed login attempts detected"
fi

# Check for unusual network connections
connections=$(netstat -tulpn | grep LISTEN | wc -l)
if [ $connections -gt 50 ]; then
    log "WARNING: Unusual number of listening ports: $connections"
fi

# Check disk usage
disk_usage=$(df / | awk 'NR==2 {print $5}' | cut -d'%' -f1)
if [ $disk_usage -gt 85 ]; then
    log "WARNING: High disk usage: $disk_usage%"
fi

# Check memory usage
mem_usage=$(free | awk '/Mem:/ {printf "%.1f", $3/$2 * 100.0}')
if [ $(echo "$mem_usage > 90" | bc) -eq 1 ]; then
    log "WARNING: High memory usage: $mem_usage%"
fi

# Check for rootkits
/usr/bin/rkhunter --cronjob --update --quiet
EOF

chmod +x /usr/local/bin/security-monitor.sh

# Add to crontab for regular monitoring
(crontab -l 2>/dev/null; echo "*/15 * * * * /usr/local/bin/security-monitor.sh") | crontab -

log "✅ Security monitoring configured"

# 17. Generate security report
log "📊 Generating security report..."
cat > "/tmp/security-hardening-report.txt" << EOF
Security Hardening Report - $(date)
====================================

✅ System updated and unnecessary packages removed
✅ UFW firewall configured and enabled
✅ Fail2Ban configured for intrusion detection
✅ SSH hardened with key-only authentication
✅ Kernel security parameters tuned
✅ System auditing enabled with auditd
✅ Log monitoring configured with logwatch
✅ Automatic security updates enabled
✅ File integrity monitoring with AIDE
✅ Shared memory secured
✅ Unused services disabled
✅ File permissions secured
✅ AppArmor enabled and enforcing
✅ Security monitoring script installed

Next Steps:
1. Review and test all configurations
2. Set up proper SSH key authentication
3. Configure log aggregation
4. Set up monitoring alerts
5. Regular security audits with Lynis

Important Files:
- Security log: $LOG_FILE
- UFW status: ufw status
- Fail2Ban status: fail2ban-client status
- SSH config: /etc/ssh/sshd_config
- Audit rules: /etc/audit/rules.d/audit.rules

Regular Maintenance:
- Run 'lynis audit system' monthly
- Check security logs weekly
- Update AIDE database after changes
- Review fail2ban logs regularly
EOF

echo "🎉 Security hardening completed successfully!"
echo "📊 Security report saved to: /tmp/security-hardening-report.txt"
echo "📋 Log file: $LOG_FILE"
echo ""
echo "⚠️  IMPORTANT: Please review all configurations before going to production!"
echo "⚠️  Test SSH access with key authentication before closing current session!"

log "🎉 Security hardening process completed successfully"