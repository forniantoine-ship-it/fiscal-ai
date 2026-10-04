/**
 * MB-DEV-SCHEMA-BASELINE-IMPLEMENT-3A — STATIC proofs of the canonical Supabase baseline.
 *
 * These tests read the SQL files only. They do NOT apply anything anywhere: a clean replay on a
 * real Postgres/Supabase (and the runtime behaviour of triggers, grants and RLS) is NOT proven here
 * and is covered by supabase/tests/canonical_baseline_replay.sql, to be run after `supabase db reset`.
 *
 * The privilege tests replay every migration's GRANT/REVOKE statements in order against the WORST
 * case initial state (a table is created with ALL privileges for anon, authenticated and
 * service_role, as the platform default privileges do) and assert the final effective matrix.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/canonical-baseline-migrations.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

const BASE = "20260526100000_base_lmnp_dossiers_documents.sql";
const BUSINESS_ASSETS = "20260531100000_business_assets.sql";
const NO_DOWNGRADE = "20261001120000_lmnp_snapshot_schema_no_downgrade.sql";
const TRANSITION = "20260921120000_lmnp_fiscal_year_transition.sql";
const CLEANUP = "20261002100000_drop_obsolete_work_groups_business_assets.sql";
const HARDENING = "20261002110000_acl_rls_hardening.sql";
const DEFAULT_PRIVS = "20261002120000_default_privileges_hardening.sql";

const HISTORICAL = [
  "20260527120000_extracted_document_data.sql",
  "20260528120000_classification_versions.sql",
  "20260528140000_document_classification_fields.sql",
  BUSINESS_ASSETS,
  "20260919100000_lmnp_declaration_payments.sql",
  "20260919100100_lmnp_dossiers_owner_rls.sql",
  "20260920100000_documents_owner_rls.sql",
  "20260920120000_lmnp_workspace_snapshots.sql",
  "20260920140000_lmnp_documents_storage_owner_rls.sql",
  "20260921100000_documents_fiscal_year.sql",
  TRANSITION,
  NO_DOWNGRADE,
];

const raw = (f: string) => readFileSync(path.join(MIGRATIONS, f), "utf8");
/** Executable SQL, lower-cased, `--` comments removed. */
const code = (f: string) => raw(f).split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").toLowerCase();

/** The `create table` body of `public.<table>` in a file. */
function tableBody(f: string, table: string): string {
  const m = code(f).match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  assert.ok(m, `create table public.${table} in ${f}`);
  return m[1];
}
const columnLine = (body: string, col: string): string => {
  const line = body.split("\n").map((l) => l.trim().replace(/,$/, "")).find((l) => l.startsWith(`${col} `));
  assert.ok(line, `column ${col}`);
  return line;
};

