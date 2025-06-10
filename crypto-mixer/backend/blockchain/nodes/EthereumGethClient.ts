import { Web3 } from 'web3';
import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

/**
 * Вспомогательные функции для конвертации типов Web3.js
 */
class TypeConverter {
  /**
   * Конвертация bigint в number с проверкой безопасности
   */
  static bigintToNumber(value: bigint | number | string): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseInt(value, 10);
    
    // Проверяем, что bigint не превышает максимальный безопасный integer
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new Error(`BigInt value ${value} exceeds MAX_SAFE_INTEGER`);
    }
    return Number(value);
  }

  /**
   * Конвертация bigint в string
   */
  static bigintToString(value: bigint | number | string): string {
    if (typeof value === 'string') return value;
    return value.toString();
  }

  /**
   * Конвертация Web3 Numbers в boolean для статуса
   */
  static numberToBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value !== 0n;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value !== '0' && value !== '';
    return Boolean(value);
  }

  /**
   * Конвертация Web3 Bytes в string
   */
  static bytesToString(value: any): string {
    if (typeof value === 'string') return value;
    if (value && typeof value.toString === 'function') return value.toString();
    return String(value || '');
  }

  /**
   * Конвертация undefined в null для совместимости
   */
  static undefinedToNull<T>(value: T | undefined): T | null {
    return value === undefined ? null : value;
  }

  /**
   * Безопасное преобразование любого значения в string
   */
  static safeToString(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'bigint') return value.toString();
    if (value && typeof value.toString === 'function') return value.toString();
    return String(value);
  }
}

/**
 * Интерфейсы для Ethereum/Geth
 */
interface EthereumTransaction {
  hash: string;
  nonce: number;
  blockHash: string | null;
  blockNumber: number | null;
  transactionIndex: number | null;
  from: string;
  to: string | null;
  value: string;
  gasPrice: string;
  gas: number;
  input: string;
  r: string;
  s: string;
  v: string;
  // Дополнительные поля для совместимости с Web3.js
  type?: string;
  accessList?: any[];
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  yParity?: string;
}

interface EthereumBlock {
  number: number;
  hash: string;
  parentHash: string;
  nonce: string;
  sha3Uncles: string;
  logsBloom: string;
  transactionsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  miner: string;
  difficulty: string;
  totalDifficulty: string;
  extraData: string;
  size: number;
  gasLimit: number;
  gasUsed: number;
  timestamp: number;
  transactions: string[] | EthereumTransaction[];
  uncles: string[];
  // Дополнительные поля для совместимости
  baseFeePerGas?: string;
  withdrawals?: any[];
  withdrawalsRoot?: string;
}

interface TransactionReceipt {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  cumulativeGasUsed: number;
  gasUsed: number;
  contractAddress: string | null;
  logs: any[];
  logsBloom: string;
  status: boolean;
  effectiveGasPrice: string;
  // Дополнительные поля
  type?: string;
  root?: string;
}

interface EthereumSyncStatus {
  startingBlock: number;
  currentBlock: number;
  highestBlock: number;
  pulledStates?: number;
  knownStates?: number;
}

interface PeerInfo {
  id: string;
  name: string;
  caps: string[];
  network: {
    localAddress: string;
    remoteAddress: string;
    inbound: boolean;
    trusted: boolean;
    static: boolean;
  };
  protocols: any;
}

interface NodeInfo {
  enode: string;
  enr: string;
  id: string;
  ip: string;
  listenAddr: string;
  name: string;
  ports: {
    discovery: number;
    listener: number;
  };
  protocols: any;
}

/**
 * Конфигурация для Ethereum Geth клиента
 */
export interface EthereumGethConfig {
  httpUrl?: string;
  wsUrl?: string;
  ipcPath?: string;
  accounts?: {
    privateKeys: string[];
  };
  network?: 'mainnet' | 'goerli' | 'sepolia' | 'holesky' | 'localhost';
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  gasLimit?: number;
  gasPrice?: string;
  confirmations?: number;
}

