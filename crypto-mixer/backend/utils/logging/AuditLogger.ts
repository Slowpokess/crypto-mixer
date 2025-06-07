/**
 * Comprehensive Audit Logging System для криптомиксера
 * 
 * Обеспечивает:
 * - Полный audit trail всех критических операций
 * - Структурированное логирование с контекстом
 * - Защищенное хранение логов с целостностью
 * - Compliance с требованиями безопасности
 * - Performance metrics и tracing
 * - Автоматическая ротация и архивация логов
 */

import winston from 'winston';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { BaseError, ErrorSeverity } from '../errors/ErrorTypes';

export enum AuditEventType {
  // Аутентификация и авторизация
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  ACCESS_DENIED = 'access_denied',
  PERMISSION_GRANTED = 'permission_granted',
  
  // Операции микширования
  MIX_REQUEST_CREATED = 'mix_request_created',
  MIX_REQUEST_PROCESSED = 'mix_request_processed',
  MIX_REQUEST_COMPLETED = 'mix_request_completed',
  MIX_REQUEST_FAILED = 'mix_request_failed',
  MIX_POOL_JOINED = 'mix_pool_joined',
  MIX_POOL_LEFT = 'mix_pool_left',
  
  // Криптографические операции
  KEY_GENERATED = 'key_generated',
  KEY_ROTATED = 'key_rotated',
  ENCRYPTION_PERFORMED = 'encryption_performed',
  DECRYPTION_PERFORMED = 'decryption_performed',
  SIGNATURE_CREATED = 'signature_created',
  SIGNATURE_VERIFIED = 'signature_verified',
  
  // Блокчейн операции
  TRANSACTION_CREATED = 'transaction_created',
  TRANSACTION_BROADCAST = 'transaction_broadcast',
  TRANSACTION_CONFIRMED = 'transaction_confirmed',
  ADDRESS_GENERATED = 'address_generated',
  BALANCE_CHECKED = 'balance_checked',
  
  // Административные операции
  CONFIG_CHANGED = 'config_changed',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  DATABASE_MIGRATION = 'database_migration',
  BACKUP_CREATED = 'backup_created',
  BACKUP_RESTORED = 'backup_restored',
  
  // Безопасность
  SECURITY_VIOLATION = 'security_violation',
  INTRUSION_ATTEMPT = 'intrusion_attempt',
  HSM_ACCESS = 'hsm_access',
  VAULT_ACCESS = 'vault_access',
  
  // Системные события
  SERVICE_STARTED = 'service_started',
  SERVICE_STOPPED = 'service_stopped',
  ERROR_OCCURRED = 'error_occurred',
  PERFORMANCE_ALERT = 'performance_alert'
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning', 
  CRITICAL = 'critical',
  SECURITY = 'security'
}

export interface AuditContext {
  // Идентификация
  userId?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  
  // Технический контекст
  component: string;
  operation: string;
  version?: string;
  
  // Сетевой контекст
  ipAddress?: string;
  userAgent?: string;
  geolocation?: string;
  
  // Бизнес контекст
  entityId?: string;
  entityType?: string;
  amount?: number;
  currency?: string;
  
  // Производительность
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  memoryUsage?: number;
  
  // Дополнительные данные
  metadata?: Record<string, any>;
}

export interface AuditEvent {
  // Основные поля
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  success: boolean;
  
  // Контекст
  context: AuditContext;
  
  // Сообщение и детали
  message: string;
  details?: Record<string, any>;
  
  // Безопасность
  integrity: string;
  encrypted: boolean;
  
  // Связанные события
  parentEventId?: string;
  childEventIds?: string[];
}

export interface AuditMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsPerHour: number;
  securityEventsCount: number;
  errorEventsCount: number;
  averageResponseTime: number;
  lastEvent?: {
    timestamp: Date;
    type: string;
    severity: string;
  };
}

export interface AuditConfig {
  enabled: boolean;
  encryptLogs: boolean;
  enableIntegrityCheck: boolean;
  retentionDays: number;
  maxFileSize: string;
  maxFiles: number;
  enableCompression: boolean;
  enableRemoteLogging: boolean;
  remoteEndpoint?: string;
  securityKey?: string;
}

/**
 * Comprehensive Audit Logger
 */
export class AuditLogger extends EventEmitter {
  private logger: winston.Logger;
  private config: AuditConfig;
  private metrics: AuditMetrics;
  private encryptionKey: Buffer;
  private eventHistory: AuditEvent[] = [];
  private readonly maxHistorySize = 10000;

