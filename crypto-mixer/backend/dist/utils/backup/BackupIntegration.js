"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegratedBackupSystem = void 0;
exports.createIntegratedBackupSystem = createIntegratedBackupSystem;
const BackupManager_1 = require("./BackupManager");
const DisasterRecoveryManager_1 = require("./DisasterRecoveryManager");
const BackupMonitoring_1 = require("./BackupMonitoring");
const BackupDashboard_1 = require("./BackupDashboard");
const logger_1 = require("../logger");
/**
 * Интегрированная система Backup и Disaster Recovery
 * Объединяет все компоненты в единое решение enterprise-уровня
 */
class IntegratedBackupSystem {
    constructor(config) {
        this.dashboard = null;
        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = null;
        this.healthCheckInterval = null;
        this.lastHealthCheck = null;
        this.systemErrors = [];
        this.config = config;
        // Инициализация компонентов
        this.backupManager = new BackupManager_1.BackupManager(config.backup);
        this.drManager = new DisasterRecoveryManager_1.DisasterRecoveryManager(config.disasterRecovery, this.backupManager);
        this.monitoring = new BackupMonitoring_1.BackupMonitoring(config.monitoring, this.backupManager, this.drManager);
        if (config.dashboard.enabled) {
            this.dashboard = new BackupDashboard_1.BackupDashboard(this.monitoring, this.backupManager, this.drManager, config.dashboard.port);
        }
        this.setupEventHandlers();
    }
    /**
     * Инициализация всей системы
     */
    async initialize() {
        const operationId = await logger_1.enhancedDbLogger.startOperation('integrated_backup_system_init');
        try {
            logger_1.enhancedDbLogger.info('🚀 Инициализация Integrated Backup System');
            this.systemErrors = [];
            // Последовательная инициализация компонентов
            await this.initializeBackupManager();
            await this.initializeDisasterRecoveryManager();
            await this.initializeMonitoring();
            if (this.dashboard) {
                await this.initializeDashboard();
            }
            this.isInitialized = true;
            // Автозапуск если включен
            if (this.config.integration.autoStart) {
                await this.start();
            }
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Integrated Backup System инициализирован', {
                components: {
                    backupManager: true,
                    disasterRecovery: true,
                    monitoring: true,
                    dashboard: !!this.dashboard
                },
                autoStart: this.config.integration.autoStart
            });
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            this.systemErrors.push(`Initialization failed: ${error}`);
            throw error;
        }
    }
    /**
     * Запуск всех компонентов системы
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Система не инициализирована. Вызовите initialize() сначала');
        }
        if (this.isRunning) {
            logger_1.enhancedDbLogger.warn('⚠️ Система уже запущена');
            return;
        }
        const operationId = await logger_1.enhancedDbLogger.startOperation('integrated_backup_system_start');
        try {
            logger_1.enhancedDbLogger.info('🚀 Запуск Integrated Backup System');
            this.startTime = new Date();
            this.systemErrors = [];
            // Запуск мониторинга (должен быть первым для отслеживания других компонентов)
            if (this.monitoring && this.config.monitoring.enabled) {
                await this.startMonitoring();
            }
            // Запуск disaster recovery менеджера
            if (this.drManager && this.config.disasterRecovery.enabled) {
                await this.startDisasterRecovery();
            }
            // Запуск dashboard
            if (this.dashboard && this.config.dashboard.enabled) {
                await this.startDashboard();
            }
            // Запуск системного health check
            if (this.config.integration.healthCheckEnabled) {
                this.startSystemHealthCheck();
            }
            this.isRunning = true;
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Integrated Backup System запущен', {
                uptime: this.getUptime(),
                components: this.getComponentsStatus()
            });
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            this.systemErrors.push(`Start failed: ${error}`);
            throw error;
        }
    }
    /**
     * Остановка всех компонентов системы
     */
    async stop() {
        if (!this.isRunning) {
            logger_1.enhancedDbLogger.warn('⚠️ Система уже остановлена');
            return;
        }
        const operationId = await logger_1.enhancedDbLogger.startOperation('integrated_backup_system_stop');
        try {
            logger_1.enhancedDbLogger.info('🛑 Остановка Integrated Backup System');
            // Остановка health check
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            // Graceful shutdown с таймаутом
            const shutdownPromises = [];
            // Остановка dashboard (первым, чтобы перестать принимать запросы)
            if (this.dashboard) {
                shutdownPromises.push(this.stopDashboard().catch(error => {
                    this.systemErrors.push(`Dashboard shutdown error: ${error}`);
                }));
            }
            // Остановка мониторинга
            if (this.monitoring) {
                shutdownPromises.push(this.stopMonitoring().catch(error => {
                    this.systemErrors.push(`Monitoring shutdown error: ${error}`);
                }));
            }
            // Остановка disaster recovery
            if (this.drManager) {
                shutdownPromises.push(this.stopDisasterRecovery().catch(error => {
                    this.systemErrors.push(`Disaster Recovery shutdown error: ${error}`);
                }));
            }
            // Остановка backup manager (последним)
            if (this.backupManager) {
                shutdownPromises.push(this.stopBackupManager().catch(error => {
                    this.systemErrors.push(`Backup Manager shutdown error: ${error}`);
                }));
            }
            // Ожидание завершения всех операций с таймаутом
            const timeout = this.config.integration.gracefulShutdownTimeout * 1000;
            await Promise.race([
                Promise.allSettled(shutdownPromises),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), timeout))
            ]);
            this.isRunning = false;
            this.startTime = null;
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Integrated Backup System остановлен', {
                errors: this.systemErrors.length
            });
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            this.systemErrors.push(`Stop failed: ${error}`);
            // Принудительная остановка при ошибке
            this.isRunning = false;
            this.startTime = null;
            throw error;
        }
    }
    /**
     * Перезапуск системы
     */
    async restart() {
        logger_1.enhancedDbLogger.info('🔄 Перезапуск Integrated Backup System');
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Пауза 2 секунды
        await this.start();
        logger_1.enhancedDbLogger.info('✅ Integrated Backup System перезапущен');
    }
    /**
     * Получение статуса системы
     */
    getSystemStatus() {
        return {
            overall: this.calculateOverallStatus(),
            components: this.getComponentsStatus(),
            lastHealthCheck: this.lastHealthCheck || new Date(0),
            uptime: this.getUptime(),
            errors: [...this.systemErrors]
        };
    }
    /**
     * Проверка готовности системы
     */
    isReady() {
        return this.isInitialized && this.isRunning;
    }
    /**
     * Получение времени работы в секундах
     */
    getUptime() {
        if (!this.startTime)
            return 0;
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
    /**
     * Создание backup через интегрированную систему
     */
    async createBackup(options = {}) {
        if (!this.isReady()) {
            throw new Error('Система не готова для создания backup');
        }
        logger_1.enhancedDbLogger.info('📦 Создание backup через интегрированную систему', options);
        try {
            const report = await this.backupManager.createFullBackup(options);
            logger_1.enhancedDbLogger.info('✅ Backup создан через интегрированную систему', {
                backupId: report.id,
                status: report.status,
                duration: report.duration
            });
            return report;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка создания backup', { error });
            throw error;
        }
    }
    /**
     * Выполнение восстановления через интегрированную систему
     */
    async performRecovery(planId, options = {}) {
        if (!this.isReady()) {
            throw new Error('Система не готова для восстановления');
        }
        logger_1.enhancedDbLogger.info('🔄 Выполнение восстановления через интегрированную систему', {
            planId,
            ...options
        });
        try {
            const execution = await this.drManager.manualRecovery(planId, options);
            logger_1.enhancedDbLogger.info('✅ Восстановление выполнено через интегрированную систему', {
                executionId: execution.id,
                status: execution.status
            });
            return execution;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка восстановления', { error });
            throw error;
        }
    }
    // ========== ПРИВАТНЫЕ МЕТОДЫ ==========
    setupEventHandlers() {
        // Обработка критических ошибок
        process.on('uncaughtException', (error) => {
            logger_1.enhancedDbLogger.error('💥 Необработанное исключение в Backup System', { error });
            this.systemErrors.push(`Uncaught exception: ${error.message}`);
        });
        process.on('unhandledRejection', (reason) => {
            logger_1.enhancedDbLogger.error('💥 Необработанный Promise rejection в Backup System', { reason });
            this.systemErrors.push(`Unhandled rejection: ${reason}`);
        });
        // Graceful shutdown на системные сигналы
        const gracefulShutdown = async (signal) => {
            logger_1.enhancedDbLogger.info(`🔚 Получен сигнал ${signal}, выполняется graceful shutdown`);
            try {
                await this.stop();
                process.exit(0);
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка при graceful shutdown', { error });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
    async initializeBackupManager() {
        try {
            await this.backupManager.initialize();
            logger_1.enhancedDbLogger.info('✅ BackupManager инициализирован');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инициализации BackupManager', { error });
            throw new Error(`BackupManager initialization failed: ${error}`);
        }
    }
    async initializeDisasterRecoveryManager() {
        try {
            await this.drManager.initialize();
            logger_1.enhancedDbLogger.info('✅ DisasterRecoveryManager инициализирован');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инициализации DisasterRecoveryManager', { error });
            throw new Error(`DisasterRecoveryManager initialization failed: ${error}`);
        }
    }
    async initializeMonitoring() {
        try {
            await this.monitoring.initialize();
            logger_1.enhancedDbLogger.info('✅ BackupMonitoring инициализирован');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инициализации BackupMonitoring', { error });
            throw new Error(`BackupMonitoring initialization failed: ${error}`);
        }
    }
    async initializeDashboard() {
        if (!this.dashboard)
            return;
        try {
            // Dashboard инициализируется при создании, просто логируем
            logger_1.enhancedDbLogger.info('✅ BackupDashboard инициализирован');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инициализации BackupDashboard', { error });
            throw new Error(`BackupDashboard initialization failed: ${error}`);
        }
    }
    async startMonitoring() {
        try {
            // Monitoring запускается автоматически при инициализации если enabled
            logger_1.enhancedDbLogger.info('✅ BackupMonitoring запущен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка запуска BackupMonitoring', { error });
            this.systemErrors.push(`Monitoring start failed: ${error}`);
        }
    }
    async startDisasterRecovery() {
        try {
            // DisasterRecovery запускается автоматически при инициализации если enabled
            logger_1.enhancedDbLogger.info('✅ DisasterRecoveryManager запущен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка запуска DisasterRecoveryManager', { error });
            this.systemErrors.push(`DisasterRecovery start failed: ${error}`);
        }
    }
    async startDashboard() {
        if (!this.dashboard)
            return;
        try {
            await this.dashboard.start();
            logger_1.enhancedDbLogger.info('✅ BackupDashboard запущен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка запуска BackupDashboard', { error });
            this.systemErrors.push(`Dashboard start failed: ${error}`);
        }
    }
    startSystemHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.performSystemHealthCheck();
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка системного health check', { error });
                this.systemErrors.push(`Health check failed: ${error}`);
            }
        }, this.config.integration.healthCheckInterval * 1000);
        logger_1.enhancedDbLogger.info('💓 Системный health check запущен', {
            interval: this.config.integration.healthCheckInterval
        });
    }
    async performSystemHealthCheck() {
        this.lastHealthCheck = new Date();
        const status = this.getSystemStatus();
        if (status.overall === 'critical' || status.overall === 'down') {
            logger_1.enhancedDbLogger.error('🚨 Критическое состояние системы backup', {
                status: status.overall,
                errors: status.errors,
                components: status.components
            });
            // Можно добавить автоматические действия при критическом состоянии
            // Например, попытка перезапуска компонентов
        }
        logger_1.enhancedDbLogger.debug('💓 Системный health check выполнен', {
            status: status.overall,
            uptime: status.uptime,
            errors: status.errors.length
        });
    }
    async stopMonitoring() {
        if (this.monitoring) {
            await this.monitoring.shutdown();
            logger_1.enhancedDbLogger.info('🛑 BackupMonitoring остановлен');
        }
    }
    async stopDisasterRecovery() {
        if (this.drManager) {
            await this.drManager.shutdown();
            logger_1.enhancedDbLogger.info('🛑 DisasterRecoveryManager остановлен');
        }
    }
    async stopDashboard() {
        if (this.dashboard) {
            await this.dashboard.stop();
            logger_1.enhancedDbLogger.info('🛑 BackupDashboard остановлен');
        }
    }
    async stopBackupManager() {
        if (this.backupManager) {
            await this.backupManager.shutdown();
            logger_1.enhancedDbLogger.info('🛑 BackupManager остановлен');
        }
    }
    calculateOverallStatus() {
        if (!this.isRunning)
            return 'down';
        const components = this.getComponentsStatus();
        const componentValues = Object.values(components);
        if (componentValues.includes('error'))
            return 'critical';
        if (this.systemErrors.length > 5)
            return 'warning';
        if (!this.isReady())
            return 'warning';
        return 'healthy';
    }
    getComponentsStatus() {
        return {
            backupManager: this.isRunning ? 'running' : 'stopped',
            disasterRecovery: this.isRunning && this.config.disasterRecovery.enabled ? 'running' : 'stopped',
            monitoring: this.isRunning && this.config.monitoring.enabled ? 'running' : 'stopped',
            dashboard: this.dashboard?.getStatus().isRunning ? 'running' : 'stopped'
        };
    }
}
exports.IntegratedBackupSystem = IntegratedBackupSystem;
/**
 * Factory функция для создания настроенной системы backup
 */
