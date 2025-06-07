import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import logger from '../../utils/logger';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Сеть Zcash с параметрами
 */
const zcashNetwork = {
  messagePrefix: '\x18Zcash Signed Message:\n',
  bech32: 'zs', // Для будущих Sapling адресов
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x1c, // t1 адреса (transparent) - исправлено на 8-битное значение
  scriptHash: 0x1c, // t3 адреса (multisig) - исправлено на 8-битное значение
  wif: 0x80,
};

/**
 * Интерфейсы для Zcash RPC API
 */
interface ZcashRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params: any[];
}

interface ZcashRpcResponse<T = any> {
  result: T;
  error: any;
  id: string | number;
}

interface ZcashBlockchainInfo {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  chainwork: string;
  size_on_disk: number;
  pruned: boolean;
  // Zcash-специфичные поля
  commitments: number;
  valuePools: ZcashValuePool[];
  upgrades: { [name: string]: ZcashUpgradeInfo };
}

interface ZcashValuePool {
  id: string;
  monitored: boolean;
  chainValue: number;
  chainValueZat: number;
  valueDelta: number;
  valueDeltaZat: number;
}

interface ZcashUpgradeInfo {
  name: string;
  activationheight: number;
  status: string;
  info: string;
}

interface ZcashNetworkInfo {
  version: number;
  subversion: string;
  protocolversion: number;
  timeoffset: number;
  connections: number;
  networkactive: boolean;
  networks: ZcashNetworkInterface[];
  relayfee: number;
  localaddresses: any[];
  warnings: string;
}

interface ZcashNetworkInterface {
  name: string;
  limited: boolean;
  reachable: boolean;
  proxy: string;
  proxy_randomize_credentials: boolean;
}

interface ZcashTransaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  locktime: number;
  vin: ZcashTransactionInput[];
  vout: ZcashTransactionOutput[];
  vjoinsplit?: ZcashJoinSplit[]; // Sprout shielded transactions
  vShieldedSpend?: ZcashShieldedSpend[]; // Sapling shielded spends
  vShieldedOutput?: ZcashShieldedOutput[]; // Sapling shielded outputs
  valueBalance?: number; // Sapling value balance
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

interface ZcashTransactionInput {
  txid: string;
  vout: number;
  scriptSig: {
    asm: string;
    hex: string;
  };
  sequence: number;
}

interface ZcashTransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    reqSigs?: number;
    type: string;
    addresses?: string[];
  };
}

interface ZcashJoinSplit {
  vpub_old: number;
  vpub_new: number;
  anchor: string;
  nullifiers: string[];
  commitments: string[];
  onetimePubKey: string;
  randomSeed: string;
  macs: string[];
  proof: string;
  ciphertexts: string[];
}

interface ZcashShieldedSpend {
  cv: string;
  anchor: string;
  nullifier: string;
  rk: string;
  proof: string;
  spendAuthSig: string;
}

interface ZcashShieldedOutput {
  cv: string;
  cmu: string;
  ephemeralKey: string;
  encCiphertext: string;
  outCiphertext: string;
  proof: string;
}

interface ZcashWalletInfo {
  walletname: string;
  walletversion: number;
  balance: number;
  unconfirmed_balance: number;
  immature_balance: number;
  txcount: number;
  keypoololdest: number;
  keypoolsize: number;
  unlocked_until?: number;
  paytxfee: number;
  hdseedid?: string;
  private_keys_enabled: boolean;
  avoid_reuse: boolean;
  scanning: boolean | { duration: number; progress: number; };
  // Zcash-специфичные поля
  shielded_balance?: number;
  shielded_unconfirmed_balance?: number;
  total_balance?: number;
}

interface ZcashShieldedAddress {
  address: string;
  type: 'sprout' | 'sapling';
  diversifier?: string;
  diversifiedtransmissionkey?: string;
}

interface ZcashOperationStatus {
  id: string;
  status: 'queued' | 'executing' | 'success' | 'failed' | 'cancelled';
  creation_time: number;
  result?: any;
  error?: any;
  method: string;
  params: any;
}

interface ZcashShieldingOperation {
  transparent_value: number;
  private_value: number;
  fee: number;
}

/**
 * Конфигурация для Zcash клиента
 */
