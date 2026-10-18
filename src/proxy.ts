import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublicEnv } from "@/lib/env";
export async function proxy(request: NextRequest) {
  const env = readPublicEnv();
  let response = NextResponse.next({ request });
  if (!env) return response;
  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (changes) => {
          changes.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          changes.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/api/retensi-lampiran/:path*",
    "/api/alur-akademik/:path*",
    "/profil",
    "/api/profil/:path*",
    "/keamanan",
    "/verifikasi-keamanan",
    "/api/keamanan/:path*",
    "/pengembangan",
    "/api/pengembangan/:path*",
    "/pemantauan",
    "/api/lanjutan/:path*",
    "/ruang-belajar/:path*",
    "/admin/:path*",
    "/ganti-password",
    "/verifikasi",
    "/api/identitas/:path*",
    "/akademik/:path*",
    "/api/akademik/:path*",
    "/pembelajaran/:path*",
    "/absensi-harian",
    "/api/pembelajaran/:path*",
    "/kuis/:path*",
    "/laporan/:path*",
    "/api/kuis/:path*",
    "/api/laporan/:path*",
  ],
};
