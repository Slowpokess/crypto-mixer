import { Sequelize, Options, QueryTypes } from 'sequelize';
import { EventEmitter } from 'events';
import * as winston from 'winston';

// Типы для конфигурации базы данных
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  dialect: 'postgres';
  ssl?: boolean;
  pool?: {
    max: number;
    min: number;
    acquire: number;
    idle: number;
  };
  logging?: boolean | ((sql: string, timing?: number) => void);
  dialectOptions?: {
    ssl?: {
      require: boolean;
      rejectUnauthorized: boolean;
    };
  };
}

interface ConnectionPoolInfo {
  size: number;
  used: number;
  waiting: number;
}

interface DatabaseStats {
  connections: ConnectionPoolInfo;
  activeQueries: number;
  totalQueries: number;
  avgQueryTime: number;
  lastQuery: Date | null;
  uptime: number;
  errors: number;
  reconnects: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: Date;
  latency: number;
  connectionPool: ConnectionPoolInfo;
  details: {
    canConnect: boolean;
    canQuery: boolean;
    canWrite: boolean;
    diskSpace?: number;
    version?: string;
  };
  errors?: string[];
}

/**
 * Production-ready Database Manager с connection pooling, мониторингом и auto-reconnect
 */
export class DatabaseManager extends EventEmitter {
  private sequelize: Sequelize | null = null;
  private config: DatabaseConfig;
  private logger: winston.Logger;
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private maxRetries: number = 5;
  private retryDelay: number = 5000;
  private startTime: Date = new Date();
  
  // Статистика и мониторинг
  private stats: DatabaseStats = {
    connections: { size: 0, used: 0, waiting: 0 },
    activeQueries: 0,
    totalQueries: 0,
    avgQueryTime: 0,
    lastQuery: null,
    uptime: 0,
    errors: 0,
    reconnects: 0
  };

