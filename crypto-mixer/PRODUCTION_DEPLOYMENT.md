# 🚀 Production Deployment Guide - Crypto Mixer

Полное руководство по развертыванию Crypto Mixer в производственной среде с максимальной безопасностью.

## 📋 Обзор

Данная конфигурация включает:

- **🛡️ Многоуровневая система безопасности** - Rate limiting, DDoS protection, WAF
- **🔐 Docker Secrets** - Безопасное управление секретами и сертификатами  
- **📊 Комплексный мониторинг** - Health checks, метрики, алертинг
- **🏗️ Multi-stage builds** - Оптимизированные Docker образы
- **🔄 Auto-scaling** - Автоматическое масштабирование сервисов
- **💾 Backup стратегия** - Автоматические бэкапы данных и конфигураций

## 🛠️ Предварительные требования

### Системные требования

```bash
# Минимальные требования
CPU: 4 cores
RAM: 8GB
Disk: 100GB SSD
Network: 1Gbps

# Рекомендуемые для production
CPU: 8 cores
RAM: 16GB  
Disk: 500GB NVMe SSD
Network: 10Gbps
```

### Программное обеспечение

```bash
# Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose (если не включен в Docker)
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Дополнительные утилиты
sudo apt-get update && sudo apt-get install -y \
    curl \
    jq \
    openssl \
    htop \
    iotop \
    netcat \
    redis-tools
```

## 🔐 Инициализация секретов

### 1. Автоматическая инициализация

```bash
# Полная инициализация всех секретов
./backend/scripts/secrets-manager.sh init

# Или пошагово:
./backend/scripts/secrets-manager.sh generate  # Генерация паролей
./backend/scripts/secrets-manager.sh ssl      # SSL сертификаты  
./backend/scripts/secrets-manager.sh vault    # HashiCorp Vault
```

### 2. Проверка созданных секретов

```bash
# Просмотр Docker secrets
docker secret ls

# Детальная информация о секретах
./backend/scripts/secrets-manager.sh info

# Валидация конфигурации
./backend/scripts/secrets-manager.sh validate
```

### 3. Настройка переменных окружения

```bash
# Создайте файл .env.production
cp backend/secrets/.env.production .env

# Настройте специфичные для среды параметры
export VERSION="v1.0.0"
export SSL_DOMAIN="your-domain.com"
export MONITORING_ENABLED="true"
export ALERTING_WEBHOOK_URL="https://hooks.slack.com/..."
```

## 🚀 Развертывание

### 1. Быстрый деплой

```bash
# Автоматический деплой с проверками
./scripts/deploy-production.sh

# С дополнительными параметрами
./scripts/deploy-production.sh \
    --version v1.2.3 \
    --timeout 900 \
    --no-backup
```

### 2. Ручной деплой

```bash
# 1. Инициализация Docker Swarm
docker swarm init

# 2. Создание сетей
docker network create --driver overlay --encrypted mixer-internal
docker network create --driver overlay --encrypted mixer-frontend  
docker network create --driver overlay --encrypted mixer-monitoring
docker network create --driver overlay --encrypted mixer-secure

# 3. Развертывание стека
docker stack deploy \
    --compose-file docker-compose.production.yml \
    --with-registry-auth \
    mixer

# 4. Проверка развертывания
docker stack services mixer
```

### 3. Проверка готовности

```bash
# Автоматическая проверка всех компонентов
./scripts/monitor-deployment.sh status

# Проверка отдельных компонентов
./scripts/monitor-deployment.sh health      # Health endpoints
./scripts/monitor-deployment.sh resources   # Использование ресурсов  
./scripts/monitor-deployment.sh security    # Система безопасности
./scripts/monitor-deployment.sh logs        # Анализ логов
```

## 📊 Мониторинг и управление

### 1. Непрерывный мониторинг

```bash
# Запуск continuous мониторинга
./scripts/monitor-deployment.sh continuous --interval 30

# С алертингом в Slack
./scripts/monitor-deployment.sh continuous \
    --webhook https://hooks.slack.com/services/...
```

### 2. Доступ к сервисам

```bash
# Основные endpoints
curl http://localhost:5000/health          # Health check
curl http://localhost:5000/ready           # Readiness probe  
curl http://localhost:5000/metrics         # Prometheus метрики
curl http://localhost:5000/api/v1/security/status  # Статус безопасности

# Grafana (если настроен)
open http://localhost:3000
# Логин: admin / Пароль: из секрета grafana_admin_password
```

### 3. Управление сервисами

```bash
# Просмотр статуса сервисов
docker stack services mixer

# Масштабирование сервисов
docker service scale mixer_mixer-api=5

# Просмотр логов сервисов
docker service logs mixer_mixer-api -f

# Обновление сервиса
docker service update --image mixer/api:v1.2.3 mixer_mixer-api
```

## 🛡️ Система безопасности

### 1. Конфигурация rate limiting

```bash
# Настройка через переменные окружения
export RATE_LIMIT_GLOBAL=2000      # Общий лимит запросов
export RATE_LIMIT_MIX=5            # Лимит для операций микширования
export DDOS_PROTECTION_ENABLED=true
export DDOS_RPS_THRESHOLD=100      # Порог RPS для DDoS детекции
```

### 2. Мониторинг безопасности

```bash
# Статус системы безопасности
curl http://localhost:5000/api/v1/security/status

# Активные алерты
curl http://localhost:5000/api/v1/security/alerts?active=true

# Отчеты безопасности
curl http://localhost:5000/api/v1/security/reports?type=hourly
```

### 3. Экстренные процедуры

```bash
# Активация экстренного режима
curl -X POST http://localhost:5000/api/v1/security/emergency \
  -H "Content-Type: application/json" \
  -d '{"activate": true, "reason": "High attack volume"}'

# Ручная блокировка IP
# (Реализуется через API endpoint, когда будет готов)
```

