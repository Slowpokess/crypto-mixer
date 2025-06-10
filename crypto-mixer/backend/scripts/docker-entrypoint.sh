#!/bin/sh

# ============================================================================
# CRYPTO MIXER - PRODUCTION DOCKER ENTRYPOINT
# ============================================================================
# РУССКИЙ: Продакшн entrypoint с максимальной надежностью и мониторингом
# Версия: 3.0.0
# Особенности: Health checks, logging, security, graceful shutdown

set -e

# ============================================================================
# КОНСТАНТЫ И КОНФИГУРАЦИЯ
# ============================================================================

readonly SCRIPT_NAME="$(basename "$0")"
readonly LOG_FILE="/var/log/mixer/app/entrypoint.log"
readonly PID_FILE="/var/run/mixer/app.pid"
readonly HEALTH_CHECK_FILE="/var/run/mixer/health"

# Цвета для логирования
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# ============================================================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} [$timestamp] $message" | tee -a "$LOG_FILE" >&2
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} [$timestamp] $message" | tee -a "$LOG_FILE" >&2
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} [$timestamp] $message" | tee -a "$LOG_FILE" >&2
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} [$timestamp] $message" | tee -a "$LOG_FILE" >&2
            ;;
        *)
            echo "[$timestamp] $level $message" | tee -a "$LOG_FILE" >&2
            ;;
    esac
}

# ============================================================================
# ПРОВЕРКИ БЕЗОПАСНОСТИ И ОКРУЖЕНИЯ
# ============================================================================

check_security() {
    log "INFO" "Проверка безопасности контейнера..."
    
    # Проверка пользователя (не root)
    if [ "$(id -u)" = "0" ]; then
        log "ERROR" "КРИТИЧЕСКАЯ ОШИБКА: Приложение не должно запускаться от root!"
        exit 1
    fi
    
    # Проверка обязательных переменных окружения
    local required_vars="NODE_ENV"
    for var in $required_vars; do
        if [ -z "$(eval echo \$$var)" ]; then
            log "ERROR" "Отсутствует обязательная переменная окружения: $var"
            exit 1
        fi
    done
    
    # Проверка прав доступа к критическим директориям
    if [ ! -w "/var/log/mixer/app" ]; then
        log "ERROR" "Нет прав записи в /var/log/mixer/app"
        exit 1
    fi
    
    if [ ! -w "/var/run/mixer" ]; then
        log "ERROR" "Нет прав записи в /var/run/mixer"
        exit 1
    fi
    
    log "SUCCESS" "Проверки безопасности пройдены"
}

# ============================================================================
# ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
# ============================================================================

init_application() {
    log "INFO" "Инициализация приложения..."
    
    # Создание необходимых директорий
    mkdir -p /var/log/mixer/{app,security,audit,performance}
    mkdir -p /var/run/mixer
    mkdir -p /var/cache/mixer
    
    # Проверка наличия скомпилированного кода
    if [ ! -f "/app/dist/server.js" ]; then
        log "ERROR" "Файл server.js не найден в /app/dist/"
        exit 1
    fi
    
    # Проверка package.json
    if [ ! -f "/app/package.json" ]; then
        log "ERROR" "Файл package.json не найден"
        exit 1
    fi
    
    # Проверка node_modules
    if [ ! -d "/app/node_modules" ]; then
        log "ERROR" "Директория node_modules не найдена"
        exit 1
    fi
    
    log "SUCCESS" "Инициализация завершена"
}

# ============================================================================
# НАСТРОЙКА ЛОГИРОВАНИЯ
# ============================================================================

setup_logging() {
    log "INFO" "Настройка системы логирования..."
    
    # Настройка ротации логов
    if [ -f "/etc/logrotate.d/mixer" ]; then
        log "INFO" "Конфигурация logrotate найдена"
    fi
    
    # Создание символических ссылок для stdout/stderr
    ln -sf /proc/1/fd/1 /var/log/mixer/app/stdout.log
    ln -sf /proc/1/fd/2 /var/log/mixer/app/stderr.log
    
    log "SUCCESS" "Логирование настроено"
}

# ============================================================================
# ПРОВЕРКА ЗАВИСИМОСТЕЙ
# ============================================================================

check_dependencies() {
    log "INFO" "Проверка зависимостей..."
    
    # Проверка подключения к базе данных
    if [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ]; then
        log "INFO" "Ожидание подключения к базе данных $DB_HOST:$DB_PORT..."
        
        local retries=30
        while [ $retries -gt 0 ]; do
            if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
                log "SUCCESS" "База данных доступна"
                break
            fi
            
            retries=$((retries - 1))
            log "INFO" "Ожидание БД... осталось попыток: $retries"
            sleep 2
        done
        
        if [ $retries -eq 0 ]; then
            log "ERROR" "Не удалось подключиться к базе данных"
            exit 1
        fi
    fi
    
    # Проверка подключения к Redis
    if [ -n "$REDIS_HOST" ] && [ -n "$REDIS_PORT" ]; then
        log "INFO" "Проверка подключения к Redis $REDIS_HOST:$REDIS_PORT..."
        
        local retries=15
        while [ $retries -gt 0 ]; do
            if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
                log "SUCCESS" "Redis доступен"
                break
            fi
            
            retries=$((retries - 1))
            log "INFO" "Ожидание Redis... осталось попыток: $retries"
            sleep 2
        done
        
        if [ $retries -eq 0 ]; then
            log "WARN" "Redis недоступен, но продолжаем запуск"
        fi
    fi
    
    log "SUCCESS" "Проверка зависимостей завершена"
}

