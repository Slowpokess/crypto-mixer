/**
 * Система управления миграциями базы данных
 * Обеспечивает версионирование схемы БД и безопасное применение изменений
 */

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

class MigrationManager {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.migrationsPath = __dirname;
    this.migrationTableName = 'schema_migrations';
  }

  /**
   * Инициализация таблицы миграций
   */
  async initializeMigrationTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.migrationTableName} (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        checksum VARCHAR(64),
        rollback_script TEXT
      );
    `;

    await this.sequelize.query(createTableQuery);
    console.log('✅ Таблица миграций инициализирована');
  }

  /**
   * Получение списка всех файлов миграций
   */
  getMigrationFiles() {
    const files = fs.readdirSync(this.migrationsPath)
      .filter(file => file.match(/^\d{14}-.*\.js$/) && file !== 'index.js')
      .sort();

    return files.map(file => {
      const version = file.split('-')[0];
      const name = file.replace(/^\d{14}-/, '').replace(/\.js$/, '');
      return {
        version,
        name,
        filename: file,
        filepath: path.join(this.migrationsPath, file)
      };
    });
  }

  /**
   * Получение примененных миграций
   */
  async getAppliedMigrations() {
    try {
      const [results] = await this.sequelize.query(
        `SELECT version, name, executed_at FROM ${this.migrationTableName} ORDER BY version`
      );
      return results;
    } catch (error) {
      // Если таблица не существует, возвращаем пустой массив
      return [];
    }
  }

  /**
   * Получение ожидающих применения миграций
   */
  async getPendingMigrations() {
    const allMigrations = this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    return allMigrations.filter(migration => !appliedVersions.has(migration.version));
  }

  /**
   * Выполнение миграции
   */
  async executeMigration(migration) {
    const startTime = Date.now();
    const transaction = await this.sequelize.transaction();

    try {
      console.log(`🔄 Выполняется миграция: ${migration.version} - ${migration.name}`);

      // Загрузка и выполнение миграции
      const migrationModule = require(migration.filepath);
      
      if (typeof migrationModule.up !== 'function') {
        throw new Error(`Миграция ${migration.filename} не содержит функцию up`);
      }

      // Выполнение миграции
      await migrationModule.up(this.sequelize.getQueryInterface(), Sequelize);

      // Вычисление времени выполнения
      const executionTime = Date.now() - startTime;

      // Запись в таблицу миграций
      await this.sequelize.query(`
        INSERT INTO ${this.migrationTableName} (version, name, execution_time_ms, checksum)
        VALUES (:version, :name, :executionTime, :checksum)
      `, {
        replacements: {
          version: migration.version,
          name: migration.name,
          executionTime: executionTime,
          checksum: this.calculateChecksum(migration.filepath)
        },
        transaction
      });

      await transaction.commit();
      console.log(`✅ Миграция ${migration.version} выполнена за ${executionTime}ms`);

    } catch (error) {
      await transaction.rollback();
      console.error(`❌ Ошибка выполнения миграции ${migration.version}:`, error);
      throw error;
    }
  }

  /**
   * Откат миграции
   */
  async rollbackMigration(migration) {
    const transaction = await this.sequelize.transaction();

    try {
      console.log(`🔄 Откат миграции: ${migration.version} - ${migration.name}`);

      // Загрузка миграции
      const migrationModule = require(migration.filepath);
      
      if (typeof migrationModule.down !== 'function') {
        throw new Error(`Миграция ${migration.filename} не содержит функцию down`);
      }

      // Выполнение отката
      await migrationModule.down(this.sequelize.getQueryInterface(), Sequelize);

      // Удаление записи из таблицы миграций
      await this.sequelize.query(`
        DELETE FROM ${this.migrationTableName} WHERE version = :version
      `, {
        replacements: { version: migration.version },
        transaction
      });

      await transaction.commit();
      console.log(`✅ Откат миграции ${migration.version} выполнен`);

    } catch (error) {
      await transaction.rollback();
      console.error(`❌ Ошибка отката миграции ${migration.version}:`, error);
      throw error;
    }
  }

  /**
   * Применение всех ожидающих миграций
   */
  async migrate() {
    await this.initializeMigrationTable();
    
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('✅ Все миграции уже применены');
      return;
    }

    console.log(`🔄 Найдено ${pendingMigrations.length} ожидающих миграций`);

    for (const migration of pendingMigrations) {
      await this.executeMigration(migration);
    }

    console.log('🎉 Все миграции успешно применены');
  }

  /**
   * Откат последней миграции
   */
  async rollback(steps = 1) {
    const appliedMigrations = await this.getAppliedMigrations();
    
    if (appliedMigrations.length === 0) {
      console.log('❌ Нет миграций для отката');
      return;
    }

    const migrationsToRollback = appliedMigrations
      .slice(-steps)
      .reverse(); // Откат в обратном порядке

    console.log(`🔄 Откат ${migrationsToRollback.length} миграций`);

    for (const appliedMigration of migrationsToRollback) {
      // Поиск файла миграции
      const migrationFile = this.getMigrationFiles()
        .find(m => m.version === appliedMigration.version);

      if (!migrationFile) {
        console.error(`❌ Файл миграции ${appliedMigration.version} не найден`);
        continue;
      }

      await this.rollbackMigration(migrationFile);
    }

    console.log('✅ Откат миграций завершен');
  }

  /**
   * Показать статус миграций
   */
  async status() {
    await this.initializeMigrationTable();
    
    const allMigrations = this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    console.log('\n📊 Статус миграций:');
    console.log('='.repeat(80));

    allMigrations.forEach(migration => {
      const isApplied = appliedVersions.has(migration.version);
      const status = isApplied ? '✅ Применена' : '⏳ Ожидает';
      const appliedInfo = isApplied 
        ? appliedMigrations.find(m => m.version === migration.version)
        : null;

      console.log(`${status} | ${migration.version} | ${migration.name}`);
      
      if (appliedInfo) {
        console.log(`         Применена: ${appliedInfo.executed_at}`);
      }
    });

    console.log('='.repeat(80));
    console.log(`Всего миграций: ${allMigrations.length}`);
    console.log(`Применено: ${appliedMigrations.length}`);
    console.log(`Ожидает: ${allMigrations.length - appliedMigrations.length}`);
  }

  /**
   * Создание новой миграции
   */
  createMigration(name) {
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, '');
    
    const filename = `${timestamp}-${name.replace(/\s+/g, '-').toLowerCase()}.js`;
    const filepath = path.join(this.migrationsPath, filename);

    const template = `/**
 * Миграция: ${name}
 * Создана: ${new Date().toISOString()}
 */

