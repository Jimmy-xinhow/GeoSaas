import { encryptTradeInfo, generateTradeSha, decryptTradeInfo, NewebPayTradeInfo } from './newebpay.util';
import * as crypto from 'crypto';

const TEST_HASH_KEY = '12345678901234567890123456789012'; // 32 bytes
const TEST_HASH_IV = '1234567890123456'; // 16 bytes

describe('newebpay.util', () => {
  describe('encryptTradeInfo', () => {
    it('should encrypt trade info to hex string', () => {
      const tradeInfo: NewebPayTradeInfo = {
        MerchantID: 'TestMerchant',
        RespondType: 'JSON',
        TimeStamp: '1234567890',
        Version: '2.0',
        MerchantOrderNo: 'TEST001',
        Amt: 490,
        ItemDesc: 'Test',
        ReturnURL: 'https://example.com/return',
        NotifyURL: 'https://example.com/notify',
      };

      const result = encryptTradeInfo(tradeInfo, TEST_HASH_KEY, TEST_HASH_IV);
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]+$/);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('generateTradeSha', () => {
    it('should generate uppercase SHA256 hash', () => {
      const result = generateTradeSha('abc123', TEST_HASH_KEY, TEST_HASH_IV);
      expect(result).toMatch(/^[0-9A-F]+$/);
      expect(result.length).toBe(64);
    });

    it('should produce consistent results', () => {
      const sha1 = generateTradeSha('test_data', TEST_HASH_KEY, TEST_HASH_IV);
      const sha2 = generateTradeSha('test_data', TEST_HASH_KEY, TEST_HASH_IV);
      expect(sha1).toBe(sha2);
    });
  });

  describe('decryptTradeInfo', () => {
    it('should decrypt an encrypted JSON response', () => {
      const responseJson = JSON.stringify({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'TEST001', TradeNo: 'TN123', Amt: 490, PaymentType: 'CREDIT' },
      });

      const cipher = crypto.createCipheriv('aes-256-cbc', TEST_HASH_KEY, TEST_HASH_IV);
      let encrypted = cipher.update(responseJson, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const decrypted = decryptTradeInfo(encrypted, TEST_HASH_KEY, TEST_HASH_IV);
      expect(decrypted.Status).toBe('SUCCESS');
      expect(decrypted.Result.MerchantOrderNo).toBe('TEST001');
      expect(decrypted.Result.Amt).toBe(490);
    });
  });
});
