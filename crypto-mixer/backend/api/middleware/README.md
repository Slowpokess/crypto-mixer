# 🛡️ Система безопасности Crypto Mixer

Комплексная система защиты от DDoS атак и контроля доступа для crypto-mixer backend.

## 📋 Обзор

Система включает в себя:

- **🚧 Rate Limiting** - Многоуровневые ограничения запросов
- **🛡️ DDoS Protection** - Продвинутая защита от атак с машинным обучением  
- **📊 Security Monitoring** - Реал-тайм мониторинг и алертинг
- **🚨 Emergency Mode** - Автоматический экстренный режим
- **🔍 Pattern Detection** - Обнаружение подозрительных паттернов
- **📈 Analytics & Reporting** - Аналитика и отчетность

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install redis express-rate-limit
```

### 2. Настройка переменных окружения

Скопируйте файл конфигурации:
```bash
cp .env.security.example .env
```

Основные настройки:
```env
# Основные
SECURITY_ENABLED=true
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_GLOBAL=1000
RATE_LIMIT_MIX=5

# DDoS Protection
DDOS_RPS_THRESHOLD=100
DDOS_IP_RPS_THRESHOLD=20

# Алертинг
SECURITY_EMAIL_ALERTS=true
SECURITY_SLACK_WEBHOOK=https://hooks.slack.com/...
```

### 3. Интеграция в Express

```typescript
import express from 'express';
import { setupSecurity } from './api/middleware/securityMiddleware';

const app = express();

// Инициализация системы безопасности
const security = setupSecurity(app, {
  enabled: true,
  rateLimiting: {
    global: {
      windowMs: 15 * 60 * 1000,  // 15 минут
      maxRequests: 1000
    }
  }
});

app.listen(5000);
```

## 🔧 Конфигурация

### Rate Limiting

```typescript
const rateLimitingConfig = {
  global: {
    windowMs: 15 * 60 * 1000,    // Окно времени
    maxRequests: 1000,           // Максимум запросов
    whitelist: ['127.0.0.1'],    // Белый список
    blacklist: ['192.168.1.50']  // Черный список
  },
  endpoints: {
    '/api/v1/mix': {
      windowMs: 10 * 60 * 1000,
      maxRequests: 5
    }
  },
  redis: {
    enabled: true,
    url: 'redis://localhost:6379'
  }
};
```

### DDoS Protection

```typescript
const ddosConfig = {
  enabled: true,
  sensitivity: 'adaptive',      // low, medium, high, adaptive
  thresholds: {
    requestsPerSecond: 100,     // Общий RPS
    requestsPerIP: 20,          // RPS с одного IP
    uniqueIPsPerMinute: 500     // Уникальные IP
  },
  mitigation: {
    autoBlock: true,
    blockDuration: 300          // 5 минут
  }
};
```

### Monitoring & Alerting

```typescript
const monitoringConfig = {
  enabled: true,
  intervals: {
    realTime: 5000,             // Реал-тайм анализ
    statistics: 30000,          // Сбор статистики
    reporting: 3600000          // Генерация отчетов
  },
  alerting: {
    enabled: true,
    channels: {
      email: {
        enabled: true,
        recipients: ['admin@crypto-mixer.com']
      },
      slack: {
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/...',
        channel: '#security-alerts'
      }
    }
  }
};
```

## 📊 API Endpoints

### Статистика безопасности
```http
GET /api/v1/security/status
```

Возвращает текущее состояние системы безопасности.

### Алерты
```http
GET /api/v1/security/alerts?active=true&limit=100
POST /api/v1/security/alerts/:alertId/acknowledge
POST /api/v1/security/alerts/:alertId/resolve
```

### Экстренный режим
```http
POST /api/v1/security/emergency
Content-Type: application/json

{
  "activate": true,
  "reason": "Manual override"
}
```

### Отчеты
```http
GET /api/v1/security/reports?type=hourly&limit=50
```

### Метрики Prometheus
```http
GET /metrics
```

## 🔍 Мониторинг

### Основные метрики

- `security_total_requests` - Общее количество запросов
- `security_blocked_requests` - Количество заблокированных запросов  
- `security_active_blocked_ips` - Активные заблокированные IP
- `security_ddos_attacks_detected` - Обнаруженные DDoS атаки

### Логирование

Система использует структурированное логирование:

```typescript
enhancedDbLogger.warn('🚨 DDoS атака обнаружена', {
  attackType: 'volumetric',
  sourceIP: '192.168.1.100',
  confidence: 0.95,
  mitigationAction: 'ip_blocked'
});
```

### Алерты

Поддерживаемые каналы уведомлений:
- **Email** - SMTP уведомления
- **Slack** - Webhook интеграция
- **SMS** - Twilio/AWS SNS
- **Webhook** - Пользовательские webhook

## 🛠️ Администрирование

### Ручное управление

```typescript
// Блокировка IP
await security.blockIPManually('192.168.1.100', 'Manual block', 3600);

