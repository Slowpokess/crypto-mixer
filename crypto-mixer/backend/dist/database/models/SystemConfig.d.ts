import { Model, Sequelize, Optional } from 'sequelize';
export interface SystemConfigAttributes {
    id: string;
    key: string;
    value: string;
    type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED';
    category: string;
    description?: string;
    isEncrypted: boolean;
    isActive: boolean;
    isReadOnly: boolean;
    validationRules?: Record<string, any>;
    defaultValue?: string;
    lastModifiedBy?: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'ALL';
    createdAt: Date;
    updatedAt: Date;
}
export interface SystemConfigCreationAttributes extends Optional<SystemConfigAttributes, 'id' | 'isEncrypted' | 'isActive' | 'isReadOnly' | 'environment' | 'createdAt' | 'updatedAt'> {
}
export declare class SystemConfig extends Model<SystemConfigAttributes, SystemConfigCreationAttributes> implements SystemConfigAttributes {
    id: string;
    key: string;
    value: string;
    type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED';
    category: string;
    description?: string;
    isEncrypted: boolean;
    isActive: boolean;
    isReadOnly: boolean;
    validationRules?: Record<string, any>;
    defaultValue?: string;
    lastModifiedBy?: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'ALL';
    readonly createdAt: Date;
    readonly updatedAt: Date;
    getTypedValue(): any;
    updateValue(newValue: any, modifiedBy?: string): Promise<void>;
    static getValue(key: string, defaultValue?: any): Promise<any>;
    static setValue(key: string, value: any, type?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED', category?: string, modifiedBy?: string): Promise<SystemConfig>;
    static getByCategory(category: string): Promise<SystemConfig[]>;
    static getAllSettings(): Promise<Record<string, any>>;
    static initializeDefaults(): Promise<void>;
}
export declare function initSystemConfig(sequelize: Sequelize): typeof SystemConfig;
export default SystemConfig;
