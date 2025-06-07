"use strict";
/**
 * Пример использования системы алертинга и уведомлений для crypto-mixer
 *
 * Демонстрирует:
 * - Настройку системы мониторинга с алертингом
 * - Создание кастомных алертов
 * - Работу с уведомлениями
 * - Управление алертами
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupFullMonitoringSystem = setupFullMonitoringSystem;
exports.demonstrateCustomAlerts = demonstrateCustomAlerts;
exports.demonstrateAlertManagement = demonstrateAlertManagement;
exports.testNotificationChannels = testNotificationChannels;
exports.simulateEvents = simulateEvents;
const index_1 = require("../index");
const logger_1 = require("../../logger");
/**
 * Пример полной настройки системы мониторинга с алертингом
 */
async function setupFullMonitoringSystem() {
    logger_1.enhancedDbLogger.info('🚀 Настройка полной системы мониторинга с алертингом');
    // Создание системы мониторинга с полной конфигурацией
    const monitoringSystem = new index_1.MonitoringSystem({
        enabled: true,
        // Мониторинг производительности
        performanceMonitoring: {
            enabled: true,
            collectInterval: 30, // Каждые 30 секунд
            retentionPeriod: 3600, // 1 час
            alerting: {
                enabled: true,
                thresholds: {
                    cpu: 80, // 80% CPU
                    memory: 85, // 85% памяти
                    disk: 90, // 90% диска
                    responseTime: 5000, // 5 секунд
                    errorRate: 5 // 5% ошибок
                }
            }
        },
        // Health checks
        healthChecks: {
            enabled: true,
            interval: 60, // Каждую минуту
            timeout: 30, // 30 секунд таймаут
            retries: 3, // 3 попытки
            services: [
                {
                    name: 'postgresql',
                    type: 'database',
                    enabled: true,
                    critical: true
                },
                {
                    name: 'redis',
                    type: 'redis',
                    enabled: true,
                    critical: true,
                    host: 'localhost',
                    port: 6379
                },
                {
                    name: 'mixer-api',
                    type: 'http',
                    enabled: true,
                    critical: true,
                    host: 'localhost',
                    port: 3000,
                    path: '/health'
                }
            ]
        },
        // Prometheus метрики
        prometheus: {
            enabled: true,
            port: 9090,
            path: '/metrics',
            namespace: 'crypto_mixer'
        },
        // Система алертинга
        alerting: {
            enabled: true,
            webhookUrl: process.env.ALERT_WEBHOOK_URL,
            slackChannel: '#crypto-mixer-alerts',
            emailRecipients: ['ops@crypto-mixer.local', 'dev@crypto-mixer.local']
        }
    });
    // Настройка обработчиков событий
    setupEventHandlers(monitoringSystem);
    // Запуск системы
    await monitoringSystem.start();
    return monitoringSystem;
}
/**
 * Настройка обработчиков событий
 */
function setupEventHandlers(monitoringSystem) {
    // Обработка событий системы
    monitoringSystem.on('system_started', (data) => {
        logger_1.enhancedDbLogger.info('✅ Система мониторинга запущена', data);
    });
    monitoringSystem.on('alert_created', (alert) => {
        logger_1.enhancedDbLogger.warn('🚨 Создан новый алерт', {
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title
        });
    });
    monitoringSystem.on('alert_acknowledged', (alert) => {
        logger_1.enhancedDbLogger.info('✅ Алерт подтвержден', {
            id: alert.id,
            acknowledgedBy: alert.acknowledgedBy
        });
    });
    monitoringSystem.on('alert_resolved', (alert) => {
        logger_1.enhancedDbLogger.info('✅ Алерт разрешен', {
            id: alert.id
        });
    });
    monitoringSystem.on('notification_sent', (result) => {
        if (result.success) {
            logger_1.enhancedDbLogger.info('📤 Уведомление отправлено', {
                alertId: result.alertId,
                channel: result.channel,
                responseTime: result.responseTime
            });
        }
        else {
            logger_1.enhancedDbLogger.error('❌ Ошибка отправки уведомления', {
                alertId: result.alertId,
                channel: result.channel,
                error: result.error
            });
        }
    });
}
/**
 * Пример создания кастомных алертов
 */
