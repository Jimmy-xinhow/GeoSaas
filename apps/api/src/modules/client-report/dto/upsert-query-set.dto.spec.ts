import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertQuerySetDto } from './upsert-query-set.dto';

describe('UpsertQuerySetDto', () => {
  function payload(count: number) {
    return plainToInstance(UpsertQuerySetDto, {
      siteId: 'site-1',
      name: 'Client acceptance set',
      queries: Array.from({ length: count }, (_, index) => ({
        category: 'brand',
        question: `Valid acceptance question ${index + 1}?`,
      })),
    });
  }

  it('accepts the 100-question product contract', async () => {
    expect(await validate(payload(100))).toHaveLength(0);
  });

  it('rejects more than 100 questions', async () => {
    const errors = await validate(payload(101));
    expect(errors.some((error) => error.property === 'queries')).toBe(true);
  });
});
