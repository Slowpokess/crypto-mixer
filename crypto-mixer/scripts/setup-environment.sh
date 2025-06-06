#!/bin/bash

# =============================================================================
# Crypto Mixer - Скрипт установки зависимостей и окружения
# =============================================================================

set -e  # Остановить выполнение при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для вывода
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка ОС
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command -v apt-get >/dev/null 2>&1; then
            DISTRO="ubuntu"
        elif command -v yum >/dev/null 2>&1; then
            DISTRO="centos"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        log_error "Неподдерживаемая операционная система: $OSTYPE"
        exit 1
    fi
    log_info "Обнаружена ОС: $OS"
}

# Проверка прав доступа
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Скрипт запущен от имени root. Рекомендуется запуск от обычного пользователя."
        read -p "Продолжить? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Установка базовых зависимостей
install_base_dependencies() {
    log_info "Установка базовых зависимостей..."
    
    case $OS in
        "linux")
            case $DISTRO in
                "ubuntu")
                    sudo apt-get update
                    sudo apt-get install -y curl wget git build-essential software-properties-common
                    ;;
                "centos")
                    sudo yum update -y
                    sudo yum install -y curl wget git gcc gcc-c++ make
                    ;;
            esac
            ;;
        "macos")
            if ! command -v brew >/dev/null 2>&1; then
                log_info "Установка Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew update
            brew install curl wget git
            ;;
    esac
    log_success "Базовые зависимости установлены"
}

# Установка Node.js
install_nodejs() {
    log_info "Установка Node.js..."
    
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        log_info "Node.js уже установлен: $NODE_VERSION"
        
        # Проверка версии (требуется >= 18)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [[ $NODE_MAJOR -lt 18 ]]; then
            log_warning "Требуется Node.js >= 18. Обновление..."
        else
            log_success "Версия Node.js подходит"
            return
        fi
    fi
    
    # Установка через NodeSource
    case $OS in
        "linux")
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            case $DISTRO in
                "ubuntu")
                    sudo apt-get install -y nodejs
                    ;;
                "centos")
                    sudo yum install -y nodejs npm
                    ;;
            esac
            ;;
        "macos")
            brew install node@20
            brew link node@20 --force
            ;;
    esac
    
    log_success "Node.js $(node --version) установлен"
}

# Установка Docker
install_docker() {
    log_info "Установка Docker..."
    
    if command -v docker >/dev/null 2>&1; then
        log_info "Docker уже установлен: $(docker --version)"
        return
    fi
    
    case $OS in
        "linux")
            case $DISTRO in
                "ubuntu")
                    # Удаление старых версий
                    sudo apt-get remove -y docker docker-engine docker.io containerd runc || true
                    
                    # Установка зависимостей
                    sudo apt-get install -y ca-certificates curl gnupg lsb-release
                    
                    # Добавление GPG ключа
                    sudo mkdir -p /etc/apt/keyrings
                    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                    
                    # Добавление репозитория
                    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                    
                    # Установка Docker
                    sudo apt-get update
                    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
                    ;;
                "centos")
                    sudo yum install -y yum-utils
                    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                    sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
                    ;;
            esac
            
            # Запуск Docker
            sudo systemctl start docker
            sudo systemctl enable docker
            
            # Добавление пользователя в группу docker
            sudo usermod -aG docker $USER
            ;;
            
        "macos")
            log_info "Для macOS рекомендуется установить Docker Desktop вручную"
            log_info "Скачайте с: https://www.docker.com/products/docker-desktop"
            read -p "Docker Desktop установлен? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_error "Установите Docker Desktop и запустите скрипт заново"
                exit 1
            fi
            ;;
    esac
    
    log_success "Docker установлен"
}

# Установка PostgreSQL
install_postgresql() {
    log_info "Установка PostgreSQL..."
    
    if command -v psql >/dev/null 2>&1; then
        log_info "PostgreSQL уже установлен"
        return
    fi
    
    case $OS in
        "linux")
            case $DISTRO in
                "ubuntu")
                    sudo apt-get install -y postgresql postgresql-contrib
                    ;;
                "centos")
                    sudo yum install -y postgresql postgresql-server postgresql-contrib
                    sudo postgresql-setup initdb
                    ;;
            esac
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            ;;
        "macos")
            brew install postgresql@15
            brew services start postgresql@15
            ;;
    esac
    
    log_success "PostgreSQL установлен"
}