  constructor(config: Partial<AuditConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      encryptLogs: false,
      enableIntegrityCheck: true,
      retentionDays: 90,
      maxFileSize: '100mb',
      maxFiles: 50,
      enableCompression: true,
      enableRemoteLogging: false,
      ...config
    };

    this.metrics = this.initializeMetrics();
    this.encryptionKey = this.generateEncryptionKey();
    this.logger = this.createAuditLogger();
    
    this.setupPeriodicMetricsReport();
  }

  /**
   * Логирует audit событие
   */
  public async logEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    message: string,
    context: Partial<AuditContext>,
    success: boolean = true,
    details?: Record<string, any>
  ): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const eventId = this.generateEventId();
    const timestamp = new Date();
    
    const auditEvent: AuditEvent = {
      id: eventId,
      timestamp,
      eventType,
      severity,
      success,
      message,
      context: this.enrichContext(context),
      details: this.sanitizeDetails(details),
      integrity: '',
      encrypted: this.config.encryptLogs,
      parentEventId: context.correlationId
    };

    // Генерируем integrity hash
    if (this.config.enableIntegrityCheck) {
      auditEvent.integrity = this.calculateIntegrity(auditEvent);
    }

    // Обновляем метрики
    this.updateMetrics(auditEvent);

    // Добавляем в историю
    this.addToHistory(auditEvent);

    // Логируем событие
    await this.writeAuditLog(auditEvent);

    // Эмитим событие для внешних слушателей
    this.emit('auditEvent', auditEvent);

    // Специальная обработка критических событий
    if (severity === AuditSeverity.CRITICAL || severity === AuditSeverity.SECURITY) {
      this.emit('criticalAuditEvent', auditEvent);
    }

    return eventId;
  }

  /**
   * Логирует начало операции с трассировкой
   */
  public async startOperation(
    operation: string,
    component: string,
    context: Partial<AuditContext> = {}
  ): Promise<string> {
    const operationId = this.generateEventId();
    
    await this.logEvent(
      AuditEventType.SERVICE_STARTED,
      AuditSeverity.INFO,
      `Начало операции: ${operation}`,
      {
        ...context,
        operation,
        component,
        correlationId: operationId,
        startTime: new Date()
      },
      true,
      { operationId }
    );

    return operationId;
  }

  /**
   * Логирует завершение операции
   */
  public async endOperation(
    operationId: string,
    success: boolean,
    context: Partial<AuditContext> = {},
    error?: BaseError
  ): Promise<void> {
    const endTime = new Date();
    const startEvent = this.findEventById(operationId);
    const duration = startEvent ? endTime.getTime() - startEvent.timestamp.getTime() : 0;

    await this.logEvent(
      success ? AuditEventType.SERVICE_STOPPED : AuditEventType.ERROR_OCCURRED,
      success ? AuditSeverity.INFO : AuditSeverity.CRITICAL,
      `Завершение операции: ${context.operation || 'unknown'}`,
      {
        ...context,
        correlationId: operationId,
        endTime,
        duration
      },
      success,
      {
        operationId,
        duration,
        error: error?.toLogObject()
      }
    );
  }

  /**
   * Логирует ошибку с полным контекстом
   */
  public async logError(
    error: BaseError,
    context: Partial<AuditContext> = {}
  ): Promise<void> {
    const severity = this.mapErrorSeverityToAuditSeverity(error.severity);
    
    await this.logEvent(
      AuditEventType.ERROR_OCCURRED,
      severity,
      `Ошибка: ${error.message}`,
      {
        ...context,
        component: error.context.component,
        operation: error.context.operation
      },
      false,
      {
        errorCode: error.code,
        errorCategory: error.category,
        errorStack: error.stack,
        canRecover: error.canRecover(),
        isOperational: error.isOperational,
        errorContext: error.context
      }
    );
  }

  /**
   * Логирует операцию микширования
   */
  public async logMixingOperation(
    eventType: AuditEventType,
    mixRequestId: string,
    amount: number,
    currency: string,
    context: Partial<AuditContext> = {},
    success: boolean = true,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent(
      eventType,
      success ? AuditSeverity.INFO : AuditSeverity.WARNING,
      `Операция микширования: ${eventType}`,
      {
        ...context,
        entityId: mixRequestId,
        entityType: 'mix_request',
        amount,
        currency
      },
      success,
      details
    );
  }

  /**
   * Логирует блокчейн операцию
   */
  public async logBlockchainOperation(
    eventType: AuditEventType,
    transactionId: string,
    currency: string,
    context: Partial<AuditContext> = {},
    success: boolean = true,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent(
      eventType,
      success ? AuditSeverity.INFO : AuditSeverity.WARNING,
      `Блокчейн операция: ${eventType}`,
      {
        ...context,
        entityId: transactionId,
        entityType: 'transaction',
        currency
      },
      success,
      details
    );
  }

  /**
   * Логирует событие безопасности
   */
  public async logSecurityEvent(
    eventType: AuditEventType,
    message: string,
    context: Partial<AuditContext> = {},
    success: boolean = false,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent(
      eventType,
      AuditSeverity.SECURITY,
      message,
      context,
      success,
      details
    );
  }

  /**
   * Получение текущих метрик
   */
  public getMetrics(): AuditMetrics {
    return { ...this.metrics };
  }

  /**
   * Получение последних событий
   */
  public getRecentEvents(limit: number = 100): AuditEvent[] {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Поиск событий по фильтрам
   */
  public findEvents(filters: {
    eventType?: AuditEventType;
    severity?: AuditSeverity;
    userId?: string;
    component?: string;
    timeFrom?: Date;
    timeTo?: Date;
    success?: boolean;
  }): AuditEvent[] {
    return this.eventHistory.filter(event => {
      if (filters.eventType && event.eventType !== filters.eventType) return false;
      if (filters.severity && event.severity !== filters.severity) return false;
      if (filters.userId && event.context.userId !== filters.userId) return false;
      if (filters.component && event.context.component !== filters.component) return false;
      if (filters.timeFrom && event.timestamp < filters.timeFrom) return false;
      if (filters.timeTo && event.timestamp > filters.timeTo) return false;
      if (filters.success !== undefined && event.success !== filters.success) return false;
      
      return true;
    });
  }

  /**
   * Проверка целостности логов
   */
  public verifyIntegrity(event: AuditEvent): boolean {
    if (!this.config.enableIntegrityCheck) {
      return true;
    }

    const calculatedIntegrity = this.calculateIntegrity(event);
    return calculatedIntegrity === event.integrity;
  }

  /**
   * Экспорт audit логов
   */
  public async exportLogs(
    format: 'json' | 'csv' = 'json',
    filters?: any
  ): Promise<string> {
    const events = filters ? this.findEvents(filters) : this.eventHistory;
    
    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else {
      // CSV export implementation
      const headers = ['timestamp', 'eventType', 'severity', 'success', 'message', 'component', 'operation'];
      const rows = events.map(event => [
        event.timestamp.toISOString(),
        event.eventType,
        event.severity,
        event.success,
        event.message,
        event.context.component,
        event.context.operation || ''
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  }

  /**
   * Создает Winston logger для audit логов
   */
  private createAuditLogger(): winston.Logger {
    const logDir = process.env.AUDIT_LOG_DIR || '/var/log/crypto-mixer/audit';
    
    const auditFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          ...meta
        });
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.File({
        filename: `${logDir}/audit.log`,
        format: auditFormat,
        maxsize: this.parseSize(this.config.maxFileSize),
        maxFiles: this.config.maxFiles,
        tailable: true
      })
    ];

    if (this.config.enableRemoteLogging && this.config.remoteEndpoint) {
      // Добавляем удаленное логирование если настроено
    }

    return winston.createLogger({
      level: 'info',
      format: auditFormat,
      transports,
      exitOnError: false
    });
  }

  /**
   * Записывает audit событие в лог
   */
  private async writeAuditLog(event: AuditEvent): Promise<void> {
    try {
      let logData = { ...event };
      
      // Шифруем если включено
      if (this.config.encryptLogs) {
        logData = this.encryptEventData(logData);
      }
      
      this.logger.info('AUDIT_EVENT', logData);
      
    } catch (error) {
      // Fallback логирование в случае ошибки
      console.error('Ошибка записи audit лога:', error);
      this.emit('error', error);
    }
  }

  /**
   * Обогащает контекст дополнительной информацией
   */
  private enrichContext(context: Partial<AuditContext>): AuditContext {
    return {
      component: 'unknown',
      operation: 'unknown',
      ...context,
      version: process.env.APP_VERSION || '1.0.0'
    };
  }

  /**
   * Очищает детали от чувствительной информации
   */
  private sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
    if (!details) return undefined;
    
    const sanitized = { ...details };
    const sensitiveFields = ['password', 'privateKey', 'secret', 'token', 'key'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Генерирует уникальный ID события
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Вычисляет hash целостности события
   */
  private calculateIntegrity(event: Omit<AuditEvent, 'integrity'>): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      message: event.message,
      context: event.context
    });
    
    return crypto
      .createHmac('sha256', this.encryptionKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Шифрует данные события
   */
  private encryptEventData(event: AuditEvent): any {
    // Упрощенная реализация шифрования
    // В продакшене нужно использовать более надежное шифрование
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(JSON.stringify(event), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted: true,
      data: encrypted,
      iv: iv.toString('hex'),
      algorithm: 'aes-256-cbc'
    };
  }

  /**
   * Генерирует ключ шифрования
   */
  private generateEncryptionKey(): Buffer {
    const key = this.config.securityKey || process.env.AUDIT_ENCRYPTION_KEY;
    if (key) {
      return Buffer.from(key, 'hex');
    }
    return crypto.randomBytes(32);
  }

  /**
   * Обновляет метрики
   */
  private updateMetrics(event: AuditEvent): void {
    this.metrics.totalEvents++;
    
    this.metrics.eventsByType[event.eventType] = 
      (this.metrics.eventsByType[event.eventType] || 0) + 1;
    
    this.metrics.eventsBySeverity[event.severity] = 
      (this.metrics.eventsBySeverity[event.severity] || 0) + 1;

    if (event.severity === AuditSeverity.SECURITY) {
      this.metrics.securityEventsCount++;
    }

    if (!event.success) {
      this.metrics.errorEventsCount++;
    }

    if (event.context.duration) {
      // Обновляем среднее время ответа
      const currentAvg = this.metrics.averageResponseTime;
      const totalEvents = this.metrics.totalEvents;
      this.metrics.averageResponseTime = 
        ((currentAvg * (totalEvents - 1)) + event.context.duration) / totalEvents;
    }

    this.metrics.lastEvent = {
      timestamp: event.timestamp,
      type: event.eventType,
      severity: event.severity
    };
  }

  /**
   * Добавляет событие в историю
   */
  private addToHistory(event: AuditEvent): void {
    this.eventHistory.push(event);
    
    // Ограничиваем размер истории
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Находит событие по ID
   */
  private findEventById(id: string): AuditEvent | undefined {
    return this.eventHistory.find(event => event.id === id);
  }

  /**
   * Конвертирует размер строку в байты
   */
  private parseSize(size: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };
    
    const match = size.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
    if (!match) return 5 * 1024 * 1024; // Default 5MB
    
    return parseInt(match[1]) * units[match[2]];
  }

  /**
   * Преобразует severity ошибки в audit severity
   */
  private mapErrorSeverityToAuditSeverity(errorSeverity: ErrorSeverity): AuditSeverity {
    switch (errorSeverity) {
      case ErrorSeverity.CRITICAL:
        return AuditSeverity.CRITICAL;
      case ErrorSeverity.HIGH:
        return AuditSeverity.CRITICAL;
      case ErrorSeverity.MEDIUM:
        return AuditSeverity.WARNING;
      case ErrorSeverity.LOW:
        return AuditSeverity.INFO;
      default:
        return AuditSeverity.INFO;
    }
  }

  /**
   * Инициализирует метрики
   */
  private initializeMetrics(): AuditMetrics {
    return {
      totalEvents: 0,
      eventsByType: {},
      eventsBySeverity: {},
      eventsPerHour: 0,
      securityEventsCount: 0,
      errorEventsCount: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Настраивает периодический отчет по метрикам
   */
  private setupPeriodicMetricsReport(): void {
    setInterval(() => {
      const stats = this.getMetrics();
      this.emit('metricsReport', stats);
      
      // Вычисляем события в час
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentEvents = this.eventHistory.filter(event => event.timestamp > hourAgo);
      this.metrics.eventsPerHour = recentEvents.length;
      
    }, 60 * 60 * 1000); // Каждый час
  }
}

/**
 * Глобальный экземпляр audit logger'а
 */
let globalAuditLogger: AuditLogger | null = null;

/**
 * Инициализирует глобальный audit logger
 */
export function initializeAuditLogger(config?: Partial<AuditConfig>): AuditLogger {
  globalAuditLogger = new AuditLogger(config);
  return globalAuditLogger;
}

/**
 * Получает глобальный audit logger
 */
export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    throw new Error('AuditLogger не инициализирован. Вызовите initializeAuditLogger() сначала.');
  }
  return globalAuditLogger;
}

/**
 * Удобные функции для логирования
 */
export async function auditLog(
  eventType: AuditEventType,
  message: string,
  context: Partial<AuditContext>,
  success?: boolean
): Promise<string> {
  const logger = getAuditLogger();
  return logger.logEvent(eventType, AuditSeverity.INFO, message, context, success);
}

export async function auditError(
  error: BaseError,
  context?: Partial<AuditContext>
): Promise<void> {
  const logger = getAuditLogger();
  return logger.logError(error, context);
}