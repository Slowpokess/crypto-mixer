#!/usr/bin/env ts-node
import { MigrationManager } from './migrations/MigrationManager';
/**
 * Главный скрипт для управления миграциями
 */
declare class MigrationRunner {
    private sequelize;
    private migrationManager;
    constructor();
    /**
     * Подключение к базе данных
     */
    connect(): Promise<void>;
    /**
     * Закрытие подключения
     */
    disconnect(): Promise<void>;
    /**
     * Публичный доступ к менеджеру миграций
     * Расширяет функционал для внешнего управления
     */
    getMigrationManager(): MigrationManager;
    /**
     * Выполнение миграций
     */
    runMigrations(target?: string): Promise<void>;
    /**
     * Откат миграций
     */
    rollbackMigrations(target?: string): Promise<void>;
    /**
     * Статус миграций
     */
    getStatus(): Promise<void>;
    /**
     * Создание новой миграции
     */
    createMigration(name: string, template?: 'table' | 'index' | 'custom'): Promise<void>;
    /**
     * Валидация миграций
     */
    validateMigrations(): Promise<void>;
}
export { MigrationRunner, MigrationManager };
export default MigrationRunner;
