import * as crypto from 'crypto';

export interface NewebPayTradeInfo {
  MerchantID: string;
  RespondType: 'JSON';
  TimeStamp: string;
  Version: '2.0';
  MerchantOrderNo: string;
  Amt: number;
  ItemDesc: string;
  Email?: string;
  ReturnURL: string;
  NotifyURL: string;
  ClientBackURL?: string;
  CREDIT?: 1 | 0;
  WEBATM?: 1 | 0;
  VACC?: 1 | 0;
}

function objectToQueryString(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * AES-256-CBC 加密 TradeInfo
 */
export function encryptTradeInfo(
  data: NewebPayTradeInfo,
  hashKey: string,
  hashIV: string,
): string {
  const queryString = objectToQueryString(data);
  const cipher = crypto.createCipheriv('aes-256-cbc', hashKey, hashIV);
  let encrypted = cipher.update(queryString, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * SHA256 產生 TradeSha
 */
export function generateTradeSha(
  aesEncrypted: string,
  hashKey: string,
  hashIV: string,
): string {
  const raw = `HashKey=${hashKey}&${aesEncrypted}&HashIV=${hashIV}`;
  return crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
}

/**
 * AES-256-CBC 解密藍新回傳的 TradeInfo
 */
export function decryptTradeInfo(
  encryptedData: string,
  hashKey: string,
  hashIV: string,
): any {
  const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, hashIV);
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  // 移除 PKCS7 padding
  const padLength = decrypted.charCodeAt(decrypted.length - 1);
  if (padLength > 0 && padLength <= 16) {
    decrypted = decrypted.substring(0, decrypted.length - padLength);
  }
  return JSON.parse(decrypted);
}
