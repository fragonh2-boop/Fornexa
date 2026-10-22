"""Exercise the checked-in workflow shell, with optional disposable PG17 execution.

No production credentials are read. The real mode accepts only loopback and the
dedicated CI database, and refuses existing tables without the synthetic marker.
The baseline is the same partial master-data shim and real E1/tenant migrations
used by the C3 harness; this does not claim replay of the production migration chain.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/apply-wms-c3-migration.yml"
TEXT = WORKFLOW.read_text()
ENV = {}
for key, value in re.findall(r"^      ([A-Z_]+): (.+)$", TEXT, re.M):
    if "${{" not in value:
        ENV[key] = value.strip("'\"")


def step(prefix):
    # Deliberately limited to this workflow's literal run blocks. Fail if its
    # structure changes, rather than silently testing a reconstructed command.
    chunks = re.split(r"^      - name: ", TEXT, flags=re.M)[1:]
    matches = [c for c in chunks if c.splitlines()[0].startswith(prefix)]
    assert len(matches) == 1, prefix
    lines = matches[0].splitlines()
    start = lines.index("        run: |") + 1
    body = []
    for line in lines[start:]:
        if line and not line.startswith("          "):
            break
        body.append(line[10:] if line else "")
    assert body, prefix
    return "\n".join(body) + "\n"


def shell(code, extra=None, cwd=ROOT, check=True):
    result = subprocess.run(
        ["bash", "-euo", "pipefail", "-c", code], cwd=cwd,
        env=os.environ | ENV | (extra or {}), text=True, capture_output=True,
    )
    if check:
        assert result.returncode == 0, result.stdout + result.stderr
    return result


GUARD = step("Fijar y verificar")
ASSEMBLE = step("Ensamblar")
ATTEMPT = step("Registrar intento")
APPLY = step("Aplicar en produccion")
RECONCILE = step("Reconciliar")


def read_receipt(cwd):
    return json.loads((Path(cwd) / "docs/verification/receipt-wms-c3-apply.json").read_text())


def mock_checks():
    for chunk in re.split(r"^      - name: ", TEXT, flags=re.M)[1:]:
        if "        run: |" in chunk:
            code = step(chunk.splitlines()[0])
            syntax = subprocess.run(["bash", "-n"], input=code, text=True, capture_output=True)
            assert syntax.returncode == 0, syntax.stderr
    valid = "postgresql://postgres." + ENV["EXPECTED_DB_PROJECT_REF"] + ":dummy@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
    good = [valid, valid + "?sslmode=require&connect_timeout=10&application_name=ci"]
    bad = [
        valid.replace("postgresql://", "https://"),
        valid.replace(ENV["EXPECTED_DB_PROJECT_REF"], "wrongproject"),
        valid.replace(":5432/", ":6543/"), valid.replace("/postgres", "/otherdb"),
        valid + "?host=example.invalid&user=postgres.other&dbname=other",
        valid + "?options=-csearch_path=other", valid + "?service=other",
        valid + "?sslmode=require&sslmode=disable", valid + "?%68ost=example.invalid",
        valid + "#fragment", "not-a-uri", "",
    ]
    for uri in good:
        assert shell(GUARD, {"PG": uri}, check=False).returncode == 0
    for uri in bad:
        assert shell(GUARD, {"PG": uri}, check=False).returncode != 0
    cases = [
        ("0", "1|6", 0, "COMMITTED", 0),
        ("2", "1|6", 0, "COMMITTED_WITH_CLIENT_ERROR", 1),
        ("3", "0|0", 0, "FAILED_BEFORE_COMMIT", 1),
        ("0", "0|0", 0, "COMMIT_UNKNOWN", 1),
        ("0", "1|0", 0, "COMMIT_UNKNOWN", 1),
        ("0", "", 2, "COMMIT_UNKNOWN", 1),
    ]
    for apply_rc, evidence, read_rc, outcome, expected_exit in cases:
        with tempfile.TemporaryDirectory(prefix="c3-workflow-mock-") as d:
            root = Path(d)
            (root / "bin").mkdir()
            (root / "docs/verification").mkdir(parents=True)
            (root / "docs/verification/receipt-wms-c3-apply.json").write_text('{"status":"ATTEMPT_STARTED"}')
            psql = root / "bin/psql"
            # Mirror command tags: -At alone still emits COMMIT after the data row.
            psql.write_text('#!/bin/sh\ncase "$*" in\n  *-qAt*) printf "%s\\n" "$MOCK_EVIDENCE" ;;\n  *) printf "BEGIN\\nLOCK TABLE\\n%s\\nCOMMIT\\n" "$MOCK_EVIDENCE" ;;\nesac\nexit "$MOCK_READ_RC"\n')
            psql.chmod(0o755)
            extra = {"PATH": str(root / "bin") + ":" + os.environ["PATH"], "PG": "dummy",
                     "PSQL_RC": apply_rc, "MOCK_EVIDENCE": evidence, "MOCK_READ_RC": str(read_rc),
                     "GITHUB_ENV": str(root / "env")}
            result = shell(RECONCILE, extra, cwd=root, check=False)
            assert result.returncode == expected_exit, result.stdout + result.stderr
            assert read_receipt(root)["status"] == outcome
            # A skipped apply must not start psql, even under Actions always().
            no_apply = RECONCILE.replace('if [ -z "${PSQL_RC+x}" ]; then', 'unset PSQL_RC\nif [ -z "${PSQL_RC+x}" ]; then', 1)
            result = shell(no_apply, extra, cwd=root, check=False)
            assert result.returncode != 0
            assert "no se conecta" in result.stdout
    print("PASS: 14 URI cases, six reconciliation outcomes, skipped apply, and shell syntax")


def real_checks():
    assert os.environ.get("PGHOST") in ("127.0.0.1", "localhost", "::1"), "Only loopback"
    assert os.environ.get("PGDATABASE") == "fornexa_apply_test", "Dedicated CI database required"
    assert os.environ.get("CI") == "true", "Real mode is restricted to the disposable CI job"

    def sql(text):
        r = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
                           input=text, text=True, capture_output=True)
        assert r.returncode == 0, r.stderr
        return r.stdout.strip()

    version = sql("select version();")
    assert version.startswith("PostgreSQL 17."), version
    tables = int(sql("select count(*) from pg_tables where schemaname='public';"))
    assert tables == 0 or sql("select to_regclass('public.fornexa_synthetic_test_marker') is not null;") == "t"
    harness = (ROOT / "scripts/wms/verify-c3-postgres.mjs").read_text()
    start = harness.index('  // 1. Setup minimal infrastructure shim')
    shim = harness[start:].split('await runSql(`', 1)[1].split('`);', 1)[0]
    assert "${" not in shim and "create table public.fornexa_synthetic_test_marker" in shim
    migrations = [ROOT / "supabase/migrations/20260819_harden_tenant_access_function.sql",
                  ROOT / "supabase/migrations/20261017110000_wms_e1_core.sql"]

    def reset(policy=False):
        sql(shim)
        for p in migrations:
            sql(p.read_text())
        sql("drop schema if exists supabase_migrations cascade; create schema supabase_migrations; "
            "create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);")
        if policy:
            sql("insert into public.tenants(id,code,name) values ('00000000-0000-4000-8000-000000000011','CI','CI');"
                "insert into public.warehouses(id,tenant_id,code,name) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','CI','CI');"
                "insert into public.warehouse_behavior_policies(tenant_id,warehouse_id,scope,params) values "
                "('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','WAREHOUSE','{\"require_state_control_on_load\":false}');")
        shell(ASSEMBLE, {"ACCEPT_BACKFILL": ""})

    def context(root, rc):
        return {"PG": "", "PSQL_RC": str(rc), "GITHUB_ENV": str(Path(root) / "env"),
                "TARGET_SHA": os.environ.get("GITHUB_SHA", "0" * 40),
                "GITHUB_RUN_ID": os.environ.get("GITHUB_RUN_ID", "local")}

    def resolve(root, rc, expected, expected_exit):
        extra = context(root, rc)
        shell(ATTEMPT, extra, cwd=root)
        r = shell(RECONCILE, extra, cwd=root, check=False)
        assert r.returncode == expected_exit, r.stdout + r.stderr
        receipt = read_receipt(root)
        assert receipt["status"] == expected, receipt
        return receipt

    def wait_for(query):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if sql(query) == "t":
                return
            time.sleep(0.03)
        raise AssertionError("Expected lock state was not observed")

    records = []
    with tempfile.TemporaryDirectory(prefix="c3-workflow-pg17-") as d:
        reset()
        shell(APPLY, context(d, 0), cwd=d)
        records.append(resolve(d, 0, "COMMITTED", 0))
        assert sql("select statements[1] from supabase_migrations.schema_migrations;") == Path('/tmp/c3_body.sql').read_text().strip()
        reset()
        p = Path('/tmp/apply_wms_c3.sql')
        p.write_text(p.read_text().replace('insert into supabase_migrations.schema_migrations', 'select 1/0;\ninsert into supabase_migrations.schema_migrations', 1))
        shell(APPLY, context(d, 0), cwd=d)
        rc = re.findall(r"PSQL_RC=(\d+)", (Path(d) / 'env').read_text())[-1]
        assert rc != "0"
        records.append(resolve(d, rc, "FAILED_BEFORE_COMMIT", 1))

        # Two real sessions: a policy update waits until the migration commits.
        reset(policy=True)
        p = Path('/tmp/apply_wms_c3.sql')
        body = Path('/tmp/c3_body.sql').read_text()
        p.write_text(p.read_text().replace(body, 'select pg_sleep(1.5);\n' + body, 1))
        a = subprocess.Popen(['psql','-X','-q','-v','ON_ERROR_STOP=1','-f',str(p)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
                             env=os.environ | {'PGAPPNAME':'c3_apply_a'})
        wait_for("select exists(select 1 from pg_locks where relation='public.warehouse_behavior_policies'::regclass and mode='ShareRowExclusiveLock' and granted);")
        b = subprocess.Popen(['psql','-X','-q','-v','ON_ERROR_STOP=1','-c',"update public.warehouse_behavior_policies set params='{}';"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
                             env=os.environ | {'PGAPPNAME':'c3_policy_b'})
        wait_for("select exists(select 1 from pg_stat_activity where application_name='c3_policy_b' and wait_event_type='Lock');")
        _, err_a = a.communicate(timeout=10)
        _, err_b = b.communicate(timeout=10)
        assert a.returncode == 0, err_a
        assert b.returncode == 0, err_b
        assert sql("select params::text from public.warehouse_behavior_policies;") == '{}'
        records.append({'case':'W2_TWO_SESSIONS_POLICY_WRITE_BLOCKED','status':'PASS'})

        # Readback must wait for an in-flight DDL transaction, then see its commit.
        reset()
        p = Path('/tmp/apply_wms_c3.sql')
        p.write_text(p.read_text().replace('\nCOMMIT;\n', '\nselect pg_sleep(1.5);\nCOMMIT;\n', 1))
        a = subprocess.Popen(['psql','-X','-q','-v','ON_ERROR_STOP=1','-f',str(p)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        wait_for("select exists(select 1 from pg_locks where relation='public.handling_units'::regclass and mode='AccessExclusiveLock' and granted);")
        extra = context(d, 2) | {'PGAPPNAME':'c3_readback_b'}
        shell(ATTEMPT, extra, cwd=d)
        b = subprocess.Popen(['bash','-euo','pipefail','-c',RECONCILE], cwd=d,
                             env=os.environ | ENV | extra, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        wait_for("select exists(select 1 from pg_stat_activity where application_name='c3_readback_b' and wait_event_type='Lock');")
        _, err_a = a.communicate(timeout=10)
        out_b, err_b = b.communicate(timeout=10)
        assert a.returncode == 0, err_a
        assert b.returncode == 1, out_b + err_b
        assert read_receipt(d)['status'] == 'COMMITTED_WITH_CLIENT_ERROR'
        records.append({'case':'W3_READBACK_WAITS_FOR_DDL_COMMIT','status':'PASS'})

    receipt = {'scope':'DISPOSABLE_PG17_WORKFLOW_ASSEMBLY_AND_RECONCILIATION',
               'production_migration_chain_replayed':False, 'postgres':version,
               'workflow_sha256':hashlib.sha256(WORKFLOW.read_bytes()).hexdigest(),
               'github_run_id':os.environ.get('GITHUB_RUN_ID'),
               'execution_sha':os.environ.get('GITHUB_SHA'), 'cases':records}
    path = ROOT / 'docs/verification/receipt-c3-workflow-pg17.json'
    path.write_text(json.dumps(receipt, indent=2) + '\n')
    print('PASS: real PG17 apply, rollback on SQL failure, W2 lock contention, W3 pending-commit readback')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--postgres', action='store_true')
    args = parser.parse_args()
    mock_checks()
    if args.postgres:
        real_checks()
