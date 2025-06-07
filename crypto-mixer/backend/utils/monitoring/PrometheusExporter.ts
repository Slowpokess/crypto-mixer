import { EventEmitter } from 'events';
import http from 'http';
import { enhancedDbLogger } from '../logger';
import PerformanceMonitor, { PerformanceSnapshot } from './PerformanceMonitor';
import { HealthCheckManager, SystemHealthStatus } from './HealthCheckManager';

/**
 * Prometheus metric типы
 */
export type PrometheusMetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface PrometheusMetric {
  name: string;
  type: PrometheusMetricType;
  help: string;
  value: number | string;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface PrometheusConfig {
  enabled: boolean;
  port: number;
  path: string;
  includeTimestamp: boolean;
  labelPrefix: string;
  namespace: string;
}

/**
 * Prometheus exporter для метрик crypto-mixer
 * Экспортирует метрики из PerformanceMonitor и HealthCheckManager в формате Prometheus
 */
export class PrometheusExporter extends EventEmitter {
  private config: PrometheusConfig;
  private server: http.Server | null = null;
  private isRunning: boolean = false;
  private performanceMonitor: PerformanceMonitor | null = null;
  private healthCheckManager: HealthCheckManager | null = null;
  private customMetrics: Map<string, PrometheusMetric> = new Map();

  constructor(config: Partial<PrometheusConfig> = {}) {
    super();
    this.config = {
      enabled: process.env.PROMETHEUS_ENABLED === 'true',
      port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
      path: process.env.PROMETHEUS_PATH || '/metrics',
      includeTimestamp: process.env.PROMETHEUS_INCLUDE_TIMESTAMP === 'true',
      labelPrefix: process.env.PROMETHEUS_LABEL_PREFIX || 'cryptomixer',
      namespace: process.env.PROMETHEUS_NAMESPACE || 'crypto_mixer',
      ...config
    };
  }

  /**
   * Запуск Prometheus exporter
   */
  async start(
    performanceMonitor?: PerformanceMonitor,
    healthCheckManager?: HealthCheckManager
  ): Promise<void> {
    if (this.isRunning) {
      enhancedDbLogger.warn('⚠️ Prometheus Exporter уже запущен');
      return;
    }

    if (!this.config.enabled) {
      enhancedDbLogger.info('📊 Prometheus Exporter отключен в конфигурации');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('prometheus_exporter_start');

    try {
      enhancedDbLogger.info('📊 Запуск Prometheus Exporter', {
        port: this.config.port,
        path: this.config.path,
        namespace: this.config.namespace
      });

      this.performanceMonitor = performanceMonitor || null;
      this.healthCheckManager = healthCheckManager || null;

      // Создание HTTP сервера для метрик
      this.server = http.createServer((req, res) => {
        this.handleMetricsRequest(req, res);
      });

      // Запуск сервера
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.port, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info(`✅ Prometheus Exporter запущен на порту ${this.config.port}${this.config.path}`);

    } catch (error) {
      this.isRunning = false;
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      throw error;
    }
  }

  /**
   * Остановка Prometheus exporter
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    enhancedDbLogger.info('🛑 Остановка Prometheus Exporter');

    this.isRunning = false;

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          resolve();
        });
      });
      this.server = null;
    }

    enhancedDbLogger.info('✅ Prometheus Exporter остановлен');
  }

  /**
   * Обработка HTTP запросов к /metrics endpoint
   */
  private async handleMetricsRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (req.url !== this.config.path) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
      }

      // Сбор всех метрик
      const metricsText = await this.generateMetricsText();

      // Отправка метрик
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(metricsText);

      enhancedDbLogger.debug('📊 Prometheus метрики отправлены', {
        size: metricsText.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка обработки Prometheus запроса', { error });
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  /**
   * Генерация текста метрик в формате Prometheus
   */
  private async generateMetricsText(): Promise<string> {
    const metrics: PrometheusMetric[] = [];

    // Метрики производительности
    if (this.performanceMonitor) {
      const performanceMetrics = this.collectPerformanceMetrics();
      metrics.push(...performanceMetrics);
    }

    // Метрики health checks
    if (this.healthCheckManager) {
      const healthMetrics = this.collectHealthMetrics();
      metrics.push(...healthMetrics);
    }

    // Кастомные метрики
    const customMetrics = Array.from(this.customMetrics.values());
    metrics.push(...customMetrics);

    // Конвертация в Prometheus формат
    return this.formatMetricsForPrometheus(metrics);
  }

  /**
   * Сбор метрик производительности
   */
  private collectPerformanceMetrics(): PrometheusMetric[] {
    if (!this.performanceMonitor) {
      return [];
    }

    const snapshot = this.performanceMonitor.getLastSnapshot();
    if (!snapshot) {
      return [];
    }

    const metrics: PrometheusMetric[] = [];
    const namespace = this.config.namespace;
    const timestamp = this.config.includeTimestamp ? snapshot.timestamp.getTime() : undefined;

    // Системные метрики
    metrics.push(
      {
        name: `${namespace}_system_cpu_usage`,
        type: 'gauge',
        help: 'CPU usage percentage',
        value: snapshot.system.cpu.usage,
        timestamp
      },
      {
        name: `${namespace}_system_memory_usage`,
        type: 'gauge',
        help: 'Memory usage percentage',
        value: snapshot.system.memory.usage,
        timestamp
      },
      {
        name: `${namespace}_system_memory_total_bytes`,
        type: 'gauge',
        help: 'Total memory in bytes',
        value: snapshot.system.memory.total,
        timestamp
      },
      {
        name: `${namespace}_system_memory_used_bytes`,
        type: 'gauge',
        help: 'Used memory in bytes',
        value: snapshot.system.memory.used,
        timestamp
      },
      {
        name: `${namespace}_system_disk_usage`,
        type: 'gauge',
        help: 'Disk usage percentage',
        value: snapshot.system.disk.usage,
        timestamp
      },
      {
        name: `${namespace}_system_disk_total_bytes`,
        type: 'gauge',
        help: 'Total disk space in bytes',
        value: snapshot.system.disk.total,
        timestamp
      },
      {
        name: `${namespace}_system_load_average`,
        type: 'gauge',
        help: 'System load average',
        value: snapshot.system.cpu.loadAverage[0],
        labels: { period: '1m' },
        timestamp
      }
    );

    // Метрики приложения
    metrics.push(
      {
        name: `${namespace}_requests_total`,
        type: 'counter',
        help: 'Total number of requests',
        value: snapshot.application.requests.total,
        timestamp
      },
      {
        name: `${namespace}_requests_per_second`,
        type: 'gauge',
        help: 'Requests per second',
        value: snapshot.application.requests.perSecond,
        timestamp
      },
      {
        name: `${namespace}_request_error_rate`,
        type: 'gauge',
        help: 'Request error rate percentage',
        value: snapshot.application.requests.errorRate,
        timestamp
      },
      {
        name: `${namespace}_request_duration_milliseconds`,
        type: 'gauge',
        help: 'Average request duration in milliseconds',
        value: snapshot.application.requests.averageResponseTime,
        timestamp
      },
      {
        name: `${namespace}_request_duration_percentile`,
        type: 'gauge',
        help: 'Request duration percentiles',
        value: snapshot.application.requests.percentiles.p50,
        labels: { quantile: '0.5' },
        timestamp
      },
      {
        name: `${namespace}_request_duration_percentile`,
        type: 'gauge',
        help: 'Request duration percentiles',
        value: snapshot.application.requests.percentiles.p95,
        labels: { quantile: '0.95' },
        timestamp
      },
      {
        name: `${namespace}_request_duration_percentile`,
        type: 'gauge',
        help: 'Request duration percentiles',
        value: snapshot.application.requests.percentiles.p99,
        labels: { quantile: '0.99' },
        timestamp
      }
    );

    // Метрики базы данных
    metrics.push(
      {
        name: `${namespace}_database_connections_active`,
        type: 'gauge',
        help: 'Active database connections',
        value: snapshot.application.database.connections.active,
        timestamp
      },
      {
        name: `${namespace}_database_connections_idle`,
        type: 'gauge',
        help: 'Idle database connections',
        value: snapshot.application.database.connections.idle,
        timestamp
      },
      {
        name: `${namespace}_database_connections_total`,
        type: 'gauge',
        help: 'Total database connections',
        value: snapshot.application.database.connections.total,
        timestamp
      }
    );

    // Бизнес-метрики
    metrics.push(
      {
        name: `${namespace}_mixing_operations_in_progress`,
        type: 'gauge',
        help: 'Mixing operations currently in progress',
        value: snapshot.business.mixing.operationsInProgress,
        timestamp
      },
      {
        name: `${namespace}_mixing_operations_completed_total`,
        type: 'counter',
        help: 'Total completed mixing operations',
        value: snapshot.business.mixing.operationsCompleted,
        timestamp
      },
      {
        name: `${namespace}_mixing_operations_failed_total`,
        type: 'counter',
        help: 'Total failed mixing operations',
        value: snapshot.business.mixing.operationsFailed,
        timestamp
      },
      {
        name: `${namespace}_mixing_success_rate`,
        type: 'gauge',
        help: 'Mixing operations success rate percentage',
        value: snapshot.business.mixing.successRate,
        timestamp
      },
      {
        name: `${namespace}_wallets_total`,
        type: 'gauge',
        help: 'Total number of wallets',
        value: snapshot.business.wallets.totalWallets,
        timestamp
      },
      {
        name: `${namespace}_wallets_active`,
        type: 'gauge',
        help: 'Number of active wallets',
        value: snapshot.business.wallets.activeWallets,
        timestamp
      }
    );

    // Метрики блокчейнов
    Object.entries(snapshot.business.blockchain).forEach(([blockchain, data]) => {
      metrics.push(
        {
          name: `${namespace}_blockchain_connected`,
          type: 'gauge',
          help: 'Blockchain connection status (1 = connected, 0 = disconnected)',
          value: data.connected ? 1 : 0,
          labels: { blockchain },
          timestamp
        }
      );

      if (blockchain === 'bitcoin') {
        metrics.push({
          name: `${namespace}_blockchain_block_height`,
          type: 'gauge',
          help: 'Current blockchain block height',
          value: data.blockHeight,
          labels: { blockchain },
          timestamp
        });
      }
    });

    // Метрики безопасности
    metrics.push(
      {
        name: `${namespace}_security_alerts_active`,
        type: 'gauge',
        help: 'Number of active security alerts',
        value: snapshot.business.security.alertsActive,
        timestamp
      },
      {
        name: `${namespace}_security_blocked_transactions_total`,
        type: 'counter',
        help: 'Total number of blocked transactions',
        value: snapshot.business.security.blockedTransactions,
        timestamp
      },
      {
        name: `${namespace}_security_risk_score`,
        type: 'gauge',
        help: 'Current system risk score',
        value: snapshot.business.security.riskScore,
        timestamp
      }
    );

    // Метрика uptime
    metrics.push({
      name: `${namespace}_uptime_seconds`,
      type: 'counter',
      help: 'Application uptime in seconds',
      value: snapshot.uptime,
      timestamp
    });

    return metrics;
  }

  /**
   * Сбор метрик health checks
   */
  private collectHealthMetrics(): PrometheusMetric[] {
    if (!this.healthCheckManager) {
      return [];
    }

    const systemHealth = this.healthCheckManager.getSystemHealth();
    const metrics: PrometheusMetric[] = [];
    const namespace = this.config.namespace;
    const timestamp = this.config.includeTimestamp ? systemHealth.timestamp.getTime() : undefined;

    // Общий статус системы
    const overallStatusValue = this.healthStatusToNumber(systemHealth.overall);
    metrics.push({
      name: `${namespace}_system_health_status`,
      type: 'gauge',
      help: 'Overall system health status (0=down, 1=critical, 2=degraded, 3=healthy)',
      value: overallStatusValue,
      timestamp
    });

    // Статистика сервисов
    metrics.push(
      {
        name: `${namespace}_services_total`,
        type: 'gauge',
        help: 'Total number of monitored services',
        value: systemHealth.summary.total,
        timestamp
      },
      {
        name: `${namespace}_services_healthy`,
        type: 'gauge',
        help: 'Number of healthy services',
        value: systemHealth.summary.healthy,
        timestamp
      },
      {
        name: `${namespace}_services_warning`,
        type: 'gauge',
        help: 'Number of services in warning state',
        value: systemHealth.summary.warning,
        timestamp
      },
      {
        name: `${namespace}_services_critical`,
        type: 'gauge',
        help: 'Number of services in critical state',
        value: systemHealth.summary.critical,
        timestamp
      },
      {
        name: `${namespace}_services_unknown`,
        type: 'gauge',
        help: 'Number of services in unknown state',
        value: systemHealth.summary.unknown,
        timestamp
      }
    );

    // Среднее время ответа
    metrics.push({
      name: `${namespace}_services_average_response_time_milliseconds`,
      type: 'gauge',
      help: 'Average response time of all services in milliseconds',
      value: systemHealth.averageResponseTime,
      timestamp
    });

    // Uptime системы
    metrics.push({
      name: `${namespace}_system_uptime_percentage`,
      type: 'gauge',
      help: 'System uptime percentage',
      value: systemHealth.systemUptime,
      timestamp
    });

    // Метрики для каждого сервиса
    systemHealth.services.forEach((serviceResult, serviceName) => {
      const serviceStatusValue = this.healthStatusToNumber(serviceResult.status);
      
      metrics.push(
        {
          name: `${namespace}_service_health_status`,
          type: 'gauge',
          help: 'Service health status (0=unknown, 1=critical, 2=warning, 3=healthy)',
          value: serviceStatusValue,
          labels: { service: serviceName },
          timestamp
        },
        {
          name: `${namespace}_service_response_time_milliseconds`,
          type: 'gauge',
          help: 'Service response time in milliseconds',
          value: serviceResult.responseTime,
          labels: { service: serviceName },
          timestamp
        },
        {
          name: `${namespace}_service_consecutive_failures`,
          type: 'gauge',
          help: 'Number of consecutive failures for service',
          value: serviceResult.metadata.consecutiveFailures,
          labels: { service: serviceName },
          timestamp
        },
        {
          name: `${namespace}_service_uptime_percentage`,
          type: 'gauge',
          help: 'Service uptime percentage',
          value: serviceResult.metadata.uptime || 0,
          labels: { service: serviceName },
          timestamp
        }
      );
    });

    return metrics;
  }

  /**
   * Преобразование статуса здоровья в число
   */
  private healthStatusToNumber(status: string): number {
    switch (status) {
      case 'healthy': return 3;
      case 'degraded':
      case 'warning': return 2;
      case 'critical': return 1;
      case 'down':
      case 'unknown':
      default: return 0;
    }
  }

  /**
   * Форматирование метрик в формат Prometheus
   */
  private formatMetricsForPrometheus(metrics: PrometheusMetric[]): string {
    const lines: string[] = [];
    const metricGroups: Map<string, PrometheusMetric[]> = new Map();

    // Группировка метрик по имени
    metrics.forEach(metric => {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    });

    // Генерация Prometheus формата
    metricGroups.forEach((metricList, metricName) => {
      const firstMetric = metricList[0];
      
      // HELP комментарий
      lines.push(`# HELP ${metricName} ${firstMetric.help}`);
      
      // TYPE комментарий
      lines.push(`# TYPE ${metricName} ${firstMetric.type}`);
      
      // Метрики
      metricList.forEach(metric => {
        let line = metricName;
        
        // Добавление labels
        if (metric.labels && Object.keys(metric.labels).length > 0) {
          const labelPairs = Object.entries(metric.labels)
            .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
            .join(',');
          line += `{${labelPairs}}`;
        }
        
        // Добавление значения
        line += ` ${metric.value}`;
        
        // Добавление timestamp если включен
        if (metric.timestamp && this.config.includeTimestamp) {
          line += ` ${metric.timestamp}`;
        }
        
        lines.push(line);
      });
      
      // Пустая строка между группами метрик
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Экранирование значений labels для Prometheus
   */
  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Добавление кастомной метрики
   */
  addCustomMetric(
    name: string,
    type: PrometheusMetricType,
    help: string,
    value: number | string,
    labels?: Record<string, string>
  ): void {
    const metricName = `${this.config.namespace}_${name}`;
    
    this.customMetrics.set(metricName, {
      name: metricName,
      type,
      help,
      value,
      labels,
      timestamp: this.config.includeTimestamp ? Date.now() : undefined
    });
  }

  /**
   * Удаление кастомной метрики
   */
  removeCustomMetric(name: string): void {
    const metricName = `${this.config.namespace}_${name}`;
    this.customMetrics.delete(metricName);
  }

  /**
   * Очистка всех кастомных метрик
   */
  clearCustomMetrics(): void {
    this.customMetrics.clear();
  }

  /**
   * Получение URL для метрик
   */
  getMetricsUrl(): string {
    return `http://localhost:${this.config.port}${this.config.path}`;
  }

  /**
   * Получение статуса работы exporter'а
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Получение конфигурации
   */
  getConfig(): PrometheusConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации
   */
  updateConfig(newConfig: Partial<PrometheusConfig>): void {
    this.config = { ...this.config, ...newConfig };
    enhancedDbLogger.info('📊 Конфигурация Prometheus Exporter обновлена', newConfig);
  }
}

export default PrometheusExporter;