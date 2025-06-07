"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertManager = void 0;
const events_1 = require("events");
const logger_1 = require("../logger");
/**
 * Менеджер алертов для crypto-mixer
 * Обрабатывает создание, управление и отправку алертов
 */
class AlertManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.isRunning = false;
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.alertRules = new Map();
        this.throttleCounters = new Map();
        this.escalationTimers = new Map();
        this.config = this.buildConfig(config);
        this.initializeRules();
    }
    /**
     * Создание полной конфигурации с дефолтными значениями
     */
    buildConfig(partialConfig) {
        return {
            enabled: process.env.ALERTING_ENABLED === 'true',
            maxActiveAlerts: parseInt(process.env.MAX_ACTIVE_ALERTS || '1000'),
            alertRetentionDays: parseInt(process.env.ALERT_RETENTION_DAYS || '30'),
            defaultSeverity: process.env.DEFAULT_ALERT_SEVERITY || 'medium',
            globalThrottle: {
                enabled: process.env.GLOBAL_THROTTLE_ENABLED === 'true',
                interval: parseInt(process.env.GLOBAL_THROTTLE_INTERVAL || '300'), // 5 минут
                maxAlerts: parseInt(process.env.GLOBAL_THROTTLE_MAX_ALERTS || '50')
            },
            channels: this.getDefaultChannels(),
            rules: this.getDefaultRules(),
            ...partialConfig
        };
    }
    /**
     * Получение дефолтных каналов уведомлений
     */
    getDefaultChannels() {
        return [
            {
                type: 'webhook',
                enabled: !!process.env.ALERT_WEBHOOK_URL,
                config: {
                    url: process.env.ALERT_WEBHOOK_URL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': process.env.ALERT_WEBHOOK_TOKEN ? `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` : undefined
                    }
                },
                retries: 3,
                timeout: 10000
            },
            {
                type: 'email',
                enabled: !!process.env.SMTP_HOST,
                config: {
                    smtp: {
                        host: process.env.SMTP_HOST,
                        port: parseInt(process.env.SMTP_PORT || '587'),
                        secure: process.env.SMTP_SECURE === 'true',
                        auth: {
                            user: process.env.SMTP_USER,
                            pass: process.env.SMTP_PASS
                        }
                    },
                    from: process.env.ALERT_FROM_EMAIL || 'alerts@crypto-mixer.local',
                    recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || []
                },
                retries: 2,
                timeout: 15000
            },
            {
                type: 'slack',
                enabled: !!process.env.SLACK_WEBHOOK_URL,
                config: {
                    webhookUrl: process.env.SLACK_WEBHOOK_URL,
                    channel: process.env.SLACK_CHANNEL || '#alerts',
                    username: process.env.SLACK_USERNAME || 'Crypto Mixer Bot',
                    iconEmoji: process.env.SLACK_ICON || ':warning:'
                },
                retries: 3,
                timeout: 10000
            }
        ];
    }
    /**
     * Получение дефолтных правил алертинга
     */
    getDefaultRules() {
        return [
            {
                id: 'high_cpu_usage',
                name: 'High CPU Usage',
                enabled: true,
                type: 'performance',
                severity: 'high',
                condition: {
                    metric: 'cpu_usage',
                    operator: 'gt',
                    threshold: 80,
                    duration: 300, // 5 минут
                    aggregation: 'avg'
                },
                throttle: {
                    enabled: true,
                    interval: 600, // 10 минут
                    maxAlerts: 3
                },
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            level: 1,
                            delayMinutes: 5,
                            channels: ['slack'],
                            recipients: ['ops-team']
                        },
                        {
                            level: 2,
                            delayMinutes: 15,
                            channels: ['email', 'slack'],
                            recipients: ['ops-team', 'dev-team']
                        }
                    ]
                },
                notification: {
                    channels: ['slack'],
                    suppressDuplicates: true,
                    quietHours: {
                        enabled: false,
                        start: '22:00',
                        end: '08:00',
                        timezone: 'UTC'
                    }
                },
                tags: ['performance', 'cpu', 'system']
            },
            {
                id: 'high_memory_usage',
                name: 'High Memory Usage',
                enabled: true,
                type: 'performance',
                severity: 'high',
                condition: {
                    metric: 'memory_usage',
                    operator: 'gt',
                    threshold: 85,
                    duration: 300
                },
                throttle: {
                    enabled: true,
                    interval: 600,
                    maxAlerts: 3
                },
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            level: 1,
                            delayMinutes: 5,
                            channels: ['slack'],
                            recipients: ['ops-team']
                        }
                    ]
                },
                notification: {
                    channels: ['slack'],
                    suppressDuplicates: true
                },
                tags: ['performance', 'memory', 'system']
            },
            {
                id: 'service_down',
                name: 'Service Down',
                enabled: true,
                type: 'health_status',
                severity: 'critical',
                condition: {
                    metric: 'service_status',
                    operator: 'eq',
                    threshold: 'down',
                    duration: 60 // 1 минута
                },
                throttle: {
                    enabled: true,
                    interval: 300,
                    maxAlerts: 5
                },
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            level: 1,
                            delayMinutes: 0, // Немедленно
                            channels: ['slack', 'webhook'],
                            recipients: ['ops-team']
                        },
                        {
                            level: 2,
                            delayMinutes: 5,
                            channels: ['email', 'slack'],
                            recipients: ['ops-team', 'dev-team', 'management']
                        }
                    ]
                },
                notification: {
                    channels: ['slack', 'webhook'],
                    suppressDuplicates: false
                },
                tags: ['health', 'service', 'critical']
            },
            {
                id: 'mixing_failure_rate',
                name: 'High Mixing Failure Rate',
                enabled: true,
                type: 'business',
                severity: 'high',
                condition: {
                    metric: 'mixing_success_rate',
                    operator: 'lt',
                    threshold: 95,
                    duration: 600 // 10 минут
                },
                throttle: {
                    enabled: true,
                    interval: 900, // 15 минут
                    maxAlerts: 2
                },
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            level: 1,
                            delayMinutes: 10,
                            channels: ['slack'],
                            recipients: ['dev-team']
                        }
                    ]
                },
                notification: {
                    channels: ['slack'],
                    suppressDuplicates: true
                },
                tags: ['business', 'mixing', 'failure']
            },
            {
                id: 'security_alert',
                name: 'Security Alert',
                enabled: true,
                type: 'security',
                severity: 'critical',
                condition: {
                    metric: 'security_alerts_active',
                    operator: 'gt',
                    threshold: 0,
                    duration: 0 // Немедленно
                },
                throttle: {
                    enabled: false,
                    interval: 0,
                    maxAlerts: 0
                },
                escalation: {
                    enabled: true,
                    levels: [
                        {
                            level: 1,
                            delayMinutes: 0,
                            channels: ['webhook', 'email', 'slack'],
                            recipients: ['security-team', 'ops-team', 'management']
                        }
                    ]
                },
                notification: {
                    channels: ['webhook', 'email', 'slack'],
                    suppressDuplicates: false
                },
                tags: ['security', 'critical', 'urgent']
            }
        ];
    }
    /**
     * Инициализация правил алертинга
     */
    initializeRules() {
        this.config.rules.forEach(rule => {
            this.alertRules.set(rule.id, rule);
        });
    }
    /**
     * Запуск Alert Manager
     */
    async start() {
        if (this.isRunning) {
            logger_1.enhancedDbLogger.warn('⚠️ Alert Manager уже запущен');
            return;
        }
        if (!this.config.enabled) {
            logger_1.enhancedDbLogger.info('🚨 Alert Manager отключен в конфигурации');
            return;
        }
        const operationId = await logger_1.enhancedDbLogger.startOperation('alert_manager_start');
        try {
            logger_1.enhancedDbLogger.info('🚨 Запуск Alert Manager', {
                maxActiveAlerts: this.config.maxActiveAlerts,
                rulesCount: this.alertRules.size,
                channelsCount: this.config.channels.filter(c => c.enabled).length
            });
            // Очистка старых алертов
            this.cleanupOldAlerts();
            // Запуск периодической очистки
            setInterval(() => {
                this.cleanupOldAlerts();
                this.resetThrottleCounters();
            }, 3600000); // Каждый час
            this.isRunning = true;
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Alert Manager запущен успешно');
            this.emit('started', {
                timestamp: new Date(),
                rulesLoaded: this.alertRules.size,
                channelsConfigured: this.config.channels.filter(c => c.enabled).length
            });
        }
        catch (error) {
            this.isRunning = false;
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
    }
    /**
     * Остановка Alert Manager
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        logger_1.enhancedDbLogger.info('🛑 Остановка Alert Manager');
        // Отмена всех таймеров эскалации
        this.escalationTimers.forEach((timer) => {
            clearTimeout(timer);
        });
        this.escalationTimers.clear();
        this.isRunning = false;
        logger_1.enhancedDbLogger.info('✅ Alert Manager остановлен');
        this.emit('stopped', {
            timestamp: new Date()
        });
    }
    /**
     * Создание нового алерта
     */
    async createAlert(type, severity, title, description, source, metadata = {}) {
        const alertId = this.generateAlertId();
        const alert = {
            id: alertId,
            type,
            severity,
            status: 'triggered',
            title,
            description,
            source,
            metadata,
            timestamp: new Date(),
            escalationLevel: 0,
            tags: []
        };
        // Проверка лимита активных алертов
        if (this.activeAlerts.size >= this.config.maxActiveAlerts) {
            logger_1.enhancedDbLogger.warn('⚠️ Достигнут лимит активных алертов', {
                current: this.activeAlerts.size,
                max: this.config.maxActiveAlerts
            });
            return alert;
        }
        // Добавление в активные алерты
        this.activeAlerts.set(alertId, alert);
        this.alertHistory.push({ ...alert });
        logger_1.enhancedDbLogger.info('🚨 Создан новый алерт', {
            id: alertId,
            type,
            severity,
            title,
            source
        });
        // Отправка уведомлений
        await this.processAlert(alert);
        this.emit('alert_created', alert);
        return alert;
    }
    /**
     * Обработка алерта и отправка уведомлений
     */
    async processAlert(alert) {
        try {
            // Найти подходящие правила
            const matchingRules = this.findMatchingRules(alert);
            for (const rule of matchingRules) {
                // Проверка throttling
                if (!this.checkThrottle(rule, alert)) {
                    logger_1.enhancedDbLogger.debug('🚨 Алерт заблокирован throttling', {
                        alertId: alert.id,
                        ruleId: rule.id
                    });
                    continue;
                }
                // Проверка quiet hours
                if (this.isQuietHours(rule)) {
                    logger_1.enhancedDbLogger.debug('🚨 Алерт отложен из-за quiet hours', {
                        alertId: alert.id,
                        ruleId: rule.id
                    });
                    continue;
                }
                // Отправка уведомлений
                await this.sendNotifications(alert, rule);
                // Настройка эскалации
                if (rule.escalation.enabled) {
                    this.setupEscalation(alert, rule);
                }
                // Обновление счетчиков throttling
                this.updateThrottleCounter(rule);
            }
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка обработки алерта', {
                alertId: alert.id,
                error
            });
        }
    }
    /**
     * Поиск правил, соответствующих алерту
     */
    findMatchingRules(alert) {
        const matchingRules = [];
        this.alertRules.forEach(rule => {
            if (!rule.enabled) {
                return;
            }
            // Проверка типа
            if (rule.type === alert.type) {
                matchingRules.push(rule);
            }
        });
        return matchingRules;
    }
    /**
     * Проверка throttling
     */
    checkThrottle(rule, alert) {
        if (!rule.throttle.enabled) {
            return true;
        }
        const throttleKey = `${rule.id}_${alert.type}`;
        const now = Date.now();
        const counter = this.throttleCounters.get(throttleKey);
        if (!counter || now > counter.resetTime) {
            // Создаем новый счетчик
            this.throttleCounters.set(throttleKey, {
                count: 1,
                resetTime: now + (rule.throttle.interval * 1000)
            });
            return true;
        }
        if (counter.count >= rule.throttle.maxAlerts) {
            return false;
        }
        return true;
    }
    /**
     * Проверка quiet hours
     */
    isQuietHours(rule) {
        if (!rule.notification.quietHours?.enabled) {
            return false;
        }
        const now = new Date();
        const timezone = rule.notification.quietHours.timezone || 'UTC';
        // Простая проверка времени (в реальном проекте лучше использовать библиотеку типа moment-timezone)
        const currentHour = now.getUTCHours();
        const startHour = parseInt(rule.notification.quietHours.start.split(':')[0]);
        const endHour = parseInt(rule.notification.quietHours.end.split(':')[0]);
        if (startHour <= endHour) {
            return currentHour >= startHour && currentHour < endHour;
        }
        else {
            return currentHour >= startHour || currentHour < endHour;
        }
    }
    /**
     * Отправка уведомлений
     */
    async sendNotifications(alert, rule) {
        const enabledChannels = this.config.channels.filter(channel => channel.enabled && rule.notification.channels.includes(channel.type));
        const notificationPromises = enabledChannels.map(channel => this.sendNotificationToChannel(alert, channel));
        await Promise.allSettled(notificationPromises);
    }
    /**
     * Отправка уведомления в конкретный канал
     */
    async sendNotificationToChannel(alert, channel) {
        try {
            logger_1.enhancedDbLogger.debug('📤 Отправка уведомления', {
                alertId: alert.id,
                channel: channel.type
            });
            switch (channel.type) {
                case 'webhook':
                    await this.sendWebhookNotification(alert, channel);
                    break;
                case 'email':
                    await this.sendEmailNotification(alert, channel);
                    break;
                case 'slack':
                    await this.sendSlackNotification(alert, channel);
                    break;
                default:
                    logger_1.enhancedDbLogger.warn('⚠️ Неподдерживаемый тип канала', {
                        type: channel.type
                    });
            }
            logger_1.enhancedDbLogger.info('✅ Уведомление отправлено', {
                alertId: alert.id,
                channel: channel.type
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка отправки уведомления', {
                alertId: alert.id,
                channel: channel.type,
                error
            });
        }
    }
    /**
     * Отправка webhook уведомления
     */
    async sendWebhookNotification(alert, channel) {
        const payload = {
            alert: {
                id: alert.id,
                type: alert.type,
                severity: alert.severity,
                status: alert.status,
                title: alert.title,
                description: alert.description,
                source: alert.source,
                timestamp: alert.timestamp.toISOString(),
                metadata: alert.metadata
            },
            timestamp: new Date().toISOString(),
            system: 'crypto-mixer-alerts'
        };
        // Здесь будет HTTP запрос к webhook URL
        logger_1.enhancedDbLogger.debug('📤 Webhook payload', { payload });
    }
    /**
     * Отправка email уведомления
     */
    async sendEmailNotification(alert, channel) {
        const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
        const body = this.formatEmailBody(alert);
        // Здесь будет отправка email через SMTP
        logger_1.enhancedDbLogger.debug('📧 Email notification', {
            subject,
            recipients: channel.config.recipients
        });
    }
    /**
     * Отправка Slack уведомления
     */
    async sendSlackNotification(alert, channel) {
        const message = this.formatSlackMessage(alert);
        // Здесь будет отправка в Slack через webhook
        logger_1.enhancedDbLogger.debug('💬 Slack notification', { message });
    }
    /**
     * Форматирование email тела
     */
    formatEmailBody(alert) {
        return `
Alert Details:
- ID: ${alert.id}
- Type: ${alert.type}
- Severity: ${alert.severity}
- Status: ${alert.status}
- Source: ${alert.source}
- Time: ${alert.timestamp.toISOString()}

Description:
${alert.description}

Metadata:
${JSON.stringify(alert.metadata, null, 2)}

---
Crypto Mixer Alert System
    `.trim();
    }
    /**
     * Форматирование Slack сообщения
     */
    formatSlackMessage(alert) {
        const severityEmoji = {
            low: '🟡',
            medium: '🟠',
            high: '🔴',
            critical: '🚨'
        };
        return {
            text: `${severityEmoji[alert.severity]} *${alert.title}*`,
            attachments: [
                {
                    color: this.getSeverityColor(alert.severity),
                    fields: [
                        {
                            title: 'Type',
                            value: alert.type,
                            short: true
                        },
                        {
                            title: 'Severity',
                            value: alert.severity,
                            short: true
                        },
                        {
                            title: 'Source',
                            value: alert.source,
                            short: true
                        },
                        {
                            title: 'Time',
                            value: alert.timestamp.toISOString(),
                            short: true
                        },
                        {
                            title: 'Description',
                            value: alert.description,
                            short: false
                        }
                    ]
                }
            ]
        };
    }
    /**
     * Получение цвета для уровня важности
     */
    getSeverityColor(severity) {
        const colors = {
            low: '#36a64f',
            medium: '#ff9500',
            high: '#ff0000',
            critical: '#8b0000'
        };
        return colors[severity];
    }
    /**
     * Настройка эскалации
     */
    setupEscalation(alert, rule) {
        rule.escalation.levels.forEach(level => {
            const delay = level.delayMinutes * 60 * 1000; // Конвертация в миллисекунды
            const timer = setTimeout(async () => {
                await this.escalateAlert(alert, level);
            }, delay);
            this.escalationTimers.set(`${alert.id}_${level.level}`, timer);
        });
    }
    /**
     * Эскалация алерта
     */
    async escalateAlert(alert, level) {
        try {
            // Проверяем, что алерт все еще активен
            if (!this.activeAlerts.has(alert.id)) {
                return;
            }
            alert.escalationLevel = level.level;
            logger_1.enhancedDbLogger.warn('📈 Эскалация алерта', {
                alertId: alert.id,
                level: level.level,
                recipients: level.recipients
            });
            // Отправка уведомлений на следующий уровень эскалации
            const channels = this.config.channels.filter(channel => channel.enabled && level.channels.includes(channel.type));
            for (const channel of channels) {
                await this.sendNotificationToChannel(alert, channel);
            }
            this.emit('alert_escalated', {
                alert,
                level: level.level
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка эскалации алерта', {
                alertId: alert.id,
                level: level.level,
                error
            });
        }
    }
    /**
     * Обновление счетчика throttling
     */
    updateThrottleCounter(rule) {
        if (!rule.throttle.enabled) {
            return;
        }
        const throttleKey = `${rule.id}_${rule.type}`;
        const counter = this.throttleCounters.get(throttleKey);
        if (counter) {
            counter.count++;
        }
    }
    /**
     * Сброс счетчиков throttling
     */
    resetThrottleCounters() {
        const now = Date.now();
        this.throttleCounters.forEach((counter, key) => {
            if (now > counter.resetTime) {
                this.throttleCounters.delete(key);
            }
        });
    }
    /**
     * Подтверждение алерта
     */
    async acknowledgeAlert(alertId, acknowledgedBy) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            return false;
        }
        alert.status = 'acknowledged';
        alert.acknowledgedAt = new Date();
        alert.acknowledgedBy = acknowledgedBy;
        // Отмена эскалации
        this.cancelEscalation(alertId);
        logger_1.enhancedDbLogger.info('✅ Алерт подтвержден', {
            alertId,
            acknowledgedBy
        });
        this.emit('alert_acknowledged', alert);
        return true;
    }
    /**
     * Разрешение алерта
     */
    async resolveAlert(alertId) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            return false;
        }
        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        // Удаляем из активных алертов
        this.activeAlerts.delete(alertId);
        // Отмена эскалации
        this.cancelEscalation(alertId);
        logger_1.enhancedDbLogger.info('✅ Алерт разрешен', {
            alertId
        });
        this.emit('alert_resolved', alert);
        return true;
    }
    /**
     * Отмена эскалации
     */
    cancelEscalation(alertId) {
        this.escalationTimers.forEach((timer, key) => {
            if (key.startsWith(alertId)) {
                clearTimeout(timer);
                this.escalationTimers.delete(key);
            }
        });
    }
    /**
     * Очистка старых алертов
     */
    cleanupOldAlerts() {
        const retentionTime = this.config.alertRetentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = new Date(Date.now() - retentionTime);
        this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoffTime);
        logger_1.enhancedDbLogger.debug('🧹 Очистка старых алертов', {
            remaining: this.alertHistory.length,
            cutoffTime: cutoffTime.toISOString()
        });
    }
    /**
     * Генерация ID алерта
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Получение активных алертов
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    /**
     * Получение истории алертов
     */
    getAlertHistory() {
        return [...this.alertHistory];
    }
    /**
     * Получение статистики алертов
     */
    getAlertStatistics() {
        const activeAlerts = this.getActiveAlerts();
        const severityDistribution = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
        };
        const typeDistribution = {
            performance: 0,
            health_status: 0,
            service: 0,
            security: 0,
            business: 0
        };
        activeAlerts.forEach(alert => {
            severityDistribution[alert.severity]++;
            typeDistribution[alert.type]++;
        });
        return {
            activeCount: activeAlerts.length,
            totalCount: this.alertHistory.length,
            severityDistribution,
            typeDistribution
        };
    }
    /**
     * Получение статуса работы
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
        // Переинициализация правил
        if (newConfig.rules) {
            this.alertRules.clear();
            this.initializeRules();
        }
        logger_1.enhancedDbLogger.info('🚨 Конфигурация Alert Manager обновлена', newConfig);
    }
}
exports.AlertManager = AlertManager;
exports.default = AlertManager;
//# sourceMappingURL=AlertManager.js.map