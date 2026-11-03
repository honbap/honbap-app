-- 게시판에 '소개팅' 칸 추가
alter type public.post_kind add value if not exists 'date';
