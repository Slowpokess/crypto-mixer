# Comprehensive Error Handling и Logging Systems

Полнофункциональная система обработки ошибок, аудита и мониторинга для криптомиксера.

## 🎯 Обзор

Эта система включает в себя:

- **🛠️ Error Handler** - Централизованная обработка типизированных ошибок с retry механизмами
- **📋 Audit Logger** - Comprehensive аудит всех операций с шифрованием и проверкой целостности  
- **📊 Performance Monitor** - Мониторинг производительности с distributed tracing
- **🚨 Alert Manager** - Интеллектуальная система алертов с множественными каналами
- **📝 Enhanced Logger** - Структурированное логирование с контекстом операций

## 🚀 Быстрый старт

### Инициализация всех систем

```typescript
import { initializeAllSystems } from './utils/SystemInitializer';

// Инициализация с дефолтными настройками
const systemInitializer = await initializeAllSystems();

// Или с кастомной конфигурацией
const systemInitializer = await initializeAllSystems({
  environment: 'production',
  logLevel: 'info',
  errorHandler: {
    enabled: true,
    criticalErrorThreshold: 10,
    errorRateThreshold: 100,
    timeWindowMinutes: 15
  },
  auditLogger: {
    enabled: true,
    encryptLogs: true,
    enableIntegrityCheck: true,
    retentionDays: 365
  },
  performanceMonitor: {
    enabled: true,
    tracingEnabled: true,
    samplingRate: 0.1, // 10% в продакшене
    slowOperationThreshold: 2000
  },
  alertManager: {
    enabled: true,
    channels: {
      email: {
        enabled: true,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: 'alerts@yourcompany.com',
        smtpPassword: 'password',
        recipients: ['admin@yourcompany.com']
      },
      slack: {
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/...',
        channel: '#alerts'
      }
    }
  }
});

// Получение всех систем
const { errorHandler, auditLogger, performanceMonitor, alertManager } = systemInitializer.getSystems();

// Получение enhanced loggers
const loggers = systemInitializer.getLoggers();
```

### Базовое использование

```typescript
import { 
  enhancedMixerLogger,
  enhancedDbLogger,
  enhancedApiLogger 
} from './utils/logger';

import {
  AuthenticationError,
  DatabaseError,
  MixingError,
  ErrorCode,
  ErrorSeverity
} from './utils/errors/ErrorTypes';

import { AuditEventType } from './utils/logging/AuditLogger';

// Использование enhanced logger с трейсингом
async function processMixingRequest(mixRequest) {
  const operationId = await enhancedMixerLogger.startOperation(
    'processMixingRequest',
    { 
      userId: mixRequest.userId,
      requestId: mixRequest.id,
      metadata: { amount: mixRequest.amount, currency: mixRequest.currency }
    }
  );

  try {
    // Логируем начало операции в audit
    await enhancedMixerLogger.auditLog(
      AuditEventType.MIX_REQUEST_CREATED,
      'New mixing request created',
      { operationId, userId: mixRequest.userId }
    );

    // Выполняем операцию
    const result = await performMixing(mixRequest);

    // Завершаем операцию успешно
    await enhancedMixerLogger.endOperation(operationId, true, {
      metadata: { resultHash: result.hash }
    });

    return result;

  } catch (error) {
    // Обрабатываем ошибку
    await enhancedMixerLogger.logError(error, { operationId });
    
    // Завершаем операцию с ошибкой
    await enhancedMixerLogger.endOperation(operationId, false);
    
    throw error;
  }
}
```

## 🛠️ Error Handler

### Создание типизированных ошибок

