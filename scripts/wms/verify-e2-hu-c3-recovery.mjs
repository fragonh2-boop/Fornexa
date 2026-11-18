import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildE2RecoverySql } from "./build-e2-recovery.mjs";

const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const literal = (text) => `'${String(text).replaceAll("'", "''")}'`;

export async function c3ActionSnapshot(runSql) {
  const result = await runSql(`
    select jsonb_build_object(
      'definition', pg_get_functiondef(p.oid), 'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef, 'config', p.proconfig,
      'signature', pg_get_function_identity_arguments(p.oid), 'result', pg_get_function_result(p.oid),
      'acl', (select jsonb_agg(jsonb_build_object('grantee', a.grantee, 'grantor', a.grantor,
                                                'privilege', a.privilege_type, 'grantable', a.is_grantable)
                               order by a.grantee, a.grantor, a.privilege_type, a.is_grantable)
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a)
    ) as fingerprint
      from pg_proc p
     where p.oid = 'public.fornexa_wms_action(uuid,uuid,text,jsonb,text)'::regprocedure;
  `);
  return result.rows[0].fingerprint;
}

async function dataSnapshot(runSql) {
  const tables = ["inventory_quants", "inventory_movements", "handling_units", "handling_unit_contents",
    "warehouse_tasks", "stock_reservations", "wms_proposals", "replenishment_rules", "audit_events"];
  const hashes = {};
  for (const table of tables) {
    const result = await runSql(`select coalesce(jsonb_agg(row_data order by row_data::text), '[]'::jsonb)::text as snapshot
      from (select to_jsonb(t) as row_data from public.${table} t) s;`);
    hashes[table] = hash(result.rows[0].snapshot);
  }
  return hashes;
}

async function expectSqlFailure(runSql, sql, expected) {
  let error;
  try { await runSql(sql); } catch (caught) { error = caught; }
  // Also clear a failed explicit transaction on the real socket driver.
  await runSql("ROLLBACK;");
  assert.ok(error, `Expected SQL operation to fail closed: ${expected}`);
  assert.match(`${error.code || ""} ${error.message}`, expected);
}

