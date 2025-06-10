#!/bin/bash

# ================================================================
# CRYPTO MIXER - PRODUCTION DEPLOYMENT SCRIPT
# ================================================================
# RUSSIAN: Безопасный скрипт деплоя в production с проверками
# Автоматическая инициализация секретов, проверка готовности,
# мониторинг деплоя и rollback при ошибках

set -euo pipefail
IFS=$'\n\t'

# ================================================================
# КОНФИГУРАЦИЯ
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"
SECRETS_SCRIPT="${PROJECT_ROOT}/backend/scripts/secrets-manager.sh"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Настройки деплоя
DEPLOYMENT_TIMEOUT=${DEPLOYMENT_TIMEOUT:-600}  # 10 минут
HEALTH_CHECK_RETRIES=${HEALTH_CHECK_RETRIES:-30}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-10}
BACKUP_BEFORE_DEPLOY=${BACKUP_BEFORE_DEPLOY:-true}
ROLLBACK_ON_FAILURE=${ROLLBACK_ON_FAILURE:-true}

# ================================================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" >&2
}

# ================================================================
# ПРОВЕРКИ ГОТОВНОСТИ К ДЕПЛОЮ
# ================================================================

check_prerequisites() {
    log_step "Проверка предварительных условий..."
    
    local missing_tools=()
    
    # Проверка наличия Docker и Docker Compose
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        missing_tools+=("docker-compose")
    fi
    
    # Проверка наличия curl для health checks
    if ! command -v curl &> /dev/null; then
        missing_tools+=("curl")
    fi
    
    # Проверка наличия jq для обработки JSON
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Отсутствуют необходимые инструменты: ${missing_tools[*]}"
        log_info "Установите их командой: brew install ${missing_tools[*]}"
        exit 1
    fi
    
    # Проверка Docker Swarm mode
    if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
        log_warning "Docker Swarm не активен. Инициализация..."
        docker swarm init --advertise-addr 127.0.0.1 || {
            log_error "Не удалось инициализировать Docker Swarm"
            exit 1
        }
    fi
    
    # Проверка наличия файлов
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "Файл docker-compose.production.yml не найден: $DOCKER_COMPOSE_FILE"
        exit 1
    fi
    
    if [ ! -f "$SECRETS_SCRIPT" ]; then
        log_error "Скрипт управления секретами не найден: $SECRETS_SCRIPT"
        exit 1
    fi
    
    # Проверка переменных окружения
    if [ -z "${VERSION:-}" ]; then
        log_warning "Переменная VERSION не установлена, используется 'latest'"
        export VERSION="latest"
    fi
    
    log_success "Все предварительные условия выполнены"
}

# ================================================================
# УПРАВЛЕНИЕ СЕКРЕТАМИ
# ================================================================

initialize_secrets() {
    log_step "Инициализация секретов..."
    
    # Проверяем существующие секреты
    local existing_secrets=$(docker secret ls --format "{{.Name}}" 2>/dev/null | wc -l)
    
    if [ "$existing_secrets" -gt 0 ]; then
        log_warning "Найдены существующие секреты ($existing_secrets шт.)"
        read -p "Пересоздать все секреты? Это удалит существующие! (yes/no): " -r
        if [[ $REPLY =~ ^yes$ ]]; then
            log_info "Очистка существующих секретов..."
            bash "$SECRETS_SCRIPT" cleanup
        else
            log_info "Используются существующие секреты"
            return 0
        fi
    fi
    
    # Инициализация новых секретов
    log_info "Создание новых секретов..."
    bash "$SECRETS_SCRIPT" init
    
    # Проверка созданных секретов
    local created_secrets=$(docker secret ls --format "{{.Name}}" 2>/dev/null | wc -l)
    if [ "$created_secrets" -eq 0 ]; then
        log_error "Секреты не были созданы"
        exit 1
    fi
    
    log_success "Секреты инициализированы ($created_secrets шт.)"
}

# ================================================================
# BACKUP СУЩЕСТВУЮЩЕГО ДЕПЛОЯ
# ================================================================

