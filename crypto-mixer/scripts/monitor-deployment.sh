#!/bin/bash

# ================================================================
# CRYPTO MIXER - DEPLOYMENT MONITORING SCRIPT
# ================================================================
# RUSSIAN: Скрипт мониторинга состояния production деплоя
# Проверка здоровья сервисов, анализ метрик, алертинг

set -euo pipefail
IFS=$'\n\t'

# ================================================================
# КОНФИГУРАЦИЯ
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Настройки мониторинга
MONITORING_INTERVAL=${MONITORING_INTERVAL:-30}
ALERT_THRESHOLD_CPU=${ALERT_THRESHOLD_CPU:-80}
ALERT_THRESHOLD_MEMORY=${ALERT_THRESHOLD_MEMORY:-85}
ALERT_THRESHOLD_RESPONSE_TIME=${ALERT_THRESHOLD_RESPONSE_TIME:-5000}
WEBHOOK_URL=${WEBHOOK_URL:-}

# ================================================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_alert() {
    echo -e "${PURPLE}[ALERT]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# ================================================================
# ПРОВЕРКА СОСТОЯНИЯ СЕРВИСОВ
# ================================================================

check_service_health() {
    local stack_name="mixer"
    
    echo -e "\n${CYAN}📊 СОСТОЯНИЕ СЕРВИСОВ${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Проверка существования стека
    if ! docker stack ls | grep -q "$stack_name"; then
        log_error "Стек $stack_name не найден"
        return 1
    fi
    
    local services_info=$(docker stack services $stack_name --format "table {{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}")
    echo "$services_info"
    
    # Детальная проверка каждого сервиса
    local failed_services=0
    local services=$(docker stack services $stack_name --format "{{.Name}}")
    
    echo -e "\n${CYAN}🔍 ДЕТАЛЬНАЯ ПРОВЕРКА СЕРВИСОВ${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    for service in $services; do
        local replicas=$(docker service inspect $service --format "{{.Spec.Mode.Replicated.Replicas}}" 2>/dev/null || echo "0")
        local running=$(docker service ls --filter "name=$service" --format "{{.Replicas}}" | cut -d'/' -f1)
        local total=$(docker service ls --filter "name=$service" --format "{{.Replicas}}" | cut -d'/' -f2)
        
        if [ "$running" = "$total" ] && [ "$running" -gt 0 ]; then
            log_success "✓ $service ($running/$total)"
        else
            log_error "✗ $service ($running/$total)"
            failed_services=$((failed_services + 1))
            
            # Дополнительная диагностика
            log_info "  Последние логи $service:"
            docker service logs --tail 3 $service 2>/dev/null | sed 's/^/    /' || echo "    Логи недоступны"
        fi
    done
    
    return $failed_services
}

# ================================================================
# ПРОВЕРКА HEALTH ENDPOINTS
# ================================================================

check_health_endpoints() {
    echo -e "\n${CYAN}🏥 ПРОВЕРКА HEALTH ENDPOINTS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Определение портов сервисов
    local api_port=$(docker service inspect mixer_mixer-api --format '{{range .Endpoint.Ports}}{{if eq .TargetPort 5000}}{{.PublishedPort}}{{end}}{{end}}' 2>/dev/null || echo "5000")
    
    # Список endpoints для проверки
    local endpoints=(
        "http://localhost:${api_port}/health:Health Check"
        "http://localhost:${api_port}/ready:Readiness"
        "http://localhost:${api_port}/live:Liveness"
        "http://localhost:${api_port}/metrics:Metrics"
        "http://localhost:${api_port}/api/v1/security/status:Security Status"
    )
    
    local failed_endpoints=0
    
    for endpoint_info in "${endpoints[@]}"; do
        local url=$(echo "$endpoint_info" | cut -d':' -f1)
        local name=$(echo "$endpoint_info" | cut -d':' -f2)
        
        local start_time=$(date +%s%3N)
        if curl -sf "$url" > /dev/null 2>&1; then
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            
            if [ $response_time -lt $ALERT_THRESHOLD_RESPONSE_TIME ]; then
                log_success "✓ $name (${response_time}ms)"
            else
                log_warning "⚠ $name (${response_time}ms - медленно!)"
            fi
        else
            log_error "✗ $name - недоступен"
            failed_endpoints=$((failed_endpoints + 1))
        fi
    done
    
    return $failed_endpoints
}

# ================================================================
# МОНИТОРИНГ РЕСУРСОВ
# ================================================================

