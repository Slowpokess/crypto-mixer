# Crypto Mixer - Руководство по установке и настройке

## Быстрый старт

### 1. Автоматическая установка

Запустите скрипт автоматической установки для настройки всего окружения:

```bash
cd /Users/macbook/Documents/CM/crypto-mixer
./scripts/setup-environment.sh
```

Этот скрипт автоматически:
- Установит все необходимые зависимости (Node.js, Docker, PostgreSQL, Redis)
- Создаст файлы переменных окружения
- Установит npm зависимости для всех сервисов
- Настроит базу данных
- Создаст необходимые директории

### 2. Настройка переменных окружения

После установки **обязательно** отредактируйте файл `.env`:

```bash
cp .env.example .env
nano .env  # или используйте любой текстовый редактор
```

**Важно изменить:**
- Все пароли (содержащие `CHANGE_ME`)
- JWT и encryption ключи
- API ключи для блокчейн провайдеров
- Настройки блокчейн нод

### 3. Запуск сервисов

```bash
# Запуск всех сервисов
./scripts/start-services.sh

# Проверка статуса
./scripts/check-health.sh

# Просмотр логов
./scripts/view-logs.sh all
```

### 4. Остановка сервисов

```bash
# Остановка всех сервисов
./scripts/stop-services.sh

# Остановка с очисткой логов
./scripts/stop-services.sh --clean-logs
```

## Ручная установка

### Системные требования

- **Node.js** >= 18.0.0
- **Docker** >= 20.0.0
- **PostgreSQL** >= 13
- **Redis** >= 6.0
- **Операционная система**: Ubuntu 20.04+, CentOS 8+, macOS 12+
- **Память**: минимум 4GB RAM
- **Диск**: минимум 20GB свободного места

### Установка зависимостей

#### Ubuntu/Debian

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Базовые пакеты
sudo apt install -y curl wget git build-essential

# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Docker
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Redis
sudo apt install -y redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

#### macOS

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Зависимости
brew install node@20 docker postgresql@15 redis git

# Запуск сервисов
brew services start postgresql@15
brew services start redis
```

### Настройка базы данных

```bash
# Создание пользователя и базы данных
sudo -u postgres psql << EOF
CREATE USER mixer_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE cryptomixer OWNER mixer_user;
GRANT ALL PRIVILEGES ON DATABASE cryptomixer TO mixer_user;
\q
EOF

# Выполнение миграций (если есть)
psql -h localhost -U mixer_user -d cryptomixer -f scripts/postgres/init.sql
```

### Установка npm зависимостей

```bash
# Для каждого сервиса
cd services/mixer-api && npm install
cd services/blockchain-service && npm install
cd services/scheduler-service && npm install
cd services/wallet-service && npm install
cd services/monitoring-service && npm install

# Frontend
cd frontend && npm install
cd admin-dashboard && npm install
```

## Архитектура сервисов

### Основные сервисы

| Сервис | Порт | Описание |
|--------|------|----------|
| **Mixer API** | 3000 | Основной API для микширования |
| **Blockchain Service** | 3001 | Взаимодействие с блокчейнами |
| **Scheduler Service** | 3002 | Планировщик транзакций |
| **Wallet Service** | 3003 | Управление кошельками |
| **Monitoring Service** | 3004 | Мониторинг и метрики |
| **Frontend** | 8080 | Веб-интерфейс |
| **Admin Dashboard** | 8081 | Панель администратора |

### Инфраструктурные сервисы

| Сервис | Порт | Описание |
|--------|------|----------|
| **PostgreSQL** | 5432 | Основная база данных |
| **Redis** | 6379 | Кэш и сессии |
| **RabbitMQ** | 5672 | Очереди сообщений |
| **Prometheus** | 9090 | Метрики |
| **Grafana** | 3001 | Дашборды |
| **Kong** | 8000/8001 | API Gateway |

## Управление сервисами

### Использование скриптов

```bash
# Полная установка окружения
./scripts/setup-environment.sh

# Запуск всех сервисов
./scripts/start-services.sh

# Остановка всех сервисов
./scripts/stop-services.sh

# Проверка здоровья системы
./scripts/check-health.sh