## 💾 Backup и восстановление

### 1. Создание backup

```bash
# Автоматический backup через secrets manager
./backend/scripts/secrets-manager.sh backup

# Ручной backup критических данных
docker run --rm \
  -v mixer_postgres-master-data:/data \
  -v $(pwd)/backups:/backup \
  postgres:16.1-alpine \
  pg_dump -h postgres -U mixer_user mixer_db > /backup/db-$(date +%Y%m%d).sql
```

### 2. Мониторинг backup

```bash
# Проверка последних backup
ls -la ./backend/secrets/backup/

# Проверка целостности
openssl enc -aes-256-cbc -d -pbkdf2 -salt \
  -in ./backend/secrets/backup/secrets-latest.tar.gz.enc \
  | tar -tzf - > /dev/null && echo "Backup OK"
```

## 🔧 Troubleshooting

### 1. Проблемы с развертыванием

```bash
# Проверка Docker Swarm
docker node ls
docker system info

# Проверка секретов
docker secret ls
./backend/scripts/secrets-manager.sh validate

# Проверка сетей
docker network ls | grep mixer
```

### 2. Проблемы с производительностью

```bash
# Мониторинг ресурсов
docker stats
htop

# Проверка логов на ошибки
docker service logs mixer_mixer-api | grep -i error

# Анализ медленных запросов  
curl http://localhost:5000/metrics | grep response_time
```

### 3. Проблемы с безопасностью

```bash
# Проверка активных блокировок
curl http://localhost:5000/api/v1/security/status | jq '.statistics'

# Просмотр заблокированных IP
# (API endpoint для этого будет добавлен)

# Проверка логов security middleware
docker service logs mixer_mixer-api | grep -i "security\|ddos\|blocked"
```

### 4. Диагностические команды

```bash
# Полная диагностика
./scripts/monitor-deployment.sh report

# Проверка подключений к базе данных
docker exec $(docker ps -q --filter "name=mixer_postgres-master") \
  psql -U mixer_user -d mixer_db -c "SELECT count(*) FROM pg_stat_activity;"

# Проверка Redis
docker exec $(docker ps -q --filter "name=mixer_redis-master") \
  redis-cli --no-auth-warning -a "$(cat /run/secrets/redis_password)" ping
```

## ⚙️ Конфигурация

### 1. Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `VERSION` | Версия образов для деплоя | `latest` |
| `API_PORT` | Порт API сервиса | `5000` |
| `DB_HOST` | Хост базы данных | `postgres-master.mixer.local` |
| `REDIS_HOST` | Хост Redis | `redis-master.mixer.local` |
| `SECURITY_ENABLED` | Включение системы безопасности | `true` |
| `RATE_LIMIT_GLOBAL` | Глобальный лимит запросов | `2000` |
| `DDOS_PROTECTION_ENABLED` | Включение DDoS защиты | `true` |
| `MONITORING_ENABLED` | Включение мониторинга | `true` |

### 2. Конфигурационные файлы

```bash
# Основные конфигурации
/opt/mixer/config/
├── app/                    # Конфигурации приложений
├── nginx/                  # Конфигурации Nginx
├── postgres/               # Конфигурации PostgreSQL
├── redis/                  # Конфигурации Redis
├── rabbitmq/              # Конфигурации RabbitMQ
└── monitoring/            # Конфигурации мониторинга

# Логи
/opt/mixer/logs/
├── app/                   # Логи приложений
├── nginx/                 # Логи Nginx
├── postgres/              # Логи PostgreSQL
└── security/              # Логи системы безопасности

# Данные
/opt/mixer/data/
├── postgres-master/       # Данные основной БД
├── postgres-slave/        # Данные реплики БД
├── redis/                 # Данные Redis
└── rabbitmq/              # Данные RabbitMQ
```

## 🔄 Обновления

### 1. Rolling update

```bash
# Обновление с zero-downtime
docker service update --image mixer/api:v1.2.3 mixer_mixer-api

# Обновление всего стека
VERSION=v1.2.3 docker stack deploy \
    --compose-file docker-compose.production.yml \
    mixer
```

### 2. Rollback

```bash
# Автоматический rollback при ошибке
./scripts/deploy-production.sh --version v1.2.3

# Ручной rollback
docker service rollback mixer_mixer-api
```

## 📈 Оптимизация производительности

### 1. Настройки ресурсов

```yaml
# В docker-compose.production.yml
resources:
  limits:
    memory: 2G
    cpus: '1.0'
  reservations:
    memory: 1G  
    cpus: '0.5'
```

### 2. Автомасштабирование

```bash
# Настройка автомасштабирования на основе CPU
docker service update \
  --replicas-max-per-node 2 \
  --constraint-add 'node.labels.tier==application' \
  mixer_mixer-api
```

## 🚨 Алертинг

### 1. Настройка Slack алертов

```bash
export SECURITY_SLACK_WEBHOOK="https://hooks.slack.com/services/..."
export SECURITY_SLACK_CHANNEL="#crypto-mixer-alerts"
```

### 2. Email алерты

```bash
export SECURITY_EMAIL_ALERTS="true"
export SECURITY_EMAIL_RECIPIENTS="admin@cryptomixer.com,security@cryptomixer.com"
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker service logs mixer_<service_name>`
2. Запустите диагностику: `./scripts/monitor-deployment.sh report`
3. Проверьте статус безопасности: `curl http://localhost:5000/api/v1/security/status`
4. Обратитесь к документации системы безопасности: `backend/api/middleware/README.md`

---

**🔐 Crypto Mixer Production Deployment** - Максимальная безопасность для критически важных приложений.