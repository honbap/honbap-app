-- 백엔드 시나리오 테스트
-- 순서: stub_supabase.sql → 0001 → 0002 → 0003 → 0004 → 0005 → 이 파일  (마지막 줄에 ALL TESTS PASSED)
create schema t; grant usage on schema t to authenticated;
create function t.ok(c boolean, m text) returns void language plpgsql as
$$ begin if not coalesce(c, false) then raise exception 'FAIL: %', m; end if; raise notice 'ok   %', m; end $$;
create function t.fails(q text, expected text) returns void language plpgsql as
$$ begin
  begin execute q; exception when others then
    if sqlerrm = expected then raise notice 'ok   거부됨 [%]', expected; return; end if;
    raise exception 'FAIL: expected % but got "%" for %', expected, sqlerrm, q;
  end;
  raise exception 'FAIL: expected error % but succeeded: %', expected, q;
end $$;
grant execute on function t.ok(boolean, text), t.fails(text, text) to authenticated;

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'
\set dave  '44444444-4444-4444-4444-444444444444'
\set frank '55555555-5555-5555-5555-555555555555'

\echo === 학교 목록 · 가입(아무 이메일이나 가능)
insert into public.schools (name) values ('가천대학교'), ('서울대학교'), ('기타');
insert into auth.users (id, email) values
  (:'alice', 'alice@gmail.com'), (:'bob', 'bob@naver.com'), (:'carol', 'carol@daum.net'),
  (:'dave', 'dave@gmail.com'), (:'frank', 'frank@gmail.com');
select t.ok((select count(*) from auth.users) = 5, '학교 이메일이 아니어도 계정이 만들어짐');

\echo === 프로필: 닉네임 + 성별(처음 한 번) + 학교 선택
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.fails($$select create_profile('도토리', '여성', 1, false)$$, 'TERMS_REQUIRED');
select t.fails($$select create_profile('a', '여성', 1, true)$$, 'BAD_NICKNAME');
select t.fails($$select create_profile('도토리', '미공개', 1, true)$$, 'BAD_GENDER');
select t.fails($$select create_profile('도토리', '기타', 1, true)$$, 'BAD_GENDER');
select t.fails($$select create_profile('도토리', '여성', 999, true)$$, 'BAD_SCHOOL');
select create_profile('도토리', '여성', 1, true);
select t.fails($$select create_profile('도토리2', '여성', 1, true)$$, 'PROFILE_EXISTS');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.fails($$select create_profile('도토리', '남성', 1, true)$$, 'NICKNAME_TAKEN');
select create_profile('나무', '남성', 1, true);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated; select create_profile('라임', '남성', 1, true); reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
set role authenticated; select create_profile('구름', '여성', 1, true); reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'frank')::text, false);
set role authenticated; select create_profile('이방인', '남성', 2, true); reset role;

\echo === 글: 제목 + 내용만
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.fails($$select create_post('meal', '   ', '내용')$$, 'BAD_TITLE');
select t.fails($$select create_post('meal', '제목', '')$$, 'BAD_BODY');
create temp table ids as select create_post('meal', '점심 같이 먹어요', '학생회관 앞에서 12시 반에 봐요') as post1;
grant select on ids to authenticated;
select t.ok((select count(*) from post_feed) = 1, '내 글이 목록에 보임');
select t.ok((select comment_count from post_feed) = 0, '댓글 수 0');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'frank')::text, false);
set role authenticated;
select t.ok((select count(*) from post_feed) = 0, '다른 학교 이용자에게는 글이 보이지 않음');
select t.ok((select count(*) from profiles) = 1, '다른 학교 프로필은 보이지 않음(본인만)');
select t.fails(format($$select add_comment(%s, '몰래 댓글')$$, (select post1 from ids)), 'POST_NOT_FOUND');
reset role;

