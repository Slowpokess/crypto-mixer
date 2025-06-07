import { EventEmitter } from 'events';
import { Alert, NotificationChannel, NotificationChannelConfig } from './AlertManager';
/**
 * Интерфейс для отправки уведомлений
 */
export interface NotificationProvider {
    type: NotificationChannel;
    send(alert: Alert, config: any): Promise<void>;
    validateConfig(config: any): boolean;
}
/**
 * Результат отправки уведомления
 */
export interface NotificationResult {
    success: boolean;
    channel: NotificationChannel;
    alertId: string;
    timestamp: Date;
    error?: string;
    retryCount?: number;
    responseTime?: number;
}
/**
 * Статистика уведомлений
 */
export interface NotificationStats {
    totalSent: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
    channelStats: Record<NotificationChannel, {
        sent: number;
        successful: number;
        failed: number;
        averageResponseTime: number;
    }>;
}
/**
 * Webhook провайдер
 */
export declare class WebhookProvider implements NotificationProvider {
    type: NotificationChannel;
    send(alert: Alert, config: any): Promise<void>;
    validateConfig(config: any): boolean;
}
/**
 * Email провайдер
 */
export declare class EmailProvider implements NotificationProvider {
    type: NotificationChannel;
    send(alert: Alert, config: any): Promise<void>;
    validateConfig(config: any): boolean;
    private formatEmailBody;
    private formatEmailBodyText;
}
/**
 * Slack провайдер
 */
export declare class SlackProvider implements NotificationProvider {
    type: NotificationChannel;
    send(alert: Alert, config: any): Promise<void>;
    validateConfig(config: any): boolean;
    private formatSlackText;
    private formatSlackAttachment;
}
/**
 * Telegram провайдер
 */
export declare class TelegramProvider implements NotificationProvider {
    type: NotificationChannel;
    send(alert: Alert, config: any): Promise<void>;
    validateConfig(config: any): boolean;
    private formatTelegramMessage;
}
/**
 * Менеджер уведомлений
 * Управляет отправкой уведомлений через различные каналы
 */
export declare class NotificationManager extends EventEmitter {
    private providers;
    private stats;
    private isRunning;
    constructor();
    /**
     * Запуск менеджера уведомлений
     */
    start(): Promise<void>;
    /**
     * Остановка менеджера уведомлений
     */
    stop(): Promise<void>;
    /**
     * Отправка уведомления
     */
    sendNotification(alert: Alert, channel: NotificationChannelConfig): Promise<NotificationResult>;
    /**
     * Отправка уведомлений по всем каналам
     */
    sendToAllChannels(alert: Alert, channels: NotificationChannelConfig[]): Promise<NotificationResult[]>;
    /**
     * Обновление статистики
     */
    private updateStats;
    /**
     * Получение статистики
     */
    getStats(): NotificationStats;
    /**
     * Сброс статистики
     */
    resetStats(): void;
    /**
     * Проверка работоспособности канала
     */
    testChannel(channel: NotificationChannelConfig): Promise<boolean>;
    /**
     * Получение доступных провайдеров
     */
    getAvailableProviders(): NotificationChannel[];
    /**
     * Регистрация нового провайдера
     */
    registerProvider(provider: NotificationProvider): void;
    /**
     * Получение статуса работы
     */
    isActive(): boolean;
    /**
     * Утилита для задержки
     */
    private sleep;
}
export default NotificationManager;
