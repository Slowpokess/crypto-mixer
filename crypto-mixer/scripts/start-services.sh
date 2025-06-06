#!/bin/bash

# =============================================================================
# Crypto Mixer - Скрипт запуска всех сервисов
# =============================================================================

set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
cd "$PROJECT_ROOT"

# Проверка .env файла
if [[ ! -f ".env" ]]; then
    log_warning ".env файл не найден. Создание из примера..."
    if [[ -f ".env.example" ]]; then
        cp .env.example .env
        log_warning "Отредактируйте .env файл перед запуском сервисов"
        exit 1
    else
        log_warning "Запустите scripts/setup-environment.sh для создания .env файлов"
        exit 1
    fi
fi

# Загрузка переменных окружения
source .env

echo "========================================"
echo "  Crypto Mixer - Starting Services"
echo "========================================"
echo

# 1. Запуск Docker сервисов (PostgreSQL, Redis, RabbitMQ)
log_info "Запуск базовых сервисов через Docker..."

docker-compose -f deployment/docker/docker-compose.production.yml up -d postgres-master redis-master rabbitmq

# Ожидание готовности сервисов
log_info "Ожидание готовности базы данных..."
sleep 10

# Проверка подключения к PostgreSQL
until docker exec crypto-mixer_postgres-master_1 pg_isready -U mixer_user 2>/dev/null; do
    log_info "Ожидание PostgreSQL..."
    sleep 2
done
log_success "PostgreSQL готов"

# Проверка подключения к Redis
until docker exec crypto-mixer_redis-master_1 redis-cli ping 2>/dev/null | grep -q PONG; do
    log_info "Ожидание Redis..."
    sleep 2
done
log_success "Redis готов"

# 2. Компиляция TypeScript проектов
log_info "Компиляция TypeScript проектов..."

TYPESCRIPT_SERVICES=(
    "services/mixer-api"
    "services/blockchain-service"
    "services/scheduler-service"
)

for service in "${TYPESCRIPT_SERVICES[@]}"; do
    if [[ -f "$service/tsconfig.json" ]]; then
        log_info "Компиляция $service..."
        cd "$service"
        npm run build
        cd "$PROJECT_ROOT"
        log_success "$service скомпилирован"
    fi
done

# 3. Запуск Node.js сервисов
log_info "Запуск Node.js сервисов..."

# Mixer API (порт 3000)
log_info "Запуск Mixer API..."
cd services/mixer-api
NODE_ENV=development npm start > ../../logs/mixer-api.log 2>&1 &
MIXER_API_PID=$!
echo $MIXER_API_PID > ../../logs/mixer-api.pid
cd "$PROJECT_ROOT"

# Blockchain Service (порт 3001)
log_info "Запуск Blockchain Service..."
cd services/blockchain-service
NODE_ENV=development npm start > ../../logs/blockchain-service.log 2>&1 &
BLOCKCHAIN_PID=$!
echo $BLOCKCHAIN_PID > ../../logs/blockchain-service.pid
cd "$PROJECT_ROOT"

# Scheduler Service (порт 3002)
log_info "Запуск Scheduler Service..."
cd services/scheduler-service
NODE_ENV=development npm start > ../../logs/scheduler-service.log 2>&1 &
SCHEDULER_PID=$!
echo $SCHEDULER_PID > ../../logs/scheduler-service.pid
cd "$PROJECT_ROOT"

# 4. Запуск Frontend
if [[ -f "frontend/package.json" ]]; then
    log_info "Запуск Frontend..."
    cd frontend
    npm start > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../logs/frontend.pid
    cd "$PROJECT_ROOT"
fi

# 5. Ожидание готовности сервисов
log_info "Проверка готовности сервисов..."
sleep 5

# Функция проверки доступности сервиса
check_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|404"; then
            log_success "$name доступен"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    
    log_warning "$name недоступен после $max_attempts попыток"
    return 1
}

# Проверка сервисов
check_service "http://localhost:3000/health" "Mixer API"
check_service "http://localhost:3001/health" "Blockchain Service" 
check_service "http://localhost:3002" "Scheduler Service"

if [[ -f "frontend/package.json" ]]; then
    check_service "http://localhost:3000" "Frontend"
fi

echo
echo "========================================"
log_success "Все сервисы запущены!"
echo "========================================"
echo
echo "Доступные сервисы:"
echo "- Mixer API:         http://localhost:3000"
echo "- Blockchain API:    http://localhost:3001"
echo "- Scheduler Service: http://localhost:3002"
echo "- Frontend:          http://localhost:3000"
echo "- PostgreSQL:        localhost:5432"
echo "- Redis:             localhost:6379"
echo
echo "Логи сервисов в директории: logs/"
echo "PID файлы в директории: logs/"
echo
echo "Для остановки сервисов: ./scripts/stop-services.sh"
echo "Для просмотра логов: ./scripts/view-logs.sh"