import { EventEmitter } from 'events';
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
        interval: number;
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
            start: string;
            end: string;
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
    duration?: number;
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
export declare class AlertManager extends EventEmitter {
    private config;
    private isRunning;
    private activeAlerts;
    private alertHistory;
    private alertRules;
    private throttleCounters;
    private escalationTimers;
    constructor(config?: Partial<AlertManagerConfig>);
    /**
     * Создание полной конфигурации с дефолтными значениями
     */
    private buildConfig;
    /**
     * Получение дефолтных каналов уведомлений
     */
    private getDefaultChannels;
    /**
     * Получение дефолтных правил алертинга
     */
    private getDefaultRules;
    /**
     * Инициализация правил алертинга
     */
    private initializeRules;
    /**
     * Запуск Alert Manager
     */
    start(): Promise<void>;
    /**
     * Остановка Alert Manager
     */
    stop(): Promise<void>;
    /**
     * Создание нового алерта
     */
    createAlert(type: AlertType, severity: AlertSeverity, title: string, description: string, source: string, metadata?: Record<string, any>): Promise<Alert>;
    /**
     * Обработка алерта и отправка уведомлений
     */
    private processAlert;
    /**
     * Поиск правил, соответствующих алерту
     */
    private findMatchingRules;
    /**
     * Проверка throttling
     */
    private checkThrottle;
    /**
     * Проверка quiet hours
     */
    private isQuietHours;
    /**
     * Отправка уведомлений
     */
    private sendNotifications;
    /**
     * Отправка уведомления в конкретный канал
     */
    private sendNotificationToChannel;
    /**
     * Отправка webhook уведомления
     */
    private sendWebhookNotification;
    /**
     * Отправка email уведомления
     */
    private sendEmailNotification;
    /**
     * Отправка Slack уведомления
     */
    private sendSlackNotification;
    /**
     * Форматирование email тела
     */
    private formatEmailBody;
    /**
     * Форматирование Slack сообщения
     */
    private formatSlackMessage;
    /**
     * Получение цвета для уровня важности
     */
    private getSeverityColor;
    /**
     * Настройка эскалации
     */
    private setupEscalation;
    /**
     * Эскалация алерта
     */
    private escalateAlert;
    /**
     * Обновление счетчика throttling
     */
    private updateThrottleCounter;
    /**
     * Сброс счетчиков throttling
     */
    private resetThrottleCounters;
    /**
     * Подтверждение алерта
     */
    acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean>;
    /**
     * Разрешение алерта
     */
    resolveAlert(alertId: string): Promise<boolean>;
    /**
     * Отмена эскалации
     */
    private cancelEscalation;
    /**
     * Очистка старых алертов
     */
    private cleanupOldAlerts;
    /**
     * Генерация ID алерта
     */
    private generateAlertId;
    /**
     * Получение активных алертов
     */
    getActiveAlerts(): Alert[];
    /**
     * Получение истории алертов
     */
    getAlertHistory(): Alert[];
    /**
     * Получение статистики алертов
     */
    getAlertStatistics(): {
        activeCount: number;
        totalCount: number;
        severityDistribution: Record<AlertSeverity, number>;
        typeDistribution: Record<AlertType, number>;
    };
    /**
     * Получение статуса работы
     */
    isActive(): boolean;
    /**
     * Получение конфигурации
     */
    getConfig(): AlertManagerConfig;
    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig: Partial<AlertManagerConfig>): void;
}
export default AlertManager;
