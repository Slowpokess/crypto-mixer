import { Router, Request, Response } from 'express';
import { Database } from '../database/connection';
import { RedisClient } from '../cache/redis';
import { Logger } from '../utils/logger';

export class HealthRouter {
  public router: Router;
  private logger: Logger;
  private db: Database;
  private redis: RedisClient;

  constructor() {
    this.router = Router();
    this.logger = new Logger('HealthRouter');
    this.db = new Database();
    this.redis = new RedisClient();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.healthCheck);
    this.router.get('/detailed', this.detailedHealthCheck);
  }

  private healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        }
      });
    } catch (error) {
      this.logger.error('Health check failed', error as Error);
      res.status(500).json({
        status: 'error',
        message: 'Health check failed'
      });
    }
  };

  private detailedHealthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Check database health
      const dbHealth = await this.db.healthCheck();
      
      // Check Redis health
      const redisHealth = await this.redis.healthCheck();
      
      // Overall health status
      const isHealthy = dbHealth && redisHealth;
      
      const healthData = {
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        system: {
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
            rss: Math.round(memoryUsage.rss / 1024 / 1024)
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
          },
          process: {
            pid: process.pid,
            version: process.version,
            platform: process.platform,
            arch: process.arch
          }
        },
        services: {
          database: {
            status: dbHealth ? 'healthy' : 'unhealthy',
            poolInfo: this.db.getPoolInfo()
          },
          redis: {
            status: redisHealth ? 'healthy' : 'unhealthy'
          }
        }
      };

      res.status(isHealthy ? 200 : 503).json(healthData);
      
    } catch (error) {
      this.logger.error('Detailed health check failed', error as Error);
      res.status(500).json({
        status: 'error',
        message: 'Detailed health check failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}