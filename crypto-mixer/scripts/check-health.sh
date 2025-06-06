#!/bin/bash

# =============================================================================
# Crypto Mixer - Скрипт проверки здоровья системы
# =============================================================================

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

PROJECT_ROOT="/Users/macbook/Documents/CM/crypto-mixer"
cd "$PROJECT_ROOT"

echo "========================================"
echo "  Crypto Mixer - Health Check"
echo "========================================"
echo

OVERALL_STATUS=0

# Функция проверки HTTP эндпоинта
check_http_endpoint() {
    local url=$1
    local name=$2
    local expected_codes=$3
    
    echo -n "Проверка $name... "
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    
    if echo "$expected_codes" | grep -q "$http_code"; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}✗${NC} (HTTP $http_code)"
        return 1
    fi
}

# Функция проверки процесса
check_process() {
    local process_name=$1
    local pid_file="logs/${process_name}.pid"
    
    echo -n "Проверка процесса $process_name... "
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} (PID: $pid)"
            return 0
        else
            echo -e "${RED}✗${NC} (процесс не найден)"
            rm -f "$pid_file"
            return 1
        fi
    else
        echo -e "${RED}✗${NC} (PID файл не найден)"
        return 1
    fi
}

# Функция проверки Docker контейнера
check_docker_container() {
    local container_pattern=$1
    local name=$2
    
    echo -n "Проверка $name... "
    
    if docker ps --format "table {{.Names}}" | grep -q "$container_pattern"; then
        local status=$(docker ps --format "{{.Status}}" --filter "name=$container_pattern" | head -1)
        if echo "$status" | grep -q "Up"; then
            echo -e "${GREEN}✓${NC} ($status)"
            return 0
        else
            echo -e "${RED}✗${NC} ($status)"
            return 1
        fi
    else
        echo -e "${RED}✗${NC} (контейнер не найден)"
        return 1
    fi
}

# Функция проверки соединения с базой данных
check_database_connection() {
    echo -n "Проверка подключения к PostgreSQL... "
    
    if command -v psql >/dev/null 2>&1; then
        if PGPASSWORD=mixer_secure_password_123 psql -h localhost -U mixer_user -d cryptomixer -c "SELECT 1;" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
            return 0
        else
            echo -e "${RED}✗${NC} (нет подключения)"
            return 1
        fi
    else
        echo -e "${YELLOW}?${NC} (psql не установлен)"
        return 1
    fi
}

# Функция проверки соединения с Redis
check_redis_connection() {
    echo -n "Проверка подключения к Redis... "
    
    if command -v redis-cli >/dev/null 2>&1; then
        if redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓${NC}"
            return 0
        else
            echo -e "${RED}✗${NC} (нет подключения)"
            return 1
        fi
    else
        echo -e "${YELLOW}?${NC} (redis-cli не установлен)"
        return 1
    fi
}

