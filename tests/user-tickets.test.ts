import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const tenant = "10000000-0000-0000-0000-000000000001";
const otherTenant = "10000000-0000-0000-0000-000000000002";
const reporter = "20000000-0000-0000-0000-000000000001";
const peer = "20000000-0000-0000-0000-000000000002";
const manager = "20000000-0000-0000-0000-000000000003";
const otherManager = "20000000-0000-0000-0000-000000000004";

test("tickets preserve tenant and reporter isolation for activity, files and management", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    create table public.tenants (id uuid primary key);
    create table public.tenant_members (tenant_id uuid, user_id uuid, role text, status text);
    create table public.fornexa_schema_migrations (version text primary key, description text);
  `);
  for (const migration of ["20260819_harden_tenant_access_function", "20261125100000_user_tickets"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}.sql`, import.meta.url), "utf8"));
  }
  await db.query("insert into tenants values ($1), ($2)", [tenant, otherTenant]);
  for (const [org, user, role] of [
    [tenant, reporter, "OPERATOR"], [tenant, peer, "OPERATOR"], [tenant, manager, "ADMIN"],
    [otherTenant, otherManager, "OWNER"],
  ]) {
    await db.query("insert into tenant_members values ($1,$2,$3,'ACTIVE')", [org, user, role]);
  }

  async function signIn(user: string) {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  }

  await signIn(reporter);
  const create = `insert into user_tickets (tenant_id, category, area, title, description, attachment_name, attachment_data)
    values ($1, 'Incidencia', 'TMS web', 'Ticket de prueba', 'Descripción', 'evidencia.txt', decode('74657374', 'hex'))
    returning id, reporter_id, status`;
  await assert.rejects(db.query(create, [otherTenant]), { code: "42501" });
  const { rows: [ticket] } = await db.query<{ id: string; reporter_id: string; status: string }>(create, [tenant]);
  assert.equal(ticket.reporter_id, reporter);
  assert.equal(ticket.status, "Nuevo");
  const id = ticket.id;
  const comment = "insert into user_ticket_activity (ticket_id, body) values ($1, 'Sigue ocurriendo')";
  await db.query(comment, [id]);
  const update = "update user_tickets set status='En curso' where id=$1 returning id";
  assert.equal((await db.query(update, [id])).rows.length, 0);

  for (const actor of [peer, otherManager]) {
    await signIn(actor);
    assert.equal((await db.query("select attachment_data from user_tickets where id=$1", [id])).rows.length, 0);
    assert.equal((await db.query("select * from user_ticket_activity where ticket_id=$1", [id])).rows.length, 0);
    await assert.rejects(db.query(comment, [id]), { code: "42501" });
  }

  await signIn(manager);
  const attachment = await db.query("select encode(attachment_data,'hex') as hex from user_tickets where id=$1", [id]);
  assert.deepEqual(attachment.rows, [{ hex: "74657374" }]);
  await assert.rejects(db.query("update user_tickets set assignee_id=$2 where id=$1", [id, peer]), { code: "42501" });
  assert.equal((await db.query(update, [id])).rows.length, 1);
  await db.query("update user_tickets set assignee_id=$2, priority='Alta' where id=$1", [id, manager]);
  await db.query(comment, [id]);
  await assert.rejects(db.query("update user_tickets set reporter_id=$2 where id=$1", [id, manager]), { code: "42501" });

  await signIn(reporter);
  const history = await db.query("select kind, author_id from user_ticket_activity where ticket_id=$1 order by created_at, id", [id]);
  assert.deepEqual(history.rows, [
    { kind: "comment", author_id: reporter },
    { kind: "management", author_id: manager },
    { kind: "management", author_id: manager },
    { kind: "comment", author_id: manager },
  ]);
});
