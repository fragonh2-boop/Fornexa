// The same behavioral regressions run against the PGlite supplement and the
// complete candidate migration chain on disposable PostgreSQL 17 in CI.
import assert from 'node:assert/strict';

export async function runE2RegressionCases({ sql, action, tenant, warehouse, product, sourceBin, destinationBin, planner, operator }) {
  const results = [];
  const failures = [];
  async function proposal(quantity, targetHu = null, sourceHu = null) {
    const q = (await sql(`select id from public.inventory_quants where bin_id='${sourceBin}' and product_id='${product}' and stock_status='AVAILABLE' limit 1`)).rows[0];
    return (await sql(`insert into public.wms_proposals
      (tenant_id,warehouse_id,product_id,source_bin_id,source_quant_id,source_hu_id,destination_bin_id,target_hu_id,suggested_quantity,status)
      values ('${tenant}','${warehouse}','${product}','${sourceBin}','${q.id}',${sourceHu ? `'${sourceHu}'` : 'null'},'${destinationBin}',${targetHu ? `'${targetHu}'` : 'null'},${quantity},'DRAFT') returning id`)).rows[0].id;
  }
  async function approve(id) {
    const r = await action(planner, 'APPROVE_PROPOSAL', { proposal_id: id });
    assert.equal(r?.ok, true, JSON.stringify(r));
  }
  async function hu(id, bin) {
    await sql(`insert into public.handling_units (id,tenant_id,warehouse_id,current_bin_id,code,state,hu_type)
      values ('${id}','${tenant}','${warehouse}','${bin}','REG-${id}','STORED','PALLET') on conflict (id) do nothing`);
  }
  const hu1 = '70000000-0000-4000-a000-000000000091';
  const hu2 = '70000000-0000-4000-a000-000000000092';
  async function run(id, body) {
    await sql('begin');
    try {
      await sql(`update public.wms_proposals set task_id=null where tenant_id='${tenant}';
        update public.warehouse_tasks set proposal_id=null where tenant_id='${tenant}';
        delete from public.warehouse_tasks where tenant_id='${tenant}';
        delete from public.stock_reservations where tenant_id='${tenant}';
        delete from public.wms_proposals where tenant_id='${tenant}';
        delete from public.replenishment_rules where tenant_id='${tenant}';
        delete from public.inventory_quants where tenant_id='${tenant}';
        update public.warehouse_bins set max_pallets=0,max_weight_kg=null,max_volume_m3=null where id='${destinationBin}';
        insert into public.inventory_quants (tenant_id,warehouse_id,bin_id,product_id,quantity_on_hand,stock_status,flow_state,received_at)
        values ('${tenant}','${warehouse}','${sourceBin}','${product}',100,'AVAILABLE','STORED','2026-10-01Z');`);
      await body();
      results.push({ case: id, status: 'PASS' });
    } catch (error) {
      results.push({ case: id, status: 'FAIL', error: error.message });
      failures.push(new Error(`${id}: ${error.message}`, { cause: error }));
    } finally {
      await sql('rollback');
    }
  }

  await run('E2-REG-CAPACITY-ZERO', async () => {
    await hu(hu1, sourceBin);
    await sql(`update public.inventory_quants set hu_id='${hu1}' where bin_id='${sourceBin}' and product_id='${product}';
      insert into public.replenishment_rules (tenant_id,warehouse_id,product_id,destination_bin_id,min_quantity,max_quantity,reorder_quantity)
      values ('${tenant}','${warehouse}','${product}','${destinationBin}',10,100,1)`);
    const r = await action(planner, 'EVALUATE_REPLENISHMENT', { warehouse_id: warehouse });
    assert.equal(r?.ok, true, JSON.stringify(r));
    assert.equal(r.proposals[0]?.status, 'DRAFT', 'max_pallets=0 means unlimited, including incoming HU');
  });

  await run('E2-REG-CAPACITY-LIMIT', async () => {
    await hu(hu1, sourceBin); await hu(hu2, destinationBin);
    await sql(`update public.inventory_quants set hu_id='${hu1}' where bin_id='${sourceBin}';
      update public.warehouse_bins set max_pallets=1 where id='${destinationBin}';
      insert into public.inventory_quants (tenant_id,warehouse_id,bin_id,product_id,quantity_on_hand,stock_status,flow_state,hu_id)
      values ('${tenant}','${warehouse}','${destinationBin}','${product}',5,'AVAILABLE','STORED','${hu2}');
      insert into public.replenishment_rules (tenant_id,warehouse_id,product_id,destination_bin_id,min_quantity,max_quantity,reorder_quantity)
      values ('${tenant}','${warehouse}','${product}','${destinationBin}',10,105,1)`);
    const r = await action(planner, 'EVALUATE_REPLENISHMENT', { warehouse_id: warehouse });
    assert.equal(r.proposals[0]?.rejection_reason, 'WMS_BIN_CAPACITY', 'positive pallet limits remain enforced');
  });

  await run('E2-REG-MERMA-COLLISION', async () => {
    const first = await proposal(60), second = await proposal(40);
    await approve(first); await approve(second);
    await sql(`insert into public.inventory_quants (tenant_id,warehouse_id,bin_id,product_id,quantity_on_hand,stock_status,flow_state,received_at)
      values ('${tenant}','${warehouse}','${sourceBin}','${product}',5,'INSPECTION','QUARANTINE','2026-09-01Z')`);
    const r = await action(operator, 'REPLENISH', { proposal_id: first, merma: true });
    assert.equal(r?.error, 'WMS_SOURCE_STOCK_DEPLETED', JSON.stringify(r));
    const states = (await sql(`select p.status,t.state,r.status as reservation_status from public.wms_proposals p
      join public.warehouse_tasks t on t.id=p.task_id join public.stock_reservations r on r.reference_id=p.id where p.id='${first}'`)).rows[0];
    assert.deepEqual(states, { status: 'CANCELLED', state: 'CANCELLED', reservation_status: 'CANCELLED' });
    const other = (await sql(`select quantity_reserved,quantity_on_hand,flow_state from public.inventory_quants where bin_id='${sourceBin}' and stock_status='AVAILABLE'`)).rows[0];
    assert.equal(Number(other.quantity_reserved), 40, 'never release another order reservation');
    assert.equal(Number(other.quantity_on_hand), 100, 'planner reconciles physical stock');
    assert.equal(other.flow_state, 'QUARANTINE');
    assert.equal(Number((await sql(`select count(*) n from public.audit_events where entity_id='${first}' and action='REPLENISH_DEPLETED'`)).rows[0].n), 1);
    const blocked = await action(operator, 'REPLENISH', { proposal_id: second });
    assert.equal(blocked?.error, 'WMS_SOURCE_STOCK_UNAVAILABLE', 'quarantined source cannot execute another reservation');
  });

  await run('E2-REG-DESTINATION-HU', async () => {
    await hu(hu1, sourceBin); await hu(hu2, destinationBin);
    await sql(`update public.inventory_quants set hu_id='${hu1}' where bin_id='${sourceBin}';
      insert into public.inventory_quants (tenant_id,warehouse_id,bin_id,product_id,quantity_on_hand,stock_status,flow_state,hu_id,received_at)
      values ('${tenant}','${warehouse}','${destinationBin}','${product}',5,'AVAILABLE','STORED','${hu2}','2026-09-01Z')`);
    const id = await proposal(100, hu1, hu1); await approve(id);
    const r = await action(operator, 'REPLENISH', { proposal_id: id }, 'REG-HU-MOVE');
    assert.equal(r?.ok, true, JSON.stringify(r));
    const rows = (await sql(`select hu_id,quantity_on_hand from public.inventory_quants where bin_id='${destinationBin}' order by hu_id`)).rows;
    assert.deepEqual(rows.map(q => [q.hu_id, Number(q.quantity_on_hand)]), [[hu1,100],[hu2,5]], 'keep each physical HU identity');
    const replay = await action(operator, 'REPLENISH', { proposal_id: id }, 'REG-HU-MOVE');
    assert.equal(replay?.ok, true, JSON.stringify(replay));
    assert.equal(Number((await sql(`select sum(quantity_on_hand) n from public.inventory_quants where bin_id='${destinationBin}'`)).rows[0].n),105);
    await sql('savepoint duplicate_hu');
    await assert.rejects(sql(`insert into public.inventory_quants (tenant_id,warehouse_id,bin_id,product_id,quantity_on_hand,stock_status,flow_state,hu_id)
      values ('${tenant}','${warehouse}','${destinationBin}','${product}',1,'AVAILABLE','STORED','${hu1}')`), /duplicate key|unique constraint/);
    await sql('rollback to savepoint duplicate_hu');
  });

  await run('E2-REG-RESERVED-SOURCE', async () => {
    const id = await proposal(20); await approve(id);
    await sql(`update public.inventory_quants set stock_status='RESERVED' where bin_id='${sourceBin}'`);
    const r = await action(operator, 'REPLENISH', { proposal_id: id });
    assert.equal(r?.ok, true, 'RESERVED stock with this valid HELD reservation is executable');
  });

  await run('E2-REG-SHARED-DESTINATION', async () => {
    const first = await proposal(60), second = await proposal(40);
    await approve(first); await approve(second);
    assert.equal((await action(operator, 'REPLENISH', { proposal_id: first }))?.ok, true);
    assert.equal(Number((await sql(`select quantity_reserved from public.inventory_quants where bin_id='${sourceBin}'`)).rows[0].quantity_reserved), 40);
    assert.equal((await action(operator, 'REPLENISH', { proposal_id: second }))?.ok, true);
    const dest = (await sql(`select quantity_on_hand from public.inventory_quants where bin_id='${destinationBin}'`)).rows;
    assert.equal(dest.length, 1, 'loose stock in the same identity reuses its destination quant');
    assert.equal(Number(dest[0].quantity_on_hand), 100);
  });

  if (failures.length) throw new AggregateError(failures, failures.map(e => e.message).join('\n'));
  return results;
}
