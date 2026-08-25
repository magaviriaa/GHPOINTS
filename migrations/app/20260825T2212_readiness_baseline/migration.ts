#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b12d61e02ed5cea3b7164f2e9fc1d79ef67fc031e04975727a33fb7867ca864a/contract';
import endContract from '../../snapshots/b12d61e02ed5cea3b7164f2e9fc1d79ef67fc031e04975727a33fb7867ca864a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ffc36fa0597cee434d1f3cfe3f0344fef80a0af80ff8ed9c7821d116f50b70b9/contract';
import startContract from '../../snapshots/ffc36fa0597cee434d1f3cfe3f0344fef80a0af80ff8ed9c7821d116f50b70b9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('cancelReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Activity',
        column: col('cancelledAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      rawSql({
        id: 'column.public.AppConfig.value.jsonb-to-text',
        label: 'Convert column "AppConfig.value" from jsonb to text',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'convert "AppConfig.value" to text',
            sql: 'ALTER TABLE "public"."AppConfig" ALTER COLUMN "value" TYPE text USING "value"::text',
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
