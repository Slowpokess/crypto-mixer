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
/**
 * Тестовый набор для Error Handling системы
 */
export declare class ErrorHandlingTests {
    private logger;
    private testResults;
    constructor();
    /**
     * Запускает все тесты
     */
    runAllTests(): Promise<{
        totalTests: number;
        passedTests: number;
        failedTests: number;
        duration: number;
        results: Array<any>;
    }>;
    /**
     * Инициализирует все системы для тестирования
     */
    private initializeSystems;
    /**
     * Тестирует различные типы ошибок
     */
    private runErrorTypeTests;
    /**
     * Тестирует Error Handler
     */
    private runErrorHandlerTests;
    /**
     * Тестирует retry механизмы
     */
    private runRetryMechanismTests;
    /**
     * Тестирует Audit Logging
     */
    private runAuditLoggingTests;
    /**
     * Тестирует Performance Monitoring
     */
    private runPerformanceMonitoringTests;
    /**
     * Тестирует Alert System
     */
    private runAlertSystemTests;
    /**
     * Тестирует интеграцию всех систем
     */
    private runIntegrationTests;
    /**
     * Выполняет отдельный тест
     */
    private runTest;
    /**
     * Выводит результаты тестов
     */
    private printTestResults;
}
/**
 * Запускает все тесты
 */
export declare function runErrorHandlingTests(): Promise<void>;
export { ErrorHandlingTests };
