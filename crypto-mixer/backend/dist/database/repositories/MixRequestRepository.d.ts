import { Transaction } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { MixRequest, MixRequestAttributes, MixRequestCreationAttributes } from '../models/MixRequest';
import { CurrencyType, MixRequestStatus } from '../types';
/**
 * Репозиторий для работы с запросами микширования
 */
export declare class MixRequestRepository extends BaseRepository<MixRequest> {
    constructor(model: typeof MixRequest);
    /**
     * Создание нового запроса микширования с полной инициализацией
     */
    createMixRequest(data: MixRequestCreationAttributes, transaction?: Transaction): Promise<MixRequest>;
    /**
     * Поиск запросов по статусу
     */
    findByStatus(status: MixRequestStatus): Promise<MixRequest[]>;
    /**
     * Поиск активных запросов по валюте
     */
    findActiveByCurrency(currency: CurrencyType): Promise<MixRequest[]>;
    /**
     * Поиск запросов готовых к обработке
     */
    findReadyForProcessing(): Promise<MixRequest[]>;
    /**
     * Поиск просроченных запросов
     */
    findExpired(): Promise<MixRequest[]>;
    /**
     * Обновление статуса запроса с логированием
     */
    updateStatus(id: string, status: MixRequestStatus, additionalData?: Partial<MixRequestAttributes>, transaction?: Transaction): Promise<MixRequest | null>;
    /**
     * Получение полной информации о запросе
     */
    getFullDetails(id: string): Promise<MixRequest | null>;
    /**
     * Статистика по запросам микширования
     */
    getStatistics(startDate?: Date, endDate?: Date, currency?: CurrencyType): Promise<{
        total: number;
        byStatus: Record<MixRequestStatus, number>;
        byCurrency: Record<CurrencyType, number>;
        totalAmount: Record<CurrencyType, number>;
        averageAmount: Record<CurrencyType, number>;
        successRate: number;
    }>;
    /**
     * Поиск запросов с фильтрацией
     */
    findWithFilters(filters: {
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
    }>;
    /**
     * Подтверждение депозита
     */
    confirmDeposit(id: string, txid: string, blockHeight: number, transaction?: Transaction): Promise<MixRequest | null>;
    /**
     * Завершение микширования
     */
    completeMixing(id: string, outputTxids: string[], transaction?: Transaction): Promise<MixRequest | null>;
    /**
     * Отмена запроса микширования
     */
    cancelMixRequest(id: string, reason: string, transaction?: Transaction): Promise<MixRequest | null>;
    /**
     * Очистка старых завершенных запросов
     */
    cleanupOldRequests(daysToKeep?: number): Promise<number>;
}
export default MixRequestRepository;
