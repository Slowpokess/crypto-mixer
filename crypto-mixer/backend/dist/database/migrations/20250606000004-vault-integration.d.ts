import { QueryInterface } from 'sequelize';
/**
 * Миграция для интеграции с Vault/HSM системой
 *
 * Изменения:
 * 1. Удаление encryptedPrivateKey из таблиц wallets и deposit_addresses
 * 2. Добавление vault_key_id, key_algorithm, is_hsm_key
 * 3. Создание таблицы для аудита ключей
 * 4. Добавление индексов для производительности
 */
export declare const up: (queryInterface: QueryInterface, Sequelize: any) => Promise<void>;
export declare const down: (queryInterface: QueryInterface, Sequelize: any) => Promise<void>;
