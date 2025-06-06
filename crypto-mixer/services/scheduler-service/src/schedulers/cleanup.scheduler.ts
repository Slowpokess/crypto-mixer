import { Database } from '../database/connection';
import { RedisClient } from '../cache/redis';
import { Logger } from '../utils/logger';

export class CleanupScheduler {
  private db: Database;
  private redis: RedisClient;
  private logger: Logger;

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
    this.logger = new Logger('CleanupScheduler');
  }

  public async cleanupExpiredData(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting cleanup of expired data');

      // Cleanup expired mix requests
      const expiredMixes = await this.cleanupExpiredMixRequests();
      
      // Cleanup old blockchain transactions
      const expiredTx = await this.cleanupOldTransactions();
      
      // Cleanup expired Redis cache entries
      await this.cleanupExpiredCacheEntries();
      
      // Cleanup old logs
      const cleanedLogs = await this.cleanupOldLogs();
      
      // Cleanup temporary files
      await this.cleanupTempFiles();

      const duration = Date.now() - startTime;
      this.logger.info('Cleanup completed', {
        duration: `${duration}ms`,
        expiredMixes,
        expiredTx,
        cleanedLogs
      });

    } catch (error) {
      this.logger.error('Error during cleanup:', error as Error);
    }
  }

  private async cleanupExpiredMixRequests(): Promise<number> {
    const query = `
      DELETE FROM mix_requests 
      WHERE status IN ('EXPIRED', 'FAILED', 'CANCELLED')
        AND created_at < NOW() - INTERVAL '30 days'
    `;

    const result = await this.db.query(query);
    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      this.logger.info(`Cleaned up ${deletedCount} expired mix requests`);
    }

    return deletedCount;
  }

  private async cleanupOldTransactions(): Promise<number> {
    const query = `
      DELETE FROM blockchain_transactions 
      WHERE created_at < NOW() - INTERVAL '90 days'
        AND status = 'CONFIRMED'
    `;

    const result = await this.db.query(query);
    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      this.logger.info(`Cleaned up ${deletedCount} old blockchain transactions`);
    }

    return deletedCount;
  }

  private async cleanupExpiredCacheEntries(): Promise<void> {
    try {
      // Redis automatically handles TTL expiration, but we can cleanup specific patterns
      // This is mainly for manual cleanup of specific key patterns if needed
      this.logger.debug('Redis TTL-based cleanup is automatic');
    } catch (error) {
      this.logger.error('Error cleaning up cache entries:', error as Error);
    }
  }

  private async cleanupOldLogs(): Promise<number> {
    const query = `
      DELETE FROM system_logs 
      WHERE created_at < NOW() - INTERVAL '7 days'
        AND level IN ('DEBUG', 'INFO')
    `;

    const result = await this.db.query(query);
    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      this.logger.info(`Cleaned up ${deletedCount} old log entries`);
    }

    return deletedCount;
  }

  private async cleanupTempFiles(): Promise<void> {
    try {
      // Cleanup temporary mixing files, reports, etc.
      const query = `
        DELETE FROM temp_files 
        WHERE created_at < NOW() - INTERVAL '24 hours'
      `;

      const result = await this.db.query(query);
      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        this.logger.info(`Cleaned up ${deletedCount} temporary files`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up temp files:', error as Error);
    }
  }

  public async cleanupFailedJobs(): Promise<void> {
    try {
      // Cleanup failed job records
      const query = `
        UPDATE scheduled_jobs 
        SET status = 'EXPIRED'
        WHERE status = 'FAILED' 
          AND updated_at < NOW() - INTERVAL '24 hours'
      `;

      const result = await this.db.query(query);
      const updatedCount = result.rowCount || 0;
      
      if (updatedCount > 0) {
        this.logger.info(`Marked ${updatedCount} failed jobs as expired`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up failed jobs:', error as Error);
    }
  }

  public async optimizeDatabase(): Promise<void> {
    try {
      this.logger.info('Starting database optimization');

      // Analyze tables for better query performance
      const tables = [
        'mix_requests',
        'blockchain_transactions', 
        'output_transactions',
        'transaction_pool'
      ];

      for (const table of tables) {
        await this.db.query(`ANALYZE ${table}`);
      }

      // Vacuum tables to reclaim space
      for (const table of tables) {
        await this.db.query(`VACUUM ANALYZE ${table}`);
      }

      this.logger.info('Database optimization completed');

    } catch (error) {
      this.logger.error('Error during database optimization:', error as Error);
    }
  }
}