\echo === 댓글
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.ok((select count(*) from post_feed) = 1, '같은 학교 이용자는 글이 보임');
select add_comment((select post1 from ids), '저도 갈래요!');
select t.fails(format($$select add_comment(%s, '')$$, (select post1 from ids)), 'BAD_COMMENT');
select t.ok((select comment_count from post_feed) = 1, '댓글 수가 올라감');
create temp table cids as select (select id from comments limit 1) as c1;
grant select on cids to authenticated;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.ok((select count(*) from notifications where kind = 'comment') = 1, '글쓴이에게 댓글 알림이 감');
select t.fails(format($$select delete_comment(%s)$$, (select c1 from cids)), 'NOT_AUTHOR');
select t.fails($$select delete_post(999999)$$, 'NOT_AUTHOR');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select delete_comment((select c1 from cids));
select t.ok((select count(*) from comments) = 0, '내 댓글은 지울 수 있음');
reset role;

\echo === 성별·학교는 처음 한 번만 (닉네임만 변경 가능)
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select update_profile('나무숲');
select t.ok((select gender::text from profiles where id = auth.uid()) = '남성', '닉네임을 바꿔도 성별은 그대로');
select t.ok((select nickname from profiles where id = auth.uid()) = '나무숲', '닉네임 변경');
select t.fails($$select update_profile('다른이름')$$, 'NICKNAME_COOLDOWN');
select update_profile('나무숲');
reset role;
update public.profiles set nickname_changed_at = now() - interval '8 days' where id = :'bob';
set role authenticated;
select update_profile('나무숲2');
select t.ok((select nickname from profiles where id = auth.uid()) = '나무숲2', '7일이 지나면 다시 변경 가능');
reset role;
update public.profiles set nickname = '나무숲', nickname_changed_at = null where id = :'bob';
\echo === 부적절한 표현 필터
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.fails($$select create_post('meal', '씨 발 같은 글', '내용', null, null, 4)$$, 'BAD_CONTENT');
select t.fails($$select create_post('meal', '제목', '이 병.신아', null, null, 4)$$, 'BAD_CONTENT');
reset role;
\echo === 닉네임은 전체에서 하나만, 운영자 이름은 예약
select set_config('request.jwt.claims', json_build_object('sub', :'frank')::text, false);
set role authenticated;
select t.fails($$select update_profile('도토리')$$, 'NICKNAME_TAKEN');
select t.fails($$select update_profile('운영자2')$$, 'NICKNAME_RESERVED');
reset role;
set role authenticated;
reset role;


\echo === 대댓글 · 좋아요 · 모이는 시간 · 학교 변경 불가
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.fails($$select update_profile('가나다', 2)$$, 'function update_profile(unknown, integer) does not exist');
create temp table tp as select create_post('meal', '저녁 같이', '정문에서 봐요', now() + interval '3 hours', now() + interval '4 hours') as id;
grant select on tp to authenticated;
select t.ok((select starts_at is not null and ends_at > starts_at from post_feed where id = (select id from tp)), '모이는 시간이 저장됨');
select t.fails($$select create_post('meal', '시간 오류', '내용', now() + interval '3 hours', now() + interval '2 hours')$$, 'BAD_TIME');
select t.fails($$select create_post('meal', '시간 오류', '내용', null, now() + interval '2 hours')$$, 'BAD_TIME');
select t.fails($$select create_post('meal', '지난 시간', '내용', now() - interval '3 days', null)$$, 'BAD_TIME');
select t.ok((select count(*) from (select create_post('study', '시간 없는 글', '시간은 선택') ) x) = 1, '시간 없이도 글을 쓸 수 있음');
create temp table tc as select add_comment((select id from tp), '첫 댓글') as top;
grant select on tc to authenticated;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
create temp table tr as select add_comment((select id from tp), '답글이에요', (select top from tc)) as rep;
grant select on tr to authenticated;
select t.ok((select parent_id from comments where id = (select rep from tr)) = (select top from tc), '답글은 부모 댓글에 달림');
select t.fails(format($$select add_comment(%s, '답글의 답글', %s)$$, (select id from tp), (select rep from tr)), 'REPLY_TOO_DEEP');
select t.fails(format($$select add_comment(%s, '엉뚱한 부모', 999999)$$, (select id from tp)), 'COMMENT_NOT_FOUND');
select t.ok(toggle_like((select top from tc)) = true, '좋아요');
select t.ok((select count(*) from comment_likes where comment_id = (select top from tc)) = 1, '좋아요가 보임');
select t.ok(toggle_like((select top from tc)) = false, '다시 누르면 취소');
select toggle_like((select top from tc));
select t.fails($$insert into comment_likes (comment_id, user_id) values (1, '22222222-2222-2222-2222-222222222222')$$, 'permission denied for table comment_likes');
reset role;
select t.ok((select count(*) from notifications where kind = 'reply') = 0, '글쓴이에게는 답글 알림이 중복되지 않음(댓글 알림만)');
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.ok((select count(*) from comment_likes) >= 1, '글쓴이도 좋아요를 볼 수 있음');
select delete_comment((select top from tc));
select t.ok((select count(*) from comments where id = (select rep from tr)) = 0, '부모 댓글을 지우면 답글도 함께 삭제됨');
select t.ok((select count(*) from comment_likes where comment_id = (select top from tc)) = 0, '좋아요도 함께 삭제됨');
reset role;


