import { z } from "zod";
const telegramSchema = z
  .object({ token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/) })
  .strict();
const whatsappSchema = z
  .object({
    token: z
      .string()
      .min(10)
      .regex(/^[^\r\n]+$/),
    phone_id: z.string().regex(/^\d+$/),
    version: z.string().regex(/^v\d+\.\d+$/),
    template: z.string().regex(/^[a-z0-9_]+$/),
    language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
  })
  .strict();
export function channelConfig(
  school: string,
  kind: "telegram" | "whatsapp",
  source: Partial<NodeJS.ProcessEnv> = process.env,
) {
  try {
    const schools = z
      .record(z.uuid(), z.record(z.string(), z.unknown()))
      .parse(JSON.parse(source.LMS_CHANNEL_CONFIG_JSON ?? "{}"));
    if (kind === "telegram")
      return {
        ...telegramSchema.parse(schools[school]?.[kind]),
        kind: "telegram" as const,
      };
    return {
      ...whatsappSchema.parse(schools[school]?.[kind]),
      kind: "whatsapp" as const,
    };
  } catch {
    throw new Error(
      "Kredensial kanal sekolah belum dikonfigurasi dengan benar.",
    );
  }
}
export function channelReadiness(
  school: string,
  source: Partial<NodeJS.ProcessEnv> = process.env,
) {
  return Object.fromEntries(
    (["telegram", "whatsapp"] as const).map((kind) => {
      try {
        channelConfig(school, kind, source);
        return [
          kind,
          {
            ready: Boolean(source.SUPABASE_SECRET_KEY),
            message: source.SUPABASE_SECRET_KEY
              ? "Konfigurasi server tersedia."
              : "Kredensial layanan server belum tersedia.",
          },
        ];
      } catch {
        return [
          kind,
          {
            ready: false,
            message:
              "Kredensial penyedia belum dikonfigurasi untuk sekolah ini.",
          },
        ];
      }
    }),
  ) as Record<"telegram" | "whatsapp", { ready: boolean; message: string }>;
}
export function validateChannelText(
  kind: "telegram" | "whatsapp",
  text: string,
) {
  if (!text.trim() || text.length > (kind === "whatsapp" ? 1024 : 4096))
    throw new Error(
      `Pesan ${kind === "whatsapp" ? "WhatsApp" : "Telegram"} maksimal ${kind === "whatsapp" ? 1024 : 4096} karakter termasuk judul.`,
    );
}
/** External notifications link back to the complete message in the LMS. */
export function channelMessage(
  kind: "telegram" | "whatsapp",
  subject: string,
  body: string,
  course: string,
) {
  if (!z.uuid().safeParse(course).success)
    throw new Error("Kelas notifikasi tidak valid.");
  const text = `${subject}\n\n${body}`,
    footer = `\n\nBuka LMS: https://lms-nurul-falah.vercel.app/pembelajaran/${course}`;
  const limit = kind === "whatsapp" ? 1024 : 4096;
  let summary = text;
  if (summary.length + footer.length > limit) {
    summary = summary.slice(0, limit - footer.length - 1);
    if (/[\uD800-\uDBFF]$/.test(summary)) summary = summary.slice(0, -1);
    summary = summary.trimEnd() + "…";
  }
  return summary + footer;
}
export async function sendChannel(
  school: string,
  kind: "telegram" | "whatsapp",
  destination: string,
  text: string,
  fetcher: typeof fetch = fetch,
  source: Partial<NodeJS.ProcessEnv> = process.env,
) {
  validateChannelText(kind, text);
  const config = channelConfig(school, kind, source);
  let url: string,
    body: unknown,
    headers: Record<string, string> = { "Content-Type": "application/json" };
  if (kind === "telegram" && config.kind === "telegram") {
    if (!/^\d{3,20}$/.test(destination) || text.length > 4096)
      throw new Error("Tujuan/panjang pesan Telegram tidak valid.");
    url = `https://api.telegram.org/bot${config.token}/sendMessage`;
    body = {
      chat_id: destination,
      text,
      link_preview_options: { is_disabled: true },
    };
  } else if (kind === "whatsapp" && config.kind === "whatsapp") {
    if (!/^[1-9]\d{7,14}$/.test(destination) || text.length > 1024)
      throw new Error(
        "Tujuan/panjang parameter template WhatsApp tidak valid.",
      );
    url = `https://graph.facebook.com/${config.version}/${config.phone_id}/messages`;
    headers.Authorization = `Bearer ${config.token}`;
    body = {
      messaging_product: "whatsapp",
      to: destination,
      type: "template",
      template: {
        name: config.template,
        language: { code: config.language },
        components: [{ type: "body", parameters: [{ type: "text", text }] }],
      },
    };
  } else throw new Error("Kanal belum tersedia.");
  try {
    const r = await fetcher(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    const d = await r.json();
    if (
      !r.ok ||
      (kind === "telegram"
        ? !d.ok || !d.result?.message_id
        : !d.messages?.[0]?.id)
    )
      throw new Error();
    return { status: "accepted" as const };
  } catch {
    throw new Error(
      "Hasil pengiriman tidak pasti. Periksa penyedia sebelum mengirim ulang.",
    );
  }
}
