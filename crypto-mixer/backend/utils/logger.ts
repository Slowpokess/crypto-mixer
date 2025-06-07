import winston from 'winston';
import path from 'path';
import { ErrorHandler, initializeErrorHandler } from './errors/ErrorHandler';
import { AuditLogger, initializeAuditLogger, AuditEventType, AuditSeverity } from './logging/AuditLogger';
import { BaseError } from './errors/ErrorTypes';

const logDir = process.env.LOG_DIR || path.join(__dirname, '../logs');
const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

export interface OperationContext {
  operationId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  memoryUsage?: number;
  metadata?: Record<string, any>;
}

export interface EnhancedContextLogger {
  debug: (message: string, meta?: Record<string, any>) => void;
  info: (message: string, meta?: Record<string, any>) => void;
  warn: (message: string, meta?: Record<string, any>) => void;
  error: (message: string, meta?: Record<string, any>) => void;
  fatal: (message: string, meta?: Record<string, any>) => void;
  
  // Enhanced methods with operation context
  startOperation: (operation: string, context?: OperationContext) => Promise<string>;
  endOperation: (operationId: string, success: boolean, context?: OperationContext) => Promise<void>;
  logWithContext: (level: string, message: string, context: OperationContext, meta?: Record<string, any>) => void;
  logError: (error: BaseError | Error, context?: OperationContext) => Promise<void>;
  auditLog: (eventType: AuditEventType, message: string, context?: OperationContext, success?: boolean) => Promise<string>;
}

// Legacy interface for backward compatibility
export interface ContextLogger {
  debug: (message: string, meta?: Record<string, any>) => void;
  info: (message: string, meta?: Record<string, any>) => void;
  warn: (message: string, meta?: Record<string, any>) => void;
  error: (message: string, meta?: Record<string, any>) => void;
  fatal: (message: string, meta?: Record<string, any>) => void;
}

const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `${timestamp} [${level}] ${message}`;
        if (stack && !isProduction) {
          log += `\n${stack}`;
        }
        return log;
      })
    )
  })
];

if (isProduction) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 5242880,
      maxFiles: 5,
      handleExceptions: true
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: customFormat,
      maxsize: 5242880,
      maxFiles: 5
    })
  );
}

const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  defaultMeta: {
    service: 'crypto-mixer',
    environment: process.env.NODE_ENV || 'development'
  },
  transports,
  exitOnError: false
});

// Добавляем свойство stream для совместимости с Express
(logger as any).stream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

// Global instances
let errorHandler: ErrorHandler;
let auditLogger: AuditLogger;

/**
 * Инициализирует глобальные системы логирования и обработки ошибок
 */
function initializeLoggingSystems(): void {
  // Инициализируем системы
  errorHandler = initializeErrorHandler(logger, {
    enabled: true,
    criticalErrorThreshold: 5,
    errorRateThreshold: 50,
    timeWindowMinutes: 15
  });

  auditLogger = initializeAuditLogger({
    enabled: true,
    encryptLogs: isProduction,
    enableIntegrityCheck: true,
    retentionDays: 90,
    maxFileSize: '100mb',
    maxFiles: 50
  });

  logger.info('🔧 Системы логирования инициализированы', {
    errorHandlerEnabled: true,
    auditLoggerEnabled: true,
    environment: process.env.NODE_ENV
  });
}

/**
 * Создает enhanced context logger с полной поддержкой audit logging и error handling
 */
