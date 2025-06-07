/**
 * Менеджер кэширования критических данных микширования
 * 
 * Специализированное кэширование для:
 * - Активные запросы микширования
 * - Балансы кошельков и пулы ликвидности
 * - Курсы валют и комиссии
 * - Временные ключи и сессии
 * - Blockchain confirmations статусы
 * - Anti-fraud данные и блэклисты
 */

import { RedisCacheLayer } from './RedisCacheLayer';
import { enhancedDbLogger } from '../logger';
import { EventEmitter } from 'events';

export interface MixingSessionData {
  id: string;
  currency: string;
  inputAmount: number;
  outputAddresses: string[];
  depositAddress: string;
  status: 'PENDING' | 'DEPOSITED' | 'POOLING' | 'MIXING' | 'COMPLETED' | 'FAILED';
  expiresAt: Date;
  lastUpdated: Date;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    fingerprint?: string;
  };
}

export interface WalletBalanceData {
  id: string;
  currency: string;
  balance: number;
  availableBalance: number;
  lockedBalance: number;
  lastTransactionAt: Date;
  lastUpdated: Date;
  isActive: boolean;
  isLocked: boolean;
}

export interface ExchangeRateData {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  timestamp: Date;
  source: string;
  confidence: number; // 0-100
}

export interface AntifraudData {
  address: string;
  riskScore: number; // 0-100
  lastSeen: Date;
  flags: string[];
  source: 'INTERNAL' | 'EXTERNAL' | 'USER_REPORT';
}

export interface BlockchainConfirmationData {
  txid: string;
  currency: string;
  confirmations: number;
  requiredConfirmations: number;
  blockHeight: number;
  timestamp: Date;
  isConfirmed: boolean;
}

/**
 * Менеджер критических данных с высокой производительностью
 */
export class CriticalDataCacheManager extends EventEmitter {
  private cache: RedisCacheLayer;
  
  // Cache prefixes для разных типов данных
  private readonly PREFIXES = {
    MIXING_SESSION: 'mix_session:',
    WALLET_BALANCE: 'wallet_balance:',
    EXCHANGE_RATE: 'exchange_rate:',
    ANTIFRAUD: 'antifraud:',
    CONFIRMATION: 'confirmation:',
    TEMP_KEY: 'temp_key:',
    USER_SESSION: 'user_session:',
    BLACKLIST: 'blacklist:',
    WHITELIST: 'whitelist:'
  };

  // TTL константы (в секундах)
  private readonly TTL = {
    MIXING_SESSION: 3600 * 24, // 24 часа
    WALLET_BALANCE: 60, // 1 минута
    EXCHANGE_RATE: 300, // 5 минут
    ANTIFRAUD: 3600 * 24 * 7, // 1 неделя
    CONFIRMATION: 300, // 5 минут
    TEMP_KEY: 1800, // 30 минут
    USER_SESSION: 3600 * 2, // 2 часа
    BLACKLIST: 3600 * 24, // 24 часа
    WHITELIST: 3600 * 12 // 12 часов
  };

  constructor(cache: RedisCacheLayer) {
    super();
    this.cache = cache;
    
    enhancedDbLogger.info('🔒 CriticalDataCacheManager инициализирован');
  }

  /**
   * MIXING SESSION MANAGEMENT
   */

