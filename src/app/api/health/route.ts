export const dynamic = "force-dynamic";
export function GET() {
 return Response.json({status:"ok", service:"lms-nurul-falah", stage:"foundation"}, {headers:{"Cache-Control":"no-store"}});
}
// Liveness aplikasi saja, bukan bukti database/email siap. Jalankan npm run check:services untuk kesiapan layanan.
