/**
 * Redis Master Manager - Центральная система управления Redis
 * 
 * Объединяет все Redis компоненты:
 * - Connection Management
 * - Cache Layer
 * - Critical Data Caching
 * - Session Management
 * - Monitoring & Health Checks
 * - Performance Analytics
 */

import { RedisConnectionManager } from './RedisConnectionManager';
import { RedisCacheLayer } from './RedisCacheLayer';
import { CriticalDataCacheManager } from './CriticalDataCacheManager';
import { RedisSessionManager } from './RedisSessionManager';
import { enhancedDbLogger } from '../logger';
import { EventEmitter } from 'events';

export interface RedisMasterConfig {
  // Connection settings
  connection: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    enableCluster: boolean;
    enableReadWriteSplit: boolean;
  };

  // Cache settings
  cache: {
    defaultTTL: number;
    enableCompression: boolean;
    enableMultiLevel: boolean;
    enableBatching: boolean;
  };

  // Monitoring settings
  monitoring: {
    enableHealthChecks: boolean;
    healthCheckInterval: number;
    enablePerformanceTracking: boolean;
    enableAnalytics: boolean;
  };

  // Security settings
  security: {
    enableRateLimiting: boolean;
    enableAntiSpam: boolean;
    enableDistributedLocking: boolean;
  };
}

export interface RedisSystemHealth {
  overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  components: {
    connection: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    cache: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    sessions: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    performance: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  lastCheck: Date;
  details: {
    connectionStats: any;
    cacheStats: any;
    sessionStats: any;
    memoryUsage: number;
    responseTime: number;
  };
}

export interface RedisPerformanceMetrics {
  connections: {
    total: number;
    active: number;
    failed: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
    memoryUsage: number;
  };
  operations: {
    commandsPerSecond: number;
    averageLatency: number;
    errorRate: number;
  };
  sessions: {
    active: number;
    rateLimitViolations: number;
    blockedUsers: number;
  };
}

/**
 * Центральная система управления Redis для криптомиксера
 */
export class RedisMasterManager extends EventEmitter {
  private config: RedisMasterConfig;
  
  // Core компоненты
  private connectionManager!: RedisConnectionManager;
  private cacheLayer!: RedisCacheLayer;
  private criticalDataManager!: CriticalDataCacheManager;
  private sessionManager!: RedisSessionManager;
  
  // Мониторинг и статистика
  private systemHealth!: RedisSystemHealth;
  private performanceMetrics!: RedisPerformanceMetrics;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  
  private isInitialized = false;
  private isShuttingDown = false;

  constructor(config: Partial<RedisMasterConfig> = {}) {
    super();

    this.config = {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:',
        enableCluster: false,
        enableReadWriteSplit: false,
        ...config.connection
      },
      cache: {
        defaultTTL: 3600,
        enableCompression: true,
        enableMultiLevel: true,
        enableBatching: true,
        ...config.cache
      },
      monitoring: {
        enableHealthChecks: true,
        healthCheckInterval: 30000,
        enablePerformanceTracking: true,
        enableAnalytics: true,
        ...config.monitoring
      },
      security: {
        enableRateLimiting: true,
        enableAntiSpam: true,
        enableDistributedLocking: true,
        ...config.security
      }
    };

    this.initializeHealthStatus();
    this.initializePerformanceMetrics();

    enhancedDbLogger.info('🚀 RedisMasterManager создан', {
      host: this.config.connection.host,
      port: this.config.connection.port,
      enableCluster: this.config.connection.enableCluster
    });
  }

