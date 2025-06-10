#!/bin/sh

# ============================================================================
# CRYPTO MIXER - ADVANCED HEALTH CHECK
# ============================================================================
# РУССКИЙ: Продвинутая проверка состояния приложения для продакшн
# Версия: 3.0.0
# Проверки: HTTP endpoints, database, redis, memory, disk, security

set -e

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

readonly SCRIPT_NAME="$(basename "$0")"
readonly HEALTH_LOG="/var/log/mixer/app/healthcheck.log"
readonly HEALTH_STATUS_FILE="/var/run/mixer/health"
readonly PID_FILE="/var/run/mixer/app.pid"

# Настройки проверок
readonly HTTP_TIMEOUT=10
readonly MAX_MEMORY_USAGE=90  # %
readonly MAX_DISK_USAGE=85   # %
readonly MAX_CPU_USAGE=95    # %
readonly MAX_LOAD_AVERAGE=10.0

# URL для проверок
readonly HEALTH_URL="${HEALTH_URL:-http://localhost:${API_PORT:-5000}/health}"
readonly METRICS_URL="${METRICS_URL:-http://localhost:${API_PORT:-5000}/metrics}"
readonly READY_URL="${READY_URL:-http://localhost:${API_PORT:-5000}/ready}"

# ============================================================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$level] [$timestamp] $message" >> "$HEALTH_LOG"
}

log_debug() {
    if [ "${DEBUG_HEALTH:-false}" = "true" ]; then
        log "DEBUG" "$@"
    fi
}

# ============================================================================
# ОСНОВНЫЕ ПРОВЕРКИ ЗДОРОВЬЯ
# ============================================================================

check_process() {
    log_debug "Проверка процесса приложения..."
    
    if [ ! -f "$PID_FILE" ]; then
        log "ERROR" "PID файл не найден: $PID_FILE"
        return 1
    fi
    
    local app_pid=$(cat "$PID_FILE")
    if ! kill -0 "$app_pid" 2>/dev/null; then
        log "ERROR" "Процесс приложения не найден (PID: $app_pid)"
        return 1
    fi
    
    log_debug "Процесс работает (PID: $app_pid)"
    return 0
}

check_http_endpoints() {
    log_debug "Проверка HTTP endpoints..."
    
    # Проверка основного health endpoint
    if ! curl -f -s --max-time "$HTTP_TIMEOUT" "$HEALTH_URL" >/dev/null 2>&1; then
        log "ERROR" "Health endpoint недоступен: $HEALTH_URL"
        return 1
    fi
    
    # Проверка readiness endpoint
    if ! curl -f -s --max-time "$HTTP_TIMEOUT" "$READY_URL" >/dev/null 2>&1; then
        log "WARN" "Readiness endpoint недоступен: $READY_URL"
        # Не критично для health check
    fi
    
    log_debug "HTTP endpoints доступны"
    return 0
}

check_database_connection() {
    log_debug "Проверка подключения к базе данных..."
    
    if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ]; then
        log_debug "Параметры БД не настроены, пропускаем проверку"
        return 0
    fi
    
    if ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
        log "ERROR" "База данных недоступна: $DB_HOST:$DB_PORT"
        return 1
    fi
    
    log_debug "База данных доступна"
    return 0
}

check_redis_connection() {
    log_debug "Проверка подключения к Redis..."
    
    if [ -z "$REDIS_HOST" ] || [ -z "$REDIS_PORT" ]; then
        log_debug "Параметры Redis не настроены, пропускаем проверку"
        return 0
    fi
    
    if ! nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
        log "WARN" "Redis недоступен: $REDIS_HOST:$REDIS_PORT"
        # Redis недоступность не критична для health check
        return 0
    fi
    
    log_debug "Redis доступен"
    return 0
}

# ============================================================================
# СИСТЕМНЫЕ ПРОВЕРКИ
# ============================================================================