export async function verifyHuC3Recovery({ runSql, c3Before, c3Source, rollbackSource, recoverySource,
  coreSql, rpcSql, tenantId, warehouseId, binId, productId, partyId, operatorUserId }) {
  // Start from the clean strict rollback already exercised by the parent harness.
  const strict = buildE2RecoverySql({ mode: "ROLLBACK", c3Source, rollbackSource });
  await runSql(strict.sql);
  assert.deepEqual(await c3ActionSnapshot(runSql), c3Before, "Repeated strict rollback must retain exact C3 action and ACL");
  await runSql(coreSql);
  await runSql(rpcSql);

  const huA = "88888888-0000-4000-8000-000000000001";
  const huB = "88888888-0000-4000-8000-000000000002";
  const quantA = "88888888-0000-4000-8000-000000000011";
  const quantB = "88888888-0000-4000-8000-000000000012";
  const proposal = "88888888-0000-4000-8000-000000000021";
  const task = "88888888-0000-4000-8000-000000000031";
  const reservation = "88888888-0000-4000-8000-000000000041";
  const tenantB = "88888888-0000-4000-8000-000000000051";
  const warehouseB = "88888888-0000-4000-8000-000000000061";
  const zoneB = "88888888-0000-4000-8000-000000000071";
  const binB = "88888888-0000-4000-8000-000000000081";
  const productB = "88888888-0000-4000-8000-000000000091";
  const partyB = "88888888-0000-4000-8000-000000000101";
  const otherHu = "88888888-0000-4000-8000-000000000003";
  const otherQuant = "88888888-0000-4000-8000-000000000013";
  const batch = "RECOVERY-TWO-HUS";
  await runSql(`
    insert into public.tenants (id, code, name) values ('${tenantB}', 'RECOVERY-B', 'Recovery isolation tenant');
    insert into public.parties (id, tenant_id, legal_name, tax_id, country_code)
    values ('${partyB}', '${tenantB}', 'Recovery B owner', 'SYNTHETIC-B', 'ES');
    insert into public.products (id, tenant_id, sku, name, uom_base)
    values ('${productB}', '${tenantB}', 'RECOVERY-B-SKU', 'Recovery B stock', 'UN');
    insert into public.warehouses (id, tenant_id, code, name) values ('${warehouseB}', '${tenantB}', 'REC-B', 'Recovery B');
    insert into public.warehouse_zones (id, tenant_id, warehouse_id, zone_code, zone_name)
    values ('${zoneB}', '${tenantB}', '${warehouseB}', 'B', 'Recovery B zone');
    insert into public.warehouse_bins (id, tenant_id, warehouse_id, zone_id, bin_code, max_weight_kg)
    values ('${binB}', '${tenantB}', '${warehouseB}', '${zoneB}', 'B-01', 5000);
    insert into public.handling_units (id, tenant_id, warehouse_id, code, hu_type, state, current_bin_id)
    values ('${otherHu}', '${tenantB}', '${warehouseB}', 'RECOVERY-B-HU', 'PALLET', 'STORED', '${binB}');
    insert into public.inventory_quants
      (id, tenant_id, warehouse_id, bin_id, product_id, owner_party_id, batch_number,
       quantity_on_hand, quantity_reserved, uom, stock_status, flow_state, hu_id)
    values ('${otherQuant}', '${tenantB}', '${warehouseB}', '${binB}', '${productB}', '${partyB}', '${batch}', 7, 0, 'UN', 'AVAILABLE', 'STORED', '${otherHu}');
    insert into public.handling_units (id, tenant_id, warehouse_id, code, hu_type, state, current_bin_id)
    values ('${huA}', '${tenantId}', '${warehouseId}', 'RECOVERY-HU-A', 'PALLET', 'STORED', '${binId}'),
           ('${huB}', '${tenantId}', '${warehouseId}', 'RECOVERY-HU-B', 'PALLET', 'STORED', '${binId}');
    insert into public.inventory_quants
      (id, tenant_id, warehouse_id, bin_id, product_id, owner_party_id, batch_number,
       quantity_on_hand, quantity_reserved, uom, stock_status, flow_state, hu_id)
    values ('${quantA}', '${tenantId}', '${warehouseId}', '${binId}', '${productId}', '${partyId}', '${batch}', 10, 2, 'UN', 'AVAILABLE', 'STORED', '${huA}'),
           ('${quantB}', '${tenantId}', '${warehouseId}', '${binId}', '${productId}', '${partyId}', '${batch}', 5, 0, 'UN', 'AVAILABLE', 'STORED', '${huB}');
    insert into public.wms_proposals
      (id, tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id,
       suggested_quantity, status, executed_by, idempotency_key)
    values ('${proposal}', '${tenantId}', '${warehouseId}', '${productId}', '${binId}', '${quantA}',
            '77777777-0000-4000-8000-000000000002', 2, 'EXECUTED', '${operatorUserId}', 'recovery-executed');
    insert into public.warehouse_tasks
      (id, tenant_id, warehouse_id, task_type, state, hu_id, product_id, quantity, uom,
       source_bin_id, destination_bin_id, source_quant_id, proposal_id)
    values ('${task}', '${tenantId}', '${warehouseId}', 'REPLENISH', 'READY', '${huA}', '${productId}', 2, 'UN',
            '${binId}', '77777777-0000-4000-8000-000000000002', '${quantA}', '${proposal}');
    insert into public.stock_reservations
      (id, tenant_id, quant_id, hu_id, batch_number, quantity, uom, status, created_by, reference_type, reference_id)
    values ('${reservation}', '${tenantId}', '${quantA}', '${huA}', '${batch}', 2, 'UN', 'HELD',
            '${operatorUserId}', 'REPLENISHMENT_PROPOSAL', '${proposal}');
    -- Exercise protection even with adversarial inherited private-schema grants.
    grant usage on schema private to anon, authenticated, service_role;
    alter default privileges in schema private grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema private grant all on sequences to anon, authenticated, service_role;
  `);
  const before = await dataSnapshot(runSql);
  const e2Action = await c3ActionSnapshot(runSql);
  assert.notDeepEqual(e2Action, c3Before, "Fixture must start with the E2 action installed");
  const bundle = buildE2RecoverySql({ mode: "PRESERVE_HU", c3Source, rollbackSource, recoverySource });

  // The strict inverse remains blocked while the actual colliding HUs stay live.
  await runSql("set fornexa.e2_rollback_confirm = 'ARCHIVE_EXECUTED_AND_PROCEED';");
  await expectSqlFailure(runSql, strict.sql, /E2_ROLLBACK_BLOCKED_KEY_COLLISION/);
  await runSql("reset fornexa.e2_rollback_confirm;");
  assert.deepEqual(await dataSnapshot(runSql), before);
  assert.deepEqual(await c3ActionSnapshot(runSql), e2Action, "Blocked inverse must roll back the attempted C3 replacement too");

  await expectSqlFailure(runSql, bundle.sql, /E2_RECOVERY_CONFIRM_REQUIRED/);
  assert.deepEqual(await c3ActionSnapshot(runSql), e2Action);
  await runSql("set fornexa.e2_recovery_confirm = 'PRESERVE_HU_AND_RESTORE_C3';");
  await expectSqlFailure(runSql, bundle.sql.replace(/commit;\s*$/i, "select 1 / 0;\ncommit;"), /22012|division by zero/);
  assert.deepEqual(await dataSnapshot(runSql), before, "Failed recovery must preserve all business rows");
  assert.deepEqual(await c3ActionSnapshot(runSql), e2Action, "Failed recovery must preserve original function and ACL");
  const noArchive = await runSql("select to_regclass('private.wms_e2_recovery_archive') as archive;");
  assert.equal(noArchive.rows[0].archive, null, "Archive DDL/rows/ACL must roll back on failure");

  // Preserve a prior archive too, including its ACL if a later recovery fails.
  await runSql(`create table private.wms_e2_recovery_archive (
    id bigint generated always as identity primary key, archived_at timestamptz not null default now(),
    source text not null, row_sha256 text not null, row_data jsonb not null, unique(source,row_sha256));
    insert into private.wms_e2_recovery_archive(source,row_sha256,row_data)
    select 'prior-run', encode(sha256(convert_to(d::text,'UTF8')),'hex'), d
      from (select jsonb_build_object('kind','prior-synthetic-state') as d) s;`);
  const archiveQuery = "select id, archived_at::text, source, row_sha256, row_data from private.wms_e2_recovery_archive order by source, row_sha256;";
  const priorArchive = (await runSql(archiveQuery)).rows;
  const securityQuery = "select relrowsecurity, relacl::text from pg_class where oid='private.wms_e2_recovery_archive'::regclass;";
  const priorSecurity = (await runSql(securityQuery)).rows;
  await expectSqlFailure(runSql, bundle.sql.replace(/commit;\s*$/i, "select 1 / 0;\ncommit;"), /22012|division by zero/);
  assert.deepEqual((await runSql(archiveQuery)).rows, priorArchive);
  assert.deepEqual((await runSql(securityQuery)).rows, priorSecurity);
  assert.deepEqual(await c3ActionSnapshot(runSql), e2Action);

  await runSql(bundle.sql);
  const firstPost = await dataSnapshot(runSql);
  assert.deepEqual(firstPost, before, "Forward recovery must not mutate any live business row");
  assert.deepEqual(await c3ActionSnapshot(runSql), c3Before, "C3 definition, signature, owner, config and ACL must match exactly");
  const archive = await runSql(archiveQuery);
  assert.deepEqual(archive.rows.find(r => r.source === "prior-run"), priorArchive[0], "Prior archive evidence must remain byte-for-byte unchanged");
  assert.ok(archive.rows.some(r => r.source === "wms_proposals" && r.row_data.id === proposal && r.row_data.executed_by === operatorUserId));
  assert.ok(archive.rows.some(r => r.source === "warehouse_tasks.proposal_id" && r.row_data.id === task && r.row_data.proposal_id === proposal));
  assert.ok(archive.rows.some(r => r.source === "stock_reservations.reference" && r.row_data.id === reservation && r.row_data.reference_id === proposal));

  await runSql(bundle.sql);
  const secondPost = await dataSnapshot(runSql);
  assert.deepEqual(secondPost, before);
  const archiveAgain = await runSql(archiveQuery);
  assert.deepEqual(archiveAgain.rows, archive.rows, "Repeated recovery must not duplicate archive rows");
  assert.deepEqual(await c3ActionSnapshot(runSql), c3Before);
  await runSql("reset fornexa.e2_recovery_confirm;");

  for (const role of ["anon", "authenticated", "service_role"]) {
    await expectSqlFailure(runSql, `begin; set local role ${role}; select * from private.wms_e2_recovery_archive; commit;`, /42501|permission denied/);
    await expectSqlFailure(runSql, `begin; set local role ${role}; insert into private.wms_e2_recovery_archive (source,row_sha256,row_data) values ('forged','forged','{}'); commit;`, /42501|permission denied/);
    await expectSqlFailure(runSql, `begin; set local role ${role}; select * from private.wms_e2_rollback_archive; commit;`, /42501|permission denied/);
    await expectSqlFailure(runSql, `begin; set local role ${role}; select nextval('private.wms_e2_recovery_archive_id_seq'); commit;`, /42501|permission denied/);
  }
  const rls = await runSql("select relrowsecurity from pg_class where oid='private.wms_e2_recovery_archive'::regclass;");
  assert.equal(rls.rows[0].relrowsecurity, true);
  await expectSqlFailure(runSql, `begin; set local role service_role; select public.fornexa_wms_approve_proposal('${tenantId}','${operatorUserId}','${proposal}'); commit;`, /42501|permission denied/);
  await expectSqlFailure(runSql, `begin; set local role service_role; update public.wms_proposals set status='REJECTED' where id='${proposal}'; commit;`, /42501|permission denied/);
  await expectSqlFailure(runSql, `begin; set local role anon; select public.fornexa_wms_action('${tenantId}','${operatorUserId}','UPSERT_RESOURCE','{}'::jsonb,null); commit;`, /42501|permission denied/);

  const c3 = (tenant, actor, action, payload, idem) => `begin; set local role service_role;
    select public.fornexa_wms_action(${literal(tenant)},${literal(actor)},${literal(action)},${literal(JSON.stringify(payload))}::jsonb,${literal(idem)}) as result;`;
  await expectSqlFailure(runSql, c3(tenantB, operatorUserId, "RESERVE", { quant_id: quantA, quantity: 1 }, "recovery-wrong-tenant"), /WMS_FORBIDDEN/);
  await expectSqlFailure(runSql, c3(tenantId, "88888888-0000-4000-8000-000000000099", "RESERVE", { quant_id: quantA, quantity: 1 }, "recovery-wrong-actor"), /WMS_FORBIDDEN/);
  await expectSqlFailure(runSql, c3(tenantId, operatorUserId, "RESERVE", { quant_id: quantA, quantity: 1, batch_number: "WRONG" }, "recovery-wrong-lot"), /WMS_LOT_MISMATCH/);
  await expectSqlFailure(runSql, c3(tenantId, operatorUserId, "APPROVE_PROPOSAL", { proposal_id: proposal }, "recovery-e2-action"), /WMS_FORBIDDEN/);
  await expectSqlFailure(runSql, c3(tenantId, operatorUserId, "CONFIRM_TASK", { task_id: task }, "recovery-frozen-e2-task"), /WMS_E2_FROZEN/);
  // TRUNCATE ignores RLS. A guard must reject it even when its invoker cannot
  // see a single E2 row. Keep the adversarial grants/policies in a rolled-back
  // transaction so this probe never changes the application role's final ACL.
  for (const table of ["stock_reservations", "warehouse_tasks"]) {
    const hidden = await runSql(`begin;
      create policy recovery_hide_e2_rows on public.${table} as restrictive
        for select to authenticated using (false);
      grant select, truncate on public.${table}, public.wms_proposals to authenticated;
      set local role authenticated;
      select count(*)::int as visible from public.${table};`);
    assert.equal(hidden.rows[0].visible, 0, "Adversarial RLS must hide the existing E2 links");
    await expectSqlFailure(runSql, `truncate public.${table} cascade;`, /WMS_E2_FROZEN/);
    assert.deepEqual(await dataSnapshot(runSql), before, "RLS-hidden links must survive the rejected TRUNCATE");
  }
  await expectSqlFailure(runSql, `update public.stock_reservations set status='ALLOCATED' where id='${reservation}';`, /WMS_E2_FROZEN/);
  await expectSqlFailure(runSql, `begin; update public.wms_proposals set status='REJECTED' where id='${proposal}';`, /WMS_E2_FROZEN/);
  await expectSqlFailure(runSql, "begin; truncate public.warehouse_tasks cascade;", /WMS_E2_FROZEN/);
  await expectSqlFailure(runSql, "begin; truncate public.wms_proposals cascade;", /WMS_E2_FROZEN/);
  assert.deepEqual(await dataSnapshot(runSql), before, "All rejected post-recovery actions must be non-mutating");
  const reserved = await runSql(c3(tenantId, operatorUserId, "RESERVE", { quant_id: quantA, quantity: 1, batch_number: batch }, "recovery-c3-reserve"));
  await runSql("commit;");
  assert.equal(reserved.rows[0].result.ok, true);
  const quantities = await runSql(`select id, hu_id, quantity_on_hand::text, quantity_reserved::text
    from public.inventory_quants where id in ('${quantA}','${quantB}') order by id;`);
  assert.deepEqual(quantities.rows.map(r => [r.id,r.hu_id,Number(r.quantity_on_hand),Number(r.quantity_reserved)]),
    [[quantA,huA,10,3],[quantB,huB,5,0]], "C3 must reserve only the selected HU, without merging stock");
  const confirmed = await runSql(c3(tenantId, operatorUserId, "CONFIRM_TASK", { task_id: reserved.rows[0].result.task_id }, "recovery-c3-legacy-confirm"));
  await runSql("commit;");
  assert.equal(confirmed.rows[0].result.ok, true, "Legacy C3 tasks without E2 links must remain operable");
  const otherStock = (await runSql(`select tenant_id, owner_party_id, hu_id, quantity_on_hand::text, quantity_reserved::text
    from public.inventory_quants where id='${otherQuant}';`)).rows[0];
  assert.deepEqual([otherStock.tenant_id,otherStock.owner_party_id,otherStock.hu_id,Number(otherStock.quantity_on_hand),Number(otherStock.quantity_reserved)],
    [tenantB,partyB,otherHu,7,0], "Other-tenant stock and ownership must remain isolated");

  return { certified: true, strategy: "PRESERVE_HU_FORWARD_RECOVERY", strict_schema_inverse: false,
    c3_definition_acl_owner_signature_exact: true, c3_definition_sha256: hash(c3Before.definition),
    operation_source_sha256: bundle.operationSourceSha256, effective_sql_sha256: bundle.effectiveSqlSha256,
    c3_source_sha256: bundle.c3SourceSha256, c3_body_sha256: bundle.c3BodySha256,
    colliding_hu_ids: [huA,huB], preserved_quant_ids: [quantA,quantB],
    pre_state_hashes: before, first_post_state_hashes: firstPost, repeated_post_state_hashes: secondPost,
    live_rows_unchanged: true, repeated_archive_identical: true, archive_rows: archive.rows.length,
    proposal_task_reservation_operator_links_preserved: true, recovery_failure_atomic: true,
    archive_access_denied_roles: ["anon","authenticated","service_role"], archive_rls_enabled: true,
    e2_rpc_and_direct_mutation_denied: true, c3_real_reservation_preserves_both_hus: true,
    c3_cannot_mutate_frozen_e2_links: true, c3_legacy_task_confirmation_operational: true,
    owner_mutation_and_truncate_of_e2_links_blocked: true,
    rls_hidden_links_truncate_blocked: true,
    prior_archive_and_failed_recovery_acl_preserved: true, other_tenant_stock_preserved: true,
    tenant_actor_lot_and_e2_rejections_nonmutating: true };
}
