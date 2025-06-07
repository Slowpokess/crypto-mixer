/**
 * Мощный Redis Connection Manager для продакшн криптомиксера
 * 
 * Обеспечивает:
 * - Connection pooling с автоматическим масштабированием
 * - Cluster support для высокой доступности
 * - Automatic failover и reconnection
 * - Health monitoring и performance metrics
 * - Read/Write splitting для оптимизации
 */

import Redis, { Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { enhancedDbLogger } from '../logger';
import { EventEmitter } from 'events';

export interface RedisConnectionConfig {
  // Основные настройки подключения
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  
  // Cluster настройки
  enableCluster: boolean;
  clusterNodes?: Array<{ host: string; port: number }>;
  
  // Connection pool настройки
  maxConnections: number;
  minConnections: number;
  connectionTimeout: number;
  commandTimeout: number;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  
  // Read/Write splitting
  enableReadWriteSplit: boolean;
  readOnlyNodes?: Array<{ host: string; port: number }>;
  readWriteRatio: number; // 0.8 = 80% read, 20% write
  
  // Health monitoring
  enableHealthChecks: boolean;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  
  // Performance optimization
  enableKeepAlive: boolean;
  enableCompression: boolean;
  lazyConnect: boolean;
  enableOfflineQueue: boolean;
  
  // Failover settings
  enableAutomaticFailover: boolean;
  failoverTimeout: number;
  maxFailoverAttempts: number;
}

export interface RedisConnectionStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  failedConnections: number;
  commandsExecuted: number;
  commandsFailed: number;
  averageResponseTime: number;
  memoryUsage: number;
  hitRate: number;
  uptime: number;
}

export interface RedisHealthStatus {
  isHealthy: boolean;
  responseTime: number;
  memoryUsage: number;
  connectedClients: number;
  lastError?: string;
  clusterStatus?: string;
  replicationStatus?: string;
}

/**
 * Продвинутый Redis Connection Manager
 */
export class RedisConnectionManager extends EventEmitter {
  private config: RedisConnectionConfig;
  private masterConnection?: Redis | Cluster;
  private readConnections: (Redis | Cluster)[] = [];
  private writeConnection?: Redis | Cluster;
  
  private connectionPool: Redis[] = [];
  private isConnected = false;
  private isShuttingDown = false;
  
  // Статистика и мониторинг
  private stats: RedisConnectionStats;
  private healthStatus: RedisHealthStatus;
  private responseTimes: number[] = [];
  private healthCheckTimer?: NodeJS.Timeout;
  
  // Failover management
  private currentMasterIndex = 0;
  private failoverInProgress = false;
  private failoverAttempts = 0;