# Установка Redis
install_redis() {
    log_info "Установка Redis..."
    
    if command -v redis-server >/dev/null 2>&1; then
        log_info "Redis уже установлен"
        return
    fi
    
    case $OS in
        "linux")
            case $DISTRO in
                "ubuntu")
                    sudo apt-get install -y redis-server
                    ;;
                "centos")
                    sudo yum install -y epel-release
                    sudo yum install -y redis
                    ;;
            esac
            sudo systemctl start redis
            sudo systemctl enable redis
            ;;
        "macos")
            brew install redis
            brew services start redis
            ;;
    esac
    
    log_success "Redis установлен"
}

# Создание переменных окружения
create_environment_files() {
    log_info "Создание файлов переменных окружения..."
    
    PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
    
    # Основной .env файл
    cat > "$PROJECT_ROOT/.env" << EOF
# =============================================================================
# Crypto Mixer - Переменные окружения
# =============================================================================

# Общие настройки
NODE_ENV=development
LOG_LEVEL=debug

# Базы данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cryptomixer
DB_USER=mixer_user
DB_PASSWORD=mixer_secure_password_123
DB_SSL=false
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_secure_password_123
REDIS_DB=0
REDIS_KEY_PREFIX=mixer:

# RabbitMQ
RABBITMQ_URL=amqp://mixer:rabbitmq_password_123@localhost:5672
RABBITMQ_PASSWORD=rabbitmq_password_123

# Безопасность
JWT_SECRET=jwt_super_secret_key_change_in_production_123456789
ENCRYPTION_KEY=encryption_key_32_chars_long_123456789
SESSION_SECRET=session_secret_key_change_in_production

# API URLs
BLOCKCHAIN_SERVICE_URL=http://localhost:3001
MIXER_API_URL=http://localhost:3000
WALLET_SERVICE_URL=http://localhost:3003
SCHEDULER_SERVICE_URL=http://localhost:3002

# Blockchain настройки
BTC_NODE_HOST=localhost
BTC_NODE_PORT=8332
BTC_RPC_USER=bitcoin_rpc_user
BTC_RPC_PASSWORD=bitcoin_rpc_password_123
BTC_NETWORK=testnet

ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
ETH_CHAIN_ID=11155111

SOL_RPC_URL=https://api.devnet.solana.com
TRON_API_URL=https://api.shasta.trongrid.io

# Tor настройки
TOR_PROXY_HOST=localhost
TOR_PROXY_PORT=9050
TOR_CONTROL_PORT=9051

# Мониторинг
GRAFANA_PASSWORD=grafana_admin_password_123
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001

# Kong API Gateway
KONG_DB_PASSWORD=kong_db_password_123

# Vault
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=vault_root_token_123

# HSM
HSM_ENABLED=false
HSM_PIN=123456
MASTER_KEY=master_key_32_chars_long_change_this

# Разрешенные домены
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Slack (для уведомлений)
SLACK_SECURITY_WEBHOOK=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# Лимиты
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

    # .env файл для development
    cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.development"
    
    # .env файл для production (с placeholder значениями)
    sed 's/development/production/g; s/localhost/PRODUCTION_HOST/g; s/_123/_CHANGE_IN_PRODUCTION/g' "$PROJECT_ROOT/.env" > "$PROJECT_ROOT/.env.production"
    
    # .env.example (без секретных данных)
    sed 's/=.*/=CHANGE_ME/g' "$PROJECT_ROOT/.env" > "$PROJECT_ROOT/.env.example"
    
    log_success "Файлы переменных окружения созданы"
    log_warning "ВАЖНО: Измените пароли и секретные ключи в .env файлах!"
}

# Установка зависимостей Node.js для всех сервисов
install_node_dependencies() {
    log_info "Установка зависимостей Node.js..."
    
    PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
    
    # Список сервисов с Node.js
    SERVICES=(
        "services/mixer-api"
        "services/blockchain-service"
        "services/scheduler-service"
        "services/wallet-service"
        "services/monitoring-service"
        "services/tor-proxy"
        "frontend"
        "admin-dashboard"
    )
    
    for service in "${SERVICES[@]}"; do
        SERVICE_PATH="$PROJECT_ROOT/$service"
        if [[ -f "$SERVICE_PATH/package.json" ]]; then
            log_info "Установка зависимостей для $service..."
            cd "$SERVICE_PATH"
            npm install
            log_success "Зависимости для $service установлены"
        else
            log_warning "package.json не найден в $service"
        fi
    done
    
    # Возврат в корневую директорию
    cd "$PROJECT_ROOT"
    
    # Установка зависимостей для корневого проекта (если есть)
    if [[ -f "package.json" ]]; then
        log_info "Установка зависимостей для корневого проекта..."
        npm install
    fi
    
    log_success "Все зависимости Node.js установлены"
}