```typescript
import {
  AuthenticationError,
  DatabaseError,
  BlockchainError,
  SecurityError,
  MixingError,
  ErrorCode,
  ErrorSeverity
} from './utils/errors/ErrorTypes';

// Аутентификация
const authError = new AuthenticationError(
  'Invalid credentials provided',
  ErrorCode.INVALID_CREDENTIALS,
  { 
    component: 'auth', 
    operation: 'login',
    userId: 'user123',
    additionalInfo: { attemptCount: 3 }
  }
);

// База данных
const dbError = new DatabaseError(
  'Connection timeout after 30 seconds',
  ErrorCode.DATABASE_CONNECTION_FAILED,
  { 
    component: 'database', 
    operation: 'connect',
    additionalInfo: { host: 'db.example.com', timeout: 30000 }
  }
);

// Блокчейн
const blockchainError = new BlockchainError(
  'Transaction confirmation timeout',
  ErrorCode.TRANSACTION_CONFIRMATION_TIMEOUT,
  { 
    component: 'blockchain', 
    operation: 'confirmTransaction',
    additionalInfo: { txHash: '0x123...', currency: 'BTC' }
  },
  ErrorSeverity.HIGH
);

// Безопасность
const securityError = new SecurityError(
  'Encryption key compromised',
  ErrorCode.ENCRYPTION_FAILED,
  { 
    component: 'security', 
    operation: 'encrypt',
    additionalInfo: { keyId: 'key123' }
  }
);

// Микширование
const mixingError = new MixingError(
  'Mixing pool is full',
  ErrorCode.MIXING_POOL_FULL,
  { 
    component: 'mixer', 
    operation: 'joinPool',
    additionalInfo: { poolId: 'pool123', currentSize: 100, maxSize: 100 }
  },
  ErrorSeverity.MEDIUM
);
```

### Обработка ошибок с retry

```typescript
import { withRetry, handleError } from './utils/errors/ErrorHandler';

// Простая обработка ошибки
async function simpleErrorHandling() {
  try {
    await riskyOperation();
  } catch (error) {
    await handleError(error, {
      component: 'myComponent',
      operation: 'simpleOperation',
      userId: 'user123'
    });
    throw error;
  }
}

// Операция с автоматическим retry
async function operationWithRetry() {
  const result = await withRetry(
    async () => {
      return await unreliableOperation();
    },
    {
      component: 'myComponent',
      operation: 'retryOperation',
      userId: 'user123'
    },
    {
      maxRetries: 3,
      retryDelay: 1000, // 1 секунда
      canRecover: true
    }
  );

  if (!result.success) {
    console.error('Операция провалилась после всех retry:', result.error);
    throw result.error;
  }

  return result.result;
}
```

### Получение метрик ошибок

```typescript
import { getErrorHandler } from './utils/errors/ErrorHandler';

const errorHandler = getErrorHandler();

// Получение общих метрик
const metrics = errorHandler.getMetrics();
console.log('Всего ошибок:', metrics.totalErrors);
console.log('Критических ошибок:', metrics.criticalErrorsCount);
console.log('По категориям:', metrics.errorsByCategory);
console.log('По серьезности:', metrics.errorsBySeverity);

// Получение последних ошибок
const recentErrors = errorHandler.getRecentErrors(50);

// Получение статистики за период
const stats = errorHandler.getErrorStatistics(24); // за 24 часа
console.log('Статистика за 24 часа:', stats);
```

## 📋 Audit Logger

### Логирование событий

```typescript
import { 
  getAuditLogger,
  AuditEventType,
  AuditSeverity 
} from './utils/logging/AuditLogger';

const auditLogger = getAuditLogger();

// Логирование пользовательских событий
await auditLogger.logEvent(
  AuditEventType.USER_LOGIN,
  AuditSeverity.INFO,
  'User successfully logged in',
  {
    component: 'auth',
    operation: 'login',
    userId: 'user123',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0...'
  },
  true // success
);

// Логирование операций микширования
await auditLogger.logMixingOperation(
  AuditEventType.MIX_REQUEST_CREATED,
  'mix123',
  1.5, // amount
  'BTC',
  {
    component: 'mixer',
    userId: 'user123',
    ipAddress: '192.168.1.100'
  },
  true,
  { poolId: 'pool123', estimatedTime: 300 }
);

// Логирование блокчейн операций
await auditLogger.logBlockchainOperation(
  AuditEventType.TRANSACTION_CREATED,
  '0x123...',
  'ETH',
  {
    component: 'blockchain',
    userId: 'user123'
  },
  true,
  { gasPrice: '20', gasLimit: '21000' }
);

// Логирование событий безопасности
await auditLogger.logSecurityEvent(
  AuditEventType.SECURITY_VIOLATION,
  'Unauthorized access attempt detected',
  {
    component: 'security',
    ipAddress: '192.168.1.200',
    userAgent: 'curl/7.68.0'
  },
  false,
  { attemptedEndpoint: '/admin/users', method: 'POST' }
);
```

