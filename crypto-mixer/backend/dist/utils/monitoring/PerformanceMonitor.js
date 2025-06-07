"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
const events_1 = require("events");
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const logger_1 = require("../logger");
const DatabaseManager_1 = require("../../database/DatabaseManager");
/**
 * Система мониторинга производительности для crypto-mixer
 * Собирает системные, приложенческие и бизнес-метрики
 */
class PerformanceMonitor extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.isRunning = false;
        this.collectInterval = null;
        this.metricsHistory = [];
        this.lastSnapshot = null;
        // Счетчики для метрик приложения
        this.requestCounter = 0;
        this.responseTimes = [];
        this.errorCounter = 0;
        this.lastRequestTime = Date.now();
        // Кэш для системных метрик
        this.lastCpuUsage = null;
        this.lastNetworkStats = null;
        this.config = {
            enabled: process.env.PERFORMANCE_MONITORING === 'true',
            collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL || '30'),
            retentionPeriod: parseInt(process.env.METRICS_RETENTION_PERIOD || '3600'),
            prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true',
            prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9090'),
            alerting: {
                enabled: process.env.PERFORMANCE_ALERTING === 'true',
                thresholds: {
                    cpu: parseFloat(process.env.CPU_ALERT_THRESHOLD || '80'),
                    memory: parseFloat(process.env.MEMORY_ALERT_THRESHOLD || '85'),
                    disk: parseFloat(process.env.DISK_ALERT_THRESHOLD || '90'),
                    responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000'),
                    errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5')
                }
            },
            sampling: {
                enabled: process.env.PERFORMANCE_SAMPLING === 'true',
                rate: parseFloat(process.env.SAMPLING_RATE || '10')
            },
            ...config
        };
    }
    /**
     * Запуск системы мониторинга производительности
     */
    async start() {
        if (this.isRunning) {
            logger_1.enhancedDbLogger.warn('⚠️ Performance Monitor уже запущен');
            return;
        }
        if (!this.config.enabled) {
            logger_1.enhancedDbLogger.info('📊 Performance Monitor отключен в конфигурации');
            return;
        }
        const operationId = await logger_1.enhancedDbLogger.startOperation('performance_monitor_start');
        try {
            logger_1.enhancedDbLogger.info('📊 Запуск Performance Monitor', {
                collectInterval: this.config.collectInterval,
                retentionPeriod: this.config.retentionPeriod,
                prometheusEnabled: this.config.prometheusEnabled,
                alertingEnabled: this.config.alerting.enabled
            });
            this.isRunning = true;
            // Выполнение первичного сбора метрик
            await this.collectMetrics();
            // Запуск периодического сбора
            this.collectInterval = setInterval(async () => {
                try {
                    await this.collectMetrics();
                }
                catch (error) {
                    logger_1.enhancedDbLogger.error('❌ Ошибка сбора метрик', { error });
                }
            }, this.config.collectInterval * 1000);
            // Запуск Prometheus endpoint если включен
            if (this.config.prometheusEnabled) {
                await this.startPrometheusEndpoint();
            }
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Performance Monitor запущен успешно');
        }
        catch (error) {
            this.isRunning = false;
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
    }
    /**
     * Остановка системы мониторинга
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        logger_1.enhancedDbLogger.info('🛑 Остановка Performance Monitor');
        this.isRunning = false;
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.collectInterval = null;
        }
        logger_1.enhancedDbLogger.info('✅ Performance Monitor остановлен');
    }
    /**
     * Сбор всех метрик производительности
     */
    async collectMetrics() {
        const startTime = Date.now();
        try {
            logger_1.enhancedDbLogger.debug('🔍 Сбор метрик производительности');
            const [systemMetrics, applicationMetrics, businessMetrics] = await Promise.all([
                this.collectSystemMetrics(),
                this.collectApplicationMetrics(),
                this.collectBusinessMetrics()
            ]);
            const snapshot = {
                timestamp: new Date(),
                system: systemMetrics,
                application: applicationMetrics,
                business: businessMetrics,
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0'
            };
            // Сохранение снимка
            this.lastSnapshot = snapshot;
            this.metricsHistory.push(snapshot);
            // Очистка старых метрик
            this.cleanupOldMetrics();
            // Проверка пороговых значений и отправка алертов
            if (this.config.alerting.enabled) {
                this.checkThresholds(snapshot);
            }
            // Отправка события о новых метриках
            this.emit('metrics_collected', snapshot);
            const duration = Date.now() - startTime;
            logger_1.enhancedDbLogger.debug('✅ Метрики собраны', {
                duration: `${duration}ms`,
                historySize: this.metricsHistory.length
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка сбора метрик', { error });
            this.emit('metrics_error', error);
        }
    }
    /**
     * Сбор системных метрик
     */
    async collectSystemMetrics() {
        // CPU метрики
        const cpuUsage = process.cpuUsage(this.lastCpuUsage || undefined);
        this.lastCpuUsage = process.cpuUsage();
        const cpuPercent = this.calculateCpuPercent(cpuUsage);
        const cpus = os_1.default.cpus();
        const loadAverage = os_1.default.loadavg();
        // Память
        const totalMem = os_1.default.totalmem();
        const freeMem = os_1.default.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = (usedMem / totalMem) * 100;
        // Swap (для Linux/macOS)
        let swap = { total: 0, used: 0, free: 0 };
        try {
            if (process.platform === 'linux') {
                swap = await this.getSwapInfo();
            }
        }
        catch (error) {
            // Игнорируем ошибки получения swap
        }
        // Диск
        const diskInfo = await this.getDiskInfo();
        // Сеть
        const networkInfo = await this.getNetworkInfo();
        return {
            cpu: {
                usage: cpuPercent,
                loadAverage,
                cores: cpus.length,
                speed: cpus[0]?.speed || 0
            },
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                available: freeMem,
                usage: memUsage,
                swap
            },
            disk: diskInfo,
            network: networkInfo
        };
    }
    /**
     * Сбор метрик приложения
     */
    async collectApplicationMetrics() {
        const now = Date.now();
        const timePeriod = (now - this.lastRequestTime) / 1000; // секунды
        this.lastRequestTime = now;
        // Метрики запросов
        const requestsPerSecond = timePeriod > 0 ? this.requestCounter / timePeriod : 0;
        const errorRate = this.requestCounter > 0 ? (this.errorCounter / this.requestCounter) * 100 : 0;
        const avgResponseTime = this.responseTimes.length > 0
            ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
            : 0;
        // Перцентили времени ответа
        const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
        const percentiles = {
            p50: this.getPercentile(sortedTimes, 50),
            p95: this.getPercentile(sortedTimes, 95),
            p99: this.getPercentile(sortedTimes, 99)
        };
        // Метрики базы данных
        const dbMetrics = await this.getDatabaseMetrics();
        // Метрики Redis
        const redisMetrics = await this.getRedisMetrics();
        // Метрики RabbitMQ
        const rabbitmqMetrics = await this.getRabbitMQMetrics();
        // Сброс счетчиков
        this.requestCounter = 0;
        this.errorCounter = 0;
        this.responseTimes = [];
        return {
            requests: {
                total: this.requestCounter,
                perSecond: requestsPerSecond,
                errorRate,
                averageResponseTime: avgResponseTime,
                percentiles
            },
            database: dbMetrics,
            cache: {
                redis: redisMetrics
            },
            queues: {
                rabbitmq: rabbitmqMetrics
            }
        };
    }
    /**
     * Сбор бизнес-метрик
     */
    async collectBusinessMetrics() {
        try {
            // Получаем метрики микширования
            const mixingMetrics = await this.getMixingMetrics();
            // Получаем метрики кошельков
            const walletMetrics = await this.getWalletMetrics();
            // Получаем метрики блокчейнов
            const blockchainMetrics = await this.getBlockchainMetrics();
            // Получаем метрики безопасности
            const securityMetrics = await this.getSecurityMetrics();
            return {
                mixing: mixingMetrics,
                wallets: walletMetrics,
                blockchain: blockchainMetrics,
                security: securityMetrics
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка сбора бизнес-метрик', { error });
            // Возвращаем дефолтные метрики в случае ошибки
            return {
                mixing: {
                    operationsInProgress: 0,
                    operationsCompleted: 0,
                    operationsFailed: 0,
                    averageProcessingTime: 0,
                    totalVolume: { btc: 0, eth: 0, usdt: 0, sol: 0 },
                    successRate: 0
                },
                wallets: {
                    totalWallets: 0,
                    activeWallets: 0,
                    totalBalance: { btc: 0, eth: 0, usdt: 0, sol: 0 }
                },
                blockchain: {
                    bitcoin: { connected: false, blockHeight: 0, syncStatus: 0, transactionPool: 0 },
                    ethereum: { connected: false, blockNumber: 0, gasPrice: 0, pendingTransactions: 0 },
                    solana: { connected: false, slot: 0, epoch: 0, transactionCount: 0 }
                },
                security: {
                    alertsActive: 0,
                    blockedTransactions: 0,
                    riskScore: 0,
                    amlChecks: 0
                }
            };
        }
    }
    /**
     * Вычисление процента использования CPU
     */
    calculateCpuPercent(cpuUsage) {
        const total = cpuUsage.user + cpuUsage.system;
        const totalMs = total / 1000; // микросекунды в миллисекунды
        const interval = this.config.collectInterval * 1000; // секунды в миллисекунды
        return Math.min(100, (totalMs / interval) * 100);
    }
    /**
     * Получение информации о swap
     */
    async getSwapInfo() {
        try {
            const swapInfo = (0, child_process_1.execSync)('free -b | grep Swap').toString().trim();
            const [, total, used, free] = swapInfo.split(/\s+/).map(Number);
            return { total, used, free };
        }
        catch (error) {
            return { total: 0, used: 0, free: 0 };
        }
    }
    /**
     * Получение информации о диске
     */
    async getDiskInfo() {
        try {
            let diskStats = {};
            if (process.platform === 'linux') {
                const dfOutput = (0, child_process_1.execSync)('df -B1 /').toString().trim().split('\n')[1];
                const [, total, used, free] = dfOutput.split(/\s+/).map(Number);
                diskStats = {
                    total,
                    used,
                    free,
                    usage: (used / total) * 100
                };
            }
            else {
                // Для других платформ используем приблизительные значения
                const stats = await (0, util_1.promisify)(fs_1.default.stat)('/');
                diskStats = {
                    total: 1000000000000, // 1TB по умолчанию
                    used: 500000000000, // 500GB по умолчанию
                    free: 500000000000, // 500GB по умолчанию
                    usage: 50
                };
            }
            // IOPS пока что заглушка
            const iops = { read: 0, write: 0 };
            return { ...diskStats, iops };
        }
        catch (error) {
            return {
                usage: 0,
                total: 0,
                used: 0,
                free: 0,
                iops: { read: 0, write: 0 }
            };
        }
    }
    /**
     * Получение информации о сети
     */
    async getNetworkInfo() {
        try {
            const networkInterfaces = os_1.default.networkInterfaces();
            let bytesReceived = 0;
            let bytesSent = 0;
            // Суммируем статистику по всем интерфейсам
            for (const [name, interfaces] of Object.entries(networkInterfaces)) {
                if (interfaces) {
                    for (const iface of interfaces) {
                        // Это упрощенная реализация, так как Node.js не предоставляет
                        // детальную статистику сети из коробки
                        if (!iface.internal) {
                            bytesReceived += 1000; // Заглушка
                            bytesSent += 1000; // Заглушка
                        }
                    }
                }
            }
            return {
                bytesReceived,
                bytesSent,
                packetsReceived: 0, // Заглушка
                packetsSent: 0, // Заглушка
                errors: 0 // Заглушка
            };
        }
        catch (error) {
            return {
                bytesReceived: 0,
                bytesSent: 0,
                packetsReceived: 0,
                packetsSent: 0,
                errors: 0
            };
        }
    }
    /**
     * Получение метрик базы данных
     */
    async getDatabaseMetrics() {
        try {
            const dbManager = DatabaseManager_1.DatabaseManager.getInstance();
            const connectionInfo = dbManager.getConnectionInfo();
            return {
                connections: {
                    active: connectionInfo.activeConnections || 0,
                    idle: connectionInfo.idleConnections || 0,
                    total: connectionInfo.totalConnections || 0
                },
                queries: {
                    total: 0, // TODO: реализовать счетчик запросов
                    perSecond: 0, // TODO: реализовать счетчик запросов в секунду
                    averageTime: 0, // TODO: реализовать среднее время запроса
                    slowQueries: 0 // TODO: реализовать счетчик медленных запросов
                },
                transactions: {
                    total: 0, // TODO: реализовать счетчик транзакций
                    perSecond: 0, // TODO: реализовать счетчик транзакций в секунду
                    rollbacks: 0 // TODO: реализовать счетчик откатов
                }
            };
        }
        catch (error) {
            return {
                connections: { active: 0, idle: 0, total: 0 },
                queries: { total: 0, perSecond: 0, averageTime: 0, slowQueries: 0 },
                transactions: { total: 0, perSecond: 0, rollbacks: 0 }
            };
        }
    }
    /**
     * Получение метрик Redis
     */
    async getRedisMetrics() {
        // TODO: Реализовать подключение к Redis и получение статистики
        return {
            hitRate: 0,
            missRate: 0,
            evictions: 0,
            memoryUsage: 0,
            connections: 0
        };
    }
    /**
     * Получение метрик RabbitMQ
     */
    async getRabbitMQMetrics() {
        // TODO: Реализовать подключение к RabbitMQ и получение статистики
        return {
            messages: 0,
            consumers: 0,
            publishRate: 0,
            consumeRate: 0
        };
    }
    /**
     * Получение метрик микширования
     */
    async getMixingMetrics() {
        try {
            const dbManager = DatabaseManager_1.DatabaseManager.getInstance();
            // Запросы к базе данных для получения статистики микширования
            const [inProgress, completed, failed] = await Promise.all([
                dbManager.query('SELECT COUNT(*) as count FROM mix_requests WHERE status = ?', ['in_progress']),
                dbManager.query('SELECT COUNT(*) as count FROM mix_requests WHERE status = ?', ['completed']),
                dbManager.query('SELECT COUNT(*) as count FROM mix_requests WHERE status = ?', ['failed'])
            ]);
            const operationsInProgress = inProgress[0]?.count || 0;
            const operationsCompleted = completed[0]?.count || 0;
            const operationsFailed = failed[0]?.count || 0;
            const totalOperations = operationsCompleted + operationsFailed;
            const successRate = totalOperations > 0 ? (operationsCompleted / totalOperations) * 100 : 0;
            return {
                operationsInProgress,
                operationsCompleted,
                operationsFailed,
                averageProcessingTime: 0, // TODO: вычислить среднее время обработки
                totalVolume: { btc: 0, eth: 0, usdt: 0, sol: 0 }, // TODO: вычислить объемы
                successRate
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения метрик микширования', { error });
            return {
                operationsInProgress: 0,
                operationsCompleted: 0,
                operationsFailed: 0,
                averageProcessingTime: 0,
                totalVolume: { btc: 0, eth: 0, usdt: 0, sol: 0 },
                successRate: 0
            };
        }
    }
    /**
     * Получение метрик кошельков
     */
    async getWalletMetrics() {
        try {
            const dbManager = DatabaseManager_1.DatabaseManager.getInstance();
            const [totalWallets, activeWallets] = await Promise.all([
                dbManager.query('SELECT COUNT(*) as count FROM wallets'),
                dbManager.query('SELECT COUNT(*) as count FROM wallets WHERE status = ?', ['active'])
            ]);
            return {
                totalWallets: totalWallets[0]?.count || 0,
                activeWallets: activeWallets[0]?.count || 0,
                totalBalance: { btc: 0, eth: 0, usdt: 0, sol: 0 } // TODO: вычислить балансы
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения метрик кошельков', { error });
            return {
                totalWallets: 0,
                activeWallets: 0,
                totalBalance: { btc: 0, eth: 0, usdt: 0, sol: 0 }
            };
        }
    }
    /**
     * Получение метрик блокчейнов
     */
    async getBlockchainMetrics() {
        // TODO: Интегрироваться с блокчейн клиентами для получения реальных метрик
        return {
            bitcoin: { connected: false, blockHeight: 0, syncStatus: 0, transactionPool: 0 },
            ethereum: { connected: false, blockNumber: 0, gasPrice: 0, pendingTransactions: 0 },
            solana: { connected: false, slot: 0, epoch: 0, transactionCount: 0 }
        };
    }
    /**
     * Получение метрик безопасности
     */
    async getSecurityMetrics() {
        try {
            const dbManager = DatabaseManager_1.DatabaseManager.getInstance();
            const blockedTransactions = await dbManager.query('SELECT COUNT(*) as count FROM audit_logs WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR', ['transaction_blocked']);
            return {
                alertsActive: 0, // TODO: получить количество активных алертов
                blockedTransactions: blockedTransactions[0]?.count || 0,
                riskScore: 0, // TODO: вычислить общий риск-скор
                amlChecks: 0 // TODO: получить количество AML проверок
            };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения метрик безопасности', { error });
            return {
                alertsActive: 0,
                blockedTransactions: 0,
                riskScore: 0,
                amlChecks: 0
            };
        }
    }
    /**
     * Вычисление перцентиля
     */
    getPercentile(sortedArray, percentile) {
        if (sortedArray.length === 0)
            return 0;
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }
    /**
     * Очистка старых метрик
     */
    cleanupOldMetrics() {
        const cutoffTime = Date.now() - (this.config.retentionPeriod * 1000);
        this.metricsHistory = this.metricsHistory.filter(snapshot => snapshot.timestamp.getTime() > cutoffTime);
    }
    /**
     * Проверка пороговых значений и отправка алертов
     */
    checkThresholds(snapshot) {
        const { thresholds } = this.config.alerting;
        // Проверка CPU
        if (snapshot.system.cpu.usage > thresholds.cpu) {
            this.emit('threshold_exceeded', {
                type: 'cpu',
                value: snapshot.system.cpu.usage,
                threshold: thresholds.cpu,
                timestamp: snapshot.timestamp
            });
        }
        // Проверка памяти
        if (snapshot.system.memory.usage > thresholds.memory) {
            this.emit('threshold_exceeded', {
                type: 'memory',
                value: snapshot.system.memory.usage,
                threshold: thresholds.memory,
                timestamp: snapshot.timestamp
            });
        }
        // Проверка диска
        if (snapshot.system.disk.usage > thresholds.disk) {
            this.emit('threshold_exceeded', {
                type: 'disk',
                value: snapshot.system.disk.usage,
                threshold: thresholds.disk,
                timestamp: snapshot.timestamp
            });
        }
        // Проверка времени ответа
        if (snapshot.application.requests.averageResponseTime > thresholds.responseTime) {
            this.emit('threshold_exceeded', {
                type: 'response_time',
                value: snapshot.application.requests.averageResponseTime,
                threshold: thresholds.responseTime,
                timestamp: snapshot.timestamp
            });
        }
        // Проверка частоты ошибок
        if (snapshot.application.requests.errorRate > thresholds.errorRate) {
            this.emit('threshold_exceeded', {
                type: 'error_rate',
                value: snapshot.application.requests.errorRate,
                threshold: thresholds.errorRate,
                timestamp: snapshot.timestamp
            });
        }
    }
    /**
     * Запуск Prometheus endpoint
     */
    async startPrometheusEndpoint() {
        // TODO: Реализовать Prometheus metrics endpoint
        logger_1.enhancedDbLogger.info('📊 Prometheus endpoint будет реализован в следующей итерации');
    }
    /**
     * Запись запроса для метрик
     */
    recordRequest(responseTime, isError = false) {
        if (!this.config.enabled)
            return;
        // Сэмплирование запросов
        if (this.config.sampling.enabled) {
            if (Math.random() * 100 > this.config.sampling.rate) {
                return;
            }
        }
        this.requestCounter++;
        this.responseTimes.push(responseTime);
        if (isError) {
            this.errorCounter++;
        }
    }
    /**
     * Получение последнего снимка метрик
     */
    getLastSnapshot() {
        return this.lastSnapshot;
    }
    /**
     * Получение истории метрик
     */
    getMetricsHistory(limit = 100) {
        return this.metricsHistory.slice(-limit);
    }
    /**
     * Получение метрик за определенный период
     */
    getMetricsByTimeRange(startTime, endTime) {
        return this.metricsHistory.filter(snapshot => snapshot.timestamp >= startTime && snapshot.timestamp <= endTime);
    }
    /**
     * Получение агрегированных метрик
     */
    getAggregatedMetrics(period) {
        // TODO: Реализовать агрегацию метрик по периодам
        return {
            averageCpuUsage: 0,
            averageMemoryUsage: 0,
            averageResponseTime: 0,
            totalRequests: 0,
            errorRate: 0
        };
    }
    /**
     * Экспорт метрик в различных форматах
     */
    exportMetrics(format) {
        switch (format) {
            case 'json':
                return JSON.stringify(this.metricsHistory, null, 2);
            case 'csv':
                // TODO: Реализовать CSV экспорт
                return 'timestamp,cpu_usage,memory_usage,disk_usage\n';
            case 'prometheus':
                // TODO: Реализовать Prometheus формат
                return '# HELP cpu_usage CPU usage percentage\n';
            default:
                throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
        }
    }
    /**
     * Получение статуса работы монитора
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
    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger_1.enhancedDbLogger.info('📊 Конфигурация Performance Monitor обновлена', newConfig);
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
exports.default = PerformanceMonitor;
//# sourceMappingURL=PerformanceMonitor.js.map