# Инициализация базы данных
setup_database() {
    log_info "Настройка базы данных..."
    
    # Создание пользователя и базы данных
    sudo -u postgres psql << EOF
CREATE USER mixer_user WITH PASSWORD 'mixer_secure_password_123';
CREATE DATABASE cryptomixer OWNER mixer_user;
GRANT ALL PRIVILEGES ON DATABASE cryptomixer TO mixer_user;
\q
EOF
    
    # Выполнение SQL скрипта инициализации
    PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
    if [[ -f "$PROJECT_ROOT/scripts/postgres/init.sql" ]]; then
        sudo -u postgres psql -d cryptomixer -f "$PROJECT_ROOT/scripts/postgres/init.sql"
    fi
    
    log_success "База данных настроена"
}

# Создание директорий
create_directories() {
    log_info "Создание необходимых директорий..."
    
    PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
    
    DIRECTORIES=(
        "logs"
        "data"
        "uploads"
        "temp"
        "backups"
        "security/keys"
        "security/certificates"
        "security/vault/keys"
    )
    
    for dir in "${DIRECTORIES[@]}"; do
        mkdir -p "$PROJECT_ROOT/$dir"
        chmod 755 "$PROJECT_ROOT/$dir"
    done
    
    # Специальные права для security директории
    chmod 700 "$PROJECT_ROOT/security/keys"
    chmod 700 "$PROJECT_ROOT/security/vault/keys"
    
    log_success "Директории созданы"
}

# Создание systemd сервисов (только для Linux)
create_systemd_services() {
    if [[ $OS != "linux" ]]; then
        return
    fi
    
    log_info "Создание systemd сервисов..."
    
    PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
    
    # Mixer API Service
    sudo tee /etc/systemd/system/mixer-api.service > /dev/null << EOF
[Unit]
Description=Crypto Mixer API Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT/services/mixer-api
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_ROOT/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Blockchain Service
    sudo tee /etc/systemd/system/blockchain-service.service > /dev/null << EOF
[Unit]
Description=Crypto Mixer Blockchain Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT/services/blockchain-service
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_ROOT/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Scheduler Service
    sudo tee /etc/systemd/system/scheduler-service.service > /dev/null << EOF
[Unit]
Description=Crypto Mixer Scheduler Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT/services/scheduler-service
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_ROOT/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    
    log_success "Systemd сервисы созданы"
}

# Проверка установки
verify_installation() {
    log_info "Проверка установки..."
    
    CHECKS=(
        "node --version:Node.js"
        "npm --version:NPM"
        "docker --version:Docker"
        "psql --version:PostgreSQL"
        "redis-server --version:Redis"
    )
    
    ALL_OK=true
    
    for check in "${CHECKS[@]}"; do
        IFS=':' read -r cmd name <<< "$check"
        if command -v $(echo $cmd | cut -d' ' -f1) >/dev/null 2>&1; then
            VERSION=$($cmd 2>/dev/null | head -1 || echo "установлен")
            log_success "$name: $VERSION"
        else
            log_error "$name не установлен"
            ALL_OK=false
        fi
    done
    
    if $ALL_OK; then
        log_success "Все компоненты установлены успешно!"
    else
        log_error "Некоторые компоненты не установлены"
        return 1
    fi
}

# Основная функция
main() {
    echo "========================================"
    echo "  Crypto Mixer - Setup Environment"
    echo "========================================"
    echo
    
    detect_os
    check_permissions
    
    echo
    log_info "Начинаем установку зависимостей..."
    echo
    
    install_base_dependencies
    install_nodejs
    install_docker
    install_postgresql
    install_redis
    
    echo
    log_info "Настройка проекта..."
    echo
    
    create_environment_files
    create_directories
    install_node_dependencies
    setup_database
    create_systemd_services
    
    echo
    log_info "Проверка установки..."
    echo
    
    verify_installation
    
    echo
    echo "========================================"
    log_success "Установка завершена!"
    echo "========================================"
    echo
    log_info "Следующие шаги:"
    echo "1. Проверьте и измените пароли в .env файлах"
    echo "2. Запустите сервисы: ./scripts/start-services.sh"
    echo "3. Проверьте логи: docker-compose logs -f"
    echo
    if [[ $OS == "linux" ]]; then
        log_warning "ВАЖНО: Перелогиньтесь для применения прав группы docker"
    fi
}

# Запуск основной функции
main "$@"