async function demonstrateCustomAlerts(monitoringSystem) {
    logger_1.enhancedDbLogger.info('📝 Демонстрация кастомных алертов');
    try {
        // Алерт безопасности
        const securityAlert = await monitoringSystem.createCustomAlert('security', 'critical', 'Подозрительная активность обнаружена', 'Обнаружено несколько неудачных попыток входа с одного IP-адреса за короткий период времени', 'security_monitor', {
            ip: '192.168.1.100',
            attempts: 15,
            timeWindow: '5 minutes',
            userAgent: 'curl/7.68.0'
        });
        logger_1.enhancedDbLogger.info('🚨 Создан security алерт', { id: securityAlert.id });
        // Бизнес алерт
        const businessAlert = await monitoringSystem.createCustomAlert('business', 'high', 'Низкий успех операций микширования', 'Успешность операций микширования упала ниже 90% за последние 30 минут', 'mixing_monitor', {
            successRate: 87.3,
            threshold: 90,
            timeWindow: '30 minutes',
            failedOperations: 23
        });
        logger_1.enhancedDbLogger.info('💼 Создан business алерт', { id: businessAlert.id });
        // Алерт производительности
        const performanceAlert = await monitoringSystem.createCustomAlert('performance', 'medium', 'Высокое время ответа API', 'Среднее время ответа API превысило 2 секунды', 'api_monitor', {
            averageResponseTime: 2340,
            threshold: 2000,
            endpoint: '/api/v1/mix',
            requestCount: 156
        });
        logger_1.enhancedDbLogger.info('⚡ Создан performance алерт', { id: performanceAlert.id });
        return [securityAlert, businessAlert, performanceAlert];
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка создания кастомных алертов', { error });
        throw error;
    }
}
/**
 * Пример управления алертами
 */
async function demonstrateAlertManagement(monitoringSystem) {
    logger_1.enhancedDbLogger.info('🎛️ Демонстрация управления алертами');
    try {
        // Создание тестового алерта
        const testAlert = await monitoringSystem.createCustomAlert('service', 'medium', 'Тестовый алерт для демонстрации', 'Этот алерт создан для демонстрации процесса управления алертами', 'demo', { demo: true });
        logger_1.enhancedDbLogger.info('📝 Создан тестовый алерт', { id: testAlert.id });
        // Получение активных алертов
        const activeAlerts = monitoringSystem.getActiveAlerts();
        logger_1.enhancedDbLogger.info('📋 Активные алерты', {
            count: activeAlerts.length,
            alerts: activeAlerts.map(a => ({ id: a.id, title: a.title, severity: a.severity }))
        });
        // Подтверждение алерта
        await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды
        const acknowledged = await monitoringSystem.acknowledgeAlert(testAlert.id, 'demo_user');
        logger_1.enhancedDbLogger.info('✅ Алерт подтвержден', {
            alertId: testAlert.id,
            success: acknowledged
        });
        // Разрешение алерта
        await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем 3 секунды
        const resolved = await monitoringSystem.resolveAlert(testAlert.id);
        logger_1.enhancedDbLogger.info('✅ Алерт разрешен', {
            alertId: testAlert.id,
            success: resolved
        });
        // Получение статистики
        const alertStats = monitoringSystem.getAlertStatistics();
        logger_1.enhancedDbLogger.info('📊 Статистика алертов', alertStats);
        const notificationStats = monitoringSystem.getNotificationStatistics();
        logger_1.enhancedDbLogger.info('📤 Статистика уведомлений', notificationStats);
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка управления алертами', { error });
        throw error;
    }
}
/**
 * Пример тестирования каналов уведомлений
 */
