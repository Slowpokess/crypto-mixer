export type CurrencyType = 'BTC' | 'ETH' | 'USDT' | 'SOL' | 'LTC' | 'DASH' | 'ZEC';
export type MixRequestStatus = 'PENDING' | 'PENDING_DEPOSIT' | 'DEPOSITED' | 'POOLING' | 'MIXING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
export type MixingStatus = MixRequestStatus;
export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'BROADCASTING' | 'MEMPOOL';
export type WalletType = 'HOT' | 'COLD' | 'MULTISIG' | 'POOL';
export type WalletStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'COMPROMISED';
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
export type ConfigType = 'SYSTEM' | 'MIXING' | 'SECURITY' | 'NETWORK';
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
export declare const MIXING_CONSTANTS: {
    readonly MIN_PARTICIPANTS: 3;
    readonly MAX_PARTICIPANTS: 100;
    readonly DEFAULT_MIXING_TIME: number;
    readonly MAX_MIXING_TIME: number;
    readonly MIN_ANONYMITY_SET: 5;
    readonly DEFAULT_FEE_PERCENTAGE: 0.5;
    readonly MAX_OUTPUT_ADDRESSES: 10;
};
export declare const CURRENCY_CONFIGS: {
    readonly BTC: {
        readonly decimals: 8;
        readonly minAmount: 0.001;
        readonly maxAmount: 10;
        readonly confirmations: 3;
        readonly networkFee: 0.0001;
    };
    readonly ETH: {
        readonly decimals: 18;
        readonly minAmount: 0.01;
        readonly maxAmount: 100;
        readonly confirmations: 12;
        readonly networkFee: 0.002;
    };
    readonly USDT: {
        readonly decimals: 6;
        readonly minAmount: 10;
        readonly maxAmount: 100000;
        readonly confirmations: 12;
        readonly networkFee: 5;
    };
    readonly SOL: {
        readonly decimals: 9;
        readonly minAmount: 0.1;
        readonly maxAmount: 1000;
        readonly confirmations: 20;
        readonly networkFee: 0.001;
    };
    readonly LTC: {
        readonly decimals: 8;
        readonly minAmount: 0.01;
        readonly maxAmount: 100;
        readonly confirmations: 3;
        readonly networkFee: 0.001;
    };
    readonly DASH: {
        readonly decimals: 8;
        readonly minAmount: 0.01;
        readonly maxAmount: 100;
        readonly confirmations: 2;
        readonly networkFee: 0.0001;
    };
    readonly ZEC: {
        readonly decimals: 8;
        readonly minAmount: 0.001;
        readonly maxAmount: 50;
        readonly confirmations: 5;
        readonly networkFee: 0.0001;
    };
};
export declare const SECURITY_CONSTANTS: {
    readonly MAX_RISK_SCORE: 100;
    readonly AUTO_REJECT_THRESHOLD: 95;
    readonly MANUAL_REVIEW_THRESHOLD: 75;
    readonly BLACKLIST_CHECK_ENABLED: true;
    readonly KYT_ENABLED: true;
    readonly AML_MONITORING_ENABLED: true;
};
export type ModelTimestamps = {
    createdAt: Date;
    updatedAt: Date;
};
export type SoftDelete = {
    deletedAt?: Date;
};
export type DatabaseModel<T = {}> = T & ModelTimestamps;
export type DatabaseModelWithSoftDelete<T = {}> = T & ModelTimestamps & SoftDelete;
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
