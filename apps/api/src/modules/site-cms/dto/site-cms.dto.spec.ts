import { validate } from 'class-validator';
import { SiteCmsChangePasswordDto } from './site-cms.dto';

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
