#!/bin/bash

# =============================================================================
# Crypto Mixer - Скрипт просмотра логов
# =============================================================================

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

# Создание директории логов если не существует
mkdir -p logs

show_help() {
    echo "========================================"
    echo "  Crypto Mixer - View Logs"
    echo "========================================"
    echo
    echo "Использование: $0 [ОПЦИИ] [СЕРВИС]"
    echo
    echo "Сервисы:"
    echo "  mixer-api          - Mixer API сервис"
    echo "  blockchain         - Blockchain сервис"
    echo "  scheduler          - Scheduler сервис"
    echo "  frontend           - Frontend приложение"
    echo "  all                - Все сервисы"
    echo
    echo "Опции:"
    echo "  -f, --follow       - Следить за логами в реальном времени"
    echo "  -n, --lines NUM    - Показать последние NUM строк (по умолчанию 50)"
    echo "  -e, --errors       - Показать только ошибки"
    echo "  -s, --status       - Показать статус сервисов"
    echo "  -h, --help         - Показать эту справку"
    echo
    echo "Примеры:"
    echo "  $0 mixer-api             - Показать последние 50 строк mixer-api"
    echo "  $0 -f all               - Следить за всеми логами"
    echo "  $0 -n 100 blockchain    - Показать последние 100 строк blockchain"
    echo "  $0 -e scheduler         - Показать только ошибки scheduler"
}

show_status() {
    echo "========================================"
    echo "  Статус сервисов"
    echo "========================================"
    echo
    
    SERVICES=(
        "mixer-api:3000:/health"
        "blockchain-service:3001:/health"
        "scheduler-service:3002:/"
        "frontend:3000:/"
    )
    
    for service_info in "${SERVICES[@]}"; do
        IFS=':' read -r service port path <<< "$service_info"
        
        # Проверка PID файла
        pid_file="logs/${service}.pid"
        if [[ -f "$pid_file" ]]; then
            pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                status="🟢 RUNNING (PID: $pid)"
            else
                status="🔴 STOPPED (stale PID)"
                rm -f "$pid_file"
            fi
        else
            status="🔴 STOPPED"
        fi
        
        # Проверка доступности по HTTP
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}${path}" 2>/dev/null | grep -q "200\|404"; then
            http_status="✅ HTTP OK"
        else
            http_status="❌ HTTP FAIL"
        fi
        
        printf "%-20s %s %s\n" "$service" "$status" "$http_status"
    done
    
    echo
    
    # Docker сервисы
    echo "Docker сервисы:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(postgres|redis|rabbitmq)" || echo "Нет запущенных Docker сервисов"
}

show_logs() {
    local service=$1
    local lines=${LINES:-50}
    local follow=$2
    local errors_only=$3
    
    local log_file="logs/${service}.log"
    
    if [[ ! -f "$log_file" ]]; then
        log_warning "Лог файл не найден: $log_file"
        return 1
    fi
    
    echo "========================================"
    echo "  Логи: $service"
    echo "========================================"
    
    if [[ "$errors_only" == "true" ]]; then
        if [[ "$follow" == "true" ]]; then
            tail -f "$log_file" | grep -i --line-buffered "error\|fail\|exception"
        else
            tail -n "$lines" "$log_file" | grep -i "error\|fail\|exception"
        fi
    else
        if [[ "$follow" == "true" ]]; then
            tail -f "$log_file"
        else
            tail -n "$lines" "$log_file"
        fi
    fi
}

show_all_logs() {
    local lines=${LINES:-50}
    local follow=$1
    local errors_only=$2
    
    SERVICES=(
        "mixer-api"
        "blockchain-service"
        "scheduler-service"
        "frontend"
    )
    
    if [[ "$follow" == "true" ]]; then
        log_info "Следим за всеми логами (Ctrl+C для выхода)..."
        echo
        
        # Создание именованных каналов для каждого сервиса
        for service in "${SERVICES[@]}"; do
            log_file="logs/${service}.log"
            if [[ -f "$log_file" ]]; then
                if [[ "$errors_only" == "true" ]]; then
                    tail -f "$log_file" | sed "s/^/[$service] /" | grep -i --line-buffered "error\|fail\|exception" &
                else
                    tail -f "$log_file" | sed "s/^/[$service] /" &
                fi
            fi
        done
        
        # Ожидание сигнала завершения
        wait
    else
        for service in "${SERVICES[@]}"; do
            log_file="logs/${service}.log"
            if [[ -f "$log_file" ]]; then
                echo
                echo "========================================"
                echo "  $service (последние $lines строк)"
                echo "========================================"
                
                if [[ "$errors_only" == "true" ]]; then
                    tail -n "$lines" "$log_file" | grep -i "error\|fail\|exception" || echo "Ошибок не найдено"
                else
                    tail -n "$lines" "$log_file"
                fi
            else
                log_warning "Лог файл не найден: $log_file"
            fi
        done
    fi
}

# Парсинг аргументов
FOLLOW=false
LINES=50
ERRORS_ONLY=false
SHOW_STATUS=false
SERVICE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            LINES="$2"
            shift 2
            ;;
        -e|--errors)
            ERRORS_ONLY=true
            shift
            ;;
        -s|--status)
            SHOW_STATUS=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        mixer-api|blockchain|scheduler|frontend|all)
            SERVICE="$1"
            shift
            ;;
        *)
            echo "Неизвестная опция: $1"
            show_help
            exit 1
            ;;
    esac
done

# Основная логика
if [[ "$SHOW_STATUS" == "true" ]]; then
    show_status
    exit 0
fi

if [[ -z "$SERVICE" ]]; then
    show_help
    exit 1
fi

# Нормализация имен сервисов
case "$SERVICE" in
    blockchain)
        SERVICE="blockchain-service"
        ;;
    scheduler)
        SERVICE="scheduler-service"
        ;;
esac

if [[ "$SERVICE" == "all" ]]; then
    show_all_logs "$FOLLOW" "$ERRORS_ONLY"
else
    show_logs "$SERVICE" "$LINES" "$FOLLOW" "$ERRORS_ONLY"
fi