#!/usr/bin/env ts-node
/**
 * Комплексная система тестирования базы данных
 * Проверяет все компоненты и их интеграцию
 */
declare class DatabaseTestSuite {
    private dbManager;
    private sequelize;
    private models;
    private repositories;
    private backupManager;
    private monitoring;
    private testResults;
    constructor();
    /**
     * Запуск всех тестов
     */
    runAllTests(): Promise<void>;
    /**
     * Инициализация компонентов
     */
    private initializeComponents;
    /**
     * Создание тестовой схемы
     */
    private createTestSchema;
    /**
     * Тестирование DatabaseManager
     */
    private runDatabaseManagerTests;
    /**
     * Тестирование системы миграций
     */
    private runMigrationTests;
    /**
     * Тестирование моделей
     */
    private runModelTests;
    /**
     * Тестирование репозиториев
     */
    private runRepositoryTests;
    /**
     * Тестирование системы бэкапов
     */
    private runBackupTests;
    /**
     * Тестирование системы мониторинга
     */
    private runMonitoringTests;
    /**
     * Интеграционные тесты
     */
    private runIntegrationTests;
    /**
     * Тесты производительности
     */
    private runPerformanceTests;
    /**
     * Выполнение отдельного теста
     */
    private runTest;
    /**
     * Очистка после тестов
     */
    private cleanup;
    /**
     * Вывод результатов тестирования
     */
    private printTestResults;
}
export { DatabaseTestSuite };
export default DatabaseTestSuite;
