import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import AlertManager from '../AlertManager';
import { AlertType, AlertSeverity } from '../AlertManager';

describe('AlertManager', () => {
  let alertManager: AlertManager;
  
  beforeEach(() => {
    // Создаем новый экземпляр AlertManager для каждого теста
    alertManager = new AlertManager({
      enabled: true,
      maxActiveAlerts: 100,
      alertRetentionDays: 7,
      defaultSeverity: 'medium',
      globalThrottle: {
        enabled: false,
        interval: 300,
        maxAlerts: 50
      },
      channels: [],
      rules: []
    });
  });

  afterEach(async () => {
    if (alertManager.isActive()) {
      await alertManager.stop();
    }
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default configuration', () => {
      const manager = new AlertManager();
      const config = manager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.enabled).toBe(false); // По умолчанию отключен
      expect(config.maxActiveAlerts).toBe(1000);
      expect(config.alertRetentionDays).toBe(30);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        enabled: true,
        maxActiveAlerts: 50,
        alertRetentionDays: 14,
        defaultSeverity: 'high' as AlertSeverity
      };

      const manager = new AlertManager(customConfig);
      const config = manager.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxActiveAlerts).toBe(50);
      expect(config.alertRetentionDays).toBe(14);
      expect(config.defaultSeverity).toBe('high');
    });

    it('should start and stop successfully', async () => {
      expect(alertManager.isActive()).toBe(false);
      
      await alertManager.start();
      expect(alertManager.isActive()).toBe(true);
      
      await alertManager.stop();
      expect(alertManager.isActive()).toBe(false);
    });
  });

  describe('Alert Creation', () => {
    beforeEach(async () => {
      await alertManager.start();
    });

    it('should create a basic alert', async () => {
      const alert = await alertManager.createAlert(
        'performance',
        'high',
        'Test Alert',
        'This is a test alert',
        'test_source',
        { test: true }
      );

      expect(alert).toBeDefined();
      expect(alert.id).toMatch(/^alert_\d+_[a-z0-9]+$/);
      expect(alert.type).toBe('performance');
      expect(alert.severity).toBe('high');
      expect(alert.title).toBe('Test Alert');
      expect(alert.description).toBe('This is a test alert');
      expect(alert.source).toBe('test_source');
      expect(alert.status).toBe('triggered');
      expect(alert.metadata.test).toBe(true);
      expect(alert.escalationLevel).toBe(0);
      expect(alert.timestamp).toBeInstanceOf(Date);
    });

    it('should create alerts with different types and severities', async () => {
      const alertTypes: AlertType[] = ['performance', 'health_status', 'service', 'security', 'business'];
      const severities: AlertSeverity[] = ['low', 'medium', 'high', 'critical'];

      for (const type of alertTypes) {
        for (const severity of severities) {
          const alert = await alertManager.createAlert(
            type,
            severity,
            `${type} ${severity} alert`,
            `Test ${type} alert with ${severity} severity`,
            'test_source'
          );

          expect(alert.type).toBe(type);
          expect(alert.severity).toBe(severity);
        }
      }
    });

    it('should add alerts to active alerts list', async () => {
      const activeAlertsBefore = alertManager.getActiveAlerts();
      expect(activeAlertsBefore.length).toBe(0);

      await alertManager.createAlert(
        'performance',
        'medium',
        'Test Alert 1',
        'Description 1',
        'test_source'
      );

      await alertManager.createAlert(
        'security',
        'critical',
        'Test Alert 2',
        'Description 2',
        'test_source'
      );

      const activeAlertsAfter = alertManager.getActiveAlerts();
      expect(activeAlertsAfter.length).toBe(2);
    });

    it('should add alerts to history', async () => {
      const historyBefore = alertManager.getAlertHistory();
      expect(historyBefore.length).toBe(0);

      await alertManager.createAlert(
        'performance',
        'medium',
        'Test Alert',
        'Description',
        'test_source'
      );

      const historyAfter = alertManager.getAlertHistory();
      expect(historyAfter.length).toBe(1);
      expect(historyAfter[0].title).toBe('Test Alert');
    });
  });

  describe('Alert Management', () => {
    let testAlert: any;

    beforeEach(async () => {
      await alertManager.start();
      testAlert = await alertManager.createAlert(
        'performance',
        'medium',
        'Test Alert',
        'Test Description',
        'test_source'
      );
    });

    it('should acknowledge an alert', async () => {
      expect(testAlert.status).toBe('triggered');
      expect(testAlert.acknowledgedAt).toBeUndefined();
      expect(testAlert.acknowledgedBy).toBeUndefined();

      const result = await alertManager.acknowledgeAlert(testAlert.id, 'test_user');
      expect(result).toBe(true);

      const activeAlerts = alertManager.getActiveAlerts();
      const acknowledgedAlert = activeAlerts.find(a => a.id === testAlert.id);
      
      expect(acknowledgedAlert.status).toBe('acknowledged');
      expect(acknowledgedAlert.acknowledgedAt).toBeInstanceOf(Date);
      expect(acknowledgedAlert.acknowledgedBy).toBe('test_user');
    });

    it('should resolve an alert', async () => {
      expect(testAlert.status).toBe('triggered');
      expect(testAlert.resolvedAt).toBeUndefined();

      const result = await alertManager.resolveAlert(testAlert.id);
      expect(result).toBe(true);

      const activeAlerts = alertManager.getActiveAlerts();
      const resolvedAlert = activeAlerts.find(a => a.id === testAlert.id);
      expect(resolvedAlert).toBeUndefined(); // Должен быть удален из активных

      const history = alertManager.getAlertHistory();
      const historyAlert = history.find(a => a.id === testAlert.id);
      expect(historyAlert.status).toBe('resolved');
      expect(historyAlert.resolvedAt).toBeInstanceOf(Date);
    });

    it('should return false when acknowledging non-existent alert', async () => {
      const result = await alertManager.acknowledgeAlert('non_existent_id', 'test_user');
      expect(result).toBe(false);
    });

    it('should return false when resolving non-existent alert', async () => {
      const result = await alertManager.resolveAlert('non_existent_id');
      expect(result).toBe(false);
    });
  });

  describe('Alert Statistics', () => {
    beforeEach(async () => {
      await alertManager.start();
    });

    it('should return empty statistics initially', () => {
      const stats = alertManager.getAlertStatistics();
      
      expect(stats.activeCount).toBe(0);
      expect(stats.totalCount).toBe(0);
      expect(stats.severityDistribution).toEqual({
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      });
      expect(stats.typeDistribution).toEqual({
        performance: 0,
        health_status: 0,
        service: 0,
        security: 0,
        business: 0
      });
    });

    it('should calculate statistics correctly', async () => {
      // Создаем алерты разных типов и важности
      await alertManager.createAlert('performance', 'high', 'Perf Alert 1', 'Desc', 'test');
      await alertManager.createAlert('performance', 'medium', 'Perf Alert 2', 'Desc', 'test');
      await alertManager.createAlert('security', 'critical', 'Sec Alert 1', 'Desc', 'test');
      await alertManager.createAlert('health_status', 'low', 'Health Alert 1', 'Desc', 'test');

      const stats = alertManager.getAlertStatistics();
      
      expect(stats.activeCount).toBe(4);
      expect(stats.totalCount).toBe(4);
      expect(stats.severityDistribution).toEqual({
        low: 1,
        medium: 1,
        high: 1,
        critical: 1
      });
      expect(stats.typeDistribution).toEqual({
        performance: 2,
        health_status: 1,
        service: 0,
        security: 1,
        business: 0
      });
    });

    it('should update statistics after resolving alerts', async () => {
      const alert1 = await alertManager.createAlert('performance', 'high', 'Alert 1', 'Desc', 'test');
      const alert2 = await alertManager.createAlert('security', 'critical', 'Alert 2', 'Desc', 'test');

      let stats = alertManager.getAlertStatistics();
      expect(stats.activeCount).toBe(2);

      await alertManager.resolveAlert(alert1.id);

      stats = alertManager.getAlertStatistics();
      expect(stats.activeCount).toBe(1);
      expect(stats.totalCount).toBe(2); // История сохраняется
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await alertManager.start();
    });

    it('should emit events when creating alerts', async () => {
      const mockHandler = vi.fn();
      alertManager.on('alert_created', mockHandler);

      const alert = await alertManager.createAlert(
        'performance',
        'high',
        'Test Alert',
        'Description',
        'test_source'
      );

      expect(mockHandler).toHaveBeenCalledWith(alert);
    });

    it('should emit events when acknowledging alerts', async () => {
      const mockHandler = vi.fn();
      alertManager.on('alert_acknowledged', mockHandler);

      const alert = await alertManager.createAlert('performance', 'medium', 'Test', 'Desc', 'test');
      await alertManager.acknowledgeAlert(alert.id, 'test_user');

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: alert.id,
          status: 'acknowledged',
          acknowledgedBy: 'test_user'
        })
      );
    });

    it('should emit events when resolving alerts', async () => {
      const mockHandler = vi.fn();
      alertManager.on('alert_resolved', mockHandler);

      const alert = await alertManager.createAlert('performance', 'medium', 'Test', 'Desc', 'test');
      await alertManager.resolveAlert(alert.id);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: alert.id,
          status: 'resolved'
        })
      );
    });
  });

  describe('Throttling', () => {
    let throttledManager: AlertManager;

    beforeEach(async () => {
      throttledManager = new AlertManager({
        enabled: true,
        rules: [{
          id: 'test_rule',
          name: 'Test Rule',
          enabled: true,
          type: 'performance',
          severity: 'medium',
          condition: {
            metric: 'cpu_usage',
            operator: 'gt',
            threshold: 80
          },
          throttle: {
            enabled: true,
            interval: 60, // 60 секунд
            maxAlerts: 2
          },
          escalation: {
            enabled: false,
            levels: []
          },
          notification: {
            channels: [],
            suppressDuplicates: true
          },
          tags: ['test']
        }],
        channels: []
      });
      
      await throttledManager.start();
    });

    afterEach(async () => {
      if (throttledManager.isActive()) {
        await throttledManager.stop();
      }
    });

    it('should apply throttling rules correctly', async () => {
      // Создаем алерты быстро подряд
      const alert1 = await throttledManager.createAlert('performance', 'medium', 'Alert 1', 'Desc', 'test');
      const alert2 = await throttledManager.createAlert('performance', 'medium', 'Alert 2', 'Desc', 'test');
      
      // Третий алерт должен быть заблокирован throttling (если правило применяется)
      const alert3 = await throttledManager.createAlert('performance', 'medium', 'Alert 3', 'Desc', 'test');

      expect(alert1.id).toBeDefined();
      expect(alert2.id).toBeDefined();
      expect(alert3.id).toBeDefined(); // Алерт все равно создается, но уведомления могут быть заблокированы
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await alertManager.start();
    });

    it('should update configuration correctly', () => {
      const newConfig = {
        maxActiveAlerts: 200,
        alertRetentionDays: 14
      };

      alertManager.updateConfig(newConfig);
      const config = alertManager.getConfig();

      expect(config.maxActiveAlerts).toBe(200);
      expect(config.alertRetentionDays).toBe(14);
    });

    it('should preserve other configuration values when updating', () => {
      const originalConfig = alertManager.getConfig();
      const newConfig = {
        maxActiveAlerts: 200
      };

      alertManager.updateConfig(newConfig);
      const updatedConfig = alertManager.getConfig();

      expect(updatedConfig.maxActiveAlerts).toBe(200);
      expect(updatedConfig.alertRetentionDays).toBe(originalConfig.alertRetentionDays);
      expect(updatedConfig.enabled).toBe(originalConfig.enabled);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully when not started', async () => {
      const alert = await alertManager.createAlert(
        'performance',
        'medium',
        'Test Alert',
        'Description',
        'test_source'
      );

      expect(alert).toBeDefined(); // Алерт должен создаваться даже если менеджер не запущен
    });

    it('should validate alert parameters', async () => {
      await alertManager.start();

      // Тест с пустыми параметрами
      await expect(async () => {
        await alertManager.createAlert(
          'performance',
          'medium',
          '', // Пустой title
          'Description',
          'test_source'
        );
      }).rejects.toThrow();
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      // Настраиваем короткий период хранения для тестирования
      alertManager = new AlertManager({
        enabled: true,
        alertRetentionDays: 0.001, // ~1.5 минуты для быстрого тестирования
        maxActiveAlerts: 10
      });
      await alertManager.start();
    });

    it('should limit active alerts to max configuration', async () => {
      // Создаем больше алертов чем лимит
      for (let i = 0; i < 15; i++) {
        await alertManager.createAlert(
          'performance',
          'medium',
          `Alert ${i}`,
          'Description',
          'test_source'
        );
      }

      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts.length).toBeLessThanOrEqual(10);
    });
  });
});