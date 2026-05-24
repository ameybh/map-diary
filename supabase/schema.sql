create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null,
  email text,
  avatar_url text,
  theme jsonb not null default '{}'::jsonb,
  feed_visible boolean not null default true,
  private_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  place_name text not null,
  note text not null default '',
  lat double precision not null,
  lng double precision not null,
  icon text not null default 'heart',
  color text not null default '#000000',
  visibility text not null default 'private' check (visibility in ('private', 'friends')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entry_mates (
  entry_id uuid not null references public.entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

create table if not exists public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  content_type text,
  size integer,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists theme jsonb not null default '{}'::jsonb;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.entries enable row level security;
alter table public.entry_mates enable row level security;
alter table public.entry_photos enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "friendships_select_involving_self"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "friendships_insert_self"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid());

create policy "friendships_update_involving_self"
  on public.friendships for update
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "entries_select_owner_or_mate"
  on public.entries for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.entry_mates
      where entry_mates.entry_id = entries.id
      and entry_mates.user_id = auth.uid()
    )
  );

create policy "entries_insert_self"
  on public.entries for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "entries_update_self"
  on public.entries for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "entries_delete_self"
  on public.entries for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "mates_select_owner_or_self"
  on public.entry_mates for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.entries
      where entries.id = entry_mates.entry_id
      and entries.owner_id = auth.uid()
    )
  );

create policy "mates_insert_owner"
  on public.entry_mates for insert
  to authenticated
  with check (
    exists (
      select 1 from public.entries
      where entries.id = entry_mates.entry_id
      and entries.owner_id = auth.uid()
    )
  );

create policy "mates_delete_owner"
  on public.entry_mates for delete
  to authenticated
  using (
    exists (
      select 1 from public.entries
      where entries.id = entry_mates.entry_id
      and entries.owner_id = auth.uid()
    )
  );

create policy "photos_select_owner_or_mate"
  on public.entry_photos for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.entry_mates
      where entry_mates.entry_id = entry_photos.entry_id
      and entry_mates.user_id = auth.uid()
    )
  );

create policy "photos_insert_self"
  on public.entry_photos for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "photos_delete_self"
  on public.entry_photos for delete
  to authenticated
  using (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', false)
on conflict (id) do nothing;

drop policy if exists "place_photos_select_own_prefix" on storage.objects;
drop policy if exists "place_photos_select_owner_or_mate" on storage.objects;

create policy "place_photos_select_owner_or_mate"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'place-photos'
    and exists (
      select 1
      from public.entry_photos
      left join public.entry_mates
        on entry_mates.entry_id = entry_photos.entry_id
        and entry_mates.user_id = auth.uid()
      where entry_photos.storage_path = storage.objects.name
      and (entry_photos.owner_id = auth.uid() or entry_mates.user_id = auth.uid())
    )
  );

create policy "place_photos_insert_own_prefix"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'place-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "place_photos_update_own_prefix"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'place-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "place_photos_delete_own_prefix"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'place-photos' and (storage.foldername(name))[1] = auth.uid()::text);
