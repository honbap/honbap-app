/* 밥친구: 같은 학교 혼밥러 커뮤니티 (게시판 + 1:1 채팅). 권한은 모두 DB(RLS·RPC)가 확인해요. */
(function () {
'use strict';
var CFG = window.HONBAP || {};
var $ = function (s) { return document.querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

var S = {
  sb: null, user: null, me: null, schools: [], tab: 'board', kind: 'meal', authMode: 'login', email: '', gender: '', starting: false,
  posts: { meal: null, study: null }, rooms: null, names: {}, fr: { rows: [], by: {}, incoming: [] },
  notes: [], blocks: [], likes: [], replyTo: null, verify: null, view: null, cur: null, cmts: null, msgs: null, peerRead: 0, repMsg: null, rep: null, busy: false, ready: false
};

/* ───────── 작은 도구 ───────── */
var ICON = {
  back: 'M15 5l-7 7 7 7', plus: 'M12 5v14M5 12h14', bell: 'M6 9a6 6 0 0112 0c0 5 2 6 2 7H4c0-1 2-2 2-7zM10 20a2 2 0 004 0',
  send: 'M4 12l16-8-6 16-3-7-7-1z', chat: 'M4 5h16v11H9l-5 4z', board: 'M5 4h14v16H5zM9 9h6M9 13h6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6', more: 'M12 6v.01M12 12v.01M12 18v.01',
  userplus: 'M10 12a4 4 0 100-8 4 4 0 000 8zM2 20c0-4 4-6 8-6M18 8v6M15 11h6', close: 'M6 6l12 12M18 6L6 18', heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z', clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z'
};
function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[n] + '"/></svg>'; }
function ib(act, icon, label) { return '<button class="ib" data-act="' + act + '" aria-label="' + label + '">' + ic(icon) + '</button>'; }
function toast(m) { var el = $('#toast'); if (!el) return; el.textContent = m; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { el.classList.remove('on'); }, 2800); }
var ERR = [
  ['Invalid login', '이메일이나 비밀번호가 맞지 않아요.'], ['EMAIL_TAKEN', '이미 가입된 이메일이에요. 로그인해 주세요.'], ['BAD_EMAIL', '이메일 주소를 확인해 주세요.'],
  ['BAD_PASSWORD', '비밀번호는 6자 이상이어야 해요.'], ['NICKNAME_TAKEN', '같은 학교에 이미 있는 닉네임이에요.'],
  ['BAD_NICKNAME', '닉네임은 2~10자, 한글·영문·숫자·_ 만 쓸 수 있어요.'], ['BAD_SCHOOL', '학교를 골라 주세요.'], ['BAD_GENDER', '남자/여자 중에 골라 주세요.'],
  ['BAD_TITLE', '제목은 1~40자로 써 주세요.'], ['BAD_BODY', '내용은 1~1000자로 써 주세요.'], ['RATE_LIMIT', '너무 빨라요. 잠시 후 다시 해 주세요.'],
  ['USER_NOT_FOUND', '그 사람을 찾을 수 없어요.'], ['ALREADY_FRIENDS', '이미 친구예요.'], ['ALREADY_REQUESTED', '이미 요청을 보냈어요.'],
  ['TOO_MANY_REQUESTS', '보낸 요청이 너무 많아요. 잠시 후에 해 주세요.'], ['BLOCKED', '차단 관계라 할 수 없어요.'], ['NOT_FRIENDS', '친구끼리만 채팅할 수 있어요.'],
  ['Email not confirmed', '이메일 인증이 필요해요. 계정 만들기로 다시 진행해 주세요.'], ['Token has expired', '인증번호가 맞지 않거나 만료됐어요.'], ['otp_expired', '인증번호가 맞지 않거나 만료됐어요.'], ['rate limit', '메일을 너무 자주 보냈어요. 잠시 후 다시 해 주세요.'], ['sending confirmation', '인증 메일을 보내지 못했어요. 잠시 후 다시 해 주세요.'], ['BAD_TIME', '모이는 시간을 확인해 주세요. (지금부터 60일 이내, 종료는 시작 뒤 12시간 이내)'], ['REPLY_TOO_DEEP', '답글에는 답글을 달 수 없어요.'], ['COMMENT_NOT_FOUND', '댓글을 찾을 수 없어요.'], ['CONFIRM_OFF', '메일 인증 설정이 꺼져 있어요. 운영자가 Supabase에서 Confirm email을 켜야 해요.'], ['SUSPENDED', '이용이 정지된 계정이에요.'], ['Failed to fetch', '인터넷 연결을 확인해 주세요.']
];
function msg(e) {
  var t = String((e && (e.message || e.code)) || e || '');
  for (var i = 0; i < ERR.length; i++) if (t.indexOf(ERR[i][0]) >= 0) return ERR[i][1];
  if (window.console) console.error(e);
  return '잠시 후 다시 시도해 주세요.';
}
function ok(r) { if (r.error) throw r.error; return r.data; }
function rpc(n, a) { return S.sb.rpc(n, a || {}).then(ok); }
function ago(t) {
  var s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 604800) return Math.floor(s / 86400) + '일 전'; var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate();
}
function hm(t) { return new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }); }
function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function dayLabel(t) { var d = new Date(t); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + '일월화수목금토'[d.getDay()] + '요일'; }
function minKey(t) { return Math.floor(new Date(t).getTime() / 60000); }
function fmtTime(p) {
  if (!p || !p.starts_at) return '';
  var a = new Date(p.starts_at), b = p.ends_at ? new Date(p.ends_at) : null, t = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  return (a.getMonth() + 1) + '/' + a.getDate() + '(' + '일월화수목금토'[a.getDay()] + ') ' + t(a) + (b ? '~' + t(b) : '');
}
function nick(id) { var u = S.names[id]; return u ? u.nickname : '알 수 없음'; }
function gl(id) { var u = S.names[id]; return u && u.gender === '남성' ? '남' : u && u.gender === '여성' ? '여' : ''; }
function av(id, size, act) {
  var h = 0, s = String(id || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  var st = ' style="--s:' + size + 'px;--h:' + h + '"', ch = esc(nick(id).charAt(0));
  return act ? '<button class="avatar" data-act="user" data-u="' + esc(id) + '" aria-label="' + esc(nick(id)) + '"' + st + '>' + ch + '</button>' : '<span class="avatar"' + st + '>' + ch + '</span>';
}
var timers = {};
function later(k, fn, ms) { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms == null ? 250 : ms); }
function schoolName(id) { for (var i = 0; i < S.schools.length; i++) if (S.schools[i].id === id) return S.schools[i].name; return ''; }
function unreadTotal() { return (S.rooms || []).reduce(function (a, r) { return a + (r.unread || 0); }, 0) + S.fr.incoming.length; }
var PROFILE_COLS = 'id,nickname,gender,school_id,is_admin,suspended';

