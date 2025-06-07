import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mixRoutes from './api/routes/mixRoutes';
import BackendHealthChecker, { setGlobalDatabaseManager } from './utils/monitoring/BackendHealthChecker';
import { HealthCheckUtils } from './utils/monitoring/interfaces/HealthCheckInterface';
import { enhancedDbLogger } from './utils/logger';
import { MonitoringSystem } from './utils/monitoring/MonitoringSystem';
import { DatabaseManager } from './database/DatabaseManager';
import { SecurityMiddleware } from './api/middleware/securityMiddleware';
import { SecurityMonitoring, defaultSecurityMonitoringConfig } from './api/middleware/securityMonitoring';

dotenv.config();

const app: Express = express();
const healthChecker = BackendHealthChecker.getInstance();
let monitoringSystem: MonitoringSystem | null = null;
let dbManager: DatabaseManager | null = null;
let securityMiddleware: SecurityMiddleware | null = null;
let securityMonitoring: SecurityMonitoring | null = null;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

// RUSSIAN: Система безопасности - применяется до всех остальных middleware
// Будет инициализирована в startServer()

// Мониторинг производительности запросов
app.use((req: Request, res: Response, next: NextFunction) => {
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
            enhancedDbLogger.warn('🐌 Медленный запрос', {
                method: req.method,
                url: req.url,
                responseTime: `${responseTime}ms`,
                statusCode: res.statusCode
            });
        }
    });
    
    next();
});

app.use(morgan('combined'));

// Health Check endpoints
app.get('/health', HealthCheckUtils.createHealthEndpoint(healthChecker));

// Detailed health check с дополнительной информацией
app.get('/health/detailed', async (_req: Request, res: Response) => {
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
    } catch (error) {
        enhancedDbLogger.error('❌ Detailed health check failed', { error });
        res.status(500).json({
            status: 'critical',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });
    }
});

// Быстрая проверка готовности (для load balancer)
app.get('/ready', async (_req: Request, res: Response) => {
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
        } else {
            res.status(503).json({
                status: 'not_ready',
                error: 'Database not available',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(503).json({
            status: 'not_ready',
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Проверка "живости" (для restart policies)
app.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Метрики для мониторинга
app.get('/metrics', async (_req: Request, res: Response) => {
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
        } else {
            res.status(503).json({ error: 'Monitoring system not available' });
        }
    } catch (error) {
        enhancedDbLogger.error('❌ Metrics endpoint failed', { error });
        res.status(500).json({ error: 'Failed to generate metrics' });
    }
});

// RUSSIAN: Эндпоинты безопасности
app.get('/api/v1/security/status', async (_req: Request, res: Response): Promise<void> => {
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
    } catch (error) {
        enhancedDbLogger.error('❌ Security status endpoint failed', { error });
        res.status(500).json({ error: 'Failed to get security status' });
    }
});

app.get('/api/v1/security/alerts', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!securityMonitoring) {
            res.status(503).json({ error: 'Security monitoring not initialized' });
            return;
        }

        const activeOnly = req.query.active === 'true';
        const limit = parseInt(req.query.limit as string) || 100;

        let alerts;
        if (activeOnly) {
            alerts = securityMonitoring.getActiveAlerts();
        } else {
            alerts = securityMonitoring.getAlertHistory(limit);
        }

        res.json({
            alerts,
            count: alerts.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        enhancedDbLogger.error('❌ Security alerts endpoint failed', { error });
        res.status(500).json({ error: 'Failed to get security alerts' });
    }
});

app.post('/api/v1/security/alerts/:alertId/acknowledge', async (req: Request, res: Response): Promise<void> => {
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
        } else {
            res.status(404).json({ error: 'Alert not found' });
        }
    } catch (error) {
        enhancedDbLogger.error('❌ Alert acknowledge endpoint failed', { error });
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

app.post('/api/v1/security/alerts/:alertId/resolve', async (req: Request, res: Response): Promise<void> => {
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
        } else {
            res.status(404).json({ error: 'Alert not found' });
        }
    } catch (error) {
        enhancedDbLogger.error('❌ Alert resolve endpoint failed', { error });
        res.status(500).json({ error: 'Failed to resolve alert' });
    }
});

app.post('/api/v1/security/emergency', async (req: Request, res: Response): Promise<void> => {
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
    } catch (error) {
        enhancedDbLogger.error('❌ Emergency mode endpoint failed', { error });
        res.status(500).json({ error: 'Failed to toggle emergency mode' });
    }
});