check_memory_usage() {
    log_debug "Проверка использования памяти..."
    
    # Получение информации о памяти
    if command -v free >/dev/null 2>&1; then
        local memory_info=$(free | grep '^Mem:')
        local total_mem=$(echo "$memory_info" | awk '{print $2}')
        local used_mem=$(echo "$memory_info" | awk '{print $3}')
        local memory_usage=$((used_mem * 100 / total_mem))
        
        if [ "$memory_usage" -gt "$MAX_MEMORY_USAGE" ]; then
            log "WARN" "Высокое использование памяти: ${memory_usage}%"
            return 1
        fi
        
        log_debug "Использование памяти: ${memory_usage}%"
    else
        log_debug "Команда free недоступна, пропускаем проверку памяти"
    fi
    
    return 0
}

check_disk_usage() {
    log_debug "Проверка использования диска..."
    
    # Проверка основной файловой системы
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -gt "$MAX_DISK_USAGE" ]; then
        log "WARN" "Высокое использование диска: ${disk_usage}%"
        return 1
    fi
    
    # Проверка логового раздела
    if [ -d "/var/log/mixer" ]; then
        local log_disk_usage=$(df /var/log/mixer | tail -1 | awk '{print $5}' | sed 's/%//')
        if [ "$log_disk_usage" -gt "$MAX_DISK_USAGE" ]; then
            log "WARN" "Высокое использование диска для логов: ${log_disk_usage}%"
        fi
    fi
    
    log_debug "Использование диска: ${disk_usage}%"
    return 0
}

check_cpu_load() {
    log_debug "Проверка загрузки CPU..."
    
    if command -v uptime >/dev/null 2>&1; then
        local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
        
        # Проверка на числовое значение
        if echo "$load_avg" | grep -E '^[0-9]+\.?[0-9]*$' >/dev/null; then
            # Сравнение с пороговым значением (упрощенное)
            if awk "BEGIN {exit !($load_avg > $MAX_LOAD_AVERAGE)}"; then
                log "WARN" "Высокая загрузка системы: $load_avg"
                return 1
            fi
            
            log_debug "Загрузка системы: $load_avg"
        fi
    fi
    
    return 0
}

# ============================================================================
# ПРОВЕРКИ БЕЗОПАСНОСТИ
# ============================================================================

check_security_status() {
    log_debug "Проверка состояния безопасности..."
    
    # Проверка прав доступа к критическим файлам
    local critical_files="/app/dist/server.js $PID_FILE"
    
    for file in $critical_files; do
        if [ -f "$file" ]; then
            local file_perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%Mp%Lp" "$file" 2>/dev/null)
            log_debug "Права доступа $file: $file_perms"
        fi
    done
    
    # Проверка, что приложение не запущено от root
    if [ "$(id -u)" = "0" ]; then
        log "ERROR" "КРИТИЧЕСКАЯ ОШИБКА: Приложение запущено от root!"
        return 1
    fi
    
    log_debug "Проверки безопасности пройдены"
    return 0
}

# ============================================================================
# СПЕЦИФИЧНЫЕ ПРОВЕРКИ ДЛЯ КРИПТОМИКСЕРА
# ============================================================================

check_mixer_services() {
    log_debug "Проверка специфичных сервисов миксера..."
    
    # Проверка состояния HSM (если включен)
    if [ "${HSM_ENABLED:-false}" = "true" ]; then
        if ! curl -f -s --max-time 5 "http://localhost:${API_PORT:-5000}/hsm/status" >/dev/null 2>&1; then
            log "WARN" "HSM статус недоступен"
        else
            log_debug "HSM статус доступен"
        fi
    fi
    
    # Проверка состояния Vault (если включен)
    if [ "${VAULT_ENABLED:-false}" = "true" ] && [ -n "$VAULT_ADDR" ]; then
        if ! curl -f -s --max-time 5 "$VAULT_ADDR/v1/sys/health" >/dev/null 2>&1; then
            log "WARN" "Vault недоступен: $VAULT_ADDR"
        else
            log_debug "Vault доступен"
        fi
    fi
    
    return 0
}

