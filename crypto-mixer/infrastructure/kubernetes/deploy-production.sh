#!/bin/bash

# Production Deployment Script для Crypto Mixer
# Автоматизированное развертывание всех компонентов в Kubernetes

set -euo pipefail

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для логирования
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
    exit 1
}

# Переменные
NAMESPACE="crypto-mixer"
KUBECTL_TIMEOUT="300s"
CONTEXT="${KUBECTL_CONTEXT:-}"

# Проверка предварительных условий
check_prerequisites() {
    log_info "Проверка предварительных условий..."
    
    # Проверка kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl не установлен"
    fi
    
    # Проверка helm (для cert-manager)
    if ! command -v helm &> /dev/null; then
        log_error "helm не установлен"
    fi
    
    # Проверка контекста Kubernetes
    if [ -n "$CONTEXT" ]; then
        kubectl config use-context "$CONTEXT"
    fi
    
    # Проверка подключения к кластеру
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Не удается подключиться к кластеру Kubernetes"
    fi
    
    log_success "Предварительные условия выполнены"
}

# Установка необходимых операторов
install_operators() {
    log_info "Установка необходимых операторов..."
    
    # Cert-manager для SSL сертификатов
    log_info "Установка cert-manager..."
    helm repo add jetstack https://charts.jetstack.io
    helm repo update
    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --version v1.13.0 \
        --set installCRDs=true \
        --wait --timeout $KUBECTL_TIMEOUT
    
    # NGINX Ingress Controller
    log_info "Установка NGINX Ingress Controller..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.replicaCount=3 \
        --set controller.nodeSelector."kubernetes\.io/os"=linux \
        --set defaultBackend.nodeSelector."kubernetes\.io/os"=linux \
        --set controller.admissionWebhooks.patch.nodeSelector."kubernetes\.io/os"=linux \
        --wait --timeout $KUBECTL_TIMEOUT
    
    # Metrics Server (если не установлен)
    if ! kubectl get deployment metrics-server -n kube-system &> /dev/null; then
        log_info "Установка Metrics Server..."
        kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    fi
    
    # VPA (Vertical Pod Autoscaler) - опционально
    read -p "Установить Vertical Pod Autoscaler? (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Установка VPA..."
        kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vpa-components.yaml
    fi
    
    log_success "Операторы установлены"
}

# Создание namespace и базовых ресурсов
create_namespace() {
    log_info "Создание namespace и базовых ресурсов..."
    
    kubectl apply -f namespace.yaml
    kubectl wait --for=condition=Active namespace/$NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    log_success "Namespace создан"
}

# Применение secrets
apply_secrets() {
    log_info "Применение secrets..."
    
    # Проверка, что секреты настроены
    if grep -q "CHANGE_ME" production-secrets.yaml; then
        log_error "Необходимо настроить секреты в production-secrets.yaml перед развертыванием!"
    fi
    
    kubectl apply -f production-secrets.yaml
    
    log_success "Secrets применены"
}

# Применение configmaps
apply_configmaps() {
    log_info "Применение ConfigMaps..."
    
    kubectl apply -f production-config.yaml
    
    log_success "ConfigMaps применены"
}

# Развертывание storage layer (PostgreSQL, Redis, RabbitMQ)
deploy_storage() {
    log_info "Развертывание storage layer..."
    
    # PostgreSQL
    log_info "Развертывание PostgreSQL..."
    kubectl apply -f mixer-deployment.yaml
    kubectl wait --for=condition=Available deployment/postgres -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    # Redis
    log_info "Развертывание Redis..."
    kubectl wait --for=condition=Available deployment/redis -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    # RabbitMQ
    log_info "Развертывание RabbitMQ..."
    kubectl apply -f rabbitmq-deployment.yaml
    kubectl wait --for=condition=Ready statefulset/rabbitmq -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    log_success "Storage layer развернут"
}

# Развертывание backend services
deploy_backend() {
    log_info "Развертывание backend services..."
    
    # Blockchain Service
    log_info "Развертывание Blockchain Service..."
    kubectl apply -f blockchain-service.yaml
    kubectl wait --for=condition=Available deployment/blockchain-service -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    # Wallet Service
    log_info "Развертывание Wallet Service..."
    kubectl apply -f wallet-service-deployment.yaml
    kubectl wait --for=condition=Available deployment/wallet-service -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    # Scheduler Service
    log_info "Развертывание Scheduler Service..."
    kubectl apply -f scheduler-service.yaml
    kubectl wait --for=condition=Available deployment/scheduler-service -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    # Mixer API
    log_info "Развертывание Mixer API..."
    kubectl wait --for=condition=Available deployment/mixer-api -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    log_success "Backend services развернуты"
}

# Развертывание frontend
deploy_frontend() {
    log_info "Развертывание Frontend..."
    
    kubectl apply -f frontend-deployment.yaml
    kubectl wait --for=condition=Available deployment/frontend -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    log_success "Frontend развернут"
}

