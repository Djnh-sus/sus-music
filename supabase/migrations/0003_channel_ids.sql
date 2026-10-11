alter table history add column if not exists channel_id text;
alter table favorites add column if not exists channel_id text;
alter table playlist_tracks add column if not exists channel_id text;
