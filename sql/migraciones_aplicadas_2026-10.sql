-- =====================================================================
-- ChillerSystem — REGISTRO de los cambios hechos en la base (Supabase), octubre 2026
-- =====================================================================
-- IMPORTANTE: esto YA ESTÁ APLICADO en producción. No volver a correrlo allí.
-- Sirve como registro y para reconstruir la base en un entorno nuevo, ejecutando
-- las secciones EN ORDEN. Cada sección dice cuándo se hizo y por qué.
--
-- Pendiente (no incluido, ver README de seguridad): cerrar el acceso sin login en
-- informes, config_*, costos_trabajo, jornadas_tecnicos y las 5 tablas que hoy tienen
-- la política temporal "acceso_actual"; y restringir por rol más fino a los técnicos.
-- =====================================================================


-- ===== 1. Seguridad de acceso (fin de septiembre) ============================
-- Se eliminó el login legacy con contraseña en texto plano y se vació la columna.
-- (el código de la app ya no llama a esta función)
revoke execute on function public.login_usuario(text, text) from public, anon, authenticated;
update public.usuarios set password = '' where password is not null;   -- la columna es NOT NULL

-- Resetear contraseña: solo gerencia (antes lo permitía cualquiera con rol = 'admin')
create or replace function public.reset_password_admin(p_target_user_id uuid, p_new_password text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_caller_id        uuid;
  v_caller_jerarquia text;
  v_caller_activo    boolean;
  v_target_activo    boolean;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then raise exception 'No autenticado'; end if;

  select jerarquia, activo into v_caller_jerarquia, v_caller_activo
  from public.usuarios where auth_user_id = v_caller_id;
  if not found then raise exception 'Usuario llamante no registrado en sistema'; end if;

  if v_caller_jerarquia is distinct from 'gerencia' then
    raise exception 'Permiso denegado: solo gerencia puede resetear contraseñas';
  end if;
  if v_caller_activo is not true then raise exception 'Usuario llamante inactivo'; end if;
  if v_caller_id = p_target_user_id then
    raise exception 'No podés resetear tu propia contraseña con esta función';
  end if;

  select activo into v_target_activo from public.usuarios where auth_user_id = p_target_user_id;
  if not found then raise exception 'Usuario destino no encontrado en sistema'; end if;
  if v_target_activo is not true then raise exception 'Usuario destino inactivo'; end if;
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;
  if not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'Usuario destino no existe en auth';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_target_user_id;
end;
$function$;

-- Tabla reclamos: tenía RLS activado SIN ninguna regla (nadie podía registrar reclamos)
create policy solo_auth on public.reclamos for all to authenticated using (true) with check (true);


-- ===== 2. Módulo de Ventas (CRM) — 22/10/2026 =================================
-- (las 4 partes se corrieron en ese orden; arrancan vacías, sin datos)
-- ===== PARTE 1: funciones auxiliares =================================

-- Fecha de hoy en Argentina (el servidor trabaja en UTC: entre las 21:00
-- y las 24:00 hora local, current_date ya sería "mañana").
create or replace function public.crm_hoy()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Quién es el usuario que llama (id de public.usuarios, no el de Auth).
create or replace function public.crm_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from public.usuarios u
  where u.auth_user_id = auth.uid() and u.activo is true
  limit 1
$$;

create or replace function public.crm_jerarquia()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.jerarquia from public.usuarios u
  where u.auth_user_id = auth.uid() and u.activo is true
  limit 1
$$;

create or replace function public.crm_es_gerencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.crm_jerarquia() = 'gerencia', false) $$;

create or replace function public.crm_puede_usar_ventas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.crm_jerarquia() in ('gerencia', 'supervisor_admin', 'administrativo', 'vendedor'),
    false)
$$;

