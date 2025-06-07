"use strict";
/**
 * Централизованная система типизированных ошибок для криптомиксера
 *
 * Предоставляет иерархию ошибок с детальной классификацией,
 * контекстом, severity levels и автоматическим логированием
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MixingError = exports.SystemError = exports.ConfigurationError = exports.SecurityError = exports.NetworkError = exports.BlockchainError = exports.DatabaseError = exports.BusinessLogicError = exports.ValidationError = exports.AuthorizationError = exports.AuthenticationError = exports.BaseError = exports.ErrorCode = exports.ErrorCategory = exports.ErrorSeverity = void 0;
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical"; // Критические ошибки, требующие немедленного внимания
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
var ErrorCategory;
(function (ErrorCategory) {
    // Основные категории
    ErrorCategory["AUTHENTICATION"] = "authentication";
    ErrorCategory["AUTHORIZATION"] = "authorization";
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["BUSINESS_LOGIC"] = "business_logic";
    // Технические категории
    ErrorCategory["DATABASE"] = "database";
    ErrorCategory["BLOCKCHAIN"] = "blockchain";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["ENCRYPTION"] = "encryption";
    // Системные категории
    ErrorCategory["CONFIGURATION"] = "configuration";
    ErrorCategory["MEMORY"] = "memory";
    ErrorCategory["PERFORMANCE"] = "performance";
    ErrorCategory["SECURITY"] = "security";
    // Операционные категории
    ErrorCategory["MIXING"] = "mixing";
    ErrorCategory["PAYMENT"] = "payment";
    ErrorCategory["WALLET"] = "wallet";
    ErrorCategory["MONITORING"] = "monitoring";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
var ErrorCode;
(function (ErrorCode) {
    // Аутентификация (1000-1999)
    ErrorCode["INVALID_CREDENTIALS"] = "E1001";
    ErrorCode["TOKEN_EXPIRED"] = "E1002";
    ErrorCode["TOKEN_INVALID"] = "E1003";
    ErrorCode["SESSION_EXPIRED"] = "E1004";
    // Авторизация (2000-2999)
    ErrorCode["ACCESS_DENIED"] = "E2001";
    ErrorCode["INSUFFICIENT_PERMISSIONS"] = "E2002";
    ErrorCode["RESOURCE_FORBIDDEN"] = "E2003";
    // Валидация (3000-3999)
    ErrorCode["INVALID_INPUT"] = "E3001";
    ErrorCode["MISSING_REQUIRED_FIELD"] = "E3002";
    ErrorCode["INVALID_FORMAT"] = "E3003";
    ErrorCode["VALUE_OUT_OF_RANGE"] = "E3004";
    ErrorCode["INVALID_ADDRESS"] = "E3005";
    ErrorCode["INVALID_AMOUNT"] = "E3006";
    // Бизнес-логика (4000-4999)
    ErrorCode["INSUFFICIENT_BALANCE"] = "E4001";
    ErrorCode["MIXING_POOL_FULL"] = "E4002";
    ErrorCode["MINIMUM_AMOUNT_NOT_MET"] = "E4003";
    ErrorCode["MAXIMUM_AMOUNT_EXCEEDED"] = "E4004";
    ErrorCode["MIXING_ALREADY_IN_PROGRESS"] = "E4005";
    ErrorCode["INCOMPATIBLE_CURRENCIES"] = "E4006";
    // База данных (5000-5999)
    ErrorCode["DATABASE_CONNECTION_FAILED"] = "E5001";
    ErrorCode["QUERY_FAILED"] = "E5002";
    ErrorCode["TRANSACTION_FAILED"] = "E5003";
    ErrorCode["CONSTRAINT_VIOLATION"] = "E5004";
    ErrorCode["DEADLOCK_DETECTED"] = "E5005";
    ErrorCode["DATA_CORRUPTION"] = "E5006";
    // Блокчейн (6000-6999)
    ErrorCode["BLOCKCHAIN_CONNECTION_FAILED"] = "E6001";
    ErrorCode["TRANSACTION_BROADCAST_FAILED"] = "E6002";
    ErrorCode["TRANSACTION_CONFIRMATION_TIMEOUT"] = "E6003";
    ErrorCode["INVALID_TRANSACTION"] = "E6004";
    ErrorCode["INSUFFICIENT_GAS"] = "E6005";
    ErrorCode["NETWORK_CONGESTION"] = "E6006";
    ErrorCode["NODE_SYNC_ISSUE"] = "E6007";
    // Сеть (7000-7999)
    ErrorCode["NETWORK_TIMEOUT"] = "E7001";
    ErrorCode["CONNECTION_REFUSED"] = "E7002";
    ErrorCode["SERVICE_UNAVAILABLE"] = "E7003";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "E7004";
    ErrorCode["API_QUOTA_EXCEEDED"] = "E7005";
    // Шифрование/Безопасность (8000-8999)
    ErrorCode["ENCRYPTION_FAILED"] = "E8001";
    ErrorCode["DECRYPTION_FAILED"] = "E8002";
    ErrorCode["KEY_GENERATION_FAILED"] = "E8003";
    ErrorCode["SIGNATURE_VERIFICATION_FAILED"] = "E8004";
    ErrorCode["HSM_COMMUNICATION_FAILED"] = "E8005";
    ErrorCode["VAULT_ACCESS_DENIED"] = "E8006";
    ErrorCode["SECURITY_VIOLATION"] = "E8007";
    // Конфигурация (9000-9999)
    ErrorCode["MISSING_CONFIGURATION"] = "E9001";
    ErrorCode["INVALID_CONFIGURATION"] = "E9002";
    ErrorCode["ENVIRONMENT_SETUP_FAILED"] = "E9003";
    // Системные ошибки (10000-10999)
    ErrorCode["OUT_OF_MEMORY"] = "E10001";
    ErrorCode["DISK_SPACE_FULL"] = "E10002";
    ErrorCode["SYSTEM_OVERLOAD"] = "E10003";
    ErrorCode["RESOURCE_EXHAUSTED"] = "E10004";
    // Неизвестные ошибки
    ErrorCode["UNKNOWN_ERROR"] = "E99999";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
/**
 * Базовый класс для всех кастомных ошибок в системе
 */
