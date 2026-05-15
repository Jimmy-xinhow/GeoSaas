import { EventEmitter } from 'events';

export const REDIS_KEY_LLMS_FULL = 'llms:full:txt';
export const llmsFullCacheEvents = new EventEmitter();

export function emitLlmsFullInvalidated(): void {
  llmsFullCacheEvents.emit('invalidate');
}
