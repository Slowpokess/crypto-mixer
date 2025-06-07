#!/usr/bin/env npx ts-node
/**
 * CLI утилита для миграции чувствительных данных в зашифрованном виде
 */
declare class EncryptionMigrationCLI {
    private sequelize;
    private encryptionManager;
    private migrator;
    initialize(): Promise<void>;
    migrate(options: {
        dryRun: boolean;
        batchSize: number;
        table?: string;
    }): Promise<void>;
    status(): Promise<void>;
    rollback(options: {
        dryRun: boolean;
        table?: string;
    }): Promise<void>;
    testEncryption(): Promise<void>;
    cleanup(): Promise<void>;
}
export default EncryptionMigrationCLI;
