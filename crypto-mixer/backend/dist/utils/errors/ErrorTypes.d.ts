/**
 * Централизованная система типизированных ошибок для криптомиксера
 *
 * Предоставляет иерархию ошибок с детальной классификацией,
 * контекстом, severity levels и автоматическим логированием
 */
export declare enum ErrorSeverity {
    LOW = "low",// Незначительные ошибки, не влияющие на функциональность
    MEDIUM = "medium",// Умеренные ошибки, могут влиять на пользователей
    HIGH = "high",// Серьезные ошибки, влияющие на функциональность
    CRITICAL = "critical"
}
export declare enum ErrorCategory {
    AUTHENTICATION = "authentication",
    AUTHORIZATION = "authorization",
    VALIDATION = "validation",
    BUSINESS_LOGIC = "business_logic",
    DATABASE = "database",
    BLOCKCHAIN = "blockchain",
    NETWORK = "network",
    ENCRYPTION = "encryption",
    CONFIGURATION = "configuration",
    MEMORY = "memory",
    PERFORMANCE = "performance",
    SECURITY = "security",
    MIXING = "mixing",
    PAYMENT = "payment",
    WALLET = "wallet",
    MONITORING = "monitoring"
}
export declare enum ErrorCode {
    INVALID_CREDENTIALS = "E1001",
    TOKEN_EXPIRED = "E1002",
    TOKEN_INVALID = "E1003",
    SESSION_EXPIRED = "E1004",
    ACCESS_DENIED = "E2001",
    INSUFFICIENT_PERMISSIONS = "E2002",
    RESOURCE_FORBIDDEN = "E2003",
    INVALID_INPUT = "E3001",
    MISSING_REQUIRED_FIELD = "E3002",
    INVALID_FORMAT = "E3003",
    VALUE_OUT_OF_RANGE = "E3004",
    INVALID_ADDRESS = "E3005",
    INVALID_AMOUNT = "E3006",
    INSUFFICIENT_BALANCE = "E4001",
    MIXING_POOL_FULL = "E4002",
    MINIMUM_AMOUNT_NOT_MET = "E4003",
    MAXIMUM_AMOUNT_EXCEEDED = "E4004",
    MIXING_ALREADY_IN_PROGRESS = "E4005",
    INCOMPATIBLE_CURRENCIES = "E4006",
    DATABASE_CONNECTION_FAILED = "E5001",
    QUERY_FAILED = "E5002",
    TRANSACTION_FAILED = "E5003",
    CONSTRAINT_VIOLATION = "E5004",
    DEADLOCK_DETECTED = "E5005",
    DATA_CORRUPTION = "E5006",
    BLOCKCHAIN_CONNECTION_FAILED = "E6001",
    TRANSACTION_BROADCAST_FAILED = "E6002",
    TRANSACTION_CONFIRMATION_TIMEOUT = "E6003",
    INVALID_TRANSACTION = "E6004",
    INSUFFICIENT_GAS = "E6005",
    NETWORK_CONGESTION = "E6006",
    NODE_SYNC_ISSUE = "E6007",
    NETWORK_TIMEOUT = "E7001",
    CONNECTION_REFUSED = "E7002",
    SERVICE_UNAVAILABLE = "E7003",
    RATE_LIMIT_EXCEEDED = "E7004",
    API_QUOTA_EXCEEDED = "E7005",
    ENCRYPTION_FAILED = "E8001",
    DECRYPTION_FAILED = "E8002",
    KEY_GENERATION_FAILED = "E8003",
    SIGNATURE_VERIFICATION_FAILED = "E8004",
    HSM_COMMUNICATION_FAILED = "E8005",
    VAULT_ACCESS_DENIED = "E8006",
    SECURITY_VIOLATION = "E8007",
    MISSING_CONFIGURATION = "E9001",
    INVALID_CONFIGURATION = "E9002",
    ENVIRONMENT_SETUP_FAILED = "E9003",
    OUT_OF_MEMORY = "E10001",
    DISK_SPACE_FULL = "E10002",
    SYSTEM_OVERLOAD = "E10003",
    RESOURCE_EXHAUSTED = "E10004",
    UNKNOWN_ERROR = "E99999"
}
export interface ErrorContext {
    timestamp: Date;
    requestId?: string;
    userId?: string;
    sessionId?: string;
    component: string;
    operation: string;
    inputData?: Record<string, any>;
    systemState?: Record<string, any>;
    executionTime?: number;
    memoryUsage?: number;
    additionalInfo?: Record<string, any>;
}
export interface ErrorRecoveryStrategy {
    canRecover: boolean;
    maxRetries?: number;
    retryDelay?: number;
    fallbackAction?: string;
    requiresManualIntervention?: boolean;
}
/**
 * Базовый класс для всех кастомных ошибок в системе
 */
export declare abstract class BaseError extends Error {
    readonly code: ErrorCode;
    readonly severity: ErrorSeverity;
    readonly category: ErrorCategory;
    readonly context: ErrorContext;
    readonly recovery?: ErrorRecoveryStrategy;
    readonly isOperational: boolean;
    readonly timestamp: Date;
    constructor(message: string, code: ErrorCode, severity: ErrorSeverity, category: ErrorCategory, context?: Partial<ErrorContext>, recovery?: ErrorRecoveryStrategy, isOperational?: boolean);
    /**
     * Преобразует ошибку в объект для логирования
     */
    toLogObject(): Record<string, any>;
    /**
     * Проверяет, можно ли восстановиться от ошибки
     */
    canRecover(): boolean;
    /**
     * Возвращает безопасное сообщение для пользователя
     */
    getUserMessage(): string;
}
/**
 * Ошибки аутентификации
 */
export declare class AuthenticationError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки авторизации
 */
export declare class AuthorizationError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки валидации
 */
export declare class ValidationError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки бизнес-логики
 */
export declare class BusinessLogicError extends BaseError {
    constructor(message: string, code: ErrorCode, context?: Partial<ErrorContext>, severity?: ErrorSeverity);
}
/**
 * Ошибки базы данных
 */
export declare class DatabaseError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки блокчейна
 */
export declare class BlockchainError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>, severity?: ErrorSeverity);
}
/**
 * Сетевые ошибки
 */
export declare class NetworkError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки шифрования/безопасности
 */
export declare class SecurityError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки конфигурации
 */
export declare class ConfigurationError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Системные ошибки
 */
export declare class SystemError extends BaseError {
    constructor(message: string, code?: ErrorCode, context?: Partial<ErrorContext>);
}
/**
 * Ошибки операций микширования
 */
export declare class MixingError extends BaseError {
    constructor(message: string, code: ErrorCode, context?: Partial<ErrorContext>, severity?: ErrorSeverity);
}
