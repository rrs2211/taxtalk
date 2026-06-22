-- ============================================================
-- TaxTalk — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

create type taxpayer_profile as enum ('salaried', 'business', 'freelancer', 'partner');
create type return_status as enum (
  'in_progress',   -- client filling chat
  'submitted',     -- sent to CA queue
  'queried',       -- CA sent query back to client
  'approved',      -- CA approved, pending e-verify
  'filed',         -- ITR filed with IT dept
  'on_hold'        -- CA put on hold
);
create type itr_form as enum ('ITR-1', 'ITR-2', 'ITR-3', 'ITR-4');
create type flag_severity as enum ('info', 'warn', 'critical');
create type user_role as enum ('client', 'ca_staff', 'ca_admin');
create type doc_type as enum ('form16', 'form16a', 'ais', 'balance_sheet', 'pl_statement', 'other');

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            user_role not null default 'client',
  full_name       text,
  phone           text,
  pan             text,                          -- linked at signup, used for AIS pre-fill
  email           text,
  firm_id         text default 'rb_shah',        -- for multi-firm SaaS later
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, phone)
  values (
    new.id,
    new.email,
    new.phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TAX RETURNS
-- ============================================================

create table public.returns (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  assessment_year text not null default '2026-27',
  itr_form        itr_form,
  profile         taxpayer_profile,
  status          return_status not null default 'in_progress',

  -- Extracted data (populated by AI)
  extracted_data  jsonb default '{}',           -- raw extraction from Form 16, BS, P&L
  computation     jsonb default '{}',           -- computed tax figures
  itr_json        jsonb default '{}',           -- CBDT-compliant ITR JSON (generated pre-filing)

  -- Regime
  old_regime_tax  numeric,
  new_regime_tax  numeric,
  chosen_regime   text,                         -- 'old' | 'new'

  -- Outcome
  refund_amount   numeric default 0,
  balance_due     numeric default 0,

  -- Filing
  acknowledgement_no  text,
  filed_at            timestamptz,
  filed_by            uuid references public.profiles(id),  -- CA who approved

  -- Timestamps
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- CONVERSATIONS (chat messages per return)
-- ============================================================

create table public.conversations (
  id          uuid primary key default uuid_generate_v4(),
  return_id   uuid not null references public.returns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,                    -- message text (HTML stripped for storage)
  step        text,                             -- which STEP enum value at time of message
  metadata    jsonb default '{}',               -- e.g. { type: 'chip_selection', value: ['ppf','lic'] }
  created_at  timestamptz not null default now()
);

-- ============================================================
-- DOCUMENTS (uploaded files)
-- ============================================================

create table public.documents (
  id              uuid primary key default uuid_generate_v4(),
  return_id       uuid not null references public.returns(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  doc_type        doc_type not null,
  original_name   text not null,
  storage_path    text not null,                -- Supabase Storage path (private bucket)
  file_size_kb    integer,
  extraction_status text default 'pending',     -- 'pending' | 'success' | 'failed' | 'manual'
  extracted_json  jsonb default '{}',           -- AI extraction result
  confidence      numeric,                      -- 0.0–1.0 extraction confidence
  created_at      timestamptz not null default now()
);

-- ============================================================
-- CA QUEUE (one row per return once submitted)
-- ============================================================

create table public.ca_queue (
  id              uuid primary key default uuid_generate_v4(),
  return_id       uuid not null unique references public.returns(id) on delete cascade,
  user_id         uuid not null references public.profiles(id),
  assigned_to     uuid references public.profiles(id),   -- CA assigned
  priority        integer default 5,                     -- 1=critical, 10=low (auto-set by flags)
  flags_count     integer default 0,
  critical_flags  integer default 0,
  ai_note         text,                                  -- AI-generated review summary
  queried_at      timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- FLAGS (AI-detected issues per return)
-- ============================================================

create table public.flags (
  id          uuid primary key default uuid_generate_v4(),
  return_id   uuid not null references public.returns(id) on delete cascade,
  severity    flag_severity not null default 'warn',
  title       text not null,
  body        text not null,
  field       text,               -- which ITR field triggered this (e.g. 'schedule_os.interest')
  resolved    boolean default false,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- CA QUERIES (messages from CA back to client)
-- ============================================================

create table public.ca_queries (
  id              uuid primary key default uuid_generate_v4(),
  return_id       uuid not null references public.returns(id) on delete cascade,
  from_user_id    uuid not null references public.profiles(id),  -- CA
  to_user_id      uuid not null references public.profiles(id),  -- client
  message         text not null,
  client_reply    text,
  replied_at      timestamptz,
  notified_whatsapp boolean default false,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- AUDIT LOG (immutable action trail)
-- ============================================================

create table public.audit_log (
  id          bigserial primary key,
  return_id   uuid references public.returns(id),
  user_id     uuid references public.profiles(id),
  action      text not null,    -- e.g. 'form16_uploaded', 'extraction_complete', 'ca_approved'
  detail      jsonb default '{}',
  ip_address  inet,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_returns_user_id     on public.returns(user_id);
create index idx_returns_status      on public.returns(status);
create index idx_returns_ay          on public.returns(assessment_year);
create index idx_conversations_return on public.conversations(return_id);
create index idx_conversations_user  on public.conversations(user_id);
create index idx_documents_return    on public.documents(return_id);
create index idx_flags_return        on public.flags(return_id);
create index idx_flags_resolved      on public.flags(resolved);
create index idx_ca_queue_priority   on public.ca_queue(priority, created_at);
create index idx_audit_return        on public.audit_log(return_id);
create index idx_audit_user          on public.audit_log(user_id);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update on any row change)
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_returns
  before update on public.returns
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at_ca_queue
  before update on public.ca_queue
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles     enable row level security;
alter table public.returns      enable row level security;
alter table public.conversations enable row level security;
alter table public.documents    enable row level security;
alter table public.ca_queue     enable row level security;
alter table public.flags        enable row level security;
alter table public.ca_queries   enable row level security;
alter table public.audit_log    enable row level security;

-- Helper: check if current user is CA staff or admin
create or replace function public.is_ca_staff()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('ca_staff', 'ca_admin')
  );
$$;

-- PROFILES
create policy "Users see own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "CA staff see all profiles"
  on public.profiles for select using (public.is_ca_staff());
create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);

-- RETURNS
create policy "Clients see own returns"
  on public.returns for select using (auth.uid() = user_id);
create policy "Clients create returns"
  on public.returns for insert with check (auth.uid() = user_id);
create policy "Clients update own in-progress returns"
  on public.returns for update using (
    auth.uid() = user_id and status = 'in_progress'
  );
create policy "CA staff see all returns"
  on public.returns for select using (public.is_ca_staff());
create policy "CA staff update returns"
  on public.returns for update using (public.is_ca_staff());

-- CONVERSATIONS
create policy "Clients see own conversations"
  on public.conversations for select using (auth.uid() = user_id);
create policy "Clients insert own conversations"
  on public.conversations for insert with check (auth.uid() = user_id);
create policy "CA staff see all conversations"
  on public.conversations for select using (public.is_ca_staff());

-- DOCUMENTS
create policy "Clients see own documents"
  on public.documents for select using (auth.uid() = user_id);
create policy "Clients upload documents"
  on public.documents for insert with check (auth.uid() = user_id);
create policy "CA staff see all documents"
  on public.documents for select using (public.is_ca_staff());

-- CA QUEUE
create policy "CA staff see queue"
  on public.ca_queue for select using (public.is_ca_staff());
create policy "CA staff update queue"
  on public.ca_queue for update using (public.is_ca_staff());
create policy "System inserts queue rows"
  on public.ca_queue for insert with check (public.is_ca_staff() or auth.uid() = user_id);
create policy "Clients see own queue entry"
  on public.ca_queue for select using (auth.uid() = user_id);

-- FLAGS
create policy "CA staff see flags"
  on public.flags for select using (public.is_ca_staff());
create policy "CA staff resolve flags"
  on public.flags for update using (public.is_ca_staff());
create policy "Clients see own flags"
  on public.flags for select using (
    exists (select 1 from public.returns r where r.id = return_id and r.user_id = auth.uid())
  );

-- CA QUERIES
create policy "CA staff create queries"
  on public.ca_queries for insert with check (public.is_ca_staff());
create policy "Clients see queries addressed to them"
  on public.ca_queries for select using (auth.uid() = to_user_id);
create policy "Clients reply to queries"
  on public.ca_queries for update using (auth.uid() = to_user_id);
create policy "CA staff see all queries"
  on public.ca_queries for select using (public.is_ca_staff());

-- AUDIT LOG (insert-only for all authenticated users, no update/delete)
create policy "Authenticated users insert audit events"
  on public.audit_log for insert with check (auth.uid() is not null);
create policy "CA admin sees full audit log"
  on public.audit_log for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'ca_admin')
  );

-- ============================================================
-- STORAGE: Cloudflare R2 (not Supabase Storage)
-- ============================================================
-- Document files (Form 16, AIS, BS, P&L) are stored in Cloudflare R2.
-- The `documents` table above holds metadata; storage_path is the R2 object key.
--
-- R2 Bucket Setup (do this in Cloudflare dashboard):
--
--  1. Create bucket: taxtalk-documents (private, no public access)
--  2. Create an API token with:
--       Permissions: Object Read & Write
--       Bucket: taxtalk-documents only
--  3. Copy Account ID, Access Key ID, Secret Access Key → add to .env
--  4. Set lifecycle rule: delete objects with tag userId=* after 7 years
--     (ICAI requires 6 years post-filing; 7 years gives safe buffer)
--  5. Enable Cloudflare R2 audit logging for compliance
--
-- Object key format: tax-documents/{userId}/{returnId}/{docType}_{timestamp}.pdf
-- Access: Always via short-lived presigned URLs (5 min) — never public URLs.
-- Server routes: api/upload-url.js → api/register-upload.js → api/doc-url.js
