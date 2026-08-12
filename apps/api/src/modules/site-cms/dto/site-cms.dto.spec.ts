import { validate } from 'class-validator';
import { SiteCmsChangePasswordDto, SiteCmsLoginDto } from './site-cms.dto';

describe('SiteCmsLoginDto', () => {
  async function errorsFor(username: string) {
    const dto = Object.assign(new SiteCmsLoginDto(), {
      username,
      password: '90852466',
    });
    return validate(dto);
  }

  it.each(['mio', 'admin@geovault.app'])('accepts a supported login identifier: %s', async (username) => {
    await expect(errorsFor(username)).resolves.toEqual([]);
  });

  it.each(['ad', 'bad email', '@geovault.app', 'admin@localhost'])('rejects an invalid login identifier: %s', async (username) => {
    expect(await errorsFor(username)).not.toEqual([]);
  });
});

describe('SiteCmsChangePasswordDto', () => {
  async function errorsFor(newPassword: string) {
    const dto = Object.assign(new SiteCmsChangePasswordDto(), {
      currentPassword: 'temporary-password',
      newPassword,
    });
    return validate(dto);
  }

  it('accepts exactly eight numeric digits', async () => {
    await expect(errorsFor('12345678')).resolves.toEqual([]);
  });

  it.each(['1234567', '123456789', 'abcd1234', '12 345678', '１２３４５６７８'])(
    'rejects an invalid new password: %s',
    async (password) => {
      expect(await errorsFor(password)).not.toEqual([]);
    },
  );
});
