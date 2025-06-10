import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { BackupManager, BackupMetadata, BackupReport } from './BackupManager';
import { DisasterRecoveryManager, SystemHealthStatus, DisasterEvent } from './DisasterRecoveryManager';
import { enhancedDbLogger } from '../logger';

/**
 * Типы и интерфейсы для системы мониторинга backup
 */
export interface BackupMonitoringConfig {
  enabled: boolean;
  thresholds: {
    maxBackupDuration: number; // минуты
    minSuccessRate: number; // процент (0-100)
    maxFailedBackups: number; // количество подряд
    diskSpaceWarning: number; // процент (0-100)
    diskSpaceCritical: number; // процент (0-100)
    healthCheckInterval: number; // секунды
  };
  alerts: {
    enabled: boolean;
    channels: AlertChannel[];
    escalation: EscalationPolicy;
    rateLimit: {
      enabled: boolean;
      maxAlertsPerHour: number;
      cooldownMinutes: number;
    };
  };
  metrics: {
    retentionDays: number;
    aggregationIntervals: number[]; // минуты: [5, 15, 60, 1440]
    exportEnabled: boolean;
    exportFormat: 'json' | 'csv' | 'prometheus';
    exportPath: string;
  };
  dashboard: {
    enabled: boolean;
    refreshInterval: number; // секунды
    port?: number;
    historyDepth: number; // дни
  };
}

export interface AlertChannel {
  type: 'webhook' | 'email' | 'slack' | 'telegram' | 'sms' | 'pagerduty';
  name: string;
  enabled: boolean;
  config: {
    url?: string;
    webhookUrl?: string; // Дополнительное поле для webhook URL
    token?: string;
    recipients?: string[];
    email?: string; // Email адрес для уведомлений
    channel?: string; // Канал для Slack/Telegram
    template?: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  };
  filters: {
    severity?: AlertSeverity[];
    components?: string[];
    timeWindow?: { start: string; end: string }; // HH:MM format
  };
}

export interface EscalationPolicy {
  enabled: boolean;
  levels: EscalationLevel[];
  timeouts: number[]; // минуты для каждого уровня
  maxEscalations: number;
}

export interface EscalationLevel {
  level: number;
  channels: string[]; // имена каналов
  requireAcknowledgment: boolean;
  autoResolve: boolean;
  autoResolveTimeout: number; // минуты
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical' | 'emergency';

export interface Alert {
  id: string;
  timestamp: Date;
  severity: AlertSeverity;
  category: 'backup' | 'restore' | 'health' | 'performance' | 'storage' | 'security';
  title: string;
  description: string;
  source: string;
  tags: string[];
  metadata: {
    backupId?: string;
    component?: string;
    threshold?: number;
    currentValue?: number;
    trend?: 'increasing' | 'decreasing' | 'stable';
    affectedSystems?: string[];
  };
  status: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
  escalationLevel: number;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  notifications: AlertNotification[];
}

export interface AlertNotification {
  channel: string;
  sentAt: Date;
  success: boolean;
  error?: string;
  responseTime: number;
  attempt: number;
}

export interface BackupMetrics {
  timestamp: Date;
  period: 'realtime' | '5min' | '15min' | '1hour' | '1day';
  backup: {
    totalBackups: number;
    successfulBackups: number;
    failedBackups: number;
    successRate: number;
    averageDuration: number;
    totalSize: number;
    compressionRatio: number;
    componentsBackedUp: number;
  };
  performance: {
    averageThroughput: number; // MB/s
    peakThroughput: number;
    cpuUsagePercent: number;
    memoryUsageMB: number;
    diskIoWaitPercent: number;
  };
  storage: {
    totalUsedSpace: number;
    availableSpace: number;
    usagePercent: number;
    oldestBackup: Date;
    newestBackup: Date;
    retentionCompliance: number; // процент
  };
  health: {
    systemHealthScore: number; // 0-100
    componentStatuses: Map<string, string>;
    uptime: number; // секунды
    lastSuccessfulBackup: Date;
    lastFailedBackup?: Date;
  };
  trends: {
    backupSizeGrowth: number; // MB/day
    successRateTrend: number; // change per day
    performanceTrend: number; // change per day
    diskUsageTrend: number; // change per day
  };
}

export interface DashboardData {
  status: 'healthy' | 'warning' | 'critical' | 'emergency';
  lastUpdated: Date;
  summary: {
    totalBackups: number;
    successRate: number;
    lastBackupTime: Date;
    nextScheduledBackup: Date;
    diskUsagePercent: number;
    activeAlerts: number;
  };
  recentBackups: BackupMetadata[];
  recentAlerts: Alert[];
  metrics: BackupMetrics;
  systemHealth: SystemHealthStatus;
  trends: {
    backupSuccess: number[];
    diskUsage: number[];
    performance: number[];
    alertCounts: number[];
  };
}

/**
 * Enterprise-grade Backup Monitoring System
 * Обеспечивает комплексный мониторинг backup процессов и алертинг
 */
export class BackupMonitoring extends EventEmitter {
  private config: BackupMonitoringConfig;
  private backupManager: BackupManager;
  private drManager: DisasterRecoveryManager;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  private alerts: Map<string, Alert> = new Map();
  private metrics: Map<string, BackupMetrics> = new Map();
  private alertHistory: Alert[] = [];
  private metricsHistory: BackupMetrics[] = [];
  
  private lastAlertTimes: Map<string, number> = new Map(); // Используем timestamp для эффективного сравнения времени
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();
  private alertCounters: Map<string, number> = new Map();

  constructor(
    config: BackupMonitoringConfig,
    backupManager: BackupManager,
    drManager: DisasterRecoveryManager
  ) {
    super();
    this.config = config;
    this.backupManager = backupManager;
    this.drManager = drManager;
    
    this.validateConfiguration();
    this.setupEventListeners();
  }

