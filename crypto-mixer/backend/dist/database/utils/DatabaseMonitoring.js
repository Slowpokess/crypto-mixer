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
exports.DatabaseMonitoring = void 0;
const events_1 = require("events");
const cron = __importStar(require("node-cron"));
/**
 * Система мониторинга базы данных с real-time алертами
 */
class DatabaseMonitoring extends events_1.EventEmitter {
    constructor(sequelize, config = {}) {
        super();
        this.metricsHistory = [];
        this.activeAlerts = new Map();
        this.alertRules = new Map();
        this.isMonitoring = false;
        this.sequelize = sequelize;
        this.config = {
            metricsRetentionHours: 24,
            monitoringIntervalMs: 30000, // 30 секунд
            alertCheckIntervalMs: 10000, // 10 секунд
            slowQueryThresholdMs: 1000, // 1 секунда
            ...config
        };
        this.setupDefaultAlertRules();
    }
    /**
     * Запуск мониторинга
     */
    start() {
        if (this.isMonitoring) {
            console.log('⚠️ Monitoring is already running');
            return;
        }
        console.log('🔄 Starting database monitoring...');
        this.isMonitoring = true;
        // Запускаем сбор метрик
        this.monitoringInterval = setInterval(async () => {
            try {
                const metrics = await this.collectMetrics();
                this.addMetrics(metrics);
                this.emit('metricsCollected', metrics);
            }
            catch (error) {
                console.error('❌ Error collecting metrics:', error);
                this.emit('error', error);
            }
        }, this.config.monitoringIntervalMs);
        // Запускаем проверку алертов
        this.alertCheckerInterval = setInterval(() => {
            this.checkAlerts();
        }, this.config.alertCheckIntervalMs);
        // Запускаем очистку старых метрик каждый час
        cron.schedule('0 * * * *', () => {
            this.cleanupOldMetrics();
        });
        console.log('✅ Database monitoring started');
    }
    /**
     * Остановка мониторинга
     */
    stop() {
        if (!this.isMonitoring) {
            console.log('⚠️ Monitoring is not running');
            return;
        }
        console.log('🔄 Stopping database monitoring...');
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.alertCheckerInterval) {
            clearInterval(this.alertCheckerInterval);
        }
        this.isMonitoring = false;
        console.log('✅ Database monitoring stopped');
    }
    /**
     * Сбор метрик
     */
    async collectMetrics() {
        const timestamp = new Date();
        const [connectionPoolMetrics, performanceMetrics, databaseMetrics, systemMetrics, businessMetrics] = await Promise.all([
            this.getConnectionPoolMetrics(),
            this.getPerformanceMetrics(),
            this.getDatabaseMetrics(),
            this.getSystemMetrics(),
            this.getBusinessMetrics()
        ]);
        return {
            timestamp,
            connectionPool: connectionPoolMetrics,
            performance: performanceMetrics,
            database: databaseMetrics,
            system: systemMetrics,
            business: businessMetrics
        };
    }
    /**
     * Метрики пула подключений
     */
    async getConnectionPoolMetrics() {
        const pool = this.sequelize.connectionManager.pool;
        return {
            active: pool.used || 0,
            idle: pool.available || 0,
            waiting: pool.pending || 0,
            total: (pool.used || 0) + (pool.available || 0)
        };
    }
    /**
     * Метрики производительности
     */
    async getPerformanceMetrics() {
        try {
            // Получаем статистику запросов из PostgreSQL
            const [results] = await this.sequelize.query(`
        SELECT 
          COALESCE(AVG(mean_exec_time), 0) as avg_query_time,
          COALESCE(SUM(calls), 0) as total_queries,
          COALESCE(COUNT(CASE WHEN mean_exec_time > ${this.config.slowQueryThresholdMs} THEN 1 END), 0) as slow_queries
        FROM pg_stat_statements 
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      `);
            const stats = results[0];
            return {
                avgQueryTime: parseFloat(stats.avg_query_time) || 0,
                slowQueries: parseInt(stats.slow_queries) || 0,
                totalQueries: parseInt(stats.total_queries) || 0,
                errorRate: 0 // Будет обновляться из логов ошибок
            };
        }
        catch (error) {
            // Fallback если pg_stat_statements недоступен
            return {
                avgQueryTime: 0,
                slowQueries: 0,
                totalQueries: 0,
                errorRate: 0
            };
        }
    }
    /**
     * Метрики базы данных
     */
    async getDatabaseMetrics() {
        try {
            const [sizeResult] = await this.sequelize.query(`
        SELECT pg_database_size(current_database()) as size
      `);
            const [tableResult] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as table_count
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
            const [indexResult] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as index_count
        FROM pg_indexes 
        WHERE schemaname = 'public'
      `);
            const [deadlockResult] = await this.sequelize.query(`
        SELECT 
          COALESCE(SUM(deadlocks), 0) as deadlocks
        FROM pg_stat_database 
        WHERE datname = current_database()
      `);
            return {
                size: parseInt(sizeResult[0].size) || 0,
                tableCount: parseInt(tableResult[0].table_count) || 0,
                indexCount: parseInt(indexResult[0].index_count) || 0,
                deadlocks: parseInt(deadlockResult[0].deadlocks) || 0
            };
        }
        catch (error) {
            console.error('Error collecting database metrics:', error);
            return { size: 0, tableCount: 0, indexCount: 0, deadlocks: 0 };
        }
    }
    /**
     * Системные метрики
     */
    async getSystemMetrics() {
        try {
            // Получаем системные метрики из PostgreSQL
            const [results] = await this.sequelize.query(`
        SELECT 
          COALESCE(
            (SELECT setting::float FROM pg_settings WHERE name = 'shared_buffers') / 
            (SELECT setting::float FROM pg_settings WHERE name = 'max_connections'), 
            0
          ) as memory_usage_ratio
      `);
            const memoryUsage = (results[0].memory_usage_ratio || 0) * 100;
            return {
                cpuUsage: 0, // Требует дополнительного мониторинга
                memoryUsage,
                diskUsage: 0, // Требует дополнительного мониторинга
                diskIops: 0 // Требует дополнительного мониторинга
            };
        }
        catch (error) {
            return { cpuUsage: 0, memoryUsage: 0, diskUsage: 0, diskIops: 0 };
        }
    }
    /**
     * Бизнес-метрики
     */
    async getBusinessMetrics() {
        try {
            const [mixRequestsResult] = await this.sequelize.query(`
        SELECT COUNT(*) as active_mix_requests
        FROM mix_requests 
        WHERE status IN ('PENDING', 'DEPOSITED', 'POOLING', 'MIXING')
      `);
            const [pendingTxResult] = await this.sequelize.query(`
        SELECT COUNT(*) as pending_transactions
        FROM output_transactions 
        WHERE status = 'PENDING'
      `);
            const [failedTxResult] = await this.sequelize.query(`
        SELECT COUNT(*) as failed_transactions
        FROM output_transactions 
        WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '1 hour'
      `);
            const [poolUtilResult] = await this.sequelize.query(`
        SELECT 
          COALESCE(AVG(current_amount::float / target_amount::float) * 100, 0) as pool_utilization
        FROM transaction_pools 
        WHERE is_active = true
      `);
            return {
                activeMixRequests: parseInt(mixRequestsResult[0].active_mix_requests) || 0,
                pendingTransactions: parseInt(pendingTxResult[0].pending_transactions) || 0,
                failedTransactions: parseInt(failedTxResult[0].failed_transactions) || 0,
                poolUtilization: parseFloat(poolUtilResult[0].pool_utilization) || 0
            };
        }
        catch (error) {
            console.error('Error collecting business metrics:', error);
            return {
                activeMixRequests: 0,
                pendingTransactions: 0,
                failedTransactions: 0,
                poolUtilization: 0
            };
        }
    }
    /**
     * Добавление метрик в историю
     */
    addMetrics(metrics) {
        this.metricsHistory.push(metrics);
        this.emit('metricsAdded', metrics);
    }
    /**
     * Очистка старых метрик
     */
    cleanupOldMetrics() {
        const cutoffTime = new Date(Date.now() - this.config.metricsRetentionHours * 60 * 60 * 1000);
        const originalLength = this.metricsHistory.length;
        this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoffTime);
        const cleaned = originalLength - this.metricsHistory.length;
        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} old metrics records`);
        }
    }
    /**
     * Настройка правил алертов по умолчанию
     */
    setupDefaultAlertRules() {
        const defaultRules = [
            {
                id: 'high_connection_usage',
                name: 'High Connection Pool Usage',
                metric: 'connectionPool.active',
                operator: 'gt',
                threshold: 80,
                duration: 5,
                severity: 'high',
                enabled: true,
                notificationChannels: ['console', 'log']
            },
            {
                id: 'slow_queries',
                name: 'High Number of Slow Queries',
                metric: 'performance.slowQueries',
                operator: 'gt',
                threshold: 10,
                duration: 3,
                severity: 'medium',
                enabled: true,
                notificationChannels: ['console', 'log']
            },
            {
                id: 'failed_transactions',
                name: 'High Failed Transaction Rate',
                metric: 'business.failedTransactions',
                operator: 'gt',
                threshold: 5,
                duration: 2,
                severity: 'high',
                enabled: true,
                notificationChannels: ['console', 'log']
            },
            {
                id: 'database_deadlocks',
                name: 'Database Deadlocks Detected',
                metric: 'database.deadlocks',
                operator: 'gt',
                threshold: 0,
                duration: 1,
                severity: 'critical',
                enabled: true,
                notificationChannels: ['console', 'log']
            },
            {
                id: 'low_pool_utilization',
                name: 'Low Pool Utilization',
                metric: 'business.poolUtilization',
                operator: 'lt',
                threshold: 20,
                duration: 10,
                severity: 'low',
                enabled: true,
                notificationChannels: ['log']
            }
        ];
        defaultRules.forEach(rule => {
            this.addAlertRule(rule);
        });
    }
    /**
     * Добавление правила алерта
     */
    addAlertRule(rule) {
        this.alertRules.set(rule.id, rule);
        console.log(`📋 Added alert rule: ${rule.name}`);
    }
    /**
     * Удаление правила алерта
     */
    removeAlertRule(ruleId) {
        const removed = this.alertRules.delete(ruleId);
        if (removed) {
            console.log(`🗑️ Removed alert rule: ${ruleId}`);
        }
        return removed;
    }
    /**
     * Проверка алертов
     */
    checkAlerts() {
        if (this.metricsHistory.length === 0)
            return;
        const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
        for (const [ruleId, rule] of this.alertRules) {
            if (!rule.enabled)
                continue;
            const currentValue = this.getMetricValue(latestMetrics, rule.metric);
            const shouldAlert = this.evaluateCondition(currentValue, rule.operator, rule.threshold);
            if (shouldAlert) {
                this.handleAlert(rule, currentValue);
            }
            else {
                this.resolveAlert(ruleId);
            }
        }
    }
    /**
     * Получение значения метрики по пути
     */
    getMetricValue(metrics, metricPath) {
        const parts = metricPath.split('.');
        let value = metrics;
        for (const part of parts) {
            value = value?.[part];
        }
        return typeof value === 'number' ? value : 0;
    }
    /**
     * Оценка условия алерта
     */
    evaluateCondition(value, operator, threshold) {
        switch (operator) {
            case 'gt': return value > threshold;
            case 'lt': return value < threshold;
            case 'eq': return value === threshold;
            case 'gte': return value >= threshold;
            case 'lte': return value <= threshold;
            default: return false;
        }
    }
    /**
     * Обработка алерта
     */
    handleAlert(rule, currentValue) {
        const existingAlert = this.activeAlerts.get(rule.id);
        if (existingAlert && !existingAlert.resolved) {
            // Алерт уже активен
            return;
        }
        const alert = {
            id: `${rule.id}_${Date.now()}`,
            ruleId: rule.id,
            ruleName: rule.name,
            metric: rule.metric,
            currentValue,
            threshold: rule.threshold,
            severity: rule.severity,
            message: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
            timestamp: new Date(),
            resolved: false
        };
        this.activeAlerts.set(rule.id, alert);
        this.sendNotification(alert, rule.notificationChannels);
        this.emit('alert', alert);
        console.log(`🚨 ALERT [${rule.severity.toUpperCase()}]: ${alert.message}`);
    }
    /**
     * Разрешение алерта
     */
    resolveAlert(ruleId) {
        const alert = this.activeAlerts.get(ruleId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = new Date();
            this.emit('alertResolved', alert);
            console.log(`✅ RESOLVED: ${alert.message}`);
        }
    }
    /**
     * Отправка уведомления
     */
    sendNotification(alert, channels) {
        for (const channel of channels) {
            switch (channel) {
                case 'console':
                    console.log(`🚨 ${alert.severity.toUpperCase()}: ${alert.message}`);
                    break;
                case 'log':
                    // Логирование в файл (требует настройки winston logger)
                    break;
                case 'email':
                    // Отправка email (требует настройки SMTP)
                    break;
                case 'webhook':
                    // Отправка webhook (требует настройки URL)
                    break;
                case 'slack':
                    // Отправка в Slack (требует настройки Slack API)
                    break;
            }
        }
    }
    /**
     * Получение текущих метрик
     */
    getCurrentMetrics() {
        return this.metricsHistory.length > 0 ?
            this.metricsHistory[this.metricsHistory.length - 1] : null;
    }
    /**
     * Получение истории метрик
     */
    getMetricsHistory(hours = 1) {
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.metricsHistory.filter(m => m.timestamp > cutoffTime);
    }
    /**
     * Получение активных алертов
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
    }
    /**
     * Получение статистики алертов
     */
    getAlertStatistics() {
        const alerts = Array.from(this.activeAlerts.values());
        const active = alerts.filter(a => !a.resolved);
        const resolved = alerts.filter(a => a.resolved);
        const bySeverity = alerts.reduce((acc, alert) => {
            acc[alert.severity] = (acc[alert.severity] || 0) + 1;
            return acc;
        }, {});
        return {
            total: alerts.length,
            active: active.length,
            resolved: resolved.length,
            bySeverity
        };
    }
    /**
     * Получение отчета о состоянии
     */
    getHealthReport() {
        const currentMetrics = this.getCurrentMetrics();
        const activeAlerts = this.getActiveAlerts();
        let status = 'healthy';
        if (activeAlerts.some(a => a.severity === 'critical')) {
            status = 'critical';
        }
        else if (activeAlerts.some(a => ['high', 'medium'].includes(a.severity))) {
            status = 'warning';
        }
        const summary = `Database health: ${status}. ${activeAlerts.length} active alerts.`;
        return {
            status,
            metrics: currentMetrics,
            activeAlerts,
            summary
        };
    }
}
exports.DatabaseMonitoring = DatabaseMonitoring;
exports.default = DatabaseMonitoring;
//# sourceMappingURL=DatabaseMonitoring.js.map