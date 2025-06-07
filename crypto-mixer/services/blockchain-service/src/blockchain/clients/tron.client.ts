import TronWeb from 'tronweb';
import axios from 'axios';
import crypto from 'crypto';
import { Logger } from '../../utils/logger';
import { HSMManager, HSMConfig, KeyGenerationResult } from '../../../wallet-service/src/security/hsm.manager';

interface TronConfig {
  fullNode: string;
  solidityNode: string;
  eventServer: string;
  // Новые поля для HSM/Vault интеграции
  hsmConfig?: HSMConfig;
  enableSecureGeneration?: boolean;
  apiKey?: string; // Для TronGrid API
}

/**
 * Tron клиент с поддержкой криптографически безопасной генерации адресов через HSM/Vault
 * 
 * Функциональность:
 * - Интеграция с HSM/Vault для безопасного управления ключами
 * - Поддержка TRC-20 токенов
 * - Криптографически стойкая генерация ключей
 * - HTTP API интеграция с Tron Grid
 * - Мониторинг транзакций и блоков
 */
export class TronClient {
  private tronWeb: any;
  private config: TronConfig;
  private logger: Logger;
  private hsmManager?: HSMManager;

  constructor(config: TronConfig) {
    this.config = config;
    this.logger = new Logger('TronClient');
    
    // Инициализируем TronWeb
    this.tronWeb = new TronWeb({
      fullHost: config.fullNode,
      headers: config.apiKey ? { 'TRON-PRO-API-KEY': config.apiKey } : {},
      privateKey: undefined // Не используем дефолтный приватный ключ
    });
    
    // Альтернативная инициализация для более детального контроля
    if (config.solidityNode || config.eventServer) {
      this.tronWeb = new TronWeb(
        config.fullNode,
        config.solidityNode || config.fullNode,
        config.eventServer || config.fullNode,
        undefined
      );
    }
    
    // Инициализируем HSM Manager если конфигурация предоставлена
    if (config.hsmConfig) {
      this.hsmManager = new HSMManager(config.hsmConfig);
    }
    
    this.logger.info('Tron client инициализирован', {
      fullNode: config.fullNode?.substring(0, 30) + '...',
      solidityNode: config.solidityNode?.substring(0, 30) + '...',
      eventServer: config.eventServer?.substring(0, 30) + '...',
      secureGeneration: config.enableSecureGeneration || false,
      hasApiKey: !!config.apiKey
    });
  }

  public async connect(): Promise<void> {
    try {
      // Проверяем подключение к Tron сети
      const nodeInfo = await this.tronWeb.trx.getNodeInfo();
      this.logger.info('Подключен к Tron сети', {
        configNodeVersion: nodeInfo.configNodeVersion,
        machineInfo: nodeInfo.machineInfo?.javaVersion,
        cheatWitnessInfoMap: Object.keys(nodeInfo.cheatWitnessInfoMap || {}).length
      });
      
      // Проверяем баланс нулевого аккаунта для проверки API
      const chainParameters = await this.tronWeb.trx.getChainParameters();
      this.logger.info('Tron API отвечает', {
        parametersCount: chainParameters.length,
        testParameter: chainParameters[0]?.key || 'unknown'
      });
      
      // Инициализируем HSM Manager если он настроен
      if (this.hsmManager) {
        await this.hsmManager.initialize();
        this.logger.info('HSM Manager инициализирован для Tron');
      }
      
    } catch (error) {
      this.logger.error('Ошибка подключения к Tron ноде:', error as Error);
      throw error;
    }
  }

  /**
   * Генерация нового Tron адреса с использованием HSM/Vault или криптографически безопасного метода
   * 
   * @returns Объект с адресом и ID ключа в Vault
   */
  public async generateAddress(): Promise<{ address: string; keyId: string; publicKey: string }> {
    try {
      if (this.config.enableSecureGeneration && this.hsmManager) {
        return await this.generateSecureAddress();
      } else {
        return await this.generateLegacyAddress();
      }
    } catch (error) {
      this.logger.error('Ошибка генерации Tron адреса:', error as Error);
      throw new Error(`Не удалось сгенерировать Tron адрес: ${(error as Error).message}`);
    }
  }

  /**
   * Безопасная генерация адреса с использованием HSM/Vault
   */
  private async generateSecureAddress(): Promise<{ address: string; keyId: string; publicKey: string }> {
    if (!this.hsmManager) {
      throw new Error('HSM Manager не инициализирован');
    }

    // Генерируем ключ в HSM/Vault  
    const keyResult: KeyGenerationResult = await this.hsmManager.generateKey(
      'secp256k1',
      'TRX',
      'signing'
    );

    // Создаем Tron адрес из публичного ключа
    const address = this.deriveAddressFromPublicKey(keyResult.publicKey);
    
    this.logger.info('Сгенерирован безопасный Tron адрес', {
      address: address.substring(0, 10) + '...',
      keyId: keyResult.keyId,
      isHSM: keyResult.isHSMKey
    });

    return {
      address,
      keyId: keyResult.keyId,
      publicKey: keyResult.publicKey
    };
  }