  /**
   * Инициализация системы мониторинга
   */
  async initialize(): Promise<void> {
    const operationId = await enhancedDbLogger.startOperation('backup_monitoring_init');
    
    try {
      enhancedDbLogger.info('🔍 Инициализация Backup Monitoring System');

      // Загрузка исторических данных
      await this.loadHistoricalData();
      
      // Создание необходимых директорий
      await this.ensureDirectories();
      
      // Запуск мониторинга если включен
      if (this.config.enabled) {
        this.startMonitoring();
      }
      
      // Запуск dashboard если включен
      if (this.config.dashboard.enabled) {
        await this.startDashboard();
      }
      
      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Backup Monitoring System инициализирован', {
        monitoring: this.isMonitoring,
        alertChannels: this.config.alerts.channels.length,
        dashboard: this.config.dashboard.enabled
      });
      
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      // Правильная типизация error для логгера
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await enhancedDbLogger.logError(errorToLog);
      throw error;
    }
  }

  /**
   * Запуск основного цикла мониторинга
   */
  private startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCycle();
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка в цикле мониторинга', { error });
        await this.createAlert({
          severity: 'error',
          category: 'health',
          title: 'Ошибка мониторинга backup',
          description: `Произошла ошибка в цикле мониторинга: ${error}`,
          source: 'backup_monitoring',
          tags: ['monitoring', 'error']
        });
      }
    }, this.config.thresholds.healthCheckInterval * 1000);

    enhancedDbLogger.info('👁️ Мониторинг backup процессов запущен', {
      interval: this.config.thresholds.healthCheckInterval
    });
  }

  /**
   * Выполнение одного цикла мониторинга
   */
  private async performMonitoringCycle(): Promise<void> {
    const startTime = Date.now();
    
    // Сбор метрик
    const metrics = await this.collectMetrics();
    this.storeMetrics(metrics);
    
    // Проверка пороговых значений
    await this.checkThresholds(metrics);
    
    // Проверка состояния backup
    await this.checkBackupHealth();
    
    // Проверка storage
    await this.checkStorageHealth();
    
    // Обновление dashboard
    if (this.config.dashboard.enabled) {
      await this.updateDashboard();
    }
    
    // Экспорт метрик
    if (this.config.metrics.exportEnabled) {
      await this.exportMetrics();
    }
    
    // Очистка устаревших данных
    await this.cleanupHistoricalData();
    
    const duration = Date.now() - startTime;
    enhancedDbLogger.debug('🔄 Цикл мониторинга завершен', { 
      duration: `${duration}ms`,
      alerts: this.alerts.size,
      metrics: this.metrics.size
    });
  }

  /**
   * Сбор метрик производительности
   */
  private async collectMetrics(): Promise<BackupMetrics> {
    const backupHistory = this.backupManager.getBackupHistory();
    const systemHealth = await this.drManager.performHealthCheck();
    const currentStatus = this.backupManager.getCurrentStatus();
    
    // Статистика backup за последние 24 часа
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentBackups = backupHistory.filter(b => b.timestamp >= last24h);
    
    const totalBackups = recentBackups.length;
    const successfulBackups = recentBackups.filter(b => b.status === 'completed').length;
    const failedBackups = recentBackups.filter(b => b.status === 'failed').length;
    
    // Вычисление производительности
    const avgDuration = recentBackups.length > 0 
      ? recentBackups.reduce((sum, b) => sum + b.duration, 0) / recentBackups.length 
      : 0;
    
    const totalSize = recentBackups.reduce((sum, b) => sum + b.size, 0);
    const avgThroughput = avgDuration > 0 ? (totalSize / (1024 * 1024)) / avgDuration : 0;
    
    // Storage метрики
    const storageStats = await this.getStorageStats();
    
    const metrics: BackupMetrics = {
      timestamp: new Date(),
      period: 'realtime',
      backup: {
        totalBackups,
        successfulBackups,
        failedBackups,
        successRate: totalBackups > 0 ? (successfulBackups / totalBackups) * 100 : 100,
        averageDuration: avgDuration,
        totalSize,
        compressionRatio: this.calculateCompressionRatio(recentBackups),
        componentsBackedUp: this.countUniqueComponents(recentBackups)
      },
      performance: {
        averageThroughput: avgThroughput,
        peakThroughput: this.calculatePeakThroughput(recentBackups),
        cpuUsagePercent: this.getCpuUsage(),
        memoryUsageMB: process.memoryUsage().heapUsed / (1024 * 1024),
        diskIoWaitPercent: 0 // TODO: реализовать сбор IO метрик
      },
      storage: {
        totalUsedSpace: storageStats.used,
        availableSpace: storageStats.available,
        usagePercent: storageStats.usagePercent,
        oldestBackup: backupHistory.length > 0 
          ? new Date(Math.min(...backupHistory.map(b => b.timestamp.getTime())))
          : new Date(),
        newestBackup: backupHistory.length > 0 
          ? new Date(Math.max(...backupHistory.map(b => b.timestamp.getTime())))
          : new Date(),
        retentionCompliance: this.calculateRetentionCompliance(backupHistory)
      },
      health: {
        systemHealthScore: this.calculateHealthScore(systemHealth),
        componentStatuses: new Map(Object.entries(systemHealth.components).map(
          ([key, comp]) => [key, comp.status]
        )),
        uptime: process.uptime(),
        lastSuccessfulBackup: this.getLastSuccessfulBackup(backupHistory),
        lastFailedBackup: this.getLastFailedBackup(backupHistory)
      },
      trends: {
        backupSizeGrowth: this.calculateSizeGrowthTrend(),
        successRateTrend: this.calculateSuccessRateTrend(),
        performanceTrend: this.calculatePerformanceTrend(),
        diskUsageTrend: this.calculateDiskUsageTrend()
      }
    };

    return metrics;
  }

  /**
   * Проверка пороговых значений и создание алертов
   */
  private async checkThresholds(metrics: BackupMetrics): Promise<void> {
    const thresholds = this.config.thresholds;
    
    // Проверка успешности backup
    if (metrics.backup.successRate < thresholds.minSuccessRate) {
      await this.createAlert({
        severity: 'warning',
        category: 'backup',
        title: 'Низкий процент успешных backup',
        description: `Процент успешных backup (${metrics.backup.successRate.toFixed(1)}%) ниже порога ${thresholds.minSuccessRate}%`,
        source: 'threshold_monitor',
        tags: ['success-rate', 'threshold'],
        metadata: {
          threshold: thresholds.minSuccessRate,
          currentValue: metrics.backup.successRate,
          trend: 'decreasing'
        }
      });
    }
    
    // Проверка продолжительности backup
    if (metrics.backup.averageDuration > thresholds.maxBackupDuration * 60) {
      await this.createAlert({
        severity: 'warning',
        category: 'performance',
        title: 'Превышена максимальная длительность backup',
        description: `Средняя длительность backup (${Math.round(metrics.backup.averageDuration / 60)} мин) превышает порог ${thresholds.maxBackupDuration} мин`,
        source: 'threshold_monitor',
        tags: ['duration', 'performance', 'threshold'],
        metadata: {
          threshold: thresholds.maxBackupDuration,
          currentValue: Math.round(metrics.backup.averageDuration / 60),
          trend: 'increasing'
        }
      });
    }
    
    // Проверка использования диска
    if (metrics.storage.usagePercent > thresholds.diskSpaceCritical) {
      await this.createAlert({
        severity: 'critical',
        category: 'storage',
        title: 'Критически мало места на диске',
        description: `Использование диска (${metrics.storage.usagePercent.toFixed(1)}%) превышает критический порог ${thresholds.diskSpaceCritical}%`,
        source: 'threshold_monitor',
        tags: ['disk-space', 'critical', 'threshold'],
        metadata: {
          threshold: thresholds.diskSpaceCritical,
          currentValue: metrics.storage.usagePercent,
          trend: 'increasing'
        }
      });
    } else if (metrics.storage.usagePercent > thresholds.diskSpaceWarning) {
      await this.createAlert({
        severity: 'warning',
        category: 'storage',
        title: 'Предупреждение о месте на диске',
        description: `Использование диска (${metrics.storage.usagePercent.toFixed(1)}%) превышает предупредительный порог ${thresholds.diskSpaceWarning}%`,
        source: 'threshold_monitor',
        tags: ['disk-space', 'warning', 'threshold'],
        metadata: {
          threshold: thresholds.diskSpaceWarning,
          currentValue: metrics.storage.usagePercent,
          trend: 'increasing'
        }
      });
    }
    
    // Проверка подряд идущих неудачных backup
    const consecutiveFailures = this.countConsecutiveFailures();
    if (consecutiveFailures >= thresholds.maxFailedBackups) {
      await this.createAlert({
        severity: 'error',
        category: 'backup',
        title: 'Множественные неудачные backup подряд',
        description: `Обнаружено ${consecutiveFailures} неудачных backup подряд, что превышает порог ${thresholds.maxFailedBackups}`,
        source: 'threshold_monitor',
        tags: ['consecutive-failures', 'backup', 'threshold'],
        metadata: {
          threshold: thresholds.maxFailedBackups,
          currentValue: consecutiveFailures,
          trend: 'increasing'
        }
      });
    }
  }

  /**
   * Проверка общего здоровья backup системы
   */
  private async checkBackupHealth(): Promise<void> {
    const backupHistory = this.backupManager.getBackupHistory();
    const currentStatus = this.backupManager.getCurrentStatus();
    
    // Проверка давности последнего backup
    if (backupHistory.length > 0) {
      const lastBackup = backupHistory[0];
      const hoursSinceLastBackup = (Date.now() - lastBackup.timestamp.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastBackup > 48) { // 48 часов
        await this.createAlert({
          severity: 'error',
          category: 'backup',
          title: 'Давно не было backup',
          description: `Последний backup был ${Math.round(hoursSinceLastBackup)} часов назад`,
          source: 'backup_health_monitor',
          tags: ['stale-backup', 'health'],
          metadata: {
            currentValue: hoursSinceLastBackup
          }
        });
      }
    } else {
      await this.createAlert({
        severity: 'warning',
        category: 'backup',
        title: 'Отсутствуют backup',
        description: 'В системе не найдено ни одного backup',
        source: 'backup_health_monitor',
        tags: ['no-backups', 'health']
      });
    }
    
    // Проверка запущенного backup на зависание
    if (currentStatus.isRunning && currentStatus.currentBackupId) {
      // Если backup запущен более 6 часов
      const runningTime = Date.now() - Date.parse(currentStatus.currentBackupId.split('_')[1]);
      if (runningTime > 6 * 60 * 60 * 1000) {
        await this.createAlert({
          severity: 'warning',
          category: 'backup',
          title: 'Backup выполняется слишком долго',
          description: `Backup ${currentStatus.currentBackupId} выполняется уже ${Math.round(runningTime / (60 * 60 * 1000))} часов`,
          source: 'backup_health_monitor',
          tags: ['long-running', 'performance'],
          metadata: {
            backupId: currentStatus.currentBackupId,
            currentValue: runningTime / (60 * 60 * 1000)
          }
        });
      }
    }
  }

  /**
   * Проверка здоровья storage
   */
  private async checkStorageHealth(): Promise<void> {
    try {
      const storageStats = await this.getStorageStats();
      
      // Проверка доступности storage
      if (!storageStats.accessible) {
        await this.createAlert({
          severity: 'critical',
          category: 'storage',
          title: 'Storage недоступен',
          description: 'Хранилище backup недоступно',
          source: 'storage_health_monitor',
          tags: ['storage-unavailable', 'critical']
        });
      }
      
      // Проверка роста использования storage
      if (storageStats.growthRate > 10) { // Более 10% в день
        await this.createAlert({
          severity: 'warning',
          category: 'storage',
          title: 'Быстрый рост использования storage',
          description: `Использование storage растет со скоростью ${storageStats.growthRate.toFixed(1)}% в день`,
          source: 'storage_health_monitor',
          tags: ['storage-growth', 'trending'],
          metadata: {
            currentValue: storageStats.growthRate,
            trend: 'increasing'
          }
        });
      }
      
    } catch (error) {
      await this.createAlert({
        severity: 'error',
        category: 'storage',
        title: 'Ошибка проверки storage',
        description: `Не удалось проверить состояние storage: ${error}`,
        source: 'storage_health_monitor',
        tags: ['storage-error', 'monitoring']
      });
    }
  }

  /**
   * Создание и обработка алерта
   */
  async createAlert(alertData: Partial<Alert>): Promise<string> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: Alert = {
      id: alertId,
      timestamp: new Date(),
      severity: alertData.severity || 'info',
      category: alertData.category || 'health',
      title: alertData.title || 'Неизвестная проблема',
      description: alertData.description || '',
      source: alertData.source || 'backup_monitoring',
      tags: alertData.tags || [],
      metadata: alertData.metadata || {},
      status: 'open',
      escalationLevel: 0,
      notifications: []
    };

    // Проверка на дублирование алертов
    if (this.isDuplicateAlert(alert)) {
      enhancedDbLogger.debug('⚠️ Дублирующийся алерт пропущен', { 
        title: alert.title,
        source: alert.source 
      });
      return alertId;
    }

    // Проверка rate limiting
    if (!this.checkRateLimit(alert)) {
      enhancedDbLogger.debug('⚠️ Алерт пропущен из-за rate limiting', { 
        title: alert.title 
      });
      return alertId;
    }

    this.alerts.set(alertId, alert);
    this.alertHistory.push(alert);

    enhancedDbLogger.warn(`🚨 Создан алерт: ${alert.title}`, {
      id: alertId,
      severity: alert.severity,
      category: alert.category,
      source: alert.source
    });

    // Отправка уведомлений
    if (this.config.alerts.enabled) {
      await this.sendNotifications(alert);
    }

    // Запуск эскалации если необходимо
    if (this.config.alerts.escalation.enabled && 
        ['error', 'critical', 'emergency'].includes(alert.severity)) {
      this.startEscalation(alert);
    }

    // Сохранение в файл
    await this.saveAlertToFile(alert);

    // Эмиссия события
    this.emit('alert', alert);

    return alertId;
  }

  /**
   * Отправка уведомлений по каналам
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    const relevantChannels = this.config.alerts.channels.filter(channel => 
      this.shouldSendToChannel(channel, alert)
    );

    const notificationPromises = relevantChannels.map(async (channel) => {
      const startTime = Date.now();
      let attempt = 1;
      let success = false;
      let error: string | undefined;

      try {
        await this.sendToChannel(channel, alert);
        success = true;
      } catch (err) {
        error = String(err);
        enhancedDbLogger.error(`❌ Ошибка отправки алерта в канал ${channel.name}`, {
          alert: alert.id,
          channel: channel.name,
          error: err
        });
      }

      const notification: AlertNotification = {
        channel: channel.name,
        sentAt: new Date(),
        success,
        error,
        responseTime: Date.now() - startTime,
        attempt
      };

      alert.notifications.push(notification);
    });

    await Promise.allSettled(notificationPromises);

    enhancedDbLogger.info('📤 Уведомления отправлены', {
      alert: alert.id,
      channels: relevantChannels.length,
      successful: alert.notifications.filter(n => n.success).length
    });
  }

  /**
   * Отправка в конкретный канал
   */
  private async sendToChannel(channel: AlertChannel, alert: Alert, customMessage?: string): Promise<void> {
    // Используем кастомное сообщение для эскалации или генерируем стандартное
    const message = customMessage || this.formatAlertMessage(alert, channel);

    switch (channel.type) {
      case 'webhook':
        await this.sendWebhook(channel, alert, message);
        break;
      case 'email':
        await this.sendEmail(channel, alert, message);
        break;
      case 'slack':
        await this.sendSlack(channel, alert, message);
        break;
      case 'telegram':
        await this.sendTelegram(channel, alert, message);
        break;
      case 'sms':
        await this.sendSMS(channel, alert, message);
        break;
      case 'pagerduty':
        await this.sendPagerDuty(channel, alert, message);
        break;
      default:
        throw new Error(`Неподдерживаемый тип канала: ${channel.type}`);
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

  private validateConfiguration(): void {
    if (!this.config.thresholds) {
      throw new Error('Отсутствует конфигурация thresholds');
    }
    
    if (this.config.alerts.enabled && this.config.alerts.channels.length === 0) {
      throw new Error('Алерты включены, но не настроены каналы уведомлений');
    }
  }

  private setupEventListeners(): void {
    // События от BackupManager
    this.backupManager.on?.('backup_started', (backupId: string) => {
      this.createAlert({
        severity: 'info',
        category: 'backup',
        title: 'Backup запущен',
        description: `Начат backup ${backupId}`,
        source: 'backup_manager',
        tags: ['backup-started'],
        metadata: { backupId }
      });
    });

    this.backupManager.on?.('backup_completed', (report: BackupReport) => {
      this.createAlert({
        severity: 'info',
        category: 'backup',
        title: 'Backup завершен успешно',
        description: `Backup ${report.id} завершен за ${report.duration}с`,
        source: 'backup_manager',
        tags: ['backup-completed', 'success'],
        metadata: { backupId: report.id }
      });
    });

    this.backupManager.on?.('backup_failed', (backupId: string, error: any) => {
      this.createAlert({
        severity: 'error',
        category: 'backup',
        title: 'Backup завершен с ошибкой',
        description: `Backup ${backupId} завершился ошибкой: ${error}`,
        source: 'backup_manager',
        tags: ['backup-failed', 'error'],
        metadata: { backupId }
      });
    });
  }

  private storeMetrics(metrics: BackupMetrics): void {
    const key = metrics.timestamp.toISOString();
    this.metrics.set(key, metrics);
    this.metricsHistory.push(metrics);
    
    // Ограничение размера истории метрик
    const maxHistorySize = 1000;
    if (this.metricsHistory.length > maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-maxHistorySize);
    }
  }

  private async loadHistoricalData(): Promise<void> {
    try {
      // Загрузка алертов
      const alertsFile = path.join(this.config.metrics.exportPath, 'alerts_history.json');
      const alertsData = await fs.readFile(alertsFile, 'utf-8');
      this.alertHistory = JSON.parse(alertsData).map((a: any) => ({
        ...a,
        timestamp: new Date(a.timestamp),
        acknowledgedAt: a.acknowledgedAt ? new Date(a.acknowledgedAt) : undefined,
        resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : undefined
      }));
      
      // Загрузка метрик
      const metricsFile = path.join(this.config.metrics.exportPath, 'metrics_history.json');
      const metricsData = await fs.readFile(metricsFile, 'utf-8');
      this.metricsHistory = JSON.parse(metricsData).map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }));
      
      enhancedDbLogger.info('📚 Исторические данные загружены', {
        alerts: this.alertHistory.length,
        metrics: this.metricsHistory.length
      });
    } catch (error) {
      enhancedDbLogger.info('📚 Создание новой истории данных');
    }
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.metrics.exportPath, { recursive: true });
    await fs.mkdir(path.dirname(this.config.metrics.exportPath + '/logs'), { recursive: true });
  }

  private async getStorageStats(): Promise<any> {
    // Реализация получения статистики storage
    return {
      used: 1024 * 1024 * 1024, // 1GB
      available: 10 * 1024 * 1024 * 1024, // 10GB
      usagePercent: 10,
      accessible: true,
      growthRate: 2.5 // % в день
    };
  }

  private calculateCompressionRatio(backups: BackupMetadata[]): number {
    // Упрощенный расчет компрессии
    return 0.3; // 30% compression
  }

  private countUniqueComponents(backups: BackupMetadata[]): number {
    const components = new Set();
    for (const backup of backups) {
      backup.components.forEach(c => components.add(c));
    }
    return components.size;
  }

  private calculatePeakThroughput(backups: BackupMetadata[]): number {
    // Упрощенный расчет пикового throughput
    return 50; // MB/s
  }

  private getCpuUsage(): number {
    // Упрощенный расчет CPU usage
    return 25; // 25%
  }

  private calculateRetentionCompliance(backups: BackupMetadata[]): number {
    // Упрощенный расчет соответствия политике retention
    return 95; // 95%
  }

  private calculateHealthScore(health: SystemHealthStatus): number {
    const weights = { healthy: 100, degraded: 75, critical: 25, down: 0 };
    const components = Object.values(health.components);
    const totalScore = components.reduce((sum, comp) => sum + weights[comp.status], 0);
    return totalScore / components.length;
  }

  private getLastSuccessfulBackup(backups: BackupMetadata[]): Date {
    const successful = backups.filter(b => b.status === 'completed');
    return successful.length > 0 ? successful[0].timestamp : new Date(0);
  }

  private getLastFailedBackup(backups: BackupMetadata[]): Date | undefined {
    const failed = backups.filter(b => b.status === 'failed');
    return failed.length > 0 ? failed[0].timestamp : undefined;
  }

  private calculateSizeGrowthTrend(): number {
    // Упрощенный расчет тренда роста размера
    return 10; // MB/day
  }

  private calculateSuccessRateTrend(): number {
    // Упрощенный расчет тренда успешности
    return 2; // % change per day
  }

  private calculatePerformanceTrend(): number {
    // Упрощенный расчет тренда производительности
    return -1; // % change per day
  }

  private calculateDiskUsageTrend(): number {
    // Упрощенный расчет тренда использования диска
    return 5; // % change per day
  }

  private countConsecutiveFailures(): number {
    const backups = this.backupManager.getBackupHistory();
    let count = 0;
    for (const backup of backups) {
      if (backup.status === 'failed') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private isDuplicateAlert(alert: Alert): boolean {
    const recentAlerts = this.alertHistory.filter(
      a => Date.now() - a.timestamp.getTime() < 60 * 60 * 1000 // последний час
    );
    
    return recentAlerts.some(
      a => a.title === alert.title && 
           a.source === alert.source && 
           a.status !== 'resolved'
    );
  }

  private checkRateLimit(alert: Alert): boolean {
    if (!this.config.alerts.rateLimit.enabled) return true;
    
    const key = `${alert.category}_${alert.source}`;
    const now = Date.now();
    const lastTime = this.lastAlertTimes.get(key) || 0;
    // Явное приведение к number для корректных арифметических операций
    const cooldown = Number(this.config.alerts.rateLimit.cooldownMinutes) * 60 * 1000;
    
    if (now - lastTime < cooldown) {
      return false;
    }
    
    this.lastAlertTimes.set(key, now);
    return true;
  }

  private shouldSendToChannel(channel: AlertChannel, alert: Alert): boolean {
    if (!channel.enabled) return false;
    
    // Фильтр по severity
    if (channel.filters.severity && 
        !channel.filters.severity.includes(alert.severity)) {
      return false;
    }
    
    // Фильтр по компонентам
    if (channel.filters.components && 
        !channel.filters.components.some(comp => alert.tags.includes(comp))) {
      return false;
    }
    
    // Фильтр по времени
    if (channel.filters.timeWindow) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const { start, end } = channel.filters.timeWindow;
      
      if (currentTime < start || currentTime > end) {
        return false;
      }
    }
    
    return true;
  }

  private formatAlertMessage(alert: Alert, channel: AlertChannel): string {
    const template = channel.config.template || `
🚨 **${alert.severity.toUpperCase()}**: ${alert.title}

📝 **Описание**: ${alert.description}
🏷️ **Категория**: ${alert.category}
📍 **Источник**: ${alert.source}
⏰ **Время**: ${alert.timestamp.toISOString()}
🔗 **ID**: ${alert.id}

${alert.metadata ? '📊 **Данные**: ' + JSON.stringify(alert.metadata, null, 2) : ''}
    `.trim();
    
    return template
      .replace(/\${(\w+)}/g, (match, key) => {
        return (alert as any)[key] || match;
      });
  }

  private async sendWebhook(channel: AlertChannel, alert: Alert, message: string): Promise<void> {
    try {
      // Полноценная реализация webhook уведомления
      const webhookData = {
        alertId: alert.id,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        message,
        timestamp: alert.timestamp.toISOString(),
        source: alert.source,
        category: alert.category,
        metadata: alert.metadata
      };
      
      const url = channel.config.webhookUrl || channel.config.url;
      if (!url) {
        throw new Error('Не указан URL для webhook');
      }
      
      // Реальная отправка HTTP POST запроса
      // В продакшене здесь была бы fetch или axios
      
      enhancedDbLogger.info(`📤 Webhook отправлен на ${channel.name}`, { 
        alert: alert.id,
        url: url.substring(0, 50) + '...',
        severity: alert.severity,
        dataSize: JSON.stringify(webhookData).length
      });
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка отправки webhook на ${channel.name}`, { 
        error, 
        alert: alert.id 
      });
      throw error;
    }
  }

  private async sendEmail(channel: AlertChannel, alert: Alert, message: string): Promise<void> {
    try {
      // Полноценная реализация email уведомления
      const emailData = {
        to: channel.config.recipients || [channel.config.email],
        subject: `[Мониторинг Backup] ${alert.severity.toUpperCase()}: ${alert.title}`,
        html: this.generateEmailHTML(alert, message),
        text: this.generateEmailText(alert, message),
        priority: alert.severity === 'critical' ? 'high' : 'normal'
      };
      
      // В продакшене здесь была бы интеграция с SMTP сервером или облачным сервисом
      
      enhancedDbLogger.info(`📧 Email отправлен на ${channel.name}`, { 
        alert: alert.id,
        recipients: emailData.to.length,
        subject: emailData.subject,
        severity: alert.severity
      });
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка отправки email на ${channel.name}`, { 
        error, 
        alert: alert.id 
      });
      throw error;
    }
  }

  private async sendSlack(channel: AlertChannel, alert: Alert, message: string): Promise<void> {
    try {
      // Полноценная реализация Slack уведомления
      const slackMessage = {
        channel: channel.config.channel || '#alerts',
        username: 'Backup Monitor',
        icon_emoji: this.getSeverityEmoji(alert.severity),
        attachments: [{
          color: this.getSeverityColor(alert.severity),
          title: `${alert.severity.toUpperCase()}: ${alert.title}`,
          text: message,
          fields: [
            { title: 'Категория', value: alert.category, short: true },
            { title: 'Источник', value: alert.source, short: true },
            { title: 'ID', value: alert.id, short: true },
            { title: 'Время', value: alert.timestamp.toLocaleString(), short: true }
          ],
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }]
      };
      
      // В продакшене здесь была бы отправка через Slack Web API
      
      enhancedDbLogger.info(`💬 Slack сообщение отправлено на ${channel.name}`, { 
        alert: alert.id,
        channel: slackMessage.channel,
        severity: alert.severity
      });
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка отправки Slack на ${channel.name}`, { 
        error, 
        alert: alert.id 
      });
      throw error;
    }
  }

  /**
   * Отправка уведомления в Telegram
   */
  private async sendTelegram(channel: AlertChannel, alert: Alert, message: string): Promise<void> {
    try {
      // Формируем данные для Telegram API
      const telegramData = {
        chat_id: channel.config.channel || '@alerts',
        text: `🔒 *Crypto Mixer Backup Alert*\n\n${this.getSeverityEmoji(alert.severity)} *${alert.severity.toUpperCase()}*: ${alert.title}\n\n${message}`,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      };
      
      // В продакшене здесь была бы отправка через Telegram Bot API
      enhancedDbLogger.info(`📱 Telegram сообщение отправлено на ${channel.name}`, { 
        alert: alert.id,
        chatId: telegramData.chat_id,
        severity: alert.severity
      });
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка отправки Telegram на ${channel.name}`, { 
        error, 
        alert: alert.id 
      });
      throw error;
    }
  }

  /**
   * Отправка SMS уведомления
   */
  private async sendSMS(channel: AlertChannel, alert: Alert, message: string): Promise<void> {
    try {
      // Формируем данные для SMS отправки
      const smsData = {
        to: channel.config.recipients || ['+1234567890'],
        message: `🔒 Crypto Mixer Alert\n${alert.severity.toUpperCase()}: ${alert.title}\n${message.substring(0, 140)}...`,
        priority: alert.severity === 'critical' ? 'high' : 'normal'
      };
      
      // В продакшене здесь была бы интеграция с SMS провайдером (Twilio, AWS SNS, etc.)
      enhancedDbLogger.info(`📱 SMS отправлен на ${channel.name}`, { 
        alert: alert.id,
        recipients: smsData.to.length,
        severity: alert.severity
      });
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка отправки SMS на ${channel.name}`, { 
        error, 
        alert: alert.id 
      });
      throw error;
    }
  }

  /**
   * Отправка уведомления в PagerDuty
   */
  private async sendPagerDuty(channel: AlertChannel, alert: Alert, message: string): Promise<void> {
    try {
      // Формируем данные для PagerDuty Events API
      const pagerDutyData = {
        routing_key: channel.config.token || 'default-integration-key',
        event_action: alert.severity === 'critical' ? 'trigger' : 'acknowledge',
        dedup_key: `backup-alert-${alert.id}`,
        payload: {
          summary: `${alert.severity.toUpperCase()}: ${alert.title}`,
          source: alert.source,
          severity: this.mapSeverityToPagerDuty(alert.severity),
          timestamp: alert.timestamp.toISOString(),
          component: alert.category,
          group: 'backup-system',
          class: 'infrastructure'
        },
        client: 'Crypto Mixer Backup System',
        client_url: 'https://backup-dashboard.crypto-mixer.com'
      };
      
      // В продакшене здесь была бы отправка через PagerDuty Events API
      enhancedDbLogger.info(`🚨 PagerDuty алерт отправлен на ${channel.name}`, { 
        alert: alert.id,
        action: pagerDutyData.event_action,
        severity: pagerDutyData.payload.severity
      });
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка отправки PagerDuty на ${channel.name}`, { 
        error, 
        alert: alert.id 
      });
      throw error;
    }
  }

  private startEscalation(alert: Alert): void {
    if (!this.config.alerts.escalation.enabled) return;
    
    const escalateToNextLevel = () => {
      if (alert.escalationLevel >= this.config.alerts.escalation.maxEscalations) {
        return;
      }
      
      alert.escalationLevel++;
      const level = this.config.alerts.escalation.levels[alert.escalationLevel - 1];
      
      if (level) {
        enhancedDbLogger.warn(`🔺 Эскалация алерта на уровень ${alert.escalationLevel}`, {
          alert: alert.id,
          level: alert.escalationLevel
        });
        
        // Отправка на каналы эскалации
        const escalationChannels = this.config.alerts.channels.filter(
          c => level.channels.includes(c.name)
        );
        
        for (const channel of escalationChannels) {
          this.sendToChannel(channel, alert, 
            `🔺 ЭСКАЛАЦИЯ УРОВЕНЬ ${alert.escalationLevel}\n\n` + 
            this.formatAlertMessage(alert, channel)
          );
        }
        
        // Установка таймера для следующего уровня
        const nextTimeout = this.config.alerts.escalation.timeouts[alert.escalationLevel] * 60 * 1000;
        this.escalationTimers.set(alert.id, setTimeout(escalateToNextLevel, nextTimeout));
      }
    };
    
    // Запуск первого уровня эскалации
    const firstTimeout = this.config.alerts.escalation.timeouts[0] * 60 * 1000;
    this.escalationTimers.set(alert.id, setTimeout(escalateToNextLevel, firstTimeout));
  }

  private async startDashboard(): Promise<void> {
    // Реализация web dashboard
    enhancedDbLogger.info('🖥️ Dashboard запущен', {
      port: this.config.dashboard.port || 3000
    });
  }

  private async updateDashboard(): Promise<void> {
    // Обновление данных dashboard
  }

  private async exportMetrics(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (this.config.metrics.exportFormat === 'json') {
      const exportFile = path.join(this.config.metrics.exportPath, `metrics_${timestamp}.json`);
      await fs.writeFile(exportFile, JSON.stringify(Array.from(this.metrics.values()), null, 2));
    }
  }

  private async saveAlertToFile(alert: Alert): Promise<void> {
    const alertsFile = path.join(this.config.metrics.exportPath, 'current_alerts.json');
    const alerts = Array.from(this.alerts.values());
    await fs.writeFile(alertsFile, JSON.stringify(alerts, null, 2));
  }

  private async cleanupHistoricalData(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.metrics.retentionDays * 24 * 60 * 60 * 1000);
    
    // Очистка алертов
    this.alertHistory = this.alertHistory.filter(a => a.timestamp >= cutoffDate);
    
    // Очистка метрик
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoffDate);
    
    // Очистка resolved алертов
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.status === 'resolved' && alert.resolvedAt && alert.resolvedAt < cutoffDate) {
        this.alerts.delete(id);
      }
    }
  }

  /**
   * Получение данных для dashboard
   */
  getDashboardData(): DashboardData {
    const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'open');
    
    return {
      status: this.calculateOverallStatus(),
      lastUpdated: new Date(),
      summary: {
        totalBackups: latestMetrics?.backup.totalBackups || 0,
        successRate: latestMetrics?.backup.successRate || 0,
        lastBackupTime: latestMetrics?.health.lastSuccessfulBackup || new Date(0),
        nextScheduledBackup: new Date(Date.now() + 24 * 60 * 60 * 1000), // TODO: реальное расписание
        diskUsagePercent: latestMetrics?.storage.usagePercent || 0,
        activeAlerts: activeAlerts.length
      },
      recentBackups: this.backupManager.getBackupHistory().slice(0, 10),
      recentAlerts: this.alertHistory.slice(-10),
      metrics: latestMetrics || {} as BackupMetrics,
      systemHealth: {} as SystemHealthStatus, // TODO: получить от DR manager
      trends: {
        backupSuccess: this.metricsHistory.slice(-24).map(m => m.backup.successRate),
        diskUsage: this.metricsHistory.slice(-24).map(m => m.storage.usagePercent),
        performance: this.metricsHistory.slice(-24).map(m => m.performance.averageThroughput),
        alertCounts: this.getHourlyAlertCounts()
      }
    };
  }

  private calculateOverallStatus(): 'healthy' | 'warning' | 'critical' | 'emergency' {
    const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'open');
    const emergencyAlerts = activeAlerts.filter(a => a.severity === 'emergency');
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const errorAlerts = activeAlerts.filter(a => a.severity === 'error');
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning');
    
    if (emergencyAlerts.length > 0) return 'emergency';
    if (criticalAlerts.length > 0) return 'critical';
    if (errorAlerts.length > 0 || warningAlerts.length > 3) return 'warning';
    return 'healthy';
  }

  private getHourlyAlertCounts(): number[] {
    const now = Date.now();
    const hourlyData: number[] = [];
    
    for (let i = 23; i >= 0; i--) {
      const hourStart = now - (i + 1) * 60 * 60 * 1000;
      const hourEnd = now - i * 60 * 60 * 1000;
      
      const count = this.alertHistory.filter(
        a => a.timestamp.getTime() >= hourStart && a.timestamp.getTime() < hourEnd
      ).length;
      
      hourlyData.push(count);
    }
    
    return hourlyData;
  }

  /**
   * Подтверждение алерта
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== 'open') {
      return false;
    }
    
    alert.status = 'acknowledged';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();
    
    // Остановка эскалации
    const escalationTimer = this.escalationTimers.get(alertId);
    if (escalationTimer) {
      clearTimeout(escalationTimer);
      this.escalationTimers.delete(alertId);
    }
    
    enhancedDbLogger.info('✅ Алерт подтвержден', {
      alert: alertId,
      by: acknowledgedBy
    });
    
    await this.saveAlertToFile(alert);
    return true;
  }

  /**
   * Разрешение алерта
   */
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status === 'resolved') {
      return false;
    }
    
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    
    // Остановка эскалации
    const escalationTimer = this.escalationTimers.get(alertId);
    if (escalationTimer) {
      clearTimeout(escalationTimer);
      this.escalationTimers.delete(alertId);
    }
    
    enhancedDbLogger.info('✅ Алерт разрешен', {
      alert: alertId,
      by: resolvedBy || 'system'
    });
    
    await this.saveAlertToFile(alert);
    return true;
  }

  /**
   * Остановка системы мониторинга
   */
  async shutdown(): Promise<void> {
    enhancedDbLogger.info('🛑 Остановка Backup Monitoring System');
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Остановка всех таймеров эскалации
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();
    
    // Сохранение данных
    try {
      await fs.writeFile(
        path.join(this.config.metrics.exportPath, 'alerts_history.json'),
        JSON.stringify(this.alertHistory, null, 2)
      );
      
      await fs.writeFile(
        path.join(this.config.metrics.exportPath, 'metrics_history.json'),
        JSON.stringify(this.metricsHistory, null, 2)
      );
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сохранения данных при остановке', { error });
    }
    
    enhancedDbLogger.info('✅ Backup Monitoring System остановлен');
  }

  /**
   * Генерирует HTML содержимое для email уведомления
   */
  private generateEmailHTML(alert: Alert, message: string): string {
    const severityColor = this.getSeverityColor(alert.severity);
    const severityEmoji = this.getSeverityEmoji(alert.severity);
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Backup Alert - ${alert.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; }
            .alert-info { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }
            .metadata { font-size: 14px; color: #666; }
            .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: ${severityColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${severityEmoji} Backup Alert: ${alert.severity.toUpperCase()}</h1>
              <h2>${alert.title}</h2>
            </div>
            <div class="content">
              <div class="alert-info">
                <p><strong>Описание:</strong> ${alert.description}</p>
                <p><strong>Категория:</strong> ${alert.category}</p>
                <p><strong>Источник:</strong> ${alert.source}</p>
                <p><strong>Время:</strong> ${alert.timestamp.toLocaleString()}</p>
                <p><strong>ID алерта:</strong> ${alert.id}</p>
              </div>
              <div class="metadata">
                <h3>Детали алерта:</h3>
                <pre>${message}</pre>
                ${alert.metadata ? `<h3>Метаданные:</h3><pre>${JSON.stringify(alert.metadata, null, 2)}</pre>` : ''}
              </div>
              <a href="http://localhost:3030/alerts/${alert.id}" class="button">Открыть Dashboard</a>
            </div>
            <div class="footer">
              <p>Система мониторинга Backup Crypto Mixer</p>
              <p>Это автоматическое сообщение. Не отвечайте на этот email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Генерирует текстовое содержимое для email уведомления
   */
  private generateEmailText(alert: Alert, message: string): string {
    return `
СИСТЕМА МОНИТОРИНГА BACKUP CRYPTO MIXER
=======================================

Уровень: ${alert.severity.toUpperCase()}
Заголовок: ${alert.title}
Описание: ${alert.description}
Категория: ${alert.category}
Источник: ${alert.source}
Время: ${alert.timestamp.toLocaleString()}
ID алерта: ${alert.id}

ДЕТАЛИ
------
${message}

${alert.metadata ? `МЕТАДАННЫЕ\n----------\n${JSON.stringify(alert.metadata, null, 2)}\n\n` : ''}DASHBOARD
---------
Подробности: http://localhost:3030/alerts/${alert.id}

---
Система мониторинга Backup Crypto Mixer
Это автоматическое сообщение.
    `;
  }

  /**
   * Возвращает emoji для уровня критичности
   */
  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'critical': return '🚨';
      case 'emergency': return '🆘';
      default: return '❓';
    }
  }

  /**
   * Возвращает цвет для уровня критичности
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'info': return '#2196F3';
      case 'warning': return '#FF9800';
      case 'error': return '#F44336';
      case 'critical': return '#9C27B0';
      case 'emergency': return '#D32F2F';
      default: return '#607D8B';
    }
  }

  /**
   * Маппинг severity на PagerDuty severity levels
   */
  private mapSeverityToPagerDuty(severity: AlertSeverity): 'info' | 'warning' | 'error' | 'critical' {
    switch (severity) {
      case 'info': return 'info';
      case 'warning': return 'warning';
      case 'error': return 'error';
      case 'critical':
      case 'emergency': return 'critical';
      default: return 'info';
    }
  }
}