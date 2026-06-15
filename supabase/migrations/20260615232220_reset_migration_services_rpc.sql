create or replace function public.reset_migration_services(p_proposal_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to clear migration services.';
  end if;

  update public.migration_config
  set
    num_projects = 0,
    hrs_per_import = 0.75,
    lines_per_import_file = 2550,
    is_effort_included = false,
    is_workshop_included = false,
    complexity_factor = 1.0,
    sr_im_trips = 0,
    pm_trips = 0,
    doc_avg_mb_per_project = 150000,
    doc_mb_per_hour = 15000,
    core_requirements_hrs = 32,
    core_migration_plan_hrs = 32,
    core_validation_hrs = 20,
    core_final_qa_hrs = 16,
    core_pm_oversight_hrs = 20,
    computed_total_cost = 0,
    updated_at = now()
  where proposal_id = p_proposal_id;

  if not found then
    raise exception 'Missing migration_config row for proposal %', p_proposal_id;
  end if;

  delete from public.migration_detail_lines
  where proposal_id = p_proposal_id;

  insert into public.migration_detail_lines (
    proposal_id,
    section,
    label,
    quantity,
    items_per_object,
    total_line_items,
    row_order
  )
  values
    (p_proposal_id, 'project', 'Project Info/Detail', 0, 0, 0, 0),
    (p_proposal_id, 'project', 'Schedules', 0, 0, 0, 1),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 0),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 1),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 2),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 3),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 4),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 5),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 6),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 7),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 8),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 9),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 10),
    (p_proposal_id, 'cost', 'Budgets', 1, 0, 0, 0),
    (p_proposal_id, 'cost', 'Commitments', 0, 0, 0, 1),
    (p_proposal_id, 'cost', 'Commitment Changes', 0, 0, 0, 2),
    (p_proposal_id, 'cost', 'Commitment Invoices', 0, 0, 0, 3),
    (p_proposal_id, 'cost', 'General Invoices', 0, 0, 0, 4),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 5),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 6),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 7),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 8);
end;
$$;

revoke execute on function public.reset_migration_services(uuid) from public;
revoke execute on function public.reset_migration_services(uuid) from anon;
grant execute on function public.reset_migration_services(uuid) to authenticated;
