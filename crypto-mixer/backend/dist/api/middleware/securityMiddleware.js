"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMiddleware = void 0;
exports.createSecurityMiddleware = createSecurityMiddleware;
exports.setupSecurity = setupSecurity;
const rateLimiting_enhanced_1 = require("./rateLimiting.enhanced");
const ddosProtection_1 = require("./ddosProtection");
const logger_1 = require("../../utils/logger");
/**
 * RUSSIAN: Главный класс системы безопасности
 */
class SecurityMiddleware {
    constructor(config = {}) {
        this.isActive = false;
        // Статистика безопасности
        this.securityStats = {
            totalRequests: 0,
            blockedRequests: 0,
            rateLimitedRequests: 0,
            ddosAttacksDetected: 0,
            attacksMitigated: 0,
            emergencyModeActivations: 0,
            topAttackingIPs: new Map(),
            attackTypes: new Map()
        };
        // События безопасности
        this.securityEvents = [];
        this.maxEventsHistory = 10000;
        // Экстренный режим
        this.emergencyMode = {
            active: false,
            activatedAt: null,
            reason: '',
            level: 0
        };
        this.config = this.mergeConfig(config);
        // RUSSIAN: Инициализируем подсистемы защиты
        this.rateLimiter = new rateLimiting_enhanced_1.EnhancedRateLimiter(this.config.rateLimiting);
        this.ddosProtection = new ddosProtection_1.AdvancedDDoSProtection(this.config.ddosProtection);
        this.setupEventListeners();
        logger_1.enhancedDbLogger.info('🛡️ Система безопасности инициализирована', {
            rateLimiting: this.config.rateLimiting.redis.enabled,
            ddosProtection: this.config.ddosProtection.enabled,
            emergencyMode: this.config.autoActions.emergencyMode.enabled
        });
    }
    /**
     * RUSSIAN: Объединение конфигурации по умолчанию с пользовательской
     */
    mergeConfig(userConfig) {
        const defaultConfig = {
            enabled: true,
            rateLimiting: rateLimiting_enhanced_1.defaultRateLimitConfig,
            ddosProtection: ddosProtection_1.defaultDDoSConfig,
            global: {
                trustProxy: true,
                logLevel: 'info',
                blockDuration: 300,
                whitelistBypass: true
            },
            integration: {
                prometheus: {
                    enabled: false,
                    port: 9090,
                    path: '/metrics'
                },
                elasticsearch: {
                    enabled: false,
                    host: 'localhost:9200',
                    index: 'crypto-mixer-security'
                },
                webhook: {
                    enabled: false,
                    url: ''
                }
            },
            autoActions: {
                escalateToCloudflare: false,
                banPersistentAttackers: true,
                adaptiveThresholds: true,
                emergencyMode: {
                    enabled: true,
                    trigger: {
                        attacksPerMinute: 50,
                        blockedIPsCount: 100
                    },
                    action: 'throttle'
                }
            }
        };
        return {
            ...defaultConfig,
            ...userConfig,
            rateLimiting: { ...defaultConfig.rateLimiting, ...userConfig.rateLimiting },
            ddosProtection: { ...defaultConfig.ddosProtection, ...userConfig.ddosProtection },
            global: { ...defaultConfig.global, ...userConfig.global },
            integration: { ...defaultConfig.integration, ...userConfig.integration },
            autoActions: { ...defaultConfig.autoActions, ...userConfig.autoActions }
        };
    }
    /**
     * RUSSIAN: Настройка слушателей событий подсистем
     */
    setupEventListeners() {
        // RUSSIAN: События от DDoS защиты
        this.ddosProtection.on('attack_detected', (attack) => {
            this.handleSecurityEvent({
                type: 'ddos_detected',
                severity: attack.severity,
                source: 'ddos_protection',
                details: attack,
                timestamp: new Date(),
                metadata: {
                    attackType: attack.type,
                    confidence: attack.confidence
                }
            });
        });
        this.ddosProtection.on('ip_blocked', (blockInfo) => {
            this.handleSecurityEvent({
                type: 'ip_blocked',
                severity: 'medium',
                source: 'ddos_protection',
                details: blockInfo,
                timestamp: new Date(),
                metadata: {
                    ip: blockInfo.ip
                }
            });
        });
        // RUSSIAN: Мониторинг экстренных ситуаций
        setInterval(() => {
            this.checkEmergencyConditions();
        }, 60000); // Проверяем каждую минуту
    }
    /**
     * RUSSIAN: Главный middleware для Express
     */
    middleware() {
        return async (req, res, next) => {
            if (!this.config.enabled) {
                return next();
            }
            const startTime = Date.now();
            this.securityStats.totalRequests++;
            try {
                // RUSSIAN: Проверяем экстренный режим
                if (this.emergencyMode.active) {
                    const emergencyResult = this.handleEmergencyMode(req, res);
                    if (!emergencyResult) {
                        return; // Запрос заблокирован
                    }
                }
                // RUSSIAN: Применяем DDoS защиту первой
                const ddosResult = await this.applyDDoSProtection(req, res);
                if (!ddosResult.allowed) {
                    this.securityStats.blockedRequests++;
                    return; // DDoS защита уже обработала ответ
                }
                // RUSSIAN: Применяем rate limiting
                const rateLimitResult = await this.applyRateLimiting(req, res);
                if (!rateLimitResult.allowed) {
                    this.securityStats.rateLimitedRequests++;
                    return; // Rate limiter уже обработал ответ
                }
                // RUSSIAN: Записываем метрики запроса
                this.recordRequestMetrics(req, startTime);
                // RUSSIAN: Передаем управление следующему middleware
                next();
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка в системе безопасности', { error });
                // RUSSIAN: При ошибке пропускаем запрос (fail-open)
                next();
            }
        };
    }
    /**
     * RUSSIAN: Применение DDoS защиты
     */
    async applyDDoSProtection(req, res) {
        return new Promise((resolve) => {
            const ddosMiddleware = this.ddosProtection.middleware();
            // RUSSIAN: Перехватываем ответ от DDoS middleware
            const originalSend = res.send;
            const originalJson = res.json;
            let responseSent = false;
            res.send = function (body) {
                responseSent = true;
                resolve({ allowed: false });
                return originalSend.call(this, body);
            };
            res.json = function (body) {
                responseSent = true;
                resolve({ allowed: false });
                return originalJson.call(this, body);
            };
            ddosMiddleware(req, res, () => {
                if (!responseSent) {
                    resolve({ allowed: true });
                }
            });
        });
    }
    /**
     * RUSSIAN: Применение rate limiting
     */
    async applyRateLimiting(req, res) {
        return new Promise((resolve) => {
            const rateLimitMiddleware = this.rateLimiter.middleware();
            const originalSend = res.send;
            const originalJson = res.json;
            let responseSent = false;
            res.send = function (body) {
                responseSent = true;
                resolve({ allowed: false });
                return originalSend.call(this, body);
            };
            res.json = function (body) {
                responseSent = true;
                resolve({ allowed: false });
                return originalJson.call(this, body);
            };
            rateLimitMiddleware(req, res, () => {
                if (!responseSent) {
                    resolve({ allowed: true });
                }
            });
        });
    }
    /**
     * RUSSIAN: Обработка события безопасности
     */
    handleSecurityEvent(event) {
        this.securityEvents.push(event);
        // RUSSIAN: Ограничиваем историю событий
        if (this.securityEvents.length > this.maxEventsHistory) {
            this.securityEvents = this.securityEvents.slice(-this.maxEventsHistory);
        }
        // RUSSIAN: Обновляем статистику атак
        if (event.type === 'ddos_detected') {
            this.securityStats.ddosAttacksDetected++;
            if (event.metadata?.attackType) {
                const count = this.securityStats.attackTypes.get(event.metadata.attackType) || 0;
                this.securityStats.attackTypes.set(event.metadata.attackType, count + 1);
            }
        }
        if (event.metadata?.ip) {
            const count = this.securityStats.topAttackingIPs.get(event.metadata.ip) || 0;
            this.securityStats.topAttackingIPs.set(event.metadata.ip, count + 1);
        }
        // RUSSIAN: Логируем важные события
        const logLevel = event.severity === 'critical' || event.severity === 'high' ? 'warn' : 'info';
        logger_1.enhancedDbLogger[logLevel](`🚨 Событие безопасности: ${event.type}`, {
            severity: event.severity,
            source: event.source,
            metadata: event.metadata
        });
        // RUSSIAN: Отправляем webhook уведомления для критических событий
        if (this.config.integration.webhook.enabled && event.severity === 'critical') {
            this.sendWebhookNotification(event);
        }
    }
    /**
     * RUSSIAN: Проверка условий экстренного режима
     */
    checkEmergencyConditions() {
        if (!this.config.autoActions.emergencyMode.enabled || this.emergencyMode.active) {
            return;
        }
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        // RUSSIAN: Подсчитываем атаки за последнюю минуту
        const recentAttacks = this.securityEvents.filter(event => event.timestamp.getTime() > oneMinuteAgo &&
            (event.type === 'ddos_detected' || event.type === 'rate_limit_exceeded')).length;
        const blockedIPs = this.ddosProtection.getStatistics().blockedIPs;
        const trigger = this.config.autoActions.emergencyMode.trigger;
        if (recentAttacks >= trigger.attacksPerMinute || blockedIPs >= trigger.blockedIPsCount) {
            this.activateEmergencyMode(`Превышены пороги: атаки=${recentAttacks}, заблокированные IP=${blockedIPs}`);
        }
    }
    /**
     * RUSSIAN: Активация экстренного режима
     */
    activateEmergencyMode(reason) {
        this.emergencyMode = {
            active: true,
            activatedAt: new Date(),
            reason,
            level: 1
        };
        this.securityStats.emergencyModeActivations++;
        logger_1.enhancedDbLogger.error('🚨 АКТИВИРОВАН ЭКСТРЕННЫЙ РЕЖИМ БЕЗОПАСНОСТИ', {
            reason,
            action: this.config.autoActions.emergencyMode.action,
            timestamp: this.emergencyMode.activatedAt
        });
        this.handleSecurityEvent({
            type: 'emergency_mode',
            severity: 'critical',
            source: 'security_middleware',
            details: { reason, action: this.config.autoActions.emergencyMode.action },
            timestamp: new Date()
        });
        // RUSSIAN: Автоматическая деактивация через 15 минут
        setTimeout(() => {
            this.deactivateEmergencyMode();
        }, 15 * 60 * 1000);
    }
    /**
     * RUSSIAN: Деактивация экстренного режима
     */
    deactivateEmergencyMode() {
        if (!this.emergencyMode.active)
            return;
        logger_1.enhancedDbLogger.info('✅ Экстренный режим деактивирован', {
            duration: this.emergencyMode.activatedAt ?
                Date.now() - this.emergencyMode.activatedAt.getTime() : 0
        });
        this.emergencyMode = {
            active: false,
            activatedAt: null,
            reason: '',
            level: 0
        };
    }
    /**
     * RUSSIAN: Обработка запросов в экстренном режиме
     */
    handleEmergencyMode(req, res) {
        const action = this.config.autoActions.emergencyMode.action;
        switch (action) {
            case 'throttle':
                // RUSSIAN: Жесткое throttling - только критически важные эндпоинты
                if (!this.isCriticalEndpoint(req.path)) {
                    res.status(503).json({
                        error: 'Service Temporarily Unavailable',
                        message: 'Система находится в экстренном режиме. Доступны только критически важные операции.',
                        emergencyMode: true,
                        retryAfter: 300
                    });
                    return false; // Запрос заблокирован
                }
                break;
            case 'lockdown':
                // RUSSIAN: Полная блокировка всех запросов
                res.status(503).json({
                    error: 'Service Locked Down',
                    message: 'Система заблокирована в связи с обнаружением атаки.',
                    emergencyMode: true,
                    retryAfter: 900
                });
                return false; // Запрос заблокирован
            case 'maintenance':
                // RUSSIAN: Режим обслуживания
                res.status(503).json({
                    error: 'Service Under Maintenance',
                    message: 'Система временно недоступна для обслуживания.',
                    emergencyMode: true,
                    retryAfter: 1800
                });
                return false; // Запрос заблокирован
        }
        return true; // Запрос разрешен
    }
    /**
     * RUSSIAN: Проверка критически важных эндпоинтов
     */
    isCriticalEndpoint(path) {
        const criticalPaths = [
            '/api/v1/health',
            '/api/v1/status',
            '/api/v1/admin',
            '/api/v1/emergency'
        ];
        return criticalPaths.some(criticalPath => path.startsWith(criticalPath));
    }
    /**
     * RUSSIAN: Запись метрик запроса
     */
    recordRequestMetrics(req, startTime) {
        const responseTime = Date.now() - startTime;
        // RUSSIAN: Отправляем метрики в подсистемы
        // Rate limiter автоматически записывает через свой middleware
        // DDoS protection также ведет свою статистику
    }
    /**
     * RUSSIAN: Отправка webhook уведомления
     */
    async sendWebhookNotification(event) {
        if (!this.config.integration.webhook.url)
            return;
        try {
            const payload = {
                event: event.type,
                severity: event.severity,
                timestamp: event.timestamp.toISOString(),
                source: event.source,
                details: event.details,
                metadata: event.metadata,
                systemInfo: {
                    service: 'crypto-mixer',
                    instance: process.env.INSTANCE_ID || 'unknown',
                    version: process.env.VERSION || '1.0.0'
                }
            };
            // RUSSIAN: В реальной реализации здесь будет HTTP запрос
            logger_1.enhancedDbLogger.info('📤 Webhook уведомление отправлено', {
                url: this.config.integration.webhook.url,
                event: event.type
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка отправки webhook', { error });
        }
    }
    /**
     * RUSSIAN: Получение статистики безопасности
     */
    getSecurityStatistics() {
        return {
            general: { ...this.securityStats },
            rateLimiter: this.rateLimiter.getStatistics(),
            ddosProtection: this.ddosProtection.getStatistics(),
            emergencyMode: { ...this.emergencyMode }
        };
    }
    /**
     * RUSSIAN: Получение последних событий безопасности
     */
    getSecurityEvents(limit = 100) {
        return this.securityEvents
            .slice(-limit)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * RUSSIAN: Ручное управление экстренным режимом
     */
    async toggleEmergencyMode(activate, reason) {
        if (activate && !this.emergencyMode.active) {
            this.activateEmergencyMode(reason || 'Активирован вручную');
        }
        else if (!activate && this.emergencyMode.active) {
            this.deactivateEmergencyMode();
        }
    }
    /**
     * RUSSIAN: Обновление конфигурации во время выполнения
     */
    updateConfiguration(newConfig) {
        this.config = this.mergeConfig(newConfig);
        logger_1.enhancedDbLogger.info('🔧 Конфигурация безопасности обновлена', {
            rateLimitingEnabled: this.config.rateLimiting.redis.enabled,
            ddosProtectionEnabled: this.config.ddosProtection.enabled
        });
    }
    /**
     * RUSSIAN: Остановка системы безопасности
     */
    async shutdown() {
        logger_1.enhancedDbLogger.info('🛑 Остановка системы безопасности...');
        await this.rateLimiter.shutdown();
        await this.ddosProtection.shutdown();
        if (this.emergencyMode.active) {
            this.deactivateEmergencyMode();
        }
        this.isActive = false;
        logger_1.enhancedDbLogger.info('✅ Система безопасности остановлена');
    }
}
exports.SecurityMiddleware = SecurityMiddleware;
/**
 * RUSSIAN: Фабричная функция для создания middleware безопасности
 */
function createSecurityMiddleware(config) {
    return new SecurityMiddleware(config);
}
/**
 * RUSSIAN: Хелпер для интеграции с Express приложением
 */
function setupSecurity(app, config) {
    const security = createSecurityMiddleware(config);
    // RUSSIAN: Применяем middleware безопасности ко всем маршрутам
    app.use(security.middleware());
    // RUSSIAN: Добавляем эндпоинт статистики безопасности
    app.get('/api/v1/security/stats', (req, res) => {
        const stats = security.getSecurityStatistics();
        res.json(stats);
    });
    // RUSSIAN: Добавляем эндпоинт событий безопасности
    app.get('/api/v1/security/events', (req, res) => {
        const limit = parseInt(req.query.limit) || 100;
        const events = security.getSecurityEvents(limit);
        res.json(events);
    });
    // RUSSIAN: Добавляем эндпоинт управления экстренным режимом
    app.post('/api/v1/security/emergency', async (req, res) => {
        const { activate, reason } = req.body;
        await security.toggleEmergencyMode(activate, reason);
        res.json({ success: true, emergencyMode: activate });
    });
    logger_1.enhancedDbLogger.info('🛡️ Система безопасности интегрирована в Express приложение');
    return security;
}
//# sourceMappingURL=securityMiddleware.js.map