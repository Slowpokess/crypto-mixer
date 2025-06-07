import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction, ConfirmOptions, BlockheightBasedTransactionConfirmationStrategy } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

/**
 * Интерфейсы для Solana RPC
 */
interface SolanaAccountInfo {
  executable: boolean;
  owner: string;
  lamports: number;
  data: string | Buffer;
  rentEpoch: number;
}

interface SolanaBlockProduction {
  byIdentity: { [validatorIdentity: string]: [number, number] };
  range: {
    firstSlot: number;
    lastSlot: number;
  };
}

interface SolanaClusterNode {
  pubkey: string;
  gossip: string | null;
  tpu: string | null;
  rpc: string | null;
  version: string | null;
  featureSet: number | null;
  shredVersion: number | null;
}

interface SolanaEpochInfo {
  absoluteSlot: number;
  blockHeight: number;
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  transactionCount: number;
}

interface SolanaInflationGovernor {
  initial: number;
  terminal: number;
  taper: number;
  foundation: number;
  foundationTerm: number;
}

interface SolanaInflationRate {
  total: number;
  validator: number;
  foundation: number;
  epoch: number;
}

interface SolanaPerformanceSample {
  slot: number;
  numTransactions: number;
  numSlots: number;
  samplePeriodSecs: number;
}

interface SolanaSupply {
  total: number;
  circulating: number;
  nonCirculating: number;
  nonCirculatingAccounts: string[];
}

interface SolanaTokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

interface SolanaTransactionResponse {
  slot: number;
  transaction: {
    message: {
      accountKeys: string[];
      header: {
        numReadonlySignedAccounts: number;
        numReadonlyUnsignedAccounts: number;
        numRequiredSignatures: number;
      };
      instructions: {
        accounts: number[];
        data: string;
        programIdIndex: number;
      }[];
      recentBlockhash: string;
    };
    signatures: string[];
  };
  meta: {
    err: any;
    fee: number;
    innerInstructions: any[];
    logMessages: string[];
    postBalances: number[];
    postTokenBalances: any[];
    preBalances: number[];
    preTokenBalances: any[];
    rewards: any[];
    status: { Ok: null } | { Err: any };
  };
  blockTime: number | null;
}

interface SolanaVersionInfo {
  'solana-core': string;
  'feature-set': number;
}

interface SolanaVoteAccounts {
  current: {
    votePubkey: string;
    nodePubkey: string;
    activatedStake: number;
    epochVoteAccount: boolean;
    epochCredits: [number, number, number][];
    commission: number;
    lastVote: number;
    rootSlot: number;
  }[];
  delinquent: {
    votePubkey: string;
    nodePubkey: string;
    activatedStake: number;
    epochVoteAccount: boolean;
    epochCredits: [number, number, number][];
    commission: number;
    lastVote: number;
    rootSlot: number;
  }[];
}

/**
 * Конфигурация для Solana RPC клиента
 */
export interface SolanaRpcConfig {
  rpcUrl?: string;
  wsUrl?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  confirmTransactionInitialTimeout?: number;
}

/**
 * Продакшн-готовый клиент для Solana RPC
 * Полная интеграция с Solana через @solana/web3.js и прямые RPC вызовы
 */
