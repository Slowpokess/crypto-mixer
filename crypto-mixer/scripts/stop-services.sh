#!/bin/bash

# =============================================================================
# Crypto Mixer - Скрипт остановки всех сервисов
# =============================================================================

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
cd "$PROJECT_ROOT"

echo "========================================"
echo "  Crypto Mixer - Stopping Services"
echo "========================================"
echo

# Функция остановки процесса по PID файлу
stop_service() {
    local service_name=$1
    local pid_file="logs/${service_name}.pid"
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Остановка $service_name (PID: $pid)..."
            kill "$pid"
            
            # Ожидание корректного завершения
            local attempts=0
            while kill -0 "$pid" 2>/dev/null && [[ $attempts -lt 10 ]]; do
                sleep 1
                attempts=$((attempts + 1))
            done
            
            # Принудительная остановка если процесс не завершился
            if kill -0 "$pid" 2>/dev/null; then
                log_info "Принудительная остановка $service_name..."
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$pid_file"
            log_success "$service_name остановлен"
        else
            log_info "$service_name уже остановлен"
            rm -f "$pid_file"
        fi
    else
        log_info "PID файл для $service_name не найден"
    fi
}

# 1. Остановка Node.js сервисов
log_info "Остановка Node.js сервисов..."

SERVICES=(
    "mixer-api"
    "blockchain-service"
    "scheduler-service"
    "frontend"
)

for service in "${SERVICES[@]}"; do
    stop_service "$service"
done

# 2. Остановка процессов по имени (резервный способ)
log_info "Поиск и остановка оставшихся процессов..."

PROCESS_PATTERNS=(
    "mixer-api"
    "blockchain-service"
    "scheduler-service"
)

for pattern in "${PROCESS_PATTERNS[@]}"; do
    if pgrep -f "$pattern" > /dev/null; then
        log_info "Остановка процессов: $pattern"
        pkill -f "$pattern" || true
        sleep 2
        # Принудительная остановка если нужно
        pkill -9 -f "$pattern" 2>/dev/null || true
    fi
done

# 3. Остановка Docker сервисов
log_info "Остановка Docker сервисов..."

if [[ -f "deployment/docker/docker-compose.production.yml" ]]; then
    docker-compose -f deployment/docker/docker-compose.production.yml down
    log_success "Docker сервисы остановлены"
else
    log_info "Docker compose файл не найден, остановка вручную..."
    
    # Остановка отдельных контейнеров
    CONTAINERS=(
        "crypto-mixer_postgres-master_1"
        "crypto-mixer_redis-master_1"
        "crypto-mixer_rabbitmq_1"
    )
    
    for container in "${CONTAINERS[@]}"; do
        if docker ps -q -f name="$container" | grep -q .; then
            log_info "Остановка контейнера: $container"
            docker stop "$container" || true
        fi
    done
fi

# 4. Очистка временных файлов
log_info "Очистка временных файлов..."

# Удаление старых PID файлов
rm -f logs/*.pid

# Очистка логов разработки (опционально)
if [[ "$1" == "--clean-logs" ]]; then
    log_info "Очистка логов..."
    rm -f logs/*.log
    log_success "Логи очищены"
fi

# 5. Проверка оставшихся процессов
log_info "Проверка оставшихся процессов..."

REMAINING=false
for pattern in "${PROCESS_PATTERNS[@]}"; do
    if pgrep -f "$pattern" > /dev/null; then
        log_error "Процесс $pattern все еще запущен"
        REMAINING=true
    fi
done

if $REMAINING; then
    echo
    log_error "Некоторые процессы не были остановлены. Проверьте вручную:"
    ps aux | grep -E "(mixer-api|blockchain-service|scheduler-service)" | grep -v grep || true
    echo
    log_info "Для принудительной остановки: killall -9 node"
else
    log_success "Все процессы остановлены"
fi

echo
echo "========================================"
log_success "Остановка сервисов завершена!"
echo "========================================"
echo
log_info "Для запуска сервисов: ./scripts/start-services.sh"
if [[ "$1" != "--clean-logs" ]]; then
    log_info "Для очистки логов: ./scripts/stop-services.sh --clean-logs"
fi