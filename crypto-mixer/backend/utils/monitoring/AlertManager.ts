import { EventEmitter } from 'events';
import { enhancedDbLogger } from '../logger';

/**
 * Типы алертов
 */
export type AlertType = 'performance' | 'health_status' | 'service' | 'security' | 'business';

/**
 * Уровни важности алертов
 */
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Статусы алертов
 */
export type AlertStatus = 'triggered' | 'acknowledged' | 'resolved' | 'suppressed';

/**
 * Каналы уведомлений
 */
export type NotificationChannel = 'webhook' | 'email' | 'slack' | 'telegram' | 'sms' | 'push';

/**
 * Интерфейс алерта
 */
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  source: string;
  metadata: Record<string, any>;
  timestamp: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  suppressedUntil?: Date;
  escalationLevel: number;
  tags: string[];
}

/**
 * Правило алертинга
 */
export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  type: AlertType;
  severity: AlertSeverity;
  condition: AlertCondition;
  throttle: {
    enabled: boolean;
    interval: number; // в секундах
    maxAlerts: number;
  };
  escalation: {
    enabled: boolean;
    levels: EscalationLevel[];
  };
  notification: {
    channels: NotificationChannel[];
    suppressDuplicates: boolean;
    quietHours?: {
      enabled: boolean;
      start: string; // HH:MM
      end: string; // HH:MM
      timezone: string;
    };
  };
  tags: string[];
}

/**
 * Условие алертинга
 */
export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'contains' | 'not_contains';
  threshold: number | string;
  duration?: number; // в секундах - минимальное время нарушения условия
  aggregation?: 'avg' | 'max' | 'min' | 'sum' | 'count';
}

/**
 * Уровень эскалации
 */
export interface EscalationLevel {
  level: number;
  delayMinutes: number;
  channels: NotificationChannel[];
  recipients: string[];
}

/**
 * Канал уведомлений
 */
export interface NotificationChannelConfig {
  type: NotificationChannel;
  enabled: boolean;
  config: Record<string, any>;
  retries: number;
  timeout: number;
}

/**
 * Конфигурация Alert Manager
 */
export interface AlertManagerConfig {
  enabled: boolean;
  maxActiveAlerts: number;
  alertRetentionDays: number;
  defaultSeverity: AlertSeverity;
  globalThrottle: {
    enabled: boolean;
    interval: number;
    maxAlerts: number;
  };
  channels: NotificationChannelConfig[];
  rules: AlertRule[];
}

/**
 * Менеджер алертов для crypto-mixer
 * Обрабатывает создание, управление и отправку алертов
 */
