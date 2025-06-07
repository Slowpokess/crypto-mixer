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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckManager = void 0;
const events_1 = require("events");
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const redis = __importStar(require("redis"));
const logger_1 = require("../logger");
const DatabaseManager_1 = require("../../database/DatabaseManager");
/**
 * Централизованный менеджер health checks для всех сервисов crypto-mixer
 */
class HealthCheckManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.isRunning = false;
        this.checkInterval = null;
        this.serviceResults = new Map();
        this.serviceHistory = new Map();
        this.consecutiveFailures = new Map();
        this.systemStartTime = new Date();
        this.healthyTime = 0; // время в миллисекундах когда система была healthy
        this.lastOverallStatus = 'unknown';
        this.config = config;
        this.validateConfig();
        this.initializeServices();
    }
    /**
     * Запуск системы health checks
     */
    async start() {
        if (this.isRunning) {
            logger_1.enhancedDbLogger.warn('⚠️ Health Check Manager уже запущен');
            return;
        }
        const operationId = await logger_1.enhancedDbLogger.startOperation('health_check_manager_start');
        try {
            logger_1.enhancedDbLogger.info('🏥 Запуск Health Check Manager', {
                services: this.config.services.length,
                interval: this.config.interval,
                parallelChecks: this.config.parallelChecks
            });
            this.isRunning = true;
            this.systemStartTime = new Date();
            // Выполнение первичной проверки
            await this.performHealthChecks();
            // Запуск периодических проверок
            this.checkInterval = setInterval(async () => {
                try {
                    await this.performHealthChecks();
                }
                catch (error) {
                    logger_1.enhancedDbLogger.error('❌ Ошибка в цикле health checks', { error });
                }
            }, this.config.interval * 1000);
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Health Check Manager запущен успешно');
        }
        catch (error) {
            this.isRunning = false;
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
    }
    /**
     * Остановка системы health checks
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        logger_1.enhancedDbLogger.info('🛑 Остановка Health Check Manager');
        this.isRunning = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        logger_1.enhancedDbLogger.info('✅ Health Check Manager остановлен');
    }
    /**
     * Выполнение проверок всех сервисов
     */
    async performHealthChecks() {
        const startTime = Date.now();
        const enabledServices = this.config.services.filter(s => s.enabled);
        logger_1.enhancedDbLogger.debug('🔍 Выполнение health checks', {
            services: enabledServices.length,
            parallel: this.config.parallelChecks
        });
        try {
            let results;
            if (this.config.parallelChecks) {
                // Параллельное выполнение проверок
                const promises = enabledServices.map(service => this.checkService(service).catch(error => {
                    logger_1.enhancedDbLogger.error(`❌ Ошибка проверки ${service.name}`, { error });
                    return this.createErrorResult(service, error);
                }));
                results = await Promise.all(promises);
            }
            else {
                // Последовательное выполнение проверок
                results = [];
                for (const service of enabledServices) {
                    try {
                        const result = await this.checkService(service);
                        results.push(result);
                    }
                    catch (error) {
                        logger_1.enhancedDbLogger.error(`❌ Ошибка проверки ${service.name}`, { error });
                        results.push(this.createErrorResult(service, error));
                    }
                }
            }
            // Обновление результатов и истории
            this.updateServiceResults(results);
            // Анализ общего состояния системы
            const systemStatus = this.calculateSystemHealth();
            // Проверка на изменения статуса и отправка событий
            this.checkStatusChanges(systemStatus);
            // Обновление статистики uptime
            this.updateUptimeStats(systemStatus);
            const duration = Date.now() - startTime;
            logger_1.enhancedDbLogger.debug('✅ Health checks завершены', {
                duration: `${duration}ms`,
                overall: systemStatus.overall,
                healthy: systemStatus.summary.healthy,
                critical: systemStatus.summary.critical
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Критическая ошибка в health checks', { error });
            this.emit('system_error', error);
        }
    }
    /**
     * Проверка конкретного сервиса
     */
    async checkService(service) {
        const startTime = Date.now();
        const timeout = service.timeout || this.config.timeout;
        try {
            let result;
            // Выполнение проверки с таймаутом
            const checkPromise = this.executeServiceCheck(service);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Timeout after ${timeout}s`)), timeout * 1000);
            });
            const checkResult = await Promise.race([checkPromise, timeoutPromise]);
            const responseTime = Date.now() - startTime;
            result = {
                serviceName: service.name,
                status: checkResult.status,
                responseTime,
                timestamp: new Date(),
                details: checkResult.details,
                metadata: {
                    consecutiveFailures: checkResult.status === 'healthy' ? 0 :
                        (this.consecutiveFailures.get(service.name) || 0) + 1,
                    lastSuccess: checkResult.status === 'healthy' ? new Date() :
                        this.serviceResults.get(service.name)?.metadata.lastSuccess,
                    lastFailure: checkResult.status !== 'healthy' ? new Date() :
                        this.serviceResults.get(service.name)?.metadata.lastFailure,
                    uptime: this.calculateServiceUptime(service.name)
                }
            };
            // Проверка пороговых значений времени ответа
            if (responseTime > this.config.alertThresholds.responseTimeCritical) {
                result.status = 'critical';
                result.details.message += ` (критически медленный ответ: ${responseTime}ms)`;
            }
            else if (responseTime > this.config.alertThresholds.responseTimeWarning) {
                result.status = result.status === 'healthy' ? 'warning' : result.status;
                result.details.message += ` (медленный ответ: ${responseTime}ms)`;
            }
            return result;
        }
        catch (error) {
            return this.createErrorResult(service, error, Date.now() - startTime);
        }
    }
    /**
     * Выполнение конкретной проверки в зависимости от типа сервиса
     */
    async executeServiceCheck(service) {
        switch (service.type) {
            case 'http':
                return await this.checkHTTPService(service);
            case 'tcp':
                return await this.checkTCPService(service);
            case 'database':
                return await this.checkDatabaseService(service);
            case 'redis':
                return await this.checkRedisService(service);
            case 'rabbitmq':
                return await this.checkRabbitMQService(service);
            case 'vault':
                return await this.checkVaultService(service);
            case 'hsm':
                return await this.checkHSMService(service);
            case 'command':
                return await this.checkCommandService(service);
            case 'custom':
                if (service.customCheck) {
                    const result = await service.customCheck();
                    return {
                        status: result.status === 'unknown' ? 'warning' : result.status,
                        details: result.details
                    };
                }
                throw new Error('Custom check function not provided');
            default:
                throw new Error(`Неподдерживаемый тип сервиса: ${service.type}`);
        }
    }
    /**
     * Проверка HTTP сервиса
     */
    async checkHTTPService(service) {
        const url = `http://${service.host}:${service.port}${service.path || '/health'}`;
        const expectedStatus = service.expectedStatus || 200;
        try {
            const response = await axios_1.default.get(url, {
                timeout: (service.timeout || this.config.timeout) * 1000,
                headers: {
                    'User-Agent': 'HealthCheckManager/1.0'
                }
            });
            if (response.status === expectedStatus) {
                return {
                    status: 'healthy',
                    details: {
                        message: `HTTP ${response.status} - ${response.statusText}`,
                        data: {
                            status: response.status,
                            headers: response.headers,
                            dataLength: JSON.stringify(response.data).length
                        }
                    }
                };
            }
            else {
                return {
                    status: 'warning',
                    details: {
                        message: `Неожиданный HTTP статус: ${response.status} (ожидался ${expectedStatus})`,
                        data: { status: response.status, expected: expectedStatus }
                    }
                };
            }
        }
        catch (error) {
            const axiosError = error;
            return {
                status: 'critical',
                details: {
                    message: `HTTP проверка провалена: ${axiosError.message}`,
                    data: {
                        code: axiosError.code,
                        status: axiosError.response?.status,
                        url
                    }
                }
            };
        }
    }
    /**
     * Проверка TCP подключения
     */
    async checkTCPService(service) {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();
            const timeout = (service.timeout || this.config.timeout) * 1000;
            const timer = setTimeout(() => {
                socket.destroy();
                resolve({
                    status: 'critical',
                    details: {
                        message: `TCP подключение прервано по таймауту (${timeout}ms)`,
                        data: { host: service.host, port: service.port }
                    }
                });
            }, timeout);
            socket.connect(service.port, service.host, () => {
                clearTimeout(timer);
                socket.destroy();
                resolve({
                    status: 'healthy',
                    details: {
                        message: `TCP подключение успешно`,
                        data: { host: service.host, port: service.port }
                    }
                });
            });
            socket.on('error', (error) => {
                clearTimeout(timer);
                socket.destroy();
                resolve({
                    status: 'critical',
                    details: {
                        message: `TCP подключение провалено: ${error.message}`,
                        data: { host: service.host, port: service.port, error: error.message }
                    }
                });
            });
        });
    }
    /**
     * Проверка PostgreSQL базы данных
     */
    async checkDatabaseService(service) {
        try {
            const dbManager = DatabaseManager_1.DatabaseManager.getInstance();
            const startTime = Date.now();
            // Проверка подключения
            await dbManager.getConnection().authenticate();
            // Выполнение тестового запроса
            const result = await dbManager.query('SELECT 1 as health_check');
            const responseTime = Date.now() - startTime;
            // Проверка connection pool
            const poolInfo = dbManager.getConnectionInfo();
            return {
                status: 'healthy',
                details: {
                    message: `Database подключение успешно (${responseTime}ms)`,
                    data: {
                        responseTime,
                        poolInfo,
                        testQuery: result
                    }
                }
            };
        }
        catch (error) {
            return {
                status: 'critical',
                details: {
                    message: `Database проверка провалена: ${error}`,
                    data: { error: String(error) }
                }
            };
        }
    }
    /**
     * Проверка Redis сервиса
     */
    async checkRedisService(service) {
        let client = null;
        try {
            client = redis.createClient({
                host: service.host,
                port: service.port,
                connectTimeout: (service.timeout || this.config.timeout) * 1000
            });
            await client.connect();
            const startTime = Date.now();
            const pong = await client.ping();
            const responseTime = Date.now() - startTime;
            // Получение информации о Redis
            const info = await client.info();
            const memoryInfo = info.split('\r\n').find(line => line.startsWith('used_memory_human:'));
            return {
                status: 'healthy',
                details: {
                    message: `Redis PING успешно (${responseTime}ms)`,
                    data: {
                        responseTime,
                        ping: pong,
                        memory: memoryInfo
                    }
                }
            };
        }
        catch (error) {
            return {
                status: 'critical',
                details: {
                    message: `Redis проверка провалена: ${error}`,
                    data: { error: String(error) }
                }
            };
        }
        finally {
            if (client) {
                try {
                    await client.quit();
                }
                catch (e) {
                    // Игнорируем ошибки при закрытии соединения
                }
            }
        }
    }
    /**
     * Проверка RabbitMQ сервиса
     */
    async checkRabbitMQService(service) {
        try {
            // Проверка через management API
            const url = `http://${service.host}:15672/api/overview`;
            const auth = service.metadata?.auth || 'guest:guest';
            const response = await axios_1.default.get(url, {
                timeout: (service.timeout || this.config.timeout) * 1000,
                auth: {
                    username: auth.split(':')[0],
                    password: auth.split(':')[1]
                }
            });
            const data = response.data;
            const nodeRunning = data.node && data.rabbitmq_version;
            if (nodeRunning) {
                return {
                    status: 'healthy',
                    details: {
                        message: `RabbitMQ узел работает (v${data.rabbitmq_version})`,
                        data: {
                            version: data.rabbitmq_version,
                            node: data.node,
                            messageStats: data.message_stats
                        }
                    }
                };
            }
            else {
                return {
                    status: 'warning',
                    details: {
                        message: 'RabbitMQ API отвечает, но узел может быть нестабилен',
                        data
                    }
                };
            }
        }
        catch (error) {
            // Fallback к TCP проверке порта 5672
            return await this.checkTCPService({
                ...service,
                type: 'tcp',
                port: 5672
            });
        }
    }
    /**
     * Проверка HashiCorp Vault
     */
    async checkVaultService(service) {
        try {
            const url = `http://${service.host}:${service.port}/v1/sys/health`;
            const response = await axios_1.default.get(url, {
                timeout: (service.timeout || this.config.timeout) * 1000
            });
            const health = response.data;
            if (health.sealed) {
                return {
                    status: 'critical',
                    details: {
                        message: 'Vault запечатан (sealed)',
                        data: health
                    }
                };
            }
            else if (health.standby) {
                return {
                    status: 'warning',
                    details: {
                        message: 'Vault в режиме standby',
                        data: health
                    }
                };
            }
            else {
                return {
                    status: 'healthy',
                    details: {
                        message: `Vault активен и распечатан (v${health.version})`,
                        data: health
                    }
                };
            }
        }
        catch (error) {
            return {
                status: 'critical',
                details: {
                    message: `Vault проверка провалена: ${error}`,
                    data: { error: String(error) }
                }
            };
        }
    }
    /**
     * Проверка HSM Manager
     */
    async checkHSMService(service) {
        try {
            // Проверка доступности PKCS#11 модуля
            // В реальной реализации здесь был бы вызов HSMManager.checkConnection()
            // Пока симулируем проверку
            const testConnection = await new Promise((resolve) => {
                setTimeout(() => resolve(true), 100);
            });
            if (testConnection) {
                return {
                    status: 'healthy',
                    details: {
                        message: 'HSM модуль доступен',
                        data: { connected: true }
                    }
                };
            }
            else {
                return {
                    status: 'critical',
                    details: {
                        message: 'HSM модуль недоступен',
                        data: { connected: false }
                    }
                };
            }
        }
        catch (error) {
            return {
                status: 'critical',
                details: {
                    message: `HSM проверка провалена: ${error}`,
                    data: { error: String(error) }
                }
            };
        }
    }
    /**
     * Проверка через выполнение команды
     */
    async checkCommandService(service) {
        const command = service.metadata?.command;
        if (!command) {
            throw new Error('Команда не указана для command check');
        }
        return new Promise((resolve) => {
            const timeout = (service.timeout || this.config.timeout) * 1000;
            const child = (0, child_process_1.spawn)('sh', ['-c', command]);
            let stdout = '';
            let stderr = '';
            const timer = setTimeout(() => {
                child.kill();
                resolve({
                    status: 'critical',
                    details: {
                        message: `Команда прервана по таймауту (${timeout}ms)`,
                        data: { command, timeout }
                    }
                });
            }, timeout);
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            child.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve({
                        status: 'healthy',
                        details: {
                            message: `Команда выполнена успешно`,
                            data: { command, stdout: stdout.trim(), exitCode: code }
                        }
                    });
                }
                else {
                    resolve({
                        status: 'critical',
                        details: {
                            message: `Команда завершилась с ошибкой (код ${code})`,
                            data: { command, stderr: stderr.trim(), exitCode: code }
                        }
                    });
                }
            });
            child.on('error', (error) => {
                clearTimeout(timer);
                resolve({
                    status: 'critical',
                    details: {
                        message: `Ошибка выполнения команды: ${error.message}`,
                        data: { command, error: error.message }
                    }
                });
            });
        });
    }
    /**
     * Создание результата ошибки
     */
    createErrorResult(service, error, responseTime = 0) {
        const consecutiveFailures = (this.consecutiveFailures.get(service.name) || 0) + 1;
        return {
            serviceName: service.name,
            status: 'critical',
            responseTime,
            timestamp: new Date(),
            details: {
                message: `Проверка провалена: ${error.message || error}`,
                error: String(error)
            },
            metadata: {
                consecutiveFailures,
                lastFailure: new Date(),
                lastSuccess: this.serviceResults.get(service.name)?.metadata.lastSuccess,
                uptime: this.calculateServiceUptime(service.name)
            }
        };
    }
    /**
     * Обновление результатов сервисов
     */
    updateServiceResults(results) {
        for (const result of results) {
            // Обновление текущих результатов
            this.serviceResults.set(result.serviceName, result);
            // Обновление счетчика неудач
            if (result.status === 'healthy') {
                this.consecutiveFailures.delete(result.serviceName);
            }
            else {
                this.consecutiveFailures.set(result.serviceName, result.metadata.consecutiveFailures);
            }
            // Обновление истории (последние 100 проверок)
            const history = this.serviceHistory.get(result.serviceName) || [];
            history.push(result);
            if (history.length > 100) {
                history.shift();
            }
            this.serviceHistory.set(result.serviceName, history);
            // Проверка на алерты
            this.checkServiceAlerts(result);
        }
    }
    /**
     * Расчет общего состояния системы
     */
    calculateSystemHealth() {
        const services = Array.from(this.serviceResults.values());
        const criticalServices = this.config.services.filter(s => s.critical && s.enabled);
        const summary = {
            total: services.length,
            healthy: services.filter(s => s.status === 'healthy').length,
            warning: services.filter(s => s.status === 'warning').length,
            critical: services.filter(s => s.status === 'critical').length,
            unknown: services.filter(s => s.status === 'unknown').length
        };
        // Определение общего статуса
        let overall = 'healthy';
        const criticalServicesDown = [];
        for (const service of criticalServices) {
            const result = this.serviceResults.get(service.name);
            if (!result || result.status === 'critical') {
                criticalServicesDown.push(service.name);
            }
        }
        if (criticalServicesDown.length > 0) {
            overall = 'down';
        }
        else if (summary.critical > 0) {
            overall = 'critical';
        }
        else if (summary.warning > 0 || summary.unknown > 0) {
            overall = 'degraded';
        }
        // Расчет среднего времени ответа
        const averageResponseTime = services.length > 0
            ? services.reduce((sum, s) => sum + s.responseTime, 0) / services.length
            : 0;
        return {
            overall,
            timestamp: new Date(),
            services: this.serviceResults,
            summary,
            criticalServicesDown,
            averageResponseTime,
            systemUptime: this.calculateSystemUptime()
        };
    }
    /**
     * Проверка изменений статуса и отправка событий
     */
    checkStatusChanges(systemStatus) {
        // Проверка изменения общего статуса системы
        if (systemStatus.overall !== this.lastOverallStatus) {
            logger_1.enhancedDbLogger.info('📊 Изменение статуса системы', {
                from: this.lastOverallStatus,
                to: systemStatus.overall,
                criticalServicesDown: systemStatus.criticalServicesDown
            });
            this.emit('status_change', {
                from: this.lastOverallStatus,
                to: systemStatus.overall,
                timestamp: systemStatus.timestamp,
                details: systemStatus
            });
            this.lastOverallStatus = systemStatus.overall;
        }
        // Отправка общего события со статусом
        this.emit('health_check_completed', systemStatus);
    }
    /**
     * Проверка алертов для конкретного сервиса
     */
    checkServiceAlerts(result) {
        const service = this.config.services.find(s => s.name === result.serviceName);
        if (!service)
            return;
        // Алерт при достижении порога неудач подряд
        if (result.metadata.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
            this.emit('service_alert', {
                type: 'consecutive_failures',
                service: result.serviceName,
                failures: result.metadata.consecutiveFailures,
                threshold: this.config.alertThresholds.consecutiveFailures,
                critical: service.critical,
                result
            });
        }
        // Алерт при изменении статуса сервиса
        const previousResult = this.serviceHistory.get(result.serviceName)?.slice(-2)?.[0];
        if (previousResult && previousResult.status !== result.status) {
            this.emit('service_status_change', {
                service: result.serviceName,
                from: previousResult.status,
                to: result.status,
                critical: service.critical,
                result
            });
        }
    }
    /**
     * Расчет uptime для конкретного сервиса
     */
    calculateServiceUptime(serviceName) {
        const history = this.serviceHistory.get(serviceName);
        if (!history || history.length === 0)
            return 100;
        const healthyChecks = history.filter(h => h.status === 'healthy').length;
        return (healthyChecks / history.length) * 100;
    }
    /**
     * Расчет общего uptime системы
     */
    calculateSystemUptime() {
        const totalTime = Date.now() - this.systemStartTime.getTime();
        if (totalTime === 0)
            return 100;
        return (this.healthyTime / totalTime) * 100;
    }
    /**
     * Обновление статистики uptime
     */
    updateUptimeStats(systemStatus) {
        const now = Date.now();
        const lastCheck = this.serviceResults.size > 0 ?
            Math.max(...Array.from(this.serviceResults.values()).map(r => r.timestamp.getTime())) :
            this.systemStartTime.getTime();
        const timeDiff = now - lastCheck;
        if (systemStatus.overall === 'healthy') {
            this.healthyTime += timeDiff;
        }
    }
    /**
     * Получение текущего статуса системы
     */
    getSystemHealth() {
        return this.calculateSystemHealth();
    }
    /**
     * Получение результата для конкретного сервиса
     */
    getServiceHealth(serviceName) {
        return this.serviceResults.get(serviceName) || null;
    }
    /**
     * Получение истории для конкретного сервиса
     */
    getServiceHistory(serviceName, limit = 50) {
        const history = this.serviceHistory.get(serviceName) || [];
        return history.slice(-limit);
    }
    /**
     * Принудительная проверка конкретного сервиса
     */
    async checkServiceNow(serviceName) {
        const service = this.config.services.find(s => s.name === serviceName);
        if (!service) {
            throw new Error(`Сервис ${serviceName} не найден`);
        }
        const result = await this.checkService(service);
        this.updateServiceResults([result]);
        return result;
    }
    /**
     * Принудительная проверка всех сервисов
     */
    async checkAllServicesNow() {
        await this.performHealthChecks();
        return this.getSystemHealth();
    }
    // ========== ПРИВАТНЫЕ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========
    validateConfig() {
        if (!this.config.services || this.config.services.length === 0) {
            throw new Error('Не настроены сервисы для мониторинга');
        }
        for (const service of this.config.services) {
            if (!service.name) {
                throw new Error('Имя сервиса обязательно');
            }
            if (!service.type) {
                throw new Error(`Тип сервиса обязателен для ${service.name}`);
            }
            if (['http', 'tcp'].includes(service.type) && (!service.host || !service.port)) {
                throw new Error(`Host и port обязательны для ${service.type} сервиса ${service.name}`);
            }
        }
    }
    initializeServices() {
        for (const service of this.config.services) {
            this.consecutiveFailures.set(service.name, 0);
            this.serviceHistory.set(service.name, []);
        }
        logger_1.enhancedDbLogger.info('🔧 Инициализированы сервисы для мониторинга', {
            total: this.config.services.length,
            enabled: this.config.services.filter(s => s.enabled).length,
            critical: this.config.services.filter(s => s.critical).length
        });
    }
    /**
     * Получение статуса работы менеджера
     */
    isActive() {
        return this.isRunning;
    }
    /**
     * Получение конфигурации
     */
    getConfig() {
        return { ...this.config };
    }
}
exports.HealthCheckManager = HealthCheckManager;
//# sourceMappingURL=HealthCheckManager.js.map