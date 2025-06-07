"use strict";
/**
 * Alert Manager для критических ошибок и мониторинга
 *
 * Обеспечивает:
 * - Интеллектуальные алерты с дедупликацией
 * - Множественные каналы уведомлений (Email, Slack, Webhook, SMS)
 * - Escalation policies для критических событий
 * - Rate limiting и noise reduction
 * - Incident management integration
 * - Health checks и automated recovery
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertManager = exports.AlertChannel = exports.AlertSeverity = void 0;
exports.initializeAlertManager = initializeAlertManager;
exports.getAlertManager = getAlertManager;
exports.sendAlert = sendAlert;
const events_1 = require("events");
const crypto_1 = __importDefault(require("crypto"));
const ErrorTypes_1 = require("../errors/ErrorTypes");
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["INFO"] = "info";
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["CRITICAL"] = "critical";
    AlertSeverity["EMERGENCY"] = "emergency";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
var AlertChannel;
(function (AlertChannel) {
    AlertChannel["EMAIL"] = "email";
    AlertChannel["SLACK"] = "slack";
    AlertChannel["WEBHOOK"] = "webhook";
    AlertChannel["SMS"] = "sms";
    AlertChannel["TELEGRAM"] = "telegram";
    AlertChannel["CONSOLE"] = "console";
})(AlertChannel || (exports.AlertChannel = AlertChannel = {}));
/**
 * Comprehensive Alert Manager
 */
class AlertManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.rules = new Map();
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.channels = new Map();
        this.incidents = new Map();
        this.suppressions = new Map();
        this.rateLimits = new Map();
        this.escalationTimers = new Map();
        this.maxHistorySize = 10000;
        this.maintenanceMode = false;
        this.setupDefaultRules();
        this.startMaintenanceTasks();
    }
    /**
     * Добавляет правило алерта
     */
    addRule(rule) {
        this.rules.set(rule.id, rule);
        this.emit('ruleAdded', rule);
    }
    /**
     * Обновляет правило алерта
     */
    updateRule(ruleId, updates) {
        const rule = this.rules.get(ruleId);
        if (!rule) {
            throw new Error(`Alert rule ${ruleId} не найдено`);
        }
        const updatedRule = { ...rule, ...updates };
        this.rules.set(ruleId, updatedRule);
        this.emit('ruleUpdated', updatedRule);
    }
    /**
     * Удаляет правило алерта
     */
    removeRule(ruleId) {
        const rule = this.rules.get(ruleId);
        if (rule) {
            this.rules.delete(ruleId);
            this.emit('ruleRemoved', rule);
        }
    }
    /**
     * Конфигурирует канал уведомлений
     */
    configureChannel(config) {
        this.channels.set(config.channel, config);
        this.emit('channelConfigured', config);
    }
    /**
     * Обрабатывает ошибку для алертов
     */
    async processError(error, source = 'unknown', additionalContext = {}) {
        if (this.maintenanceMode) {
            return; // Подавляем алерты в режиме обслуживания
        }
        const matchingRules = this.findMatchingRules(error);
        for (const rule of matchingRules) {
            await this.triggerAlert(rule, {
                title: `Ошибка: ${error.message}`,
                message: this.formatErrorMessage(error),
                source,
                context: {
                    error,
                    ...additionalContext
                }
            });
        }
    }
    /**
     * Обрабатывает метрику для алертов
     */
    async processMetric(metricName, value, labels = {}, source = 'metrics') {
        if (this.maintenanceMode)
            return;
        const matchingRules = this.findMetricMatchingRules(metricName, value, labels);
        for (const rule of matchingRules) {
            await this.triggerAlert(rule, {
                title: `Метрика превысила порог: ${metricName}`,
                message: `Метрика ${metricName} = ${value} превысила настроенный порог`,
                source,
                context: {
                    metrics: { [metricName]: value, ...labels }
                }
            });
        }
    }
    /**
     * Создает алерт вручную
     */
    async createAlert(ruleId, title, message, severity, source, context = {}) {
        const rule = this.rules.get(ruleId);
        if (!rule) {
            throw new Error(`Alert rule ${ruleId} не найдено`);
        }
        return this.triggerAlert(rule, {
            title,
            message,
            source,
            context,
            severity
        });
    }
    /**
     * Разрешает алерт
     */
    async resolveAlert(alertId, reason = 'Ручное разрешение') {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            throw new Error(`Alert ${alertId} не найден`);
        }
        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        // Отменяем эскалацию
        const escalationTimer = this.escalationTimers.get(alertId);
        if (escalationTimer) {
            clearTimeout(escalationTimer);
            this.escalationTimers.delete(alertId);
        }
        // Перемещаем в историю
        this.activeAlerts.delete(alertId);
        this.alertHistory.push(alert);
        this.cleanupHistory();
        await this.sendResolutionNotification(alert, reason);
        this.emit('alertResolved', alert);
    }
    /**
     * Подавляет алерты по правилу
     */
    suppressRule(ruleId, durationMinutes, reason) {
        const until = new Date(Date.now() + (durationMinutes * 60 * 1000));
        this.suppressions.set(ruleId, { until, reason });
        this.emit('ruleSuppressed', { ruleId, until, reason });
    }
    /**
     * Включает/выключает режим обслуживания
     */
    setMaintenanceMode(enabled, reason) {
        this.maintenanceMode = enabled;
        this.emit('maintenanceModeChanged', { enabled, reason });
        if (enabled) {
            // Подавляем все активные алерты
            this.activeAlerts.forEach(alert => {
                alert.status = 'suppressed';
                alert.suppressionReason = reason || 'Режим обслуживания';
            });
        }
    }
    /**
     * Создает инцидент из алерта
     */
    createIncident(alertId, title, description, severity = AlertSeverity.CRITICAL) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            throw new Error(`Alert ${alertId} не найден`);
        }
        const incidentId = this.generateId('incident');
        const incident = {
            id: incidentId,
            title,
            description,
            severity,
            status: 'open',
            createdAt: new Date(),
            alerts: [alertId],
            tags: [alert.source, alert.severity]
        };
        this.incidents.set(incidentId, incident);
        this.emit('incidentCreated', incident);
        return incidentId;
    }
    /**
     * Получает активные алерты
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    /**
     * Получает алерты по фильтрам
     */
    getAlerts(filters = {}) {
        let alerts = [...this.alertHistory, ...this.activeAlerts.values()];
        if (filters.severity) {
            alerts = alerts.filter(a => a.severity === filters.severity);
        }
        if (filters.source) {
            alerts = alerts.filter(a => a.source === filters.source);
        }
        if (filters.status) {
            alerts = alerts.filter(a => a.status === filters.status);
        }
        if (filters.timeframe) {
            const cutoff = new Date(Date.now() - (filters.timeframe * 60 * 60 * 1000));
            alerts = alerts.filter(a => a.triggeredAt >= cutoff);
        }
        return alerts.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
    }
    /**
     * Получает статистику алертов
     */
    getAlertStatistics(hoursBack = 24) {
        const cutoff = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
        const recentAlerts = this.getAlerts({ timeframe: hoursBack });
        const stats = {
            total: recentAlerts.length,
            bySeverity: {},
            bySource: {},
            byStatus: {},
            resolution: {
                averageMinutes: 0,
                total: 0
            }
        };
        let totalResolutionTime = 0;
        let resolvedCount = 0;
        recentAlerts.forEach(alert => {
            // By severity
            stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
            // By source
            stats.bySource[alert.source] = (stats.bySource[alert.source] || 0) + 1;
            // By status
            stats.byStatus[alert.status] = (stats.byStatus[alert.status] || 0) + 1;
            // Resolution time
            if (alert.status === 'resolved' && alert.resolvedAt) {
                const resolutionTime = alert.resolvedAt.getTime() - alert.triggeredAt.getTime();
                totalResolutionTime += resolutionTime;
                resolvedCount++;
            }
        });
        if (resolvedCount > 0) {
            stats.resolution.averageMinutes = (totalResolutionTime / resolvedCount) / (1000 * 60);
            stats.resolution.total = resolvedCount;
        }
        return stats;
    }
    /**
     * Тестирует канал уведомлений
     */
    async testChannel(channel, testMessage = 'Тестовое сообщение от Alert Manager') {
        const channelConfig = this.channels.get(channel);
        if (!channelConfig || !channelConfig.enabled) {
            throw new Error(`Канал ${channel} не настроен или отключен`);
        }
        try {
            await this.sendNotification(channel, {
                title: 'Тест канала уведомлений',
                message: testMessage,
                severity: AlertSeverity.INFO
            });
            return true;
        }
        catch (error) {
            this.emit('channelTestFailed', { channel, error });
            return false;
        }
    }
    /**
     * Основной метод создания алерта
     */
    async triggerAlert(rule, alertData) {
        // Проверяем подавление
        if (this.isRuleSuppressed(rule.id)) {
            return '';
        }
        // Проверяем rate limiting
        if (!this.checkRateLimit(rule)) {
            return '';
        }
        // Создаем fingerprint для дедупликации
        const fingerprint = this.createFingerprint(rule, alertData);
        // Проверяем дедупликацию
        const existingAlert = this.findDuplicateAlert(fingerprint);
        if (existingAlert && !this.shouldCreateDuplicate(existingAlert, rule)) {
            return existingAlert.id;
        }
        const alertId = this.generateId('alert');
        const alert = {
            id: alertId,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: alertData.severity || rule.alertSeverity,
            title: alertData.title,
            message: alertData.message,
            source: alertData.source,
            triggeredAt: new Date(),
            status: 'active',
            context: alertData.context,
            deliveryStatus: this.initializeDeliveryStatus(),
            escalationLevel: 0,
            fingerprint
        };
        this.activeAlerts.set(alertId, alert);
        // Отправляем уведомления
        await this.sendAlertNotifications(alert, rule);
        // Настраиваем эскалацию
        this.setupEscalation(alert, rule);
        this.emit('alertTriggered', alert);
        return alertId;
    }
    /**
     * Находит правила, подходящие под ошибку
     */
    findMatchingRules(error) {
        const matchingRules = [];
        this.rules.forEach(rule => {
            if (!rule.enabled)
                return;
            const conditions = rule.conditions;
            // Проверяем severity
            if (conditions.errorSeverity &&
                !conditions.errorSeverity.includes(error.severity)) {
                return;
            }
            // Проверяем error codes
            if (conditions.errorCodes &&
                !conditions.errorCodes.includes(error.code)) {
                return;
            }
            // Проверяем компоненты
            if (conditions.components &&
                !conditions.components.includes(error.context.component)) {
                return;
            }
            // Проверяем операции
            if (conditions.operations &&
                !conditions.operations.includes(error.context.operation)) {
                return;
            }
            matchingRules.push(rule);
        });
        return matchingRules;
    }
    /**
     * Находит правила для метрик
     */
    findMetricMatchingRules(metricName, value, labels) {
        const matchingRules = [];
        this.rules.forEach(rule => {
            if (!rule.enabled || !rule.conditions.metricThresholds)
                return;
            const thresholds = rule.conditions.metricThresholds;
            for (const threshold of thresholds) {
                if (threshold.metric !== metricName)
                    continue;
                let matches = false;
                switch (threshold.operator) {
                    case 'gt':
                        matches = value > threshold.value;
                        break;
                    case 'gte':
                        matches = value >= threshold.value;
                        break;
                    case 'lt':
                        matches = value < threshold.value;
                        break;
                    case 'lte':
                        matches = value <= threshold.value;
                        break;
                    case 'eq':
                        matches = value === threshold.value;
                        break;
                }
                if (matches) {
                    matchingRules.push(rule);
                    break;
                }
            }
        });
        return matchingRules;
    }
    /**
     * Отправляет уведомления о алерте
     */
    async sendAlertNotifications(alert, rule) {
        const promises = rule.channels.map(async (channel) => {
            const channelConfig = this.channels.get(channel);
            if (!channelConfig || !channelConfig.enabled) {
                return;
            }
            try {
                await this.sendNotification(channel, {
                    title: alert.title,
                    message: alert.message,
                    severity: alert.severity,
                    alert
                });
                alert.deliveryStatus[channel].sent = true;
                alert.deliveryStatus[channel].sentAt = new Date();
            }
            catch (error) {
                alert.deliveryStatus[channel].error = error.message;
                alert.deliveryStatus[channel].attempts++;
                this.emit('notificationFailed', { alert, channel, error });
            }
        });
        await Promise.allSettled(promises);
    }
    /**
     * Отправляет уведомление через конкретный канал
     */
    async sendNotification(channel, notification) {
        switch (channel) {
            case AlertChannel.CONSOLE:
                this.sendConsoleNotification(notification);
                break;
            case AlertChannel.EMAIL:
                await this.sendEmailNotification(notification);
                break;
            case AlertChannel.SLACK:
                await this.sendSlackNotification(notification);
                break;
            case AlertChannel.WEBHOOK:
                await this.sendWebhookNotification(notification);
                break;
            default:
                throw new Error(`Канал ${channel} не реализован`);
        }
    }
    /**
     * Отправляет уведомление в консоль
     */
    sendConsoleNotification(notification) {
        const emoji = this.getSeverityEmoji(notification.severity);
        console.log(`\n${emoji} ALERT: ${notification.title}`);
        console.log(`Сообщение: ${notification.message}`);
        console.log(`Серьезность: ${notification.severity}`);
        console.log(`Время: ${new Date().toISOString()}`);
        console.log('─'.repeat(50));
    }
    /**
     * Заглушки для других каналов (нужно реализовать)
     */
    async sendEmailNotification(notification) {
        // TODO: Реализовать email отправку
        console.log('EMAIL уведомление:', notification.title);
    }
    async sendSlackNotification(notification) {
        // TODO: Реализовать Slack отправку
        console.log('SLACK уведомление:', notification.title);
    }
    async sendWebhookNotification(notification) {
        // TODO: Реализовать webhook отправку
        console.log('WEBHOOK уведомление:', notification.title);
    }
    /**
     * Вспомогательные методы
     */
    setupDefaultRules() {
        // Критические ошибки
        this.addRule({
            id: 'critical_errors',
            name: 'Критические ошибки',
            description: 'Алерт для всех критических ошибок системы',
            enabled: true,
            conditions: {
                errorSeverity: [ErrorTypes_1.ErrorSeverity.CRITICAL]
            },
            alertSeverity: AlertSeverity.CRITICAL,
            channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL],
            cooldownMinutes: 5,
            maxAlertsPerHour: 10
        });
        // Ошибки безопасности
        this.addRule({
            id: 'security_violations',
            name: 'Нарушения безопасности',
            description: 'Алерт для нарушений безопасности',
            enabled: true,
            conditions: {
                components: ['security', 'authentication', 'authorization']
            },
            alertSeverity: AlertSeverity.EMERGENCY,
            channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL, AlertChannel.SLACK],
            cooldownMinutes: 0,
            maxAlertsPerHour: 50
        });
    }
    setupEscalation(alert, rule) {
        if (!rule.escalationRules || rule.escalationRules.length === 0)
            return;
        const escalation = rule.escalationRules[0]; // Берем первое правило эскалации
        const timer = setTimeout(async () => {
            if (this.activeAlerts.has(alert.id)) {
                alert.escalationLevel++;
                await this.sendEscalationNotification(alert, escalation);
            }
        }, escalation.afterMinutes * 60 * 1000);
        this.escalationTimers.set(alert.id, timer);
    }
    async sendEscalationNotification(alert, escalation) {
        // Логика эскалации уведомлений
        console.log(`🚨 ЭСКАЛАЦИЯ для алерта ${alert.id}`);
    }
    async sendResolutionNotification(alert, reason) {
        console.log(`✅ РАЗРЕШЕН алерт ${alert.id}: ${reason}`);
    }
    isRuleSuppressed(ruleId) {
        const suppression = this.suppressions.get(ruleId);
        if (!suppression)
            return false;
        if (suppression.until < new Date()) {
            this.suppressions.delete(ruleId);
            return false;
        }
        return true;
    }
    checkRateLimit(rule) {
        const key = `rule_${rule.id}`;
        const now = new Date();
        const hourKey = `${key}_${now.getHours()}`;
        const hourlyLimit = this.rateLimits.get(hourKey);
        if (hourlyLimit && hourlyLimit.count >= rule.maxAlertsPerHour) {
            return false;
        }
        // Обновляем счетчик
        if (!hourlyLimit || hourlyLimit.resetAt < now) {
            this.rateLimits.set(hourKey, {
                count: 1,
                resetAt: new Date(now.getTime() + 60 * 60 * 1000)
            });
        }
        else {
            hourlyLimit.count++;
        }
        return true;
    }
    createFingerprint(rule, alertData) {
        const data = {
            ruleId: rule.id,
            title: alertData.title,
            source: alertData.source
        };
        return crypto_1.default.createHash('md5').update(JSON.stringify(data)).digest('hex');
    }
    findDuplicateAlert(fingerprint) {
        return Array.from(this.activeAlerts.values())
            .find(alert => alert.fingerprint === fingerprint);
    }
    shouldCreateDuplicate(existingAlert, rule) {
        const timeSinceTriggered = Date.now() - existingAlert.triggeredAt.getTime();
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        return timeSinceTriggered > cooldownMs;
    }
    initializeDeliveryStatus() {
        const status = {};
        Object.values(AlertChannel).forEach(channel => {
            status[channel] = {
                sent: false,
                attempts: 0
            };
        });
        return status;
    }
    formatErrorMessage(error) {
        return `
Ошибка: ${error.message}
Код: ${error.code}
Компонент: ${error.context.component}
Операция: ${error.context.operation}
Серьезность: ${error.severity}
Время: ${error.timestamp.toISOString()}
${error.canRecover() ? '🔄 Ошибка восстанавливаемая' : '❌ Ошибка критическая'}
    `.trim();
    }
    getSeverityEmoji(severity) {
        switch (severity) {
            case AlertSeverity.INFO: return 'ℹ️';
            case AlertSeverity.WARNING: return '⚠️';
            case AlertSeverity.CRITICAL: return '🚨';
            case AlertSeverity.EMERGENCY: return '🆘';
            default: return '📢';
        }
    }
    generateId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    cleanupHistory() {
        if (this.alertHistory.length > this.maxHistorySize) {
            this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
        }
    }
    startMaintenanceTasks() {
        // Очистка старых rate limits
        setInterval(() => {
            const now = new Date();
            for (const [key, limit] of this.rateLimits.entries()) {
                if (limit.resetAt < now) {
                    this.rateLimits.delete(key);
                }
            }
        }, 60 * 60 * 1000); // Каждый час
        // Очистка старых подавлений
        setInterval(() => {
            const now = new Date();
            for (const [ruleId, suppression] of this.suppressions.entries()) {
                if (suppression.until < now) {
                    this.suppressions.delete(ruleId);
                }
            }
        }, 10 * 60 * 1000); // Каждые 10 минут
    }
}
exports.AlertManager = AlertManager;
/**
 * Глобальный экземпляр alert manager'а
 */
let globalAlertManager = null;
/**
 * Инициализирует глобальный alert manager
 */
function initializeAlertManager() {
    globalAlertManager = new AlertManager();
    return globalAlertManager;
}
/**
 * Получает глобальный alert manager
 */
function getAlertManager() {
    if (!globalAlertManager) {
        throw new Error('AlertManager не инициализирован. Вызовите initializeAlertManager() сначала.');
    }
    return globalAlertManager;
}
/**
 * Удобная функция для отправки алерта
 */
async function sendAlert(severity, title, message, source = 'manual') {
    const alertManager = getAlertManager();
    // Создаем временное правило для ручного алерта
    const ruleId = `manual_${Date.now()}`;
    alertManager.addRule({
        id: ruleId,
        name: 'Manual Alert',
        description: 'Manually triggered alert',
        enabled: true,
        conditions: {},
        alertSeverity: severity,
        channels: [AlertChannel.CONSOLE],
        cooldownMinutes: 0,
        maxAlertsPerHour: 100
    });
    await alertManager.createAlert(ruleId, title, message, severity, source);
}
//# sourceMappingURL=AlertManager.js.map