export class AlertManager extends EventEmitter {
  private config: AlertManagerConfig;
  private isRunning: boolean = false;
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private alertRules: Map<string, AlertRule> = new Map();
  private throttleCounters: Map<string, { count: number; resetTime: number }> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<AlertManagerConfig> = {}) {
    super();
    this.config = this.buildConfig(config);
    this.initializeRules();
  }

  /**
   * Создание полной конфигурации с дефолтными значениями
   */
  private buildConfig(partialConfig: Partial<AlertManagerConfig>): AlertManagerConfig {
    return {
      enabled: process.env.ALERTING_ENABLED === 'true',
      maxActiveAlerts: parseInt(process.env.MAX_ACTIVE_ALERTS || '1000'),
      alertRetentionDays: parseInt(process.env.ALERT_RETENTION_DAYS || '30'),
      defaultSeverity: (process.env.DEFAULT_ALERT_SEVERITY as AlertSeverity) || 'medium',
      globalThrottle: {
        enabled: process.env.GLOBAL_THROTTLE_ENABLED === 'true',
        interval: parseInt(process.env.GLOBAL_THROTTLE_INTERVAL || '300'), // 5 минут
        maxAlerts: parseInt(process.env.GLOBAL_THROTTLE_MAX_ALERTS || '50')
      },
      channels: this.getDefaultChannels(),
      rules: this.getDefaultRules(),
      ...partialConfig
    };
  }

  /**
   * Получение дефолтных каналов уведомлений
   */
  private getDefaultChannels(): NotificationChannelConfig[] {
    return [
      {
        type: 'webhook',
        enabled: !!process.env.ALERT_WEBHOOK_URL,
        config: {
          url: process.env.ALERT_WEBHOOK_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': process.env.ALERT_WEBHOOK_TOKEN ? `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` : undefined
          }
        },
        retries: 3,
        timeout: 10000
      },
      {
        type: 'email',
        enabled: !!process.env.SMTP_HOST,
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
          recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || []
        },
        retries: 2,
        timeout: 15000
      },
      {
        type: 'slack',
        enabled: !!process.env.SLACK_WEBHOOK_URL,
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#alerts',
          username: process.env.SLACK_USERNAME || 'Crypto Mixer Bot',
          iconEmoji: process.env.SLACK_ICON || ':warning:'
        },
        retries: 3,
        timeout: 10000
      }
    ];
  }

  /**
   * Получение дефолтных правил алертинга
   */
  private getDefaultRules(): AlertRule[] {
    return [
      {
        id: 'high_cpu_usage',
        name: 'High CPU Usage',
        enabled: true,
        type: 'performance',
        severity: 'high',
        condition: {
          metric: 'cpu_usage',
          operator: 'gt',
          threshold: 80,
          duration: 300, // 5 минут
          aggregation: 'avg'
        },
        throttle: {
          enabled: true,
          interval: 600, // 10 минут
          maxAlerts: 3
        },
        escalation: {
          enabled: true,
          levels: [
            {
              level: 1,
              delayMinutes: 5,
              channels: ['slack'],
              recipients: ['ops-team']
            },
            {
              level: 2,
              delayMinutes: 15,
              channels: ['email', 'slack'],
              recipients: ['ops-team', 'dev-team']
            }
          ]
        },
        notification: {
          channels: ['slack'],
          suppressDuplicates: true,
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          }
        },
        tags: ['performance', 'cpu', 'system']
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        enabled: true,
        type: 'performance',
        severity: 'high',
        condition: {
          metric: 'memory_usage',
          operator: 'gt',
          threshold: 85,
          duration: 300
        },
        throttle: {
          enabled: true,
          interval: 600,
          maxAlerts: 3
        },
        escalation: {
          enabled: true,
          levels: [
            {
              level: 1,
              delayMinutes: 5,
              channels: ['slack'],
              recipients: ['ops-team']
            }
          ]
        },
        notification: {
          channels: ['slack'],
          suppressDuplicates: true
        },
        tags: ['performance', 'memory', 'system']
      },
      {
        id: 'service_down',
        name: 'Service Down',
        enabled: true,
        type: 'health_status',
        severity: 'critical',
        condition: {
          metric: 'service_status',
          operator: 'eq',
          threshold: 'down',
          duration: 60 // 1 минута
        },
        throttle: {
          enabled: true,
          interval: 300,
          maxAlerts: 5
        },
        escalation: {
          enabled: true,
          levels: [
            {
              level: 1,
              delayMinutes: 0, // Немедленно
              channels: ['slack', 'webhook'],
              recipients: ['ops-team']
            },
            {
              level: 2,
              delayMinutes: 5,
              channels: ['email', 'slack'],
              recipients: ['ops-team', 'dev-team', 'management']
            }
          ]
        },
        notification: {
          channels: ['slack', 'webhook'],
          suppressDuplicates: false
        },
        tags: ['health', 'service', 'critical']
      },
      {
        id: 'mixing_failure_rate',
        name: 'High Mixing Failure Rate',
        enabled: true,
        type: 'business',
        severity: 'high',
        condition: {
          metric: 'mixing_success_rate',
          operator: 'lt',
          threshold: 95,
          duration: 600 // 10 минут
        },
        throttle: {
          enabled: true,
          interval: 900, // 15 минут
          maxAlerts: 2
        },
        escalation: {
          enabled: true,
          levels: [
            {
              level: 1,
              delayMinutes: 10,
              channels: ['slack'],
              recipients: ['dev-team']
            }
          ]
        },
        notification: {
          channels: ['slack'],
          suppressDuplicates: true
        },
        tags: ['business', 'mixing', 'failure']
      },
      {
        id: 'security_alert',
        name: 'Security Alert',
        enabled: true,
        type: 'security',
        severity: 'critical',
        condition: {
          metric: 'security_alerts_active',
          operator: 'gt',
          threshold: 0,
          duration: 0 // Немедленно
        },
        throttle: {
          enabled: false,
          interval: 0,
          maxAlerts: 0
        },
        escalation: {
          enabled: true,
          levels: [
            {
              level: 1,
              delayMinutes: 0,
              channels: ['webhook', 'email', 'slack'],
              recipients: ['security-team', 'ops-team', 'management']
            }
          ]
        },
        notification: {
          channels: ['webhook', 'email', 'slack'],
          suppressDuplicates: false
        },
        tags: ['security', 'critical', 'urgent']
      }
    ];
  }

  /**
   * Инициализация правил алертинга
   */
  private initializeRules(): void {
    this.config.rules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });
  }

  /**
   * Запуск Alert Manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      enhancedDbLogger.warn('⚠️ Alert Manager уже запущен');
      return;
    }

    if (!this.config.enabled) {
      enhancedDbLogger.info('🚨 Alert Manager отключен в конфигурации');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('alert_manager_start');

    try {
      enhancedDbLogger.info('🚨 Запуск Alert Manager', {
        maxActiveAlerts: this.config.maxActiveAlerts,
        rulesCount: this.alertRules.size,
        channelsCount: this.config.channels.filter(c => c.enabled).length
      });

      // Очистка старых алертов
      this.cleanupOldAlerts();

      // Запуск периодической очистки
      setInterval(() => {
        this.cleanupOldAlerts();
        this.resetThrottleCounters();
      }, 3600000); // Каждый час

      this.isRunning = true;

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Alert Manager запущен успешно');

      this.emit('started', {
        timestamp: new Date(),
        rulesLoaded: this.alertRules.size,
        channelsConfigured: this.config.channels.filter(c => c.enabled).length
      });

    } catch (error) {
      this.isRunning = false;
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      throw error;
    }
  }

  /**
   * Остановка Alert Manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    enhancedDbLogger.info('🛑 Остановка Alert Manager');

    // Отмена всех таймеров эскалации
    this.escalationTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.escalationTimers.clear();

    this.isRunning = false;

    enhancedDbLogger.info('✅ Alert Manager остановлен');

    this.emit('stopped', {
      timestamp: new Date()
    });
  }

  /**
   * Создание нового алерта
   */
  async createAlert(
    type: AlertType,
    severity: AlertSeverity,
    title: string,
    description: string,
    source: string,
    metadata: Record<string, any> = {}
  ): Promise<Alert> {
    const alertId = this.generateAlertId();
    
    const alert: Alert = {
      id: alertId,
      type,
      severity,
      status: 'triggered',
      title,
      description,
      source,
      metadata,
      timestamp: new Date(),
      escalationLevel: 0,
      tags: []
    };

    // Проверка лимита активных алертов
    if (this.activeAlerts.size >= this.config.maxActiveAlerts) {
      enhancedDbLogger.warn('⚠️ Достигнут лимит активных алертов', {
        current: this.activeAlerts.size,
        max: this.config.maxActiveAlerts
      });
      return alert;
    }

    // Добавление в активные алерты
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push({ ...alert });

    enhancedDbLogger.info('🚨 Создан новый алерт', {
      id: alertId,
      type,
      severity,
      title,
      source
    });

    // Отправка уведомлений
    await this.processAlert(alert);

    this.emit('alert_created', alert);

    return alert;
  }

  /**
   * Обработка алерта и отправка уведомлений
   */
  private async processAlert(alert: Alert): Promise<void> {
    try {
      // Найти подходящие правила
      const matchingRules = this.findMatchingRules(alert);

      for (const rule of matchingRules) {
        // Проверка throttling
        if (!this.checkThrottle(rule, alert)) {
          enhancedDbLogger.debug('🚨 Алерт заблокирован throttling', {
            alertId: alert.id,
            ruleId: rule.id
          });
          continue;
        }

        // Проверка quiet hours
        if (this.isQuietHours(rule)) {
          enhancedDbLogger.debug('🚨 Алерт отложен из-за quiet hours', {
            alertId: alert.id,
            ruleId: rule.id
          });
          continue;
        }

        // Отправка уведомлений
        await this.sendNotifications(alert, rule);

        // Настройка эскалации
        if (rule.escalation.enabled) {
          this.setupEscalation(alert, rule);
        }

        // Обновление счетчиков throttling
        this.updateThrottleCounter(rule);
      }

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка обработки алерта', {
        alertId: alert.id,
        error
      });
    }
  }

  /**
   * Поиск правил, соответствующих алерту
   */
  private findMatchingRules(alert: Alert): AlertRule[] {
    const matchingRules: AlertRule[] = [];

    this.alertRules.forEach(rule => {
      if (!rule.enabled) {
        return;
      }

      // Проверка типа
      if (rule.type === alert.type) {
        matchingRules.push(rule);
      }
    });

    return matchingRules;
  }

  /**
   * Проверка throttling
   */
  private checkThrottle(rule: AlertRule, alert: Alert): boolean {
    if (!rule.throttle.enabled) {
      return true;
    }

    const throttleKey = `${rule.id}_${alert.type}`;
    const now = Date.now();
    const counter = this.throttleCounters.get(throttleKey);

    if (!counter || now > counter.resetTime) {
      // Создаем новый счетчик
      this.throttleCounters.set(throttleKey, {
        count: 1,
        resetTime: now + (rule.throttle.interval * 1000)
      });
      return true;
    }

    if (counter.count >= rule.throttle.maxAlerts) {
      return false;
    }

    return true;
  }

  /**
   * Проверка quiet hours
   */
  private isQuietHours(rule: AlertRule): boolean {
    if (!rule.notification.quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    const timezone = rule.notification.quietHours.timezone || 'UTC';
    
    // Простая проверка времени (в реальном проекте лучше использовать библиотеку типа moment-timezone)
    const currentHour = now.getUTCHours();
    const startHour = parseInt(rule.notification.quietHours.start.split(':')[0]);
    const endHour = parseInt(rule.notification.quietHours.end.split(':')[0]);

    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  /**
   * Отправка уведомлений
   */
  private async sendNotifications(alert: Alert, rule: AlertRule): Promise<void> {
    const enabledChannels = this.config.channels.filter(channel => 
      channel.enabled && rule.notification.channels.includes(channel.type)
    );

    const notificationPromises = enabledChannels.map(channel => 
      this.sendNotificationToChannel(alert, channel)
    );

    await Promise.allSettled(notificationPromises);
  }

  /**
   * Отправка уведомления в конкретный канал
   */
  private async sendNotificationToChannel(
    alert: Alert, 
    channel: NotificationChannelConfig
  ): Promise<void> {
    try {
      enhancedDbLogger.debug('📤 Отправка уведомления', {
        alertId: alert.id,
        channel: channel.type
      });

      switch (channel.type) {
        case 'webhook':
          await this.sendWebhookNotification(alert, channel);
          break;
        case 'email':
          await this.sendEmailNotification(alert, channel);
          break;
        case 'slack':
          await this.sendSlackNotification(alert, channel);
          break;
        default:
          enhancedDbLogger.warn('⚠️ Неподдерживаемый тип канала', {
            type: channel.type
          });
      }

      enhancedDbLogger.info('✅ Уведомление отправлено', {
        alertId: alert.id,
        channel: channel.type
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки уведомления', {
        alertId: alert.id,
        channel: channel.type,
        error
      });
    }
  }

  /**
   * Отправка webhook уведомления
   */
  private async sendWebhookNotification(
    alert: Alert, 
    channel: NotificationChannelConfig
  ): Promise<void> {
    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        description: alert.description,
        source: alert.source,
        timestamp: alert.timestamp.toISOString(),
        metadata: alert.metadata
      },
      timestamp: new Date().toISOString(),
      system: 'crypto-mixer-alerts'
    };

    // Здесь будет HTTP запрос к webhook URL
    enhancedDbLogger.debug('📤 Webhook payload', { payload });
  }

  /**
   * Отправка email уведомления
   */
  private async sendEmailNotification(
    alert: Alert, 
    channel: NotificationChannelConfig
  ): Promise<void> {
    const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
    const body = this.formatEmailBody(alert);

    // Здесь будет отправка email через SMTP
    enhancedDbLogger.debug('📧 Email notification', { 
      subject, 
      recipients: channel.config.recipients 
    });
  }

  /**
   * Отправка Slack уведомления
   */
  private async sendSlackNotification(
    alert: Alert, 
    channel: NotificationChannelConfig
  ): Promise<void> {
    const message = this.formatSlackMessage(alert);

    // Здесь будет отправка в Slack через webhook
    enhancedDbLogger.debug('💬 Slack notification', { message });
  }

  /**
   * Форматирование email тела
   */
  private formatEmailBody(alert: Alert): string {
    return `
Alert Details:
- ID: ${alert.id}
- Type: ${alert.type}
- Severity: ${alert.severity}
- Status: ${alert.status}
- Source: ${alert.source}
- Time: ${alert.timestamp.toISOString()}

Description:
${alert.description}

Metadata:
${JSON.stringify(alert.metadata, null, 2)}

---
Crypto Mixer Alert System
    `.trim();
  }

  /**
   * Форматирование Slack сообщения
   */
  private formatSlackMessage(alert: Alert): any {
    const severityEmoji = {
      low: '🟡',
      medium: '🟠',
      high: '🔴',
      critical: '🚨'
    };

    return {
      text: `${severityEmoji[alert.severity]} *${alert.title}*`,
      attachments: [
        {
          color: this.getSeverityColor(alert.severity),
          fields: [
            {
              title: 'Type',
              value: alert.type,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            },
            {
              title: 'Source',
              value: alert.source,
              short: true
            },
            {
              title: 'Time',
              value: alert.timestamp.toISOString(),
              short: true
            },
            {
              title: 'Description',
              value: alert.description,
              short: false
            }
          ]
        }
      ]
    };
  }

  /**
   * Получение цвета для уровня важности
   */
  private getSeverityColor(severity: AlertSeverity): string {
    const colors = {
      low: '#36a64f',
      medium: '#ff9500',
      high: '#ff0000',
      critical: '#8b0000'
    };
    return colors[severity];
  }

  /**
   * Настройка эскалации
   */
  private setupEscalation(alert: Alert, rule: AlertRule): void {
    rule.escalation.levels.forEach(level => {
      const delay = level.delayMinutes * 60 * 1000; // Конвертация в миллисекунды
      
      const timer = setTimeout(async () => {
        await this.escalateAlert(alert, level);
      }, delay);

      this.escalationTimers.set(`${alert.id}_${level.level}`, timer);
    });
  }

  /**
   * Эскалация алерта
   */
  private async escalateAlert(alert: Alert, level: EscalationLevel): Promise<void> {
    try {
      // Проверяем, что алерт все еще активен
      if (!this.activeAlerts.has(alert.id)) {
        return;
      }

      alert.escalationLevel = level.level;

      enhancedDbLogger.warn('📈 Эскалация алерта', {
        alertId: alert.id,
        level: level.level,
        recipients: level.recipients
      });

      // Отправка уведомлений на следующий уровень эскалации
      const channels = this.config.channels.filter(channel => 
        channel.enabled && level.channels.includes(channel.type)
      );

      for (const channel of channels) {
        await this.sendNotificationToChannel(alert, channel);
      }

      this.emit('alert_escalated', {
        alert,
        level: level.level
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка эскалации алерта', {
        alertId: alert.id,
        level: level.level,
        error
      });
    }
  }

  /**
   * Обновление счетчика throttling
   */
  private updateThrottleCounter(rule: AlertRule): void {
    if (!rule.throttle.enabled) {
      return;
    }

    const throttleKey = `${rule.id}_${rule.type}`;
    const counter = this.throttleCounters.get(throttleKey);

    if (counter) {
      counter.count++;
    }
  }

  /**
   * Сброс счетчиков throttling
   */
  private resetThrottleCounters(): void {
    const now = Date.now();
    
    this.throttleCounters.forEach((counter, key) => {
      if (now > counter.resetTime) {
        this.throttleCounters.delete(key);
      }
    });
  }

  /**
   * Подтверждение алерта
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert) {
      return false;
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    // Отмена эскалации
    this.cancelEscalation(alertId);

    enhancedDbLogger.info('✅ Алерт подтвержден', {
      alertId,
      acknowledgedBy
    });

    this.emit('alert_acknowledged', alert);

    return true;
  }

  /**
   * Разрешение алерта
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert) {
      return false;
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();

    // Удаляем из активных алертов
    this.activeAlerts.delete(alertId);

    // Отмена эскалации
    this.cancelEscalation(alertId);

    enhancedDbLogger.info('✅ Алерт разрешен', {
      alertId
    });

    this.emit('alert_resolved', alert);

    return true;
  }

  /**
   * Отмена эскалации
   */
  private cancelEscalation(alertId: string): void {
    this.escalationTimers.forEach((timer, key) => {
      if (key.startsWith(alertId)) {
        clearTimeout(timer);
        this.escalationTimers.delete(key);
      }
    });
  }

  /**
   * Очистка старых алертов
   */
  private cleanupOldAlerts(): void {
    const retentionTime = this.config.alertRetentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = new Date(Date.now() - retentionTime);

    this.alertHistory = this.alertHistory.filter(alert => 
      alert.timestamp > cutoffTime
    );

    enhancedDbLogger.debug('🧹 Очистка старых алертов', {
      remaining: this.alertHistory.length,
      cutoffTime: cutoffTime.toISOString()
    });
  }

  /**
   * Генерация ID алерта
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Получение активных алертов
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Получение истории алертов
   */
  getAlertHistory(): Alert[] {
    return [...this.alertHistory];
  }

  /**
   * Получение статистики алертов
   */
  getAlertStatistics(): {
    activeCount: number;
    totalCount: number;
    severityDistribution: Record<AlertSeverity, number>;
    typeDistribution: Record<AlertType, number>;
  } {
    const activeAlerts = this.getActiveAlerts();
    
    const severityDistribution: Record<AlertSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    const typeDistribution: Record<AlertType, number> = {
      performance: 0,
      health_status: 0,
      service: 0,
      security: 0,
      business: 0
    };

    activeAlerts.forEach(alert => {
      severityDistribution[alert.severity]++;
      typeDistribution[alert.type]++;
    });

    return {
      activeCount: activeAlerts.length,
      totalCount: this.alertHistory.length,
      severityDistribution,
      typeDistribution
    };
  }

  /**
   * Получение статуса работы
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Получение конфигурации
   */
  getConfig(): AlertManagerConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации
   */
  updateConfig(newConfig: Partial<AlertManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Переинициализация правил
    if (newConfig.rules) {
      this.alertRules.clear();
      this.initializeRules();
    }

    enhancedDbLogger.info('🚨 Конфигурация Alert Manager обновлена', newConfig);
  }
}

export default AlertManager;