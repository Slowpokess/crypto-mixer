import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { MixerService } from '../services/mixer.service';
import { WalletService } from '../services/wallet.service';
import { ValidationService } from '../services/validation.service';
import { CacheService } from '../services/cache.service';
import { Logger } from '../utils/logger';
import { MixRequest, MixStatus } from '../types/mixer.types';

export class MixerController {
  private mixerService: MixerService;
  private walletService: WalletService;
  private validationService: ValidationService;
  private cacheService: CacheService;
  private logger: Logger;

  constructor() {
    this.mixerService = new MixerService();
    this.walletService = new WalletService();
    this.validationService = new ValidationService();
    this.cacheService = new CacheService();
    this.logger = new Logger('MixerController');
  }

  public createMixRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers['x-session-id'] as string || uuidv4();
      
      // Validate request
      const validation = await this.validationService.validateMixRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const { currency, amount, outputAddresses, delay } = req.body;

      // Check minimum and maximum amounts
      const limits = await this.mixerService.getLimits(currency);
      if (amount < limits.min || amount > limits.max) {
        res.status(400).json({ 
          error: `Amount must be between ${limits.min} and ${limits.max} ${currency}` 
        });
        return;
      }

      // Calculate fees
      const fee = await this.mixerService.calculateFee(currency, amount);
      const totalAmount = amount + fee;

      // Generate deposit address
      const depositAddress = await this.walletService.generateDepositAddress(currency);

      // Create mix request
      const mixRequest: MixRequest = {
        id: uuidv4(),
        sessionId,
        currency,
        amount,
        fee,
        totalAmount,
        depositAddress,
        outputAddresses,
        delay: delay || this.mixerService.getRandomDelay(),
        status: MixStatus.PENDING_DEPOSIT,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      // Save to database
      await this.mixerService.createMixRequest(mixRequest);

      // Cache for quick access
      await this.cacheService.set(`mix:${sessionId}`, mixRequest, 86400);

      // Log (without sensitive data)
      this.logger.info(`Mix request created: ${mixRequest.id}`);

      res.status(201).json({
        sessionId,
        depositAddress,
        amount: totalAmount,
        currency,
        fee,
        expiresAt: mixRequest.expiresAt,
        status: mixRequest.status,
      });

    } catch (error) {
      this.logger.error('Error creating mix request:', error as Error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  public getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      // Check cache first
      let mixRequest = await this.cacheService.get(`mix:${sessionId}`);
      
      if (!mixRequest) {
        // Fetch from database
        mixRequest = await this.mixerService.getMixRequest(sessionId);
        
        if (!mixRequest) {
          res.status(404).json({ error: 'Mix request not found' });
          return;
        }

        // Update cache
        await this.cacheService.set(`mix:${sessionId}`, mixRequest, 3600);
      }

      // Don't expose sensitive data
      const response = {
        sessionId: mixRequest.sessionId,
        status: mixRequest.status,
        confirmations: mixRequest.confirmations || 0,
        requiredConfirmations: this.mixerService.getRequiredConfirmations(mixRequest.currency),
        createdAt: mixRequest.createdAt,
        completedAt: mixRequest.completedAt,
      };

      res.json(response);

    } catch (error) {
      this.logger.error('Error getting status:', error as Error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  public getFees = async (_req: Request, res: Response): Promise<void> => {
    try {
      const fees = await this.mixerService.getFeeStructure();
      res.json(fees);
    } catch (error) {
      this.logger.error('Error getting fees:', error as Error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}