export const dynamic = "force-static";
export const revalidate = false;

export default function SchemaCapabilityProofPage() {
  const candidates = [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL"
  ];
  const available = Object.fromEntries(candidates.map((name) => [name, Boolean(process.env[name])]));
  const proof = { available };
  console.log("SCHEMA_CAPABILITY_PROOF", JSON.stringify(proof));
  return <pre id="schema-capability-proof">{JSON.stringify(proof, null, 2)}</pre>;
}
