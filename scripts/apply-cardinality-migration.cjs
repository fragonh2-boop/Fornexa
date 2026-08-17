const fs = require('node:fs');
const { Client } = require('pg');

async function main() {
  const rawConnectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!rawConnectionString) throw new Error('Postgres connection URL is not configured.');

  const url = new URL(rawConnectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  const connectionString = url.toString();

  const sql = fs.readFileSync('supabase/migrations/20260818_fix_order_expedition_cardinality.sql', 'utf8');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    const { rows } = await client.query(
      `select exists (
         select 1 from public.fornexa_schema_migrations
         where version = '20260818_fix_order_expedition_cardinality'
       ) as migration_recorded,
       exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'expeditions_order_id_unique_idx'
       ) as old_unique_exists,
       exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'expedition_delivery_notes_delivery_note_unique_idx'
       ) as delivery_note_unique_exists`
    );
    const proof = rows[0] || {};
    if (!proof.migration_recorded || proof.old_unique_exists || !proof.delivery_note_unique_exists) {
      throw new Error(`Schema verification failed: ${JSON.stringify(proof)}`);
    }
    await client.query('commit');
    console.log('CARDINALITY_MIGRATION_APPLIED', JSON.stringify(proof));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('CARDINALITY_MIGRATION_FAILED', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
