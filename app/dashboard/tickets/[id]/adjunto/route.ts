import { getAuthenticatedContext } from "@/lib/auth-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ticketAttachmentIdPattern, ticketIdPattern, ticketScreenshotTypes, type TicketAttachment } from "@/lib/user-tickets";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthenticatedContext();
  if (!auth) return new Response(null, { status: 401 });
  if (!ticketIdPattern.test(id)) return new Response(null, { status: 404 });

  const supabase = await createServerSupabaseClient();
  const attachmentId = new URL(request.url).searchParams.get("archivo");
  if (attachmentId !== null) {
    if (!ticketAttachmentIdPattern.test(attachmentId)) return new Response(null, { status: 404 });
    const { data, error } = await supabase.from("user_tickets")
      .select(`attachments,payload:attachment_payloads->>${attachmentId}`)
      .eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle()
      .overrideTypes<{ attachments: TicketAttachment[]; payload: string | null }, { merge: false }>();
    if (error) return new Response(null, { status: 500 });
    const file = data?.attachments.find((entry) => entry.id === attachmentId);
    if (!file || typeof data?.payload !== "string") return new Response(null, { status: 404 });

    const bytes = Buffer.from(data.payload, "base64");
    const imageType = ticketScreenshotTypes.find((type) => type === file.imageType);
    return attachmentResponse(file.name, bytes, imageType);
  }

  const { data, error } = await supabase.from("user_tickets")
    .select("attachment_name,attachment_data").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();

  if (error) return new Response(null, { status: 500 });
  if (!data?.attachment_name || typeof data.attachment_data !== "string") return new Response(null, { status: 404 });
  if (!/^\\x(?:[0-9a-f]{2})+$/i.test(data.attachment_data)) return new Response(null, { status: 500 });

  return attachmentResponse(data.attachment_name, Buffer.from(data.attachment_data.slice(2), "hex"));
}

function attachmentResponse(name: string, bytes: Buffer, imageType?: string) {
  const filename = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": imageType ?? "application/octet-stream",
      "Content-Disposition": `${imageType ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
