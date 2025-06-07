import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Создаём таблицу системных конфигураций
  await queryInterface.createTable('system_configs', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENCRYPTED'),
      allowNull: false,
      defaultValue: 'STRING'
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_encrypted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    is_read_only: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    validation_rules: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    default_value: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    last_modified_by: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    environment: {
      type: DataTypes.ENUM('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'),
      allowNull: false,
      defaultValue: 'ALL'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Добавляем индексы для system_configs
  await queryInterface.addIndex('system_configs', ['key'], { unique: true });
  await queryInterface.addIndex('system_configs', ['category']);
  await queryInterface.addIndex('system_configs', ['type']);
  await queryInterface.addIndex('system_configs', ['is_active']);
  await queryInterface.addIndex('system_configs', ['environment']);
  await queryInterface.addIndex('system_configs', ['category', 'is_active']);
  await queryInterface.addIndex('system_configs', ['key', 'environment']);

  console.log('✅ Created system_configs table with indexes');
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  await queryInterface.dropTable('system_configs');
  console.log('🗑️ Dropped system_configs table');
};