function createIntegratedBackupSystem(customConfig) {
    const defaultConfig = {
        backup: {
            enabled: true,
            storage: {
                local: {
                    enabled: true,
                    path: '/app/backups',
                    maxFiles: 50,
                    retention: {
                        daily: 7,
                        weekly: 4,
                        monthly: 12
                    }
                },
                remote: {
                    enabled: false,
                    type: 'aws-s3',
                    credentials: {},
                    encryption: true
                }
            },
            schedule: {
                full: '0 2 * * *', // 02:00 каждый день
                incremental: '0 */6 * * *', // каждые 6 часов
                differential: '0 8,20 * * *' // 08:00 и 20:00
            },
            compression: {
                enabled: true,
                level: 6,
                algorithm: 'gzip'
            },
            encryption: {
                enabled: true,
                algorithm: 'aes-256-gcm',
                keyRotation: true,
                keyRotationDays: 90
            },
            verification: {
                checksumAlgorithm: 'sha256',
                integrityCheck: true,
                testRestore: true,
                testRestoreFrequency: 7
            },
            alerts: {
                enabled: true,
                alertOnFailure: true,
                alertOnSuccess: false,
                alertOnLongDuration: true,
                maxDurationMinutes: 120
            }
        },
        disasterRecovery: {
            enabled: true,
            autoRecovery: {
                enabled: true,
                triggers: {
                    databaseFailure: true,
                    applicationCrash: true,
                    dataCorruption: true,
                    serviceUnavailable: true,
                    manualTrigger: true
                },
                thresholds: {
                    healthCheckFailures: 3,
                    responseTimeMs: 5000,
                    errorRate: 10,
                    memoryUsagePercent: 90,
                    diskUsagePercent: 95
                },
                cooldownPeriod: 15,
                maxRetries: 3
            },
            recoveryPlan: [], // Will be populated by DisasterRecoveryManager
            monitoring: {
                healthCheckInterval: 60,
                alertThresholds: {
                    warning: 1,
                    critical: 3,
                    emergency: 5
                },
                escalation: {
                    level1: ['admin@crypto-mixer.com'],
                    level2: ['emergency@crypto-mixer.com'],
                    level3: ['+1234567890']
                }
            },
            validation: {
                postRecoveryChecks: true,
                dataIntegrityValidation: true,
                serviceHealthValidation: true,
                performanceValidation: true,
                timeoutMinutes: 30
            },
            failover: {
                enabled: false,
                primaryDatacenter: 'primary',
                secondaryDatacenter: 'secondary',
                automaticFailover: false,
                manualApprovalRequired: true,
                replicationLag: 60
            }
        },
        monitoring: {
            enabled: true,
            thresholds: {
                maxBackupDuration: 120,
                minSuccessRate: 95,
                maxFailedBackups: 3,
                diskSpaceWarning: 80,
                diskSpaceCritical: 95,
                healthCheckInterval: 60
            },
            alerts: {
                enabled: true,
                channels: [
                    {
                        type: 'webhook',
                        name: 'default_webhook',
                        enabled: true,
                        config: {
                            url: process.env.BACKUP_WEBHOOK_URL || 'http://localhost:3000/webhooks/backup',
                            priority: 'normal'
                        },
                        filters: {}
                    }
                ],
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            level: 1,
                            channels: ['default_webhook'],
                            requireAcknowledgment: false,
                            autoResolve: true,
                            autoResolveTimeout: 60
                        }
                    ],
                    timeouts: [15, 30, 60],
                    maxEscalations: 3
                },
                rateLimit: {
                    enabled: true,
                    maxAlertsPerHour: 10,
                    cooldownMinutes: 5
                }
            },
            metrics: {
                retentionDays: 30,
                aggregationIntervals: [5, 15, 60, 1440],
                exportEnabled: true,
                exportFormat: 'json',
                exportPath: '/app/backup-metrics'
            },
            dashboard: {
                enabled: true,
                refreshInterval: 30,
                historyDepth: 7
            }
        },
        dashboard: {
            enabled: true,
            port: 3030
        },
        integration: {
            autoStart: true,
            gracefulShutdownTimeout: 30,
            healthCheckEnabled: true,
            healthCheckInterval: 300
        }
    };
    // Слияние с пользовательской конфигурацией
    const config = mergeDeep(defaultConfig, customConfig || {});
    return new IntegratedBackupSystem(config);
}
/**
 * Глубокое слияние объектов
 */
function mergeDeep(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = mergeDeep(target[key] || {}, source[key]);
        }
        else {
            result[key] = source[key];
        }
    }
    return result;
}
//# sourceMappingURL=BackupIntegration.js.map