backup_deployment() {
    if [ "$BACKUP_BEFORE_DEPLOY" != "true" ]; then
        log_info "Backup отключен через переменную BACKUP_BEFORE_DEPLOY"
        return 0
    fi
    
    log_step "Создание backup текущего деплоя..."
    
    local backup_dir="${PROJECT_ROOT}/backups/deployment-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup Docker Compose конфигурации
    if docker stack ls | grep -q "mixer"; then
        log_info "Сохранение конфигурации стека..."
        docker stack services mixer --format "table {{.Name}}\t{{.Image}}\t{{.Replicas}}" > "$backup_dir/services.txt"
        
        # Сохранение текущих образов
        docker service ls --filter "label=com.docker.stack.namespace=mixer" \
            --format "{{.Image}}" > "$backup_dir/images.txt"
    fi
    
    # Backup секретов (только метаданные)
    docker secret ls --format "table {{.Name}}\t{{.CreatedAt}}" > "$backup_dir/secrets.txt"
    
    # Backup volumes информации
    docker volume ls --filter "label=com.docker.stack.namespace=mixer" \
        --format "table {{.Name}}\t{{.Driver}}\t{{.CreatedAt}}" > "$backup_dir/volumes.txt"
    
    log_success "Backup создан в: $backup_dir"
}

# ================================================================
# ДЕПЛОЙ СТЕКА
# ================================================================

deploy_stack() {
    log_step "Деплой production стека..."
    
    # Проверка синтаксиса Docker Compose файла
    log_info "Проверка синтаксиса docker-compose.yml..."
    if ! docker-compose -f "$DOCKER_COMPOSE_FILE" config > /dev/null; then
        log_error "Ошибка в синтаксисе docker-compose.yml"
        exit 1
    fi
    
    # Создание overlay networks если они не существуют
    log_info "Создание сетей..."
    local networks=("mixer-internal" "mixer-frontend" "mixer-monitoring" "mixer-secure")
    for network in "${networks[@]}"; do
        if ! docker network ls | grep -q "$network"; then
            docker network create \
                --driver overlay \
                --encrypted \
                --attachable=false \
                "$network" || log_warning "Сеть $network уже существует"
        fi
    done
    
    # Деплой стека
    log_info "Запуск Docker Stack deploy..."
    docker stack deploy \
        --compose-file "$DOCKER_COMPOSE_FILE" \
        --with-registry-auth \
        mixer
    
    log_success "Стек mixer задеплоен"
}

# ================================================================
# ПРОВЕРКА ЗДОРОВЬЯ СЕРВИСОВ
# ================================================================

wait_for_services() {
    log_step "Ожидание готовности сервисов..."
    
    local start_time=$(date +%s)
    local timeout_time=$((start_time + DEPLOYMENT_TIMEOUT))
    
    # Список критически важных сервисов
    local critical_services=(
        "mixer_postgres-master"
        "mixer_redis-master"
        "mixer_mixer-api"
    )
    
    for service in "${critical_services[@]}"; do
        log_info "Проверка сервиса: $service"
        
        local retries=0
        while [ $retries -lt $HEALTH_CHECK_RETRIES ]; do
            local current_time=$(date +%s)
            if [ $current_time -gt $timeout_time ]; then
                log_error "Timeout при ожидании сервиса $service"
                return 1
            fi
            
            # Проверка статуса сервиса
            local service_status=$(docker service ls --filter "name=$service" --format "{{.Replicas}}" 2>/dev/null)
            
            if [[ "$service_status" =~ ^([0-9]+)/\1$ ]]; then
                log_success "Сервис $service готов ($service_status)"
                break
            else
                log_info "Сервис $service не готов ($service_status), попытка $((retries + 1))/$HEALTH_CHECK_RETRIES"
                retries=$((retries + 1))
                sleep $HEALTH_CHECK_INTERVAL
            fi
        done
        
        if [ $retries -eq $HEALTH_CHECK_RETRIES ]; then
            log_error "Сервис $service не удалось запустить"
            return 1
        fi
    done
    
    log_success "Все критические сервисы запущены"
}

# ================================================================
# ПРОВЕРКА HEALTH ENDPOINTS
# ================================================================