check_blockchain_connections() {
    log_debug "Проверка подключений к блокчейнам..."
    
    # Проверка через внутренний API
    if curl -f -s --max-time 10 "http://localhost:${API_PORT:-5000}/blockchain/status" >/dev/null 2>&1; then
        log_debug "Статус блокчейн подключений доступен"
    else
        log "WARN" "Статус блокчейн подключений недоступен"
    fi
    
    return 0
}

# ============================================================================
# СВОДНАЯ ПРОВЕРКА И ОТЧЕТ
# ============================================================================

generate_health_report() {
    log_debug "Генерация отчета о состоянии..."
    
    local report_file="/var/cache/mixer/health-report.json"
    local timestamp=$(date -Iseconds)
    
    # Создание JSON отчета
    cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "status": "healthy",
  "version": "3.0.0",
  "uptime": "$(uptime -p 2>/dev/null || echo 'unknown')",
  "memory_usage": "$(free | grep '^Mem:' | awk '{printf "%.1f%%", $3/$2 * 100.0}' 2>/dev/null || echo 'unknown')",
  "disk_usage": "$(df / | tail -1 | awk '{print $5}' || echo 'unknown')",
  "load_average": "$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//' || echo 'unknown')",
  "process_id": "$(cat "$PID_FILE" 2>/dev/null || echo 'unknown')",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')"
}
EOF
    
    log_debug "Отчет создан: $report_file"
}

# ============================================================================
# ОСНОВНАЯ ЛОГИКА
# ============================================================================

main() {
    local exit_code=0
    local failed_checks=""
    
    log_debug "=== HEALTH CHECK START ==="
    
    # Проверка статуса из файла
    if [ -f "$HEALTH_STATUS_FILE" ]; then
        local status=$(cat "$HEALTH_STATUS_FILE")
        case "$status" in
            "starting")
                log_debug "Приложение еще запускается..."
                exit 1
                ;;
            "shutting-down")
                log_debug "Приложение завершается..."
                exit 1
                ;;
            "ready")
                log_debug "Приложение готово к проверкам"
                ;;
            *)
                log "WARN" "Неизвестный статус: $status"
                ;;
        esac
    fi
    
    # Выполнение всех проверок
    local checks="check_process check_http_endpoints check_database_connection check_redis_connection check_memory_usage check_disk_usage check_cpu_load check_security_status check_mixer_services check_blockchain_connections"
    
    for check in $checks; do
        if ! $check; then
            failed_checks="$failed_checks $check"
            exit_code=1
        fi
    done
    
    # Генерация отчета
    generate_health_report
    
    # Результат
    if [ $exit_code -eq 0 ]; then
        log_debug "=== HEALTH CHECK PASSED ==="
        echo "healthy"
    else
        log "ERROR" "=== HEALTH CHECK FAILED === Провалились проверки:$failed_checks"
        echo "unhealthy"
    fi
    
    log_debug "=== HEALTH CHECK END ==="
    
    exit $exit_code
}

# ============================================================================
# ОБРАБОТКА АРГУМЕНТОВ
# ============================================================================

case "${1:-}" in
    --help|-h)
        echo "Crypto Mixer Health Check v3.0.0"
        echo "Использование: $0 [опции]"
        echo ""
        echo "Опции:"
        echo "  --help, -h     Показать справку"
        echo "  --verbose, -v  Подробный вывод"
        echo "  --report       Показать последний отчет"
        echo ""
        echo "Переменные окружения:"
        echo "  DEBUG_HEALTH=true    Включить отладочные сообщения"
        echo "  HEALTH_URL          URL для проверки здоровья"
        echo "  MAX_MEMORY_USAGE    Максимальное использование памяти (%)"
        echo "  MAX_DISK_USAGE      Максимальное использование диска (%)"
        exit 0
        ;;
    --verbose|-v)
        export DEBUG_HEALTH=true
        main
        ;;
    --report)
        if [ -f "/var/cache/mixer/health-report.json" ]; then
            cat "/var/cache/mixer/health-report.json"
        else
            echo "Отчет не найден"
            exit 1
        fi
        ;;
    *)
        main
        ;;
esac