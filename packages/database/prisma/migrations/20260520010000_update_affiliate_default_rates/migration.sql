UPDATE "system_configs"
SET
  "value" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set("value"::jsonb, '{defaultCommissionRate}', '10'::jsonb, true),
        '{tierRates,standard}',
        '10'::jsonb,
        true
      ),
      '{tierRates,gold}',
      '15'::jsonb,
      true
    ),
    '{tierRates,platinum}',
    '20'::jsonb,
    true
  )::text,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'affiliate.settings'
  AND "value" IS NOT NULL
  AND "value" <> '';
