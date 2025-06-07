#!/bin/bash

# Управление секретами для криптомиксера
# Версия: 1.0.0
# Автор: Crypto Mixer Team
# Дата: $(date +%Y-%m-%d)

set -euo pipefail

# Константы и конфигурация
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
readonly SECRETS_DIR="/opt/mixer/secrets"
readonly VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
readonly VAULT_TOKEN_FILE="${VAULT_TOKEN_FILE:-$HOME/.vault-token}"

# Цвета для вывода
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Логирование
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Проверка зависимостей
check_dependencies() {
    local deps=("docker" "openssl" "vault" "jq")
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Требуется установить: $dep"
            exit 1
        fi
    done
    
    # Проверка Docker Swarm
    if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
        log_error "Docker Swarm должен быть инициализирован"
        exit 1
    fi
}

# Генерация безопасных паролей
generate_secure_password() {
    local length="${1:-32}"
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

# Генерация криптографических ключей
generate_encryption_key() {
    local length="${1:-32}"
    openssl rand -hex "$length"
}

# Генерация JWT секрета
generate_jwt_secret() {
    openssl rand -base64 64 | tr -d '\n'
}

# Создание SSL сертификатов
generate_ssl_certificates() {
    local domain="${1:-mixer.local}"
    local cert_dir="$SECRETS_DIR/ssl"
    
    log_info "Генерация SSL сертификатов для домена: $domain"
    
    mkdir -p "$cert_dir"
    
    # Создание приватного ключа
    openssl genrsa -out "$cert_dir/private.key" 4096
    
    # Создание конфигурационного файла
    cat > "$cert_dir/openssl.cnf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = RU
ST = Moscow
L = Moscow
O = Crypto Mixer
OU = Security Department
CN = $domain

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $domain
DNS.2 = *.$domain
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
    
    # Создание CSR
    openssl req -new -key "$cert_dir/private.key" -out "$cert_dir/certificate.csr" -config "$cert_dir/openssl.cnf"
    
    # Самоподписанный сертификат (для development/testing)
    openssl x509 -req -in "$cert_dir/certificate.csr" \
        -signkey "$cert_dir/private.key" \
        -out "$cert_dir/certificate.crt" \
        -days 365 \
        -extensions v3_req \
        -extfile "$cert_dir/openssl.cnf"
    
    # Установка правильных прав доступа
    chmod 600 "$cert_dir/private.key"
    chmod 644 "$cert_dir/certificate.crt"
    
    log_success "SSL сертификаты созданы в $cert_dir"
}

# Инициализация HashiCorp Vault
init_vault() {
    log_info "Инициализация HashiCorp Vault..."
    
    # Ожидание готовности Vault
    local retry_count=0
    while ! vault status &>/dev/null && [ $retry_count -lt 30 ]; do
        log_info "Ожидание запуска Vault... ($((retry_count + 1))/30)"
        sleep 2
        ((retry_count++))
    done
    
    if [ $retry_count -eq 30 ]; then
        log_error "Vault не запустился в течение 60 секунд"
        exit 1
    fi
    
    # Проверка, инициализирован ли Vault
    if vault status -format=json | jq -r '.initialized' | grep -q false; then
        log_info "Инициализация Vault..."
        
        # Инициализация с 5 ключами, порог разблокировки - 3
        vault operator init -key-shares=5 -key-threshold=3 -format=json > "$SECRETS_DIR/vault-init.json"
        
        # Сохранение root token
        jq -r '.root_token' "$SECRETS_DIR/vault-init.json" > "$VAULT_TOKEN_FILE"
        
        # Разблокировка Vault
        for i in {0..2}; do
            unseal_key=$(jq -r ".unseal_keys_b64[$i]" "$SECRETS_DIR/vault-init.json")
            vault operator unseal "$unseal_key"
        done
        
        log_success "Vault успешно инициализирован и разблокирован"
        
        # Установка прав доступа
        chmod 600 "$SECRETS_DIR/vault-init.json" "$VAULT_TOKEN_FILE"
        
    else
        log_info "Vault уже инициализирован"
    fi
    
    # Авторизация в Vault
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        export VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        vault auth -method=token "$VAULT_TOKEN"
    else
        log_error "Файл токена Vault не найден: $VAULT_TOKEN_FILE"
        exit 1
    fi
}

# Создание секретов в Vault
create_vault_secrets() {
    log_info "Создание секретов в Vault..."
    
    # Включение KV секретов v2
    vault secrets enable -version=2 -path=mixer kv || true
    
    # Создание секретов базы данных
    vault kv put mixer/database \
        password="$(generate_secure_password 32)" \
        replication_password="$(generate_secure_password 32)"
    
    # Создание секретов Redis
    vault kv put mixer/redis \
        password="$(generate_secure_password 32)"
    
    # Создание секретов RabbitMQ
    vault kv put mixer/rabbitmq \
        password="$(generate_secure_password 32)"
    
    # Создание секретов Kong
    vault kv put mixer/kong \
        db_password="$(generate_secure_password 32)"
    
    # Создание секретов приложения
    vault kv put mixer/application \
        jwt_secret="$(generate_jwt_secret)" \
        encryption_key="$(generate_encryption_key 32)" \
        master_key="$(generate_encryption_key 64)"
    
    # Создание секретов HSM
    vault kv put mixer/hsm \
        pin="$(generate_secure_password 16)"
    
    # Создание секретов блокчейнов
    vault kv put mixer/blockchain \
        btc_rpc_password="$(generate_secure_password 32)" \
        eth_private_key="$(openssl rand -hex 32)" \
        sol_private_key="$(openssl rand -hex 32)"
    
    # Создание секретов мониторинга
    vault kv put mixer/monitoring \
        grafana_admin_password="$(generate_secure_password 20)"
    
    log_success "Секреты созданы в Vault"
}

# Экспорт секретов из Vault в Docker Secrets
export_docker_secrets() {
    log_info "Экспорт секретов в Docker Swarm..."
    
    # Функция для создания Docker секрета из Vault
    create_docker_secret() {
        local vault_path="$1"
        local vault_key="$2"
        local docker_secret_name="$3"
        
        # Проверка существования секрета
        if docker secret ls --format "{{.Name}}" | grep -q "^${docker_secret_name}$"; then
            log_warning "Docker секрет $docker_secret_name уже существует, пропускаю"
            return
        fi
        
        # Получение значения из Vault и создание Docker секрета
        vault kv get -field="$vault_key" "$vault_path" | \
            docker secret create "$docker_secret_name" -
        
        log_info "Создан Docker секрет: $docker_secret_name"
    }
    
    # Экспорт всех секретов
    create_docker_secret "mixer/database" "password" "mixer_db_password"
    create_docker_secret "mixer/database" "replication_password" "mixer_db_replication_password"
    create_docker_secret "mixer/redis" "password" "mixer_redis_password"
    create_docker_secret "mixer/rabbitmq" "password" "mixer_rabbitmq_password"
    create_docker_secret "mixer/kong" "db_password" "mixer_kong_db_password"
    create_docker_secret "mixer/application" "jwt_secret" "mixer_jwt_secret"
    create_docker_secret "mixer/application" "encryption_key" "mixer_encryption_key"
    create_docker_secret "mixer/application" "master_key" "mixer_master_key"
    create_docker_secret "mixer/hsm" "pin" "mixer_hsm_pin"
    create_docker_secret "mixer/blockchain" "btc_rpc_password" "mixer_btc_rpc_password"
    create_docker_secret "mixer/blockchain" "eth_private_key" "mixer_eth_private_key"
    create_docker_secret "mixer/blockchain" "sol_private_key" "mixer_sol_private_key"
    create_docker_secret "mixer/monitoring" "grafana_admin_password" "mixer_grafana_admin_password"
    
    # SSL сертификаты
    if [ -f "$SECRETS_DIR/ssl/certificate.crt" ]; then
        if ! docker secret ls --format "{{.Name}}" | grep -q "^mixer_ssl_certificate$"; then
            docker secret create mixer_ssl_certificate "$SECRETS_DIR/ssl/certificate.crt"
        fi
    fi
    
    if [ -f "$SECRETS_DIR/ssl/private.key" ]; then
        if ! docker secret ls --format "{{.Name}}" | grep -q "^mixer_ssl_private_key$"; then
            docker secret create mixer_ssl_private_key "$SECRETS_DIR/ssl/private.key"
        fi
    fi
    
    log_success "Все секреты экспортированы в Docker Swarm"
}

# Ротация секретов
rotate_secrets() {
    local secret_type="${1:-all}"
    
    log_info "Ротация секретов типа: $secret_type"
    
    case "$secret_type" in
        "database")
            vault kv put mixer/database \
                password="$(generate_secure_password 32)" \
                replication_password="$(generate_secure_password 32)"
            ;;
        "redis")
            vault kv put mixer/redis \
                password="$(generate_secure_password 32)"
            ;;
        "application")
            vault kv put mixer/application \
                jwt_secret="$(generate_jwt_secret)" \
                encryption_key="$(generate_encryption_key 32)"
            ;;
        "ssl")
            generate_ssl_certificates
            ;;
        "all")
            rotate_secrets "database"
            rotate_secrets "redis"
            rotate_secrets "application"
            rotate_secrets "ssl"
            ;;
        *)
            log_error "Неизвестный тип секрета: $secret_type"
            exit 1
            ;;
    esac
    
    log_success "Ротация секретов $secret_type завершена"
}

