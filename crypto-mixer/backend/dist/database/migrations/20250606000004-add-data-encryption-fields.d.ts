import { QueryInterface } from 'sequelize';
/**
 * Миграция для добавления полей шифрования чувствительных данных
 * Добавляет зашифрованные версии существующих полей с чувствительной информацией
 */
export declare const up: (queryInterface: QueryInterface, Sequelize: any) => Promise<void>;
export declare const down: (queryInterface: QueryInterface, Sequelize: any) => Promise<void>;
