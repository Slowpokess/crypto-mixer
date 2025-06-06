#!/bin/bash
# security/scripts/backup-security.sh
# Security Backup and Recovery Script for Crypto Mixer

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/crypto-mixer}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/crypto-mixer/backup.key}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-crypto-mixer-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/crypto-mixer/backup-$TIMESTAMP.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "❌ ERROR: $1"
    exit 1
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error_exit "This script must be run as root"
fi

log "🔐 Starting security backup process..."

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Generate encryption key if not exists
if [ ! -f "$ENCRYPTION_KEY_FILE" ]; then
    log "🔑 Generating backup encryption key..."
    openssl rand -base64 32 > "$ENCRYPTION_KEY_FILE"
    chmod 600 "$ENCRYPTION_KEY_FILE"
    chown root:root "$ENCRYPTION_KEY_FILE"
fi

# Function to encrypt and compress files
encrypt_backup() {
    local source_path="$1"
    local backup_name="$2"
    local backup_file="$BACKUP_DIR/${backup_name}_$TIMESTAMP.tar.gz.enc"
    
    log "📦 Creating encrypted backup: $backup_name"
    
    if [ -d "$source_path" ] || [ -f "$source_path" ]; then
        tar -czf - "$source_path" | \
        openssl enc -aes-256-cbc -salt -in - -out "$backup_file" -pass file:"$ENCRYPTION_KEY_FILE"
        
        if [ $? -eq 0 ]; then
            log "✅ Successfully backed up: $backup_name"
            echo "$backup_file" >> "$BACKUP_DIR/backup_manifest_$TIMESTAMP.txt"
        else
            error_exit "Failed to backup: $backup_name"
        fi
    else
        log "⚠️  Source not found, skipping: $source_path"
    fi
}

# Function to backup database
backup_database() {
    log "🗃️  Backing up PostgreSQL database..."
    
    local db_backup_file="$BACKUP_DIR/database_$TIMESTAMP.sql.gz.enc"
    
    # Create database dump
    docker exec crypto-mixer-postgres pg_dumpall -U postgres | \
    gzip | \
    openssl enc -aes-256-cbc -salt -in - -out "$db_backup_file" -pass file:"$ENCRYPTION_KEY_FILE"
    
    if [ $? -eq 0 ]; then
        log "✅ Database backup completed"
        echo "$db_backup_file" >> "$BACKUP_DIR/backup_manifest_$TIMESTAMP.txt"
    else
        error_exit "Database backup failed"
    fi
}

# Function to backup Vault data
backup_vault() {
    log "🔐 Backing up Vault data..."
    
    local vault_backup_file="$BACKUP_DIR/vault_$TIMESTAMP.tar.gz.enc"
    
    # Stop vault for consistent backup
    docker stop crypto-mixer-vault || true
    sleep 5
    
    # Backup vault data
    if [ -d "/var/lib/docker/volumes/crypto-mixer_vault-data/_data" ]; then
        encrypt_backup "/var/lib/docker/volumes/crypto-mixer_vault-data/_data" "vault_data"
    fi
    
    # Restart vault
    docker start crypto-mixer-vault || true
}

# Function to backup SSL certificates
backup_ssl() {
    log "🔒 Backing up SSL certificates..."
    encrypt_backup "/etc/ssl/crypto-mixer" "ssl_certificates"
    encrypt_backup "/etc/nginx/ssl" "nginx_ssl"
}

# Function to backup application configuration
backup_config() {
    log "⚙️  Backing up application configuration..."
    
    # Docker configurations
    encrypt_backup "/opt/crypto-mixer/docker" "docker_config"
    
    # Nginx configuration
    encrypt_backup "/etc/nginx" "nginx_config"
    
    # Security configurations
    encrypt_backup "/opt/crypto-mixer/security" "security_config"
    
    # Environment files
    if [ -f "/opt/crypto-mixer/.env" ]; then
        encrypt_backup "/opt/crypto-mixer/.env" "env_config"
    fi
}

