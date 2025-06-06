import { Database } from '../database/connection';
import { EventEmitter } from '../events/emitter';
import { Logger } from '../utils/logger';
import { MixRequest, MixStatus, Currency, CurrencyLimitsMap, CurrencyConfirmationsMap, CurrencyFeesMap } from '../types/mixer.types';

export class MixerService {
  private db: Database;
  private eventEmitter: EventEmitter;
  private logger: Logger;

  constructor() {
    this.db = new Database();
    this.eventEmitter = new EventEmitter();
    this.logger = new Logger('MixerService');
  }

  public async createMixRequest(mixRequest: MixRequest): Promise<void> {
    const query = `
      INSERT INTO mix_requests (
        id, session_id, currency, amount, fee, total_amount,
        deposit_address, output_addresses, delay_hours, status,
        created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    const values = [
      mixRequest.id,
      mixRequest.sessionId,
      mixRequest.currency,
      mixRequest.amount,
      mixRequest.fee,
      mixRequest.totalAmount,
      mixRequest.depositAddress,
      JSON.stringify(mixRequest.outputAddresses),
      mixRequest.delay,
      mixRequest.status,
      mixRequest.createdAt,
      mixRequest.expiresAt,
    ];

    await this.db.query(query, values);

    // Emit event for other services
    this.eventEmitter.emit('mix:created', mixRequest);
  }

  public async getMixRequest(sessionId: string): Promise<MixRequest | null> {
    const query = `
      SELECT * FROM mix_requests 
      WHERE session_id = $1 AND expires_at > NOW()
    `;

    const result = await this.db.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      outputAddresses: JSON.parse(row.output_addresses),
    };
  }

  public async updateStatus(mixRequestId: string, status: MixStatus): Promise<void> {
    const query = `
      UPDATE mix_requests 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2
    `;

    await this.db.query(query, [status, mixRequestId]);

    // Emit event
    this.eventEmitter.emit('mix:statusChanged', { mixRequestId, status });
  }

  public async calculateFee(currency: Currency, amount: number): Promise<number> {
    const feePercentage = await this.getFeePercentage(currency);
    const minFee = await this.getMinimumFee(currency);
    
    const calculatedFee = amount * (feePercentage / 100);
    return Math.max(calculatedFee, minFee);
  }

  public async getLimits(currency: Currency): Promise<{ min: number; max: number }> {
    const limits: CurrencyLimitsMap = {
      BTC: { min: 0.001, max: 10 },
      ETH: { min: 0.01, max: 100 },
      USDT: { min: 100, max: 1000000 },
      SOL: { min: 1, max: 10000 },
    };

    return limits[currency] || { min: 0, max: 0 };
  }

  public getRequiredConfirmations(currency: Currency): number {
    const confirmations: CurrencyConfirmationsMap = {
      BTC: 3,
      ETH: 12,
      USDT: 12,
      SOL: 32,
    };

    return confirmations[currency] || 6;
  }

  public getRandomDelay(): number {
    // Random delay between 1 and 72 hours
    return Math.floor(Math.random() * 72) + 1;
  }

  private async getFeePercentage(currency: Currency): Promise<number> {
    // Dynamic fee based on network conditions
    // In production, this would check network congestion
    return 1.5; // 1.5%
  }

  private async getMinimumFee(currency: Currency): Promise<number> {
    const minFees: CurrencyFeesMap = {
      BTC: 0.00005,
      ETH: 0.001,
      USDT: 2,
      SOL: 0.05,
    };

    return minFees[currency] || 0;
  }

  public async getFeeStructure(): Promise<any> {
    return {
      BTC: {
        percentage: 1.5,
        minimum: 0.00005,
        network: 0.00002,
      },
      ETH: {
        percentage: 1.5,
        minimum: 0.001,
        network: 0.0005,
      },
      USDT: {
        percentage: 1.5,
        minimum: 2,
        network: 1,
      },
      SOL: {
        percentage: 1.5,
        minimum: 0.05,
        network: 0.00025,
      },
    };
  }
}