### Трассировка операций

```typescript
// Начало операции
const operationId = await auditLogger.startOperation(
  'processPayment',
  'payment',
  {
    userId: 'user123',
    sessionId: 'session456',
    metadata: { amount: 100, currency: 'USD' }
  }
);

// Выполнение операции...
await new Promise(resolve => setTimeout(resolve, 2000));

// Завершение операции
await auditLogger.endOperation(
  operationId,
  true, // success
  {
    metadata: { transactionId: 'tx789', processingTime: 2000 }
  }
);
```

### Поиск и анализ логов

```typescript
// Поиск событий по фильтрам
const events = auditLogger.findEvents({
  eventType: AuditEventType.USER_LOGIN,
  severity: AuditSeverity.INFO,
  userId: 'user123',
  timeFrom: new Date(Date.now() - 24 * 60 * 60 * 1000), // последние 24 часа
  timeTo: new Date(),
  success: true
});

// Получение последних событий
const recentEvents = auditLogger.getRecentEvents(100);

// Получение метрик
const auditMetrics = auditLogger.getMetrics();
console.log('Audit метрики:', auditMetrics);

// Экспорт логов
const jsonExport = await auditLogger.exportLogs('json', {
  timeFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // последние 7 дней
  eventType: AuditEventType.MIX_REQUEST_CREATED
});

const csvExport = await auditLogger.exportLogs('csv');
```

### Проверка целостности

```typescript
// Проверка целостности конкретного события
const event = recentEvents[0];
const isIntegrityValid = auditLogger.verifyIntegrity(event);
console.log('Целостность события:', isIntegrityValid);

// Проверка всех недавних событий
const integrityReport = recentEvents.map(event => ({
  eventId: event.id,
  isValid: auditLogger.verifyIntegrity(event)
}));
```

## 📊 Performance Monitor

### Трейсинг операций

```typescript
import { 
  getPerformanceMonitor,
  startSpan,
  finishSpan,
  measureOperation 
} from './utils/monitoring/PerformanceMonitor';

const performanceMonitor = getPerformanceMonitor();

// Ручное управление span'ами
const span = performanceMonitor.startSpan(
  'processPayment',
  'payment',
  undefined, // parentSpanId
  { userId: 'user123', amount: 100 }
);

// Добавление логов к span'у
performanceMonitor.addSpanLog(span, 'info', 'Starting payment validation');

// Выполнение операции...
await processPaymentLogic();

performanceMonitor.addSpanLog(span, 'info', 'Payment validation completed');

// Завершение span'а
performanceMonitor.finishSpan(span, 'success');

// Автоматическое измерение async операции
const result = await performanceMonitor.measureAsync(
  'databaseQuery',
  'database',
  async (span) => {
    performanceMonitor.addSpanLog(span, 'info', 'Executing query');
    const data = await db.query('SELECT * FROM users');
    performanceMonitor.addSpanLog(span, 'info', `Found ${data.length} records`);
    return data;
  }
);

// Автоматическое измерение sync операции
const processedData = performanceMonitor.measureSync(
  'dataProcessing',
  'processor',
  (span) => {
    performanceMonitor.addSpanLog(span, 'info', 'Processing data');
    return processData(result);
  }
);

// Удобная функция для измерения
const apiResult = await measureOperation(
  'externalApiCall',
  'api',
  async () => {
    return await fetch('https://api.example.com/data');
  }
);
```

### Запись метрик

