"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
/**
 * Базовый репозиторий для всех моделей
 * Предоставляет общие методы для работы с данными
 */
class BaseRepository {
    constructor(model) {
        this.model = model;
    }
    /**
     * Создание новой записи с валидацией безопасности
     */
    async create(data, transaction) {
        try {
            // Валидация данных на безопасность
            this.validateData(data);
            return await this.model.create(data, { transaction });
        }
        catch (error) {
            this.handleError('create', error);
        }
    }
    /**
     * Поиск записи по ID
     */
    async findById(id, options = {}) {
        try {
            return await this.model.findByPk(id, options);
        }
        catch (error) {
            console.error(`Error finding ${this.model.name} by ID:`, error);
            throw error;
        }
    }
    /**
     * Поиск одной записи по условию
     */
    async findOne(where, options = {}) {
        try {
            return await this.model.findOne({ where, ...options });
        }
        catch (error) {
            console.error(`Error finding one ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Поиск всех записей по условию
     */
    async findAll(where = {}, options = {}) {
        try {
            return await this.model.findAll({ where, ...options });
        }
        catch (error) {
            console.error(`Error finding all ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Поиск с пагинацией
     */
    async findAndCountAll(where = {}, page = 1, limit = 10, options = {}) {
        try {
            const offset = (page - 1) * limit;
            const result = await this.model.findAndCountAll({
                where,
                limit,
                offset,
                ...options
            });
            return {
                rows: result.rows,
                count: result.count,
                totalPages: Math.ceil(result.count / limit),
                currentPage: page
            };
        }
        catch (error) {
            console.error(`Error finding and counting ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Обновление записи по ID с валидацией безопасности
     */
    async updateById(id, data, transaction) {
        try {
            // Валидация ID
            if (!id || typeof id !== 'string' || id.trim().length === 0) {
                throw new Error('Invalid ID provided');
            }
            // Валидация данных на безопасность
            this.validateData(data);
            const record = await this.model.findByPk(id, { transaction });
            if (!record) {
                return null;
            }
            await record.update(data, { transaction });
            return record;
        }
        catch (error) {
            this.handleError('updateById', error);
        }
    }
    /**
     * Массовое обновление записей с валидацией безопасности
     */
    async updateWhere(where, data, transaction) {
        try {
            // Валидация условий WHERE
            if (!where || typeof where !== 'object') {
                throw new Error('Invalid WHERE conditions provided');
            }
            // Валидация данных на безопасность
            this.validateData(data);
            const [updatedCount] = await this.model.update(data, {
                where,
                transaction,
                returning: false
            });
            return updatedCount;
        }
        catch (error) {
            this.handleError('updateWhere', error);
        }
    }
    /**
     * Удаление записи по ID
     */
    async deleteById(id, transaction) {
        try {
            const deletedCount = await this.model.destroy({
                where: { id },
                transaction
            });
            return deletedCount > 0;
        }
        catch (error) {
            console.error(`Error deleting ${this.model.name} by ID:`, error);
            throw error;
        }
    }
    /**
     * Массовое удаление записей
     */
    async deleteWhere(where, transaction) {
        try {
            return await this.model.destroy({ where, transaction });
        }
        catch (error) {
            console.error(`Error bulk deleting ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Подсчет записей
     */
    async count(where = {}) {
        try {
            return await this.model.count({ where });
        }
        catch (error) {
            console.error(`Error counting ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Проверка существования записи
     */
    async exists(where) {
        try {
            const count = await this.model.count({ where });
            return count > 0;
        }
        catch (error) {
            console.error(`Error checking existence of ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Upsert - создание или обновление
     */
    async upsert(data, transaction) {
        try {
            const [instance, created] = await this.model.upsert(data, { transaction });
            return { instance, created: created ?? false };
        }
        catch (error) {
            console.error(`Error upserting ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Поиск или создание записи
     */
    async findOrCreate(where, defaults = {}, transaction) {
        try {
            const [instance, created] = await this.model.findOrCreate({
                where,
                defaults,
                transaction
            });
            return { instance, created };
        }
        catch (error) {
            console.error(`Error finding or creating ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Выполнение параметризованного SQL запроса с защитой от SQL injection
     */
    async rawQuery(sql, replacements = {}) {
        try {
            // Валидация SQL запроса для предотвращения SQL injection
            this.validateSqlQuery(sql);
            // Валидация параметров замены
            this.validateReplacements(replacements);
            // Выполняем только SELECT запросы для дополнительной безопасности
            if (!sql.trim().toLowerCase().startsWith('select')) {
                throw new Error('Only SELECT queries are allowed in rawQuery method');
            }
            return await this.model.sequelize?.query(sql, {
                replacements,
                type: 'SELECT',
                // Дополнительная защита - только чтение
                nest: true,
                raw: false
            });
        }
        catch (error) {
            console.error(`Error executing raw query on ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Безопасное выполнение модифицирующих SQL запросов (INSERT, UPDATE, DELETE)
     * Требует явного подтверждения и дополнительных проверок
     */
    async executeModifyingQuery(sql, replacements = {}, options = {}) {
        try {
            // Требуем явного подтверждения для модифицирующих операций
            if (!options.confirmOperation) {
                throw new Error('Modifying operations require explicit confirmation');
            }
            // Валидация SQL запроса
            this.validateSqlQuery(sql);
            // Валидация параметров
            this.validateReplacements(replacements);
            // Проверяем разрешенные операции
            const sqlLower = sql.trim().toLowerCase();
            const allowedOps = options.allowedOperations || ['INSERT', 'UPDATE', 'DELETE'];
            const isAllowed = allowedOps.some(op => sqlLower.startsWith(op.toLowerCase()));
            if (!isAllowed) {
                throw new Error(`Operation not allowed. Permitted operations: ${allowedOps.join(', ')}`);
            }
            return await this.model.sequelize?.query(sql, {
                replacements,
                transaction: options.transaction,
                type: sqlLower.startsWith('insert') ? 'INSERT' :
                    sqlLower.startsWith('update') ? 'UPDATE' :
                        sqlLower.startsWith('delete') ? 'DELETE' : 'RAW'
            });
        }
        catch (error) {
            console.error(`Error executing modifying query on ${this.model.name}:`, error);
            throw error;
        }
    }
    /**
     * Валидация SQL запроса для предотвращения injection атак
     */
    validateSqlQuery(sql) {
        if (!sql || typeof sql !== 'string') {
            throw new Error('SQL query must be a non-empty string');
        }
        // Удаляем комментарии и лишние пробелы
        const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (!cleanSql) {
            throw new Error('SQL query cannot be empty after cleanup');
        }
        // Проверяем на опасные конструкции
        const dangerousPatterns = [
            /;\s*drop\s+/i, // DROP statements
            /;\s*delete\s+from\s+/i, // Стacked DELETE
            /;\s*update\s+.*set\s+/i, // Stacked UPDATE
            /;\s*insert\s+into\s+/i, // Stacked INSERT
            /;\s*create\s+/i, // CREATE statements
            /;\s*alter\s+/i, // ALTER statements
            /;\s*truncate\s+/i, // TRUNCATE statements
            /union\s+select/i, // UNION-based injection
            /'\s*or\s+'.*?'/i, // OR-based injection
            /'\s*and\s+'.*?'/i, // AND-based injection
            /xp_cmdshell/i, // Command execution
            /sp_executesql/i, // Dynamic SQL execution
            /exec\s*\(/i, // EXEC statements
            /eval\s*\(/i, // EVAL statements
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(cleanSql)) {
                throw new Error(`SQL query contains potentially dangerous pattern: ${pattern.source}`);
            }
        }
        // Проверяем на множественные запросы (stacked queries)
        const statements = cleanSql.split(';').filter(s => s.trim());
        if (statements.length > 1) {
            throw new Error('Multiple statements in single query are not allowed');
        }
        // Проверяем максимальную длину запроса
        if (cleanSql.length > 10000) {
            throw new Error('SQL query is too long (max 10000 characters)');
        }
    }
    /**
     * Валидация параметров замены
     */
    validateReplacements(replacements) {
        if (!replacements || typeof replacements !== 'object') {
            return; // Пустые replacements допустимы
        }
        // Проверяем каждый параметр
        Object.entries(replacements).forEach(([key, value]) => {
            // Проверяем ключ
            if (!key || typeof key !== 'string') {
                throw new Error('Replacement keys must be non-empty strings');
            }
            // Проверяем на опасные символы в ключах
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
                throw new Error(`Invalid replacement key: ${key}. Only alphanumeric characters and underscores allowed`);
            }
            // Проверяем значения
            if (typeof value === 'string') {
                // Проверяем строки на опасные конструкции
                const dangerousStringPatterns = [
                    /'\s*;\s*/, // SQL statement termination
                    /'\s*union\s+/i, // UNION injection
                    /'\s*or\s+'.*?'/i, // OR injection
                    /'\s*and\s+'.*?'/i, // AND injection
                    /<script/i, // XSS prevention
                    /javascript:/i, // JavaScript protocol
                    /on\w+\s*=/i, // Event handlers
                ];
                for (const pattern of dangerousStringPatterns) {
                    if (pattern.test(value)) {
                        throw new Error(`Replacement value contains dangerous pattern: ${pattern.source}`);
                    }
                }
                // Проверяем максимальную длину строки
                if (value.length > 1000) {
                    throw new Error('Replacement string values cannot exceed 1000 characters');
                }
            }
            // Проверяем типы значений
            const allowedTypes = ['string', 'number', 'boolean'];
            const valueType = typeof value;
            if (value !== null && value !== undefined && !allowedTypes.includes(valueType)) {
                throw new Error(`Invalid replacement value type: ${valueType}. Allowed types: ${allowedTypes.join(', ')}, null, undefined`);
            }
        });
        // Проверяем максимальное количество параметров
        if (Object.keys(replacements).length > 50) {
            throw new Error('Too many replacement parameters (max 50)');
        }
    }
    /**
     * Создание транзакции
     */
    async transaction(callback) {
        if (!this.model.sequelize) {
            throw new Error('Sequelize instance not available');
        }
        return await this.model.sequelize.transaction(callback);
    }
    /**
     * Получение модели
     */
    getModel() {
        return this.model;
    }
    /**
     * Получение имени таблицы
     */
    getTableName() {
        return this.model.tableName;
    }
    /**
     * Комплексная валидация данных перед операциями
     */
    validateData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data provided: must be a non-null object');
        }
        // Проверяем на потенциально опасные ключи
        this.validateObjectKeys(data);
        // Проверяем значения на безопасность
        this.validateObjectValues(data);
        // Проверяем размер объекта
        const jsonString = JSON.stringify(data);
        if (jsonString.length > 100000) { // 100KB лимит
            throw new Error('Data object is too large (max 100KB)');
        }
    }
    /**
     * Валидация ключей объекта
     */
    validateObjectKeys(obj, path = '') {
        Object.keys(obj).forEach(key => {
            const fullPath = path ? `${path}.${key}` : key;
            // Проверяем на опасные ключи
            if (typeof key !== 'string') {
                throw new Error(`Invalid key type at ${fullPath}: must be string`);
            }
            // Проверяем формат ключа
            if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
                throw new Error(`Invalid key format at ${fullPath}: only alphanumeric, underscore, and dollar sign allowed`);
            }
            // Проверяем на зарезервированные слова
            const reservedWords = [
                '__proto__', 'constructor', 'prototype', 'valueOf', 'toString',
                'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable'
            ];
            if (reservedWords.includes(key)) {
                throw new Error(`Reserved word used as key at ${fullPath}: ${key}`);
            }
            // Рекурсивная проверка для вложенных объектов
            const value = obj[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                this.validateObjectKeys(value, fullPath);
            }
        });
    }
    /**
     * Валидация значений объекта
     */
    validateObjectValues(obj, path = '', depth = 0) {
        // Защита от слишком глубокой вложенности
        if (depth > 10) {
            throw new Error(`Object nesting too deep at ${path} (max 10 levels)`);
        }
        Object.entries(obj).forEach(([key, value]) => {
            const fullPath = path ? `${path}.${key}` : key;
            if (value === null || value === undefined) {
                return; // null/undefined допустимы
            }
            const valueType = typeof value;
            switch (valueType) {
                case 'string':
                    this.validateStringValue(value, fullPath);
                    break;
                case 'number':
                    this.validateNumberValue(value, fullPath);
                    break;
                case 'boolean':
                    // Boolean значения безопасны
                    break;
                case 'object':
                    if (Array.isArray(value)) {
                        this.validateArrayValue(value, fullPath, depth);
                    }
                    else if (value instanceof Date) {
                        this.validateDateValue(value, fullPath);
                    }
                    else {
                        // Рекурсивная проверка вложенных объектов
                        this.validateObjectValues(value, fullPath, depth + 1);
                    }
                    break;
                default:
                    throw new Error(`Invalid value type at ${fullPath}: ${valueType} not allowed`);
            }
        });
    }
    /**
     * Валидация строковых значений
     */
    validateStringValue(value, path) {
        // Проверяем максимальную длину
        if (value.length > 10000) {
            throw new Error(`String too long at ${path} (max 10000 characters)`);
        }
        // Проверяем на потенциально опасные паттерны
        const dangerousPatterns = [
            /<script[^>]*>/i, // Script tags
            /javascript:/i, // JavaScript protocol
            /on\w+\s*=/i, // Event handlers
            /expression\s*\(/i, // CSS expressions
            /data:\s*text\/html/i, // Data URLs with HTML
            /vbscript:/i, // VBScript protocol
            /file:\/\//i, // File protocol
            /ftp:\/\//i, // FTP protocol
            /\x00/, // Null bytes
            /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/ // Control characters
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(value)) {
                throw new Error(`String contains dangerous pattern at ${path}: ${pattern.source}`);
            }
        }
    }
    /**
     * Валидация числовых значений
     */
    validateNumberValue(value, path) {
        if (!Number.isFinite(value)) {
            throw new Error(`Invalid number at ${path}: must be finite`);
        }
        // Проверяем разумные пределы
        if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
            throw new Error(`Number too large at ${path} (exceeds MAX_SAFE_INTEGER)`);
        }
    }
    /**
     * Валидация массивов
     */
    validateArrayValue(value, path, depth) {
        // Проверяем максимальную длину массива
        if (value.length > 1000) {
            throw new Error(`Array too long at ${path} (max 1000 elements)`);
        }
        // Валидируем каждый элемент массива
        value.forEach((item, index) => {
            const itemPath = `${path}[${index}]`;
            if (item && typeof item === 'object') {
                if (Array.isArray(item)) {
                    this.validateArrayValue(item, itemPath, depth + 1);
                }
                else {
                    this.validateObjectValues(item, itemPath, depth + 1);
                }
            }
            else if (typeof item === 'string') {
                this.validateStringValue(item, itemPath);
            }
            else if (typeof item === 'number') {
                this.validateNumberValue(item, itemPath);
            }
        });
    }
    /**
     * Валидация Date объектов
     */
    validateDateValue(value, path) {
        if (isNaN(value.getTime())) {
            throw new Error(`Invalid date at ${path}: Invalid Date object`);
        }
        // Проверяем разумные пределы дат
        const year = value.getFullYear();
        if (year < 1900 || year > 2100) {
            throw new Error(`Date out of range at ${path}: year must be between 1900 and 2100`);
        }
    }
    /**
     * Обработка ошибок репозитория
     */
    handleError(operation, error) {
        console.error(`Repository error in ${this.model.name}.${operation}:`, error);
        throw error;
    }
    /**
     * Построение условий для сложных запросов
     */
    buildWhereCondition(filters) {
        const where = {};
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                where[key] = value;
            }
        });
        return where;
    }
    /**
     * Построение порядка сортировки
     */
    buildOrderCondition(sortBy = 'createdAt', sortOrder = 'DESC') {
        return [[sortBy, sortOrder]];
    }
    /**
     * Логирование операций
     */
    log(operation, details) {
        console.log(`[${this.model.name}Repository] ${operation}`, details || '');
    }
}
exports.BaseRepository = BaseRepository;
exports.default = BaseRepository;
//# sourceMappingURL=BaseRepository.js.map