check_resource_usage() {
    echo -e "\n${CYAN}📈 ИСПОЛЬЗОВАНИЕ РЕСУРСОВ${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Получение статистики контейнеров
    local containers=$(docker ps --filter "label=com.docker.stack.namespace=mixer" --format "{{.Names}}")
    
    if [ -z "$containers" ]; then
        log_warning "Контейнеры mixer не найдены"
        return 1
    fi
    
    echo -e "${BLUE}Контейнер${NC}\t\t\t${BLUE}CPU%${NC}\t${BLUE}Память${NC}\t\t${BLUE}Сеть I/O${NC}\t\t${BLUE}Диск I/O${NC}"
    echo "─────────────────────────────────────────────────────────────────────────────────────────────────────────────"
    
    local high_cpu_count=0
    local high_memory_count=0
    
    # Получение статистики в формате JSON для более точного парсинга
    local stats_output=$(docker stats --no-stream --format "json" $containers)
    
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            local container=$(echo "$line" | jq -r '.Container // .Name')
            local cpu=$(echo "$line" | jq -r '.CPUPerc' | sed 's/%//')
            local memory=$(echo "$line" | jq -r '.MemUsage')
            local net_io=$(echo "$line" | jq -r '.NetIO')
            local block_io=$(echo "$line" | jq -r '.BlockIO')
            
            # Проверка превышения лимитов
            local cpu_num=$(echo "$cpu" | sed 's/[^0-9.]//g')
            if (( $(echo "$cpu_num > $ALERT_THRESHOLD_CPU" | bc -l) )); then
                high_cpu_count=$((high_cpu_count + 1))
                printf "${RED}%-30s\t%s%%\t%s\t%s\t%s${NC}\n" "$container" "$cpu" "$memory" "$net_io" "$block_io"
            elif (( $(echo "$cpu_num > 50" | bc -l) )); then
                printf "${YELLOW}%-30s\t%s%%\t%s\t%s\t%s${NC}\n" "$container" "$cpu" "$memory" "$net_io" "$block_io"
            else
                printf "${GREEN}%-30s\t%s%%\t%s\t%s\t%s${NC}\n" "$container" "$cpu" "$memory" "$net_io" "$block_io"
            fi
        fi
    done <<< "$stats_output"
    
    # Проверка дискового пространства
    echo -e "\n${BLUE}📀 ИСПОЛЬЗОВАНИЕ ДИСКА${NC}"
    df -h | grep -E "(Filesystem|/dev/)" | head -5
    
    # Проверка Docker volumes
    echo -e "\n${BLUE}📦 DOCKER VOLUMES${NC}"
    docker system df
    
    # Выводы и алерты
    if [ $high_cpu_count -gt 0 ]; then
        log_alert "⚠️ $high_cpu_count контейнеров с высокой загрузкой CPU (>$ALERT_THRESHOLD_CPU%)"
    fi
    
    if [ $high_memory_count -gt 0 ]; then
        log_alert "⚠️ $high_memory_count контейнеров с высоким использованием памяти"
    fi
}

# ================================================================
# ПРОВЕРКА СЕТЕВОЙ СВЯЗНОСТИ
# ================================================================

check_network_connectivity() {
    echo -e "\n${CYAN}🌐 СЕТЕВАЯ СВЯЗНОСТЬ${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Проверка Docker сетей
    local networks=$(docker network ls --filter "name=mixer" --format "{{.Name}}")
    
    for network in $networks; do
        local connected_containers=$(docker network inspect $network --format '{{len .Containers}}' 2>/dev/null || echo "0")
        if [ "$connected_containers" -gt 0 ]; then
            log_success "✓ Сеть $network - $connected_containers контейнеров"
        else
            log_warning "⚠ Сеть $network - нет подключенных контейнеров"
        fi
    done
    
    # Проверка внешней связности (если возможно)
    log_info "Проверка внешней связности..."
    if timeout 5 curl -sf https://google.com > /dev/null 2>&1; then
        log_success "✓ Внешний интернет доступен"
    else
        log_warning "⚠ Внешний интернет недоступен или медленный"
    fi
}

# ================================================================
# АНАЛИЗ ЛОГОВ
# ================================================================

analyze_logs() {
    echo -e "\n${CYAN}📋 АНАЛИЗ ЛОГОВ${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local services=$(docker stack services mixer --format "{{.Name}}")
    local time_filter="--since 5m"
    
    for service in $services; do
        log_info "Анализ логов для $service..."
        
        # Подсчет ошибок
        local error_count=$(docker service logs $service $time_filter 2>/dev/null | grep -ci "error\|critical\|fatal" || echo "0")
        local warning_count=$(docker service logs $service $time_filter 2>/dev/null | grep -ci "warn\|warning" || echo "0")
        
        if [ "$error_count" -gt 0 ]; then
            log_error "  ✗ $service: $error_count ошибок, $warning_count предупреждений"
            # Показываем последние ошибки
            docker service logs $service $time_filter 2>/dev/null | grep -i "error\|critical\|fatal" | tail -2 | sed 's/^/    /'
        elif [ "$warning_count" -gt 5 ]; then
            log_warning "  ⚠ $service: $warning_count предупреждений"
        else
            log_success "  ✓ $service: чистые логи"
        fi
    done
}

