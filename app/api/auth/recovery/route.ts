import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { escapeEmailHtml, sendEmail } from "@/lib/email-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function noStore<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return noStore(NextResponse.json({ ok: true }));
  }

  // Keep the response deliberately generic to avoid account enumeration.
  if (!emailPattern.test(email)) {
    return noStore(NextResponse.json({ ok: true }));
  }

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      if (error) console.warn("Recovery link generation failed", { status: error.status, name: error.name });
      return noStore(NextResponse.json({ ok: true }));
    }

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const confirmationUrl = new URL("/auth/confirm", appOrigin);
    confirmationUrl.searchParams.set("token_hash", data.properties.hashed_token);
    confirmationUrl.searchParams.set("type", "recovery");

    const safeUrl = escapeEmailHtml(confirmationUrl.toString());
    await sendEmail({
      to: [email],
      subject: "Restablece tu contraseña de FORNEXA",
      tags: [
        { name: "source", value: "fornexa-auth" },
        { name: "type", value: "password-recovery" },
      ],
      html: `<div style="background:#f4f7fb;padding:32px;font-family:Arial,sans-serif;color:#102033"><div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #dbe4ef;border-radius:16px;overflow:hidden"><div style="background:#07111f;color:#ffffff;padding:28px"><strong style="font-size:24px">FORNEXA</strong><p style="margin:8px 0 0;color:#66e6bd">Supply Chain Suite</p></div><div style="padding:30px;line-height:1.6"><h2 style="margin-top:0;color:#102033">Restablecer contraseña</h2><p>Hemos recibido una solicitud para crear una nueva contraseña para tu cuenta de FORNEXA.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#00679a;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px">Crear nueva contraseña</a></p><p style="color:#66758a;font-size:13px">Si no has solicitado este cambio, puedes ignorar este correo. El enlace es de un solo uso.</p></div></div></div>`,
    });
  } catch (error) {
    console.error("Recovery request failed", error instanceof Error ? { name: error.name, message: error.message } : { message: "unknown" });
  }

  return noStore(NextResponse.json({ ok: true }));
}
