-- Run this entire file in Supabase SQL Editor.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Участник',
  caption text not null default '' check (char_length(caption) <= 500),
  tag text not null default 'Разное',
  image_url text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Участник',
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists comments_post_id_idx on public.comments(post_id);

alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

drop policy if exists "Posts are public to read" on public.posts;
create policy "Posts are public to read" on public.posts for select to anon, authenticated using (true);
drop policy if exists "Signed-in users create their own posts" on public.posts;
create policy "Signed-in users create their own posts" on public.posts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Authors update their own posts" on public.posts;
create policy "Authors update their own posts" on public.posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Authors delete their own posts" on public.posts;
create policy "Authors delete their own posts" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Likes are public to read" on public.likes;
create policy "Likes are public to read" on public.likes for select to anon, authenticated using (true);
drop policy if exists "Users add own likes" on public.likes;
create policy "Users add own likes" on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users remove own likes" on public.likes;
create policy "Users remove own likes" on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Comments are public to read" on public.comments;
create policy "Comments are public to read" on public.comments for select to anon, authenticated using (true);
drop policy if exists "Signed-in users add own comments" on public.comments;
create policy "Signed-in users add own comments" on public.comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Authors delete own comments" on public.comments;
create policy "Authors delete own comments" on public.comments for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view published photos" on storage.objects;
create policy "Public can view published photos" on storage.objects for select to anon, authenticated using (bucket_id = 'photos');
drop policy if exists "Users upload photos to own folder" on storage.objects;
create policy "Users upload photos to own folder" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Users delete photos in own folder" on storage.objects;
create policy "Users delete photos in own folder" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

grant select on public.posts, public.likes, public.comments to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, delete on public.likes to authenticated;
grant insert, delete on public.comments to authenticated;
