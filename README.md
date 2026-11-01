# 밥친구 (혼밥러 앱)

같은 학교 혼밥러들의 커뮤니티예요. 밥·공부 게시판(제목+내용, 댓글)과 친구끼리 1:1 채팅(읽음 표시)이 있어요.

```
honbap/
├─ supabase/
│  ├─ migrations/0001~0003 .sql   DB 테이블 · 권한(RLS) · 함수(RPC) · 실시간
│  ├─ seed.sql                                       가입 때 고르는 학교 목록
│  ├─ functions/signup/index.ts                      이메일 인증 없이 계정 만드는 서버 함수
│  └─ tests/                                         백엔드 시나리오 테스트(로컬 PostgreSQL용)
└─ web/                                              설치형 웹앱(PWA). 빌드 없이 정적 호스팅
   ├─ index.html, app.js, styles.css                 앱
   ├─ admin.html, admin.js                           운영자 신고 관리
   └─ config.js                                      Supabase URL / anon key / 구글 로그인 스위치
```

## 지금 상태 (honbap 프로젝트)

0001, 0002, 0003, seed, `signup` 함수가 모두 적용돼 있어요. `web/config.js`에도 연결 정보가 들어 있어요. **새로 할 설정은 없어요.**
`web/index.html`을 브라우저에서 열거나 `web` 폴더를 호스팅하면 바로 가입·로그인할 수 있어요.

## 가입 방식

- **이메일 + 비밀번호(6자 이상)**: 메일 인증 없이 바로 계정이 만들어져요(`signup` 함수가 처리).
  그래서 *아무 이메일이나* 쓸 수 있어요. 본인 소유 확인은 하지 않아요.
- **처음 한 번**: 닉네임, 성별(남자/여자), 학교(목록에서 선택). 성별과 학교는 이후 바꿀 수 없고, 닉네임만 바꿀 수 있어요. 닉네임은 같은 학교 안에서 겹치지 않아야 해요.
- 학교는 이용자가 직접 고르는 분류예요. 인증하지 않으니 다른 학교를 고를 수도 있어요.
- 학교 목록은 `seed.sql`에서 고쳐요(서울 중심 → 그 밖 → 기타, 각 ㄱㄴㄷ 순). 번호순으로 보이므로 새 학교는 목록 맨 아래(기타 바로 앞)에 붙어요.

## 메일 인증(인증번호) 켜기

화면은 만들어 뒀고 `web/config.js`의 `EMAIL_VERIFY`가 `false`(꺼짐)예요. 켜려면 Supabase 설정 두 가지가 먼저 필요해요.
1. **SMTP 연결**: Project Settings > Authentication > SMTP에 Resend 같은 메일 서비스를 넣어요. (기본 메일 서버는 팀원에게만 보내고 발송량도 아주 적어요.)
2. **메일 양식**: Authentication > Email Templates > **Confirm signup** 본문에 `{{ .Token }}`을 넣어요. (예: `인증번호: {{ .Token }}`) 그리고 Providers > Email에서 **Confirm email**이 켜져 있는지 확인해요.
3. `EMAIL_VERIFY`를 `true`로 바꿔 올려요. 그러면 가입할 때 메일로 숫자가 가고, 입력해야 다음으로 넘어가요.
4. 인증 없이 계정을 만드는 `signup` 함수는 더 이상 쓰지 않으니 Edge Functions에서 삭제하거나 알려 주세요(제가 막아 둘게요).

## 구글 로그인 켜기 (선택, 앱을 호스팅한 뒤에)