\echo === 참여(모임) · 단체 채팅
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.fails($$select create_post('meal', '인원 오류', '내용', null, null, 1)$$, 'BAD_CAPACITY');
create temp table gp as select create_post('meal', '점심 모임', '같이 먹어요', null, null, 2) as id;
grant select on gp to authenticated;
select t.ok((select member_count from post_feed where id = (select id from gp)) = 1, '작성자는 자동으로 참여');
select t.ok((select count(*) from my_rooms() where kind = 'group') >= 1, '내 모임 목록에 보임');
select send_group_message((select id from gp), '첫 메시지(참여 전)');
select t.fails(format($$select leave_post(%s)$$, (select id from gp)), 'AUTHOR_CANNOT_LEAVE');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.fails(format($$select send_group_message(%s, '몰래')$$, (select id from gp)), 'ROOM_NOT_FOUND');
select t.ok((select count(*) from messages where post_id = (select id from gp)) = 0, '참여 전에는 단체 채팅이 안 보임');
select join_post((select id from gp));
select t.fails(format($$select join_post(%s)$$, (select id from gp)), 'ALREADY_JOINED');
select t.ok((select count(*) from messages where post_id = (select id from gp)) = 0, '참여 전 메시지는 참여 후에도 안 보임');
select send_group_message((select id from gp), '반가워요');
select t.ok((select count(*) from messages where post_id = (select id from gp)) = 1, '참여자는 단체 채팅이 보임');
select t.ok((select member_count from post_feed where id = (select id from gp)) = 2, '참여 인원이 늘어남');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
select t.fails(format($$select join_post(%s)$$, (select id from gp)), 'POST_FULL');
select t.fails(format($$select send_group_message(%s, '외부인')$$, (select id from gp)), 'ROOM_NOT_FOUND');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.ok((select unread from my_rooms() where room_key = 'p:' || (select id from gp)) = 1, '작성자에게 안 읽은 메시지 1건');
select mark_read('p:' || (select id from gp));
select t.ok((select unread from my_rooms() where room_key = 'p:' || (select id from gp)) = 0, '읽으면 0');
select t.fails($$select mark_read('p:999999')$$, 'ROOM_NOT_FOUND');
select set_post_closed((select id from gp), true);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select leave_post((select id from gp));
select t.ok((select count(*) from messages where post_id = (select id from gp)) = 0, '나가면 단체 채팅이 안 보임');
select t.fails(format($$select join_post(%s)$$, (select id from gp)), 'POST_CLOSED');
select t.fails($$select leave_post(999999)$$, 'POST_NOT_FOUND');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select delete_post((select id from gp));
select t.ok((select count(*) from messages where post_id = (select id from gp)) = 0 and (select count(*) from post_members where post_id = (select id from gp)) = 0, '글을 지우면 참여·채팅도 함께 삭제됨');
reset role;

\echo === 차단
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select block_user(:'bob');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.ok((select count(*) from post_feed) = 0, '차단된 이용자에게는 글이 보이지 않음');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated; select unblock_user(:'bob'); reset role;