# ================================================================
# ПРОВЕРКА СИСТЕМЫ БЕЗОПАСНОСТИ
# ================================================================

check_security_status() {
    echo -e "\n${CYAN}🛡️ СИСТЕМА БЕЗОПАСНОСТИ${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local api_port=$(docker service inspect mixer_mixer-api --format '{{range .Endpoint.Ports}}{{if eq .TargetPort 5000}}{{.PublishedPort}}{{end}}{{end}}' 2>/dev/null || echo "5000")
    local security_url="http://localhost:${api_port}/api/v1/security/status"
    
    if curl -sf "$security_url" > /dev/null 2>&1; then
        local security_data=$(curl -s "$security_url" 2>/dev/null || echo '{}')
        local status=$(echo "$security_data" | jq -r '.status // "unknown"')
        local blocked_requests=$(echo "$security_data" | jq -r '.statistics.general.blockedRequests // 0')
        local active_blocks=$(echo "$security_data" | jq -r '.statistics.rateLimiter.activeBlocks // 0')
        local ddos_attacks=$(echo "$security_data" | jq -r '.statistics.general.ddosAttacksDetected // 0')
        local emergency_mode=$(echo "$security_data" | jq -r '.emergencyMode // false')
        
        if [ "$status" = "active" ]; then
            log_success "✓ Система безопасности активна"
        else
            log_warning "⚠ Система безопасности: $status"
        fi
        
        log_info "  📊 Заблокировано запросов: $blocked_requests"
        log_info "  🚫 Активных блокировок IP: $active_blocks"
        log_info "  🛡️ DDoS атак обнаружено: $ddos_attacks"
        
        if [ "$emergency_mode" = "true" ]; then
            log_alert "🚨 ЭКСТРЕННЫЙ РЕЖИМ АКТИВЕН!"
        else
            log_success "✓ Нормальный режим работы"
        fi
        
        # Проверка активных алертов
        local alerts_url="http://localhost:${api_port}/api/v1/security/alerts?active=true"
        if curl -sf "$alerts_url" > /dev/null 2>&1; then
            local active_alerts=$(curl -s "$alerts_url" | jq -r '.count // 0')
            if [ "$active_alerts" -gt 0 ]; then
                log_alert "⚠️ Активных алертов безопасности: $active_alerts"
            else
                log_success "✓ Нет активных алертов безопасности"
            fi
        fi
        
    else
        log_error "✗ Система безопасности недоступна"
    fi
}

# ================================================================
# ОТПРАВКА АЛЕРТОВ
# ================================================================

send_alert() {
    local message="$1"
    local severity="${2:-warning}"
    
    if [ -n "$WEBHOOK_URL" ]; then
        local payload=$(cat <<EOF
{
  "text": "🚨 Crypto Mixer Alert",
  "attachments": [
    {
      "color": "$( [ "$severity" = "error" ] && echo "danger" || echo "warning" )",
      "fields": [
        {
          "title": "Message",
          "value": "$message",
          "short": false
        },
        {
          "title": "Severity",
          "value": "$severity",
          "short": true
        },
        {
          "title": "Timestamp",
          "value": "$(date -Iseconds)",
          "short": true
        }
      ]
    }
  ]
}
EOF
)
        
        curl -X POST -H 'Content-type: application/json' \
             --data "$payload" \
             "$WEBHOOK_URL" > /dev/null 2>&1 || true
    fi
}

# ================================================================
# ГЕНЕРАЦИЯ ОТЧЕТА
# ================================================================

generate_status_report() {
    local timestamp=$(date -Iseconds)
    local report_file="${PROJECT_ROOT}/logs/monitoring-report-$(date +%Y%m%d_%H%M%S).json"
    
    mkdir -p "$(dirname "$report_file")"
    
    local report=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "deployment_health": {
    "services_status": "$(check_service_health > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")",
    "endpoints_status": "$(check_health_endpoints > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")",
    "security_status": "active"
  },
  "resource_usage": $(docker stats --no-stream --format json $(docker ps --filter "label=com.docker.stack.namespace=mixer" --format "{{.Names}}") 2>/dev/null | jq -s '.' || echo '[]'),
  "docker_info": {
    "version": "$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'unknown')",
    "containers_running": $(docker ps --filter "label=com.docker.stack.namespace=mixer" --format "{{.Names}}" | wc -l),
    "images_count": $(docker images --filter "reference=mixer/*" --format "{{.Repository}}" | wc -l)
  },
  "system_info": {
    "uptime": "$(uptime -p 2>/dev/null || echo 'unknown')",
    "load_average": "$(uptime | sed 's/.*load average: //' 2>/dev/null || echo 'unknown')",
    "disk_usage": "$(df -h / | tail -1 | awk '{print $5}' 2>/dev/null || echo 'unknown')"
  }
}
EOF
)
    
    echo "$report" > "$report_file"
    log_info "Отчет сохранен: $report_file"
}