  /**
   * Сохранение данных сессии микширования
   */
  async setMixingSession(sessionData: MixingSessionData): Promise<void> {
    try {
      const key = `${this.PREFIXES.MIXING_SESSION}${sessionData.id}`;
      
      await this.cache.set(key, sessionData, this.TTL.MIXING_SESSION);
      
      // Также индексируем по deposit address для быстрого поиска
      const depositKey = `${this.PREFIXES.MIXING_SESSION}deposit:${sessionData.depositAddress}`;
      await this.cache.set(depositKey, sessionData.id, this.TTL.MIXING_SESSION);

      enhancedDbLogger.debug('💾 Mixing session сохранена', { 
        sessionId: sessionData.id,
        status: sessionData.status,
        currency: sessionData.currency 
      });

      this.emit('mixing_session_cached', sessionData);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сохранения mixing session', { 
        sessionId: sessionData.id, 
        error 
      });
      throw error;
    }
  }

  /**
   * Получение данных сессии микширования
   */
  async getMixingSession(sessionId: string): Promise<MixingSessionData | null> {
    try {
      const key = `${this.PREFIXES.MIXING_SESSION}${sessionId}`;
      const sessionData = await this.cache.get<MixingSessionData>(key);

      if (sessionData) {
        enhancedDbLogger.debug('✅ Mixing session найдена', { 
          sessionId,
          status: sessionData.status 
        });
      }

      return sessionData;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения mixing session', { sessionId, error });
      return null;
    }
  }

  /**
   * Поиск сессии по deposit address
   */
  async findMixingSessionByDeposit(depositAddress: string): Promise<MixingSessionData | null> {
    try {
      const depositKey = `${this.PREFIXES.MIXING_SESSION}deposit:${depositAddress}`;
      const sessionId = await this.cache.get<string>(depositKey);
      
      if (!sessionId) return null;
      
      return await this.getMixingSession(sessionId);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка поиска session по deposit', { depositAddress, error });
      return null;
    }
  }

  /**
   * Обновление статуса сессии микширования
   */
  async updateMixingSessionStatus(
    sessionId: string, 
    status: MixingSessionData['status'],
    metadata?: Partial<MixingSessionData>
  ): Promise<boolean> {
    try {
      const existingSession = await this.getMixingSession(sessionId);
      if (!existingSession) return false;

      const updatedSession: MixingSessionData = {
        ...existingSession,
        status,
        lastUpdated: new Date(),
        ...metadata
      };

      await this.setMixingSession(updatedSession);
      
      enhancedDbLogger.info('🔄 Mixing session статус обновлен', { 
        sessionId, 
        oldStatus: existingSession.status,
        newStatus: status 
      });

      this.emit('mixing_session_status_updated', { sessionId, oldStatus: existingSession.status, newStatus: status });

      return true;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка обновления статуса session', { sessionId, status, error });
      return false;
    }
  }

  /**
   * WALLET BALANCE MANAGEMENT
   */

  /**
   * Кэширование баланса кошелька
   */
  async setWalletBalance(balanceData: WalletBalanceData): Promise<void> {
    try {
      const key = `${this.PREFIXES.WALLET_BALANCE}${balanceData.id}`;
      
      await this.cache.set(key, balanceData, this.TTL.WALLET_BALANCE);

      // Индексируем по валюте для быстрого поиска
      const currencyKey = `${this.PREFIXES.WALLET_BALANCE}currency:${balanceData.currency}`;
      const currencyWallets = await this.cache.get<string[]>(currencyKey) || [];
      
      if (!currencyWallets.includes(balanceData.id)) {
        currencyWallets.push(balanceData.id);
        await this.cache.set(currencyKey, currencyWallets, this.TTL.WALLET_BALANCE);
      }

      enhancedDbLogger.debug('💰 Wallet balance кэширован', { 
        walletId: balanceData.id,
        currency: balanceData.currency,
        balance: balanceData.balance 
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка кэширования wallet balance', { 
        walletId: balanceData.id, 
        error 
      });
      throw error;
    }
  }

  /**
   * Получение баланса кошелька
   */
  async getWalletBalance(walletId: string): Promise<WalletBalanceData | null> {
    try {
      const key = `${this.PREFIXES.WALLET_BALANCE}${walletId}`;
      return await this.cache.get<WalletBalanceData>(key);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения wallet balance', { walletId, error });
      return null;
    }
  }

  /**
   * Инвалидация баланса кошелька
   */
  async invalidateWalletBalance(walletId: string): Promise<void> {
    try {
      const key = `${this.PREFIXES.WALLET_BALANCE}${walletId}`;
      await this.cache.delete(key);
      
      enhancedDbLogger.debug('🗑️ Wallet balance инвалидирован', { walletId });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инвалидации wallet balance', { walletId, error });
    }
  }

  /**
   * EXCHANGE RATES MANAGEMENT
   */

  /**
   * Кэширование курса валют
   */
  async setExchangeRate(rateData: ExchangeRateData): Promise<void> {
    try {
      const key = `${this.PREFIXES.EXCHANGE_RATE}${rateData.baseCurrency}_${rateData.quoteCurrency}`;
      
      await this.cache.set(key, rateData, this.TTL.EXCHANGE_RATE);

      enhancedDbLogger.debug('📈 Exchange rate кэширован', { 
        pair: `${rateData.baseCurrency}/${rateData.quoteCurrency}`,
        rate: rateData.rate,
        source: rateData.source 
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка кэширования exchange rate', { 
        pair: `${rateData.baseCurrency}/${rateData.quoteCurrency}`, 
        error 
      });
      throw error;
    }
  }

  /**
   * Получение курса валют
   */
  async getExchangeRate(baseCurrency: string, quoteCurrency: string): Promise<ExchangeRateData | null> {
    try {
      const key = `${this.PREFIXES.EXCHANGE_RATE}${baseCurrency}_${quoteCurrency}`;
      return await this.cache.get<ExchangeRateData>(key);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения exchange rate', { 
        baseCurrency, 
        quoteCurrency, 
        error 
      });
      return null;
    }
  }

  /**
   * ANTIFRAUD & SECURITY MANAGEMENT
   */

  /**
   * Кэширование antifraud данных
   */
  async setAntifraudData(data: AntifraudData): Promise<void> {
    try {
      const key = `${this.PREFIXES.ANTIFRAUD}${data.address}`;
      
      await this.cache.set(key, data, this.TTL.ANTIFRAUD);

      // Если risk score высокий, добавляем в blacklist
      if (data.riskScore >= 80) {
        await this.addToBlacklist(data.address, `High risk score: ${data.riskScore}`);
      }

      enhancedDbLogger.debug('🛡️ Antifraud данные кэшированы', { 
        address: data.address.substring(0, 10) + '...',
        riskScore: data.riskScore,
        flags: data.flags 
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка кэширования antifraud данных', { 
        address: data.address, 
        error 
      });
      throw error;
    }
  }

  /**
   * Получение antifraud данных
   */
  async getAntifraudData(address: string): Promise<AntifraudData | null> {
    try {
      const key = `${this.PREFIXES.ANTIFRAUD}${address}`;
      return await this.cache.get<AntifraudData>(key);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения antifraud данных', { address, error });
      return null;
    }
  }

  /**
   * Добавление адреса в blacklist
   */
  async addToBlacklist(address: string, reason: string): Promise<void> {
    try {
      const key = `${this.PREFIXES.BLACKLIST}${address}`;
      
      await this.cache.set(key, {
        address,
        reason,
        addedAt: new Date(),
        source: 'INTERNAL'
      }, this.TTL.BLACKLIST);

      enhancedDbLogger.warn('⚠️ Адрес добавлен в blacklist', { 
        address: address.substring(0, 10) + '...',
        reason 
      });

      this.emit('address_blacklisted', { address, reason });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка добавления в blacklist', { address, reason, error });
      throw error;
    }
  }

  /**
   * Проверка, находится ли адрес в blacklist
   */
  async isBlacklisted(address: string): Promise<boolean> {
    try {
      const key = `${this.PREFIXES.BLACKLIST}${address}`;
      const result = await this.cache.exists(key);
      
      if (result) {
        enhancedDbLogger.warn('🚫 Обнаружен blacklisted адрес', { 
          address: address.substring(0, 10) + '...' 
        });
      }

      return result;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки blacklist', { address, error });
      return false;
    }
  }

  /**
   * BLOCKCHAIN CONFIRMATIONS MANAGEMENT
   */

  /**
   * Кэширование данных о подтверждениях
   */
  async setConfirmationData(data: BlockchainConfirmationData): Promise<void> {
    try {
      const key = `${this.PREFIXES.CONFIRMATION}${data.txid}`;
      
      await this.cache.set(key, data, this.TTL.CONFIRMATION);

      enhancedDbLogger.debug('⛓️ Confirmation данные кэшированы', { 
        txid: data.txid.substring(0, 16) + '...',
        confirmations: data.confirmations,
        isConfirmed: data.isConfirmed 
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка кэширования confirmation данных', { 
        txid: data.txid, 
        error 
      });
      throw error;
    }
  }

  /**
   * Получение данных о подтверждениях
   */
  async getConfirmationData(txid: string): Promise<BlockchainConfirmationData | null> {
    try {
      const key = `${this.PREFIXES.CONFIRMATION}${txid}`;
      return await this.cache.get<BlockchainConfirmationData>(key);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения confirmation данных', { txid, error });
      return null;
    }
  }

  /**
   * TEMPORARY KEYS & SESSION MANAGEMENT
   */

  /**
   * Сохранение временного ключа
   */
  async setTempKey(keyId: string, data: any, customTTL?: number): Promise<void> {
    try {
      const key = `${this.PREFIXES.TEMP_KEY}${keyId}`;
      const ttl = customTTL || this.TTL.TEMP_KEY;
      
      await this.cache.set(key, data, ttl);

      enhancedDbLogger.debug('🔑 Временный ключ сохранен', { keyId, ttl });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сохранения временного ключа', { keyId, error });
      throw error;
    }
  }

  /**
   * Получение временного ключа
   */
  async getTempKey(keyId: string): Promise<any | null> {
    try {
      const key = `${this.PREFIXES.TEMP_KEY}${keyId}`;
      return await this.cache.get(key);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения временного ключа', { keyId, error });
      return null;
    }
  }

  /**
   * Удаление временного ключа
   */
  async deleteTempKey(keyId: string): Promise<boolean> {
    try {
      const key = `${this.PREFIXES.TEMP_KEY}${keyId}`;
      const deleted = await this.cache.delete(key);
      
      if (deleted) {
        enhancedDbLogger.debug('🗑️ Временный ключ удален', { keyId });
      }

      return deleted;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка удаления временного ключа', { keyId, error });
      return false;
    }
  }

  /**
   * BULK OPERATIONS для высокой производительности
   */

  /**
   * Bulk кэширование балансов кошельков
   */
  async bulkSetWalletBalances(balances: WalletBalanceData[]): Promise<void> {
    try {
      const operations = balances.map(balance => ({
        type: 'set' as const,
        key: `${this.PREFIXES.WALLET_BALANCE}${balance.id}`,
        value: balance,
        ttl: this.TTL.WALLET_BALANCE
      }));

      await this.cache.executeBatch({ operations });

      enhancedDbLogger.debug('📦 Bulk кэширование балансов', { count: balances.length });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка bulk кэширования балансов', { 
        count: balances.length, 
        error 
      });
      throw error;
    }
  }

  /**
   * Bulk получение балансов кошельков
   */
  async bulkGetWalletBalances(walletIds: string[]): Promise<Map<string, WalletBalanceData | null>> {
    try {
      const operations = walletIds.map(id => ({
        type: 'get' as const,
        key: `${this.PREFIXES.WALLET_BALANCE}${id}`
      }));

      const results = await this.cache.executeBatch({ operations });
      
      const balancesMap = new Map<string, WalletBalanceData | null>();
      walletIds.forEach((id, index) => {
        balancesMap.set(id, results[index] || null);
      });

      enhancedDbLogger.debug('📦 Bulk получение балансов', { count: walletIds.length });

      return balancesMap;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка bulk получения балансов', { 
        count: walletIds.length, 
        error 
      });
      throw error;
    }
  }

  /**
   * ANALYTICS & MONITORING
   */

  /**
   * Получение статистики кэша критических данных
   */
  getCacheStats(): any {
    return {
      ...this.cache.getStats(),
      prefixes: Object.keys(this.PREFIXES),
      ttlSettings: this.TTL
    };
  }

  /**
   * Очистка всех критических данных (ОСТОРОЖНО!)
   */
  async clearAllCriticalData(): Promise<void> {
    enhancedDbLogger.warn('⚠️ Очистка ВСЕХ критических данных!');

    try {
      for (const prefix of Object.values(this.PREFIXES)) {
        await this.cache.invalidatePattern(prefix);
      }

      enhancedDbLogger.info('✅ Все критические данные очищены');
      this.emit('all_critical_data_cleared');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка очистки критических данных', { error });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    enhancedDbLogger.info('🔄 Остановка CriticalDataCacheManager...');
    
    // Кэш будет остановлен в основном менеджере
    this.removeAllListeners();
    
    enhancedDbLogger.info('✅ CriticalDataCacheManager остановлен');
  }
}

export default CriticalDataCacheManager;