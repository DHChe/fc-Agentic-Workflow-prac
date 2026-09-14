-- SlipScan 0001_init
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록 if not exists / drop policy if exists 를 사용한다.

-- ---------------------------------------------------------------
-- 1. analyses 테이블
-- ---------------------------------------------------------------
create table if not exists public.analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  file_name    text not null,
  mime_type    text not null,
  storage_path text not null,
  result       jsonb not null,           -- AnalysisResult. 사용자가 수정하면 여기가 바뀐다
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,              -- 사용자 수정 시각. null이면 미수정
  -- 파일 경로는 반드시 본인 폴더 아래. 서버 검사와 별개로 DB가 불변식을 보장한다.
  constraint analyses_storage_path_owned
    check (storage_path like user_id::text || '/%'),
  -- 한 객체를 두 행이 가리키지 못하게 한다. 업로드마다 새 uuid라 정상 흐름에서는 충돌하지 않는다.
  constraint analyses_storage_path_unique unique (storage_path),
  constraint analyses_mime_type_allowed
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'))
);

create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

drop policy if exists "analyses_select_own" on public.analyses;
create policy "analyses_select_own" on public.analyses
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "analyses_insert_own" on public.analyses;
create policy "analyses_insert_own" on public.analyses
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "analyses_update_own" on public.analyses;
create policy "analyses_update_own" on public.analyses
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "analyses_delete_own" on public.analyses;
create policy "analyses_delete_own" on public.analyses
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 2. receipts 버킷 (비공개, 20MB, PDF/JPEG/PNG/WEBP)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 객체 경로는 `{user_id}/{uuid}.{ext}` 형식. 첫 폴더가 본인 uid일 때만 허용.
-- update 정책은 의도적으로 없다. 앱은 upsert:false로만 업로드하며, 같은 경로 덮어쓰기는 허용하지 않는다.
drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- PostgREST 스키마 캐시를 갱신한다. 이게 없으면 직후 REST 호출이 404를 낼 수 있다.
notify pgrst, 'reload schema';
