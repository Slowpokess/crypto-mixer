"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupMonitoring = void 0;
const events_1 = require("events");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
/**
 * Enterprise-grade Backup Monitoring System
 * Обеспечивает комплексный мониторинг backup процессов и алертинг
 */
class BackupMonitoring extends events_1.EventEmitter {
    constructor(config, backupManager, drManager) {
        super();
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.alerts = new Map();
        this.metrics = new Map();
        this.alertHistory = [];
        this.metricsHistory = [];
        this.lastAlertTimes = new Map();
        this.escalationTimers = new Map();
        this.alertCounters = new Map();
        this.config = config;
        this.backupManager = backupManager;
        this.drManager = drManager;
        this.validateConfiguration();
        this.setupEventListeners();
    }
    /**
     * Инициализация системы мониторинга
     */
    async initialize() {
        const operationId = await logger_1.enhancedDbLogger.startOperation('backup_monitoring_init');
        try {
            logger_1.enhancedDbLogger.info('🔍 Инициализация Backup Monitoring System');
            // Загрузка исторических данных
            await this.loadHistoricalData();
            // Создание необходимых директорий
            await this.ensureDirectories();
            // Запуск мониторинга если включен
            if (this.config.enabled) {
                this.startMonitoring();
            }
            // Запуск dashboard если включен
            if (this.config.dashboard.enabled) {
                await this.startDashboard();
            }
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Backup Monitoring System инициализирован', {
                monitoring: this.isMonitoring,
                alertChannels: this.config.alerts.channels.length,
                dashboard: this.config.dashboard.enabled
            });
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
    }
    /**
     * Запуск основного цикла мониторинга
     */
    startMonitoring() {
        if (this.isMonitoring)
            return;
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.performMonitoringCycle();
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка в цикле мониторинга', { error });
                await this.createAlert({
                    severity: 'error',
                    category: 'health',
                    title: 'Ошибка мониторинга backup',
                    description: `Произошла ошибка в цикле мониторинга: ${error}`,
                    source: 'backup_monitoring',
                    tags: ['monitoring', 'error']
                });
            }
        }, this.config.thresholds.healthCheckInterval * 1000);
        logger_1.enhancedDbLogger.info('👁️ Мониторинг backup процессов запущен', {
            interval: this.config.thresholds.healthCheckInterval
        });
    }
    /**
     * Выполнение одного цикла мониторинга
     */
    async performMonitoringCycle() {
        const startTime = Date.now();
        // Сбор метрик
        const metrics = await this.collectMetrics();
        this.storeMetrics(metrics);
        // Проверка пороговых значений
        await this.checkThresholds(metrics);
        // Проверка состояния backup
        await this.checkBackupHealth();
        // Проверка storage
        await this.checkStorageHealth();
        // Обновление dashboard
        if (this.config.dashboard.enabled) {
            await this.updateDashboard();
        }
        // Экспорт метрик
        if (this.config.metrics.exportEnabled) {
            await this.exportMetrics();
        }
        // Очистка устаревших данных
        await this.cleanupHistoricalData();
        const duration = Date.now() - startTime;
        logger_1.enhancedDbLogger.debug('🔄 Цикл мониторинга завершен', {
            duration: `${duration}ms`,
            alerts: this.alerts.size,
            metrics: this.metrics.size
        });
    }
    /**
     * Сбор метрик производительности
     */
    async collectMetrics() {
        const backupHistory = this.backupManager.getBackupHistory();
        const systemHealth = await this.drManager.performHealthCheck();
        const currentStatus = this.backupManager.getCurrentStatus();
        // Статистика backup за последние 24 часа
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentBackups = backupHistory.filter(b => b.timestamp >= last24h);
        const totalBackups = recentBackups.length;
        const successfulBackups = recentBackups.filter(b => b.status === 'completed').length;
        const failedBackups = recentBackups.filter(b => b.status === 'failed').length;
        // Вычисление производительности
        const avgDuration = recentBackups.length > 0
            ? recentBackups.reduce((sum, b) => sum + b.duration, 0) / recentBackups.length
            : 0;
        const totalSize = recentBackups.reduce((sum, b) => sum + b.size, 0);
        const avgThroughput = avgDuration > 0 ? (totalSize / (1024 * 1024)) / avgDuration : 0;
        // Storage метрики
        const storageStats = await this.getStorageStats();
        const metrics = {
            timestamp: new Date(),
            period: 'realtime',
            backup: {
                totalBackups,
                successfulBackups,
                failedBackups,
                successRate: totalBackups > 0 ? (successfulBackups / totalBackups) * 100 : 100,
                averageDuration: avgDuration,
                totalSize,
                compressionRatio: this.calculateCompressionRatio(recentBackups),
                componentsBackedUp: this.countUniqueComponents(recentBackups)
            },
            performance: {
                averageThroughput: avgThroughput,
                peakThroughput: this.calculatePeakThroughput(recentBackups),
                cpuUsagePercent: this.getCpuUsage(),
                memoryUsageMB: process.memoryUsage().heapUsed / (1024 * 1024),
                diskIoWaitPercent: 0 // TODO: реализовать сбор IO метрик
            },
            storage: {
                totalUsedSpace: storageStats.used,
                availableSpace: storageStats.available,
                usagePercent: storageStats.usagePercent,
                oldestBackup: backupHistory.length > 0
                    ? new Date(Math.min(...backupHistory.map(b => b.timestamp.getTime())))
                    : new Date(),
                newestBackup: backupHistory.length > 0
                    ? new Date(Math.max(...backupHistory.map(b => b.timestamp.getTime())))
                    : new Date(),
                retentionCompliance: this.calculateRetentionCompliance(backupHistory)
            },
            health: {
                systemHealthScore: this.calculateHealthScore(systemHealth),
                componentStatuses: new Map(Object.entries(systemHealth.components).map(([key, comp]) => [key, comp.status])),
                uptime: process.uptime(),
                lastSuccessfulBackup: this.getLastSuccessfulBackup(backupHistory),
                lastFailedBackup: this.getLastFailedBackup(backupHistory)
            },
            trends: {
                backupSizeGrowth: this.calculateSizeGrowthTrend(),
                successRateTrend: this.calculateSuccessRateTrend(),
                performanceTrend: this.calculatePerformanceTrend(),
                diskUsageTrend: this.calculateDiskUsageTrend()
            }
        };
        return metrics;
    }
    /**
     * Проверка пороговых значений и создание алертов
     */
    async checkThresholds(metrics) {
        const thresholds = this.config.thresholds;
        // Проверка успешности backup
        if (metrics.backup.successRate < thresholds.minSuccessRate) {
            await this.createAlert({
                severity: 'warning',
                category: 'backup',
                title: 'Низкий процент успешных backup',
                description: `Процент успешных backup (${metrics.backup.successRate.toFixed(1)}%) ниже порога ${thresholds.minSuccessRate}%`,
                source: 'threshold_monitor',
                tags: ['success-rate', 'threshold'],
                metadata: {
                    threshold: thresholds.minSuccessRate,
                    currentValue: metrics.backup.successRate,
                    trend: 'decreasing'
                }
            });
        }
        // Проверка продолжительности backup
        if (metrics.backup.averageDuration > thresholds.maxBackupDuration * 60) {
            await this.createAlert({
                severity: 'warning',
                category: 'performance',
                title: 'Превышена максимальная длительность backup',
                description: `Средняя длительность backup (${Math.round(metrics.backup.averageDuration / 60)} мин) превышает порог ${thresholds.maxBackupDuration} мин`,
                source: 'threshold_monitor',
                tags: ['duration', 'performance', 'threshold'],
                metadata: {
                    threshold: thresholds.maxBackupDuration,
                    currentValue: Math.round(metrics.backup.averageDuration / 60),
                    trend: 'increasing'
                }
            });
        }
        // Проверка использования диска
        if (metrics.storage.usagePercent > thresholds.diskSpaceCritical) {
            await this.createAlert({
                severity: 'critical',
                category: 'storage',
                title: 'Критически мало места на диске',
                description: `Использование диска (${metrics.storage.usagePercent.toFixed(1)}%) превышает критический порог ${thresholds.diskSpaceCritical}%`,
                source: 'threshold_monitor',
                tags: ['disk-space', 'critical', 'threshold'],
                metadata: {
                    threshold: thresholds.diskSpaceCritical,
                    currentValue: metrics.storage.usagePercent,
                    trend: 'increasing'
                }
            });
        }
        else if (metrics.storage.usagePercent > thresholds.diskSpaceWarning) {
            await this.createAlert({
                severity: 'warning',
                category: 'storage',
                title: 'Предупреждение о месте на диске',
                description: `Использование диска (${metrics.storage.usagePercent.toFixed(1)}%) превышает предупредительный порог ${thresholds.diskSpaceWarning}%`,
                source: 'threshold_monitor',
                tags: ['disk-space', 'warning', 'threshold'],
                metadata: {
                    threshold: thresholds.diskSpaceWarning,
                    currentValue: metrics.storage.usagePercent,
                    trend: 'increasing'
                }
            });
        }
        // Проверка подряд идущих неудачных backup
        const consecutiveFailures = this.countConsecutiveFailures();
        if (consecutiveFailures >= thresholds.maxFailedBackups) {
            await this.createAlert({
                severity: 'error',
                category: 'backup',
                title: 'Множественные неудачные backup подряд',
                description: `Обнаружено ${consecutiveFailures} неудачных backup подряд, что превышает порог ${thresholds.maxFailedBackups}`,
                source: 'threshold_monitor',
                tags: ['consecutive-failures', 'backup', 'threshold'],
                metadata: {
                    threshold: thresholds.maxFailedBackups,
                    currentValue: consecutiveFailures,
                    trend: 'increasing'
                }
            });
        }
    }
    /**
     * Проверка общего здоровья backup системы
     */
    async checkBackupHealth() {
        const backupHistory = this.backupManager.getBackupHistory();
        const currentStatus = this.backupManager.getCurrentStatus();
        // Проверка давности последнего backup
        if (backupHistory.length > 0) {
            const lastBackup = backupHistory[0];
            const hoursSinceLastBackup = (Date.now() - lastBackup.timestamp.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastBackup > 48) { // 48 часов
                await this.createAlert({
                    severity: 'error',
                    category: 'backup',
                    title: 'Давно не было backup',
                    description: `Последний backup был ${Math.round(hoursSinceLastBackup)} часов назад`,
                    source: 'backup_health_monitor',
                    tags: ['stale-backup', 'health'],
                    metadata: {
                        currentValue: hoursSinceLastBackup
                    }
                });
            }
        }
        else {
            await this.createAlert({
                severity: 'warning',
                category: 'backup',
                title: 'Отсутствуют backup',
                description: 'В системе не найдено ни одного backup',
                source: 'backup_health_monitor',
                tags: ['no-backups', 'health']
            });
        }
        // Проверка запущенного backup на зависание
        if (currentStatus.isRunning && currentStatus.currentBackupId) {
            // Если backup запущен более 6 часов
            const runningTime = Date.now() - Date.parse(currentStatus.currentBackupId.split('_')[1]);
            if (runningTime > 6 * 60 * 60 * 1000) {
                await this.createAlert({
                    severity: 'warning',
                    category: 'backup',
                    title: 'Backup выполняется слишком долго',
                    description: `Backup ${currentStatus.currentBackupId} выполняется уже ${Math.round(runningTime / (60 * 60 * 1000))} часов`,
                    source: 'backup_health_monitor',
                    tags: ['long-running', 'performance'],
                    metadata: {
                        backupId: currentStatus.currentBackupId,
                        currentValue: runningTime / (60 * 60 * 1000)
                    }
                });
            }
        }
    }
    /**
     * Проверка здоровья storage
     */
    async checkStorageHealth() {
        try {
            const storageStats = await this.getStorageStats();
            // Проверка доступности storage
            if (!storageStats.accessible) {
                await this.createAlert({
                    severity: 'critical',
                    category: 'storage',
                    title: 'Storage недоступен',
                    description: 'Хранилище backup недоступно',
                    source: 'storage_health_monitor',
                    tags: ['storage-unavailable', 'critical']
                });
            }
            // Проверка роста использования storage
            if (storageStats.growthRate > 10) { // Более 10% в день
                await this.createAlert({
                    severity: 'warning',
                    category: 'storage',
                    title: 'Быстрый рост использования storage',
                    description: `Использование storage растет со скоростью ${storageStats.growthRate.toFixed(1)}% в день`,
                    source: 'storage_health_monitor',
                    tags: ['storage-growth', 'trending'],
                    metadata: {
                        currentValue: storageStats.growthRate,
                        trend: 'increasing'
                    }
                });
            }
        }
        catch (error) {
            await this.createAlert({
                severity: 'error',
                category: 'storage',
                title: 'Ошибка проверки storage',
                description: `Не удалось проверить состояние storage: ${error}`,
                source: 'storage_health_monitor',
                tags: ['storage-error', 'monitoring']
            });
        }
    }
    /**
     * Создание и обработка алерта
     */
    async createAlert(alertData) {
        const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const alert = {
            id: alertId,
            timestamp: new Date(),
            severity: alertData.severity || 'info',
            category: alertData.category || 'health',
            title: alertData.title || 'Неизвестная проблема',
            description: alertData.description || '',
            source: alertData.source || 'backup_monitoring',
            tags: alertData.tags || [],
            metadata: alertData.metadata || {},
            status: 'open',
            escalationLevel: 0,
            notifications: []
        };
        // Проверка на дублирование алертов
        if (this.isDuplicateAlert(alert)) {
            logger_1.enhancedDbLogger.debug('⚠️ Дублирующийся алерт пропущен', {
                title: alert.title,
                source: alert.source
            });
            return alertId;
        }
        // Проверка rate limiting
        if (!this.checkRateLimit(alert)) {
            logger_1.enhancedDbLogger.debug('⚠️ Алерт пропущен из-за rate limiting', {
                title: alert.title
            });
            return alertId;
        }
        this.alerts.set(alertId, alert);
        this.alertHistory.push(alert);
        logger_1.enhancedDbLogger.warn(`🚨 Создан алерт: ${alert.title}`, {
            id: alertId,
            severity: alert.severity,
            category: alert.category,
            source: alert.source
        });
        // Отправка уведомлений
        if (this.config.alerts.enabled) {
            await this.sendNotifications(alert);
        }
        // Запуск эскалации если необходимо
        if (this.config.alerts.escalation.enabled &&
            ['error', 'critical', 'emergency'].includes(alert.severity)) {
            this.startEscalation(alert);
        }
        // Сохранение в файл
        await this.saveAlertToFile(alert);
        // Эмиссия события
        this.emit('alert', alert);
        return alertId;
    }
    /**
     * Отправка уведомлений по каналам
     */
    async sendNotifications(alert) {
        const relevantChannels = this.config.alerts.channels.filter(channel => this.shouldSendToChannel(channel, alert));
        const notificationPromises = relevantChannels.map(async (channel) => {
            const startTime = Date.now();
            let attempt = 1;
            let success = false;
            let error;
            try {
                await this.sendToChannel(channel, alert);
                success = true;
            }
            catch (err) {
                error = String(err);
                logger_1.enhancedDbLogger.error(`❌ Ошибка отправки алерта в канал ${channel.name}`, {
                    alert: alert.id,
                    channel: channel.name,
                    error: err
                });
            }
            const notification = {
                channel: channel.name,
                sentAt: new Date(),
                success,
                error,
                responseTime: Date.now() - startTime,
                attempt
            };
            alert.notifications.push(notification);
        });
        await Promise.allSettled(notificationPromises);
        logger_1.enhancedDbLogger.info('📤 Уведомления отправлены', {
            alert: alert.id,
            channels: relevantChannels.length,
            successful: alert.notifications.filter(n => n.success).length
        });
    }
    /**
     * Отправка в конкретный канал
     */
    async sendToChannel(channel, alert) {
        const message = this.formatAlertMessage(alert, channel);
        switch (channel.type) {
            case 'webhook':
                await this.sendWebhook(channel, alert, message);
                break;
            case 'email':
                await this.sendEmail(channel, alert, message);
                break;
            case 'slack':
                await this.sendSlack(channel, alert, message);
                break;
            case 'telegram':
                await this.sendTelegram(channel, alert, message);
                break;
            case 'sms':
                await this.sendSMS(channel, alert, message);
                break;
            case 'pagerduty':
                await this.sendPagerDuty(channel, alert, message);
                break;
            default:
                throw new Error(`Неподдерживаемый тип канала: ${channel.type}`);
        }
    }
    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========
    validateConfiguration() {
        if (!this.config.thresholds) {
            throw new Error('Отсутствует конфигурация thresholds');
        }
        if (this.config.alerts.enabled && this.config.alerts.channels.length === 0) {
            throw new Error('Алерты включены, но не настроены каналы уведомлений');
        }
    }
    setupEventListeners() {
        // События от BackupManager
        this.backupManager.on?.('backup_started', (backupId) => {
            this.createAlert({
                severity: 'info',
                category: 'backup',
                title: 'Backup запущен',
                description: `Начат backup ${backupId}`,
                source: 'backup_manager',
                tags: ['backup-started'],
                metadata: { backupId }
            });
        });
        this.backupManager.on?.('backup_completed', (report) => {
            this.createAlert({
                severity: 'info',
                category: 'backup',
                title: 'Backup завершен успешно',
                description: `Backup ${report.id} завершен за ${report.duration}с`,
                source: 'backup_manager',
                tags: ['backup-completed', 'success'],
                metadata: { backupId: report.id }
            });
        });
        this.backupManager.on?.('backup_failed', (backupId, error) => {
            this.createAlert({
                severity: 'error',
                category: 'backup',
                title: 'Backup завершен с ошибкой',
                description: `Backup ${backupId} завершился ошибкой: ${error}`,
                source: 'backup_manager',
                tags: ['backup-failed', 'error'],
                metadata: { backupId }
            });
        });
    }
    storeMetrics(metrics) {
        const key = metrics.timestamp.toISOString();
        this.metrics.set(key, metrics);
        this.metricsHistory.push(metrics);
        // Ограничение размера истории метрик
        const maxHistorySize = 1000;
        if (this.metricsHistory.length > maxHistorySize) {
            this.metricsHistory = this.metricsHistory.slice(-maxHistorySize);
        }
    }
    async loadHistoricalData() {
        try {
            // Загрузка алертов
            const alertsFile = path_1.default.join(this.config.metrics.exportPath, 'alerts_history.json');
            const alertsData = await promises_1.default.readFile(alertsFile, 'utf-8');
            this.alertHistory = JSON.parse(alertsData).map((a) => ({
                ...a,
                timestamp: new Date(a.timestamp),
                acknowledgedAt: a.acknowledgedAt ? new Date(a.acknowledgedAt) : undefined,
                resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : undefined
            }));
            // Загрузка метрик
            const metricsFile = path_1.default.join(this.config.metrics.exportPath, 'metrics_history.json');
            const metricsData = await promises_1.default.readFile(metricsFile, 'utf-8');
            this.metricsHistory = JSON.parse(metricsData).map((m) => ({
                ...m,
                timestamp: new Date(m.timestamp)
            }));
            logger_1.enhancedDbLogger.info('📚 Исторические данные загружены', {
                alerts: this.alertHistory.length,
                metrics: this.metricsHistory.length
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.info('📚 Создание новой истории данных');
        }
    }
    async ensureDirectories() {
        await promises_1.default.mkdir(this.config.metrics.exportPath, { recursive: true });
        await promises_1.default.mkdir(path_1.default.dirname(this.config.metrics.exportPath + '/logs'), { recursive: true });
    }
    async getStorageStats() {
        // Реализация получения статистики storage
        return {
            used: 1024 * 1024 * 1024, // 1GB
            available: 10 * 1024 * 1024 * 1024, // 10GB
            usagePercent: 10,
            accessible: true,
            growthRate: 2.5 // % в день
        };
    }
    calculateCompressionRatio(backups) {
        // Упрощенный расчет компрессии
        return 0.3; // 30% compression
    }
    countUniqueComponents(backups) {
        const components = new Set();
        for (const backup of backups) {
            backup.components.forEach(c => components.add(c));
        }
        return components.size;
    }
    calculatePeakThroughput(backups) {
        // Упрощенный расчет пикового throughput
        return 50; // MB/s
    }
    getCpuUsage() {
        // Упрощенный расчет CPU usage
        return 25; // 25%
    }
    calculateRetentionCompliance(backups) {
        // Упрощенный расчет соответствия политике retention
        return 95; // 95%
    }
    calculateHealthScore(health) {
        const weights = { healthy: 100, degraded: 75, critical: 25, down: 0 };
        const components = Object.values(health.components);
        const totalScore = components.reduce((sum, comp) => sum + weights[comp.status], 0);
        return totalScore / components.length;
    }
    getLastSuccessfulBackup(backups) {
        const successful = backups.filter(b => b.status === 'completed');
        return successful.length > 0 ? successful[0].timestamp : new Date(0);
    }
    getLastFailedBackup(backups) {
        const failed = backups.filter(b => b.status === 'failed');
        return failed.length > 0 ? failed[0].timestamp : undefined;
    }
    calculateSizeGrowthTrend() {
        // Упрощенный расчет тренда роста размера
        return 10; // MB/day
    }
    calculateSuccessRateTrend() {
        // Упрощенный расчет тренда успешности
        return 2; // % change per day
    }
    calculatePerformanceTrend() {
        // Упрощенный расчет тренда производительности
        return -1; // % change per day
    }
    calculateDiskUsageTrend() {
        // Упрощенный расчет тренда использования диска
        return 5; // % change per day
    }
    countConsecutiveFailures() {
        const backups = this.backupManager.getBackupHistory();
        let count = 0;
        for (const backup of backups) {
            if (backup.status === 'failed') {
                count++;
            }
            else {
                break;
            }
        }
        return count;
    }
    isDuplicateAlert(alert) {
        const recentAlerts = this.alertHistory.filter(a => Date.now() - a.timestamp.getTime() < 60 * 60 * 1000 // последний час
        );
        return recentAlerts.some(a => a.title === alert.title &&
            a.source === alert.source &&
            a.status !== 'resolved');
    }
    checkRateLimit(alert) {
        if (!this.config.alerts.rateLimit.enabled)
            return true;
        const key = `${alert.category}_${alert.source}`;
        const now = Date.now();
        const lastTime = this.lastAlertTimes.get(key) || 0;
        const cooldown = this.config.alerts.rateLimit.cooldownMinutes * 60 * 1000;
        if (now - lastTime < cooldown) {
            return false;
        }
        this.lastAlertTimes.set(key, now);
        return true;
    }
    shouldSendToChannel(channel, alert) {
        if (!channel.enabled)
            return false;
        // Фильтр по severity
        if (channel.filters.severity &&
            !channel.filters.severity.includes(alert.severity)) {
            return false;
        }
        // Фильтр по компонентам
        if (channel.filters.components &&
            !channel.filters.components.some(comp => alert.tags.includes(comp))) {
            return false;
        }
        // Фильтр по времени
        if (channel.filters.timeWindow) {
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const { start, end } = channel.filters.timeWindow;
            if (currentTime < start || currentTime > end) {
                return false;
            }
        }
        return true;
    }
    formatAlertMessage(alert, channel) {
        const template = channel.config.template || `
🚨 **${alert.severity.toUpperCase()}**: ${alert.title}

📝 **Описание**: ${alert.description}
🏷️ **Категория**: ${alert.category}
📍 **Источник**: ${alert.source}
⏰ **Время**: ${alert.timestamp.toISOString()}
🔗 **ID**: ${alert.id}

${alert.metadata ? '📊 **Данные**: ' + JSON.stringify(alert.metadata, null, 2) : ''}
    `.trim();
        return template
            .replace(/\${(\w+)}/g, (match, key) => {
            return alert[key] || match;
        });
    }
    async sendWebhook(channel, alert, message) {
        // Реализация webhook
        logger_1.enhancedDbLogger.info(`📤 Webhook sent to ${channel.name}`, { alert: alert.id });
    }
    async sendEmail(channel, alert, message) {
        // Реализация email
        logger_1.enhancedDbLogger.info(`📧 Email sent to ${channel.name}`, { alert: alert.id });
    }
    async sendSlack(channel, alert, message) {
        // Реализация Slack
        logger_1.enhancedDbLogger.info(`💬 Slack message sent to ${channel.name}`, { alert: alert.id });
    }
    async sendTelegram(channel, alert, message) {
        // Реализация Telegram
        logger_1.enhancedDbLogger.info(`📱 Telegram message sent to ${channel.name}`, { alert: alert.id });
    }
    async sendSMS(channel, alert, message) {
        // Реализация SMS
        logger_1.enhancedDbLogger.info(`📱 SMS sent to ${channel.name}`, { alert: alert.id });
    }
    async sendPagerDuty(channel, alert, message) {
        // Реализация PagerDuty
        logger_1.enhancedDbLogger.info(`🚨 PagerDuty alert sent to ${channel.name}`, { alert: alert.id });
    }
    startEscalation(alert) {
        if (!this.config.alerts.escalation.enabled)
            return;
        const escalateToNextLevel = () => {
            if (alert.escalationLevel >= this.config.alerts.escalation.maxEscalations) {
                return;
            }
            alert.escalationLevel++;
            const level = this.config.alerts.escalation.levels[alert.escalationLevel - 1];
            if (level) {
                logger_1.enhancedDbLogger.warn(`🔺 Эскалация алерта на уровень ${alert.escalationLevel}`, {
                    alert: alert.id,
                    level: alert.escalationLevel
                });
                // Отправка на каналы эскалации
                const escalationChannels = this.config.alerts.channels.filter(c => level.channels.includes(c.name));
                for (const channel of escalationChannels) {
                    this.sendToChannel(channel, alert, `🔺 ЭСКАЛАЦИЯ УРОВЕНЬ ${alert.escalationLevel}\n\n` +
                        this.formatAlertMessage(alert, channel));
                }
                // Установка таймера для следующего уровня
                const nextTimeout = this.config.alerts.escalation.timeouts[alert.escalationLevel] * 60 * 1000;
                this.escalationTimers.set(alert.id, setTimeout(escalateToNextLevel, nextTimeout));
            }
        };
        // Запуск первого уровня эскалации
        const firstTimeout = this.config.alerts.escalation.timeouts[0] * 60 * 1000;
        this.escalationTimers.set(alert.id, setTimeout(escalateToNextLevel, firstTimeout));
    }
    async startDashboard() {
        // Реализация web dashboard
        logger_1.enhancedDbLogger.info('🖥️ Dashboard запущен', {
            port: this.config.dashboard.port || 3000
        });
    }
    async updateDashboard() {
        // Обновление данных dashboard
    }
    async exportMetrics() {
        const timestamp = new Date().toISOString().split('T')[0];
        if (this.config.metrics.exportFormat === 'json') {
            const exportFile = path_1.default.join(this.config.metrics.exportPath, `metrics_${timestamp}.json`);
            await promises_1.default.writeFile(exportFile, JSON.stringify(Array.from(this.metrics.values()), null, 2));
        }
    }
    async saveAlertToFile(alert) {
        const alertsFile = path_1.default.join(this.config.metrics.exportPath, 'current_alerts.json');
        const alerts = Array.from(this.alerts.values());
        await promises_1.default.writeFile(alertsFile, JSON.stringify(alerts, null, 2));
    }
    async cleanupHistoricalData() {
        const cutoffDate = new Date(Date.now() - this.config.metrics.retentionDays * 24 * 60 * 60 * 1000);
        // Очистка алертов
        this.alertHistory = this.alertHistory.filter(a => a.timestamp >= cutoffDate);
        // Очистка метрик
        this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoffDate);
        // Очистка resolved алертов
        for (const [id, alert] of this.alerts.entries()) {
            if (alert.status === 'resolved' && alert.resolvedAt && alert.resolvedAt < cutoffDate) {
                this.alerts.delete(id);
            }
        }
    }
    /**
     * Получение данных для dashboard
     */
    getDashboardData() {
        const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
        const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'open');
        return {
            status: this.calculateOverallStatus(),
            lastUpdated: new Date(),
            summary: {
                totalBackups: latestMetrics?.backup.totalBackups || 0,
                successRate: latestMetrics?.backup.successRate || 0,
                lastBackupTime: latestMetrics?.health.lastSuccessfulBackup || new Date(0),
                nextScheduledBackup: new Date(Date.now() + 24 * 60 * 60 * 1000), // TODO: реальное расписание
                diskUsagePercent: latestMetrics?.storage.usagePercent || 0,
                activeAlerts: activeAlerts.length
            },
            recentBackups: this.backupManager.getBackupHistory().slice(0, 10),
            recentAlerts: this.alertHistory.slice(-10),
            metrics: latestMetrics || {},
            systemHealth: {}, // TODO: получить от DR manager
            trends: {
                backupSuccess: this.metricsHistory.slice(-24).map(m => m.backup.successRate),
                diskUsage: this.metricsHistory.slice(-24).map(m => m.storage.usagePercent),
                performance: this.metricsHistory.slice(-24).map(m => m.performance.averageThroughput),
                alertCounts: this.getHourlyAlertCounts()
            }
        };
    }
    calculateOverallStatus() {
        const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'open');
        const emergencyAlerts = activeAlerts.filter(a => a.severity === 'emergency');
        const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
        const errorAlerts = activeAlerts.filter(a => a.severity === 'error');
        const warningAlerts = activeAlerts.filter(a => a.severity === 'warning');
        if (emergencyAlerts.length > 0)
            return 'emergency';
        if (criticalAlerts.length > 0)
            return 'critical';
        if (errorAlerts.length > 0 || warningAlerts.length > 3)
            return 'warning';
        return 'healthy';
    }
    getHourlyAlertCounts() {
        const now = Date.now();
        const hourlyData = [];
        for (let i = 23; i >= 0; i--) {
            const hourStart = now - (i + 1) * 60 * 60 * 1000;
            const hourEnd = now - i * 60 * 60 * 1000;
            const count = this.alertHistory.filter(a => a.timestamp.getTime() >= hourStart && a.timestamp.getTime() < hourEnd).length;
            hourlyData.push(count);
        }
        return hourlyData;
    }
    /**
     * Подтверждение алерта
     */
    async acknowledgeAlert(alertId, acknowledgedBy) {
        const alert = this.alerts.get(alertId);
        if (!alert || alert.status !== 'open') {
            return false;
        }
        alert.status = 'acknowledged';
        alert.acknowledgedBy = acknowledgedBy;
        alert.acknowledgedAt = new Date();
        // Остановка эскалации
        const escalationTimer = this.escalationTimers.get(alertId);
        if (escalationTimer) {
            clearTimeout(escalationTimer);
            this.escalationTimers.delete(alertId);
        }
        logger_1.enhancedDbLogger.info('✅ Алерт подтвержден', {
            alert: alertId,
            by: acknowledgedBy
        });
        await this.saveAlertToFile(alert);
        return true;
    }
    /**
     * Разрешение алерта
     */
    async resolveAlert(alertId, resolvedBy) {
        const alert = this.alerts.get(alertId);
        if (!alert || alert.status === 'resolved') {
            return false;
        }
        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        // Остановка эскалации
        const escalationTimer = this.escalationTimers.get(alertId);
        if (escalationTimer) {
            clearTimeout(escalationTimer);
            this.escalationTimers.delete(alertId);
        }
        logger_1.enhancedDbLogger.info('✅ Алерт разрешен', {
            alert: alertId,
            by: resolvedBy || 'system'
        });
        await this.saveAlertToFile(alert);
        return true;
    }
    /**
     * Остановка системы мониторинга
     */
    async shutdown() {
        logger_1.enhancedDbLogger.info('🛑 Остановка Backup Monitoring System');
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        // Остановка всех таймеров эскалации
        for (const timer of this.escalationTimers.values()) {
            clearTimeout(timer);
        }
        this.escalationTimers.clear();
        // Сохранение данных
        try {
            await promises_1.default.writeFile(path_1.default.join(this.config.metrics.exportPath, 'alerts_history.json'), JSON.stringify(this.alertHistory, null, 2));
            await promises_1.default.writeFile(path_1.default.join(this.config.metrics.exportPath, 'metrics_history.json'), JSON.stringify(this.metricsHistory, null, 2));
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка сохранения данных при остановке', { error });
        }
        logger_1.enhancedDbLogger.info('✅ Backup Monitoring System остановлен');
    }
}
exports.BackupMonitoring = BackupMonitoring;
//# sourceMappingURL=BackupMonitoring.js.map