# Function to backup system security configs
backup_system_security() {
    log "🛡️  Backing up system security configurations..."
    
    # SSH configuration
    encrypt_backup "/etc/ssh" "ssh_config"
    
    # Firewall rules
    ufw status verbose > "/tmp/ufw_rules_$TIMESTAMP.txt"
    encrypt_backup "/tmp/ufw_rules_$TIMESTAMP.txt" "ufw_rules"
    rm -f "/tmp/ufw_rules_$TIMESTAMP.txt"
    
    # Fail2ban configuration
    encrypt_backup "/etc/fail2ban" "fail2ban_config"
    
    # Audit rules
    encrypt_backup "/etc/audit" "audit_config"
    
    # AppArmor profiles
    encrypt_backup "/etc/apparmor.d" "apparmor_profiles"
}

# Function to backup logs
backup_logs() {
    log "📋 Backing up important logs..."
    
    # System logs
    encrypt_backup "/var/log/auth.log*" "auth_logs"
    encrypt_backup "/var/log/nginx" "nginx_logs"
    encrypt_backup "/var/log/crypto-mixer" "application_logs"
    encrypt_backup "/var/log/fail2ban.log*" "fail2ban_logs"
    encrypt_backup "/var/log/audit" "audit_logs"
}

# Function to create backup manifest
create_manifest() {
    log "📋 Creating backup manifest..."
    
    local manifest_file="$BACKUP_DIR/backup_manifest_$TIMESTAMP.txt"
    
    {
        echo "# Crypto Mixer Security Backup Manifest"
        echo "# Created: $(date)"
        echo "# Timestamp: $TIMESTAMP"
        echo "# Backup Directory: $BACKUP_DIR"
        echo "# Encryption: AES-256-CBC"
        echo ""
        echo "# Backup Files:"
    } > "$manifest_file"
    
    # List all backup files with checksums
    find "$BACKUP_DIR" -name "*_$TIMESTAMP.*" -type f | while read file; do
        local checksum=$(sha256sum "$file" | cut -d' ' -f1)
        local size=$(ls -lh "$file" | awk '{print $5}')
        echo "$file|$checksum|$size" >> "$manifest_file"
    done
    
    log "✅ Backup manifest created: $manifest_file"
}

# Function to upload to S3 (if configured)
upload_to_s3() {
    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        log "☁️  Uploading backups to S3..."
        
        aws s3 sync "$BACKUP_DIR" "s3://$S3_BUCKET/$(hostname)/$TIMESTAMP/" \
            --exclude "*" \
            --include "*_$TIMESTAMP.*" \
            --storage-class STANDARD_IA
        
        if [ $? -eq 0 ]; then
            log "✅ Backups uploaded to S3"
        else
            log "⚠️  S3 upload failed"
        fi
    else
        log "ℹ️  S3 upload skipped (not configured or AWS CLI not available)"
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    log "🧹 Cleaning up old backups..."
    
    find "$BACKUP_DIR" -name "*.enc" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "backup_manifest_*.txt" -mtime +$RETENTION_DAYS -delete
    
    log "✅ Old backups cleaned up (retention: $RETENTION_DAYS days)"
}

# Function to verify backup integrity
verify_backups() {
    log "🔍 Verifying backup integrity..."
    
    local manifest_file="$BACKUP_DIR/backup_manifest_$TIMESTAMP.txt"
    local verification_failed=false
    
    if [ -f "$manifest_file" ]; then
        while IFS='|' read -r file checksum size; do
            if [[ "$file" == "#"* ]] || [[ -z "$file" ]]; then
                continue
            fi
            
            if [ -f "$file" ]; then
                local current_checksum=$(sha256sum "$file" | cut -d' ' -f1)
                if [ "$current_checksum" = "$checksum" ]; then
                    log "✅ Verified: $(basename "$file")"
                else
                    log "❌ Checksum mismatch: $(basename "$file")"
                    verification_failed=true
                fi
            else
                log "❌ File not found: $file"
                verification_failed=true
            fi
        done < "$manifest_file"
        
        if [ "$verification_failed" = true ]; then
            error_exit "Backup verification failed"
        else
            log "✅ All backups verified successfully"
        fi
    else
        error_exit "Manifest file not found"
    fi
}

