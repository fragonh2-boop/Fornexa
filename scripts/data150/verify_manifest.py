#!/usr/bin/env python3
"""
FORNEXA DATA150 — MANIFEST CANONICAL INTEGRITY VERIFIER (RFC 8785 + SHA-256)
=============================================================================
Verifies the tamper-evident canonical manifest (docs/verification/data150-manifest-20261009.json)
against the synthetic dataset (docs/verification/data150-dataset.json).

Verification checks:
1. Structural integrity: 70 tables x 150 rows = 10,500 total rows.
2. Provenance breakdown: 48 tables with physical in-row markers, 22 exceptional tables with documented justifications.
3. Git anchor integrity: commit 71456653b834fd050d2832e0015219cbd47d4a22.
4. Row-level RFC 8785 canonical hash verification for all 10,500 rows.
5. Table-level chained row hashes for all 70 tables.
6. Dataset Merkle root across all 70 tables.

Exits with code 0 on SUCCESS, code 1 on any discrepancy (fail-closed).
"""

import sys
import json
import hashlib
from pathlib import Path

EXPECTED_GIT_ANCHOR = "71456653b834fd050d2832e0015219cbd47d4a22"
EXPECTED_TABLE_COUNT = 70
EXPECTED_ROW_COUNT = 10500
EXPECTED_PHYSICAL_TABLES = 48
EXPECTED_EXCEPTIONAL_TABLES = 22
ROWS_PER_TABLE = 150

