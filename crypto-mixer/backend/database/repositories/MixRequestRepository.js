const BaseRepository = require('./BaseRepository');
const { MixRequest } = require('../models');
const { Op } = require('sequelize');
const logger = require('../../utils/logger');

class MixRequestRepository extends BaseRepository {
  constructor() {
    super(MixRequest);
  }

  async findByStatus(status, options = {}) {
    try {
      return await this.findAll({
        where: { status },
        ...options
      });
    } catch (error) {
      logger.error(`Error finding mix requests by status ${status}:`, error);
      throw error;
    }
  }

  async findPendingRequests(options = {}) {
    try {
      return await this.findAll({
        where: {
          status: {
            [Op.in]: ['pending', 'processing']
          }
        },
        order: [['createdAt', 'ASC']],
        ...options
      });
    } catch (error) {
      logger.error('Error finding pending mix requests:', error);
      throw error;
    }
  }

  async findByAddressAndCurrency(inputAddress, currency, options = {}) {
    try {
      return await this.findAll({
        where: {
          inputAddress,
          currency
        },
        ...options
      });
    } catch (error) {
      logger.error(`Error finding mix requests by address ${inputAddress} and currency ${currency}:`, error);
      throw error;
    }
  }

  async updateStatus(id, status, metadata = {}, options = {}) {
    try {
      const updateData = {
        status,
        updatedAt: new Date()
      };

      if (Object.keys(metadata).length > 0) {
        updateData.metadata = metadata;
      }

      return await this.update(id, updateData, options);
    } catch (error) {
      logger.error(`Error updating mix request status for ID ${id}:`, error);
      throw error;
    }
  }

  async findExpiredRequests(timeoutMinutes = 60, options = {}) {
    try {
      const expiredTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      
      return await this.findAll({
        where: {
          status: {
            [Op.in]: ['pending', 'processing']
          },
          createdAt: {
            [Op.lt]: expiredTime
          }
        },
        ...options
      });
    } catch (error) {
      logger.error('Error finding expired mix requests:', error);
      throw error;
    }
  }

  async getStatsByPeriod(startDate, endDate, options = {}) {
    try {
      const stats = await this.model.findAll({
        attributes: [
          'status',
          'currency',
          [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'count'],
          [this.sequelize.fn('SUM', this.sequelize.col('inputAmount')), 'totalAmount']
        ],
        where: {
          createdAt: {
            [Op.between]: [startDate, endDate]
          }
        },
        group: ['status', 'currency'],
        ...options
      });

      return stats;
    } catch (error) {
      logger.error('Error getting mix request statistics:', error);
      throw error;
    }
  }
}

module.exports = new MixRequestRepository();