# Развертывание monitoring
deploy_monitoring() {
    log_info "Развертывание Monitoring stack..."
    
    # Monitoring stack
    kubectl apply -f monitoring.yaml
    kubectl wait --for=condition=Available deployment/prometheus -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    kubectl wait --for=condition=Available deployment/grafana -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    kubectl wait --for=condition=Available deployment/alertmanager -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    # Monitoring Service
    kubectl apply -f monitoring-service-deployment.yaml
    kubectl wait --for=condition=Available deployment/monitoring-service -n $NAMESPACE --timeout=$KUBECTL_TIMEOUT
    
    log_success "Monitoring развернут"
}

# Настройка автоскейлинга
configure_autoscaling() {
    log_info "Настройка автоскейлинга..."
    
    # HPA уже настроены в deployment файлах
    
    # VPA (если установлен)
    if kubectl get crd verticalpodautoscalers.autoscaling.k8s.io &> /dev/null; then
        kubectl apply -f vertical-pod-autoscaler.yaml
        log_success "VPA настроен"
    fi
    
    log_success "Автоскейлинг настроен"
}

# Настройка ingress
configure_ingress() {
    log_info "Настройка Ingress..."
    
    kubectl apply -f production-ingress.yaml
    
    # Ожидание готовности ingress
    sleep 30
    
    log_success "Ingress настроен"
}

# Проверка состояния развертывания
check_deployment_status() {
    log_info "Проверка состояния развертывания..."
    
    echo
    echo "=== Статус подов ==="
    kubectl get pods -n $NAMESPACE -o wide
    
    echo
    echo "=== Статус сервисов ==="
    kubectl get services -n $NAMESPACE
    
    echo
    echo "=== Статус HPA ==="
    kubectl get hpa -n $NAMESPACE
    
    echo
    echo "=== Статус PDB ==="
    kubectl get pdb -n $NAMESPACE
    
    echo
    echo "=== Статус Ingress ==="
    kubectl get ingress -n $NAMESPACE
    
    # Проверка health endpoints
    log_info "Проверка health endpoints..."
    
    # Список сервисов для проверки
    services=("mixer-api:3000" "blockchain-service:3001" "scheduler-service:3002" "wallet-service:3003" "monitoring-service:3004")
    
    for service in "${services[@]}"; do
        name=$(echo $service | cut -d: -f1)
        port=$(echo $service | cut -d: -f2)
        
        if kubectl exec -n $NAMESPACE deployment/$name -- curl -f -s "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "$name health check пройден"
        else
            log_warning "$name health check не прошел"
        fi
    done
}

# Вывод полезной информации
print_deployment_info() {
    log_info "Информация о развертывании:"
    
    echo
    echo "=== Доступные URL ==="
    
    # Получение внешнего IP ingress controller
    EXTERNAL_IP=$(kubectl get service ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    if [ -z "$EXTERNAL_IP" ] || [ "$EXTERNAL_IP" = "null" ]; then
        EXTERNAL_IP=$(kubectl get service ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    fi
    
    if [ -z "$EXTERNAL_IP" ] || [ "$EXTERNAL_IP" = "null" ]; then
        EXTERNAL_IP="<EXTERNAL_IP>"
        log_warning "Внешний IP не назначен, используйте kubectl port-forward для доступа"
    fi
    
    echo "🌐 Frontend: https://mixer.yourdomain.com (или http://$EXTERNAL_IP)"
    echo "🔧 API: https://api.mixer.yourdomain.com (или http://$EXTERNAL_IP/api)"
    echo "📊 Grafana: https://grafana.mixer.yourdomain.com"
    echo "📈 Prometheus: https://prometheus.mixer.yourdomain.com"
    
    echo
    echo "=== Полезные команды ==="
    echo "📋 Логи: kubectl logs -f deployment/<service-name> -n $NAMESPACE"
    echo "🔍 Отладка: kubectl exec -it deployment/<service-name> -n $NAMESPACE -- /bin/sh"
    echo "📊 Метрики: kubectl top pods -n $NAMESPACE"
    echo "🔄 Перезапуск: kubectl rollout restart deployment/<service-name> -n $NAMESPACE"
    
    echo
    echo "=== Безопасность ==="
    echo "🔐 Секреты: kubectl get secrets -n $NAMESPACE"
    echo "🛡️ Network Policies: kubectl get networkpolicies -n $NAMESPACE"
    echo "🔒 Service Accounts: kubectl get serviceaccounts -n $NAMESPACE"
}

# Основная функция развертывания
main() {
    log_info "🚀 Начало развертывания Crypto Mixer в продакшн"
    
    # Проверка аргументов
    if [ $# -gt 0 ] && [ "$1" = "--skip-operators" ]; then
        SKIP_OPERATORS=true
    else
        SKIP_OPERATORS=false
    fi
    
    # Выполнение развертывания
    check_prerequisites
    
    if [ "$SKIP_OPERATORS" = false ]; then
        install_operators
    fi
    
    create_namespace
    apply_secrets
    apply_configmaps
    deploy_storage
    deploy_backend
    deploy_frontend
    deploy_monitoring
    configure_autoscaling
    configure_ingress
    
    # Проверка результатов
    check_deployment_status
    print_deployment_info
    
    log_success "🎉 Развертывание Crypto Mixer завершено успешно!"
    log_info "⏰ Время развертывания: $SECONDS секунд"
}

# Обработка сигналов
trap 'log_error "Развертывание прервано"' INT TERM

# Запуск
main "$@"