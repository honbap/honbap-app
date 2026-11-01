// 이메일 인증 메일 없이 바로 쓸 수 있는 계정을 만든다. (공개 가입 창구라 JWT 검증은 끈다)
// 만든 뒤 앱이 같은 이메일/비밀번호로 로그인한다.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD" }, 405);

  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json({ error: "BAD_REQUEST" }, 400); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "BAD_EMAIL" }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: "BAD_PASSWORD" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return json({ error: "EMAIL_TAKEN" }, 409);
    console.error("createUser failed:", error.message);
    return json({ error: "FAILED" }, 500);
  }
  return json({ ok: true });
});
