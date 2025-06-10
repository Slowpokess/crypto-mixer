import { EventEmitter } from 'events';
import { enhancedDbLogger } from '../logger';
import PerformanceMonitor from './PerformanceMonitor';
import { HealthCheckManager, HealthCheckConfig } from './HealthCheckManager';
import PrometheusExporter from './PrometheusExporter';
import AlertManager from './AlertManager';
import NotificationManager from './NotificationManager';

/**
 * Конфигурация интегрированной системы мониторинга
 */
export interface MonitoringSystemConfig {
  enabled: boolean;
  performanceMonitoring: {
    enabled: boolean;
    collectInterval: number;
    retentionPeriod: number;
    alerting: {
      enabled: boolean;
      thresholds: {
        cpu: number;
        memory: number;
        disk: number;
        responseTime: number;
        errorRate: number;
      };
    };
  };
  healthChecks: {
    enabled: boolean;
    interval: number;
    timeout: number;
    retries: number;
    services: any[];
  };
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
    namespace: string;
  };
  alerting: {
    enabled: boolean;
    webhookUrl?: string;
    slackChannel?: string;
    emailRecipients?: string[];
  };
}

/**
 * Интегрированная система мониторинга для crypto-mixer
 * Объединяет PerformanceMonitor, HealthCheckManager и PrometheusExporter
 */
export class MonitoringSystem extends EventEmitter {
  private config: MonitoringSystemConfig;
  private isRunning: boolean = false;
  private performanceMonitor: PerformanceMonitor | null = null;
  private healthCheckManager: HealthCheckManager | null = null;
  private prometheusExporter: PrometheusExporter | null = null;
  private alertManager: AlertManager | null = null;
  private notificationManager: NotificationManager | null = null;

  constructor(config: Partial<MonitoringSystemConfig> = {}) {
    super();
    this.config = this.buildConfig(config);
  }

