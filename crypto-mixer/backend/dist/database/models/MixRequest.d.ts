import { Sequelize, Optional } from 'sequelize';
import { CurrencyType, MixRequestStatus, OutputConfiguration } from '../types';
import { EncryptedModelBase } from '../utils/EncryptedModelBase';
export interface MixRequestAttributes {
    id: string;
    sessionId: string;
    currency: CurrencyType;
    inputAmount: number;
    outputAmount: number;
    feeAmount: number;
    feePercentage: number;
    status: MixRequestStatus;
    inputAddress: string;
    outputAddresses: OutputConfiguration[];
    delayMinutes: number;
    expiresAt: Date;
    completedAt?: Date;
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    transactionCount: number;
    anonymitySet: number;
    riskScore: number;
    notes?: string;
    anonymityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    mixingAlgorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH';
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface MixRequestCreationAttributes extends Optional<MixRequestAttributes, 'id' | 'outputAmount' | 'feeAmount' | 'status' | 'transactionCount' | 'anonymitySet' | 'riskScore' | 'createdAt' | 'updatedAt'> {
}
/**
 * Модель запроса на микширование с поддержкой шифрования чувствительных данных
 * Центральная таблица для отслеживания всех запросов на микширование
 */
export declare class MixRequest extends EncryptedModelBase<MixRequestAttributes, MixRequestCreationAttributes> implements MixRequestAttributes {
    id: string;
    sessionId: string;
    currency: CurrencyType;
    inputAmount: number;
    outputAmount: number;
    feeAmount: number;
    feePercentage: number;
    status: MixRequestStatus;
    inputAddress: string;
    outputAddresses: OutputConfiguration[];
    delayMinutes: number;
    expiresAt: Date;
    completedAt?: Date;
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    transactionCount: number;
    anonymitySet: number;
    riskScore: number;
    notes?: string;
    anonymityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    mixingAlgorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH';
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deletedAt?: Date;
    /**
     * Проверка истечения срока запроса
     */
    isExpired(): boolean;
    /**
     * Проверка завершенности запроса
     */
    isCompleted(): boolean;
    /**
     * Проверка возможности отмены
     */
    canBeCancelled(): boolean;
    /**
     * Получение общей суммы вывода
     */
    getTotalOutputAmount(): number;
    /**
     * Расчет комиссии
     */
    calculateFee(): number;
    /**
     * Обновление статуса
     */
    updateStatus(newStatus: MixRequestStatus, notes?: string): Promise<void>;
    /**
     * Добавление адреса вывода
     */
    addOutputAddress(address: string, percentage: number, delayMinutes?: number): void;
    /**
     * Валидация адресов вывода
     */
    validateOutputAddresses(): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Поиск запросов по статусу
     */
    static findByStatus(status: MixRequestStatus): Promise<MixRequest[]>;
    /**
     * Поиск активных запросов
     */
    static findActive(): Promise<MixRequest[]>;
    /**
     * Поиск истекших запросов
     */
    static findExpired(): Promise<MixRequest[]>;
    /**
     * Статистика по валютам
     */
    static getCurrencyStats(): Promise<Record<CurrencyType, any>>;
}
/**
 * Инициализация модели MixRequest с поддержкой шифрования
 */
export declare function initMixRequest(sequelize: Sequelize): typeof MixRequest;
/**
 * Расширенные методы для работы с зашифрованными данными
 */
export declare namespace MixRequestSecurity {
    /**
     * Массовое перешифровывание всех записей
     */
    function reencryptAllRecords(newKeyVersion?: string): Promise<number>;
    /**
     * Аудит шифрования для всех записей
     */
    function auditEncryption(): Promise<{
        total: number;
        encrypted: number;
        needsReencryption: number;
        keyVersions: string[];
    }>;
    /**
     * Поиск записей по зашифрованным полям (требует расшифровки)
     */
    function findByEncryptedField(fieldName: 'ipAddress' | 'userAgent' | 'referrer' | 'notes', searchValue: string): Promise<MixRequest[]>;
    /**
     * Экспорт зашифрованных данных для резервного копирования
     */
    function exportEncryptedData(recordId: string): Promise<Record<string, any>>;
}
export default MixRequest;