# Просмотр логов
./scripts/view-logs.sh [сервис] [опции]

# Примеры просмотра логов
./scripts/view-logs.sh all              # Все логи
./scripts/view-logs.sh mixer-api        # Логи Mixer API
./scripts/view-logs.sh -f blockchain    # Следить за логами Blockchain
./scripts/view-logs.sh -e scheduler     # Только ошибки Scheduler
./scripts/view-logs.sh -s               # Статус всех сервисов
```

### Docker Compose

```bash
# Запуск через Docker Compose
cd deployment/docker
docker-compose -f docker-compose.production.yml up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

### Systemd (только Linux)

```bash
# Управление сервисами через systemd
sudo systemctl start mixer-api
sudo systemctl start blockchain-service
sudo systemctl start scheduler-service

# Автозапуск
sudo systemctl enable mixer-api
sudo systemctl enable blockchain-service
sudo systemctl enable scheduler-service

# Просмотр статуса
sudo systemctl status mixer-api
```

## Разработка

### Режим разработки

```bash
# Запуск в режиме разработки с hot-reload
cd services/mixer-api
npm run dev

# Или для всех сервисов
npm run dev:all
```

### Тестирование

```bash
# Запуск тестов
npm test

# Тесты с покрытием
npm run test:coverage

# Интеграционные тесты
npm run test:integration
```

### Линтинг и форматирование

```bash
# Проверка кода
npm run lint

# Исправление ошибок
npm run lint:fix

# Форматирование
npm run format
```

## Производственное развертывание

### Kubernetes

```bash
# Развертывание в Kubernetes
kubectl apply -f infrastructure/kubernetes/

# Проверка подов
kubectl get pods -n crypto-mixer

# Просмотр логов
kubectl logs -f deployment/mixer-api -n crypto-mixer
```

### Docker Swarm

```bash
# Инициализация Swarm
docker swarm init

# Развертывание стека
docker stack deploy -c deployment/docker/docker-compose.production.yml mixer

# Проверка сервисов
docker service ls
```

## Мониторинг

### Prometheus метрики

- **URL**: http://localhost:9090
- **Метрики**: доступны на `/metrics` каждого сервиса

### Grafana дашборды

- **URL**: http://localhost:3001
- **Логин**: admin
- **Пароль**: из переменной `GRAFANA_PASSWORD`

### Логи

Логи сохраняются в директории `logs/`:
- `logs/mixer-api.log`
- `logs/blockchain-service.log`
- `logs/scheduler-service.log`
- `logs/frontend.log`

## Безопасность

### Важные настройки безопасности

1. **Смена паролей по умолчанию**
2. **Настройка SSL/TLS сертификатов**
3. **Конфигурация firewall**
4. **Регулярное обновление зависимостей**
5. **Настройка системы резервного копирования**

### Рекомендации

- Используйте сильные пароли (минимум 32 символа)
- Включите 2FA для административных аккаунтов
- Регулярно обновляйте зависимости
- Мониторьте логи безопасности
- Используйте VPN для удаленного доступа

## Резервное копирование

```bash
# Ручное создание бэкапа
./scripts/backup.sh

# Автоматические бэкапы через cron
0 2 * * * /path/to/crypto-mixer/scripts/backup.sh
```

## Устранение неполадок

### Частые проблемы

1. **Сервис не запускается**
   ```bash
   # Проверка логов
   ./scripts/view-logs.sh [сервис]
   
   # Проверка портов
   netstat -tulpn | grep [порт]
   ```

2. **Ошибки подключения к БД**
   ```bash
   # Проверка PostgreSQL
   sudo systemctl status postgresql
   
   # Проверка соединения
   psql -h localhost -U mixer_user -d cryptomixer -c "SELECT 1;"
   ```

3. **Высокое использование ресурсов**
   ```bash
   # Проверка системы
   ./scripts/check-health.sh
   
   # Мониторинг ресурсов
   htop
   ```

### Получение помощи

- **Документация**: `/docs`
- **Логи**: `./scripts/view-logs.sh`
- **Статус системы**: `./scripts/check-health.sh`
- **GitHub Issues**: создайте issue с подробным описанием проблемы

## Лицензия

MIT License - см. файл LICENSE