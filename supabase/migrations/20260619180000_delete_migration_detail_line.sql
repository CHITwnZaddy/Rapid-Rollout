-- Atomic delete + per-section resequence for migration detail lines.
-- Mirrors delete_scoped_service_line: the app previously deleted the row and
-- then resequenced row_order with a per-row UPDATE loop, which could leave a
-- section half-resequenced on partial failure. This does both in one statement
-- block (one transaction), scoped to the deleted row's section.
create or replace function public.delete_migration_detail_line(
  p_proposal_id uuid,
  p_line_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_section text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to delete migration detail rows.';
  end if;

  select section into v_section
  from public.migration_detail_lines
  where id = p_line_id and proposal_id = p_proposal_id;

  if v_section is null then
    raise exception 'Migration detail row % was not found for proposal %', p_line_id, p_proposal_id;
  end if;

  delete from public.migration_detail_lines
  where id = p_line_id and proposal_id = p_proposal_id;

  with ordered as (
    select
      id,
      row_number() over (order by row_order, id) - 1 as next_row_order
    from public.migration_detail_lines
    where proposal_id = p_proposal_id and section = v_section
  )
  update public.migration_detail_lines as line
  set row_order = ordered.next_row_order
  from ordered
  where line.id = ordered.id;
end;
$$;

revoke execute on function public.delete_migration_detail_line(uuid, uuid) from public;
revoke execute on function public.delete_migration_detail_line(uuid, uuid) from anon;
grant execute on function public.delete_migration_detail_line(uuid, uuid) to authenticated;
