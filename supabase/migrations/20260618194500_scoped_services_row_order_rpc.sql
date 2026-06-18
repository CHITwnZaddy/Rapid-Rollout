create or replace function public.delete_scoped_service_line(
  p_proposal_id uuid,
  p_line_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to delete scoped service lines.';
  end if;

  delete from public.scoped_services
  where id = p_line_id
    and proposal_id = p_proposal_id;

  if not found then
    raise exception 'Scoped service line % was not found for proposal %', p_line_id, p_proposal_id;
  end if;

  with ordered as (
    select
      id,
      row_number() over (order by row_order, id) - 1 as next_row_order
    from public.scoped_services
    where proposal_id = p_proposal_id
  )
  update public.scoped_services as scoped_service
  set row_order = ordered.next_row_order
  from ordered
  where scoped_service.id = ordered.id;
end;
$$;

revoke execute on function public.delete_scoped_service_line(uuid, uuid) from public;
revoke execute on function public.delete_scoped_service_line(uuid, uuid) from anon;
grant execute on function public.delete_scoped_service_line(uuid, uuid) to authenticated;
