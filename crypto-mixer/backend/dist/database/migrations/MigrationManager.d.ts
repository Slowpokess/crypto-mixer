import { Sequelize, QueryInterface } from 'sequelize';
export interface MigrationFile {
    id: string;
    filename: string;
    timestamp: Date;
    up: (queryInterface: QueryInterface, Sequelize: any) => Promise<void>;
    down: (queryInterface: QueryInterface, Sequelize: any) => Promise<void>;
}
export interface MigrationRecord {
    id: string;
    filename: string;
    executed_at: Date;
    execution_time_ms: number;
    checksum: string;
}
/**
 * Менеджер миграций базы данных
 * Управляет версионированием схемы БД
 */
export declare class MigrationManager {
    private sequelize;
    private migrationsPath;
    private migrationTableName;
    constructor(sequelize: Sequelize, migrationsPath?: string);
    /**
     * Создание таблицы миграций
     */
    private createMigrationsTable;
    /**
     * Получение выполненных миграций с защитой от SQL injection
     */
    private getExecutedMigrations;
    /**
     * Валидация имени таблицы для предотвращения SQL injection
     */
    private validateTableName;
    /**
     * Сканирование файлов миграций с защитой от path traversal
     */
    private scanMigrationFiles;
    /**
     * Парсинг временной метки из имени файла
     */
    private parseTimestampFromFilename;
    /**
     * Вычисление контрольной суммы миграции
     */
    private calculateChecksum;
    /**
     * Запись выполненной миграции с защитой от SQL injection
     */
    private recordMigration;
    /**
     * Удаление записи о миграции с защитой от SQL injection
     */
    private unrecordMigration;
    /**
     * Выполнение миграций вверх
     */
    up(targetMigration?: string): Promise<void>;
    /**
     * Откат миграций вниз
     */
    down(targetMigration?: string): Promise<void>;
    /**
     * Проверка статуса миграций
     */
    status(): Promise<{
        executed: MigrationRecord[];
        pending: MigrationFile[];
        total: number;
    }>;
    /**
     * Создание новой миграции
     */
    create(name: string, template?: 'table' | 'index' | 'custom'): Promise<string>;
    /**
     * Шаблон для создания таблицы
     */
    private generateTableTemplate;
    /**
     * Шаблон для создания индексов
     */
    private generateIndexTemplate;
    /**
     * Пользовательский шаблон
     */
    private generateCustomTemplate;
    /**
     * Валидация целостности миграций
     */
    validate(): Promise<{
        isValid: boolean;
        issues: string[];
    }>;
    /**
     * Валидация данных миграции для предотвращения injection атак
     */
    private validateMigrationData;
    /**
     * Валидация ID миграции
     */
    private validateMigrationId;
    /**
     * Валидация пути к директории миграций
     */
    private validateMigrationsPath;
    /**
     * Валидация имени файла миграции
     */
    private isValidMigrationFilename;
    /**
     * Валидация и построение полного пути к файлу
     */
    private validateAndBuildFilePath;
    /**
     * Безопасная загрузка модуля миграции
     */
    private safeRequire;
    /**
     * Валидация структуры миграции
     */
    private validateMigrationStructure;
}
export default MigrationManager;
