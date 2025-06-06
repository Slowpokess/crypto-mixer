import Redis from 'ioredis';
import { Logger } from '../utils/logger';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  keepAlive?: number;
  family?: number;
  keyPrefix?: string;
}

export class RedisClient {
  private client: Redis | null = null;
  private logger: Logger;
  private config: RedisConfig;

  constructor() {
    this.logger = new Logger('Redis');
    this.config = this.loadConfig();
  }

  private loadConfig(): RedisConfig {
    const config: RedisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:'
    };
    
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }
    
    return config;
  }

  async connect(): Promise<void> {
    try {
      this.client = new Redis(this.config);

      this.client.on('connect', () => {
        this.logger.info('Redis connecting...');
      });

      this.client.on('ready', () => {
        this.logger.info('Redis connected successfully', {
          host: this.config.host,
          port: this.config.port,
          db: this.config.db
        });
      });

      this.client.on('error', (error) => {
        this.logger.error('Redis connection error', error);
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        this.logger.info('Redis reconnecting...');
      });

      // Test connection
      await this.client.connect();
      await this.client.ping();

    } catch (error) {
      this.logger.error('Failed to connect to Redis', error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.logger.info('Redis disconnected successfully');
      } catch (error) {
        this.logger.error('Error disconnecting from Redis', error as Error);
        throw error;
      }
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      this.logger.debug('Redis SET operation', { key, ttl });
    } catch (error) {
      this.logger.error('Redis SET failed', error as Error, { key });
      throw error;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        return null;
      }

      const parsedValue = JSON.parse(value);
      this.logger.debug('Redis GET operation', { key });
      return parsedValue;
    } catch (error) {
      this.logger.error('Redis GET failed', error as Error, { key });
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      const result = await this.client.del(key);
      this.logger.debug('Redis DEL operation', { key, deleted: result });
      return result;
    } catch (error) {
      this.logger.error('Redis DEL failed', error as Error, { key });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('Redis EXISTS failed', error as Error, { key });
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error('Redis EXPIRE failed', error as Error, { key, ttl });
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error('Redis TTL failed', error as Error, { key });
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error('Redis KEYS failed', error as Error, { pattern });
      throw error;
    }
  }

  async flushdb(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      await this.client.flushdb();
      this.logger.warn('Redis database flushed');
    } catch (error) {
      this.logger.error('Redis FLUSHDB failed', error as Error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed', error as Error);
      return false;
    }
  }

  async increment(key: string, by: number = 1): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.incrby(key, by);
    } catch (error) {
      this.logger.error('Redis INCREMENT failed', error as Error, { key, by });
      throw error;
    }
  }

  async decrement(key: string, by: number = 1): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.decrby(key, by);
    } catch (error) {
      this.logger.error('Redis DECREMENT failed', error as Error, { key, by });
      throw error;
    }
  }
}