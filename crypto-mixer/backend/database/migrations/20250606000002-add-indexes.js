/**
 * Миграция: Добавление индексов для оптимизации производительности
 * Создана: 2025-06-06T00:00:02.000Z
 */

module.exports = {
  /**
   * Применение миграции - создание индексов
   */
  async up(queryInterface, Sequelize) {
    console.log('🔄 Создание индексов для оптимизации...');

    // Индексы для mix_requests
    await queryInterface.addIndex('mix_requests', ['session_id'], {
      unique: true,
      name: 'mix_requests_session_id_unique'
    });

    await queryInterface.addIndex('mix_requests', ['currency', 'status'], {
      name: 'mix_requests_currency_status_idx'
    });

    await queryInterface.addIndex('mix_requests', ['deposit_address'], {
      unique: true,
      name: 'mix_requests_deposit_address_unique'
    });

    await queryInterface.addIndex('mix_requests', ['deposit_tx_hash'], {
      unique: true,
      name: 'mix_requests_deposit_tx_hash_unique',
      where: {
        deposit_tx_hash: { [Sequelize.Op.ne]: null }
      }
    });

    await queryInterface.addIndex('mix_requests', ['created_at'], {
      name: 'mix_requests_created_at_idx'
    });

    await queryInterface.addIndex('mix_requests', ['expires_at'], {
      name: 'mix_requests_expires_at_idx'
    });

    await queryInterface.addIndex('mix_requests', ['status', 'created_at'], {
      name: 'mix_requests_status_created_at_idx'
    });

    // Индексы для deposit_addresses
    await queryInterface.addIndex('deposit_addresses', ['mix_request_id'], {
      unique: true,
      name: 'deposit_addresses_mix_request_id_unique'
    });

    await queryInterface.addIndex('deposit_addresses', ['currency', 'used'], {
      name: 'deposit_addresses_currency_used_idx'
    });

    await queryInterface.addIndex('deposit_addresses', ['currency', 'address_index'], {
      name: 'deposit_addresses_currency_index_idx'
    });

    // Индексы для output_transactions
    await queryInterface.addIndex('output_transactions', ['mix_request_id'], {
      name: 'output_transactions_mix_request_id_idx'
    });

    await queryInterface.addIndex('output_transactions', ['output_address'], {
      name: 'output_transactions_output_address_idx'
    });

    await queryInterface.addIndex('output_transactions', ['tx_hash'], {
      unique: true,
      name: 'output_transactions_tx_hash_unique',
      where: {
        tx_hash: { [Sequelize.Op.ne]: null }
      }
    });

    await queryInterface.addIndex('output_transactions', ['currency', 'status'], {
      name: 'output_transactions_currency_status_idx'
    });

    await queryInterface.addIndex('output_transactions', ['scheduled_at'], {
      name: 'output_transactions_scheduled_at_idx'
    });

    await queryInterface.addIndex('output_transactions', ['status', 'retry_count'], {
      name: 'output_transactions_status_retry_idx'
    });

    await queryInterface.addIndex('output_transactions', ['priority', 'scheduled_at'], {
      name: 'output_transactions_priority_scheduled_idx'
    });

    // Индексы для wallets
    await queryInterface.addIndex('wallets', ['currency', 'wallet_type'], {
      name: 'wallets_currency_type_idx'
    });

    await queryInterface.addIndex('wallets', ['currency', 'active'], {
      name: 'wallets_currency_active_idx'
    });

    await queryInterface.addIndex('wallets', ['wallet_type', 'active', 'priority'], {
      name: 'wallets_type_active_priority_idx'
    });

    await queryInterface.addIndex('wallets', ['balance'], {
      name: 'wallets_balance_idx'
    });

    await queryInterface.addIndex('wallets', ['currency', 'balance'], {
      name: 'wallets_currency_balance_idx',
      where: {
        active: true
      }
    });

    // Индексы для monitored_addresses
    await queryInterface.addIndex('monitored_addresses', ['currency', 'address'], {
      unique: true,
      name: 'monitored_addresses_currency_address_unique'
    });

    await queryInterface.addIndex('monitored_addresses', ['mix_request_id'], {
      unique: true,
      name: 'monitored_addresses_mix_request_id_unique'
    });

    await queryInterface.addIndex('monitored_addresses', ['active', 'currency'], {
      name: 'monitored_addresses_active_currency_idx'
    });

    await queryInterface.addIndex('monitored_addresses', ['expires_at'], {
      name: 'monitored_addresses_expires_at_idx'
    });

    await queryInterface.addIndex('monitored_addresses', ['currency', 'active', 'last_checked_at'], {
      name: 'monitored_addresses_monitoring_idx'
    });

    // Индексы для transaction_pool
    await queryInterface.addIndex('transaction_pool', ['currency', 'used'], {
      name: 'transaction_pool_currency_used_idx'
    });

    await queryInterface.addIndex('transaction_pool', ['source_mix_request_id'], {
      name: 'transaction_pool_source_mix_request_id_idx'
    });

    await queryInterface.addIndex('transaction_pool', ['currency', 'pool_type', 'used'], {
      name: 'transaction_pool_currency_type_used_idx'
    });

    await queryInterface.addIndex('transaction_pool', ['expires_at'], {
      name: 'transaction_pool_expires_at_idx'
    });

    await queryInterface.addIndex('transaction_pool', ['mixing_group_id'], {
      name: 'transaction_pool_mixing_group_id_idx'
    });

    await queryInterface.addIndex('transaction_pool', ['priority', 'added_at'], {
      name: 'transaction_pool_priority_added_idx'
    });

    await queryInterface.addIndex('transaction_pool', ['currency', 'amount', 'used'], {
      name: 'transaction_pool_currency_amount_used_idx'
    });

    // Индексы для blockchain_transactions
    await queryInterface.addIndex('blockchain_transactions', ['currency', 'status'], {
      name: 'blockchain_transactions_currency_status_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['from_address'], {
      name: 'blockchain_transactions_from_address_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['to_address'], {
      name: 'blockchain_transactions_to_address_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['currency', 'block_number'], {
      name: 'blockchain_transactions_currency_block_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['transaction_type', 'currency'], {
      name: 'blockchain_transactions_type_currency_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['confirmed_at'], {
      name: 'blockchain_transactions_confirmed_at_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['currency', 'created_at'], {
      name: 'blockchain_transactions_currency_created_idx'
    });

    // Композитные индексы для частых запросов
    await queryInterface.addIndex('blockchain_transactions', ['currency', 'to_address', 'status'], {
      name: 'blockchain_transactions_currency_to_status_idx'
    });

    await queryInterface.addIndex('blockchain_transactions', ['currency', 'from_address', 'status'], {
      name: 'blockchain_transactions_currency_from_status_idx'
    });

    // Индексы для system_config
    await queryInterface.addIndex('system_config', ['category'], {
      name: 'system_config_category_idx'
    });

    await queryInterface.addIndex('system_config', ['is_critical'], {
      name: 'system_config_is_critical_idx'
    });

    await queryInterface.addIndex('system_config', ['environment'], {
      name: 'system_config_environment_idx'
    });

    await queryInterface.addIndex('system_config', ['category', 'environment'], {
      name: 'system_config_category_environment_idx'
    });

    // Индексы для audit_log
    await queryInterface.addIndex('audit_log', ['event_type', 'created_at'], {
      name: 'audit_log_event_type_created_idx'
    });

    await queryInterface.addIndex('audit_log', ['severity', 'created_at'], {
      name: 'audit_log_severity_created_idx'
    });

    await queryInterface.addIndex('audit_log', ['operation_status'], {
      name: 'audit_log_operation_status_idx'
    });

    await queryInterface.addIndex('audit_log', ['session_id'], {
      name: 'audit_log_session_id_idx'
    });

    await queryInterface.addIndex('audit_log', ['user_id'], {
      name: 'audit_log_user_id_idx'
    });

    await queryInterface.addIndex('audit_log', ['service_name', 'event_type'], {
      name: 'audit_log_service_event_idx'
    });

    await queryInterface.addIndex('audit_log', ['ip_address'], {
      name: 'audit_log_ip_address_idx'
    });

    // Композитные индексы для частых запросов аудита
    await queryInterface.addIndex('audit_log', ['event_type', 'operation_status', 'created_at'], {
      name: 'audit_log_event_status_created_idx'
    });

    await queryInterface.addIndex('audit_log', ['severity', 'service_name', 'created_at'], {
      name: 'audit_log_severity_service_created_idx'
    });

    console.log('✅ Все индексы созданы успешно');
  },

  /**
   * Откат миграции - удаление индексов
   */
  async down(queryInterface, Sequelize) {
    console.log('🔄 Удаление индексов...');

    // Удаление индексов в обратном порядке
    const indexesToDrop = [
      // audit_log индексы
      'audit_log_severity_service_created_idx',
      'audit_log_event_status_created_idx',
      'audit_log_ip_address_idx',
      'audit_log_service_event_idx',
      'audit_log_user_id_idx',
      'audit_log_session_id_idx',
      'audit_log_operation_status_idx',
      'audit_log_severity_created_idx',
      'audit_log_event_type_created_idx',

      // system_config индексы
      'system_config_category_environment_idx',
      'system_config_environment_idx',
      'system_config_is_critical_idx',
      'system_config_category_idx',

      // blockchain_transactions индексы
      'blockchain_transactions_currency_from_status_idx',
      'blockchain_transactions_currency_to_status_idx',
      'blockchain_transactions_currency_created_idx',
      'blockchain_transactions_confirmed_at_idx',
      'blockchain_transactions_type_currency_idx',
      'blockchain_transactions_currency_block_idx',
      'blockchain_transactions_to_address_idx',
      'blockchain_transactions_from_address_idx',
      'blockchain_transactions_currency_status_idx',

      // transaction_pool индексы
      'transaction_pool_currency_amount_used_idx',
      'transaction_pool_priority_added_idx',
      'transaction_pool_mixing_group_id_idx',
      'transaction_pool_expires_at_idx',
      'transaction_pool_currency_type_used_idx',
      'transaction_pool_source_mix_request_id_idx',
      'transaction_pool_currency_used_idx',

      // monitored_addresses индексы
      'monitored_addresses_monitoring_idx',
      'monitored_addresses_expires_at_idx',
      'monitored_addresses_active_currency_idx',
      'monitored_addresses_mix_request_id_unique',
      'monitored_addresses_currency_address_unique',

      // wallets индексы
      'wallets_currency_balance_idx',
      'wallets_balance_idx',
      'wallets_type_active_priority_idx',
      'wallets_currency_active_idx',
      'wallets_currency_type_idx',

      // output_transactions индексы
      'output_transactions_priority_scheduled_idx',
      'output_transactions_status_retry_idx',
      'output_transactions_scheduled_at_idx',
      'output_transactions_currency_status_idx',
      'output_transactions_tx_hash_unique',
      'output_transactions_output_address_idx',
      'output_transactions_mix_request_id_idx',

      // deposit_addresses индексы
      'deposit_addresses_currency_index_idx',
      'deposit_addresses_currency_used_idx',
      'deposit_addresses_mix_request_id_unique',

      // mix_requests индексы
      'mix_requests_status_created_at_idx',
      'mix_requests_expires_at_idx',
      'mix_requests_created_at_idx',
      'mix_requests_deposit_tx_hash_unique',
      'mix_requests_deposit_address_unique',
      'mix_requests_currency_status_idx',
      'mix_requests_session_id_unique'
    ];

    for (const indexName of indexesToDrop) {
      try {
        await queryInterface.removeIndex('audit_log', indexName);
      } catch (error) {
        // Игнорируем ошибки если индекс не существует
        if (!error.message.includes('does not exist')) {
          console.warn(`Предупреждение при удалении индекса ${indexName}:`, error.message);
        }
      }
    }

    console.log('✅ Все индексы удалены');
  }
};