import { createClient } from 'jsr:@supabase/supabase-js@2';

// 탈퇴: 로그인한 본인의 사진 파일을 모두 지우고 계정을 삭제해요. (프로필·글·메시지·친구·알림은 계정 삭제와 함께 지워져요)
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ ok: false, error: 'NOT_LOGGED_IN' }, 401);
    const uid = data.user.id;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    for (let i = 0; i < 20; i++) {
      const ls = await admin.storage.from('chat').list(uid, { limit: 1000 });
      if (ls.error || !ls.data || ls.data.length === 0) break;
      const rm = await admin.storage.from('chat').remove(ls.data.map((f) => `${uid}/${f.name}`));
      if (rm.error) return json({ ok: false, error: 'STORAGE_FAILED' }, 500);
    }
    const del = await admin.auth.admin.deleteUser(uid);
    if (del.error) return json({ ok: false, error: 'DELETE_FAILED' }, 500);
    return json({ ok: true });
  } catch (_e) {
    return json({ ok: false, error: 'SERVER_ERROR' }, 500);
  }
});
