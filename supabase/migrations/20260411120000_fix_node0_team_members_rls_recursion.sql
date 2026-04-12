-- RLS on node0_team_members used "EXISTS (SELECT ... FROM node0_team_members)" which
-- re-evaluates the same policy → infinite recursion. These SECURITY DEFINER helpers read
-- the table with definer rights so policies can test membership without recursion.

create or replace function public.node0_team_member_is_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.node0_team_members m
    where m.team_id = p_team_id
      and m.user_id = p_user_id
  );
$$;

create or replace function public.node0_team_member_is_owner_or_admin(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.node0_team_members m
    where m.team_id = p_team_id
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.node0_team_member_can_edit_workspace(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.node0_team_members m
    where m.team_id = p_team_id
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin', 'editor')
  );
$$;

revoke all on function public.node0_team_member_is_member(uuid, uuid) from public;
revoke all on function public.node0_team_member_is_owner_or_admin(uuid, uuid) from public;
revoke all on function public.node0_team_member_can_edit_workspace(uuid, uuid) from public;

grant execute on function public.node0_team_member_is_member(uuid, uuid) to authenticated;
grant execute on function public.node0_team_member_is_owner_or_admin(uuid, uuid) to authenticated;
grant execute on function public.node0_team_member_can_edit_workspace(uuid, uuid) to authenticated;

-- --- workspace_projects (team policies) ---

drop policy if exists node0_workspace_team_read on public.node0_workspace_projects;
create policy node0_workspace_team_read
on public.node0_workspace_projects
for select
to authenticated
using (
  team_id is not null
  and public.node0_team_member_is_member(team_id, auth.uid())
);

drop policy if exists node0_workspace_team_update on public.node0_workspace_projects;
create policy node0_workspace_team_update
on public.node0_workspace_projects
for update
to authenticated
using (
  team_id is not null
  and public.node0_team_member_can_edit_workspace(team_id, auth.uid())
)
with check (
  team_id is not null
  and public.node0_team_member_can_edit_workspace(team_id, auth.uid())
);

drop policy if exists node0_workspace_team_insert on public.node0_workspace_projects;
create policy node0_workspace_team_insert
on public.node0_workspace_projects
for insert
to authenticated
with check (
  user_id = auth.uid()
  or (
    team_id is not null
    and public.node0_team_member_can_edit_workspace(team_id, auth.uid())
  )
);

drop policy if exists node0_workspace_team_delete on public.node0_workspace_projects;
create policy node0_workspace_team_delete
on public.node0_workspace_projects
for delete
to authenticated
using (
  user_id = auth.uid()
  or (
    team_id is not null
    and public.node0_team_member_is_owner_or_admin(team_id, auth.uid())
  )
);

-- --- teams ---

drop policy if exists node0_teams_read on public.node0_teams;
create policy node0_teams_read
on public.node0_teams
for select
to authenticated
using (public.node0_team_member_is_member(id, auth.uid()));

-- --- team_members (no self-referential subquery) ---

drop policy if exists node0_team_members_read on public.node0_team_members;
create policy node0_team_members_read
on public.node0_team_members
for select
to authenticated
using (public.node0_team_member_is_member(team_id, auth.uid()));

drop policy if exists node0_team_members_insert on public.node0_team_members;
create policy node0_team_members_insert
on public.node0_team_members
for insert
to authenticated
with check (
  public.node0_team_member_is_owner_or_admin(team_id, auth.uid())
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.node0_teams t
      where t.id = team_id
        and t.created_by = auth.uid()
    )
  )
  or (
    user_id = auth.uid()
    and role in ('editor', 'viewer')
    and exists (
      select 1
      from public.node0_team_invites i
      where i.team_id = team_id
        and i.status = 'pending'
        and lower(trim(i.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
    )
  )
);

drop policy if exists node0_team_members_delete on public.node0_team_members;
create policy node0_team_members_delete
on public.node0_team_members
for delete
to authenticated
using (public.node0_team_member_is_owner_or_admin(team_id, auth.uid()));

-- --- team_invites ---

drop policy if exists node0_team_invites_read on public.node0_team_invites;
create policy node0_team_invites_read
on public.node0_team_invites
for select
to authenticated
using (
  public.node0_team_member_is_member(team_id, auth.uid())
  or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

drop policy if exists node0_team_invites_insert on public.node0_team_invites;
create policy node0_team_invites_insert
on public.node0_team_invites
for insert
to authenticated
with check (
  public.node0_team_member_can_edit_workspace(team_id, auth.uid())
);

drop policy if exists node0_team_invites_update on public.node0_team_invites;
create policy node0_team_invites_update
on public.node0_team_invites
for update
to authenticated
using (
  public.node0_team_member_can_edit_workspace(team_id, auth.uid())
  or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
)
with check (
  public.node0_team_member_can_edit_workspace(team_id, auth.uid())
  or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

-- --- project_artifacts ---

drop policy if exists node0_project_artifacts_read on public.node0_project_artifacts;
create policy node0_project_artifacts_read
on public.node0_project_artifacts
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    team_id is not null
    and public.node0_team_member_is_member(team_id, auth.uid())
  )
);

drop policy if exists node0_project_artifacts_write on public.node0_project_artifacts;
create policy node0_project_artifacts_write
on public.node0_project_artifacts
for all
to authenticated
using (
  user_id = auth.uid()
  or (
    team_id is not null
    and public.node0_team_member_can_edit_workspace(team_id, auth.uid())
  )
)
with check (
  user_id = auth.uid()
  or (
    team_id is not null
    and public.node0_team_member_can_edit_workspace(team_id, auth.uid())
  )
);
