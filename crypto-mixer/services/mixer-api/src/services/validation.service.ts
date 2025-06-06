import { Logger } from '../utils/logger';
import { Currency, ValidationResult, OutputAddress } from '../types/mixer.types';
import { WalletService } from './wallet.service';

export class ValidationService {
  private logger: Logger;
  private walletService: WalletService;

  constructor() {
    this.logger = new Logger('ValidationService');
    this.walletService = new WalletService();
  }

  async validateMixRequest(requestData: any): Promise<ValidationResult> {
    try {
      const errors: string[] = [];

      // Validate required fields
      if (!requestData.currency) {
        errors.push('Currency is required');
      }

      if (!requestData.amount || typeof requestData.amount !== 'number') {
        errors.push('Valid amount is required');
      }

      if (!requestData.outputAddresses || !Array.isArray(requestData.outputAddresses)) {
        errors.push('Output addresses array is required');
      }

      // Early return if basic validation fails
      if (errors.length > 0) {
        return {
          isValid: false,
          error: 'Validation failed',
          details: errors
        };
      }

      // Validate currency
      const currencyValidation = this.validateCurrency(requestData.currency);
      if (!currencyValidation.isValid) {
        errors.push(currencyValidation.error!);
      }

      // Validate amount
      const amountValidation = await this.validateAmount(requestData.currency, requestData.amount);
      if (!amountValidation.isValid) {
        errors.push(amountValidation.error!);
      }

      // Validate output addresses
      const outputValidation = await this.validateOutputAddresses(
        requestData.currency,
        requestData.outputAddresses
      );
      if (!outputValidation.isValid) {
        errors.push(outputValidation.error!);
      }

      // Validate delay if provided
      if (requestData.delay !== undefined) {
        const delayValidation = this.validateDelay(requestData.delay);
        if (!delayValidation.isValid) {
          errors.push(delayValidation.error!);
        }
      }

      if (errors.length > 0) {
        this.logger.warn('Mix request validation failed', { errors, requestData: this.sanitizeLogData(requestData) });
        return {
          isValid: false,
          error: 'Validation failed',
          details: errors
        };
      }

      this.logger.debug('Mix request validation passed', { currency: requestData.currency });
      return { isValid: true };

    } catch (error) {
      this.logger.error('Validation service error', error as Error);
      return {
        isValid: false,
        error: 'Validation service error'
      };
    }
  }

  private validateCurrency(currency: string): ValidationResult {
    const supportedCurrencies = Object.values(Currency);
    
    if (!supportedCurrencies.includes(currency as Currency)) {
      return {
        isValid: false,
        error: `Unsupported currency. Supported currencies: ${supportedCurrencies.join(', ')}`
      };
    }

    return { isValid: true };
  }

  private async validateAmount(currency: Currency, amount: number): Promise<ValidationResult> {
    // Check if amount is positive
    if (amount <= 0) {
      return {
        isValid: false,
        error: 'Amount must be greater than 0'
      };
    }

    // Check precision (max 8 decimal places)
    const decimals = (amount.toString().split('.')[1] || '').length;
    if (decimals > 8) {
      return {
        isValid: false,
        error: 'Amount cannot have more than 8 decimal places'
      };
    }

    // Check currency-specific limits
    const limits = this.getCurrencyLimits(currency);
    if (amount < limits.min) {
      return {
        isValid: false,
        error: `Amount must be at least ${limits.min} ${currency}`
      };
    }

    if (amount > limits.max) {
      return {
        isValid: false,
        error: `Amount cannot exceed ${limits.max} ${currency}`
      };
    }

    return { isValid: true };
  }

