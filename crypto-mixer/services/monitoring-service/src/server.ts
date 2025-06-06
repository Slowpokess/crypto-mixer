import express, { Request, Response } from 'express';
import { MetricsCollector } from './metrics';
import { Logger } from './utils/logger';

class MonitoringServer {
  private app: express.Application;
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    this.app = express();
    this.logger = new Logger('MonitoringService');
    this.metrics = new MetricsCollector();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // CORS for metrics endpoint
    this.app.use((_req: Request, res: Response, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  private setupRoutes(): void {
    // Prometheus metrics endpoint
    this.app.get('/metrics', (_req: Request, res: Response) => {
      res.set('Content-Type', 'text/plain');
      res.send(this.metrics.getRegistry().metrics());
    });

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'monitoring-service'
      });
    });

    // Metrics collection endpoints
    this.app.post('/api/metrics/mix-request', (req: Request, res: Response) => {
      const { currency, status } = req.body;
      this.metrics.mixRequestsTotal.labels(currency, status).inc();
      res.json({ success: true });
    });

    this.app.post('/api/metrics/transaction', (req: Request, res: Response) => {
      const { currency, type, status } = req.body;
      this.metrics.transactionsTotal.labels(currency, type, status).inc();
      res.json({ success: true });
    });

    this.app.post('/api/metrics/wallet-balance', (req: Request, res: Response) => {
      const { currency, walletType, address, balance } = req.body;
      this.metrics.updateWalletBalance(currency, walletType, address, balance);
      res.json({ success: true });
    });

    this.app.post('/api/metrics/active-mixes', (req: Request, res: Response) => {
      const { currency, status, count } = req.body;
      this.metrics.updateActiveMixes(currency, status, count);
      res.json({ success: true });
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  public async start(): Promise<void> {
    try {
      this.setupMiddleware();
      this.setupRoutes();

      const port = process.env.PORT || 3004;
      this.app.listen(port, () => {
        this.logger.info(`Monitoring service running on port ${port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        this.logger.info('SIGTERM received, shutting down gracefully');
        process.exit(0);
      });

    } catch (error) {
      this.logger.error('Failed to start monitoring server:', error as Error);
      process.exit(1);
    }
  }
}

// Start server
const server = new MonitoringServer();
server.start();