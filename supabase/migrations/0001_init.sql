-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor > New query.
-- File này idempotent: chạy lại nhiều lần không lỗi (drop policy if exists
-- trước mỗi create policy, vì Postgres không có "create policy if not exists").

-- ========== custom_playlists ==========
create table if not exists custom_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table custom_playlists enable row level security;

drop policy if exists "select_own_playlists" on custom_playlists;
create policy "select_own_playlists" on custom_playlists
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_playlists" on custom_playlists;
create policy "insert_own_playlists" on custom_playlists
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_playlists" on custom_playlists;
create policy "update_own_playlists" on custom_playlists
  for update using (auth.uid() = user_id);

drop policy if exists "delete_own_playlists" on custom_playlists;
create policy "delete_own_playlists" on custom_playlists
  for delete using (auth.uid() = user_id);

-- ========== playlist_tracks ==========
-- Bảng này không có cột user_id trực tiếp, nên policy phải join ngược qua
-- custom_playlists để biết track có thuộc về playlist của đúng user không.
create table if not exists playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references custom_playlists(id) on delete cascade,
  video_id text not null,
  title text not null,
  channel_title text,
  thumbnail_url text,
  position integer not null default 0,
  added_at timestamptz not null default now()
);

alter table playlist_tracks enable row level security;

drop policy if exists "select_own_playlist_tracks" on playlist_tracks;
create policy "select_own_playlist_tracks" on playlist_tracks
  for select using (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = auth.uid()
    )
  );

drop policy if exists "insert_own_playlist_tracks" on playlist_tracks;
create policy "insert_own_playlist_tracks" on playlist_tracks
  for insert with check (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = auth.uid()
    )
  );

drop policy if exists "delete_own_playlist_tracks" on playlist_tracks;
create policy "delete_own_playlist_tracks" on playlist_tracks
  for delete using (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = auth.uid()
    )
  );

-- ========== favorites ==========
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null,
  thumbnail_url text,
  added_at timestamptz not null default now(),
  unique (user_id, video_id)
);

alter table favorites enable row level security;

drop policy if exists "select_own_favorites" on favorites;
create policy "select_own_favorites" on favorites
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_favorites" on favorites;
create policy "insert_own_favorites" on favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_favorites" on favorites;
create policy "delete_own_favorites" on favorites
  for delete using (auth.uid() = user_id);

-- ========== history ==========
create table if not exists history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null,
  channel_title text,
  thumbnail_url text,
  played_at timestamptz not null default now(),
  last_position_seconds integer default 0
);

alter table history enable row level security;

drop policy if exists "select_own_history" on history;
create policy "select_own_history" on history
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_history" on history;
create policy "insert_own_history" on history
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_history" on history;
create policy "update_own_history" on history
  for update using (auth.uid() = user_id);

-- ========== google_tokens ==========
-- Bảng nhạy cảm nhất trong toàn bộ schema: chứa refresh_token của Google.
-- KHÔNG tạo bất kỳ policy nào cho role anon/authenticated — mặc định RLS
-- chặn hết mọi truy cập từ client, chỉ service_role key (dùng trong API
-- routes phía server) mới bypass được RLS để đọc/ghi bảng này.
create table if not exists google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider_refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table google_tokens enable row level security;