```typescript
// Запись custom метрик
performanceMonitor.recordMetric(
  'business.mixing.requests',
  1,
  'count',
  {
    component: 'mixer',
    operation: 'createMixRequest',
    currency: 'BTC'
  }
);

performanceMonitor.recordMetric(
  'database.query.duration',
  150,
  'milliseconds',
  {
    component: 'database',
    operation: 'findUser',
    table: 'users'
  }
);

performanceMonitor.recordMetric(
  'memory.usage',
  85.5,
  'percent',
  {
    component: 'system',
    process: 'mixer-api'
  }
);
```

### Получение метрик и статистики

```typescript
// Системные метрики
const systemMetrics = performanceMonitor.getSystemMetrics();
console.log('CPU usage:', systemMetrics.cpu.usage);
console.log('Memory usage:', systemMetrics.memory.percentage);
console.log('Event loop lag:', systemMetrics.eventLoop.lag);

// Бизнес метрики
const businessMetrics = performanceMonitor.getBusinessMetrics();
console.log('Mixing operations:', businessMetrics.mixingOperations);
console.log('Blockchain operations:', businessMetrics.blockchainOperations);

// Метрики за период
const recentMetrics = performanceMonitor.getMetrics(10); // последние 10 минут
const operationMetrics = performanceMonitor.getMetrics(
  30, // 30 минут
  'operation.duration', // конкретная метрика
  'mixer' // конкретный компонент
);

// Активные span'ы
const activeSpans = performanceMonitor.getActiveSpans();

// Trace по ID
const traceSpans = performanceMonitor.getTrace('trace_123456789');

// Статистика производительности
const perfStats = performanceMonitor.getPerformanceStats();
console.log('System health:', perfStats.systemHealth);
console.log('Slow operations:', perfStats.slowOperations);
console.log('Top slow operations:', perfStats.topSlowOperations);

// Экспорт для Prometheus
const prometheusData = performanceMonitor.exportPrometheusMetrics();
```

## 🚨 Alert Manager

### Настройка правил алертов

```typescript
import { 
  getAlertManager,
  AlertSeverity,
  AlertChannel 
} from './utils/alerts/AlertManager';

import { ErrorSeverity } from './utils/errors/ErrorTypes';

const alertManager = getAlertManager();

// Правило для критических ошибок
alertManager.addRule({
  id: 'critical_system_errors',
  name: 'Критические ошибки системы',
  description: 'Алерт для всех критических ошибок',
  enabled: true,
  conditions: {
    errorSeverity: [ErrorSeverity.CRITICAL]
  },
  alertSeverity: AlertSeverity.CRITICAL,
  channels: [AlertChannel.EMAIL, AlertChannel.SLACK, AlertChannel.CONSOLE],
  cooldownMinutes: 5,
  maxAlertsPerHour: 20,
  escalationRules: [
    {
      afterMinutes: 15,
      channels: [AlertChannel.SMS],
      severity: AlertSeverity.EMERGENCY
    }
  ]
});

// Правило для высокого использования памяти
alertManager.addRule({
  id: 'high_memory_usage',
  name: 'Высокое использование памяти',
  description: 'Алерт при превышении лимита памяти',
  enabled: true,
  conditions: {
    metricThresholds: [
      {
        metric: 'system.memory.usage',
        operator: 'gt',
        value: 85,
        duration: 300000 // 5 минут
      }
    ]
  },
  alertSeverity: AlertSeverity.WARNING,
  channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL],
  cooldownMinutes: 30,
  maxAlertsPerHour: 5
});

// Правило для ошибок микширования
alertManager.addRule({
  id: 'mixing_failures',
  name: 'Ошибки микширования',
  description: 'Алерт для критических ошибок микширования',
  enabled: true,
  conditions: {
    components: ['mixer', 'pool', 'scheduler'],
    errorSeverity: [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]
  },
  alertSeverity: AlertSeverity.CRITICAL,
  channels: [AlertChannel.CONSOLE, AlertChannel.SLACK],
  cooldownMinutes: 10,
  maxAlertsPerHour: 15
});
```

