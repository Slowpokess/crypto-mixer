import { EventEmitter } from 'events';
import { CryptographicUtils } from './CryptographicUtils';
import { memoryManager } from '../../utils/MemoryManager';
import * as crypto from 'crypto';

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
export class CoinJoinAlgorithm extends EventEmitter {
  private config: CoinJoinConfig;
  private sessions: Map<string, CoinJoinSession>;
  private bannedParticipants: Map<string, Date>;
  private logger: any;

  constructor(dependencies: any = {}) {
    super();
    
    this.logger = dependencies.logger;
    
    this.config = {
      minParticipants: 3,
      maxParticipants: 50,
      standardDenominations: {
        BTC: [0.001, 0.01, 0.1, 1.0, 10.0],
        ETH: [0.1, 1.0, 10.0, 100.0],
        USDT: [100, 1000, 10000, 100000],
        SOL: [1, 10, 100, 1000]
      },
      fees: {
        coordinator: {
          BTC: 0.0001,
          ETH: 0.002,
          USDT: 2,
          SOL: 0.02
        },
        network: {
          BTC: 0.00005,
          ETH: 0.001,
          USDT: 1,
          SOL: 0.001
        }
      },
      timeouts: {
        registration: 10 * 60 * 1000, // 10 minutes
        signing: 2 * 60 * 1000, // 2 minutes
        broadcast: 1 * 60 * 1000 // 1 minute
      },
      cryptography: {
        blindingEnabled: true,
        proofsEnabled: true,
        schnorrSignatures: true
      },
      security: {
        maxFailedAttempts: 3,
        banDuration: 24 * 60 * 60 * 1000, // 24 hours
        requireProofOfFunds: true
      },
      ...dependencies.config
    };

    // Используем bounded collections для предотвращения memory leaks
    this.sessions = memoryManager.createBoundedMap<string, CoinJoinSession>('coinjoin:sessions', {
      maxSize: 1000,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    this.bannedParticipants = memoryManager.createBoundedMap<string, Date>('coinjoin:banned', {
      maxSize: 10000,
      ttl: this.config.security.banDuration
    });
    
    this.logger?.info('Advanced CoinJoin Algorithm initialized', {
      minParticipants: this.config.minParticipants,
      maxParticipants: this.config.maxParticipants,
      blindingEnabled: this.config.cryptography.blindingEnabled
    });
  }

  /**
   * Создает новую CoinJoin сессию
   */
  async createSession(
    currency: string,
    amount: number,
    coordinatorKey: Buffer
  ): Promise<string> {
    try {
      const denomination = this._findOptimalDenomination(currency, amount);
      
      if (!denomination) {
        throw new Error(`No suitable denomination found for ${amount} ${currency}`);
      }

      const sessionId = CryptographicUtils.randomBytes(32).toString('hex');
      const coordinatorId = CryptographicUtils.hash256(coordinatorKey).toString('hex');
      
      const session: CoinJoinSession = {
        id: sessionId,
        participants: new Map(),
        coordinator: {
          id: coordinatorId,
          publicKey: coordinatorKey
        },
        phase: 'REGISTRATION',
        denomination,
        currency,
        fees: {
          coordinator: this.config.fees.coordinator[currency] || 0,
          network: this.config.fees.network[currency] || 0
        },
        mixing: {
          minParticipants: this.config.minParticipants,
          maxParticipants: this.config.maxParticipants,
          rounds: 1,
          currentRound: 1
        },
        timeouts: { ...this.config.timeouts },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.timeouts.registration),
        blameList: []
      };

      this.sessions.set(sessionId, session);
      
      this.logger?.info('CoinJoin session created', {
        sessionId,
        currency,
        denomination,
        coordinatorId
      });

      this.emit('session:created', {
        sessionId,
        currency,
        denomination,
        coordinator: coordinatorId
      });

      // Устанавливаем таймер для автоматического завершения сессии
      this._scheduleSessionTimeout(sessionId);

      return sessionId;

    } catch (error) {
      this.logger?.error('Failed to create CoinJoin session:', error);
      throw error;
    }
  }

  /**
   * Регистрирует участника в сессии
   */
  async registerParticipant(
    sessionId: string,
    inputs: CoinJoinInput[],
    publicKey: Buffer
  ): Promise<string> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.phase !== 'REGISTRATION') {
        throw new Error(`Session ${sessionId} not accepting registrations`);
      }

