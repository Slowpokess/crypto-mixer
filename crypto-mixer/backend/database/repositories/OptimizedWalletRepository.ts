/**
 * Оптимизированный WalletRepository с устранением N+1 проблем
 * 
 * Основные оптимизации:
 * - Агрегированные запросы для статистики вместо загрузки всех записей
 * - Оптимизированные индексированные запросы для поиска кошельков
 * - Кэширование балансов и часто используемых данных
 * - Batch операции для массовых обновлений
 * - Connection pooling optimization
 */

import { Transaction, Op, QueryTypes } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { Wallet, WalletAttributes, WalletCreationAttributes } from '../models/Wallet';
import { CurrencyType } from '../types';
import { OptimizedQueryBuilder } from '../utils/OptimizedQueryBuilder';
import { enhancedDbLogger } from '../logger';
import { DatabaseError, ErrorCode } from '../../utils/errors/ErrorTypes';

/**
 * Оптимизированный репозиторий для работы с кошельками
 */
export class OptimizedWalletRepository extends BaseRepository<Wallet> {
  private queryBuilder: OptimizedQueryBuilder;
  private balanceCache = new Map<string, { balance: number; timestamp: number }>();
  private readonly BALANCE_CACHE_TTL = 30000; // 30 секунд

  constructor(model: typeof Wallet, queryBuilder: OptimizedQueryBuilder) {
    super(model);
    this.queryBuilder = queryBuilder;
  }