# Функция проверки дискового пространства
check_disk_space() {
    echo -n "Проверка дискового пространства... "
    
    local usage=$(df . | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [[ $usage -lt 80 ]]; then
        echo -e "${GREEN}✓${NC} (${usage}% использовано)"
        return 0
    elif [[ $usage -lt 90 ]]; then
        echo -e "${YELLOW}!${NC} (${usage}% использовано)"
        return 1
    else
        echo -e "${RED}✗${NC} (${usage}% использовано)"
        return 1
    fi
}

# Функция проверки памяти
check_memory_usage() {
    echo -n "Проверка использования памяти... "
    
    if command -v free >/dev/null 2>&1; then
        local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
        
        if [[ $mem_usage -lt 80 ]]; then
            echo -e "${GREEN}✓${NC} (${mem_usage}% использовано)"
            return 0
        elif [[ $mem_usage -lt 90 ]]; then
            echo -e "${YELLOW}!${NC} (${mem_usage}% использовано)"
            return 1
        else
            echo -e "${RED}✗${NC} (${mem_usage}% использовано)"
            return 1
        fi
    else
        # macOS
        local mem_pressure=$(memory_pressure | grep "System-wide memory free percentage" | awk '{print $5}' | sed 's/%//')
        if [[ -n "$mem_pressure" ]]; then
            if [[ $mem_pressure -gt 20 ]]; then
                echo -e "${GREEN}✓${NC} (${mem_pressure}% свободно)"
                return 0
            else
                echo -e "${YELLOW}!${NC} (${mem_pressure}% свободно)"
                return 1
            fi
        else
            echo -e "${YELLOW}?${NC} (не удалось определить)"
            return 1
        fi
    fi
}

# Функция проверки логов на ошибки
check_recent_errors() {
    echo -n "Проверка последних ошибок в логах... "
    
    local error_count=0
    local log_files=(
        "logs/mixer-api.log"
        "logs/blockchain-service.log"
        "logs/scheduler-service.log"
    )
    
    for log_file in "${log_files[@]}"; do
        if [[ -f "$log_file" ]]; then
            # Проверка ошибок за последние 10 минут
            local recent_errors=$(find "$log_file" -newermt "10 minutes ago" -exec grep -i "error\|fail\|exception" {} \; 2>/dev/null | wc -l)
            error_count=$((error_count + recent_errors))
        fi
    done
    
    if [[ $error_count -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} (ошибок не найдено)"
        return 0
    elif [[ $error_count -lt 5 ]]; then
        echo -e "${YELLOW}!${NC} ($error_count ошибок за 10 минут)"
        return 1
    else
        echo -e "${RED}✗${NC} ($error_count ошибок за 10 минут)"
        return 1
    fi
}

# Основные проверки
echo "1. Проверка системных ресурсов:"
check_disk_space || OVERALL_STATUS=1
check_memory_usage || OVERALL_STATUS=1
echo

echo "2. Проверка базовых сервисов:"
check_docker_container "postgres" "PostgreSQL" || OVERALL_STATUS=1
check_docker_container "redis" "Redis" || OVERALL_STATUS=1
check_docker_container "rabbitmq" "RabbitMQ" || OVERALL_STATUS=1
echo

echo "3. Проверка соединений:"
check_database_connection || OVERALL_STATUS=1
check_redis_connection || OVERALL_STATUS=1
echo

echo "4. Проверка Node.js сервисов:"
check_process "mixer-api" || OVERALL_STATUS=1
check_process "blockchain-service" || OVERALL_STATUS=1
check_process "scheduler-service" || OVERALL_STATUS=1
echo

echo "5. Проверка HTTP эндпоинтов:"
check_http_endpoint "http://localhost:3000/health" "Mixer API Health" "200" || OVERALL_STATUS=1
check_http_endpoint "http://localhost:3001/health" "Blockchain API Health" "200" || OVERALL_STATUS=1
check_http_endpoint "http://localhost:3000/api/v1/mixer/fees" "Mixer API Fees" "200" || OVERALL_STATUS=1
echo

echo "6. Проверка логов:"
check_recent_errors || OVERALL_STATUS=1
echo

# Дополнительные проверки производительности
echo "7. Проверка производительности:"

# Проверка времени отклика API
echo -n "Время отклика Mixer API... "
start_time=$(date +%s%N)
if curl -s -o /dev/null "http://localhost:3000/health" 2>/dev/null; then
    end_time=$(date +%s%N)
    response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [[ $response_time -lt 1000 ]]; then
        echo -e "${GREEN}✓${NC} (${response_time}ms)"
    elif [[ $response_time -lt 3000 ]]; then
        echo -e "${YELLOW}!${NC} (${response_time}ms)"
        OVERALL_STATUS=1
    else
        echo -e "${RED}✗${NC} (${response_time}ms)"
        OVERALL_STATUS=1
    fi
else
    echo -e "${RED}✗${NC} (недоступен)"
    OVERALL_STATUS=1
fi

# Проверка загрузки процессора
echo -n "Загрузка процессора... "
if command -v top >/dev/null 2>&1; then
    # Получение средней загрузки за 1 минуту
    load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    cpu_cores=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1")
    load_percentage=$(echo "scale=0; $load_avg * 100 / $cpu_cores" | bc 2>/dev/null || echo "0")
    
    if [[ $load_percentage -lt 70 ]]; then
        echo -e "${GREEN}✓${NC} (${load_percentage}%)"
    elif [[ $load_percentage -lt 90 ]]; then
        echo -e "${YELLOW}!${NC} (${load_percentage}%)"
        OVERALL_STATUS=1
    else
        echo -e "${RED}✗${NC} (${load_percentage}%)"
        OVERALL_STATUS=1
    fi
else
    echo -e "${YELLOW}?${NC} (не удалось определить)"
fi

echo

# Результат
echo "========================================"
if [[ $OVERALL_STATUS -eq 0 ]]; then
    log_success "Все проверки прошли успешно! Система работает нормально."
else
    log_warning "Обнаружены проблемы. Проверьте предупреждения выше."
fi
echo "========================================"

# Дополнительная информация
echo
log_info "Дополнительная информация:"
echo "- Просмотр логов: ./scripts/view-logs.sh"
echo "- Статус сервисов: ./scripts/view-logs.sh -s"
echo "- Перезапуск сервисов: ./scripts/stop-services.sh && ./scripts/start-services.sh"

exit $OVERALL_STATUS