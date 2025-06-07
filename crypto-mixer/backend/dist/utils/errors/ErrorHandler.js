"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
exports.initializeErrorHandler = initializeErrorHandler;
exports.getErrorHandler = getErrorHandler;
exports.handleError = handleError;
exports.withRetry = withRetry;
const events_1 = require("events");
const ErrorTypes_1 = require("./ErrorTypes");
/**
 * Централизованный обработчик ошибок
 */
class ErrorHandler extends events_1.EventEmitter {
    constructor(logger, alertConfig = {}) {
        super();
        this.errorHistory = [];
        this.maxHistorySize = 1000;
        this.logger = logger;
        this.alertConfig = {
            enabled: true,
            criticalErrorThreshold: 5,
            errorRateThreshold: 50,
            timeWindowMinutes: 15,
            ...alertConfig
        };
        this.metrics = this.initializeMetrics();
        this.setupEventListeners();
    }
    /**
     * Основной метод обработки ошибок
     */
    async handleError(error, context = {}) {
        const processedError = this.normalizeError(error, context);
        // Обновляем метрики
        this.updateMetrics(processedError);
        // Добавляем в историю
        this.addToHistory(processedError);
        // Логируем ошибку
        await this.logError(processedError);
        // Проверяем необходимость алертов
        await this.checkAndSendAlerts(processedError);
        // Эмитим событие для внешних слушателей
        this.emit('error', processedError);
        // Если ошибка критическая и не операционная - эмитим специальное событие
        if (processedError.severity === ErrorTypes_1.ErrorSeverity.CRITICAL && !processedError.isOperational) {
            this.emit('criticalError', processedError);
        }
    }
    /**
     * Выполняет операцию с автоматическим retry при ошибках
     */
    async executeWithRetry(operation, context, customRetryStrategy) {
        const startTime = Date.now();
        let lastError;
        let attempts = 0;
        const defaultStrategy = {
            canRecover: true,
            maxRetries: 3,
            retryDelay: 1000,
            ...customRetryStrategy
        };
        while (attempts <= (defaultStrategy.maxRetries || 0)) {
            attempts++;
            try {
                const result = await operation();
                // Логируем успешное выполнение после retry
                if (attempts > 1) {
                    this.logger.info('Операция выполнена успешно после retry', {
                        context: context.component,
                        operation: context.operation,
                        attempts,
                        totalTime: Date.now() - startTime
                    });
                }
                return {
                    success: true,
                    result,
                    attempts,
                    totalTime: Date.now() - startTime
                };
            }
            catch (error) {
                lastError = this.normalizeError(error, {
                    ...context,
                    additionalInfo: { attempt: attempts, maxRetries: defaultStrategy.maxRetries }
                });
                // Если это последняя попытка или ошибка не восстанавливаемая
                if (attempts > (defaultStrategy.maxRetries || 0) || !lastError.canRecover()) {
                    await this.handleError(lastError);
                    break;
                }
                // Логируем попытку retry
                this.logger.warn('Попытка retry после ошибки', {
                    error: lastError.toLogObject(),
                    attempt: attempts,
                    maxRetries: defaultStrategy.maxRetries,
                    nextRetryIn: defaultStrategy.retryDelay
                });
                // Ждем перед следующей попыткой
                if (defaultStrategy.retryDelay) {
                    await this.delay(defaultStrategy.retryDelay * attempts); // Экспоненциальная задержка
                }
            }
        }
        return {
            success: false,
            error: lastError,
            attempts,
            totalTime: Date.now() - startTime
        };
    }
    /**
     * Получение текущих метрик ошибок
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Получение последних ошибок
     */
    getRecentErrors(limit = 50) {
        return this.errorHistory.slice(-limit);
    }
    /**
     * Получение статистики по категориям ошибок
     */
    getErrorStatistics(timeWindowHours = 24) {
        const cutoffTime = new Date(Date.now() - (timeWindowHours * 60 * 60 * 1000));
        const recentErrors = this.errorHistory.filter(error => error.timestamp > cutoffTime);
        const byCategory = {};
        const bySeverity = {};
        let criticalCount = 0;
        recentErrors.forEach(error => {
            byCategory[error.category] = (byCategory[error.category] || 0) + 1;
            bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
            if (error.severity === ErrorTypes_1.ErrorSeverity.CRITICAL) {
                criticalCount++;
            }
        });
        return {
            totalInWindow: recentErrors.length,
            byCategory,
            bySeverity,
            criticalCount,
            averagePerHour: recentErrors.length / timeWindowHours
        };
    }
    /**
     * Очистка истории ошибок
     */
    clearHistory() {
        this.errorHistory = [];
        this.metrics = this.initializeMetrics();
    }
    /**
     * Нормализует любую ошибку в BaseError
     */
    normalizeError(error, context) {
        if (error instanceof ErrorTypes_1.BaseError) {
            // Обновляем контекст существующей ошибки
            const updatedContext = { ...error.context, ...context };
            error.context = updatedContext;
            return error;
        }
        // Создаем новую типизированную ошибку из обычной Error
        const UnknownError = class extends ErrorTypes_1.BaseError {
            constructor(message, originalError) {
                super(message, ErrorTypes_1.ErrorCode.UNKNOWN_ERROR, ErrorTypes_1.ErrorSeverity.MEDIUM, ErrorTypes_1.ErrorCategory.PERFORMANCE, {
                    timestamp: new Date(),
                    component: 'unknown',
                    operation: 'unknown',
                    additionalInfo: {
                        originalErrorName: originalError.name,
                        originalStack: originalError.stack
                    },
                    ...context
                });
            }
        };
        return new UnknownError(error.message || 'Неизвестная ошибка', error);
    }
    /**
     * Логирует ошибку в соответствии с ее серьезностью
     */
    async logError(error) {
        const logObject = error.toLogObject();
        switch (error.severity) {
            case ErrorTypes_1.ErrorSeverity.CRITICAL:
                this.logger.error('🚨 КРИТИЧЕСКАЯ ОШИБКА', logObject);
                break;
            case ErrorTypes_1.ErrorSeverity.HIGH:
                this.logger.error('❌ Серьезная ошибка', logObject);
                break;
            case ErrorTypes_1.ErrorSeverity.MEDIUM:
                this.logger.warn('⚠️ Умеренная ошибка', logObject);
                break;
            case ErrorTypes_1.ErrorSeverity.LOW:
                this.logger.info('ℹ️ Незначительная ошибка', logObject);
                break;
        }
    }
    /**
     * Обновляет метрики ошибок
     */
    updateMetrics(error) {
        this.metrics.totalErrors++;
        this.metrics.errorsByCategory[error.category] =
            (this.metrics.errorsByCategory[error.category] || 0) + 1;
        this.metrics.errorsBySeverity[error.severity] =
            (this.metrics.errorsBySeverity[error.severity] || 0) + 1;
        this.metrics.errorsByCode[error.code] =
            (this.metrics.errorsByCode[error.code] || 0) + 1;
        if (error.severity === ErrorTypes_1.ErrorSeverity.CRITICAL) {
            this.metrics.criticalErrorsCount++;
        }
        if (error.canRecover()) {
            this.metrics.recoverableErrorsCount++;
        }
        this.metrics.lastError = {
            timestamp: error.timestamp,
            code: error.code,
            message: error.message,
            severity: error.severity
        };
    }
    /**
     * Добавляет ошибку в историю
     */
    addToHistory(error) {
        this.errorHistory.push(error);
        // Ограничиваем размер истории
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
        }
    }
    /**
     * Проверяет и отправляет алерты при необходимости
     */
    async checkAndSendAlerts(error) {
        if (!this.alertConfig.enabled) {
            return;
        }
        // Алерт для критических ошибок
        if (error.severity === ErrorTypes_1.ErrorSeverity.CRITICAL) {
            await this.sendAlert('critical', `🚨 Критическая ошибка: ${error.message}`, error);
        }
        // Проверка порога критических ошибок за время окна
        const recentCriticalErrors = this.getErrorStatistics(this.alertConfig.timeWindowMinutes / 60).criticalCount;
        if (recentCriticalErrors >= this.alertConfig.criticalErrorThreshold) {
            await this.sendAlert('threshold', `⚠️ Превышен порог критических ошибок: ${recentCriticalErrors} за ${this.alertConfig.timeWindowMinutes} минут`, error);
        }
    }
    /**
     * Отправляет алерт
     */
    async sendAlert(type, message, error) {
        try {
            this.emit('alert', { type, message, error });
            this.logger.error('📢 АЛЕРТ ОТПРАВЛЕН', {
                alertType: type,
                message,
                error: error.toLogObject()
            });
        }
        catch (alertError) {
            this.logger.error('Ошибка отправки алерта', alertError);
        }
    }
    /**
     * Инициализирует метрики
     */
    initializeMetrics() {
        return {
            totalErrors: 0,
            errorsByCategory: {},
            errorsBySeverity: {},
            errorsByCode: {},
            criticalErrorsCount: 0,
            recoverableErrorsCount: 0
        };
    }
    /**
     * Настраивает слушатели событий
     */
    setupEventListeners() {
        // Слушаем критические ошибки для немедленного реагирования
        this.on('criticalError', (error) => {
            this.logger.error('🆘 НЕМЕДЛЕННОЕ ВНИМАНИЕ ТРЕБУЕТСЯ', {
                message: 'Критическая не-операционная ошибка',
                error: error.toLogObject(),
                action: 'Требуется ручное вмешательство'
            });
        });
    }
    /**
     * Задержка для retry логики
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ErrorHandler = ErrorHandler;
/**
 * Глобальный экземпляр error handler'а
 */
let globalErrorHandler = null;
/**
 * Инициализирует глобальный error handler
 */
function initializeErrorHandler(logger, alertConfig) {
    globalErrorHandler = new ErrorHandler(logger, alertConfig);
    return globalErrorHandler;
}
/**
 * Получает глобальный error handler
 */
function getErrorHandler() {
    if (!globalErrorHandler) {
        throw new Error('ErrorHandler не инициализирован. Вызовите initializeErrorHandler() сначала.');
    }
    return globalErrorHandler;
}
/**
 * Удобная функция для обработки ошибок
 */
async function handleError(error, context) {
    const handler = getErrorHandler();
    await handler.handleError(error, context);
}
/**
 * Удобная функция для retry операций
 */
async function withRetry(operation, context, retryStrategy) {
    const handler = getErrorHandler();
    return handler.executeWithRetry(operation, context, retryStrategy);
}
//# sourceMappingURL=ErrorHandler.js.map