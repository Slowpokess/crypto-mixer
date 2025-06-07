import { Transaction, Op } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { MixRequest, MixRequestAttributes, MixRequestCreationAttributes } from '../models/MixRequest';
import { OutputTransaction } from '../models/OutputTransaction';
import { DepositAddress } from '../models/DepositAddress';
import { AuditLog } from '../models/AuditLog';
import { CurrencyType, MixRequestStatus } from '../types';

/**
 * Репозиторий для работы с запросами микширования
 */
export class MixRequestRepository extends BaseRepository<MixRequest> {
  constructor(model: typeof MixRequest) {
    super(model);
  }

  /**
   * Создание нового запроса микширования с полной инициализацией
   */
  async createMixRequest(
    data: MixRequestCreationAttributes,
    transaction?: Transaction
  ): Promise<MixRequest> {
    try {
      this.validateData(data);
      
      const mixRequest = await this.create(data, transaction);
      
      // Логируем создание
      await AuditLog.logAction({
        level: 'INFO',
        action: 'MIX_REQUEST_CREATED',
        message: `Mix request created for ${data.inputAmount} ${data.currency}`,
        mixRequestId: mixRequest.id,
        details: {
          currency: data.currency,
          amount: data.inputAmount,
          outputAddresses: data.outputAddresses
        }
      });

      this.log('createMixRequest', { id: mixRequest.id, currency: data.currency });
      return mixRequest;
    } catch (error) {
      this.handleError('createMixRequest', error);
    }
  }

  /**
   * Поиск запросов по статусу
   */
  async findByStatus(status: MixRequestStatus): Promise<MixRequest[]> {
    try {
      return await this.findAll({ status }, {
        include: [
          { model: DepositAddress, as: 'depositAddress' },
          { model: OutputTransaction, as: 'outputTransactions' }
        ],
        order: [['createdAt', 'DESC']]
      });
    } catch (error) {
      this.handleError('findByStatus', error);
    }
  }

  /**
   * Поиск активных запросов по валюте
   */
  async findActiveByCurrency(currency: CurrencyType): Promise<MixRequest[]> {
    try {
      return await this.findAll({
        currency,
        status: ['PENDING', 'DEPOSITED', 'POOLING', 'MIXING']
      }, {
        include: [
          { model: DepositAddress, as: 'depositAddress' },
          { model: OutputTransaction, as: 'outputTransactions' }
        ],
        order: [['createdAt', 'ASC']]
      });
    } catch (error) {
      this.handleError('findActiveByCurrency', error);
    }
  }

  /**
   * Поиск запросов готовых к обработке
   */
  async findReadyForProcessing(): Promise<MixRequest[]> {
    try {
      return await this.findAll({
        status: 'DEPOSITED',
        [Op.and]: [
          { inputAmount: { [Op.gt]: 0 } },
          { currency: { [Op.in]: ['BTC', 'ETH', 'USDT', 'SOL'] } }
        ]
      }, {
        include: [
          { 
            model: DepositAddress, 
            as: 'depositAddress',
            where: { used: true }
          }
        ],
        order: [['depositConfirmedAt', 'ASC']]
      });
    } catch (error) {
      this.handleError('findReadyForProcessing', error);
    }
  }