/* ───────── 데이터 불러오기 ───────── */
async function loadNames(ids) {
  ids = ids.filter(function (x, i, a) { return x && a.indexOf(x) === i && !S.names[x]; });
  if (!ids.length) return;
  (ok(await S.sb.from('profiles').select('id,nickname,gender').in('id', ids)) || []).forEach(function (p) { S.names[p.id] = p; });
}
async function loadSchools() {
  if (S.schools.length) return;
  S.schools = ok(await S.sb.from('schools').select('id,name').order('id')) || [];
  var i = S.schools.findIndex(function (x) { return x.name === '기타'; });
  if (i >= 0) S.schools.push(S.schools.splice(i, 1)[0]);
}
async function loadPosts() {
  var k = S.kind;
  var rows = ok(await S.sb.from('post_feed').select('*').eq('kind', k).eq('hidden', false).order('id', { ascending: false }).limit(60)) || [];
  await loadNames(rows.map(function (r) { return r.author_id; }));
  S.posts[k] = rows; paintList();
}
async function loadRooms() {
  S.rooms = ok(await S.sb.rpc('my_rooms')) || [];
  await loadNames(S.rooms.map(function (r) { return r.other_user; }));
  paintRooms(); paintNav();
}
async function loadFriends() {
  var rows = ok(await S.sb.from('friendships').select('*')) || [], by = {}, inc = [];
  rows.forEach(function (f) {
    var other = f.requester_id === S.me.id ? f.addressee_id : f.requester_id;
    by[other] = { id: f.id, status: f.status, mine: f.requester_id === S.me.id };
    if (f.status === 'pending' && f.addressee_id === S.me.id) inc.push(f);
  });
  S.fr = { rows: rows, by: by, incoming: inc };
  await loadNames(Object.keys(by));
  paintRooms(); paintNav();
}
async function loadNotes() {
  S.notes = ok(await S.sb.from('notifications').select('*').order('id', { ascending: false }).limit(30)) || [];
  paintBell();
}
async function loadBlocks() {
  S.blocks = (ok(await S.sb.from('blocks').select('blocked_id')) || []).map(function (b) { return b.blocked_id; });
  await loadNames(S.blocks);
}
async function loadCmts() {
  if (!S.view || S.view.t !== 'post') return;
  var id = S.view.id;
  var rows = ok(await S.sb.from('comments').select('*').eq('post_id', id).eq('hidden', false).order('id')) || [];
  await loadNames(rows.map(function (r) { return r.author_id; }));
  var likes = rows.length ? (ok(await S.sb.from('comment_likes').select('comment_id,user_id').in('comment_id', rows.map(function (r) { return r.id; }))) || []) : [];
  if (S.view && S.view.t === 'post' && S.view.id === id) { S.cmts = rows; S.likes = likes; paintPost(); }
}
async function loadMsgs() {
  var v = S.view; if (!v || v.t !== 'room') return;
  var rows = ok(await S.sb.from('messages').select('id,sender_id,body,created_at,hidden').eq('dm_id', v.dm).order('id', { ascending: false }).limit(100)) || [];
  if (!S.view || S.view.t !== 'room' || S.view.dm !== v.dm) return;
  S.msgs = rows.filter(function (m) { return !m.hidden; }).reverse(); paintMsgs();
}
async function loadPeer() {
  var v = S.view; if (!v || v.t !== 'room') return;
  var r = ok(await S.sb.from('room_reads').select('last_read_at').eq('room_key', 'd:' + v.dm).eq('user_id', v.other).maybeSingle());
  S.peerRead = r ? new Date(r.last_read_at).getTime() : 0; paintMsgs();
}
async function markRead() {
  var v = S.view; if (!v || v.t !== 'room' || document.visibilityState !== 'visible') return;
  try { await rpc('mark_read', { p_key: 'd:' + v.dm }); } catch (e) { return; }
  (S.rooms || []).forEach(function (r) { if (r.dm_id === v.dm) r.unread = 0; });
  paintNav();
}

/* ───────── 시작 · 로그인 ───────── */
async function startSession(session) {
  if (!session) { teardown(); S.user = null; S.me = null; S.ready = true; render(); return; }
  if (S.starting || (S.user && S.user.id === session.user.id && S.me)) return;
  S.starting = true; S.user = session.user;
  try {
    S.me = ok(await S.sb.from('profiles').select(PROFILE_COLS).eq('id', S.user.id).maybeSingle()) || null; S.ready = true;
    if (!S.me) { await loadSchools(); render(); } else await enter();
  } catch (e) { S.ready = true; render(); toast(msg(e)); } finally { S.starting = false; }
}
async function enter() {
  S.names[S.me.id] = S.me;
  if (S.me.suspended) { render(); return; }
  await Promise.all([loadSchools(), loadFriends(), loadBlocks()]);
  render();
  await Promise.all([loadPosts(), loadRooms(), loadNotes()]);
  subscribe();
}
var chan = null;
function subscribe() {
  if (chan) return;
  var q = function (t) { return { event: '*', schema: 'public', table: t }; };
  chan = S.sb.channel('app')
    .on('postgres_changes', q('messages'), function (p) {
      var v = S.view, n = p.new || {};
      later('rooms', loadRooms);
      if (v && v.t === 'room' && n.dm_id === v.dm) loadMsgs().then(function () { if (n.sender_id !== S.me.id) markRead(); });
    })
    .on('postgres_changes', q('room_reads'), function () { if (S.view && S.view.t === 'room') later('peer', loadPeer, 100); later('rooms', loadRooms); })
    .on('postgres_changes', q('comments'), function () { later('cmts', loadCmts, 150); later('posts', loadPosts, 400); })
    .on('postgres_changes', q('comment_likes'), function () { later('cmts', loadCmts, 150); })
    .on('postgres_changes', q('posts'), function () { later('posts', loadPosts, 400); })
    .on('postgres_changes', q('friendships'), function () { later('fr', function () { loadFriends().then(loadRooms); }, 200); })
    .on('postgres_changes', q('notifications'), function () { later('notes', loadNotes, 200); })
    .subscribe();
}
function teardown() {
  if (chan && S.sb) { try { S.sb.removeChannel(chan); } catch (e) { /* 무시 */ } }
  chan = null; S.view = null; S.tab = 'board'; S.posts = { meal: null, study: null }; S.rooms = null; S.notes = []; S.fr = { rows: [], by: {}, incoming: [] }; S.names = {}; closeSheet();
}

