create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  vendor_id text not null,
  customer_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unread_for_customer integer not null default 0 check (unread_for_customer >= 0),
  unread_for_vendor integer not null default 0 check (unread_for_vendor >= 0),
  constraint conversations_vendor_customer_unique unique (vendor_id, customer_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_user_id text not null,
  text text not null check (char_length(trim(text)) > 0 and char_length(text) <= 1200),
  created_at timestamptz not null default timezone('utc', now()),
  constraint messages_conversation_fk
    foreign key (conversation_id)
    references public.conversations(id)
    on delete cascade
);

create index if not exists conversations_customer_updated_idx
  on public.conversations (customer_id, updated_at desc);
create index if not exists conversations_vendor_updated_idx
  on public.conversations (vendor_id, updated_at desc);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

create or replace function public.set_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_conversations_set_updated_at on public.conversations;
create trigger trg_conversations_set_updated_at
before update on public.conversations
for each row
execute function public.set_conversations_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