  /**
   * Поиск просроченных запросов
   */
  async findExpired(): Promise<MixRequest[]> {
    try {
      const expirationTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 часа назад
      
      return await this.findAll({
        status: ['PENDING', 'DEPOSITED'],
        createdAt: { [Op.lt]: expirationTime }
      }, {
        include: [
          { model: DepositAddress, as: 'depositAddress' },
          { model: OutputTransaction, as: 'outputTransactions' }
        ]
      });
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Обновление статуса запроса с логированием
   */
  async updateStatus(
    id: string, 
    status: MixRequestStatus, 
    additionalData: Partial<MixRequestAttributes> = {},
    transaction?: Transaction
  ): Promise<MixRequest | null> {
    try {
      const mixRequest = await this.findById(id);
      if (!mixRequest) {
        throw new Error(`Mix request with ID ${id} not found`);
      }

      const oldStatus = mixRequest.status;
      const updateData = { status, ...additionalData };
      
      await mixRequest.update(updateData, { transaction });

      // Логируем изменение статуса
      await AuditLog.logAction({
        level: 'INFO',
        action: 'MIX_REQUEST_STATUS_CHANGED',
        message: `Mix request status changed from ${oldStatus} to ${status}`,
        mixRequestId: id,
        oldValues: { status: oldStatus },
        newValues: { status },
        details: additionalData
      });

      this.log('updateStatus', { id, oldStatus, newStatus: status });
      return mixRequest;
    } catch (error) {
      this.handleError('updateStatus', error);
    }
  }

  /**
   * Получение полной информации о запросе
   */
  async getFullDetails(id: string): Promise<MixRequest | null> {
    try {
      return await this.findById(id, {
        include: [
          { 
            model: DepositAddress, 
            as: 'depositAddress',
            include: [{ model: require('../models').MonitoredAddress, as: 'monitoredAddress' }]
          },
          { 
            model: OutputTransaction, 
            as: 'outputTransactions',
            order: [['outputIndex', 'ASC']]
          },
          { 
            model: AuditLog, 
            as: 'auditLogs',
            order: [['createdAt', 'DESC']],
            limit: 20
          }
        ]
      });
    } catch (error) {
      this.handleError('getFullDetails', error);
    }
  }

  /**
   * Статистика по запросам микширования
   */
  async getStatistics(
    startDate?: Date,
    endDate?: Date,
    currency?: CurrencyType
  ): Promise<{
    total: number;
    byStatus: Record<MixRequestStatus, number>;
    byCurrency: Record<CurrencyType, number>;
    totalAmount: Record<CurrencyType, number>;
    averageAmount: Record<CurrencyType, number>;
    successRate: number;
  }> {
    try {
      const whereCondition: any = {};
      
      if (startDate && endDate) {
        whereCondition.createdAt = {
          [Op.between]: [startDate, endDate]
        };
      }
      
      if (currency) {
        whereCondition.currency = currency;
      }

      const allRequests = await this.findAll(whereCondition);
      
      const stats = {
        total: allRequests.length,
        byStatus: {} as Record<MixRequestStatus, number>,
        byCurrency: {} as Record<CurrencyType, number>,
        totalAmount: {} as Record<CurrencyType, number>,
        averageAmount: {} as Record<CurrencyType, number>,
        successRate: 0
      };

      // Подсчитываем статистику
      allRequests.forEach(request => {
        // По статусу
        stats.byStatus[request.status] = (stats.byStatus[request.status] || 0) + 1;
        
        // По валюте
        stats.byCurrency[request.currency] = (stats.byCurrency[request.currency] || 0) + 1;
        
        // Общая сумма
        stats.totalAmount[request.currency] = (stats.totalAmount[request.currency] || 0) + request.inputAmount;
      });

      // Средняя сумма
      Object.keys(stats.totalAmount).forEach(curr => {
        const currency = curr as CurrencyType;
        stats.averageAmount[currency] = stats.totalAmount[currency] / stats.byCurrency[currency];
      });

      // Процент успешности
      const completed = stats.byStatus['COMPLETED'] || 0;
      const total = stats.total;
      stats.successRate = total > 0 ? (completed / total) * 100 : 0;

      this.log('getStatistics', stats);
      return stats;
    } catch (error) {
      this.handleError('getStatistics', error);
    }
  }

  /**
   * Поиск запросов с фильтрацией
   */
  async findWithFilters(filters: {
    currency?: CurrencyType;
    status?: MixRequestStatus | MixRequestStatus[];
    minAmount?: number;
    maxAmount?: number;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    rows: MixRequest[];
    count: number;
    totalPages: number;
    currentPage: number;
  }> {
    try {
      const where: any = {};
      
      if (filters.currency) where.currency = filters.currency;
      if (filters.status) {
        where.status = Array.isArray(filters.status) ? 
          { [Op.in]: filters.status } : filters.status;
      }
      if (filters.minAmount) where.inputAmount = { [Op.gte]: filters.minAmount };
      if (filters.maxAmount) {
        where.inputAmount = where.inputAmount ? 
          { ...where.inputAmount, [Op.lte]: filters.maxAmount } : 
          { [Op.lte]: filters.maxAmount };
      }
      if (filters.startDate && filters.endDate) {
        where.createdAt = { [Op.between]: [filters.startDate, filters.endDate] };
      }

      return await this.findAndCountAll(
        where,
        filters.page || 1,
        filters.limit || 20,
        {
          include: [
            { model: DepositAddress, as: 'depositAddress' },
            { model: OutputTransaction, as: 'outputTransactions' }
          ],
          order: [['createdAt', 'DESC']]
        }
      );
    } catch (error) {
      this.handleError('findWithFilters', error);
    }
  }

  /**
   * Подтверждение депозита
   */
  async confirmDeposit(
    id: string,
    txid: string,
    blockHeight: number,
    transaction?: Transaction
  ): Promise<MixRequest | null> {
    try {
      const updateData = {
        status: 'DEPOSITED' as MixRequestStatus,
        depositTxid: txid,
        depositBlockHeight: blockHeight,
        depositConfirmedAt: new Date()
      };

      const mixRequest = await this.updateById(id, updateData, transaction);
      
      if (mixRequest) {
        await AuditLog.logAction({
          level: 'INFO',
          action: 'DEPOSIT_CONFIRMED',
          message: `Deposit confirmed for mix request ${id}`,
          mixRequestId: id,
          details: { txid, blockHeight }
        });
      }

      return mixRequest;
    } catch (error) {
      this.handleError('confirmDeposit', error);
    }
  }

  /**
   * Завершение микширования
   */
  async completeMixing(
    id: string,
    outputTxids: string[],
    transaction?: Transaction
  ): Promise<MixRequest | null> {
    try {
      const updateData = {
        status: 'COMPLETED' as MixRequestStatus,
        completedAt: new Date()
      };

      const mixRequest = await this.updateById(id, updateData, transaction);
      
      if (mixRequest) {
        await AuditLog.logAction({
          level: 'INFO',
          action: 'MIXING_COMPLETED',
          message: `Mixing completed for mix request ${id}`,
          mixRequestId: id,
          details: { outputTxids }
        });
      }

      return mixRequest;
    } catch (error) {
      this.handleError('completeMixing', error);
    }
  }

  /**
   * Отмена запроса микширования
   */
  async cancelMixRequest(
    id: string,
    reason: string,
    transaction?: Transaction
  ): Promise<MixRequest | null> {
    try {
      const updateData = {
        status: 'CANCELLED' as MixRequestStatus,
        errorMessage: reason
      };

      const mixRequest = await this.updateById(id, updateData, transaction);
      
      if (mixRequest) {
        await AuditLog.logAction({
          level: 'WARN',
          action: 'MIX_REQUEST_CANCELLED',
          message: `Mix request cancelled: ${reason}`,
          mixRequestId: id,
          details: { reason }
        });
      }

      return mixRequest;
    } catch (error) {
      this.handleError('cancelMixRequest', error);
    }
  }

  /**
   * Очистка старых завершенных запросов
   */
  async cleanupOldRequests(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      const deletedCount = await this.deleteWhere({
        status: ['COMPLETED', 'CANCELLED'],
        createdAt: { [Op.lt]: cutoffDate }
      });

      this.log('cleanupOldRequests', { deletedCount, cutoffDate });
      return deletedCount;
    } catch (error) {
      this.handleError('cleanupOldRequests', error);
    }
  }
}

export default MixRequestRepository;