export interface ZcashConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  wallet?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  ssl?: boolean;
  sslCert?: string;
  sslKey?: string;
  sslCa?: string;
  // Zcash-специфичные настройки
  enableShielded?: boolean;
  defaultShieldedAddress?: 'sprout' | 'sapling';
  autoShieldTransparent?: boolean;
  shieldingThreshold?: number;
}

/**
 * Продакшн-готовый клиент для Zcash
 * Полная интеграция с Zcash daemon через RPC API
 * Поддерживает transparent и shielded транзакции (Sprout и Sapling)
 */
export class ZcashClient {
  private config: ZcashConfig;
  private httpClient: AxiosInstance;
  private requestId: number = 0;
  private isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: ZcashConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ssl: false,
      enableShielded: true,
      defaultShieldedAddress: 'sapling',
      autoShieldTransparent: false,
      shieldingThreshold: 0.1, // Авто-шилдинг при 0.1 ZEC
      ...config
    };

    this.httpClient = axios.create({
      baseURL: `${this.config.ssl ? 'https' : 'http'}://${this.config.host}:${this.config.port}`,
      auth: {
        username: this.config.username,
        password: this.config.password
      },
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoMixer-Zcash/1.0'
      }
    });

    // Настройка SSL если указано
    if (this.config.ssl) {
      this.setupSSL();
    }

    // Запуск периодической проверки здоровья
    this.startHealthCheck();
  }

  /**
   * Настройка SSL соединения
   */
  private setupSSL(): void {
    if (this.config.sslCert || this.config.sslKey || this.config.sslCa) {
      const fs = require('fs');
      const https = require('https');
      
      const httpsAgent = new https.Agent({
        cert: this.config.sslCert ? fs.readFileSync(this.config.sslCert) : undefined,
        key: this.config.sslKey ? fs.readFileSync(this.config.sslKey) : undefined,
        ca: this.config.sslCa ? fs.readFileSync(this.config.sslCa) : undefined,
        rejectUnauthorized: true
      });

      this.httpClient.defaults.httpsAgent = httpsAgent;
    }
  }

  /**
   * Выполнение RPC запроса к Zcash
   */
  private async rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
    const requestId = ++this.requestId;
    
    const request: ZcashRpcRequest = {
      jsonrpc: '1.0',
      id: requestId,
      method,
      params
    };

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const url = this.config.wallet ? `/wallet/${this.config.wallet}` : '/';
        const response: AxiosResponse<ZcashRpcResponse<T>> = await this.httpClient.post(url, request);
        
        if (response.data.error) {
          throw new Error(`Zcash RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
        }

        this.isConnected = true;
        return response.data.result;
        
      } catch (error: any) {
        lastError = error;
        this.isConnected = false;
        
        logger.warn(`Zcash RPC attempt ${attempt} failed`, {
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

    logger.error('Zcash RPC failed after all retries', {
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
        await this.getBlockchainInfo();
        this.lastHealthCheck = new Date();
      } catch (error) {
        logger.warn('Zcash health check failed', { error });
      }
    }, 60000); // Каждую минуту
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
   * Получение информации о блокчейне Zcash
   */
  async getBlockchainInfo(): Promise<ZcashBlockchainInfo> {
    return this.rpcCall<ZcashBlockchainInfo>('getblockchaininfo');
  }

  /**
   * Получение сетевой информации
   */
  async getNetworkInfo(): Promise<ZcashNetworkInfo> {
    return this.rpcCall<ZcashNetworkInfo>('getnetworkinfo');
  }

  /**
   * Получение информации о кошельке
   */
  async getWalletInfo(): Promise<ZcashWalletInfo> {
    return this.rpcCall<ZcashWalletInfo>('getwalletinfo');
  }

  /**
   * Создание нового transparent адреса
   */
  async getNewAddress(label?: string): Promise<string> {
    const params: any[] = label ? [label] : [];
    return this.rpcCall<string>('getnewaddress', params);
  }

  /**
   * Создание нового shielded адреса
   */
  async getNewShieldedAddress(type: 'sprout' | 'sapling' = 'sapling'): Promise<string> {
    if (!this.config.enableShielded) {
      throw new Error('Shielded адреса отключены в конфигурации');
    }
    
    if (type === 'sprout') {
      return this.rpcCall<string>('z_getnewaddress', ['sprout']);
    } else {
      return this.rpcCall<string>('z_getnewaddress', ['sapling']);
    }
  }

  /**
   * Получение баланса кошелька (transparent)
   */
  async getBalance(minConfirmations: number = 1): Promise<number> {
    return this.rpcCall<number>('getbalance', ['*', minConfirmations]);
  }

  /**
   * Получение shielded баланса
   */
  async getShieldedBalance(address?: string, minConfirmations: number = 1): Promise<number> {
    if (!this.config.enableShielded) {
      return 0;
    }
    
    const params: any[] = address ? [address, minConfirmations] : [minConfirmations];
    return this.rpcCall<number>('z_getbalance', params);
  }

  /**
   * Получение общего баланса (transparent + shielded)
   */
  async getTotalBalance(minConfirmations: number = 1): Promise<{ transparent: number; shielded: number; total: number }> {
    const [transparent, shielded] = await Promise.all([
      this.getBalance(minConfirmations),
      this.getShieldedBalance(undefined, minConfirmations)
    ]);
    
    return {
      transparent,
      shielded,
      total: transparent + shielded
    };
  }

  /**
   * Получение списка shielded адресов
   */
  async listShieldedAddresses(): Promise<ZcashShieldedAddress[]> {
    if (!this.config.enableShielded) {
      return [];
    }
    
    return this.rpcCall<ZcashShieldedAddress[]>('z_listaddresses');
  }

  /**
   * Получение транзакции по хешу
   */
  async getTransaction(txid: string, includeWatchonly: boolean = false): Promise<ZcashTransaction> {
    return this.rpcCall<ZcashTransaction>('gettransaction', [txid, includeWatchonly]);
  }

  /**
   * Получение необработанной транзакции
   */
  async getRawTransaction(txid: string, verbose: boolean = true): Promise<ZcashTransaction | string> {
    return this.rpcCall<ZcashTransaction | string>('getrawtransaction', [txid, verbose]);
  }

  /**
   * Отправка transparent транзакции
   */
  async sendToAddress(address: string, amount: number, comment?: string, commentTo?: string): Promise<string> {
    const params: any[] = [address, amount];
    if (comment) params.push(comment);
    if (commentTo) params.push(commentTo);
    
    return this.rpcCall<string>('sendtoaddress', params);
  }

  // ========== ZCASH SHIELDED МЕТОДЫ ==========

  /**
   * Отправка shielded транзакции
   */
  async sendShielded(
    fromAddress: string,
    toAddress: string,
    amount: number,
    memo?: string,
    fee?: number
  ): Promise<string> {
    if (!this.config.enableShielded) {
      throw new Error('Shielded транзакции отключены в конфигурации');
    }
    
    const operation: any = {
      fromaddress: fromAddress,
      amounts: [{
        address: toAddress,
        amount: amount,
        memo: memo ? Buffer.from(memo).toString('hex') : undefined
      }]
    };
    
    if (fee) {
      operation.fee = fee;
    }
    
    const operationId = await this.rpcCall<string>('z_sendmany', [operation.fromaddress, operation.amounts, 1, operation.fee]);
    
    // Ожидаем завершения операции
    return this.waitForOperation(operationId);
  }

  /**
   * Экранирование transparent средств (t->z)
   */
  async shieldTransparentFunds(
    fromAddress: string,
    toShieldedAddress: string,
    amount?: number,
    fee?: number
  ): Promise<string> {
    if (!this.config.enableShielded) {
      throw new Error('Shielded операции отключены в конфигурации');
    }
    
    // Если сумма не указана, шилдим весь баланс
    if (!amount) {
      const balance = await this.getBalance();
      amount = balance - (fee || 0.0001); // Оставляем место для комиссии
    }
    
    const operation: any = {
      fromaddress: fromAddress,
      amounts: [{
        address: toShieldedAddress,
        amount: amount
      }]
    };
    
    if (fee) {
      operation.fee = fee;
    }
    
    const operationId = await this.rpcCall<string>('z_sendmany', [operation.fromaddress, operation.amounts, 1, operation.fee]);
    
    return this.waitForOperation(operationId);
  }

  /**
   * Разэкранирование shielded средств (z->t)
   */
  async unshieldFunds(
    fromShieldedAddress: string,
    toTransparentAddress: string,
    amount: number,
    fee?: number
  ): Promise<string> {
    if (!this.config.enableShielded) {
      throw new Error('Shielded операции отключены в конфигурации');
    }
    
    const operation: any = {
      fromaddress: fromShieldedAddress,
      amounts: [{
        address: toTransparentAddress,
        amount: amount
      }]
    };
    
    if (fee) {
      operation.fee = fee;
    }
    
    const operationId = await this.rpcCall<string>('z_sendmany', [operation.fromaddress, operation.amounts, 1, operation.fee]);
    
    return this.waitForOperation(operationId);
  }

  /**
   * Получение статуса операции
   */
  async getOperationStatus(operationId: string): Promise<ZcashOperationStatus> {
    const operations = await this.rpcCall<ZcashOperationStatus[]>('z_getoperationstatus', [[operationId]]);
    
    if (operations.length === 0) {
      throw new Error(`Операция ${operationId} не найдена`);
    }
    
    return operations[0];
  }

  /**
   * Ожидание завершения операции
   */
  async waitForOperation(operationId: string, maxWaitTime: number = 300000): Promise<string> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getOperationStatus(operationId);
      
      if (status.status === 'success') {
        return status.result.txid;
      } else if (status.status === 'failed') {
        throw new Error(`Операция провалилась: ${status.error?.message || 'Unknown error'}`);
      } else if (status.status === 'cancelled') {
        throw new Error('Операция была отменена');
      }
      
      // Ждем 2 секунды перед следующей проверкой
      await this.delay(2000);
    }
    
    throw new Error(`Операция не завершилась в течение ${maxWaitTime / 1000} секунд`);
  }

  /**
   * Получение viewing key для shielded адреса
   */
  async getViewingKey(address: string): Promise<string> {
    return this.rpcCall<string>('z_exportviewingkey', [address]);
  }

  /**
   * Импорт viewing key
   */
  async importViewingKey(viewingKey: string, rescan: 'yes' | 'no' | 'whenkeyisnew' = 'whenkeyisnew', startHeight?: number): Promise<void> {
    const params: any[] = [viewingKey, rescan];
    if (startHeight !== undefined) {
      params.push(startHeight);
    }
    
    await this.rpcCall('z_importviewingkey', params);
  }

  /**
   * Валидация Zcash адреса
   */
  async validateAddress(address: string): Promise<{ isvalid: boolean; address?: string; type?: 'transparent' | 'sprout' | 'sapling'; scriptPubKey?: string; ismine?: boolean; iswatchonly?: boolean }> {
    // Проверяем и transparent и shielded адреса
    try {
      if (address.startsWith('t1') || address.startsWith('t3')) {
        const result = await this.rpcCall('validateaddress', [address]);
        return { ...result, type: 'transparent' };
      } else {
        const result = await this.rpcCall('z_validateaddress', [address]);
        return { ...result, type: result.type || 'shielded' };
      }
    } catch (error) {
      return { isvalid: false };
    }
  }

  /**
   * Создание transparent Zcash адреса программно
   */
  createTransparentAddress(): { address: string; privateKey: string; publicKey: string } {
    const keyPair = ECPair.makeRandom({ network: zcashNetwork });
    const { address } = bitcoin.payments.p2pkh({ 
      pubkey: keyPair.publicKey,
      network: zcashNetwork 
    });
    
    return {
      address: address!,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex')
    };
  }

  /**
   * Получение статуса соединения
   */
  isNodeConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Получение времени последней проверки здоровья
   */
  getLastHealthCheck(): Date | null {
    return this.lastHealthCheck;
  }

  /**
   * Проверка доступности ноды
   */
  async ping(): Promise<boolean> {
    try {
      await this.rpcCall('ping');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Закрытие соединения
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
    currentBlockHeight: number;
    connectionCount: number;
    transparentBalance: number;
    shieldedBalance: number;
    totalBalance: number;
    shieldedAddressCount: number;
    valuePools: ZcashValuePool[];
  }> {
    try {
      const [blockchainInfo, networkInfo, balances, shieldedAddresses] = await Promise.all([
        this.getBlockchainInfo(),
        this.getNetworkInfo(),
        this.getTotalBalance(),
        this.listShieldedAddresses().catch(() => [])
      ]);

      return {
        isConnected: this.isConnected,
        lastHealthCheck: this.lastHealthCheck,
        currentBlockHeight: blockchainInfo.blocks,
        connectionCount: networkInfo.connections,
        transparentBalance: balances.transparent,
        shieldedBalance: balances.shielded,
        totalBalance: balances.total,
        shieldedAddressCount: shieldedAddresses.length,
        valuePools: blockchainInfo.valuePools
      };
    } catch (error) {
      logger.error('Failed to get Zcash performance stats', { error });
      throw error;
    }
  }

  /**
   * Проверка здоровья Zcash ноды
   */
  async healthCheck(): Promise<{
    connected: boolean;
    blockHeight: number;
    connections: number;
    version: string;
    network: string;
    warnings: string[];
    shieldedEnabled: boolean;
    transparentBalance: number;
    shieldedBalance: number;
    upgradeStatus: { [name: string]: string };
  }> {
    try {
      const [blockchainInfo, networkInfo, balances] = await Promise.all([
        this.getBlockchainInfo(),
        this.getNetworkInfo(),
        this.getTotalBalance().catch(() => ({ transparent: 0, shielded: 0, total: 0 }))
      ]);

      const upgradeStatus: { [name: string]: string } = {};
      for (const [name, upgrade] of Object.entries(blockchainInfo.upgrades)) {
        upgradeStatus[name] = upgrade.status;
      }

      return {
        connected: true,
        blockHeight: blockchainInfo.blocks,
        connections: networkInfo.connections,
        version: networkInfo.subversion,
        network: blockchainInfo.chain,
        warnings: networkInfo.warnings ? [networkInfo.warnings] : [],
        shieldedEnabled: this.config.enableShielded || false,
        transparentBalance: balances.transparent,
        shieldedBalance: balances.shielded,
        upgradeStatus
      };
    } catch (error) {
      logger.error('Zcash health check failed:', error as Error);
      return {
        connected: false,
        blockHeight: 0,
        connections: 0,
        version: 'unknown',
        network: 'unknown',
        warnings: [(error as Error).message],
        shieldedEnabled: false,
        transparentBalance: 0,
        shieldedBalance: 0,
        upgradeStatus: {}
      };
    }
  }

  /**
   * Получение лучшего хеша блока
   */
  async getBestBlockHash(): Promise<string> {
    return this.rpcCall<string>('getbestblockhash');
  }

  /**
   * Получение блока по хешу
   */
  async getBlock(blockHash: string, verbosity: 0 | 1 | 2 = 1): Promise<any> {
    return this.rpcCall('getblock', [blockHash, verbosity]);
  }

  /**
   * Получение хеша блока по высоте
   */
  async getBlockHash(height: number): Promise<string> {
    return this.rpcCall<string>('getblockhash', [height]);
  }

  /**
   * Получение количества блоков
   */
  async getBlockCount(): Promise<number> {
    return this.rpcCall<number>('getblockcount');
  }

  /**
   * Автоматическое экранирование transparent средств при превышении порога
   */
  async autoShieldIfNeeded(): Promise<string | null> {
    if (!this.config.autoShieldTransparent || !this.config.enableShielded) {
      return null;
    }
    
    const transparentBalance = await this.getBalance();
    
    if (transparentBalance >= this.config.shieldingThreshold!) {
      try {
        // Создаем новый shielded адрес для автошилдинга
        const shieldedAddress = await this.getNewShieldedAddress(this.config.defaultShieldedAddress);
        
        logger.info('Автоматическое экранирование transparent средств', {
          amount: transparentBalance,
          threshold: this.config.shieldingThreshold,
          toAddress: shieldedAddress.substring(0, 20) + '...'
        });
        
        return await this.shieldTransparentFunds('', shieldedAddress, transparentBalance - 0.0001);
      } catch (error) {
        logger.error('Ошибка автоматического экранирования', { error });
        return null;
      }
    }
    
    return null;
  }
}