/* ───────── 화면 그리기 ───────── */
function render() {
  var el = $('#screen'), h;
  if (!S.ready) h = '<div class="center">불러오는 중…</div>';
  else if (!S.user) h = vAuth();
  else if (!S.me) h = vSetup();
  else if (S.me.suspended) h = '<div class="center"><div class="stack"><p>이용이 정지된 계정이에요.</p><button class="btn sec" data-act="logout">로그아웃</button></div></div>';
  else if (S.view && S.view.t === 'post') h = vPost();
  else if (S.view && S.view.t === 'compose') h = vCompose();
  else if (S.view && S.view.t === 'room') h = vRoom();
  else h = vMain();
  el.innerHTML = '<div class="view">' + h + '</div>';
  paintList(); paintRooms(); paintPost(); paintReplyBar(); paintMsgs(true); paintBell(); paintNav();
}
function nav() {
  var t = [['board', 'board', '게시판'], ['chat', 'chat', '채팅'], ['me', 'user', '내 정보']];
  return '<nav class="nav">' + t.map(function (x) {
    return '<button data-act="tab" data-v="' + x[0] + '"' + (S.tab === x[0] ? ' aria-current="page"' : '') + '>' + ic(x[1]) + x[2] + (x[0] === 'chat' ? '<span class="bdg" id="nbdg" hidden></span>' : '') + '</button>';
  }).join('') + '</nav>';
}
function vMain() {
  var body;
  if (S.tab === 'board') {
    body = '<div class="top"><div class="brand"><div class="logo">밥친구</div><div class="school">' + esc(schoolName(S.me.school_id)) + '</div></div><div class="acts">' + ib('notes', 'bell', '알림') + '</div></div>' +
      '<div class="tabs" role="tablist">' + [['meal', '밥'], ['study', '공부']].map(function (k) {
        return '<button role="tab" data-act="kind" data-v="' + k[0] + '" aria-selected="' + (S.kind === k[0]) + '">' + k[1] + '</button>';
      }).join('') + '</div><main id="list"></main><button class="fab" data-act="compose" aria-label="글쓰기">' + ic('plus') + '</button>';
  } else if (S.tab === 'chat') {
    body = '<div class="top"><h1>채팅</h1><div class="acts">' + ib('fsearch', 'userplus', '친구 추가') + '</div></div><main id="rooms"></main>';
  } else body = vMe();
  return body + nav();
}
function vMe() {
  var bl = S.blocks.map(function (id) { return '<div class="fl">' + av(id, 34) + '<div class="tx">' + esc(nick(id)) + '</div><button class="btn sm sec" data-act="unblock" data-u="' + esc(id) + '">해제</button></div>'; }).join('') || '<p class="sub">차단한 사람이 없어요.</p>';
  return '<div class="top"><h1>내 정보</h1></div><main><div class="pad">' +
    '<div class="who-card">' + av(S.me.id, 56) + '<div><b>' + esc(S.me.nickname) + '</b><p class="sub">' + esc(schoolName(S.me.school_id)) + ' · ' + esc(S.me.gender) + '</p></div></div>' +
    '<h2>닉네임 바꾸기</h2><div class="stack"><input type="text" id="mn" maxlength="10" value="' + esc(S.me.nickname) + '" aria-label="닉네임" autocomplete="off"><button class="btn" data-act="saveprofile">저장</button></div>' +
    '<p class="sub" style="margin-top:8px">학교와 성별은 처음 정한 뒤로는 바꿀 수 없어요.</p>' +
    '<h2>차단한 사람</h2>' + bl +
    '<h2>계정</h2><div class="row">' + (S.me.is_admin ? '<a class="btn sec" href="admin.html">운영자 화면</a>' : '') +
    '<button class="btn sec" data-act="logout">로그아웃</button><button class="btn dg" data-act="delacct">계정 삭제</button></div></div></main>';
}
function vVerify() {
  return '<div class="auth"><div><div class="logo">메일 확인</div><p><b>' + esc(S.verify.email) + '</b>로 인증번호를 보냈어요.<br>메일에 적힌 숫자를 입력해 주세요.</p></div>' +
    '<label class="f">인증번호<input type="text" id="vc" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="숫자"></label>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="verify">인증하고 시작하기</button>' +
    '<button class="btn sec" data-act="resend">인증번호 다시 받기</button><button class="link" data-act="cancelverify">처음으로</button></div>';
}
function vAuth() {
  if (S.verify) return vVerify();
  var su = S.authMode === 'signup';
  return '<div class="auth"><div><div class="logo">밥친구</div><p>같은 학교 혼밥러들의 커뮤니티</p></div>' +
    '<div class="seg" role="group" aria-label="로그인 방식"><button data-act="mode" data-v="login" aria-pressed="' + !su + '">로그인</button><button data-act="mode" data-v="signup" aria-pressed="' + su + '">계정 만들기</button></div>' +
    '<label class="f">이메일<input type="text" id="em" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="example@email.com" value="' + esc(S.email) + '"></label>' +
    '<label class="f">비밀번호' + (su ? ' (6자 이상)' : '') + '<input type="password" id="pw" autocomplete="' + (su ? 'new-password' : 'current-password') + '"></label>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="auth">' + (su ? '계정 만들기' : '로그인') + '</button>' +
    (CFG.GOOGLE_LOGIN ? '<div class="or">또는</div><button class="btn gg" data-act="google">Google로 계속하기</button>' : '') +
    '<p class="sub">' + (CFG.EMAIL_VERIFY ? '가입하면 메일로 인증번호가 가요. 인증 뒤에 닉네임과 학교를 정해요.' : '학교 이메일이 아니어도 괜찮아요. 가입하면 닉네임과 학교를 정해요.') + '</p></div>';
}
function vSetup() {
  var opts = '<option value="">학교를 골라 주세요</option>' + S.schools.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
  S.gender = '';
  return '<div class="auth"><div><div class="logo">반가워요!</div><p>닉네임과 학교만 정하면 시작할 수 있어요.</p></div>' +
    '<label class="f">닉네임<input type="text" id="sn" maxlength="10" autocomplete="off" placeholder="2~10자"></label>' +
    '<div class="f">성별<div class="seg" role="group" aria-label="성별" id="sg"><button data-act="gender" data-v="남성" aria-pressed="false">남자</button><button data-act="gender" data-v="여성" aria-pressed="false">여자</button></div>' +
    '<span class="sub" style="font-weight:400">처음 한 번만 고르고, 나중에 바꿀 수 없어요.</span></div>' +
    '<label class="f">학교<select id="ss">' + opts + '</select></label>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="setup">시작하기</button><button class="link" data-act="logout">다른 계정으로 로그인</button></div>';
}
function vPost() {
  return '<div class="page"><div class="bar">' + ib('back', 'back', '뒤로') + '<div class="bt">게시글</div>' + ib('postmenu', 'more', '더보기') + '</div>' +
    '<div class="pbody" id="pb"></div><div class="cinw"><div class="rbar" id="rbar" hidden></div><div class="cin"><input type="text" id="ci" maxlength="200" placeholder="댓글을 입력하세요" autocomplete="off" aria-label="댓글"><button data-act="addcmt" aria-label="등록">' + ic('send') + '</button></div></div></div>';
}
function vCompose() {
  return '<div class="page"><div class="bar">' + ib('back', 'close', '닫기') + '<div class="bt">' + (S.kind === 'meal' ? '밥' : '공부') + ' 게시판 글쓰기</div><button class="txtbtn" data-act="submitpost">등록</button></div>' +
    '<div class="compose"><input type="text" id="ct" maxlength="40" placeholder="제목" autocomplete="off" aria-label="제목"><textarea id="cb" maxlength="1000" placeholder="내용을 입력하세요" aria-label="내용"></textarea>' +
    '<div class="tm"><label class="rd2"><input type="checkbox" id="ctm"> 모이는 시간 정하기 (선택)</label><div class="tmf" id="tmf" hidden>' +
    '<input type="date" id="cd" aria-label="날짜"><input type="time" id="cs" aria-label="시작 시간"><span>~</span><input type="time" id="ce" aria-label="종료 시간 (선택)"></div></div>' +
    '<div class="hint">같은 학교 사람들에게만 보여요.</div></div></div>';
}
function vRoom() {
  var o = S.view.other;
  return '<div class="page"><div class="bar">' + ib('back', 'back', '뒤로') + '<button class="who" data-act="user" data-u="' + esc(o) + '">' + av(o, 34) + '<b>' + esc(nick(o)) + '</b></button></div>' +
    '<div class="chat"><div class="msgs" id="msgs"></div><div class="cin"><input type="text" id="mi" maxlength="500" placeholder="메시지 입력" autocomplete="off" aria-label="메시지"><button data-act="sendmsg" aria-label="보내기">' + ic('send') + '</button></div></div></div>';
}