# ================================================================
# CONTINUOUS MONITORING
# ================================================================

continuous_monitoring() {
    log_info "🔄 Запуск непрерывного мониторинга (интервал: ${MONITORING_INTERVAL}s)"
    log_info "Для остановки нажмите Ctrl+C"
    echo
    
    local iteration=0
    
    while true; do
        iteration=$((iteration + 1))
        
        echo -e "\n${PURPLE}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${PURPLE}🔍 МОНИТОРИНГ ИТЕРАЦИЯ #$iteration - $(date)${NC}"
        echo -e "${PURPLE}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
        
        local issues=0
        
        # Проверка сервисов
        if ! check_service_health; then
            issues=$((issues + 1))
            send_alert "Проблемы с сервисами обнаружены" "error"
        fi
        
        # Проверка endpoints
        if ! check_health_endpoints; then
            issues=$((issues + 1))
            send_alert "Health endpoints недоступны" "error"
        fi
        
        # Проверка ресурсов
        check_resource_usage
        
        # Проверка сети
        check_network_connectivity
        
        # Проверка безопасности
        check_security_status
        
        # Анализ логов
        analyze_logs
        
        # Сводка
        if [ $issues -eq 0 ]; then
            log_success "✅ Все системы работают нормально"
        else
            log_alert "⚠️ Обнаружено $issues проблем"
        fi
        
        # Генерация отчета каждые 10 итераций
        if [ $((iteration % 10)) -eq 0 ]; then
            generate_status_report
        fi
        
        echo -e "\n💤 Ожидание $MONITORING_INTERVAL секунд до следующей проверки..."
        sleep $MONITORING_INTERVAL
    done
}

# ================================================================
# ГЛАВНОЕ МЕНЮ
# ================================================================

show_help() {
    cat << 'EOF'
Crypto Mixer Deployment Monitoring

ИСПОЛЬЗОВАНИЕ:
    ./monitor-deployment.sh [КОМАНДА] [ОПЦИИ]

КОМАНДЫ:
    status              Разовая проверка статуса (по умолчанию)
    continuous          Непрерывный мониторинг
    health              Только проверка health endpoints
    resources           Только проверка ресурсов
    security            Только проверка системы безопасности
    logs                Только анализ логов
    report              Генерация подробного отчета

ОПЦИИ:
    --interval SECONDS  Интервал мониторинга (по умолчанию: 30)
    --webhook URL       URL для отправки алертов
    --cpu-threshold N   Порог алерта CPU в % (по умолчанию: 80)
    --memory-threshold N Порог алерта памяти в % (по умолчанию: 85)
    --help              Показать эту справку

ПРИМЕРЫ:
    ./monitor-deployment.sh
    ./monitor-deployment.sh continuous --interval 60
    ./monitor-deployment.sh health
    ./monitor-deployment.sh --webhook https://hooks.slack.com/...

ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:
    MONITORING_INTERVAL         Интервал проверок (секунды)
    ALERT_THRESHOLD_CPU         Порог алерта CPU (%)
    ALERT_THRESHOLD_MEMORY      Порог алерта памяти (%)
    WEBHOOK_URL                 URL для алертов
EOF
}

# ================================================================
# ПАРСИНГ АРГУМЕНТОВ
# ================================================================

COMMAND="status"

while [[ $# -gt 0 ]]; do
    case $1 in
        status|continuous|health|resources|security|logs|report)
            COMMAND="$1"
            shift
            ;;
        --interval)
            MONITORING_INTERVAL="$2"
            shift 2
            ;;
        --webhook)
            WEBHOOK_URL="$2"
            shift 2
            ;;
        --cpu-threshold)
            ALERT_THRESHOLD_CPU="$2"
            shift 2
            ;;
        --memory-threshold)
            ALERT_THRESHOLD_MEMORY="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Неизвестная опция: $1"
            show_help
            exit 1
            ;;
    esac
done

# ================================================================
# ВЫПОЛНЕНИЕ КОМАНД
# ================================================================

case $COMMAND in
    status)
        log_info "🔍 Проверка статуса production деплоя"
        check_service_health
        check_health_endpoints  
        check_resource_usage
        check_security_status
        ;;
    continuous)
        continuous_monitoring
        ;;
    health)
        check_health_endpoints
        ;;
    resources)
        check_resource_usage
        ;;
    security)
        check_security_status
        ;;
    logs)
        analyze_logs
        ;;
    report)
        generate_status_report
        ;;
esac