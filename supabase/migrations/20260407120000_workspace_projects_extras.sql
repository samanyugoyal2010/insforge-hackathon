-- Run in Supabase SQL editor (or via CLI) so workspace sync can store mock orders + UI prefs.
alter table public.node0_workspace_projects
  add column if not exists extras jsonb;

comment on column public.node0_workspace_projects.extras is
  'Per-project JSON: mockOrders, projectTool, cadTechnical, pcbTechnical, etc.';