/**
 * Продакшн-готовый клиент для Ethereum Geth
 * Полная интеграция с Ethereum через Web3 и прямые RPC вызовы
 */
export class EthereumGethClient {
  private config: EthereumGethConfig;
  private web3: Web3;
  private httpClient: AxiosInstance | null = null;
  private _isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private currentProvider: string | null = null;

  constructor(config: EthereumGethConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      gasLimit: 21000,
      gasPrice: '20000000000', // 20 Gwei
      confirmations: 3,
      network: 'mainnet',
      ...config
    };

    // Определяем провайдера
    this.currentProvider = this.determineProvider();
    
    // Инициализация Web3
    this.web3 = new Web3(this.currentProvider);

    // Настройка HTTP клиента для прямых RPC вызовов
    if (this.config.httpUrl) {
      this.setupHttpClient();
    }

    // Добавление приватных ключей в кошелек
    if (this.config.accounts?.privateKeys) {
      this.setupAccounts();
    }

    // Запуск периодической проверки здоровья
    this.startHealthCheck();
  }

  /**
   * Определение провайдера для подключения
   */
  private determineProvider(): string {
    if (this.config.httpUrl) {
      return this.config.httpUrl;
    }
    if (this.config.wsUrl) {
      return this.config.wsUrl;
    }
    if (this.config.ipcPath) {
      return this.config.ipcPath;
    }
    
    // Дефолтные провайдеры для разных сетей
    switch (this.config.network) {
      case 'mainnet':
        return 'http://localhost:8545';
      case 'goerli':
        return 'http://localhost:8545';
      case 'sepolia':
        return 'http://localhost:8545';
      case 'localhost':
        return 'http://localhost:8545';
      default:
        return 'http://localhost:8545';
    }
  }

  /**
   * Настройка HTTP клиента для прямых RPC вызовов
   */
  private setupHttpClient(): void {
    this.httpClient = axios.create({
      baseURL: this.config.httpUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoMixer-Geth/1.0'
      }
    });
  }

  /**
   * Добавление приватных ключей в кошелек Web3
   */
  private setupAccounts(): void {
    if (this.config.accounts?.privateKeys) {
      for (const privateKey of this.config.accounts.privateKeys) {
        this.web3.eth.accounts.wallet.add(privateKey);
      }
      logger.info(`Added ${this.config.accounts.privateKeys.length} accounts to Ethereum wallet`);
    }
  }

  /**
   * Выполнение прямого RPC вызова к Geth
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
          throw new Error(`Ethereum RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
        }

        this._isConnected = true;
        return response.data.result;
        
      } catch (error: any) {
        lastError = error;
        this._isConnected = false;
        
        logger.warn(`Ethereum RPC attempt ${attempt} failed`, {
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

    logger.error('Ethereum RPC failed after all retries', {
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
        await this.getBlockNumber();
        this.lastHealthCheck = new Date();
      } catch (error) {
        logger.warn('Ethereum Geth health check failed', { error });
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
   * Получение номера последнего блока
   */
  async getBlockNumber(): Promise<number> {
    const blockNumber = await this.web3.eth.getBlockNumber();
    return TypeConverter.bigintToNumber(blockNumber);
  }

  /**
   * Получение баланса адреса
   */
  async getBalance(address: string, blockNumber: 'latest' | 'pending' | 'earliest' | number = 'latest'): Promise<string> {
    const balance = await this.web3.eth.getBalance(address, blockNumber);
    return TypeConverter.bigintToString(balance);
  }

  /**
   * Получение баланса в ETH
   */
  async getBalanceInEth(address: string, blockNumber: 'latest' | 'pending' | 'earliest' | number = 'latest'): Promise<number> {
    const balanceWei = await this.getBalance(address, blockNumber);
    return parseFloat(this.web3.utils.fromWei(balanceWei, 'ether'));
  }

  /**
   * Получение nonce для адреса
   */
  async getTransactionCount(address: string, blockNumber: 'latest' | 'pending' | 'earliest' | number = 'latest'): Promise<number> {
    const count = await this.web3.eth.getTransactionCount(address, blockNumber);
    return TypeConverter.bigintToNumber(count);
  }

  /**
   * Получение цены газа
   */
  async getGasPrice(): Promise<string> {
    const gasPrice = await this.web3.eth.getGasPrice();
    return TypeConverter.bigintToString(gasPrice);
  }

  /**
   * Оценка газа для транзакции
   */
  async estimateGas(transaction: any): Promise<number> {
    const gasEstimate = await this.web3.eth.estimateGas(transaction);
    return TypeConverter.bigintToNumber(gasEstimate);
  }

  /**
   * Получение блока по номеру или хешу
   */
  async getBlock(blockHashOrNumber: string | number, includeTransactions: boolean = false): Promise<EthereumBlock> {
    const rawBlock = await this.web3.eth.getBlock(blockHashOrNumber, includeTransactions);
    
    // Преобразуем bigint поля в нужные типы
    const block: EthereumBlock = {
      number: TypeConverter.bigintToNumber(rawBlock.number || 0),
      hash: rawBlock.hash || '',
      parentHash: rawBlock.parentHash || '',
      nonce: TypeConverter.safeToString(rawBlock.nonce || ''),
      sha3Uncles: rawBlock.sha3Uncles || '',
      logsBloom: rawBlock.logsBloom || '',
      transactionsRoot: rawBlock.transactionsRoot || '',
      stateRoot: rawBlock.stateRoot || '',
      receiptsRoot: rawBlock.receiptsRoot || '',
      miner: rawBlock.miner || '',
      difficulty: TypeConverter.safeToString(rawBlock.difficulty || 0),
      totalDifficulty: TypeConverter.safeToString(rawBlock.totalDifficulty || 0),
      extraData: TypeConverter.safeToString(rawBlock.extraData || ''),
      size: TypeConverter.bigintToNumber(rawBlock.size || 0),
      gasLimit: TypeConverter.bigintToNumber(rawBlock.gasLimit || 0),
      gasUsed: TypeConverter.bigintToNumber(rawBlock.gasUsed || 0),
      timestamp: TypeConverter.bigintToNumber(rawBlock.timestamp || 0),
      transactions: Array.isArray(rawBlock.transactions) ? (rawBlock.transactions.map((tx: any): string | EthereumTransaction => {
        if (typeof tx === 'string') return tx;
        return {
          hash: tx.hash,
          nonce: TypeConverter.bigintToNumber(tx.nonce || 0),
          blockHash: tx.blockHash,
          blockNumber: tx.blockNumber ? TypeConverter.bigintToNumber(tx.blockNumber) : null,
          transactionIndex: tx.transactionIndex ? TypeConverter.bigintToNumber(tx.transactionIndex) : null,
          from: tx.from,
          to: TypeConverter.undefinedToNull(tx.to),
          value: TypeConverter.safeToString(tx.value || 0),
          gasPrice: TypeConverter.safeToString(tx.gasPrice || 0),
          gas: TypeConverter.bigintToNumber(tx.gas || 0),
          input: TypeConverter.safeToString(tx.input || ''),
          r: TypeConverter.safeToString(tx.r || ''),
          s: TypeConverter.safeToString(tx.s || ''),
          v: TypeConverter.safeToString(tx.v || ''),
          type: tx.type ? TypeConverter.safeToString(tx.type) : undefined,
          accessList: tx.accessList || undefined,
          maxFeePerGas: tx.maxFeePerGas ? TypeConverter.safeToString(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? TypeConverter.safeToString(tx.maxPriorityFeePerGas) : undefined,
          yParity: tx.yParity || undefined
        } as EthereumTransaction;
      }) as string[] | EthereumTransaction[]) : [],
      uncles: rawBlock.uncles || [],
      baseFeePerGas: rawBlock.baseFeePerGas ? TypeConverter.safeToString(rawBlock.baseFeePerGas) : undefined,
      withdrawals: (rawBlock as any).withdrawals || undefined,
      withdrawalsRoot: (rawBlock as any).withdrawalsRoot || undefined
    };
    
    return block;
  }

  /**
   * Получение транзакции по хешу
   */
  async getTransaction(transactionHash: string): Promise<EthereumTransaction | null> {
    const rawTx = await this.web3.eth.getTransaction(transactionHash);
    
    if (!rawTx) return null;
    
    // Преобразуем транзакцию с правильными типами
    const transaction: EthereumTransaction = {
      hash: rawTx.hash,
      nonce: TypeConverter.bigintToNumber((rawTx as any).nonce || 0),
      blockHash: TypeConverter.undefinedToNull(rawTx.blockHash),
      blockNumber: rawTx.blockNumber ? TypeConverter.bigintToNumber(rawTx.blockNumber) : null,
      transactionIndex: rawTx.transactionIndex ? TypeConverter.bigintToNumber(rawTx.transactionIndex) : null,
      from: rawTx.from,
      to: TypeConverter.undefinedToNull(rawTx.to),
      value: TypeConverter.bigintToString(rawTx.value || 0),
      gasPrice: TypeConverter.bigintToString((rawTx as any).gasPrice || 0),
      gas: TypeConverter.bigintToNumber(rawTx.gas || 0),
      input: TypeConverter.bytesToString(rawTx.input || ''),
      r: TypeConverter.bytesToString(rawTx.r || ''),
      s: TypeConverter.bytesToString(rawTx.s || ''),
      v: TypeConverter.bigintToString((rawTx as any).v || 0),
      type: (rawTx as any).type ? TypeConverter.bigintToString((rawTx as any).type) : undefined,
      accessList: (rawTx as any).accessList || undefined,
      maxFeePerGas: (rawTx as any).maxFeePerGas ? TypeConverter.bigintToString((rawTx as any).maxFeePerGas) : undefined,
      maxPriorityFeePerGas: (rawTx as any).maxPriorityFeePerGas ? TypeConverter.bigintToString((rawTx as any).maxPriorityFeePerGas) : undefined,
      yParity: (rawTx as any).yParity || undefined
    };
    
    return transaction;
  }

  /**
   * Получение квитанции транзакции
   */
  async getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt | null> {
    const rawReceipt = await this.web3.eth.getTransactionReceipt(transactionHash);
    
    if (!rawReceipt) return null;
    
    // Преобразуем квитанцию с правильными типами
    const receipt: TransactionReceipt = {
      transactionHash: TypeConverter.bytesToString(rawReceipt.transactionHash),
      transactionIndex: TypeConverter.bigintToNumber(rawReceipt.transactionIndex || 0),
      blockHash: TypeConverter.bytesToString(rawReceipt.blockHash),
      blockNumber: TypeConverter.bigintToNumber(rawReceipt.blockNumber || 0),
      from: rawReceipt.from,
      to: TypeConverter.undefinedToNull(rawReceipt.to),
      cumulativeGasUsed: TypeConverter.bigintToNumber(rawReceipt.cumulativeGasUsed || 0),
      gasUsed: TypeConverter.bigintToNumber(rawReceipt.gasUsed || 0),
      contractAddress: TypeConverter.undefinedToNull(rawReceipt.contractAddress),
      logs: rawReceipt.logs || [],
      logsBloom: TypeConverter.bytesToString(rawReceipt.logsBloom || ''),
      status: TypeConverter.numberToBoolean(rawReceipt.status),
      effectiveGasPrice: TypeConverter.bigintToString((rawReceipt as any).effectiveGasPrice || 0),
      type: (rawReceipt as any).type ? TypeConverter.bigintToString((rawReceipt as any).type) : undefined,
      root: (rawReceipt as any).root || undefined
    };
    
    return receipt;
  }

  /**
   * Отправка подписанной транзакции
   */
  async sendSignedTransaction(signedTransaction: string): Promise<TransactionReceipt> {
    const rawReceipt = await this.web3.eth.sendSignedTransaction(signedTransaction);
    
    // Преобразуем квитанцию с правильными типами
    const receipt: TransactionReceipt = {
      transactionHash: TypeConverter.bytesToString(rawReceipt.transactionHash),
      transactionIndex: TypeConverter.bigintToNumber(rawReceipt.transactionIndex || 0),
      blockHash: TypeConverter.bytesToString(rawReceipt.blockHash),
      blockNumber: TypeConverter.bigintToNumber(rawReceipt.blockNumber || 0),
      from: rawReceipt.from,
      to: TypeConverter.undefinedToNull(rawReceipt.to),
      cumulativeGasUsed: TypeConverter.bigintToNumber(rawReceipt.cumulativeGasUsed || 0),
      gasUsed: TypeConverter.bigintToNumber(rawReceipt.gasUsed || 0),
      contractAddress: TypeConverter.undefinedToNull(rawReceipt.contractAddress),
      logs: rawReceipt.logs || [],
      logsBloom: TypeConverter.bytesToString(rawReceipt.logsBloom || ''),
      status: TypeConverter.numberToBoolean(rawReceipt.status),
      effectiveGasPrice: TypeConverter.bigintToString((rawReceipt as any).effectiveGasPrice || 0),
      type: (rawReceipt as any).type ? TypeConverter.bigintToString((rawReceipt as any).type) : undefined,
      root: (rawReceipt as any).root || undefined
    };
    
    return receipt;
  }

  /**
   * Создание и отправка транзакции
   */
  async sendTransaction(from: string, to: string, value: string, data?: string, gasLimit?: number, gasPrice?: string): Promise<TransactionReceipt> {
    const transaction = {
      from,
      to,
      value: this.web3.utils.toWei(value, 'ether'),
      gas: gasLimit || this.config.gasLimit,
      gasPrice: gasPrice || this.config.gasPrice,
      data: data || '0x'
    };

    const rawReceipt = await this.web3.eth.sendTransaction(transaction);
    
    // Преобразуем квитанцию с правильными типами
    const receipt: TransactionReceipt = {
      transactionHash: TypeConverter.bytesToString(rawReceipt.transactionHash),
      transactionIndex: TypeConverter.bigintToNumber(rawReceipt.transactionIndex || 0),
      blockHash: TypeConverter.bytesToString(rawReceipt.blockHash),
      blockNumber: TypeConverter.bigintToNumber(rawReceipt.blockNumber || 0),
      from: rawReceipt.from,
      to: TypeConverter.undefinedToNull(rawReceipt.to),
      cumulativeGasUsed: TypeConverter.bigintToNumber(rawReceipt.cumulativeGasUsed || 0),
      gasUsed: TypeConverter.bigintToNumber(rawReceipt.gasUsed || 0),
      contractAddress: TypeConverter.undefinedToNull(rawReceipt.contractAddress),
      logs: rawReceipt.logs || [],
      logsBloom: TypeConverter.bytesToString(rawReceipt.logsBloom || ''),
      status: TypeConverter.numberToBoolean(rawReceipt.status),
      effectiveGasPrice: TypeConverter.bigintToString((rawReceipt as any).effectiveGasPrice || 0),
      type: (rawReceipt as any).type ? TypeConverter.bigintToString((rawReceipt as any).type) : undefined,
      root: (rawReceipt as any).root || undefined
    };
    
    return receipt;
  }

  /**
   * Подпись транзакции
   */
  async signTransaction(transaction: any, privateKey: string): Promise<string> {
    const signedTx = await this.web3.eth.accounts.signTransaction(transaction, privateKey);
    return signedTx.rawTransaction!;
  }

  /**
   * Создание нового аккаунта
   */
  createAccount(): { address: string; privateKey: string } {
    const account = this.web3.eth.accounts.create();
    return {
      address: account.address,
      privateKey: account.privateKey
    };
  }

  /**
   * Получение адреса из приватного ключа
   */
  getAddressFromPrivateKey(privateKey: string): string {
    return this.web3.eth.accounts.privateKeyToAccount(privateKey).address;
  }

  /**
   * Ожидание подтверждения транзакции
   */
  async waitForTransactionConfirmation(txHash: string, confirmations: number = this.config.confirmations!): Promise<TransactionReceipt> {
    let receipt: TransactionReceipt | null = null;
    let currentConfirmations = 0;

    while (currentConfirmations < confirmations) {
      receipt = await this.getTransactionReceipt(txHash);
      
      if (!receipt) {
        await this.delay(1000); // Ждем 1 секунду
        continue;
      }

      const currentBlockNumber = await this.getBlockNumber();
      currentConfirmations = currentBlockNumber - receipt.blockNumber + 1;

      if (currentConfirmations < confirmations) {
        await this.delay(1000); // Ждем 1 секунду между проверками
      }
    }

    return receipt!;
  }

  // ========== GETH СПЕЦИФИЧНЫЕ МЕТОДЫ ==========

  /**
   * Получение статуса синхронизации
   */
  async getSyncStatus(): Promise<EthereumSyncStatus | false> {
    if (!this.httpClient) {
      throw new Error('HTTP client required for direct RPC calls');
    }
    return this.rpcCall<EthereumSyncStatus | false>('eth_syncing');
  }

  /**
   * Получение информации о нодах
   */
  async getNodeInfo(): Promise<NodeInfo> {
    if (!this.httpClient) {
      throw new Error('HTTP client required for direct RPC calls');
    }
    return this.rpcCall<NodeInfo>('admin_nodeInfo');
  }

  /**
   * Получение списка пиров
   */
  async getPeers(): Promise<PeerInfo[]> {
    if (!this.httpClient) {
      throw new Error('HTTP client required for direct RPC calls');
    }
    return this.rpcCall<PeerInfo[]>('admin_peers');
  }

  /**
   * Получение статистики мемпула
   */
  async getMempoolStatus(): Promise<{ pending: number; queued: number }> {
    if (!this.httpClient) {
      throw new Error('HTTP client required for direct RPC calls');
    }
    return this.rpcCall<{ pending: number; queued: number }>('txpool_status');
  }

  /**
   * Получение версии клиента
   */
  async getClientVersion(): Promise<string> {
    if (!this.httpClient) {
      throw new Error('HTTP client required for direct RPC calls');
    }
    return this.rpcCall<string>('web3_clientVersion');
  }

  /**
   * Проверка соединения с нодой
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.getBlockNumber();
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
    
    // Закрытие WebSocket соединения если используется
    if (this.web3.currentProvider && typeof this.web3.currentProvider === 'object' && 'disconnect' in this.web3.currentProvider) {
      await (this.web3.currentProvider as any).disconnect();
    }
    
    this._isConnected = false;
  }

  /**
   * Получение статистики производительности
   */
  async getPerformanceStats(): Promise<{
    isConnected: boolean;
    lastHealthCheck: Date | null;
    currentBlockNumber: number;
    gasPrice: string;
    peerCount: number;
    syncStatus: EthereumSyncStatus | false;
    mempoolStatus: { pending: number; queued: number };
  }> {
    try {
      const [blockNumber, gasPrice, syncStatus] = await Promise.all([
        this.getBlockNumber(),
        this.getGasPrice(),
        this.getSyncStatus()
      ]);

      let peerCount = 0;
      let mempoolStatus = { pending: 0, queued: 0 };

      try {
        const peers = await this.getPeers();
        peerCount = peers.length;
        mempoolStatus = await this.getMempoolStatus();
      } catch (error) {
        logger.warn('Could not get additional Geth stats', { error });
      }

      return {
        isConnected: this._isConnected,
        lastHealthCheck: this.lastHealthCheck,
        currentBlockNumber: blockNumber,
        gasPrice,
        peerCount,
        syncStatus,
        mempoolStatus
      };
    } catch (error) {
      logger.error('Failed to get Ethereum Geth performance stats', { error });
      throw error;
    }
  }

  /**
   * Получение текущей сети
   */
  async getNetworkId(): Promise<number> {
    const networkId = await this.web3.eth.net.getId();
    return TypeConverter.bigintToNumber(networkId);
  }

  /**
   * Получение ID сети
   */
  async getChainId(): Promise<number> {
    const chainId = await this.web3.eth.getChainId();
    return TypeConverter.bigintToNumber(chainId);
  }
}