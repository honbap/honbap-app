// 이전 방식(서버에서 계정 생성)은 끄고, 메일 인증번호 가입만 쓰기 때문에 항상 410을 돌려줘요.
Deno.serve(() => new Response(JSON.stringify({ ok: false, error: 'DISABLED' }), { status: 410, headers: { 'content-type': 'application/json' } }));
