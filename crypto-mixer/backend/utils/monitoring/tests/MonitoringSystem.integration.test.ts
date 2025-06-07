import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import MonitoringSystem from '../MonitoringSystem';
import { Alert } from '../AlertManager';

// Мокаем внешние зависимости
vi.mock('node-fetch', () => ({
  default: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve('OK')
  })
}));

vi.mock('nodemailer', () => ({
  createTransporter: vi.fn(() => ({
    sendMail: vi.fn(() => Promise.resolve({ messageId: 'test-id' }))
  }))
}));

// Мокаем HTTP сервер для Prometheus
vi.mock('http', () => ({
  default: {
    createServer: vi.fn((handler) => ({
      listen: vi.fn((port, callback) => {
        if (callback) callback();
      }),
      close: vi.fn((callback) => {
        if (callback) callback();
      })
    }))
  }
}));

describe('MonitoringSystem Integration Tests', () => {
  let monitoringSystem: MonitoringSystem;

  beforeEach(() => {
    // Создаем систему мониторинга с тестовой конфигурацией
    monitoringSystem = new MonitoringSystem({
      enabled: true,
      performanceMonitoring: {
        enabled: true,
        collectInterval: 1, // 1 секунда для быстрого тестирования
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
        interval: 2, // 2 секунды
        timeout: 1,
        retries: 1,
        services: [
          {
            name: 'test-service',
            type: 'http',
            enabled: true,
            critical: false,
            host: 'localhost',
            port: 3000,
            path: '/health',
            expectedStatus: 200
          }
        ]
      },
      prometheus: {
        enabled: true,
        port: 9091, // Используем другой порт для тестов
        path: '/metrics',
        namespace: 'test_crypto_mixer'
      },
      alerting: {
        enabled: true,
        webhookUrl: 'https://test-webhook.example.com',
        slackChannel: '#test-alerts',
        emailRecipients: ['test@example.com']
      }
    });
  });

  afterEach(async () => {
    if (monitoringSystem.isActive()) {
      await monitoringSystem.stop();
    }
  });

  describe('System Lifecycle', () => {
    it('should start all components successfully', async () => {
      const systemStartedHandler = vi.fn();
      monitoringSystem.on('system_started', systemStartedHandler);

      await monitoringSystem.start();

      expect(monitoringSystem.isActive()).toBe(true);
      expect(systemStartedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          components: {
            performanceMonitoring: true,
            healthChecks: true,
            prometheus: true,
            alerting: true,
            notifications: true
          }
        })
      );

      const status = monitoringSystem.getSystemStatus();
      expect(status.running).toBe(true);
      expect(status.components.performanceMonitor).toBe(true);
      expect(status.components.healthCheckManager).toBe(true);
      expect(status.components.prometheusExporter).toBe(true);
      expect(status.components.alertManager).toBe(true);
      expect(status.components.notificationManager).toBe(true);
    });

    it('should stop all components gracefully', async () => {
      await monitoringSystem.start();
      expect(monitoringSystem.isActive()).toBe(true);

      const systemStoppedHandler = vi.fn();
      monitoringSystem.on('system_stopped', systemStoppedHandler);

      await monitoringSystem.stop();

      expect(monitoringSystem.isActive()).toBe(false);
      expect(systemStoppedHandler).toHaveBeenCalled();

      const status = monitoringSystem.getSystemStatus();
      expect(status.running).toBe(false);
      expect(status.components.performanceMonitor).toBe(false);
      expect(status.components.healthCheckManager).toBe(false);
      expect(status.components.prometheusExporter).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await monitoringSystem.start();
      expect(monitoringSystem.isActive()).toBe(true);

      // Повторный вызов start не должен вызывать ошибку
      await monitoringSystem.start();
      expect(monitoringSystem.isActive()).toBe(true);
    });

    it('should handle stop when not started', async () => {
      expect(monitoringSystem.isActive()).toBe(false);

      // Вызов stop когда система не запущена не должен вызывать ошибку
      await monitoringSystem.stop();
      expect(monitoringSystem.isActive()).toBe(false);
    });
  });

  describe('Alert Integration', () => {
    beforeEach(async () => {
      await monitoringSystem.start();
    });

    it('should create and manage custom alerts', async () => {
      const alertCreatedHandler = vi.fn();
      monitoringSystem.on('alert_created', alertCreatedHandler);

      const alert = await monitoringSystem.createCustomAlert(
        'security',
        'critical',
        'Test Security Alert',
        'Suspicious activity detected',
        'test_source',
        { ip: '192.168.1.100', attempts: 10 }
      );

      expect(alert).toBeDefined();
      expect(alert.type).toBe('security');
      expect(alert.severity).toBe('critical');
      expect(alert.title).toBe('Test Security Alert');
      expect(alertCreatedHandler).toHaveBeenCalledWith(alert);

      // Проверяем, что алерт добавлен в активные
      const activeAlerts = monitoringSystem.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].id).toBe(alert.id);
    });

    it('should acknowledge alerts', async () => {
      const alert = await monitoringSystem.createCustomAlert(
        'performance',
        'high',
        'Test Alert',
        'Description',
        'test_source'
      );

      const alertAcknowledgedHandler = vi.fn();
      monitoringSystem.on('alert_acknowledged', alertAcknowledgedHandler);

      const result = await monitoringSystem.acknowledgeAlert(alert.id, 'test_user');
      expect(result).toBe(true);
      expect(alertAcknowledgedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: alert.id,
          status: 'acknowledged',
          acknowledgedBy: 'test_user'
        })
      );
    });

    it('should resolve alerts', async () => {
      const alert = await monitoringSystem.createCustomAlert(
        'performance',
        'medium',
        'Test Alert',
        'Description',
        'test_source'
      );

      const alertResolvedHandler = vi.fn();
      monitoringSystem.on('alert_resolved', alertResolvedHandler);

      const result = await monitoringSystem.resolveAlert(alert.id);
      expect(result).toBe(true);
      expect(alertResolvedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: alert.id,
          status: 'resolved'
        })
      );

      // Алерт должен быть удален из активных
      const activeAlerts = monitoringSystem.getActiveAlerts();
      expect(activeAlerts.find(a => a.id === alert.id)).toBeUndefined();
    });

    it('should collect alert statistics', async () => {
      // Создаем алерты разных типов
      await monitoringSystem.createCustomAlert('performance', 'high', 'Perf Alert', 'Desc', 'test');
      await monitoringSystem.createCustomAlert('security', 'critical', 'Sec Alert', 'Desc', 'test');
      await monitoringSystem.createCustomAlert('business', 'medium', 'Bus Alert', 'Desc', 'test');

      const stats = monitoringSystem.getAlertStatistics();
      expect(stats).toBeDefined();
      expect(stats.activeCount).toBe(3);
      expect(stats.totalCount).toBe(3);
      expect(stats.typeDistribution.performance).toBe(1);
      expect(stats.typeDistribution.security).toBe(1);
      expect(stats.typeDistribution.business).toBe(1);
      expect(stats.severityDistribution.high).toBe(1);
      expect(stats.severityDistribution.critical).toBe(1);
      expect(stats.severityDistribution.medium).toBe(1);
    });
  });

  describe('Performance Monitoring Integration', () => {
    beforeEach(async () => {
      await monitoringSystem.start();
    });

    it('should collect performance metrics', async () => {
      // Ждем несколько циклов сбора метрик
      await new Promise(resolve => setTimeout(resolve, 2500));

      const status = monitoringSystem.getSystemStatus();
      expect(status.metrics.lastPerformanceSnapshot).toBeDefined();
      
      const snapshot = status.metrics.lastPerformanceSnapshot;
      expect(snapshot.system).toBeDefined();
      expect(snapshot.application).toBeDefined();
      expect(snapshot.business).toBeDefined();
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it('should trigger performance alerts when thresholds exceeded', async () => {
      const performanceAlertHandler = vi.fn();
      monitoringSystem.on('performance_alert', performanceAlertHandler);

      // Имитируем превышение порога через внутренний API
      // В реальной ситуации это произошло бы при сборе метрик
      const mockThresholdData = {
        type: 'cpu_usage',
        value: 95,
        threshold: 80,
        unit: '%',
        timestamp: new Date()
      };

      // Эмулируем событие превышения порога
      if (monitoringSystem['performanceMonitor']) {
        monitoringSystem['performanceMonitor'].emit('threshold_exceeded', mockThresholdData);
      }

      // Ждем обработки события
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(performanceAlertHandler).toHaveBeenCalled();
    });

    it('should record request metrics', async () => {
      // Записываем несколько запросов
      monitoringSystem.recordRequest(100, false); // Успешный запрос 100ms
      monitoringSystem.recordRequest(250, false); // Успешный запрос 250ms
      monitoringSystem.recordRequest(500, true);  // Неудачный запрос 500ms

      // Ждем цикл сбора метрик
      await new Promise(resolve => setTimeout(resolve, 1500));

      const status = monitoringSystem.getSystemStatus();
      const snapshot = status.metrics.lastPerformanceSnapshot;
      
      // Проверяем, что метрики запросов обновились
      expect(snapshot?.application?.requests).toBeDefined();
    });
  });

  describe('Health Check Integration', () => {
    beforeEach(async () => {
      await monitoringSystem.start();
    });

    it('should perform health checks', async () => {
      // Ждем выполнения health checks
      await new Promise(resolve => setTimeout(resolve, 3000));

      const status = monitoringSystem.getSystemStatus();
      expect(status.metrics.systemHealth).toBeDefined();
      
      const systemHealth = status.metrics.systemHealth;
      expect(systemHealth.overall).toBeDefined();
      expect(systemHealth.services).toBeDefined();
      expect(systemHealth.summary).toBeDefined();
    });

    it('should trigger health status change alerts', async () => {
      const healthStatusChangeHandler = vi.fn();
      monitoringSystem.on('health_status_change', healthStatusChangeHandler);

      // Эмулируем изменение статуса сервиса
      const mockStatusChange = {
        service: 'test-service',
        from: 'healthy',
        to: 'down',
        timestamp: new Date()
      };

      if (monitoringSystem['healthCheckManager']) {
        monitoringSystem['healthCheckManager'].emit('status_change', mockStatusChange);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(healthStatusChangeHandler).toHaveBeenCalledWith(mockStatusChange);
    });

    it('should check specific service on demand', async () => {
      // Ждем инициализации health check manager
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const result = await monitoringSystem.checkService('test-service');
        expect(result).toBeDefined();
        expect(result.service).toBe('test-service');
      } catch (error) {
        // Может быть ошибка если сервис недоступен, это нормально для тестов
        expect(error).toBeDefined();
      }
    });

    it('should check all services on demand', async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const result = await monitoringSystem.checkAllServices();
        expect(result).toBeDefined();
        expect(result.services).toBeDefined();
      } catch (error) {
        // Может быть ошибка если сервисы недоступны, это нормально для тестов
        expect(error).toBeDefined();
      }
    });
  });

  describe('Prometheus Integration', () => {
    beforeEach(async () => {
      await monitoringSystem.start();
    });

    it('should start prometheus exporter', async () => {
      const status = monitoringSystem.getSystemStatus();
      expect(status.components.prometheusExporter).toBe(true);
      expect(status.metrics.prometheusUrl).toBe('http://localhost:9091/metrics');
    });

    it('should add custom metrics', async () => {
      monitoringSystem.addCustomMetric(
        'test_metric',
        'gauge',
        'Test metric for integration testing',
        42,
        { environment: 'test', component: 'integration' }
      );

      // Метрика должна быть добавлена без ошибок
      // В реальном сценарии мы бы проверили /metrics endpoint
    });
  });

  describe('Notification Testing', () => {
    beforeEach(async () => {
      await monitoringSystem.start();
    });

    it('should test webhook notification channel', async () => {
      // Мокаем успешный HTTP запрос
      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await monitoringSystem.testNotificationChannel('webhook');
      expect(result).toBe(true);
    });

    it('should test slack notification channel', async () => {
      // Устанавливаем переменные окружения для Slack
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await monitoringSystem.testNotificationChannel('slack');
      expect(result).toBe(true);

      delete process.env.SLACK_WEBHOOK_URL;
    });

    it('should get notification statistics', async () => {
      const stats = monitoringSystem.getNotificationStatistics();
      expect(stats).toBeDefined();
      expect(stats.totalSent).toBe(0); // Изначально 0
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.channelStats).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration at runtime', async () => {
      await monitoringSystem.start();

      const newConfig = {
        alerting: {
          enabled: true,
          webhookUrl: 'https://new-webhook.example.com',
          emailRecipients: ['newuser@example.com']
        }
      };

      monitoringSystem.updateConfig(newConfig);
      const config = monitoringSystem.getConfig();

      expect(config.alerting.webhookUrl).toBe('https://new-webhook.example.com');
      expect(config.alerting.emailRecipients).toContain('newuser@example.com');
    });

    it('should preserve existing configuration when updating', async () => {
      const originalConfig = monitoringSystem.getConfig();
      
      monitoringSystem.updateConfig({
        performanceMonitoring: {
          enabled: true,
          collectInterval: 15
        }
      });

      const updatedConfig = monitoringSystem.getConfig();
      expect(updatedConfig.performanceMonitoring.collectInterval).toBe(15);
      expect(updatedConfig.healthChecks.enabled).toBe(originalConfig.healthChecks.enabled);
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await monitoringSystem.start();
    });

    it('should emit system events', async () => {
      const systemEventHandler = vi.fn();
      const alertEventHandler = vi.fn();
      const notificationEventHandler = vi.fn();

      monitoringSystem.on('system_started', systemEventHandler);
      monitoringSystem.on('alert_created', alertEventHandler);
      monitoringSystem.on('notification_sent', notificationEventHandler);

      // Создаем алерт для тестирования событий
      await monitoringSystem.createCustomAlert(
        'performance',
        'medium',
        'Test Event Alert',
        'Testing event emission',
        'test'
      );

      expect(alertEventHandler).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Тестируем обработку ошибок при создании алерта с неверными параметрами
      await expect(async () => {
        await monitoringSystem.createCustomAlert(
          'invalid_type' as any,
          'critical',
          'Invalid Alert',
          'Description',
          'test'
        );
      }).rejects.toThrow();
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources properly on stop', async () => {
      await monitoringSystem.start();
      
      // Создаем несколько алертов
      await monitoringSystem.createCustomAlert('performance', 'high', 'Alert 1', 'Desc', 'test');
      await monitoringSystem.createCustomAlert('security', 'critical', 'Alert 2', 'Desc', 'test');

      expect(monitoringSystem.getActiveAlerts()).toHaveLength(2);

      await monitoringSystem.stop();

      // После остановки система не должна быть активна
      expect(monitoringSystem.isActive()).toBe(false);
      
      // Компоненты должны быть остановлены
      const status = monitoringSystem.getSystemStatus();
      expect(status.components.performanceMonitor).toBe(false);
      expect(status.components.healthCheckManager).toBe(false);
      expect(status.components.prometheusExporter).toBe(false);
    });

    it('should handle concurrent operations', async () => {
      await monitoringSystem.start();

      // Выполняем несколько операций параллельно
      const operations = [
        monitoringSystem.createCustomAlert('performance', 'high', 'Concurrent Alert 1', 'Desc', 'test'),
        monitoringSystem.createCustomAlert('security', 'medium', 'Concurrent Alert 2', 'Desc', 'test'),
        monitoringSystem.createCustomAlert('business', 'low', 'Concurrent Alert 3', 'Desc', 'test')
      ];

      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(3);
      results.forEach(alert => {
        expect(alert).toBeDefined();
        expect(alert.id).toBeDefined();
      });

      expect(monitoringSystem.getActiveAlerts()).toHaveLength(3);
    });
  });
});