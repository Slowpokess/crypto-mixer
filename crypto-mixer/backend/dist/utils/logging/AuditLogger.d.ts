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
import { EventEmitter } from 'events';
import { BaseError } from '../errors/ErrorTypes';
export declare enum AuditEventType {
    USER_LOGIN = "user_login",
    USER_LOGOUT = "user_logout",
    ACCESS_DENIED = "access_denied",
    PERMISSION_GRANTED = "permission_granted",
    MIX_REQUEST_CREATED = "mix_request_created",
    MIX_REQUEST_PROCESSED = "mix_request_processed",
    MIX_REQUEST_COMPLETED = "mix_request_completed",
    MIX_REQUEST_FAILED = "mix_request_failed",
    MIX_POOL_JOINED = "mix_pool_joined",
    MIX_POOL_LEFT = "mix_pool_left",
    KEY_GENERATED = "key_generated",
    KEY_ROTATED = "key_rotated",
    ENCRYPTION_PERFORMED = "encryption_performed",
    DECRYPTION_PERFORMED = "decryption_performed",
    SIGNATURE_CREATED = "signature_created",
    SIGNATURE_VERIFIED = "signature_verified",
    TRANSACTION_CREATED = "transaction_created",
    TRANSACTION_BROADCAST = "transaction_broadcast",
    TRANSACTION_CONFIRMED = "transaction_confirmed",
    ADDRESS_GENERATED = "address_generated",
    BALANCE_CHECKED = "balance_checked",
    CONFIG_CHANGED = "config_changed",
    SYSTEM_MAINTENANCE = "system_maintenance",
    DATABASE_MIGRATION = "database_migration",
    BACKUP_CREATED = "backup_created",
    BACKUP_RESTORED = "backup_restored",
    SECURITY_VIOLATION = "security_violation",
    INTRUSION_ATTEMPT = "intrusion_attempt",
    HSM_ACCESS = "hsm_access",
    VAULT_ACCESS = "vault_access",
    SERVICE_STARTED = "service_started",
    SERVICE_STOPPED = "service_stopped",
    ERROR_OCCURRED = "error_occurred",
    PERFORMANCE_ALERT = "performance_alert"
}
export declare enum AuditSeverity {
    INFO = "info",
    WARNING = "warning",
    CRITICAL = "critical",
    SECURITY = "security"
}
export interface AuditContext {
    userId?: string;
    sessionId?: string;
    requestId?: string;
    correlationId?: string;
    component: string;
    operation: string;
    version?: string;
    ipAddress?: string;
    userAgent?: string;
    geolocation?: string;
    entityId?: string;
    entityType?: string;
    amount?: number;
    currency?: string;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    memoryUsage?: number;
    metadata?: Record<string, any>;
}
export interface AuditEvent {
    id: string;
    timestamp: Date;
    eventType: AuditEventType;
    severity: AuditSeverity;
    success: boolean;
    context: AuditContext;
    message: string;
    details?: Record<string, any>;
    integrity: string;
    encrypted: boolean;
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
export declare class AuditLogger extends EventEmitter {
    private logger;
    private config;
    private metrics;
    private encryptionKey;
    private eventHistory;
    private readonly maxHistorySize;
    constructor(config?: Partial<AuditConfig>);
    /**
     * Логирует audit событие
     */
    logEvent(eventType: AuditEventType, severity: AuditSeverity, message: string, context: Partial<AuditContext>, success?: boolean, details?: Record<string, any>): Promise<string>;
    /**
     * Логирует начало операции с трассировкой
     */
    startOperation(operation: string, component: string, context?: Partial<AuditContext>): Promise<string>;
    /**
     * Логирует завершение операции
     */
    endOperation(operationId: string, success: boolean, context?: Partial<AuditContext>, error?: BaseError): Promise<void>;
    /**
     * Логирует ошибку с полным контекстом
     */
    logError(error: BaseError, context?: Partial<AuditContext>): Promise<void>;
    /**
     * Логирует операцию микширования
     */
    logMixingOperation(eventType: AuditEventType, mixRequestId: string, amount: number, currency: string, context?: Partial<AuditContext>, success?: boolean, details?: Record<string, any>): Promise<void>;
    /**
     * Логирует блокчейн операцию
     */
    logBlockchainOperation(eventType: AuditEventType, transactionId: string, currency: string, context?: Partial<AuditContext>, success?: boolean, details?: Record<string, any>): Promise<void>;
    /**
     * Логирует событие безопасности
     */
    logSecurityEvent(eventType: AuditEventType, message: string, context?: Partial<AuditContext>, success?: boolean, details?: Record<string, any>): Promise<void>;
    /**
     * Получение текущих метрик
     */
    getMetrics(): AuditMetrics;
    /**
     * Получение последних событий
     */
    getRecentEvents(limit?: number): AuditEvent[];
    /**
     * Поиск событий по фильтрам
     */
    findEvents(filters: {
        eventType?: AuditEventType;
        severity?: AuditSeverity;
        userId?: string;
        component?: string;
        timeFrom?: Date;
        timeTo?: Date;
        success?: boolean;
    }): AuditEvent[];
    /**
     * Проверка целостности логов
     */
    verifyIntegrity(event: AuditEvent): boolean;
    /**
     * Экспорт audit логов
     */
    exportLogs(format?: 'json' | 'csv', filters?: any): Promise<string>;
    /**
     * Создает Winston logger для audit логов
     */
    private createAuditLogger;
    /**
     * Записывает audit событие в лог
     */
    private writeAuditLog;
    /**
     * Обогащает контекст дополнительной информацией
     */
    private enrichContext;
    /**
     * Очищает детали от чувствительной информации
     */
    private sanitizeDetails;
    /**
     * Генерирует уникальный ID события
     */
    private generateEventId;
    /**
     * Вычисляет hash целостности события
     */
    private calculateIntegrity;
    /**
     * Шифрует данные события
     */
    private encryptEventData;
    /**
     * Генерирует ключ шифрования
     */
    private generateEncryptionKey;
    /**
     * Обновляет метрики
     */
    private updateMetrics;
    /**
     * Добавляет событие в историю
     */
    private addToHistory;
    /**
     * Находит событие по ID
     */
    private findEventById;
    /**
     * Конвертирует размер строку в байты
     */
    private parseSize;
    /**
     * Преобразует severity ошибки в audit severity
     */
    private mapErrorSeverityToAuditSeverity;
    /**
     * Инициализирует метрики
     */
    private initializeMetrics;
    /**
     * Настраивает периодический отчет по метрикам
     */
    private setupPeriodicMetricsReport;
}
/**
 * Инициализирует глобальный audit logger
 */
export declare function initializeAuditLogger(config?: Partial<AuditConfig>): AuditLogger;
/**
 * Получает глобальный audit logger
 */
export declare function getAuditLogger(): AuditLogger;
/**
 * Удобные функции для логирования
 */
export declare function auditLog(eventType: AuditEventType, message: string, context: Partial<AuditContext>, success?: boolean): Promise<string>;
export declare function auditError(error: BaseError, context?: Partial<AuditContext>): Promise<void>;
