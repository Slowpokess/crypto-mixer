import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Глобальные моки для тестирования
beforeAll(() => {
  // Мокаем переменные окружения для тестов
  process.env.NODE_ENV = 'test';
  process.env.MONITORING_ENABLED = 'true';
  process.env.PERFORMANCE_MONITORING = 'true';
  process.env.HEALTH_CHECKS_ENABLED = 'true';
  process.env.PROMETHEUS_ENABLED = 'true';
  process.env.ALERTING_ENABLED = 'true';
  
  // Тестовые конфигурации
  process.env.PROMETHEUS_PORT = '9091';
  process.env.METRICS_COLLECT_INTERVAL = '1';
  process.env.HEALTH_CHECK_INTERVAL = '2';
  
  // Отключаем настоящие внешние сервисы
  process.env.SMTP_HOST = '';
  process.env.SLACK_WEBHOOK_URL = '';
  process.env.ALERT_WEBHOOK_URL = '';

  // Мокаем консоль для более чистого вывода тестов
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Восстанавливаем все моки
  vi.restoreAllMocks();
  
  // Очищаем переменные окружения
  delete process.env.NODE_ENV;
  delete process.env.MONITORING_ENABLED;
  delete process.env.PERFORMANCE_MONITORING;
  delete process.env.HEALTH_CHECKS_ENABLED;
  delete process.env.PROMETHEUS_ENABLED;
  delete process.env.ALERTING_ENABLED;
  delete process.env.PROMETHEUS_PORT;
  delete process.env.METRICS_COLLECT_INTERVAL;
  delete process.env.HEALTH_CHECK_INTERVAL;
});

beforeEach(() => {
  // Очистка всех таймеров перед каждым тестом
  vi.clearAllTimers();
});

afterEach(() => {
  // Очистка всех моков после каждого теста
  vi.clearAllMocks();
  
  // Принудительная сборка мусора для предотвращения утечек памяти
  if (global.gc) {
    global.gc();
  }
});

// Глобальные утилиты для тестов
export const TestUtils = {
  /**
   * Ожидание выполнения асинхронных операций
   */
  async waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Создание тестовых данных алерта
   */
  createMockAlert(overrides: Partial<any> = {}): any {
    return {
      id: `test_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'performance',
      severity: 'medium',
      status: 'triggered',
      title: 'Test Alert',
      description: 'This is a test alert for unit testing',
      source: 'test_source',
      metadata: { test: true },
      timestamp: new Date(),
      escalationLevel: 0,
      tags: ['test'],
      ...overrides
    };
  },

  /**
   * Создание тестовой конфигурации канала уведомлений
   */
  createMockNotificationChannel(type: string, overrides: Partial<any> = {}): any {
    const baseConfigs = {
      webhook: {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://test-webhook.example.com',
          headers: { 'Content-Type': 'application/json' }
        },
        retries: 3,
        timeout: 10000
      },
      email: {
        type: 'email',
        enabled: true,
        config: {
          smtp: {
            host: 'smtp.test.com',
            port: 587,
            secure: false,
            auth: {
              user: 'test@example.com',
              pass: 'testpass'
            }
          },
          from: 'alerts@test.com',
          recipients: ['test1@example.com', 'test2@example.com']
        },
        retries: 2,
        timeout: 15000
      },
      slack: {
        type: 'slack',
        enabled: true,
        config: {
          webhookUrl: 'https://hooks.slack.com/test',
          channel: '#test-alerts',
          username: 'Test Bot'
        },
        retries: 3,
        timeout: 10000
      }
    };

    return {
      ...baseConfigs[type as keyof typeof baseConfigs],
      ...overrides
    };
  },

  /**
   * Мок для HTTP fetch запросов
   */
  mockFetchSuccess(responseData: any = { ok: true, status: 200 }) {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('OK'),
      json: () => Promise.resolve(responseData),
      ...responseData
    });

    vi.doMock('node-fetch', () => ({
      default: mockFetch
    }));

    return mockFetch;
  },

  /**
   * Мок для HTTP fetch запросов с ошибкой
   */
  mockFetchError(error: Error = new Error('Network error')) {
    const mockFetch = vi.fn().mockRejectedValue(error);

    vi.doMock('node-fetch', () => ({
      default: mockFetch
    }));

    return mockFetch;
  },

  /**
   * Проверка структуры объекта алерта
   */
  expectValidAlert(alert: any) {
    expect(alert).toBeDefined();
    expect(alert.id).toMatch(/^[a-zA-Z0-9_]+$/);
    expect(['performance', 'health_status', 'service', 'security', 'business']).toContain(alert.type);
    expect(['low', 'medium', 'high', 'critical']).toContain(alert.severity);
    expect(['triggered', 'acknowledged', 'resolved', 'suppressed']).toContain(alert.status);
    expect(typeof alert.title).toBe('string');
    expect(typeof alert.description).toBe('string');
    expect(typeof alert.source).toBe('string');
    expect(alert.timestamp).toBeInstanceOf(Date);
    expect(typeof alert.escalationLevel).toBe('number');
    expect(Array.isArray(alert.tags)).toBe(true);
  },

  /**
   * Проверка структуры результата уведомления
   */
  expectValidNotificationResult(result: any) {
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(['webhook', 'email', 'slack', 'telegram', 'sms', 'push']).toContain(result.channel);
    expect(typeof result.alertId).toBe('string');
    expect(result.timestamp).toBeInstanceOf(Date);
    
    if (result.success) {
      expect(typeof result.responseTime).toBe('number');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    } else {
      expect(typeof result.error).toBe('string');
    }
  },

  /**
   * Создание тестовой конфигурации мониторинга
   */
  createTestMonitoringConfig(overrides: Partial<any> = {}): any {
    return {
      enabled: true,
      performanceMonitoring: {
        enabled: true,
        collectInterval: 1,
        retentionPeriod: 60,
        alerting: {
          enabled: true,
          thresholds: {
            cpu: 80,
            memory: 85,
            disk: 90,
            responseTime: 5000,
            errorRate: 5
          }
        }
      },
      healthChecks: {
        enabled: true,
        interval: 2,
        timeout: 1,
        retries: 1,
        services: []
      },
      prometheus: {
        enabled: true,
        port: 9091,
        path: '/metrics',
        namespace: 'test_crypto_mixer'
      },
      alerting: {
        enabled: true,
        webhookUrl: 'https://test-webhook.example.com',
        slackChannel: '#test-alerts',
        emailRecipients: ['test@example.com']
      },
      ...overrides
    };
  }
};

// Экспорт для использования в тестах
declare global {
  var TestUtils: typeof TestUtils;
}

global.TestUtils = TestUtils;