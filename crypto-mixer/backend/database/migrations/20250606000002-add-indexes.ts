import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Индексы для mix_requests
  await queryInterface.addIndex('mix_requests', ['currency']);
  await queryInterface.addIndex('mix_requests', ['status']);
  await queryInterface.addIndex('mix_requests', ['created_at']);
  await queryInterface.addIndex('mix_requests', ['currency', 'status']);
  await queryInterface.addIndex('mix_requests', ['status', 'created_at']);
  await queryInterface.addIndex('mix_requests', ['deposit_txid']);
  await queryInterface.addIndex('mix_requests', ['completed_at']);

  // Индексы для wallets
  await queryInterface.addIndex('wallets', ['currency']);
  await queryInterface.addIndex('wallets', ['type']);
  await queryInterface.addIndex('wallets', ['status']);
  await queryInterface.addIndex('wallets', ['address'], { unique: true });
  await queryInterface.addIndex('wallets', ['currency', 'type']);
  await queryInterface.addIndex('wallets', ['currency', 'status']);
  await queryInterface.addIndex('wallets', ['type', 'status']);

  // Индексы для deposit_addresses
  await queryInterface.addIndex('deposit_addresses', ['mix_request_id']);
  await queryInterface.addIndex('deposit_addresses', ['currency']);
  await queryInterface.addIndex('deposit_addresses', ['address'], { unique: true });
  await queryInterface.addIndex('deposit_addresses', ['used']);
  await queryInterface.addIndex('deposit_addresses', ['expired_at']);
  await queryInterface.addIndex('deposit_addresses', ['currency', 'used']);

  console.log('✅ Added performance indexes to initial tables');
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Удаляем индексы mix_requests
  await queryInterface.removeIndex('mix_requests', ['currency']);
  await queryInterface.removeIndex('mix_requests', ['status']);
  await queryInterface.removeIndex('mix_requests', ['created_at']);
  await queryInterface.removeIndex('mix_requests', ['currency', 'status']);
  await queryInterface.removeIndex('mix_requests', ['status', 'created_at']);
  await queryInterface.removeIndex('mix_requests', ['deposit_txid']);
  await queryInterface.removeIndex('mix_requests', ['completed_at']);

  // Удаляем индексы wallets
  await queryInterface.removeIndex('wallets', ['currency']);
  await queryInterface.removeIndex('wallets', ['type']);
  await queryInterface.removeIndex('wallets', ['status']);
  await queryInterface.removeIndex('wallets', ['address']);
  await queryInterface.removeIndex('wallets', ['currency', 'type']);
  await queryInterface.removeIndex('wallets', ['currency', 'status']);
  await queryInterface.removeIndex('wallets', ['type', 'status']);

  // Удаляем индексы deposit_addresses
  await queryInterface.removeIndex('deposit_addresses', ['mix_request_id']);
  await queryInterface.removeIndex('deposit_addresses', ['currency']);
  await queryInterface.removeIndex('deposit_addresses', ['address']);
  await queryInterface.removeIndex('deposit_addresses', ['used']);
  await queryInterface.removeIndex('deposit_addresses', ['expired_at']);
  await queryInterface.removeIndex('deposit_addresses', ['currency', 'used']);

  console.log('🗑️ Removed performance indexes from initial tables');
};