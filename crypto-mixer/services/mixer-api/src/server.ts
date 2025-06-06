// services/mixer-api/src/server.ts
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Logger } from './utils/logger';
import { Database } from './database/connection';
import { RedisClient } from './cache/redis';
import { MixerRouter } from './routes/mixer.routes';
import { HealthRouter } from './routes/health.routes';
import { ErrorHandler } from './middleware/error.handler';
import { SecurityMiddleware } from './middleware/security';
import { MetricsMiddleware } from './middleware/metrics';

class MixerAPIServer {
  private app: express.Application;
  private logger: Logger;
  private db: Database;
  private redis: RedisClient;

  constructor() {
    this.app = express();
    this.logger = new Logger('MixerAPI');
    this.db = new Database();
    this.redis = new RedisClient();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        this.logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: req.rateLimit?.resetTime || new Date(Date.now() + 15 * 60 * 1000),
        });
      },
    });

    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom middleware
    this.app.use(SecurityMiddleware.validateRequest);
    this.app.use(MetricsMiddleware.track);
  }

  private setupRoutes(): void {
    // Health check
    this.app.use('/health', new HealthRouter().router);

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', (_req: Request, res: Response) => {
      res.set('Content-Type', 'text/plain');
      res.send(MetricsMiddleware.getPrometheusMetrics());
    });

    // API routes
    this.app.use('/api/v1/mixer', new MixerRouter().router);

    // Proxy to other services
    this.app.use('/api/v1/blockchain', createProxyMiddleware({
      target: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3001',
      changeOrigin: true,
      onError: (err: Error, _req: Request, res: Response) => {
        this.logger.error('Proxy error:', err);
        res.status(502).json({ error: 'Service temporarily unavailable' });
      },
    }));

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use(ErrorHandler.handle);
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await this.db.connect();
      this.logger.info('Database connected');

      // Connect to Redis
      await this.redis.connect();
      this.logger.info('Redis connected');

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();

      // Start server
      const port = process.env.PORT || 3000;
      this.app.listen(port, () => {
        this.logger.info(`Mixer API running on port ${port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        this.logger.info('SIGTERM received, shutting down gracefully');
        await this.shutdown();
      });

    } catch (error) {
      this.logger.error('Failed to start server:', error as Error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    await this.db.disconnect();
    await this.redis.disconnect();
    process.exit(0);
  }
}

// Start server
const server = new MixerAPIServer();
server.start();