### Обработка алертов

```typescript
// Обработка ошибки для алертов
const error = new SecurityError(
  'Unauthorized access attempt',
  ErrorCode.SECURITY_VIOLATION,
  {
    component: 'security',
    operation: 'validateAccess',
    additionalInfo: { ipAddress: '192.168.1.200' }
  }
);

await alertManager.processError(error, 'security-service');

// Обработка метрики для алертов
await alertManager.processMetric(
  'system.memory.usage',
  92.5,
  { component: 'system', host: 'mixer-api-01' },
  'monitoring-service'
);

// Создание алерта вручную
const alertId = await alertManager.createAlert(
  'manual_maintenance_alert',
  'Плановое обслуживание системы',
  'Система будет недоступна с 02:00 до 04:00',
  AlertSeverity.INFO,
  'maintenance-system'
);
```

### Управление алертами

```typescript
// Получение активных алертов
const activeAlerts = alertManager.getActiveAlerts();

// Получение алертов с фильтрами
const criticalAlerts = alertManager.getAlerts({
  severity: AlertSeverity.CRITICAL,
  timeframe: 24 // последние 24 часа
});

const mixerAlerts = alertManager.getAlerts({
  source: 'mixer',
  status: 'active'
});

// Разрешение алерта
await alertManager.resolveAlert(
  alertId,
  'Проблема решена после перезапуска сервиса'
);

// Подавление правила на время
alertManager.suppressRule(
  'high_memory_usage',
  120, // на 2 часа
  'Плановое обслуживание'
);

// Режим обслуживания
alertManager.setMaintenanceMode(
  true,
  'Плановое обновление системы'
);
```

### Конфигурация каналов

```typescript
// Email канал
alertManager.configureChannel({
  channel: AlertChannel.EMAIL,
  enabled: true,
  config: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'alerts@yourcompany.com',
    smtpPassword: 'your-app-password',
    recipients: ['admin@yourcompany.com', 'devops@yourcompany.com']
  }
});

// Slack канал
alertManager.configureChannel({
  channel: AlertChannel.SLACK,
  enabled: true,
  config: {
    webhookUrl: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK',
    slackChannel: '#alerts'
  }
});

// Webhook канал
alertManager.configureChannel({
  channel: AlertChannel.WEBHOOK,
  enabled: true,
  config: {
    url: 'https://your-webhook-endpoint.com/alerts',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-token',
      'Content-Type': 'application/json'
    }
  }
});

// Тестирование канала
const testResult = await alertManager.testChannel(
  AlertChannel.SLACK,
  'Тестовое сообщение от Alert Manager'
);
console.log('Тест канала Slack:', testResult);
```

### Статистика и отчеты

```typescript
// Получение статистики алертов
const alertStats = alertManager.getAlertStatistics(24); // за 24 часа
console.log('Статистика алертов:');
console.log('Всего:', alertStats.total);
console.log('По серьезности:', alertStats.bySeverity);
console.log('По источникам:', alertStats.bySource);
console.log('Среднее время разрешения:', alertStats.resolution.averageMinutes);

// Создание инцидента из алерта
const incidentId = alertManager.createIncident(
  alertId,
  'Критическая проблема с базой данных',
  'База данных недоступна, пользователи не могут войти в систему',
  AlertSeverity.CRITICAL
);
```

## 🔧 System Health

### Проверка состояния систем

```typescript
import { getSystemInitializer } from './utils/SystemInitializer';

const systemInitializer = getSystemInitializer();

// Получение health статуса
const health = await systemInitializer.getSystemHealth();
console.log('Общее состояние:', health.overall);
console.log('Компоненты:', health.components);
console.log('Метрики:', health.metrics);

// Автоматический health check
setInterval(async () => {
  const health = await systemInitializer.getSystemHealth();
  
  if (health.overall === 'critical') {
    console.error('🚨 Критические проблемы в системе!');
    // Отправка экстренных уведомлений
  } else if (health.overall === 'degraded') {
    console.warn('⚠️ Система работает с деградацией');
  }
}, 60000); // каждую минуту
```