describe("BASE — canonical lmnp_dossiers / documents", () => {
  it("1. the base migration sorts before 20260527120000 and is the first migration", () => {
    assert.ok(BASE < "20260527120000");
    assert.equal(files[0], BASE);
  });

  it("2/3/4/5. lmnp_dossiers canonical columns, no accidental default, user_id NOT NULL, no auth.users FK", () => {
    const body = tableBody(BASE, "lmnp_dossiers");
    assert.equal(columnLine(body, "id"), "id uuid primary key default gen_random_uuid()");
    assert.equal(columnLine(body, "created_at"), "created_at timestamptz not null default now()");
    for (const col of ["status", "city", "lmnp_type"]) {
      assert.equal(columnLine(body, col), `${col} text not null`, `${col} TEXT NOT NULL, no default`);
    }
    assert.equal(columnLine(body, "user_id"), "user_id uuid not null");
    assert.equal((body.match(/default now\(\)/g) ?? []).length, 1, "now() default only on created_at");
    assert.doesNotMatch(body, /auth\.users|references/, "no foreign key at all on lmnp_dossiers");
    assert.doesNotMatch(body, /active_fiscal_year/, "active_fiscal_year stays with the transition migration");
    assert.match(code(BASE), /alter table public\.lmnp_dossiers enable row level security/);
  });

  it("6-12. documents canonical columns, NOT NULL, FK NO ACTION, no property_id FK, dossier index", () => {
    const body = tableBody(BASE, "documents");
    assert.equal(columnLine(body, "id"), "id uuid primary key default gen_random_uuid()");
    assert.equal(columnLine(body, "created_at"), "created_at timestamptz not null default now()");
    assert.equal(
      columnLine(body, "dossier_id"),
      "dossier_id uuid not null references public.lmnp_dossiers(id) on delete no action",
    );
    assert.equal(columnLine(body, "user_id"), "user_id uuid not null");
    assert.equal(columnLine(body, "file_name"), "file_name text not null");
    assert.equal(columnLine(body, "file_path"), "file_path text not null");
    assert.equal(columnLine(body, "document_type"), "document_type text");
    assert.equal(columnLine(body, "extraction_status"), "extraction_status text", "no default, no check");
    assert.doesNotMatch(body, /check|auth\.users/);
    assert.doesNotMatch(body, /fiscal_year|document_role|property_id/, "later columns stay in migration 20260921100000");
    assert.equal((body.match(/references/g) ?? []).length, 1, "exactly one FK (dossier)");
    assert.match(code(BASE), /alter table public\.documents enable row level security/);
    assert.match(code(BASE), /create index if not exists documents_dossier_id_idx\s+on public\.documents \(dossier_id\)/);
    // property_id: introduced by the historical migration without any relational FK, never added later.
    for (const f of files) {
      if (f === BUSINESS_ASSETS) continue; // obsolete tables only; removed by the cleanup migration
      assert.doesNotMatch(code(f), /property_id\s+uuid[^,;]*\breferences\b|foreign key\s*\(property_id\)/, f);
    }
    assert.doesNotMatch(code("20260921100000_documents_fiscal_year.sql"), /\breferences\s+(public\.)?\w+\s*\(|foreign key/);
  });

  it("the base migration is a no-op on an existing project (never alters, never drops)", () => {
    const sql = code(BASE);
    assert.doesNotMatch(sql, /alter table public\.\w+ (alter|add|drop)/);
    assert.doesNotMatch(sql, /drop |truncate |delete from/);
  });

  it("every base dependency of the historical chain is provided by the base", () => {
    const dossiers = tableBody(BASE, "lmnp_dossiers");
    const documents = tableBody(BASE, "documents");
    for (const col of ["id", "user_id", "status", "city", "lmnp_type", "created_at"]) columnLine(dossiers, col);
    for (const col of ["id", "user_id", "dossier_id", "file_name", "file_path", "extraction_status", "created_at"]) {
      columnLine(documents, col);
    }
  });
});

describe("HISTORY — historical migrations are unchanged", () => {
  it("lists exactly the 12 historical migrations plus the 4 new ones", () => {
    assert.deepEqual(files, [BASE, ...HISTORICAL, CLEANUP, HARDENING, DEFAULT_PRIVS].sort());
  });

  it("new corrective migrations all sort after the anti-downgrade migration 20261001120000", () => {
    for (const f of [CLEANUP, HARDENING, DEFAULT_PRIVS]) assert.ok(f > NO_DOWNGRADE);
    assert.ok(CLEANUP < HARDENING && HARDENING < DEFAULT_PRIVS);
  });
});

describe("OBSOLETE — migration 4 replay and cleanup", () => {
  it("16. migration 4 only depends on objects the base provides (static dependency proof)", () => {
    const sql = code(BUSINESS_ASSETS);
    const refs = [...sql.matchAll(/references (\w+)\((\w+)\)/g)].map((m) => `${m[1]}.${m[2]}`);
    assert.deepEqual([...new Set(refs)].sort(), ["documents.id", "lmnp_dossiers.id"]);
    const tables = [...sql.matchAll(/(?:from|join) (lmnp_dossiers|documents)\b/g)].map((m) => m[1]);
    assert.ok(tables.every((t) => t === "lmnp_dossiers"), "policy sub-queries only read lmnp_dossiers");
    assert.match(sql, /select id from lmnp_dossiers where user_id = auth\.uid\(\)/);
    // referenced columns exist in the base, and are primary keys (required for an FK target)
    assert.match(columnLine(tableBody(BASE, "lmnp_dossiers"), "id"), /primary key/);
    assert.match(columnLine(tableBody(BASE, "documents"), "id"), /primary key/);
  });

  it("nothing but migration 4 and the cleanup references the obsolete tables (repo-wide)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx|sql|mjs|js)$/.test(e.name) && full !== __filename && !full.includes("canonical_baseline")) {
          if (/\b(work_groups|business_assets)\b/.test(readFileSync(full, "utf8"))) hits.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, "src"));
    walk(path.join(ROOT, "scripts"));
    walk(path.join(ROOT, "supabase"));
    assert.deepEqual(hits.sort(), [`supabase/migrations/${BUSINESS_ASSETS}`, `supabase/migrations/${CLEANUP}`].sort());
  });

  it("17/18. the corrective migration drops both tables, IF EXISTS, with no cascade", () => {
    const sql = code(CLEANUP);
    assert.match(sql, /drop table if exists public\.work_groups;/);
    assert.match(sql, /drop table if exists public\.business_assets;/);
    assert.doesNotMatch(sql, /cascade/);
    assert.doesNotMatch(sql, /\bdelete from\b|\btruncate\b/);
  });

  it("19. cleanup refuses non-empty obsolete tables, before any drop", () => {
    const sql = code(CLEANUP);
    assert.match(sql, /select count\(\*\) from public\.work_groups/);
    assert.match(sql, /select count\(\*\) from public\.business_assets/);
    assert.match(sql, /raise exception 'obsolete_tables_not_empty/);
    assert.ok(sql.indexOf("raise exception") < sql.indexOf("drop table"), "guard runs before the first drop");
    assert.match(sql, /to_regclass\('public\.work_groups'\) is not null/, "safe when the table is absent");
  });
});