async function testNotificationChannels(monitoringSystem) {
    logger_1.enhancedDbLogger.info('🧪 Тестирование каналов уведомлений');
    const channels = ['webhook', 'slack', 'email'];
    for (const channel of channels) {
        try {
            const result = await monitoringSystem.testNotificationChannel(channel);
            logger_1.enhancedDbLogger.info(`📡 Тест канала ${channel}`, {
                channel,
                success: result
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error(`❌ Ошибка тестирования канала ${channel}`, {
                channel,
                error
            });
        }
    }
}
/**
 * Симуляция различных событий для тестирования алертинга
 */
async function simulateEvents(monitoringSystem) {
    logger_1.enhancedDbLogger.info('🎭 Симуляция событий для тестирования алертинга');
    const events = [
        // Высокая нагрузка CPU
        {
            delay: 5000,
            action: () => monitoringSystem.createCustomAlert('performance', 'high', 'Высокая нагрузка CPU', 'CPU использование достигло 95%', 'system_monitor', { cpu: 95, threshold: 80 })
        },
        // Сервис недоступен
        {
            delay: 10000,
            action: () => monitoringSystem.createCustomAlert('health_status', 'critical', 'Сервис недоступен', 'Redis сервис не отвечает на запросы', 'health_checker', { service: 'redis', consecutiveFailures: 5 })
        },
        // Блокировка подозрительных транзакций
        {
            delay: 15000,
            action: () => monitoringSystem.createCustomAlert('security', 'medium', 'Блокировка подозрительных транзакций', 'Заблокировано 3 подозрительные транзакции за последние 10 минут', 'fraud_detector', { blockedTransactions: 3, riskScore: 7.2 })
        }
    ];
    for (const event of events) {
        setTimeout(async () => {
            try {
                const alert = await event.action();
                logger_1.enhancedDbLogger.info('🎯 Событие симулировано', {
                    alertId: alert.id,
                    title: alert.title
                });
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка симуляции события', { error });
            }
        }, event.delay);
    }
}
/**
 * Основная функция демонстрации
 */
async function main() {
    try {
        logger_1.enhancedDbLogger.info('🚀 Запуск демонстрации системы алертинга');
        // Настройка и запуск системы мониторинга
        const monitoringSystem = await setupFullMonitoringSystem();
        // Ждем инициализации
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Тестирование каналов уведомлений
        await testNotificationChannels(monitoringSystem);
        // Создание кастомных алертов
        await demonstrateCustomAlerts(monitoringSystem);
        // Демонстрация управления алертами
        await demonstrateAlertManagement(monitoringSystem);
        // Симуляция событий
        await simulateEvents(monitoringSystem);
        // Показываем статус системы каждые 30 секунд
        const statusInterval = setInterval(() => {
            const status = monitoringSystem.getSystemStatus();
            logger_1.enhancedDbLogger.info('📊 Статус системы мониторинга', {
                running: status.running,
                components: status.components,
                activeAlerts: status.metrics.activeAlerts,
                prometheusUrl: status.metrics.prometheusUrl
            });
        }, 30000);
        // Graceful shutdown
        process.on('SIGINT', async () => {
            logger_1.enhancedDbLogger.info('🛑 Получен сигнал остановки');
            clearInterval(statusInterval);
            await monitoringSystem.stop();
            process.exit(0);
        });
        logger_1.enhancedDbLogger.info('✅ Демонстрация запущена. Нажмите Ctrl+C для остановки');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка демонстрации', { error });
        process.exit(1);
    }
}
// Запуск демонстрации только если этот файл запущен напрямую
if (require.main === module) {
    main().catch(error => {
        logger_1.enhancedDbLogger.error('❌ Критическая ошибка', { error });
        process.exit(1);
    });
}
//# sourceMappingURL=alerting-example.js.map