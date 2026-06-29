import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredEnv } from "@/lib/env";
import type { Database } from "@/types/database";

const SUPABASE_AUTH_RESPONSE_HEADERS = [
  "Cache-Control",
  "Expires",
  "Pragma",
];

function applySupabaseAuthResponseState(
  source: NextResponse,
  target: NextResponse
) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });

  SUPABASE_AUTH_RESPONSE_HEADERS.forEach((header) => {
    const value = source.headers.get(header);

    if (value) {
      target.headers.set(header, value);
    }
  });
}

function redirectWithSupabaseAuthState(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;

  const redirectResponse = NextResponse.redirect(url);
  applySupabaseAuthResponseState(supabaseResponse, redirectResponse);

  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabaseUrl = getRequiredEnv(
    process.env,
    "NEXT_PUBLIC_SUPABASE_URL"
  );
  const supabaseAnonKey = getRequiredEnv(
    process.env,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Supabase auth user lookup failed", userError.message);
  }

  // Redirect unauthenticated users to login. The /auth namespace
  // (/auth/confirm verifies invite/recovery links, /auth-error reports a
  // failed verification) must stay reachable without a session, since the
  // invitee has no session until verifyOtp runs.
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    request.nextUrl.pathname !== "/"
  ) {
    return redirectWithSupabaseAuthState(
      request,
      supabaseResponse,
      "/login"
    );
  }

  // Redirect authenticated users away from auth pages
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return redirectWithSupabaseAuthState(
      request,
      supabaseResponse,
      "/dashboard"
    );
  }

  return supabaseResponse;
}
