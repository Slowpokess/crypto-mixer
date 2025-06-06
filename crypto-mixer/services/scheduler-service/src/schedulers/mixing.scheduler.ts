import { Database } from '../database/connection';
import { MessageQueue } from '../queue/rabbitmq';
import { RedisClient } from '../cache/redis';
import { Logger } from '../utils/logger';
import { MixingAlgorithm } from '../algorithms/mixing.algorithm';
import { CoinJoinAlgorithm } from '../algorithms/coinjoin.algorithm';
import { PoolOptimizer } from '../algorithms/pool.optimizer';

export class MixingScheduler {
  private db: Database;
  private queue: MessageQueue;
  private redis: RedisClient;
  private logger: Logger;
  private mixingAlgorithm: MixingAlgorithm;
  private coinJoinAlgorithm: CoinJoinAlgorithm;
  private poolOptimizer: PoolOptimizer;

  constructor(db: Database, queue: MessageQueue, redis: RedisClient) {
    this.db = db;
    this.queue = queue;
    this.redis = redis;
    this.logger = new Logger('MixingScheduler');
    this.mixingAlgorithm = new MixingAlgorithm();
    this.coinJoinAlgorithm = new CoinJoinAlgorithm();
    this.poolOptimizer = new PoolOptimizer();
  }

