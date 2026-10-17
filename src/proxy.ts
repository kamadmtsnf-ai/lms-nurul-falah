import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublicEnv } from "@/lib/env";
export async function proxy(request: NextRequest) {
 const env = readPublicEnv();
 let response = NextResponse.next({request});
 if (!env) return response;
 const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
  cookies: { getAll: () => request.cookies.getAll(), setAll: changes => {
    changes.forEach(({name,value}) => request.cookies.set(name,value));
    response = NextResponse.next({request});
    changes.forEach(({name,value,options}) => response.cookies.set(name,value,options));
  } },
 });
 await client.auth.getClaims();
 response.headers.set("Cache-Control", "private, no-store");
 return response;
}
export const config = { matcher: ["/ruang-belajar/:path*", "/admin/:path*", "/ganti-password", "/verifikasi", "/api/identitas/:path*"] };
