import winston from 'winston';
import { AuditEventType } from './logging/AuditLogger';
import { BaseError } from './errors/ErrorTypes';
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
    startOperation: (operation: string, context?: OperationContext) => Promise<string>;
    endOperation: (operationId: string, success: boolean, context?: OperationContext) => Promise<void>;
    logWithContext: (level: string, message: string, context: OperationContext, meta?: Record<string, any>) => void;
    logError: (error: BaseError | Error, context?: OperationContext) => Promise<void>;
    auditLog: (eventType: AuditEventType, message: string, context?: OperationContext, success?: boolean) => Promise<string>;
}
export interface ContextLogger {
    debug: (message: string, meta?: Record<string, any>) => void;
    info: (message: string, meta?: Record<string, any>) => void;
    warn: (message: string, meta?: Record<string, any>) => void;
    error: (message: string, meta?: Record<string, any>) => void;
    fatal: (message: string, meta?: Record<string, any>) => void;
}
declare const logger: winston.Logger;
/**
 * Инициализирует глобальные системы логирования и обработки ошибок
 */
declare function initializeLoggingSystems(): void;
/**
 * Создает enhanced context logger с полной поддержкой audit logging и error handling
 */
declare const createEnhancedContextLogger: (component: string) => EnhancedContextLogger;
/**
 * Legacy context logger для обратной совместимости
 */
declare const createContextLogger: (context: string) => ContextLogger;
declare const mixerLogger: ContextLogger;
declare const dbLogger: ContextLogger;
declare const apiLogger: ContextLogger;
declare const securityLogger: ContextLogger;
declare const enhancedMixerLogger: EnhancedContextLogger;
declare const enhancedDbLogger: EnhancedContextLogger;
declare const enhancedApiLogger: EnhancedContextLogger;
declare const enhancedSecurityLogger: EnhancedContextLogger;
declare const enhancedBlockchainLogger: EnhancedContextLogger;
declare const enhancedSchedulerLogger: EnhancedContextLogger;
declare const enhancedWalletLogger: EnhancedContextLogger;
export default logger;
export { createContextLogger, mixerLogger, dbLogger, apiLogger, securityLogger, createEnhancedContextLogger, enhancedMixerLogger, enhancedDbLogger, enhancedApiLogger, enhancedSecurityLogger, enhancedBlockchainLogger, enhancedSchedulerLogger, enhancedWalletLogger, initializeLoggingSystems };
