/**
 * Централизованная система типизированных ошибок для криптомиксера
 * 
 * Предоставляет иерархию ошибок с детальной классификацией,
 * контекстом, severity levels и автоматическим логированием
 */

export enum ErrorSeverity {
  LOW = 'low',           // Незначительные ошибки, не влияющие на функциональность
  MEDIUM = 'medium',     // Умеренные ошибки, могут влиять на пользователей
  HIGH = 'high',         // Серьезные ошибки, влияющие на функциональность
  CRITICAL = 'critical'  // Критические ошибки, требующие немедленного внимания
}

export enum ErrorCategory {
  // Основные категории
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  
  // Технические категории
  DATABASE = 'database',
  BLOCKCHAIN = 'blockchain',
  NETWORK = 'network',
  ENCRYPTION = 'encryption',
  
  // Системные категории
  CONFIGURATION = 'configuration',
  MEMORY = 'memory',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  
  // Операционные категории
  MIXING = 'mixing',
  PAYMENT = 'payment',
  WALLET = 'wallet',
  MONITORING = 'monitoring'
}

export enum ErrorCode {
  // Аутентификация (1000-1999)
  INVALID_CREDENTIALS = 'E1001',
  TOKEN_EXPIRED = 'E1002',
  TOKEN_INVALID = 'E1003',
  SESSION_EXPIRED = 'E1004',
  
  // Авторизация (2000-2999)
  ACCESS_DENIED = 'E2001',
  INSUFFICIENT_PERMISSIONS = 'E2002',
  RESOURCE_FORBIDDEN = 'E2003',
  
  // Валидация (3000-3999)
  INVALID_INPUT = 'E3001',
  MISSING_REQUIRED_FIELD = 'E3002',
  INVALID_FORMAT = 'E3003',
  VALUE_OUT_OF_RANGE = 'E3004',
  INVALID_ADDRESS = 'E3005',
  INVALID_AMOUNT = 'E3006',
  
  // Бизнес-логика (4000-4999)
  INSUFFICIENT_BALANCE = 'E4001',
  MIXING_POOL_FULL = 'E4002',
  MINIMUM_AMOUNT_NOT_MET = 'E4003',
  MAXIMUM_AMOUNT_EXCEEDED = 'E4004',
  MIXING_ALREADY_IN_PROGRESS = 'E4005',
  INCOMPATIBLE_CURRENCIES = 'E4006',
  
  // База данных (5000-5999)
  DATABASE_CONNECTION_FAILED = 'E5001',
  QUERY_FAILED = 'E5002',
  TRANSACTION_FAILED = 'E5003',
  CONSTRAINT_VIOLATION = 'E5004',
  DEADLOCK_DETECTED = 'E5005',
  DATA_CORRUPTION = 'E5006',
  
  // Блокчейн (6000-6999)
  BLOCKCHAIN_CONNECTION_FAILED = 'E6001',
  TRANSACTION_BROADCAST_FAILED = 'E6002',
  TRANSACTION_CONFIRMATION_TIMEOUT = 'E6003',
  INVALID_TRANSACTION = 'E6004',
  INSUFFICIENT_GAS = 'E6005',
  NETWORK_CONGESTION = 'E6006',
  NODE_SYNC_ISSUE = 'E6007',
  
  // Сеть (7000-7999)
  NETWORK_TIMEOUT = 'E7001',
  CONNECTION_REFUSED = 'E7002',
  SERVICE_UNAVAILABLE = 'E7003',
  RATE_LIMIT_EXCEEDED = 'E7004',
  API_QUOTA_EXCEEDED = 'E7005',
  
  // Шифрование/Безопасность (8000-8999)
  ENCRYPTION_FAILED = 'E8001',
  DECRYPTION_FAILED = 'E8002',
  KEY_GENERATION_FAILED = 'E8003',
  SIGNATURE_VERIFICATION_FAILED = 'E8004',
  HSM_COMMUNICATION_FAILED = 'E8005',
  VAULT_ACCESS_DENIED = 'E8006',
  SECURITY_VIOLATION = 'E8007',
  
  // Конфигурация (9000-9999)
  MISSING_CONFIGURATION = 'E9001',
  INVALID_CONFIGURATION = 'E9002',
  ENVIRONMENT_SETUP_FAILED = 'E9003',
  
  // Системные ошибки (10000-10999)
  OUT_OF_MEMORY = 'E10001',
  DISK_SPACE_FULL = 'E10002',
  SYSTEM_OVERLOAD = 'E10003',
  RESOURCE_EXHAUSTED = 'E10004',
  
