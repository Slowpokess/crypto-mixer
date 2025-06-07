# 🧪 Тестирование системы мониторинга Crypto Mixer

Этот каталог содержит комплексные тесты для всех компонентов системы мониторинга и алертинга crypto-mixer.

## 📁 Структура тестов

```
tests/
├── AlertManager.test.ts                    # Unit тесты для системы алертов
├── NotificationManager.test.ts             # Unit тесты для системы уведомлений  
├── PerformanceMonitor.test.ts              # Unit тесты для мониторинга производительности
├── MonitoringSystem.integration.test.ts   # Интеграционные тесты всей системы
├── vitest.config.ts                       # Конфигурация тестов Vitest
├── test-setup.ts                          # Настройка окружения тестов
├── run-tests.ts                           # Скрипт запуска тестов
└── README.md                              # Данный файл
```

## 🚀 Быстрый старт

### Установка зависимостей

```bash
# Основные зависимости тестирования
npm install --save-dev vitest @types/node

# Дополнительные зависимости для моков
npm install --save-dev node-fetch nodemailer
```

### Запуск всех тестов

```bash
# Простой запуск всех тестов
npx tsx tests/run-tests.ts

# С анализом покрытия кода
npx tsx tests/run-tests.ts --coverage

# В режиме наблюдения (автоперезапуск при изменениях)
npx tsx tests/run-tests.ts --watch

# Подробный вывод
npx tsx tests/run-tests.ts --verbose
```

### Запуск конкретных групп тестов

```bash
# Только unit тесты
npx tsx tests/run-tests.ts --unit

# Только интеграционные тесты  
npx tsx tests/run-tests.ts --integration

# Конкретный файл тестов
npx vitest run AlertManager.test.ts
```

## 📋 Описание тестов

### 🔧 Unit тесты

#### **AlertManager.test.ts**
- ✅ Инициализация и конфигурация
- ✅ Создание и управление алертами
- ✅ Подтверждение и разрешение алертов
- ✅ Статистика алертов
- ✅ Эмиссия событий
- ✅ Throttling и эскалация
- ✅ Обработка ошибок
- ✅ Управление памятью

#### **NotificationManager.test.ts**
- ✅ Инициализация и провайдеры
- ✅ Webhook уведомления
- ✅ Email уведомления
- ✅ Slack уведомления
- ✅ Telegram уведомления
- ✅ Отправка в несколько каналов
- ✅ Повторные попытки
- ✅ Статистика уведомлений
- ✅ Тестирование каналов

#### **PerformanceMonitor.test.ts**
- ✅ Сбор системных метрик (CPU, память, диск)
- ✅ Сбор метрик приложения (запросы, БД, кэш)
- ✅ Сбор бизнес-метрик (микширование, кошельки)
- ✅ Запись метрик запросов
- ✅ Алертинг при превышении порогов
- ✅ Retention и очистка данных
- ✅ Обновление конфигурации

### 🔗 Интеграционные тесты

#### **MonitoringSystem.integration.test.ts**
- ✅ Жизненный цикл системы (запуск/остановка)
- ✅ Интеграция компонентов алертинга
- ✅ Интеграция мониторинга производительности
- ✅ Интеграция health checks
- ✅ Интеграция с Prometheus
- ✅ Тестирование уведомлений
- ✅ Управление конфигурацией
- ✅ Обработка событий
- ✅ Управление ресурсами

## 🎯 Покрытие тестами

Текущие цели покрытия:
- **Statements**: ≥80%
- **Branches**: ≥70%
- **Functions**: ≥80%
- **Lines**: ≥80%

### Проверка покрытия

```bash
# Генерация отчета о покрытии
npx tsx tests/run-tests.ts --coverage

# Просмотр HTML отчета
open coverage/index.html
```

## 🛠️ Конфигурация тестов

### Переменные окружения

Тесты используют следующие переменные окружения:

```bash
# Основные настройки
NODE_ENV=test
MONITORING_ENABLED=true
PERFORMANCE_MONITORING=true
HEALTH_CHECKS_ENABLED=true
PROMETHEUS_ENABLED=true
ALERTING_ENABLED=true

# Настройки интервалов (для быстрого тестирования)
METRICS_COLLECT_INTERVAL=1
HEALTH_CHECK_INTERVAL=2
PROMETHEUS_PORT=9091

# Отключение внешних сервисов
SMTP_HOST=
SLACK_WEBHOOK_URL=
ALERT_WEBHOOK_URL=
```

