#!/bin/bash

# Менеджер кластера Tor для CryptoMixer
# РУССКИЙ КОММЕНТАРИЙ: Полный скрипт управления множественными Tor instances:
# - Запуск/остановка кластера
# - Мониторинг здоровья всех узлов
# - Автоматическое failover при сбоях
# - Ротация цепочек во всех instances
# - Сбор логов и метрик

set -euo pipefail

# Конфигурация
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.tor-cluster.yml"
LOG_DIR="/opt/cryptomixer/logs/tor-cluster"
DATA_DIR="/opt/cryptomixer/data/tor"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Логирование
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")  echo -e "${GREEN}[INFO]${NC}  [$timestamp] $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC}  [$timestamp] $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} [$timestamp] $message" ;;
        "DEBUG") echo -e "${BLUE}[DEBUG]${NC} [$timestamp] $message" ;;
        *)       echo -e "[$timestamp] $message" ;;
    esac
    
    # Записываем в лог файл
    mkdir -p "$LOG_DIR"
    echo "[$level] [$timestamp] $message" >> "$LOG_DIR/tor-cluster-manager.log"
}

# Проверка зависимостей
check_dependencies() {
    log "INFO" "🔍 Проверяем зависимости..."
    
    local deps=("docker" "docker-compose" "curl" "nc" "jq")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log "ERROR" "❌ Зависимость не найдена: $dep"
            exit 1
        fi
    done
    
    log "INFO" "✅ Все зависимости найдены"
}

