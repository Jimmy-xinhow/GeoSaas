import { Logger } from '@nestjs/common';

/**
 * SerpAPI Key Pool — rotates through multiple API keys
 *
 * Environment variable format:
 *   SERP_API_KEY=key1,key2,key3
 *
 * Or multiple env vars:
 *   SERP_API_KEY=key1
 *   SERP_API_KEY_2=key2
 *   SERP_API_KEY_3=key3
 */
export class SerpKeyPool {
  private static instance: SerpKeyPool;
  private keys: string[] = [];
  private currentIndex = 0;
  private failedKeys = new Set<string>();
  private readonly logger = new Logger('SerpKeyPool');

  private constructor() {
    this.loadKeys();
  }

  static getInstance(): SerpKeyPool {
    if (!SerpKeyPool.instance) {
      SerpKeyPool.instance = new SerpKeyPool();
    }
    return SerpKeyPool.instance;
  }

  private loadKeys() {
    const keys: string[] = [];

    // 1. Check comma-separated SERP_API_KEY
    const mainKey = process.env.SERP_API_KEY || '';
    if (mainKey.includes(',')) {
      keys.push(...mainKey.split(',').map((k) => k.trim()).filter(Boolean));
    } else if (mainKey) {
      keys.push(mainKey);
    }

    // 2. Check numbered keys: SERP_API_KEY_2, SERP_API_KEY_3, ...
    for (let i = 2; i <= 20; i++) {
      const key = process.env[`SERP_API_KEY_${i}`];
      if (key) keys.push(key.trim());
    }

    this.keys = [...new Set(keys)]; // deduplicate
    this.logger.log(`Loaded ${this.keys.length} SerpAPI key(s)`);
  }

  /**
   * Get the next available key (round-robin, skip failed ones)
   */
  getKey(): string | null {
    if (this.keys.length === 0) return null;

    // Reset failed keys if all are failed
    if (this.failedKeys.size >= this.keys.length) {
      this.logger.warn('All SerpAPI keys exhausted, resetting...');
      this.failedKeys.clear();
    }

    // Find next non-failed key
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      if (!this.failedKeys.has(key)) {
        this.currentIndex = (idx + 1) % this.keys.length;
        return key;
      }
    }

    return null;
  }

  /**
   * Mark a key as failed (e.g., rate limited or quota exceeded)
   */
  markFailed(key: string) {
    this.failedKeys.add(key);
    this.logger.warn(`SerpAPI key marked as failed: ${key.slice(0, 8)}... (${this.failedKeys.size}/${this.keys.length} failed)`);
  }

  /**
   * Get pool status
   */
  getStatus() {
    return {
      total: this.keys.length,
      available: this.keys.length - this.failedKeys.size,
      failed: this.failedKeys.size,
    };
  }
}