class BaseError extends Error {
    constructor(message, code, severity, category, context = {}, recovery, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.severity = severity;
        this.category = category;
        this.recovery = recovery;
        this.isOperational = isOperational;
        this.timestamp = new Date();
        // Заполняем контекст с дефолтными значениями
        this.context = {
            timestamp: this.timestamp,
            component: 'unknown',
            operation: 'unknown',
            ...context
        };
        // Сохраняем stack trace
        Error.captureStackTrace(this, this.constructor);
    }
    /**
     * Преобразует ошибку в объект для логирования
     */
    toLogObject() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            severity: this.severity,
            category: this.category,
            timestamp: this.timestamp.toISOString(),
            context: this.context,
            recovery: this.recovery,
            isOperational: this.isOperational,
            stack: this.stack
        };
    }
    /**
     * Проверяет, можно ли восстановиться от ошибки
     */
    canRecover() {
        return this.recovery?.canRecover || false;
    }
    /**
     * Возвращает безопасное сообщение для пользователя
     */
    getUserMessage() {
        // В production возвращаем обобщенное сообщение для безопасности
        if (process.env.NODE_ENV === 'production' && this.severity === ErrorSeverity.HIGH) {
            return 'Произошла внутренняя ошибка. Пожалуйста, попробуйте позже.';
        }
        return this.message;
    }
}
exports.BaseError = BaseError;
/**
 * Ошибки аутентификации
 */
