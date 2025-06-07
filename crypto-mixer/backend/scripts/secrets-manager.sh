#!/bin/bash

# ================================================================
# CRYPTO MIXER - SECURE SECRETS MANAGEMENT
# ================================================================
# RUSSIAN: Безопасное управление секретами для production среды
# Поддержка Docker Secrets, HashiCorp Vault, AWS Secrets Manager

set -euo pipefail
IFS=$'\n\t'

# ================================================================
# КОНФИГУРАЦИЯ
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="${PROJECT_ROOT}/secrets"
VAULT_DIR="${PROJECT_ROOT}/../security/vault"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ================================================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# ================================================================
# ПРОВЕРКА ЗАВИСИМОСТЕЙ
# ================================================================

check_dependencies() {
    log_info "Проверка зависимостей..."
    
    local missing_deps=()
    
    # Проверяем Docker
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    # Проверяем OpenSSL
    if ! command -v openssl &> /dev/null; then
        missing_deps+=("openssl")
    fi
    
    # Проверяем jq
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Отсутствуют зависимости: ${missing_deps[*]}"
        log_info "Установите их командой:"
        echo "  brew install ${missing_deps[*]}"
        exit 1
    fi
    
    log_success "Все зависимости установлены"
}

# ================================================================
# СОЗДАНИЕ ДИРЕКТОРИЙ
# ================================================================

