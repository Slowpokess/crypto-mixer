// Базовые типы для крипто микшера

export type CurrencyType = 'BTC' | 'ETH' | 'USDT' | 'SOL' | 'LTC' | 'DASH' | 'ZEC';

export type MixRequestStatus = 
  | 'PENDING'           // Ожидает обработки
  | 'PENDING_DEPOSIT'   // Ожидает депозит
  | 'DEPOSITED'         // Депозит получен
  | 'POOLING'           // В пуле ожидания
  | 'MIXING'            // Активное микширование
  | 'COMPLETED'         // Успешно завершено
  | 'FAILED'            // Неудача
  | 'CANCELLED'         // Отменено
  | 'EXPIRED';          // Истекло время

// Alias для обратной совместимости
export type MixingStatus = MixRequestStatus;

export type TransactionStatus = 
  | 'PENDING'          // Ожидает подтверждения
  | 'CONFIRMED'        // Подтверждено
  | 'FAILED'           // Неудача
  | 'BROADCASTING'     // Отправляется в сеть
  | 'MEMPOOL';         // В пуле ожидания

export type WalletType = 
  | 'HOT'              // Горячий кошелек
  | 'COLD'             // Холодный кошелек
  | 'MULTISIG'         // Мультиподпись кошелек
  | 'POOL';            // Пул кошелек

export type WalletStatus = 
  | 'ACTIVE'           // Активный
  | 'INACTIVE'         // Неактивный
  | 'MAINTENANCE'      // На обслуживании
  | 'COMPROMISED';     // Скомпрометирован

export type LogLevel = 
  | 'ERROR'
  | 'WARN' 
  | 'INFO'
  | 'DEBUG'
  | 'TRACE';

export type ConfigType = 
  | 'SYSTEM'           // Системные настройки
  | 'MIXING'           // Настройки микширования
  | 'SECURITY'         // Настройки безопасности
  | 'NETWORK';         // Сетевые настройки

// Интерфейсы для бизнес-логики

export interface MixingPool {
  currency: CurrencyType;
  totalAmount: number;
  participantsCount: number;
  minAmount: number;
  maxAmount: number;
  feePercentage: number;
  isActive: boolean;
}

export interface OutputConfiguration {
  address: string;
  percentage: number;
  amount?: number;
  delayMinutes?: number;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  address: string;
  amount: number;
  scriptPubKey?: string;
}

export interface TransactionOutput {
  address: string;
  amount: number;
  scriptPubKey?: string;
}

export interface SecurityValidation {
  isValid: boolean;
  riskScore: number;
  warnings: string[];
  errors: string[];
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
}

export interface AddressValidation {
  address: string;
  currency: CurrencyType;
  isValid: boolean;
  isBlacklisted: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source?: string;
}

export interface MonitoredTransaction {
  txid: string;
  currency: CurrencyType;
  confirmations: number;
  requiredConfirmations: number;
  amount: number;
  fee: number;
  blockHeight?: number;
  blockHash?: string;
}

export interface PoolStatistics {
  currency: CurrencyType;
  totalVolume: number;
  totalTransactions: number;
  averageAmount: number;
  activeParticipants: number;
  utilizationPercentage: number;
  lastActivity: Date;
}

export interface MixingResult {
  success: boolean;
  mixId: string;
  outputTransactions: string[];
  totalFee: number;
  mixingTime: number;
  participantsCount: number;
  errorMessage?: string;
}

export interface AuditTrail {
  action: string;
  userId?: string;
  resourceType: string;
  resourceId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface BackupInfo {
  filename: string;
  size: number;
  timestamp: Date;
  type: 'FULL' | 'INCREMENTAL';
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  duration?: number;
  checksum?: string;
}

export interface SystemHealth {
  database: {
    status: 'healthy' | 'warning' | 'critical';
    connections: number;
    latency: number;
  };
  blockchain: {
    [K in CurrencyType]: {
      status: 'online' | 'offline' | 'syncing';
      blockHeight: number;
      lastUpdate: Date;
    };
  };
  mixing: {
    activePools: number;
    totalLiquidity: number;
    avgProcessingTime: number;
  };
  security: {
    alertsCount: number;
    lastSecurityCheck: Date;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

// Константы

export const MIXING_CONSTANTS = {
  MIN_PARTICIPANTS: 3,
  MAX_PARTICIPANTS: 100,
  DEFAULT_MIXING_TIME: 30 * 60 * 1000, // 30 минут
  MAX_MIXING_TIME: 24 * 60 * 60 * 1000, // 24 часа
  MIN_ANONYMITY_SET: 5,
  DEFAULT_FEE_PERCENTAGE: 0.5,
  MAX_OUTPUT_ADDRESSES: 10
} as const;

export const CURRENCY_CONFIGS = {
  BTC: {
    decimals: 8,
    minAmount: 0.001,
    maxAmount: 10,
    confirmations: 3,
    networkFee: 0.0001
  },
  ETH: {
    decimals: 18,
    minAmount: 0.01,
    maxAmount: 100,
    confirmations: 12,
    networkFee: 0.002
  },
  USDT: {
    decimals: 6,
    minAmount: 10,
    maxAmount: 100000,
    confirmations: 12,
    networkFee: 5
  },
  SOL: {
    decimals: 9,
    minAmount: 0.1,
    maxAmount: 1000,
    confirmations: 20,
    networkFee: 0.001
  },
  LTC: {
    decimals: 8,
    minAmount: 0.01,
    maxAmount: 100,
    confirmations: 3, // Litecoin быстрее Bitcoin (2.5 минуты блоки)
    networkFee: 0.001
  },
  DASH: {
    decimals: 8,
    minAmount: 0.01,
    maxAmount: 100,
    confirmations: 2, // DASH InstantSend обеспечивает быстрое подтверждение
    networkFee: 0.0001
  },
  ZEC: {
    decimals: 8,
    minAmount: 0.001,
    maxAmount: 50,
    confirmations: 5, // Zcash рекомендует больше подтверждений для shielded транзакций
    networkFee: 0.0001
  }
} as const;

export const SECURITY_CONSTANTS = {
  MAX_RISK_SCORE: 100,
  AUTO_REJECT_THRESHOLD: 95,
  MANUAL_REVIEW_THRESHOLD: 75,
  BLACKLIST_CHECK_ENABLED: true,
  KYT_ENABLED: true,
  AML_MONITORING_ENABLED: true
} as const;

// Утилитарные типы

export type ModelTimestamps = {
  createdAt: Date;
  updatedAt: Date;
};

export type SoftDelete = {
  deletedAt?: Date;
};

export type DatabaseModel<T = {}> = T & ModelTimestamps;

export type DatabaseModelWithSoftDelete<T = {}> = T & ModelTimestamps & SoftDelete;

// Типы для валидации

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

// Все типы уже экспортированы выше как interface/type