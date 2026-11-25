import { getAuthenticatedContext } from "@/lib/auth-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ticketIdPattern } from "@/lib/user-tickets";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthenticatedContext();
  if (!auth) return new Response(null, { status: 401 });
  if (!ticketIdPattern.test(id)) return new Response(null, { status: 404 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("user_tickets")
    .select("attachment_name,attachment_data").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();

  if (error) return new Response(null, { status: 500 });
  if (!data?.attachment_name || typeof data.attachment_data !== "string") return new Response(null, { status: 404 });
  if (!/^\\x(?:[0-9a-f]{2})+$/i.test(data.attachment_data)) return new Response(null, { status: 500 });

  const filename = encodeURIComponent(data.attachment_name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  return new Response(new Uint8Array(Buffer.from(data.attachment_data.slice(2), "hex")), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
