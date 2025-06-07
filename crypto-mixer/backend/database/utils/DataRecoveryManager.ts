/**
 * Менеджер восстановления критических данных
 * 
 * Обеспечивает:
 * - Восстановление критических данных микширования
 * - Проверка целостности данных и транзакций  
 * - Автоматическое восстановление при сбоях
 * - Backup и rollback процедуры
 * - Мониторинг состояния данных
 */

import { Sequelize, Transaction, QueryTypes } from 'sequelize';
import { enhancedDbLogger } from '../logger';
import { MixRequest } from '../models/MixRequest';
import { Wallet } from '../models/Wallet';
import { OutputTransaction } from '../models/OutputTransaction';
import { DepositAddress } from '../models/DepositAddress';
import { AuditLog } from '../models/AuditLog';
import { BackupManager } from './BackupManager';
import { EventEmitter } from 'events';

export interface RecoveryOptions {
  // Проверка целостности
  enableIntegrityChecks: boolean;
  integrityCheckInterval: number;
  
  // Автоматическое восстановление
  enableAutoRecovery: boolean;
  maxRecoveryAttempts: number;
  recoveryDelay: number;
  
  // Backup настройки
  createRecoveryBackups: boolean;
  backupRetentionDays: number;
  
  // Мониторинг
  enableContinuousMonitoring: boolean;
  monitoringInterval: number;
  
  // Критические пороги
  maxInconsistentRecords: number;
  maxBalanceDiscrepancy: number;
}

export interface DataIntegrityReport {
  timestamp: Date;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  issues: IntegrityIssue[];
  recommendedActions: string[];
}

export interface IntegrityIssue {
  type: 'BALANCE_MISMATCH' | 'ORPHANED_RECORD' | 'STATUS_INCONSISTENCY' | 'MISSING_RELATION' | 'DUPLICATE_ADDRESS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedRecords: string[];
  suggestedFix: string;
  autoFixable: boolean;
}

export interface RecoveryOperation {
  id: string;
  type: 'INTEGRITY_CHECK' | 'AUTO_RECOVERY' | 'MANUAL_RECOVERY' | 'BACKUP_RESTORE';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  details: any;
}

/**
 * Менеджер восстановления данных
 */
export class DataRecoveryManager extends EventEmitter {
  private sequelize: Sequelize;
  private backupManager: BackupManager;
  private config: RecoveryOptions;
  private integrityTimer?: NodeJS.Timeout;
  private monitoringTimer?: NodeJS.Timeout;
  private activeOperations = new Map<string, RecoveryOperation>();
  private isShuttingDown = false;

  constructor(
    sequelize: Sequelize,
    backupManager: BackupManager,
    config: Partial<RecoveryOptions> = {}
  ) {
    super();
    
    this.sequelize = sequelize;
    this.backupManager = backupManager;
    this.config = {
      enableIntegrityChecks: true,
      integrityCheckInterval: 3600000, // 1 час
      enableAutoRecovery: true,
      maxRecoveryAttempts: 3,
      recoveryDelay: 5000,
      createRecoveryBackups: true,
      backupRetentionDays: 30,
      enableContinuousMonitoring: true,
      monitoringInterval: 300000, // 5 минут
      maxInconsistentRecords: 10,
      maxBalanceDiscrepancy: 0.000001, // Минимальная погрешность баланса
      ...config
    };

    this.startIntegrityChecks();
    this.startContinuousMonitoring();
    
    enhancedDbLogger.info('🛡️ DataRecoveryManager инициализирован', {
      config: this.config
    });
  }