# Создание необходимых директорий
setup_directories() {
    log "INFO" "📁 Создаем необходимые директории..."
    
    local dirs=(
        "/opt/cryptomixer/data/tor/primary"
        "/opt/cryptomixer/data/tor/backup1"
        "/opt/cryptomixer/data/tor/backup2"
        "/opt/cryptomixer/data/tor/emergency"
        "/opt/cryptomixer/logs/tor/primary"
        "/opt/cryptomixer/logs/tor/backup1"
        "/opt/cryptomixer/logs/tor/backup2"
        "/opt/cryptomixer/logs/tor/emergency"
        "/opt/cryptomixer/logs/tor-monitor"
        "/opt/cryptomixer/shared/tor"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            sudo mkdir -p "$dir"
            sudo chown -R 1000:1000 "$dir"  # tor user in container
            log "INFO" "📁 Создана директория: $dir"
        fi
    done
}

# Запуск кластера Tor
start_cluster() {
    log "INFO" "🚀 Запускаем кластер Tor..."
    
    setup_directories
    
    # Генерируем пароль control port если не существует
    if [[ -z "${TOR_CONTROL_PASSWORD:-}" ]]; then
        export TOR_CONTROL_PASSWORD=$(openssl rand -base64 32)
        log "INFO" "🔑 Сгенерирован пароль для control port"
    fi
    
    # Запускаем основные services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d tor-primary tor-backup1 tor-backup2 tor-lb tor-monitor
    
    log "INFO" "⏳ Ждем инициализации Tor instances..."
    sleep 30
    
    # Проверяем здоровье кластера
    if check_cluster_health; then
        log "INFO" "✅ Кластер Tor успешно запущен"
        show_cluster_status
    else
        log "ERROR" "❌ Ошибка запуска кластера"
        show_logs
        exit 1
    fi
}

# Остановка кластера
stop_cluster() {
    log "INFO" "🛑 Останавливаем кластер Tor..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    log "INFO" "✅ Кластер остановлен"
}

# Перезапуск кластера
restart_cluster() {
    log "INFO" "🔄 Перезапускаем кластер Tor..."
    
    stop_cluster
    sleep 5
    start_cluster
}

# Проверка здоровья кластера
check_cluster_health() {
    log "INFO" "🔍 Проверяем здоровье кластера..."
    
    local instances=("tor-primary:9050" "tor-backup1:9060" "tor-backup2:9070")
    local healthy_count=0
    
    for instance in "${instances[@]}"; do
        local host=$(echo "$instance" | cut -d: -f1)
        local port=$(echo "$instance" | cut -d: -f2)
        
        if check_tor_instance "$host" "$port"; then
            log "INFO" "✅ $host:$port здоров"
            ((healthy_count++))
        else
            log "WARN" "⚠️ $host:$port недоступен"
        fi
    done
    
    if [[ $healthy_count -ge 2 ]]; then
        log "INFO" "✅ Кластер здоров ($healthy_count/3 instances)"
        return 0
    else
        log "ERROR" "❌ Кластер нездоров ($healthy_count/3 instances)"
        return 1
    fi
}

# Проверка конкретного Tor instance
check_tor_instance() {
    local host="$1"
    local port="$2"
    
    # Проверяем SOCKS порт
    if nc -z "$host" "$port" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Отображение статуса кластера
show_cluster_status() {
    log "INFO" "📊 Статус кластера Tor:"
    
    echo -e "\n${CYAN}=== СТАТУС КОНТЕЙНЕРОВ ===${NC}"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps
    
    echo -e "\n${CYAN}=== ЗДОРОВЬЕ TOR INSTANCES ===${NC}"
    local instances=("primary:9050" "backup1:9060" "backup2:9070" "emergency:9080")
    
    for instance in "${instances[@]}"; do
        local name=$(echo "$instance" | cut -d: -f1)
        local port=$(echo "$instance" | cut -d: -f2)
        local container_name="cryptomixer-tor-$name"
        
        if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            if check_tor_instance "localhost" "$port"; then
                echo -e "  ${GREEN}✅${NC} $name (port $port) - Здоров"
            else
                echo -e "  ${RED}❌${NC} $name (port $port) - Недоступен"
            fi
        else
            echo -e "  ${YELLOW}⚠️${NC} $name (port $port) - Не запущен"
        fi
    done
    
    echo -e "\n${CYAN}=== LOAD BALANCER ===${NC}"
    if curl -s http://localhost:8080/stats >/dev/null 2>&1; then
        echo -e "  ${GREEN}✅${NC} HAProxy load balancer доступен на http://localhost:8080/stats"
    else
        echo -e "  ${RED}❌${NC} HAProxy load balancer недоступен"
    fi
    
    echo -e "\n${CYAN}=== ONION АДРЕСА ===${NC}"
    show_onion_addresses
}

# Отображение onion адресов
show_onion_addresses() {
    local instances=("primary" "backup1" "backup2" "emergency")
    
    for instance in "${instances[@]}"; do
        local container_name="cryptomixer-tor-$instance"
        
        if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            echo -e "\n  ${PURPLE}📍 $instance:${NC}"
            
            # Пытаемся получить onion адреса для разных сервисов
            local services=("mixer_web" "mixer_api" "mixer_admin" "mixer_monitoring")
            
            for service in "${services[@]}"; do
                local hostname_file="/var/lib/tor/$service/hostname"
                local onion_address
                
                onion_address=$(docker exec "$container_name" cat "$hostname_file" 2>/dev/null || echo "Не готов")
                
                if [[ "$onion_address" != "Не готов" ]]; then
                    echo -e "    ${GREEN}🧅${NC} $service: $onion_address"
                else
                    echo -e "    ${YELLOW}⏳${NC} $service: Генерируется..."
                fi
            done
        fi
    done
}

# Ротация цепочек во всех instances
rotate_circuits() {
    log "INFO" "🔄 Ротируем цепочки во всех Tor instances..."
    
    local instances=("primary:9053" "backup1:9063" "backup2:9073")
    local success_count=0
    
    for instance in "${instances[@]}"; do
        local name=$(echo "$instance" | cut -d: -f1)
        local port=$(echo "$instance" | cut -d: -f2)
        local container_name="cryptomixer-tor-$name"
        
        if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            log "INFO" "🔄 Ротируем цепочки в $name..."
            
            if rotate_instance_circuits "$container_name"; then
                log "INFO" "✅ Цепочки в $name ротированы"
                ((success_count++))
            else
                log "WARN" "⚠️ Не удалось ротировать цепочки в $name"
            fi
        fi
    done
    
    log "INFO" "🔄 Ротация завершена ($success_count instances)"
}

# Ротация цепочек в конкретном instance
rotate_instance_circuits() {
    local container_name="$1"
    
    # Отправляем NEWNYM команду через control port
    docker exec "$container_name" bash -c '
        echo "AUTHENTICATE \"$TOR_CONTROL_PASSWORD\"
SIGNAL NEWNYM
QUIT" | nc localhost $(echo $TOR_CONTROL_PORT || echo 9053)
    ' 2>/dev/null
    
    return $?
}

# Активация emergency instance
activate_emergency() {
    log "INFO" "🚨 Активируем emergency Tor instance..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d tor-emergency
    
    sleep 15
    
    if check_tor_instance "localhost" "9080"; then
        log "INFO" "✅ Emergency instance активирован"
    else
        log "ERROR" "❌ Не удалось активировать emergency instance"
        return 1
    fi
}

# Деактивация emergency instance
deactivate_emergency() {
    log "INFO" "🛑 Деактивируем emergency Tor instance..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" stop tor-emergency
    
    log "INFO" "✅ Emergency instance деактивирован"
}

# Показ логов
show_logs() {
    local instance="${1:-all}"
    local lines="${2:-50}"
    
    if [[ "$instance" == "all" ]]; then
        log "INFO" "📜 Показываем логи всех services..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs --tail="$lines" -f
    else
        log "INFO" "📜 Показываем логи $instance..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs --tail="$lines" -f "tor-$instance"
    fi
}

# Мониторинг в реальном времени
monitor_cluster() {
    log "INFO" "👁️ Запускаем мониторинг кластера..."
    
    while true; do
        clear
        echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║               TOR CLUSTER MONITOR                    ║${NC}"
        echo -e "${CYAN}║              $(date '+%Y-%m-%d %H:%M:%S')                     ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
        
        show_cluster_status
        
        echo -e "\n${CYAN}=== СИСТЕМНЫЕ РЕСУРСЫ ===${NC}"
        echo -e "  ${BLUE}📊${NC} Использование памяти:"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep cryptomixer-tor
        
        echo -e "\n${YELLOW}Нажмите Ctrl+C для выхода${NC}"
        sleep 10
    done
}

# Сбор метрик
collect_metrics() {
    log "INFO" "📈 Собираем метрики кластера..."
    
    local metrics_file="$LOG_DIR/tor-cluster-metrics-$(date +%Y%m%d_%H%M%S).json"
    
    {
        echo "{"
        echo "  \"timestamp\": \"$(date -Iseconds)\","
        echo "  \"cluster_status\": {"
        
        # Статус контейнеров
        echo "    \"containers\": ["
        docker-compose -f "$DOCKER_COMPOSE_FILE" ps --format json | jq -s '.'
        echo "    ],"
        
        # Здоровье instances
        echo "    \"health\": {"
        local instances=("primary:9050" "backup1:9060" "backup2:9070" "emergency:9080")
        local first=true
        
        for instance in "${instances[@]}"; do
            local name=$(echo "$instance" | cut -d: -f1)
            local port=$(echo "$instance" | cut -d: -f2)
            
            if [[ "$first" == "true" ]]; then
                first=false
            else
                echo ","
            fi
            
            echo -n "      \"$name\": {"
            echo -n "\"port\": $port, "
            
            if check_tor_instance "localhost" "$port"; then
                echo -n "\"status\": \"healthy\""
            else
                echo -n "\"status\": \"unhealthy\""
            fi
            echo -n "}"
        done
        
        echo ""
        echo "    }"
        echo "  }"
        echo "}"
    } > "$metrics_file"
    
    log "INFO" "📈 Метрики сохранены: $metrics_file"
}

# Backup конфигураций
backup_configs() {
    local backup_dir="$DATA_DIR/backups/$(date +%Y%m%d_%H%M%S)"
    
    log "INFO" "💾 Создаем backup конфигураций..."
    
    mkdir -p "$backup_dir"
    
    # Копируем конфигурации
    cp -r "$PROJECT_ROOT/security/tor" "$backup_dir/"
    cp "$DOCKER_COMPOSE_FILE" "$backup_dir/"
    cp "$PROJECT_ROOT/docker/haproxy-tor.cfg" "$backup_dir/"
    
    # Создаем архив
    tar -czf "$backup_dir.tar.gz" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")"
    rm -rf "$backup_dir"
    
    log "INFO" "💾 Backup создан: $backup_dir.tar.gz"
}

# Помощь
show_help() {
    cat << EOF

🧅 CryptoMixer Tor Cluster Manager

ИСПОЛЬЗОВАНИЕ:
    $0 <команда> [опции]

КОМАНДЫ:
    start                 Запустить кластер Tor
    stop                  Остановить кластер Tor
    restart               Перезапустить кластер Tor
    status                Показать статус кластера
    health                Проверить здоровье кластера
    rotate                Ротировать цепочки во всех instances
    emergency-on          Активировать emergency instance
    emergency-off         Деактивировать emergency instance
    logs [instance] [n]   Показать логи (instance: primary|backup1|backup2|emergency|all)
    monitor               Мониторинг в реальном времени
    metrics               Собрать метрики кластера
    backup                Создать backup конфигураций
    onion                 Показать onion адреса
    help                  Показать эту справку

ПРИМЕРЫ:
    $0 start              # Запустить кластер
    $0 logs primary 100   # Показать 100 последних строк логов primary instance
    $0 monitor            # Запустить мониторинг в реальном времени

EOF
}

# Главная функция
main() {
    local command="${1:-help}"
    
    case "$command" in
        "start")
            check_dependencies
            start_cluster
            ;;
        "stop")
            stop_cluster
            ;;
        "restart")
            restart_cluster
            ;;
        "status")
            show_cluster_status
            ;;
        "health")
            if check_cluster_health; then
                log "INFO" "✅ Кластер здоров"
            else
                log "ERROR" "❌ Кластер нездоров"
                exit 1
            fi
            ;;
        "rotate")
            rotate_circuits
            ;;
        "emergency-on")
            activate_emergency
            ;;
        "emergency-off")
            deactivate_emergency
            ;;
        "logs")
            show_logs "${2:-all}" "${3:-50}"
            ;;
        "monitor")
            monitor_cluster
            ;;
        "metrics")
            collect_metrics
            ;;
        "backup")
            backup_configs
            ;;
        "onion")
            show_onion_addresses
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            log "ERROR" "Неизвестная команда: $command"
            show_help
            exit 1
            ;;
    esac
}

# Обработка сигналов
trap 'log "INFO" "🛑 Получен сигнал прерывания"; exit 0' INT TERM

# Запуск
main "$@"