  public async processPendingMixes(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const pendingMixes = await this.getPendingMixes();
      
      if (pendingMixes.length === 0) {
        return;
      }

      this.logger.info(`Processing ${pendingMixes.length} pending mixes`);

      for (const mix of pendingMixes) {
        await this.processMix(mix);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Processed ${pendingMixes.length} mixes in ${duration}ms`);

    } catch (error) {
      this.logger.error('Error processing pending mixes:', error);
    }
  }

  private async getPendingMixes(): Promise<any[]> {
    const query = `
      SELECT mr.*, 
             bt.confirmations,
             bt.amount as received_amount
      FROM mix_requests mr
      JOIN blockchain_transactions bt ON bt.to_address = mr.deposit_address
      WHERE mr.status = 'DEPOSIT_RECEIVED'
        AND bt.confirmations >= (
          SELECT (value->mr.currency->>'confirmations')::int
          FROM system_config
          WHERE key = 'confirmations'
        )
        AND mr.expires_at > NOW()
      ORDER BY mr.created_at ASC
      LIMIT 50
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  private async processMix(mix: any): Promise<void> {
    const lockKey = `mix:lock:${mix.id}`;
    const locked = await this.redis.setNX(lockKey, '1', 300);

    if (!locked) {
      return;
    }

    try {
      await this.updateMixStatus(mix.id, 'PROCESSING');

      const strategy = this.determineMixingStrategy(mix);

      if (strategy === 'coinjoin') {
        const partners = await this.findCoinJoinPartners(mix);
        
        if (partners.length >= 2) {
          await this.processCoinJoin(mix, partners);
        } else {
          await this.processRegularMixing(mix);
        }
      } else {
        await this.processRegularMixing(mix);
      }

      await this.schedulePayouts(mix);
      await this.updateMixStatus(mix.id, 'MIXING');

    } catch (error) {
      this.logger.error(`Error processing mix ${mix.id}:`, error);
      await this.updateMixStatus(mix.id, 'FAILED');
      throw error;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private determineMixingStrategy(mix: any): string {
    const commonAmounts = [0.1, 0.5, 1, 5, 10];
    
    if (mix.currency === 'BTC' && commonAmounts.includes(mix.amount)) {
      return 'coinjoin';
    }

    return 'regular';
  }

  private async findCoinJoinPartners(mix: any): Promise<any[]> {
    const query = `
      SELECT * FROM mix_requests
      WHERE status = 'DEPOSIT_RECEIVED'
        AND currency = $1
        AND amount = $2
        AND id != $3
        AND expires_at > NOW()
      ORDER BY created_at ASC
      LIMIT 5
    `;

    const result = await this.db.query(query, [mix.currency, mix.amount, mix.id]);
    return result.rows;
  }

  private async processCoinJoin(mix: any, partners: any[]): Promise<void> {
    const allParticipants = [mix, ...partners];
    
    const coinJoinTx = await this.coinJoinAlgorithm.createTransaction(
      allParticipants,
      mix.currency
    );

    await this.saveCoinJoinTransaction(coinJoinTx);

    for (const participant of allParticipants) {
      await this.updateMixStatus(participant.id, 'COINJOIN');
    }

    await this.queue.publish('blockchain.coinjoin', {
      transactionId: coinJoinTx.id,
      participants: allParticipants.map(p => p.id),
    });
  }

  private async processRegularMixing(mix: any): Promise<void> {
    await this.addToPool(mix);
    const mixingPlan = await this.mixingAlgorithm.createMixingPlan(mix);
    await this.saveMixingPlan(mix.id, mixingPlan);
  }

  private async addToPool(mix: any): Promise<void> {
    const query = `
      INSERT INTO transaction_pool (currency, amount, source_mix_request_id)
      VALUES ($1, $2, $3)
    `;

    await this.db.query(query, [mix.currency, mix.amount, mix.id]);
  }

  private async schedulePayouts(mix: any): Promise<void> {
    const outputAddresses = JSON.parse(mix.output_addresses);
    const baseDelay = mix.delay_hours * 3600 * 1000;

    for (const output of outputAddresses) {
      const variance = Math.random() * 0.2 - 0.1;
      const actualDelay = baseDelay * (1 + variance);
      const scheduledAt = new Date(Date.now() + actualDelay);
      const outputAmount = (mix.amount * output.percentage) / 100;

      const query = `
        INSERT INTO output_transactions (
          mix_request_id, output_address, amount, currency,
          scheduled_at, status
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
        RETURNING id
      `;

      const result = await this.db.query(query, [
        mix.id,
        output.address,
        outputAmount,
        mix.currency,
        scheduledAt,
      ]);

      this.logger.info(`Scheduled payout ${result.rows[0].id} for ${scheduledAt}`);
    }
  }

  private async updateMixStatus(mixId: string, status: string): Promise<void> {
    const query = `
      UPDATE mix_requests 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2
    `;

    await this.db.query(query, [status, mixId]);
    await this.queue.publish('mix.status.updated', { mixId, status });
  }

  private async saveCoinJoinTransaction(transaction: any): Promise<void> {
    const query = `
      INSERT INTO coinjoin_transactions (id, participants, transaction_data, created_at)
      VALUES ($1, $2, $3, NOW())
    `;

    await this.db.query(query, [
      transaction.id,
      JSON.stringify(transaction.participants),
      JSON.stringify(transaction.data),
    ]);
  }

  private async saveMixingPlan(mixId: string, plan: any): Promise<void> {
    const query = `
      INSERT INTO mixing_plans (mix_request_id, plan_data, created_at)
      VALUES ($1, $2, NOW())
    `;

    await this.db.query(query, [mixId, JSON.stringify(plan)]);
  }

  public async optimizePool(): Promise<void> {
    this.logger.info('Starting pool optimization');

    try {
      const poolStats = await this.getPoolStatistics();
      const optimizationPlan = await this.poolOptimizer.optimize(poolStats);
      await this.executeOptimization(optimizationPlan);
      this.logger.info('Pool optimization completed');
    } catch (error) {
      this.logger.error('Pool optimization error:', error);
    }
  }

  private async getPoolStatistics(): Promise<any> {
    const query = `
      SELECT 
        currency,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        MIN(added_at) as oldest_transaction
      FROM transaction_pool
      WHERE used = false
      GROUP BY currency
    `;

    const result = await this.db.query(query);
    return result.rows;
  }

  private async executeOptimization(plan: any): Promise<void> {
    for (const action of plan.actions) {
      switch (action.type) {
        case 'consolidate':
          await this.consolidateSmallAmounts(action.currency, action.threshold);
          break;
        case 'redistribute':
          await this.redistributeFunds(action.currency, action.amounts);
          break;
      }
    }
  }

  private async consolidateSmallAmounts(currency: string, threshold: number): Promise<void> {
    const query = `
      SELECT * FROM transaction_pool
      WHERE currency = $1 AND amount < $2 AND used = false
      ORDER BY added_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query, [currency, threshold]);
    
    if (result.rows.length > 10) {
      await this.queue.publish('blockchain.consolidate', {
        currency,
        transactions: result.rows,
      });
    }
  }

  private async redistributeFunds(currency: string, amounts: number[]): Promise<void> {
    this.logger.info(`Redistributing ${currency} funds`);
  }
}