1. 앱을 배포해 주소(https://…)를 정해요.
2. Google Cloud Console > API 및 서비스 > 사용자 인증 정보에서 **OAuth 클라이언트 ID(웹)** 를 만들고, 승인된 리디렉션 URI에
   `https://dfyekwzmywbcpxixqfhw.supabase.co/auth/v1/callback` 을 넣어요. 클라이언트 ID/보안 비밀번호가 나와요.
3. Supabase 대시보드 > Authentication > Sign In / Providers > **Google**을 켜고 두 값을 붙여 넣어요.
4. Authentication > URL Configuration의 **Site URL**에 배포 주소를 넣어요.
5. `web/config.js`의 `GOOGLE_LOGIN`을 `true`로 바꿔 다시 올려요. 로그인 화면에 Google 버튼이 생겨요.

## 배포
`web` 폴더를 그대로 올리면 돼요(Cloudflare Pages, Netlify, Vercel, GitHub Pages). HTTPS여야 하고 빌드 설정은 필요 없어요.

## 운영자 지정
본인 계정으로 가입한 뒤 SQL Editor에서:
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = '내이메일');
```
내 정보 탭에 운영자 화면 링크가 생겨요. 운영자는 **자기 학교** 신고만 처리해요.

## 출시 전에 꼭 할 일
- 시험 계정 삭제 (시험용 학교 이름도 목록에서 빼려면 같이):
```sql
delete from auth.users where email in ('test1@saebom.ac.kr', 'test2@saebom.ac.kr');
delete from public.schools where name = '시험용 학교';
```
- 알림 자동 정리(30일): Database > Extensions에서 `pg_cron`을 켠 뒤 한 번 실행
```sql
select cron.schedule('honbap-purge', '0 19 * * *', 'select public.purge_expired()');
```
- 가입 보호: Authentication > Attack Protection에서 "Leaked password protection"을 켜면 유출된 비밀번호를 막아요.
- 개인정보처리방침·이용약관(성별 표시 범위, 탈퇴 시 삭제, 신고 기록 보존), 만 14세 미만 가입 처리 방침을 정해요.

## 규칙 요약

| 항목 | 규칙 |
|---|---|
| 글 | 제목 40자, 내용 1000자, 1시간에 10개. 같은 학교 이용자에게만 보여요. 작성자만 삭제. |
| 댓글 | 200자, 1분에 10개. 작성자만 삭제. 글 작성자에게 알림. 댓글에 답글(한 단계)과 좋아요(누르면 켜짐/꺼짐)를 달 수 있어요. 부모 댓글을 지우면 답글도 지워져요. |
| 모이는 시간 | 글에 선택으로 붙여요. 지금부터 60일 이내, 종료는 시작 뒤 12시간 이내. |
| 친구·채팅 | 같은 학교 닉네임 검색 → 요청 → 수락하면 1:1 채팅. 읽음 표시는 상대가 방을 열어 본 시각 기준. |
| 차단 | 서로 글·댓글·채팅이 안 보이고 친구 관계도 끊겨요. |
| 신고 | 글·댓글·메시지·이용자. 하루 20건. 운영자가 기각/숨김/정지. |
| 제한 | 메시지 10초에 8건 |
| 탈퇴 | 계정, 프로필, 쓴 글·댓글, 친구 관계가 함께 삭제돼요. |
| 표시 | 글·댓글에는 닉네임과 성별(남/여)이 보이고, 채팅에는 성별이 안 보여요. |

## 테스트 (로컬 PostgreSQL)
```bash
createdb honbap_test
for f in tests/stub_supabase.sql migrations/0001_init.sql migrations/0002_community.sql migrations/0003_replies_likes_time.sql tests/test.sql; do
  psql -v ON_ERROR_STOP=1 -d honbap_test -f supabase/$f; done        # 마지막에 ALL TESTS PASSED
```
`stub_supabase.sql`은 테스트 전용이에요. **Supabase 프로젝트에는 실행하지 마세요.**


## 2026-11 업데이트
- DB 마이그레이션 0001~0005를 순서대로 적용해요. (0004 닉네임 7일 제한, 0005 참여·단체 채팅·약관 동의 기록)
- 모집글에 "참여하기"를 누르면 단체 채팅(내 모임)이 열리고, 참여한 뒤의 대화만 볼 수 있어요.
- `web/legal.html`의 `[ ]` 칸(운영자 이름, 책임자, 문의 이메일)을 **공개 전에 반드시** 채우세요. 이 문서는 템플릿이며 법률 자문이 아니에요.
- 테스트: tests/stub_supabase.sql → 0001~0005 → tests/test.sql
- 공개 전: 시험 계정(test1/test2@saebom.ac.kr)과 '시험용 학교' 삭제, Supabase 프로젝트는 서울(ap-northeast-2) `honbap-seoul`로 옮겼어요. 아일랜드 프로젝트 honbap은 확인 후 삭제하세요.
