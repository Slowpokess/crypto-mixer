import { Sequelize } from 'sequelize';
import { EventEmitter } from 'events';
import * as cron from 'node-cron';

export interface MonitoringMetrics {
  timestamp: Date;
  connectionPool: {
    active: number;
    idle: number;
    waiting: number;
    total: number;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    totalQueries: number;
    errorRate: number;
  };
  database: {
    size: number;
    tableCount: number;
    indexCount: number;
    deadlocks: number;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    diskIops: number;
  };
  business: {
    activeMixRequests: number;
    pendingTransactions: number;
    failedTransactions: number;
    poolUtilization: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number; // minutes
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  notificationChannels: string[];
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Система мониторинга базы данных с real-time алертами
 */
export class DatabaseMonitoring extends EventEmitter {
  private sequelize: Sequelize;
  private metricsHistory: MonitoringMetrics[] = [];
  private activeAlerts: Map<string, Alert> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private alertCheckerInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;
  private config: {
    metricsRetentionHours: number;
    monitoringIntervalMs: number;
    alertCheckIntervalMs: number;
    slowQueryThresholdMs: number;
  };

  constructor(sequelize: Sequelize, config: Partial<typeof DatabaseMonitoring.prototype.config> = {}) {
    super();
    this.sequelize = sequelize;
    this.config = {
      metricsRetentionHours: 24,
      monitoringIntervalMs: 30000, // 30 секунд
      alertCheckIntervalMs: 10000, // 10 секунд
      slowQueryThresholdMs: 1000, // 1 секунда
      ...config
    };

    this.setupDefaultAlertRules();
  }

  /**
   * Запуск мониторинга
   */
  start(): void {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring is already running');
      return;
    }

    console.log('🔄 Starting database monitoring...');
    
    this.isMonitoring = true;

    // Запускаем сбор метрик
    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.addMetrics(metrics);
        this.emit('metricsCollected', metrics);
      } catch (error) {
        console.error('❌ Error collecting metrics:', error);
        this.emit('error', error);
      }
    }, this.config.monitoringIntervalMs);

    // Запускаем проверку алертов
    this.alertCheckerInterval = setInterval(() => {
      this.checkAlerts();
    }, this.config.alertCheckIntervalMs);

    // Запускаем очистку старых метрик каждый час
    cron.schedule('0 * * * *', () => {
      this.cleanupOldMetrics();
    });

    console.log('✅ Database monitoring started');
  }

  /**
   * Остановка мониторинга
   */
  stop(): void {
    if (!this.isMonitoring) {
      console.log('⚠️ Monitoring is not running');
      return;
    }

    console.log('🔄 Stopping database monitoring...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.alertCheckerInterval) {
      clearInterval(this.alertCheckerInterval);
    }

    this.isMonitoring = false;
    console.log('✅ Database monitoring stopped');
  }

  /**
   * Сбор метрик
   */
  private async collectMetrics(): Promise<MonitoringMetrics> {
    const timestamp = new Date();
    
    const [
      connectionPoolMetrics,
      performanceMetrics,
      databaseMetrics,
      systemMetrics,
      businessMetrics
    ] = await Promise.all([
      this.getConnectionPoolMetrics(),
      this.getPerformanceMetrics(),
      this.getDatabaseMetrics(),
      this.getSystemMetrics(),
      this.getBusinessMetrics()
    ]);

    return {
      timestamp,
      connectionPool: connectionPoolMetrics,
      performance: performanceMetrics,
      database: databaseMetrics,
      system: systemMetrics,
      business: businessMetrics
    };
  }

  /**
   * Метрики пула подключений
   */
  private async getConnectionPoolMetrics(): Promise<MonitoringMetrics['connectionPool']> {
    const pool = (this.sequelize as any).connectionManager.pool;
    
    return {
      active: pool.used || 0,
      idle: pool.available || 0,
      waiting: pool.pending || 0,
      total: (pool.used || 0) + (pool.available || 0)
    };
  }

  /**
   * Метрики производительности
   */
  private async getPerformanceMetrics(): Promise<MonitoringMetrics['performance']> {
    try {
      // Получаем статистику запросов из PostgreSQL
      const [results] = await this.sequelize.query(`
        SELECT 
          COALESCE(AVG(mean_exec_time), 0) as avg_query_time,
          COALESCE(SUM(calls), 0) as total_queries,
          COALESCE(COUNT(CASE WHEN mean_exec_time > ${this.config.slowQueryThresholdMs} THEN 1 END), 0) as slow_queries
        FROM pg_stat_statements 
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      `);

      const stats = results[0] as any;
      
      return {
        avgQueryTime: parseFloat(stats.avg_query_time) || 0,
        slowQueries: parseInt(stats.slow_queries) || 0,
        totalQueries: parseInt(stats.total_queries) || 0,
        errorRate: 0 // Будет обновляться из логов ошибок
      };
    } catch (error) {
      // Fallback если pg_stat_statements недоступен
      return {
        avgQueryTime: 0,
        slowQueries: 0,
        totalQueries: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Метрики базы данных
   */
  private async getDatabaseMetrics(): Promise<MonitoringMetrics['database']> {
    try {
      const [sizeResult] = await this.sequelize.query(`
        SELECT pg_database_size(current_database()) as size
      `);

      const [tableResult] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as table_count
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      const [indexResult] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as index_count
        FROM pg_indexes 
        WHERE schemaname = 'public'
      `);

      const [deadlockResult] = await this.sequelize.query(`
        SELECT 
          COALESCE(SUM(deadlocks), 0) as deadlocks
        FROM pg_stat_database 
        WHERE datname = current_database()
      `);

      return {
        size: parseInt((sizeResult[0] as any).size) || 0,
        tableCount: parseInt((tableResult[0] as any).table_count) || 0,
        indexCount: parseInt((indexResult[0] as any).index_count) || 0,
        deadlocks: parseInt((deadlockResult[0] as any).deadlocks) || 0
      };
    } catch (error) {
      console.error('Error collecting database metrics:', error);
      return { size: 0, tableCount: 0, indexCount: 0, deadlocks: 0 };
    }
  }

  /**
   * Системные метрики
   */
  private async getSystemMetrics(): Promise<MonitoringMetrics['system']> {
    try {
      // Получаем системные метрики из PostgreSQL
      const [results] = await this.sequelize.query(`
        SELECT 
          COALESCE(
            (SELECT setting::float FROM pg_settings WHERE name = 'shared_buffers') / 
            (SELECT setting::float FROM pg_settings WHERE name = 'max_connections'), 
            0
          ) as memory_usage_ratio
      `);

      const memoryUsage = ((results[0] as any).memory_usage_ratio || 0) * 100;

      return {
        cpuUsage: 0, // Требует дополнительного мониторинга
        memoryUsage,
        diskUsage: 0, // Требует дополнительного мониторинга
        diskIops: 0 // Требует дополнительного мониторинга
      };
    } catch (error) {
      return { cpuUsage: 0, memoryUsage: 0, diskUsage: 0, diskIops: 0 };
    }
  }

  /**
   * Бизнес-метрики
   */
  private async getBusinessMetrics(): Promise<MonitoringMetrics['business']> {
    try {
      const [mixRequestsResult] = await this.sequelize.query(`
        SELECT COUNT(*) as active_mix_requests
        FROM mix_requests 
        WHERE status IN ('PENDING', 'DEPOSITED', 'POOLING', 'MIXING')
      `);

      const [pendingTxResult] = await this.sequelize.query(`
        SELECT COUNT(*) as pending_transactions
        FROM output_transactions 
        WHERE status = 'PENDING'
      `);

      const [failedTxResult] = await this.sequelize.query(`
        SELECT COUNT(*) as failed_transactions
        FROM output_transactions 
        WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '1 hour'
      `);

      const [poolUtilResult] = await this.sequelize.query(`
        SELECT 
          COALESCE(AVG(current_amount::float / target_amount::float) * 100, 0) as pool_utilization
        FROM transaction_pools 
        WHERE is_active = true
      `);

      return {
        activeMixRequests: parseInt((mixRequestsResult[0] as any).active_mix_requests) || 0,
        pendingTransactions: parseInt((pendingTxResult[0] as any).pending_transactions) || 0,
        failedTransactions: parseInt((failedTxResult[0] as any).failed_transactions) || 0,
        poolUtilization: parseFloat((poolUtilResult[0] as any).pool_utilization) || 0
      };
    } catch (error) {
      console.error('Error collecting business metrics:', error);
      return {
        activeMixRequests: 0,
        pendingTransactions: 0,
        failedTransactions: 0,
        poolUtilization: 0
      };
    }
  }

  /**
   * Добавление метрик в историю
   */
  private addMetrics(metrics: MonitoringMetrics): void {
    this.metricsHistory.push(metrics);
    this.emit('metricsAdded', metrics);
  }

  /**
   * Очистка старых метрик
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - this.config.metricsRetentionHours * 60 * 60 * 1000);
    const originalLength = this.metricsHistory.length;
    
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoffTime);
    
    const cleaned = originalLength - this.metricsHistory.length;
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old metrics records`);
    }
  }

  /**
   * Настройка правил алертов по умолчанию
   */
  private setupDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_connection_usage',
        name: 'High Connection Pool Usage',
        metric: 'connectionPool.active',
        operator: 'gt',
        threshold: 80,
        duration: 5,
        severity: 'high',
        enabled: true,
        notificationChannels: ['console', 'log']
      },
      {
        id: 'slow_queries',
        name: 'High Number of Slow Queries',
        metric: 'performance.slowQueries',
        operator: 'gt',
        threshold: 10,
        duration: 3,
        severity: 'medium',
        enabled: true,
        notificationChannels: ['console', 'log']
      },
      {
        id: 'failed_transactions',
        name: 'High Failed Transaction Rate',
        metric: 'business.failedTransactions',
        operator: 'gt',
        threshold: 5,
        duration: 2,
        severity: 'high',
        enabled: true,
        notificationChannels: ['console', 'log']
      },
      {
        id: 'database_deadlocks',
        name: 'Database Deadlocks Detected',
        metric: 'database.deadlocks',
        operator: 'gt',
        threshold: 0,
        duration: 1,
        severity: 'critical',
        enabled: true,
        notificationChannels: ['console', 'log']
      },
      {
        id: 'low_pool_utilization',
        name: 'Low Pool Utilization',
        metric: 'business.poolUtilization',
        operator: 'lt',
        threshold: 20,
        duration: 10,
        severity: 'low',
        enabled: true,
        notificationChannels: ['log']
      }
    ];

    defaultRules.forEach(rule => {
      this.addAlertRule(rule);
    });
  }

  /**
   * Добавление правила алерта
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    console.log(`📋 Added alert rule: ${rule.name}`);
  }

  /**
   * Удаление правила алерта
   */
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      console.log(`🗑️ Removed alert rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Проверка алертов
   */
  private checkAlerts(): void {
    if (this.metricsHistory.length === 0) return;

    const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];

    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;

      const currentValue = this.getMetricValue(latestMetrics, rule.metric);
      const shouldAlert = this.evaluateCondition(currentValue, rule.operator, rule.threshold);

      if (shouldAlert) {
        this.handleAlert(rule, currentValue);
      } else {
        this.resolveAlert(ruleId);
      }
    }
  }

  /**
   * Получение значения метрики по пути
   */
  private getMetricValue(metrics: MonitoringMetrics, metricPath: string): number {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return typeof value === 'number' ? value : 0;
  }

  /**
   * Оценка условия алерта
   */
  private evaluateCondition(value: number, operator: AlertRule['operator'], threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  /**
   * Обработка алерта
   */
  private handleAlert(rule: AlertRule, currentValue: number): void {
    const existingAlert = this.activeAlerts.get(rule.id);
    
    if (existingAlert && !existingAlert.resolved) {
      // Алерт уже активен
      return;
    }

    const alert: Alert = {
      id: `${rule.id}_${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      severity: rule.severity,
      message: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
      timestamp: new Date(),
      resolved: false
    };

    this.activeAlerts.set(rule.id, alert);
    this.sendNotification(alert, rule.notificationChannels);
    this.emit('alert', alert);

    console.log(`🚨 ALERT [${rule.severity.toUpperCase()}]: ${alert.message}`);
  }

  /**
   * Разрешение алерта
   */
  private resolveAlert(ruleId: string): void {
    const alert = this.activeAlerts.get(ruleId);
    
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      this.emit('alertResolved', alert);
      console.log(`✅ RESOLVED: ${alert.message}`);
    }
  }

  /**
   * Отправка уведомления
   */
  private sendNotification(alert: Alert, channels: string[]): void {
    for (const channel of channels) {
      switch (channel) {
        case 'console':
          console.log(`🚨 ${alert.severity.toUpperCase()}: ${alert.message}`);
          break;
        case 'log':
          // Логирование в файл (требует настройки winston logger)
          break;
        case 'email':
          // Отправка email (требует настройки SMTP)
          break;
        case 'webhook':
          // Отправка webhook (требует настройки URL)
          break;
        case 'slack':
          // Отправка в Slack (требует настройки Slack API)
          break;
      }
    }
  }

  /**
   * Получение текущих метрик
   */
  getCurrentMetrics(): MonitoringMetrics | null {
    return this.metricsHistory.length > 0 ? 
      this.metricsHistory[this.metricsHistory.length - 1] : null;
  }

  /**
   * Получение истории метрик
   */
  getMetricsHistory(hours: number = 1): MonitoringMetrics[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(m => m.timestamp > cutoffTime);
  }

  /**
   * Получение активных алертов
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Получение статистики алертов
   */
  getAlertStatistics(): {
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<string, number>;
  } {
    const alerts = Array.from(this.activeAlerts.values());
    const active = alerts.filter(a => !a.resolved);
    const resolved = alerts.filter(a => a.resolved);
    
    const bySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: alerts.length,
      active: active.length,
      resolved: resolved.length,
      bySeverity
    };
  }

  /**
   * Получение отчета о состоянии
   */
  getHealthReport(): {
    status: 'healthy' | 'warning' | 'critical';
    metrics: MonitoringMetrics | null;
    activeAlerts: Alert[];
    summary: string;
  } {
    const currentMetrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (activeAlerts.some(a => a.severity === 'critical')) {
      status = 'critical';
    } else if (activeAlerts.some(a => ['high', 'medium'].includes(a.severity))) {
      status = 'warning';
    }

    const summary = `Database health: ${status}. ${activeAlerts.length} active alerts.`;

    return {
      status,
      metrics: currentMetrics,
      activeAlerts,
      summary
    };
  }
}

export default DatabaseMonitoring;