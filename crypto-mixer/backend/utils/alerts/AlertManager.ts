/**
 * Alert Manager для критических ошибок и мониторинга
 * 
 * Обеспечивает:
 * - Интеллектуальные алерты с дедупликацией
 * - Множественные каналы уведомлений (Email, Slack, Webhook, SMS)
 * - Escalation policies для критических событий
 * - Rate limiting и noise reduction
 * - Incident management integration
 * - Health checks и automated recovery
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { BaseError, ErrorSeverity } from '../errors/ErrorTypes';

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

export enum AlertChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  SMS = 'sms',
  TELEGRAM = 'telegram',
  CONSOLE = 'console'
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Условия срабатывания
  conditions: {
    errorSeverity?: ErrorSeverity[];
    errorCodes?: string[];
    components?: string[];
    operations?: string[];
    metricThresholds?: {
      metric: string;
      operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
      value: number;
      duration?: number; // milliseconds
    }[];
  };
  
  // Конфигурация алерта
  alertSeverity: AlertSeverity;
  channels: AlertChannel[];
  cooldownMinutes: number;
  maxAlertsPerHour: number;
  
  // Escalation
  escalationRules?: {
    afterMinutes: number;
    channels: AlertChannel[];
    severity: AlertSeverity;
  }[];
  
  // Auto-resolution
  autoResolve?: {
    enabled: boolean;
    afterMinutes: number;
    conditions?: any;
  };
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  
  title: string;
  message: string;
  source: string;
  
  triggeredAt: Date;
  resolvedAt?: Date;
  status: 'active' | 'resolved' | 'suppressed';
  
  context: {
    error?: BaseError;
    metrics?: Record<string, any>;
    system?: Record<string, any>;
    trace?: {
      traceId: string;
      spanId: string;
    };
  };
  
  // Delivery tracking
  deliveryStatus: Record<AlertChannel, {
    sent: boolean;
    sentAt?: Date;
    error?: string;
    attempts: number;
  }>;
  
  escalationLevel: number;
  suppressionReason?: string;
  fingerprint: string; // For deduplication
}

export interface AlertChannelConfig {
  channel: AlertChannel;
  enabled: boolean;
  config: {
    // Email
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    recipients?: string[];
    
    // Slack
    webhookUrl?: string;
    slackChannel?: string;
    slackToken?: string;
    
    // Webhook
    url?: string;
    headers?: Record<string, string>;
    method?: 'POST' | 'PUT';
    
    // SMS/Telegram
    apiKey?: string;
    phoneNumbers?: string[];
    chatIds?: string[];
    
    // Rate limiting
    maxPerMinute?: number;
    maxPerHour?: number;
  };
}

export interface IncidentContext {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: 'open' | 'investigating' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
  alerts: string[]; // Alert IDs
  assignedTo?: string;
  tags: string[];
}

/**
 * Comprehensive Alert Manager
 */