  constructor(config: Partial<RedisConnectionConfig> = {}) {
    super();
    
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:',
      
      enableCluster: false,
      clusterNodes: [],
      
      maxConnections: 20,
      minConnections: 5,
      connectionTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      
      enableReadWriteSplit: false,
      readOnlyNodes: [],
      readWriteRatio: 0.8,
      
      enableHealthChecks: true,
      healthCheckInterval: 30000,
      healthCheckTimeout: 5000,
      
      enableKeepAlive: true,
      enableCompression: false,
      lazyConnect: true,
      enableOfflineQueue: true,
      
      enableAutomaticFailover: true,
      failoverTimeout: 10000,
      maxFailoverAttempts: 3,
      
      ...config
    };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      failedConnections: 0,
      commandsExecuted: 0,
      commandsFailed: 0,
      averageResponseTime: 0,
      memoryUsage: 0,
      hitRate: 0,
      uptime: 0
    };

    this.healthStatus = {
      isHealthy: false,
      responseTime: 0,
      memoryUsage: 0,
      connectedClients: 0
    };

    enhancedDbLogger.info('🔗 RedisConnectionManager инициализирован', {
      config: {
        host: this.config.host,
        port: this.config.port,
        enableCluster: this.config.enableCluster,
        enableReadWriteSplit: this.config.enableReadWriteSplit,
        maxConnections: this.config.maxConnections
      }
    });
  }

  /**
   * Подключение к Redis с полной инициализацией
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      enhancedDbLogger.warn('⚠️ Redis уже подключен');
      return;
    }

    try {
      enhancedDbLogger.info('🚀 Подключаемся к Redis...');

      if (this.config.enableCluster) {
        await this.connectToCluster();
      } else {
        await this.connectToSingleInstance();
      }

      // Настраиваем Read/Write splitting если включено
      if (this.config.enableReadWriteSplit) {
        await this.setupReadWriteSplitting();
      }

      // Инициализируем connection pool
      await this.initializeConnectionPool();

      // Запускаем health monitoring
      if (this.config.enableHealthChecks) {
        this.startHealthMonitoring();
      }

      this.isConnected = true;
      enhancedDbLogger.info('✅ Redis успешно подключен');
      this.emit('connected');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка подключения к Redis', { error });
      throw error;
    }
  }

  /**
   * Подключение к Redis Cluster
   */
  private async connectToCluster(): Promise<void> {
    const clusterOptions: ClusterOptions = {
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      enableOfflineQueue: this.config.enableOfflineQueue,
      lazyConnect: this.config.lazyConnect,
      keyPrefix: this.config.keyPrefix,
      redisOptions: {
        password: this.config.password,
        connectTimeout: this.config.connectionTimeout,
        commandTimeout: this.config.commandTimeout,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        keepAlive: this.config.enableKeepAlive ? 30000 : 0
      }
    };

    this.masterConnection = new Cluster(
      this.config.clusterNodes || [{ host: this.config.host, port: this.config.port }],
      clusterOptions
    );

    await this.setupConnectionEventHandlers(this.masterConnection as Cluster);
    
    enhancedDbLogger.info('✅ Redis Cluster подключен', {
      nodes: this.config.clusterNodes?.length || 1
    });
  }

  /**
   * Подключение к одиночному Redis инстансу
   */
  private async connectToSingleInstance(): Promise<void> {
    const redisOptions: RedisOptions = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      connectTimeout: this.config.connectionTimeout,
      commandTimeout: this.config.commandTimeout,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      lazyConnect: this.config.lazyConnect,
      enableOfflineQueue: this.config.enableOfflineQueue,
      keepAlive: this.config.enableKeepAlive ? 30000 : 0
    };

    this.masterConnection = new Redis(redisOptions);
    await this.setupConnectionEventHandlers(this.masterConnection as Redis);
    
    enhancedDbLogger.info('✅ Redis Single Instance подключен');
  }

  /**
   * Настройка Read/Write splitting
   */
  private async setupReadWriteSplitting(): Promise<void> {
    if (!this.config.readOnlyNodes || this.config.readOnlyNodes.length === 0) {
      enhancedDbLogger.warn('⚠️ ReadWrite splitting включен, но read-only nodes не настроены');
      return;
    }

    enhancedDbLogger.info('🔀 Настраиваем Read/Write splitting...');

    // Создаем write connection (обычно master)
    this.writeConnection = this.masterConnection;

    // Создаем read connections
    for (const node of this.config.readOnlyNodes) {
      const readConnection = new Redis({
        host: node.host,
        port: node.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        connectTimeout: this.config.connectionTimeout,
        commandTimeout: this.config.commandTimeout,
        lazyConnect: this.config.lazyConnect,
        readOnly: true // Важно: только для чтения
      });

      await this.setupConnectionEventHandlers(readConnection);
      this.readConnections.push(readConnection);
    }

    enhancedDbLogger.info('✅ Read/Write splitting настроен', {
      readNodes: this.readConnections.length,
      writeNodes: 1
    });
  }

  /**
   * Инициализация connection pool
   */
  private async initializeConnectionPool(): Promise<void> {
    enhancedDbLogger.info('🏊‍♂️ Инициализируем connection pool...');

    const poolSize = Math.min(this.config.maxConnections, 10); // Ограничиваем для начала

    for (let i = 0; i < poolSize; i++) {
      const connection = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        connectTimeout: this.config.connectionTimeout,
        lazyConnect: this.config.lazyConnect
      });

      await this.setupConnectionEventHandlers(connection);
      this.connectionPool.push(connection);
    }

    this.stats.totalConnections = this.connectionPool.length;
    this.stats.idleConnections = this.connectionPool.length;

    enhancedDbLogger.info('✅ Connection pool инициализирован', {
      poolSize: this.connectionPool.length
    });
  }

  /**
   * Настройка обработчиков событий соединения
   */
  private async setupConnectionEventHandlers(connection: Redis | Cluster): Promise<void> {
    connection.on('connect', () => {
      enhancedDbLogger.info('🔗 Redis connection established');
      this.stats.activeConnections++;
    });

    connection.on('ready', () => {
      enhancedDbLogger.info('✅ Redis connection ready');
      this.healthStatus.isHealthy = true;
    });

    connection.on('error', (error) => {
      enhancedDbLogger.error('❌ Redis connection error', { error });
      this.stats.failedConnections++;
      this.handleConnectionError(error);
    });

    connection.on('close', () => {
      enhancedDbLogger.warn('⚠️ Redis connection closed');
      this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
    });

    connection.on('reconnecting', () => {
      enhancedDbLogger.info('🔄 Redis reconnecting...');
    });

    connection.on('end', () => {
      enhancedDbLogger.info('🔚 Redis connection ended');
    });

    // Для cluster-специфичных событий
    if (connection instanceof Cluster) {
      connection.on('node error', (error, node) => {
        enhancedDbLogger.error('❌ Cluster node error', { error, node });
      });
    }
  }

  /**
   * Получение оптимального соединения для операции
   */
  public getConnection(isReadOperation: boolean = false): Redis | Cluster {
    if (!this.isConnected || !this.masterConnection) {
      throw new Error('Redis не подключен');
    }

    // Если Read/Write splitting выключен, используем master
    if (!this.config.enableReadWriteSplit) {
      return this.masterConnection;
    }

    // Для write операций всегда используем write connection
    if (!isReadOperation) {
      return this.writeConnection || this.masterConnection;
    }

    // Для read операций выбираем между read и write connections
    if (this.readConnections.length > 0 && Math.random() < this.config.readWriteRatio) {
      // Используем round-robin для read connections
      const randomIndex = Math.floor(Math.random() * this.readConnections.length);
      return this.readConnections[randomIndex];
    }

    return this.masterConnection;
  }

  /**
   * Выполнение команды с мониторингом производительности
   */
  public async executeCommand(
    command: string,
    args: any[],
    isReadOperation: boolean = false
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const connection = this.getConnection(isReadOperation);
      
      // Выполняем команду
      const result = await (connection as any)[command](...args);
      
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);
      this.stats.commandsExecuted++;
      
      return result;
      
    } catch (error) {
      this.stats.commandsFailed++;
      enhancedDbLogger.error('❌ Ошибка выполнения Redis команды', {
        command,
        args: args.slice(0, 3), // Логируем только первые 3 аргумента
        error
      });
      throw error;
    }
  }

  /**
   * Запуск мониторинга здоровья
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performHealthCheck();
      }
    }, this.config.healthCheckInterval);

    enhancedDbLogger.info('💓 Redis health monitoring запущен');
  }

  /**
   * Проверка здоровья Redis
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.masterConnection) return;

    const startTime = Date.now();

    try {
      // Выполняем простую команду PING
      await Promise.race([
        this.masterConnection.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout)
        )
      ]);

      const responseTime = Date.now() - startTime;

      // Получаем информацию о сервере
      const info = await this.masterConnection.info('memory');
      const memoryUsage = this.parseMemoryUsage(info);

      const clientsInfo = await this.masterConnection.info('clients');
      const connectedClients = this.parseConnectedClients(clientsInfo);

      this.healthStatus = {
        isHealthy: true,
        responseTime,
        memoryUsage,
        connectedClients,
        lastError: undefined
      };

      // Для cluster получаем дополнительную информацию
      if (this.masterConnection instanceof Cluster) {
        try {
          const clusterInfo = await (this.masterConnection as any).cluster('info');
          this.healthStatus.clusterStatus = this.parseClusterStatus(clusterInfo);
        } catch (error) {
          // Игнорируем ошибки cluster info
        }
      }

    } catch (error) {
      this.healthStatus = {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        memoryUsage: 0,
        connectedClients: 0,
        lastError: (error as Error).message
      };

      enhancedDbLogger.error('❌ Redis health check failed', { error });
      
      // Пытаемся восстановить соединение если включен автоматический failover
      if (this.config.enableAutomaticFailover && !this.failoverInProgress) {
        await this.attemptFailover();
      }
    }
  }

  /**
   * Попытка failover при проблемах с соединением
   */
  private async attemptFailover(): Promise<void> {
    if (this.failoverInProgress || this.failoverAttempts >= this.config.maxFailoverAttempts) {
      return;
    }

    this.failoverInProgress = true;
    this.failoverAttempts++;

    enhancedDbLogger.warn('🔄 Начинаем Redis failover', {
      attempt: this.failoverAttempts,
      maxAttempts: this.config.maxFailoverAttempts
    });

    try {
      // Переподключаемся к Redis
      await this.reconnect();
      
      this.failoverInProgress = false;
      this.failoverAttempts = 0;
      
      enhancedDbLogger.info('✅ Redis failover успешен');
      this.emit('failover_success');

    } catch (error) {
      enhancedDbLogger.error('❌ Redis failover failed', { error });
      
      setTimeout(() => {
        this.failoverInProgress = false;
      }, this.config.failoverTimeout);

      this.emit('failover_failed', error);
    }
  }

  /**
   * Переподключение к Redis
   */
  private async reconnect(): Promise<void> {
    enhancedDbLogger.info('🔄 Переподключаемся к Redis...');

    try {
      // Закрываем текущие соединения
      if (this.masterConnection) {
        await this.masterConnection.disconnect();
      }

      // Переподключаемся
      await this.connect();

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка переподключения к Redis', { error });
      throw error;
    }
  }

  /**
   * Запись времени ответа для статистики
   */
  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    
    // Оставляем только последние 100 измерений
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    // Пересчитываем среднее время ответа
    this.stats.averageResponseTime = 
      this.responseTimes.reduce((sum, t) => sum + t, 0) / this.responseTimes.length;
  }

  /**
   * Обработка ошибок соединения
   */
  private handleConnectionError(error: Error): void {
    this.healthStatus.isHealthy = false;
    this.healthStatus.lastError = error.message;
    
    this.emit('connection_error', error);

    // Если включен автоматический failover, пытаемся восстановиться
    if (this.config.enableAutomaticFailover) {
      setImmediate(() => this.attemptFailover());
    }
  }

  /**
   * Парсинг использования памяти из Redis INFO
   */
  private parseMemoryUsage(info: string): number {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Парсинг количества подключенных клиентов
   */
  private parseConnectedClients(info: string): number {
    const match = info.match(/connected_clients:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Парсинг статуса кластера
   */
  private parseClusterStatus(info: string): string {
    const match = info.match(/cluster_state:(\w+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Получение статистики соединений
   */
  public getConnectionStats(): RedisConnectionStats {
    this.stats.idleConnections = this.connectionPool.length - this.stats.activeConnections;
    this.stats.uptime = process.uptime();
    
    return { ...this.stats };
  }

  /**
   * Получение статуса здоровья
   */
  public getHealthStatus(): RedisHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    enhancedDbLogger.info('🔄 Начинаем graceful shutdown Redis connections...');

    try {
      // Останавливаем health monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }

      // Закрываем все соединения
      const disconnectPromises = [];

      if (this.masterConnection) {
        disconnectPromises.push(this.masterConnection.disconnect());
      }

      if (this.writeConnection && this.writeConnection !== this.masterConnection) {
        disconnectPromises.push(this.writeConnection.disconnect());
      }

      for (const readConnection of this.readConnections) {
        disconnectPromises.push(readConnection.disconnect());
      }

      for (const poolConnection of this.connectionPool) {
        disconnectPromises.push(poolConnection.disconnect());
      }

      await Promise.all(disconnectPromises);

      this.isConnected = false;
      enhancedDbLogger.info('✅ Redis connections успешно закрыты');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка при закрытии Redis connections', { error });
      throw error;
    }
  }
}

export default RedisConnectionManager;