/* 밥친구 운영자 화면: 같은 학교에서 들어온 신고를 확인하고 조치한다. 권한은 DB(RLS·RPC)가 확인한다. */
(function () {
'use strict';
var CFG = window.HONBAP || {};
var $ = function (s) { return document.querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var pad = function (n) { return String(n).padStart(2, '0'); };
function when(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function toast(m) { var el = $('#toast'); el.textContent = m; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { el.classList.remove('on'); }, 2800); }

var sb, filter = 'open', pf = {}, busy = false;
var ACTION_LABEL = { dismiss: '기각', hide: '내용 숨김', suspend: '숨김 + 이용자 정지' };

function ok(r) { if (r.error) throw r.error; return r.data; }
function nick(id) { var u = pf[id]; return u ? u.nickname + ' · ' + u.gender : (id ? '알 수 없음' : '-'); }
function target(r) {
  if (r.target_message) return '채팅 메시지';
  if (r.target_comment) return '댓글';
  if (r.target_post) return '모집글';
  return '이용자';
}
async function load() {
  var rows = ok(await sb.from('reports').select('*').eq('status', filter).order('id', { ascending: false }).limit(100));
  var ids = [];
  rows.forEach(function (r) { ids.push(r.reporter_id, r.target_user); });
  ids = ids.filter(function (x, i, a) { return x && a.indexOf(x) === i && !pf[x]; });
  if (ids.length) ok(await sb.from('profiles').select('id,nickname,gender,suspended').in('id', ids)).forEach(function (p) { pf[p.id] = p; });
  var susp = ok(await sb.from('profiles').select('id,nickname,gender').eq('suspended', true));
  susp.forEach(function (p) { pf[p.id] = Object.assign({ suspended: true }, p); });
  render(rows, susp);
}
function tabs() {
  return '<div class="seg" style="margin-bottom:12px;grid-template-columns:repeat(3,1fr)" role="group" aria-label="신고 상태">' +
    [['open', '처리 대기'], ['actioned', '조치함'], ['dismissed', '기각']].map(function (t) {
      return '<button class="neutral" data-f="' + t[0] + '" aria-pressed="' + (filter === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
}
function render(rows, susp) {
  var h = tabs();
  if (!rows.length) h += '<div class="empty">' + (filter === 'open' ? '처리할 신고가 없어요.' : '내역이 없어요.') + '</div>';
  rows.forEach(function (r) {
    var tu = pf[r.target_user], tsusp = tu && tu.suspended;
    h += '<article class="rp"><div class="h"><b>' + target(r) + ' 신고 · ' + esc(r.reason) + '</b><span class="meta">' + when(r.created_at) + '</span></div>' +
      '<div class="meta">신고자 ' + esc(nick(r.reporter_id)) + ' → 대상 ' + esc(nick(r.target_user)) + (tsusp ? ' (정지됨)' : '') + '</div>' +
      (r.snapshot ? '<blockquote>' + esc(r.snapshot) + '</blockquote>' : '') +
      (r.detail ? '<div class="meta">신고자 설명: ' + esc(r.detail) + '</div>' : '');
    if (r.status === 'open') {
      h += '<div class="row" style="margin-top:10px"><button class="btn sm sec" data-a="dismiss" data-id="' + r.id + '">기각</button>' +
        (r.target_post || r.target_comment || r.target_message ? '<button class="btn sm" data-a="hide" data-id="' + r.id + '">내용 숨김</button>' : '') +
        (r.target_user ? '<button class="btn sm dg" data-a="suspend" data-id="' + r.id + '">숨김 + 이용자 정지</button>' : '') + '</div>';
    } else {
      h += '<div class="meta" style="margin-top:8px">처리: ' + esc(r.resolution || '') + (r.handled_at ? ' · ' + when(r.handled_at) : '') + '</div>';
    }
    h += '</article>';
  });
  h += '<h2>정지된 이용자</h2>' + (susp.length ? '<div class="card">' + susp.map(function (p) {
    return '<div class="fl"><div class="tx">' + esc(p.nickname) + ' · ' + esc(p.gender) + '</div><button class="btn sm sec" data-u="' + p.id + '">정지 해제</button></div>';
  }).join('') + '</div>' : '<div class="empty">정지된 이용자가 없어요.</div>');
  $('#admin').innerHTML = h;
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b || busy) return;
  var p;
  if (b.dataset.f) { filter = b.dataset.f; p = load(); }
  else if (b.dataset.a) {
    var a = b.dataset.a, id = +b.dataset.id;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = ACTION_LABEL[a] + ' 확정'; return; }
    p = sb.rpc('admin_resolve_report', { p_id: id, p_action: a, p_note: '' }).then(function (r) { if (r.error) throw r.error; toast('처리했어요.'); return load(); });
  } else if (b.dataset.u) {
    p = sb.rpc('admin_set_suspended', { p_user: b.dataset.u, p_flag: false }).then(function (r) { if (r.error) throw r.error; delete pf[b.dataset.u]; toast('정지를 해제했어요.'); return load(); });
  }
  if (!p) return;
  busy = true; p.catch(function (err) { toast(err.message === 'NOT_ADMIN' ? '운영자만 할 수 있어요.' : '문제가 생겼어요. 잠시 후 다시 해 주세요.'); }).then(function () { busy = false; });
});

async function boot() {
  var box = $('#admin');
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) { box.innerHTML = '<div class="center">web/config.js에 Supabase 정보를 넣어 주세요.</div>'; return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  try {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { box.innerHTML = '<div class="center"><div><p>먼저 앱에서 로그인해 주세요.</p><a class="btn" href="index.html">앱으로 가기</a></div></div>'; return; }
    var me = ok(await sb.from('profiles').select('id,nickname,is_admin,school_id').eq('id', s.user.id).maybeSingle());
    if (!me || !me.is_admin) { box.innerHTML = '<div class="center">운영자 계정이 아니에요.</div>'; return; }
    $('#who').textContent = me.nickname + ' · 운영자';
    await load();
  } catch (e) { box.innerHTML = '<div class="center">불러오지 못했어요. 새로고침해 주세요.</div>'; }
}
boot();
})();
