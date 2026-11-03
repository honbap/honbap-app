/* 밥친구: 같은 학교 혼밥러 커뮤니티 (게시판 · 참여 · 단체 채팅 · 1:1 채팅). 권한은 모두 DB(RLS·RPC)가 확인해요. */
(function () {
'use strict';
var CFG = window.HONBAP || {};
var $ = function (s) { return document.querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

var S = {
  sb: null, user: null, me: null, schools: [], tab: 'board', kind: 'meal', chatSeg: 'dm', authMode: 'login', email: '', gender: '', starting: false,
  posts: { meal: null, study: null, date: null }, rooms: null, names: {}, fr: { rows: [], by: {}, incoming: [] },
  notes: [], blocks: [], likes: [], members: null, replyTo: null, verify: null, resendAt: 0, cap: 4,
  view: null, vs: [], cur: null, cmts: null, msgs: null, myPosts: {}, sq: '', sk: 'all', psr: null, sort: 'new', stats: null, peerRead: 0, gmem: [], greads: {}, repMsg: null, rep: null, busy: false, ready: false
};

/* ───────── 작은 도구 ───────── */
var ICON = {
  back: 'M15 5l-7 7 7 7', plus: 'M12 5v14M5 12h14', bell: 'M6 9a6 6 0 0112 0c0 5 2 6 2 7H4c0-1 2-2 2-7zM10 20a2 2 0 004 0',
  send: 'M4 12l16-8-6 16-3-7-7-1z', chat: 'M4 5h16v11H9l-5 4z', board: 'M5 4h14v16H5zM9 9h6M9 13h6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6', more: 'M12 6v.01M12 12v.01M12 18v.01',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', userplus: 'M10 12a4 4 0 100-8 4 4 0 000 8zM2 20c0-4 4-6 8-6M18 8v6M15 11h6', close: 'M6 6l12 12M18 6L6 18',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4', ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM6 6l12 12', info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8v.01', chev: 'M9 5l7 7-7 7', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4', crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z', heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z', clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  wheel: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4',
  group: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16.5 4.5a3.5 3.5 0 010 6.5M18 14.5c2.5.5 4 2.2 4 5.5'
};
function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[n] + '"/></svg>'; }
function ib(act, icon, label) { return '<button class="ib" data-act="' + act + '" aria-label="' + label + '">' + ic(icon) + '</button>'; }
/* 알림 띄우기. 오류·주의는 빨간색(err), 성공은 기본색 */
function toast(m, err) { var el = $('#toast'); if (!el) return; el.textContent = m; el.classList.toggle('err', !!err); el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { el.classList.remove('on'); }, err ? 4200 : 2800); }
function fail(e) { toast(msg(e), true); }
var ERR = [
  ['Invalid login', '이메일이나 비밀번호가 맞지 않아요.'], ['EMAIL_TAKEN', '이미 가입된 이메일이에요. 로그인해 주세요.'], ['BAD_EMAIL', '이메일 주소를 확인해 주세요.'],
  ['BAD_PASSWORD', '비밀번호는 8자 이상이고 영문과 숫자를 모두 포함해야 해요.'], ['PW_MISMATCH', '비밀번호 확인이 서로 달라요.'], ['NEED_PASSWORD', '비밀번호를 입력해 주세요.'],
  ['NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요.'], ['BAD_CONTENT', '부적절한 표현이 들어 있어요. 다른 말로 써 주세요.'], ['NICKNAME_RESERVED', '사용할 수 없는 닉네임이에요. (운영·관리자 등은 쓸 수 없어요)'], ['NICKNAME_COOLDOWN', '닉네임은 7일에 한 번만 바꿀 수 있어요.'],
  ['BAD_NICKNAME', '닉네임은 2~10자, 한글·영문·숫자·_ 만 쓸 수 있어요.'], ['BAD_SCHOOL', '학교를 골라 주세요.'], ['BAD_GENDER', '남자/여자 중에 골라 주세요.'],
  ['TERMS_REQUIRED', '필수 항목에 모두 동의해야 시작할 수 있어요.'],
  ['BAD_TITLE', '제목은 1~40자로 써 주세요.'], ['BAD_BODY', '내용은 1~1000자로 써 주세요.'], ['BAD_COMMENT', '댓글은 1~200자로 써 주세요.'], ['BAD_MESSAGE', '메시지는 1~500자로 써 주세요.'],
  ['BAD_CAPACITY', '모집 인원은 2~10명이에요.'], ['RATE_LIMIT', '너무 빨라요. 잠시 후 다시 해 주세요.'],
  ['USER_NOT_FOUND', '그 사람을 찾을 수 없어요.'], ['ALREADY_FRIENDS', '이미 친구예요.'], ['ALREADY_REQUESTED', '이미 요청을 보냈어요.'],
  ['TOO_MANY_REQUESTS', '보낸 요청이 너무 많아요. 잠시 후에 해 주세요.'], ['BLOCKED', '차단 관계라 할 수 없어요.'], ['NOT_FRIENDS', '친구끼리만 채팅할 수 있어요.'],
  ['POST_FULL', '자리가 다 찼어요.'], ['POST_CLOSED', '모집이 마감된 글이에요.'], ['ALREADY_JOINED', '이미 참여했어요.'], ['AUTHOR_CANNOT_LEAVE', '글쓴이는 나갈 수 없어요. 글을 삭제해 주세요.'],
  ['NOT_JOINED', '참여 중이 아니에요.'], ['ROOM_NOT_FOUND', '채팅방을 찾을 수 없어요.'], ['POST_NOT_FOUND', '삭제되었거나 볼 수 없는 글이에요.'], ['NOT_AUTHOR', '글쓴이만 할 수 있어요.'],
  ['Email not confirmed', '이메일 인증이 필요해요.'], ['Token has expired', '인증번호가 맞지 않거나 만료됐어요.'], ['otp_expired', '인증번호가 맞지 않거나 만료됐어요.'],
  ['rate limit', '메일을 너무 자주 보냈어요. 잠시 후 다시 해 주세요.'], ['sending confirmation', '인증 메일을 보내지 못했어요. 잠시 후 다시 해 주세요.'],
  ['BAD_TIME', '모이는 시간을 확인해 주세요. (지금부터 60일 이내, 종료는 시작 뒤 12시간 이내)'], ['REPLY_TOO_DEEP', '답글에는 답글을 달 수 없어요.'], ['COMMENT_NOT_FOUND', '댓글을 찾을 수 없어요.'],
  ['CONFIRM_OFF', '메일 인증 설정이 꺼져 있어요. 운영자에게 알려 주세요.'], ['SUSPENDED', '이용이 정지된 계정이에요.'], ['Failed to fetch', '인터넷 연결을 확인해 주세요.']
];
function msg(e) {
  var t = String((e && (e.message || e.code)) || e || '');
  for (var i = 0; i < ERR.length; i++) if (t.indexOf(ERR[i][0]) >= 0) return ERR[i][1];
  if (window.console) console.error(e);
  return '일시적인 오류가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
function ok(r) {
  if (r.error) {
    var t = String(r.error.message || '') + ' ' + String(r.error.code || '');
    if (/JWT|PGRST301|NOT_LOGGED_IN|user from sub claim/i.test(t) && S.user) later('expired', function () { hardLogout('로그인이 만료됐어요. 다시 로그인해 주세요.'); }, 0);
    throw r.error;
  }
  return r.data;
}
function rpc(n, a) { return S.sb.rpc(n, a || {}).then(ok); }
function ago(t) {
  var s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 604800) return Math.floor(s / 86400) + '일 전'; var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate();
}
var DOW = '일월화수목금토';
function hm(t) { return new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }); }
function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function dayLabel(t) { var d = new Date(t); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DOW[d.getDay()] + '요일'; }
function minKey(t) { return Math.floor(new Date(t).getTime() / 60000); }
/* 모이는 시간: 날짜(크게) 아래에 시간~시간 */
function tbox(p, small) {
  if (!p || !p.starts_at) return '';
  var a = new Date(p.starts_at), b = p.ends_at ? new Date(p.ends_at) : null, t = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  return '<span class="tbox' + (small ? ' sm' : '') + '">' + ic('clock') + '<span class="tl"><span class="td">' + (a.getMonth() + 1) + '월 ' + a.getDate() + '일 (' + DOW[a.getDay()] + ')</span><span class="tt">' + t(a) + (b ? ' ~ ' + t(b) : ' 시작') + '</span></span></span>';
}
function nick(id) { var u = S.names[id]; return u ? u.nickname : '알 수 없음'; }
function nm(id) { var u = S.names[id]; return esc(nick(id)) + (u && u.is_admin ? ' <span class="crown" title="운영자">' + ic('crown') + '</span>' : ''); }
function gl(id) { var u = S.names[id]; return u && u.gender === '남성' ? '남' : u && u.gender === '여성' ? '여' : ''; }
function hue(id) { var h = 0, s = String(id || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function av(id, size, act) {
  var st = ' style="--s:' + size + 'px"', inner = ic('user');
  return act ? '<button class="avatar anon" data-act="user" data-u="' + esc(id) + '" aria-label="' + esc(nick(id)) + ' 프로필"' + st + '>' + inner + '</button>' : '<span class="avatar anon" aria-hidden="true"' + st + '>' + inner + '</span>';
}
function gav(post, title, size) { return '<span class="avatar anon sq" aria-hidden="true" style="--s:' + size + 'px">' + ic('group') + '</span>'; }
var timers = {};
function later(k, fn, ms) { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms == null ? 250 : ms); }
function schoolName(id) { for (var i = 0; i < S.schools.length; i++) if (S.schools[i].id === id) return S.schools[i].name; return ''; }
function unreadOf(kind) { return (S.rooms || []).filter(function (r) { return r.kind === kind; }).reduce(function (a, r) { return a + (r.unread || 0); }, 0); }
function unreadTotal() { return unreadOf('dm') + unreadOf('group') + S.fr.incoming.length; }
function pwOk(p) { return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p); }
function isRoom(v) { return v && v.t === 'room'; }
function roomKey(v) { return v.k === 'dm' ? 'd:' + v.dm : 'p:' + v.post; }
var PROFILE_COLS = 'id,nickname,gender,school_id,is_admin,suspended,nickname_changed_at';
var LEGAL = 'legal.html';

