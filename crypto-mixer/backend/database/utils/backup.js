const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const config = require('../../config/database');

class BackupManager {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../../../backups');
    this.retention = parseInt(process.env.BACKUP_RETENTION_DAYS) || 7;
  }

  async ensureBackupDirectory() {
    try {
      await fs.access(this.backupDir);
    } catch (error) {
      await fs.mkdir(this.backupDir, { recursive: true });
      logger.info(`Created backup directory: ${this.backupDir}`);
    }
  }

  async createBackup(environment = process.env.NODE_ENV || 'development') {
    try {
      await this.ensureBackupDirectory();
      
      const dbConfig = config[environment];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `backup-${dbConfig.database}-${timestamp}.sql`;
      const backupPath = path.join(this.backupDir, backupFileName);

      logger.info(`Starting database backup to: ${backupPath}`);

      const pgDumpCommand = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} --no-password --verbose --clean --no-acl --no-owner -f ${backupPath}`;

      process.env.PGPASSWORD = dbConfig.password;
      
      execSync(pgDumpCommand, { 
        stdio: 'inherit',
        env: { ...process.env, PGPASSWORD: dbConfig.password }
      });

      delete process.env.PGPASSWORD;

      const stats = await fs.stat(backupPath);
      logger.info(`Database backup completed successfully. Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      await this.cleanupOldBackups();

      return {
        success: true,
        backupPath,
        size: stats.size,
        timestamp: new Date()
      };

    } catch (error) {
      delete process.env.PGPASSWORD;
      logger.error('Database backup failed:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath, environment = process.env.NODE_ENV || 'development') {
    try {
      const dbConfig = config[environment];
      
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      if (!backupExists) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      logger.info(`Starting database restore from: ${backupPath}`);

      const psqlCommand = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} --no-password -f ${backupPath}`;

      process.env.PGPASSWORD = dbConfig.password;
      
      execSync(psqlCommand, { 
        stdio: 'inherit',
        env: { ...process.env, PGPASSWORD: dbConfig.password }
      });

      delete process.env.PGPASSWORD;

      logger.info('Database restore completed successfully');

      return {
        success: true,
        restoredFrom: backupPath,
        timestamp: new Date()
      };

    } catch (error) {
      delete process.env.PGPASSWORD;
      logger.error('Database restore failed:', error);
      throw error;
    }
  }

  async listBackups() {
    try {
      await this.ensureBackupDirectory();
      
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(file => file.startsWith('backup-') && file.endsWith('.sql'));
      
      const backups = await Promise.all(
        backupFiles.map(async (file) => {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          
          return {
            filename: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
      );

      return backups.sort((a, b) => b.created - a.created);

    } catch (error) {
      logger.error('Failed to list backups:', error);
      throw error;
    }
  }

  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      const cutoffDate = new Date(Date.now() - this.retention * 24 * 60 * 60 * 1000);
      
      const oldBackups = backups.filter(backup => backup.created < cutoffDate);
      
      for (const backup of oldBackups) {
        await fs.unlink(backup.path);
        logger.info(`Deleted old backup: ${backup.filename}`);
      }

      if (oldBackups.length > 0) {
        logger.info(`Cleaned up ${oldBackups.length} old backup(s)`);
      }

    } catch (error) {
      logger.error('Failed to cleanup old backups:', error);
    }
  }

  async getBackupStats() {
    try {
      const backups = await this.listBackups();
      
      if (backups.length === 0) {
        return {
          totalBackups: 0,
          totalSize: 0,
          latestBackup: null,
          oldestBackup: null
        };
      }

      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      
      return {
        totalBackups: backups.length,
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        latestBackup: backups[0],
        oldestBackup: backups[backups.length - 1],
        retentionDays: this.retention
      };

    } catch (error) {
      logger.error('Failed to get backup stats:', error);
      throw error;
    }
  }
}

module.exports = new BackupManager();