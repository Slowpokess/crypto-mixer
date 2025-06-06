const DatabaseManager = require('../DatabaseManager');
const logger = require('../../utils/logger');
const { Op } = require('sequelize');

class DatabaseMonitoring {
  constructor() {
    this.metrics = {
      connections: 0,
      queries: 0,
      errors: 0,
      avgResponseTime: 0,
      lastCheck: new Date()
    };
    this.alerts = [];
    this.thresholds = {
      maxConnections: 18,
      maxResponseTime: 5000,
      maxErrorRate: 0.05,
      diskSpaceWarning: 85,
      diskSpaceCritical: 95
    };
  }

  async getConnectionStats() {
    try {
      const sequelize = DatabaseManager.getSequelize();
      const pool = sequelize.connectionManager.pool;
      
      return {
        total: pool.used + pool.available + pool.pending,
        used: pool.used,
        available: pool.available,
        pending: pool.pending,
        max: pool.options.max,
        min: pool.options.min
      };
    } catch (error) {
      logger.error('Failed to get connection stats:', error);
      return null;
    }
  }

  async getDatabaseSize() {
    try {
      const sequelize = DatabaseManager.getSequelize();
      const [results] = await sequelize.query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as size,
          pg_database_size(current_database()) as size_bytes
      `);
      
      return results[0];
    } catch (error) {
      logger.error('Failed to get database size:', error);
      return null;
    }
  }

  async getTableSizes() {
    try {
      const sequelize = DatabaseManager.getSequelize();
      const [results] = await sequelize.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `);
      
      return results;
    } catch (error) {
      logger.error('Failed to get table sizes:', error);
      return [];
    }
  }

  async getSlowQueries(limit = 10) {
    try {
      const sequelize = DatabaseManager.getSequelize();
      const [results] = await sequelize.query(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements 
        ORDER BY mean_time DESC 
        LIMIT $1
      `, {
        bind: [limit]
      });
      
      return results;
    } catch (error) {
      logger.warn('pg_stat_statements not available for slow query monitoring');
      return [];
    }
  }

  async getActiveConnections() {
    try {
      const sequelize = DatabaseManager.getSequelize();
      const [results] = await sequelize.query(`
        SELECT 
          pid,
          usename,
          application_name,
          client_addr,
          state,
          query_start,
          state_change,
          query
        FROM pg_stat_activity 
        WHERE state = 'active' 
        AND pid <> pg_backend_pid()
      `);
      
      return results;
    } catch (error) {
      logger.error('Failed to get active connections:', error);
      return [];
    }
  }

  async getLockingQueries() {
    try {
      const sequelize = DatabaseManager.getSequelize();
      const [results] = await sequelize.query(`
        SELECT 
          blocked_locks.pid AS blocked_pid,
          blocked_activity.usename AS blocked_user,
          blocking_locks.pid AS blocking_pid,
          blocking_activity.usename AS blocking_user,
          blocked_activity.query AS blocked_statement,
          blocking_activity.query AS current_statement_in_blocking_process
        FROM pg_catalog.pg_locks blocked_locks
        JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
        JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
        AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
        AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
        AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
        AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
        AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
        AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
        AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
        WHERE NOT blocked_locks.GRANTED
      `);
      
      return results;
    } catch (error) {
      logger.error('Failed to get locking queries:', error);
      return [];
    }
  }

  async checkHealth() {
    try {
      const health = await DatabaseManager.getHealth();
      const connectionStats = await this.getConnectionStats();
      const dbSize = await this.getDatabaseSize();
      const activeConnections = await getActiveConnections();
      const lockingQueries = await this.getLockingQueries();
      
      const alerts = [];
      
      if (connectionStats && connectionStats.used > this.thresholds.maxConnections) {
        alerts.push({
          type: 'warning',
          message: `High connection usage: ${connectionStats.used}/${connectionStats.max}`,
          timestamp: new Date()
        });
      }
      
      if (activeConnections.length > 10) {
        alerts.push({
          type: 'warning',
          message: `High number of active connections: ${activeConnections.length}`,
          timestamp: new Date()
        });
      }
      
      if (lockingQueries.length > 0) {
        alerts.push({
          type: 'critical',
          message: `Database locks detected: ${lockingQueries.length} blocking queries`,
          timestamp: new Date()
        });
      }
      
      this.alerts = alerts;
      this.metrics.lastCheck = new Date();
      
      return {
        status: health.status,
        database: health,
        connections: connectionStats,
        size: dbSize,
        activeConnections: activeConnections.length,
        lockingQueries: lockingQueries.length,
        alerts,
        timestamp: new Date()
      };
      
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'error',
        message: error.message,
        timestamp: new Date()
      };
    }
  }

  async generateReport() {
    try {
      const health = await this.checkHealth();
      const tableSizes = await this.getTableSizes();
      const slowQueries = await this.getSlowQueries();
      
      return {
        summary: health,
        tableSizes,
        slowQueries,
        metrics: this.metrics,
        generatedAt: new Date()
      };
      
    } catch (error) {
      logger.error('Failed to generate monitoring report:', error);
      throw error;
    }
  }

  startMonitoring(intervalMinutes = 5) {
    logger.info(`Starting database monitoring with ${intervalMinutes} minute intervals`);
    
    const interval = setInterval(async () => {
      try {
        const health = await this.checkHealth();
        
        if (health.alerts && health.alerts.length > 0) {
          health.alerts.forEach(alert => {
            logger.warn(`Database Alert [${alert.type}]: ${alert.message}`);
          });
        }
        
      } catch (error) {
        logger.error('Monitoring check failed:', error);
      }
    }, intervalMinutes * 60 * 1000);
    
    return interval;
  }

  stopMonitoring(interval) {
    if (interval) {
      clearInterval(interval);
      logger.info('Database monitoring stopped');
    }
  }
}

module.exports = new DatabaseMonitoring();