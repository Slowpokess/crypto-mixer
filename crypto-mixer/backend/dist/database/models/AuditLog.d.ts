import { Sequelize, Optional } from 'sequelize';
import { LogLevel } from '../types';
import { EncryptedModelBase } from '../utils/EncryptedModelBase';
export interface AuditLogAttributes {
    id: string;
    level: LogLevel;
    action: string;
    userId?: string;
    sessionId?: string;
    mixRequestId?: string;
    resourceType?: string;
    resourceId?: string;
    message: string;
    details?: Record<string, any>;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    duration?: number;
    errorCode?: string;
    createdAt: Date;
}
export interface AuditLogCreationAttributes extends Optional<AuditLogAttributes, 'id' | 'success' | 'createdAt'> {
}
export declare class AuditLog extends EncryptedModelBase<AuditLogAttributes, AuditLogCreationAttributes> implements AuditLogAttributes {
    id: string;
    level: LogLevel;
    action: string;
    userId?: string;
    sessionId?: string;
    mixRequestId?: string;
    resourceType?: string;
    resourceId?: string;
    message: string;
    details?: Record<string, any>;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    duration?: number;
    errorCode?: string;
    readonly createdAt: Date;
    static logAction(data: {
        level: LogLevel;
        action: string;
        message: string;
        userId?: string;
        sessionId?: string;
        mixRequestId?: string;
        resourceType?: string;
        resourceId?: string;
        details?: Record<string, any>;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        ipAddress?: string;
        userAgent?: string;
        success?: boolean;
        duration?: number;
        errorCode?: string;
    }): Promise<AuditLog>;
    static findByUser(userId: string, limit?: number): Promise<AuditLog[]>;
    static findBySession(sessionId: string): Promise<AuditLog[]>;
    static findByMixRequest(mixRequestId: string): Promise<AuditLog[]>;
    static findErrors(timeFrame?: Date): Promise<AuditLog[]>;
    static getStatistics(timeFrame: Date): Promise<Record<string, any>>;
}
export declare function initAuditLog(sequelize: Sequelize): typeof AuditLog;
export default AuditLog;
