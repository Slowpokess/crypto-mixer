const BaseRepository = require('./BaseRepository');
const { Wallet } = require('../models');
const { Op } = require('sequelize');
const logger = require('../../utils/logger');

class WalletRepository extends BaseRepository {
  constructor() {
    super(Wallet);
  }

  async findByCurrency(currency, options = {}) {
    try {
      return await this.findAll({
        where: { currency },
        ...options
      });
    } catch (error) {
      logger.error(`Error finding wallets by currency ${currency}:`, error);
      throw error;
    }
  }

  async findAvailableWallets(currency, minBalance = 0, options = {}) {
    try {
      return await this.findAll({
        where: {
          currency,
          status: 'active',
          balance: {
            [Op.gte]: minBalance
          }
        },
        order: [['balance', 'DESC']],
        ...options
      });
    } catch (error) {
      logger.error(`Error finding available wallets for currency ${currency}:`, error);
      throw error;
    }
  }

  async updateBalance(id, newBalance, options = {}) {
    try {
      return await this.update(id, {
        balance: newBalance,
        lastBalanceUpdate: new Date()
      }, options);
    } catch (error) {
      logger.error(`Error updating wallet balance for ID ${id}:`, error);
      throw error;
    }
  }

  async findByAddress(address, options = {}) {
    try {
      return await this.findOne({ address }, options);
    } catch (error) {
      logger.error(`Error finding wallet by address ${address}:`, error);
      throw error;
    }
  }

  async getTotalBalancesByCurrency(options = {}) {
    try {
      const balances = await this.model.findAll({
        attributes: [
          'currency',
          [this.sequelize.fn('SUM', this.sequelize.col('balance')), 'totalBalance'],
          [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'walletCount']
        ],
        where: {
          status: 'active'
        },
        group: ['currency'],
        ...options
      });

      return balances;
    } catch (error) {
      logger.error('Error getting total balances by currency:', error);
      throw error;
    }
  }

  async findLowBalanceWallets(threshold = 0.01, options = {}) {
    try {
      return await this.findAll({
        where: {
          status: 'active',
          balance: {
            [Op.lt]: threshold
          }
        },
        ...options
      });
    } catch (error) {
      logger.error('Error finding low balance wallets:', error);
      throw error;
    }
  }
}

module.exports = new WalletRepository();