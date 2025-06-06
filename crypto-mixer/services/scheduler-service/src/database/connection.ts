import { Pool, PoolClient, QueryResult } from 'pg';
import { Logger } from '../utils/logger';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class Database {
  private pool: Pool | null = null;
  private logger: Logger;
  private config: DatabaseConfig;

  constructor() {
    this.logger = new Logger('Database');
    this.config = this.loadConfig();
  }

  private loadConfig(): DatabaseConfig {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cryptomixer',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.DB_SSL === 'true',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000')
    };
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.maxConnections,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.logger.info('Database connected successfully', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      });

    } catch (error) {
      this.logger.error('Failed to connect to database', error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        this.pool = null;
        this.logger.info('Database disconnected successfully');
      } catch (error) {
        this.logger.error('Error disconnecting from database', error as Error);
        throw error;
      }
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      this.logger.debug('Query executed', {
        duration: `${duration}ms`,
        rows: result.rowCount,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error('Query failed', error as Error, {
        duration: `${duration}ms`,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params ? JSON.stringify(params) : undefined
      });
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool.connect();
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      
      const result = await this.query('SELECT 1 as health');
      return result.rows.length > 0 && result.rows[0].health === 1;
    } catch (error) {
      this.logger.error('Database health check failed', error as Error);
      return false;
    }
  }

  getPoolInfo() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}