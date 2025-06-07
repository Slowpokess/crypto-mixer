"use strict";
/**
 * Универсальный интерфейс для Health Check во всех сервисах crypto-mixer
 * Обеспечивает единообразную реализацию проверок состояния
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckUtils = exports.BaseHealthChecker = void 0;
/**
 * Абстрактный базовый класс для реализации Health Check в сервисах
 */
class BaseHealthChecker {
    constructor(serviceName, version, config) {
        this.serviceName = serviceName;
        this.version = version;
        this.startTime = new Date();
        this.config = this.buildDefaultConfig(config);
    }
    /**
     * Основной метод для получения полного статуса здоровья сервиса
     */
    async getHealthStatus() {
        const startTime = Date.now();
        try {
            const healthDetails = await this.performHealthChecks();
            const responseTime = Date.now() - startTime;
            return {
                status: this.determineOverallStatus(healthDetails),
                timestamp: new Date().toISOString(),
                service: this.serviceName,
                version: this.version,
                uptime: this.getUptime(),
                details: healthDetails,
                responseTime,
                environment: process.env.NODE_ENV || 'development'
            };
        }
        catch (error) {
            return {
                status: 'critical',
                timestamp: new Date().toISOString(),
                service: this.serviceName,
                version: this.version,
                uptime: this.getUptime(),
                details: {
                    custom: {
                        error: error instanceof Error ? error.message : String(error)
                    }
                },
                responseTime: Date.now() - startTime,
                environment: process.env.NODE_ENV || 'development'
            };
        }
    }
    /**
     * Выполнение всех настроенных проверок здоровья
     */
    async performHealthChecks() {
        const details = {};
        // Параллельное выполнение всех проверок
        const checks = [];
        if (this.config.enabledChecks.database) {
            checks.push(this.checkDatabase().then(result => ({ database: result })).catch(error => ({
                database: { connected: false, responseTime: 0, activeConnections: 0, maxConnections: 0, lastQuery: '', error: error.message }
            })));
        }
        if (this.config.enabledChecks.cache) {
            checks.push(this.checkCache().then(result => ({ cache: result })).catch(error => ({
                cache: { connected: false, responseTime: 0, memoryUsage: 0, hitRatio: 0, evictions: 0, error: error.message }
            })));
        }
        if (this.config.enabledChecks.blockchain) {
            checks.push(this.checkBlockchain().then(result => ({ blockchain: result })).catch(error => ({
                blockchain: { connectedNodes: 0, syncStatus: 'not_synced', lastBlockHeight: 0, pendingTransactions: 0, responseTime: 0, currencies: {}, error: error.message }
            })));
        }
        if (this.config.enabledChecks.messageQueue) {
            checks.push(this.checkMessageQueue().then(result => ({ messageQueue: result })).catch(error => ({
                messageQueue: { connected: false, queues: {}, channels: 0, error: error.message }
            })));
        }
        if (this.config.enabledChecks.vault) {
            checks.push(this.checkVault().then(result => ({ vault: result })).catch(error => ({
                vault: { sealed: true, standby: false, version: '', responseTime: 0, error: error.message }
            })));
        }
        if (this.config.enabledChecks.hsm) {
            checks.push(this.checkHSM().then(result => ({ hsm: result })).catch(error => ({
                hsm: { connected: false, sessions: 0, slots: {}, error: error.message }
            })));
        }
        if (this.config.enabledChecks.dependencies) {
            checks.push(this.checkDependencies().then(result => ({ dependencies: result })).catch(error => ({
                dependencies: [{ service: 'unknown', status: 'critical', responseTime: 0, lastChecked: new Date().toISOString(), error: error.message }]
            })));
        }
        // Ожидание всех проверок
        const results = await Promise.all(checks);
        // Объединение результатов
        for (const result of results) {
            Object.assign(details, result);
        }
        // Добавление кастомных проверок
        const customChecks = await this.performCustomChecks();
        if (Object.keys(customChecks).length > 0) {
            details.custom = customChecks;
        }
        return details;
    }
    /**
     * Определение общего статуса на основе результатов проверок
     */
    determineOverallStatus(details) {
        let hasWarning = false;
        let hasCritical = false;
        // Проверка базы данных (критично)
        if (details.database && !details.database.connected) {
            hasCritical = true;
        }
        // Проверка кэша (предупреждение)
        if (details.cache && !details.cache.connected) {
            hasWarning = true;
        }
        // Проверка блокчейна (зависит от сервиса)
        if (details.blockchain && details.blockchain.connectedNodes === 0) {
            hasWarning = true;
        }
        // Проверка очередей сообщений (критично)
        if (details.messageQueue && !details.messageQueue.connected) {
            hasCritical = true;
        }
        // Проверка Vault (критично если sealed)
        if (details.vault && details.vault.sealed) {
            hasCritical = true;
        }
        // Проверка HSM (предупреждение)
        if (details.hsm && !details.hsm.connected) {
            hasWarning = true;
        }
        // Проверка зависимостей
        if (details.dependencies) {
            for (const dep of details.dependencies) {
                if (dep.status === 'critical') {
                    hasCritical = true;
                }
                else if (dep.status === 'warning') {
                    hasWarning = true;
                }
            }
        }
        if (hasCritical)
            return 'critical';
        if (hasWarning)
            return 'warning';
        return 'healthy';
    }
    /**
     * Получение времени работы сервиса в секундах
     */
    getUptime() {
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
    /**
     * Построение конфигурации по умолчанию
     */
    buildDefaultConfig(partialConfig) {
        const defaultConfig = {
            enabledChecks: {
                database: true,
                cache: true,
                blockchain: false,
                messageQueue: true,
                vault: false,
                hsm: false,
                dependencies: true
            },
            timeouts: {
                database: 5000,
                cache: 2000,
                blockchain: 10000,
                messageQueue: 5000,
                vault: 5000,
                hsm: 10000,
                dependencies: 5000
            },
            intervals: {
                healthCheck: 30000,
                metricsCollection: 10000
            },
            thresholds: {
                responseTime: {
                    warning: 1000,
                    critical: 5000
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
                    warning: 80,
                    critical: 90
                }
            }
        };
        return {
            ...defaultConfig,
            ...partialConfig,
            enabledChecks: { ...defaultConfig.enabledChecks, ...partialConfig?.enabledChecks },
            timeouts: { ...defaultConfig.timeouts, ...partialConfig?.timeouts },
            intervals: { ...defaultConfig.intervals, ...partialConfig?.intervals },
            thresholds: { ...defaultConfig.thresholds, ...partialConfig?.thresholds }
        };
    }
}
exports.BaseHealthChecker = BaseHealthChecker;
/**
 * Утилитарные функции для работы с health checks
 */
class HealthCheckUtils {
    /**
     * Создание стандартного HTTP endpoint для health check
     */
    static createHealthEndpoint(healthChecker) {
        return async (_req, res) => {
            try {
                const healthStatus = await healthChecker.getHealthStatus();
                const httpStatus = healthStatus.status === 'healthy' ? 200 :
                    healthStatus.status === 'warning' ? 200 :
                        healthStatus.status === 'critical' ? 503 : 500;
                res.status(httpStatus).json(healthStatus);
            }
            catch (error) {
                res.status(500).json({
                    status: 'critical',
                    timestamp: new Date().toISOString(),
                    service: 'unknown',
                    error: error.message || String(error)
                });
            }
        };
    }
    /**
     * Проверка HTTP сервиса с таймаутом
     */
    static async checkHttpService(url, timeout = 5000, expectedStatus = 200) {
        const startTime = Date.now();
        try {
            const response = await fetch(url, {
                method: 'GET',
                signal: AbortSignal.timeout(timeout)
            });
            const responseTime = Date.now() - startTime;
            return {
                status: response.status === expectedStatus,
                responseTime,
                httpStatus: response.status
            };
        }
        catch (error) {
            return {
                status: false,
                responseTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Проверка TCP порта
     */
    static async checkTcpPort(host, port, timeout = 5000) {
        const startTime = Date.now();
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                resolve({
                    status: false,
                    responseTime: Date.now() - startTime,
                    error: `Connection timeout after ${timeout}ms`
                });
            }, timeout);
            socket.connect(port, host, () => {
                clearTimeout(timer);
                socket.destroy();
                resolve({
                    status: true,
                    responseTime: Date.now() - startTime
                });
            });
            socket.on('error', (error) => {
                clearTimeout(timer);
                socket.destroy();
                resolve({
                    status: false,
                    responseTime: Date.now() - startTime,
                    error: error.message
                });
            });
        });
    }
    /**
     * Форматирование времени работы
     */
    static formatUptime(uptimeSeconds) {
        const days = Math.floor(uptimeSeconds / (24 * 3600));
        const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const parts = [];
        if (days > 0)
            parts.push(`${days}d`);
        if (hours > 0)
            parts.push(`${hours}h`);
        if (minutes > 0)
            parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        return parts.join(' ');
    }
    /**
     * Получение системных метрик
     */
    static async getSystemMetrics() {
        const os = require('os');
        const fs = require('fs').promises;
        // CPU usage (simplified)
        const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
        // Memory usage
        const totalMemory = os.totalmem();
        const usedMemory = totalMemory - os.freemem();
        const memoryPercentage = (usedMemory / totalMemory) * 100;
        // Disk usage (simplified - для корневого раздела)
        let diskUsage = { used: 0, total: 0, percentage: 0 };
        try {
            const stats = await fs.stat('/');
            diskUsage = {
                used: stats.size || 0,
                total: stats.size || 0,
                percentage: 0
            };
        }
        catch (error) {
            // Игнорируем ошибки получения статистики диска
        }
        return {
            cpu: Math.min(100, Math.max(0, cpuUsage)),
            memory: {
                used: usedMemory,
                total: totalMemory,
                percentage: memoryPercentage
            },
            disk: diskUsage,
            network: {
                bytesIn: 0, // Будет реализовано при необходимости
                bytesOut: 0
            }
        };
    }
}
exports.HealthCheckUtils = HealthCheckUtils;
//# sourceMappingURL=HealthCheckInterface.js.map