  /**
   * Полная инициализация Redis системы
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      enhancedDbLogger.warn('⚠️ Redis система уже инициализирована');
      return;
    }

    try {
      enhancedDbLogger.info('🔄 Инициализация Redis системы...');

      // 1. Инициализация Connection Manager
      enhancedDbLogger.info('🔗 Инициализация Redis Connection Manager...');
      this.connectionManager = new RedisConnectionManager({
        host: this.config.connection.host,
        port: this.config.connection.port,
        password: this.config.connection.password,
        db: this.config.connection.db,
        keyPrefix: this.config.connection.keyPrefix,
        enableCluster: this.config.connection.enableCluster,
        enableReadWriteSplit: this.config.connection.enableReadWriteSplit,
        enableHealthChecks: this.config.monitoring.enableHealthChecks,
        maxConnections: 20,
        minConnections: 5
      });

      await this.connectionManager.connect();
      this.setupConnectionEventHandlers();

      // 2. Инициализация Cache Layer
      enhancedDbLogger.info('🗄️ Инициализация Redis Cache Layer...');
      this.cacheLayer = new RedisCacheLayer(this.connectionManager, {
        defaultTTL: this.config.cache.defaultTTL,
        enableCompression: this.config.cache.enableCompression,
        enableMultiLevel: this.config.cache.enableMultiLevel,
        enableBatching: this.config.cache.enableBatching,
        enableAnalytics: this.config.monitoring.enableAnalytics
      });

      this.setupCacheEventHandlers();

      // 3. Инициализация Critical Data Manager
      enhancedDbLogger.info('🔒 Инициализация Critical Data Manager...');
      this.criticalDataManager = new CriticalDataCacheManager(this.cacheLayer);
      this.setupCriticalDataEventHandlers();

      // 4. Инициализация Session Manager
      enhancedDbLogger.info('🔐 Инициализация Session Manager...');
      this.sessionManager = new RedisSessionManager(this.cacheLayer);
      this.setupSessionEventHandlers();

      // 5. Запуск мониторинга
      if (this.config.monitoring.enableHealthChecks) {
        this.startHealthMonitoring();
      }

      if (this.config.monitoring.enablePerformanceTracking) {
        this.startPerformanceTracking();
      }

      this.isInitialized = true;
      enhancedDbLogger.info('✅ Redis система полностью инициализирована');
      this.emit('initialized');

      // Первоначальная проверка здоровья
      await this.performHealthCheck();

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации Redis системы', { error });
      throw error;
    }
  }

  /**
   * Настройка обработчиков событий Connection Manager
   */
  private setupConnectionEventHandlers(): void {
    this.connectionManager.on('connected', () => {
      enhancedDbLogger.info('✅ Redis подключение установлено');
      this.systemHealth.components.connection = 'HEALTHY';
      this.emit('redis_connected');
    });

    this.connectionManager.on('connection_error', (error) => {
      enhancedDbLogger.error('❌ Ошибка Redis подключения', { error });
      this.systemHealth.components.connection = 'CRITICAL';
      this.emit('redis_connection_error', error);
    });

    this.connectionManager.on('failover_success', () => {
      enhancedDbLogger.info('✅ Redis failover выполнен успешно');
      this.systemHealth.components.connection = 'WARNING';
      this.emit('redis_failover_success');
    });

    this.connectionManager.on('failover_failed', (error) => {
      enhancedDbLogger.error('❌ Redis failover неуспешен', { error });
      this.systemHealth.components.connection = 'CRITICAL';
      this.emit('redis_failover_failed', error);
    });
  }

  /**
   * Настройка обработчиков событий Cache Layer
   */
  private setupCacheEventHandlers(): void {
    this.cacheLayer.on('cache_invalidated', (data) => {
      enhancedDbLogger.debug('🗑️ Кэш инвалидирован', data);
    });

    // Мониторинг производительности кэша
    setInterval(() => {
      const cacheStats = this.cacheLayer.getStats();
      if (cacheStats.hitRate < 50) {
        this.systemHealth.components.cache = 'WARNING';
        enhancedDbLogger.warn('⚠️ Низкий hit rate кэша', { hitRate: cacheStats.hitRate });
      } else if (cacheStats.hitRate < 30) {
        this.systemHealth.components.cache = 'CRITICAL';
        enhancedDbLogger.error('❌ Критически низкий hit rate кэша', { hitRate: cacheStats.hitRate });
      } else {
        this.systemHealth.components.cache = 'HEALTHY';
      }
    }, 60000); // Каждую минуту
  }

  /**
   * Настройка обработчиков событий Critical Data Manager
   */
  private setupCriticalDataEventHandlers(): void {
    this.criticalDataManager.on('mixing_session_cached', (session) => {
      enhancedDbLogger.debug('💾 Mixing session кэширована', { 
        sessionId: session.id,
        status: session.status 
      });
    });

    this.criticalDataManager.on('address_blacklisted', (data) => {
      enhancedDbLogger.warn('🚫 Адрес добавлен в blacklist', { 
        address: data.address.substring(0, 10) + '...',
        reason: data.reason 
      });
      this.emit('security_alert', { type: 'address_blacklisted', data });
    });
  }

