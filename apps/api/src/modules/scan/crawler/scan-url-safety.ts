import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ScanExecutionError } from '../scan-failure';

export async function assertSafeScanUrl(value: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScanExecutionError('blocked_target', 'Target URL is invalid');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ScanExecutionError('blocked_target', 'Target URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new ScanExecutionError('blocked_target', 'Target URL must not include credentials');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new ScanExecutionError('blocked_target', 'Local scan targets are not allowed');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

  if (addresses.length === 0 || addresses.some(isPrivateOrReservedAddress)) {
    throw new ScanExecutionError(
      'blocked_target',
      'Target resolves to a private or reserved network address',
    );
  }
}

export function isPrivateOrReservedAddress(value: string): boolean {
  const address = value.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = address.match(/^(?:0*:){2,6}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (mappedIpv4) return isPrivateOrReservedAddress(mappedIpv4);

  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (isIP(address) === 6) {
    return (
      address === '::' ||
      address === '::1' ||
      address.startsWith('fc') ||
      address.startsWith('fd') ||
      /^fe[89ab]/.test(address) ||
      address.startsWith('ff') ||
      address.startsWith('2001:db8:')
    );
  }

  return true;
}
