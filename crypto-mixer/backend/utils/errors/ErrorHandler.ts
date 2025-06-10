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

import * as winston from 'winston';
import { EventEmitter } from 'events';
import { 
  BaseError, 
  ErrorSeverity, 
  ErrorCategory, 
  ErrorCode,
  ErrorContext,
  ErrorRecoveryStrategy 
} from './ErrorTypes';

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
export class ErrorHandler extends EventEmitter {
  private logger: winston.Logger;
  private metrics: ErrorMetrics;
  private alertConfig: AlertConfig;
  private errorHistory: BaseError[] = [];
  private readonly maxHistorySize = 1000;

  constructor(
    logger: winston.Logger,
    alertConfig: Partial<AlertConfig> = {}
  ) {
    super();
    
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
  public async handleError(
    error: Error | BaseError,
    context: Partial<ErrorContext> = {}
  ): Promise<void> {
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
    if (processedError.severity === ErrorSeverity.CRITICAL && !processedError.isOperational) {
      this.emit('criticalError', processedError);
    }
  }

  /**
   * Выполняет операцию с автоматическим retry при ошибках
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext>,
    customRetryStrategy?: Partial<ErrorRecoveryStrategy>
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: BaseError | undefined;
    let attempts = 0;

    const defaultStrategy: ErrorRecoveryStrategy = {
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
        
      } catch (error) {
        lastError = this.normalizeError(error as Error, {
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
  public getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Получение последних ошибок
   */
  public getRecentErrors(limit: number = 50): BaseError[] {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Получение статистики по категориям ошибок
   */
  public getErrorStatistics(timeWindowHours: number = 24): {
    totalInWindow: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    criticalCount: number;
    averagePerHour: number;
  } {
    const cutoffTime = new Date(Date.now() - (timeWindowHours * 60 * 60 * 1000));
    const recentErrors = this.errorHistory.filter(error => error.timestamp > cutoffTime);

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let criticalCount = 0;

    recentErrors.forEach(error => {
      byCategory[error.category] = (byCategory[error.category] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      
      if (error.severity === ErrorSeverity.CRITICAL) {
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
  public clearHistory(): void {
    this.errorHistory = [];
    this.metrics = this.initializeMetrics();
  }

  /**
   * Нормализует любую ошибку в BaseError
   */
  private normalizeError(error: Error | BaseError, context: Partial<ErrorContext>): BaseError {
    if (error instanceof BaseError) {
      // Обновляем контекст существующей ошибки
      const updatedContext = { ...error.context, ...context };
      (error as any).context = updatedContext;
      return error;
    }

    // Создаем новую типизированную ошибку из обычной Error
    const UnknownError = class extends BaseError {
      constructor(message: string, originalError: Error) {
        super(
          message,
          ErrorCode.UNKNOWN_ERROR,
          ErrorSeverity.MEDIUM,
          ErrorCategory.PERFORMANCE,
          {
            timestamp: new Date(),
            component: 'unknown',
            operation: 'unknown',
            additionalInfo: {
              originalErrorName: originalError.name,
              originalStack: originalError.stack
            },
            ...context
          }
        );
      }
    };

    return new UnknownError(error.message || 'Неизвестная ошибка', error);
  }

  /**
   * Логирует ошибку в соответствии с ее серьезностью
   */
  private async logError(error: BaseError): Promise<void> {
    const logObject = error.toLogObject();
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error('🚨 КРИТИЧЕСКАЯ ОШИБКА', logObject);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error('❌ Серьезная ошибка', logObject);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn('⚠️ Умеренная ошибка', logObject);
        break;
      case ErrorSeverity.LOW:
        this.logger.info('ℹ️ Незначительная ошибка', logObject);
        break;
    }
  }

  /**
   * Обновляет метрики ошибок
   */
  private updateMetrics(error: BaseError): void {
    this.metrics.totalErrors++;
    
    this.metrics.errorsByCategory[error.category] = 
      (this.metrics.errorsByCategory[error.category] || 0) + 1;
    
    this.metrics.errorsBySeverity[error.severity] = 
      (this.metrics.errorsBySeverity[error.severity] || 0) + 1;
    
    this.metrics.errorsByCode[error.code] = 
      (this.metrics.errorsByCode[error.code] || 0) + 1;

    if (error.severity === ErrorSeverity.CRITICAL) {
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
  private addToHistory(error: BaseError): void {
    this.errorHistory.push(error);
    
    // Ограничиваем размер истории
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Проверяет и отправляет алерты при необходимости
   */
  private async checkAndSendAlerts(error: BaseError): Promise<void> {
    if (!this.alertConfig.enabled) {
      return;
    }

    // Алерт для критических ошибок
    if (error.severity === ErrorSeverity.CRITICAL) {
      await this.sendAlert('critical', `🚨 Критическая ошибка: ${error.message}`, error);
    }

    // Проверка порога критических ошибок за время окна
    const recentCriticalErrors = this.getErrorStatistics(
      this.alertConfig.timeWindowMinutes / 60
    ).criticalCount;

    if (recentCriticalErrors >= this.alertConfig.criticalErrorThreshold) {
      await this.sendAlert(
        'threshold', 
        `⚠️ Превышен порог критических ошибок: ${recentCriticalErrors} за ${this.alertConfig.timeWindowMinutes} минут`,
        error
      );
    }
  }

  /**
   * Отправляет алерт
   */
  private async sendAlert(type: string, message: string, error: BaseError): Promise<void> {
    try {
      this.emit('alert', { type, message, error });
      
      this.logger.error('📢 АЛЕРТ ОТПРАВЛЕН', {
        alertType: type,
        message,
        error: error.toLogObject()
      });
      
    } catch (alertError) {
      this.logger.error('Ошибка отправки алерта', alertError);
    }
  }

  /**
   * Инициализирует метрики
   */
  private initializeMetrics(): ErrorMetrics {
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
  private setupEventListeners(): void {
    // Слушаем критические ошибки для немедленного реагирования
    this.on('criticalError', (error: BaseError) => {
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
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Глобальный экземпляр error handler'а
 */
let globalErrorHandler: ErrorHandler | null = null;

/**
 * Инициализирует глобальный error handler
 */
export function initializeErrorHandler(
  logger: winston.Logger, 
  alertConfig?: Partial<AlertConfig>
): ErrorHandler {
  globalErrorHandler = new ErrorHandler(logger, alertConfig);
  return globalErrorHandler;
}

/**
 * Получает глобальный error handler
 */
export function getErrorHandler(): ErrorHandler {
  if (!globalErrorHandler) {
    throw new Error('ErrorHandler не инициализирован. Вызовите initializeErrorHandler() сначала.');
  }
  return globalErrorHandler;
}

/**
 * Удобная функция для обработки ошибок
 */
export async function handleError(
  error: Error | BaseError,
  context?: Partial<ErrorContext>
): Promise<void> {
  const handler = getErrorHandler();
  await handler.handleError(error, context);
}

/**
 * Удобная функция для retry операций
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: Partial<ErrorContext>,
  retryStrategy?: Partial<ErrorRecoveryStrategy>
): Promise<RetryResult<T>> {
  const handler = getErrorHandler();
  return handler.executeWithRetry(operation, context, retryStrategy);
}