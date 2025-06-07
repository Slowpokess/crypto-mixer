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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const mixRoutes_1 = __importDefault(require("./api/routes/mixRoutes"));
const BackendHealthChecker_1 = __importStar(require("./utils/monitoring/BackendHealthChecker"));
const HealthCheckInterface_1 = require("./utils/monitoring/interfaces/HealthCheckInterface");
const logger_1 = require("./utils/logger");
const MonitoringSystem_1 = require("./utils/monitoring/MonitoringSystem");
const DatabaseManager_1 = require("./database/DatabaseManager");
const securityMiddleware_1 = require("./api/middleware/securityMiddleware");
const securityMonitoring_1 = require("./api/middleware/securityMonitoring");
dotenv_1.default.config();
const app = (0, express_1.default)();
const healthChecker = BackendHealthChecker_1.default.getInstance();
let monitoringSystem = null;
let dbManager = null;
let securityMiddleware = null;
let securityMonitoring = null;
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express_1.default.json());
// RUSSIAN: Система безопасности - применяется до всех остальных middleware
// Будет инициализирована в startServer()
// Мониторинг производительности запросов
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const isError = res.statusCode >= 400;
        // Запись метрик
        if (monitoringSystem) {
            monitoringSystem.recordRequest(responseTime, isError);
        }
        // Логирование медленных запросов
        if (responseTime > 2000) {
            logger_1.enhancedDbLogger.warn('🐌 Медленный запрос', {
                method: req.method,
                url: req.url,
                responseTime: `${responseTime}ms`,
                statusCode: res.statusCode
            });
        }
    });
    next();
});
app.use((0, morgan_1.default)('combined'));
// Health Check endpoints
app.get('/health', HealthCheckInterface_1.HealthCheckUtils.createHealthEndpoint(healthChecker));
// Detailed health check с дополнительной информацией
app.get('/health/detailed', async (_req, res) => {
    try {
        const healthStatus = await healthChecker.getHealthStatus();
        const systemStatus = monitoringSystem?.getSystemStatus();
        const detailedStatus = {
            ...healthStatus,
            monitoring: systemStatus,
            systemInfo: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                pid: process.pid,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            }
        };
        const httpStatus = healthStatus.status === 'healthy' ? 200 :
            healthStatus.status === 'warning' ? 200 :
                healthStatus.status === 'critical' ? 503 : 500;
        res.status(httpStatus).json(detailedStatus);
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Detailed health check failed', { error });
        res.status(500).json({
            status: 'critical',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });
    }
});
// Быстрая проверка готовности (для load balancer)
app.get('/ready', async (_req, res) => {
    try {
        // Проверяем только критически важные компоненты через health checker
        const healthStatus = await healthChecker.getHealthStatus();
        const isDatabaseHealthy = healthStatus.details.database?.connected || false;
        if (isDatabaseHealthy) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString(),
                service: 'crypto-mixer-backend'
            });
        }
        else {
            res.status(503).json({
                status: 'not_ready',
                error: 'Database not available',
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        res.status(503).json({
            status: 'not_ready',
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});
// Проверка "живости" (для restart policies)
app.get('/live', (_req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
// Метрики для мониторинга
app.get('/metrics', async (_req, res) => {
    try {
        if (monitoringSystem) {
            const systemStatus = monitoringSystem.getSystemStatus();
            res.set('Content-Type', 'text/plain');
            // Простые метрики в формате Prometheus
            let metrics = '';
            metrics += `# HELP backend_uptime_seconds Total uptime of the backend service\n`;
            metrics += `# TYPE backend_uptime_seconds counter\n`;
            metrics += `backend_uptime_seconds ${process.uptime()}\n`;
            metrics += `# HELP backend_memory_usage_bytes Memory usage in bytes\n`;
            metrics += `# TYPE backend_memory_usage_bytes gauge\n`;
            const memory = process.memoryUsage();
            metrics += `backend_memory_usage_bytes{type="rss"} ${memory.rss}\n`;
            metrics += `backend_memory_usage_bytes{type="heapUsed"} ${memory.heapUsed}\n`;
            metrics += `backend_memory_usage_bytes{type="heapTotal"} ${memory.heapTotal}\n`;
            if (systemStatus.metrics.lastPerformanceSnapshot) {
                const snapshot = systemStatus.metrics.lastPerformanceSnapshot;
                metrics += `# HELP backend_cpu_usage_percent CPU usage percentage\n`;
                metrics += `# TYPE backend_cpu_usage_percent gauge\n`;
                metrics += `backend_cpu_usage_percent ${snapshot.system?.cpu || 0}\n`;
            }
            // RUSSIAN: Добавляем метрики безопасности
            if (securityMiddleware) {
                const securityStats = securityMiddleware.getSecurityStatistics();
                metrics += `# HELP security_total_requests Total number of requests processed by security middleware\n`;
                metrics += `# TYPE security_total_requests counter\n`;
                metrics += `security_total_requests ${securityStats.general.totalRequests}\n`;
                metrics += `# HELP security_blocked_requests Total number of blocked requests\n`;
                metrics += `# TYPE security_blocked_requests counter\n`;
                metrics += `security_blocked_requests ${securityStats.general.blockedRequests}\n`;
                metrics += `# HELP security_active_blocked_ips Current number of blocked IP addresses\n`;
                metrics += `# TYPE security_active_blocked_ips gauge\n`;
                metrics += `security_active_blocked_ips ${securityStats.rateLimiter.activeBlocks}\n`;
                metrics += `# HELP security_ddos_attacks_detected Total number of DDoS attacks detected\n`;
                metrics += `# TYPE security_ddos_attacks_detected counter\n`;
                metrics += `security_ddos_attacks_detected ${securityStats.general.ddosAttacksDetected}\n`;
            }
            res.send(metrics);
        }
        else {
            res.status(503).json({ error: 'Monitoring system not available' });
        }
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Metrics endpoint failed', { error });
        res.status(500).json({ error: 'Failed to generate metrics' });
    }
});
// RUSSIAN: Эндпоинты безопасности
app.get('/api/v1/security/status', async (_req, res) => {
    try {
        if (!securityMiddleware) {
            res.status(503).json({ error: 'Security system not initialized' });
            return;
        }
        const securityStats = securityMiddleware.getSecurityStatistics();
        const securityEvents = securityMiddleware.getSecurityEvents(50);
        res.json({
            status: 'active',
            timestamp: new Date().toISOString(),
            statistics: securityStats,
            recentEvents: securityEvents,
            emergencyMode: securityStats.emergencyMode
        });
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Security status endpoint failed', { error });
        res.status(500).json({ error: 'Failed to get security status' });
    }
});
app.get('/api/v1/security/alerts', async (req, res) => {
    try {
        if (!securityMonitoring) {
            res.status(503).json({ error: 'Security monitoring not initialized' });
            return;
        }
        const activeOnly = req.query.active === 'true';
        const limit = parseInt(req.query.limit) || 100;
        let alerts;
        if (activeOnly) {
            alerts = securityMonitoring.getActiveAlerts();
        }
        else {
            alerts = securityMonitoring.getAlertHistory(limit);
        }
        res.json({
            alerts,
            count: alerts.length,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Security alerts endpoint failed', { error });
        res.status(500).json({ error: 'Failed to get security alerts' });
    }
});
app.post('/api/v1/security/alerts/:alertId/acknowledge', async (req, res) => {
    try {
        if (!securityMonitoring) {
            res.status(503).json({ error: 'Security monitoring not initialized' });
            return;
        }
        const { alertId } = req.params;
        const { assignedTo } = req.body;
        const success = await securityMonitoring.acknowledgeAlert(alertId, assignedTo);
        if (success) {
            res.json({ success: true, message: 'Alert acknowledged' });
        }
        else {
            res.status(404).json({ error: 'Alert not found' });
        }
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Alert acknowledge endpoint failed', { error });
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});
app.post('/api/v1/security/alerts/:alertId/resolve', async (req, res) => {
    try {
        if (!securityMonitoring) {
            res.status(503).json({ error: 'Security monitoring not initialized' });
            return;
        }
        const { alertId } = req.params;
        const { notes } = req.body;
        const success = await securityMonitoring.resolveAlert(alertId, notes);
        if (success) {
            res.json({ success: true, message: 'Alert resolved' });
        }
        else {
            res.status(404).json({ error: 'Alert not found' });
        }
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Alert resolve endpoint failed', { error });
        res.status(500).json({ error: 'Failed to resolve alert' });
    }
});
app.post('/api/v1/security/emergency', async (req, res) => {
    try {
        if (!securityMiddleware) {
            res.status(503).json({ error: 'Security system not initialized' });
            return;
        }
        const { activate, reason } = req.body;
        await securityMiddleware.toggleEmergencyMode(activate, reason);
        res.json({
            success: true,
            emergencyMode: activate,
            reason: reason || 'Manual override',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Emergency mode endpoint failed', { error });
        res.status(500).json({ error: 'Failed to toggle emergency mode' });
    }
});
app.get('/api/v1/security/reports', async (req, res) => {
    try {
        if (!securityMonitoring) {
            res.status(503).json({ error: 'Security monitoring not initialized' });
            return;
        }
        const type = req.query.type;
        const limit = parseInt(req.query.limit) || 50;
        const reports = securityMonitoring.getReports(type, limit);
        res.json({
            reports,
            count: reports.length,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Security reports endpoint failed', { error });
        res.status(500).json({ error: 'Failed to get security reports' });
    }
});
// Routes
app.use('/api/v1/mix', mixRoutes_1.default);
// Error handling middleware
app.use((error, req, res, _next) => {
    logger_1.enhancedDbLogger.error('🚨 Unhandled application error', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url
    });
    // Запись ошибки в мониторинг
    if (monitoringSystem) {
        monitoringSystem.recordRequest(0, true);
    }
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});
/**
 * RUSSIAN: Инициализация системы безопасности
 */
async function initializeSecurity() {
    try {
        logger_1.enhancedDbLogger.info('🛡️ Инициализация системы безопасности Backend');
        // RUSSIAN: Настройка системы безопасности
        const securityConfig = {
            enabled: process.env.SECURITY_ENABLED !== 'false',
            rateLimiting: {
                global: {
                    windowMs: 15 * 60 * 1000, // 15 минут
                    maxRequests: parseInt(process.env.RATE_LIMIT_GLOBAL || '1000'),
                    whitelist: process.env.WHITELIST_IPS?.split(',') || ['127.0.0.1', '::1'],
                    blacklist: process.env.BLACKLIST_IPS?.split(',') || []
                },
                endpoints: {
                    '/api/v1/mix': {
                        windowMs: 10 * 60 * 1000,
                        maxRequests: parseInt(process.env.RATE_LIMIT_MIX || '5')
                    },
                    '/api/v1/auth/login': {
                        windowMs: 15 * 60 * 1000,
                        maxRequests: parseInt(process.env.RATE_LIMIT_LOGIN || '10')
                    }
                },
                user: {
                    windowMs: 15 * 60 * 1000,
                    maxRequests: parseInt(process.env.RATE_LIMIT_USER || '100')
                },
                critical: {
                    windowMs: 60 * 1000,
                    maxRequests: parseInt(process.env.RATE_LIMIT_CRITICAL || '10')
                },
                adaptive: {
                    enabled: true,
                    cpuThreshold: 80,
                    memoryThreshold: 85,
                    throttleFactor: 0.5
                },
                monitoring: {
                    enabled: true,
                    alertThreshold: 90
                },
                redis: {
                    enabled: process.env.REDIS_URL ? true : false,
                    url: process.env.REDIS_URL || 'redis://localhost:6379',
                    keyPrefix: 'crypto_mixer:rate_limit'
                },
                ddosProtection: {
                    enabled: true,
                    suspiciousThreshold: parseInt(process.env.DDOS_SUSPICIOUS_THRESHOLD || '50'),
                    blockDuration: parseInt(process.env.DDOS_BLOCK_DURATION || '300'),
                    patternDetection: true
                }
            },
            ddosProtection: {
                enabled: true,
                sensitivity: process.env.DDOS_SENSITIVITY || 'adaptive',
                thresholds: {
                    requestsPerSecond: parseInt(process.env.DDOS_RPS_THRESHOLD || '100'),
                    requestsPerIP: parseInt(process.env.DDOS_IP_RPS_THRESHOLD || '20'),
                    concurrentConnections: parseInt(process.env.DDOS_CONCURRENT_CONNECTIONS || '1000'),
                    uniqueIPsPerMinute: parseInt(process.env.DDOS_UNIQUE_IPS_THRESHOLD || '500'),
                    errorRate: parseFloat(process.env.DDOS_ERROR_RATE || '10'),
                    payloadSize: parseInt(process.env.DDOS_PAYLOAD_SIZE || '1048576'),
                    requestDuration: parseInt(process.env.DDOS_REQUEST_DURATION || '30000')
                },
                patternDetection: {
                    enabled: true,
                    algorithms: ['entropy', 'statistical'],
                    analysisWindow: 300,
                    minSamples: 100
                },
                attackTypes: {
                    volumetric: true,
                    slowloris: true,
                    httpFlood: true,
                    amplification: false,
                    botnet: true
                },
                mitigation: {
                    autoBlock: true,
                    blockDuration: parseInt(process.env.DDOS_BLOCK_DURATION || '300'),
                    escalation: {
                        enabled: true,
                        levels: [
                            { threshold: 50, action: 'throttle', duration: 60 },
                            { threshold: 100, action: 'block', duration: 300 },
                            { threshold: 200, action: 'alert', duration: 600 }
                        ]
                    }
                },
                machineLearning: {
                    enabled: false,
                    model: 'statistical',
                    trainingPeriod: 24,
                    adaptationRate: 0.1
                },
                reputation: {
                    enabled: false,
                    databases: ['tor', 'proxy'],
                    trustScore: {
                        minScore: 0.5,
                        decayRate: 0.1
                    }
                },
                external: {
                    cloudflare: {
                        enabled: false
                    },
                    fail2ban: {
                        enabled: false,
                        logPath: '/var/log/crypto-mixer/attacks.log'
                    }
                }
            },
            autoActions: {
                escalateToCloudflare: false,
                banPersistentAttackers: true,
                adaptiveThresholds: true,
                emergencyMode: {
                    enabled: process.env.EMERGENCY_MODE_ENABLED === 'true',
                    trigger: {
                        attacksPerMinute: parseInt(process.env.EMERGENCY_ATTACKS_THRESHOLD || '50'),
                        blockedIPsCount: parseInt(process.env.EMERGENCY_BLOCKED_IPS_THRESHOLD || '100')
                    },
                    action: process.env.EMERGENCY_ACTION || 'throttle'
                }
            }
        };
        // RUSSIAN: Создание middleware безопасности
        securityMiddleware = new securityMiddleware_1.SecurityMiddleware(securityConfig);
        // RUSSIAN: Применяем middleware безопасности ко всем маршрутам
        app.use(securityMiddleware.middleware());
        // RUSSIAN: Инициализация мониторинга безопасности
        const monitoringConfig = {
            ...securityMonitoring_1.defaultSecurityMonitoringConfig,
            enabled: process.env.SECURITY_MONITORING_ENABLED !== 'false',
            alerting: {
                ...securityMonitoring_1.defaultSecurityMonitoringConfig.alerting,
                enabled: process.env.SECURITY_ALERTING_ENABLED === 'true',
                channels: {
                    email: {
                        enabled: process.env.SECURITY_EMAIL_ALERTS === 'true',
                        recipients: process.env.SECURITY_EMAIL_RECIPIENTS?.split(',') || []
                    },
                    slack: {
                        enabled: process.env.SECURITY_SLACK_ALERTS === 'true',
                        webhookUrl: process.env.SECURITY_SLACK_WEBHOOK,
                        channel: process.env.SECURITY_SLACK_CHANNEL || '#security-alerts',
                        username: 'CryptoMixer Security'
                    },
                    webhook: {
                        enabled: process.env.SECURITY_WEBHOOK_ALERTS === 'true',
                        url: process.env.SECURITY_WEBHOOK_URL
                    },
                    sms: {
                        enabled: process.env.SECURITY_SMS_ALERTS === 'true',
                        recipients: process.env.SECURITY_SMS_RECIPIENTS?.split(',') || []
                    }
                }
            }
        };
        securityMonitoring = new securityMonitoring_1.SecurityMonitoring(monitoringConfig);
        logger_1.enhancedDbLogger.info('✅ Система безопасности Backend запущена', {
            rateLimiting: securityConfig.rateLimiting.redis.enabled,
            ddosProtection: securityConfig.ddosProtection.enabled,
            monitoring: monitoringConfig.enabled,
            emergencyMode: securityConfig.autoActions.emergencyMode.enabled
        });
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка инициализации системы безопасности', { error });
        // RUSSIAN: Продолжаем работу даже при ошибке безопасности, но логируем критическую ошибку
    }
}
/**
 * Инициализация системы мониторинга
 */
async function initializeMonitoring() {
    try {
        logger_1.enhancedDbLogger.info('🚀 Инициализация системы мониторинга Backend');
        monitoringSystem = new MonitoringSystem_1.MonitoringSystem({
            enabled: process.env.MONITORING_ENABLED !== 'false',
            performanceMonitoring: {
                enabled: true,
                collectInterval: 30,
                retentionPeriod: 3600,
                alerting: {
                    enabled: true,
                    thresholds: {
                        cpu: 80,
                        memory: 85,
                        disk: 90,
                        responseTime: 5000,
                        errorRate: 5
                    }
                }
            },
            healthChecks: {
                enabled: true,
                interval: 60,
                timeout: 30,
                retries: 3,
                services: []
            },
            prometheus: {
                enabled: false, // Используем встроенные метрики
                port: 9090,
                path: '/metrics',
                namespace: 'crypto_mixer_backend'
            },
            alerting: {
                enabled: process.env.ALERTING_ENABLED === 'true',
                webhookUrl: process.env.ALERT_WEBHOOK_URL,
                slackChannel: process.env.SLACK_CHANNEL,
                emailRecipients: process.env.EMAIL_RECIPIENTS?.split(',')
            }
        });
        await monitoringSystem.start();
        logger_1.enhancedDbLogger.info('✅ Система мониторинга Backend запущена');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка инициализации мониторинга', { error });
        // Продолжаем работу даже при ошибке мониторинга
    }
}
/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
    logger_1.enhancedDbLogger.info(`🛑 Получен сигнал ${signal}, запуск graceful shutdown`);
    try {
        // RUSSIAN: Остановка системы безопасности
        if (securityMiddleware) {
            await securityMiddleware.shutdown();
        }
        if (securityMonitoring) {
            await securityMonitoring.shutdown();
        }
        // Остановка мониторинга
        if (monitoringSystem) {
            await monitoringSystem.stop();
        }
        // Очистка health checker
        await healthChecker.cleanup();
        // Закрытие подключения к базе данных
        if (dbManager) {
            await dbManager.close();
        }
        logger_1.enhancedDbLogger.info('✅ Graceful shutdown завершен');
        process.exit(0);
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка при graceful shutdown', { error });
        process.exit(1);
    }
}
// Обработчики сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Обработчик необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
    logger_1.enhancedDbLogger.error('🚨 Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise
    });
});
process.on('uncaughtException', (error) => {
    logger_1.enhancedDbLogger.error('🚨 Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    // Критическая ошибка - завершаем процесс
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
const PORT = parseInt(process.env.API_PORT || '5000', 10);
async function startServer() {
    try {
        // Инициализация базы данных
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'crypto_mixer',
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            dialect: 'postgres',
            ssl: process.env.DB_SSL === 'true'
        };
        dbManager = new DatabaseManager_1.DatabaseManager(dbConfig);
        await dbManager.initialize();
        // Устанавливаем глобальную ссылку для health checker
        (0, BackendHealthChecker_1.setGlobalDatabaseManager)(dbManager);
        // RUSSIAN: Инициализация системы безопасности (до всех маршрутов)
        await initializeSecurity();
        // Инициализация мониторинга
        await initializeMonitoring();
        // Запуск сервера
        app.listen(PORT, () => {
            logger_1.enhancedDbLogger.info(`🚀 Backend сервер запущен на порту ${PORT}`, {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                pid: process.pid,
                security: {
                    enabled: securityMiddleware ? true : false,
                    monitoring: securityMonitoring ? true : false
                }
            });
        });
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка запуска сервера', { error });
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=server.js.map