// ---------------------------------------------------------------------------------------------
// ACL simulation
// ---------------------------------------------------------------------------------------------
type Role = "anon" | "authenticated" | "service_role" | "public";
const PRIVS = ["select", "insert", "update", "delete", "truncate", "references", "trigger"] as const;
type Priv = (typeof PRIVS)[number];
const CLIENTS: Role[] = ["anon", "authenticated"];

type TableAcl = Record<Role, Set<Priv>> & { insertCols: Record<Role, Set<string>> };
const tables = new Map<string, TableAcl>();
const functions = new Map<string, Record<Role, boolean>>();

function newAcl(): TableAcl {
  const full = () => new Set<Priv>(PRIVS);
  return {
    anon: full(), authenticated: full(), service_role: full(), public: new Set<Priv>(),
    insertCols: { anon: new Set(), authenticated: new Set(), service_role: new Set(), public: new Set() },
  };
}

/** SQL with dollar-quoted bodies replaced, so statements can be split on `;`. */
function statements(f: string): string[] {
  return code(f).replace(/\$\$[\s\S]*?\$\$/g, "$$$$").split(";").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
}
const parseRoles = (s: string): Role[] => s.split(",").map((r) => r.trim() as Role);
function parsePrivs(list: string): { privs: Priv[]; cols: string[] | null } {
  if (list === "all" || list === "all privileges") return { privs: [...PRIVS], cols: null };
  const colMatch = list.match(/^(\w+) ?\(([^)]*)\)$/);
  if (colMatch) return { privs: [colMatch[1] as Priv], cols: colMatch[2].split(",").map((c) => c.trim()) };
  return { privs: list.split(",").map((p) => p.trim() as Priv), cols: null };
}

/** Argument TYPES of a `create function` (text right after the opening parenthesis), names/defaults removed. */
function functionArgTypes(afterOpenParen: string): string {
  let depth = 1;
  let end = 0;
  for (; end < afterOpenParen.length && depth > 0; end++) {
    if (afterOpenParen[end] === "(") depth++;
    else if (afterOpenParen[end] === ")") depth--;
  }
  const list = afterOpenParen.slice(0, end - 1);
  const parts: string[] = [];
  let cur = "";
  depth = 0;
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.replace(/ default .*$/, "").trim().split(" ").slice(1).join(" ")).join(", ");
}