const createEnhancedContextLogger = (component: string): EnhancedContextLogger => {
  const generateOperationId = (): string => {
    return `${component}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  return {
    // Legacy methods for backward compatibility
    debug: (message: string, meta: Record<string, any> = {}) => 
      logger.debug(message, { component, ...meta }),
    
    info: (message: string, meta: Record<string, any> = {}) => 
      logger.info(message, { component, ...meta }),
    
    warn: (message: string, meta: Record<string, any> = {}) => 
      logger.warn(message, { component, ...meta }),
    
    error: (message: string, meta: Record<string, any> = {}) => 
      logger.error(message, { component, ...meta }),
    
    fatal: (message: string, meta: Record<string, any> = {}) => 
      logger.error(message, { component, level: 'fatal', ...meta }),

    // Enhanced methods with operation context
    startOperation: async (operation: string, context: OperationContext = {}): Promise<string> => {
      const operationId = context.operationId || generateOperationId();
      const startTime = new Date();
      
      // Log to Winston
      logger.info(`🚀 Начало операции: ${operation}`, {
        component,
        operation,
        operationId,
        startTime,
        ...context
      });

      // Log to Audit
      if (auditLogger) {
        await auditLogger.startOperation(operation, component, {
          ...context,
          correlationId: operationId,
          startTime
        });
      }

      return operationId;
    },

    endOperation: async (operationId: string, success: boolean, context: OperationContext = {}): Promise<void> => {
      const endTime = new Date();
      const duration = context.startTime ? endTime.getTime() - context.startTime.getTime() : undefined;
      
      // Log to Winston
      logger.info(`${success ? '✅' : '❌'} Завершение операции`, {
        component,
        operationId,
        success,
        endTime,
        duration,
        ...context
      });

      // Log to Audit
      if (auditLogger) {
        await auditLogger.endOperation(operationId, success, {
          ...context,
          endTime,
          duration
        });
      }
    },

    logWithContext: (level: string, message: string, context: OperationContext, meta: Record<string, any> = {}): void => {
      const logData = {
        component,
        ...context,
        ...meta
      };

      switch (level.toLowerCase()) {
        case 'debug':
          logger.debug(message, logData);
          break;
        case 'info':
          logger.info(message, logData);
          break;
        case 'warn':
          logger.warn(message, logData);
          break;
        case 'error':
          logger.error(message, logData);
          break;
        default:
          logger.info(message, logData);
      }
    },

    logError: async (error: BaseError | Error, context: OperationContext = {}): Promise<void> => {
      // Log to Winston with context
      logger.error(`❌ Ошибка в компоненте ${component}`, {
        component,
        error: error.message,
        stack: error.stack,
        ...context
      });

      // Log to Error Handler
      if (errorHandler) {
        await errorHandler.handleError(error, {
          component,
          operation: context.operationId || 'unknown',
          userId: context.userId,
          sessionId: context.sessionId,
          requestId: context.requestId,
          executionTime: context.duration,
          memoryUsage: context.memoryUsage,
          additionalInfo: context.metadata
        });
      }
    },

    auditLog: async (eventType: AuditEventType, message: string, context: OperationContext = {}, success: boolean = true): Promise<string> => {
      if (!auditLogger) {
        return '';
      }

      return auditLogger.logEvent(
        eventType,
        success ? AuditSeverity.INFO : AuditSeverity.WARNING,
        message,
        {
          component,
          operation: context.operationId || 'unknown',
          userId: context.userId,
          sessionId: context.sessionId,
          requestId: context.requestId,
          correlationId: context.correlationId,
          startTime: context.startTime,
          endTime: context.endTime,
          duration: context.duration,
          memoryUsage: context.memoryUsage,
          metadata: context.metadata
        },
        success
      );
    }
  };
};

/**
 * Legacy context logger для обратной совместимости
 */
const createContextLogger = (context: string): ContextLogger => {
  return {
    debug: (message: string, meta: Record<string, any> = {}) => logger.debug(message, { context, ...meta }),
    info: (message: string, meta: Record<string, any> = {}) => logger.info(message, { context, ...meta }),
    warn: (message: string, meta: Record<string, any> = {}) => logger.warn(message, { context, ...meta }),
    error: (message: string, meta: Record<string, any> = {}) => logger.error(message, { context, ...meta }),
    fatal: (message: string, meta: Record<string, any> = {}) => logger.error(message, { context, level: 'fatal', ...meta })
  };
};

// Legacy loggers for backward compatibility
const mixerLogger = createContextLogger('mixer');
const dbLogger = createContextLogger('database');
const apiLogger = createContextLogger('api');
const securityLogger = createContextLogger('security');

// Enhanced loggers with full functionality
const enhancedMixerLogger = createEnhancedContextLogger('mixer');
const enhancedDbLogger = createEnhancedContextLogger('database');
const enhancedApiLogger = createEnhancedContextLogger('api');
const enhancedSecurityLogger = createEnhancedContextLogger('security');
const enhancedBlockchainLogger = createEnhancedContextLogger('blockchain');
const enhancedSchedulerLogger = createEnhancedContextLogger('scheduler');
const enhancedWalletLogger = createEnhancedContextLogger('wallet');

export default logger;
export { 
  // Legacy exports
  createContextLogger, 
  mixerLogger, 
  dbLogger, 
  apiLogger, 
  securityLogger,
  
  // Enhanced exports
  createEnhancedContextLogger,
  enhancedMixerLogger,
  enhancedDbLogger,
  enhancedApiLogger,
  enhancedSecurityLogger,
  enhancedBlockchainLogger,
  enhancedSchedulerLogger,
  enhancedWalletLogger,
  
  // System initialization
  initializeLoggingSystems
};