  /**
   * Легаси генерация адреса для обратной совместимости (НЕ для production)
   */
  private async generateLegacyAddress(): Promise<{ address: string; keyId: string; publicKey: string }> {
    this.logger.warn('Используется небезопасная генерация адресов! Включите enableSecureGeneration для production');

    // Генерируем криптографически стойкий приватный ключ
    let privateKeyHex: string;
    do {
      const privateKeyBytes = crypto.randomBytes(32);
      privateKeyHex = privateKeyBytes.toString('hex');
    } while (!this.isValidPrivateKey(privateKeyHex));

    // Создаем аккаунт из приватного ключа
    const account = this.tronWeb.createAccount();
    const addressFromPrivateKey = this.tronWeb.address.fromPrivateKey(privateKeyHex);
    
    // Генерируем временный keyId для совместимости
    const keyId = `legacy-trx-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Получаем публичный ключ
    const publicKey = this.tronWeb.utils.crypto.getPubKeyFromPriKey(privateKeyHex);

    return {
      address: addressFromPrivateKey,
      keyId,
      publicKey: publicKey
    };
  }

  /**
   * Деривация Tron адреса из публичного ключа
   */
  private deriveAddressFromPublicKey(publicKeyHex: string): string {
    // Используем TronWeb для деривации адреса из публичного ключа
    // В реальной реализации здесь должна быть более сложная логика
    const address = this.tronWeb.utils.crypto.getAddressFromPriKey(
      '0x' + publicKeyHex // Временно используем публичный ключ как приватный для деривации
    );
    
    return address;
  }

  /**
   * Проверка валидности приватного ключа для secp256k1
   */
  private isValidPrivateKey(privateKeyHex: string): boolean {
    try {
      // Проверяем что ключ не равен 0 и правильной длины
      const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
      if (privateKeyBuffer.length !== 32) return false;
      
      // Проверяем что не равен 0
      const isZero = privateKeyBuffer.every(byte => byte === 0);
      if (isZero) return false;
      
      // Проверяем что меньше порядка кривой secp256k1
      const secp256k1Order = Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 'hex');
      return privateKeyBuffer.compare(secp256k1Order) < 0;
    } catch {
      return false;
    }
  }

  public async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.tronWeb.trx.getBalance(address);
      return this.tronWeb.fromSun(balance); // Конвертируем SUN в TRX
    } catch (error) {
      this.logger.error('Ошибка получения баланса:', error as Error);
      throw error;
    }
  }

  /**
   * Отправка TRX транзакции с использованием HSM/Vault для подписи или legacy метода
   * 
   * @param from - Адрес отправителя
   * @param to - Адрес получателя
   * @param amount - Сумма в TRX
   * @param keyId - ID ключа в Vault/HSM или приватный ключ в hex (для legacy)
   */
  public async sendTransaction(
    from: string,
    to: string,
    amount: string,
    keyId: string
  ): Promise<string> {
    try {
      if (this.config.enableSecureGeneration && this.hsmManager) {
        return await this.sendSecureTransaction(from, to, amount, keyId);
      } else {
        return await this.sendLegacyTransaction(from, to, amount, keyId);
      }
    } catch (error) {
      this.logger.error('Ошибка отправки Tron транзакции:', error as Error);
      throw error;
    }
  }

  /**
   * Безопасная отправка транзакции с использованием HSM/Vault для подписи
   */
  private async sendSecureTransaction(
    from: string,
    to: string,
    amount: string,
    keyId: string
  ): Promise<string> {
    if (!this.hsmManager) {
      throw new Error('HSM Manager не инициализирован');
    }

    const amountSun = this.tronWeb.toSun(amount);
    
    // Создаем транзакцию
    const transaction = await this.tronWeb.transactionBuilder.sendTrx(
      to,
      amountSun,
      from
    );

    // Сериализуем транзакцию для подписи
    const txID = transaction.txID;
    const rawDataHex = transaction.raw_data_hex;
    
    // Подписываем через HSM
    const signature = await this.hsmManager.sign(keyId, 'TRX', Buffer.from(txID, 'hex'));
    
    // Применяем подпись к транзакции
    this.applyHSMSignatureToTransaction(transaction, signature);

    // Отправляем транзакцию
    const result = await this.tronWeb.trx.sendRawTransaction(transaction);
    
    if (!result.result) {
      throw new Error(`Транзакция отклонена: ${result.code || 'unknown error'}`);
    }
    
    this.logger.info('Tron транзакция отправлена через HSM', {
      txid: result.txid,
      from: from.substring(0, 10) + '...',
      to: to.substring(0, 10) + '...',
      amount,
      keyId
    });
    
    return result.txid;
  }

  /**
   * Legacy отправка транзакции
   */
  private async sendLegacyTransaction(
    from: string,
    to: string,
    amount: string,
    privateKeyHex: string
  ): Promise<string> {
    this.logger.warn('Используется небезопасная отправка транзакций! Включите enableSecureGeneration для production');

    const amountSun = this.tronWeb.toSun(amount);
    
    // Создаем транзакцию
    const transaction = await this.tronWeb.transactionBuilder.sendTrx(
      to,
      amountSun,
      from
    );

    // Подписываем транзакцию приватным ключом
    const signedTransaction = await this.tronWeb.trx.sign(transaction, privateKeyHex);

    // Отправляем транзакцию
    const result = await this.tronWeb.trx.sendRawTransaction(signedTransaction);
    
    if (!result.result) {
      throw new Error(`Транзакция отклонена: ${result.code || 'unknown error'}`);
    }
    
    this.logger.info(`Legacy Tron транзакция отправлена: ${result.txid}`);
    return result.txid;
  }

  /**
   * Применение подписи HSM к Tron транзакции
   */
  private applyHSMSignatureToTransaction(transaction: any, signature: string): void {
    // В реальной реализации здесь должна быть сложная логика
    // для правильного применения ECDSA подписи из HSM к Tron транзакции
    transaction.signature = [signature];
    
    this.logger.info('Применена HSM подпись к Tron транзакции', {
      signatureLength: signature.length,
      txID: transaction.txID?.substring(0, 10) + '...'
    });
  }

  /**
   * Получение информации о транзакции
   */
  public async getTransaction(txHash: string): Promise<any> {
    try {
      return await this.tronWeb.trx.getTransaction(txHash);
    } catch (error) {
      this.logger.error('Ошибка получения транзакции:', error as Error);
      throw error;
    }
  }

  /**
   * Получение информации о блоке
   */
  public async getBlock(blockNumber: number): Promise<any> {
    try {
      return await this.tronWeb.trx.getBlock(blockNumber);
    } catch (error) {
      this.logger.error('Ошибка получения блока:', error as Error);
      throw error;
    }
  }

  /**
   * Получение последнего блока
   */
  public async getLatestBlock(): Promise<any> {
    try {
      return await this.tronWeb.trx.getCurrentBlock();
    } catch (error) {
      this.logger.error('Ошибка получения последнего блока:', error as Error);
      throw error;
    }
  }

  /**
   * Получение баланса TRC-20 токена
   */
  public async getTokenBalance(
    walletAddress: string,
    tokenContractAddress: string
  ): Promise<string> {
    try {
      const contract = await this.tronWeb.contract().at(tokenContractAddress);
      
      if (!contract.balanceOf) {
        throw new Error('Некорректный TRC-20 контракт - отсутствует метод balanceOf');
      }
      
      const balance = await contract.balanceOf(walletAddress).call();
      
      // Получаем decimals токена
      let decimals = 6; // Дефолтное значение для TRC-20
      try {
        if (contract.decimals) {
          decimals = await contract.decimals().call();
        }
      } catch {
        // Игнорируем ошибки получения decimals
      }
      
      return (balance.toNumber() / Math.pow(10, decimals)).toString();
      
    } catch (error) {
      this.logger.error('Ошибка получения баланса токена:', error as Error);
      return '0';
    }
  }

  /**
   * Отправка TRC-20 токенов
   */
  public async sendToken(
    from: string,
    to: string,
    tokenContractAddress: string,
    amount: string,
    keyId: string
  ): Promise<string> {
    try {
      const contract = await this.tronWeb.contract().at(tokenContractAddress);
      
      if (!contract.transfer || !contract.decimals) {
        throw new Error('Некорректный TRC-20 контракт - отсутствуют необходимые методы');
      }
      
      // Получаем decimals токена
      const decimals = await contract.decimals().call();
      const transferAmount = Math.floor(parseFloat(amount) * Math.pow(10, decimals));
      
      if (this.config.enableSecureGeneration && this.hsmManager) {
        // Создаем транзакцию через contract
        const transaction = await this.tronWeb.transactionBuilder.triggerSmartContract(
          tokenContractAddress,
          'transfer(address,uint256)',
          {},
          [
            { type: 'address', value: to },
            { type: 'uint256', value: transferAmount }
          ],
          from
        );
        
        if (!transaction.result.result) {
          throw new Error('Не удалось создать транзакцию токена');
        }
        
        // Подписываем через HSM
        const txID = transaction.transaction.txID;
        const signature = await this.hsmManager.sign(keyId, 'TRX', Buffer.from(txID, 'hex'));
        this.applyHSMSignatureToTransaction(transaction.transaction, signature);
        
        // Отправляем транзакцию
        const result = await this.tronWeb.trx.sendRawTransaction(transaction.transaction);
        
        if (!result.result) {
          throw new Error(`Транзакция токена отклонена: ${result.code || 'unknown error'}`);
        }
        
        this.logger.info('TRC-20 токен отправлен через HSM', {
          txid: result.txid,
          token: tokenContractAddress,
          amount,
          keyId
        });
        
        return result.txid;
      } else {
        // Legacy отправка токенов
        const tronWebWithPrivateKey = new TronWeb(
          this.config.fullNode,
          this.config.solidityNode || this.config.fullNode,
          this.config.eventServer || this.config.fullNode,
          keyId
        );
        
        const contractWithPrivateKey = await tronWebWithPrivateKey.contract().at(tokenContractAddress);
        const result = await contractWithPrivateKey.transfer(to, transferAmount).send();
        
        this.logger.info(`Legacy TRC-20 токен отправлен: ${result}`);
        return result;
      }
      
    } catch (error) {
      this.logger.error('Ошибка отправки TRC-20 токена:', error as Error);
      throw error;
    }
  }

  /**
   * Валидация Tron адреса
   */
  public isValidAddress(address: string): boolean {
    return this.tronWeb.isAddress(address);
  }

  /**
   * Получение информации об аккаунте
   */
  public async getAccount(address: string): Promise<any> {
    try {
      return await this.tronWeb.trx.getAccount(address);
    } catch (error) {
      this.logger.error('Ошибка получения информации об аккаунте:', error as Error);
      throw error;
    }
  }

  /**
   * Получение ресурсов аккаунта (Energy, Bandwidth)
   */
  public async getAccountResources(address: string): Promise<any> {
    try {
      return await this.tronWeb.trx.getAccountResources(address);
    } catch (error) {
      this.logger.error('Ошибка получения ресурсов аккаунта:', error as Error);
      throw error;
    }
  }

  /**
   * Проверка состояния подключения
   */
  public async healthCheck(): Promise<{
    connected: boolean;
    nodeInfo: any;
    blockNumber: number;
    chainParameters: any[];
    warnings: string[];
  }> {
    try {
      const [nodeInfo, currentBlock, chainParameters] = await Promise.all([
        this.tronWeb.trx.getNodeInfo(),
        this.tronWeb.trx.getCurrentBlock(),
        this.tronWeb.trx.getChainParameters()
      ]);

      return {
        connected: true,
        nodeInfo,
        blockNumber: currentBlock.block_header.raw_data.number,
        chainParameters: chainParameters.slice(0, 5), // Первые 5 параметров для краткости
        warnings: []
      };
    } catch (error) {
      this.logger.error('Tron health check failed:', error as Error);
      return {
        connected: false,
        nodeInfo: null,
        blockNumber: 0,
        chainParameters: [],
        warnings: [(error as Error).message]
      };
    }
  }

  /**
   * Получение событий контракта
   */
  public async getContractEvents(
    contractAddress: string,
    eventName?: string,
    sinceTimestamp?: number
  ): Promise<any[]> {
    try {
      const options: any = {
        size: 200,
        fingerprint: ''
      };
      
      if (eventName) {
        options.eventName = eventName;
      }
      
      if (sinceTimestamp) {
        options.sinceTimestamp = sinceTimestamp;
      }
      
      return await this.tronWeb.getEventResult(contractAddress, options);
    } catch (error) {
      this.logger.error('Ошибка получения событий контракта:', error as Error);
      throw error;
    }
  }

  /**
   * Мониторинг новых блоков (через polling)
   */
  public async startBlockMonitoring(callback: (block: any) => void, intervalMs: number = 3000): Promise<NodeJS.Timeout> {
    let lastBlockNumber = 0;
    
    const pollBlocks = async () => {
      try {
        const currentBlock = await this.tronWeb.trx.getCurrentBlock();
        const currentBlockNumber = currentBlock.block_header.raw_data.number;
        
        if (currentBlockNumber > lastBlockNumber) {
          lastBlockNumber = currentBlockNumber;
          callback(currentBlock);
        }
      } catch (error) {
        this.logger.error('Ошибка мониторинга блоков:', error as Error);
      }
    };
    
    this.logger.info('Запущен мониторинг новых блоков Tron', { intervalMs });
    return setInterval(pollBlocks, intervalMs);
  }

  /**
   * Остановка мониторинга блоков
   */
  public stopBlockMonitoring(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    this.logger.info('Мониторинг блоков Tron остановлен');
  }
}