export class SolanaRpcClient {
  private config: SolanaRpcConfig;
  private connection: Connection;
  private httpClient: AxiosInstance | null = null;
  private _isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: SolanaRpcConfig) {
    this.config = {
      rpcUrl: 'http://localhost:8899',
      commitment: 'confirmed',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      confirmTransactionInitialTimeout: 60000,
      ...config
    };

    // Инициализация соединения с Solana
    this.connection = new Connection(
      this.config.rpcUrl!,
      {
        commitment: this.config.commitment,
        confirmTransactionInitialTimeout: this.config.confirmTransactionInitialTimeout
      }
    );

    // Настройка HTTP клиента для прямых RPC вызовов
    this.setupHttpClient();

    // Запуск периодической проверки здоровья
    this.startHealthCheck();
  }

  /**
   * Настройка HTTP клиента для прямых RPC вызовов
   */
  private setupHttpClient(): void {
    this.httpClient = axios.create({
      baseURL: this.config.rpcUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoMixer-Solana/1.0'
      }
    });
  }

  /**
   * Выполнение прямого RPC вызова к Solana
   */
  private async rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
    if (!this.httpClient) {
      throw new Error('HTTP client not configured for RPC calls');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const response = await this.httpClient.post('/', request);
        
        if (response.data.error) {
          throw new Error(`Solana RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
        }

        this._isConnected = true;
        return response.data.result;
        
      } catch (error: any) {
        lastError = error;
        this._isConnected = false;
        
        logger.warn(`Solana RPC attempt ${attempt} failed`, {
          method,
          error: error.message,
          attempt,
          maxRetries: this.config.maxRetries
        });

        if (attempt < this.config.maxRetries!) {
          await this.delay(this.config.retryDelay! * attempt);
        }
      }
    }

    logger.error('Solana RPC failed after all retries', {
      method,
      params,
      error: lastError?.message
    });
    
    throw lastError;
  }

  /**
   * Задержка для повторных попыток
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Запуск периодической проверки здоровья
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getSlot();
        this.lastHealthCheck = new Date();
      } catch (error) {
        logger.warn('Solana RPC health check failed', { error });
      }
    }, 30000); // Каждые 30 секунд
  }

  /**
   * Остановка проверки здоровья
   */
  public stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ========== ОСНОВНЫЕ МЕТОДЫ API ==========

  /**
   * Получение текущего слота
   */
  async getSlot(): Promise<number> {
    return await this.connection.getSlot();
  }

  /**
   * Получение высоты блока
   */
  async getBlockHeight(): Promise<number> {
    return await this.connection.getBlockHeight();
  }

  /**
   * Получение баланса аккаунта в лампортах
   */
  async getBalance(publicKey: PublicKey | string): Promise<number> {
    const pubkey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
    return await this.connection.getBalance(pubkey);
  }

  /**
   * Получение баланса в SOL
   */
  async getBalanceInSol(publicKey: PublicKey | string): Promise<number> {
    const balance = await this.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Получение информации об аккаунте
   */
  async getAccountInfo(publicKey: PublicKey | string): Promise<SolanaAccountInfo | null> {
    const pubkey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
    const accountInfo = await this.connection.getAccountInfo(pubkey);
    
    if (!accountInfo) {
      return null;
    }

    return {
      executable: accountInfo.executable,
      owner: accountInfo.owner.toBase58(),
      lamports: accountInfo.lamports,
      data: accountInfo.data,
      rentEpoch: accountInfo.rentEpoch
    };
  }

  /**
   * Создание нового keypair
   */
  generateKeypair(): { publicKey: string; secretKey: number[] } {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: Array.from(keypair.secretKey)
    };
  }

  /**
   * Восстановление keypair из секретного ключа
   */
  keypairFromSecretKey(secretKey: number[] | Uint8Array): Keypair {
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  }

  /**
   * Отправка SOL с одного аккаунта на другой
   */
  async transferSol(
    fromKeypair: Keypair,
    toPublicKey: PublicKey | string,
    lamports: number
  ): Promise<string> {
    const toPubkey = typeof toPublicKey === 'string' ? new PublicKey(toPublicKey) : toPublicKey;
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [fromKeypair]
    );

    return signature;
  }

  /**
   * Получение последнего blockhash
   */
  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    return await this.connection.getLatestBlockhash();
  }

  /**
   * Отправка и подтверждение транзакции
   */
  async sendAndConfirmTransaction(
    transaction: Transaction,
    signers: Keypair[],
    options?: ConfirmOptions
  ): Promise<string> {
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      signers,
      options
    );

    return signature;
  }

  /**
   * Получение транзакции по подписи
   */
  async getTransaction(signature: string): Promise<SolanaTransactionResponse | null> {
    const transaction = await this.connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });

    return transaction as SolanaTransactionResponse | null;
  }

  /**
   * Ожидание подтверждения транзакции
   */
  async confirmTransaction(
    signature: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<boolean> {
    try {
      const latestBlockhash = await this.getLatestBlockhash();
      
      const strategy: BlockheightBasedTransactionConfirmationStrategy = {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      };

      const result = await this.connection.confirmTransaction(strategy, commitment);
      return !result.value.err;
    } catch (error) {
      logger.error('Failed to confirm transaction', { signature, error });
      return false;
    }
  }

  // ========== SOLANA СПЕЦИФИЧНЫЕ МЕТОДЫ ==========

  /**
   * Получение информации об эпохе
   */
  async getEpochInfo(): Promise<SolanaEpochInfo> {
    return this.rpcCall<SolanaEpochInfo>('getEpochInfo');
  }

  /**
   * Получение информации о версии
   */
  async getVersion(): Promise<SolanaVersionInfo> {
    return this.rpcCall<SolanaVersionInfo>('getVersion');
  }

  /**
   * Получение информации об инфляции
   */
  async getInflationGovernor(): Promise<SolanaInflationGovernor> {
    return this.rpcCall<SolanaInflationGovernor>('getInflationGovernor');
  }

  /**
   * Получение курса инфляции
   */
  async getInflationRate(): Promise<SolanaInflationRate> {
    return this.rpcCall<SolanaInflationRate>('getInflationRate');
  }

  /**
   * Получение общего предложения
   */
  async getSupply(): Promise<SolanaSupply> {
    const result = await this.rpcCall<{ value: SolanaSupply }>('getSupply');
    return result.value;
  }

  /**
   * Получение узлов кластера
   */
  async getClusterNodes(): Promise<SolanaClusterNode[]> {
    return this.rpcCall<SolanaClusterNode[]>('getClusterNodes');
  }

  /**
   * Получение аккаунтов для голосования
   */
  async getVoteAccounts(): Promise<SolanaVoteAccounts> {
    return this.rpcCall<SolanaVoteAccounts>('getVoteAccounts');
  }

  /**
   * Получение производительности
   */
  async getRecentPerformanceSamples(limit: number = 720): Promise<SolanaPerformanceSample[]> {
    return this.rpcCall<SolanaPerformanceSample[]>('getRecentPerformanceSamples', [limit]);
  }

  /**
   * Получение производства блоков
   */
  async getBlockProduction(): Promise<SolanaBlockProduction> {
    const result = await this.rpcCall<{ value: SolanaBlockProduction }>('getBlockProduction');
    return result.value;
  }

  /**
   * Получение минимального баланса для освобождения от арендной платы
   */
  async getMinimumBalanceForRentExemption(dataLength: number): Promise<number> {
    return await this.connection.getMinimumBalanceForRentExemption(dataLength);
  }

  /**
   * Проверка соединения с нодой
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.getSlot();
      this._isConnected = true;
      return true;
    } catch (error) {
      this._isConnected = false;
      return false;
    }
  }

  /**
   * Получение статуса соединения
   */
  getConnectionStatus(): boolean {
    return this._isConnected;
  }

  /**
   * Получение времени последней проверки здоровья
   */
  getLastHealthCheck(): Date | null {
    return this.lastHealthCheck;
  }

  /**
   * Закрытие соединений
   */
  async disconnect(): Promise<void> {
    this.stopHealthCheck();
    this.isConnected = false;
  }

  /**
   * Получение статистики производительности
   */
  async getPerformanceStats(): Promise<{
    isConnected: boolean;
    lastHealthCheck: Date | null;
    currentSlot: number;
    blockHeight: number;
    epochInfo: SolanaEpochInfo;
    clusterNodes: number;
    recentPerformance: SolanaPerformanceSample[];
  }> {
    try {
      const [slot, blockHeight, epochInfo, clusterNodes, recentPerformance] = await Promise.all([
        this.getSlot(),
        this.getBlockHeight(),
        this.getEpochInfo(),
        this.getClusterNodes(),
        this.getRecentPerformanceSamples(10) // Последние 10 образцов
      ]);

      return {
        isConnected: this._isConnected,
        lastHealthCheck: this.lastHealthCheck,
        currentSlot: slot,
        blockHeight,
        epochInfo,
        clusterNodes: clusterNodes.length,
        recentPerformance
      };
    } catch (error) {
      logger.error('Failed to get Solana RPC performance stats', { error });
      throw error;
    }
  }

  /**
   * Получение статуса здоровья ноды
   */
  async getHealth(): Promise<'ok' | string> {
    try {
      return await this.rpcCall<'ok'>('getHealth');
    } catch (error: any) {
      return error.message || 'unhealthy';
    }
  }

  /**
   * Конвертация SOL в лампорты
   */
  solToLamports(sol: number): number {
    return Math.floor(sol * LAMPORTS_PER_SOL);
  }

  /**
   * Конвертация лампортов в SOL
   */
  lamportsToSol(lamports: number): number {
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Валидация публичного ключа
   */
  isValidPublicKey(publicKey: string): boolean {
    try {
      new PublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }
}