  /**
   * Настройка обработчиков событий Session Manager
   */
  private setupSessionEventHandlers(): void {
    this.sessionManager.on('session_created', (session) => {
      enhancedDbLogger.debug('🔑 Новая сессия создана', { 
        sessionId: session.id,
        isAuthenticated: session.isAuthenticated 
      });
    });

    this.sessionManager.on('rate_limit_exceeded', (data) => {
      enhancedDbLogger.warn('🚫 Rate limit превышен', { 
        identifier: data.identifier.substring(0, 16) + '...',
        requests: data.requests 
      });
      this.emit('security_alert', { type: 'rate_limit_exceeded', data });
    });

    this.sessionManager.on('user_blocked', (data) => {
      enhancedDbLogger.warn('🚫 Пользователь заблокирован', { 
        identifier: data.identifier.substring(0, 16) + '...',
        riskScore: data.riskScore 
      });
      this.emit('security_alert', { type: 'user_blocked', data });
    });

    this.sessionManager.on('lock_acquired', (lock) => {
      enhancedDbLogger.debug('🔒 Distributed lock получен', { 
        lockKey: lock.key,
        owner: lock.owner.substring(0, 16) + '...' 
      });
    });
  }

  /**
   * Запуск мониторинга здоровья системы
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performHealthCheck();
      }
    }, this.config.monitoring.healthCheckInterval);

    enhancedDbLogger.info('💓 Redis health monitoring запущен');
  }

  /**
   * Запуск отслеживания производительности
   */
  private startPerformanceTracking(): void {
    this.metricsTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.updatePerformanceMetrics();
      }
    }, 30000); // Каждые 30 секунд

    enhancedDbLogger.info('📊 Redis performance tracking запущен');
  }

  /**
   * Комплексная проверка здоровья Redis системы
   */
  async performHealthCheck(): Promise<RedisSystemHealth> {
    try {
      enhancedDbLogger.debug('🏥 Выполняем проверку здоровья Redis системы');

      // Проверка соединений
      const connectionHealth = this.connectionManager.getHealthStatus();
      const connectionStats = this.connectionManager.getConnectionStats();

      // Проверка кэша
      const cacheStats = this.cacheLayer.getStats();

      // Проверка сессий
      const sessionStats = this.sessionManager.getSessionStats();

      // Определяем общий статус производительности
      const avgResponseTime = connectionHealth.responseTime;
      if (avgResponseTime > 1000) {
        this.systemHealth.components.performance = 'CRITICAL';
      } else if (avgResponseTime > 500) {
        this.systemHealth.components.performance = 'WARNING';
      } else {
        this.systemHealth.components.performance = 'HEALTHY';
      }

      // Обновляем детали здоровья
      this.systemHealth.details = {
        connectionStats,
        cacheStats,
        sessionStats,
        memoryUsage: connectionHealth.memoryUsage,
        responseTime: avgResponseTime
      };

      this.systemHealth.lastCheck = new Date();

      // Определяем общий статус
      const componentStatuses = Object.values(this.systemHealth.components);
      if (componentStatuses.includes('CRITICAL')) {
        this.systemHealth.overall = 'CRITICAL';
      } else if (componentStatuses.includes('WARNING')) {
        this.systemHealth.overall = 'WARNING';
      } else {
        this.systemHealth.overall = 'HEALTHY';
      }

      // Эмитим события по состоянию
      if (this.systemHealth.overall === 'CRITICAL') {
        this.emit('system_critical', this.systemHealth);
      } else if (this.systemHealth.overall === 'WARNING') {
        this.emit('system_warning', this.systemHealth);
      }

      enhancedDbLogger.debug('✅ Redis health check завершен', {
        overall: this.systemHealth.overall,
        components: this.systemHealth.components
      });

      return { ...this.systemHealth };

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка health check Redis системы', { error });
      this.systemHealth.overall = 'CRITICAL';
      this.systemHealth.lastCheck = new Date();
      throw error;
    }
  }

  /**
   * Обновление метрик производительности
   */
  private updatePerformanceMetrics(): void {
    try {
      const connectionStats = this.connectionManager.getConnectionStats();
      const cacheStats = this.cacheLayer.getStats();
      
      this.performanceMetrics = {
        connections: {
          total: connectionStats.totalConnections,
          active: connectionStats.activeConnections,
          failed: connectionStats.failedConnections
        },
        cache: {
          hitRate: cacheStats.hitRate,
          missRate: cacheStats.missRate,
          evictionRate: cacheStats.evictionRate,
          memoryUsage: cacheStats.memoryUsage
        },
        operations: {
          commandsPerSecond: cacheStats.operationsPerSecond,
          averageLatency: connectionStats.averageResponseTime,
          errorRate: cacheStats.errorRate
        },
        sessions: {
          active: 0, // TODO: получать из session manager
          rateLimitViolations: 0,
          blockedUsers: 0
        }
      };

      enhancedDbLogger.debug('📊 Performance metrics обновлены', this.performanceMetrics);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка обновления performance metrics', { error });
    }
  }

  /**
   * Инициализация статуса здоровья
   */
  private initializeHealthStatus(): void {
    this.systemHealth = {
      overall: 'HEALTHY',
      components: {
        connection: 'HEALTHY',
        cache: 'HEALTHY',
        sessions: 'HEALTHY',
        performance: 'HEALTHY'
      },
      lastCheck: new Date(),
      details: {
        connectionStats: {},
        cacheStats: {},
        sessionStats: {},
        memoryUsage: 0,
        responseTime: 0
      }
    };
  }

  /**
   * Инициализация метрик производительности
   */
  private initializePerformanceMetrics(): void {
    this.performanceMetrics = {
      connections: { total: 0, active: 0, failed: 0 },
      cache: { hitRate: 0, missRate: 0, evictionRate: 0, memoryUsage: 0 },
      operations: { commandsPerSecond: 0, averageLatency: 0, errorRate: 0 },
      sessions: { active: 0, rateLimitViolations: 0, blockedUsers: 0 }
    };
  }

  /**
   * ПУБЛИЧНЫЕ МЕТОДЫ ДОСТУПА К КОМПОНЕНТАМ
   */

  /**
   * Получение Connection Manager
   */
  getConnectionManager(): RedisConnectionManager {
    this.ensureInitialized();
    return this.connectionManager;
  }

  /**
   * Получение Cache Layer
   */
  getCacheLayer(): RedisCacheLayer {
    this.ensureInitialized();
    return this.cacheLayer;
  }

  /**
   * Получение Critical Data Manager
   */
  getCriticalDataManager(): CriticalDataCacheManager {
    this.ensureInitialized();
    return this.criticalDataManager;
  }

  /**
   * Получение Session Manager
   */
  getSessionManager(): RedisSessionManager {
    this.ensureInitialized();
    return this.sessionManager;
  }

  /**
   * Получение статуса здоровья системы
   */
  getSystemHealth(): RedisSystemHealth {
    return { ...this.systemHealth };
  }

  /**
   * Получение метрик производительности
   */
  getPerformanceMetrics(): RedisPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Проверка инициализации
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Redis система не инициализирована. Вызовите initialize() сначала.');
    }
  }

  /**
   * Graceful shutdown всей Redis системы
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    enhancedDbLogger.info('🔄 Начинаем graceful shutdown Redis системы...');

    try {
      // Останавливаем таймеры
      if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
      if (this.metricsTimer) clearInterval(this.metricsTimer);

      // Завершаем компоненты в правильном порядке
      const shutdownPromises = [];

      if (this.sessionManager) {
        shutdownPromises.push(this.sessionManager.shutdown());
      }

      if (this.criticalDataManager) {
        shutdownPromises.push(this.criticalDataManager.shutdown());
      }

      if (this.cacheLayer) {
        shutdownPromises.push(this.cacheLayer.shutdown());
      }

      // Ждем завершения всех компонентов
      await Promise.all(shutdownPromises);

      // Закрываем соединения последними
      if (this.connectionManager) {
        await this.connectionManager.shutdown();
      }

      this.isInitialized = false;
      enhancedDbLogger.info('✅ Redis система успешно завершена');
      this.emit('shutdown_completed');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка при shutdown Redis системы', { error });
      throw error;
    }
  }
}

export default RedisMasterManager;