class AuthenticationError extends BaseError {
    constructor(message, code = ErrorCode.INVALID_CREDENTIALS, context = {}) {
        super(message, code, ErrorSeverity.MEDIUM, ErrorCategory.AUTHENTICATION, context, { canRecover: true, maxRetries: 3, retryDelay: 1000 });
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * Ошибки авторизации
 */
class AuthorizationError extends BaseError {
    constructor(message, code = ErrorCode.ACCESS_DENIED, context = {}) {
        super(message, code, ErrorSeverity.MEDIUM, ErrorCategory.AUTHORIZATION, context, { canRecover: false });
    }
}
exports.AuthorizationError = AuthorizationError;
/**
 * Ошибки валидации
 */
class ValidationError extends BaseError {
    constructor(message, code = ErrorCode.INVALID_INPUT, context = {}) {
        super(message, code, ErrorSeverity.LOW, ErrorCategory.VALIDATION, context, { canRecover: true });
    }
}
exports.ValidationError = ValidationError;
/**
 * Ошибки бизнес-логики
 */
class BusinessLogicError extends BaseError {
    constructor(message, code, context = {}, severity = ErrorSeverity.MEDIUM) {
        super(message, code, severity, ErrorCategory.BUSINESS_LOGIC, context, { canRecover: true });
    }
}
exports.BusinessLogicError = BusinessLogicError;
/**
 * Ошибки базы данных
 */
class DatabaseError extends BaseError {
    constructor(message, code = ErrorCode.DATABASE_CONNECTION_FAILED, context = {}) {
        super(message, code, ErrorSeverity.HIGH, ErrorCategory.DATABASE, context, { canRecover: true, maxRetries: 3, retryDelay: 2000 });
    }
}
exports.DatabaseError = DatabaseError;
/**
 * Ошибки блокчейна
 */
class BlockchainError extends BaseError {
    constructor(message, code = ErrorCode.BLOCKCHAIN_CONNECTION_FAILED, context = {}, severity = ErrorSeverity.HIGH) {
        super(message, code, severity, ErrorCategory.BLOCKCHAIN, context, { canRecover: true, maxRetries: 5, retryDelay: 5000 });
    }
}
exports.BlockchainError = BlockchainError;
/**
 * Сетевые ошибки
 */
class NetworkError extends BaseError {
    constructor(message, code = ErrorCode.NETWORK_TIMEOUT, context = {}) {
        super(message, code, ErrorSeverity.MEDIUM, ErrorCategory.NETWORK, context, { canRecover: true, maxRetries: 3, retryDelay: 1000 });
    }
}
exports.NetworkError = NetworkError;
/**
 * Ошибки шифрования/безопасности
 */
class SecurityError extends BaseError {
    constructor(message, code = ErrorCode.ENCRYPTION_FAILED, context = {}) {
        super(message, code, ErrorSeverity.CRITICAL, ErrorCategory.SECURITY, context, { canRecover: false, requiresManualIntervention: true });
    }
}
exports.SecurityError = SecurityError;
/**
 * Ошибки конфигурации
 */
class ConfigurationError extends BaseError {
    constructor(message, code = ErrorCode.MISSING_CONFIGURATION, context = {}) {
        super(message, code, ErrorSeverity.CRITICAL, ErrorCategory.CONFIGURATION, context, { canRecover: false, requiresManualIntervention: true }, false // Не операционная ошибка - проблема с кодом/конфигом
        );
    }
}
exports.ConfigurationError = ConfigurationError;
/**
 * Системные ошибки
 */
class SystemError extends BaseError {
    constructor(message, code = ErrorCode.SYSTEM_OVERLOAD, context = {}) {
        super(message, code, ErrorSeverity.CRITICAL, ErrorCategory.PERFORMANCE, context, { canRecover: true, maxRetries: 1, retryDelay: 10000 });
    }
}
exports.SystemError = SystemError;
/**
 * Ошибки операций микширования
 */
class MixingError extends BaseError {
    constructor(message, code, context = {}, severity = ErrorSeverity.HIGH) {
        super(message, code, severity, ErrorCategory.MIXING, context, { canRecover: true, maxRetries: 2, retryDelay: 5000 });
    }
}
exports.MixingError = MixingError;
//# sourceMappingURL=ErrorTypes.js.map