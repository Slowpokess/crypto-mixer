import { Request, Response } from 'express';
import { MixingEngine } from '../../mixer/engine/MixingEngine';
import { SecurityValidator } from '../../mixer/security/SecurityValidator';
import { PoolManager } from '../../mixer/pool/PoolManager';
import { MixingScheduler } from '../../mixer/scheduler/MixingScheduler';
import { HSMManager } from '../../security/HSMManager';
import { VaultManager } from '../../security/VaultManager';
declare global {
    namespace Express {
        interface Request {
            sessionID?: string;
        }
    }
}
interface CreateMixRequestBody {
    currency: CurrencyType;
    amount: number;
    outputAddresses: OutputAddress[];
    delay?: number;
    anonymityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    mixingAlgorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH';
}
interface OutputAddress {
    address: string;
    percentage: number;
}
type CurrencyType = 'BTC' | 'ETH' | 'USDT' | 'SOL';
interface MixRequestResponse {
    sessionId: string;
    depositAddress: string;
    amount: number;
    currency: CurrencyType;
    fee: number;
    totalAmount: number;
    expiresAt: Date;
    status: string;
    estimatedCompletionTime: Date;
    anonymityLevel: string;
    mixingPhases: MixingPhase[];
}
interface MixingPhase {
    phase: number;
    name: string;
    description: string;
    estimatedDuration: number;
    status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
}
interface StatusResponse {
    sessionId: string;
    status: string;
    currentPhase: MixingPhase;
    progress: number;
    confirmations: number;
    requiredConfirmations: number;
    estimatedTimeRemaining: number;
    anonymityScore: number;
    transactionHashes: string[];
    mixingMetrics: MixingMetrics;
}
interface MixingMetrics {
    participantCount: number;
    poolUtilization: number;
    privacyLevel: number;
    riskScore: number;
}
interface ErrorResponse {
    error: string;
    code: string;
    details?: any;
}
/**
 * Расширенный контроллер микширования с полной интеграцией
 *
 * Функциональность:
 * - Реальная интеграция с базой данных
 * - HSM/Vault для безопасной генерации адресов
 * - Полноценный процесс микширования
 * - Детальный мониторинг и статистика
 * - Продвинутая валидация и безопасность
 */
export declare class EnhancedMixController {
    private hsmManager;
    private vaultManager;
    private mixingEngine;
    private securityValidator;
    private poolManager;
    private scheduler;
    private logger;
    constructor(dependencies: {
        hsmManager: HSMManager;
        vaultManager: VaultManager;
        mixingEngine: MixingEngine;
        securityValidator: SecurityValidator;
        poolManager: PoolManager;
        scheduler: MixingScheduler;
    });
    /**
     * Создание запроса на микширование с полной валидацией и безопасностью
     */
    createMixRequest(req: Request<{}, MixRequestResponse | ErrorResponse, CreateMixRequestBody>, res: Response<MixRequestResponse | ErrorResponse>): Promise<void>;
    /**
     * Получение детального статуса микширования
     */
    getStatus(req: Request<{
        sessionId: string;
    }, StatusResponse | ErrorResponse>, res: Response<StatusResponse | ErrorResponse>): Promise<void>;
    /**
     * Генерация безопасного депозитного адреса
     */
    generateDepositAddress(req: Request<{}, any, {
        currency: CurrencyType;
    }>, res: Response): Promise<void>;
    /**
     * Отмена запроса на микширование
     */
    cancelMixRequest(req: Request<{
        sessionId: string;
    }>, res: Response): Promise<void>;
    /**
     * Получение информации о фазах микширования
     */
    getMixingPhases(req: Request<{
        sessionId: string;
    }>, res: Response): Promise<void>;
    private validateMixRequest;
    private generateSecureDepositAddress;
    private deriveAddressFromPublicKey;
    private generateSecureSessionId;
    private calculateDynamicFees;
    private estimateNetworkFee;
    private generateMixingPhases;
    private calculateOptimalDelay;
    private calculateEstimatedCompletion;
    private initiateMixingProcess;
    private isSupportedCurrency;
    private getCurrencyLimits;
    private isValidAddress;
    private canCancelMixRequest;
    private getCurrentMixingPhase;
    private calculateProgress;
    private getConfirmations;
    private getMixingMetrics;
    private calculateTimeRemaining;
    private getTransactionHashes;
    private calculateAnonymityScore;
}
export default EnhancedMixController;