  /**
   * Создание полной конфигурации с дефолтными значениями
   */
  private buildConfig(partialConfig: Partial<MonitoringSystemConfig>): MonitoringSystemConfig {
    return {
      enabled: process.env.MONITORING_ENABLED === 'true',
      performanceMonitoring: {
        enabled: process.env.PERFORMANCE_MONITORING === 'true',
        collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL || '30'),
        retentionPeriod: parseInt(process.env.METRICS_RETENTION_PERIOD || '3600'),
        alerting: {
          enabled: process.env.PERFORMANCE_ALERTING === 'true',
          thresholds: {
            cpu: parseFloat(process.env.CPU_ALERT_THRESHOLD || '80'),
            memory: parseFloat(process.env.MEMORY_ALERT_THRESHOLD || '85'),
            disk: parseFloat(process.env.DISK_ALERT_THRESHOLD || '90'),
            responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000'),
            errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5')
          }
        }
      },
      healthChecks: {
        enabled: process.env.HEALTH_CHECKS_ENABLED === 'true',
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60'),
        timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '30'),
        retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
        services: this.getDefaultHealthCheckServices()
      },
      prometheus: {
        enabled: process.env.PROMETHEUS_ENABLED === 'true',
        port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
        path: process.env.PROMETHEUS_PATH || '/metrics',
        namespace: process.env.PROMETHEUS_NAMESPACE || 'crypto_mixer'
      },
      alerting: {
        enabled: process.env.ALERTING_ENABLED === 'true',
        webhookUrl: process.env.ALERT_WEBHOOK_URL,
        slackChannel: process.env.SLACK_CHANNEL,
        emailRecipients: process.env.EMAIL_RECIPIENTS?.split(',')
      },
      ...partialConfig
    };
  }

  /**
   * Дефолтная конфигурация сервисов для health checks
   */
  private getDefaultHealthCheckServices(): any[] {
    return [
      // База данных
      {
        name: 'postgresql',
        type: 'database',
        enabled: true,
        critical: true,
        timeout: 10
      },
      // Кэш
      {
        name: 'redis',
        type: 'redis',
        enabled: true,
        critical: true,
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        timeout: 5
      },
      // Очереди сообщений
      {
        name: 'rabbitmq',
        type: 'rabbitmq',
        enabled: true,
        critical: true,
        host: process.env.RABBITMQ_HOST || 'localhost',
        port: parseInt(process.env.RABBITMQ_PORT || '5672'),
        timeout: 10,
        metadata: {
          auth: `${process.env.RABBITMQ_USER || 'guest'}:${process.env.RABBITMQ_PASS || 'guest'}`
        }
      },
      // Mixer API
      {
        name: 'mixer-api',
        type: 'http',
        enabled: true,
        critical: true,
        host: process.env.MIXER_API_HOST || 'localhost',
        port: parseInt(process.env.MIXER_API_PORT || '3000'),
        path: '/health',
        expectedStatus: 200,
        timeout: 5
      },
      // Blockchain сервисы
      {
        name: 'blockchain-service',
        type: 'http',
        enabled: true,
        critical: false,
        host: process.env.BLOCKCHAIN_SERVICE_HOST || 'localhost',
        port: parseInt(process.env.BLOCKCHAIN_SERVICE_PORT || '3001'),
        path: '/health',
        expectedStatus: 200,
        timeout: 10
      },
      // Wallet сервис
      {
        name: 'wallet-service',
        type: 'http',
        enabled: true,
        critical: true,
        host: process.env.WALLET_SERVICE_HOST || 'localhost',
        port: parseInt(process.env.WALLET_SERVICE_PORT || '3002'),
        path: '/health',
        expectedStatus: 200,
        timeout: 10
      },
      // Scheduler сервис
      {
        name: 'scheduler-service',
        type: 'http',
        enabled: true,
        critical: false,
        host: process.env.SCHEDULER_SERVICE_HOST || 'localhost',
        port: parseInt(process.env.SCHEDULER_SERVICE_PORT || '3003'),
        path: '/health',
        expectedStatus: 200,
        timeout: 10
      },
      // Vault (если используется)
      {
        name: 'vault',
        type: 'vault',
        enabled: process.env.VAULT_ENABLED === 'true',
        critical: false,
        host: process.env.VAULT_HOST || 'localhost',
        port: parseInt(process.env.VAULT_PORT || '8200'),
        timeout: 10
      },
      // HSM (если используется)
      {
        name: 'hsm',
        type: 'hsm',
        enabled: process.env.HSM_ENABLED === 'true',
        critical: false,
        timeout: 15
      }
    ];
  }

  /**
   * Запуск интегрированной системы мониторинга
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      enhancedDbLogger.warn('⚠️ Monitoring System уже запущен');
      return;
    }

    if (!this.config.enabled) {
      enhancedDbLogger.info('📊 Monitoring System отключена в конфигурации');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('monitoring_system_start');

    try {
      enhancedDbLogger.info('📊 Запуск интегрированной системы мониторинга', {
        performanceMonitoring: this.config.performanceMonitoring.enabled,
        healthChecks: this.config.healthChecks.enabled,
        prometheus: this.config.prometheus.enabled,
        alerting: this.config.alerting.enabled
      });

      // Запуск Performance Monitor
      if (this.config.performanceMonitoring.enabled) {
        await this.startPerformanceMonitoring();
      }

      // Запуск Health Check Manager
      if (this.config.healthChecks.enabled) {
        await this.startHealthChecking();
      }

      // Запуск Prometheus Exporter
      if (this.config.prometheus.enabled) {
        await this.startPrometheusExporter();
      }

      // Запуск системы алертинга
      if (this.config.alerting.enabled) {
        await this.startAlerting();
      }

      this.isRunning = true;

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Интегрированная система мониторинга запущена успешно');

      // Отправка уведомления о запуске системы
      this.emit('system_started', {
        timestamp: new Date(),
        components: {
          performanceMonitoring: this.config.performanceMonitoring.enabled,
          healthChecks: this.config.healthChecks.enabled,
          prometheus: this.config.prometheus.enabled,
          alerting: this.config.alerting.enabled,
          notifications: this.config.alerting.enabled
        }
      });

    } catch (error) {
      this.isRunning = false;
      await enhancedDbLogger.endOperation(operationId, false);
      // Правильная типизация error для логгера
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await enhancedDbLogger.logError(errorToLog);
      throw error;
    }
  }

  /**
   * Остановка системы мониторинга
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    enhancedDbLogger.info('🛑 Остановка интегрированной системы мониторинга');

    // Остановка компонентов в обратном порядке
    if (this.alertManager) {
      await this.alertManager.stop();
      this.alertManager = null;
    }

    if (this.notificationManager) {
      await this.notificationManager.stop();
      this.notificationManager = null;
    }

    if (this.prometheusExporter) {
      await this.prometheusExporter.stop();
      this.prometheusExporter = null;
    }

    if (this.healthCheckManager) {
      await this.healthCheckManager.stop();
      this.healthCheckManager = null;
    }

    if (this.performanceMonitor) {
      await this.performanceMonitor.stop();
      this.performanceMonitor = null;
    }

    this.isRunning = false;

    enhancedDbLogger.info('✅ Интегрированная система мониторинга остановлена');

    this.emit('system_stopped', {
      timestamp: new Date()
    });
  }

  /**
   * Запуск мониторинга производительности
   */
  private async startPerformanceMonitoring(): Promise<void> {
    try {
      this.performanceMonitor = new PerformanceMonitor({
        enabled: true,
        collectInterval: this.config.performanceMonitoring.collectInterval,
        retentionPeriod: this.config.performanceMonitoring.retentionPeriod,
        prometheusEnabled: false, // Будет управляться отдельно
        alerting: this.config.performanceMonitoring.alerting
      });

      await this.performanceMonitor.start();

      // Подписка на события производительности
      this.performanceMonitor.on('metrics_collected', (snapshot) => {
        this.emit('performance_metrics', snapshot);
      });

      this.performanceMonitor.on('threshold_exceeded', (alert) => {
        this.emit('performance_alert', alert);
        this.handlePerformanceAlert(alert);
      });

      enhancedDbLogger.info('✅ Performance Monitor запущен');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска Performance Monitor', { error });
      throw error;
    }
  }

  /**
   * Запуск проверок состояния сервисов
   */
  private async startHealthChecking(): Promise<void> {
    try {
      const healthConfig: HealthCheckConfig = {
        enabled: true,
        interval: this.config.healthChecks.interval,
        timeout: this.config.healthChecks.timeout,
        retries: this.config.healthChecks.retries,
        parallelChecks: true,
        alertThresholds: {
          consecutiveFailures: 3,
          responseTimeWarning: 5000,
          responseTimeCritical: 10000
        },
        services: this.config.healthChecks.services
      };

      this.healthCheckManager = new HealthCheckManager(healthConfig);
      await this.healthCheckManager.start();

      // Подписка на события health checks
      this.healthCheckManager.on('health_check_completed', (systemHealth) => {
        this.emit('health_status', systemHealth);
      });

      this.healthCheckManager.on('status_change', (change) => {
        this.emit('health_status_change', change);
        this.handleHealthStatusChange(change);
      });

      this.healthCheckManager.on('service_alert', (alert) => {
        this.emit('service_alert', alert);
        this.handleServiceAlert(alert);
      });

      enhancedDbLogger.info('✅ Health Check Manager запущен');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска Health Check Manager', { error });
      throw error;
    }
  }

  /**
   * Запуск Prometheus экспортера
   */
  private async startPrometheusExporter(): Promise<void> {
    try {
      this.prometheusExporter = new PrometheusExporter({
        enabled: true,
        port: this.config.prometheus.port,
        path: this.config.prometheus.path,
        namespace: this.config.prometheus.namespace
      });

      await this.prometheusExporter.start(
        this.performanceMonitor || undefined,
        this.healthCheckManager || undefined
      );

      enhancedDbLogger.info('✅ Prometheus Exporter запущен', {
        url: this.prometheusExporter.getMetricsUrl()
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска Prometheus Exporter', { error });
      throw error;
    }
  }

  /**
   * Запуск системы алертинга
   */
  private async startAlerting(): Promise<void> {
    try {
      // Запуск менеджера уведомлений
      this.notificationManager = new NotificationManager();
      await this.notificationManager.start();

      // Запуск менеджера алертов
      this.alertManager = new AlertManager({
        enabled: true,
        channels: this.config.alerting.enabled ? [
          {
            type: 'webhook',
            enabled: !!this.config.alerting.webhookUrl,
            config: {
              url: this.config.alerting.webhookUrl,
              headers: {
                'Content-Type': 'application/json'
              }
            },
            retries: 3,
            timeout: 10000
          },
          {
            type: 'slack',
            enabled: !!this.config.alerting.slackChannel,
            config: {
              webhookUrl: process.env.SLACK_WEBHOOK_URL,
              channel: this.config.alerting.slackChannel,
              username: 'Crypto Mixer Bot'
            },
            retries: 3,
            timeout: 10000
          },
          {
            type: 'email',
            enabled: !!this.config.alerting.emailRecipients,
            config: {
              smtp: {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS
                }
              },
              from: process.env.ALERT_FROM_EMAIL || 'alerts@crypto-mixer.local',
              recipients: this.config.alerting.emailRecipients || []
            },
            retries: 2,
            timeout: 15000
          }
        ] : []
      });

      await this.alertManager.start();

      // Интеграция с существующими компонентами
      this.setupAlertIntegration();

      enhancedDbLogger.info('✅ Система алертинга запущена');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска системы алертинга', { error });
      throw error;
    }
  }

  /**
   * Настройка интеграции алертов с компонентами мониторинга
   */
  private setupAlertIntegration(): void {
    if (!this.alertManager) {
      return;
    }

    // Интеграция с Performance Monitor
    if (this.performanceMonitor) {
      this.performanceMonitor.on('threshold_exceeded', async (thresholdData) => {
        await this.alertManager!.createAlert(
          'performance',
          this.getSeverityByThreshold(thresholdData.type, thresholdData.value, thresholdData.threshold),
          `High ${thresholdData.type}`,
          `${thresholdData.type} (${thresholdData.value}${thresholdData.unit || '%'}) превысил пороговое значение ${thresholdData.threshold}${thresholdData.unit || '%'}`,
          'performance_monitor',
          {
            metric: thresholdData.type,
            current: thresholdData.value,
            threshold: thresholdData.threshold,
            unit: thresholdData.unit,
            timestamp: thresholdData.timestamp
          }
        );
      });
    }

    // Интеграция с Health Check Manager
    if (this.healthCheckManager) {
      this.healthCheckManager.on('status_change', async (statusChange) => {
        const severity = statusChange.to === 'down' ? 'critical' : 
                        statusChange.to === 'critical' ? 'high' : 'medium';

        await this.alertManager!.createAlert(
          'health_status',
          severity,
          `Service Status Changed: ${statusChange.service}`,
          `Service ${statusChange.service} status changed from ${statusChange.from} to ${statusChange.to}`,
          'health_check_manager',
          {
            service: statusChange.service,
            previousStatus: statusChange.from,
            currentStatus: statusChange.to,
            timestamp: statusChange.timestamp
          }
        );
      });

      this.healthCheckManager.on('service_alert', async (serviceAlert) => {
        await this.alertManager!.createAlert(
          'service',
          serviceAlert.critical ? 'critical' : 'high',
          `Service Alert: ${serviceAlert.service}`,
          `Service ${serviceAlert.service} has ${serviceAlert.failures} consecutive failures`,
          'health_check_manager',
          {
            service: serviceAlert.service,
            failures: serviceAlert.failures,
            critical: serviceAlert.critical,
            lastError: serviceAlert.lastError
          }
        );
      });
    }

    enhancedDbLogger.info('📢 Интеграция алертов настроена');
  }

  /**
   * Определение уровня важности по пороговому значению
   * Учитывает тип метрики для более точной классификации
   */
  private getSeverityByThreshold(type: string, value: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = value / threshold;
    
    // Для критически важных метрик (CPU, memory) применяем более строгие критерии
    const isCriticalMetric = ['cpu', 'memory', 'disk'].includes(type.toLowerCase());
    
    if (isCriticalMetric) {
      // Более строгие пороги для критических метрик
      if (ratio >= 1.3) return 'critical';
      if (ratio >= 1.1) return 'high';
      if (ratio >= 1.0) return 'medium';
      return 'low';
    } else {
      // Стандартные пороги для остальных метрик
      if (ratio >= 1.5) return 'critical';
      if (ratio >= 1.2) return 'high';
      if (ratio >= 1.0) return 'medium';
      return 'low';
    }
  }

  /**
   * Обработка алертов производительности
   */
  private handlePerformanceAlert(alert: any): void {
    enhancedDbLogger.warn('⚠️ Performance Alert', {
      type: alert.type,
      value: alert.value,
      threshold: alert.threshold,
      timestamp: alert.timestamp
    });

    // Дополнительная логика обработки алертов
    this.sendAlert({
      type: 'performance',
      severity: 'warning',
      title: `Performance Alert: ${alert.type}`,
      description: `${alert.type} exceeded threshold: ${alert.value} > ${alert.threshold}`,
      timestamp: alert.timestamp
    });
  }

  /**
   * Обработка изменений статуса здоровья
   */
  private handleHealthStatusChange(change: any): void {
    const severity = change.to === 'down' ? 'critical' : 
                     change.to === 'critical' ? 'high' : 'medium';

    enhancedDbLogger.warn('🏥 Health Status Change', {
      from: change.from,
      to: change.to,
      timestamp: change.timestamp
    });

    this.sendAlert({
      type: 'health_status',
      severity,
      title: `System Health Changed: ${change.from} → ${change.to}`,
      description: `System health status changed from ${change.from} to ${change.to}`,
      timestamp: change.timestamp
    });
  }

  /**
   * Обработка алертов сервисов
   */
  private handleServiceAlert(alert: any): void {
    const severity = alert.critical ? 'critical' : 'high';

    enhancedDbLogger.warn('🚨 Service Alert', {
      service: alert.service,
      type: alert.type,
      failures: alert.failures,
      critical: alert.critical
    });

    this.sendAlert({
      type: 'service',
      severity,
      title: `Service Alert: ${alert.service}`,
      description: `Service ${alert.service} has ${alert.failures} consecutive failures`,
      timestamp: new Date()
    });
  }

  /**
   * Отправка алерта через настроенные каналы
   */
  private sendAlert(alert: {
    type: string;
    severity: string;
    title: string;
    description: string;
    timestamp: Date;
  }): void {
    // Базовое логирование
    enhancedDbLogger.error('🚨 ALERT', alert);

    // Отправка через webhook, email, Slack будет реализована в следующей итерации
    this.emit('alert_sent', alert);
  }

  /**
   * Получение статуса всей системы мониторинга
   */
  getSystemStatus(): {
    running: boolean;
    components: {
      performanceMonitor: boolean;
      healthCheckManager: boolean;
      prometheusExporter: boolean;
      alertManager: boolean;
      notificationManager: boolean;
    };
    metrics: {
      lastPerformanceSnapshot: any;
      systemHealth: any;
      prometheusUrl: string | null;
      activeAlerts: number;
      alertStatistics: any;
    };
  } {
    return {
      running: this.isRunning,
      components: {
        performanceMonitor: this.performanceMonitor?.isActive() || false,
        healthCheckManager: this.healthCheckManager?.isActive() || false,
        prometheusExporter: this.prometheusExporter?.isActive() || false,
        alertManager: this.alertManager?.isActive() || false,
        notificationManager: this.notificationManager?.isActive() || false
      },
      metrics: {
        lastPerformanceSnapshot: this.performanceMonitor?.getLastSnapshot() || null,
        systemHealth: this.healthCheckManager?.getSystemHealth() || null,
        prometheusUrl: this.prometheusExporter?.getMetricsUrl() || null,
        activeAlerts: this.alertManager?.getActiveAlerts().length || 0,
        alertStatistics: this.alertManager?.getAlertStatistics() || null
      }
    };
  }

  /**
   * Запись запроса для метрик производительности
   */
  recordRequest(responseTime: number, isError: boolean = false): void {
    if (this.performanceMonitor) {
      this.performanceMonitor.recordRequest(responseTime, isError);
    }
  }

  /**
   * Принудительная проверка конкретного сервиса
   */
  async checkService(serviceName: string): Promise<any> {
    if (this.healthCheckManager) {
      return await this.healthCheckManager.checkServiceNow(serviceName);
    }
    throw new Error('Health Check Manager не запущен');
  }

  /**
   * Принудительная проверка всех сервисов
   */
  async checkAllServices(): Promise<any> {
    if (this.healthCheckManager) {
      return await this.healthCheckManager.checkAllServicesNow();
    }
    throw new Error('Health Check Manager не запущен');
  }

  /**
   * Добавление кастомной метрики
   */
  addCustomMetric(
    name: string,
    type: 'counter' | 'gauge' | 'histogram' | 'summary',
    help: string,
    value: number | string,
    labels?: Record<string, string>
  ): void {
    if (this.prometheusExporter) {
      this.prometheusExporter.addCustomMetric(name, type, help, value, labels);
    }
  }

  /**
   * Получение конфигурации
   */
  getConfig(): MonitoringSystemConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации
   */
  updateConfig(newConfig: Partial<MonitoringSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    enhancedDbLogger.info('📊 Конфигурация Monitoring System обновлена', newConfig);
  }

  /**
   * Получение статуса работы системы
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Создание кастомного алерта
   */
  async createCustomAlert(
    type: 'performance' | 'health_status' | 'service' | 'security' | 'business',
    severity: 'low' | 'medium' | 'high' | 'critical',
    title: string,
    description: string,
    source: string,
    metadata: Record<string, any> = {}
  ): Promise<any> {
    if (this.alertManager) {
      return await this.alertManager.createAlert(type, severity, title, description, source, metadata);
    }
    throw new Error('Alert Manager не запущен');
  }

  /**
   * Подтверждение алерта
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    if (this.alertManager) {
      return await this.alertManager.acknowledgeAlert(alertId, acknowledgedBy);
    }
    return false;
  }

  /**
   * Разрешение алерта
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    if (this.alertManager) {
      return await this.alertManager.resolveAlert(alertId);
    }
    return false;
  }

  /**
   * Получение активных алертов
   */
  getActiveAlerts(): any[] {
    if (this.alertManager) {
      return this.alertManager.getActiveAlerts();
    }
    return [];
  }

  /**
   * Получение истории алертов
   */
  getAlertHistory(): any[] {
    if (this.alertManager) {
      return this.alertManager.getAlertHistory();
    }
    return [];
  }

  /**
   * Получение статистики алертов
   */
  getAlertStatistics(): any {
    if (this.alertManager) {
      return this.alertManager.getAlertStatistics();
    }
    return null;
  }

  /**
   * Получение статистики уведомлений
   */
  getNotificationStatistics(): any {
    if (this.notificationManager) {
      return this.notificationManager.getStats();
    }
    return null;
  }

  /**
   * Тестирование канала уведомлений
   */
  async testNotificationChannel(channelType: string): Promise<boolean> {
    if (!this.notificationManager) {
      return false;
    }

    // Создание тестового канала на основе конфигурации
    const testChannel = this.createTestChannelConfig(channelType);
    if (!testChannel) {
      return false;
    }

    return await this.notificationManager.testChannel(testChannel);
  }

  /**
   * Создание тестовой конфигурации канала
   */
  private createTestChannelConfig(channelType: string): any {
    switch (channelType) {
      case 'webhook':
        return this.config.alerting.webhookUrl ? {
          type: 'webhook',
          enabled: true,
          config: {
            url: this.config.alerting.webhookUrl,
            headers: { 'Content-Type': 'application/json' }
          },
          retries: 1,
          timeout: 5000
        } : null;

      case 'slack':
        return this.config.alerting.slackChannel ? {
          type: 'slack',
          enabled: true,
          config: {
            webhookUrl: process.env.SLACK_WEBHOOK_URL,
            channel: this.config.alerting.slackChannel,
            username: 'Crypto Mixer Test Bot'
          },
          retries: 1,
          timeout: 5000
        } : null;

      case 'email':
        return this.config.alerting.emailRecipients ? {
          type: 'email',
          enabled: true,
          config: {
            smtp: {
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || '587'),
              secure: process.env.SMTP_SECURE === 'true',
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
              }
            },
            from: process.env.ALERT_FROM_EMAIL || 'alerts@crypto-mixer.local',
            recipients: this.config.alerting.emailRecipients
          },
          retries: 1,
          timeout: 10000
        } : null;

      default:
        return null;
    }
  }
}

export default MonitoringSystem;