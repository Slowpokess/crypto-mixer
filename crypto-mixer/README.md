# Crypto Mixer - Production

Enterprise-grade система агрегации и анализа транзакционных данных из различных блокчейнов.

## Production Архитектура

### Микросервисная архитектура
```
crypto-mixer/
├── services/
│   ├── gateway/                # API Gateway (Kong)
│   ├── mixer-api/             # Core API Service
│   ├── blockchain-service/    # Blockchain Operations
│   ├── wallet-service/        # Wallet Management
│   ├── scheduler-service/     # Transaction Scheduling
│   ├── monitoring-service/    # System Monitoring
│   └── tor-proxy/            # Privacy Proxy
│
├── infrastructure/
│   ├── kubernetes/           # K8s Manifests
│   ├── terraform/           # Infrastructure as Code
│   ├── ansible/             # Server Configuration
│   └── monitoring/          # Prometheus/Grafana
│
├── security/
│   ├── vault/              # HashiCorp Vault
│   ├── certificates/       # SSL/TLS Certs
│   └── policies/          # Security Policies
│
└── deployment/
    ├── docker/            # Docker Configurations
    └── ci-cd/            # CI/CD Pipelines
```

### Сервисы

- **Gateway** - Kong API Gateway с rate limiting и authentication
- **Mixer API** - основной API с business logic
- **Blockchain Service** - мониторинг и взаимодействие с блокчейнами
- **Wallet Service** - генерация и управление кошельками
- **Scheduler Service** - планировщик отложенных транзакций
- **Monitoring Service** - метрики, алерты и мониторинг
- **Tor Proxy** - опциональный Tor прокси для приватности

## Быстрый старт

### Предварительные требования

- Node.js >= 18.0.0
- PostgreSQL >= 14
- Redis >= 6.0
- Docker & Docker Compose (опционально)

### Установка

1. Клонируйте репозиторий:
\`\`\`bash
git clone <repository-url>
cd crypto-mixer
\`\`\`

2. Установите зависимости:
\`\`\`bash
npm run install:all
\`\`\`

3. Настройте переменные окружения:
\`\`\`bash
# Скопируйте примеры конфигурации
cp services/mixer-api/.env.example services/mixer-api/.env
cp services/blockchain-service/.env.example services/blockchain-service/.env
\`\`\`

4. Настройте базу данных:
\`\`\`bash
npm run db:migrate
\`\`\`

5. Соберите проект:
\`\`\`bash
npm run build
\`\`\`

### Запуск в режиме разработки

Запустите каждый сервис в отдельном терминале:

\`\`\`bash
# API сервис
npm run dev:mixer-api

# Blockchain сервис
npm run dev:blockchain

# Frontend
npm run dev:frontend

# Admin панель
npm run dev:admin
\`\`\`

### Запуск с Docker

\`\`\`bash
# Запуск всех сервисов
npm start

# Остановка
npm stop

# Логи
npm run logs
\`\`\`

## Структура проекта

\`\`\`
crypto-mixer/
├── services/
│   ├── mixer-api/           # Основной API сервис
│   └── blockchain-service/  # Сервис мониторинга блокчейнов
├── frontend/               # React приложение
├── admin-dashboard/        # Панель администратора
├── backend/               # Дополнительный backend
├── nginx/                 # Конфигурация nginx
├── scripts/               # Скрипты развертывания
├── security/              # Модули безопасности
└── docker/               # Docker конфигурации
\`\`\`

## API Endpoints

### Mixer API (порт 3000)

- \`POST /api/v1/mixer/create\` - создание запроса на агрегацию
- \`GET /api/v1/mixer/status/:sessionId\` - статус запроса
- \`GET /api/v1/mixer/fees\` - структура комиссий
- \`GET /health\` - проверка состояния

### Blockchain Service (порт 3001)

- \`GET /blockchain/:currency/balance/:address\` - баланс адреса
- \`GET /blockchain/:currency/transaction/:hash\` - информация о транзакции
- \`GET /blockchain/:currency/block/:number\` - информация о блоке

## Конфигурация

### Переменные окружения

Основные переменные окружения описаны в файлах \`.env.example\` в каждом сервисе.

### База данных

Проект использует PostgreSQL для хранения данных. Миграции находятся в:
- \`services/mixer-api/src/database/migrations/\`
- \`scripts/postgres/init.sql\`

### Кэширование

Redis используется для:
- Кэширования запросов
- Управления сессиями
- Rate limiting
- Временного хранения данных

## Безопасность

- Все приватные ключи шифруются с использованием AES-256-GCM
- Реализована защита от основных видов атак (XSS, SQL injection, CSRF)
- Rate limiting на уровне IP адресов
- Валидация всех входящих данных
- Опциональная поддержка Tor для приватности

## Тестирование

\`\`\`bash
# Запуск всех тестов
npm test

# Тесты конкретного сервиса
cd services/mixer-api && npm test
\`\`\`

## Развертывание

\`\`\`bash
# Развертывание в production
npm run deploy
\`\`\`

## Мониторинг

- Health check endpoints доступны на \`/health\`
- Метрики собираются автоматически
- Логи выводятся в структурированном JSON формате

## Лицензия

MIT License

## Поддержка

Для получения поддержки создайте issue в репозитории или свяжитесь с командой разработки.