  // Неизвестные ошибки
  UNKNOWN_ERROR = 'E99999'
}

export interface ErrorContext {
  // Базовая информация
  timestamp: Date;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  
  // Технический контекст
  component: string;
  operation: string;
  
  // Данные операции
  inputData?: Record<string, any>;
  systemState?: Record<string, any>;
  
  // Метрики производительности
  executionTime?: number;
  memoryUsage?: number;
  
  // Дополнительные данные
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
export abstract class BaseError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly context: ErrorContext;
  public readonly recovery?: ErrorRecoveryStrategy;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  
  constructor(
    message: string,
    code: ErrorCode,
    severity: ErrorSeverity,
    category: ErrorCategory,
    context: Partial<ErrorContext> = {},
    recovery?: ErrorRecoveryStrategy,
    isOperational: boolean = true
  ) {
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
  public toLogObject(): Record<string, any> {
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
  public canRecover(): boolean {
    return this.recovery?.canRecover || false;
  }
  
  /**
   * Возвращает безопасное сообщение для пользователя
   */
  public getUserMessage(): string {
    // В production возвращаем обобщенное сообщение для безопасности
    if (process.env.NODE_ENV === 'production' && this.severity === ErrorSeverity.HIGH) {
      return 'Произошла внутренняя ошибка. Пожалуйста, попробуйте позже.';
    }
    return this.message;
  }
}

/**
 * Ошибки аутентификации
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INVALID_CREDENTIALS,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.MEDIUM,
      ErrorCategory.AUTHENTICATION,
      context,
      { canRecover: true, maxRetries: 3, retryDelay: 1000 }
    );
  }
}

/**
 * Ошибки авторизации
 */
export class AuthorizationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.ACCESS_DENIED,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.MEDIUM,
      ErrorCategory.AUTHORIZATION,
      context,
      { canRecover: false }
    );
  }
}

/**
 * Ошибки валидации
 */
export class ValidationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INVALID_INPUT,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.LOW,
      ErrorCategory.VALIDATION,
      context,
      { canRecover: true }
    );
  }
}

/**
 * Ошибки бизнес-логики
 */
export class BusinessLogicError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode,
    context: Partial<ErrorContext> = {},
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ) {
    super(
      message,
      code,
      severity,
      ErrorCategory.BUSINESS_LOGIC,
      context,
      { canRecover: true }
    );
  }
}

/**
 * Ошибки базы данных
 */
export class DatabaseError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DATABASE_CONNECTION_FAILED,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.HIGH,
      ErrorCategory.DATABASE,
      context,
      { canRecover: true, maxRetries: 3, retryDelay: 2000 }
    );
  }
}

/**
 * Ошибки блокчейна
 */
export class BlockchainError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.BLOCKCHAIN_CONNECTION_FAILED,
    context: Partial<ErrorContext> = {},
    severity: ErrorSeverity = ErrorSeverity.HIGH
  ) {
    super(
      message,
      code,
      severity,
      ErrorCategory.BLOCKCHAIN,
      context,
      { canRecover: true, maxRetries: 5, retryDelay: 5000 }
    );
  }
}

/**
 * Сетевые ошибки
 */
export class NetworkError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_TIMEOUT,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.MEDIUM,
      ErrorCategory.NETWORK,
      context,
      { canRecover: true, maxRetries: 3, retryDelay: 1000 }
    );
  }
}

/**
 * Ошибки шифрования/безопасности
 */
export class SecurityError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.ENCRYPTION_FAILED,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.CRITICAL,
      ErrorCategory.SECURITY,
      context,
      { canRecover: false, requiresManualIntervention: true }
    );
  }
}

/**
 * Ошибки конфигурации
 */
export class ConfigurationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.MISSING_CONFIGURATION,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.CRITICAL,
      ErrorCategory.CONFIGURATION,
      context,
      { canRecover: false, requiresManualIntervention: true },
      false // Не операционная ошибка - проблема с кодом/конфигом
    );
  }
}

/**
 * Системные ошибки
 */
export class SystemError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SYSTEM_OVERLOAD,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      code,
      ErrorSeverity.CRITICAL,
      ErrorCategory.PERFORMANCE,
      context,
      { canRecover: true, maxRetries: 1, retryDelay: 10000 }
    );
  }
}

/**
 * Ошибки операций микширования
 */
export class MixingError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode,
    context: Partial<ErrorContext> = {},
    severity: ErrorSeverity = ErrorSeverity.HIGH
  ) {
    super(
      message,
      code,
      severity,
      ErrorCategory.MIXING,
      context,
      { canRecover: true, maxRetries: 2, retryDelay: 5000 }
    );
  }
}