\echo === 친구 → 1:1 채팅 → 읽음 표시
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
select t.fails(format($$select request_friend('%s')$$, :'frank'), 'USER_NOT_FOUND');
select t.fails(format($$select request_friend('%s')$$, :'carol'), 'SELF');
select request_friend(:'dave');
select t.fails(format($$select request_friend('%s')$$, :'dave'), 'ALREADY_REQUESTED');
select t.fails(format($$select open_dm('%s')$$, :'dave'), 'NOT_FRIENDS');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
set role authenticated;
select t.ok((select count(*) from notifications where kind = 'friend_request') = 1, '친구 요청 알림');
select respond_friend((select id from friendships limit 1), true);
select t.ok((select count(*) from my_rooms() where kind = 'dm') = 1, '친구가 되면 채팅방이 생김');
select t.ok((select last_body from my_rooms() where kind = 'dm') is null, '안내 메시지 없이 빈 방으로 시작');
create temp table rooms as select dm_id, room_key from my_rooms() where kind = 'dm';
grant select on rooms to authenticated;
select send_message((select dm_id from rooms), '안녕하세요 구름이에요');
select t.fails($$select send_message(999999, 'x')$$, 'ROOM_NOT_FOUND');
select t.fails(format($$select send_message(%s, '')$$, (select dm_id from rooms)), 'BAD_MESSAGE');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
select t.ok((select unread from my_rooms() where kind = 'dm') = 1, '상대에게 안 읽은 메시지 1건');
select t.ok((select count(*) from messages) = 1, '채팅방 참여자는 메시지가 보임');
select t.ok((select count(*) from room_reads) = 0, '아직 아무도 읽지 않음');
select mark_read((select room_key from rooms));
select t.ok((select unread from my_rooms() where kind = 'dm') = 0, '읽으면 안 읽은 수가 0');
select send_message((select dm_id from rooms), '반가워요 라임이에요');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
set role authenticated;
select t.ok((select last_read_at from room_reads where user_id = :'carol') >= (select created_at from messages where body = '안녕하세요 구름이에요'),
            '보낸 사람이 상대의 읽음 시각을 볼 수 있음 → 내 메시지에 "읽음" 표시');
select t.ok((select unread from my_rooms() where kind = 'dm') = 1, '받은 쪽 안 읽은 메시지 1건(반가워요)');
select t.fails(format($$select mark_read('d:%s')$$, 999999), 'ROOM_NOT_FOUND');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.ok((select count(*) from messages) = 0, '남의 1:1 대화는 볼 수 없음');
select t.ok((select count(*) from room_reads) = 0, '남의 읽음 기록도 볼 수 없음');
select t.fails(format($$select send_message(%s, '엿듣기')$$, (select dm_id from rooms)), 'ROOM_NOT_FOUND');
reset role;

\echo === 학교를 바꿔도 친구 프로필은 보임, 다른 사람은 안 보임
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
reset role; update public.profiles set school_id = 2 where id = :'dave';
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
select t.ok((select count(*) from profiles where id = :'dave') = 1, '다른 학교로 옮겨도 친구 프로필은 보임');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.ok((select count(*) from profiles where id = :'dave') = 0, '친구가 아니면 다른 학교 사람은 안 보임');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
reset role; update public.profiles set school_id = 1 where id = :'dave';

\echo === 차단하면 친구·채팅방이 사라짐
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
set role authenticated;
select block_user(:'carol');
select t.ok((select count(*) from friendships) = 1, '차단해도 친구 관계는 남아 있음');
select t.ok((select count(*) from my_rooms() where kind = 'dm') = 0, '채팅방이 목록에서 사라짐');
select t.fails(format($$select request_friend('%s')$$, :'carol'), 'BLOCKED');
select unblock_user(:'carol');
select t.ok((select count(*) from my_rooms() where kind = 'dm') = 1, '차단을 풀면 친구 채팅방이 그대로 돌아옴');
reset role;

