create extension if not exists pgcrypto;

create table if not exists public.node0_workspace_projects (
  user_id uuid not null,
  client_id text not null,
  name text not null default 'Untitled',
  tagline text not null default '',
  updated_at timestamptz not null default now(),
  messages jsonb not null default '[]'::jsonb,
  pcb_snapshot jsonb null,
  cad_document jsonb null,
  bom jsonb null,
  extras jsonb null,
  team_id uuid null,
  firmware text null,
  artifact_manifest jsonb null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.node0_workspace_projects
  add column if not exists team_id uuid;
alter table public.node0_workspace_projects
  add column if not exists firmware text;
alter table public.node0_workspace_projects
  add column if not exists artifact_manifest jsonb;

create table if not exists public.node0_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.node0_team_members (
  team_id uuid not null references public.node0_teams(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  constraint node0_team_members_role_chk check (role in ('owner', 'admin', 'editor', 'viewer'))
);

create table if not exists public.node0_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.node0_teams(id) on delete cascade,
  email text not null,
  invited_by uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  unique (team_id, email, status),
  constraint node0_team_invites_status_chk check (status in ('pending', 'accepted', 'revoked'))
);

create table if not exists public.node0_project_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_id uuid null references public.node0_teams(id) on delete set null,
  client_id text not null,
  kind text not null,
  storage_path text not null unique,
  public_name text not null unique,
  size_bytes integer not null default 0,
  content_type text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_node0_workspace_projects_team_updated
  on public.node0_workspace_projects (team_id, updated_at desc);
create index if not exists idx_node0_project_artifacts_client
  on public.node0_project_artifacts (user_id, client_id, created_at desc);
create index if not exists idx_node0_team_invites_email
  on public.node0_team_invites (lower(email), status);

alter table public.node0_workspace_projects enable row level security;
alter table public.node0_teams enable row level security;
alter table public.node0_team_members enable row level security;
alter table public.node0_team_invites enable row level security;
alter table public.node0_project_artifacts enable row level security;

drop policy if exists node0_workspace_owner_rw on public.node0_workspace_projects;
create policy node0_workspace_owner_rw
on public.node0_workspace_projects
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists node0_workspace_team_read on public.node0_workspace_projects;
create policy node0_workspace_team_read
on public.node0_workspace_projects
for select
to authenticated
using (
  team_id is not null and exists (
    select 1
    from public.node0_team_members tm
    where tm.team_id = node0_workspace_projects.team_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists node0_workspace_team_update on public.node0_workspace_projects;
create policy node0_workspace_team_update
on public.node0_workspace_projects
for update
to authenticated
using (
  team_id is not null and exists (
    select 1
    from public.node0_team_members tm
    where tm.team_id = node0_workspace_projects.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'editor')
  )
)
with check (
  team_id is not null and exists (
    select 1
    from public.node0_team_members tm
    where tm.team_id = node0_workspace_projects.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists node0_workspace_team_insert on public.node0_workspace_projects;
create policy node0_workspace_team_insert
on public.node0_workspace_projects
for insert
to authenticated
with check (
  user_id = auth.uid() or (
    team_id is not null and exists (
      select 1
      from public.node0_team_members tm
      where tm.team_id = node0_workspace_projects.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'editor')
    )
  )
);

drop policy if exists node0_workspace_team_delete on public.node0_workspace_projects;
create policy node0_workspace_team_delete
on public.node0_workspace_projects
for delete
to authenticated
using (
  user_id = auth.uid() or (
    team_id is not null and exists (
      select 1
      from public.node0_team_members tm
      where tm.team_id = node0_workspace_projects.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  )
);

drop policy if exists node0_teams_read on public.node0_teams;
create policy node0_teams_read
on public.node0_teams
for select
to authenticated
using (
  exists (
    select 1
    from public.node0_team_members tm
    where tm.team_id = node0_teams.id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists node0_teams_insert on public.node0_teams;
create policy node0_teams_insert
on public.node0_teams
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists node0_team_members_read on public.node0_team_members;
create policy node0_team_members_read
on public.node0_team_members
for select
to authenticated
using (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_members.team_id
      and me.user_id = auth.uid()
  )
);

drop policy if exists node0_team_members_insert on public.node0_team_members;
create policy node0_team_members_insert
on public.node0_team_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_members.team_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin')
  )
);

drop policy if exists node0_team_members_delete on public.node0_team_members;
create policy node0_team_members_delete
on public.node0_team_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_members.team_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin')
  )
);

drop policy if exists node0_team_invites_read on public.node0_team_invites;
create policy node0_team_invites_read
on public.node0_team_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_invites.team_id
      and me.user_id = auth.uid()
  ) or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

drop policy if exists node0_team_invites_insert on public.node0_team_invites;
create policy node0_team_invites_insert
on public.node0_team_invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_invites.team_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists node0_team_invites_update on public.node0_team_invites;
create policy node0_team_invites_update
on public.node0_team_invites
for update
to authenticated
using (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_invites.team_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin', 'editor')
  ) or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
)
with check (
  exists (
    select 1
    from public.node0_team_members me
    where me.team_id = node0_team_invites.team_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin', 'editor')
  ) or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

drop policy if exists node0_project_artifacts_read on public.node0_project_artifacts;
create policy node0_project_artifacts_read
on public.node0_project_artifacts
for select
to authenticated
using (
  user_id = auth.uid() or (
    team_id is not null and exists (
      select 1
      from public.node0_team_members tm
      where tm.team_id = node0_project_artifacts.team_id
        and tm.user_id = auth.uid()
    )
  )
);

drop policy if exists node0_project_artifacts_write on public.node0_project_artifacts;
create policy node0_project_artifacts_write
on public.node0_project_artifacts
for all
to authenticated
using (
  user_id = auth.uid() or (
    team_id is not null and exists (
      select 1
      from public.node0_team_members tm
      where tm.team_id = node0_project_artifacts.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'editor')
    )
  )
)
with check (
  user_id = auth.uid() or (
    team_id is not null and exists (
      select 1
      from public.node0_team_members tm
      where tm.team_id = node0_project_artifacts.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'editor')
    )
  )
);

insert into storage.buckets (id, name, public)
values ('node0-artifacts', 'node0-artifacts', false)
on conflict (id) do nothing;
