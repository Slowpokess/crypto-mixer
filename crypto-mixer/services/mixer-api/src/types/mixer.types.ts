export enum MixStatus {
  PENDING_DEPOSIT = 'PENDING_DEPOSIT',
  DEPOSIT_CONFIRMED = 'DEPOSIT_CONFIRMED',
  PROCESSING = 'PROCESSING',
  MIXING = 'MIXING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED'
}

export enum Currency {
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
  SOL = 'SOL'
}

export type CurrencyType = keyof typeof Currency;

export interface OutputAddress {
  address: string;
  percentage: number;
}

export interface MixRequest {
  id: string;
  sessionId: string;
  currency: Currency;
  amount: number;
  fee: number;
  totalAmount: number;
  depositAddress: string;
  outputAddresses: OutputAddress[];
  delay: number;
  status: MixStatus;
  confirmations?: number;
  txHash?: string;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
  expiresAt: Date;
}

export interface FeeStructure {
  percentage: number;
  minimum: number;
  network: number;
}

export interface CurrencyLimits {
  min: number;
  max: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: string[];
}

export interface TransactionInfo {
  hash: string;
  confirmations: number;
  amount: number;
  from: string;
  to: string;
  timestamp: Date;
  blockNumber?: number;
}

export interface WalletBalance {
  currency: Currency;
  balance: number;
  reserved: number;
  available: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  cpu: string;
  memory: string;
  services: {
    database: boolean;
    redis: boolean;
    blockchain: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Типы для правильной индексации объектов
export interface CurrencyLimitsMap {
  BTC: CurrencyLimits;
  ETH: CurrencyLimits;
  USDT: CurrencyLimits;
  SOL: CurrencyLimits;
}

export interface CurrencyConfirmationsMap {
  BTC: number;
  ETH: number;
  USDT: number;
  SOL: number;
}

export interface CurrencyFeesMap {
  BTC: number;
  ETH: number;
  USDT: number;
  SOL: number;
}

// Расширения для Express Request
export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

// Расширяем интерфейс Request для поддержки rateLimit
declare global {
  namespace Express {
    interface Request {
      rateLimit?: RateLimitInfo;
      sessionId?: string;
      userAgent?: string;
      clientIP?: string;
    }
  }
}