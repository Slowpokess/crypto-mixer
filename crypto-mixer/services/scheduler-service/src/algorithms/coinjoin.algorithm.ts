import crypto from 'crypto';
import { EventEmitter } from 'events';

interface CoinJoinInput {
  txId: string;
  outputIndex: number;
  amount: number;
  address: string;
  privateKey?: string;
  script?: string;
}

interface CoinJoinOutput {
  address: string;
  amount: number;
  script?: string;
}

interface CoinJoinParticipant {
  id: string;
  inputs: CoinJoinInput[];
  outputs: CoinJoinOutput[];
  publicKey: string;
  blindingFactor?: string;
}

interface CoinJoinSession {
  id: string;
  participants: CoinJoinParticipant[];
  coordinatorId: string;
  minParticipants: number;
  maxParticipants: number;
  denomination: number;
  currency: string;
  fees: number;
  status: 'WAITING' | 'SIGNING' | 'BROADCASTING' | 'COMPLETED' | 'FAILED';
  round: number;
  createdAt: Date;
  expiresAt: Date;
  transaction?: any;
}

interface CoinJoinConfig {
  minParticipants: number;
  maxParticipants: number;
  sessionTimeout: number;
  signingTimeout: number;
  standardDenominations: Record<string, number[]>;
  fees: Record<string, number>;
  maxRounds: number;
}

export class CoinJoinAlgorithm extends EventEmitter {
  private config: CoinJoinConfig;
  private sessions: Map<string, CoinJoinSession>;
  private pendingParticipants: Map<string, CoinJoinParticipant[]>;
  private logger: any;
  private cryptoService: any;
  private blockchainManager: any;

  constructor(dependencies: any = {}) {
    super();
    
    this.logger = dependencies.logger;
    this.cryptoService = dependencies.cryptoService;
    this.blockchainManager = dependencies.blockchainManager;
    
    this.config = {
      minParticipants: 3,
      maxParticipants: 100,
      sessionTimeout: 30 * 60 * 1000,
      signingTimeout: 5 * 60 * 1000,
      standardDenominations: {
        BTC: [0.001, 0.01, 0.1, 1.0, 10.0],
        ETH: [0.1, 1.0, 10.0, 100.0],
        USDT: [100, 1000, 10000, 100000],
        SOL: [1, 10, 100, 1000]
      },
      fees: {
        BTC: 0.0001,
        ETH: 0.001,
        USDT: 1,
        SOL: 0.01
      },
      maxRounds: 5,
      ...dependencies.config
    };

    this.sessions = new Map();
    this.pendingParticipants = new Map();
    
    this.logger?.info('CoinJoin алгоритм инициализирован');
  }