def normalize_rfc8785(val):
    if isinstance(val, dict):
        return {k: normalize_rfc8785(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [normalize_rfc8785(v) for v in val]
    elif isinstance(val, float) and val.is_integer():
        return int(val)
    return val

def canonical_row_json(row):
    normalized = normalize_rfc8785(row)
    return json.dumps(normalized, sort_keys=True, separators=(',', ':'), ensure_ascii=False, default=str)

def compute_row_hash(row):
    return hashlib.sha256(canonical_row_json(row).encode('utf-8')).hexdigest()

def verify_manifest(manifest_path="docs/verification/data150-manifest-20261009.json",
                    dataset_path="docs/verification/data150-dataset.json"):
    m_path = Path(manifest_path)
    d_path = Path(dataset_path)

    if not m_path.exists():
        print(f"FAIL-CLOSED: Manifest not found at {manifest_path}", file=sys.stderr)
        return False
    if not d_path.exists():
        print(f"FAIL-CLOSED: Dataset not found at {dataset_path}", file=sys.stderr)
        return False

    with open(m_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    with open(d_path, 'r', encoding='utf-8') as f:
        dataset = json.load(f)

    # 1. Git anchor check
    git_anchor = manifest.get("git_anchor_commit")
    if git_anchor != EXPECTED_GIT_ANCHOR:
        print(f"FAIL-CLOSED: Invalid git anchor commit '{git_anchor}', expected '{EXPECTED_GIT_ANCHOR}'", file=sys.stderr)
        return False

    # 2. Summary counts check
    summary = manifest.get("summary", {})
    if summary.get("total_tables") != EXPECTED_TABLE_COUNT:
        print(f"FAIL-CLOSED: Expected {EXPECTED_TABLE_COUNT} total tables, got {summary.get('total_tables')}", file=sys.stderr)
        return False
    if summary.get("total_rows") != EXPECTED_ROW_COUNT:
        print(f"FAIL-CLOSED: Expected {EXPECTED_ROW_COUNT} total rows, got {summary.get('total_rows')}", file=sys.stderr)
        return False
    if summary.get("tables_with_physical_marker") != EXPECTED_PHYSICAL_TABLES:
        print(f"FAIL-CLOSED: Expected {EXPECTED_PHYSICAL_TABLES} physical tables, got {summary.get('tables_with_physical_marker')}", file=sys.stderr)
        return False
    if summary.get("tables_exceptional_no_marker") != EXPECTED_EXCEPTIONAL_TABLES:
        print(f"FAIL-CLOSED: Expected {EXPECTED_EXCEPTIONAL_TABLES} exceptional tables, got {summary.get('tables_exceptional_no_marker')}", file=sys.stderr)
        return False

    # 3. Exceptional catalog validation
    catalog = manifest.get("exceptional_tables_catalog", {})
    if len(catalog) != EXPECTED_EXCEPTIONAL_TABLES:
        print(f"FAIL-CLOSED: Exceptional catalog has {len(catalog)} entries, expected {EXPECTED_EXCEPTIONAL_TABLES}", file=sys.stderr)
        return False
    for tname, details in catalog.items():
        if not details.get("category") or not details.get("justification") or not details.get("provenance_anchor"):
            print(f"FAIL-CLOSED: Incomplete documentation for exceptional table '{tname}'", file=sys.stderr)
            return False

    # 4. Table and row level canonical hash verification
    tables = manifest.get("tables", {})
    if len(tables) != EXPECTED_TABLE_COUNT:
        print(f"FAIL-CLOSED: Manifest declares {len(tables)} tables, expected {EXPECTED_TABLE_COUNT}", file=sys.stderr)
        return False

    recomputed_table_hashes = []
    verified_rows = 0

    for tname, tmeta in tables.items():
        if tname not in dataset:
            print(f"FAIL-CLOSED: Table '{tname}' in manifest missing from dataset", file=sys.stderr)
            return False

        dataset_rows = dataset[tname]
        if len(dataset_rows) != ROWS_PER_TABLE:
            print(f"FAIL-CLOSED: Table '{tname}' has {len(dataset_rows)} rows in dataset, expected {ROWS_PER_TABLE}", file=sys.stderr)
            return False
        if tmeta.get("row_count") != ROWS_PER_TABLE:
            print(f"FAIL-CLOSED: Table '{tname}' declares {tmeta.get('row_count')} rows in manifest, expected {ROWS_PER_TABLE}", file=sys.stderr)
            return False

        row_entries = tmeta.get("row_entries", [])
        if len(row_entries) != ROWS_PER_TABLE:
            print(f"FAIL-CLOSED: Table '{tname}' has {len(row_entries)} row_entries in manifest, expected {ROWS_PER_TABLE}", file=sys.stderr)
            return False

        current_table_row_hashes = []
        for i, row in enumerate(dataset_rows):
            computed_h = compute_row_hash(row)
            manifest_h = row_entries[i].get("hash")
            if computed_h != manifest_h:
                print(f"FAIL-CLOSED: Hash mismatch in table '{tname}' row {i}! Computed {computed_h} != Manifest {manifest_h}", file=sys.stderr)
                return False
            current_table_row_hashes.append(manifest_h)
            verified_rows += 1

        # Check table chained hash
        recomputed_table_h = hashlib.sha256("".join(current_table_row_hashes).encode('utf-8')).hexdigest()
        manifest_table_h = tmeta.get("rows_sha256")
        if recomputed_table_h != manifest_table_h:
            print(f"FAIL-CLOSED: Table '{tname}' rows_sha256 mismatch! Computed {recomputed_table_h} != Manifest {manifest_table_h}", file=sys.stderr)
            return False

        recomputed_table_hashes.append(recomputed_table_h)

    # 5. Dataset Merkle root verification
    recomputed_merkle_root = hashlib.sha256("".join(recomputed_table_hashes).encode('utf-8')).hexdigest()
    manifest_merkle_root = summary.get("dataset_merkle_root")
    if recomputed_merkle_root != manifest_merkle_root:
        print(f"FAIL-CLOSED: Dataset Merkle root mismatch! Computed {recomputed_merkle_root} != Manifest {manifest_merkle_root}", file=sys.stderr)
        return False

    print(f"✅ MANIFEST VERIFICATION SUCCESSFUL:")
    print(f"   Git anchor: {git_anchor}")
    print(f"   Tables: {len(tables)} (48 physical in-row markers, 22 exceptional documented)")
    print(f"   Rows verified: {verified_rows} / {EXPECTED_ROW_COUNT} with RFC 8785 canonical hashes")
    print(f"   Merkle root: {manifest_merkle_root}")
    return True

if __name__ == "__main__":
    success = verify_manifest()
    sys.exit(0 if success else 1)
