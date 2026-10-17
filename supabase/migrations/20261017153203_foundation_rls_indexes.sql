create index email_outbox_school_idx on private.email_outbox(school_id);
create index membership_roles_role_idx on public.membership_roles(role_code);
create index membership_roles_school_membership_idx on public.membership_roles(school_id,membership_id);
alter policy profiles_self_read on public.profiles using(id=(select auth.uid()) and (select private.live_session()));
alter policy membership_self_or_admin on public.school_memberships using((select private.account_ready()) and (user_id=(select auth.uid()) or private.has_school_role(school_id,'admin')));
alter policy membership_roles_self_or_admin on public.membership_roles using((select private.account_ready()) and exists(select 1 from public.school_memberships m where m.id=membership_id and m.school_id=membership_roles.school_id and (m.user_id=(select auth.uid()) or private.has_school_role(m.school_id,'admin'))));
