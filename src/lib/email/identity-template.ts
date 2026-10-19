export type IdentityMailPurpose = "verify_email" | "reset_password";
const copy = {
  verify_email: {
    subject: "Verifikasi email LMS Nurul Falah",
    preview: "Konfirmasikan alamat email Anda untuk mengakses pembelajaran dan pemulihan akun.",
    eyebrow: "VERIFIKASI AKUN",
    title: "Verifikasi alamat email Anda",
    intro: "Terima kasih telah menggunakan LMS Nurul Falah. Konfirmasikan alamat email ini agar akun Anda dapat digunakan untuk pembelajaran dan pemulihan password.",
    button: "Verifikasi email saya",
    instruction: "Buka tautan di browser tempat Anda sedang login ke akun LMS yang meminta verifikasi. Setelah halaman terbuka, klik Konfirmasi email akun ini.",
    ignored: "Jika Anda tidak meminta verifikasi ini, abaikan email ini. Jangan membuka atau membagikan tautannya.",
  },
  reset_password: {
    subject: "Pemulihan password LMS Nurul Falah",
    preview: "Gunakan tautan aman ini untuk membuat password baru. Berlaku 15 menit.",
    eyebrow: "PEMULIHAN AKUN",
    title: "Buat password baru Anda",
    intro: "Kami menerima permintaan pemulihan password untuk akun LMS Nurul Falah Anda. Gunakan tombol berikut untuk membuat password baru.",
    button: "Atur password baru",
    instruction: "Pada halaman pemulihan, masukkan password baru dan konfirmasinya. Setelah berhasil, login ulang menggunakan username dan password baru Anda.",
    ignored: "Tidak merasa meminta pemulihan password? Abaikan email ini. Permintaan ini saja tidak mengubah password Anda.",
  },
} satisfies Record<IdentityMailPurpose, Record<string, string>>;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Shared multipart content; no external assets, tracking, scripts or account identifiers. */
export function identityMessage(url: string, purpose: IdentityMailPurpose) {
  const parsed = new URL(url);
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) || parsed.username || parsed.password)
    throw new Error("Tautan akun harus HTTPS tanpa kredensial.");
  const content = copy[purpose];
  const link = parsed.toString();
  const safeLink = escapeHtml(link);
  const validity = "Tautan berlaku 15 menit sejak permintaan dibuat dan hanya dapat digunakan satu kali.";
  const security = "Demi keamanan, jangan bagikan tautan ini atau password Anda kepada siapa pun.";
  const assistance = "Jika tautan kedaluwarsa, ajukan permintaan baru di LMS. Jika meminta lebih dari satu tautan, gunakan email terbaru. Untuk bantuan, hubungi admin madrasah melalui saluran resmi.";
  const text = `LMS NURUL FALAH\n${content.title}\n\nAssalamu’alaikum warahmatullahi wabarakatuh.\n\n${content.intro}\n\n${content.button}:\n${link}\n\n${content.instruction}\n\n${validity}\n${security}\n\n${content.ignored}\n\n${assistance}\n\nWassalamu’alaikum warahmatullahi wabarakatuh.\nTim LMS Nurul Falah\n\nEmail otomatis dari LMS Nurul Falah.`;
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${content.subject}</title></head>
<body style="margin:0;padding:0;background-color:#f3f6f4;color:#243b32;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#f3f6f4;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${content.preview}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f3f6f4;"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dce6df;border-radius:16px;">
<tr><td style="padding:26px 24px;background-color:#065f46;border-radius:15px 15px 0 0;"><p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;line-height:28px;">LMS Nurul Falah</p><p style="margin:5px 0 0;color:#d1fae5;font-size:13px;line-height:20px;">Ruang pembelajaran madrasah</p></td></tr>
<tr><td style="padding:28px 24px;">
<p style="margin:0 0 10px;color:#047857;font-size:11px;font-weight:bold;letter-spacing:1.4px;line-height:18px;">${content.eyebrow}</p>
<h1 style="margin:0 0 24px;font-size:26px;line-height:34px;color:#163c2d;">${content.title}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:25px;">Assalamu’alaikum warahmatullahi wabarakatuh.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:25px;">${content.intro}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;"><tr><td bgcolor="#065f46" style="border-radius:8px;text-align:center;mso-padding-alt:14px 22px;"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;border:1px solid #065f46;border-radius:8px;color:#ffffff;background-color:#065f46;text-decoration:none;font-size:15px;font-weight:bold;line-height:22px;">${content.button}</a></td></tr></table>
<p style="margin:0 0 20px;font-size:14px;line-height:24px;">${content.instruction}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:16px;background-color:#ecfdf5;border-left:3px solid #059669;"><p style="margin:0 0 6px;font-size:14px;font-weight:bold;line-height:23px;">${validity}</p><p style="margin:0;font-size:13px;line-height:22px;">${security}</p></td></tr></table>
<p style="margin:24px 0 8px;font-size:13px;line-height:22px;color:#53665b;">Jika tombol tidak dapat dibuka, salin seluruh tautan berikut ke browser Anda:</p>
<p style="margin:0 0 24px;font-size:12px;line-height:21px;word-break:break-all;overflow-wrap:anywhere;"><a href="${safeLink}" style="color:#047857;text-decoration:underline;word-break:break-all;">${safeLink}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:22px;color:#53665b;">${content.ignored}</p>
<p style="margin:0 0 24px;font-size:13px;line-height:22px;color:#53665b;">${assistance}</p>
<p style="margin:0;font-size:14px;line-height:24px;">Wassalamu’alaikum warahmatullahi wabarakatuh.<br><strong>Tim LMS Nurul Falah</strong></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:18px 0 0;font-size:12px;line-height:20px;color:#64756b;">Email otomatis dari LMS Nurul Falah.</p>
</td></tr></table></body></html>`;
  return { subject: content.subject, text, html };
}