      const participantId = CryptographicUtils.hash256(publicKey).toString('hex');
      
      // Проверяем, не забанен ли участник
      if (this._isParticipantBanned(participantId)) {
        throw new Error('Participant is temporarily banned');
      }

      // Проверяем лимиты сессии
      if (session.participants.size >= session.mixing.maxParticipants) {
        throw new Error('Session is full');
      }

      // Валидируем входы участника
      await this._validateParticipantInputs(inputs, session);

      // Создаем blinding factor для участника
      const blindingFactor = CryptographicUtils.randomBytes(32);
      
      const participant: CoinJoinParticipant = {
        id: participantId,
        inputs,
        outputs: [],
        publicKey,
        blindingFactor,
        commitments: [],
        proofs: [],
        status: 'REGISTERED'
      };

      session.participants.set(participantId, participant);

      this.logger?.info('Participant registered', {
        sessionId,
        participantId,
        inputsCount: inputs.length,
        totalParticipants: session.participants.size
      });

      this.emit('participant:registered', {
        sessionId,
        participantId,
        participantsCount: session.participants.size
      });

      // Проверяем, можно ли перейти к следующей фазе
      if (session.participants.size >= session.mixing.minParticipants) {
        await this._tryAdvancePhase(sessionId);
      }

      return participantId;

    } catch (error) {
      this.logger?.error('Failed to register participant:', error, { sessionId });
      throw error;
    }
  }

  /**
   * Регистрирует выходные адреса участника (с блайндингом)
   */
  async registerOutputs(
    sessionId: string,
    participantId: string,
    blindedOutputs: BlindedOutput[]
  ): Promise<boolean> {
    try {
      const session = this.sessions.get(sessionId);
      const participant = session?.participants.get(participantId);
      
      if (!session || !participant) {
        throw new Error('Session or participant not found');
      }

      if (session.phase !== 'OUTPUT_REGISTRATION') {
        throw new Error('Session not accepting output registrations');
      }

      // Проверяем range proofs
      for (const blindedOutput of blindedOutputs) {
        const isValidProof = await this._verifyRangeProof(
          blindedOutput.rangeProof,
          blindedOutput.commitment,
          session.denomination
        );
        
        if (!isValidProof) {
          throw new Error('Invalid range proof');
        }
      }

      // Сохраняем blinded outputs
      participant.outputs = await this._processBlindedOutputs(
        blindedOutputs,
        participant.blindingFactor
      );
      participant.status = 'COMMITTED';

      this.logger?.info('Outputs registered', {
        sessionId,
        participantId,
        outputsCount: blindedOutputs.length
      });

      this.emit('outputs:registered', {
        sessionId,
        participantId,
        outputsCount: blindedOutputs.length
      });

      // Проверяем, готовы ли все участники
      const allCommitted = Array.from(session.participants.values())
        .every(p => p.status === 'COMMITTED');
      
      if (allCommitted) {
        await this._tryAdvancePhase(sessionId);
      }

      return true;

    } catch (error) {
      this.logger?.error('Failed to register outputs:', error, {
        sessionId,
        participantId
      });
      throw error;
    }
  }

  /**
   * Создает и подписывает CoinJoin транзакцию
   */
  async signTransaction(
    sessionId: string,
    participantId: string,
    signatures: Buffer[]
  ): Promise<boolean> {
    try {
      const session = this.sessions.get(sessionId);
      const participant = session?.participants.get(participantId);
      
      if (!session || !participant) {
        throw new Error('Session or participant not found');
      }

      if (session.phase !== 'SIGNING') {
        throw new Error('Session not accepting signatures');
      }

      // Проверяем подписи участника
      if (!session.transaction) {
        throw new Error('Transaction not prepared');
      }

      const isValidSignatures = await this._validateParticipantSignatures(
        session.transaction,
        participant,
        signatures
      );

      if (!isValidSignatures) {
        await this._blameParticipant(sessionId, participantId, 'INVALID_SIGNATURES');
        throw new Error('Invalid signatures provided');
      }

      // Сохраняем подписи
      session.transaction.signatures.push(...signatures);
      participant.status = 'SIGNED';

      this.logger?.info('Transaction signed', {
        sessionId,
        participantId,
        signaturesCount: signatures.length
      });

      this.emit('transaction:signed', {
        sessionId,
        participantId,
        signaturesCount: signatures.length
      });

      // Проверяем, подписали ли все участники
      const allSigned = Array.from(session.participants.values())
        .every(p => p.status === 'SIGNED');
      
      if (allSigned) {
        await this._tryAdvancePhase(sessionId);
      }

      return true;

    } catch (error) {
      this.logger?.error('Failed to sign transaction:', error, {
        sessionId,
        participantId
      });
      throw error;
    }
  }

  /**
   * Получает статус сессии
   */
  getSessionStatus(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      phase: session.phase,
      participantsCount: session.participants.size,
      minParticipants: session.mixing.minParticipants,
      maxParticipants: session.mixing.maxParticipants,
      denomination: session.denomination,
      currency: session.currency,
      fees: session.fees,
      timeouts: session.timeouts,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      timeRemaining: Math.max(0, session.expiresAt.getTime() - Date.now()),
      transaction: session.transaction ? {
        id: session.transaction.id,
        inputsCount: session.transaction.inputs.length,
        outputsCount: session.transaction.outputs.length,
        hasSignatures: session.transaction.signatures.length > 0
      } : null
    };
  }

  /**
   * Получает активные сессии
   */
  getActiveSessions(): any[] {
    const activeSessions = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (!['COMPLETED', 'FAILED'].includes(session.phase)) {
        activeSessions.push(this.getSessionStatus(sessionId));
      }
    }

    return activeSessions;
  }

  /**
   * Отменяет сессию
   */
  async cancelSession(sessionId: string, reason: string = 'MANUAL'): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        return;
      }

      session.phase = 'FAILED';

      this.logger?.info('CoinJoin session cancelled', {
        sessionId,
        reason,
        participantsCount: session.participants.size,
        phase: session.phase
      });

      this.emit('session:cancelled', {
        sessionId,
        reason,
        participantsCount: session.participants.size
      });

      // Уведомляем всех участников
      for (const [participantId, participant] of session.participants) {
        this.emit('participant:session_cancelled', {
          sessionId,
          participantId,
          reason
        });
      }

      // Очищаем сессию после задержки
      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 60000);

    } catch (error) {
      this.logger?.error('Failed to cancel session:', error, { sessionId });
    }
  }

  // Приватные методы

  private _findOptimalDenomination(currency: string, amount: number): number | null {
    const denominations = this.config.standardDenominations[currency];
    
    if (!denominations) {
      return null;
    }

    // Находим максимальный номинал, который не превышает сумму
    const suitableDenominations = denominations.filter(d => d <= amount);
    
    if (suitableDenominations.length === 0) {
      return null;
    }

    return Math.max(...suitableDenominations);
  }

  private async _validateParticipantInputs(
    inputs: CoinJoinInput[],
    session: CoinJoinSession
  ): Promise<boolean> {
    try {
      const totalAmount = inputs.reduce((sum, input) => sum + input.amount, 0);
      const requiredAmount = session.denomination + session.fees.coordinator + session.fees.network;

      if (totalAmount < requiredAmount) {
        throw new Error(`Insufficient funds: ${totalAmount} < ${requiredAmount}`);
      }

      // Проверяем proof of funds если требуется
      if (this.config.security.requireProofOfFunds) {
        for (const input of inputs) {
          const isValid = await this._validateProofOfFunds(input);
          if (!isValid) {
            throw new Error(`Invalid proof of funds for input ${input.txId}:${input.outputIndex}`);
          }
        }
      }

      return true;

    } catch (error) {
      this.logger?.error('Input validation failed:', error);
      return false;
    }
  }

  private async _validateProofOfFunds(input: CoinJoinInput): Promise<boolean> {
    // Создаем challenge для proof of funds
    const challenge = CryptographicUtils.randomBytes(32);
    
    // Проверяем, что участник может подписать challenge приватным ключом
    const signature = CryptographicUtils.signMessage(challenge, input.privateKey);
    const isValid = CryptographicUtils.verifySignature(challenge, signature, input.publicKey);
    
    return isValid;
  }

  private async _verifyRangeProof(
    proof: Buffer,
    commitment: Buffer,
    expectedAmount: number
  ): Promise<boolean> {
    // Упрощенная проверка range proof
    // В продакшене нужно использовать proper bulletproofs или аналогичные
    try {
      const proofHash = CryptographicUtils.hash256(proof);
      const commitmentHash = CryptographicUtils.hash256(commitment);
      
      // Базовая проверка структуры
      return proof.length >= 32 && commitment.length >= 32;
    } catch (error) {
      return false;
    }
  }

  private async _processBlindedOutputs(
    blindedOutputs: BlindedOutput[],
    blindingFactor: Buffer
  ): Promise<CoinJoinOutput[]> {
    const outputs: CoinJoinOutput[] = [];
    
    for (const blindedOutput of blindedOutputs) {
      // Разблайндим адрес используя blinding factor
      const addressHash = CryptographicUtils.hash256(
        Buffer.concat([blindedOutput.blindedAddress, blindingFactor])
      );
      
      const output: CoinJoinOutput = {
        address: 'addr_' + addressHash.toString('hex').substring(0, 40),
        amount: 0, // Сумма скрыта в commitment
        script: Buffer.from([]) // Заглушка для script
      };
      
      outputs.push(output);
    }
    
    return outputs;
  }

  private async _tryAdvancePhase(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return;
    }

    try {
      switch (session.phase) {
        case 'REGISTRATION':
          if (session.participants.size >= session.mixing.minParticipants) {
            session.phase = 'OUTPUT_REGISTRATION';
            session.expiresAt = new Date(Date.now() + session.timeouts.registration);
            this.emit('phase:advanced', { sessionId, phase: 'OUTPUT_REGISTRATION' });
          }
          break;

        case 'OUTPUT_REGISTRATION':
          await this._prepareTransaction(sessionId);
          session.phase = 'SIGNING';
          session.expiresAt = new Date(Date.now() + session.timeouts.signing);
          this.emit('phase:advanced', { sessionId, phase: 'SIGNING' });
          break;

        case 'SIGNING':
          await this._broadcastTransaction(sessionId);
          session.phase = 'COMPLETED';
          this.emit('phase:advanced', { sessionId, phase: 'COMPLETED' });
          break;
      }

      this._scheduleSessionTimeout(sessionId);

    } catch (error) {
      this.logger?.error('Failed to advance phase:', error, { sessionId });
      await this.cancelSession(sessionId, 'PHASE_ADVANCE_FAILED');
    }
  }

  private async _prepareTransaction(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const inputs: any[] = [];
    const outputs: any[] = [];

    // Собираем все входы
    for (const participant of session.participants.values()) {
      for (const input of participant.inputs) {
        inputs.push({
          txId: input.txId,
          outputIndex: input.outputIndex,
          amount: input.amount,
          publicKey: input.publicKey,
          participantId: participant.id
        });
      }
    }

    // Собираем все выходы и перемешиваем их
    for (const participant of session.participants.values()) {
      for (const output of participant.outputs) {
        outputs.push({
          address: output.address,
          amount: session.denomination,
          script: output.script,
          participantId: participant.id
        });
      }
    }

    // Перемешиваем выходы для обеспечения анонимности
    this._shuffleArray(outputs);

    session.transaction = {
      id: CryptographicUtils.randomBytes(32).toString('hex'),
      inputs,
      outputs,
      signatures: [],
      rawTx: Buffer.alloc(0) // Будет заполнено после подписания
    };

    this.logger?.info('Transaction prepared', {
      sessionId,
      inputsCount: inputs.length,
      outputsCount: outputs.length
    });
  }

  private async _validateParticipantSignatures(
    transaction: any,
    participant: CoinJoinParticipant,
    signatures: Buffer[]
  ): Promise<boolean> {
    try {
      // Создаем сообщение для подписи
      const txMessage = this._createTransactionMessage(transaction);
      
      // Проверяем каждую подпись участника
      for (let i = 0; i < signatures.length; i++) {
        const input = participant.inputs[i];
        const signature = signatures[i];
        
        if (!input) {
          return false;
        }

        let isValid: boolean;
        
        if (this.config.cryptography.schnorrSignatures) {
          // Проверяем Schnorr подпись
          const schnorrSig = {
            signature,
            publicKey: input.publicKey,
            message: txMessage
          };
          isValid = CryptographicUtils.verifySchnorrSignature(schnorrSig);
        } else {
          // Проверяем ECDSA подпись
          const ecdsaSig = {
            r: signature.slice(0, 32),
            s: signature.slice(32, 64)
          };
          isValid = CryptographicUtils.verifySignature(txMessage, ecdsaSig, input.publicKey);
        }

        if (!isValid) {
          return false;
        }
      }

      return true;

    } catch (error) {
      this.logger?.error('Signature validation failed:', error);
      return false;
    }
  }

  private _createTransactionMessage(transaction: any): Buffer {
    const hasher = crypto.createHash('sha256');
    
    // Добавляем входы
    for (const input of transaction.inputs) {
      hasher.update(input.txId);
      hasher.update(Buffer.from([input.outputIndex]));
      hasher.update(Buffer.from(input.amount.toString()));
    }

    // Добавляем выходы
    for (const output of transaction.outputs) {
      hasher.update(Buffer.from(output.address));
      hasher.update(Buffer.from(output.amount.toString()));
      hasher.update(output.script);
    }

    return hasher.digest();
  }

  private async _broadcastTransaction(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session?.transaction) {
      throw new Error('No transaction to broadcast');
    }

    // Создаем финальную raw транзакцию
    session.transaction.rawTx = this._buildRawTransaction(session.transaction);

    this.logger?.info('Transaction broadcasted', {
      sessionId,
      transactionId: session.transaction.id,
      size: session.transaction.rawTx.length
    });

    this.emit('transaction:broadcasted', {
      sessionId,
      transactionId: session.transaction.id,
      rawTx: session.transaction.rawTx.toString('hex')
    });
  }

  private _buildRawTransaction(transaction: any): Buffer {
    // Упрощенная сборка raw транзакции
    // В продакшене нужно использовать proper transaction building
    const parts: Buffer[] = [];
    
    // Version
    parts.push(Buffer.from([0x01, 0x00, 0x00, 0x00]));
    
    // Input count
    parts.push(Buffer.from([transaction.inputs.length]));
    
    // Inputs
    for (const input of transaction.inputs) {
      parts.push(Buffer.from(input.txId, 'hex'));
      parts.push(Buffer.from([input.outputIndex]));
      parts.push(Buffer.from([0x00])); // Script length (0 for now)
      parts.push(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])); // Sequence
    }
    
    // Output count
    parts.push(Buffer.from([transaction.outputs.length]));
    
    // Outputs
    for (const output of transaction.outputs) {
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeDoubleLE(output.amount);
      parts.push(amountBuffer);
      parts.push(Buffer.from([output.script.length]));
      parts.push(output.script);
    }
    
    // Lock time
    parts.push(Buffer.from([0x00, 0x00, 0x00, 0x00]));
    
    return Buffer.concat(parts);
  }

  private async _blameParticipant(
    sessionId: string,
    participantId: string,
    reason: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return;
    }

    session.blameList.push(participantId);
    
    // Баним участника
    this.bannedParticipants.set(participantId, new Date());
    
    this.logger?.warn('Participant blamed and banned', {
      sessionId,
      participantId,
      reason
    });

    this.emit('participant:blamed', {
      sessionId,
      participantId,
      reason
    });
  }

  private _isParticipantBanned(participantId: string): boolean {
    const banDate = this.bannedParticipants.get(participantId);
    
    if (!banDate) {
      return false;
    }

    const banExpires = banDate.getTime() + this.config.security.banDuration;
    return Date.now() < banExpires;
  }

  private _scheduleSessionTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    
    if (!session || ['COMPLETED', 'FAILED'].includes(session.phase)) {
      return;
    }

    const timeout = session.expiresAt.getTime() - Date.now();
    
    if (timeout > 0) {
      memoryManager.createTimer(
        `coinjoin:timeout:${sessionId}`,
        () => {
          this.cancelSession(sessionId, 'TIMEOUT');
        },
        timeout,
        'timeout',
        `Session ${sessionId} timeout`
      );
    }
  }

  private _shuffleArray<T>(array: T[]): void {
    // Fisher-Yates shuffle для криптографической стойкости
    for (let i = array.length - 1; i > 0; i--) {
      const randomBytes = CryptographicUtils.randomBytes(4);
      const j = randomBytes.readUInt32BE(0) % (i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}