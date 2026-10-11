create table if not exists player_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null,
  channel_title text,
  channel_id text,
  thumbnail_url text,
  position_seconds integer not null default 0,
  device_id text not null,
  updated_at timestamptz not null default now()
);

alter table player_state enable row level security;

drop policy if exists "select_own_player_state" on player_state;
create policy "select_own_player_state" on player_state
  for select using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_player_state" on player_state;
create policy "insert_own_player_state" on player_state
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_player_state" on player_state;
create policy "update_own_player_state" on player_state
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table custom_playlists add column if not exists share_token text;

create unique index if not exists custom_playlists_share_token_key
  on custom_playlists (share_token)
  where share_token is not null;

create or replace function get_shared_playlist(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', p.name,
    'tracks', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'video_id', t.video_id,
            'title', t.title,
            'channel_title', t.channel_title,
            'channel_id', t.channel_id,
            'thumbnail_url', t.thumbnail_url
          )
          order by t.position
        )
        from playlist_tracks t
        where t.playlist_id = p.id
      ),
      '[]'::jsonb
    )
  )
  from custom_playlists p
  where p_token is not null
    and length(p_token) >= 16
    and p.share_token = p_token
  limit 1;
$$;

revoke all on function get_shared_playlist(text) from public;
grant execute on function get_shared_playlist(text) to anon, authenticated;
