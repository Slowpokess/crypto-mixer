/**
 * Централизованный обработчик ошибок для криптомиксера
 *
 * Обеспечивает:
 * - Автоматическое логирование всех ошибок
 * - Retry логику для восстанавливаемых ошибок
 * - Алерты для критических ошибок
 * - Метрики производительности
 * - Audit trail для всех операций
 */
import winston from 'winston';
import { EventEmitter } from 'events';
import { BaseError, ErrorContext, ErrorRecoveryStrategy } from './ErrorTypes';
export interface ErrorMetrics {
    totalErrors: number;
    errorsByCategory: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    errorsByCode: Record<string, number>;
    criticalErrorsCount: number;
    recoverableErrorsCount: number;
    lastError?: {
        timestamp: Date;
        code: string;
        message: string;
        severity: string;
    };
}
export interface AlertConfig {
    enabled: boolean;
    webhookUrl?: string;
    emailRecipients?: string[];
    slackChannel?: string;
    criticalErrorThreshold: number;
    errorRateThreshold: number;
    timeWindowMinutes: number;
}
export interface RetryResult<T = any> {
    success: boolean;
    result?: T;
    error?: BaseError;
    attempts: number;
    totalTime: number;
}
/**
 * Централизованный обработчик ошибок
 */
export declare class ErrorHandler extends EventEmitter {
    private logger;
    private metrics;
    private alertConfig;
    private errorHistory;
    private readonly maxHistorySize;
    constructor(logger: winston.Logger, alertConfig?: Partial<AlertConfig>);
    /**
     * Основной метод обработки ошибок
     */
    handleError(error: Error | BaseError, context?: Partial<ErrorContext>): Promise<void>;
    /**
     * Выполняет операцию с автоматическим retry при ошибках
     */
    executeWithRetry<T>(operation: () => Promise<T>, context: Partial<ErrorContext>, customRetryStrategy?: Partial<ErrorRecoveryStrategy>): Promise<RetryResult<T>>;
    /**
     * Получение текущих метрик ошибок
     */
    getMetrics(): ErrorMetrics;
    /**
     * Получение последних ошибок
     */
    getRecentErrors(limit?: number): BaseError[];
    /**
     * Получение статистики по категориям ошибок
     */
    getErrorStatistics(timeWindowHours?: number): {
        totalInWindow: number;
        byCategory: Record<string, number>;
        bySeverity: Record<string, number>;
        criticalCount: number;
        averagePerHour: number;
    };
    /**
     * Очистка истории ошибок
     */
    clearHistory(): void;
    /**
     * Нормализует любую ошибку в BaseError
     */
    private normalizeError;
    /**
     * Логирует ошибку в соответствии с ее серьезностью
     */
    private logError;
    /**
     * Обновляет метрики ошибок
     */
    private updateMetrics;
    /**
     * Добавляет ошибку в историю
     */
    private addToHistory;
    /**
     * Проверяет и отправляет алерты при необходимости
     */
    private checkAndSendAlerts;
    /**
     * Отправляет алерт
     */
    private sendAlert;
    /**
     * Инициализирует метрики
     */
    private initializeMetrics;
    /**
     * Настраивает слушатели событий
     */
    private setupEventListeners;
    /**
     * Задержка для retry логики
     */
    private delay;
}
/**
 * Инициализирует глобальный error handler
 */
export declare function initializeErrorHandler(logger: winston.Logger, alertConfig?: Partial<AlertConfig>): ErrorHandler;
/**
 * Получает глобальный error handler
 */
export declare function getErrorHandler(): ErrorHandler;
/**
 * Удобная функция для обработки ошибок
 */
export declare function handleError(error: Error | BaseError, context?: Partial<ErrorContext>): Promise<void>;
/**
 * Удобная функция для retry операций
 */
export declare function withRetry<T>(operation: () => Promise<T>, context: Partial<ErrorContext>, retryStrategy?: Partial<ErrorRecoveryStrategy>): Promise<RetryResult<T>>;
