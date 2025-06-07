"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletRepository = void 0;
const sequelize_1 = require("sequelize");
const BaseRepository_1 = require("./BaseRepository");
/**
 * Репозиторий для работы с кошельками
 */
class WalletRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    /**
     * Создание нового кошелька с инициализацией
     */
    async createWallet(data, transaction) {
        try {
            this.validateData(data);
            // Проверяем уникальность адреса
            const existingWallet = await this.findByAddress(data.address);
            if (existingWallet) {
                throw new Error(`Wallet with address ${data.address} already exists`);
            }
            const wallet = await this.create(data, transaction);
            this.log('createWallet', { id: wallet.id, currency: data.currency, type: data.type });
            return wallet;
        }
        catch (error) {
            this.handleError('createWallet', error);
        }
    }
    /**
     * Поиск кошелька по адресу
     */
    async findByAddress(address) {
        try {
            return await this.findOne({ address });
        }
        catch (error) {
            this.handleError('findByAddress', error);
        }
    }
    /**
     * Поиск кошельков по валюте
     */
    async findByCurrency(currency) {
        try {
            return await this.findAll({ currency }, {
                order: [['createdAt', 'DESC']]
            });
        }
        catch (error) {
            this.handleError('findByCurrency', error);
        }
    }
    /**
     * Поиск кошельков по типу
     */
    async findByType(type) {
        try {
            return await this.findAll({ type }, {
                order: [['balance', 'DESC']]
            });
        }
        catch (error) {
            this.handleError('findByType', error);
        }
    }
    /**
     * Поиск активных кошельков
     */
    async findActive() {
        try {
            return await this.findAll({
                isActive: true,
                status: 'ACTIVE'
            }, {
                order: [['lastUsedAt', 'DESC']]
            });
        }
        catch (error) {
            this.handleError('findActive', error);
        }
    }
    /**
     * Поиск кошельков с достаточным балансом
     */
    async findWithSufficientBalance(currency, minAmount) {
        try {
            return await this.findAll({
                currency,
                balance: { [sequelize_1.Op.gte]: minAmount },
                isActive: true,
                status: 'ACTIVE'
            }, {
                order: [['balance', 'DESC']]
            });
        }
        catch (error) {
            this.handleError('findWithSufficientBalance', error);
        }
    }
    /**
     * Обновление баланса кошелька
     */
    async updateBalance(id, newBalance, transaction) {
        try {
            const wallet = await this.findById(id);
            if (!wallet) {
                throw new Error(`Wallet with ID ${id} not found`);
            }
            const oldBalance = wallet.balance;
            await wallet.update({
                balance: newBalance,
                lastBalanceUpdate: new Date(),
                lastUsedAt: new Date()
            }, { transaction });
            this.log('updateBalance', {
                id,
                oldBalance,
                newBalance,
                change: newBalance - oldBalance
            });
            return wallet;
        }
        catch (error) {
            this.handleError('updateBalance', error);
        }
    }
    /**
     * Добавление к балансу
     */
    async addToBalance(id, amount, transaction) {
        try {
            const wallet = await this.findById(id);
            if (!wallet) {
                throw new Error(`Wallet with ID ${id} not found`);
            }
            const newBalance = wallet.balance + amount;
            return await this.updateBalance(id, newBalance, transaction);
        }
        catch (error) {
            this.handleError('addToBalance', error);
        }
    }
    /**
     * Списание с баланса
     */
    async subtractFromBalance(id, amount, transaction) {
        try {
            const wallet = await this.findById(id);
            if (!wallet) {
                throw new Error(`Wallet with ID ${id} not found`);
            }
            if (wallet.balance < amount) {
                throw new Error(`Insufficient balance. Current: ${wallet.balance}, Required: ${amount}`);
            }
            const newBalance = wallet.balance - amount;
            return await this.updateBalance(id, newBalance, transaction);
        }
        catch (error) {
            this.handleError('subtractFromBalance', error);
        }
    }
    /**
     * Блокировка кошелька
     */
    async lockWallet(id, reason, transaction) {
        try {
            return await this.updateById(id, {
                isLocked: true,
                lockedAt: new Date(),
                lockReason: reason || 'Manual lock'
            }, transaction);
        }
        catch (error) {
            this.handleError('lockWallet', error);
        }
    }
    /**
     * Разблокировка кошелька
     */
    async unlockWallet(id, transaction) {
        try {
            return await this.updateById(id, {
                isLocked: false,
                lockedAt: null,
                lockReason: null
            }, transaction);
        }
        catch (error) {
            this.handleError('unlockWallet', error);
        }
    }
    /**
     * Поиск кошельков для ротации
     */
    async findForRotation() {
        try {
            const rotationThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 дней назад
            return await this.findAll({
                isActive: true,
                status: 'ACTIVE',
                type: ['HOT', 'POOL'],
                lastUsedAt: { [sequelize_1.Op.lt]: rotationThreshold }
            }, {
                order: [['lastUsedAt', 'ASC']]
            });
        }
        catch (error) {
            this.handleError('findForRotation', error);
        }
    }
    /**
     * Статистика по кошелькам
     */
    async getStatistics() {
        try {
            const allWallets = await this.findAll();
            const stats = {
                total: allWallets.length,
                byType: {},
                byCurrency: {},
                totalBalance: {},
                activeWallets: 0,
                lockedWallets: 0
            };
            allWallets.forEach(wallet => {
                // По типу
                stats.byType[wallet.type] = (stats.byType[wallet.type] || 0) + 1;
                // По валюте
                stats.byCurrency[wallet.currency] = (stats.byCurrency[wallet.currency] || 0) + 1;
                // Общий баланс
                stats.totalBalance[wallet.currency] = (stats.totalBalance[wallet.currency] || 0) + wallet.balance;
                // Активные и заблокированные
                if (wallet.isActive)
                    stats.activeWallets++;
                if (wallet.isLocked)
                    stats.lockedWallets++;
            });
            this.log('getStatistics', stats);
            return stats;
        }
        catch (error) {
            this.handleError('getStatistics', error);
        }
    }
    /**
     * Поиск оптимального кошелька для вывода
     */
    async findOptimalForWithdrawal(currency, amount) {
        try {
            // Ищем кошелек с достаточным балансом, предпочитая те, что редко используются
            const wallets = await this.findAll({
                currency,
                balance: { [sequelize_1.Op.gte]: amount },
                isActive: true,
                isLocked: false,
                status: 'ACTIVE',
                type: ['HOT', 'POOL']
            }, {
                order: [
                    ['balance', 'DESC'], // Предпочитаем кошельки с большим балансом
                    ['lastUsedAt', 'ASC'] // И те, что давно не использовались
                ]
            });
            return wallets[0] || null;
        }
        catch (error) {
            this.handleError('findOptimalForWithdrawal', error);
        }
    }
    /**
     * Обновление статистики использования
     */
    async updateUsageStats(id, transaction) {
        try {
            const wallet = await this.findById(id);
            if (!wallet) {
                throw new Error(`Wallet with ID ${id} not found`);
            }
            await wallet.update({
                usageCount: wallet.usageCount + 1,
                lastUsedAt: new Date()
            }, { transaction });
            return wallet;
        }
        catch (error) {
            this.handleError('updateUsageStats', error);
        }
    }
    /**
     * Поиск кошельков для консолидации
     */
    async findForConsolidation(currency) {
        try {
            // Ищем кошельки с небольшими балансами для консолидации
            return await this.findAll({
                currency,
                balance: {
                    [sequelize_1.Op.gt]: 0,
                    [sequelize_1.Op.lt]: 1 // Балансы меньше 1 единицы валюты
                },
                isActive: true,
                type: ['HOT', 'POOL']
            }, {
                order: [['balance', 'ASC']]
            });
        }
        catch (error) {
            this.handleError('findForConsolidation', error);
        }
    }
    /**
     * Получение истории транзакций кошелька
     */
    async getTransactionHistory(id, limit = 50) {
        try {
            // Эмуляция получения истории транзакций
            // В реальной реализации здесь будет запрос к блокчейн API или БД транзакций
            const wallet = await this.findById(id);
            if (!wallet) {
                throw new Error(`Wallet with ID ${id} not found`);
            }
            // Возвращаем пустой массив как заглушку
            // TODO: Реализовать интеграцию с блокчейн API
            return [];
        }
        catch (error) {
            this.handleError('getTransactionHistory', error);
        }
    }
    /**
     * Архивирование неактивных кошельков
     */
    async archiveInactive(daysInactive = 90) {
        try {
            const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);
            const updatedCount = await this.updateWhere({
                lastUsedAt: { [sequelize_1.Op.lt]: cutoffDate },
                balance: 0,
                isActive: true
            }, {
                isActive: false,
                status: 'ARCHIVED'
            });
            this.log('archiveInactive', { updatedCount, cutoffDate });
            return updatedCount;
        }
        catch (error) {
            this.handleError('archiveInactive', error);
        }
    }
}
exports.WalletRepository = WalletRepository;
exports.default = WalletRepository;
//# sourceMappingURL=WalletRepository.js.map