\echo === 신고 · 운영자 조치
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated; select add_comment((select post1 from ids), '광고 댓글 http://spam'); reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
select report_content('스팸·광고', '광고예요', null, null, (select id from comments limit 1), null);
select report_content('불쾌하거나 부적절한 내용', '', null, (select post1 from ids), null, null);
select t.fails($$select report_content('기타')$$, 'NO_TARGET');
select t.ok((select count(*) from reports) = 0, '일반 이용자는 신고 목록을 볼 수 없음');
select t.fails($$select admin_resolve_report(1, 'suspend')$$, 'NOT_ADMIN');
reset role;
update public.profiles set is_admin = true where id = :'dave';
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
set role authenticated;
select t.ok((select count(*) from reports where status = 'open') = 2, '운영자는 같은 학교 신고를 볼 수 있음');
select t.ok((select snapshot from reports where target_comment is not null) like '광고 댓글%', '신고 당시 내용이 함께 저장됨');
select admin_resolve_report((select id from reports where target_comment is not null), 'suspend', '광고 반복');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated; select report_content('기타', '알림 확인', :'bob', null, null, null); reset role;
select t.ok((select count(*) from public.notifications where user_id = :'dave' and kind = 'report') = 1, '새 신고가 들어오면 운영자에게 알림');
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
select t.ok((select count(*) from comments) = 0, '숨김 처리된 댓글은 보이지 않음');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
set role authenticated;
select t.fails(format($$select add_comment(%s, '또 광고')$$, (select post1 from ids)), 'NO_PROFILE_OR_SUSPENDED');
select t.ok((select count(*) from profiles where id = auth.uid()) = 1, '정지된 이용자도 내 프로필은 읽을 수 있음(정지 안내용)');
select t.ok((select count(*) from post_feed) = 0, '정지된 이용자는 글을 읽을 수 없음');
reset role;

\echo === 직접 쓰기 차단(RLS) · 글 삭제 · 탈퇴
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select t.fails($$insert into posts (school_id, author_id, kind, title, body) values (1, '11111111-1111-1111-1111-111111111111', 'meal', 'x', 'y')$$, 'permission denied for table posts');
select t.fails($$update profiles set is_admin = true where id = auth.uid()$$, 'permission denied for table profiles');
select t.fails($$update profiles set gender = '남성' where id = auth.uid()$$, 'permission denied for table profiles');
select t.fails($$select push_notification(auth.uid(), 'x', 'y')$$, 'permission denied for function push_notification');
reset role;

-- 신고가 걸린 글의 작성자가 탈퇴해도 탈퇴가 실패하지 않아야 한다.
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);
set role authenticated;
select delete_account();
reset role;
select t.ok((select count(*) from public.profiles where id = :'alice') = 0 and (select count(*) from public.posts) = 0, '탈퇴하면 프로필과 작성한 글이 삭제됨');
select t.ok((select count(*) from public.reports where target_post is null and snapshot like '점심 같이 먹어요%') = 1, '글이 지워져도 신고 기록(증거)은 남음');

select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
create temp table p2 as select create_post('study', '토익 스터디', '같이 해요') as id;
grant select on p2 to authenticated;
select delete_post((select id from p2));
select t.ok((select count(*) from post_feed) = 0, '내 글은 삭제할 수 있음');
reset role;
\echo === 소개팅 게시판
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
create temp table p3 as select create_post('date', '소개팅 하실 분', '카페에서 만나요', null, null, 2) as id;
grant select on p3 to authenticated;
select t.ok((select kind::text from post_feed where id = (select id from p3)) = 'date', '소개팅 글을 올릴 수 있음');
select delete_post((select id from p3));
reset role;
\echo === 채팅 명령어(@성별, @주사위)
select set_config('request.jwt.claims', json_build_object('sub', :'carol')::text, false);
set role authenticated;
create temp table p4 as select create_post('meal', '명령어 테스트', '내용', null, null, 4) as id;
grant select on p4 to authenticated;
select send_special('dice', null, (select id from p4));
select send_special('gender', null, (select id from p4));
select t.ok((select count(*) from messages where post_id = (select id from p4) and special = 'dice' and body ~ '^🎲 주사위 [1-6]$') = 1, '@주사위는 1~6 숫자 메시지');
select t.ok((select count(*) from messages where post_id = (select id from p4) and special = 'gender' and body ~ '^🙋 성별: (남성|여성)$') = 1, '@성별은 내 성별 메시지');
select t.fails($$select send_special('cheat', null, (select id from p4))$$, 'BAD_MESSAGE');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dave')::text, false);
set role authenticated;
select t.fails($$select send_special('dice', null, (select id from p4))$$, 'ROOM_NOT_FOUND');
reset role;
\echo ALL TESTS PASSED