/* ───────── 데이터 불러오기 ───────── */
async function loadNames(ids) {
  ids = ids.filter(function (x, i, a) { return x && a.indexOf(x) === i && !S.names[x]; });
  if (!ids.length) return;
  (ok(await S.sb.from('profiles').select('id,nickname,gender,is_admin').in('id', ids)) || []).forEach(function (p) { S.names[p.id] = p; });
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
  var mm = ok(await S.sb.from('post_members').select('post_id').eq('user_id', S.me.id)) || [], my = {};
  mm.forEach(function (x) { my[x.post_id] = 1; });
  S.myPosts = my; S.posts[k] = rows; paintList();
}
async function loadRooms() {
  S.rooms = ok(await S.sb.rpc('my_rooms')) || [];
  await loadNames(S.rooms.map(function (r) { return r.other_user; }).concat(S.rooms.map(function (r) { return r.last_sender; })));
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
async function loadMembers() {
  var v = S.view; if (!v || v.t !== 'post') return;
  var rows = ok(await S.sb.from('post_members').select('user_id,joined_at').eq('post_id', v.id).order('joined_at')) || [];
  await loadNames(rows.map(function (r) { return r.user_id; }));
  if (S.view && S.view.t === 'post' && S.view.id === v.id) { S.members = rows; paintPost(); }
}
async function loadCmts() {
  return;
  if (!S.view || S.view.t !== 'post') return;
  var id = S.view.id;
  var rows = ok(await S.sb.from('comments').select('*').eq('post_id', id).eq('hidden', false).order('id')) || [];
  await loadNames(rows.map(function (r) { return r.author_id; }));
  var likes = rows.length ? (ok(await S.sb.from('comment_likes').select('comment_id,user_id').in('comment_id', rows.map(function (r) { return r.id; }))) || []) : [];
  if (S.view && S.view.t === 'post' && S.view.id === id) { S.cmts = rows; S.likes = likes; paintPost(); }
}
async function loadMsgs() {
  var v = S.view; if (!isRoom(v)) return;
  var q = S.sb.from('messages').select('id,sender_id,body,created_at,hidden');
  q = v.k === 'dm' ? q.eq('dm_id', v.dm) : q.eq('post_id', v.post);
  var rows = ok(await q.order('id', { ascending: false }).limit(100)) || [];
  await loadNames(rows.map(function (r) { return r.sender_id; }));
  if (!isRoom(S.view) || roomKey(S.view) !== roomKey(v)) return;
  S.msgs = rows.filter(function (m) { return !m.hidden; }).reverse(); paintMsgs();
}
async function loadPeer() {
  var v = S.view; if (!isRoom(v)) return;
  if (v.k === 'group') {
    var mem = ok(await S.sb.from('post_members').select('user_id,joined_at').eq('post_id', v.post)) || [];
    var rr = ok(await S.sb.from('room_reads').select('user_id,last_read_at').eq('room_key', 'p:' + v.post)) || [], gr = {};
    rr.forEach(function (x) { gr[x.user_id] = new Date(x.last_read_at).getTime(); });
    if (!isRoom(S.view) || S.view.post !== v.post) return;
    S.gmem = mem; S.greads = gr; paintMsgs(); return;
  }
  var r = ok(await S.sb.from('room_reads').select('last_read_at').eq('room_key', 'd:' + v.dm).eq('user_id', v.other).maybeSingle());
  S.peerRead = r ? new Date(r.last_read_at).getTime() : 0; paintMsgs();
}
async function markRead() {
  var v = S.view; if (!isRoom(v) || document.visibilityState !== 'visible') return;
  try { await rpc('mark_read', { p_key: roomKey(v) }); } catch (e) { return; }
  (S.rooms || []).forEach(function (r) { if (r.room_key === roomKey(v)) r.unread = 0; });
  paintNav(); paintRooms();
}

/* ───────── 시작 · 로그인 ───────── */
async function startSession(session) {
  if (!session) { teardown(); S.user = null; S.me = null; S.ready = true; render(); return; }
  if (S.starting || (S.user && S.user.id === session.user.id && S.me)) return;
  S.starting = true; S.user = session.user;
  try {
    S.me = ok(await S.sb.from('profiles').select(PROFILE_COLS).eq('id', S.user.id).maybeSingle()) || null; S.ready = true;
    if (!S.me) { await loadSchools(); render(); } else await enter();
  } catch (e) { S.ready = true; render(); fail(e); } finally { S.starting = false; }
}
async function enter() {
  S.names[S.me.id] = S.me;
  if (S.me.suspended) { render(); return; }
  await Promise.all([loadSchools(), loadFriends(), loadBlocks()]);
  render();
  await Promise.all([loadPosts(), loadRooms(), loadNotes()]);
  subscribe();
}
/* 로그아웃·탈퇴: 어떤 경우에도 바로 로그인 화면으로 */
async function hardLogout(message, isErr) {
  try { await S.sb.auth.signOut({ scope: 'local' }); } catch (e) { /* 이미 만료된 세션이어도 계속 */ }
  S.authMode = 'login'; S.verify = null; S.email = '';
  await startSession(null);
  if (message) toast(message, isErr);
}
var chan = null;
/* 알림: 앱을 보고 있으면 화면 위 알림, 다른 탭/백그라운드면 브라우저 알림 */
function notifyOff() { try { return localStorage.getItem('hb_notify_off') === '1'; } catch (e) { return false; } }
function banner(text, href) {
  var el = $('#banner'); if (!el) { el = document.createElement('button'); el.id = 'banner'; el.className = 'banner'; el.setAttribute('data-act', 'banner'); el.setAttribute('role', 'status'); var t = $('#toast'); t.parentNode.insertBefore(el, t); }
  el.textContent = text; el.dataset.href = href || ''; el.classList.add('on');
  clearTimeout(banner.h); banner.h = setTimeout(function () { el.classList.remove('on'); }, 4500);
}
function ping(title, body, href) {
  if (notifyOff()) return;
  if (document.visibilityState === 'visible') { banner(title + (body ? ' ' + body : ''), href); return; }
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body || '', icon: 'icon-192.png', tag: 'honbap' }); } catch (e) { /* 무시 */ }
}
/* 채팅방별 알림 끄기·목록 숨기기: 이 기기에만 저장돼요 */
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
function lsSet(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* 무시 */ } }
function isMuted(key) { return !!lsGet('hb_mute')[key]; }
function setMuted(key, on) { var m = lsGet('hb_mute'); if (on) m[key] = 1; else delete m[key]; lsSet('hb_mute', m); }
function isHidden(r) { var t = lsGet('hb_hide')['d:' + r.dm_id]; return !!t && (!r.last_at || new Date(r.last_at).getTime() <= t); }
function openRoomMenu() {
  var v = S.view; if (!isRoom(v)) return; var key = roomKey(v), mu = isMuted(key);
  openSheet('<h3>' + (v.k === 'dm' ? esc(nick(v.other)) : esc(v.title)) + '</h3><div class="stack">' +
    '<button class="btn sec" data-act="roommute">' + (mu ? '🔔 이 채팅 알림 켜기' : '🔕 이 채팅 알림 끄기') + '</button>' +
    (v.k === 'dm' ? '<button class="btn sec" data-act="block" data-u="' + esc(v.other) + '">🚫 ' + esc(nick(v.other)) + '님 차단하기</button>' : '') +
    '<button class="btn dg" data-act="roomleave">채팅방 나가기</button></div>');
}
async function notifyMsg(n) {
  if (!n || n.hidden || n.sender_id === S.me.id || !n.sender_id) return;
  var v = S.view; if (isRoom(v) && document.visibilityState === 'visible' && ((v.k === 'dm' && n.dm_id === v.dm) || (v.k === 'group' && n.post_id === v.post))) return;
  if (isMuted(n.post_id ? 'p:' + n.post_id : 'd:' + n.dm_id)) return;
  await loadNames([n.sender_id]);
  var where = n.post_id ? ((S.rooms || []).filter(function (r) { return r.post_id === n.post_id; })[0] || {}).title : '';
  ping((where ? '[' + where + '] ' : '') + nick(n.sender_id) + ':', String(n.body || '').slice(0, 60));
}
function notifyNote(n) { if (n && n.user_id === S.me.id && n.body) ping(n.body, '', n.kind === 'report' ? 'admin.html' : ''); }
function subscribe() {
  if (chan) return;
  var q = function (t) { return { event: '*', schema: 'public', table: t }; };
  chan = S.sb.channel('app')
    .on('postgres_changes', q('messages'), function (p) {
      var v = S.view, n = p.new || {};
      if (p.eventType === 'INSERT') notifyMsg(n);
      later('rooms', loadRooms);
      if (isRoom(v) && ((v.k === 'dm' && n.dm_id === v.dm) || (v.k === 'group' && n.post_id === v.post))) loadMsgs().then(function () { if (n.sender_id !== S.me.id) markRead(); });
    })
    .on('postgres_changes', q('room_reads'), function () { if (isRoom(S.view)) later('peer', loadPeer, 100); later('rooms', loadRooms); })
    .on('postgres_changes', q('post_members'), function () { later('mem', loadMembers, 150); later('posts', loadPosts, 400); later('rooms', loadRooms, 300); })
    .on('postgres_changes', q('posts'), function () { later('posts', loadPosts, 400); })
    .on('postgres_changes', q('friendships'), function () { later('fr', function () { loadFriends().then(loadRooms); }, 200); })
    .on('postgres_changes', q('notifications'), function (p) { if (p.eventType === 'INSERT') notifyNote(p.new); later('notes', loadNotes, 200); })
    .subscribe();
}
function teardown() {
  if (chan && S.sb) { try { S.sb.removeChannel(chan); } catch (e) { /* 무시 */ } }
  chan = null; S.view = null; S.vs = []; S.cur = null; S.tab = 'board'; S.chatSeg = 'dm'; S.posts = { meal: null, study: null, date: null }; S.rooms = null; S.notes = [];
  S.fr = { rows: [], by: {}, incoming: [] }; S.names = {}; S.msgs = null; S.cmts = null; S.members = null; closeSheet();
}

/* ───────── 화면 그리기 ───────── */
function render() {
  var el = $('#screen'), h;
  if (!S.ready) h = '<div class="center"><div class="loading"><i class="spin"></i>불러오는 중…</div></div>';
  else if (!S.user) h = vAuth();
  else if (!S.me) h = vSetup();
  else if (S.me.suspended) h = '<div class="center"><div class="stack"><p class="warn">이용이 정지된 계정이에요.</p><button class="btn sec" data-act="logout">로그아웃</button></div></div>';
  else if (S.view && S.view.t === 'post') h = vPost();
  else if (S.view && S.view.t === 'compose') h = vCompose();
  else if (isRoom(S.view)) h = vRoom();
  else h = vMain();
  el.innerHTML = '<div class="view">' + h + '</div>';
  var nt = $('#notice'); if (nt) nt.hidden = S.seenNotice || !!S.me;
  paintList(); paintSearch(); paintRooms(); paintPost(); paintReplyBar(); paintMsgs(true); paintBell(); paintNav();
}
function nav() {
  var t = [['board', 'board', '게시판'], ['chat', 'chat', '채팅'], ['wheel', 'wheel', '돌림판'], ['search', 'search', '검색'], ['me', 'user', '내 정보']];
  return '<nav class="nav" aria-label="메뉴">' + t.map(function (x) {
    return '<button data-act="tab" data-v="' + x[0] + '"' + (S.tab === x[0] ? ' aria-current="page"' : '') + '>' + ic(x[1]) + x[2] + (x[0] === 'chat' ? '<span class="bdg" id="nbdg" hidden></span>' : '') + '</button>';
  }).join('') + '</nav>';
}

