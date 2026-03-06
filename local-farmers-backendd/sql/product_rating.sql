alter table if exists public.products
  add column if not exists rating numeric(5, 2) not null default 1;
