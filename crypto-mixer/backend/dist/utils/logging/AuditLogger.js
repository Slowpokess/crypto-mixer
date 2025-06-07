"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = exports.AuditSeverity = exports.AuditEventType = void 0;
exports.initializeAuditLogger = initializeAuditLogger;
exports.getAuditLogger = getAuditLogger;
exports.auditLog = auditLog;
exports.auditError = auditError;
const winston_1 = __importDefault(require("winston"));
const crypto_1 = __importDefault(require("crypto"));
const events_1 = require("events");
const ErrorTypes_1 = require("../errors/ErrorTypes");
var AuditEventType;
(function (AuditEventType) {
    // Аутентификация и авторизация
    AuditEventType["USER_LOGIN"] = "user_login";
    AuditEventType["USER_LOGOUT"] = "user_logout";
    AuditEventType["ACCESS_DENIED"] = "access_denied";
    AuditEventType["PERMISSION_GRANTED"] = "permission_granted";
    // Операции микширования
    AuditEventType["MIX_REQUEST_CREATED"] = "mix_request_created";
    AuditEventType["MIX_REQUEST_PROCESSED"] = "mix_request_processed";
    AuditEventType["MIX_REQUEST_COMPLETED"] = "mix_request_completed";
    AuditEventType["MIX_REQUEST_FAILED"] = "mix_request_failed";
    AuditEventType["MIX_POOL_JOINED"] = "mix_pool_joined";
    AuditEventType["MIX_POOL_LEFT"] = "mix_pool_left";
    // Криптографические операции
    AuditEventType["KEY_GENERATED"] = "key_generated";
    AuditEventType["KEY_ROTATED"] = "key_rotated";
    AuditEventType["ENCRYPTION_PERFORMED"] = "encryption_performed";
    AuditEventType["DECRYPTION_PERFORMED"] = "decryption_performed";
    AuditEventType["SIGNATURE_CREATED"] = "signature_created";
    AuditEventType["SIGNATURE_VERIFIED"] = "signature_verified";
    // Блокчейн операции
    AuditEventType["TRANSACTION_CREATED"] = "transaction_created";
    AuditEventType["TRANSACTION_BROADCAST"] = "transaction_broadcast";
    AuditEventType["TRANSACTION_CONFIRMED"] = "transaction_confirmed";
    AuditEventType["ADDRESS_GENERATED"] = "address_generated";
    AuditEventType["BALANCE_CHECKED"] = "balance_checked";
    // Административные операции
    AuditEventType["CONFIG_CHANGED"] = "config_changed";
    AuditEventType["SYSTEM_MAINTENANCE"] = "system_maintenance";
    AuditEventType["DATABASE_MIGRATION"] = "database_migration";
    AuditEventType["BACKUP_CREATED"] = "backup_created";
    AuditEventType["BACKUP_RESTORED"] = "backup_restored";
    // Безопасность
    AuditEventType["SECURITY_VIOLATION"] = "security_violation";
    AuditEventType["INTRUSION_ATTEMPT"] = "intrusion_attempt";
    AuditEventType["HSM_ACCESS"] = "hsm_access";
    AuditEventType["VAULT_ACCESS"] = "vault_access";
    // Системные события
    AuditEventType["SERVICE_STARTED"] = "service_started";
    AuditEventType["SERVICE_STOPPED"] = "service_stopped";
    AuditEventType["ERROR_OCCURRED"] = "error_occurred";
    AuditEventType["PERFORMANCE_ALERT"] = "performance_alert";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
var AuditSeverity;
(function (AuditSeverity) {
    AuditSeverity["INFO"] = "info";
    AuditSeverity["WARNING"] = "warning";
    AuditSeverity["CRITICAL"] = "critical";
    AuditSeverity["SECURITY"] = "security";
})(AuditSeverity || (exports.AuditSeverity = AuditSeverity = {}));
/**
 * Comprehensive Audit Logger
 */
class AuditLogger extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.eventHistory = [];
        this.maxHistorySize = 10000;
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
    async logEvent(eventType, severity, message, context, success = true, details) {
        if (!this.config.enabled) {
            return '';
        }
        const eventId = this.generateEventId();
        const timestamp = new Date();
        const auditEvent = {
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
    async startOperation(operation, component, context = {}) {
        const operationId = this.generateEventId();
        await this.logEvent(AuditEventType.SERVICE_STARTED, AuditSeverity.INFO, `Начало операции: ${operation}`, {
            ...context,
            operation,
            component,
            correlationId: operationId,
            startTime: new Date()
        }, true, { operationId });
        return operationId;
    }
    /**
     * Логирует завершение операции
     */
    async endOperation(operationId, success, context = {}, error) {
        const endTime = new Date();
        const startEvent = this.findEventById(operationId);
        const duration = startEvent ? endTime.getTime() - startEvent.timestamp.getTime() : 0;
        await this.logEvent(success ? AuditEventType.SERVICE_STOPPED : AuditEventType.ERROR_OCCURRED, success ? AuditSeverity.INFO : AuditSeverity.CRITICAL, `Завершение операции: ${context.operation || 'unknown'}`, {
            ...context,
            correlationId: operationId,
            endTime,
            duration
        }, success, {
            operationId,
            duration,
            error: error?.toLogObject()
        });
    }
    /**
     * Логирует ошибку с полным контекстом
     */
    async logError(error, context = {}) {
        const severity = this.mapErrorSeverityToAuditSeverity(error.severity);
        await this.logEvent(AuditEventType.ERROR_OCCURRED, severity, `Ошибка: ${error.message}`, {
            ...context,
            component: error.context.component,
            operation: error.context.operation
        }, false, {
            errorCode: error.code,
            errorCategory: error.category,
            errorStack: error.stack,
            canRecover: error.canRecover(),
            isOperational: error.isOperational,
            errorContext: error.context
        });
    }
    /**
     * Логирует операцию микширования
     */
    async logMixingOperation(eventType, mixRequestId, amount, currency, context = {}, success = true, details) {
        await this.logEvent(eventType, success ? AuditSeverity.INFO : AuditSeverity.WARNING, `Операция микширования: ${eventType}`, {
            ...context,
            entityId: mixRequestId,
            entityType: 'mix_request',
            amount,
            currency
        }, success, details);
    }
    /**
     * Логирует блокчейн операцию
     */
    async logBlockchainOperation(eventType, transactionId, currency, context = {}, success = true, details) {
        await this.logEvent(eventType, success ? AuditSeverity.INFO : AuditSeverity.WARNING, `Блокчейн операция: ${eventType}`, {
            ...context,
            entityId: transactionId,
            entityType: 'transaction',
            currency
        }, success, details);
    }
    /**
     * Логирует событие безопасности
     */
    async logSecurityEvent(eventType, message, context = {}, success = false, details) {
        await this.logEvent(eventType, AuditSeverity.SECURITY, message, context, success, details);
    }
    /**
     * Получение текущих метрик
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Получение последних событий
     */
    getRecentEvents(limit = 100) {
        return this.eventHistory.slice(-limit);
    }
    /**
     * Поиск событий по фильтрам
     */
    findEvents(filters) {
        return this.eventHistory.filter(event => {
            if (filters.eventType && event.eventType !== filters.eventType)
                return false;
            if (filters.severity && event.severity !== filters.severity)
                return false;
            if (filters.userId && event.context.userId !== filters.userId)
                return false;
            if (filters.component && event.context.component !== filters.component)
                return false;
            if (filters.timeFrom && event.timestamp < filters.timeFrom)
                return false;
            if (filters.timeTo && event.timestamp > filters.timeTo)
                return false;
            if (filters.success !== undefined && event.success !== filters.success)
                return false;
            return true;
        });
    }
    /**
     * Проверка целостности логов
     */
    verifyIntegrity(event) {
        if (!this.config.enableIntegrityCheck) {
            return true;
        }
        const calculatedIntegrity = this.calculateIntegrity(event);
        return calculatedIntegrity === event.integrity;
    }
    /**
     * Экспорт audit логов
     */
    async exportLogs(format = 'json', filters) {
        const events = filters ? this.findEvents(filters) : this.eventHistory;
        if (format === 'json') {
            return JSON.stringify(events, null, 2);
        }
        else {
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
    createAuditLogger() {
        const logDir = process.env.AUDIT_LOG_DIR || '/var/log/crypto-mixer/audit';
        const auditFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
            return JSON.stringify({
                timestamp,
                level,
                message,
                ...meta
            });
        }));
        const transports = [
            new winston_1.default.transports.File({
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
        return winston_1.default.createLogger({
            level: 'info',
            format: auditFormat,
            transports,
            exitOnError: false
        });
    }
    /**
     * Записывает audit событие в лог
     */
    async writeAuditLog(event) {
        try {
            let logData = { ...event };
            // Шифруем если включено
            if (this.config.encryptLogs) {
                logData = this.encryptEventData(logData);
            }
            this.logger.info('AUDIT_EVENT', logData);
        }
        catch (error) {
            // Fallback логирование в случае ошибки
            console.error('Ошибка записи audit лога:', error);
            this.emit('error', error);
        }
    }
    /**
     * Обогащает контекст дополнительной информацией
     */
    enrichContext(context) {
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
    sanitizeDetails(details) {
        if (!details)
            return undefined;
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
    generateEventId() {
        return `audit_${Date.now()}_${crypto_1.default.randomBytes(8).toString('hex')}`;
    }
    /**
     * Вычисляет hash целостности события
     */
    calculateIntegrity(event) {
        const data = JSON.stringify({
            id: event.id,
            timestamp: event.timestamp,
            eventType: event.eventType,
            message: event.message,
            context: event.context
        });
        return crypto_1.default
            .createHmac('sha256', this.encryptionKey)
            .update(data)
            .digest('hex');
    }
    /**
     * Шифрует данные события
     */
    encryptEventData(event) {
        // Упрощенная реализация шифрования
        // В продакшене нужно использовать более надежное шифрование
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
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
    generateEncryptionKey() {
        const key = this.config.securityKey || process.env.AUDIT_ENCRYPTION_KEY;
        if (key) {
            return Buffer.from(key, 'hex');
        }
        return crypto_1.default.randomBytes(32);
    }
    /**
     * Обновляет метрики
     */
    updateMetrics(event) {
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
    addToHistory(event) {
        this.eventHistory.push(event);
        // Ограничиваем размер истории
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }
    /**
     * Находит событие по ID
     */
    findEventById(id) {
        return this.eventHistory.find(event => event.id === id);
    }
    /**
     * Конвертирует размер строку в байты
     */
    parseSize(size) {
        const units = {
            'b': 1,
            'kb': 1024,
            'mb': 1024 * 1024,
            'gb': 1024 * 1024 * 1024
        };
        const match = size.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
        if (!match)
            return 5 * 1024 * 1024; // Default 5MB
        return parseInt(match[1]) * units[match[2]];
    }
    /**
     * Преобразует severity ошибки в audit severity
     */
    mapErrorSeverityToAuditSeverity(errorSeverity) {
        switch (errorSeverity) {
            case ErrorTypes_1.ErrorSeverity.CRITICAL:
                return AuditSeverity.CRITICAL;
            case ErrorTypes_1.ErrorSeverity.HIGH:
                return AuditSeverity.CRITICAL;
            case ErrorTypes_1.ErrorSeverity.MEDIUM:
                return AuditSeverity.WARNING;
            case ErrorTypes_1.ErrorSeverity.LOW:
                return AuditSeverity.INFO;
            default:
                return AuditSeverity.INFO;
        }
    }
    /**
     * Инициализирует метрики
     */
    initializeMetrics() {
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
    setupPeriodicMetricsReport() {
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
exports.AuditLogger = AuditLogger;
/**
 * Глобальный экземпляр audit logger'а
 */
let globalAuditLogger = null;
/**
 * Инициализирует глобальный audit logger
 */
function initializeAuditLogger(config) {
    globalAuditLogger = new AuditLogger(config);
    return globalAuditLogger;
}
/**
 * Получает глобальный audit logger
 */
function getAuditLogger() {
    if (!globalAuditLogger) {
        throw new Error('AuditLogger не инициализирован. Вызовите initializeAuditLogger() сначала.');
    }
    return globalAuditLogger;
}
/**
 * Удобные функции для логирования
 */
async function auditLog(eventType, message, context, success) {
    const logger = getAuditLogger();
    return logger.logEvent(eventType, AuditSeverity.INFO, message, context, success);
}
async function auditError(error, context) {
    const logger = getAuditLogger();
    return logger.logError(error, context);
}
//# sourceMappingURL=AuditLogger.js.map