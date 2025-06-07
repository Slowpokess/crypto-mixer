"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendHealthChecker = void 0;
exports.setGlobalDatabaseManager = setGlobalDatabaseManager;
const HealthCheckInterface_1 = require("./interfaces/HealthCheckInterface");
// Глобальная ссылка на экземпляр DatabaseManager (будет устанавливаться в server.ts)
let globalDbManager = null;
function setGlobalDatabaseManager(dbManager) {
    globalDbManager = dbManager;
}
const logger_1 = require("../logger");
const redis = __importStar(require("redis"));
/**
 * Реализация Health Check для основного Backend сервиса crypto-mixer
 * Проверяет все критически важные компоненты системы
 */
class BackendHealthChecker extends HealthCheckInterface_1.BaseHealthChecker {
    constructor() {
        super('crypto-mixer-backend', process.env.npm_package_version || '1.0.0', {
            enabledChecks: {
                database: true,
                cache: true,
                blockchain: false, // Backend не напрямую связан с блокчейном
                messageQueue: true,
                vault: process.env.VAULT_ENABLED === 'true',
                hsm: process.env.HSM_ENABLED === 'true',
                dependencies: true
            },
            timeouts: {
                database: 10000,
                cache: 5000,
                blockchain: 0,
                messageQueue: 8000,
                vault: 8000,
                hsm: 15000,
                dependencies: 10000
            },
            thresholds: {
                responseTime: {
                    warning: 2000,
                    critical: 10000
                },
                memoryUsage: {
                    warning: 80,
                    critical: 90
                },
                diskUsage: {
                    warning: 85,
                    critical: 95
                },
                cpuUsage: {
                    warning: 75,
                    critical: 90
                }
            }
        });
        this.redisClient = null;
    }
    /**
     * Получение синглтон экземпляра
     */
    static getInstance() {
        if (!BackendHealthChecker.instance) {
            BackendHealthChecker.instance = new BackendHealthChecker();
        }
        return BackendHealthChecker.instance;
    }
    /**
     * Проверка состояния PostgreSQL базы данных
     */
    async checkDatabase() {
        const startTime = Date.now();
        try {
            if (!globalDbManager) {
                throw new Error('Database manager not initialized');
            }
            const dbManager = globalDbManager;
            // Используем встроенный healthCheck метод
            const healthResult = await dbManager.healthCheck();
            // Получение версии PostgreSQL
            let version = 'unknown';
            let activeConnections = 0;
            let maxConnections = 100;
            try {
                const versionResult = await dbManager.query('SELECT version() as pg_version');
                if (Array.isArray(versionResult) && versionResult[0]) {
                    version = versionResult[0].pg_version?.split(' ')[1] || 'unknown';
                }
                // Получение статистики активных подключений
                const connectionStats = await dbManager.query(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            max_conn.setting::int as max_connections
          FROM pg_stat_activity 
          CROSS JOIN (SELECT setting FROM pg_settings WHERE name = 'max_connections') max_conn
        `);
                if (Array.isArray(connectionStats) && connectionStats[0]) {
                    const stats = connectionStats[0];
                    activeConnections = parseInt(stats.active_connections || '0');
                    maxConnections = parseInt(stats.max_connections || '100');
                }
            }
            catch (error) {
                // Игнорируем ошибки получения дополнительной информации
            }
            const responseTime = Date.now() - startTime;
            return {
                connected: healthResult.status !== 'critical',
                responseTime,
                activeConnections,
                maxConnections,
                lastQuery: `Health check completed (${responseTime}ms)`,
                version,
                replicationLag: 0
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Database health check failed', { error });
            return {
                connected: false,
                responseTime: Date.now() - startTime,
                activeConnections: 0,
                maxConnections: 0,
                lastQuery: `Failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
     * Проверка состояния Redis кэша
     */
    async checkCache() {
        const startTime = Date.now();
        try {
            // Создание подключения к Redis если его нет
            if (!this.redisClient) {
                this.redisClient = redis.createClient({
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379'),
                    password: process.env.REDIS_PASSWORD,
                    connectTimeout: this.config.timeouts.cache
                });
            }
            // Подключение если не подключен
            if (!this.redisClient.isOpen) {
                await this.redisClient.connect();
            }
            // Выполнение PING команды
            await this.redisClient.ping();
            // Получение информации о памяти
            const info = await this.redisClient.info('memory');
            const memoryLines = info.split('\r\n');
            const usedMemory = this.extractInfoValue(memoryLines, 'used_memory');
            const maxMemory = this.extractInfoValue(memoryLines, 'maxmemory') || usedMemory * 2;
            const memoryUsage = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;
            // Получение статистики попаданий в кэш
            const statsInfo = await this.redisClient.info('stats');
            const statsLines = statsInfo.split('\r\n');
            const keyspaceHits = this.extractInfoValue(statsLines, 'keyspace_hits');
            const keyspaceMisses = this.extractInfoValue(statsLines, 'keyspace_misses');
            const totalRequests = keyspaceHits + keyspaceMisses;
            const hitRatio = totalRequests > 0 ? (keyspaceHits / totalRequests) * 100 : 100;
            const evictions = this.extractInfoValue(statsLines, 'evicted_keys');
            // Получение версии Redis
            const serverInfo = await this.redisClient.info('server');
            const serverLines = serverInfo.split('\r\n');
            const version = this.extractInfoStringValue(serverLines, 'redis_version');
            const responseTime = Date.now() - startTime;
            return {
                connected: true,
                responseTime,
                memoryUsage,
                hitRatio,
                evictions,
                version
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Redis health check failed', { error });
            // Попытка закрыть проблемное соединение
            if (this.redisClient) {
                try {
                    await this.redisClient.quit();
                }
                catch (e) {
                    // Игнорируем ошибки при закрытии
                }
                this.redisClient = null;
            }
            return {
                connected: false,
                responseTime: Date.now() - startTime,
                memoryUsage: 0,
                hitRatio: 0,
                evictions: 0
            };
        }
    }
    /**
     * Backend сервис не работает напрямую с блокчейном
     */
    async checkBlockchain() {
        return {
            connectedNodes: 0,
            syncStatus: 'not_synced',
            lastBlockHeight: 0,
            pendingTransactions: 0,
            responseTime: 0,
            currencies: {}
        };
    }
    /**
     * Проверка состояния RabbitMQ
     */
    async checkMessageQueue() {
        const startTime = Date.now();
        try {
            const host = process.env.RABBITMQ_HOST || 'localhost';
            const port = parseInt(process.env.RABBITMQ_PORT || '15672'); // Management API port
            const user = process.env.RABBITMQ_USER || 'guest';
            const pass = process.env.RABBITMQ_PASS || 'guest';
            // Проверка через Management API
            const url = `http://${host}:${port}/api/overview`;
            const auth = Buffer.from(`${user}:${pass}`).toString('base64');
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(this.config.timeouts.messageQueue)
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            // Получение информации о очередях
            const queuesUrl = `http://${host}:${port}/api/queues`;
            const queuesResponse = await fetch(queuesUrl, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(this.config.timeouts.messageQueue)
            });
            const queues = {};
            if (queuesResponse.ok) {
                const queuesData = await queuesResponse.json();
                for (const queue of queuesData) {
                    queues[queue.name] = {
                        messages: queue.messages || 0,
                        consumers: queue.consumers || 0,
                        ready: queue.messages_ready || 0,
                        unacked: queue.messages_unacknowledged || 0
                    };
                }
            }
            const responseTime = Date.now() - startTime;
            return {
                connected: true,
                queues,
                channels: data.object_totals?.channels || 0,
                version: data.rabbitmq_version,
                responseTime
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ RabbitMQ health check failed', { error });
            // Fallback - проверка TCP порта 5672
            const tcpCheck = await HealthCheckInterface_1.HealthCheckUtils.checkTcpPort(process.env.RABBITMQ_HOST || 'localhost', parseInt(process.env.RABBITMQ_AMQP_PORT || '5672'), 3000);
            return {
                connected: tcpCheck.status,
                queues: {},
                channels: 0
            };
        }
    }
    /**
     * Проверка состояния HashiCorp Vault
     */
    async checkVault() {
        const startTime = Date.now();
        try {
            const host = process.env.VAULT_HOST || 'localhost';
            const port = parseInt(process.env.VAULT_PORT || '8200');
            const url = `http://${host}:${port}/v1/sys/health`;
            const response = await fetch(url, {
                signal: AbortSignal.timeout(this.config.timeouts.vault)
            });
            const responseTime = Date.now() - startTime;
            if (!response.ok) {
                // Vault может возвращать различные статусы в зависимости от состояния
                if (response.status === 503) {
                    // Vault запечатан
                    return {
                        sealed: true,
                        standby: false,
                        version: 'unknown',
                        responseTime
                    };
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const health = await response.json();
            return {
                sealed: health.sealed || false,
                standby: health.standby || false,
                version: health.version || 'unknown',
                responseTime,
                lastAuthentication: new Date().toISOString()
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Vault health check failed', { error });
            return {
                sealed: true,
                standby: false,
                version: 'unknown',
                responseTime: Date.now() - startTime
            };
        }
    }
    /**
     * Проверка состояния HSM (Hardware Security Module)
     */
    async checkHSM() {
        const startTime = Date.now();
        try {
            // Реальная проверка HSM через PKCS#11 интерфейс
            const hsmManager = await this.getHSMManager();
            if (!hsmManager) {
                throw new Error('HSM Manager not available');
            }
            // Проверка инициализации HSM
            const isInitialized = await hsmManager.isInitialized();
            if (!isInitialized) {
                throw new Error('HSM not initialized');
            }
            // Получение информации о слотах
            const slots = await hsmManager.getSlotInfo();
            const slotsInfo = {};
            for (const slot of slots) {
                try {
                    // Проверка каждого слота
                    const slotStatus = await hsmManager.getSlotStatus(slot.id);
                    const tokenInfo = await hsmManager.getTokenInfo(slot.id);
                    slotsInfo[slot.id.toString()] = {
                        connected: slotStatus.connected,
                        label: tokenInfo.label || `Slot ${slot.id}`,
                        keyCount: await hsmManager.getKeyCount(slot.id),
                        serialNumber: tokenInfo.serialNumber,
                        manufacturerId: tokenInfo.manufacturerId,
                        firmwareVersion: tokenInfo.firmwareVersion,
                        freeMemory: tokenInfo.freePublicMemory,
                        totalMemory: tokenInfo.totalPublicMemory
                    };
                }
                catch (slotError) {
                    logger_1.enhancedDbLogger.warn(`❌ HSM Slot ${slot.id} check failed`, { error: slotError });
                    slotsInfo[slot.id.toString()] = {
                        connected: false,
                        label: `Slot ${slot.id} (Error)`,
                        keyCount: 0,
                        error: slotError instanceof Error ? slotError.message : String(slotError)
                    };
                }
            }
            // Проверка активных сессий
            const activeSessions = await hsmManager.getActiveSessionsCount();
            // Тест криптографических операций
            let cryptoTestResult = false;
            try {
                cryptoTestResult = await hsmManager.testCryptographicOperations();
            }
            catch (cryptoError) {
                logger_1.enhancedDbLogger.warn('❌ HSM crypto test failed', { error: cryptoError });
            }
            // Получение версии HSM
            const version = await hsmManager.getLibraryVersion();
            const responseTime = Date.now() - startTime;
            // Определение общего статуса подключения
            const connectedSlots = Object.values(slotsInfo).filter((slot) => slot.connected);
            const isConnected = connectedSlots.length > 0 && cryptoTestResult;
            return {
                connected: isConnected,
                sessions: activeSessions,
                slots: slotsInfo,
                version,
                responseTime,
                cryptoTestPassed: cryptoTestResult,
                libraryPath: hsmManager.getLibraryPath(),
                capabilities: await hsmManager.getCapabilities()
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ HSM health check failed', { error });
            const responseTime = Date.now() - startTime;
            return {
                connected: false,
                sessions: 0,
                slots: {},
                responseTime,
                error: error instanceof Error ? error.message : String(error),
                cryptoTestPassed: false
            };
        }
    }
    /**
     * Получение экземпляра HSM Manager
     */
    async getHSMManager() {
        try {
            // Динамический импорт HSM Manager
            const HSMManagerModule = await Promise.resolve().then(() => __importStar(require('../../security/HSMManager')));
            // Проверяем есть ли HSMManager в модуле
            if (HSMManagerModule && typeof HSMManagerModule === 'object') {
                const HSMManager = HSMManagerModule.HSMManager;
                if (HSMManager && typeof HSMManager.getInstance === 'function') {
                    return HSMManager.getInstance();
                }
                // Альтернативный экспорт
                if (typeof HSMManagerModule.default?.getInstance === 'function') {
                    return HSMManagerModule.default.getInstance();
                }
                // Создание нового экземпляра если нет getInstance
                if (typeof HSMManager === 'function') {
                    return new HSMManager();
                }
            }
            throw new Error('HSMManager class not found or not properly exported');
        }
        catch (error) {
            // HSM Manager может быть недоступен в некоторых конфигурациях
            logger_1.enhancedDbLogger.debug('HSM Manager not available', {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }
    /**
     * Проверка состояния зависимых сервисов
     */
    async checkDependencies() {
        const dependencies = [];
        const checkPromises = [];
        // Mixer API сервис
        checkPromises.push(this.checkDependencyService('mixer-api', process.env.MIXER_API_HOST || 'localhost', parseInt(process.env.MIXER_API_PORT || '3000'), '/health'));
        // Blockchain сервис
        checkPromises.push(this.checkDependencyService('blockchain-service', process.env.BLOCKCHAIN_SERVICE_HOST || 'localhost', parseInt(process.env.BLOCKCHAIN_SERVICE_PORT || '3001'), '/health'));
        // Wallet сервис
        checkPromises.push(this.checkDependencyService('wallet-service', process.env.WALLET_SERVICE_HOST || 'localhost', parseInt(process.env.WALLET_SERVICE_PORT || '3002'), '/health'));
        // Scheduler сервис
        checkPromises.push(this.checkDependencyService('scheduler-service', process.env.SCHEDULER_SERVICE_HOST || 'localhost', parseInt(process.env.SCHEDULER_SERVICE_PORT || '3003'), '/health'));
        // Monitoring сервис
        checkPromises.push(this.checkDependencyService('monitoring-service', process.env.MONITORING_SERVICE_HOST || 'localhost', parseInt(process.env.MONITORING_SERVICE_PORT || '3004'), '/health'));
        const results = await Promise.allSettled(checkPromises);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                dependencies.push(result.value);
            }
            else {
                dependencies.push({
                    service: ['mixer-api', 'blockchain-service', 'wallet-service', 'scheduler-service', 'monitoring-service'][i],
                    status: 'critical',
                    responseTime: 0,
                    lastChecked: new Date().toISOString(),
                    error: result.reason?.message || 'Unknown error'
                });
            }
        }
        return dependencies;
    }
    /**
     * Выполнение кастомных проверок специфичных для backend
     */
    async performCustomChecks() {
        const customChecks = {};
        try {
            // Проверка системных ресурсов
            const systemMetrics = await HealthCheckInterface_1.HealthCheckUtils.getSystemMetrics();
            customChecks.systemMetrics = systemMetrics;
            // Проверка доступного места на диске
            customChecks.diskSpace = await this.checkDiskSpace();
            // Проверка состояния логов
            customChecks.logging = await this.checkLoggingSystem();
            // Проверка конфигурации
            customChecks.configuration = this.checkConfiguration();
            // Проверка процессов Node.js
            customChecks.nodeProcess = this.checkNodeProcess();
        }
        catch (error) {
            customChecks.error = error instanceof Error ? error.message : String(error);
        }
        return customChecks;
    }
    /**
     * Проверка конкретного зависимого сервиса
     */
    async checkDependencyService(serviceName, host, port, path) {
        const url = `http://${host}:${port}${path}`;
        try {
            const checkResult = await HealthCheckInterface_1.HealthCheckUtils.checkHttpService(url, this.config.timeouts.dependencies, 200);
            return {
                service: serviceName,
                status: checkResult.status ? 'healthy' : 'critical',
                responseTime: checkResult.responseTime,
                lastChecked: new Date().toISOString(),
                error: checkResult.error
            };
        }
        catch (error) {
            return {
                service: serviceName,
                status: 'critical',
                responseTime: 0,
                lastChecked: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Проверка доступного места на диске
     */
    async checkDiskSpace() {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            const stats = await fs.statfs(path.resolve('./'));
            const total = stats.bavail * stats.bsize;
            const available = stats.bavail * stats.bsize;
            const used = (stats.blocks - stats.bavail) * stats.bsize;
            const percentage = total > 0 ? (used / total) * 100 : 0;
            return {
                available,
                total,
                percentage
            };
        }
        catch (error) {
            return {
                available: 0,
                total: 0,
                percentage: 0
            };
        }
    }
    /**
     * Проверка системы логирования
     */
    async checkLoggingSystem() {
        try {
            // Проверка, что логгер работает
            const testLogStart = Date.now();
            logger_1.enhancedDbLogger.debug('Health check logging test');
            const logTime = Date.now() - testLogStart;
            return {
                operational: logTime < 1000,
                lastLogTime: new Date().toISOString(),
                logLevel: process.env.LOG_LEVEL || 'info',
                errors: 0
            };
        }
        catch (error) {
            return {
                operational: false,
                logLevel: 'unknown',
                errors: 1
            };
        }
    }
    /**
     * Проверка конфигурации
     */
    checkConfiguration() {
        const requiredEnvVars = [
            'NODE_ENV',
            'DATABASE_URL',
            'REDIS_HOST'
        ];
        const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
        return {
            valid: missingEnvVars.length === 0,
            missingEnvVars,
            environment: process.env.NODE_ENV || 'development'
        };
    }
    /**
     * Проверка процесса Node.js
     */
    checkNodeProcess() {
        return {
            pid: process.pid,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform
        };
    }
    /**
     * Извлечение числового значения из Redis INFO
     */
    extractInfoValue(lines, key) {
        const line = lines.find(l => l.startsWith(`${key}:`));
        return line ? parseInt(line.split(':')[1]) || 0 : 0;
    }
    /**
     * Извлечение строкового значения из Redis INFO
     */
    extractInfoStringValue(lines, key) {
        const line = lines.find(l => l.startsWith(`${key}:`));
        return line ? line.split(':')[1] || 'unknown' : 'unknown';
    }
    /**
     * Очистка ресурсов при завершении работы
     */
    async cleanup() {
        if (this.redisClient) {
            try {
                await this.redisClient.quit();
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('Error closing Redis connection', { error });
            }
            this.redisClient = null;
        }
    }
}
exports.BackendHealthChecker = BackendHealthChecker;
BackendHealthChecker.instance = null;
exports.default = BackendHealthChecker;
//# sourceMappingURL=BackendHealthChecker.js.map