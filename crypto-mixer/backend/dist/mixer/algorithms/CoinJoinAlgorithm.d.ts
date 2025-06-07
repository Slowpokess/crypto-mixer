import { EventEmitter } from 'events';
export interface CoinJoinInput {
    txId: string;
    outputIndex: number;
    amount: number;
    address: string;
    privateKey: Buffer;
    publicKey: Buffer;
    scriptSig?: Buffer;
    witness?: Buffer[];
}
export interface CoinJoinOutput {
    address: string;
    amount: number;
    script: Buffer;
}
export interface CoinJoinParticipant {
    id: string;
    inputs: CoinJoinInput[];
    outputs: CoinJoinOutput[];
    publicKey: Buffer;
    blindingFactor: Buffer;
    commitments: Buffer[];
    proofs: any[];
    status: 'REGISTERED' | 'COMMITTED' | 'SIGNED' | 'CONFIRMED' | 'FAILED';
}
export interface BlindedOutput {
    blindedAddress: Buffer;
    rangeProof: Buffer;
    commitment: Buffer;
}
export interface CoinJoinSession {
    id: string;
    participants: Map<string, CoinJoinParticipant>;
    coordinator: {
        id: string;
        publicKey: Buffer;
    };
    phase: 'REGISTRATION' | 'OUTPUT_REGISTRATION' | 'SIGNING' | 'BROADCASTING' | 'COMPLETED' | 'FAILED';
    denomination: number;
    currency: string;
    fees: {
        coordinator: number;
        network: number;
    };
    mixing: {
        minParticipants: number;
        maxParticipants: number;
        rounds: number;
        currentRound: number;
    };
    transaction?: {
        id: string;
        inputs: any[];
        outputs: any[];
        signatures: Buffer[];
        rawTx: Buffer;
    };
    timeouts: {
        registration: number;
        signing: number;
        broadcast: number;
    };
    createdAt: Date;
    expiresAt: Date;
    blameList: string[];
}
export interface CoinJoinConfig {
    minParticipants: number;
    maxParticipants: number;
    standardDenominations: Record<string, number[]>;
    fees: {
        coordinator: Record<string, number>;
        network: Record<string, number>;
    };
    timeouts: {
        registration: number;
        signing: number;
        broadcast: number;
    };
    cryptography: {
        blindingEnabled: boolean;
        proofsEnabled: boolean;
        schnorrSignatures: boolean;
    };
    security: {
        maxFailedAttempts: number;
        banDuration: number;
        requireProofOfFunds: boolean;
    };
}
/**
 * Продвинутая реализация CoinJoin алгоритма микширования
 * Включает защиту от деанонимизации и атак Sybil
 */
export declare class CoinJoinAlgorithm extends EventEmitter {
    private config;
    private sessions;
    private bannedParticipants;
    private logger;
    constructor(dependencies?: any);
    /**
     * Создает новую CoinJoin сессию
     */
    createSession(currency: string, amount: number, coordinatorKey: Buffer): Promise<string>;
    /**
     * Регистрирует участника в сессии
     */
    registerParticipant(sessionId: string, inputs: CoinJoinInput[], publicKey: Buffer): Promise<string>;
    /**
     * Регистрирует выходные адреса участника (с блайндингом)
     */
    registerOutputs(sessionId: string, participantId: string, blindedOutputs: BlindedOutput[]): Promise<boolean>;
    /**
     * Создает и подписывает CoinJoin транзакцию
     */
    signTransaction(sessionId: string, participantId: string, signatures: Buffer[]): Promise<boolean>;
    /**
     * Получает статус сессии
     */
    getSessionStatus(sessionId: string): any;
    /**
     * Получает активные сессии
     */
    getActiveSessions(): any[];
    /**
     * Отменяет сессию
     */
    cancelSession(sessionId: string, reason?: string): Promise<void>;
    private _findOptimalDenomination;
    private _validateParticipantInputs;
    private _validateProofOfFunds;
    private _verifyRangeProof;
    private _processBlindedOutputs;
    private _tryAdvancePhase;
    private _prepareTransaction;
    private _validateParticipantSignatures;
    private _createTransactionMessage;
    private _broadcastTransaction;
    private _buildRawTransaction;
    private _blameParticipant;
    private _isParticipantBanned;
    private _scheduleSessionTimeout;
    private _shuffleArray;
}
