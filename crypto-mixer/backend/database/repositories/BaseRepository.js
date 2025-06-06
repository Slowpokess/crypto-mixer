const DatabaseManager = require('../DatabaseManager');
const logger = require('../../utils/logger');

class BaseRepository {
  constructor(model) {
    this.model = model;
    this.sequelize = DatabaseManager.getSequelize();
  }

  async create(data, options = {}) {
    try {
      const transaction = options.transaction || await this.sequelize.transaction();
      const autoCommit = !options.transaction;
      
      const result = await this.model.create(data, { 
        transaction,
        ...options 
      });
      
      if (autoCommit) {
        await transaction.commit();
      }
      
      logger.info(`${this.model.name} created with ID: ${result.id}`);
      return result;
      
    } catch (error) {
      if (options.transaction) {
        await options.transaction.rollback();
      }
      logger.error(`Error creating ${this.model.name}:`, error);
      throw error;
    }
  }

  async findById(id, options = {}) {
    try {
      const result = await this.model.findByPk(id, options);
      
      if (!result) {
        logger.warn(`${this.model.name} not found with ID: ${id}`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Error finding ${this.model.name} by ID ${id}:`, error);
      throw error;
    }
  }

  async findOne(where, options = {}) {
    try {
      return await this.model.findOne({
        where,
        ...options
      });
    } catch (error) {
      logger.error(`Error finding one ${this.model.name}:`, error);
      throw error;
    }
  }

  async findAll(options = {}) {
    try {
      const {
        where = {},
        limit = 100,
        offset = 0,
        order = [['createdAt', 'DESC']],
        ...otherOptions
      } = options;

      return await this.model.findAll({
        where,
        limit,
        offset,
        order,
        ...otherOptions
      });
    } catch (error) {
      logger.error(`Error finding all ${this.model.name}:`, error);
      throw error;
    }
  }

  async findAndCountAll(options = {}) {
    try {
      const {
        where = {},
        limit = 100,
        offset = 0,
        order = [['createdAt', 'DESC']],
        ...otherOptions
      } = options;

      return await this.model.findAndCountAll({
        where,
        limit,
        offset,
        order,
        ...otherOptions
      });
    } catch (error) {
      logger.error(`Error finding and counting ${this.model.name}:`, error);
      throw error;
    }
  }

  async update(id, data, options = {}) {
    try {
      const transaction = options.transaction || await this.sequelize.transaction();
      const autoCommit = !options.transaction;
      
      const [updatedCount, updatedRows] = await this.model.update(data, {
        where: { id },
        returning: true,
        transaction,
        ...options
      });
      
      if (autoCommit) {
        await transaction.commit();
      }
      
      if (updatedCount === 0) {
        logger.warn(`${this.model.name} not found for update with ID: ${id}`);
        return null;
      }
      
      logger.info(`${this.model.name} updated with ID: ${id}`);
      return updatedRows[0];
      
    } catch (error) {
      if (options.transaction) {
        await options.transaction.rollback();
      }
      logger.error(`Error updating ${this.model.name} with ID ${id}:`, error);
      throw error;
    }
  }

  async delete(id, options = {}) {
    try {
      const transaction = options.transaction || await this.sequelize.transaction();
      const autoCommit = !options.transaction;
      
      const deletedCount = await this.model.destroy({
        where: { id },
        transaction,
        ...options
      });
      
      if (autoCommit) {
        await transaction.commit();
      }
      
      if (deletedCount === 0) {
        logger.warn(`${this.model.name} not found for deletion with ID: ${id}`);
        return false;
      }
      
      logger.info(`${this.model.name} deleted with ID: ${id}`);
      return true;
      
    } catch (error) {
      if (options.transaction) {
        await options.transaction.rollback();
      }
      logger.error(`Error deleting ${this.model.name} with ID ${id}:`, error);
      throw error;
    }
  }
}