// Активация экстренного режима
await security.toggleEmergencyMode(true, 'High attack volume');

// Обновление конфигурации
security.updateConfiguration({
  rateLimiting: {
    global: { maxRequests: 2000 }
  }
});
```

### Белые и черные списки

В `.env` файле:
```env
WHITELIST_IPS=127.0.0.1,::1,10.0.0.0/8
BLACKLIST_IPS=192.168.1.50,203.0.113.0/24
```

Поддерживаются отдельные IP и CIDR подсети.

## 🧪 Тестирование

### Запуск тестов

```bash
npm test -- api/middleware/tests/security.test.ts
```

### Нагрузочное тестирование

```bash
# Установка k6
brew install k6

# Запуск нагрузочного теста
k6 run scripts/load-test.js
```

### Симуляция атак

```bash
# DDoS симуляция
node scripts/simulate-ddos.js

# Rate limit тест
node scripts/test-rate-limits.js
```

## 🔧 Troubleshooting

### Частые проблемы

**Проблема**: Rate limiting не работает
```bash
# Проверьте Redis подключение
redis-cli ping

# Проверьте логи
tail -f /var/log/crypto-mixer/security.log
```

**Проблема**: Ложные срабатывания DDoS
```env
# Снизьте чувствительность
DDOS_SENSITIVITY=low
DDOS_RPS_THRESHOLD=200
```

**Проблема**: Не приходят алерты
```bash
# Проверьте SMTP настройки
telnet smtp.gmail.com 587

# Тест Slack webhook
curl -X POST $SECURITY_SLACK_WEBHOOK -d '{"text":"Test"}'
```

### Диагностика

```http
GET /api/v1/security/status
```

Возвращает подробную диагностическую информацию:
- Состояние компонентов
- Активные блокировки
- Последние события
- Статистику производительности

## 📈 Производительность

### Рекомендации

1. **Redis**: Используйте Redis для production
2. **Memory**: Мониторьте использование памяти
3. **Cleanup**: Настройте автоочистку старых данных
4. **Sharding**: Рассмотрите шардирование для высоких нагрузок

### Оптимизация

```typescript
const optimizedConfig = {
  rateLimiting: {
    redis: {
      enabled: true,
      keyPrefix: 'rl:', // Короткий префикс
    }
  },
  intervals: {
    realTime: 10000,    // Увеличьте для снижения нагрузки
    cleanup: 300000     // Регулярная очистка
  },
  analytics: {
    machineLearning: false // Отключите ML если не нужно
  }
};
```

## 🔒 Безопасность

### Рекомендации

1. **Secrets**: Используйте переменные окружения для секретов
2. **HTTPS**: Обязательно используйте HTTPS
3. **Firewall**: Настройте сетевой firewall
4. **Updates**: Регулярно обновляйте зависимости
5. **Monitoring**: Мониторьте саму систему безопасности

### Hardening

```env
# Ограничение функций для production
SECURITY_DEV_MODE=false
SECURITY_VERBOSE_LOGGING=false
SECURITY_ATTACK_SIMULATION=false
```

## 📝 Logging

### Структура логов

```json
{
  "timestamp": "2025-01-06T12:00:00.000Z",
  "level": "warn",
  "message": "🚨 DDoS атака обнаружена",
  "data": {
    "attackType": "volumetric",
    "sourceIP": "192.168.1.100",
    "confidence": 0.95,
    "rps": 150,
    "action": "ip_blocked"
  }
}
```

### Log rotation

```bash
# logrotate конфигурация
/var/log/crypto-mixer/security.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    create 644 app app
}
```

## 🚀 Production Deploy

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 5000

CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
      - SECURITY_ENABLED=true
    depends_on:
      - redis
      
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crypto-mixer-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: crypto-mixer-backend
  template:
    metadata:
      labels:
        app: crypto-mixer-backend
    spec:
      containers:
      - name: backend
        image: crypto-mixer/backend:latest
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: SECURITY_ENABLED
          value: "true"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## 🤝 Contributing

1. Форкните репозиторий
2. Создайте feature branch (`git checkout -b feature/security-enhancement`)
3. Добавьте тесты для новой функциональности
4. Убедитесь что все тесты проходят (`npm test`)
5. Создайте Pull Request

### Code Style

```bash
# Форматирование кода
npm run format

# Линтинг
npm run lint

# Type checking
npm run type-check
```

## 📚 Дополнительные ресурсы

- [Rate Limiting Best Practices](https://example.com/rate-limiting)
- [DDoS Protection Strategies](https://example.com/ddos-protection)
- [Security Monitoring Guide](https://example.com/security-monitoring)
- [Incident Response Playbook](https://example.com/incident-response)

## 📄 License

MIT License - см. [LICENSE](LICENSE) файл.

---

**Crypto Mixer Security System** - Enterprise-grade защита для crypto mixing сервисов 🚀