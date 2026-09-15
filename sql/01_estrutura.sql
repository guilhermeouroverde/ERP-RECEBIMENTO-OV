-- OURO VERDE: persistence adapter for the existing JSON data model.
-- Run once in a SEPARATE Supabase test project. Does not import ERP data.
-- Functions are restricted to service_role; browser roles have no access.
begin;
create table if not exists public.ov_state (
  id text primary key check (id in ('main','audit')),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists public.ov_credentials (
  id bigint primary key,
  username text not null unique,
  name text not null,
  role text not null,
  active boolean not null default true,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.ov_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id bigint not null references public.ov_credentials(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ov_sessions_expiry on public.ov_sessions(expires_at);
create table if not exists public.ov_auth_limits (
  key_hash text not null,
  window_start bigint not null,
  attempts integer not null default 0,
  primary key(key_hash,window_start)
);
create table if not exists public.ov_changes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor bigint,
  action text not null,
  main_revision bigint,
  audit_revision bigint
);
alter table public.ov_state enable row level security;
alter table public.ov_credentials enable row level security;
alter table public.ov_sessions enable row level security;
alter table public.ov_auth_limits enable row level security;
alter table public.ov_changes enable row level security;
revoke all on public.ov_state,public.ov_credentials,public.ov_sessions,public.ov_auth_limits,public.ov_changes from public,anon,authenticated;
revoke all on sequence public.ov_changes_id_seq from public,anon,authenticated;

create or replace function public.ov_status() returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('initialized',
    (select count(*)=2 from public.ov_state) and
    exists(select 1 from public.ov_credentials where active and role='admin'),
    'schema_version',1);
$$;

create or replace function public.ov_initialize(p_main jsonb,p_audit jsonb,p_credentials jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; v_users jsonb;
begin
  perform pg_advisory_xact_lock(357352);
  if exists(select 1 from public.ov_state) or exists(select 1 from public.ov_credentials) then
    raise exception 'Banco ja inicializado. Importacao repetida bloqueada.';
  end if;
  if jsonb_typeof(p_main) is distinct from 'object'
     or jsonb_typeof(p_main->'transactions') is distinct from 'array'
     or jsonb_typeof(p_main->'producers') is distinct from 'array'
     or jsonb_typeof(p_main->'users') is distinct from 'array'
     or jsonb_typeof(p_audit) is distinct from 'object'
     or jsonb_typeof(p_credentials) is distinct from 'array' then
    raise exception 'Estrutura de origem invalida.';
  end if;
  if jsonb_path_exists(p_main,'$.**.password') or jsonb_path_exists(p_audit,'$.**.password') then
    raise exception 'Senhas em texto nao sao permitidas nos dados operacionais.';
  end if;
  v_users=p_main->'users';
  for c in select value from jsonb_array_elements(p_credentials) loop
    if c->>'password_hash' !~ '^scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$'
       or c->>'username' !~ '^[a-z0-9_.-]{3,80}$' then raise exception 'Credencial invalida.'; end if;
    if not exists(select 1 from jsonb_array_elements(v_users) u where (u->>'id')::bigint=(c->>'id')::bigint) then
      raise exception 'Credencial sem usuario na base original.';
    end if;
    insert into public.ov_credentials(id,username,name,role,active,password_hash)
    values ((c->>'id')::bigint,c->>'username',c->>'name',c->>'role',coalesce((c->>'active')::boolean,true),c->>'password_hash');
  end loop;
  if not exists(select 1 from public.ov_credentials where active and role='admin') then
    raise exception 'E necessario um administrador ativo.';
  end if;
  if exists(select 1 from jsonb_array_elements(v_users) u where coalesce((u->>'active')::boolean,true)
    and not exists(select 1 from public.ov_credentials c where c.id=(u->>'id')::bigint)) then
    raise exception 'Usuario ativo sem nova senha.';
  end if;
  insert into public.ov_state(id,payload) values ('main',p_main),('audit',p_audit);
  insert into public.ov_changes(action,main_revision,audit_revision) values('IMPORTACAO_INICIAL_SEM_RECALCULO',1,1);
  return jsonb_build_object('ok',true,'producers',jsonb_array_length(p_main->'producers'),'transactions',jsonb_array_length(p_main->'transactions'));
end;
$$;

create or replace function public.ov_read_state(p_include_audit boolean default false) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'main',(select payload from public.ov_state where id='main'),
    'main_revision',(select revision from public.ov_state where id='main'),
    'audit',case when p_include_audit then (select payload from public.ov_state where id='audit') else null end,
    'audit_revision',case when p_include_audit then (select revision from public.ov_state where id='audit') else null end);
$$;

create or replace function public.ov_commit_state(
  p_expected_main_revision bigint,p_expected_audit_revision bigint,
  p_main jsonb,p_audit jsonb,p_actor bigint,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.ov_state%rowtype; a public.ov_state%rowtype;
begin
  select * into m from public.ov_state where id='main' for update;
  select * into a from public.ov_state where id='audit' for update;
  if m.id is null or a.id is null then raise exception 'Banco nao inicializado.'; end if;
  if m.revision is distinct from p_expected_main_revision
     or (p_audit is not null and a.revision is distinct from p_expected_audit_revision) then
    return jsonb_build_object('ok',false,'conflict',true);
  end if;
  if not exists(select 1 from public.ov_credentials where id=p_actor and active) then raise exception 'Usuario invalido.';end if;
  if p_main is not null then
    if jsonb_typeof(p_main->'transactions') is distinct from 'array'
       or jsonb_typeof(p_main->'producers') is distinct from 'array'
       or p_main->'users' is distinct from m.payload->'users'
       or jsonb_path_exists(p_main,'$.**.password') then raise exception 'Atualizacao invalida.';end if;
    update public.ov_state set payload=p_main,revision=revision+1,updated_at=now() where id='main' returning * into m;
  end if;
  if p_audit is not null then
    if jsonb_typeof(p_audit) is distinct from 'object' or jsonb_path_exists(p_audit,'$.**.password') then raise exception 'Auditoria invalida.';end if;
    update public.ov_state set payload=p_audit,revision=revision+1,updated_at=now() where id='audit' returning * into a;
  end if;
  insert into public.ov_changes(actor,action,main_revision,audit_revision)
    values(p_actor,left(p_action,180),m.revision,a.revision);
  return jsonb_build_object('ok',true,'main_revision',m.revision,'audit_revision',a.revision);
end;
$$;

create or replace function public.ov_login_user(p_username text) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('id',id,'username',username,'name',name,'role',role,'active',active,'password_hash',password_hash)
 from public.ov_credentials where username=p_username;
$$;
create or replace function public.ov_session_create(p_user_id bigint,p_token_hash text,p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_expires_at<=now() or p_expires_at>now()+interval '12 hours 1 minute' then raise exception 'Prazo de sessao invalido.';end if;
 if not exists(select 1 from public.ov_credentials where id=p_user_id and active) then raise exception 'Usuario inativo.';end if;
 delete from public.ov_sessions where expires_at<=now();
 insert into public.ov_sessions(token_hash,user_id,expires_at) values(p_token_hash,p_user_id,p_expires_at);
 return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.ov_session_user(p_token_hash text) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'username',c.username,'name',c.name,'role',c.role)
 from public.ov_credentials c join public.ov_sessions s on s.user_id=c.id
 where s.token_hash=p_token_hash and s.expires_at>now() and c.active;
$$;
create or replace function public.ov_session_delete(p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 delete from public.ov_sessions where token_hash=p_token_hash;
 return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.ov_reset_password(p_username text,p_password_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid bigint;
begin
 if p_password_hash !~ '^scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$' then raise exception 'Hash invalido.';end if;
 update public.ov_credentials set password_hash=p_password_hash,updated_at=now() where username=p_username returning id into uid;
 if uid is null then raise exception 'Usuario nao encontrado.';end if;
 delete from public.ov_sessions where user_id=uid;
 insert into public.ov_changes(actor,action) values(uid,'REDEFINICAO_LOCAL_DE_SENHA');
 return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.ov_auth_allow(p_keys text[],p_limits integer[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w bigint=floor(extract(epoch from now())/900); item record; n integer; permitted boolean=true;
begin
 if cardinality(p_keys) is distinct from 2 or cardinality(p_limits) is distinct from 2 then raise exception 'Limites invalidos.';end if;
 delete from public.ov_auth_limits where window_start<w-96;
 for item in select * from unnest(p_keys,p_limits) as x(k,lim) order by k loop
   if item.k !~ '^[0-9a-f]{64}$' or item.lim<1 or item.lim>1000 then raise exception 'Limite invalido.';end if;
   insert into public.ov_auth_limits(key_hash,window_start,attempts) values(item.k,w,1)
     on conflict(key_hash,window_start) do update set attempts=public.ov_auth_limits.attempts+1 returning attempts into n;
   if n>item.lim then permitted=false;end if;
 end loop;
 return jsonb_build_object('allowed',permitted);
end;
$$;

-- Restrict ALL adapter functions, including future replacements under these names.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('ov_status','ov_initialize','ov_read_state','ov_commit_state','ov_login_user','ov_session_create','ov_session_user','ov_session_delete','ov_reset_password','ov_auth_allow') loop
   execute format('revoke all on function %s from public, anon, authenticated', f.signature);
   execute format('grant execute on function %s to service_role', f.signature);
 end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
