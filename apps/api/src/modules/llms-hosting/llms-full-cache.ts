import { EventEmitter } from 'events';

export const REDIS_KEY_LLMS_FULL = 'geovault:llms-full:v1';
export const llmsFullCacheEvents = new EventEmitter();

export function emitLlmsFullInvalidated(): void {
  llmsFullCacheEvents.emit('invalidate');
}
