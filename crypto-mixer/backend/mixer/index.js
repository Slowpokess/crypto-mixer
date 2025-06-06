/**
 * Главный модуль системы микширования
 * Интегрирует все компоненты mixer системы
 */

const MixingEngine = require('./engine/MixingEngine');
const PoolManager = require('./pool/PoolManager');
const MixingScheduler = require('./scheduler/MixingScheduler');
const SecurityValidator = require('./security/SecurityValidator');
const MonitoringSystem = require('./monitoring/MonitoringSystem');
const logger = require('../utils/logger');

class MixingSystem {
  constructor(dependencies = {}) {
    this.database = dependencies.database;
    this.blockchainManager = dependencies.blockchainManager;
    this.logger = dependencies.logger || logger;
    
    this.isInitialized = false;
    this.isRunning = false;
    
    // Инициализация компонентов
    this.components = {};
    this.metrics = {
      totalMixes: 0,
      successfulMixes: 0,
      failedMixes: 0,
      averageMixTime: 0,
      systemUptime: 0,
      startTime: null
    };
  }

  /**
   * Инициализация системы микширования
   */
  async initialize() {
    try {
      this.logger.info('Initializing Mixing System...');

      if (!this.database) {
        throw new Error('Database dependency required');
      }

      if (!this.blockchainManager) {
        throw new Error('BlockchainManager dependency required');
      }

      // Создание зависимостей для компонентов
      const sharedDependencies = {
        database: this.database,
        logger: this.logger,
        blockchainManager: this.blockchainManager
      };

      // 1. Инициализация SecurityValidator
      this.components.security = new SecurityValidator({
        ...sharedDependencies,
        riskAnalyzer: this.riskAnalyzer
      });

      // 2. Инициализация MonitoringSystem
      this.components.monitoring = new MonitoringSystem({
        ...sharedDependencies,
        alertManager: this.alertManager,
        metricsCollector: this.metricsCollector
      });

      // 3. Инициализация PoolManager
      this.components.poolManager = new PoolManager({
        ...sharedDependencies,
        security: this.components.security
      });

      // 4. Инициализация MixingScheduler
      this.components.scheduler = new MixingScheduler({
        ...sharedDependencies,
        poolManager: this.components.poolManager,
        security: this.components.security
      });

      // 5. Инициализация MixingEngine (главный компонент)
      this.components.engine = new MixingEngine({
        ...sharedDependencies,
        poolManager: this.components.poolManager,
        scheduler: this.components.scheduler,
        validator: this.components.security,
        security: this.components.security
      });

      // Настройка событий между компонентами
      this.setupEventHandlers();

      this.isInitialized = true;
      this.metrics.startTime = Date.now();
      
      this.logger.info('Mixing System initialized successfully');
      return true;

    } catch (error) {
      this.logger.error('Failed to initialize Mixing System:', error);
      throw error;
    }
  }

  /**
   * Запуск системы микширования
   */
  async start() {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized. Call initialize() first.');
      }

      if (this.isRunning) {
        this.logger.warn('Mixing System already running');
        return;
      }

      this.logger.info('Starting Mixing System...');

      // Запуск компонентов в правильном порядке
      await this.components.monitoring.startMonitoring();
      await this.components.security.initialize();
      await this.components.poolManager.startMonitoring();
      await this.components.scheduler.start();
      await this.components.engine.start();

      this.isRunning = true;
      this.logger.info('Mixing System started successfully');