/* ---------- 돌림판 탭: 점심 메뉴 돌림판 + 저녁 내기 (서버 없이 이 기기에서만 동작) ---------- */
var RL_COLORS = ['#FF8A65', '#FFCA28', '#9CCC65', '#4DD0E1', '#7986CB', '#F06292', '#FFB74D', '#4DB6AC', '#BA68C8', '#A1887F', '#81C784', '#64B5F6'];
var RL_DEF = [['🍜', '라면'], ['🍛', '카레'], ['🍣', '초밥'], ['🍕', '피자'], ['🍗', '치킨'], ['🥘', '찌개'], ['🍔', '버거'], ['🍝', '파스타']];
function rlLoad() {
  if (S.rl) return S.rl;
  var d = null;
  try { d = JSON.parse(localStorage.getItem('hb_rl') || 'null'); } catch (e) { d = null; }
  var ok = d && Array.isArray(d.menus) && d.menus.length >= 2 && Array.isArray(d.people);
  S.rl = { menus: ok ? d.menus.slice(0, 12) : RL_DEF.slice(), people: ok ? d.people.slice(0, 10) : [S.me ? S.me.nickname : '나'], angle: 0, spinning: false, res: null, bet: null };
  if (!S.rl.people.length) S.rl.people = [S.me ? S.me.nickname : '나'];
  return S.rl;
}
function rlSave() { try { localStorage.setItem('hb_rl', JSON.stringify({ menus: S.rl.menus, people: S.rl.people })); } catch (e) { /* 저장 못 해도 괜찮아요 */ } }
function rlRand(n) { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); } }
function rlWheel(r) {
  var n = r.menus.length, a = 360 / n, R = 100, out = '';
  for (var i = 0; i < n; i++) {
    var a0 = (i * a - 90) * Math.PI / 180, a1 = ((i + 1) * a - 90) * Math.PI / 180, mid = (i * a + a / 2);
    var p = n === 1 ? '' : 'M0 0L' + (R * Math.cos(a0)).toFixed(2) + ' ' + (R * Math.sin(a0)).toFixed(2) + 'A' + R + ' ' + R + ' 0 ' + (a > 180 ? 1 : 0) + ' 1 ' + (R * Math.cos(a1)).toFixed(2) + ' ' + (R * Math.sin(a1)).toFixed(2) + 'Z';
    out += '<path d="' + p + '" fill="' + RL_COLORS[i % RL_COLORS.length] + '" stroke="#fff" stroke-width="1.5"/>' +
      '<g transform="rotate(' + mid + ') translate(0 -66)"><text text-anchor="middle" font-size="' + (n > 8 ? 17 : 21) + '" y="2">' + esc(r.menus[i][0]) + '</text>' +
      '<text text-anchor="middle" font-size="' + (n > 8 ? 7 : 8.5) + '" y="' + (n > 8 ? 13 : 15) + '" fill="#3a2a20" font-weight="700">' + esc(r.menus[i][1]) + '</text></g>';
  }
  return '<div class="rlw"><div class="rlpin" aria-hidden="true"></div><svg viewBox="0 0 208 208" class="rlsvg" role="img" aria-label="메뉴 돌림판"><g id="wheel" style="transform:rotate(' + r.angle + 'deg)"><g transform="translate(104 104)">' + out + '</g></g><circle cx="104" cy="104" r="11" fill="#fff" stroke="#e5e5e5"/></svg></div>';
}
function vWheel() {
  var r = rlLoad();
  var ppl = r.people.map(function (n, i) {
    return '<div class="rlp' + (r.bet === i ? ' lose' : '') + '" data-i="' + i + '">' + av(n, 44) + '<small>' + esc(n) + '</small></div>';
  }).join('');
  return '<div class="top"><h1>함께 정하기</h1></div><main class="rlpage">' +
    '<section class="mcard"><div class="mh"><span class="mi">' + ic('wheel') + '</span><div class="mt"><b>점심 추천 돌림판</b><small>뭐 먹을지 모르겠다면 돌려 보세요</small></div></div>' +
    '<div id="rlbox">' + rlWheel(r) + '</div><p class="rlres" id="rlres" aria-live="polite">' + rlResHtml(r) + '</p>' +
    '<div class="row"><button class="btn" data-act="rlspin"' + (r.spinning ? ' disabled' : '') + '>돌리기</button><button class="btn sec" data-act="rledit">메뉴 수정</button></div></section>' +
    '<section class="mcard"><div class="mh"><span class="mi">' + ic('group') + '</span><div class="mt"><b>밥 내기</b><small>걸린 사람이 밥 쏘기! 🍚</small></div></div>' +
    '<div class="rlppl" id="rlppl">' + ppl + '<button class="rladd" data-act="rlpeople" aria-label="참여자 추가">+</button></div>' +
    '<p class="rlres" id="rlbet" aria-live="polite">' + (r.bet != null ? '😭 <b>' + esc(r.people[r.bet]) + '</b> 님이 밥 쏩니다!' : '') + '</p>' +
    '<div class="row"><button class="btn sec" data-act="rlpeople">참여자 추가</button><button class="btn" data-act="rlbet">내기 시작</button></div></section></main>';
}
function rlResHtml(r) {
  return r.res == null ? '' : '🎉 오늘은 <b>' + esc(r.menus[r.res][0] + ' ' + r.menus[r.res][1]) + '</b>!<br><button class="btn sm sec" data-act="rlpost">이 메뉴로 같이 먹을 사람 구하기</button>';
}
function rlSpin() {
  var r = rlLoad(); if (r.spinning) return;
  var n = r.menus.length, i = rlRand(n), a = 360 / n, w = $('#wheel'); if (!w) return;
  var cur = ((r.angle % 360) + 360) % 360, want = (360 - (i * a + a / 2)) % 360, delta = ((want - cur) + 360) % 360;
  r.angle += 360 * 5 + delta; r.spinning = true; r.res = null;
  var res = $('#rlres'); if (res) res.innerHTML = '';
  w.style.transition = 'transform 4s cubic-bezier(.17,.67,.2,1)'; void w.getBoundingClientRect(); w.style.transform = 'rotate(' + r.angle + 'deg)';
  var sb = $('[data-act="rlspin"]'); if (sb) sb.disabled = true;
  setTimeout(function () {
    r.spinning = false; r.res = i;
    var rs = $('#rlres'); if (rs) rs.innerHTML = rlResHtml(r);
    var b = $('[data-act="rlspin"]'); if (b) b.disabled = false;
  }, 4100);
}
function rlBet() {
  var r = rlLoad(); if (r.spinning) return;
  if (r.people.length < 2) { toast('참여자를 2명 이상 넣어 주세요.', true); return; }
  var n = r.people.length, final = rlRand(n), T = 22; while (T % n !== final) T++;
  /* 사람 수와 상관없이 약 4초 동안 점점 느려지다가 멈춰요 */
  var w = [], sum = 0, k;
  for (k = 1; k <= T; k++) { var x = 1 + 6 * Math.pow(k / T, 2); w.push(x); sum += x; }
  var ms = w.map(function (x) { return x * 4000 / sum; }), at = 0;
  r.spinning = true; r.bet = null; var bt = $('#rlbet'); if (bt) bt.textContent = '두근두근…';
  (function tick() {
    var els = document.querySelectorAll('.rlp');
    for (var j = 0; j < els.length; j++) { els[j].classList.toggle('hi', j === at % n); els[j].classList.remove('lose'); }
    if (at >= T) {
      r.spinning = false; r.bet = at % n;
      for (var j2 = 0; j2 < els.length; j2++) { els[j2].classList.remove('hi'); els[j2].classList.toggle('lose', j2 === r.bet); }
      var b2 = $('#rlbet'); if (b2) b2.innerHTML = '😭 <b>' + esc(r.people[r.bet]) + '</b> 님이 밥 쏩니다!';
      return;
    }
    at++; setTimeout(tick, ms[at - 1]);
  })();
}
function rlEdit() {
  var r = rlLoad();
  openSheet('<h3>메뉴 수정</h3><div id="rle">' + r.menus.map(function (m, i) {
    return '<div class="fl"><span style="font-size:22px">' + esc(m[0]) + '</span><div class="tx">' + esc(m[1]) + '</div><button class="btn sm sec" data-act="rldel" data-i="' + i + '"' + (r.menus.length <= 2 ? ' disabled' : '') + '>삭제</button></div>';
  }).join('') + '</div><div class="inline" style="margin-top:10px"><input type="text" id="rle1" maxlength="2" value="🍽️" style="max-width:64px;text-align:center" aria-label="이모지"><input type="text" id="rle2" maxlength="8" placeholder="메뉴 이름" aria-label="메뉴 이름" autocomplete="off"><button class="btn" data-act="rladd">추가</button></div>' +
    '<p class="mnote">메뉴는 2개 이상 12개 이하로 둘 수 있어요. 이 기기에만 저장돼요.</p><button class="btn" data-act="rldone" style="margin-top:8px">완료</button>');
}
function rlPeople() {
  var r = rlLoad();
  openSheet('<h3>참여자 추가</h3><div id="rlpe">' + r.people.map(function (n, i) {
    return '<div class="fl">' + av(n, 34) + '<div class="tx">' + esc(n) + '</div><button class="btn sm sec" data-act="rlpdel" data-i="' + i + '"' + (r.people.length <= 1 ? ' disabled' : '') + '>삭제</button></div>';
  }).join('') + '</div><div class="inline" style="margin-top:10px"><input type="text" id="rlpn" maxlength="8" placeholder="이름 (최대 8자)" aria-label="이름" autocomplete="off"><button class="btn" data-act="rlpadd">추가</button></div>' +
    '<p class="mnote">최대 10명까지 넣을 수 있어요. 이 기기에만 저장돼요.</p><button class="btn" data-act="rldone" style="margin-top:8px">완료</button>');
}
function vMain() {
  var body;
  if (S.tab === 'board') {
    body = '<div class="top"><div class="brand"><div class="logo">밥친구</div><div class="school">' + esc(schoolName(S.me.school_id)) + '</div></div><div class="acts">' + ib('bsearch', 'search', '게시글 검색') + ib('notes', 'bell', '알림') + '</div></div>' +
      '<div class="tabs" role="tablist">' + [['meal', '밥'], ['study', '공부'], ['date', '소개팅']].map(function (k) {
        return '<button role="tab" data-act="kind" data-v="' + k[0] + '" aria-selected="' + (S.kind === k[0]) + '">' + k[1] + '</button>';
      }).join('') + '</div><main id="list"></main><button class="fab" data-act="compose" aria-label="글쓰기">' + ic('plus') + '</button>';
  } else if (S.tab === 'chat') {
    body = '<div class="top"><h1>채팅</h1></div><main id="rooms"></main>';
  } else if (S.tab === 'wheel') {
    body = vWheel();
  } else if (S.tab === 'search') {
    body = vSearch();
  } else body = vMe();
  return body + nav();
}
function vSearch() {
  var tabs = [['all', '전체'], ['meal', '밥'], ['study', '공부'], ['date', '소개팅'], ['friend', '친구']];
  return '<div class="top"><h1>검색</h1></div><main class="spage"><div class="sinp">' + ic('search') + '<input type="text" id="sq" maxlength="30" placeholder="검색어를 입력하세요" value="' + esc(S.sq) + '" autocomplete="off" aria-label="검색어"><button class="sclr" data-act="sclr" aria-label="지우기"' + (S.sq ? '' : ' hidden') + '>' + ic('close') + '</button></div>' +
    '<p class="shint" id="shint"></p><div class="tabs" role="tablist">' + tabs.map(function (k) { return '<button role="tab" data-act="sk" data-v="' + k[0] + '" aria-selected="' + (S.sk === k[0]) + '">' + k[1] + '</button>'; }).join('') + '</div><div id="sres"></div></main>';
}
function hlText(t, q) {
  var e = esc(t), qe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return qe ? e.replace(new RegExp(qe, 'gi'), function (m) { return '<mark>' + m + '</mark>'; }) : e;
}
function paintSearch() {
  var el = $('#sres'); if (!el || S.tab !== 'search') return;
  document.querySelectorAll('.spage [data-act=sk]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.v === S.sk)); });
  var cl = document.querySelector('.sclr'); if (cl) cl.hidden = !S.sq;
  var hint = $('#shint'); if (hint) hint.textContent = S.sk === 'friend' ? '같은 학교 사람을 닉네임으로 찾아요' : '제목과 내용에서 검색해요';
  if (S.sk === 'friend') { if (!$('#fres')) el.innerHTML = '<div id="fres" class="fres"></div>'; return; }
  if (!S.sq) { el.innerHTML = '<div class="empty">찾고 싶은 글의 단어를 입력해 보세요.</div>'; return; }
  if (S.psr === null) { el.innerHTML = '<div class="empty">검색 중…</div>'; return; }
  var rows = S.psr.slice();
  if (S.sort === 'old') rows.sort(function (a, b) { return a.id - b.id; });
  else if (S.sort === 'pop') rows.sort(function (a, b) { return (b.member_count || 0) - (a.member_count || 0) || b.id - a.id; });
  else rows.sort(function (a, b) { return b.id - a.id; });
  el.innerHTML = '<div class="sum"><span>' + ic('search') + '<span>\'' + esc(S.sq) + '\' 검색 결과 <b>' + rows.length + '개</b></span></span>' +
    '<select id="ssort" aria-label="정렬">' + [['new', '최신순'], ['old', '오래된순'], ['pop', '참여많은순']].map(function (o) { return '<option value="' + o[0] + '"' + (S.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
    (rows.length ? '<div class="sr">' + rows.map(function (p) { return postCard(p, S.sq); }).join('') + '</div>' : '<div class="empty">검색 결과가 없어요.</div>');
}
async function runSearch() {
  var q = (($('#sq') || {}).value || '').trim(); S.sq = q;
  if (S.sk === 'friend') { paintSearch(); await doSearch(); return; }
  var safe = q.replace(/[,()%_\\*]/g, ' ').trim();
  if (!safe) { S.psr = null; paintSearch(); return; }
  S.psr = null; paintSearch();
  var query = S.sb.from('post_feed').select('*').eq('hidden', false);
  if (S.sk !== 'all') query = query.eq('kind', S.sk);
  var rows = ok(await query.or('title.ilike.%' + safe + '%,body.ilike.%' + safe + '%').order('id', { ascending: false }).limit(100)) || [];
  await loadNames(rows.map(function (r) { return r.author_id; }));
  var mm = ok(await S.sb.from('post_members').select('post_id').eq('user_id', S.me.id)) || [], my = {};
  mm.forEach(function (x) { my[x.post_id] = 1; }); S.myPosts = my;
  if (($('#sq') || {}).value && S.sq === q) { S.psr = rows; paintSearch(); }
}
function vMe() {
  var bl = S.blocks.map(function (id) { return '<div class="fl">' + av(id, 34) + '<div class="tx">' + nm(id) + '</div><button class="btn sm sec" data-act="unblock" data-u="' + esc(id) + '">해제</button></div>'; }).join('');
  var next = S.me.nickname_changed_at ? new Date(new Date(S.me.nickname_changed_at).getTime() + 7 * 864e5) : null, cool = next && next > new Date();
  var chev = ic('chev');
  var card = function (icon, title, sub, inner) { return '<section class="mcard"><div class="mh"><span class="mi">' + ic(icon) + '</span><div class="mt"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div></div>' + (inner || '') + '</section>'; };
  return '<div class="top"><div class="brand"><div class="logo">밥친구</div><div class="school">' + esc(schoolName(S.me.school_id)) + '</div></div><div class="acts">' + ib('notes', 'bell', '알림') + '</div></div>' +
    '<main class="mepage"><section class="mcard prof">' + av(S.me.id, 72) + '<div class="pn"><b>' + esc(S.me.nickname) + '</b><small>' + esc(schoolName(S.me.school_id)) + ' · ' + esc(S.me.gender) + '</small></div></section>' +
    '<section class="mcard"><button class="mh acc" data-act="' + (S.nickEdit ? 'nickcancel' : 'nickedit') + '" aria-expanded="' + !!(S.nickEdit && !cool) + '"' + (cool ? ' disabled' : '') + '><span class="mi">' + ic('pencil') + '</span><div class="mt"><b>닉네임 바꾸기</b><small>' + esc(S.me.nickname) + '</small></div><span class="dn' + (S.nickEdit ? ' up' : '') + '">' + chev + '</span></button>' +
      (S.nickEdit && !cool ? '<div class="inline" style="margin-top:12px"><input type="text" id="mn" maxlength="10" value="' + esc(S.me.nickname) + '" aria-label="닉네임" autocomplete="off"><button class="btn" data-act="saveprofile">닉네임 저장</button></div>' : '') +
      '<p class="mnote">' + (cool ? '<span class="warn">' + (next.getMonth() + 1) + '월 ' + next.getDate() + '일 ' + hm(next) + ' 이후에 바꿀 수 있어요.</span> ' : '') + '닉네임은 7일에 한 번만 바꿀 수 있어요. 학교와 성별은 바꿀 수 없어요.</p></section>' +
    card('ban', '차단한 사람', bl ? '' : '차단한 사람이 없어요.', bl) +
    notifyCard() +
    '<section class="mcard"><div class="mh"><span class="mi fill">' + ic('info') + '</span><div class="mt"><b>안내</b></div></div><div class="links">' +
      [['terms', '이용약관'], ['rules', '커뮤니티 이용 규칙'], ['privacy', '개인정보처리방침'], ['cookies', '쿠키·저장소 안내'], ['delete', '계정 삭제 안내'], ['contact', '운영자 정보 · 문의']].map(function (l) { return '<a href="' + LEGAL + '#' + l[0] + '" target="_blank" rel="noopener">' + l[1] + chev + '</a>'; }).join('') + '</div></section>' +
    '<section class="mcard"><div class="row">' + (S.me.is_admin ? '<a class="btn sec" href="admin.html">운영자 화면</a>' : '') +
    '<button class="btn sec" data-act="logout">로그아웃</button><button class="btn dg" data-act="delacct">계정 삭제</button></div>' +
    '<p class="mnote">계정을 삭제하면 프로필, 글, 친구 관계가 모두 지워지고 되돌릴 수 없어요.</p></section>' +
    '<p class="legal">밥친구는 학교가 운영하는 공식 서비스가 아니에요.</p></main>';
}
function notifyCard() {
  var supported = 'Notification' in window, p = supported ? Notification.permission : 'unsupported', on = p === 'granted' && !notifyOff();
  var sub = !supported ? '이 브라우저는 앱 밖 알림을 지원하지 않아요.' : on ? '켜져 있어요. 참여·채팅·친구 요청을 알려 줘요.' : p === 'denied' ? '<span class="warn">브라우저에서 막혀 있어요. 설정에서 허용해 주세요.</span>' : '브라우저 알림 켜기';
  return '<section class="mcard"><div class="mh"><span class="mi">' + ic('bell') + '</span><div class="mt"><b>알림</b><small>' + sub + '</small></div>' +
    (supported && p !== 'denied' ? '<button class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="알림 켜기/끄기" data-act="allownotify"><i></i></button>' : '') + '</div></section>';
}
function legalLinks() {
  return '<p class="legal"><a href="' + LEGAL + '#terms" target="_blank" rel="noopener">이용약관</a> · <a href="' + LEGAL + '#privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="' + LEGAL + '#cookies" target="_blank" rel="noopener">쿠키 안내</a><br>밥친구는 학교가 운영하는 공식 서비스가 아니에요.</p>';
}
function vVerify() {
  return '<div class="auth"><div><div class="logo">메일 확인</div><p><b>' + esc(S.verify.email) + '</b> 로 인증번호를 보냈어요.<br>메일에 적힌 숫자를 입력해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p></div>' +
    '<label class="f">인증번호<input type="text" id="vc" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="숫자 6~8자리"></label>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="verify">인증하고 계속하기</button>' +
    '<button class="btn sec" data-act="resend">인증번호 다시 받기</button><button class="link" data-act="cancelverify">처음으로</button></div>';
}
function vReset() {
  var r = S.reset;
  if (r.step === 'email') return '<div class="auth"><div><div class="logo">비밀번호 찾기</div><p>가입한 이메일로 인증번호를 보내 드려요.</p></div>' +
    '<label class="f">이메일<input type="text" id="em" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="example@email.com" value="' + esc(S.email) + '"></label>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="resetsend">인증번호 받기</button><button class="link" data-act="resetcancel">로그인으로 돌아가기</button></div>';
  return '<div class="auth"><div><div class="logo">새 비밀번호</div><p><b>' + esc(r.email) + '</b> 로 인증번호를 보냈어요.<br>메일의 숫자와 새 비밀번호를 입력해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p></div>' +
    '<label class="f">인증번호<input type="text" id="vc" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="숫자 6~8자리"></label>' +
    '<label class="f">새 비밀번호 (8자 이상, 영문+숫자)<input type="password" id="pw" autocomplete="new-password"></label>' +
    '<label class="f">새 비밀번호 확인<input type="password" id="pw2" autocomplete="new-password"></label>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="resetdone">비밀번호 바꾸기</button>' +
    '<button class="btn sec" data-act="resetresend">인증번호 다시 받기</button><button class="link" data-act="resetcancel">로그인으로 돌아가기</button></div>';
}
function vAuth() {
  if (S.reset) return vReset();
  if (S.verify) return vVerify();
  var su = S.authMode === 'signup';
  return '<div class="auth"><div><div class="logo">밥친구</div><p>같은 학교 혼밥러들의 커뮤니티</p></div>' +
    '<div class="seg" role="group" aria-label="로그인 방식"><button data-act="mode" data-v="login" aria-pressed="' + !su + '">로그인</button><button data-act="mode" data-v="signup" aria-pressed="' + su + '">계정 만들기</button></div>' +
    '<label class="f">이메일<input type="text" id="em" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="example@email.com" value="' + esc(S.email) + '"></label>' +
    '<label class="f">비밀번호' + (su ? ' (8자 이상, 영문+숫자)' : '') + '<input type="password" id="pw" autocomplete="' + (su ? 'new-password' : 'current-password') + '"></label>' +
    (su ? '<label class="f">비밀번호 확인<input type="password" id="pw2" autocomplete="new-password"></label>' : '') +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="auth">' + (su ? '인증번호 받기' : '로그인') + '</button>' +
    (CFG.GOOGLE_LOGIN ? '<div class="or">또는</div><button class="btn gg" data-act="google">Google로 계속하기</button>' : '') +
    '<p class="sub">' + (su ? '가입하면 메일로 인증번호가 가요. 인증 뒤에 닉네임과 학교를 정해요.' : '처음이면 "계정 만들기"를 눌러 주세요.') + '</p>' + (su ? '' : '<button class="link" data-act="resetstart">비밀번호를 잊었어요</button>') + legalLinks() + '</div>';
}
function vSetup() {
  var opts = '<option value="">학교를 골라 주세요</option>' + S.schools.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
  S.gender = '';
  var chk = function (id, text, link) { return '<label class="rd2"><input type="checkbox" class="agree" id="' + id + '"> <span>' + text + (link ? ' <a href="' + LEGAL + '#' + link + '" target="_blank" rel="noopener">보기</a>' : '') + '</span></label>'; };
  return '<div class="auth"><div><div class="logo">반가워요!</div><p>닉네임과 학교만 정하면 시작할 수 있어요.</p></div>' +
    '<label class="f">닉네임<input type="text" id="sn" maxlength="10" autocomplete="off" placeholder="2~10자"></label>' +
    '<div class="f" role="group" aria-labelledby="gl">성별<div class="seg" id="sg"><button data-act="gender" data-v="남성" aria-pressed="false">남자</button><button data-act="gender" data-v="여성" aria-pressed="false">여자</button></div>' +
    '<span class="sub" style="font-weight:400">처음 한 번만 고르고, 나중에 바꿀 수 없어요.</span></div>' +
    '<label class="f">학교<select id="ss">' + opts + '</select></label>' +
    '<span class="sub" style="font-weight:400;margin-top:-6px">학교는 직접 고르는 분류예요. 한 번 고르면 바꿀 수 없어요.</span>' +
    '<div class="agrees"><label class="rd2 all"><input type="checkbox" id="agall"> <b>전체 동의</b></label>' +
    chk('ag14', '(필수) 만 14세 이상이에요') + chk('agt', '(필수) 이용약관에 동의해요', 'terms') + chk('agp', '(필수) 개인정보 수집·이용에 동의해요', 'privacy') + '</div>' +
    '<p class="err" id="aerr" role="alert"></p><button class="btn" data-act="setup">시작하기</button><button class="link" data-act="logout">다른 계정으로 로그인</button>' + legalLinks() + '</div>';
}
function vPost() {
  return '<div class="page"><div class="bar">' + ib('back', 'back', '뒤로') + '<div class="bt">게시글</div>' + ib('postmenu', 'more', '더보기') + '</div>' +
    '<div class="pbody" id="pb"></div></div>';
}
function vCompose() {
  return '<div class="page"><div class="bar">' + ib('back', 'close', '닫기') + '<div class="bt">' + ({ meal: '밥', study: '공부', date: '소개팅' }[S.kind] || '밥') + ' 게시판 글쓰기</div><button class="txtbtn" data-act="submitpost">등록</button></div>' +
    '<div class="compose"><input type="text" id="ct" maxlength="40" placeholder="제목" autocomplete="off" aria-label="제목"><textarea id="cb" maxlength="1000" placeholder="내용을 입력하세요" aria-label="내용"></textarea>' +
    '<div class="cap-row"><span>모집 인원 <small>(나 포함)</small></span><div class="step"><button data-act="capm" aria-label="인원 줄이기">−</button><b id="capv" aria-live="polite">' + S.cap + '명</b><button data-act="capp" aria-label="인원 늘리기">+</button></div></div>' +
    '<div class="tm"><label class="rd2"><input type="checkbox" id="ctm"> 모이는 시간 정하기 (선택)</label><div class="tmf" id="tmf" hidden>' +
    '<input type="date" id="cd" aria-label="날짜"><input type="time" id="cs" aria-label="시작 시간"><span aria-hidden="true">~</span><input type="time" id="ce" aria-label="종료 시간 (선택)"></div></div>' +
    '<div class="hint">' + (S.kind === 'date' ? '소개팅은 서로 편한 사람끼리만 만나요. 상대가 불편해하면 바로 멈추고, 불쾌한 글은 신고해 주세요.<br>' : '') + '같은 학교로 등록한 사람들에게만 보여요. 참여한 사람들끼리 단체 채팅을 할 수 있어요.<br>처음 만나는 사람과는 사람 많은 공개된 장소에서 만나고, 연락처·주소 같은 개인정보는 함부로 알려 주지 마세요.</div></div></div>';
}
function vRoom() {
  var v = S.view, head;
  if (v.k === 'dm') head = '<button class="who" data-act="user" data-u="' + esc(v.other) + '">' + av(v.other, 34) + '<b>' + nm(v.other) + '</b></button>';
  else head = '<button class="who" data-act="members">' + gav(v.post, v.title, 34) + '<span class="wt"><b>' + esc(v.title) + '</b><small id="mcount"></small></span></button>';
  return '<div class="page"><div class="bar">' + ib('back', 'back', '뒤로') + head + ib('roommenu', 'more', '채팅방 메뉴') + '</div>' +
    '<div class="chat"><p class="safe">처음 만나는 사람과는 공개된 장소에서 만나고, 개인정보는 알려 주지 마세요. 불편하면 메시지를 눌러 신고할 수 있어요.</p><div class="msgs" id="msgs" aria-live="polite"></div><div class="cin"><input type="text" id="mi" maxlength="500" placeholder="메시지 입력" autocomplete="off" aria-label="메시지"><button data-act="sendmsg" aria-label="보내기">' + ic('send') + '</button></div></div></div>';
}

/* 부분 갱신 (입력 중인 칸을 건드리지 않아요) */
function capChip(p) {
  var n = p.member_count || 0, full = n >= p.capacity;
  if (p.closed || full) return '<span class="capc off">' + (p.closed ? '마감' : '정원 마감') + ' ' + n + '/' + p.capacity + '</span>';
  return '<span class="capc">' + ic('group') + '참여 ' + n + '/' + p.capacity + '</span>';
}
function postCard(p, hl) {
    var pct = Math.min(100, Math.round((p.member_count || 0) / p.capacity * 100)), mine = S.myPosts[p.id], full = (p.member_count || 0) >= p.capacity;
    var btn = mine ? '<button class="jbtn go" data-act="gochat" data-id="' + p.id + '" data-title="' + esc(p.title) + '">채팅 열기 ›</button>' :
      (p.closed || full ? '<button class="jbtn" disabled>' + (p.closed ? '마감' : '정원 마감') + '</button>' : '<button class="jbtn" data-act="quickjoin" data-id="' + p.id + '">참여하기 ›</button>');
    return '<div class="post" role="button" tabindex="0" data-act="post" data-id="' + p.id + '"><div class="ph2">' + av(p.author_id, 34) + '<span class="who2"><b>' + nm(p.author_id) + (gl(p.author_id) ? ' · ' + gl(p.author_id) : '') + '</b><small>' + ago(p.created_at) + '</small></span>' + capChip(p) + '</div>' +
      '<div class="pt">' + (hl ? hlText(p.title, hl) : esc(p.title)) + '</div><div class="pp">' + (hl ? hlText(p.body, hl) : esc(p.body)) + '</div>' +
      '<div class="pfoot">' + (p.starts_at ? tbox(p, false) : '<span class="notm">모이는 시간 미정</span>') + btn + '</div><div class="pbar" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div>';
}
function paintList() {
  var el = $('#list'); if (!el || S.tab !== 'board') return;
  var searching = false, rows = S.posts[S.kind];
  if (!rows) { el.innerHTML = '<div class="empty"><div class="loading"><i class="spin"></i>불러오는 중…</div></div>'; return; }
  if (!rows.length) { el.innerHTML = searching ? '<div class="empty">검색 결과가 없어요.</div>' : '<div class="empty">아직 글이 없어요.<br>첫 글을 남겨 보세요!</div>'; return; }
  el.innerHTML = rows.map(function (p) { return postCard(p); }).join('');
}
function paintRooms() {
  var el = $('#rooms'); if (!el) return;
  var rooms = (S.rooms || []).filter(function (r) { return r.kind === S.chatSeg && !(r.kind === 'dm' && isHidden(r)); });
  var badge = function (n) { return n ? ' <span class="bdg">' + (n > 99 ? '99+' : n) + '</span>' : ''; };
  var h = '<div class="seg segm" role="group" aria-label="채팅 종류"><button data-act="chatseg" data-v="dm" aria-pressed="' + (S.chatSeg === 'dm') + '">친구' + badge(unreadOf('dm') + S.fr.incoming.length) + '</button>' +
    '<button data-act="chatseg" data-v="group" aria-pressed="' + (S.chatSeg === 'group') + '">내 모임' + badge(unreadOf('group')) + '</button></div>';
  if (S.chatSeg === 'dm') h += S.fr.incoming.map(function (f) {
    return '<div class="req"><div class="fl">' + av(f.requester_id, 40) + '<div class="tx">' + nm(f.requester_id) + '<small>친구 요청이 왔어요</small></div>' +
      '<button class="btn sm" data-act="respond" data-id="' + f.id + '" data-v="1">수락</button><button class="btn sm sec" data-act="respond" data-id="' + f.id + '" data-v="0">거절</button></div></div>';
  }).join('');
  if (S.rooms === null) h += '<div class="empty"><div class="loading"><i class="spin"></i>불러오는 중…</div></div>';
  else if (!rooms.length) h += S.chatSeg === 'dm' ? '<div class="empty">아직 대화가 없어요.<br>오른쪽 위 버튼으로 친구를 추가해 보세요.</div>' : '<div class="empty">참여한 모임이 없어요.<br>게시판에서 글에 "참여하기"를 누르면 여기에 모여요.</div>';
  else h += rooms.map(function (r) {
    var cnt = r.unread ? '<span class="bdg acc">' + (r.unread > 99 ? '99+' : r.unread) + '</span>' : '';
    if (r.kind === 'group') {
      var last = r.last_body ? (r.last_sender ? nm(r.last_sender) + ': ' : '') + esc(r.last_body) : '모임 채팅을 시작해 보세요';
      return '<button class="li" data-act="group" data-post="' + r.post_id + '" data-title="' + esc(r.title) + '">' + gav(r.post_id, r.title, 46) +
        '<div class="tx"><div class="t1"><b>' + esc(r.title) + ' <small class="mc">' + r.member_count + '명</small>' + (isMuted('p:' + r.post_id) ? ' <small>🔕</small>' : '') + '</b><time>' + (r.last_at ? ago(r.last_at) : '') + '</time></div><div class="t2"><span>' + last + '</span>' + cnt + '</div></div></button>';
    }
    return '<button class="li" data-act="room" data-dm="' + r.dm_id + '" data-u="' + esc(r.other_user) + '">' + av(r.other_user, 46) +
      '<div class="tx"><div class="t1"><b>' + nm(r.other_user) + (isMuted('d:' + r.dm_id) ? ' <small>🔕</small>' : '') + '</b><time>' + (r.last_at ? ago(r.last_at) : '') + '</time></div>' +
      '<div class="t2"><span>' + esc(r.last_body || '대화를 시작해 보세요') + '</span>' + cnt + '</div></div></button>';
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
  return '<div class="cm' + (reply ? ' re' : '') + '">' + av(c.author_id, reply ? 28 : 32, true) + '<div class="tx"><b>' + nm(c.author_id) + (gl(c.author_id) ? ' · ' + gl(c.author_id) : '') + '</b><div class="bd">' + esc(c.body) + '</div>' +
    '<div class="ft"><small>' + ago(c.created_at) + '</small>' +
    '<button class="lk' + (on ? ' on' : '') + '" data-act="like" data-id="' + c.id + '" aria-pressed="' + on + '" aria-label="좋아요 ' + n + '개">' + ic('heart') + (n || '') + '</button>' +
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
  var keep = el.scrollTop, mem = S.members, me = S.me.id, st = S.stats || { views: 0, likes: 0, liked: false };
  var n = mem ? mem.length : (p.member_count || 0), joined = mem ? mem.some(function (m) { return m.user_id === me; }) : !!S.myPosts[p.id], mine = p.author_id === me, full = n >= p.capacity;
  var btn = joined ? '<button class="jbtn big" data-act="gopost">' + ic('chat') + ' 단체 채팅 열기 ›</button>' :
    (p.closed || full ? '<button class="jbtn big" disabled>' + (p.closed ? '모집 마감' : '정원 마감') + '</button>' : '<button class="jbtn big" data-act="join">참여하기 ›</button>');
  var tline = p.starts_at ? '<div class="jt">' + ic('clock') + '<span>' + tText(p) + '</span></div>' : '';
  var h = '<div class="dcard"><div class="ph">' + av(p.author_id, 48, true) + '<div class="nmb"><b>' + nm(p.author_id) + (gl(p.author_id) ? ' · ' + gl(p.author_id) : '') + '</b><small>' + ago(p.created_at) + '</small></div>' +
    '<div class="chips"><button class="chip' + (st.liked ? ' on' : '') + '" data-act="plike" aria-pressed="' + st.liked + '" aria-label="좋아요 ' + st.likes + '개">' + ic('heart') + st.likes + '</button><span class="chip" aria-label="조회 ' + st.views + '회">' + ic('eye') + st.views + '</span></div></div>' +
    '<h2 class="dt">' + esc(p.title) + '</h2><div class="pd-body">' + esc(p.body) + '</div>' +
    '<div class="jbox' + (p.closed ? ' closed' : '') + '"><div class="jinfo"><div class="jn">' + ic('group') + '<b>참여 ' + n + '/' + p.capacity + '명</b>' + (p.closed ? '<span class="capc off">모집 마감</span>' : '') + '</div>' + tline + '</div>' + btn + '</div>' +
    (mem ? '<div class="jav">' + mem.map(function (m) { return '<span class="jm">' + av(m.user_id, 34, true) + '<small>' + nm(m.user_id) + '</small></span>'; }).join('') + '</div>' : '') + '</div>';
  if (mine) h += '<div class="dcard row2"><span class="ico">' + ic('cal') + '</span><div class="rt"><b>' + (p.closed ? '모집 다시 열기' : '모집 마감하기') + '</b><small>' + (p.closed ? '다시 열면 다른 사람이 참여할 수 있어요.' : '모집을 마감하면 더 이상 참여할 수 없어요!') + '</small></div><button class="obtn" data-act="toggleclose">' + (p.closed ? '다시 열기' : '모집 마감하기') + '</button></div>';
  else if (joined) h += '<div class="dcard row2"><span class="ico">' + ic('group') + '</span><div class="rt"><b>참여 취소</b><small>취소하면 단체 채팅방에서 나가요.</small></div><button class="obtn" data-act="leave">참여 취소</button></div>';
  el.innerHTML = h; el.scrollTop = keep;
}
function tText(p) {
  var a = new Date(p.starts_at), b = p.ends_at ? new Date(p.ends_at) : null, t = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  return '<b>' + (a.getMonth() + 1) + '월 ' + a.getDate() + '일 (' + DOW[a.getDay()] + ')</b> <em>' + t(a) + (b ? ' ~ ' + t(b) : ' 시작') + '</em>';
}
/* 단체 채팅: 이 메시지를 아직 안 읽은 사람 수 (보낸 사람·나는 빼요) */
function gUnread(m) {
  var t = new Date(m.created_at).getTime(), n = 0;
  S.gmem.forEach(function (x) {
    if (x.user_id === m.sender_id || x.user_id === S.me.id || new Date(x.joined_at).getTime() > t) return;
    var r = S.greads[x.user_id]; if (r === undefined || r < t) n++;
  });
  return n;
}
function paintMsgs(stick) {
  var el = $('#msgs'); if (!el || !isRoom(S.view)) return;
  var v = S.view, ms = S.msgs, me = S.me.id, dm = v.k === 'dm';
  var mc = $('#mcount'); if (mc) { var r = (S.rooms || []).filter(function (x) { return x.room_key === roomKey(v); })[0]; mc.textContent = r && r.member_count ? r.member_count + '명 참여 중' : ''; }
  if (ms === null) { el.innerHTML = '<div class="none"><div class="loading"><i class="spin"></i>불러오는 중…</div></div>'; return; }
  if (!ms.length) { el.innerHTML = '<div class="none">' + (dm ? esc(nick(v.other)) + '님과의 첫 대화를 시작해 보세요.' : '모임 채팅을 시작해 보세요.<br>참여한 뒤의 대화만 볼 수 있어요.') + '</div>'; return; }
  var near = el.scrollHeight - el.scrollTop - el.clientHeight < 90, lastReadMine = null, h = '';
  if (dm) ms.forEach(function (m) { if (m.sender_id === me && new Date(m.created_at).getTime() <= S.peerRead) lastReadMine = m.id; });
  else ms.forEach(function (m) { if (m.sender_id === me && gUnread(m) === 0 && S.gmem.length) lastReadMine = m.id; });
  ms.forEach(function (m, i) {
    var pv = ms[i - 1], nx = ms[i + 1], mine = m.sender_id === me, sid = m.sender_id || v.other || '';
    var newDay = !pv || dayKey(pv.created_at) !== dayKey(m.created_at);
    var first = newDay || pv.sender_id !== m.sender_id;
    var lastOfMin = !nx || nx.sender_id !== m.sender_id || minKey(nx.created_at) !== minKey(m.created_at) || dayKey(nx.created_at) !== dayKey(m.created_at);
    if (newDay) h += '<div class="dsep"><span>' + dayLabel(m.created_at) + '</span></div>';
    var meta = '', gn = dm ? 0 : gUnread(m);
    if (mine) {
      var unread = dm ? new Date(m.created_at).getTime() > S.peerRead : gn > 0;
      var rtxt = unread ? '<span class="rd" aria-label="아직 안 읽은 사람 ' + (dm ? 1 : gn) + '명">' + (dm ? 1 : gn) + '</span>' : (m.id === lastReadMine ? '<span class="rd on">읽음</span>' : '');
      meta = rtxt + (lastOfMin ? '<span>' + hm(m.created_at) + '</span>' : '');
    } else {
      meta = (gn > 0 ? '<span class="rd" aria-label="아직 안 읽은 사람 ' + gn + '명">' + gn + '</span>' : '') + (lastOfMin ? '<span>' + hm(m.created_at) + '</span>' : '');
    }
    meta = meta ? '<div class="mmeta">' + meta + '</div>' : '';
    if (mine) h += '<div class="mrow me' + (first ? ' first' : '') + '"><div class="mline">' + meta + '<div class="bub">' + esc(m.body) + '</div></div></div>';
    else h += '<div class="mrow other' + (first ? ' first' : '') + '">' + (first ? av(sid, 36, true) : '<span class="avsp"></span>') +
      '<div class="mcol">' + (first ? '<span class="nm">' + nm(sid) + '</span>' : '') +
      '<div class="mline"><button class="bub" data-act="msgtap" data-id="' + m.id + '">' + esc(m.body) + '</button>' + meta + '</div>' +
      (S.repMsg === m.id ? '<button class="mrep" data-act="repmsg" data-id="' + m.id + '">신고</button>' : '') + '</div></div>';
  });
  el.innerHTML = h;
  if (stick || near) el.scrollTop = el.scrollHeight;
}

/* ───────── 시트 ───────── */
function openSheet(html) {
  $('#sheet').innerHTML = '<div class="sheetwrap"><button class="scrim" data-act="close" aria-label="닫기"></button><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab"></div>' + html + '</div></div>';
  var s = $('#sheet .sheet'); if (s) s.focus();
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
  var f = S.fr.by[id], me = id === S.me.id, h = '<div class="profile">' + av(id, 52) + '<div><b>' + nm(id) + '</b>' + (!nog && gl(id) ? '<p>' + (gl(id) === '남' ? '남자' : '여자') + '</p>' : '') + '</div></div><div class="stack">';
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
  var q = (($('#sq') || $('#fq') || {}).value || '').trim(), el = $('#fres'); if (!el) return;
  if (!q) { el.innerHTML = ''; return; }
  var like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  var rows = ok(await S.sb.from('profiles').select('id,nickname,gender,is_admin').eq('school_id', S.me.school_id).neq('id', S.me.id).ilike('nickname', like).limit(20)) || [];
  rows = rows.filter(function (r) { return S.blocks.indexOf(r.id) < 0; });
  rows.forEach(function (r) { S.names[r.id] = r; });
  el.innerHTML = rows.length ? rows.map(function (r) { return '<div class="fl">' + av(r.id, 38) + '<div class="tx">' + nm(r.id) + '</div>' + friendBtn(r.id) + '</div>'; }).join('') : '<div class="empty">찾는 사람이 없어요.</div>';
}
async function openMembers() {
  var v = S.view; if (!isRoom(v) || v.k !== 'group') return;
  var rows = ok(await S.sb.from('post_members').select('user_id,joined_at').eq('post_id', v.post).order('joined_at')) || [];
  await loadNames(rows.map(function (r) { return r.user_id; }));
  var p = (S.posts.meal || []).concat(S.posts.study || []).filter(function (x) { return x.id === v.post; })[0];
  var mineAuthor = p && p.author_id === S.me.id;
  openSheet('<h3>' + esc(v.title) + '</h3><p class="sub">참여 중인 사람 ' + rows.length + '명</p>' + rows.map(function (m) {
    return '<div class="fl">' + av(m.user_id, 38) + '<div class="tx">' + nm(m.user_id) + (p && p.author_id === m.user_id ? '<small>글쓴이</small>' : '') + '</div>' + (m.user_id === S.me.id ? '' : '<button class="btn sm sec" data-act="user" data-u="' + esc(m.user_id) + '">프로필</button>') + '</div>';
  }).join('') + '<div class="stack" style="margin-top:12px"><button class="btn sec" data-act="openpost" data-id="' + v.post + '">원본 글 보기</button>' + (mineAuthor ? '' : '<button class="btn dg" data-act="leavegroup">이 모임에서 나가기</button>') + '</div>');
}

/* ───────── 화면 이동 ───────── */
function go(v) { S.vs.push({ v: S.view, cur: S.cur }); S.view = v; history.pushState({ v: 1 }, ''); render(); }
function swap(v) { S.view = v; history.replaceState({ v: 1 }, ''); render(); }
function back() { if (S.view) { if (history.state && history.state.v) history.back(); else popView(); } }
function popView() {
  var was = S.view, prev = S.vs.pop();
  S.view = prev ? prev.v : null; S.cur = prev ? prev.cur : null; S.cmts = null; S.members = null; S.msgs = null; S.repMsg = null; S.replyTo = null;
  closeSheet(); render();
  if (S.view && S.view.t === 'post') { loadMembers().catch(fail); }
  if (was && was.t === 'room') later('rooms', loadRooms, 50);
}
window.addEventListener('popstate', function () { if (S.view) popView(); else closeSheet(); });
async function openPost(id, replace) {
  var all = (S.posts.meal || []).concat(S.posts.study || []);
  var p = all.filter(function (x) { return String(x.id) === String(id); })[0];
  var fresh = ok(await S.sb.from('post_feed').select('*').eq('id', id).maybeSingle());
  if (fresh) p = fresh;
  if (!p) { toast('삭제되었거나 볼 수 없는 글이에요.', true); return; }
  await loadNames([p.author_id]);
  S.cur = p; S.cmts = null; S.members = null; S.replyTo = null; S.stats = null; closeSheet();
  if (S.view && S.view.t === 'post') swap({ t: 'post', id: p.id }); else (replace ? swap : go)({ t: 'post', id: p.id });
  rpc('view_post', { p_id: p.id }).then(function (r) { if (S.cur && S.cur.id === p.id) { S.stats = r && r[0] ? r[0] : r; paintPost(); } }).catch(function () { /* 조회수는 실패해도 무시 */ });
  await loadMembers();
}
async function openRoom(dm, other) {
  S.msgs = null; S.peerRead = 0; S.repMsg = null; closeSheet(); go({ t: 'room', k: 'dm', dm: Number(dm), other: other });
  await Promise.all([loadMsgs(), loadPeer()]); paintMsgs(true); markRead();
}
async function openGroup(post, title) {
  S.msgs = null; S.repMsg = null; closeSheet(); go({ t: 'room', k: 'group', post: Number(post), title: title });
  S.gmem = []; S.greads = {};
  await Promise.all([loadMsgs(), loadPeer()]); paintMsgs(true); markRead();
}

/* ───────── 동작 ───────── */
function setCap(n) { S.cap = Math.max(2, Math.min(10, n)); var c = $('#capv'); if (c) c.textContent = S.cap + '명'; }
var H = {
  close: function () { closeSheet(); },
  rlspin: function () { rlSpin(); },
  rldone: function () { S.rlAdded = false; closeSheet(); render(); },
  rlbet: function () { rlBet(); },
  rledit: function () { S.rlAdded = false; rlEdit(); },
  rlpeople: function () { S.rlAdded = false; rlPeople(); },
  rldel: function (el) { var r = rlLoad(); if (r.menus.length > 2) { r.menus.splice(+el.dataset.i, 1); r.res = null; rlSave(); render(); rlEdit(); } },
  rladd: function () {
    var r = rlLoad(), e = ($('#rle1').value || '').trim() || '🍽️', n = ($('#rle2').value || '').trim();
    if (!n) { toast('메뉴 이름을 적어 주세요.', true); return; }
    if (r.menus.length >= 12) { toast('메뉴는 12개까지예요.', true); return; }
    if (r.menus.some(function (m) { return m[1] === n; })) { toast('이미 있는 메뉴예요.', true); return; }
    r.menus.push([e, n]); r.res = null; rlSave(); render(); S.rlAdded = true; rlEdit(); setTimeout(function () { var i = $('#rle2'); if (i) i.focus(); }, 30);
  },
  rlpdel: function (el) { var r = rlLoad(); if (r.people.length > 1) { r.people.splice(+el.dataset.i, 1); r.bet = null; rlSave(); render(); rlPeople(); } },
  rlpadd: function () {
    var r = rlLoad(), n = ($('#rlpn').value || '').trim();
    if (!n) { toast('이름을 적어 주세요.', true); return; }
    if (r.people.length >= 10) { toast('최대 10명까지예요.', true); return; }
    if (r.people.indexOf(n) >= 0) { toast('같은 이름이 이미 있어요.', true); return; }
    r.people.push(n); r.bet = null; rlSave(); render(); S.rlAdded = true; rlPeople(); setTimeout(function () { var i = $('#rlpn'); if (i) i.focus(); }, 30);
  },
  rlpost: function () {
    var r = rlLoad(); if (r.res == null) return; var m = r.menus[r.res];
    S.kind = 'meal'; S.cap = 4; go({ t: 'compose' });
    setTimeout(function () { var t = $('#ct'); if (t) t.value = (m[0] + ' ' + m[1] + ' 같이 먹어요').slice(0, 40); }, 30);
  },

  back: function () { back(); },
  mode: function (el) { S.email = ($('#em') || {}).value || ''; S.authMode = el.dataset.v; render(); },
  tab: function (el) { S.tab = el.dataset.v; render(); if (S.tab === 'search') setTimeout(function () { var q = $('#sq'); if (q) q.focus(); }, 60); if (S.tab === 'board' && !S.posts[S.kind]) loadPosts().catch(fail); if (S.tab === 'chat') loadRooms().catch(fail); },
  bsearch: function () { S.tab = 'search'; render(); setTimeout(function () { var q = $('#sq'); if (q) q.focus(); }, 60); },
  sk: function (el) { S.sk = el.dataset.v; S.psr = null; paintSearch(); if (S.sq) return runSearch(); },
  sclr: function () { var i = $('#sq'); if (i) { i.value = ''; i.focus(); } S.sq = ''; S.psr = null; paintSearch(); var f = $('#fres'); if (f) f.innerHTML = ''; },
  sdo: function () { return runSearch(); },
  kind: function (el) { S.kind = el.dataset.v; render(); loadPosts().catch(fail); },
  chatseg: function (el) { S.chatSeg = el.dataset.v; paintRooms(); },
  gender: function (el) { document.querySelectorAll('#sg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); S.gender = el.dataset.v; },
  auth: async function () {
    var em = (($('#em') || {}).value || '').trim(), pw = ($('#pw') || {}).value || '', pw2 = ($('#pw2') || {}).value, er = $('#aerr'), su = S.authMode === 'signup';
    S.email = em; er.textContent = '';
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('BAD_EMAIL');
      if (su) {
        if (!pwOk(pw)) throw new Error('BAD_PASSWORD');
        if (pw !== pw2) throw new Error('PW_MISMATCH');
        var sr = await S.sb.auth.signUp({ email: em, password: pw });
        if (sr.error) throw sr.error;
        if (sr.data && sr.data.session) { await S.sb.auth.signOut({ scope: 'local' }); throw new Error('CONFIRM_OFF'); }
        if (sr.data && sr.data.user && sr.data.user.identities && !sr.data.user.identities.length) throw new Error('EMAIL_TAKEN');
        S.verify = { email: em }; S.resendAt = Date.now() + 30000; render(); return;
      }
      if (!pw) throw new Error('NEED_PASSWORD');
      var r = await S.sb.auth.signInWithPassword({ email: em, password: pw });
      if (r.error) {
        if (/not confirmed/i.test(r.error.message || '')) {
          await S.sb.auth.resend({ type: 'signup', email: em });
          S.verify = { email: em }; S.resendAt = Date.now() + 30000; render(); toast('아직 메일 인증이 안 된 계정이에요. 인증번호를 다시 보냈어요.'); return;
        }
        throw r.error;
      }
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
  resend: async function () {
    if (Date.now() < S.resendAt) { toast('잠시 후에 다시 받을 수 있어요.', true); return; }
    var r = await S.sb.auth.resend({ type: 'signup', email: S.verify.email }); if (r.error) throw r.error;
    S.resendAt = Date.now() + 30000; toast('인증번호를 다시 보냈어요.');
  },
  resetstart: function () { S.email = ($('#em') || {}).value || S.email; S.reset = { step: 'email' }; render(); },
  resetcancel: function () { S.reset = null; render(); },
  resetsend: async function () {
    var em = (($('#em') || {}).value || '').trim(), er = $('#aerr'); S.email = em; er.textContent = '';
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('BAD_EMAIL');
      var r = await S.sb.auth.resetPasswordForEmail(em); if (r.error) throw r.error;
      S.resendAt = Date.now() + 30000; S.reset = { step: 'code', email: em }; render();
    } catch (e) { er.textContent = msg(e); }
  },
  resetresend: async function () {
    if (Date.now() < S.resendAt) { toast('잠시 후에 다시 받을 수 있어요.', true); return; }
    var r = await S.sb.auth.resetPasswordForEmail(S.reset.email); if (r.error) throw r.error;
    S.resendAt = Date.now() + 30000; toast('인증번호를 다시 보냈어요.');
  },
  resetdone: async function () {
    var er = $('#aerr'), code = (($('#vc') || {}).value || '').replace(/\s/g, ''), pw = ($('#pw') || {}).value || '', pw2 = ($('#pw2') || {}).value || ''; er.textContent = '';
    try {
      if (!/^\d{6,8}$/.test(code)) { er.textContent = '메일에 적힌 숫자 6~8자리를 입력해 주세요.'; return; }
      if (!pwOk(pw)) throw new Error('BAD_PASSWORD');
      if (pw !== pw2) throw new Error('PW_MISMATCH');
      var r = await S.sb.auth.verifyOtp({ email: S.reset.email, token: code, type: 'recovery' }); if (r.error) throw r.error;
      var u = await S.sb.auth.updateUser({ password: pw }); if (u.error) throw u.error;
      var ses = r.data && r.data.session ? r.data.session : (await S.sb.auth.getSession()).data.session;
      S.reset = null; toast('비밀번호를 바꿨어요.'); await startSession(ses);
    } catch (e) { er.textContent = msg(e); }
  },
  cancelverify: function () { S.verify = null; render(); },
  banner: function (el) { var h = el.dataset.href; el.classList.remove('on'); if (h) location.href = h; },
  google: async function () { var r = await S.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); if (r.error) throw r.error; },
  setup: async function () {
    var er = $('#aerr'); er.textContent = '';
    try {
      var agreed = ['ag14', 'agt', 'agp'].every(function (id) { return $('#' + id).checked; });
      if (!agreed) throw new Error('TERMS_REQUIRED');
      var sc = ($('#ss') || {}).value;
      await rpc('create_profile', { p_nickname: (($('#sn') || {}).value || '').trim(), p_gender: S.gender || '', p_school: sc ? Number(sc) : 0, p_agreed: true });
      S.me = ok(await S.sb.from('profiles').select(PROFILE_COLS).eq('id', S.user.id).maybeSingle());
      await enter();
    } catch (e) { er.textContent = msg(e); }
  },
  logout: async function () { await hardLogout('로그아웃했어요.'); },
  delacct: async function () {
    if (!confirm('계정을 삭제하면 프로필, 글, 댓글, 친구 관계가 모두 지워지고 되돌릴 수 없어요.\n정말 삭제할까요?')) return;
    await rpc('delete_account');
    await hardLogout('계정을 삭제했어요.', true);
  },
  saveprofile: async function () {
    await rpc('update_profile', { p_nickname: ($('#mn').value || '').trim() });
    S.me = ok(await S.sb.from('profiles').select(PROFILE_COLS).eq('id', S.me.id).maybeSingle()); S.names[S.me.id] = S.me;
    S.nickEdit = false; S.posts = { meal: null, study: null, date: null }; render(); toast('닉네임을 저장했어요.'); loadPosts().catch(fail);
  },
  nickedit: function () { S.nickEdit = true; render(); setTimeout(function () { var m = $('#mn'); if (m) { m.focus(); m.select(); } }, 40); },
  nickcancel: function () { S.nickEdit = false; render(); },
  roommenu: function () { openRoomMenu(); },
  roommute: function () { var v = S.view, key = roomKey(v), on = !isMuted(key); setMuted(key, on); closeSheet(); toast(on ? '이 채팅의 알림을 껐어요.' : '이 채팅의 알림을 켰어요.'); },
  roomleave: async function () {
    var v = S.view; if (!isRoom(v)) return;
    if (v.k === 'dm') {
      if (!confirm('채팅방을 목록에서 지울까요? 새 메시지가 오면 다시 나타나요.')) return;
      var h = lsGet('hb_hide'); h['d:' + v.dm] = Date.now(); lsSet('hb_hide', h);
    } else {
      if (!confirm('이 모임에서 나갈까요? 단체 채팅방에서도 나가게 돼요.')) return;
      await rpc('leave_post', { p_id: v.post });
      S.posts = { meal: null, study: null, date: null };
    }
    closeSheet(); S.view = null; S.vs = []; S.cur = null; S.msgs = null; S.tab = 'chat'; render();
    loadRooms().catch(fail); toast(v.k === 'dm' ? '채팅방을 지웠어요.' : '모임에서 나왔어요.');
  },
  notes: function () { openNotes(); },
  compose: function () { S.cap = 4; go({ t: 'compose' }); },
  capm: function () { setCap(S.cap - 1); },
  capp: function () { setCap(S.cap + 1); },
  submitpost: async function () {
    var t = ($('#ct').value || '').trim(), b = ($('#cb').value || '').trim();
    if (!t) { toast('제목을 입력해 주세요.', true); return; } if (!b) { toast('내용을 입력해 주세요.', true); return; }
    var a = { p_kind: S.kind, p_title: t, p_body: b, p_capacity: S.cap };
    if ($('#ctm').checked) {
      var d = $('#cd').value, st = $('#cs').value, en = $('#ce').value;
      if (!d || !st) { toast('날짜와 시작 시간을 골라 주세요.', true); return; }
      a.p_starts = new Date(d + 'T' + st).toISOString();
      if (en) { a.p_ends = new Date(d + 'T' + en).toISOString(); if (new Date(a.p_ends) <= new Date(a.p_starts)) { toast('종료 시간은 시작보다 늦어야 해요.', true); return; } }
    }
    var id = await rpc('create_post', a);
    await loadPosts(); await openPost(id, true); loadRooms().catch(function () { /* 무시 */ });
  },
  post: function (el) { return openPost(el.dataset.id); },
  openpost: function (el) { return openPost(el.dataset.id); },
  postmenu: function () {
    var p = S.cur; if (!p) return;
    openSheet(p.author_id === S.me.id ? '<div class="stack"><button class="btn dg" data-act="delpost">글 삭제</button></div>' :
      '<div class="stack"><button class="btn sec" data-act="reppost">글 신고</button><button class="btn dg" data-act="block" data-u="' + esc(p.author_id) + '">작성자 차단</button></div>');
  },
  delpost: async function () {
    if (!confirm('이 글을 삭제할까요? 참여자와 단체 채팅도 함께 삭제돼요.')) return;
    var id = S.cur.id; await rpc('delete_post', { p_id: id }); closeSheet();
    S.posts.meal = S.posts.study = null; back(); toast('삭제했어요.'); loadPosts().catch(fail); loadRooms().catch(fail);
  },
  reppost: function () { openReport({ p_post: S.cur.id }); },
  join: async function () {
    await rpc('join_post', { p_id: S.cur.id });
    S.cur = ok(await S.sb.from('post_feed').select('*').eq('id', S.cur.id).maybeSingle()) || S.cur;
    await Promise.all([loadMembers(), loadRooms(), loadPosts()]); toast('참여했어요. 단체 채팅이 열렸어요.');
  },
  leave: async function () {
    if (!confirm('참여를 취소할까요? 단체 채팅방에서 나가게 돼요.')) return;
    await rpc('leave_post', { p_id: S.cur.id });
    S.cur = ok(await S.sb.from('post_feed').select('*').eq('id', S.cur.id).maybeSingle()) || S.cur;
    await Promise.all([loadMembers(), loadRooms(), loadPosts()]); toast('참여를 취소했어요.');
  },
  toggleclose: async function () {
    await rpc('set_post_closed', { p_id: S.cur.id, p_closed: !S.cur.closed });
    S.cur = ok(await S.sb.from('post_feed').select('*').eq('id', S.cur.id).maybeSingle()) || S.cur;
    paintPost(); loadPosts().catch(fail); toast(S.cur.closed ? '모집을 마감했어요.' : '모집을 다시 열었어요.');
  },
  quickjoin: async function (el) {
    await rpc('join_post', { p_id: Number(el.dataset.id) });
    toast('참여했어요. 내 모임에서 단체 채팅을 할 수 있어요.'); await Promise.all([loadPosts(), loadRooms()]);
  },
  gochat: function (el) { return openGroup(el.dataset.id, el.dataset.title); },
  plike: async function () {
    var r = await rpc('toggle_post_like', { p_id: S.cur.id }); S.stats = r && r[0] ? r[0] : r; paintPost();
  },
  gopost: function () { return openGroup(S.cur.id, S.cur.title); },
  group: function (el) { return openGroup(el.dataset.post, el.dataset.title); },
  members: function () { return openMembers(); },
  leavegroup: async function () {
    if (!confirm('이 모임에서 나갈까요?')) return;
    await rpc('leave_post', { p_id: S.view.post }); closeSheet(); S.posts.meal = S.posts.study = null; back(); toast('모임에서 나갔어요.'); loadPosts().catch(fail);
  },
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
  user: function (el) { openUser(el.dataset.u, isRoom(S.view)); },
  block: async function (el) {
    var id = el.dataset.u; if (!confirm(nick(id) + '님을 차단할까요? 서로 글과 채팅이 보이지 않아요.')) return;
    await rpc('block_user', { p_user: id }); closeSheet(); await Promise.all([loadBlocks(), loadFriends()]);
    S.posts = { meal: null, study: null, date: null }; S.view = null; S.vs = []; S.cur = null; S.msgs = null; render(); loadPosts().catch(fail); loadRooms().catch(fail); toast('차단했어요.');
  },
  unblock: async function (el) { await rpc('unblock_user', { p_user: el.dataset.u }); await Promise.all([loadBlocks(), loadFriends()]); S.posts = { meal: null, study: null, date: null }; render(); loadPosts().catch(fail); loadRooms().catch(fail); toast('차단을 해제했어요.'); },
  fsearch: function () { openSearch(); setTimeout(function () { var q = $('#fq'); if (q) q.focus(); }, 50); },
  fdo: function () { return doSearch(); },
  freq: async function (el) { await rpc('request_friend', { p_target: el.dataset.u }); toast('친구 요청을 보냈어요.'); await loadFriends(); await loadRooms(); if ($('#fres')) await doSearch(); else closeSheet(); },
  fcancel: async function (el) { await rpc('cancel_friend_request', { p_id: Number(el.dataset.id) }); await loadFriends(); if ($('#fres')) await doSearch(); else closeSheet(); },
  respond: async function (el) {
    var yes = el.dataset.v !== '0'; await rpc('respond_friend', { p_id: Number(el.dataset.id), p_accept: yes });
    closeSheet(); await loadFriends(); await loadRooms(); toast(yes ? '친구가 되었어요. 이제 채팅할 수 있어요.' : '거절했어요.');
  },
  chatwith: async function (el) { var id = el.dataset.u, dm = await rpc('open_dm', { p_user: id }); S.tab = 'chat'; S.chatSeg = 'dm'; await openRoom(dm, id); },
  room: function (el) { return openRoom(el.dataset.dm, el.dataset.u); },
  msgtap: function (el) { var id = Number(el.dataset.id); S.repMsg = S.repMsg === id ? null : id; paintMsgs(); },
  sendmsg: async function () {
    var i = $('#mi'), b = (i.value || '').trim(), v = S.view; if (!b) return;
    i.value = ''; i.focus();
    try { if (v.k === 'dm') await rpc('send_message', { p_dm_id: v.dm, p_body: b }); else await rpc('send_group_message', { p_post: v.post, p_body: b }); } catch (e) { i.value = b; throw e; }
    await loadMsgs(); var m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight;
  },
  allownotify: async function () {
    if (Notification.permission === 'granted') {
      var off = !notifyOff(); try { localStorage.setItem('hb_notify_off', off ? '1' : '0'); } catch (e) { /* 무시 */ }
      render(); toast(off ? '알림을 껐어요.' : '알림을 켰어요.'); return;
    }
    var r = await Notification.requestPermission();
    if (r === 'granted') { try { localStorage.setItem('hb_notify_off', '0'); } catch (e) { /* 무시 */ } }
    render(); toast(r === 'granted' ? '알림을 켰어요.' : '알림이 허용되지 않았어요.', r !== 'granted');
  },
  cookieok: function () { try { localStorage.setItem('hb_notice', '1'); } catch (e) { /* 무시 */ } S.seenNotice = true; var n = $('#notice'); if (n) n.hidden = true; }
};
document.addEventListener('click', async function (e) {
  var el = e.target.closest('[data-act]'); if (!el || !H[el.dataset.act] || S.busy) return;
  S.busy = true;
  try { await H[el.dataset.act](el); } catch (x) { fail(x); } finally { S.busy = false; }
});
document.addEventListener('input', function (e) {
  if (e.target.id === 'sq') { S.sq = e.target.value.trim(); var c = document.querySelector('.sclr'); if (c) c.hidden = !S.sq; later('sq', function () { runSearch().catch(fail); }, 350); }
});
document.addEventListener('change', function (e) {
  if (e.target.id === 'ssort') { S.sort = e.target.value; paintSearch(); return; }
  if (e.target.id === 'ctm') {
    var f = $('#tmf'); f.hidden = !e.target.checked;
    if (e.target.checked && !$('#cd').value) {
      var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
      $('#cd').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
  } else if (e.target.id === 'agall') {
    document.querySelectorAll('.agree').forEach(function (c) { c.checked = e.target.checked; });
  } else if (e.target.classList && e.target.classList.contains('agree')) {
    var all = $('#agall'); if (all) all.checked = Array.prototype.every.call(document.querySelectorAll('.agree'), function (c) { return c.checked; });
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeSheet(); return; }
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('post')) { e.preventDefault(); e.target.click(); return; }
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
  if (e.target.id === 'sq') { e.preventDefault(); runSearch().catch(fail); return; }
  var map = { pw: 'auth', pw2: 'auth', em: 'auth', vc: 'verify', ci: 'addcmt', mi: 'sendmsg', fq: 'fdo' }, a = map[e.target.id];
  if (a) { e.preventDefault(); var b = document.querySelector('[data-act="' + a + '"]'); if (b) b.click(); }
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible' || !S.me) return;
  if (isRoom(S.view)) { loadMsgs().then(markRead).catch(function () { /* 무시 */ }); loadPeer().catch(function () { /* 무시 */ }); } else later('rooms', loadRooms, 50);
});

/* ───────── 부팅 ───────── */
async function boot() {
  var seen = false; try { seen = localStorage.getItem('hb_notice') === '1'; } catch (e) { /* 무시 */ }
  S.seenNotice = seen;
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) { $('#screen').innerHTML = '<div class="center"><p class="warn">서비스에 연결하지 못했어요. 잠시 후 다시 열어 주세요.</p></div>'; return; }
  S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  render();
  S.sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'SIGNED_OUT') later('auth', function () { startSession(null); }, 0);
    else if (ev === 'SIGNED_IN' && session && !S.reset) later('auth', function () { startSession(session); }, 0);
  });
  var r = await S.sb.auth.getSession();
  await startSession(r.data && r.data.session);
}
boot();
})();
