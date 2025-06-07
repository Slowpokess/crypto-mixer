"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedWalletLogger = exports.enhancedSchedulerLogger = exports.enhancedBlockchainLogger = exports.enhancedSecurityLogger = exports.enhancedApiLogger = exports.enhancedDbLogger = exports.enhancedMixerLogger = exports.createEnhancedContextLogger = exports.securityLogger = exports.apiLogger = exports.dbLogger = exports.mixerLogger = exports.createContextLogger = void 0;
exports.initializeLoggingSystems = initializeLoggingSystems;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const ErrorHandler_1 = require("./errors/ErrorHandler");
const AuditLogger_1 = require("./logging/AuditLogger");
const logDir = process.env.LOG_DIR || path_1.default.join(__dirname, '../logs');
const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
const customFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
}), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
        log += `\n${stack}`;
    }
    return log;
}));
const transports = [
    new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple(), winston_1.default.format.printf(({ timestamp, level, message, stack }) => {
            let log = `${timestamp} [${level}] ${message}`;
            if (stack && !isProduction) {
                log += `\n${stack}`;
            }
            return log;
        }))
    })
];
if (isProduction) {
    transports.push(new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'error.log'),
        level: 'error',
        format: customFormat,
        maxsize: 5242880,
        maxFiles: 5,
        handleExceptions: true
    }), new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'combined.log'),
        format: customFormat,
        maxsize: 5242880,
        maxFiles: 5
    }));
}
const logger = winston_1.default.createLogger({
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
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};
// Global instances
let errorHandler;
let auditLogger;
/**
 * Инициализирует глобальные системы логирования и обработки ошибок
 */
function initializeLoggingSystems() {
    // Инициализируем системы
    errorHandler = (0, ErrorHandler_1.initializeErrorHandler)(logger, {
        enabled: true,
        criticalErrorThreshold: 5,
        errorRateThreshold: 50,
        timeWindowMinutes: 15
    });
    auditLogger = (0, AuditLogger_1.initializeAuditLogger)({
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
const createEnhancedContextLogger = (component) => {
    const generateOperationId = () => {
        return `${component}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };
    return {
        // Legacy methods for backward compatibility
        debug: (message, meta = {}) => logger.debug(message, { component, ...meta }),
        info: (message, meta = {}) => logger.info(message, { component, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { component, ...meta }),
        error: (message, meta = {}) => logger.error(message, { component, ...meta }),
        fatal: (message, meta = {}) => logger.error(message, { component, level: 'fatal', ...meta }),
        // Enhanced methods with operation context
        startOperation: async (operation, context = {}) => {
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
        endOperation: async (operationId, success, context = {}) => {
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
        logWithContext: (level, message, context, meta = {}) => {
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
        logError: async (error, context = {}) => {
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
        auditLog: async (eventType, message, context = {}, success = true) => {
            if (!auditLogger) {
                return '';
            }
            return auditLogger.logEvent(eventType, success ? AuditLogger_1.AuditSeverity.INFO : AuditLogger_1.AuditSeverity.WARNING, message, {
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
            }, success);
        }
    };
};
exports.createEnhancedContextLogger = createEnhancedContextLogger;
/**
 * Legacy context logger для обратной совместимости
 */
const createContextLogger = (context) => {
    return {
        debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
        info: (message, meta = {}) => logger.info(message, { context, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
        error: (message, meta = {}) => logger.error(message, { context, ...meta }),
        fatal: (message, meta = {}) => logger.error(message, { context, level: 'fatal', ...meta })
    };
};
exports.createContextLogger = createContextLogger;
// Legacy loggers for backward compatibility
const mixerLogger = createContextLogger('mixer');
exports.mixerLogger = mixerLogger;
const dbLogger = createContextLogger('database');
exports.dbLogger = dbLogger;
const apiLogger = createContextLogger('api');
exports.apiLogger = apiLogger;
const securityLogger = createContextLogger('security');
exports.securityLogger = securityLogger;
// Enhanced loggers with full functionality
const enhancedMixerLogger = createEnhancedContextLogger('mixer');
exports.enhancedMixerLogger = enhancedMixerLogger;
const enhancedDbLogger = createEnhancedContextLogger('database');
exports.enhancedDbLogger = enhancedDbLogger;
const enhancedApiLogger = createEnhancedContextLogger('api');
exports.enhancedApiLogger = enhancedApiLogger;
const enhancedSecurityLogger = createEnhancedContextLogger('security');
exports.enhancedSecurityLogger = enhancedSecurityLogger;
const enhancedBlockchainLogger = createEnhancedContextLogger('blockchain');
exports.enhancedBlockchainLogger = enhancedBlockchainLogger;
const enhancedSchedulerLogger = createEnhancedContextLogger('scheduler');
exports.enhancedSchedulerLogger = enhancedSchedulerLogger;
const enhancedWalletLogger = createEnhancedContextLogger('wallet');
exports.enhancedWalletLogger = enhancedWalletLogger;
exports.default = logger;
//# sourceMappingURL=logger.js.map