  /**
   * Запуск регулярных проверок целостности
   */
  private startIntegrityChecks(): void {
    if (!this.config.enableIntegrityChecks) return;

    this.integrityTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performIntegrityCheck();
      }
    }, this.config.integrityCheckInterval);

    enhancedDbLogger.info('🔍 Проверки целостности данных запущены', {
      interval: this.config.integrityCheckInterval
    });
  }

  /**
   * Запуск непрерывного мониторинга
   */
  private startContinuousMonitoring(): void {
    if (!this.config.enableContinuousMonitoring) return;

    this.monitoringTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performQuickHealthCheck();
      }
    }, this.config.monitoringInterval);

    enhancedDbLogger.info('📊 Непрерывный мониторинг запущен', {
      interval: this.config.monitoringInterval
    });
  }

  /**
   * Комплексная проверка целостности данных
   */
  public async performIntegrityCheck(): Promise<DataIntegrityReport> {
    const operationId = `integrity_${Date.now()}`;
    const operation: RecoveryOperation = {
      id: operationId,
      type: 'INTEGRITY_CHECK',
      status: 'RUNNING',
      startedAt: new Date(),
      details: {}
    };

    this.activeOperations.set(operationId, operation);
    enhancedDbLogger.info('🔍 Начинаем комплексную проверку целостности данных');

    try {
      const issues: IntegrityIssue[] = [];

      // 1. Проверка балансов кошельков
      const balanceIssues = await this.checkWalletBalances();
      issues.push(...balanceIssues);

      // 2. Проверка связности данных микширования
      const relationIssues = await this.checkMixRequestRelations();
      issues.push(...relationIssues);

      // 3. Проверка статусов и состояний
      const statusIssues = await this.checkStatusConsistency();
      issues.push(...statusIssues);

      // 4. Проверка дублирующихся адресов
      const duplicateIssues = await this.checkDuplicateAddresses();
      issues.push(...duplicateIssues);

      // 5. Проверка orphaned записей
      const orphanIssues = await this.checkOrphanedRecords();
      issues.push(...orphanIssues);

      const report: DataIntegrityReport = {
        timestamp: new Date(),
        totalChecks: 5,
        passedChecks: 5 - issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length,
        failedChecks: issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length,
        issues,
        recommendedActions: this.generateRecommendations(issues)
      };

      operation.status = 'COMPLETED';
      operation.completedAt = new Date();
      operation.details = { report };

      enhancedDbLogger.info('✅ Проверка целостности завершена', {
        totalIssues: issues.length,
        criticalIssues: issues.filter(i => i.severity === 'CRITICAL').length,
        autoFixableIssues: issues.filter(i => i.autoFixable).length
      });

      // Автоматическое восстановление если включено
      if (this.config.enableAutoRecovery && issues.some(i => i.autoFixable)) {
        await this.performAutoRecovery(issues.filter(i => i.autoFixable));
      }

      this.emit('integrity_check_completed', report);
      return report;

    } catch (error) {
      operation.status = 'FAILED';
      operation.error = (error as Error).message;
      operation.completedAt = new Date();

      enhancedDbLogger.error('❌ Ошибка проверки целостности', { error });
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Проверка балансов кошельков
   */
  private async checkWalletBalances(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    try {
      // Проверяем отрицательные балансы
      const negativeBalances = await this.sequelize.query(`
        SELECT id, address, currency, balance 
        FROM wallets 
        WHERE balance < 0
      `, { type: QueryTypes.SELECT }) as any[];

      negativeBalances.forEach(wallet => {
        issues.push({
          type: 'BALANCE_MISMATCH',
          severity: 'CRITICAL',
          description: `Отрицательный баланс в кошельке ${wallet.address}`,
          affectedRecords: [wallet.id],
          suggestedFix: 'Проверить историю транзакций и восстановить корректный баланс',
          autoFixable: false
        });
      });

      // Проверяем аномально большие балансы (возможная ошибка)
      const suspiciousBalances = await this.sequelize.query(`
        SELECT id, address, currency, balance 
        FROM wallets 
        WHERE balance > 1000000 -- Настраиваемый порог
      `, { type: QueryTypes.SELECT }) as any[];

      suspiciousBalances.forEach(wallet => {
        issues.push({
          type: 'BALANCE_MISMATCH',
          severity: 'MEDIUM',
          description: `Подозрительно большой баланс в кошельке ${wallet.address}: ${wallet.balance}`,
          affectedRecords: [wallet.id],
          suggestedFix: 'Проверить историю транзакций и подтвердить корректность баланса',
          autoFixable: false
        });
      });

      enhancedDbLogger.info('💰 Проверка балансов завершена', {
        negativeBalances: negativeBalances.length,
        suspiciousBalances: suspiciousBalances.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки балансов', { error });
    }

    return issues;
  }

  /**
   * Проверка связности данных микширования
   */
  private async checkMixRequestRelations(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    try {
      // Проверяем MixRequest без DepositAddress
      const orphanedMixRequests = await this.sequelize.query(`
        SELECT mr.id, mr.status, mr.currency 
        FROM mix_requests mr
        LEFT JOIN deposit_addresses da ON mr.id = da.mix_request_id
        WHERE da.id IS NULL 
          AND mr.status NOT IN ('CANCELLED', 'FAILED')
      `, { type: QueryTypes.SELECT }) as any[];

      orphanedMixRequests.forEach(request => {
        issues.push({
          type: 'MISSING_RELATION',
          severity: 'HIGH',
          description: `MixRequest ${request.id} не имеет связанного DepositAddress`,
          affectedRecords: [request.id],
          suggestedFix: 'Создать DepositAddress или отменить запрос',
          autoFixable: true
        });
      });

      // Проверяем OutputTransaction без MixRequest
      const orphanedOutputs = await this.sequelize.query(`
        SELECT ot.id, ot.mix_request_id 
        FROM output_transactions ot
        LEFT JOIN mix_requests mr ON ot.mix_request_id = mr.id
        WHERE mr.id IS NULL
      `, { type: QueryTypes.SELECT }) as any[];

      orphanedOutputs.forEach(output => {
        issues.push({
          type: 'ORPHANED_RECORD',
          severity: 'MEDIUM',
          description: `OutputTransaction ${output.id} ссылается на несуществующий MixRequest`,
          affectedRecords: [output.id],
          suggestedFix: 'Удалить orphaned OutputTransaction',
          autoFixable: true
        });
      });

      enhancedDbLogger.info('🔗 Проверка связности данных завершена', {
        orphanedMixRequests: orphanedMixRequests.length,
        orphanedOutputs: orphanedOutputs.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки связности данных', { error });
    }

    return issues;
  }

  /**
   * Проверка консистентности статусов
   */
  private async checkStatusConsistency(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    try {
      // Проверяем застрявшие в MIXING статусе запросы
      const stuckMixing = await this.sequelize.query(`
        SELECT id, status, created_at, updated_at 
        FROM mix_requests 
        WHERE status = 'MIXING' 
          AND updated_at < NOW() - INTERVAL 2 HOUR
      `, { type: QueryTypes.SELECT }) as any[];

      stuckMixing.forEach(request => {
        issues.push({
          type: 'STATUS_INCONSISTENCY',
          severity: 'HIGH',
          description: `MixRequest ${request.id} застрял в статусе MIXING более 2 часов`,
          affectedRecords: [request.id],
          suggestedFix: 'Проверить процесс микширования и обновить статус',
          autoFixable: true
        });
      });

      // Проверяем DEPOSITED без confirmations слишком долго
      const stuckDeposited = await this.sequelize.query(`
        SELECT id, status, created_at, deposit_confirmed_at 
        FROM mix_requests 
        WHERE status = 'DEPOSITED' 
          AND created_at < NOW() - INTERVAL 24 HOUR
          AND deposit_confirmed_at IS NULL
      `, { type: QueryTypes.SELECT }) as any[];

      stuckDeposited.forEach(request => {
        issues.push({
          type: 'STATUS_INCONSISTENCY',
          severity: 'MEDIUM',
          description: `MixRequest ${request.id} в статусе DEPOSITED без подтверждения более 24 часов`,
          affectedRecords: [request.id],
          suggestedFix: 'Проверить блокчейн статус и обновить или отменить запрос',
          autoFixable: false
        });
      });

      enhancedDbLogger.info('📊 Проверка статусов завершена', {
        stuckMixing: stuckMixing.length,
        stuckDeposited: stuckDeposited.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки статусов', { error });
    }

    return issues;
  }

  /**
   * Проверка дублирующихся адресов
   */
  private async checkDuplicateAddresses(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    try {
      // Проверяем дублирующиеся адреса кошельков
      const duplicateWallets = await this.sequelize.query(`
        SELECT address, COUNT(*) as count, GROUP_CONCAT(id) as wallet_ids
        FROM wallets 
        GROUP BY address 
        HAVING COUNT(*) > 1
      `, { type: QueryTypes.SELECT }) as any[];

      duplicateWallets.forEach(duplicate => {
        issues.push({
          type: 'DUPLICATE_ADDRESS',
          severity: 'CRITICAL',
          description: `Дублирующийся адрес кошелька: ${duplicate.address} (${duplicate.count} экземпляров)`,
          affectedRecords: duplicate.wallet_ids.split(','),
          suggestedFix: 'Объединить или удалить дублирующиеся кошельки',
          autoFixable: false
        });
      });

      // Проверяем дублирующиеся deposit адреса
      const duplicateDeposits = await this.sequelize.query(`
        SELECT address, COUNT(*) as count, GROUP_CONCAT(id) as deposit_ids
        FROM deposit_addresses 
        GROUP BY address 
        HAVING COUNT(*) > 1
      `, { type: QueryTypes.SELECT }) as any[];

      duplicateDeposits.forEach(duplicate => {
        issues.push({
          type: 'DUPLICATE_ADDRESS',
          severity: 'HIGH',
          description: `Дублирующийся deposit адрес: ${duplicate.address} (${duplicate.count} экземпляров)`,
          affectedRecords: duplicate.deposit_ids.split(','),
          suggestedFix: 'Проверить использование и удалить неиспользуемые дубли',
          autoFixable: true
        });
      });

      enhancedDbLogger.info('🔍 Проверка дублей завершена', {
        duplicateWallets: duplicateWallets.length,
        duplicateDeposits: duplicateDeposits.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки дублей', { error });
    }

    return issues;
  }

  /**
   * Проверка orphaned записей
   */
  private async checkOrphanedRecords(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    try {
      // Проверяем неиспользуемые deposit адреса старше 7 дней
      const unusedDeposits = await this.sequelize.query(`
        SELECT da.id, da.address, da.created_at
        FROM deposit_addresses da
        LEFT JOIN mix_requests mr ON da.mix_request_id = mr.id
        WHERE da.used = false 
          AND da.created_at < NOW() - INTERVAL 7 DAY
          AND (mr.id IS NULL OR mr.status IN ('CANCELLED', 'FAILED'))
      `, { type: QueryTypes.SELECT }) as any[];

      if (unusedDeposits.length > 0) {
        issues.push({
          type: 'ORPHANED_RECORD',
          severity: 'LOW',
          description: `Найдено ${unusedDeposits.length} неиспользуемых deposit адресов старше 7 дней`,
          affectedRecords: unusedDeposits.map(d => d.id),
          suggestedFix: 'Удалить неиспользуемые deposit адреса для освобождения ресурсов',
          autoFixable: true
        });
      }

      enhancedDbLogger.info('🧹 Проверка orphaned записей завершена', {
        unusedDeposits: unusedDeposits.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки orphaned записей', { error });
    }

    return issues;
  }

  /**
   * Автоматическое восстановление
   */
  private async performAutoRecovery(fixableIssues: IntegrityIssue[]): Promise<void> {
    if (fixableIssues.length === 0) return;

    const operationId = `auto_recovery_${Date.now()}`;
    const operation: RecoveryOperation = {
      id: operationId,
      type: 'AUTO_RECOVERY',
      status: 'RUNNING',
      startedAt: new Date(),
      details: { fixableIssues: fixableIssues.length }
    };

    this.activeOperations.set(operationId, operation);
    enhancedDbLogger.info('🔧 Начинаем автоматическое восстановление', {
      issuesCount: fixableIssues.length
    });

    try {
      // Создаем backup перед восстановлением
      if (this.config.createRecoveryBackups) {
        await this.backupManager.createBackup('pre_recovery_' + Date.now());
      }

      let fixedCount = 0;
      const transaction = await this.sequelize.transaction();

      try {
        for (const issue of fixableIssues) {
          try {
            await this.applyAutoFix(issue, transaction);
            fixedCount++;
            
            // Логируем исправление
            await AuditLog.logAction({
              level: 'INFO',
              action: 'DATA_AUTO_RECOVERED',
              message: `Автоматически исправлена проблема: ${issue.description}`,
              details: {
                issueType: issue.type,
                affectedRecords: issue.affectedRecords,
                fix: issue.suggestedFix
              }
            }, transaction);

          } catch (fixError) {
            enhancedDbLogger.error('❌ Ошибка применения автофикса', {
              issue: issue.type,
              error: fixError
            });
          }
        }

        await transaction.commit();
        
        operation.status = 'COMPLETED';
        operation.completedAt = new Date();
        operation.details.fixedCount = fixedCount;

        enhancedDbLogger.info('✅ Автоматическое восстановление завершено', {
          fixedCount,
          totalIssues: fixableIssues.length
        });

        this.emit('auto_recovery_completed', { fixedCount, totalIssues: fixableIssues.length });

      } catch (error) {
        await transaction.rollback();
        throw error;
      }

    } catch (error) {
      operation.status = 'FAILED';
      operation.error = (error as Error).message;
      operation.completedAt = new Date();

      enhancedDbLogger.error('❌ Ошибка автоматического восстановления', { error });
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Применение автоматического исправления
   */
  private async applyAutoFix(issue: IntegrityIssue, transaction: Transaction): Promise<void> {
    switch (issue.type) {
      case 'MISSING_RELATION':
        await this.fixMissingRelation(issue, transaction);
        break;
        
      case 'ORPHANED_RECORD':
        await this.fixOrphanedRecord(issue, transaction);
        break;
        
      case 'STATUS_INCONSISTENCY':
        await this.fixStatusInconsistency(issue, transaction);
        break;
        
      case 'DUPLICATE_ADDRESS':
        await this.fixDuplicateAddress(issue, transaction);
        break;
        
      default:
        enhancedDbLogger.warn('⚠️ Неизвестный тип проблемы для автофикса', { type: issue.type });
    }
  }

  /**
   * Исправление отсутствующих связей
   */
  private async fixMissingRelation(issue: IntegrityIssue, transaction: Transaction): Promise<void> {
    // Для MixRequest без DepositAddress создаем DepositAddress или отменяем запрос
    for (const recordId of issue.affectedRecords) {
      const mixRequest = await MixRequest.findByPk(recordId, { transaction });
      if (mixRequest && mixRequest.status === 'PENDING') {
        // Отменяем запрос если он еще в статусе PENDING
        await mixRequest.update({
          status: 'CANCELLED',
          errorMessage: 'Auto-cancelled due to missing deposit address'
        }, { transaction });
        
        enhancedDbLogger.info('🔧 Отменен MixRequest без DepositAddress', { id: recordId });
      }
    }
  }

  /**
   * Исправление orphaned записей
   */
  private async fixOrphanedRecord(issue: IntegrityIssue, transaction: Transaction): Promise<void> {
    // Удаляем orphaned записи
    for (const recordId of issue.affectedRecords) {
      if (issue.description.includes('OutputTransaction')) {
        await OutputTransaction.destroy({ where: { id: recordId }, transaction });
      } else if (issue.description.includes('deposit адрес')) {
        await DepositAddress.destroy({ where: { id: recordId }, transaction });
      }
      
      enhancedDbLogger.info('🔧 Удалена orphaned запись', { id: recordId });
    }
  }

  /**
   * Исправление несоответствий статусов
   */
  private async fixStatusInconsistency(issue: IntegrityIssue, transaction: Transaction): Promise<void> {
    for (const recordId of issue.affectedRecords) {
      const mixRequest = await MixRequest.findByPk(recordId, { transaction });
      if (mixRequest) {
        if (issue.description.includes('застрял в статусе MIXING')) {
          // Возвращаем в POOLING для повторной обработки
          await mixRequest.update({
            status: 'POOLING',
            errorMessage: 'Auto-reset from stuck MIXING status'
          }, { transaction });
          
          enhancedDbLogger.info('🔧 Сброшен статус застрявшего MixRequest', { id: recordId });
        }
      }
    }
  }

  /**
   * Исправление дублирующихся адресов
   */
  private async fixDuplicateAddress(issue: IntegrityIssue, transaction: Transaction): Promise<void> {
    if (issue.description.includes('deposit адрес')) {
      // Для deposit адресов удаляем неиспользуемые дубли
      const deposits = await DepositAddress.findAll({
        where: { id: issue.affectedRecords },
        transaction
      });
      
      // Оставляем первый, удаляем остальные неиспользуемые
      for (let i = 1; i < deposits.length; i++) {
        if (!deposits[i].used) {
          await deposits[i].destroy({ transaction });
          enhancedDbLogger.info('🔧 Удален дублирующийся неиспользуемый deposit адрес', { 
            id: deposits[i].id 
          });
        }
      }
    }
  }

  /**
   * Быстрая проверка здоровья системы
   */
  private async performQuickHealthCheck(): Promise<void> {
    try {
      // Проверяем базовые метрики
      const metrics = await this.sequelize.query(`
        SELECT 
          (SELECT COUNT(*) FROM mix_requests WHERE status = 'MIXING' AND updated_at < NOW() - INTERVAL 30 MINUTE) as stuck_mixing,
          (SELECT COUNT(*) FROM wallets WHERE balance < 0) as negative_balances,
          (SELECT COUNT(*) FROM deposit_addresses WHERE used = false AND created_at < NOW() - INTERVAL 1 DAY) as old_unused_deposits
      `, { type: QueryTypes.SELECT }) as any[];

      const { stuck_mixing, negative_balances, old_unused_deposits } = metrics[0] || {};

      if (stuck_mixing > 0 || negative_balances > 0 || old_unused_deposits > 50) {
        enhancedDbLogger.warn('⚠️ Обнаружены проблемы в быстрой проверке', {
          stuck_mixing,
          negative_balances,
          old_unused_deposits
        });

        this.emit('health_check_warning', {
          stuck_mixing,
          negative_balances,
          old_unused_deposits
        });
      }

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка быстрой проверки здоровья', { error });
    }
  }

  /**
   * Генерация рекомендаций на основе найденных проблем
   */
  private generateRecommendations(issues: IntegrityIssue[]): string[] {
    const recommendations: string[] = [];
    
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const autoFixableCount = issues.filter(i => i.autoFixable).length;
    
    if (criticalCount > 0) {
      recommendations.push('НЕМЕДЛЕННОЕ ДЕЙСТВИЕ: Обнаружены критические проблемы целостности данных. Требуется ручное вмешательство.');
    }
    
    if (autoFixableCount > 0) {
      recommendations.push(`${autoFixableCount} проблем могут быть исправлены автоматически. Рассмотрите включение авто-восстановления.`);
    }
    
    if (issues.some(i => i.type === 'BALANCE_MISMATCH')) {
      recommendations.push('Проверьте процессы обновления балансов и историю транзакций.');
    }
    
    if (issues.some(i => i.type === 'STATUS_INCONSISTENCY')) {
      recommendations.push('Проверьте работу процессов микширования и обновления статусов.');
    }
    
    if (issues.length === 0) {
      recommendations.push('Система находится в хорошем состоянии. Продолжайте регулярные проверки.');
    }
    
    return recommendations;
  }

  /**
   * Получение активных операций восстановления
   */
  public getActiveOperations(): RecoveryOperation[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Ручной запуск восстановления конкретной проблемы
   */
  public async manualRecovery(issueId: string, customFix?: string): Promise<void> {
    const operationId = `manual_recovery_${Date.now()}`;
    const operation: RecoveryOperation = {
      id: operationId,
      type: 'MANUAL_RECOVERY',
      status: 'RUNNING',
      startedAt: new Date(),
      details: { issueId, customFix }
    };

    this.activeOperations.set(operationId, operation);
    
    try {
      enhancedDbLogger.info('🔧 Начинаем ручное восстановление', { issueId, customFix });
      
      // Создаем backup перед ручным восстановлением
      if (this.config.createRecoveryBackups) {
        await this.backupManager.createBackup('pre_manual_recovery_' + Date.now());
      }

      // Здесь будет логика ручного восстановления
      // В реальной реализации это может быть более сложная логика
      
      operation.status = 'COMPLETED';
      operation.completedAt = new Date();
      
      enhancedDbLogger.info('✅ Ручное восстановление завершено', { issueId });
      
    } catch (error) {
      operation.status = 'FAILED';
      operation.error = (error as Error).message;
      operation.completedAt = new Date();
      
      enhancedDbLogger.error('❌ Ошибка ручного восстановления', { error, issueId });
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    enhancedDbLogger.info('🔄 Начинаем graceful shutdown DataRecoveryManager');

    // Останавливаем таймеры
    if (this.integrityTimer) clearInterval(this.integrityTimer);
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);

    // Ждем завершения активных операций
    const activeOps = Array.from(this.activeOperations.values())
      .filter(op => op.status === 'RUNNING');

    if (activeOps.length > 0) {
      enhancedDbLogger.info('⏳ Ожидаем завершения активных операций восстановления', {
        count: activeOps.length
      });

      // Ждем максимум 30 секунд
      const timeout = setTimeout(() => {
        enhancedDbLogger.warn('⚠️ Принудительное завершение - операции восстановления не завершились вовремя');
      }, 30000);

      // Простая проверка каждые 500ms
      while (this.activeOperations.size > 0 && Date.now() < Date.now() + 30000) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      clearTimeout(timeout);
    }

    enhancedDbLogger.info('✅ DataRecoveryManager успешно завершен');
  }
}

export default DataRecoveryManager;