### Моки и заглушки

Тесты используют моки для:
- **HTTP запросов** (node-fetch)
- **Email отправки** (nodemailer)
- **Системных метрик** (os, fs)
- **HTTP серверов** для Prometheus

## 📊 Примеры использования

### Тестирование конкретного компонента

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AlertManager from '../AlertManager';

describe('Custom AlertManager Tests', () => {
  let alertManager: AlertManager;

  beforeEach(async () => {
    alertManager = new AlertManager({
      enabled: true,
      maxActiveAlerts: 10
    });
    await alertManager.start();
  });

  afterEach(async () => {
    if (alertManager.isActive()) {
      await alertManager.stop();
    }
  });

  it('should create custom business alert', async () => {
    const alert = await alertManager.createAlert(
      'business',
      'high',
      'Low mixing success rate',
      'Success rate dropped below 90%',
      'mixing_monitor',
      { successRate: 87.5, threshold: 90 }
    );

    expect(alert.type).toBe('business');
    expect(alert.severity).toBe('high');
    expect(alert.metadata.successRate).toBe(87.5);
  });
});
```

### Тестирование уведомлений

```typescript
import { describe, it, expect, vi } from 'vitest';
import NotificationManager from '../NotificationManager';

describe('Custom Notification Tests', () => {
  it('should send webhook notification', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    vi.doMock('node-fetch', () => ({ default: mockFetch }));

    const notificationManager = new NotificationManager();
    await notificationManager.start();

    const result = await notificationManager.sendNotification(
      TestUtils.createMockAlert(),
      TestUtils.createMockNotificationChannel('webhook')
    );

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });
});
```

## 🐛 Отладка тестов

### Логирование в тестах

```typescript
// Включить детальное логирование
process.env.DEBUG = 'crypto-mixer:*';

// Просмотр логов конкретного компонента
process.env.DEBUG = 'crypto-mixer:alerts';
```

### Изоляция проблемных тестов

```bash
# Запуск только одного теста
npx vitest run --testNamePattern="should create alert"

# Запуск тестов в определенном файле
npx vitest run AlertManager.test.ts
```

### Проверка утечек памяти

```bash
# Запуск с проверкой памяти
node --expose-gc --max-old-space-size=4096 \
  npx vitest run --no-coverage
```

## 📈 Метрики качества

### Производительность тестов

- **Unit тесты**: <2 секунды на файл
- **Интеграционные тесты**: <30 секунд на файл
- **Общее время**: <1 минуты для всех тестов

### Надежность

- **Стабильность**: 99%+ проходимость при CI/CD
- **Детерминированность**: Отсутствие flaky тестов
- **Изоляция**: Полная независимость тестов

## 🔄 CI/CD интеграция

### GitHub Actions пример

```yaml
name: Monitoring Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npx tsx backend/utils/monitoring/tests/run-tests.ts --coverage
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
```

## 🤝 Содействие разработке

### Добавление новых тестов

1. **Создайте файл теста**: `NewComponent.test.ts`
2. **Следуйте конвенциям**: Используйте существующую структуру
3. **Добавьте в run-tests.ts**: Включите новый файл в соответствующую группу
4. **Проверьте покрытие**: Убедитесь что покрытие соответствует стандартам

### Правила именования

- **Unit тесты**: `Component.test.ts`
- **Интеграционные тесты**: `Component.integration.test.ts`
- **E2E тесты**: `Component.e2e.test.ts`

### Структура describe блоков

```typescript
describe('ComponentName', () => {
  describe('Initialization', () => { ... });
  describe('Core Functionality', () => { ... });
  describe('Error Handling', () => { ... });
  describe('Configuration', () => { ... });
  describe('Performance', () => { ... });
});
```

## 📚 Дополнительные ресурсы

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Crypto Mixer Architecture](../README.md)

---

**Crypto Mixer Monitoring System Tests** - Comprehensive testing suite for production-ready monitoring 🚀