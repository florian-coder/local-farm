create extension if not exists pgcrypto;

create table if not exists public.farmer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  farm_name text not null,
  display_name text not null default '',
  street_address text not null default '',
  street_number text not null default '',
  county text not null default '',
  city text not null default '',
  phone_number text not null default '',
  email text not null default '',
  organic_certificate text not null default '',
  delivery_radius_km numeric,
  bio text not null default '',
  farm_images jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists farmer_requests_status_updated_idx
  on public.farmer_requests (status, updated_at desc);
create index if not exists farmer_requests_user_idx
  on public.farmer_requests (user_id);

create or replace function public.set_farmer_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_farmer_requests_set_updated_at on public.farmer_requests;
create trigger trg_farmer_requests_set_updated_at
before update on public.farmer_requests
for each row
execute function public.set_farmer_requests_updated_at();