app.get('/api/v1/security/reports', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!securityMonitoring) {
            res.status(503).json({ error: 'Security monitoring not initialized' });
            return;
        }

        const type = req.query.type as string;
        const limit = parseInt(req.query.limit as string) || 50;

        const reports = securityMonitoring.getReports(type, limit);
        
        res.json({
            reports,
            count: reports.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        enhancedDbLogger.error('❌ Security reports endpoint failed', { error });
        res.status(500).json({ error: 'Failed to get security reports' });
    }
});

// Routes
app.use('/api/v1/mix', mixRoutes);

// Error handling middleware
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    enhancedDbLogger.error('🚨 Unhandled application error', {
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
app.use((req: Request, res: Response) => {
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
async function initializeSecurity(): Promise<void> {
    try {
        enhancedDbLogger.info('🛡️ Инициализация системы безопасности Backend');
        
        // RUSSIAN: Настройка системы безопасности
        const securityConfig = {
            enabled: process.env.SECURITY_ENABLED !== 'false',
            rateLimiting: {
                global: {
                    windowMs: 15 * 60 * 1000,  // 15 минут
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
                sensitivity: process.env.DDOS_SENSITIVITY as any || 'adaptive',
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
                    model: 'statistical' as const,
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
                    action: (process.env.EMERGENCY_ACTION as 'throttle' | 'lockdown' | 'maintenance') || 'throttle'
                }
            }
        };

        // RUSSIAN: Создание middleware безопасности
        securityMiddleware = new SecurityMiddleware(securityConfig);
        
        // RUSSIAN: Применяем middleware безопасности ко всем маршрутам
        app.use(securityMiddleware.middleware());
        
        // RUSSIAN: Инициализация мониторинга безопасности
        const monitoringConfig = {
            ...defaultSecurityMonitoringConfig,
            enabled: process.env.SECURITY_MONITORING_ENABLED !== 'false',
            alerting: {
                ...defaultSecurityMonitoringConfig.alerting,
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

        securityMonitoring = new SecurityMonitoring(monitoringConfig);
        
        enhancedDbLogger.info('✅ Система безопасности Backend запущена', {
            rateLimiting: securityConfig.rateLimiting.redis.enabled,
            ddosProtection: securityConfig.ddosProtection.enabled,
            monitoring: monitoringConfig.enabled,
            emergencyMode: securityConfig.autoActions.emergencyMode.enabled
        });
        
    } catch (error) {
        enhancedDbLogger.error('❌ Ошибка инициализации системы безопасности', { error });
        // RUSSIAN: Продолжаем работу даже при ошибке безопасности, но логируем критическую ошибку
    }
}

/**
 * Инициализация системы мониторинга
 */
async function initializeMonitoring(): Promise<void> {
    try {
        enhancedDbLogger.info('🚀 Инициализация системы мониторинга Backend');
        
        monitoringSystem = new MonitoringSystem({
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
        enhancedDbLogger.info('✅ Система мониторинга Backend запущена');
        
    } catch (error) {
        enhancedDbLogger.error('❌ Ошибка инициализации мониторинга', { error });
        // Продолжаем работу даже при ошибке мониторинга
    }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
    enhancedDbLogger.info(`🛑 Получен сигнал ${signal}, запуск graceful shutdown`);
    
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
        
        enhancedDbLogger.info('✅ Graceful shutdown завершен');
        process.exit(0);
        
    } catch (error) {
        enhancedDbLogger.error('❌ Ошибка при graceful shutdown', { error });
        process.exit(1);
    }
}

// Обработчики сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработчик необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
    enhancedDbLogger.error('🚨 Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise
    });
});

process.on('uncaughtException', (error) => {
    enhancedDbLogger.error('🚨 Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    
    // Критическая ошибка - завершаем процесс
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

const PORT: number = parseInt(process.env.API_PORT || '5000', 10);

async function startServer(): Promise<void> {
    try {
        // Инициализация базы данных
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'crypto_mixer',
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            dialect: 'postgres' as const,
            ssl: process.env.DB_SSL === 'true'
        };
        
        dbManager = new DatabaseManager(dbConfig);
        await dbManager.initialize();
        
        // Устанавливаем глобальную ссылку для health checker
        setGlobalDatabaseManager(dbManager);
        
        // RUSSIAN: Инициализация системы безопасности (до всех маршрутов)
        await initializeSecurity();
        
        // Инициализация мониторинга
        await initializeMonitoring();
        
        // Запуск сервера
        app.listen(PORT, (): void => {
            enhancedDbLogger.info(`🚀 Backend сервер запущен на порту ${PORT}`, {
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
        
    } catch (error) {
        enhancedDbLogger.error('❌ Ошибка запуска сервера', { error });
        process.exit(1);
    }
}

startServer();