/* 부분 갱신 (입력 중인 칸을 건드리지 않아요) */
function paintList() {
  var el = $('#list'); if (!el || S.tab !== 'board') return;
  var rows = S.posts[S.kind];
  if (!rows) { el.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
  if (!rows.length) { el.innerHTML = '<div class="empty">아직 글이 없어요.<br>첫 글을 남겨 보세요!</div>'; return; }
  el.innerHTML = rows.map(function (p) {
    return '<button class="post" data-act="post" data-id="' + p.id + '"><span class="pt">' + esc(p.title) + '</span><span class="pp">' + esc(p.body) + '</span>' + (p.starts_at ? '<span class="tchip">' + ic('clock') + esc(fmtTime(p)) + '</span>' : '') +
      '<span class="pm"><span>' + esc(nick(p.author_id)) + (gl(p.author_id) ? ' · ' + gl(p.author_id) : '') + '</span><span>' + ago(p.created_at) + '</span>' +
      (p.comment_count ? '<span class="cc">' + ic('chat') + p.comment_count + '</span>' : '') + '</span></button>';
  }).join('');
}
function paintRooms() {
  var el = $('#rooms'); if (!el) return;
  var h = S.fr.incoming.map(function (f) {
    return '<div class="req"><div class="fl">' + av(f.requester_id, 40) + '<div class="tx">' + esc(nick(f.requester_id)) + '<small>친구 요청이 왔어요</small></div>' +
      '<button class="btn sm" data-act="respond" data-id="' + f.id + '" data-v="1">수락</button><button class="btn sm sec" data-act="respond" data-id="' + f.id + '" data-v="0">거절</button></div></div>';
  }).join('');
  if (S.rooms === null) h += '<div class="empty">불러오는 중…</div>';
  else if (!S.rooms.length) h += '<div class="empty">아직 대화가 없어요.<br>오른쪽 위 버튼으로 친구를 추가해 보세요.</div>';
  else h += S.rooms.map(function (r) {
    return '<button class="li" data-act="room" data-dm="' + r.dm_id + '" data-u="' + esc(r.other_user) + '">' + av(r.other_user, 46) +
      '<div class="tx"><div class="t1"><b>' + esc(nick(r.other_user)) + '</b><time>' + (r.last_at ? ago(r.last_at) : '') + '</time></div>' +
      '<div class="t2"><span>' + esc(r.last_body || '대화를 시작해 보세요') + '</span>' + (r.unread ? '<span class="bdg">' + (r.unread > 99 ? '99+' : r.unread) + '</span>' : '') + '</div></div></button>';
  }).join('');
  el.innerHTML = h;
}
function paintNav() {
  var b = $('#nbdg'); if (!b) return;
  var n = unreadTotal(); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
}
function paintBell() {
  var b = document.querySelector('[data-act="notes"]'); if (!b) return;
  var d = b.querySelector('.dot'), un = S.notes.some(function (n) { return !n.read; });
  if (un && !d) b.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); else if (!un && d) d.remove();
}
function cmHtml(c, reply) {
  var mine = c.author_id === S.me.id, n = 0, on = false;
  S.likes.forEach(function (l) { if (l.comment_id === c.id) { n++; if (l.user_id === S.me.id) on = true; } });
  return '<div class="cm' + (reply ? ' re' : '') + '">' + av(c.author_id, reply ? 28 : 32, true) + '<div class="tx"><b>' + esc(nick(c.author_id)) + (gl(c.author_id) ? ' · ' + gl(c.author_id) : '') + '</b><div class="bd">' + esc(c.body) + '</div>' +
    '<div class="ft"><small>' + ago(c.created_at) + '</small>' +
    '<button class="lk' + (on ? ' on' : '') + '" data-act="like" data-id="' + c.id + '" aria-pressed="' + on + '" aria-label="좋아요">' + ic('heart') + (n || '') + '</button>' +
    (reply ? '' : '<button class="linkbtn" data-act="reply" data-id="' + c.id + '">답글</button>') +
    (mine ? '<button class="linkbtn" data-act="delcmt" data-id="' + c.id + '">삭제</button>' : '<button class="linkbtn" data-act="repcmt" data-id="' + c.id + '">신고</button>') + '</div></div></div>';
}
function cmList(cm) {
  var tops = cm.filter(function (c) { return !c.parent_id; });
  if (!tops.length) return '<div class="empty">첫 댓글을 남겨 보세요.</div>';
  return tops.map(function (c) {
    return cmHtml(c, false) + cm.filter(function (r) { return r.parent_id === c.id; }).map(function (r) { return cmHtml(r, true); }).join('');
  }).join('');
}
function paintReplyBar() {
  var b = $('#rbar'); if (!b) return;
  b.hidden = !S.replyTo;
  if (S.replyTo) b.innerHTML = '<span>' + esc(S.replyTo.name) + '님에게 답글 쓰는 중</span><button class="linkbtn" data-act="cancelreply">취소</button>';
  var i = $('#ci'); if (i) i.placeholder = S.replyTo ? '답글을 입력하세요' : '댓글을 입력하세요';
}
function paintPost() {
  var el = $('#pb'); if (!el || !S.view || S.view.t !== 'post') return;
  var p = S.cur; if (!p) return;
  var keep = el.scrollTop, cm = S.cmts || [];
  el.innerHTML = '<div class="ph">' + av(p.author_id, 36, true) + '<div class="nmb"><b>' + esc(nick(p.author_id)) + (gl(p.author_id) ? ' · ' + gl(p.author_id) : '') + '</b><small>' + ago(p.created_at) + '</small></div></div>' +
    '<div class="pd-title">' + esc(p.title) + '</div>' + (p.starts_at ? '<div class="tchip" style="margin:6px 16px 0">' + ic('clock') + esc(fmtTime(p)) + '</div>' : '') + '<div class="pd-body">' + esc(p.body) + '</div><div class="cmhead">댓글 ' + cm.length + '</div>' +
    (S.cmts === null ? '<div class="empty">불러오는 중…</div>' : cmList(cm));
  el.scrollTop = keep;
}
function paintMsgs(stick) {
  var el = $('#msgs'); if (!el || !S.view || S.view.t !== 'room') return;
  var ms = S.msgs, me = S.me.id, o = S.view.other;
  if (ms === null) { el.innerHTML = '<div class="none">불러오는 중…</div>'; return; }
  if (!ms.length) { el.innerHTML = '<div class="none">' + esc(nick(o)) + '님과의 첫 대화를 시작해 보세요.</div>'; return; }
  var near = el.scrollHeight - el.scrollTop - el.clientHeight < 90, lastReadMine = null, h = '';
  ms.forEach(function (m) { if (m.sender_id === me && new Date(m.created_at).getTime() <= S.peerRead) lastReadMine = m.id; });
  ms.forEach(function (m, i) {
    var pv = ms[i - 1], nx = ms[i + 1], mine = m.sender_id === me;
    var newDay = !pv || dayKey(pv.created_at) !== dayKey(m.created_at);
    var first = newDay || pv.sender_id !== m.sender_id;
    var lastOfMin = !nx || nx.sender_id !== m.sender_id || minKey(nx.created_at) !== minKey(m.created_at) || dayKey(nx.created_at) !== dayKey(m.created_at);
    if (newDay) h += '<div class="dsep"><span>' + dayLabel(m.created_at) + '</span></div>';
    var meta = '';
    if (mine) {
      var unread = new Date(m.created_at).getTime() > S.peerRead;
      meta = (unread ? '<span class="rd">1</span>' : (m.id === lastReadMine ? '<span class="rd on">읽음</span>' : '')) + (lastOfMin ? '<span>' + hm(m.created_at) + '</span>' : '');
    } else if (lastOfMin) meta = '<span>' + hm(m.created_at) + '</span>';
    meta = meta ? '<div class="mmeta">' + meta + '</div>' : '';
    if (mine) h += '<div class="mrow me' + (first ? ' first' : '') + '"><div class="mline">' + meta + '<div class="bub">' + esc(m.body) + '</div></div></div>';
    else h += '<div class="mrow other' + (first ? ' first' : '') + '">' + (first ? av(m.sender_id || o, 36, true) : '<span class="avsp"></span>') +
      '<div class="mcol">' + (first ? '<span class="nm">' + esc(nick(m.sender_id || o)) + '</span>' : '') +
      '<div class="mline"><button class="bub" data-act="msgtap" data-id="' + m.id + '">' + esc(m.body) + '</button>' + meta + '</div>' +
      (S.repMsg === m.id ? '<button class="mrep" data-act="repmsg" data-id="' + m.id + '">신고</button>' : '') + '</div></div>';
  });
  el.innerHTML = h;
  if (stick || near) el.scrollTop = el.scrollHeight;
}

