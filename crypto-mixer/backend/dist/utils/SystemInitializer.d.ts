/**
 * System Initializer для comprehensive error handling и logging систем
 *
 * Централизованная инициализация и настройка всех систем:
 * - Error Handler с типизированными ошибками
 * - Audit Logger с шифрованием и целостностью
 * - Performance Monitor с трейсингом
 * - Alert Manager с множественными каналами
 * - Enhanced Logger с контекстом операций
 */
import winston from 'winston';
import { ErrorHandler } from './errors/ErrorHandler';
import { AuditLogger, AuditConfig } from './logging/AuditLogger';
import PerformanceMonitor, { PerformanceConfig } from './monitoring/PerformanceMonitor';
import { AlertManager } from './alerts/AlertManager';
export interface SystemConfig {
    environment: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    errorHandler: {
        enabled: boolean;
        criticalErrorThreshold: number;
        errorRateThreshold: number;
        timeWindowMinutes: number;
    };
    auditLogger: Partial<AuditConfig>;
    performanceMonitor: Partial<PerformanceConfig>;
    alertManager: {
        enabled: boolean;
        channels: {
            email?: {
                enabled: boolean;
                smtpHost: string;
                smtpPort: number;
                smtpUser: string;
                smtpPassword: string;
                recipients: string[];
            };
            slack?: {
                enabled: boolean;
                webhookUrl: string;
                channel: string;
            };
            webhook?: {
                enabled: boolean;
                url: string;
                headers?: Record<string, string>;
            };
        };
    };
}
export interface SystemHealth {
    overall: 'healthy' | 'degraded' | 'critical';
    components: {
        errorHandler: 'healthy' | 'degraded' | 'critical';
        auditLogger: 'healthy' | 'degraded' | 'critical';
        performanceMonitor: 'healthy' | 'degraded' | 'critical';
        alertManager: 'healthy' | 'degraded' | 'critical';
    };
    metrics: {
        totalErrors: number;
        criticalErrors: number;
        auditEvents: number;
        activeAlerts: number;
        systemPerformance: 'good' | 'warning' | 'critical';
    };
    lastCheck: Date;
}
/**
 * Централизованный инициализатор всех систем
 */
export declare class SystemInitializer {
    private config;
    private logger;
    private errorHandler?;
    private auditLogger?;
    private performanceMonitor?;
    private alertManager?;
    private initialized;
    constructor(config?: Partial<SystemConfig>);
    /**
     * Инициализирует все системы
     */
    initialize(): Promise<void>;
    /**
     * Получает health статус всех систем
     */
    getSystemHealth(): Promise<SystemHealth>;
    /**
     * Graceful shutdown всех систем
     */
    shutdown(): Promise<void>;
    /**
     * Возвращает экземпляры всех систем
     */
    getSystems(): {
        logger: winston.Logger;
        errorHandler: ErrorHandler;
        auditLogger: AuditLogger;
        performanceMonitor: PerformanceMonitor;
        alertManager: AlertManager;
    };
    /**
     * Возвращает enhanced loggers для всех компонентов
     */
    getLoggers(): {
        mixer: import("./logger").EnhancedContextLogger;
        database: import("./logger").EnhancedContextLogger;
        api: import("./logger").EnhancedContextLogger;
        security: import("./logger").EnhancedContextLogger;
        blockchain: import("./logger").EnhancedContextLogger;
        scheduler: import("./logger").EnhancedContextLogger;
        wallet: import("./logger").EnhancedContextLogger;
    };
    /**
     * Инициализирует базовое логирование
     */
    private initializeBaseLogging;
    /**
     * Инициализирует Error Handler
     */
    private initializeErrorHandler;
    /**
     * Инициализирует Audit Logger
     */
    private initializeAuditLogger;
    /**
     * Инициализирует Performance Monitor
     */
    private initializePerformanceMonitor;
    /**
     * Инициализирует Alert Manager
     */
    private initializeAlertManager;
    /**
     * Настраивает интеграции между системами
     */
    private setupSystemIntegrations;
    /**
     * Настраивает production-ready правила алертов
     */
    private setupProductionAlertRules;
    /**
     * Выполняет проверку здоровья систем
     */
    private performHealthCheck;
    /**
     * Создает основной logger
     */
    private createMainLogger;
    /**
     * Объединяет конфигурацию с дефолтными значениями
     */
    private mergeWithDefaults;
}
/**
 * Инициализирует все системы с конфигурацией
 */
export declare function initializeAllSystems(config?: Partial<SystemConfig>): Promise<SystemInitializer>;
/**
 * Получает глобальный system initializer
 */
export declare function getSystemInitializer(): SystemInitializer;
/**
 * Graceful shutdown всех систем
 */
export declare function shutdownAllSystems(): Promise<void>;