function replay(): void {
  tables.clear();
  functions.clear();
  for (const f of files) {
    for (const st of statements(f)) {
      const create = st.match(/^create table (?:if not exists )?(?:public\.)?(\w+) \(/);
      if (create) { if (!tables.has(create[1])) tables.set(create[1], newAcl()); continue; }
      const drop = st.match(/^drop table (?:if exists )?(?:public\.)?(\w+)$/);
      if (drop) { tables.delete(drop[1]); continue; }
      const createFn = st.match(/^create (?:or replace )?function (?:public\.)?(\w+) ?\(/);
      if (createFn) {
        const key = `${createFn[1]}(${functionArgTypes(st.slice(createFn[0].length))})`;
        // worst case: PUBLIC default EXECUTE plus the Supabase role grants
        if (!functions.has(key)) functions.set(key, { anon: true, authenticated: true, service_role: true, public: true });
        continue;
      }
      const fnAcl = st.match(/^(revoke|grant) (?:all|execute) on function (?:public\.)?(\w+) ?\(([^)]*)\) (from|to) (.+)$/);
      if (fnAcl) {
        const key = `${fnAcl[2]}(${fnAcl[3].split(",").map((t) => t.trim()).filter(Boolean).join(", ")})`;
        const acl = functions.get(key);
        assert.ok(acl, `function ${key} exists when its privileges are changed`);
        for (const r of parseRoles(fnAcl[5])) acl[r] = fnAcl[1] === "grant";
        continue;
      }
      const m = st.match(/^(revoke|grant) (.+?) on (?:table )?(?:public\.)?(\w+) (from|to) (.+)$/);
      if (!m || m[3] === "function") continue;
      const acl = tables.get(m[3]);
      if (!acl) continue; // non-table objects (schemas, sequences)
      const { privs, cols } = parsePrivs(m[2]);
      for (const role of parseRoles(m[5])) {
        for (const p of privs) {
          if (m[1] === "revoke") {
            acl[role].delete(p);
            if (p === "insert") acl.insertCols[role].clear(); // table REVOKE also revokes column privileges
          } else if (cols) {
            for (const c of cols) acl.insertCols[role].add(c);
          } else {
            acl[role].add(p);
          }
        }
      }
    }
  }
}
replay();
const acl = (t: string): TableAcl => { const a = tables.get(t); assert.ok(a, `table ${t} exists after replay`); return a; };
const effective = (t: string, role: Role): string => [...acl(t)[role]].sort().join(",");

describe("SECURITY — final effective privileges after replaying every migration (worst-case defaults)", () => {
  const APP = ["lmnp_dossiers", "documents", "extracted_document_data", "lmnp_workspace_snapshots", "lmnp_declaration_payments"];

  it("the final schema has exactly the five canonical application tables", () => {
    assert.deepEqual([...tables.keys()].sort(), [...APP].sort());
  });

  it("20. anon holds no privilege of any kind on any application table", () => {
    for (const t of APP) {
      assert.equal(effective(t, "anon"), "", `anon on ${t}`);
      assert.equal(acl(t).insertCols.anon.size, 0, `anon column grants on ${t}`);
    }
  });

  it("21/22/23. no client role keeps DELETE, TRUNCATE, REFERENCES or TRIGGER anywhere", () => {
    for (const t of APP) for (const r of CLIENTS) {
      for (const p of ["delete", "truncate", "references", "trigger"] as Priv[]) {
        assert.ok(!acl(t)[r].has(p), `${r} must not hold ${p} on ${t}`);
      }
    }
  });

  it("24. extracted_document_data: no client access", () => {
    assert.equal(effective("extracted_document_data", "authenticated"), "");
    assert.equal(acl("extracted_document_data").insertCols.authenticated.size, 0);
  });

  it("25. service_role keeps full privileges on every application table", () => {
    for (const t of APP) assert.equal(effective(t, "service_role"), [...PRIVS].sort().join(","), t);
  });

  it("26. payments: authenticated SELECT only", () => {
    assert.equal(effective("lmnp_declaration_payments", "authenticated"), "select");
  });

  it("27. dossiers: authenticated SELECT, INSERT only through the four approved columns", () => {
    assert.equal(effective("lmnp_dossiers", "authenticated"), "select", "no table-level insert");
    assert.deepEqual([...acl("lmnp_dossiers").insertCols.authenticated].sort(), ["city", "lmnp_type", "status", "user_id"]);
  });

  it("28. active_fiscal_year (and id / created_at) are not client-insertable (static: column grants)", () => {
    const cols = acl("lmnp_dossiers").insertCols.authenticated;
    for (const c of ["active_fiscal_year", "id", "created_at"]) assert.ok(!cols.has(c), c);
    assert.ok(!acl("lmnp_dossiers").authenticated.has("insert"));
  });

  it("documents: authenticated SELECT + INSERT; snapshots: SELECT + INSERT + UPDATE", () => {
    assert.equal(effective("documents", "authenticated"), "insert,select");
    assert.equal(effective("lmnp_workspace_snapshots", "authenticated"), "insert,select,update");
  });
});

describe("FUNCTIONS — EXECUTE privileges", () => {
  const exec = (name: string) => {
    const hit = [...functions.entries()].find(([k]) => k.startsWith(`${name}(`));
    assert.ok(hit, `function ${name}`);
    return hit[1];
  };

  it("34/35/36. transition RPC: service_role only", () => {
    const a = exec("lmnp_commit_fiscal_year_transition");
    assert.deepEqual(a, { anon: false, authenticated: false, service_role: true, public: false });
  });

  it("37. trigger functions: not executable by PUBLIC, anon or authenticated", () => {
    for (const n of ["lmnp_prevent_reopen_closed_snapshot", "lmnp_prevent_snapshot_schema_downgrade"]) {
      const a = exec(n);
      assert.equal(a.public, false, n);
      assert.equal(a.anon, false, n);
      assert.equal(a.authenticated, false, n);
    }
  });

  it("the three application functions are the only functions defined", () => {
    assert.deepEqual([...functions.keys()].map((k) => k.split("(")[0]).sort(), [
      "lmnp_commit_fiscal_year_transition", "lmnp_prevent_reopen_closed_snapshot", "lmnp_prevent_snapshot_schema_downgrade",
    ]);
  });
});

describe("POLICIES — hardening migration", () => {
  const sql = code(HARDENING);

  it("extracted_document_data: RLS on, every policy dropped, none created", () => {
    assert.match(sql, /alter table public\.extracted_document_data enable row level security/);
    assert.match(sql, /tablename = 'extracted_document_data'/);
    assert.doesNotMatch(sql, /create policy[^;]*extracted_document_data/);
  });

  it("payments: authenticated-only SELECT with the unchanged ownership predicate", () => {
    assert.match(
      sql,
      /create policy lmnp_declaration_payments_owner_select\s+on public\.lmnp_declaration_payments\s+for select to authenticated\s+using \(\s+dossier_id in \(select id from public\.lmnp_dossiers where user_id = auth\.uid\(\)\)\s+\)/,
    );
    assert.doesNotMatch(sql, /create policy[^;]*for (insert|update|delete|all)/);
  });

  it("drops the accidental text defaults, and never imposes DEV-side NOT NULL / FK", () => {
    for (const c of ["status", "city", "lmnp_type"]) {
      assert.match(sql, new RegExp(`alter table public\\.lmnp_dossiers alter column ${c} drop default`));
    }
    assert.doesNotMatch(sql, /set not null|add constraint|foreign key|references public\./);
  });

  it("keeps lmnp_dossiers / documents / snapshots / storage policies untouched", () => {
    assert.doesNotMatch(sql, /policy [^;]*? on (public\.)?(lmnp_dossiers|documents|lmnp_workspace_snapshots|storage\.objects)\b/);
    assert.doesNotMatch(sql, /storage\.buckets/);
  });

  it("does not hard-code any project reference or credential", () => {
    for (const f of [BASE, CLEANUP, HARDENING, DEFAULT_PRIVS]) {
      assert.doesNotMatch(raw(f), /jviyqblcjuqennfvgrdg|service_role_key|eyJ[A-Za-z0-9_-]{10,}|sk_(live|test)_/i);
    }
  });
});

describe("DEFAULT PRIVILEGES — safe, narrow scope", () => {
  const sql = code(DEFAULT_PRIVS);
  const stmts = statements(DEFAULT_PRIVS);

  it("39. revokes future table, sequence and function privileges of anon/authenticated for postgres in public", () => {
    assert.deepEqual(stmts, [
      "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated",
      "alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated",
      "alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated",
    ]);
  });

  it("40. touches no Supabase-managed schema or role, and no global/PUBLIC default", () => {
    for (const s of stmts) assert.match(s, /for role postgres in schema public/);
    assert.doesNotMatch(sql, /supabase_admin|\bauth\b|storage|extensions|realtime|vault|from public/);
    assert.doesNotMatch(sql, /service_role/);
  });

  it("documents why PUBLIC function defaults need care and the pg_default_acl precondition", () => {
    const text = raw(DEFAULT_PRIVS);
    assert.match(text, /PUBLIC/);
    assert.match(text, /GLOBAL default/);
    assert.match(text, /pg_default_acl/);
  });
});

describe("SNAPSHOT TRIGGERS — static structure (runtime behaviour: supabase/tests/canonical_baseline_replay.sql)", () => {
  const reopen = code(TRANSITION);
  const downgrade = code(NO_DOWNGRADE);

  it("29. both BEFORE UPDATE row triggers coexist on lmnp_workspace_snapshots, reopen sorting first", () => {
    assert.match(reopen, /create trigger trg_lmnp_prevent_reopen_closed_snapshot\s+before update on public\.lmnp_workspace_snapshots\s+for each row/);
    assert.match(downgrade, /create trigger trg_lmnp_prevent_snapshot_schema_downgrade\s+before update on public\.lmnp_workspace_snapshots\s+for each row/);
    // PostgreSQL fires same-event triggers in alphabetical order of their names.
    assert.ok("trg_lmnp_prevent_reopen_closed_snapshot" < "trg_lmnp_prevent_snapshot_schema_downgrade");
  });

  it("30. schema downgrade rejected", () => {
    assert.match(downgrade, /new\.schema_version < old\.schema_version/);
    assert.match(downgrade, /raise exception 'lmnp_snapshot_schema_downgrade/);
  });

  it("31/32/33. closed snapshot: no reopen, immutable, identical no-op writes allowed", () => {
    assert.match(reopen, /if old\.closed_at is not null then/);
    assert.match(reopen, /new\.closed_at is null then\s+raise exception 'lmnp_snapshot_closed: cannot reopen/);
    for (const col of ["payload", "revision", "schema_version", "successor_fiscal_year", "closed_at"]) {
      assert.match(reopen, new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    assert.match(reopen, /raise exception 'lmnp_snapshot_closed: closed snapshot is immutable/);
  });

  it("neither trigger rewrites NEW, so execution order cannot change the stored row", () => {
    for (const sql of [reopen, downgrade]) assert.doesNotMatch(sql, /new\.\w+ *:=/);
  });

  it("38. trigger functions need no SECURITY DEFINER and the hardening does not alter them", () => {
    assert.doesNotMatch(downgrade, /security definer/);
    assert.doesNotMatch(code(HARDENING), /create (or replace )?function|drop (trigger|function)/);
  });
});

describe("RUNTIME — compatibility with the canonical base", () => {
  const SRC = path.join(ROOT, "src");
  const walkTs = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkTs(full, out);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const sources = walkTs(SRC).map((f) => ({ file: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

  it("13. the only production insert into `documents` is uploadDocument, which aborts without a valid dossier_id", () => {
    const writers = sources.filter((s) => /from\(\s*["'`]documents["'`]\s*\)\s*\.(insert|upsert)\(/.test(s.text.replace(/\n\s*/g, "")));
    assert.deepEqual(writers.map((w) => w.file), ["src/lib/uploadDocument.ts"]);
    const upload = sources.find((s) => s.file === "src/lib/uploadDocument.ts")!.text;
    assert.match(upload, /if \(!dossierId\) \{[\s\S]*?return null;/);
    assert.match(upload, /dossier_id: input\.dossierId/);
  });

  it("13. every uploadFilesForUser caller passes a dossierId (never undefined)", () => {
    const callers = sources.filter((s) => /await uploadFilesForUser\(/.test(s.text) && s.file !== "src/lib/uploadDocument.ts");
    assert.ok(callers.length >= 10, `expected the upload call sites, found ${callers.length}`);
    for (const c of callers) {
      const i = c.text.search(/await uploadFilesForUser\(/);
      assert.match(c.text.slice(i, i + 400), /dossierId: [^,]*\?\? ""/, c.file);
    }
  });

  it("14/15. dossier creation supplies exactly the D1/D2 fields and never active_fiscal_year", () => {
    const text = sources.find((s) => s.file === "src/lib/lmnp/dossier/supabase-dossier.ts")!.text;
    const insert = text.match(/\.insert\(\{([\s\S]*?)\}\)/);
    assert.ok(insert);
    const keys = [...insert[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    assert.deepEqual(keys, ["user_id", "status", "city", "lmnp_type"]);
    assert.doesNotMatch(insert[1], /active_fiscal_year/);
    const writers = sources.filter((s) => /from\(\s*["']lmnp_dossiers["']\s*\)\s*\.(insert|upsert|update)\(/.test(s.text.replace(/\n\s*/g, "")));
    assert.deepEqual(writers.map((w) => w.file), ["src/lib/lmnp/dossier/supabase-dossier.ts"]);
  });

  it("no browser path touches extracted_document_data (every access is server-side)", () => {
    const users = sources.filter((s) => /from\(\s*["']extracted_document_data["']\s*\)/.test(s.text.replace(/\n\s*/g, "")));
    for (const u of users) {
      assert.doesNotMatch(u.text, /from "@\/lib\/supabase"/, `${u.file} must not use the browser client`);
    }
    assert.ok(users.length > 0);
  });
});