/* ───────── 시트 ───────── */
function openSheet(html) {
  $('#sheet').innerHTML = '<div class="sheetwrap"><button class="scrim" data-act="close" aria-label="닫기"></button><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div></div>';
}
function closeSheet() { var s = $('#sheet'); if (s) s.innerHTML = ''; }
function friendBtn(id) {
  var f = S.fr.by[id];
  if (!f) return '<button class="btn sm" data-act="freq" data-u="' + esc(id) + '">친구 요청</button>';
  if (f.status === 'accepted') return '<span class="sub">친구</span>';
  if (f.mine) return '<button class="btn sm sec" data-act="fcancel" data-id="' + f.id + '" data-u="' + esc(id) + '">요청 취소</button>';
  return '<button class="btn sm" data-act="respond" data-id="' + f.id + '" data-v="1">수락</button>';
}
function openUser(id, nog) {
  var f = S.fr.by[id], me = id === S.me.id, h = '<div class="profile">' + av(id, 52) + '<div><b>' + esc(nick(id)) + '</b>' + (!nog && gl(id) ? '<p>' + (gl(id) === '남' ? '남자' : '여자') + '</p>' : '') + '</div></div><div class="stack">';
  if (!me) {
    if (f && f.status === 'accepted') h += '<button class="btn" data-act="chatwith" data-u="' + esc(id) + '">채팅하기</button>';
    else if (!f) h += '<button class="btn" data-act="freq" data-u="' + esc(id) + '">친구 요청 보내기</button>';
    else if (f.mine) h += '<button class="btn sec" data-act="fcancel" data-id="' + f.id + '" data-u="' + esc(id) + '">친구 요청 취소</button>';
    else h += '<button class="btn" data-act="respond" data-id="' + f.id + '" data-v="1">친구 요청 수락</button>';
    h += '<button class="btn sec" data-act="repuser" data-u="' + esc(id) + '">신고</button><button class="btn dg" data-act="block" data-u="' + esc(id) + '">차단</button>';
  }
  openSheet(h + '</div>');
}
function openReport(t) {
  S.rep = t;
  var rs = ['욕설·비하 표현', '불쾌하거나 부적절한 내용', '스팸·광고', '만남을 강요하거나 위협', '기타'];
  openSheet('<h3>신고하기</h3><div role="radiogroup" aria-label="신고 이유">' + rs.map(function (r, i) {
    return '<label class="rd2"><input type="radio" name="rr" value="' + esc(r) + '"' + (i === 0 ? ' checked' : '') + '>' + esc(r) + '</label>';
  }).join('') + '</div><textarea id="rdt" class="plain" maxlength="300" placeholder="자세한 내용 (선택)" aria-label="자세한 내용"></textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn sec" data-act="close">취소</button><button class="btn dg" data-act="sendrep">신고</button></div>');
}
function openNotes() {
  openSheet('<h3>알림</h3>' + (S.notes.length ? S.notes.map(function (n) { return '<div class="note">' + esc(n.body) + '<time>' + ago(n.created_at) + '</time></div>'; }).join('') : '<div class="empty">새 알림이 없어요.</div>'));
  if (S.notes.some(function (n) { return !n.read; })) {
    rpc('mark_notifications_read').then(function () { S.notes.forEach(function (n) { n.read = true; }); paintBell(); }).catch(function () { /* 무시 */ });
  }
}
function openSearch() {
  openSheet('<h3>친구 추가</h3><p class="sub" style="margin-bottom:8px">같은 학교 사람의 닉네임으로 찾아요.</p><div class="inline"><input type="text" id="fq" maxlength="10" placeholder="닉네임" autocomplete="off" aria-label="닉네임 검색"><button class="btn" data-act="fdo">검색</button></div><div id="fres" style="margin-top:8px"></div>');
}
async function doSearch() {
  var q = (($('#fq') || {}).value || '').trim(), el = $('#fres'); if (!el) return;
  if (!q) { el.innerHTML = ''; return; }
  var like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  var rows = ok(await S.sb.from('profiles').select('id,nickname,gender').eq('school_id', S.me.school_id).neq('id', S.me.id).ilike('nickname', like).limit(20)) || [];
  rows = rows.filter(function (r) { return S.blocks.indexOf(r.id) < 0; });
  rows.forEach(function (r) { S.names[r.id] = r; });
  el.innerHTML = rows.length ? rows.map(function (r) { return '<div class="fl">' + av(r.id, 38) + '<div class="tx">' + esc(r.nickname) + '</div>' + friendBtn(r.id) + '</div>'; }).join('') : '<div class="empty">찾는 사람이 없어요.</div>';
}

