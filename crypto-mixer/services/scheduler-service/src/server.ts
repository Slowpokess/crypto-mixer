// services/scheduler-service/src/server.ts
import * as nodeCron from 'node-cron';
import { EventEmitter } from 'events';
import { Database } from './database/connection';
import { MessageQueue } from './queue/rabbitmq';
import { RedisClient } from './cache/redis';
import { Logger } from './utils/logger';
import { MixingScheduler } from './schedulers/mixing.scheduler';
import { PayoutScheduler } from './schedulers/payout.scheduler';
import { CleanupScheduler } from './schedulers/cleanup.scheduler';

class SchedulerService {
  private eventEmitter: EventEmitter;
  private db: Database;
  private queue: MessageQueue;
  private redis: RedisClient;
  private logger: Logger;
  private jobs: Map<string, nodeCron.ScheduledTask>;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.db = new Database();
    this.queue = new MessageQueue();
    this.redis = new RedisClient();
    this.logger = new Logger('SchedulerService');
    this.jobs = new Map();
    
    // Setup event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventEmitter.on('job:started', (jobName: string) => {
      this.logger.debug(`Job started: ${jobName}`);
    });

    this.eventEmitter.on('job:completed', (jobName: string) => {
      this.logger.debug(`Job completed: ${jobName}`);
    });

    this.eventEmitter.on('job:error', (jobName: string, error: Error) => {
      this.logger.warn(`Job failed: ${jobName}`, error);
    });

    this.eventEmitter.on('service:started', () => {
      this.logger.info('Scheduler service is ready');
    });

    this.eventEmitter.on('service:error', (error: Error) => {
      this.logger.error('Scheduler service error', error);
    });
  }

  public on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  public emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  public async start(): Promise<void> {
    try {
      // Initialize connections
      await this.db.connect();
      await this.queue.connect();
      await this.redis.connect();

      // Initialize schedulers
      const mixingScheduler = new MixingScheduler(this.db, this.queue, this.redis);
      const payoutScheduler = new PayoutScheduler(this.db, this.queue, this.redis);
      const cleanupScheduler = new CleanupScheduler(this.db, this.redis);

      // Setup cron jobs
      this.setupJobs(mixingScheduler, payoutScheduler, cleanupScheduler);

      // Listen for immediate processing requests
      await this.queue.subscribe('scheduler.process', async (message) => {
        await this.handleImmediateProcess(message);
      });

      // Emit service started event
      this.eventEmitter.emit('service:started');
      this.logger.info('Scheduler Service started successfully');

    } catch (error) {
      this.eventEmitter.emit('service:error', error);
      this.logger.error('Failed to start Scheduler Service:', error as Error);
      process.exit(1);
    }
  }

  private setupJobs(
    mixingScheduler: MixingScheduler,
    payoutScheduler: PayoutScheduler,
    cleanupScheduler: CleanupScheduler
  ): void {
    // Process mixing requests every minute
    const mixingJob = nodeCron.schedule('* * * * *', async () => {
      try {
        this.eventEmitter.emit('job:started', 'mixing');
        await mixingScheduler.processPendingMixes();
        this.eventEmitter.emit('job:completed', 'mixing');
      } catch (error) {
        this.eventEmitter.emit('job:error', 'mixing', error);
        this.logger.error('Mixing scheduler error:', error as Error);
      }
    }, {
      scheduled: false
    });

    // Process payouts every 30 seconds (every minute for node-cron)
    const payoutJob = nodeCron.schedule('* * * * *', async () => {
      try {
        this.eventEmitter.emit('job:started', 'payout');
        await payoutScheduler.processScheduledPayouts();
        this.eventEmitter.emit('job:completed', 'payout');
      } catch (error) {
        this.eventEmitter.emit('job:error', 'payout', error);
        this.logger.error('Payout scheduler error:', error as Error);
      }
    }, {
      scheduled: false
    });

    // Cleanup expired data every hour
    const cleanupJob = nodeCron.schedule('0 * * * *', async () => {
      try {
        this.eventEmitter.emit('job:started', 'cleanup');
        await cleanupScheduler.cleanupExpiredData();
        this.eventEmitter.emit('job:completed', 'cleanup');
      } catch (error) {
        this.eventEmitter.emit('job:error', 'cleanup', error);
        this.logger.error('Cleanup scheduler error:', error as Error);
      }
    }, {
      scheduled: false
    });

    // Pool optimization every 6 hours
    const optimizationJob = nodeCron.schedule('0 */6 * * *', async () => {
      try {
        this.eventEmitter.emit('job:started', 'optimization');
        await mixingScheduler.optimizePool();
        this.eventEmitter.emit('job:completed', 'optimization');
      } catch (error) {
        this.eventEmitter.emit('job:error', 'optimization', error);
        this.logger.error('Pool optimization error:', error as Error);
      }
    }, {
      scheduled: false
    });

    // Start all jobs
    mixingJob.start();
    payoutJob.start();
    cleanupJob.start();
    optimizationJob.start();

    this.jobs.set('mixing', mixingJob);
    this.jobs.set('payout', payoutJob);
    this.jobs.set('cleanup', cleanupJob);
    this.jobs.set('optimization', optimizationJob);

    this.logger.info('All cron jobs started');
  }

  private async handleImmediateProcess(message: any): Promise<void> {
    const { type, data } = message;

    switch (type) {
      case 'process_mix':
        await this.processMixImmediately(data);
        break;
      case 'process_payout':
        await this.processPayoutImmediately(data);
        break;
      default:
        this.logger.warn(`Unknown immediate process type: ${type}`);
    }
  }

  private async processMixImmediately(data: any): Promise<void> {
    this.logger.info(`Processing mix immediately: ${data.mixRequestId}`);
  }

  private async processPayoutImmediately(data: any): Promise<void> {
    this.logger.info(`Processing payout immediately: ${data.payoutId}`);
  }

  public async stop(): Promise<void> {
    // Stop all jobs
    for (const [name, job] of this.jobs) {
      job.stop();
      this.logger.info(`Stopped job: ${name}`);
    }

    // Close connections
    await this.db.disconnect();
    await this.queue.disconnect();
    await this.redis.disconnect();
  }
}

// Start the service
const service = new SchedulerService();
service.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await service.stop();
  process.exit(0);
});