# ============================================================================
# НАСТРОЙКА МОНИТОРИНГА
# ============================================================================

setup_monitoring() {
    log "INFO" "Настройка мониторинга..."
    
    # Создание файла статуса здоровья
    echo "starting" > "$HEALTH_CHECK_FILE"
    
    # Настройка метрик Prometheus (если включено)
    if [ "${PROMETHEUS_ENABLED:-false}" = "true" ]; then
        log "INFO" "Prometheus метрики включены"
        export PROMETHEUS_METRICS=true
    fi
    
    # Настройка профилирования производительности
    if [ "${PERFORMANCE_PROFILING:-false}" = "true" ]; then
        log "INFO" "Профилирование производительности включено"
        export NODE_OPTIONS="$NODE_OPTIONS --prof --prof-process"
    fi
    
    log "SUCCESS" "Мониторинг настроен"
}

# ============================================================================
# ОБРАБОТКА СИГНАЛОВ И GRACEFUL SHUTDOWN
# ============================================================================

cleanup() {
    log "INFO" "Получен сигнал завершения, начинаем graceful shutdown..."
    
    # Обновление статуса
    echo "shutting-down" > "$HEALTH_CHECK_FILE"
    
    # Отправка SIGTERM приложению
    if [ -f "$PID_FILE" ]; then
        local app_pid=$(cat "$PID_FILE")
        if kill -0 "$app_pid" 2>/dev/null; then
            log "INFO" "Отправка SIGTERM процессу $app_pid"
            kill -TERM "$app_pid"
            
            # Ожидание graceful shutdown
            local timeout=30
            while [ $timeout -gt 0 ] && kill -0 "$app_pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            
            # Принудительное завершение, если необходимо
            if kill -0 "$app_pid" 2>/dev/null; then
                log "WARN" "Принудительное завершение процесса $app_pid"
                kill -KILL "$app_pid"
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # Очистка временных файлов
    rm -f "$HEALTH_CHECK_FILE"
    
    log "SUCCESS" "Graceful shutdown завершен"
    exit 0
}

# Установка обработчиков сигналов
trap cleanup TERM INT QUIT

# ============================================================================
# ОСНОВНАЯ ЛОГИКА ЗАПУСКА
# ============================================================================

main() {
    log "INFO" "=== CRYPTO MIXER BACKEND ENTRYPOINT ==="
    log "INFO" "Версия: 3.0.0"
    log "INFO" "Node.js версия: $(node --version)"
    log "INFO" "Окружение: ${NODE_ENV:-unknown}"
    log "INFO" "Пользователь: $(whoami) (UID: $(id -u))"
    
    # Выполнение всех проверок
    check_security
    init_application
    setup_logging
    check_dependencies
    setup_monitoring
    
    # Обновление статуса готовности
    echo "ready" > "$HEALTH_CHECK_FILE"
    
    log "SUCCESS" "Все проверки пройдены, запуск приложения..."
    
    # Запуск приложения с перенаправлением логов
    if [ $# -eq 0 ]; then
        # Запуск по умолчанию
        exec node dist/server.js 2>&1 | tee -a /var/log/mixer/app/application.log &
    else
        # Запуск с переданными аргументами
        exec "$@" 2>&1 | tee -a /var/log/mixer/app/application.log &
    fi
    
    # Сохранение PID
    local app_pid=$!
    echo "$app_pid" > "$PID_FILE"
    
    log "SUCCESS" "Приложение запущено с PID: $app_pid"
    
    # Ожидание завершения приложения
    wait "$app_pid"
    local exit_code=$?
    
    log "INFO" "Приложение завершилось с кодом: $exit_code"
    
    # Очистка
    rm -f "$PID_FILE" "$HEALTH_CHECK_FILE"
    
    exit $exit_code
}

# ============================================================================
# ЗАПУСК
# ============================================================================

# Проверка аргументов командной строки
case "${1:-}" in
    --help|-h)
        echo "Crypto Mixer Backend Entrypoint"
        echo "Использование: $0 [команда]"
        echo ""
        echo "Команды:"
        echo "  node dist/server.js    Запуск основного приложения (по умолчанию)"
        echo "  --health-check         Проверка состояния"
        echo "  --version              Показать версию"
        exit 0
        ;;
    --version)
        echo "Crypto Mixer Backend Entrypoint v3.0.0"
        exit 0
        ;;
    --health-check)
        if [ -f "$HEALTH_CHECK_FILE" ]; then
            status=$(cat "$HEALTH_CHECK_FILE")
            echo "Статус: $status"
            case "$status" in
                "ready") exit 0 ;;
                "starting") exit 1 ;;
                "shutting-down") exit 1 ;;
                *) exit 2 ;;
            esac
        else
            echo "Статус: unknown"
            exit 2
        fi
        ;;
    *)
        main "$@"
        ;;
esac