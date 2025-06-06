import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetries?: number;
  retryDelayOnFailover?: number;
}

export class RedisClient {
  private client: RedisClientType | null = null;
  private logger: Logger;
  private config: RedisConfig;

  constructor() {
    this.logger = new Logger('RedisClient');
    this.config = this.loadConfig();
  }

  private loadConfig(): RedisConfig {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '1000')
    };
  }

  async connect(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          reconnectStrategy: (retries: number) => {
            if (retries > (this.config.maxRetries || 3)) {
              return new Error('Redis max retries exceeded');
            }
            return Math.min(retries * 100, 3000);
          }
        },
        password: this.config.password,
        database: this.config.db,
      });

      this.client.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.client.on('connect', () => {
        this.logger.info('Connected to Redis');
      });

      this.client.on('reconnecting', () => {
        this.logger.warn('Reconnecting to Redis...');
      });

      await this.client.connect();

      this.logger.info('Redis client connected successfully', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.db
      });

    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.logger.info('Redis client disconnected');
      } catch (error) {
        this.logger.error('Error disconnecting from Redis:', error as Error);
        throw error;
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const value = await this.client.get(key);
      this.logger.debug(`Redis GET: ${key}`, { found: !!value });
      return value;
    } catch (error) {
      this.logger.error(`Redis GET error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      
      this.logger.debug(`Redis SET: ${key}`, { ttl: ttlSeconds });
    } catch (error) {
      this.logger.error(`Redis SET error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      let result: boolean;
      
      if (ttlSeconds) {
        result = await this.client.set(key, value, {
          NX: true,
          EX: ttlSeconds
        }) === 'OK';
      } else {
        result = await this.client.setNX(key, value);
      }

      this.logger.debug(`Redis SETNX: ${key}`, { success: result, ttl: ttlSeconds });
      return result;
    } catch (error) {
      this.logger.error(`Redis SETNX error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.del(key);
      this.logger.debug(`Redis DEL: ${key}`, { deletedCount: result });
      return result;
    } catch (error) {
      this.logger.error(`Redis DEL error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Redis EXISTS error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      this.logger.error(`Redis EXPIRE error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.hSet(key, field, value);
      this.logger.debug(`Redis HSET: ${key}.${field}`);
      return result;
    } catch (error) {
      this.logger.error(`Redis HSET error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.hGet(key, field);
      this.logger.debug(`Redis HGET: ${key}.${field}`, { found: !!result });
      return result;
    } catch (error) {
      this.logger.error(`Redis HGET error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.hGetAll(key);
      this.logger.debug(`Redis HGETALL: ${key}`, { fieldCount: Object.keys(result).length });
      return result;
    } catch (error) {
      this.logger.error(`Redis HGETALL error for key ${key}:`, error as Error);
      throw error;
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    try {
      const result = await this.client.incr(key);
      this.logger.debug(`Redis INCR: ${key}`, { newValue: result });
      return result;
    } catch (error) {
      this.logger.error(`Redis INCR error for key ${key}:`, error as Error);
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
      this.logger.error('Redis health check failed:', error as Error);
      return false;
    }
  }
}