      // Событие о запуске системы
      this.emit('systemStarted', {
        timestamp: new Date(),
        components: Object.keys(this.components)
      });

    } catch (error) {
      this.logger.error('Failed to start Mixing System:', error);
      throw error;
    }
  }

  /**
   * Остановка системы микширования
   */
  async stop() {
    try {
      if (!this.isRunning) {
        this.logger.warn('Mixing System not running');
        return;
      }

      this.logger.info('Stopping Mixing System...');

      // Остановка компонентов в обратном порядке
      await this.components.engine.stop();
      await this.components.scheduler.stop();
      await this.components.poolManager.stopMonitoring();
      // Security не требует остановки - только инициализация
      await this.components.monitoring.stopMonitoring();

      this.isRunning = false;
      this.logger.info('Mixing System stopped successfully');

      // Событие об остановке системы
      this.emit('systemStopped', {
        timestamp: new Date(),
        uptime: Date.now() - this.metrics.startTime
      });

    } catch (error) {
      this.logger.error('Failed to stop Mixing System:', error);
      throw error;
    }
  }

  /**
   * Обработка запроса на микширование
   */
  async processMixRequest(mixRequest) {
    try {
      if (!this.isRunning) {
        throw new Error('Mixing System not running');
      }

      this.logger.info(`Processing mix request: ${mixRequest.id}`);
      
      // Передача запроса в основной движок
      const result = await this.components.engine.processMixRequest(mixRequest);
      
      // Обновление метрик
      this.metrics.totalMixes++;
      if (result.success) {
        this.metrics.successfulMixes++;
      } else {
        this.metrics.failedMixes++;
      }

      return result;

    } catch (error) {
      this.logger.error(`Failed to process mix request ${mixRequest.id}:`, error);
      this.metrics.failedMixes++;
      throw error;
    }
  }

  /**
   * Получение статуса системы
   */
  getSystemStatus() {
    const uptime = this.metrics.startTime ? Date.now() - this.metrics.startTime : 0;
    
    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      uptime,
      components: {
        engine: this.components.engine ? 'running' : 'not_initialized',
        poolManager: this.components.poolManager ? 'running' : 'not_initialized',
        scheduler: this.components.scheduler ? 'running' : 'not_initialized',
        security: this.components.security ? 'initialized' : 'not_initialized',
        monitoring: this.components.monitoring ? 'running' : 'not_initialized'
      },
      metrics: {
        ...this.metrics,
        successRate: this.metrics.totalMixes > 0 
          ? (this.metrics.successfulMixes / this.metrics.totalMixes * 100).toFixed(2)
          : 0
      }
    };
  }

  /**
   * Получение детальной статистики
   */
  async getStatistics() {
    const systemStatus = this.getSystemStatus();
    
    return {
      system: systemStatus,
      engine: this.components.engine?.getStatistics ? this.components.engine.getStatistics() : {},
      pools: this.components.poolManager?.getPoolStatistics ? this.components.poolManager.getPoolStatistics() : {},
      scheduler: this.components.scheduler?.getSchedulerStatistics ? this.components.scheduler.getSchedulerStatistics() : {},
      security: this.components.security?.getSecurityMetrics ? this.components.security.getSecurityMetrics() : {},
      monitoring: this.components.monitoring?.getMonitoringStats ? this.components.monitoring.getMonitoringStats() : {}
    };
  }

  /**
   * Настройка обработчиков событий между компонентами
   */
  setupEventHandlers() {
    // События от MixingEngine
    this.components.engine.on('mixStarted', (data) => {
      this.components.monitoring.recordEvent('mix_started', data);
    });

    this.components.engine.on('mixCompleted', (data) => {
      this.components.monitoring.recordEvent('mix_completed', data);
      this.metrics.successfulMixes++;
    });

    this.components.engine.on('mixFailed', (data) => {
      this.components.monitoring.recordEvent('mix_failed', data);
      this.components.security.analyzeMixFailure(data);
      this.metrics.failedMixes++;
    });

    // События от PoolManager
    this.components.poolManager.on('poolOptimized', (data) => {
      this.components.monitoring.recordEvent('pool_optimized', data);
    });

    this.components.poolManager.on('lowLiquidity', (data) => {
      this.components.monitoring.alertLowLiquidity(data);
    });

    // События от SecurityValidator
    this.components.security.on('securityAlert', (data) => {
      this.components.monitoring.alertSecurity(data);
      this.logger.warn('Security Alert:', data);
    });

    // События от Scheduler
    this.components.scheduler.on('scheduleOptimized', (data) => {
      this.components.monitoring.recordEvent('schedule_optimized', data);
    });
  }

  /**
   * Получение компонента по имени
   */
  getComponent(name) {
    return this.components[name];
  }

  /**
   * Проверка здоровья системы
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      components: {},
      issues: []
    };

    // Проверка каждого компонента
    for (const [name, component] of Object.entries(this.components)) {
      try {
        if (component && typeof component.healthCheck === 'function') {
          health.components[name] = await component.healthCheck();
        } else {
          health.components[name] = { status: 'unknown' };
        }

        if (health.components[name].status !== 'healthy') {
          health.issues.push(`${name}: ${health.components[name].status}`);
        }
      } catch (error) {
        health.components[name] = { status: 'error', error: error.message };
        health.issues.push(`${name}: error - ${error.message}`);
      }
    }

    // Определение общего статуса
    if (health.issues.length > 0) {
      health.status = health.issues.some(issue => issue.includes('error')) ? 'unhealthy' : 'warning';
    }

    return health;
  }
}

// Расширение EventEmitter для событий системы
const { EventEmitter } = require('events');
Object.setPrototypeOf(MixingSystem.prototype, EventEmitter.prototype);

module.exports = {
  MixingSystem,
  MixingEngine,
  PoolManager,
  MixingScheduler,
  SecurityValidator,
  MonitoringSystem
};