# Резервное копирование секретов
backup_secrets() {
    local backup_dir="${1:-$SECRETS_DIR/backups/$(date +%Y%m%d_%H%M%S)}"
    
    log_info "Создание резервной копии секретов в: $backup_dir"
    
    mkdir -p "$backup_dir"
    
    # Экспорт всех секретов из Vault
    vault kv get -format=json mixer/database > "$backup_dir/database.json"
    vault kv get -format=json mixer/redis > "$backup_dir/redis.json"
    vault kv get -format=json mixer/rabbitmq > "$backup_dir/rabbitmq.json"
    vault kv get -format=json mixer/kong > "$backup_dir/kong.json"
    vault kv get -format=json mixer/application > "$backup_dir/application.json"
    vault kv get -format=json mixer/hsm > "$backup_dir/hsm.json"
    vault kv get -format=json mixer/blockchain > "$backup_dir/blockchain.json"
    vault kv get -format=json mixer/monitoring > "$backup_dir/monitoring.json"
    
    # Копирование SSL сертификатов
    if [ -d "$SECRETS_DIR/ssl" ]; then
        cp -r "$SECRETS_DIR/ssl" "$backup_dir/"
    fi
    
    # Копирование инициализационных данных Vault
    if [ -f "$SECRETS_DIR/vault-init.json" ]; then
        cp "$SECRETS_DIR/vault-init.json" "$backup_dir/"
    fi
    
    # Шифрование резервной копии
    tar -czf "$backup_dir.tar.gz" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")"
    rm -rf "$backup_dir"
    
    # Шифрование архива
    openssl enc -aes-256-cbc -salt -in "$backup_dir.tar.gz" -out "$backup_dir.tar.gz.enc" -pass pass:"$(generate_secure_password 32)"
    rm "$backup_dir.tar.gz"
    
    log_success "Резервная копия создана: $backup_dir.tar.gz.enc"
}