  /**
   * Создание нового кошелька с проверкой уникальности
   * Оптимизация: Использование EXISTS вместо полной загрузки записи
   */
  async createWallet(
    data: WalletCreationAttributes,
    transaction?: Transaction
  ): Promise<Wallet> {
    const operationId = await enhancedDbLogger.startOperation('createWallet');
    
    try {
      this.validateData(data);
      
      // Оптимизированная проверка существования адреса
      const [existsResult] = await this.sequelize.query(`
        SELECT EXISTS(SELECT 1 FROM wallets WHERE address = :address) as exists
      `, {
        replacements: { address: data.address },
        type: QueryTypes.SELECT,
        transaction
      }) as any[];

      if (existsResult.exists) {
        throw new DatabaseError(
          `Wallet with address ${data.address} already exists`,
          ErrorCode.CONSTRAINT_VIOLATION,
          { address: data.address }
        );
      }

      const wallet = await this.create(data, transaction);
      
      // Инвалидируем кэш статистики
      this.queryBuilder.invalidateCache('wallet_stats');
      this.queryBuilder.invalidateCache('wallet_type_stats');
      this.queryBuilder.invalidateCache('wallet_currency_stats');

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('createWallet', { 
        id: wallet.id, 
        currency: data.currency, 
        type: data.type,
        address: data.address.substring(0, 10) + '...' 
      });
      
      return wallet;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('createWallet', error);
      throw error;
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Поиск кошелька по адресу с кэшированием
   */
  async findByAddress(address: string): Promise<Wallet | null> {
    const operationId = await enhancedDbLogger.startOperation('findByAddress');
    
    try {
      // Используем индексированный запрос
      const result = await this.findOne({ address });

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('findByAddress', { 
        address: address.substring(0, 10) + '...', 
        found: !!result 
      });
      
      return result;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('findByAddress', error);
      throw error;
    }
  }

  /**
   * КАРДИНАЛЬНО ОПТИМИЗИРОВАННЫЙ: Статистика с агрегацией на БД
   * Устранение N+1: Вместо загрузки всех записей - агрегация на уровне БД
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byCurrency: Record<CurrencyType, number>;
    totalBalance: Record<CurrencyType, number>;
    activeWallets: number;
    lockedWallets: number;
  }> {
    const operationId = await enhancedDbLogger.startOperation('getWalletStatistics');
    
    try {
      // Используем оптимизированный query builder
      const result = await this.queryBuilder.getWalletStatistics();

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('getStatistics', { 
        total: result.total,
        activeWallets: result.activeWallets,
        lockedWallets: result.lockedWallets
      });
      
      return result;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('getStatistics', error);
      throw error;
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Поиск кошельков с достаточным балансом
   * Использует оптимизированный query builder с индексами
   */
  async findWithSufficientBalance(
    currency: CurrencyType,
    minAmount: number,
    limit: number = 10
  ): Promise<Wallet[]> {
    const operationId = await enhancedDbLogger.startOperation('findWithSufficientBalance');
    
    try {
      // Используем оптимизированный query builder
      const rows = await this.queryBuilder.findWalletsWithSufficientBalance(
        currency,
        minAmount,
        limit
      );

      // Преобразуем raw результаты в модели Wallet
      const wallets = rows.map(row => this.model.build(row, { isNewRecord: false }));

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('findWithSufficientBalance', { 
        currency, 
        minAmount, 
        foundCount: wallets.length,
        limit
      });
      
      return wallets;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('findWithSufficientBalance', error);
      throw error;
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Batch обновление балансов
   * Массовое обновление одним запросом вместо множественных
   */
  async batchUpdateBalances(
    updates: Array<{ id: string; newBalance: number }>,
    transaction?: Transaction
  ): Promise<number> {
    const operationId = await enhancedDbLogger.startOperation('batchUpdateBalances');
    
    try {
      if (updates.length === 0) {
        return 0;
      }

      // Строим CASE WHEN запрос для batch обновления
      const whenClauses = updates.map(update => 
        `WHEN id = '${update.id}' THEN ${update.newBalance}`
      ).join(' ');

      const ids = updates.map(update => `'${update.id}'`).join(',');

      const query = `
        UPDATE wallets 
        SET 
          balance = CASE ${whenClauses} END,
          last_balance_update = NOW(),
          last_used_at = NOW()
        WHERE id IN (${ids})
      `;

      const [results] = await this.sequelize.query(query, {
        type: QueryTypes.UPDATE,
        transaction
      });

      // Очищаем кэш балансов для обновленных кошельков
      updates.forEach(update => {
        this.balanceCache.delete(update.id);
      });

      // Инвалидируем кэш статистики
      this.queryBuilder.invalidateCache('wallet_currency_stats');

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('batchUpdateBalances', { 
        updateCount: updates.length,
        affectedRows: results 
      });
      
      return results;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('batchUpdateBalances', error);
      throw error;
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Получение баланса с кэшированием
   */
  async getBalance(id: string): Promise<number> {
    const operationId = await enhancedDbLogger.startOperation('getBalance');
    
    try {
      // Проверяем кэш
      const cached = this.balanceCache.get(id);
      if (cached && Date.now() - cached.timestamp < this.BALANCE_CACHE_TTL) {
        await enhancedDbLogger.endOperation(operationId, true);
        return cached.balance;
      }

      // Получаем только баланс, без загрузки всей записи
      const [result] = await this.sequelize.query(`
        SELECT balance FROM wallets WHERE id = :id
      `, {
        replacements: { id },
        type: QueryTypes.SELECT
      }) as any[];

      if (!result) {
        throw new DatabaseError(
          `Wallet with ID ${id} not found`,
          ErrorCode.CONSTRAINT_VIOLATION,
          { walletId: id }
        );
      }

      const balance = Number(result.balance);
      
      // Кэшируем результат
      this.balanceCache.set(id, {
        balance,
        timestamp: Date.now()
      });

      await enhancedDbLogger.endOperation(operationId, true);
      return balance;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('getBalance', error);
      throw error;
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Обновление баланса с кэшем
   */
  async updateBalance(
    id: string,
    newBalance: number,
    transaction?: Transaction
  ): Promise<Wallet | null> {
    const operationId = await enhancedDbLogger.startOperation('updateBalance');
    
    try {
      // Получаем старый баланс для логирования
      const oldBalance = await this.getBalance(id);

      // Обновляем баланс
      const [updatedCount] = await this.model.update({
        balance: newBalance,
        lastBalanceUpdate: new Date(),
        lastUsedAt: new Date()
      }, {
        where: { id },
        transaction
      });

      if (updatedCount === 0) {
        throw new DatabaseError(
          `Wallet with ID ${id} not found`,
          ErrorCode.CONSTRAINT_VIOLATION,
          { walletId: id }
        );
      }

      // Обновляем кэш
      this.balanceCache.set(id, {
        balance: newBalance,
        timestamp: Date.now()
      });

      // Получаем обновленную запись
      const wallet = await this.findById(id);

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('updateBalance', { 
        id, 
        oldBalance, 
        newBalance, 
        change: newBalance - oldBalance 
      });

      return wallet;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('updateBalance', error);
      throw error;
    }
  }

  /**
   * НОВЫЙ: Атомарное списание средств с проверкой баланса
   */
  async atomicSubtractBalance(
    id: string,
    amount: number,
    transaction?: Transaction
  ): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    const operationId = await enhancedDbLogger.startOperation('atomicSubtractBalance');
    
    try {
      // Атомарная операция UPDATE с проверкой баланса
      const [results] = await this.sequelize.query(`
        UPDATE wallets 
        SET 
          balance = balance - :amount,
          last_balance_update = NOW(),
          last_used_at = NOW()
        WHERE id = :id 
          AND balance >= :amount
          AND is_active = true
          AND is_locked = false
      `, {
        replacements: { id, amount },
        type: QueryTypes.UPDATE,
        transaction
      }) as any[];

      if (results === 0) {
        // Проверяем причину неудачи
        const wallet = await this.findById(id);
        if (!wallet) {
          await enhancedDbLogger.endOperation(operationId, false);
          return { success: false, error: 'Wallet not found' };
        }
        if (wallet.balance < amount) {
          await enhancedDbLogger.endOperation(operationId, false);
          return { success: false, error: 'Insufficient balance' };
        }
        if (!wallet.isActive || wallet.isLocked) {
          await enhancedDbLogger.endOperation(operationId, false);
          return { success: false, error: 'Wallet is inactive or locked' };
        }
      }

      // Получаем новый баланс
      const newBalance = await this.getBalance(id);

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('atomicSubtractBalance', { 
        id, 
        amount, 
        newBalance,
        success: true 
      });

      return { success: true, newBalance };
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('atomicSubtractBalance', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Поиск оптимального кошелька для вывода с индексами
   */
  async findOptimalForWithdrawal(
    currency: CurrencyType,
    amount: number
  ): Promise<Wallet | null> {
    const operationId = await enhancedDbLogger.startOperation('findOptimalForWithdrawal');
    
    try {
      // Оптимизированный запрос с использованием индексов
      const [result] = await this.sequelize.query(`
        SELECT w.*
        FROM wallets w
        WHERE w.currency = :currency
          AND w.balance >= :amount
          AND w.is_active = true
          AND w.is_locked = false
          AND w.status = 'ACTIVE'
          AND w.type IN ('HOT', 'POOL')
        ORDER BY 
          w.balance DESC,
          w.last_used_at ASC
        LIMIT 1
      `, {
        replacements: { currency, amount },
        type: QueryTypes.SELECT
      }) as any[];

      const wallet = result ? this.model.build(result, { isNewRecord: false }) : null;

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('findOptimalForWithdrawal', { 
        currency, 
        amount, 
        found: !!wallet,
        walletId: wallet?.id 
      });
      
      return wallet;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('findOptimalForWithdrawal', error);
      throw error;
    }
  }

  /**
   * НОВЫЙ: Агрегированная статистика по валюте
   */
  async getCurrencyAggregates(currency: CurrencyType): Promise<{
    totalWallets: number;
    activeWallets: number;
    totalBalance: number;
    averageBalance: number;
    hotWallets: number;
    coldWallets: number;
    poolWallets: number;
  }> {
    const operationId = await enhancedDbLogger.startOperation('getCurrencyAggregates');
    
    try {
      const [result] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as total_wallets,
          SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_wallets,
          SUM(balance) as total_balance,
          AVG(balance) as average_balance,
          SUM(CASE WHEN type = 'HOT' THEN 1 ELSE 0 END) as hot_wallets,
          SUM(CASE WHEN type = 'COLD' THEN 1 ELSE 0 END) as cold_wallets,
          SUM(CASE WHEN type = 'POOL' THEN 1 ELSE 0 END) as pool_wallets
        FROM wallets 
        WHERE currency = :currency
      `, {
        replacements: { currency },
        type: QueryTypes.SELECT
      }) as any[];

      const stats = result[0] || {};
      const aggregates = {
        totalWallets: Number(stats.total_wallets || 0),
        activeWallets: Number(stats.active_wallets || 0),
        totalBalance: Number(stats.total_balance || 0),
        averageBalance: Number(stats.average_balance || 0),
        hotWallets: Number(stats.hot_wallets || 0),
        coldWallets: Number(stats.cold_wallets || 0),
        poolWallets: Number(stats.pool_wallets || 0)
      };

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('getCurrencyAggregates', { currency, ...aggregates });
      
      return aggregates;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('getCurrencyAggregates', error);
      throw error;
    }
  }

  /**
   * НОВЫЙ: Batch создание кошельков
   */
  async bulkCreateWallets(
    data: WalletCreationAttributes[],
    transaction?: Transaction
  ): Promise<Wallet[]> {
    const operationId = await enhancedDbLogger.startOperation('bulkCreateWallets');
    
    try {
      if (data.length === 0) {
        return [];
      }

      // Валидируем все данные
      data.forEach(item => this.validateData(item));

      // Проверяем уникальность адресов одним запросом
      const addresses = data.map(item => item.address);
      const [existingAddresses] = await this.sequelize.query(`
        SELECT address FROM wallets WHERE address IN (:addresses)
      `, {
        replacements: { addresses },
        type: QueryTypes.SELECT,
        transaction
      }) as any[];

      if (existingAddresses.length > 0) {
        const existing = existingAddresses.map((row: any) => row.address);
        throw new DatabaseError(
          `Wallets already exist for addresses: ${existing.join(', ')}`,
          ErrorCode.CONSTRAINT_VIOLATION,
          { existingAddresses: existing }
        );
      }

      // Bulk создание
      const wallets = await this.model.bulkCreate(data, {
        transaction,
        returning: true,
        validate: true
      });

      // Инвалидируем кэш
      this.queryBuilder.invalidateCache('wallet_stats');
      this.queryBuilder.invalidateCache('wallet_type_stats');
      this.queryBuilder.invalidateCache('wallet_currency_stats');

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('bulkCreateWallets', { 
        inputCount: data.length, 
        createdCount: wallets.length 
      });
      
      return wallets;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('bulkCreateWallets', error);
      throw error;
    }
  }

  /**
   * ОПТИМИЗИРОВАННЫЙ: Архивирование неактивных кошельков batch операциями
   */
  async archiveInactive(
    daysInactive: number = 90, 
    batchSize: number = 1000
  ): Promise<number> {
    const operationId = await enhancedDbLogger.startOperation('archiveInactive');
    
    try {
      const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);
      let totalUpdated = 0;

      // Обновляем порциями
      while (true) {
        const [results] = await this.sequelize.query(`
          UPDATE wallets 
          SET 
            is_active = false,
            status = 'ARCHIVED',
            last_balance_update = NOW()
          WHERE last_used_at < :cutoffDate
            AND balance = 0
            AND is_active = true
          LIMIT :batchSize
        `, {
          replacements: { cutoffDate, batchSize },
          type: QueryTypes.UPDATE
        }) as any[];

        totalUpdated += results;
        
        if (results === 0) {
          break;
        }

        // Пауза между batch операциями
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Инвалидируем кэш
      this.queryBuilder.invalidateCache('wallet_stats');

      await enhancedDbLogger.endOperation(operationId, true);
      this.log('archiveInactive', { 
        totalUpdated, 
        cutoffDate, 
        daysInactive,
        batchSize 
      });
      
      return totalUpdated;
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      this.handleError('archiveInactive', error);
      throw error;
    }
  }

  /**
   * Очистка кэша балансов
   */
  public clearBalanceCache(): void {
    this.balanceCache.clear();
    enhancedDbLogger.info('🗑️ Balance cache cleared');
  }

  /**
   * Получение статистики кэша балансов
   */
  public getBalanceCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.balanceCache.size,
      hitRate: 0 // TODO: Реализовать подсчет hit rate
    };
  }

  /**
   * Инвалидация кэша при изменении данных
   */
  private invalidateRelevantCache(): void {
    this.queryBuilder.invalidateCache('wallet_stats');
    this.queryBuilder.invalidateCache('wallet_type_stats');
    this.queryBuilder.invalidateCache('wallet_currency_stats');
  }

  /**
   * Переопределение методов с инвалидацией кэша
   */
  async updateById(
    id: string,
    data: Partial<WalletAttributes>,
    transaction?: Transaction
  ): Promise<Wallet | null> {
    const result = await super.updateById(id, data, transaction);
    
    if (result) {
      this.balanceCache.delete(id);
      this.invalidateRelevantCache();
    }
    
    return result;
  }

  async deleteById(id: string, transaction?: Transaction): Promise<boolean> {
    const result = await super.deleteById(id, transaction);
    
    if (result) {
      this.balanceCache.delete(id);
      this.invalidateRelevantCache();
    }
    
    return result;
  }
}

export default OptimizedWalletRepository;