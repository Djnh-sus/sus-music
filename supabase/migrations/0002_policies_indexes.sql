alter table favorites add column if not exists channel_title text;

alter table custom_playlists alter column user_id set default auth.uid();
alter table favorites alter column user_id set default auth.uid();
alter table history alter column user_id set default auth.uid();

drop policy if exists "select_own_playlists" on custom_playlists;
create policy "select_own_playlists" on custom_playlists
  for select using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_playlists" on custom_playlists;
create policy "insert_own_playlists" on custom_playlists
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_playlists" on custom_playlists;
create policy "update_own_playlists" on custom_playlists
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete_own_playlists" on custom_playlists;
create policy "delete_own_playlists" on custom_playlists
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "select_own_playlist_tracks" on playlist_tracks;
create policy "select_own_playlist_tracks" on playlist_tracks
  for select using (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = (select auth.uid())
    )
  );

drop policy if exists "insert_own_playlist_tracks" on playlist_tracks;
create policy "insert_own_playlist_tracks" on playlist_tracks
  for insert with check (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = (select auth.uid())
    )
  );

drop policy if exists "update_own_playlist_tracks" on playlist_tracks;
create policy "update_own_playlist_tracks" on playlist_tracks
  for update using (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = (select auth.uid())
    )
  );

drop policy if exists "delete_own_playlist_tracks" on playlist_tracks;
create policy "delete_own_playlist_tracks" on playlist_tracks
  for delete using (
    exists (
      select 1 from custom_playlists
      where custom_playlists.id = playlist_tracks.playlist_id
      and custom_playlists.user_id = (select auth.uid())
    )
  );

drop policy if exists "select_own_favorites" on favorites;
create policy "select_own_favorites" on favorites
  for select using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_favorites" on favorites;
create policy "insert_own_favorites" on favorites
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "delete_own_favorites" on favorites;
create policy "delete_own_favorites" on favorites
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "select_own_history" on history;
create policy "select_own_history" on history
  for select using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_history" on history;
create policy "insert_own_history" on history
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_history" on history;
create policy "update_own_history" on history
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete_own_history" on history;
create policy "delete_own_history" on history
  for delete using ((select auth.uid()) = user_id);

create index if not exists custom_playlists_user_created_idx
  on custom_playlists (user_id, created_at desc);

create index if not exists playlist_tracks_playlist_position_idx
  on playlist_tracks (playlist_id, position);

create index if not exists favorites_user_added_idx
  on favorites (user_id, added_at desc);

create index if not exists history_user_played_idx
  on history (user_id, played_at desc);
