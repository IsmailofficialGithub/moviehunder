-- Run in Supabase SQL Editor once.
-- Table stores each phone/install; set blocked = true to deny app access.

create table if not exists public.app_devices (
  device_id text primary key,
  platform text,
  app_version text,
  device_name text,
  model text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  blocked boolean not null default false,
  blocked_reason text,
  blocked_at timestamptz,
  notes text
);

create index if not exists app_devices_blocked_idx
  on public.app_devices (blocked);

create index if not exists app_devices_last_seen_idx
  on public.app_devices (last_seen_at desc);

-- Service role key from the Worker bypasses RLS.
-- Keep RLS on so anon clients cannot read/write devices directly.
alter table public.app_devices enable row level security;

-- No public policies — only service role (backend) can access.