  async createSession(
    currency: string,
    amount: number,
    coordinatorId: string
  ): Promise<string> {
    try {
      const denomination = this._findOptimalDenomination(currency, amount);
      
      if (!denomination) {
        throw new Error(`Не найден подходящий номинал для ${amount} ${currency}`);
      }

      const sessionId = crypto.randomBytes(16).toString('hex');
      const session: CoinJoinSession = {
        id: sessionId,
        participants: [],
        coordinatorId,
        minParticipants: this.config.minParticipants,
        maxParticipants: this.config.maxParticipants,
        denomination,
        currency,
        fees: this.config.fees[currency] || 0,
        status: 'WAITING',
        round: 1,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.sessionTimeout)
      };

      this.sessions.set(sessionId, session);
      this.pendingParticipants.set(sessionId, []);

      this.logger?.info('Создана CoinJoin сессия', {
        sessionId,
        currency,
        denomination,
        coordinatorId
      });

      this.emit('session:created', { sessionId, currency, denomination });
      this._startSessionTimer(sessionId);

      return sessionId;

    } catch (error) {
      this.logger?.error('Ошибка создания CoinJoin сессии:', error);
      throw error;
    }
  }

  async joinSession(
    sessionId: string,
    participant: Omit<CoinJoinParticipant, 'id'>
  ): Promise<boolean> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Сессия ${sessionId} не найдена`);
      }

      if (session.status !== 'WAITING') {
        throw new Error(`Сессия ${sessionId} не принимает новых участников`);
      }

      if (session.participants.length >= session.maxParticipants) {
        throw new Error(`Сессия ${sessionId} заполнена`);
      }

      const isValid = await this._validateParticipantInputs(
        participant,
        session.currency,
        session.denomination
      );

      if (!isValid) {
        throw new Error('Неверные входы участника');
      }

      const participantWithId: CoinJoinParticipant = {
        ...participant,
        id: crypto.randomBytes(16).toString('hex'),
        blindingFactor: crypto.randomBytes(32).toString('hex')
      };

      session.participants.push(participantWithId);

      this.logger?.info('Участник присоединился к CoinJoin сессии', {
        sessionId,
        participantId: participantWithId.id,
        participantsCount: session.participants.length
      });

      this.emit('participant:joined', {
        sessionId,
        participantId: participantWithId.id,
        participantsCount: session.participants.length
      });

      if (session.participants.length >= session.minParticipants) {
        await this._tryStartMixing(sessionId);
      }

      return true;

    } catch (error) {
      this.logger?.error('Ошибка присоединения к CoinJoin сессии:', error, {
        sessionId
      });
      throw error;
    }
  }

  async startMixing(sessionId: string): Promise<any> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Сессия ${sessionId} не найдена`);
      }

      if (session.status !== 'WAITING') {
        throw new Error(`Сессия ${sessionId} уже обрабатывается`);
      }

      if (session.participants.length < session.minParticipants) {
        throw new Error(`Недостаточно участников: ${session.participants.length}/${session.minParticipants}`);
      }

      session.status = 'SIGNING';

      this.logger?.info('Начинается CoinJoin микширование', {
        sessionId,
        participantsCount: session.participants.length,
        denomination: session.denomination
      });

      const transaction = await this._createCoinJoinTransaction(session);
      session.transaction = transaction;

      const signatures = await this._collectSignatures(session);

      const isValid = await this._validateAllSignatures(session, signatures);
      
      if (!isValid) {
        session.status = 'FAILED';
        throw new Error('Неверные подписи участников');
      }

      const finalTransaction = await this._finalizeTransaction(session, signatures);

      const txHash = await this._broadcastTransaction(finalTransaction, session.currency);

      session.status = 'COMPLETED';
      session.transaction.hash = txHash;

      this.logger?.info('CoinJoin микширование завершено', {
        sessionId,
        txHash,
        participantsCount: session.participants.length
      });

      this.emit('mixing:completed', {
        sessionId,
        txHash,
        participantsCount: session.participants.length
      });

      return {
        sessionId,
        txHash,
        status: 'COMPLETED',
        participantsCount: session.participants.length
      };

    } catch (error) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'FAILED';
      }

      this.logger?.error('Ошибка CoinJoin микширования:', error, {
        sessionId
      });

      this.emit('mixing:failed', { sessionId, error: (error as Error).message });
      throw error;
    }
  }

  getSessionStatus(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      status: session.status,
      participantsCount: session.participants.length,
      minParticipants: session.minParticipants,
      maxParticipants: session.maxParticipants,
      denomination: session.denomination,
      currency: session.currency,
      round: session.round,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      timeRemaining: Math.max(0, session.expiresAt.getTime() - Date.now())
    };
  }

  getActiveSessions(): any[] {
    const activeSessions = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (['WAITING', 'SIGNING'].includes(session.status)) {
        activeSessions.push(this.getSessionStatus(sessionId));
      }
    }

    return activeSessions;
  }

  async cancelSession(sessionId: string, reason: string = 'MANUAL'): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        return;
      }

      session.status = 'FAILED';

      this.logger?.info('CoinJoin сессия отменена', {
        sessionId,
        reason,
        participantsCount: session.participants.length
      });

      this.emit('session:cancelled', {
        sessionId,
        reason,
        participantsCount: session.participants.length
      });

      for (const participant of session.participants) {
        this.emit('participant:session_cancelled', {
          sessionId,
          participantId: participant.id,
          reason
        });
      }

      setTimeout(() => {
        this.sessions.delete(sessionId);
        this.pendingParticipants.delete(sessionId);
      }, 60000);

    } catch (error) {
      this.logger?.error('Ошибка отмены сессии:', error, { sessionId });
    }
  }

  public async createTransaction(participants: any[], currency: string): Promise<any> {
    const amount = participants[0].amount;
    if (!participants.every(p => p.amount === amount)) {
      throw new Error('All CoinJoin participants must have same amount');
    }

    const inputs = participants.map(p => ({
      address: p.deposit_address,
      amount: p.total_amount,
      mixRequestId: p.id,
    }));

    const outputs = [];
    for (const participant of participants) {
      const outputAddresses = JSON.parse(participant.output_addresses);
      for (const output of outputAddresses) {
        outputs.push({
          address: output.address,
          amount: (amount * output.percentage) / 100,
          mixRequestId: participant.id,
        });
      }
    }

    this.shuffleArray(outputs);

    return {
      id: this.generateTransactionId(),
      currency,
      inputs,
      outputs,
      participants: participants.map(p => p.id),
      created_at: new Date(),
    };
  }

  private _findOptimalDenomination(currency: string, amount: number): number | null {
    const denominations = this.config.standardDenominations[currency];
    
    if (!denominations) {
      return null;
    }

    const suitableDenominations = denominations.filter(d => d <= amount);
    
    if (suitableDenominations.length === 0) {
      return null;
    }

    return Math.max(...suitableDenominations);
  }

  private async _validateParticipantInputs(
    participant: Omit<CoinJoinParticipant, 'id'>,
    currency: string,
    denomination: number
  ): Promise<boolean> {
    try {
      const totalInput = participant.inputs.reduce((sum, input) => sum + input.amount, 0);
      const fees = this.config.fees[currency] || 0;
      const requiredAmount = denomination + fees;

      if (totalInput < requiredAmount) {
        this.logger?.warn('Недостаточно средств у участника', {
          totalInput,
          requiredAmount,
          denomination,
          fees
        });
        return false;
      }

      for (const input of participant.inputs) {
        const isValid = await this._validateUTXO(input, currency);
        if (!isValid) {
          this.logger?.warn('Неверный UTXO', {
            txId: input.txId,
            outputIndex: input.outputIndex
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      this.logger?.error('Ошибка проверки входов участника:', error);
      return false;
    }
  }

  private async _validateUTXO(input: CoinJoinInput, currency: string): Promise<boolean> {
    try {
      if (!this.blockchainManager) {
        return true;
      }

      const utxo = await this.blockchainManager.getUTXO(
        currency,
        input.txId,
        input.outputIndex
      );

      return utxo && !utxo.spent && utxo.amount === input.amount;

    } catch (error) {
      this.logger?.error('Ошибка проверки UTXO:', error);
      return false;
    }
  }

  private async _tryStartMixing(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session || session.status !== 'WAITING') {
      return;
    }

    setTimeout(async () => {
      if (session.status === 'WAITING') {
        await this.startMixing(sessionId);
      }
    }, 30000);
  }

  private async _createCoinJoinTransaction(session: CoinJoinSession): Promise<any> {
    try {
      const inputs = [];
      const outputs = [];

      for (const participant of session.participants) {
        for (const input of participant.inputs) {
          inputs.push({
            txId: input.txId,
            outputIndex: input.outputIndex,
            amount: input.amount,
            script: input.script,
            participantId: participant.id
          });
        }
      }

      for (const participant of session.participants) {
        for (const output of participant.outputs) {
          if (output.amount === session.denomination) {
            outputs.push({
              address: output.address,
              amount: output.amount,
              script: output.script,
              participantId: participant.id
            });
          }
        }
      }

      this.shuffleArray(outputs);

      const transaction = {
        id: crypto.randomBytes(32).toString('hex'),
        inputs,
        outputs,
        fees: session.fees,
        lockTime: 0,
        version: 1,
        sessionId: session.id
      };

      this.logger?.info('Создана CoinJoin транзакция', {
        sessionId: session.id,
        inputsCount: inputs.length,
        outputsCount: outputs.length,
        totalAmount: outputs.reduce((sum, out) => sum + out.amount, 0)
      });

      return transaction;

    } catch (error) {
      this.logger?.error('Ошибка создания CoinJoin транзакции:', error);
      throw error;
    }
  }

  private async _collectSignatures(session: CoinJoinSession): Promise<Map<string, any>> {
    const signatures = new Map();
    const signingDeadline = Date.now() + this.config.signingTimeout;

    for (const participant of session.participants) {
      try {
        const signature = await this._requestParticipantSignature(
          participant,
          session.transaction
        );

        if (signature) {
          signatures.set(participant.id, signature);
        }

        if (Date.now() > signingDeadline) {
          throw new Error('Истекло время ожидания подписей');
        }

      } catch (error) {
        this.logger?.error('Ошибка получения подписи:', error, {
          participantId: participant.id
        });
      }
    }

    return signatures;
  }

  private async _requestParticipantSignature(
    participant: CoinJoinParticipant,
    transaction: any
  ): Promise<any> {
    try {
      const messageHash = this._calculateTransactionHash(transaction);
      
      if (this.cryptoService) {
        return await this.cryptoService.sign(messageHash, participant.publicKey);
      }

      return {
        participantId: participant.id,
        signature: crypto.randomBytes(64).toString('hex'),
        publicKey: participant.publicKey,
        messageHash
      };

    } catch (error) {
      this.logger?.error('Ошибка запроса подписи:', error);
      throw error;
    }
  }

  private async _validateAllSignatures(
    session: CoinJoinSession,
    signatures: Map<string, any>
  ): Promise<boolean> {
    try {
      const messageHash = this._calculateTransactionHash(session.transaction);

      for (const participant of session.participants) {
        const signature = signatures.get(participant.id);
        
        if (!signature) {
          this.logger?.warn('Отсутствует подпись участника', {
            participantId: participant.id
          });
          return false;
        }

        const isValid = await this._verifySignature(
          signature,
          messageHash,
          participant.publicKey
        );

        if (!isValid) {
          this.logger?.warn('Неверная подпись участника', {
            participantId: participant.id
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      this.logger?.error('Ошибка проверки подписей:', error);
      return false;
    }
  }

  private async _verifySignature(
    signature: any,
    messageHash: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      if (this.cryptoService) {
        return await this.cryptoService.verify(signature, messageHash, publicKey);
      }

      return true;

    } catch (error) {
      this.logger?.error('Ошибка проверки подписи:', error);
      return false;
    }
  }

  private async _finalizeTransaction(
    session: CoinJoinSession,
    signatures: Map<string, any>
  ): Promise<any> {
    const transaction = { ...session.transaction };
    
    transaction.signatures = Array.from(signatures.values());
    transaction.finalizedAt = new Date();
    transaction.status = 'FINALIZED';

    return transaction;
  }

  private async _broadcastTransaction(
    transaction: any,
    currency: string
  ): Promise<string> {
    try {
      if (this.blockchainManager) {
        return await this.blockchainManager.broadcastTransaction(transaction, currency);
      }

      return crypto.randomBytes(32).toString('hex');

    } catch (error) {
      this.logger?.error('Ошибка трансляции транзакции:', error);
      throw error;
    }
  }

  private _calculateTransactionHash(transaction: any): string {
    const data = JSON.stringify({
      inputs: transaction.inputs,
      outputs: transaction.outputs,
      fees: transaction.fees,
      lockTime: transaction.lockTime,
      version: transaction.version
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private generateTransactionId(): string {
    return 'cj-' + Date.now() + '-' + Math.random().toString(36).substring(2);
  }

  private _startSessionTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return;
    }

    const timeout = session.expiresAt.getTime() - Date.now();
    
    setTimeout(() => {
      const currentSession = this.sessions.get(sessionId);
      
      if (currentSession && currentSession.status === 'WAITING') {
        this.cancelSession(sessionId, 'TIMEOUT');
      }
    }, timeout);
  }
}