const { Sequelize } = require('sequelize');
const config = require('../config/database');
const logger = require('../utils/logger');

class DatabaseManager {
  constructor() {
    this.sequelize = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000;
    this.connectionMetrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageResponseTime: 0,
      lastConnectionTime: null,
      reconnectCount: 0
    };
    this.monitoringInterval = null;
    this.healthCheckInterval = null;
    this.eventListeners = [];
  }

  async initialize(environment = process.env.NODE_ENV || 'development') {
    try {
      const dbConfig = config[environment];
      
      this.sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect,
        logging: dbConfig.logging ? logger.info.bind(logger) : false,
        pool: {
          max: dbConfig.pool?.max || 20,
          min: dbConfig.pool?.min || 0,
          acquire: dbConfig.pool?.acquire || 60000,
          idle: dbConfig.pool?.idle || 10000,
          evict: dbConfig.pool?.evict || 1000
        },
        dialectOptions: {
          ssl: dbConfig.ssl || false,
          connectTimeout: 60000,
          acquireTimeout: 60000,
          timeout: 60000
        },
        retry: {
          match: [
            /ETIMEDOUT/,
            /EHOSTUNREACH/,
            /ECONNRESET/,
            /ECONNREFUSED/,
            /ETIMEDOUT/,
            /ESOCKETTIMEDOUT/,
            /EHOSTUNREACH/,
            /EPIPE/,
            /EAI_AGAIN/,
            /SequelizeConnectionError/,
            /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/,
            /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/,
            /SequelizeConnectionTimedOutError/
          ],
          max: 3
        }
      });

      await this.connect();
      logger.info('Database Manager initialized successfully');
      
    } catch (error) {
      logger.error('Database Manager initialization failed:', error);
      throw error;
    }
  }

  async connect() {
    while (this.connectionAttempts < this.maxRetries && !this.isConnected) {
      try {
        await this.sequelize.authenticate();
        this.isConnected = true;
        this.connectionAttempts = 0;
        logger.info(`Database connected successfully on attempt ${this.connectionAttempts + 1}`);
        
        this.setupConnectionEvents();
        return true;
        
      } catch (error) {
        this.connectionAttempts++;
        logger.error(`Database connection attempt ${this.connectionAttempts} failed:`, error.message);
        
        if (this.connectionAttempts >= this.maxRetries) {
          logger.error('Max connection retries reached. Database connection failed.');
          throw new Error(`Database connection failed after ${this.maxRetries} attempts`);
        }
        
        logger.info(`Retrying in ${this.retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  setupConnectionEvents() {
    this.sequelize.connectionManager.on('connect', () => {
      logger.info('Database connection established');
    });

    this.sequelize.connectionManager.on('disconnect', () => {
      logger.warn('Database connection lost');
      this.isConnected = false;
    });

    this.sequelize.connectionManager.on('error', (error) => {
      logger.error('Database connection error:', error);
      this.isConnected = false;
    });
  }

  async disconnect() {
    try {
      if (this.sequelize) {
        await this.sequelize.close();
        this.isConnected = false;
        logger.info('Database connection closed successfully');
      }
    } catch (error) {
      logger.error('Error closing database connection:', error);
      throw error;
    }
  }

  async getHealth() {
    try {
      if (!this.sequelize) {
        return { status: 'error', message: 'Database not initialized' };
      }

      await this.sequelize.authenticate();
      const pool = this.sequelize.connectionManager.pool;
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        pool: {
          used: pool.used,
          available: pool.available,
          pending: pool.pending,
          max: pool.options.max,
          min: pool.options.min
        },
        database: this.sequelize.config.database,
        host: this.sequelize.config.host,
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        connected: false
      };
    }
  }

  async runMigrations() {
    try {
      const { execSync } = require('child_process');
      const migrationPath = require('path').join(__dirname, 'migrate.js');
      
      logger.info('Running database migrations...');
      execSync(`node ${migrationPath}`, { stdio: 'inherit' });
      logger.info('Database migrations completed successfully');
      
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  async executeQuery(query, options = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      return await this.sequelize.query(query, {
        type: Sequelize.QueryTypes.SELECT,
        ...options
      });
    } catch (error) {
      logger.error('Query execution failed:', error);
      throw error;
    }
  }

  async executeTransaction(callback) {
    const transaction = await this.sequelize.transaction();
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      logger.error('Transaction failed:', error);
      throw error;
    }
  }

  getSequelize() {
    return this.sequelize;
  }

  isHealthy() {
    return this.isConnected && this.sequelize !== null;
  }

  async getPoolStatus() {
    try {
      if (!this.sequelize) {
        return null;
      }

      const pool = this.sequelize.connectionManager.pool;
      const stats = {
        total: pool.used + pool.available + pool.pending,
        used: pool.used,
        available: pool.available,
        pending: pool.pending,
        max: pool.options.max,
        min: pool.options.min,
        acquireTimeout: pool.options.acquire,
        idleTimeout: pool.options.idle,
        evictTimeout: pool.options.evict
      };

      stats.utilization = ((stats.used / stats.max) * 100).toFixed(2);
      stats.health = stats.used < stats.max * 0.8 ? 'healthy' : 'warning';

      return stats;
    } catch (error) {
      logger.error('Failed to get pool status:', error);
      return null;
    }
  }

  async drainPool() {
    try {
      if (!this.sequelize) {
        return false;
      }

      logger.info('Draining connection pool...');
      await this.sequelize.connectionManager.pool.drain();
      logger.info('Connection pool drained successfully');
      return true;
    } catch (error) {
      logger.error('Failed to drain pool:', error);
      return false;
    }
  }

  async clearPool() {
    try {
      if (!this.sequelize) {
        return false;
      }

      logger.info('Clearing connection pool...');
      await this.sequelize.connectionManager.pool.clear();
      logger.info('Connection pool cleared successfully');
      return true;
    } catch (error) {
      logger.error('Failed to clear pool:', error);
      return false;
    }
  }

  async adjustPoolSize(newMax, newMin = null) {
    try {
      if (!this.sequelize) {
        throw new Error('Database not initialized');
      }

      const currentPool = this.sequelize.connectionManager.pool;
      const oldMax = currentPool.options.max;
      const oldMin = currentPool.options.min;

      if (newMax < 1 || newMax > 100) {
        throw new Error('Pool max size must be between 1 and 100');
      }

      if (newMin !== null && (newMin < 0 || newMin > newMax)) {
        throw new Error('Pool min size must be between 0 and max size');
      }

      currentPool.options.max = newMax;
      if (newMin !== null) {
        currentPool.options.min = newMin;
      }

      logger.info(`Pool size adjusted: max ${oldMax}->${newMax}, min ${oldMin}->${currentPool.options.min}`);
      return true;
    } catch (error) {
      logger.error('Failed to adjust pool size:', error);
      throw error;
    }
  }

  async forceCloseConnection(connectionId) {
    try {
      if (!this.sequelize) {
        return false;
      }

      const pool = this.sequelize.connectionManager.pool;
      const connection = pool._allConnections.find(conn => conn.uuid === connectionId);
      
      if (connection) {
        await connection.close();
        logger.info(`Force closed connection: ${connectionId}`);
        return true;
      }

      logger.warn(`Connection not found: ${connectionId}`);
      return false;
    } catch (error) {
      logger.error(`Failed to force close connection ${connectionId}:`, error);
      return false;
    }
  }

  async getActiveConnections() {
    try {
      if (!this.sequelize) {
        return [];
      }

      const pool = this.sequelize.connectionManager.pool;
      return pool._allConnections.map(conn => ({
        id: conn.uuid,
        state: conn._connecting ? 'connecting' : 'connected',
        threadId: conn.threadId,
        createdAt: conn._createdAt,
        lastUsed: conn._lastUsed
      }));
    } catch (error) {
      logger.error('Failed to get active connections:', error);
      return [];
    }
  }

  async warmupPool(targetConnections = null) {
    try {
      if (!this.sequelize) {
        throw new Error('Database not initialized');
      }

      const pool = this.sequelize.connectionManager.pool;
      const target = targetConnections || pool.options.min || 2;
      
      logger.info(`Warming up pool to ${target} connections...`);

      const warmupPromises = [];
      for (let i = 0; i < target; i++) {
        warmupPromises.push(
          pool.acquire().then(connection => {
            setTimeout(() => pool.release(connection), 100);
          })
        );
      }

      await Promise.all(warmupPromises);
      logger.info(`Pool warmed up with ${target} connections`);
      return true;
    } catch (error) {
      logger.error('Pool warmup failed:', error);
      return false;
    }
  }

  async testConnection() {
    try {
      const startTime = Date.now();
      await this.sequelize.authenticate();
      const responseTime = Date.now() - startTime;
      
      this.updateConnectionMetrics(true, responseTime);
      
      return {
        success: true,
        responseTime,
        timestamp: new Date()
      };
    } catch (error) {
      this.updateConnectionMetrics(false);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  updateConnectionMetrics(success, responseTime = 0) {
    this.connectionMetrics.totalConnections++;
    
    if (success) {
      this.connectionMetrics.successfulConnections++;
      this.connectionMetrics.lastConnectionTime = new Date();
      
      if (responseTime > 0) {
        const currentAvg = this.connectionMetrics.averageResponseTime;
        const totalSuccess = this.connectionMetrics.successfulConnections;
        this.connectionMetrics.averageResponseTime = 
          ((currentAvg * (totalSuccess - 1)) + responseTime) / totalSuccess;
      }
    } else {
      this.connectionMetrics.failedConnections++;
    }
  }

  getConnectionMetrics() {
    const metrics = { ...this.connectionMetrics };
    
    if (metrics.totalConnections > 0) {
      metrics.successRate = ((metrics.successfulConnections / metrics.totalConnections) * 100).toFixed(2);
      metrics.failureRate = ((metrics.failedConnections / metrics.totalConnections) * 100).toFixed(2);
    } else {
      metrics.successRate = 0;
      metrics.failureRate = 0;
    }
    
    return metrics;
  }

  startMonitoring(intervalMs = 30000) {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    logger.info(`Starting database connection monitoring every ${intervalMs}ms`);
    
    this.monitoringInterval = setInterval(async () => {
      try {
        const poolStatus = await this.getPoolStatus();
        const connectionTest = await this.testConnection();
        
        this.emitEvent('monitoring', {
          poolStatus,
          connectionTest,
          metrics: this.getConnectionMetrics(),
          timestamp: new Date()
        });

        if (poolStatus && poolStatus.health === 'warning') {
          logger.warn(`Pool utilization high: ${poolStatus.utilization}%`);
          this.emitEvent('warning', { type: 'high_pool_utilization', data: poolStatus });
        }

        if (!connectionTest.success) {
          logger.error('Connection test failed during monitoring');
          this.emitEvent('error', { type: 'connection_test_failed', data: connectionTest });
        }

      } catch (error) {
        logger.error('Monitoring check failed:', error);
        this.emitEvent('error', { type: 'monitoring_failed', error: error.message });
      }
    }, intervalMs);

    return this.monitoringInterval;
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Database monitoring stopped');
    }
  }

  startHealthCheck(intervalMs = 60000) {
    if (this.healthCheckInterval) {
      this.stopHealthCheck();
    }

    logger.info(`Starting database health checks every ${intervalMs}ms`);
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealth();
        
        this.emitEvent('health_check', health);

        if (health.status === 'error') {
          logger.error('Health check failed, attempting reconnection...');
          await this.reconnect();
        }

      } catch (error) {
        logger.error('Health check failed:', error);
        this.emitEvent('error', { type: 'health_check_failed', error: error.message });
      }
    }, intervalMs);

    return this.healthCheckInterval;
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Database health checks stopped');
    }
  }

  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  off(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  emitEvent(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Event listener error for ${event}:`, error);
        }
      });
    }
  }

  async reconnect() {
    try {
      logger.info('Attempting database reconnection...');
      
      this.isConnected = false;
      this.connectionAttempts = 0;
      this.connectionMetrics.reconnectCount++;
      
      if (this.sequelize) {
        try {
          await this.sequelize.close();
        } catch (closeError) {
          logger.warn('Error closing existing connection:', closeError.message);
        }
      }

      await this.connect();
      
      this.emitEvent('reconnected', {
        timestamp: new Date(),
        reconnectCount: this.connectionMetrics.reconnectCount
      });
      
      return true;
    } catch (error) {
      logger.error('Reconnection failed:', error);
      this.emitEvent('reconnection_failed', { error: error.message, timestamp: new Date() });
      return false;
    }
  }

  getMonitoringStatus() {
    return {
      monitoring: !!this.monitoringInterval,
      healthCheck: !!this.healthCheckInterval,
      metrics: this.getConnectionMetrics(),
      eventListeners: Object.keys(this.eventListeners).map(event => ({
        event,
        listenerCount: this.eventListeners[event]?.length || 0
      }))
    };
  }
}

module.exports = new DatabaseManager();