/* ───────── 화면 이동 ───────── */
function go(v) { S.view = v; history.pushState({ v: 1 }, ''); render(); }
function swap(v) { S.view = v; history.replaceState({ v: 1 }, ''); render(); }
function back() { if (S.view) { if (history.state && history.state.v) history.back(); else popView(); } }
function popView() {
  var was = S.view; S.view = null; S.cur = null; S.cmts = null; S.msgs = null; S.repMsg = null; closeSheet(); render();
  if (was && was.t === 'room') later('rooms', loadRooms, 50);
}
window.addEventListener('popstate', function () { if (S.view) popView(); else closeSheet(); });
async function openPost(id, replace) {
  var p = (S.posts[S.kind] || []).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!p) { p = ok(await S.sb.from('post_feed').select('*').eq('id', id).maybeSingle()); if (!p) { toast('삭제되었거나 볼 수 없는 글이에요.'); return; } await loadNames([p.author_id]); }
  S.cur = p; S.cmts = null; S.replyTo = null; (replace ? swap : go)({ t: 'post', id: p.id });
  await loadCmts();
}
async function openRoom(dm, other) {
  S.msgs = null; S.peerRead = 0; S.repMsg = null; closeSheet(); go({ t: 'room', dm: Number(dm), other: other });
  await Promise.all([loadMsgs(), loadPeer()]); paintMsgs(true); markRead();
}

