jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

import { lookup } from 'node:dns/promises';
import { assertSafeScanUrl, isPrivateOrReservedAddress } from './scan-url-safety';

const lookupMock = lookup as jest.MockedFunction<typeof lookup>;

describe('scan URL safety', () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  });

  it('allows a public HTTP host', async () => {
    await expect(assertSafeScanUrl('https://example.com')).resolves.toBeUndefined();
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
  ])('classifies %s as private or reserved', (address) => {
    expect(isPrivateOrReservedAddress(address)).toBe(true);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);

    await expect(assertSafeScanUrl('http://metadata.example')).rejects.toMatchObject({
      code: 'blocked_target',
    });
  });
});