setup_directories() {
    log_info "Создание директорий для секретов..."
    
    # Создаем директории с правильными правами
    mkdir -p "${SECRETS_DIR}"/{docker,vault,ssl,backup}
    mkdir -p "${SECRETS_DIR}/generated"
    
    # Устанавливаем права доступа (только владелец)
    chmod 700 "${SECRETS_DIR}"
    chmod 700 "${SECRETS_DIR}"/*
    
    # Создаем .gitignore для защиты секретов
    cat > "${SECRETS_DIR}/.gitignore" << 'EOF'
# RUSSIAN: Никогда не коммитим секреты!
*
!.gitignore
!*.example
!README.md
EOF
    
    log_success "Директории созданы"
}

# ================================================================
# ГЕНЕРАЦИЯ БЕЗОПАСНЫХ ПАРОЛЕЙ И КЛЮЧЕЙ
# ================================================================

generate_secure_password() {
    local length=${1:-32}
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

generate_api_key() {
    local prefix=${1:-"cm"}
    echo "${prefix}_$(openssl rand -hex 32)"
}

generate_jwt_secret() {
    openssl rand -base64 64 | tr -d "=+/" | cut -c1-64
}

generate_encryption_key() {
    openssl rand -hex 32
}

# ================================================================
# СОЗДАНИЕ DOCKER SECRETS
# ================================================================

create_docker_secrets() {
    log_info "Создание Docker secrets..."
    
    # Список секретов для создания
    local secrets=(
        "db_password:$(generate_secure_password 24)"
        "db_root_password:$(generate_secure_password 32)"
        "redis_password:$(generate_secure_password 20)"
        "jwt_secret:$(generate_jwt_secret)"
        "api_encryption_key:$(generate_encryption_key)"
        "vault_root_token:$(generate_api_key "vault")"
        "smtp_password:$(generate_secure_password 16)"
        "webhook_secret:$(generate_secure_password 24)"
        "ssl_passphrase:$(generate_secure_password 20)"
    )
    
    # Создаем Docker secrets
    for secret_pair in "${secrets[@]}"; do
        local secret_name="${secret_pair%%:*}"
        local secret_value="${secret_pair##*:}"
        
        # Проверяем существование secret
        if docker secret ls --format "{{.Name}}" | grep -q "^${secret_name}$"; then
            log_warning "Secret ${secret_name} уже существует, пропускаем"
            continue
        fi
        
        # Создаем secret
        echo -n "$secret_value" | docker secret create "$secret_name" -
        log_success "Создан Docker secret: $secret_name"
        
        # Сохраняем в файл для backup (зашифрованный)
        echo -n "$secret_value" | openssl enc -aes-256-cbc -pbkdf2 -salt \
            -out "${SECRETS_DIR}/backup/${secret_name}.enc"
        
        # Сохраняем незашифрованную копию для локальной разработки
        echo -n "$secret_value" > "${SECRETS_DIR}/generated/${secret_name}.secret"
        chmod 600 "${SECRETS_DIR}/generated/${secret_name}.secret"
    done
    
    log_success "Docker secrets созданы"
}

# ================================================================
# SSL/TLS СЕРТИФИКАТЫ
# ================================================================

generate_ssl_certificates() {
    log_info "Генерация SSL/TLS сертификатов..."
    
    local ssl_dir="${SECRETS_DIR}/ssl"
    local domain=${SSL_DOMAIN:-"crypto-mixer.local"}
    local company=${SSL_COMPANY:-"Crypto Mixer Inc"}
    
    # Создаем CA (Certificate Authority)
    log_info "Создание Certificate Authority..."
    
    # CA private key
    openssl genrsa -out "${ssl_dir}/ca-key.pem" 4096
    chmod 400 "${ssl_dir}/ca-key.pem"
    
    # CA certificate
    openssl req -new -x509 -days 365 -key "${ssl_dir}/ca-key.pem" \
        -sha256 -out "${ssl_dir}/ca.pem" \
        -subj "/C=US/ST=State/L=City/O=${company}/CN=Crypto Mixer CA"
    
    # Создаем server certificate
    log_info "Создание server certificate..."
    
    # Server private key
    openssl genrsa -out "${ssl_dir}/server-key.pem" 4096
    chmod 400 "${ssl_dir}/server-key.pem"
    
    # Certificate signing request
    openssl req -subj "/C=US/ST=State/L=City/O=${company}/CN=${domain}" \
        -sha256 -new -key "${ssl_dir}/server-key.pem" \
        -out "${ssl_dir}/server.csr"
    
    # Extensions для certificate
    cat > "${ssl_dir}/server-extensions.cnf" << EOF
basicConstraints=CA:FALSE
keyUsage=nonRepudiation,digitalSignature,keyEncipherment
subjectAltName=@alt_names

[alt_names]
DNS.1=${domain}
DNS.2=*.${domain}
DNS.3=localhost
IP.1=127.0.0.1
IP.2=::1
EOF
    
    # Sign the certificate
    openssl x509 -req -days 365 -in "${ssl_dir}/server.csr" \
        -CA "${ssl_dir}/ca.pem" -CAkey "${ssl_dir}/ca-key.pem" \
        -out "${ssl_dir}/server-cert.pem" -CAcreateserial \
        -extensions v3_req -extfile "${ssl_dir}/server-extensions.cnf"
    
    # Создаем client certificate (для взаимной аутентификации)
    log_info "Создание client certificate..."
    
    openssl genrsa -out "${ssl_dir}/client-key.pem" 4096
    chmod 400 "${ssl_dir}/client-key.pem"
    
    openssl req -subj "/C=US/ST=State/L=City/O=${company}/CN=client" \
        -new -key "${ssl_dir}/client-key.pem" \
        -out "${ssl_dir}/client.csr"
    
    openssl x509 -req -days 365 -in "${ssl_dir}/client.csr" \
        -CA "${ssl_dir}/ca.pem" -CAkey "${ssl_dir}/ca-key.pem" \
        -out "${ssl_dir}/client-cert.pem" -CAcreateserial
    
    # Создаем Docker secrets для SSL
    docker secret create ssl_ca_cert "${ssl_dir}/ca.pem" 2>/dev/null || true
    docker secret create ssl_server_cert "${ssl_dir}/server-cert.pem" 2>/dev/null || true
    docker secret create ssl_server_key "${ssl_dir}/server-key.pem" 2>/dev/null || true
    
    # Очищаем временные файлы
    rm -f "${ssl_dir}/server.csr" "${ssl_dir}/client.csr" "${ssl_dir}/server-extensions.cnf"
    
    log_success "SSL сертификаты созданы"
}

# ================================================================
# НАСТРОЙКА HASHICORP VAULT
# ================================================================

setup_vault() {
    log_info "Настройка HashiCorp Vault..."
    
    local vault_config="${VAULT_DIR}/config.hcl"
    
    # Создаем директорию для Vault
    mkdir -p "$VAULT_DIR"/{config,data,logs}
    chmod 700 "$VAULT_DIR"
    
    # Создаем конфигурацию Vault
    cat > "$vault_config" << 'EOF'
# RUSSIAN: Безопасная конфигурация HashiCorp Vault для crypto-mixer

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/vault/ssl/server-cert.pem"
  tls_key_file  = "/vault/ssl/server-key.pem"
}

api_addr = "https://127.0.0.1:8200"
cluster_addr = "https://127.0.0.1:8201"
ui = true

# Логирование
log_level = "Info"
log_file = "/vault/logs/vault.log"
log_rotate_duration = "24h"
log_rotate_max_files = 30

# Безопасность
disable_mlock = false
default_lease_ttl = "168h"
max_lease_ttl = "720h"

# Telemetry
telemetry {
  disable_hostname = true
  prometheus_retention_time = "30s"
}
EOF
    
    log_success "Vault настроен"
}

# ================================================================
# СОЗДАНИЕ ENVIRONMENT FILES
# ================================================================

create_env_files() {
    log_info "Создание environment files..."
    
    # Production environment
    cat > "${SECRETS_DIR}/.env.production" << 'EOF'
# ================================================================
# CRYPTO MIXER - PRODUCTION ENVIRONMENT
# ================================================================
# RUSSIAN: Production переменные окружения
# ВАЖНО: Не коммитить этот файл!

NODE_ENV=production
API_PORT=5000

# Database (secrets managed externally)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=crypto_mixer_prod
DB_USER=crypto_mixer

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Security
SECURITY_ENABLED=true
RATE_LIMIT_GLOBAL=2000
DDOS_PROTECTION_ENABLED=true

# Monitoring
MONITORING_ENABLED=true
PROMETHEUS_ENABLED=true
HEALTH_CHECK_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# SSL/TLS
SSL_ENABLED=true
SSL_CERT_PATH=/run/secrets/ssl_server_cert
SSL_KEY_PATH=/run/secrets/ssl_server_key

# External Services
VAULT_ADDR=https://vault:8200
VAULT_ENABLED=true
EOF
    
    # Staging environment
    cat > "${SECRETS_DIR}/.env.staging" << 'EOF'
# ================================================================
# CRYPTO MIXER - STAGING ENVIRONMENT
# ================================================================

NODE_ENV=staging
API_PORT=5000

# Database
DB_HOST=postgres-staging
DB_PORT=5432
DB_NAME=crypto_mixer_staging
DB_USER=crypto_mixer

# Redis
REDIS_HOST=redis-staging
REDIS_PORT=6379

# Security (более мягкие ограничения для тестирования)
SECURITY_ENABLED=true
RATE_LIMIT_GLOBAL=5000
DDOS_PROTECTION_ENABLED=true

# Monitoring
MONITORING_ENABLED=true
PROMETHEUS_ENABLED=true

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# SSL (самоподписанные сертификаты для staging)
SSL_ENABLED=true
SSL_CERT_PATH=/run/secrets/ssl_server_cert
SSL_KEY_PATH=/run/secrets/ssl_server_key
EOF
    
    chmod 600 "${SECRETS_DIR}/.env".*
    
    log_success "Environment files созданы"
}

# ================================================================
# BACKUP И RECOVERY
# ================================================================

backup_secrets() {
    log_info "Создание backup секретов..."
    
    local backup_dir="${SECRETS_DIR}/backup"
    local backup_file="${backup_dir}/secrets-$(date +%Y%m%d_%H%M%S).tar.gz.enc"
    
    # Создаем архив всех секретов
    tar -czf - -C "$SECRETS_DIR" generated ssl docker vault 2>/dev/null | \
        openssl enc -aes-256-cbc -pbkdf2 -salt -out "$backup_file"
    
    chmod 600 "$backup_file"
    
    log_success "Backup создан: $backup_file"
    log_warning "Сохраните пароль шифрования в безопасном месте!"
}

# ================================================================
# ВАЛИДАЦИЯ СЕКРЕТОВ
# ================================================================

validate_secrets() {
    log_info "Валидация секретов..."
    
    local validation_errors=()
    
    # Проверяем Docker secrets
    local required_secrets=(
        "db_password"
        "jwt_secret"
        "api_encryption_key"
    )
    
    for secret in "${required_secrets[@]}"; do
        if ! docker secret ls --format "{{.Name}}" | grep -q "^${secret}$"; then
            validation_errors+=("Missing Docker secret: $secret")
        fi
    done
    
    # Проверяем SSL сертификаты
    if [ ! -f "${SECRETS_DIR}/ssl/server-cert.pem" ]; then
        validation_errors+=("Missing SSL server certificate")
    fi
    
    # Проверяем права доступа
    if [ "$(stat -c %a "${SECRETS_DIR}")" != "700" ]; then
        validation_errors+=("Incorrect permissions on secrets directory")
    fi
    
    if [ ${#validation_errors[@]} -gt 0 ]; then
        log_error "Обнаружены ошибки валидации:"
        printf '%s\n' "${validation_errors[@]}"
        return 1
    fi
    
    log_success "Все секреты валидны"
}

# ================================================================
# ОЧИСТКА СЕКРЕТОВ
# ================================================================

cleanup_secrets() {
    log_warning "Очистка всех секретов..."
    
    read -p "Вы уверены? Это удалит ВСЕ секреты! (yes/no): " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_info "Отменено пользователем"
        return 0
    fi
    
    # Удаляем Docker secrets
    log_info "Удаление Docker secrets..."
    docker secret ls --format "{{.Name}}" | grep -E "^(db_|redis_|jwt_|api_|vault_|smtp_|webhook_|ssl_)" | \
        xargs -r docker secret rm
    
    # Удаляем файлы секретов
    log_info "Удаление файлов секретов..."
    rm -rf "${SECRETS_DIR}/generated"
    rm -rf "${SECRETS_DIR}/ssl"
    rm -rf "${SECRETS_DIR}/docker"
    
    log_success "Секреты очищены"
}

# ================================================================
# ИНФОРМАЦИЯ О СЕКРЕТАХ
# ================================================================

show_secrets_info() {
    log_info "Информация о секретах:"
    
    echo
    echo "Docker Secrets:"
    docker secret ls --format "table {{.Name}}\t{{.CreatedAt}}" | grep -E "^(NAME|db_|redis_|jwt_|api_|vault_|smtp_|webhook_|ssl_)"
    
    echo
    echo "SSL Certificates:"
    if [ -f "${SECRETS_DIR}/ssl/server-cert.pem" ]; then
        echo "  Server certificate: ✓"
        openssl x509 -in "${SECRETS_DIR}/ssl/server-cert.pem" -noout -dates
    else
        echo "  Server certificate: ✗"
    fi
    
    echo
    echo "Secrets Directory:"
    ls -la "$SECRETS_DIR" 2>/dev/null || echo "  Directory not found"
}

# ================================================================
# ГЛАВНОЕ МЕНЮ
# ================================================================

show_help() {
    cat << 'EOF'
Crypto Mixer Secrets Manager

ИСПОЛЬЗОВАНИЕ:
    ./secrets-manager.sh [КОМАНДА]

КОМАНДЫ:
    init        Полная инициализация всех секретов
    generate    Генерация новых секретов
    ssl         Создание SSL сертификатов
    vault       Настройка HashiCorp Vault
    backup      Создание backup секретов
    validate    Валидация существующих секретов
    info        Показать информацию о секретах
    cleanup     Удалить все секреты (ОПАСНО!)
    help        Показать эту справку

ПРИМЕРЫ:
    ./secrets-manager.sh init
    ./secrets-manager.sh backup
    SSL_DOMAIN=myapp.com ./secrets-manager.sh ssl

ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:
    SSL_DOMAIN      Домен для SSL сертификата (по умолчанию: crypto-mixer.local)
    SSL_COMPANY     Название компании для сертификата
    VAULT_ADDR      Адрес Vault сервера
EOF
}

# ================================================================
# MAIN ФУНКЦИЯ
# ================================================================

main() {
    case "${1:-help}" in
        "init")
            check_dependencies
            setup_directories
            create_docker_secrets
            generate_ssl_certificates
            setup_vault
            create_env_files
            validate_secrets
            log_success "Инициализация завершена!"
            ;;
        "generate")
            check_dependencies
            setup_directories
            create_docker_secrets
            ;;
        "ssl")
            check_dependencies
            setup_directories
            generate_ssl_certificates
            ;;
        "vault")
            check_dependencies
            setup_vault
            ;;
        "backup")
            backup_secrets
            ;;
        "validate")
            validate_secrets
            ;;
        "info")
            show_secrets_info
            ;;
        "cleanup")
            cleanup_secrets
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Запускаем main функцию с аргументами
main "$@"