/* ───────── 동작 ───────── */
var H = {
  close: function () { closeSheet(); },
  back: function () { back(); },
  mode: function (el) { S.email = ($('#em') || {}).value || ''; S.authMode = el.dataset.v; render(); },
  tab: function (el) { S.tab = el.dataset.v; render(); if (S.tab === 'board' && !S.posts[S.kind]) loadPosts().catch(function (e) { toast(msg(e)); }); if (S.tab === 'chat') loadRooms().catch(function (e) { toast(msg(e)); }); },
  kind: function (el) { S.kind = el.dataset.v; render(); loadPosts().catch(function (e) { toast(msg(e)); }); },
  gender: function (el) { document.querySelectorAll('#sg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); S.gender = el.dataset.v; },
  auth: async function () {
    var em = (($('#em') || {}).value || '').trim(), pw = ($('#pw') || {}).value || '', er = $('#aerr'), su = S.authMode === 'signup';
    S.email = em; er.textContent = '';
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('BAD_EMAIL');
      if (pw.length < 6) throw new Error('BAD_PASSWORD');
      if (su && CFG.EMAIL_VERIFY) {
        var sr = await S.sb.auth.signUp({ email: em, password: pw });
        if (sr.error) throw sr.error;
        if (sr.data && sr.data.session) { await S.sb.auth.signOut(); throw new Error('CONFIRM_OFF'); }
        if (sr.data && sr.data.user && sr.data.user.identities && !sr.data.user.identities.length) throw new Error('EMAIL_TAKEN');
        S.verify = { email: em }; render(); return;
      }
      if (su) {
        var res = await fetch(CFG.SUPABASE_URL + '/functions/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY }, body: JSON.stringify({ email: em, password: pw }) });
        var j = {}; try { j = await res.json(); } catch (e) { /* 무시 */ }
        if (!res.ok || !j.ok) throw new Error(j.error || 'FAILED');
      }
      var r = await S.sb.auth.signInWithPassword({ email: em, password: pw });
      if (r.error) throw r.error;
      await startSession(r.data && r.data.session ? r.data.session : (await S.sb.auth.getSession()).data.session);
    } catch (e) { er.textContent = msg(e); }
  },
  verify: async function () {
    var er = $('#aerr'), code = (($('#vc') || {}).value || '').replace(/\s/g, ''); er.textContent = '';
    try {
      if (!/^\d{6,8}$/.test(code)) { er.textContent = '메일에 적힌 숫자 6~8자리를 입력해 주세요.'; return; }
      var r = await S.sb.auth.verifyOtp({ email: S.verify.email, token: code, type: 'signup' });
      if (r.error) throw r.error;
      S.verify = null; await startSession(r.data && r.data.session ? r.data.session : (await S.sb.auth.getSession()).data.session);
    } catch (e) { er.textContent = msg(e); }
  },
  resend: async function () { var r = await S.sb.auth.resend({ type: 'signup', email: S.verify.email }); if (r.error) throw r.error; toast('인증번호를 다시 보냈어요.'); },
  cancelverify: function () { S.verify = null; render(); },
  google: async function () { var r = await S.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); if (r.error) throw r.error; },
  setup: async function () {
    var er = $('#aerr'); er.textContent = '';
    try {
      var sc = ($('#ss') || {}).value;
      await rpc('create_profile', { p_nickname: (($('#sn') || {}).value || '').trim(), p_gender: S.gender || '', p_school: sc ? Number(sc) : 0 });
      S.me = ok(await S.sb.from('profiles').select(PROFILE_COLS).eq('id', S.user.id).maybeSingle());
      await enter();
    } catch (e) { er.textContent = msg(e); }
  },
  logout: async function () { await S.sb.auth.signOut(); await startSession(null); },
  delacct: async function () { if (!confirm('계정을 삭제하면 되돌릴 수 없어요. 삭제할까요?')) return; await rpc('delete_account'); await S.sb.auth.signOut(); await startSession(null); toast('계정을 삭제했어요.'); },
  saveprofile: async function () {
    await rpc('update_profile', { p_nickname: ($('#mn').value || '').trim() });
    S.me = ok(await S.sb.from('profiles').select(PROFILE_COLS).eq('id', S.me.id).maybeSingle()); S.names[S.me.id] = S.me;
    S.posts = { meal: null, study: null }; render(); toast('저장했어요.'); loadPosts();
  },
  notes: function () { openNotes(); },
  compose: function () { go({ t: 'compose' }); },
  submitpost: async function () {
    var t = ($('#ct').value || '').trim(), b = ($('#cb').value || '').trim();
    if (!t) { toast('제목을 입력해 주세요.'); return; } if (!b) { toast('내용을 입력해 주세요.'); return; }
    var a = { p_kind: S.kind, p_title: t, p_body: b };
    if ($('#ctm').checked) {
      var d = $('#cd').value, st = $('#cs').value, en = $('#ce').value;
      if (!d || !st) { toast('날짜와 시작 시간을 골라 주세요.'); return; }
      a.p_starts = new Date(d + 'T' + st).toISOString();
      if (en) { a.p_ends = new Date(d + 'T' + en).toISOString(); if (new Date(a.p_ends) <= new Date(a.p_starts)) { toast('종료 시간은 시작보다 늦어야 해요.'); return; } }
    }
    var id = await rpc('create_post', a);
    await loadPosts(); await openPost(id, true);
  },
  post: function (el) { return openPost(el.dataset.id); },
  postmenu: function () {
    var p = S.cur; if (!p) return;
    openSheet(p.author_id === S.me.id ? '<div class="stack"><button class="btn dg" data-act="delpost">글 삭제</button></div>' :
      '<div class="stack"><button class="btn sec" data-act="reppost">글 신고</button><button class="btn dg" data-act="block" data-u="' + esc(p.author_id) + '">작성자 차단</button></div>');
  },
  delpost: async function () {
    if (!confirm('이 글을 삭제할까요?')) return;
    var id = S.cur.id; await rpc('delete_post', { p_id: id }); closeSheet();
    S.posts[S.kind] = (S.posts[S.kind] || []).filter(function (x) { return x.id !== id; }); back(); toast('삭제했어요.');
  },
  reppost: function () { openReport({ p_post: S.cur.id }); },
  addcmt: async function () {
    var i = $('#ci'), b = (i.value || '').trim(); if (!b) return;
    await rpc('add_comment', { p_post: S.cur.id, p_body: b, p_parent: S.replyTo ? S.replyTo.id : null }); i.value = ''; S.replyTo = null; paintReplyBar(); await loadCmts(); var pb = $('#pb'); if (pb) pb.scrollTop = pb.scrollHeight;
  },
  like: async function (el) { await rpc('toggle_like', { p_comment: Number(el.dataset.id) }); await loadCmts(); },
  reply: function (el) { var id = Number(el.dataset.id), c = (S.cmts || []).filter(function (x) { return x.id === id; })[0]; if (!c) return; S.replyTo = { id: id, name: nick(c.author_id) }; paintReplyBar(); var i = $('#ci'); if (i) i.focus(); },
  cancelreply: function () { S.replyTo = null; paintReplyBar(); },
  delcmt: async function (el) { if (!confirm('댓글을 삭제할까요?')) return; await rpc('delete_comment', { p_id: Number(el.dataset.id) }); await loadCmts(); },
  repcmt: function (el) { openReport({ p_comment: Number(el.dataset.id) }); },
  repmsg: function (el) { openReport({ p_message: Number(el.dataset.id) }); },
  repuser: function (el) { openReport({ p_user: el.dataset.u }); },
  sendrep: async function () {
    var r = document.querySelector('input[name="rr"]:checked'), a = Object.assign({ p_reason: r ? r.value : '기타', p_detail: ($('#rdt').value || '').trim() }, S.rep);
    await rpc('report_content', a); closeSheet(); toast('신고했어요. 운영자가 확인할게요.');
  },
  user: function (el) { openUser(el.dataset.u, !!(S.view && S.view.t === 'room')); },
  block: async function (el) {
    var id = el.dataset.u; if (!confirm(nick(id) + '님을 차단할까요? 서로 글과 채팅이 보이지 않아요.')) return;
    await rpc('block_user', { p_user: id }); closeSheet(); await Promise.all([loadBlocks(), loadFriends()]);
    S.posts = { meal: null, study: null }; S.view = null; S.cur = null; S.msgs = null; render(); loadPosts(); loadRooms(); toast('차단했어요.');
  },
  unblock: async function (el) { await rpc('unblock_user', { p_user: el.dataset.u }); await loadBlocks(); S.posts = { meal: null, study: null }; render(); loadPosts(); loadRooms(); toast('차단을 해제했어요.'); },
  fsearch: function () { openSearch(); setTimeout(function () { var q = $('#fq'); if (q) q.focus(); }, 50); },
  fdo: function () { return doSearch(); },
  freq: async function (el) { await rpc('request_friend', { p_target: el.dataset.u }); toast('친구 요청을 보냈어요.'); await loadFriends(); await loadRooms(); if ($('#fres')) await doSearch(); else closeSheet(); },
  fcancel: async function (el) { await rpc('cancel_friend_request', { p_id: Number(el.dataset.id) }); await loadFriends(); if ($('#fres')) await doSearch(); else closeSheet(); },
  respond: async function (el) {
    var yes = el.dataset.v !== '0'; await rpc('respond_friend', { p_id: Number(el.dataset.id), p_accept: yes });
    closeSheet(); await loadFriends(); await loadRooms(); toast(yes ? '친구가 되었어요. 이제 채팅할 수 있어요.' : '거절했어요.');
  },
  chatwith: async function (el) { var id = el.dataset.u, dm = await rpc('open_dm', { p_user: id }); S.tab = 'chat'; await openRoom(dm, id); },
  room: function (el) { return openRoom(el.dataset.dm, el.dataset.u); },
  msgtap: function (el) { var id = Number(el.dataset.id); S.repMsg = S.repMsg === id ? null : id; paintMsgs(); },
  sendmsg: async function () {
    var i = $('#mi'), b = (i.value || '').trim(); if (!b) return;
    i.value = ''; i.focus();
    try { await rpc('send_message', { p_dm_id: S.view.dm, p_body: b }); } catch (e) { i.value = b; throw e; }
    await loadMsgs(); var m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight;
  }
};
document.addEventListener('click', async function (e) {
  var el = e.target.closest('[data-act]'); if (!el || !H[el.dataset.act] || S.busy) return;
  S.busy = true;
  try { await H[el.dataset.act](el); } catch (x) { toast(msg(x)); } finally { S.busy = false; }
});
document.addEventListener('change', function (e) {
  if (e.target.id !== 'ctm') return;
  var f = $('#tmf'); f.hidden = !e.target.checked;
  if (e.target.checked && !$('#cd').value) {
    var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    $('#cd').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
  var map = { pw: 'auth', em: 'auth', ci: 'addcmt', mi: 'sendmsg', fq: 'fdo' }, a = map[e.target.id];
  if (a) { e.preventDefault(); var b = document.querySelector('[data-act="' + a + '"]'); if (b) b.click(); }
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible' || !S.me) return;
  if (S.view && S.view.t === 'room') { loadMsgs().then(markRead); loadPeer(); } else later('rooms', loadRooms, 50);
});

/* ───────── 부팅 ───────── */
async function boot() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) { $('#screen').innerHTML = '<div class="center">config.js에 Supabase 연결 정보를 넣어 주세요.</div>'; return; }
  S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  render();
  S.sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'SIGNED_OUT') later('auth', function () { startSession(null); }, 0);
    else if (ev === 'SIGNED_IN' && session) later('auth', function () { startSession(session); }, 0);
  });
  var r = await S.sb.auth.getSession();
  await startSession(r.data && r.data.session);
}
boot();
})();
