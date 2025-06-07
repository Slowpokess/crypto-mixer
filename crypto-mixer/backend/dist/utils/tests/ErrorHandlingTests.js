"use strict";
/**
 * Comprehensive Test Suite для Error Handling и Logging систем
 *
 * Тестирует:
 * - Все типы ошибок и их обработку
 * - Retry механизмы и recovery стратегии
 * - Audit logging и целостность логов
 * - Performance monitoring и метрики
 * - Alert system и уведомления
 * - Интеграцию всех компонентов
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandlingTests = void 0;
exports.runErrorHandlingTests = runErrorHandlingTests;
const ErrorHandler_1 = require("../errors/ErrorHandler");
const AuditLogger_1 = require("../logging/AuditLogger");
const PerformanceMonitor_1 = require("../monitoring/PerformanceMonitor");
const AlertManager_1 = require("../alerts/AlertManager");
const ErrorTypes_1 = require("../errors/ErrorTypes");
const winston_1 = __importDefault(require("winston"));
/**
 * Тестовый набор для Error Handling системы
 */
class ErrorHandlingTests {
    constructor() {
        this.testResults = [];
        // Создаем тестовый logger
        this.logger = winston_1.default.createLogger({
            level: 'debug',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.simple()
                })
            ]
        });
    }
    /**
     * Запускает все тесты
     */
    async runAllTests() {
        console.log('🧪 Запуск comprehensive test suite для Error Handling и Logging систем...\n');
        const startTime = Date.now();
        try {
            // Инициализируем все системы
            await this.initializeSystems();
            // Запускаем тесты по категориям
            await this.runErrorTypeTests();
            await this.runErrorHandlerTests();
            await this.runRetryMechanismTests();
            await this.runAuditLoggingTests();
            await this.runPerformanceMonitoringTests();
            await this.runAlertSystemTests();
            await this.runIntegrationTests();
        }
        catch (error) {
            console.error('❌ Критическая ошибка в тестах:', error);
        }
        const totalDuration = Date.now() - startTime;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = this.testResults.filter(r => !r.passed).length;
        // Выводим результаты
        this.printTestResults(totalDuration, passedTests, failedTests);
        return {
            totalTests: this.testResults.length,
            passedTests,
            failedTests,
            duration: totalDuration,
            results: this.testResults
        };
    }
    /**
     * Инициализирует все системы для тестирования
     */
    async initializeSystems() {
        await this.runTest('Инициализация систем', async () => {
            // Инициализируем Error Handler
            (0, ErrorHandler_1.initializeErrorHandler)(this.logger, {
                enabled: true,
                criticalErrorThreshold: 3,
                errorRateThreshold: 10,
                timeWindowMinutes: 5
            });
            // Инициализируем Audit Logger
            (0, AuditLogger_1.initializeAuditLogger)({
                enabled: true,
                encryptLogs: false,
                enableIntegrityCheck: true,
                retentionDays: 30,
                maxFileSize: '10mb',
                maxFiles: 5
            });
            // Инициализируем Performance Monitor
            (0, PerformanceMonitor_1.initializePerformanceMonitor)({
                enabled: true,
                tracingEnabled: true,
                metricsRetentionMinutes: 30,
                samplingRate: 1.0,
                slowOperationThreshold: 100
            });
            // Инициализируем Alert Manager
            (0, AlertManager_1.initializeAlertManager)();
            // Настраиваем канал для тестов
            const alertManager = (0, AlertManager_1.getAlertManager)();
            alertManager.configureChannel({
                channel: AlertManager_1.AlertChannel.CONSOLE,
                enabled: true,
                config: {}
            });
            console.log('✅ Все системы инициализированы для тестирования');
        });
    }
    /**
     * Тестирует различные типы ошибок
     */
    async runErrorTypeTests() {
        console.log('\n📝 Тестирование типов ошибок...');
        await this.runTest('Создание AuthenticationError', async () => {
            const error = new ErrorTypes_1.AuthenticationError('Invalid credentials provided', ErrorTypes_1.ErrorCode.INVALID_CREDENTIALS, { component: 'auth', operation: 'login', userId: 'test123' });
            if (error.severity !== ErrorTypes_1.ErrorSeverity.MEDIUM) {
                throw new Error('Неверная severity для AuthenticationError');
            }
            if (error.category !== ErrorTypes_1.ErrorCategory.AUTHENTICATION) {
                throw new Error('Неверная category для AuthenticationError');
            }
            if (!error.canRecover()) {
                throw new Error('AuthenticationError должна быть восстанавливаемой');
            }
        });
        await this.runTest('Создание DatabaseError', async () => {
            const error = new ErrorTypes_1.DatabaseError('Connection timeout', ErrorTypes_1.ErrorCode.DATABASE_CONNECTION_FAILED, { component: 'database', operation: 'connect' });
            if (error.severity !== ErrorTypes_1.ErrorSeverity.HIGH) {
                throw new Error('Неверная severity для DatabaseError');
            }
            if (!error.canRecover()) {
                throw new Error('DatabaseError должна быть восстанавливаемой');
            }
        });
        await this.runTest('Создание SecurityError', async () => {
            const error = new ErrorTypes_1.SecurityError('Encryption key compromised', ErrorTypes_1.ErrorCode.ENCRYPTION_FAILED, { component: 'security', operation: 'encrypt' });
            if (error.severity !== ErrorTypes_1.ErrorSeverity.CRITICAL) {
                throw new Error('Неверная severity для SecurityError');
            }
            if (error.canRecover()) {
                throw new Error('SecurityError не должна быть восстанавливаемой');
            }
        });
        await this.runTest('Создание кастомной ошибки', async () => {
            const error = new ErrorTypes_1.MixingError('Mixing pool is full', ErrorTypes_1.ErrorCode.MIXING_POOL_FULL, { component: 'mixer', operation: 'joinPool', additionalInfo: { amount: 1000 } }, ErrorTypes_1.ErrorSeverity.MEDIUM);
            const logObject = error.toLogObject();
            if (!logObject.code || !logObject.severity || !logObject.context) {
                throw new Error('Неполный logObject для кастомной ошибки');
            }
        });
    }
    /**
     * Тестирует Error Handler
     */
    async runErrorHandlerTests() {
        console.log('\n🛠️ Тестирование Error Handler...');
        await this.runTest('Обработка простой ошибки', async () => {
            const errorHandler = (0, ErrorHandler_1.getErrorHandler)();
            const error = new ErrorTypes_1.DatabaseError('Test database error', ErrorTypes_1.ErrorCode.QUERY_FAILED, { component: 'test', operation: 'testQuery' });
            await errorHandler.handleError(error);
            const metrics = errorHandler.getMetrics();
            if (metrics.totalErrors === 0) {
                throw new Error('Ошибка не была учтена в метриках');
            }
        });
        await this.runTest('Получение метрик ошибок', async () => {
            const errorHandler = (0, ErrorHandler_1.getErrorHandler)();
            const metrics = errorHandler.getMetrics();
            if (typeof metrics.totalErrors !== 'number') {
                throw new Error('Неверный тип для totalErrors');
            }
            if (!metrics.errorsByCategory || !metrics.errorsBySeverity) {
                throw new Error('Отсутствуют обязательные поля в метриках');
            }
        });
        await this.runTest('Получение статистики ошибок', async () => {
            const errorHandler = (0, ErrorHandler_1.getErrorHandler)();
            const stats = errorHandler.getErrorStatistics(1);
            if (typeof stats.totalInWindow !== 'number') {
                throw new Error('Неверный тип статистики');
            }
        });
    }
    /**
     * Тестирует retry механизмы
     */
    async runRetryMechanismTests() {
        console.log('\n🔄 Тестирование Retry механизмов...');
        await this.runTest('Успешная операция без retry', async () => {
            const result = await (0, ErrorHandler_1.withRetry)(async () => 'success', { component: 'test', operation: 'successOperation' });
            if (!result.success || result.result !== 'success' || result.attempts !== 1) {
                throw new Error('Неверный результат успешной операции');
            }
        });
        await this.runTest('Операция с retry после ошибок', async () => {
            let attemptCount = 0;
            const result = await (0, ErrorHandler_1.withRetry)(async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new ErrorTypes_1.DatabaseError('Temporary failure', ErrorTypes_1.ErrorCode.QUERY_FAILED);
                }
                return 'success after retry';
            }, { component: 'test', operation: 'retryOperation' }, { maxRetries: 3, retryDelay: 10 });
            if (!result.success || result.attempts !== 3) {
                throw new Error(`Неверное количество попыток: ${result.attempts}`);
            }
        });
        await this.runTest('Операция с исчерпанием retry', async () => {
            const result = await (0, ErrorHandler_1.withRetry)(async () => {
                throw new ErrorTypes_1.DatabaseError('Persistent failure', ErrorTypes_1.ErrorCode.QUERY_FAILED);
            }, { component: 'test', operation: 'failOperation' }, { maxRetries: 2, retryDelay: 10 });
            if (result.success || result.attempts !== 3) {
                throw new Error('Операция должна была провалиться после исчерпания retry');
            }
        });
        await this.runTest('Невосстанавливаемая ошибка без retry', async () => {
            const result = await (0, ErrorHandler_1.withRetry)(async () => {
                throw new ErrorTypes_1.SecurityError('Security violation', ErrorTypes_1.ErrorCode.SECURITY_VIOLATION);
            }, { component: 'test', operation: 'securityFailure' }, { maxRetries: 3 });
            if (result.success || result.attempts !== 1) {
                throw new Error('Невосстанавливаемая ошибка не должна retry');
            }
        });
    }
    /**
     * Тестирует Audit Logging
     */
    async runAuditLoggingTests() {
        console.log('\n📋 Тестирование Audit Logging...');
        await this.runTest('Создание audit события', async () => {
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const eventId = await auditLogger.logEvent(AuditLogger_1.AuditEventType.USER_LOGIN, AuditLogger_1.AuditSeverity.INFO, 'Test user login', {
                component: 'auth',
                operation: 'login',
                userId: 'testUser123'
            }, true);
            if (!eventId || typeof eventId !== 'string') {
                throw new Error('Не получен ID события');
            }
        });
        await this.runTest('Трассировка операции', async () => {
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const operationId = await auditLogger.startOperation('testOperation', 'testComponent', { userId: 'testUser' });
            await new Promise(resolve => setTimeout(resolve, 50));
            await auditLogger.endOperation(operationId, true, {
                metadata: { result: 'success' }
            });
            if (!operationId) {
                throw new Error('Не получен ID операции');
            }
        });
        await this.runTest('Логирование ошибки в audit', async () => {
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const error = new ErrorTypes_1.AuthenticationError('Test auth error for audit', ErrorTypes_1.ErrorCode.INVALID_CREDENTIALS, { component: 'auth', operation: 'testAuth' });
            await auditLogger.logError(error, { userId: 'testUser' });
            const metrics = auditLogger.getMetrics();
            if (metrics.totalEvents === 0) {
                throw new Error('Audit событие не было создано');
            }
        });
        await this.runTest('Получение audit метрик', async () => {
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const metrics = auditLogger.getMetrics();
            if (typeof metrics.totalEvents !== 'number') {
                throw new Error('Неверный тип audit метрик');
            }
        });
        await this.runTest('Поиск audit событий', async () => {
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const events = auditLogger.findEvents({
                eventType: AuditLogger_1.AuditEventType.USER_LOGIN,
                timeFrom: new Date(Date.now() - 60000)
            });
            if (!Array.isArray(events)) {
                throw new Error('Поиск событий должен возвращать массив');
            }
        });
        await this.runTest('Проверка целостности audit логов', async () => {
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const recentEvents = auditLogger.getRecentEvents(10);
            for (const event of recentEvents) {
                const isValid = auditLogger.verifyIntegrity(event);
                if (!isValid) {
                    throw new Error(`Нарушена целостность события ${event.id}`);
                }
            }
        });
    }
    /**
     * Тестирует Performance Monitoring
     */
    async runPerformanceMonitoringTests() {
        console.log('\n📊 Тестирование Performance Monitoring...');
        await this.runTest('Создание и завершение span', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const span = monitor.startSpan('testOperation', 'testComponent', undefined, {
                testTag: 'testValue'
            });
            await new Promise(resolve => setTimeout(resolve, 50));
            monitor.finishSpan(span, 'success');
            if (!span.spanId || !span.traceId) {
                throw new Error('Span не содержит обязательные поля');
            }
        });
        await this.runTest('Измерение async операции', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const result = await monitor.measureAsync('asyncTest', 'testComponent', async (span) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                monitor.addSpanLog(span, 'info', 'Test log entry');
                return 'async result';
            });
            if (result !== 'async result') {
                throw new Error('Неверный результат async измерения');
            }
        });
        await this.runTest('Измерение sync операции', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const result = monitor.measureSync('syncTest', 'testComponent', (span) => {
                monitor.addSpanLog(span, 'info', 'Sync operation');
                return 'sync result';
            });
            if (result !== 'sync result') {
                throw new Error('Неверный результат sync измерения');
            }
        });
        await this.runTest('Запись custom метрики', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            monitor.recordMetric('test.metric', 42, 'count', {
                component: 'test',
                operation: 'testMetric'
            });
            const metrics = monitor.getMetrics(1, 'test.metric');
            if (metrics.length === 0) {
                throw new Error('Custom метрика не была записана');
            }
        });
        await this.runTest('Получение системных метрик', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const systemMetrics = monitor.getSystemMetrics();
            if (!systemMetrics.cpu || !systemMetrics.memory || !systemMetrics.eventLoop) {
                throw new Error('Неполные системные метрики');
            }
        });
        await this.runTest('Получение статистики производительности', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const stats = monitor.getPerformanceStats();
            if (typeof stats.totalSpans !== 'number' || !stats.systemHealth) {
                throw new Error('Неверная статистика производительности');
            }
        });
        await this.runTest('Экспорт Prometheus метрик', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const prometheusData = monitor.exportPrometheusMetrics();
            if (typeof prometheusData !== 'string') {
                throw new Error('Prometheus данные должны быть строкой');
            }
        });
    }
    /**
     * Тестирует Alert System
     */
    async runAlertSystemTests() {
        console.log('\n🚨 Тестирование Alert System...');
        await this.runTest('Создание правила алерта', async () => {
            const alertManager = (0, AlertManager_1.getAlertManager)();
            alertManager.addRule({
                id: 'test_rule',
                name: 'Test Alert Rule',
                description: 'Test rule for testing',
                enabled: true,
                conditions: {
                    errorSeverity: [ErrorTypes_1.ErrorSeverity.CRITICAL]
                },
                alertSeverity: AlertManager_1.AlertSeverity.CRITICAL,
                channels: [AlertManager_1.AlertChannel.CONSOLE],
                cooldownMinutes: 1,
                maxAlertsPerHour: 10
            });
            // Правило должно быть добавлено без ошибок
        });
        await this.runTest('Обработка ошибки для алерта', async () => {
            const alertManager = (0, AlertManager_1.getAlertManager)();
            const error = new ErrorTypes_1.SecurityError('Test critical error for alert', ErrorTypes_1.ErrorCode.SECURITY_VIOLATION, { component: 'security', operation: 'testAlert' });
            await alertManager.processError(error, 'testSource');
            const activeAlerts = alertManager.getActiveAlerts();
            if (activeAlerts.length === 0) {
                throw new Error('Алерт не был создан для критической ошибки');
            }
        });
        await this.runTest('Обработка метрики для алерта', async () => {
            const alertManager = (0, AlertManager_1.getAlertManager)();
            // Добавляем правило для метрик
            alertManager.addRule({
                id: 'metric_test_rule',
                name: 'High Memory Alert',
                description: 'Alert for high memory usage',
                enabled: true,
                conditions: {
                    metricThresholds: [{
                            metric: 'system.memory.usage',
                            operator: 'gt',
                            value: 90
                        }]
                },
                alertSeverity: AlertManager_1.AlertSeverity.WARNING,
                channels: [AlertManager_1.AlertChannel.CONSOLE],
                cooldownMinutes: 1,
                maxAlertsPerHour: 5
            });
            await alertManager.processMetric('system.memory.usage', 95, {
                component: 'system'
            });
            // Алерт должен быть создан
        });
        await this.runTest('Разрешение алерта', async () => {
            const alertManager = (0, AlertManager_1.getAlertManager)();
            const activeAlerts = alertManager.getActiveAlerts();
            if (activeAlerts.length > 0) {
                const alertId = activeAlerts[0].id;
                await alertManager.resolveAlert(alertId, 'Test resolution');
                const updatedAlerts = alertManager.getActiveAlerts();
                const resolvedAlert = updatedAlerts.find(a => a.id === alertId);
                if (resolvedAlert) {
                    throw new Error('Алерт не был разрешен');
                }
            }
        });
        await this.runTest('Получение статистики алертов', async () => {
            const alertManager = (0, AlertManager_1.getAlertManager)();
            const stats = alertManager.getAlertStatistics(1);
            if (typeof stats.total !== 'number' || !stats.bySeverity) {
                throw new Error('Неверная статистика алертов');
            }
        });
        await this.runTest('Тест канала уведомлений', async () => {
            const alertManager = (0, AlertManager_1.getAlertManager)();
            const testResult = await alertManager.testChannel(AlertManager_1.AlertChannel.CONSOLE, 'Test notification message');
            if (!testResult) {
                throw new Error('Тест канала уведомлений провалился');
            }
        });
    }
    /**
     * Тестирует интеграцию всех систем
     */
    async runIntegrationTests() {
        console.log('\n🔗 Тестирование интеграции систем...');
        await this.runTest('Полный цикл обработки ошибки', async () => {
            // Создаем ошибку
            const error = new ErrorTypes_1.MixingError('Integration test mixing error', ErrorTypes_1.ErrorCode.MIXING_POOL_FULL, {
                component: 'mixer',
                operation: 'integrationTest',
                userId: 'integrationUser'
            });
            // Обрабатываем через все системы
            const errorHandler = (0, ErrorHandler_1.getErrorHandler)();
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            const alertManager = (0, AlertManager_1.getAlertManager)();
            // Error handling
            await errorHandler.handleError(error);
            // Audit logging
            await auditLogger.logError(error);
            // Alert processing
            await alertManager.processError(error, 'integration');
            // Проверяем что все системы сработали
            const errorMetrics = errorHandler.getMetrics();
            const auditMetrics = auditLogger.getMetrics();
            const activeAlerts = alertManager.getActiveAlerts();
            if (errorMetrics.totalErrors === 0) {
                throw new Error('Error Handler не обработал ошибку');
            }
            if (auditMetrics.totalEvents === 0) {
                throw new Error('Audit Logger не записал событие');
            }
        });
        await this.runTest('Трейсинг с производительностью', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            const auditLogger = (0, AuditLogger_1.getAuditLogger)();
            // Начинаем операцию в обеих системах
            const span = monitor.startSpan('integrationOperation', 'integration');
            const operationId = await auditLogger.startOperation('integrationOperation', 'integration');
            // Выполняем работу
            await new Promise(resolve => setTimeout(resolve, 100));
            // Записываем метрику
            monitor.recordMetric('integration.test', 1, 'count');
            // Завершаем операцию
            monitor.finishSpan(span, 'success');
            await auditLogger.endOperation(operationId, true);
            // Проверяем что данные записались
            const metrics = monitor.getMetrics(1);
            const auditEvents = auditLogger.getRecentEvents(10);
            if (metrics.length === 0) {
                throw new Error('Метрики не были записаны');
            }
            if (auditEvents.length === 0) {
                throw new Error('Audit события не были созданы');
            }
        });
        await this.runTest('Retry с полным трейсингом', async () => {
            const monitor = (0, PerformanceMonitor_1.getPerformanceMonitor)();
            let attempts = 0;
            const result = await monitor.measureAsync('retryWithTracing', 'integration', async (span) => {
                return (0, ErrorHandler_1.withRetry)(async () => {
                    attempts++;
                    if (attempts < 2) {
                        throw new ErrorTypes_1.DatabaseError('Retry test error', ErrorTypes_1.ErrorCode.QUERY_FAILED);
                    }
                    return 'success';
                }, {
                    component: 'integration',
                    operation: 'retryTest',
                    additionalInfo: { correlationId: span.spanId }
                }, { maxRetries: 3, retryDelay: 10 });
            });
            if (!result || typeof result !== 'object') {
                throw new Error('Retry с трейсингом вернул неверный результат');
            }
        });
    }
    /**
     * Выполняет отдельный тест
     */
    async runTest(testName, testFunction) {
        const startTime = Date.now();
        try {
            await testFunction();
            const duration = Date.now() - startTime;
            this.testResults.push({
                testName,
                passed: true,
                duration
            });
            console.log(`  ✅ ${testName} (${duration}ms)`);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.testResults.push({
                testName,
                passed: false,
                error: error.message,
                duration
            });
            console.log(`  ❌ ${testName} (${duration}ms): ${error.message}`);
        }
    }
    /**
     * Выводит результаты тестов
     */
    printTestResults(totalDuration, passedTests, failedTests) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 РЕЗУЛЬТАТЫ COMPREHENSIVE TEST SUITE');
        console.log('='.repeat(60));
        console.log(`Общее время выполнения: ${totalDuration}ms`);
        console.log(`Всего тестов: ${this.testResults.length}`);
        console.log(`✅ Пройдено: ${passedTests}`);
        console.log(`❌ Провалено: ${failedTests}`);
        console.log(`📈 Успешность: ${((passedTests / this.testResults.length) * 100).toFixed(1)}%`);
        if (failedTests > 0) {
            console.log('\n🐛 Провалившиеся тесты:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(result => {
                console.log(`  • ${result.testName}: ${result.error}`);
            });
        }
        // Топ самых медленных тестов
        const slowestTests = this.testResults
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 5);
        console.log('\n⏰ Самые медленные тесты:');
        slowestTests.forEach((test, index) => {
            console.log(`  ${index + 1}. ${test.testName}: ${test.duration}ms`);
        });
        if (passedTests === this.testResults.length) {
            console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
            console.log('✨ Error Handling и Logging системы готовы к продакшену!');
        }
        else {
            console.log('\n⚠️  Некоторые тесты провалились. Проверьте реализацию.');
        }
        console.log('='.repeat(60));
    }
}
exports.ErrorHandlingTests = ErrorHandlingTests;
/**
 * Запускает все тесты
 */
async function runErrorHandlingTests() {
    const testSuite = new ErrorHandlingTests();
    await testSuite.runAllTests();
}
//# sourceMappingURL=ErrorHandlingTests.js.map