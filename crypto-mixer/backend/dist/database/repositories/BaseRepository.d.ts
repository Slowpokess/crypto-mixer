import { Model, ModelStatic, Transaction, WhereOptions, Order, FindOptions } from 'sequelize';
/**
 * Базовый репозиторий для всех моделей
 * Предоставляет общие методы для работы с данными
 */
export declare abstract class BaseRepository<T extends Model> {
    protected model: ModelStatic<T>;
    constructor(model: ModelStatic<T>);
    /**
     * Создание новой записи с валидацией безопасности
     */
    create(data: any, transaction?: Transaction): Promise<T>;
    /**
     * Поиск записи по ID
     */
    findById(id: string, options?: Omit<FindOptions<T>, 'where'>): Promise<T | null>;
    /**
     * Поиск одной записи по условию
     */
    findOne(where: WhereOptions<T>, options?: Omit<FindOptions<T>, 'where'>): Promise<T | null>;
    /**
     * Поиск всех записей по условию
     */
    findAll(where?: WhereOptions<T>, options?: Omit<FindOptions<T>, 'where'>): Promise<T[]>;
    /**
     * Поиск с пагинацией
     */
    findAndCountAll(where?: WhereOptions<T>, page?: number, limit?: number, options?: Omit<FindOptions<T>, 'where' | 'limit' | 'offset'>): Promise<{
        rows: T[];
        count: number;
        totalPages: number;
        currentPage: number;
    }>;
    /**
     * Обновление записи по ID с валидацией безопасности
     */
    updateById(id: string, data: Partial<any>, transaction?: Transaction): Promise<T | null>;
    /**
     * Массовое обновление записей с валидацией безопасности
     */
    updateWhere(where: WhereOptions<T>, data: Partial<any>, transaction?: Transaction): Promise<number>;
    /**
     * Удаление записи по ID
     */
    deleteById(id: string, transaction?: Transaction): Promise<boolean>;
    /**
     * Массовое удаление записей
     */
    deleteWhere(where: WhereOptions<T>, transaction?: Transaction): Promise<number>;
    /**
     * Подсчет записей
     */
    count(where?: WhereOptions<T>): Promise<number>;
    /**
     * Проверка существования записи
     */
    exists(where: WhereOptions<T>): Promise<boolean>;
    /**
     * Upsert - создание или обновление
     */
    upsert(data: any, transaction?: Transaction): Promise<{
        instance: T;
        created: boolean;
    }>;
    /**
     * Поиск или создание записи
     */
    findOrCreate(where: WhereOptions<T>, defaults?: any, transaction?: Transaction): Promise<{
        instance: T;
        created: boolean;
    }>;
    /**
     * Выполнение параметризованного SQL запроса с защитой от SQL injection
     */
    rawQuery(sql: string, replacements?: Record<string, any>): Promise<any>;
    /**
     * Безопасное выполнение модифицирующих SQL запросов (INSERT, UPDATE, DELETE)
     * Требует явного подтверждения и дополнительных проверок
     */
    executeModifyingQuery(sql: string, replacements?: Record<string, any>, options?: {
        allowedOperations?: ('INSERT' | 'UPDATE' | 'DELETE')[];
        transaction?: Transaction;
        confirmOperation?: boolean;
    }): Promise<any>;
    /**
     * Валидация SQL запроса для предотвращения injection атак
     */
    private validateSqlQuery;
    /**
     * Валидация параметров замены
     */
    private validateReplacements;
    /**
     * Создание транзакции
     */
    transaction<R>(callback: (transaction: Transaction) => Promise<R>): Promise<R>;
    /**
     * Получение модели
     */
    getModel(): ModelStatic<T>;
    /**
     * Получение имени таблицы
     */
    getTableName(): string;
    /**
     * Комплексная валидация данных перед операциями
     */
    protected validateData(data: any): void;
    /**
     * Валидация ключей объекта
     */
    private validateObjectKeys;
    /**
     * Валидация значений объекта
     */
    private validateObjectValues;
    /**
     * Валидация строковых значений
     */
    private validateStringValue;
    /**
     * Валидация числовых значений
     */
    private validateNumberValue;
    /**
     * Валидация массивов
     */
    private validateArrayValue;
    /**
     * Валидация Date объектов
     */
    private validateDateValue;
    /**
     * Обработка ошибок репозитория
     */
    protected handleError(operation: string, error: any): never;
    /**
     * Построение условий для сложных запросов
     */
    protected buildWhereCondition(filters: Record<string, any>): WhereOptions<T>;
    /**
     * Построение порядка сортировки
     */
    protected buildOrderCondition(sortBy?: string, sortOrder?: 'ASC' | 'DESC'): Order;
    /**
     * Логирование операций
     */
    protected log(operation: string, details?: any): void;
}
export default BaseRepository;