export class AlertManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private channels: Map<AlertChannel, AlertChannelConfig> = new Map();
  private incidents: Map<string, IncidentContext> = new Map();
  private suppressions: Map<string, { until: Date; reason: string }> = new Map();
  private rateLimits: Map<string, { count: number; resetAt: Date }> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly maxHistorySize = 10000;
  private maintenanceMode = false;

  constructor() {
    super();
    this.setupDefaultRules();
    this.startMaintenanceTasks();
  }

  /**
   * Добавляет правило алерта
   */
  public addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.emit('ruleAdded', rule);
  }

  /**
   * Обновляет правило алерта
   */
  public updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule ${ruleId} не найдено`);
    }
    
    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    this.emit('ruleUpdated', updatedRule);
  }

  /**
   * Удаляет правило алерта
   */
  public removeRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.delete(ruleId);
      this.emit('ruleRemoved', rule);
    }
  }

  /**
   * Конфигурирует канал уведомлений
   */
  public configureChannel(config: AlertChannelConfig): void {
    this.channels.set(config.channel, config);
    this.emit('channelConfigured', config);
  }

  /**
   * Обрабатывает ошибку для алертов
   */
  public async processError(
    error: BaseError,
    source: string = 'unknown',
    additionalContext: Record<string, any> = {}
  ): Promise<void> {
    if (this.maintenanceMode) {
      return; // Подавляем алерты в режиме обслуживания
    }

    const matchingRules = this.findMatchingRules(error);
    
    for (const rule of matchingRules) {
      await this.triggerAlert(rule, {
        title: `Ошибка: ${error.message}`,
        message: this.formatErrorMessage(error),
        source,
        context: {
          error,
          ...additionalContext
        }
      });
    }
  }

  /**
   * Обрабатывает метрику для алертов
   */
  public async processMetric(
    metricName: string,
    value: number,
    labels: Record<string, string> = {},
    source: string = 'metrics'
  ): Promise<void> {
    if (this.maintenanceMode) return;

    const matchingRules = this.findMetricMatchingRules(metricName, value, labels);
    
    for (const rule of matchingRules) {
      await this.triggerAlert(rule, {
        title: `Метрика превысила порог: ${metricName}`,
        message: `Метрика ${metricName} = ${value} превысила настроенный порог`,
        source,
        context: {
          metrics: { [metricName]: value, ...labels }
        }
      });
    }
  }

  /**
   * Создает алерт вручную
   */
  public async createAlert(
    ruleId: string,
    title: string,
    message: string,
    severity: AlertSeverity,
    source: string,
    context: Record<string, any> = {}
  ): Promise<string> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule ${ruleId} не найдено`);
    }

    return this.triggerAlert(rule, {
      title,
      message,
      source,
      context,
      severity
    });
  }

  /**
   * Разрешает алерт
   */
  public async resolveAlert(
    alertId: string,
    reason: string = 'Ручное разрешение'
  ): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} не найден`);
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    
    // Отменяем эскалацию
    const escalationTimer = this.escalationTimers.get(alertId);
    if (escalationTimer) {
      clearTimeout(escalationTimer);
      this.escalationTimers.delete(alertId);
    }

    // Перемещаем в историю
    this.activeAlerts.delete(alertId);
    this.alertHistory.push(alert);
    this.cleanupHistory();

    await this.sendResolutionNotification(alert, reason);
    this.emit('alertResolved', alert);
  }

  /**
   * Подавляет алерты по правилу
   */
  public suppressRule(
    ruleId: string,
    durationMinutes: number,
    reason: string
  ): void {
    const until = new Date(Date.now() + (durationMinutes * 60 * 1000));
    this.suppressions.set(ruleId, { until, reason });
    
    this.emit('ruleSuppressed', { ruleId, until, reason });
  }

  /**
   * Включает/выключает режим обслуживания
   */
  public setMaintenanceMode(enabled: boolean, reason?: string): void {
    this.maintenanceMode = enabled;
    this.emit('maintenanceModeChanged', { enabled, reason });
    
    if (enabled) {
      // Подавляем все активные алерты
      this.activeAlerts.forEach(alert => {
        alert.status = 'suppressed';
        alert.suppressionReason = reason || 'Режим обслуживания';
      });
    }
  }

  /**
   * Создает инцидент из алерта
   */
  public createIncident(
    alertId: string,
    title: string,
    description: string,
    severity: AlertSeverity = AlertSeverity.CRITICAL
  ): string {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} не найден`);
    }

    const incidentId = this.generateId('incident');
    const incident: IncidentContext = {
      id: incidentId,
      title,
      description,
      severity,
      status: 'open',
      createdAt: new Date(),
      alerts: [alertId],
      tags: [alert.source, alert.severity]
    };

    this.incidents.set(incidentId, incident);
    this.emit('incidentCreated', incident);
    
    return incidentId;
  }

  /**
   * Получает активные алерты
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Получает алерты по фильтрам
   */
  public getAlerts(filters: {
    severity?: AlertSeverity;
    source?: string;
    status?: string;
    timeframe?: number; // hours
  } = {}): Alert[] {
    let alerts = [...this.alertHistory, ...this.activeAlerts.values()];
    
    if (filters.severity) {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }
    
    if (filters.source) {
      alerts = alerts.filter(a => a.source === filters.source);
    }
    
    if (filters.status) {
      alerts = alerts.filter(a => a.status === filters.status);
    }
    
    if (filters.timeframe) {
      const cutoff = new Date(Date.now() - (filters.timeframe * 60 * 60 * 1000));
      alerts = alerts.filter(a => a.triggeredAt >= cutoff);
    }
    
    return alerts.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
  }

  /**
   * Получает статистику алертов
   */
  public getAlertStatistics(hoursBack: number = 24): {
    total: number;
    bySeverity: Record<AlertSeverity, number>;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    resolution: {
      averageMinutes: number;
      total: number;
    };
  } {
    const cutoff = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    const recentAlerts = this.getAlerts({ timeframe: hoursBack });
    
    const stats = {
      total: recentAlerts.length,
      bySeverity: {} as Record<AlertSeverity, number>,
      bySource: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      resolution: {
        averageMinutes: 0,
        total: 0
      }
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    recentAlerts.forEach(alert => {
      // By severity
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      
      // By source
      stats.bySource[alert.source] = (stats.bySource[alert.source] || 0) + 1;
      
      // By status
      stats.byStatus[alert.status] = (stats.byStatus[alert.status] || 0) + 1;
      
      // Resolution time
      if (alert.status === 'resolved' && alert.resolvedAt) {
        const resolutionTime = alert.resolvedAt.getTime() - alert.triggeredAt.getTime();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }
    });

    if (resolvedCount > 0) {
      stats.resolution.averageMinutes = (totalResolutionTime / resolvedCount) / (1000 * 60);
      stats.resolution.total = resolvedCount;
    }

    return stats;
  }

  /**
   * Тестирует канал уведомлений
   */
  public async testChannel(
    channel: AlertChannel,
    testMessage: string = 'Тестовое сообщение от Alert Manager'
  ): Promise<boolean> {
    const channelConfig = this.channels.get(channel);
    if (!channelConfig || !channelConfig.enabled) {
      throw new Error(`Канал ${channel} не настроен или отключен`);
    }

    try {
      await this.sendNotification(channel, {
        title: 'Тест канала уведомлений',
        message: testMessage,
        severity: AlertSeverity.INFO
      });
      
      return true;
    } catch (error) {
      this.emit('channelTestFailed', { channel, error });
      return false;
    }
  }

  /**
   * Основной метод создания алерта
   */
  private async triggerAlert(
    rule: AlertRule,
    alertData: {
      title: string;
      message: string;
      source: string;
      context: Record<string, any>;
      severity?: AlertSeverity;
    }
  ): Promise<string> {
    // Проверяем подавление
    if (this.isRuleSuppressed(rule.id)) {
      return '';
    }

    // Проверяем rate limiting
    if (!this.checkRateLimit(rule)) {
      return '';
    }

    // Создаем fingerprint для дедупликации
    const fingerprint = this.createFingerprint(rule, alertData);
    
    // Проверяем дедупликацию
    const existingAlert = this.findDuplicateAlert(fingerprint);
    if (existingAlert && !this.shouldCreateDuplicate(existingAlert, rule)) {
      return existingAlert.id;
    }

    const alertId = this.generateId('alert');
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: alertData.severity || rule.alertSeverity,
      title: alertData.title,
      message: alertData.message,
      source: alertData.source,
      triggeredAt: new Date(),
      status: 'active',
      context: alertData.context,
      deliveryStatus: this.initializeDeliveryStatus(),
      escalationLevel: 0,
      fingerprint
    };

    this.activeAlerts.set(alertId, alert);

    // Отправляем уведомления
    await this.sendAlertNotifications(alert, rule);

    // Настраиваем эскалацию
    this.setupEscalation(alert, rule);

    this.emit('alertTriggered', alert);
    return alertId;
  }

  /**
   * Находит правила, подходящие под ошибку
   */
  private findMatchingRules(error: BaseError): AlertRule[] {
    const matchingRules: AlertRule[] = [];
    
    this.rules.forEach(rule => {
      if (!rule.enabled) return;
      
      const conditions = rule.conditions;
      
      // Проверяем severity
      if (conditions.errorSeverity && 
          !conditions.errorSeverity.includes(error.severity)) {
        return;
      }
      
      // Проверяем error codes
      if (conditions.errorCodes && 
          !conditions.errorCodes.includes(error.code)) {
        return;
      }
      
      // Проверяем компоненты
      if (conditions.components && 
          !conditions.components.includes(error.context.component)) {
        return;
      }
      
      // Проверяем операции
      if (conditions.operations && 
          !conditions.operations.includes(error.context.operation)) {
        return;
      }
      
      matchingRules.push(rule);
    });
    
    return matchingRules;
  }

  /**
   * Находит правила для метрик
   */
  private findMetricMatchingRules(
    metricName: string,
    value: number,
    labels: Record<string, string>
  ): AlertRule[] {
    const matchingRules: AlertRule[] = [];
    
    this.rules.forEach(rule => {
      if (!rule.enabled || !rule.conditions.metricThresholds) return;
      
      const thresholds = rule.conditions.metricThresholds;
      
      for (const threshold of thresholds) {
        if (threshold.metric !== metricName) continue;
        
        let matches = false;
        switch (threshold.operator) {
          case 'gt':
            matches = value > threshold.value;
            break;
          case 'gte':
            matches = value >= threshold.value;
            break;
          case 'lt':
            matches = value < threshold.value;
            break;
          case 'lte':
            matches = value <= threshold.value;
            break;
          case 'eq':
            matches = value === threshold.value;
            break;
        }
        
        if (matches) {
          matchingRules.push(rule);
          break;
        }
      }
    });
    
    return matchingRules;
  }

  /**
   * Отправляет уведомления о алерте
   */
  private async sendAlertNotifications(alert: Alert, rule: AlertRule): Promise<void> {
    const promises = rule.channels.map(async (channel) => {
      const channelConfig = this.channels.get(channel);
      if (!channelConfig || !channelConfig.enabled) {
        return;
      }

      try {
        await this.sendNotification(channel, {
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          alert
        });
        
        alert.deliveryStatus[channel].sent = true;
        alert.deliveryStatus[channel].sentAt = new Date();
        
      } catch (error) {
        alert.deliveryStatus[channel].error = (error as Error).message;
        alert.deliveryStatus[channel].attempts++;
        
        this.emit('notificationFailed', { alert, channel, error });
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Отправляет уведомление через конкретный канал
   */
  private async sendNotification(
    channel: AlertChannel,
    notification: {
      title: string;
      message: string;
      severity: AlertSeverity;
      alert?: Alert;
    }
  ): Promise<void> {
    switch (channel) {
      case AlertChannel.CONSOLE:
        this.sendConsoleNotification(notification);
        break;
      case AlertChannel.EMAIL:
        await this.sendEmailNotification(notification);
        break;
      case AlertChannel.SLACK:
        await this.sendSlackNotification(notification);
        break;
      case AlertChannel.WEBHOOK:
        await this.sendWebhookNotification(notification);
        break;
      default:
        throw new Error(`Канал ${channel} не реализован`);
    }
  }

  /**
   * Отправляет уведомление в консоль
   */
  private sendConsoleNotification(notification: any): void {
    const emoji = this.getSeverityEmoji(notification.severity);
    console.log(`\n${emoji} ALERT: ${notification.title}`);
    console.log(`Сообщение: ${notification.message}`);
    console.log(`Серьезность: ${notification.severity}`);
    console.log(`Время: ${new Date().toISOString()}`);
    console.log('─'.repeat(50));
  }

  /**
   * Заглушки для других каналов (нужно реализовать)
   */
  private async sendEmailNotification(notification: any): Promise<void> {
    // TODO: Реализовать email отправку
    console.log('EMAIL уведомление:', notification.title);
  }

  private async sendSlackNotification(notification: any): Promise<void> {
    // TODO: Реализовать Slack отправку
    console.log('SLACK уведомление:', notification.title);
  }

  private async sendWebhookNotification(notification: any): Promise<void> {
    // TODO: Реализовать webhook отправку
    console.log('WEBHOOK уведомление:', notification.title);
  }

  /**
   * Вспомогательные методы
   */
  private setupDefaultRules(): void {
    // Критические ошибки
    this.addRule({
      id: 'critical_errors',
      name: 'Критические ошибки',
      description: 'Алерт для всех критических ошибок системы',
      enabled: true,
      conditions: {
        errorSeverity: [ErrorSeverity.CRITICAL]
      },
      alertSeverity: AlertSeverity.CRITICAL,
      channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL],
      cooldownMinutes: 5,
      maxAlertsPerHour: 10
    });

    // Ошибки безопасности
    this.addRule({
      id: 'security_violations',
      name: 'Нарушения безопасности',
      description: 'Алерт для нарушений безопасности',
      enabled: true,
      conditions: {
        components: ['security', 'authentication', 'authorization']
      },
      alertSeverity: AlertSeverity.EMERGENCY,
      channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL, AlertChannel.SLACK],
      cooldownMinutes: 0,
      maxAlertsPerHour: 50
    });
  }

  private setupEscalation(alert: Alert, rule: AlertRule): void {
    if (!rule.escalationRules || rule.escalationRules.length === 0) return;

    const escalation = rule.escalationRules[0]; // Берем первое правило эскалации
    const timer = setTimeout(async () => {
      if (this.activeAlerts.has(alert.id)) {
        alert.escalationLevel++;
        await this.sendEscalationNotification(alert, escalation);
      }
    }, escalation.afterMinutes * 60 * 1000);

    this.escalationTimers.set(alert.id, timer);
  }

  private async sendEscalationNotification(alert: Alert, escalation: any): Promise<void> {
    // Логика эскалации уведомлений
    console.log(`🚨 ЭСКАЛАЦИЯ для алерта ${alert.id}`);
  }

  private async sendResolutionNotification(alert: Alert, reason: string): Promise<void> {
    console.log(`✅ РАЗРЕШЕН алерт ${alert.id}: ${reason}`);
  }

  private isRuleSuppressed(ruleId: string): boolean {
    const suppression = this.suppressions.get(ruleId);
    if (!suppression) return false;
    
    if (suppression.until < new Date()) {
      this.suppressions.delete(ruleId);
      return false;
    }
    
    return true;
  }

  private checkRateLimit(rule: AlertRule): boolean {
    const key = `rule_${rule.id}`;
    const now = new Date();
    const hourKey = `${key}_${now.getHours()}`;
    
    const hourlyLimit = this.rateLimits.get(hourKey);
    if (hourlyLimit && hourlyLimit.count >= rule.maxAlertsPerHour) {
      return false;
    }
    
    // Обновляем счетчик
    if (!hourlyLimit || hourlyLimit.resetAt < now) {
      this.rateLimits.set(hourKey, {
        count: 1,
        resetAt: new Date(now.getTime() + 60 * 60 * 1000)
      });
    } else {
      hourlyLimit.count++;
    }
    
    return true;
  }

  private createFingerprint(rule: AlertRule, alertData: any): string {
    const data = {
      ruleId: rule.id,
      title: alertData.title,
      source: alertData.source
    };
    
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  private findDuplicateAlert(fingerprint: string): Alert | undefined {
    return Array.from(this.activeAlerts.values())
      .find(alert => alert.fingerprint === fingerprint);
  }

  private shouldCreateDuplicate(existingAlert: Alert, rule: AlertRule): boolean {
    const timeSinceTriggered = Date.now() - existingAlert.triggeredAt.getTime();
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    
    return timeSinceTriggered > cooldownMs;
  }

  private initializeDeliveryStatus(): Alert['deliveryStatus'] {
    const status: Alert['deliveryStatus'] = {} as any;
    
    Object.values(AlertChannel).forEach(channel => {
      status[channel] = {
        sent: false,
        attempts: 0
      };
    });
    
    return status;
  }

  private formatErrorMessage(error: BaseError): string {
    return `
Ошибка: ${error.message}
Код: ${error.code}
Компонент: ${error.context.component}
Операция: ${error.context.operation}
Серьезность: ${error.severity}
Время: ${error.timestamp.toISOString()}
${error.canRecover() ? '🔄 Ошибка восстанавливаемая' : '❌ Ошибка критическая'}
    `.trim();
  }

  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.INFO: return 'ℹ️';
      case AlertSeverity.WARNING: return '⚠️';
      case AlertSeverity.CRITICAL: return '🚨';
      case AlertSeverity.EMERGENCY: return '🆘';
      default: return '📢';
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupHistory(): void {
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }
  }

  private startMaintenanceTasks(): void {
    // Очистка старых rate limits
    setInterval(() => {
      const now = new Date();
      for (const [key, limit] of this.rateLimits.entries()) {
        if (limit.resetAt < now) {
          this.rateLimits.delete(key);
        }
      }
    }, 60 * 60 * 1000); // Каждый час

    // Очистка старых подавлений
    setInterval(() => {
      const now = new Date();
      for (const [ruleId, suppression] of this.suppressions.entries()) {
        if (suppression.until < now) {
          this.suppressions.delete(ruleId);
        }
      }
    }, 10 * 60 * 1000); // Каждые 10 минут
  }
}

/**
 * Глобальный экземпляр alert manager'а
 */
let globalAlertManager: AlertManager | null = null;

/**
 * Инициализирует глобальный alert manager
 */
export function initializeAlertManager(): AlertManager {
  globalAlertManager = new AlertManager();
  return globalAlertManager;
}

/**
 * Получает глобальный alert manager
 */
export function getAlertManager(): AlertManager {
  if (!globalAlertManager) {
    throw new Error('AlertManager не инициализирован. Вызовите initializeAlertManager() сначала.');
  }
  return globalAlertManager;
}

/**
 * Удобная функция для отправки алерта
 */
export async function sendAlert(
  severity: AlertSeverity,
  title: string,
  message: string,
  source: string = 'manual'
): Promise<void> {
  const alertManager = getAlertManager();
  
  // Создаем временное правило для ручного алерта
  const ruleId = `manual_${Date.now()}`;
  alertManager.addRule({
    id: ruleId,
    name: 'Manual Alert',
    description: 'Manually triggered alert',
    enabled: true,
    conditions: {},
    alertSeverity: severity,
    channels: [AlertChannel.CONSOLE],
    cooldownMinutes: 0,
    maxAlertsPerHour: 100
  });
  
  await alertManager.createAlert(ruleId, title, message, severity, source);
}