-- Estas funciones no deben poder llamarse sin estar logueado.
revoke all on function public.crm_usuario_id()        from public, anon;
revoke all on function public.crm_jerarquia()         from public, anon;
revoke all on function public.crm_es_gerencia()       from public, anon;
revoke all on function public.crm_puede_usar_ventas() from public, anon;
grant execute on function public.crm_usuario_id()        to authenticated;
grant execute on function public.crm_jerarquia()         to authenticated;
grant execute on function public.crm_es_gerencia()       to authenticated;
grant execute on function public.crm_puede_usar_ventas() to authenticated;


-- ===== PARTE 2: catálogos (vacíos) y prospectos ======================

create table if not exists public.crm_tipos_cliente (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

create table if not exists public.crm_tipos_servicio (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

create table if not exists public.crm_referidores (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

alter table public.crm_tipos_cliente  enable row level security;
alter table public.crm_tipos_servicio enable row level security;
alter table public.crm_referidores    enable row level security;

-- Catálogos: leen todos los que usan Ventas; solo gerencia los modifica.
create policy crm_tipos_cliente_leer on public.crm_tipos_cliente
  for select to authenticated using (public.crm_puede_usar_ventas());
create policy crm_tipos_cliente_escribir on public.crm_tipos_cliente
  for all to authenticated
  using (public.crm_es_gerencia()) with check (public.crm_es_gerencia());

create policy crm_tipos_servicio_leer on public.crm_tipos_servicio
  for select to authenticated using (public.crm_puede_usar_ventas());
create policy crm_tipos_servicio_escribir on public.crm_tipos_servicio
  for all to authenticated
  using (public.crm_es_gerencia()) with check (public.crm_es_gerencia());

create policy crm_referidores_leer on public.crm_referidores
  for select to authenticated using (public.crm_puede_usar_ventas());
create policy crm_referidores_escribir on public.crm_referidores
  for all to authenticated
  using (public.crm_es_gerencia()) with check (public.crm_es_gerencia());

-- Prospectos: empresa o persona que cotiza. Directorio compartido.
create table if not exists public.crm_prospectos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  tipo_cliente_id  uuid references public.crm_tipos_cliente(id),
  contacto_nombre  text,
  telefono         text,
  email            text,
  referido_por_id  uuid references public.crm_referidores(id),
  notas            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);

create trigger trg_crm_prospectos_updated_at
before update on public.crm_prospectos
for each row execute function public.crm_set_updated_at();

alter table public.crm_prospectos enable row level security;

create policy crm_prospectos_leer on public.crm_prospectos
  for select to authenticated using (public.crm_puede_usar_ventas());
create policy crm_prospectos_crear on public.crm_prospectos
  for insert to authenticated with check (public.crm_puede_usar_ventas());
create policy crm_prospectos_editar on public.crm_prospectos
  for update to authenticated
  using (public.crm_puede_usar_ventas()) with check (public.crm_puede_usar_ventas());
-- Borrar un prospecto borra en cascada sus oportunidades: solo gerencia.
create policy crm_prospectos_borrar on public.crm_prospectos
  for delete to authenticated using (public.crm_es_gerencia());


-- ===== PARTE 3: oportunidades, seguimientos y vistas =================

create table if not exists public.crm_oportunidades (
  id                         uuid primary key default gen_random_uuid(),
  prospecto_id               uuid not null references public.crm_prospectos(id) on delete cascade,
  numero_referencia          text,
  fecha_ingreso              date not null default public.crm_hoy(),
  tipo_servicio_id           uuid references public.crm_tipos_servicio(id),
  cantidad_equipos           numeric,
  monto_estimado             numeric,
  moneda                     text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  estado                     text not null default 'en_seguimiento'
                               check (estado in ('en_seguimiento', 'aceptado', 'rechazado', 'en_espera')),
  fecha_envio                date,
  fecha_cierre               date,
  fecha_facturacion          date,
  comision_monto             numeric,
  comision_liquidada         boolean not null default false,
  comentarios                text,
  responsable_id             uuid references public.usuarios(id),
  responsable_nombre_libre   text,
  proxima_fecha_seguimiento  date,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz,
  constraint crm_oportunidades_responsable_check
    check (responsable_id is not null or responsable_nombre_libre is not null)
);

create trigger trg_crm_oportunidades_updated_at
before update on public.crm_oportunidades
for each row execute function public.crm_set_updated_at();

-- fecha_cierre se completa sola al pasar a aceptado/rechazado/en_espera y
-- se borra si vuelve a en_seguimiento.
create or replace function public.crm_set_fecha_cierre()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado in ('aceptado', 'rechazado', 'en_espera') and new.fecha_cierre is null then
      new.fecha_cierre := public.crm_hoy();
    end if;
  elsif new.estado is distinct from old.estado then
    if new.estado in ('aceptado', 'rechazado', 'en_espera') then
      new.fecha_cierre := public.crm_hoy();
    else
      new.fecha_cierre := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_crm_oportunidades_fecha_cierre
before insert or update on public.crm_oportunidades
for each row execute function public.crm_set_fecha_cierre();

alter table public.crm_oportunidades enable row level security;

create policy crm_oportunidades_propia_o_gerencia on public.crm_oportunidades
  for all to authenticated
  using (
    public.crm_puede_usar_ventas()
    and (responsable_id = public.crm_usuario_id() or public.crm_es_gerencia())
  )
  with check (
    public.crm_puede_usar_ventas()
    and (responsable_id = public.crm_usuario_id() or public.crm_es_gerencia())
  );

create index if not exists crm_oportunidades_responsable_idx on public.crm_oportunidades (responsable_id);
create index if not exists crm_oportunidades_estado_idx      on public.crm_oportunidades (estado);
create index if not exists crm_oportunidades_prospecto_idx   on public.crm_oportunidades (prospecto_id);

-- Seguimientos: historial de contactos de cada oportunidad.
create table if not exists public.crm_seguimientos (
  id                         uuid primary key default gen_random_uuid(),
  oportunidad_id             uuid not null references public.crm_oportunidades(id) on delete cascade,
  fecha_contacto             date not null default public.crm_hoy(),
  tipo_contacto              text,
  nota                       text,
  proxima_fecha_seguimiento  date,
  usuario_id                 uuid references public.usuarios(id),
  usuario_nombre_libre       text,
  created_at                 timestamptz not null default now(),
  constraint crm_seguimientos_usuario_check
    check (usuario_id is not null or usuario_nombre_libre is not null)
);

-- La próxima fecha del seguimiento nuevo se copia a la oportunidad. Si el
-- seguimiento viene sin fecha, no se toca la que ya había.
create or replace function public.crm_actualizar_proxima_fecha()
returns trigger
language plpgsql
as $$
begin
  if new.proxima_fecha_seguimiento is not null then
    update public.crm_oportunidades
    set proxima_fecha_seguimiento = new.proxima_fecha_seguimiento
    where id = new.oportunidad_id;
  end if;
  return new;
end;
$$;

create trigger trg_crm_seguimientos_actualizar_proxima_fecha
after insert on public.crm_seguimientos
for each row execute function public.crm_actualizar_proxima_fecha();

alter table public.crm_seguimientos enable row level security;

-- Se mira de quién es la oportunidad, no quién cargó el seguimiento.
create policy crm_seguimientos_propio_o_gerencia on public.crm_seguimientos
  for all to authenticated
  using (
    public.crm_puede_usar_ventas()
    and (
      public.crm_es_gerencia()
      or exists (
        select 1 from public.crm_oportunidades o
        where o.id = crm_seguimientos.oportunidad_id
          and o.responsable_id = public.crm_usuario_id()
      )
    )
  )
  with check (
    public.crm_puede_usar_ventas()
    and (usuario_id = public.crm_usuario_id() or public.crm_es_gerencia())
    and (
      public.crm_es_gerencia()
      or exists (
        select 1 from public.crm_oportunidades o
        where o.id = crm_seguimientos.oportunidad_id
          and o.responsable_id = public.crm_usuario_id()
      )
    )
  );

create index if not exists crm_seguimientos_oportunidad_idx
  on public.crm_seguimientos (oportunidad_id, created_at);

-- "Última vez que cada usuario vio cada oportunidad" (para las novedades).
-- IMPORTANTE: usuario_id NO tiene foreign key a usuarios, a propósito. Con
-- esa FK, PostgREST encuentra dos caminos entre crm_oportunidades y usuarios
-- y todas las consultas con el nombre del responsable fallan con "more than
-- one relationship was found".
create table if not exists public.crm_vistas (
  oportunidad_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  usuario_id     uuid not null,
  last_viewed_at timestamptz not null default now(),
  primary key (oportunidad_id, usuario_id)
);

alter table public.crm_vistas enable row level security;

-- Cada uno ve y toca solo sus propias marcas, sin excepción para gerencia.
create policy crm_vistas_propia on public.crm_vistas
  for all to authenticated
  using (public.crm_puede_usar_ventas() and usuario_id = public.crm_usuario_id())
  with check (public.crm_puede_usar_ventas() and usuario_id = public.crm_usuario_id());


-- ===== PARTE 4: leads y cierre ========================================

create table if not exists public.crm_leads (
  id                      uuid primary key default gen_random_uuid(),
  prospecto_id            uuid not null references public.crm_prospectos(id) on delete cascade,
  responsable_id          uuid not null references public.usuarios(id),
  estado                  text not null default 'por_contactar'
                            check (estado in ('por_contactar', 'en_conversacion', 'convertido', 'sin_interes')),
  proxima_fecha_contacto  date,
  notas                   text,
  oportunidad_id          uuid references public.crm_oportunidades(id),
  fecha_conversion        date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz
);

create trigger trg_crm_leads_updated_at
before update on public.crm_leads
for each row execute function public.crm_set_updated_at();

create or replace function public.crm_set_fecha_conversion_lead()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'convertido' then
    if new.fecha_conversion is null then
      new.fecha_conversion := public.crm_hoy();
    end if;
  else
    new.fecha_conversion := null;
  end if;
  return new;
end;
$$;

create trigger trg_crm_leads_fecha_conversion
before insert or update on public.crm_leads
for each row execute function public.crm_set_fecha_conversion_lead();

alter table public.crm_leads enable row level security;

create policy crm_leads_propio_o_gerencia on public.crm_leads
  for all to authenticated
  using (
    public.crm_puede_usar_ventas()
    and (responsable_id = public.crm_usuario_id() or public.crm_es_gerencia())
  )
  with check (
    public.crm_puede_usar_ventas()
    and (responsable_id = public.crm_usuario_id() or public.crm_es_gerencia())
  );

create index if not exists crm_leads_responsable_idx on public.crm_leads (responsable_id);
create index if not exists crm_leads_estado_idx      on public.crm_leads (estado);
create index if not exists crm_leads_prospecto_idx   on public.crm_leads (prospecto_id);

create table if not exists public.crm_seguimientos_leads (
  id                      uuid primary key default gen_random_uuid(),
  lead_id                 uuid not null references public.crm_leads(id) on delete cascade,
  fecha_contacto          date not null default public.crm_hoy(),
  tipo_contacto           text,
  nota                    text,
  proxima_fecha_contacto  date,
  usuario_id              uuid not null references public.usuarios(id),
  created_at              timestamptz not null default now()
);

create or replace function public.crm_actualizar_proxima_fecha_lead()
returns trigger
language plpgsql
as $$
begin
  if new.proxima_fecha_contacto is not null then
    update public.crm_leads
    set proxima_fecha_contacto = new.proxima_fecha_contacto
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

create trigger trg_crm_seguimientos_leads_actualizar_proxima_fecha
after insert on public.crm_seguimientos_leads
for each row execute function public.crm_actualizar_proxima_fecha_lead();

alter table public.crm_seguimientos_leads enable row level security;

create policy crm_seguimientos_leads_propio_o_gerencia on public.crm_seguimientos_leads
  for all to authenticated
  using (
    public.crm_puede_usar_ventas()
    and (
      public.crm_es_gerencia()
      or exists (
        select 1 from public.crm_leads l
        where l.id = crm_seguimientos_leads.lead_id
          and l.responsable_id = public.crm_usuario_id()
      )
    )
  )
  with check (
    public.crm_puede_usar_ventas()
    and (usuario_id = public.crm_usuario_id() or public.crm_es_gerencia())
    and (
      public.crm_es_gerencia()
      or exists (
        select 1 from public.crm_leads l
        where l.id = crm_seguimientos_leads.lead_id
          and l.responsable_id = public.crm_usuario_id()
      )
    )
  );

create index if not exists crm_seguimientos_leads_lead_idx
  on public.crm_seguimientos_leads (lead_id);

-- Quien no está logueado no debe tocar nada de Ventas.
revoke all on table
  public.crm_tipos_cliente, public.crm_tipos_servicio, public.crm_referidores,
  public.crm_prospectos, public.crm_oportunidades, public.crm_seguimientos,
  public.crm_vistas, public.crm_leads, public.crm_seguimientos_leads
from anon;


-- ===== 3. Usuarios: solo gerencia crea, edita o borra usuarios ================
-- (necesita crm_es_gerencia(), creada en la sección 2). Antes cualquier usuario
-- logueado podía ascenderse a gerencia con una llamada a la API.
drop policy if exists solo_auth_w on public.usuarios;
create policy usuarios_insertar_gerencia on public.usuarios
  for insert to authenticated with check (public.crm_es_gerencia());
create policy usuarios_editar_gerencia on public.usuarios
  for update to authenticated using (public.crm_es_gerencia()) with check (public.crm_es_gerencia());
create policy usuarios_borrar_gerencia on public.usuarios
  for delete to authenticated using (public.crm_es_gerencia());


-- ===== 4. Ventas: los agentes de ventas pueden AGREGAR valores a los catálogos ==
create policy crm_tipos_cliente_crear on public.crm_tipos_cliente
  for insert to authenticated with check (public.crm_puede_usar_ventas());
create policy crm_tipos_servicio_crear on public.crm_tipos_servicio
  for insert to authenticated with check (public.crm_puede_usar_ventas());
create policy crm_referidores_crear on public.crm_referidores
  for insert to authenticated with check (public.crm_puede_usar_ventas());


-- ===== 5. Ventas: borrar una oportunidad que vino de un lead libera al lead ====
-- (sin esto la base rechazaba borrar una oportunidad convertida desde un lead)
alter table public.crm_leads drop constraint if exists crm_leads_oportunidad_id_fkey;
alter table public.crm_leads
  add constraint crm_leads_oportunidad_id_fkey
  foreign key (oportunidad_id) references public.crm_oportunidades(id) on delete set null;

create or replace function public.crm_liberar_leads_de_oportunidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crm_leads
  set oportunidad_id = null,
      estado = case when estado = 'convertido' then 'en_conversacion' else estado end
  where oportunidad_id = old.id;
  return old;
end;
$$;
revoke all on function public.crm_liberar_leads_de_oportunidad() from public, anon, authenticated;

create trigger trg_crm_oportunidades_liberar_leads
before delete on public.crm_oportunidades
for each row execute function public.crm_liberar_leads_de_oportunidad();


-- ===== 6. Apertura: el agente de ventas no accede a la app vieja ===============
-- Política RESTRICTIVA en cada tabla de la app: solo pasa el personal interno activo
-- (gerencia, supervisión, administrativo, técnico). No cambia lo que ya pueden hacer ellos.
create or replace function public.app_es_personal_interno()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.crm_jerarquia() in ('gerencia', 'supervisor_admin', 'administrativo', 'tecnico'), false)
$$;
revoke all on function public.app_es_personal_interno() from public, anon;
grant execute on function public.app_es_personal_interno() to authenticated;

-- Estas 5 tablas no tenían RLS. Se activa dejando el acceso IGUAL que antes (incluido el
-- acceso sin login, porque la app se conecta a Realtime solo con la clave pública).
-- PENDIENTE: cerrar el acceso sin login (reemplazar "acceso_actual" por reglas por rol).
alter table public.cronograma_config    enable row level security;
alter table public.cronograma_contratos enable row level security;
alter table public.cronograma_trabajos  enable row level security;
alter table public.notificaciones       enable row level security;
alter table public.tareas_configuracion enable row level security;
create policy acceso_actual on public.cronograma_config    for all to anon, authenticated using (true) with check (true);
create policy acceso_actual on public.cronograma_contratos for all to anon, authenticated using (true) with check (true);
create policy acceso_actual on public.cronograma_trabajos  for all to anon, authenticated using (true) with check (true);
create policy acceso_actual on public.notificaciones       for all to anon, authenticated using (true) with check (true);
create policy acceso_actual on public.tareas_configuracion for all to anon, authenticated using (true) with check (true);

create policy solo_personal_interno on public.clientes               as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.equipos                as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.intervenciones         as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.presupuestos           as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.preventivos_aprobacion as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.tareas_realizadas      as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.informes               as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.config_horas_hombre    as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.config_impuestos       as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.costos_trabajo         as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.jornadas_tecnicos      as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.reclamos               as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.cronograma_config      as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.cronograma_contratos   as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.cronograma_trabajos    as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.notificaciones         as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));
create policy solo_personal_interno on public.tareas_configuracion   as restrictive for all to authenticated using ((select public.app_es_personal_interno())) with check ((select public.app_es_personal_interno()));

