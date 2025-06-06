import { EventEmitter as NodeEventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface EventData {
  timestamp: Date;
  source: string;
  payload: any;
}

export class EventEmitter {
  private emitter: NodeEventEmitter;
  private logger: Logger;

  constructor() {
    this.emitter = new NodeEventEmitter();
    this.logger = new Logger('EventEmitter');
    
    // Set max listeners to avoid memory leak warnings
    this.emitter.setMaxListeners(100);
    
    // Log unhandled events in development
    if (process.env.NODE_ENV !== 'production') {
      this.emitter.on('newListener', (event) => {
        this.logger.debug('New event listener registered', { event });
      });
    }
  }

  emit(event: string, payload: any, source: string = 'unknown'): boolean {
    try {
      const eventData: EventData = {
        timestamp: new Date(),
        source,
        payload
      };

      this.logger.debug('Event emitted', { event, source });
      return this.emitter.emit(event, eventData);
    } catch (error) {
      this.logger.error('Failed to emit event', error as Error, { event, source });
      return false;
    }
  }

  on(event: string, listener: (data: EventData) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  once(event: string, listener: (data: EventData) => void): this {
    this.emitter.once(event, listener);
    return this;
  }

  off(event: string, listener: (data: EventData) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    this.emitter.removeAllListeners(event);
    return this;
  }

  listenerCount(event: string): number {
    return this.emitter.listenerCount(event);
  }

  eventNames(): (string | symbol)[] {
    return this.emitter.eventNames();
  }

  // Typed event methods for mix-related events
  onMixCreated(listener: (data: EventData) => void): this {
    return this.on('mix:created', listener);
  }

  onMixStatusChanged(listener: (data: EventData) => void): this {
    return this.on('mix:statusChanged', listener);
  }

  onMixCompleted(listener: (data: EventData) => void): this {
    return this.on('mix:completed', listener);
  }

  onMixFailed(listener: (data: EventData) => void): this {
    return this.on('mix:failed', listener);
  }

  onDepositReceived(listener: (data: EventData) => void): this {
    return this.on('deposit:received', listener);
  }

  onDepositConfirmed(listener: (data: EventData) => void): this {
    return this.on('deposit:confirmed', listener);
  }

  onWithdrawalSent(listener: (data: EventData) => void): this {
    return this.on('withdrawal:sent', listener);
  }

  onWithdrawalConfirmed(listener: (data: EventData) => void): this {
    return this.on('withdrawal:confirmed', listener);
  }

  // Emit methods for mix-related events
  emitMixCreated(payload: any, source?: string): boolean {
    return this.emit('mix:created', payload, source);
  }

  emitMixStatusChanged(payload: any, source?: string): boolean {
    return this.emit('mix:statusChanged', payload, source);
  }

  emitMixCompleted(payload: any, source?: string): boolean {
    return this.emit('mix:completed', payload, source);
  }

  emitMixFailed(payload: any, source?: string): boolean {
    return this.emit('mix:failed', payload, source);
  }

  emitDepositReceived(payload: any, source?: string): boolean {
    return this.emit('deposit:received', payload, source);
  }

  emitDepositConfirmed(payload: any, source?: string): boolean {
    return this.emit('deposit:confirmed', payload, source);
  }

  emitWithdrawalSent(payload: any, source?: string): boolean {
    return this.emit('withdrawal:sent', payload, source);
  }

  emitWithdrawalConfirmed(payload: any, source?: string): boolean {
    return this.emit('withdrawal:confirmed', payload, source);
  }
}