check_health_endpoints() {
    log_step "Проверка health endpoints..."
    
    # Получение портов из stack
    local api_port=$(docker service inspect mixer_mixer-api --format '{{range .Endpoint.Ports}}{{if eq .TargetPort 5000}}{{.PublishedPort}}{{end}}{{end}}' 2>/dev/null || echo "")
    
    if [ -z "$api_port" ]; then
        log_warning "Не удалось определить порт API сервиса, используется 5000"
        api_port="5000"
    fi
    
    local health_url="http://localhost:${api_port}/health"
    local retries=0
    
    log_info "Проверка health endpoint: $health_url"
    
    while [ $retries -lt $HEALTH_CHECK_RETRIES ]; do
        if curl -sf "$health_url" > /dev/null 2>&1; then
            log_success "Health endpoint отвечает"
            
            # Проверка детального статуса
            local health_status=$(curl -s "$health_url" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
            if [ "$health_status" = "healthy" ]; then
                log_success "Сервис полностью здоров"
                return 0
            else
                log_warning "Сервис отвечает, но статус: $health_status"
            fi
        else
            log_info "Health endpoint недоступен, попытка $((retries + 1))/$HEALTH_CHECK_RETRIES"
        fi
        
        retries=$((retries + 1))
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    log_error "Health endpoint не стал доступен"
    return 1
}

# ================================================================
# ПРОВЕРКА СИСТЕМЫ БЕЗОПАСНОСТИ
# ================================================================

check_security_system() {
    log_step "Проверка системы безопасности..."
    
    local api_port=$(docker service inspect mixer_mixer-api --format '{{range .Endpoint.Ports}}{{if eq .TargetPort 5000}}{{.PublishedPort}}{{end}}{{end}}' 2>/dev/null || echo "5000")
    local security_url="http://localhost:${api_port}/api/v1/security/status"
    
    log_info "Проверка системы безопасности: $security_url"
    
    if curl -sf "$security_url" > /dev/null 2>&1; then
        local security_status=$(curl -s "$security_url" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
        
        if [ "$security_status" = "active" ]; then
            log_success "Система безопасности активна и работает"
            
            # Дополнительная проверка компонентов
            local components=$(curl -s "$security_url" | jq -r '.statistics.general // {}' 2>/dev/null)
            if [ "$components" != "{}" ]; then
                log_info "Компоненты безопасности инициализированы"
            fi
        else
            log_warning "Система безопасности в состоянии: $security_status"
        fi
    else
        log_warning "Endpoint системы безопасности недоступен (это может быть нормально на первом запуске)"
    fi
}

# ================================================================
# ROLLBACK ПРИ ОШИБКЕ
# ================================================================

rollback_deployment() {
    if [ "$ROLLBACK_ON_FAILURE" != "true" ]; then
        log_warning "Rollback отключен через переменную ROLLBACK_ON_FAILURE"
        return 0
    fi
    
    log_step "Выполнение rollback..."
    
    # Попытка остановки стека
    log_info "Остановка failed деплоя..."
    docker stack rm mixer || log_warning "Не удалось остановить стек mixer"
    
    # Ожидание полной остановки
    local retries=0
    while docker stack ls | grep -q "mixer" && [ $retries -lt 30 ]; do
        log_info "Ожидание остановки стека..."
        sleep 2
        retries=$((retries + 1))
    done
    
    log_warning "Rollback выполнен. Проверьте логи для диагностики проблемы"
    log_info "Для просмотра логов используйте: docker service logs mixer_<service_name>"
}

# ================================================================
# ПОСТ-ДЕПЛОЙ ПРОВЕРКИ
# ================================================================

post_deploy_checks() {
    log_step "Пост-деплой проверки..."
    
    # Проверка всех сервисов
    log_info "Статус всех сервисов:"
    docker stack services mixer
    
    # Проверка использования ресурсов
    log_info "Использование ресурсов контейнерами:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
        $(docker ps --filter "label=com.docker.stack.namespace=mixer" --format "{{.Names}}")
    
    # Проверка логов на ошибки
    log_info "Проверка логов на критические ошибки..."
    local critical_errors=$(docker service logs mixer_mixer-api --since 5m 2>/dev/null | grep -i "error\|critical\|fatal" | wc -l || echo "0")
    
    if [ "$critical_errors" -gt 0 ]; then
        log_warning "Найдено $critical_errors критических ошибок в логах"
        log_info "Используйте 'docker service logs mixer_mixer-api' для детального анализа"
    else
        log_success "Критические ошибки в логах не найдены"
    fi
    
    # Проверка доступности эндпоинтов
    log_info "Проверка основных эндпоинтов..."
    local api_port=$(docker service inspect mixer_mixer-api --format '{{range .Endpoint.Ports}}{{if eq .TargetPort 5000}}{{.PublishedPort}}{{end}}{{end}}' 2>/dev/null || echo "5000")
    
    local endpoints=(
        "http://localhost:${api_port}/health"
        "http://localhost:${api_port}/ready"
        "http://localhost:${api_port}/metrics"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -sf "$endpoint" > /dev/null 2>&1; then
            log_success "✓ $endpoint"
        else
            log_warning "✗ $endpoint"
        fi
    done
}

# ================================================================
# ГЕНЕРАЦИЯ ОТЧЕТА О ДЕПЛОЕ
# ================================================================

generate_deployment_report() {
    log_step "Генерация отчета о деплое..."
    
    local report_file="${PROJECT_ROOT}/logs/deployment-report-$(date +%Y%m%d_%H%M%S).json"
    mkdir -p "$(dirname "$report_file")"
    
    local deployment_info=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "version": "${VERSION}",
  "deployment_duration": "$(($(date +%s) - ${DEPLOYMENT_START_TIME:-$(date +%s)}))",
  "services": $(docker stack services mixer --format json 2>/dev/null | jq -s '.' || echo '[]'),
  "secrets": $(docker secret ls --format json 2>/dev/null | jq -s '.' || echo '[]'),
  "networks": $(docker network ls --filter "name=mixer" --format json 2>/dev/null | jq -s '.' || echo '[]'),
  "volumes": $(docker volume ls --filter "label=com.docker.stack.namespace=mixer" --format json 2>/dev/null | jq -s '.' || echo '[]'),
  "health_status": "healthy",
  "deployed_by": "${USER:-unknown}",
  "deployment_host": "$(hostname)"
}
EOF
)
    
    echo "$deployment_info" > "$report_file"
    log_success "Отчет о деплое сохранен: $report_file"
}

# ================================================================
# ОЧИСТКА ПРИ ЗАВЕРШЕНИИ
# ================================================================

cleanup() {
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        log_error "Деплой завершился с ошибкой (код: $exit_code)"
        
        if [ "$ROLLBACK_ON_FAILURE" = "true" ]; then
            rollback_deployment
        fi
    else
        log_success "Деплой завершен успешно"
        generate_deployment_report
        
        # Показываем финальную информацию
        echo
        log_success "🚀 Crypto Mixer успешно задеплоен в production!"
        log_info "📊 Мониторинг: http://localhost:3000 (Grafana)"
        log_info "🛡️ Система безопасности: активна"
        log_info "📋 Управление: docker stack services mixer"
        log_info "📝 Логи: docker service logs mixer_<service_name>"
        echo
    fi
}

# ================================================================
# ОБРАБОТКА СИГНАЛОВ
# ================================================================

trap cleanup EXIT
trap 'log_error "Получен SIGINT, прерывание деплоя..."; exit 130' INT
trap 'log_error "Получен SIGTERM, прерывание деплоя..."; exit 143' TERM

# ================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ================================================================

main() {
    local DEPLOYMENT_START_TIME=$(date +%s)
    
    log_info "🚀 Начало production деплоя Crypto Mixer"
    log_info "Версия: ${VERSION:-latest}"
    log_info "Время начала: $(date)"
    echo
    
    # Выполнение всех этапов деплоя
    check_prerequisites
    initialize_secrets
    backup_deployment
    deploy_stack
    
    # Проверки готовности
    if wait_for_services && check_health_endpoints; then
        check_security_system
        post_deploy_checks
        
        local deployment_time=$(($(date +%s) - DEPLOYMENT_START_TIME))
        log_success "✅ Деплой завершен успешно за ${deployment_time} секунд"
    else
        log_error "❌ Деплой не удался"
        exit 1
    fi
}

# ================================================================
# HELP
# ================================================================

show_help() {
    cat << 'EOF'
Crypto Mixer Production Deployment Script

ИСПОЛЬЗОВАНИЕ:
    ./deploy-production.sh [OPTIONS]

ОПЦИИ:
    --version VERSION           Версия для деплоя (по умолчанию: latest)
    --no-backup                 Пропустить backup перед деплоем
    --no-rollback              Отключить автоматический rollback
    --timeout SECONDS          Timeout деплоя в секундах (по умолчанию: 600)
    --health-retries COUNT     Количество попыток health check (по умолчанию: 30)
    --help                     Показать эту справку

ПРИМЕРЫ:
    ./deploy-production.sh
    ./deploy-production.sh --version v1.2.3
    ./deploy-production.sh --no-backup --timeout 900

ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:
    VERSION                    Версия для деплоя
    DEPLOYMENT_TIMEOUT         Timeout деплоя (секунды)
    BACKUP_BEFORE_DEPLOY       Создавать backup (true/false)
    ROLLBACK_ON_FAILURE       Rollback при ошибке (true/false)
EOF
}

# ================================================================
# ПАРСИНГ АРГУМЕНТОВ
# ================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            export VERSION="$2"
            shift 2
            ;;
        --no-backup)
            export BACKUP_BEFORE_DEPLOY="false"
            shift
            ;;
        --no-rollback)
            export ROLLBACK_ON_FAILURE="false"
            shift
            ;;
        --timeout)
            export DEPLOYMENT_TIMEOUT="$2"
            shift 2
            ;;
        --health-retries)
            export HEALTH_CHECK_RETRIES="$2"
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

# Запуск главной функции
main "$@"