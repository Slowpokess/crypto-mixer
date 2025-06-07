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
import { BaseError, ErrorSeverity } from '../errors/ErrorTypes';
export declare enum AlertSeverity {
    INFO = "info",
    WARNING = "warning",
    CRITICAL = "critical",
    EMERGENCY = "emergency"
}
export declare enum AlertChannel {
    EMAIL = "email",
    SLACK = "slack",
    WEBHOOK = "webhook",
    SMS = "sms",
    TELEGRAM = "telegram",
    CONSOLE = "console"
}
export interface AlertRule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    conditions: {
        errorSeverity?: ErrorSeverity[];
        errorCodes?: string[];
        components?: string[];
        operations?: string[];
        metricThresholds?: {
            metric: string;
            operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
            value: number;
            duration?: number;
        }[];
    };
    alertSeverity: AlertSeverity;
    channels: AlertChannel[];
    cooldownMinutes: number;
    maxAlertsPerHour: number;
    escalationRules?: {
        afterMinutes: number;
        channels: AlertChannel[];
        severity: AlertSeverity;
    }[];
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
    deliveryStatus: Record<AlertChannel, {
        sent: boolean;
        sentAt?: Date;
        error?: string;
        attempts: number;
    }>;
    escalationLevel: number;
    suppressionReason?: string;
    fingerprint: string;
}
export interface AlertChannelConfig {
    channel: AlertChannel;
    enabled: boolean;
    config: {
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPassword?: string;
        recipients?: string[];
        webhookUrl?: string;
        slackChannel?: string;
        slackToken?: string;
        url?: string;
        headers?: Record<string, string>;
        method?: 'POST' | 'PUT';
        apiKey?: string;
        phoneNumbers?: string[];
        chatIds?: string[];
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
    alerts: string[];
    assignedTo?: string;
    tags: string[];
}
/**
 * Comprehensive Alert Manager
 */
export declare class AlertManager extends EventEmitter {
    private rules;
    private activeAlerts;
    private alertHistory;
    private channels;
    private incidents;
    private suppressions;
    private rateLimits;
    private escalationTimers;
    private readonly maxHistorySize;
    private maintenanceMode;
    constructor();
    /**
     * Добавляет правило алерта
     */
    addRule(rule: AlertRule): void;
    /**
     * Обновляет правило алерта
     */
    updateRule(ruleId: string, updates: Partial<AlertRule>): void;
    /**
     * Удаляет правило алерта
     */
    removeRule(ruleId: string): void;
    /**
     * Конфигурирует канал уведомлений
     */
    configureChannel(config: AlertChannelConfig): void;
    /**
     * Обрабатывает ошибку для алертов
     */
    processError(error: BaseError, source?: string, additionalContext?: Record<string, any>): Promise<void>;
    /**
     * Обрабатывает метрику для алертов
     */
    processMetric(metricName: string, value: number, labels?: Record<string, string>, source?: string): Promise<void>;
    /**
     * Создает алерт вручную
     */
    createAlert(ruleId: string, title: string, message: string, severity: AlertSeverity, source: string, context?: Record<string, any>): Promise<string>;
    /**
     * Разрешает алерт
     */
    resolveAlert(alertId: string, reason?: string): Promise<void>;
    /**
     * Подавляет алерты по правилу
     */
    suppressRule(ruleId: string, durationMinutes: number, reason: string): void;
    /**
     * Включает/выключает режим обслуживания
     */
    setMaintenanceMode(enabled: boolean, reason?: string): void;
    /**
     * Создает инцидент из алерта
     */
    createIncident(alertId: string, title: string, description: string, severity?: AlertSeverity): string;
    /**
     * Получает активные алерты
     */
    getActiveAlerts(): Alert[];
    /**
     * Получает алерты по фильтрам
     */
    getAlerts(filters?: {
        severity?: AlertSeverity;
        source?: string;
        status?: string;
        timeframe?: number;
    }): Alert[];
    /**
     * Получает статистику алертов
     */
    getAlertStatistics(hoursBack?: number): {
        total: number;
        bySeverity: Record<AlertSeverity, number>;
        bySource: Record<string, number>;
        byStatus: Record<string, number>;
        resolution: {
            averageMinutes: number;
            total: number;
        };
    };
    /**
     * Тестирует канал уведомлений
     */
    testChannel(channel: AlertChannel, testMessage?: string): Promise<boolean>;
    /**
     * Основной метод создания алерта
     */
    private triggerAlert;
    /**
     * Находит правила, подходящие под ошибку
     */
    private findMatchingRules;
    /**
     * Находит правила для метрик
     */
    private findMetricMatchingRules;
    /**
     * Отправляет уведомления о алерте
     */
    private sendAlertNotifications;
    /**
     * Отправляет уведомление через конкретный канал
     */
    private sendNotification;
    /**
     * Отправляет уведомление в консоль
     */
    private sendConsoleNotification;
    /**
     * Заглушки для других каналов (нужно реализовать)
     */
    private sendEmailNotification;
    private sendSlackNotification;
    private sendWebhookNotification;
    /**
     * Вспомогательные методы
     */
    private setupDefaultRules;
    private setupEscalation;
    private sendEscalationNotification;
    private sendResolutionNotification;
    private isRuleSuppressed;
    private checkRateLimit;
    private createFingerprint;
    private findDuplicateAlert;
    private shouldCreateDuplicate;
    private initializeDeliveryStatus;
    private formatErrorMessage;
    private getSeverityEmoji;
    private generateId;
    private cleanupHistory;
    private startMaintenanceTasks;
}
/**
 * Инициализирует глобальный alert manager
 */
export declare function initializeAlertManager(): AlertManager;
/**
 * Получает глобальный alert manager
 */
export declare function getAlertManager(): AlertManager;
/**
 * Удобная функция для отправки алерта
 */
export declare function sendAlert(severity: AlertSeverity, title: string, message: string, source?: string): Promise<void>;