-- Tabla usuarios: el agente de ventas solo ve su propia fila y los nombres de quienes
-- escribieron seguimientos en SUS oportunidades y leads (el CRM los muestra).
create policy usuarios_vendedor_acotado on public.usuarios
  as restrictive
  for select to authenticated
  using (
    (select public.app_es_personal_interno())
    or id = (select public.crm_usuario_id())
    or exists (select 1 from public.crm_seguimientos s where s.usuario_id = usuarios.id)
    or exists (select 1 from public.crm_seguimientos_leads sl where sl.usuario_id = usuarios.id)
  );


-- ===== 7. Ventas: acceso por persona (casilla "Acceso a Ventas") ================
-- Reemplaza la versión de crm_puede_usar_ventas() de la sección 2. Gerencia y agentes de ventas
-- siempre; supervisión y administrativos solo con usuarios.acceso_ventas = true; técnicos nunca.
alter table public.usuarios add column if not exists acceso_ventas boolean not null default false;
create or replace function public.crm_puede_usar_ventas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.jerarquia in ('gerencia', 'vendedor')
        or (u.jerarquia in ('supervisor_admin', 'administrativo') and u.acceso_ventas is true)
    from public.usuarios u
    where u.auth_user_id = auth.uid() and u.activo is true
    limit 1
  ), false)
$$;
-- Acceso dado a Fernanda: update usuarios set acceso_ventas = true where usuario = 'fernanda';

-- ===== 8. Ventas: casilla Compulsa (licitación o comparación de precios) ========
alter table public.crm_oportunidades add column if not exists es_compulsa boolean not null default false;

-- ===== 9. Presupuestos: precio principal original (opción "Ambas") ==============
-- Guarda el precio y la moneda del principal la primera vez que se elige una opción, para no sumar dos veces al aprobar de nuevo y para restaurarlo al retroceder.
alter table public.presupuestos
  add column if not exists precio_principal_original numeric,
  add column if not exists moneda_principal_original text;
