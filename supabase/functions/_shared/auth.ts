import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface AuthResult {
  userId: string;
  email?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.pad End(payload.length % 4 === 0 ? 0 : 4 - (payload.length % 4), "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = payload.exp;
  if (typeof exp !== "number") return true;
  return Date.now() >= exp * 1000;
}

export async function requireAuth(
  req: Request,
  dependencies: {
    createClient?: typeof createClient;
    getToken?: (req: Request) => string | null;
  } = {},
): Promise<AuthResult | Response> {
  const getToken = dependencies.getToken ?? getBearerToken;
  const token = getToken(req);
  if (!token) {
    return jsonResponse({ success: false, error: "Missing Authorization header" }, 401);
  }

  if (isTokenExpired(token)) {
    return jsonResponse({ success: false, error: "Token has expired" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonUrl = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonUrl) {
    return jsonResponse({ success: false, error: "Server misconfigured: missing Supabase credentials" }, 500);
  }

  const createClientFn = dependencies.createClient ?? createClient;
  const client = createClient(supabaseUrl, supabaseAnonUrl, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    return jsonResponse({ success: false, error: "Invalid or expired token" }, 401);
  }

  return { userId: data.user.id, email: data.user.email };
}

export function isAuthResult(value: AuthResult | Response): value is AuthResult {
  return !(value instanceof Response);
}