## 🧪 Тестирование

```bash
# Запуск comprehensive test suite
cd backend
node test-error-handling.js
```

Тесты покрывают:
- ✅ Создание и обработку всех типов ошибок
- ✅ Retry механизмы и recovery стратегии
- ✅ Audit logging и целостность данных
- ✅ Performance monitoring и метрики
- ✅ Alert system и уведомления
- ✅ Интеграцию всех компонентов

## 📈 Production Ready Features

### Безопасность
- 🔐 Шифрование audit логов
- 🛡️ Проверка целостности данных
- 🔑 Безопасное хранение ключей
- 🚨 Мониторинг нарушений безопасности

### Производительность
- ⚡ Sampling для tracing в production
- 📊 Метрики производительности
- 🔄 Автоматическая ротация логов
- 💾 Эффективное использование памяти

### Надежность
- 🔄 Retry механизмы с exponential backoff
- 🛡️ Circuit breaker patterns
- 📈 Health checks и monitoring
- 🚨 Автоматические алерты

### Масштабируемость
- 🌐 Distributed tracing
- 📡 Удаленное логирование
- 🔗 Микросервисная архитектура
- 📊 Prometheus метрики

### Compliance
- 📋 Полный audit trail
- 🔍 Возможность поиска и анализа
- 📤 Экспорт данных
- ⏰ Retention policies

## 🔧 Конфигурация Production

```typescript
const productionConfig = {
  environment: 'production',
  logLevel: 'info',
  
  errorHandler: {
    enabled: true,
    criticalErrorThreshold: 20,
    errorRateThreshold: 200,
    timeWindowMinutes: 15
  },
  
  auditLogger: {
    enabled: true,
    encryptLogs: true,
    enableIntegrityCheck: true,
    retentionDays: 2555, // 7 лет
    maxFileSize: '500mb',
    maxFiles: 200,
    enableCompression: true,
    enableRemoteLogging: true,
    remoteEndpoint: 'https://logs.yourcompany.com/ingest'
  },
  
  performanceMonitor: {
    enabled: true,
    tracingEnabled: true,
    metricsRetentionMinutes: 240,
    samplingRate: 0.05, // 5% sampling
    slowOperationThreshold: 3000,
    memoryAlertThreshold: 85,
    cpuAlertThreshold: 80,
    eventLoopLagThreshold: 100,
    enableGCProfiling: true,
    enableBusinessMetrics: true
  },
  
  alertManager: {
    enabled: true,
    channels: {
      email: {
        enabled: true,
        smtpHost: process.env.SMTP_HOST,
        smtpPort: 587,
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD,
        recipients: process.env.ALERT_RECIPIENTS.split(',')
      },
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: '#alerts-production'
      },
      webhook: {
        enabled: true,
        url: process.env.WEBHOOK_URL,
        headers: {
          'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`
        }
      }
    }
  }
};

await initializeAllSystems(productionConfig);
```

## 📚 Дополнительные ресурсы

- [Error Types Documentation](./errors/ErrorTypes.ts) - Полный список типов ошибок
- [Audit Events Reference](./logging/AuditLogger.ts) - Справочник audit событий  
- [Performance Metrics Guide](./monitoring/PerformanceMonitor.ts) - Руководство по метрикам
- [Alert Rules Examples](./alerts/AlertManager.ts) - Примеры правил алертов
- [Production Checklist](../PRODUCTION_STATUS.md) - Чеклист для продакшена

## 🎯 Заключение

Comprehensive Error Handling и Logging система обеспечивает:

- **🔒 Безопасность** - Полный контроль и аудит всех операций
- **📊 Наблюдаемость** - Детальный мониторинг производительности и ошибок  
- **🚨 Оперативность** - Быстрое обнаружение и уведомление о проблемах
- **🛡️ Надежность** - Автоматическое восстановление и retry механизмы
- **📈 Масштабируемость** - Готовность к продакшену и высоким нагрузкам

**Система полностью готова к использованию в продакшене!** 🚀