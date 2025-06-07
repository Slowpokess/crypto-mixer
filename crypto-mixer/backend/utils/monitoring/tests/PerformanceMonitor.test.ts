import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PerformanceMonitor from '../PerformanceMonitor';

// Мокаем зависимости
vi.mock('os', () => ({
  cpus: () => [{ times: { user: 1000, nice: 0, sys: 500, idle: 8500, irq: 0 } }],
  totalmem: () => 8589934592, // 8GB
  freemem: () => 4294967296,  // 4GB
  loadavg: () => [0.5, 0.7, 0.8],
  platform: () => 'linux',
  arch: () => 'x64'
}));

vi.mock('fs', () => ({
  statSync: vi.fn(() => ({
    size: 1073741824000, // 1TB
    isDirectory: () => false
  })),
  existsSync: vi.fn(() => true)
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '500G') // Доступно 500GB
}));

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor({
      enabled: true,
      collectInterval: 1, // 1 секунда для быстрого тестирования
      retentionPeriod: 60,
      prometheusEnabled: false,
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
    });
  });

  afterEach(async () => {
    if (performanceMonitor.isActive()) {
      await performanceMonitor.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const monitor = new PerformanceMonitor();
      expect(monitor).toBeDefined();
      expect(monitor.isActive()).toBe(false);
    });

    it('should accept custom configuration', () => {
      const config = {
        enabled: true,
        collectInterval: 30,
        retentionPeriod: 3600
      };

      const monitor = new PerformanceMonitor(config);
      const monitorConfig = monitor.getConfig();

      expect(monitorConfig.collectInterval).toBe(30);
      expect(monitorConfig.retentionPeriod).toBe(3600);
    });

    it('should start and stop successfully', async () => {
      expect(performanceMonitor.isActive()).toBe(false);

      await performanceMonitor.start();
      expect(performanceMonitor.isActive()).toBe(true);

      await performanceMonitor.stop();
      expect(performanceMonitor.isActive()).toBe(false);
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(async () => {
      await performanceMonitor.start();
    });

    it('should collect system metrics', async () => {
      // Ждем первый цикл сбора метрик
      await new Promise(resolve => setTimeout(resolve, 1500));

      const snapshot = performanceMonitor.getLastSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot!.system).toBeDefined();

      const systemMetrics = snapshot!.system;
      expect(systemMetrics.cpu).toBeDefined();
      expect(systemMetrics.memory).toBeDefined();
      expect(systemMetrics.disk).toBeDefined();

      // CPU метрики
      expect(typeof systemMetrics.cpu.usage).toBe('number');
      expect(systemMetrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.cpu.usage).toBeLessThanOrEqual(100);
      expect(Array.isArray(systemMetrics.cpu.loadAverage)).toBe(true);
      expect(systemMetrics.cpu.loadAverage).toHaveLength(3);

      // Memory метрики
      expect(typeof systemMetrics.memory.total).toBe('number');
      expect(typeof systemMetrics.memory.used).toBe('number');
      expect(typeof systemMetrics.memory.free).toBe('number');
      expect(typeof systemMetrics.memory.usage).toBe('number');
      expect(systemMetrics.memory.usage).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.memory.usage).toBeLessThanOrEqual(100);

      // Disk метрики
      expect(typeof systemMetrics.disk.total).toBe('number');
      expect(typeof systemMetrics.disk.used).toBe('number');
      expect(typeof systemMetrics.disk.free).toBe('number');
      expect(typeof systemMetrics.disk.usage).toBe('number');
    });

    it('should collect application metrics', async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const snapshot = performanceMonitor.getLastSnapshot();
      expect(snapshot!.application).toBeDefined();

      const appMetrics = snapshot!.application;
      expect(appMetrics.requests).toBeDefined();
      expect(appMetrics.database).toBeDefined();
      expect(appMetrics.cache).toBeDefined();

      // Request метрики
      expect(typeof appMetrics.requests.total).toBe('number');
      expect(typeof appMetrics.requests.perSecond).toBe('number');
      expect(typeof appMetrics.requests.averageResponseTime).toBe('number');
      expect(typeof appMetrics.requests.errorRate).toBe('number');
      expect(appMetrics.requests.percentiles).toBeDefined();
    });

    it('should collect business metrics', async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const snapshot = performanceMonitor.getLastSnapshot();
      expect(snapshot!.business).toBeDefined();

      const businessMetrics = snapshot!.business;
      expect(businessMetrics.mixing).toBeDefined();
      expect(businessMetrics.wallets).toBeDefined();
      expect(businessMetrics.blockchain).toBeDefined();
      expect(businessMetrics.security).toBeDefined();

      // Mixing метрики
      expect(typeof businessMetrics.mixing.operationsInProgress).toBe('number');
      expect(typeof businessMetrics.mixing.operationsCompleted).toBe('number');
      expect(typeof businessMetrics.mixing.operationsFailed).toBe('number');
      expect(typeof businessMetrics.mixing.successRate).toBe('number');
    });

    it('should emit metrics_collected event', async () => {
      const metricsCollectedHandler = vi.fn();
      performanceMonitor.on('metrics_collected', metricsCollectedHandler);

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(metricsCollectedHandler).toHaveBeenCalled();
      const snapshot = metricsCollectedHandler.mock.calls[0][0];
      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Request Recording', () => {
    beforeEach(async () => {
      await performanceMonitor.start();
    });

    it('should record successful requests', () => {
      performanceMonitor.recordRequest(100, false); // 100ms, успешный
      performanceMonitor.recordRequest(250, false); // 250ms, успешный
      performanceMonitor.recordRequest(150, false); // 150ms, успешный

      // Проверяем, что запросы записаны (внутреннее состояние изменилось)
      const stats = performanceMonitor['requestStats'];
      expect(stats.total).toBe(3);
      expect(stats.errors).toBe(0);
      expect(stats.responseTimes).toHaveLength(3);
    });

    it('should record failed requests', () => {
      performanceMonitor.recordRequest(500, true);  // 500ms, ошибка
      performanceMonitor.recordRequest(300, false); // 300ms, успешный
      performanceMonitor.recordRequest(800, true);  // 800ms, ошибка

      const stats = performanceMonitor['requestStats'];
      expect(stats.total).toBe(3);
      expect(stats.errors).toBe(2);
      expect(stats.responseTimes).toHaveLength(3);
    });

    it('should calculate request metrics correctly', async () => {
      // Записываем несколько запросов
      performanceMonitor.recordRequest(100, false);
      performanceMonitor.recordRequest(200, false);
      performanceMonitor.recordRequest(300, true);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const snapshot = performanceMonitor.getLastSnapshot();
      const requestMetrics = snapshot!.application.requests;

      expect(requestMetrics.total).toBe(3);
      expect(requestMetrics.errorRate).toBeCloseTo(33.33, 1); // 1 из 3 ошибка
      expect(requestMetrics.averageResponseTime).toBeCloseTo(200, 0); // (100+200+300)/3
    });
  });

  describe('Alerting', () => {
    beforeEach(async () => {
      await performanceMonitor.start();
    });

    it('should emit threshold_exceeded event for high CPU', async () => {
      const thresholdHandler = vi.fn();
      performanceMonitor.on('threshold_exceeded', thresholdHandler);

      // Мокаем высокое использование CPU
      const originalCollectSystemMetrics = performanceMonitor['collectSystemMetrics'];
      performanceMonitor['collectSystemMetrics'] = vi.fn().mockResolvedValue({
        cpu: { usage: 95, cores: 4, loadAverage: [2.5, 2.0, 1.8] },
        memory: { total: 8589934592, used: 4294967296, free: 4294967296, usage: 50 },
        disk: { total: 1000000000000, used: 500000000000, free: 500000000000, usage: 50 },
        network: { bytesReceived: 1000000, bytesSent: 500000 }
      });

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(thresholdHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cpu_usage',
          value: 95,
          threshold: 80
        })
      );

      // Восстанавливаем оригинальный метод
      performanceMonitor['collectSystemMetrics'] = originalCollectSystemMetrics;
    });

    it('should emit threshold_exceeded event for high memory usage', async () => {
      const thresholdHandler = vi.fn();
      performanceMonitor.on('threshold_exceeded', thresholdHandler);

      // Мокаем высокое использование памяти
      const originalCollectSystemMetrics = performanceMonitor['collectSystemMetrics'];
      performanceMonitor['collectSystemMetrics'] = vi.fn().mockResolvedValue({
        cpu: { usage: 50, cores: 4, loadAverage: [1.0, 0.8, 0.7] },
        memory: { total: 8589934592, used: 7730941132, free: 858993460, usage: 90 },
        disk: { total: 1000000000000, used: 500000000000, free: 500000000000, usage: 50 },
        network: { bytesReceived: 1000000, bytesSent: 500000 }
      });

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(thresholdHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory_usage',
          value: 90,
          threshold: 85
        })
      );

      performanceMonitor['collectSystemMetrics'] = originalCollectSystemMetrics;
    });

    it('should not emit alerts when thresholds are not exceeded', async () => {
      const thresholdHandler = vi.fn();
      performanceMonitor.on('threshold_exceeded', thresholdHandler);

      // Нормальные значения метрик
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(thresholdHandler).not.toHaveBeenCalled();
    });
  });

  describe('Data Retention', () => {
    beforeEach(async () => {
      // Создаем монитор с коротким периодом хранения для тестирования
      performanceMonitor = new PerformanceMonitor({
        enabled: true,
        collectInterval: 1,
        retentionPeriod: 2 // 2 секунды
      });
      await performanceMonitor.start();
    });

    it('should maintain metrics history', async () => {
      // Ждем несколько циклов сбора
      await new Promise(resolve => setTimeout(resolve, 3500));

      const history = performanceMonitor.getHistory();
      expect(history.length).toBeGreaterThan(1);
      expect(history.length).toBeLessThanOrEqual(3); // Учитывая retention period
    });

    it('should clean up old metrics', async () => {
      // Ждем больше retention period
      await new Promise(resolve => setTimeout(resolve, 4000));

      const history = performanceMonitor.getHistory();
      // Старые метрики должны быть удалены
      const oldestMetric = history[0];
      const now = new Date();
      const age = (now.getTime() - oldestMetric.timestamp.getTime()) / 1000;
      expect(age).toBeLessThanOrEqual(3); // Плюс небольшой буфер
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration at runtime', async () => {
      await performanceMonitor.start();

      const newConfig = {
        collectInterval: 5,
        alerting: {
          enabled: true,
          thresholds: {
            cpu: 90,
            memory: 95,
            disk: 95,
            responseTime: 10000,
            errorRate: 10
          }
        }
      };

      performanceMonitor.updateConfig(newConfig);
      const config = performanceMonitor.getConfig();

      expect(config.collectInterval).toBe(5);
      expect(config.alerting.thresholds.cpu).toBe(90);
      expect(config.alerting.thresholds.memory).toBe(95);
    });

    it('should preserve existing configuration when updating', async () => {
      const originalConfig = performanceMonitor.getConfig();
      
      performanceMonitor.updateConfig({
        collectInterval: 10
      });

      const updatedConfig = performanceMonitor.getConfig();
      expect(updatedConfig.collectInterval).toBe(10);
      expect(updatedConfig.retentionPeriod).toBe(originalConfig.retentionPeriod);
      expect(updatedConfig.enabled).toBe(originalConfig.enabled);
    });
  });

  describe('Error Handling', () => {
    it('should handle metrics collection errors gracefully', async () => {
      await performanceMonitor.start();

      // Мокаем ошибку в сборе системных метрик
      const originalCollectSystemMetrics = performanceMonitor['collectSystemMetrics'];
      performanceMonitor['collectSystemMetrics'] = vi.fn().mockRejectedValue(new Error('System metrics error'));

      // Ждем попытки сбора метрик
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Система должна продолжать работать несмотря на ошибку
      expect(performanceMonitor.isActive()).toBe(true);

      performanceMonitor['collectSystemMetrics'] = originalCollectSystemMetrics;
    });

    it('should handle invalid request data', () => {
      expect(() => {
        performanceMonitor.recordRequest(-100, false); // Отрицательное время
      }).not.toThrow();

      expect(() => {
        performanceMonitor.recordRequest(NaN, false); // NaN время
      }).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks with long running operations', async () => {
      await performanceMonitor.start();

      // Записываем много запросов
      for (let i = 0; i < 1000; i++) {
        performanceMonitor.recordRequest(Math.random() * 1000, Math.random() > 0.9);
      }

      // Ждем несколько циклов
      await new Promise(resolve => setTimeout(resolve, 3000));

      const history = performanceMonitor.getHistory();
      
      // История не должна расти бесконечно
      expect(history.length).toBeLessThan(100); // Разумный лимит для тестирования
    });

    it('should clean up resources on stop', async () => {
      await performanceMonitor.start();
      
      // Записываем данные
      performanceMonitor.recordRequest(100, false);
      
      await performanceMonitor.stop();
      
      // После остановки монитор не должен быть активен
      expect(performanceMonitor.isActive()).toBe(false);
    });
  });
});