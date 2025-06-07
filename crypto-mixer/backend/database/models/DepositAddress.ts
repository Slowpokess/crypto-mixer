import { Sequelize, DataTypes, Model } from 'sequelize';
import crypto from 'crypto';

interface DepositAddressAttributes {
  id: string;
  mix_request_id: string;
  currency: 'BTC' | 'ETH' | 'USDT' | 'SOL';
  address: string;
  private_key_encrypted: string;
  encryption_iv: string;
  used: boolean;
  first_used_at?: Date;
  derivation_path?: string;
  address_index?: number;
  metadata?: object;
  // Расширенные поля для полного функционала
  expired_at: Date;
  created_at: Date;
  updated_at: Date;
}

class DepositAddress extends Model<DepositAddressAttributes> implements DepositAddressAttributes {
  public id!: string;
  public mix_request_id!: string;
  public currency!: 'BTC' | 'ETH' | 'USDT' | 'SOL';
  public address!: string;
  public private_key_encrypted!: string;
  public encryption_iv!: string;
  public used!: boolean;
  public first_used_at?: Date;
  public derivation_path?: string;
  public address_index?: number;
  public metadata?: object;
  // Расширенные поля для полного функционала
  public expired_at!: Date;
  public created_at!: Date;
  public updated_at!: Date;

  // Instance methods
  encryptPrivateKey(privateKey: string, encryptionKey: string): string {
    try {
      // Расширенная криптография с современными алгоритмами
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Получаем authentication tag для дополнительной безопасности
      const authTag = cipher.getAuthTag();
      
      // Комбинируем IV, authTag и зашифрованные данные
      const result = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
      
      this.private_key_encrypted = result;
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Ошибка шифрования приватного ключа: ${errorMessage}`);
    }
  }

  decryptPrivateKey(encryptionKey: string): string {
    try {
      // Расширенная логика расшифровки с проверкой целостности
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      
      // Разбираем зашифрованные данные
      const parts = this.private_key_encrypted.split(':');
      if (parts.length !== 3) {
        throw new Error('Неверный формат зашифрованных данных');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Ошибка расшифровки приватного ключа: ${errorMessage}`);
    }
  }

  async markAsUsed(): Promise<void> {
    this.used = true;
    this.first_used_at = new Date();
    await this.save();
  }

  isValidForCurrency(): boolean {
    const validators: { [key: string]: RegExp } = {
      BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$|^T[A-Za-z1-9]{33}$/,
      SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
    };

    const pattern = validators[this.currency];
    return pattern ? pattern.test(this.address) : false;
  }

 static async findByAddress(address: string): Promise<DepositAddress | null> {
   return this.findOne({ where: { address } });
 }

 static async findUnusedByCurrency(currency: string, limit =10): Promise<DepositAddress[]> {
   return this.scope(['unused', { method:['byCurrency', currency] }])
     .findAll({
       limit,
       order:[['created_at','ASC']]
     });
 }

 static async generateNextIndex(currency:string):Promise<number>{
   const lastAddress=await this.findOne({
     where:{currency},
     order:[['address_index','DESC']],
     attributes:['address_index']
   });

   return lastAddress?(lastAddress.address_index||0)+1 :0; 
 }

 static async getUsageStats():Promise<{[key:string]:{total:number;used:number;unused:number;usage_percentage:number}}> {
   const result=await this.findAll({
     attributes:[
       "currency",
       [Sequelize.fn("COUNT",Sequelize.col("id")),"total"],
       [Sequelize.fn("COUNT",Sequelize.literal("CASE WHEN used=true THEN1 END")),"used_count"]
     ],
     group:["currency"]
   });

   // Расширенная типизация для корректной работы со статистикой
   return result.reduce((acc: any, item: any) => {
     const currency = item.currency as string;
     const total = parseInt(String(item.get("total")));
     const used = parseInt(String(item.get("used_count"))) || 0;

     acc[currency] = {
       total,
       used,
       unused: total - used,
       usage_percentage: total > 0 ? ((used / total) * 100).toFixed(2) : 0,
       // Дополнительная аналитика
       efficiency_score: total > 0 ? Math.round((used / total) * 100) : 0,
       last_updated: new Date()
     };

     return acc ;
   },{});
 }

 static async createSecure(
   data: {
     privateKey: string;
     currency: string;
     address: string;
     mix_request_id: string;
     [key: string]: any;
   }, 
   encryptionKey: string, 
   transaction: any = null
 ): Promise<DepositAddress> {
   const { privateKey, ...addressData } = data;

   // Расширенная валидация входящих данных
   if (!privateKey || !data.currency || !data.address || !data.mix_request_id) {
     throw new Error('Обязательные поля не заполнены для создания безопасного адреса');
   }

   // Создание записи с полными данными адреса
   const address = await this.create({
     ...addressData,
     // Расширенные поля с правильной типизацией
     used: false,
     expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 часа
     // Поля timestamps будут автоматически заполнены Sequelize
   } as any, { transaction });

   // Шифрование и сохранение приватного ключа
   if(privateKey){
     address.encryptPrivateKey(privateKey,encryptionKey);
     await address.save({transaction});
   }

   return address ;
 }
}

