#!/bin/bash

# ============================================================================
# CRYPTO MIXER - MONITORING AND LOGGING SETUP
# ============================================================================
# РУССКИЙ: Быстрая настройка системы мониторинга и логирования
# Версия: 1.0.0

set -euo pipefail

# Директории
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="/opt/mixer/config"

# Цвета
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

# Создание базовой конфигурации Prometheus
setup_prometheus_config() {
    log_info "Настройка конфигурации Prometheus..."
    
    mkdir -p "$CONFIG_DIR/monitoring"
    
    cat > "$CONFIG_DIR/monitoring/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alerts/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'mixer-api'
    static_configs:
      - targets: ['mixer-api:5000']
    metrics_path: '/metrics'
    scrape_interval: 30s
  
  - job_name: 'blockchain-service'
    static_configs:
      - targets: ['blockchain-service:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s
  
  - job_name: 'wallet-service'
    static_configs:
      - targets: ['wallet-service:3003']
    metrics_path: '/metrics'
    scrape_interval: 30s
  
  - job_name: 'scheduler-service'
    static_configs:
      - targets: ['scheduler-service:3002']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
EOF

    log_success "Конфигурация Prometheus создана"
}

# Создание базовых алертов
setup_prometheus_alerts() {
    log_info "Настройка алертов Prometheus..."
    
    mkdir -p "$CONFIG_DIR/monitoring/alerts"
    
    cat > "$CONFIG_DIR/monitoring/alerts/mixer-alerts.yml" << 'EOF'
groups:
- name: mixer-alerts
  rules:
  - alert: ServiceDown
    expr: up == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Service {{ $labels.instance }} is down"
      description: "{{ $labels.instance }} has been down for more than 1 minute."
  
  - alert: HighCPUUsage
    expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High CPU usage on {{ $labels.instance }}"
      description: "CPU usage is above 80% for more than 5 minutes."
  
  - alert: HighMemoryUsage
    expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage on {{ $labels.instance }}"
      description: "Memory usage is above 85% for more than 5 minutes."
  
  - alert: DiskSpaceLow
    expr: (node_filesystem_size_bytes{fstype!="tmpfs"} - node_filesystem_free_bytes{fstype!="tmpfs"}) / node_filesystem_size_bytes{fstype!="tmpfs"} * 100 > 90
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Disk space low on {{ $labels.instance }}"
      description: "Disk usage is above 90% for more than 5 minutes."
EOF

    log_success "Алерты Prometheus настроены"
}

# Создание конфигурации Loki
setup_loki_config() {
    log_info "Настройка конфигурации Loki..."
    
    cat > "$CONFIG_DIR/monitoring/loki-config.yml" << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9093

# By default, Loki will send anonymous, but uniquely-identifiable usage and configuration
# analytics to Grafana Labs. These statistics are sent to https://stats.grafana.org/
analytics:
  reporting_enabled: false
EOF

    log_success "Конфигурация Loki создана"
}

# Создание конфигурации Promtail
setup_promtail_config() {
    log_info "Настройка конфигурации Promtail..."
    
    cat > "$CONFIG_DIR/monitoring/promtail-config.yml" << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: containerlogs
          __path__: /var/lib/docker/containers/*/*.log
    pipeline_stages:
      - json:
          expressions:
            output: log
            stream: stream
            attrs:
      - json:
          expressions:
            tag:
          source: attrs
      - regex:
          expression: (?P<container_name>(?:[^|]*))
          source: tag
      - timestamp:
          format: RFC3339Nano
          source: time
      - labels:
          stream:
          container_name:
      - output:
          source: output

  - job_name: syslog
    static_configs:
      - targets:
          - localhost
        labels:
          job: syslog
          __path__: /var/log/syslog

  - job_name: mixer-app-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: mixer-app
          __path__: /var/log/mixer/app/*.log
EOF

    log_success "Конфигурация Promtail создана"
}

# Создание конфигурации Grafana datasources
setup_grafana_datasources() {
    log_info "Настройка источников данных Grafana..."
    
    mkdir -p "$CONFIG_DIR/monitoring/grafana/datasources"
    
    cat > "$CONFIG_DIR/monitoring/grafana/datasources/datasources.yml" << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
    
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: true
EOF

    log_success "Источники данных Grafana настроены"
}

# Создание базового дашборда для Grafana
setup_grafana_dashboard() {
    log_info "Создание базового дашборда Grafana..."
    
    mkdir -p "$CONFIG_DIR/monitoring/grafana/dashboards"
    
    cat > "$CONFIG_DIR/monitoring/grafana/dashboards/dashboards.yml" << 'EOF'
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
EOF

    # Создание простого дашборда для криптомиксера
    cat > "$CONFIG_DIR/monitoring/grafana/dashboards/crypto-mixer-overview.json" << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Crypto Mixer Overview",
    "tags": ["crypto-mixer"],
    "style": "dark",
    "timezone": "browser",
    "refresh": "30s",
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "title": "Service Status",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=~\"mixer-.*\"}",
            "legendFormat": "{{instance}}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "100 - (avg by(instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "{{instance}}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
      },
      {
        "id": 3,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100",
            "legendFormat": "{{instance}}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8}
      },
      {
        "id": 4,
        "title": "Application Logs",
        "type": "logs",
        "targets": [
          {
            "expr": "{job=\"mixer-app\"}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8}
      }
    ]
  }
}
EOF

    log_success "Базовый дашборд Grafana создан"
}

# Создание логротейта для криптомиксера
setup_logrotate() {
    log_info "Настройка ротации логов..."
    
    sudo tee /etc/logrotate.d/crypto-mixer > /dev/null << 'EOF'
/opt/mixer/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su root root
}

/var/log/mixer/*/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
    su root root
}
EOF

    log_success "Ротация логов настроена"
}

# Главная функция
main() {
    log_info "🚀 Настройка системы мониторинга и логирования Crypto Mixer"
    
    # Создание необходимых директорий
    sudo mkdir -p "$CONFIG_DIR/monitoring/grafana/dashboards"
    sudo mkdir -p "$CONFIG_DIR/monitoring/grafana/datasources"
    sudo mkdir -p "$CONFIG_DIR/monitoring/alerts"
    sudo mkdir -p "/opt/mixer/logs"
    sudo mkdir -p "/var/log/mixer/app"
    sudo mkdir -p "/var/log/mixer/security"
    sudo mkdir -p "/var/log/mixer/audit"
    
    # Установка прав доступа
    sudo chown -R 3000:3000 "/opt/mixer"
    sudo chmod -R 755 "$CONFIG_DIR"
    
    # Выполнение настройки
    setup_prometheus_config
    setup_prometheus_alerts
    setup_loki_config
    setup_promtail_config
    setup_grafana_datasources
    setup_grafana_dashboard
    setup_logrotate
    
    log_success "✅ Система мониторинга и логирования настроена!"
    
    echo
    log_info "📊 Доступные сервисы после развертывания:"
    log_info "   • Grafana: http://localhost:3000 (admin/admin)"
    log_info "   • Prometheus: http://localhost:9090"
    log_info "   • Loki: http://localhost:3100"
    echo
    log_info "📁 Конфигурационные файлы созданы в: $CONFIG_DIR/monitoring/"
    log_info "📝 Логи будут сохраняться в: /opt/mixer/logs/ и /var/log/mixer/"
    echo
}

# Проверка прав и запуск
if [[ $EUID -eq 0 ]]; then
    log_warning "Не запускайте этот скрипт от root!"
    exit 1
fi

main "$@"