  private queryTimes: number[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: DatabaseConfig, logger?: winston.Logger) {
    super();
    
    this.config = {
      ...config,
      pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000,
        ...config.pool
      }
    };

    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'database.log' })
      ]
    });

    this.setupEventHandlers();
  }

  /**
   * Инициализация подключения к базе данных
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Инициализация DatabaseManager...');
      
      const sequelizeOptions: Options = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        username: this.config.username,
        password: this.config.password,
        dialect: this.config.dialect,
        pool: this.config.pool,
        logging: this.createQueryLogger(),
        dialectOptions: this.config.dialectOptions,
        retry: {
          match: [
            /ConnectionError/,
            /ConnectionTimedOutError/,
            /TimeoutError/,
            /SequelizeTimeoutError/
          ],
          max: 3
        },
        hooks: {
          beforeQuery: this.beforeQueryHook.bind(this),
          afterQuery: this.afterQueryHook.bind(this)
        }
      };

      this.sequelize = new Sequelize(sequelizeOptions);
      
      // Тестируем подключение
      await this.testConnection();
      
      this.isConnected = true;
      this.connectionRetries = 0;
      
      // Запускаем мониторинг
      this.startHealthChecks();
      
      this.emit('connected');
      this.logger.info('DatabaseManager успешно инициализирован');
      
    } catch (error) {
      this.logger.error('Ошибка инициализации DatabaseManager:', error);
      await this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * Тестирование подключения к базе данных
   */
  async testConnection(): Promise<void> {
    if (!this.sequelize) {
      throw new Error('Sequelize не инициализирован');
    }

    const startTime = Date.now();
    
    try {
      await this.sequelize.authenticate();
      const latency = Date.now() - startTime;
      
      this.logger.info('Подключение к базе данных установлено', { latency });
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Ошибка подключения к базе данных:', error);
      throw error;
    }
  }

  /**
   * Получение экземпляра Sequelize
   */
  getSequelize(): Sequelize {
    if (!this.sequelize || !this.isConnected) {
      throw new Error('База данных не инициализирована или недоступна');
    }
    return this.sequelize;
  }

  /**
   * Выполнение параметризованного SQL запроса с защитой от SQL injection
   */
  async query<T = any>(
    sql: string, 
    replacements?: Record<string, any>,
    options?: {
      type?: QueryTypes;
      transaction?: any;
      raw?: boolean;
      nest?: boolean;
    }
  ): Promise<T> {
    if (!this.sequelize) {
      throw new Error('База данных не инициализирована');
    }

    // КРИТИЧЕСКАЯ ЗАЩИТА: Валидация SQL запроса
    this.validateSqlQuery(sql);
    
    // Валидация параметров замены
    if (replacements) {
      this.validateReplacements(replacements);
    }

    const startTime = Date.now();
    
    try {
      this.stats.activeQueries++;
      this.stats.totalQueries++;
      
      const result = await this.sequelize.query(sql, {
        type: options?.type || QueryTypes.SELECT,
        replacements: replacements || {},
        transaction: options?.transaction,
        raw: options?.raw !== false, // По умолчанию true для безопасности
        nest: options?.nest !== false, // По умолчанию true
        // Дополнительная защита
        bind: replacements ? Object.values(replacements) : []
      });
      
      const queryTime = Date.now() - startTime;
      this.updateQueryStats(queryTime);
      
      return result as T;
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Ошибка выполнения SQL запроса:', { 
        sql: sql.substring(0, 200) + '...', // Ограничиваем логирование SQL
        error: (error as Error).message 
      });
      throw error;
    } finally {
      this.stats.activeQueries--;
      this.stats.lastQuery = new Date();
    }
  }

  /**
   * Безопасное выполнение модифицирующих SQL запросов
   */
  async executeModifyingQuery<T = any>(
    sql: string,
    replacements?: Record<string, any>,
    options?: {
      type: QueryTypes.INSERT | QueryTypes.UPDATE | QueryTypes.DELETE | QueryTypes.BULKUPDATE | QueryTypes.BULKDELETE | QueryTypes.RAW;
      transaction?: any;
      confirmOperation: boolean;
    }
  ): Promise<T> {
    if (!options?.confirmOperation) {
      throw new Error('Modifying operations require explicit confirmation');
    }

    // Валидация SQL и параметров
    this.validateSqlQuery(sql);
    if (replacements) {
      this.validateReplacements(replacements);
    }

    // Проверяем тип операции
    const sqlLower = sql.trim().toLowerCase();
    const allowedOperations = ['insert', 'update', 'delete', 'create temp table', 'drop table health_check_test'];
    const isAllowed = allowedOperations.some(op => sqlLower.startsWith(op)) || 
                     sqlLower.includes('temp table health_check_test') ||
                     sqlLower === 'drop table health_check_test';
    
    if (!isAllowed) {
      throw new Error(`Operation not allowed. Permitted operations: ${allowedOperations.join(', ')}`);
    }

    return this.query<T>(sql, replacements, {
      type: options.type,
      transaction: options.transaction
    });
  }

  /**
   * Валидация SQL запроса для предотвращения injection атак
   */
  private validateSqlQuery(sql: string): void {
    if (!sql || typeof sql !== 'string') {
      throw new Error('SQL query must be a non-empty string');
    }

    // Удаляем комментарии и лишние пробелы
    const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    
    if (!cleanSql) {
      throw new Error('SQL query cannot be empty after cleanup');
    }

    // Проверяем на опасные конструкции (с исключениями для health check)
    const isHealthCheckQuery = cleanSql.includes('health_check_test') || cleanSql.includes('temp table');
    
    const dangerousPatterns = [
      /;\s*delete\s+from\s+/i,  // Stacked DELETE
      /;\s*update\s+.*set\s+/i, // Stacked UPDATE  
      /;\s*insert\s+into\s+/i,  // Stacked INSERT
      /;\s*alter\s+/i,          // ALTER statements
      /;\s*truncate\s+/i,       // TRUNCATE statements
      /union\s+select/i,        // UNION-based injection
      /'\s*or\s+'.*?'/i,        // OR-based injection
      /'\s*and\s+'.*?'/i,       // AND-based injection
      /xp_cmdshell/i,           // Command execution
      /sp_executesql/i,         // Dynamic SQL execution
      /exec\s*\(/i,             // EXEC statements
      /eval\s*\(/i,             // EVAL statements
      /copy\s+.*from\s+program/i, // PostgreSQL COPY with program
      /pg_read_file/i,          // PostgreSQL file reading
      /pg_ls_dir/i,             // PostgreSQL directory listing
    ];

    // Дополнительные проверки для не-health check запросов
    if (!isHealthCheckQuery) {
      dangerousPatterns.push(
        /;\s*drop\s+/i,         // DROP statements
        /;\s*create\s+/i,       // CREATE statements
      );
    }

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
  private validateReplacements(replacements: Record<string, any>): void {
    if (!replacements || typeof replacements !== 'object') {
      return;
    }

    Object.entries(replacements).forEach(([key, value]) => {
      // Валидация ключей
      if (!key || typeof key !== 'string') {
        throw new Error('Replacement keys must be non-empty strings');
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw new Error(`Invalid replacement key: ${key}. Only alphanumeric characters and underscores allowed`);
      }

      // Валидация значений
      if (typeof value === 'string') {
        if (value.length > 1000) {
          throw new Error('Replacement string values cannot exceed 1000 characters');
        }

        // Проверка на опасные паттерны в строках
        const dangerousStringPatterns = [
          /'\s*;\s*/,               // SQL statement termination
          /'\s*union\s+/i,          // UNION injection
          /'\s*or\s+'.*?'/i,        // OR injection
          /'\s*and\s+'.*?'/i,       // AND injection
          /<script/i,               // XSS prevention
          /javascript:/i,           // JavaScript protocol
        ];

        for (const pattern of dangerousStringPatterns) {
          if (pattern.test(value)) {
            throw new Error(`Replacement value contains dangerous pattern: ${pattern.source}`);
          }
        }
      }

      // Проверка типов
      const allowedTypes = ['string', 'number', 'boolean'];
      const valueType = typeof value;
      if (value !== null && value !== undefined && !allowedTypes.includes(valueType)) {
        throw new Error(`Invalid replacement value type: ${valueType}`);
      }
    });

    if (Object.keys(replacements).length > 50) {
      throw new Error('Too many replacement parameters (max 50)');
    }
  }

  /**
   * Выполнение транзакции
   */
  async transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    if (!this.sequelize) {
      throw new Error('База данных не инициализирована');
    }

    return await this.sequelize.transaction(callback);
  }

  /**
   * Проверка здоровья базы данных
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date(),
      latency: 0,
      connectionPool: this.getConnectionPoolInfo(),
      details: {
        canConnect: false,
        canQuery: false,
        canWrite: false
      },
      errors: []
    };

    try {
      // Проверка подключения
      if (this.sequelize) {
        await this.sequelize.authenticate();
        result.details.canConnect = true;
      }

      // Проверка чтения
      try {
        await this.query('SELECT 1 as test');
        result.details.canQuery = true;
      } catch (error) {
        result.errors?.push(`Query test failed: ${error}`);
      }

      // Проверка записи (создаем временную таблицу)
      try {
        await this.executeModifyingQuery(
          'CREATE TEMP TABLE health_check_test (id INTEGER)',
          {},
          { type: QueryTypes.RAW, confirmOperation: true }
        );
        await this.executeModifyingQuery(
          'INSERT INTO health_check_test (id) VALUES (:testId)',
          { testId: 1 },
          { type: QueryTypes.INSERT, confirmOperation: true }
        );
        await this.executeModifyingQuery(
          'DROP TABLE health_check_test',
          {},
          { type: QueryTypes.RAW, confirmOperation: true }
        );
        result.details.canWrite = true;
      } catch (error) {
        result.errors?.push(`Write test failed: ${error}`);
      }

      // Получение версии БД (безопасный запрос)
      try {
        const version = await this.query('SELECT version() as version');
        result.details.version = Array.isArray(version) && version[0] ? (version[0] as any).version : 'unknown';
      } catch (error) {
        // Игнорируем ошибки получения версии
      }

      result.latency = Date.now() - startTime;

      // Определяем общий статус
      if (!result.details.canConnect || !result.details.canQuery) {
        result.status = 'critical';
      } else if (!result.details.canWrite || result.latency > 1000) {
        result.status = 'warning';
      }

    } catch (error) {
      result.status = 'critical';
      result.errors?.push(`Health check failed: ${error}`);
      result.latency = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Получение статистики базы данных
   */
  getStats(): DatabaseStats {
    return {
      ...this.stats,
      connections: this.getConnectionPoolInfo(),
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  /**
   * Подключение к базе данных (алиас для initialize)
   */
  async connect(): Promise<void> {
    return await this.initialize();
  }

  /**
   * Отключение от базы данных (алиас для close)
   */
  async disconnect(): Promise<void> {
    return await this.shutdown();
  }

  /**
   * Получение статуса здоровья БД (алиас для healthCheck)
   */
  async getHealthStatus(): Promise<HealthCheckResult> {
    return await this.healthCheck();
  }

  /**
   * Закрытие соединения (алиас для shutdown)
   */
  async close(): Promise<void> {
    return await this.shutdown();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('Закрытие DatabaseManager...');
      
      // Останавливаем таймеры
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }

      // Закрываем подключения
      if (this.sequelize) {
        await this.sequelize.close();
      }

      this.isConnected = false;
      this.emit('disconnected');
      
      this.logger.info('DatabaseManager закрыт');
      
    } catch (error) {
      this.logger.error('Ошибка при закрытии DatabaseManager:', error);
      throw error;
    }
  }

  // Приватные методы

  private setupEventHandlers(): void {
    this.on('error', (error) => {
      this.logger.error('Database error:', error);
      this.stats.errors++;
    });

    this.on('reconnecting', () => {
      this.logger.warn('Переподключение к базе данных...');
      this.stats.reconnects++;
    });

    this.on('reconnected', () => {
      this.logger.info('Переподключение к базе данных успешно');
      this.isConnected = true;
      this.connectionRetries = 0;
    });
  }

  private createQueryLogger() {
    if (this.config.logging === false) {
      return false;
    }
    
    if (typeof this.config.logging === 'function') {
      return this.config.logging;
    }

    return (sql: string, timing?: number) => {
      this.logger.debug('SQL Query:', { sql, timing });
    };
  }

  private beforeQueryHook(): void {
    this.stats.activeQueries++;
    this.stats.totalQueries++;
  }

  private afterQueryHook(): void {
    this.stats.activeQueries--;
    this.stats.lastQuery = new Date();
  }

  private updateQueryStats(queryTime: number): void {
    this.queryTimes.push(queryTime);
    
    // Держим только последние 1000 запросов для расчета среднего
    if (this.queryTimes.length > 1000) {
      this.queryTimes = this.queryTimes.slice(-1000);
    }
    
    this.stats.avgQueryTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  private getConnectionPoolInfo(): ConnectionPoolInfo {
    if (!this.sequelize) {
      return { size: 0, used: 0, waiting: 0 };
    }

    const pool = (this.sequelize as any).connectionManager?.pool;
    if (!pool) {
      return { size: 0, used: 0, waiting: 0 };
    }

    return {
      size: pool.size || 0,
      used: pool.used || 0,
      waiting: pool.pending || 0
    };
  }

  private async handleConnectionError(error: Error): Promise<void> {
    this.isConnected = false;
    this.emit('error', error);

    if (this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      this.emit('reconnecting');
      
      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.initialize();
          this.emit('reconnected');
        } catch (retryError) {
          await this.handleConnectionError(retryError as Error);
        }
      }, this.retryDelay * this.connectionRetries);
    } else {
      this.logger.error('Превышено максимальное количество попыток переподключения');
      this.emit('maxRetriesExceeded');
    }
  }

  private startHealthChecks(): void {
    // Запускаем проверку здоровья каждые 30 секунд
    this.healthCheckTimer = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        
        if (health.status === 'critical') {
          this.emit('healthCritical', health);
        } else if (health.status === 'warning') {
          this.emit('healthWarning', health);
        }
        
        this.emit('healthCheck', health);
        
      } catch (error) {
        this.logger.error('Ошибка проверки здоровья БД:', error);
      }
    }, 30000);
  }
}

export default DatabaseManager;
export type { DatabaseConfig, DatabaseStats, HealthCheckResult, ConnectionPoolInfo };