export { DepositAddress };

export default (sequelizeInstance:any) => {
 DepositAddress.init(
   {

        id:{
          type : DataTypes.UUID,
          defaultValue : DataTypes.UUIDV4,
          primaryKey:true ,
          comment:'Уникальный идентификатор записи адреса депозита'
        },

        mix_request_id:{
          type : DataTypes.UUID,
          allowNull:false ,
          references:{
            model:'mix_requests',
            key:'id'
           },
           onDelete:'CASCADE',
           comment:'Идентификатор связанного запроса на микширование'
         },

         currency:{
           type : DataTypes.ENUM('BTC','ETH','USDT','SOL'),
           allowNull:false ,
           comment:'Тип криптовалюты адреса'
         },

         address:{
           type : DataTypes.STRING(128),
           allowNull:false ,
           unique:true ,
           validate:{
             notEmpty:true ,
             len:[20 ,128],
             isValidAddress(value:string){
               // Базовая валидация адресов по длине и формату
               // Расширенная типизация валидаторов адресов
               const validators: Record<string, RegExp> = {
                 BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
                 ETH: /^0x[a-fA-F0-9]{40}$/,
                 USDT: /^0x[a-fA-F0-9]{40}$|^T[A-Za-z1-9]{33}$/,
                 SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
               };

               const pattern = validators[String(this.currency)];
               if(pattern && !pattern.test(value)){
                 throw new Error(`Неверный формат адреса для валюты ${this.currency}`);
                }
              }
            },
            comment:'Адрес для получения депозита'
          },

          private_key_encrypted:{
            type : DataTypes.TEXT,
            allowNull:false ,
            validate:{
              notEmpty:true 
            },
            comment:'Зашифрованный приватный ключ адреса'
          },

          encryption_iv:{
            type : DataTypes.STRING(32),
            allowNull:false ,
            comment:'Вектор инициализации для расшифровки приватного ключа'
          },

          used:{
            type : DataTypes.BOOLEAN,
            allowNull:false ,
            defaultValue:false ,
            comment:'Флаг использования адреса (получен ли депозит)'
          },

          first_used_at:{
             type : DataTypes.DATE,
             allowNull:true ,
             comment:'Время первого получения средств на адрес'
           },

           derivation_path:{
             type : DataTypes.STRING(100),
             allowNull:true ,
             validate:{
               isValidPath(value:string){
                 if(value && !/^m(\/\d+'?)*$/.test(value)){
                   throw new Error('Неверный формат пути деривации');
                  }
                }
              },
              comment:'Путь деривации для HD кошельков (BIP44/BIP49/BIP84)'
           },

           address_index:{
              type :DataTypes.INTEGER,
              allowNull:true ,
              validate:{
                min:0 
              },
              comment :'Индекс адреса в последовательности генерации'
           },

           metadata:{
              type :DataTypes.JSONB,
              allowNull:true ,
              defaultValue:{},
              comment :'Дополнительные метаданные адреса'
           }
         },
         
         { 
        sequelize: sequelizeInstance,

        tableName: "deposit_addresses",
        timestamps:true,
        underscored:true,

        indexes:[
         {fields:['mix_request_id'],unique:true},
         {fields:['address'],unique:true},
         {fields:['currency','used']},
         {fields:['currency','address_index']},
         {fields:['created_at']}
        ],

        hooks:
        {
          
          
         
        
          
          
       
           
         
      
        
        

       
             
          
            
              
              
              
             
           
           
            
             
             
                
               
               
               
              
                 
                 
                 
                  
                  
                  
                    
                    
                    
                     
                     
                    

                    beforeCreate:(depositAddress:any )=>{
                      // Генерация IV для шифрования если не задан
                      if(!depositAddress.encryption_iv){
                        depositAddress.encryption_iv=crypto.randomBytes(16).toString('hex');
                      }
                    },


                    beforeUpdate:(depositAddress:any )=>{
                      // Установка времени первого использования
                      if(depositAddress.changed('used')&& depositAddress.used &&!depositAddress.first_used_at){
                        depositAddress.first_used_at=new Date();
                       }
                    }


                  },


                  scopes:
                  {

                   
                     unused:
                     {

                       where:{used:false}
                     },


                     used:
                     {

                       where:{used:true}
                     },


                     byCurrency:(currency:string)=>
                     ({
                       where:{currency}
                     }),

                      recent:
                      {

                        where:
                        {

                          created_at:
                          {[sequelizeInstance.Sequelize.Op.gte]:new Date(Date.now()-24*60*60*1000)}
                        }
                      }
                   }
                 });

                 // Расширенный функционал ассоциаций
                 (DepositAddress as any).associate = (models: any) => {

                   DepositAddress.belongsTo(models.MixRequest, {
                     foreignKey:'mix_request_id',
                     as :'mixRequest'
                   });


                   DepositAddress.hasOne(models.MonitoredAddress,{
                     foreignKey :'address',
                     sourceKey :'address',
                     as :'monitoredAddress'

                   });
                 };
                
                return DepositAddress;

};