# Восстановление из резервной копии
restore_secrets() {
    local backup_file="$1"
    local decryption_password="$2"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Файл резервной копии не найден: $backup_file"
        exit 1
    fi
    
    log_info "Восстановление секретов из: $backup_file"
    
    # Расшифровка и распаковка
    local temp_dir=$(mktemp -d)
    openssl enc -aes-256-cbc -d -in "$backup_file" -out "$temp_dir/backup.tar.gz" -pass pass:"$decryption_password"
    tar -xzf "$temp_dir/backup.tar.gz" -C "$temp_dir"
    
    # Восстановление секретов в Vault
    local backup_content_dir=$(find "$temp_dir" -maxdepth 1 -type d | tail -1)
    
    for json_file in "$backup_content_dir"/*.json; do
        if [ -f "$json_file" ]; then
            local secret_name=$(basename "$json_file" .json)
            local secret_data=$(jq -r '.data.data' "$json_file")
            echo "$secret_data" | vault kv put "mixer/$secret_name" -
        fi
    done
    
    # Восстановление SSL сертификатов
    if [ -d "$backup_content_dir/ssl" ]; then
        cp -r "$backup_content_dir/ssl" "$SECRETS_DIR/"
        chmod 600 "$SECRETS_DIR/ssl/private.key"
        chmod 644 "$SECRETS_DIR/ssl/certificate.crt"
    fi
    
    # Очистка временных файлов
    rm -rf "$temp_dir"
    
    log_success "Секреты восстановлены из резервной копии"
}

# Проверка целостности секретов
verify_secrets() {
    log_info "Проверка целостности секретов..."
    
    local errors=0
    
    # Список обязательных секретов
    local required_secrets=(
        "mixer/database:password"
        "mixer/database:replication_password"
        "mixer/redis:password"
        "mixer/rabbitmq:password"
        "mixer/kong:db_password"
        "mixer/application:jwt_secret"
        "mixer/application:encryption_key"
        "mixer/application:master_key"
        "mixer/hsm:pin"
        "mixer/blockchain:btc_rpc_password"
        "mixer/monitoring:grafana_admin_password"
    )
    
    for secret in "${required_secrets[@]}"; do
        local path=$(echo "$secret" | cut -d: -f1)
        local key=$(echo "$secret" | cut -d: -f2)
        
        if ! vault kv get -field="$key" "$path" &>/dev/null; then
            log_error "Секрет не найден: $secret"
            ((errors++))
        else
            log_info "✓ Секрет найден: $secret"
        fi
    done
    
    # Проверка SSL сертификатов
    if [ -f "$SECRETS_DIR/ssl/certificate.crt" ] && [ -f "$SECRETS_DIR/ssl/private.key" ]; then
        if openssl x509 -in "$SECRETS_DIR/ssl/certificate.crt" -noout -checkend 86400; then
            log_info "✓ SSL сертификат действителен"
        else
            log_warning "SSL сертификат истекает в течение 24 часов"
        fi
    else
        log_error "SSL сертификаты не найдены"
        ((errors++))
    fi
    
    if [ $errors -eq 0 ]; then
        log_success "Все секреты в порядке"
        return 0
    else
        log_error "Найдено $errors ошибок в секретах"
        return 1
    fi
}

# Показать справку
show_help() {
    cat << EOF
Управление секретами для криптомиксера

Использование: $0 [КОМАНДА] [ОПЦИИ]

КОМАНДЫ:
    init                    Полная инициализация системы секретов
    generate-ssl [DOMAIN]   Генерация SSL сертификатов
    rotate [TYPE]           Ротация секретов (database|redis|application|ssl|all)
    backup [DIR]            Создание резервной копии секретов
    restore FILE PASS       Восстановление из резервной копии
    verify                  Проверка целостности секретов
    export                  Экспорт секретов в Docker Swarm
    help                    Показать эту справку

ПРИМЕРЫ:
    $0 init                                 # Полная инициализация
    $0 generate-ssl mixer.production.com    # Генерация SSL для домена
    $0 rotate application                   # Ротация секретов приложения
    $0 backup /backup/location              # Резервная копия
    $0 verify                               # Проверка секретов

ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:
    VAULT_ADDR              Адрес Vault сервера (по умолчанию: http://127.0.0.1:8200)
    VAULT_TOKEN_FILE        Путь к файлу токена Vault

EOF
}

# Основная функция
main() {
    local command="${1:-help}"
    
    # Создание директории для секретов
    mkdir -p "$SECRETS_DIR"
    
    case "$command" in
        "init")
            check_dependencies
            generate_ssl_certificates "${2:-mixer.local}"
            init_vault
            create_vault_secrets
            export_docker_secrets
            verify_secrets
            log_success "Инициализация секретов завершена успешно"
            ;;
        "generate-ssl")
            generate_ssl_certificates "${2:-mixer.local}"
            ;;
        "rotate")
            check_dependencies
            rotate_secrets "${2:-all}"
            export_docker_secrets
            ;;
        "backup")
            backup_secrets "$2"
            ;;
        "restore")
            if [ $# -lt 3 ]; then
                log_error "Использование: $0 restore <файл> <пароль>"
                exit 1
            fi
            restore_secrets "$2" "$3"
            ;;
        "verify")
            verify_secrets
            ;;
        "export")
            export_docker_secrets
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            log_error "Неизвестная команда: $command"
            show_help
            exit 1
            ;;
    esac
}

# Запуск скрипта
main "$@"