module.exports = {
  /**
   * Применение миграции
   */
  async up(queryInterface, Sequelize) {
    // Код миграции
    
  },

  /**
   * Откат миграции
   */
  async down(queryInterface, Sequelize) {
    // Код отката
    
  }
};
`;

    fs.writeFileSync(filepath, template);
    console.log(`✅ Создана миграция: ${filename}`);
    return filepath;
  }

  /**
   * Вычисление контрольной суммы файла миграции
   */
  calculateChecksum(filepath) {
    const crypto = require('crypto');
    const content = fs.readFileSync(filepath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Проверка целостности миграций
   */
  async validateMigrations() {
    const appliedMigrations = await this.getAppliedMigrations();
    const issues = [];

    for (const appliedMigration of appliedMigrations) {
      const migrationFile = this.getMigrationFiles()
        .find(m => m.version === appliedMigration.version);

      if (!migrationFile) {
        issues.push({
          type: 'missing_file',
          version: appliedMigration.version,
          message: 'Файл миграции не найден'
        });
        continue;
      }

      // Проверка контрольной суммы если она есть
      if (appliedMigration.checksum) {
        const currentChecksum = this.calculateChecksum(migrationFile.filepath);
        if (currentChecksum !== appliedMigration.checksum) {
          issues.push({
            type: 'checksum_mismatch',
            version: appliedMigration.version,
            message: 'Контрольная сумма не совпадает'
          });
        }
      }
    }

    return issues;
  }
}

module.exports = MigrationManager;