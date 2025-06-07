import { Web3 } from 'web3';
import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

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
    return await this.web3.eth.getBlockNumber();
  }

  /**
   * Получение баланса адреса
   */
  async getBalance(address: string, blockNumber: 'latest' | 'pending' | 'earliest' | number = 'latest'): Promise<string> {
    return await this.web3.eth.getBalance(address, blockNumber);
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
    return await this.web3.eth.getTransactionCount(address, blockNumber);
  }

  /**
   * Получение цены газа
   */
  async getGasPrice(): Promise<string> {
    return await this.web3.eth.getGasPrice();
  }

  /**
   * Оценка газа для транзакции
   */
  async estimateGas(transaction: any): Promise<number> {
    return await this.web3.eth.estimateGas(transaction);
  }

  /**
   * Получение блока по номеру или хешу
   */
  async getBlock(blockHashOrNumber: string | number, includeTransactions: boolean = false): Promise<EthereumBlock> {
    return await this.web3.eth.getBlock(blockHashOrNumber, includeTransactions) as EthereumBlock;
  }

  /**
   * Получение транзакции по хешу
   */
  async getTransaction(transactionHash: string): Promise<EthereumTransaction | null> {
    return await this.web3.eth.getTransaction(transactionHash) as EthereumTransaction | null;
  }

  /**
   * Получение квитанции транзакции
   */
  async getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt | null> {
    return await this.web3.eth.getTransactionReceipt(transactionHash) as TransactionReceipt | null;
  }

  /**
   * Отправка подписанной транзакции
   */
  async sendSignedTransaction(signedTransaction: string): Promise<TransactionReceipt> {
    const receipt = await this.web3.eth.sendSignedTransaction(signedTransaction);
    return receipt as TransactionReceipt;
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

    const receipt = await this.web3.eth.sendTransaction(transaction);
    return receipt as TransactionReceipt;
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
    
    this.isConnected = false;
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
    return await this.web3.eth.net.getId();
  }

  /**
   * Получение ID сети
   */
  async getChainId(): Promise<number> {
    return await this.web3.eth.getChainId();
  }
}