  private async validateOutputAddresses(currency: Currency, outputAddresses: OutputAddress[]): Promise<ValidationResult> {
    if (outputAddresses.length === 0) {
      return {
        isValid: false,
        error: 'At least one output address is required'
      };
    }

    if (outputAddresses.length > 10) {
      return {
        isValid: false,
        error: 'Maximum 10 output addresses allowed'
      };
    }

    // Validate each output address
    for (const [index, output] of outputAddresses.entries()) {
      // Check required fields
      if (!output.address || typeof output.address !== 'string') {
        return {
          isValid: false,
          error: `Output address ${index + 1}: Address is required`
        };
      }

      if (!output.percentage || typeof output.percentage !== 'number') {
        return {
          isValid: false,
          error: `Output address ${index + 1}: Percentage is required`
        };
      }

      // Validate address format
      const isValidAddress = await this.walletService.validateAddress(output.address, currency);
      if (!isValidAddress) {
        return {
          isValid: false,
          error: `Output address ${index + 1}: Invalid ${currency} address format`
        };
      }

      // Validate percentage
      if (output.percentage <= 0 || output.percentage > 100) {
        return {
          isValid: false,
          error: `Output address ${index + 1}: Percentage must be between 1 and 100`
        };
      }

      // Check for precision (max 2 decimal places for percentage)
      const decimals = (output.percentage.toString().split('.')[1] || '').length;
      if (decimals > 2) {
        return {
          isValid: false,
          error: `Output address ${index + 1}: Percentage cannot have more than 2 decimal places`
        };
      }
    }

    // Check that percentages sum to 100
    const totalPercentage = outputAddresses.reduce((sum, output) => sum + output.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) { // Allow small floating point differences
      return {
        isValid: false,
        error: `Total percentage must equal 100% (current: ${totalPercentage}%)`
      };
    }

    // Check for duplicate addresses
    const addresses = outputAddresses.map(output => output.address.toLowerCase());
    const uniqueAddresses = new Set(addresses);
    if (addresses.length !== uniqueAddresses.size) {
      return {
        isValid: false,
        error: 'Duplicate output addresses are not allowed'
      };
    }

    return { isValid: true };
  }

  private validateDelay(delay: number): ValidationResult {
    if (!Number.isInteger(delay)) {
      return {
        isValid: false,
        error: 'Delay must be an integer'
      };
    }

    if (delay < 1 || delay > 168) { // 1 hour to 7 days
      return {
        isValid: false,
        error: 'Delay must be between 1 and 168 hours'
      };
    }

    return { isValid: true };
  }

  private getCurrencyLimits(currency: Currency): { min: number; max: number } {
    const limits = {
      [Currency.BTC]: { min: 0.001, max: 10 },
      [Currency.ETH]: { min: 0.01, max: 100 },
      [Currency.USDT]: { min: 100, max: 1000000 },
      [Currency.SOL]: { min: 1, max: 10000 }
    };

    return limits[currency];
  }

  async validateTransactionHash(txHash: string, currency: Currency): Promise<ValidationResult> {
    if (!txHash || typeof txHash !== 'string') {
      return {
        isValid: false,
        error: 'Transaction hash is required'
      };
    }

    // Basic format validation based on currency
    const patterns = {
      [Currency.BTC]: /^[a-fA-F0-9]{64}$/,
      [Currency.ETH]: /^0x[a-fA-F0-9]{64}$/,
      [Currency.USDT]: /^0x[a-fA-F0-9]{64}$/,
      [Currency.SOL]: /^[1-9A-HJ-NP-Za-km-z]{87,88}$/
    };

    const pattern = patterns[currency];
    if (!pattern || !pattern.test(txHash)) {
      return {
        isValid: false,
        error: `Invalid transaction hash format for ${currency}`
      };
    }

    return { isValid: true };
  }

  validateSessionId(sessionId: string): ValidationResult {
    if (!sessionId || typeof sessionId !== 'string') {
      return {
        isValid: false,
        error: 'Session ID is required'
      };
    }

    // UUID v4 format validation
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(sessionId)) {
      return {
        isValid: false,
        error: 'Invalid session ID format'
      };
    }

    return { isValid: true };
  }

  private sanitizeLogData(data: any): any {
    // Remove sensitive data from logs
    const sanitized = { ...data };
    if (sanitized.outputAddresses) {
      sanitized.outputAddresses = sanitized.outputAddresses.map((output: any) => ({
        address: output.address ? `${output.address.substring(0, 6)}...${output.address.substring(output.address.length - 4)}` : 'N/A',
        percentage: output.percentage
      }));
    }
    return sanitized;
  }

  async validateBulkRequest(requests: any[]): Promise<ValidationResult> {
    if (!Array.isArray(requests)) {
      return {
        isValid: false,
        error: 'Requests must be an array'
      };
    }

    if (requests.length === 0) {
      return {
        isValid: false,
        error: 'At least one request is required'
      };
    }

    if (requests.length > 100) {
      return {
        isValid: false,
        error: 'Maximum 100 requests allowed per batch'
      };
    }

    const errors: string[] = [];
    for (const [index, request] of requests.entries()) {
      const validation = await this.validateMixRequest(request);
      if (!validation.isValid) {
        errors.push(`Request ${index + 1}: ${validation.error}`);
      }
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        error: 'Bulk validation failed',
        details: errors
      };
    }

    return { isValid: true };
  }
}