import { RedisClient } from '../cache/redis';
import { Logger } from '../utils/logger';

export class CacheService {
  private redis: RedisClient;
  private logger: Logger;
  private readonly DEFAULT_TTL = 3600; // 1 hour

  constructor() {
    this.redis = new RedisClient();
    this.logger = new Logger('CacheService');
  }

  async set(key: string, value: any, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      await this.redis.set(key, value, ttl);
      this.logger.debug('Cache SET operation', { key, ttl });
    } catch (error) {
      this.logger.error('Cache SET failed', error as Error, { key });
      throw error;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get<T>(key);
      this.logger.debug('Cache GET operation', { key, found: value !== null });
      return value;
    } catch (error) {
      this.logger.error('Cache GET failed', error as Error, { key });
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      const result = await this.redis.del(key);
      this.logger.debug('Cache DEL operation', { key, deleted: result });
      return result;
    } catch (error) {
      this.logger.error('Cache DEL failed', error as Error, { key });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return await this.redis.exists(key);
    } catch (error) {
      this.logger.error('Cache EXISTS failed', error as Error, { key });
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      return await this.redis.expire(key, ttl);
    } catch (error) {
      this.logger.error('Cache EXPIRE failed', error as Error, { key, ttl });
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error('Cache TTL failed', error as Error, { key });
      throw error;
    }
  }

  // Mix request specific cache methods
  async setMixRequest(sessionId: string, mixRequest: any, ttl: number = 86400): Promise<void> {
    const key = this.getMixRequestKey(sessionId);
    await this.set(key, mixRequest, ttl);
  }

  async getMixRequest(sessionId: string): Promise<any | null> {
    const key = this.getMixRequestKey(sessionId);
    return await this.get(key);
  }

  async deleteMixRequest(sessionId: string): Promise<number> {
    const key = this.getMixRequestKey(sessionId);
    return await this.del(key);
  }

  // Fee structure cache methods
  async setFeeStructure(feeStructure: any, ttl: number = 3600): Promise<void> {
    const key = 'fee_structure';
    await this.set(key, feeStructure, ttl);
  }

  async getFeeStructure(): Promise<any | null> {
    const key = 'fee_structure';
    return await this.get(key);
  }

  // Rate limiting cache methods
  async incrementRateLimit(identifier: string, windowSeconds: number = 900): Promise<number> {
    try {
      const key = this.getRateLimitKey(identifier);
      const current = await this.redis.increment(key);
      
      if (current === 1) {
        // Set expiration only on first increment
        await this.redis.expire(key, windowSeconds);
      }
      
      return current;
    } catch (error) {
      this.logger.error('Rate limit increment failed', error as Error, { identifier });
      throw error;
    }
  }

  async getRateLimit(identifier: string): Promise<number> {
    try {
      const key = this.getRateLimitKey(identifier);
      const value = await this.get<number>(key);
      return value || 0;
    } catch (error) {
      this.logger.error('Rate limit get failed', error as Error, { identifier });
      throw error;
    }
  }

  async resetRateLimit(identifier: string): Promise<number> {
    const key = this.getRateLimitKey(identifier);
    return await this.del(key);
  }

  // Session management
  async setSession(sessionId: string, sessionData: any, ttl: number = 7200): Promise<void> {
    const key = this.getSessionKey(sessionId);
    await this.set(key, sessionData, ttl);
  }

  async getSession(sessionId: string): Promise<any | null> {
    const key = this.getSessionKey(sessionId);
    return await this.get(key);
  }

  async deleteSession(sessionId: string): Promise<number> {
    const key = this.getSessionKey(sessionId);
    return await this.del(key);
  }

  async extendSession(sessionId: string, ttl: number = 7200): Promise<boolean> {
    const key = this.getSessionKey(sessionId);
    return await this.expire(key, ttl);
  }

  // Wallet address cache
  async setWalletAddresses(currency: string, addresses: string[], ttl: number = 3600): Promise<void> {
    const key = this.getWalletAddressesKey(currency);
    await this.set(key, addresses, ttl);
  }

  async getWalletAddresses(currency: string): Promise<string[] | null> {
    const key = this.getWalletAddressesKey(currency);
    return await this.get<string[]>(key);
  }

  // Statistics cache
  async setStatistics(stats: any, ttl: number = 300): Promise<void> {
    const key = 'system_statistics';
    await this.set(key, stats, ttl);
  }

  async getStatistics(): Promise<any | null> {
    const key = 'system_statistics';
    return await this.get(key);
  }

  // Blockchain data cache
  async setBlockchainData(currency: string, dataType: string, data: any, ttl: number = 60): Promise<void> {
    const key = this.getBlockchainDataKey(currency, dataType);
    await this.set(key, data, ttl);
  }

  async getBlockchainData(currency: string, dataType: string): Promise<any | null> {
    const key = this.getBlockchainDataKey(currency, dataType);
    return await this.get(key);
  }

  // Batch operations
  async setMultiple(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = keyValuePairs.map(({ key, value, ttl }) => 
      this.set(key, value, ttl || this.DEFAULT_TTL)
    );
    
    await Promise.all(promises);
    this.logger.debug('Cache batch SET operation', { count: keyValuePairs.length });
  }

  async getMultiple<T = any>(keys: string[]): Promise<Array<T | null>> {
    const promises = keys.map(key => this.get<T>(key));
    const results = await Promise.all(promises);
    
    this.logger.debug('Cache batch GET operation', { 
      count: keys.length, 
      found: results.filter(r => r !== null).length 
    });
    
    return results;
  }

  async deleteMultiple(keys: string[]): Promise<number> {
    const promises = keys.map(key => this.del(key));
    const results = await Promise.all(promises);
    const totalDeleted = results.reduce((sum, count) => sum + count, 0);
    
    this.logger.debug('Cache batch DEL operation', { count: keys.length, deleted: totalDeleted });
    return totalDeleted;
  }

  // Pattern-based operations
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      
      return await this.deleteMultiple(keys);
    } catch (error) {
      this.logger.error('Cache delete by pattern failed', error as Error, { pattern });
      throw error;
    }
  }

  // Key generators
  private getMixRequestKey(sessionId: string): string {
    return `mix_request:${sessionId}`;
  }

  private getRateLimitKey(identifier: string): string {
    return `rate_limit:${identifier}`;
  }

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getWalletAddressesKey(currency: string): string {
    return `wallet_addresses:${currency}`;
  }

  private getBlockchainDataKey(currency: string, dataType: string): string {
    return `blockchain:${currency}:${dataType}`;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.healthCheck();
      return true;
    } catch (error) {
      this.logger.error('Cache health check failed', error as Error);
      return false;
    }
  }

  // Cache statistics
  async getCacheStats(): Promise<any> {
    try {
      // This would be implemented based on Redis info command
      // For now, returning basic stats
      return {
        status: 'connected',
        uptime: 'unknown',
        memory_usage: 'unknown',
        connected_clients: 'unknown'
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats', error as Error);
      throw error;
    }
  }

  // Clear all cache
  async clearAll(): Promise<void> {
    try {
      await this.redis.flushdb();
      this.logger.warn('All cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear cache', error as Error);
      throw error;
    }
  }
}