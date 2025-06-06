import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { Logger } from '../utils/logger';

export interface RabbitMQConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  vhost: string;
}

export class MessageQueue {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private logger: Logger;
  private config: RabbitMQConfig;

  constructor() {
    this.logger = new Logger('MessageQueue');
    this.config = this.loadConfig();
  }

  private loadConfig(): RabbitMQConfig {
    return {
      host: process.env.RABBITMQ_HOST || 'localhost',
      port: parseInt(process.env.RABBITMQ_PORT || '5672'),
      username: process.env.RABBITMQ_USER || 'guest',
      password: process.env.RABBITMQ_PASSWORD || 'guest',
      vhost: process.env.RABBITMQ_VHOST || '/'
    };
  }

  async connect(): Promise<void> {
    try {
      const connectionUrl = `amqp://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}${this.config.vhost}`;
      
      this.connection = await amqp.connect(connectionUrl);
      this.channel = await this.connection.createChannel();

      // Setup connection error handlers
      this.connection.on('error', (error) => {
        this.logger.error('RabbitMQ connection error', error);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
      });

      this.logger.info('Connected to RabbitMQ', {
        host: this.config.host,
        port: this.config.port,
        vhost: this.config.vhost
      });

    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.logger.info('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error as Error);
      throw error;
    }
  }

  async publish(queueName: string, message: any): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      // Ensure queue exists
      await this.channel.assertQueue(queueName, { durable: true });

      // Publish message
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const published = this.channel.sendToQueue(queueName, messageBuffer, {
        persistent: true
      });

      if (!published) {
        throw new Error('Failed to publish message to queue');
      }

      this.logger.debug('Message published', { queueName, messageSize: messageBuffer.length });

    } catch (error) {
      this.logger.error('Failed to publish message', error as Error, { queueName });
      throw error;
    }
  }

  async subscribe(queueName: string, handler: (message: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      // Ensure queue exists
      await this.channel.assertQueue(queueName, { durable: true });

      // Set prefetch count for load balancing
      await this.channel.prefetch(1);

      // Start consuming
      await this.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
        if (!msg) {
          return;
        }

        try {
          const message = JSON.parse(msg.content.toString());
          await handler(message);

          // Acknowledge message
          this.channel!.ack(msg);
          this.logger.debug('Message processed successfully', { queueName });

        } catch (error) {
          this.logger.error('Error processing message', error as Error, { queueName });
          
          // Reject and requeue message
          this.channel!.nack(msg, false, true);
        }
      });

      this.logger.info('Subscribed to queue', { queueName });

    } catch (error) {
      this.logger.error('Failed to subscribe to queue', error as Error, { queueName });
      throw error;
    }
  }

  async publishExchange(exchange: string, routingKey: string, message: any): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      // Ensure exchange exists
      await this.channel.assertExchange(exchange, 'topic', { durable: true });

      // Publish message
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const published = this.channel.publish(exchange, routingKey, messageBuffer, {
        persistent: true
      });

      if (!published) {
        throw new Error('Failed to publish message to exchange');
      }

      this.logger.debug('Message published to exchange', { 
        exchange, 
        routingKey, 
        messageSize: messageBuffer.length 
      });

    } catch (error) {
      this.logger.error('Failed to publish to exchange', error as Error, { exchange, routingKey });
      throw error;
    }
  }

  async subscribeExchange(
    exchange: string, 
    routingKey: string, 
    handler: (message: any) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      // Ensure exchange exists
      await this.channel.assertExchange(exchange, 'topic', { durable: true });

      // Create temporary queue
      const queueResult = await this.channel.assertQueue('', { exclusive: true });
      const queueName = queueResult.queue;

      // Bind queue to exchange
      await this.channel.bindQueue(queueName, exchange, routingKey);

      // Start consuming
      await this.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
        if (!msg) {
          return;
        }

        try {
          const message = JSON.parse(msg.content.toString());
          await handler(message);

          // Acknowledge message
          this.channel!.ack(msg);
          this.logger.debug('Exchange message processed', { exchange, routingKey });

        } catch (error) {
          this.logger.error('Error processing exchange message', error as Error, { 
            exchange, 
            routingKey 
          });
          
          // Reject and requeue message
          this.channel!.nack(msg, false, true);
        }
      });

      this.logger.info('Subscribed to exchange', { exchange, routingKey });

    } catch (error) {
      this.logger.error('Failed to subscribe to exchange', error as Error, { exchange, routingKey });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return this.connection !== null && this.channel !== null;
    } catch (error) {
      this.logger.error('RabbitMQ health check failed', error as Error);
      return false;
    }
  }

  async purgeQueue(queueName: string): Promise<number> {
    if (!this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      const result = await this.channel.purgeQueue(queueName);
      this.logger.info('Queue purged', { queueName, messageCount: result.messageCount });
      return result.messageCount;
    } catch (error) {
      this.logger.error('Failed to purge queue', error as Error, { queueName });
      throw error;
    }
  }

  async deleteQueue(queueName: string): Promise<number> {
    if (!this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      const result = await this.channel.deleteQueue(queueName);
      this.logger.info('Queue deleted', { queueName, messageCount: result.messageCount });
      return result.messageCount;
    } catch (error) {
      this.logger.error('Failed to delete queue', error as Error, { queueName });
      throw error;
    }
  }
}