import { Database } from '../database/connection';
import { MessageQueue } from '../queue/rabbitmq';
import { RedisClient } from '../cache/redis';
import { Logger } from '../utils/logger';

export class PayoutScheduler {
  private db: Database;
  private queue: MessageQueue;
  private redis: RedisClient;
  private logger: Logger;

  constructor(db: Database, queue: MessageQueue, redis: RedisClient) {
    this.db = db;
    this.queue = queue;
    this.redis = redis;
    this.logger = new Logger('PayoutScheduler');
  }

  public async processScheduledPayouts(): Promise<void> {
    try {
      // Get payouts that are due
      const duePayouts = await this.getDuePayouts();

      if (duePayouts.length === 0) {
        return;
      }

      this.logger.info(`Processing ${duePayouts.length} due payouts`);

      // Process in batches to avoid overload
      const batchSize = 10;
      for (let i = 0; i < duePayouts.length; i += batchSize) {
        const batch = duePayouts.slice(i, i + batchSize);
        await Promise.all(batch.map(payout => this.processPayout(payout)));
      }

    } catch (error) {
      this.logger.error('Error processing scheduled payouts:', error as Error);
    }
  }

  private async getDuePayouts(): Promise<any[]> {
    const query = `
      SELECT ot.*, mr.currency
      FROM output_transactions ot
      JOIN mix_requests mr ON mr.id = ot.mix_request_id
      WHERE ot.status = 'PENDING'
        AND ot.scheduled_at <= NOW()
        AND ot.retry_count < 5
      ORDER BY ot.scheduled_at ASC
      LIMIT 50
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  private async processPayout(payout: any): Promise<void> {
    const lockKey = `payout:lock:${payout.id}`;
    const locked = await this.redis.setNX(lockKey, '1', 300);

    if (!locked) {
      return;
    }

    try {
      // Update status to processing
      await this.updatePayoutStatus(payout.id, 'PROCESSING');

      // Select source wallet from pool
      const sourceWallet = await this.selectSourceWallet(payout.currency, payout.amount);

      if (!sourceWallet) {
        throw new Error('No suitable wallet found for payout');
      }

      // Create transaction request
      const txRequest = {
        payoutId: payout.id,
        currency: payout.currency,
        from: sourceWallet.address,
        to: payout.output_address,
        amount: payout.amount,
        walletId: sourceWallet.id,
      };

      // Send to blockchain service
      await this.queue.publish('blockchain.send', txRequest);

      this.logger.info(`Payout ${payout.id} sent for processing`);

    } catch (error) {
      this.logger.error(`Error processing payout ${payout.id}:`, error as Error);
      await this.handlePayoutError(payout, error as Error);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async selectSourceWallet(currency: string, amount: number): Promise<any> {
    // Select optimal wallet for payout
    const query = `
      SELECT * FROM wallets
      WHERE currency = $1
        AND wallet_type = 'HOT'
        AND active = true
        AND balance >= $2
      ORDER BY 
        CASE 
          WHEN balance - $2 < 0.1 THEN 1  -- Prefer wallets that will be nearly empty
          ELSE 0 
        END,
        last_used ASC NULLS FIRST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const result = await this.db.query(query, [currency, amount]);
    
    if (result.rows.length === 0) {
      // Try buffer wallets
      const bufferResult = await this.db.query(
        query.replace('HOT', 'BUFFER'),
        [currency, amount]
      );
      return bufferResult.rows[0] || null;
    }

    return result.rows[0];
  }

  private async updatePayoutStatus(payoutId: string, status: string): Promise<void> {
    const query = `
      UPDATE output_transactions
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await this.db.query(query, [status, payoutId]);
  }

  private async handlePayoutError(payout: any, error: Error): Promise<void> {
    const query = `
      UPDATE output_transactions
      SET 
        status = CASE 
          WHEN retry_count >= 4 THEN 'FAILED'
          ELSE 'PENDING'
        END,
        retry_count = retry_count + 1,
        last_error = $1,
        scheduled_at = CASE
          WHEN retry_count < 4 THEN NOW() + INTERVAL '15 minutes'
          ELSE scheduled_at
        END,
        updated_at = NOW()
      WHERE id = $2
    `;

    await this.db.query(query, [error.message, payout.id]);

    if (payout.retry_count >= 4) {
      // Notify about failed payout
      await this.queue.publish('payout.failed', {
        payoutId: payout.id,
        error: error.message,
      });
    }
  }

  public async retryFailedPayouts(): Promise<void> {
    try {
      // Get failed payouts that can be retried
      const retryablePayouts = await this.getRetryablePayouts();

      this.logger.info(`Retrying ${retryablePayouts.length} failed payouts`);

      for (const payout of retryablePayouts) {
        // Reset status and increment retry count
        await this.resetPayoutForRetry(payout.id);
      }

    } catch (error) {
      this.logger.error('Error retrying failed payouts:', error as Error);
    }
  }

  private async getRetryablePayouts(): Promise<any[]> {
    const query = `
      SELECT * FROM output_transactions
      WHERE status = 'FAILED'
        AND retry_count < 5
        AND updated_at < NOW() - INTERVAL '1 hour'
      ORDER BY updated_at ASC
      LIMIT 20
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  private async resetPayoutForRetry(payoutId: string): Promise<void> {
    const query = `
      UPDATE output_transactions
      SET 
        status = 'PENDING',
        scheduled_at = NOW() + INTERVAL '5 minutes',
        updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [payoutId]);
  }

  public async getPayoutStatistics(): Promise<any> {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount
      FROM output_transactions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY status
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  public async optimizePayoutScheduling(): Promise<void> {
    try {
      this.logger.info('Optimizing payout scheduling');

      // Get payouts scheduled for the next hour
      const upcomingPayouts = await this.getUpcomingPayouts();

      // Group by currency and time windows
      const optimizedSchedule = this.optimizeSchedule(upcomingPayouts);

      // Update schedules
      await this.updatePayoutSchedules(optimizedSchedule);

      this.logger.info('Payout schedule optimization completed');

    } catch (error) {
      this.logger.error('Error optimizing payout scheduling:', error as Error);
    }
  }

  private async getUpcomingPayouts(): Promise<any[]> {
    const query = `
      SELECT * FROM output_transactions
      WHERE status = 'PENDING'
        AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
      ORDER BY scheduled_at ASC
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  private optimizeSchedule(payouts: any[]): any[] {
    // Group payouts to reduce blockchain fees and improve efficiency
    const optimized: any[] = [];
    const groupSize = 5; // Process in groups of 5

    for (let i = 0; i < payouts.length; i += groupSize) {
      const group = payouts.slice(i, i + groupSize);
      
      // Spread the group over 10 minutes to avoid congestion
      group.forEach((payout, index) => {
        const baseTime = new Date(payout.scheduled_at);
        const adjustedTime = new Date(baseTime.getTime() + (index * 2 * 60 * 1000)); // 2 min intervals
        
        optimized.push({
          ...payout,
          new_scheduled_at: adjustedTime
        });
      });
    }

    return optimized;
  }

  private async updatePayoutSchedules(optimizedPayouts: any[]): Promise<void> {
    for (const payout of optimizedPayouts) {
      const query = `
        UPDATE output_transactions
        SET scheduled_at = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await this.db.query(query, [payout.new_scheduled_at, payout.id]);
    }
  }
}