# Function to test backup decryption
test_decryption() {
    log "🔓 Testing backup decryption..."
    
    local test_file=$(find "$BACKUP_DIR" -name "*_$TIMESTAMP.*.enc" -type f | head -1)
    
    if [ -n "$test_file" ]; then
        local test_output="/tmp/backup_test_$TIMESTAMP"
        
        openssl enc -aes-256-cbc -d -in "$test_file" -pass file:"$ENCRYPTION_KEY_FILE" | \
        tar -tzf - > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            log "✅ Backup decryption test successful"
        else
            error_exit "Backup decryption test failed"
        fi
    else
        log "⚠️  No encrypted backup files found for testing"
    fi
}

# Function to send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    if [ "$status" = "success" ]; then
        log "📧 Backup completed successfully"
        # Add email/webhook notification here if needed
    else
        log "📧 Backup failed: $message"
        # Add error notification here if needed
    fi
}

# Main backup process
main() {
    log "🚀 Starting comprehensive security backup..."
    
    # Create backup timestamp
    echo "BACKUP_TIMESTAMP=$TIMESTAMP" > "$BACKUP_DIR/last_backup.conf"
    
    # Perform backups
    backup_database
    backup_vault
    backup_ssl
    backup_config
    backup_system_security
    backup_logs
    
    # Create manifest and verify
    create_manifest
    verify_backups
    test_decryption
    
    # Upload and cleanup
    upload_to_s3
    cleanup_old_backups
    
    # Calculate total backup size
    local total_size=$(du -sh "$BACKUP_DIR"/*_$TIMESTAMP.* 2>/dev/null | awk '{sum += $1} END {print sum}')
    
    log "📊 Backup Summary:"
    log "   Timestamp: $TIMESTAMP"
    log "   Location: $BACKUP_DIR"
    log "   Total Size: $(du -sh "$BACKUP_DIR" | cut -f1)"
    log "   Files: $(find "$BACKUP_DIR" -name "*_$TIMESTAMP.*" | wc -l)"
    log "   Retention: $RETENTION_DAYS days"
    
    send_notification "success" "Backup completed successfully"
    
    log "🎉 Security backup process completed successfully!"
}

# Recovery function for emergencies
restore_backup() {
    local backup_timestamp="$1"
    local restore_type="$2"
    
    if [ -z "$backup_timestamp" ]; then
        echo "Usage: $0 restore <timestamp> [type]"
        echo "Available backups:"
        ls -la "$BACKUP_DIR"/backup_manifest_*.txt | awk -F'_' '{print $3}' | cut -d'.' -f1
        exit 1
    fi
    
    log "🔄 Starting restore process for backup: $backup_timestamp"
    
    # Add restore logic here based on backup type
    # This would be used in emergency recovery scenarios
    
    log "⚠️  Restore functionality - implement based on specific requirements"
}

# Main script logic
case "${1:-backup}" in
    "backup")
        main
        ;;
    "restore")
        restore_backup "$2" "$3"
        ;;
    "verify")
        verify_backups
        ;;
    "list")
        echo "Available backups:"
        find "$BACKUP_DIR" -name "backup_manifest_*.txt" | sort -r
        ;;
    *)
        echo "Usage: $0 [backup|restore|verify|list]"
        echo ""
        echo "Commands:"
        echo "  backup  - Create full security backup (default)"
        echo "  restore - Restore from backup"
        echo "  verify  - Verify backup integrity"
        echo "  list    - List available backups"
        exit 1
        ;;
esac