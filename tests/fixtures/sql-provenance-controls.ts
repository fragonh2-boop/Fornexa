export type SqlProvenanceControl = {
  name: string;
  gitSql: string;
  remoteSql: string[];
  equivalent: boolean;
};

const base = `
  create table public.audit_sample (id bigint primary key, label text);
  insert into public.audit_sample (id, label) values (1, 'alpha beta -- data');
  create function public.audit_sample_fn() returns void language plpgsql as $$
  begin
    perform 1;
  end
  $$;
`;

export const sqlProvenanceControls: SqlProvenanceControl[] = [
  {
    name: "comments and external whitespace are presentation-only",
    gitSql: base,
    remoteSql: [
      "-- note\ncreate table public.audit_sample(id bigint primary key,label text);",
      "insert into public.audit_sample(id,label) values(1,'alpha beta -- data');",
      "create function public.audit_sample_fn() returns void language plpgsql as $$\n  begin\n    perform 1;\n  end\n  $$;",
    ],
    equivalent: true,
  },
  {
    name: "removing a statement is executable drift",
    gitSql: base,
    remoteSql: [base.replace("create table public.audit_sample (id bigint primary key, label text);", "")],
    equivalent: false,
  },
  {
    name: "permuting statements is executable drift",
    gitSql: "create table a(id bigint); create table b(id bigint);",
    remoteSql: ["create table b(id bigint); create table a(id bigint);"],
    equivalent: false,
  },
  {
    name: "whitespace inside a literal is data",
    gitSql: "select 'alpha beta';",
    remoteSql: ["select 'alphabeta';"],
    equivalent: false,
  },
  {
    name: "line-comment markers inside a literal are data",
    gitSql: "select '-- keep';",
    remoteSql: ["select '-- change';"],
    equivalent: false,
  },
  {
    name: "a byte inside a dollar body is data",
    gitSql: "create function f() returns void language plpgsql as $$ begin null; end $$;",
    remoteSql: ["create function f() returns void language plpgsql as $$ begin null; end! $$;"],
    equivalent: false,
  },
  {
    name: "case inside a literal is data",
    gitSql: "select 'Alpha';",
    remoteSql: ["select 'alpha';"],
    equivalent: false,
  },
];
