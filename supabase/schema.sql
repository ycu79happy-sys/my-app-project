-- Run once in your own Supabase project's SQL Editor.
-- Re-running preserves all existing notes.
begin;
create table if not exists public.notes (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null default '' check (char_length(title)<=500),
 body text not null default '' check (octet_length(body)<=1048576),
 notebook text not null default '기본 노트북' check (char_length(notebook)<=200),
 pinned boolean not null default false,
 updated bigint not null default (floor(extract(epoch from clock_timestamp())*1000)::bigint)
);
create index if not exists notes_owner on public.notes(user_id);
alter table public.notes enable row level security;
revoke all on public.notes from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
drop policy if exists own_notes on public.notes;
create policy own_notes on public.notes for all to authenticated
 using ((select auth.uid())=user_id)
 with check ((select auth.uid())=user_id);
create or replace function public.stamp_note() returns trigger
language plpgsql set search_path = '' as $$
begin
 if TG_OP='UPDATE' then
  if NEW.id is distinct from OLD.id or NEW.user_id is distinct from OLD.user_id then
   raise exception 'Cannot change note owner or identity';
  end if;
  NEW.updated=greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,OLD.updated+1);
 else
  NEW.updated=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 end if;
 return NEW;
end;
$$;
drop trigger if exists notes_stamp on public.notes;
create trigger notes_stamp before insert or update on public.notes
 for each row execute function public.stamp_note();
commit;
