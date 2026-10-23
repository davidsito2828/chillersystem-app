// ══════════════════════════════════════════
//  VENTAS — Oportunidades: Tablero (kanban) y Nueva oportunidad
//  Se carga con defer después de ventas.js y registra sus pantallas en window.Ventas.
//  Reutiliza las globales de index.html: api, escapeHtml, showToast, exigirPermiso,
//  esGerencia, puedeVerModulo, usuarioActual.
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V){console.error('[ventas] ventas-oportunidades.js necesita ventas.js cargado antes');return;}
  const {fmtFecha,hoyAR,fmtMonto,ESTADOS,etiquetaEstado,nombreResponsable,nombreUsuarioSeguimiento,tiempoRelativo,mensajeError}=V.util;
  const C=V.comun;

  const MSG_PERMISO_OP='No tenés permiso para modificar esta oportunidad';

  // ── Funciones puras del tablero (probadas en Node) ──
  function filtrarOportunidades(lista,{responsable='',tipoCliente=''}={}){
    return (lista||[]).filter(o=>
      (!responsable||o.responsable_id===responsable)&&
      (!tipoCliente||(!!o.crm_prospectos&&o.crm_prospectos.tipo_cliente_id===tipoCliente)));
  }
  function agruparPorEstado(lista){
    const grupos={};
    ESTADOS.forEach(e=>{grupos[e.valor]=[];});
    (lista||[]).forEach(o=>{if(grupos[o.estado]) grupos[o.estado].push(o);});
    return grupos;
  }

  // Novedades (igual que utils/novedades.ts del original): cuenta todo seguimiento (manual o
  // automático de cambio de estado, sea de quien sea, incluidos los propios) creado después de
  // la última vez que este usuario abrió la ficha. Sin vista registrada, cuentan todos.
  // Devuelve Map oportunidad_id → {oportunidadId, cantidad, ultimo}.
  function calcularNovedades({seguimientos=[],vistas=[]}={}){
    const vistoPor=new Map((vistas||[]).map(v=>[v.oportunidad_id,v.last_viewed_at]));
    const novedades=new Map();
    for(const s of (seguimientos||[])){
      const ultimaVista=vistoPor.get(s.oportunidad_id);
      if(ultimaVista&&new Date(s.created_at)<=new Date(ultimaVista)) continue;
      const existente=novedades.get(s.oportunidad_id);
      if(!existente) novedades.set(s.oportunidad_id,{oportunidadId:s.oportunidad_id,cantidad:1,ultimo:s});
      else{
        existente.cantidad+=1;
        if(new Date(s.created_at)>new Date(existente.ultimo.created_at)) existente.ultimo=s;
      }
    }
    return novedades;
  }
  // Ítems del panel: solo oportunidades cargadas (visibles por RLS), la más reciente primero
  function itemsNovedades(novedades,oportunidades){
    const porId=new Map((oportunidades||[]).map(o=>[o.id,o]));
    return [...novedades.values()]
      .map(n=>{
        const o=porId.get(n.oportunidadId);
        if(!o) return null;
        return {oportunidadId:n.oportunidadId,prospectoNombre:(o.crm_prospectos&&o.crm_prospectos.nombre)||'-',
          cantidad:n.cantidad,usuario:nombreUsuarioSeguimiento(n.ultimo),nota:n.ultimo.nota,creadoEn:n.ultimo.created_at};
      })
      .filter(Boolean)
      .sort((a,b)=>new Date(b.creadoEn)-new Date(a.creadoEn));
  }

  // Cambio de estado compartido (tablero y ficha): PATCH con return=representation; si RLS no
  // devuelve la fila, lanza error. Devuelve {fila, seguimiento}: seguimiento es la promesa del
  // registro automático, que nunca rechaza (si falla, solo console.warn).
  async function cambiarEstado(id,anterior,nuevo){
    if(!ESTADOS.some(e=>e.valor===nuevo)) throw new Error('Estado inválido');
    const filas=await api('crm_oportunidades?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({estado:nuevo})});
    const fila=Array.isArray(filas)?filas[0]:null;
    if(!fila) throw new Error('row-level security');
    const seguimiento=api('crm_seguimientos',{method:'POST',body:JSON.stringify({
      oportunidad_id:id,
      nota:`Estado cambiado de "${etiquetaEstado(anterior)}" a "${etiquetaEstado(nuevo)}".`,
      usuario_id:usuarioActual.id
    })}).catch(e=>{console.warn('[ventas] No se pudo registrar el seguimiento del cambio de estado',e);});
    return {fila,seguimiento};
  }

  C.agregarCss(`
.vt-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;}
.vt-filtros{display:flex;flex-wrap:wrap;gap:8px;}
.vt-filtros .form-select{width:auto;min-width:200px;}
.vt-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;align-items:flex-start;}
.vt-col{flex:1;min-width:260px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px;transition:background .15s,box-shadow .15s;}
.vt-col.vt-col-over{background:#eff6ff;box-shadow:0 0 0 2px var(--accent) inset;}
.vt-col-head{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin-bottom:10px;}
.vt-col-vacia{font-size:12px;color:var(--text-muted);}
.vt-card{position:relative;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:10px;margin-bottom:8px;}
.vt-card.vt-dragging{opacity:.4;}
.vt-card.vt-moviendo{opacity:.7;}
/* Agarradera chica: única zona con touch-action:none; el resto de la tarjeta deja desplazar la página */
.vt-drag{position:absolute;top:2px;right:2px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;color:var(--text-muted);border-radius:6px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;}
.vt-drag:hover{background:var(--bg3);color:var(--text);}
.vt-drag:active{cursor:grabbing;}
.vt-card-info{padding-right:34px;}
.vt-ghost{position:fixed;z-index:9999;pointer-events:none;margin:0;box-shadow:0 10px 24px rgba(15,23,42,.18);cursor:grabbing;opacity:.95;}
.vt-card-tit{font-size:13px;font-weight:600;color:var(--text);overflow-wrap:anywhere;}
.vt-card-sub{font-size:11px;color:var(--text-dim);margin-top:2px;}
.vt-card-monto{font-size:13px;font-weight:700;color:var(--accent);margin-top:6px;}
.vt-card-pie{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--text-dim);margin-top:6px;}
.vt-card-acc{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);}
.vt-link{flex:1;font-size:11px;font-weight:600;color:var(--accent);background:none;border:0;padding:0;font-family:inherit;cursor:pointer;text-align:left;}
.vt-link:hover{text-decoration:underline;}
.vt-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#e11d48;margin-right:6px;vertical-align:middle;flex-shrink:0;}
.vt-nov{background:#fffbeb;border:1px solid #fde68a;border-radius:var(--r);padding:12px;margin-bottom:14px;}
.vt-nov-tit{font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px;}
.vt-nov-lista{display:flex;flex-direction:column;gap:6px;}
.vt-nov-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;font-family:inherit;font-size:13px;color:var(--text);background:rgba(255,255,255,.6);border:0;border-radius:6px;padding:8px 10px;cursor:pointer;}
.vt-nov-item:hover{background:#fff;}
.vt-nov-item strong{font-weight:600;}
.vt-nov-cuando{font-size:11px;color:#b45309;white-space:nowrap;}
.vt-mover{width:100%;font-size:11px;padding:4px 6px;}
.vt-np{max-width:900px;}
.vt-h2{font-size:16px;font-weight:700;color:var(--text);margin:10px 0 14px;}
.vt-np-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin:14px 0;}
.vt-np-sel{display:flex;align-items:center;gap:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:var(--r);padding:8px 12px;}
.vt-np-sel span{flex:1;font-size:13px;font-weight:600;color:var(--text);}
.vt-np-modos{display:flex;gap:6px;margin-bottom:8px;}
.vt-np-nuevo{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;align-items:start;}
.vt-np-nuevo .vt-ancho{grid-column:1/-1;}
.vt-np-fijo{padding:8px 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg3);font-size:13px;color:var(--text-dim);}
.vt-bp{position:relative;}
.vt-bp-lista{position:absolute;z-index:20;left:0;right:0;margin-top:4px;max-height:240px;overflow-y:auto;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 8px 20px rgba(15,23,42,.12);}
.vt-bp-item{display:block;width:100%;text-align:left;padding:10px 12px;font-size:13px;color:var(--text);background:none;border:0;border-bottom:1px solid var(--border);cursor:pointer;font-family:inherit;}
.vt-bp-item:last-child{border-bottom:0;}
.vt-bp-item:hover{background:#eff6ff;}
`);

  // ══════════════════════════════════════════
  //  PANTALLA: TABLERO
  // ══════════════════════════════════════════
  const tb={cargando:false,error:'',oportunidades:[],responsables:[],novedades:new Map(),filtroResp:'',filtroTipo:'',moviendo:new Set(),drag:null};

  // Las novedades no son críticas: si fallan, el tablero se muestra igual sin panel
  function cargarNoCritico(ruta,paginado=false){
    return (paginado?C.cargarTodo(ruta):api(ruta)).then(r=>Array.isArray(r)?r:[]).catch(e=>{console.warn('[ventas] No se pudo cargar '+ruta.split('?')[0],e);return [];});
  }

  async function entrarTablero(){
    tb.cargando=true;tb.error='';V.repintar();
    try{
      const [ops,resp,,seguimientos,vistas]=await Promise.all([
        C.cargarTodo('crm_oportunidades?select=*,crm_prospectos(id,nombre,tipo_cliente_id,contacto_nombre,telefono),crm_tipos_servicio(nombre),usuarios(nombre)&order=created_at.desc,id.asc'),
        esGerencia()?C.cargarResponsables():Promise.resolve([]),
        C.cargarCatalogosActivos(['crm_tipos_cliente']),
        cargarNoCritico('crm_seguimientos?select=oportunidad_id,usuario_id,usuario_nombre_libre,tipo_contacto,nota,created_at,usuarios(nombre)&order=created_at.desc,id.asc',true),
        cargarNoCritico('crm_vistas?select=oportunidad_id,last_viewed_at&usuario_id=eq.'+encodeURIComponent(usuarioActual.id))
      ]);
      tb.oportunidades=Array.isArray(ops)?ops:[];
      tb.responsables=resp;
      tb.novedades=calcularNovedades({seguimientos,vistas});
    }catch(e){
      console.error('[ventas] Error cargando el tablero',e);
      tb.error='No se pudo cargar el tablero: '+mensajeError(e);
    }finally{
      tb.cargando=false;
    }
    if(enVista('tablero')) V.repintar();
  }

  function enVista(id){
    const b=C.cuerpo();
    return !!b&&!!b.querySelector('[data-vt-pantalla="'+id+'"]');
  }

  function htmlTablero(){
    if(tb.cargando&&!tb.oportunidades.length) return `<div data-vt-pantalla="tablero"><div class="vt-msg">Cargando…</div></div>`;
    if(tb.error) return `<div data-vt-pantalla="tablero"><div class="vt-msg vt-error">${escapeHtml(tb.error)}</div></div>`;
    const filtroResp=esGerencia()?tb.filtroResp:'';
    const grupos=agruparPorEstado(filtrarOportunidades(tb.oportunidades,{responsable:filtroResp,tipoCliente:tb.filtroTipo}));
    const optResp=tb.responsables.map(r=>`<option value="${escapeHtml(r.id)}"${r.id===tb.filtroResp?' selected':''}>${escapeHtml(r.nombre)}</option>`).join('');
    const optTipo=C.catalogo('crm_tipos_cliente').map(t=>`<option value="${escapeHtml(t.id)}"${t.id===tb.filtroTipo?' selected':''}>${escapeHtml(t.nombre)}</option>`).join('');
    return `
<div data-vt-pantalla="tablero">
  ${htmlPanelNovedades()}
  <div class="vt-toolbar">
    <div class="vt-filtros">
      ${esGerencia()?`<select class="form-select" data-vt-filtro="resp"><option value="">Todos los responsables</option>${optResp}</select>`:''}
      <select class="form-select" data-vt-filtro="tipo"><option value="">Todos los tipos de cliente</option>${optTipo}</select>
    </div>
    <button type="button" class="btn-primary" data-vt-ir="nueva">+ Nueva oportunidad</button>
  </div>
  <div class="vt-board">
    ${ESTADOS.map(e=>`
    <div class="vt-col" data-estado="${escapeHtml(e.valor)}">
      <div class="vt-col-head">${escapeHtml(e.etiqueta)} (${grupos[e.valor].length})</div>
      ${grupos[e.valor].length?grupos[e.valor].map(htmlTarjeta).join(''):'<p class="vt-col-vacia">Sin oportunidades</p>'}
    </div>`).join('')}
  </div>
</div>`;
  }

  // Panel ámbar de novedades; sin novedades no se muestra nada
  function htmlPanelNovedades(){
    const items=itemsNovedades(tb.novedades,tb.oportunidades);
    if(!items.length) return '';
    return `
  <div class="vt-nov">
    <div class="vt-nov-tit">Novedades (${items.length})</div>
    <div class="vt-nov-lista">${items.map(it=>`
      <button type="button" class="vt-nov-item" data-vt-ficha="${escapeHtml(it.oportunidadId)}">
        <span><strong>${escapeHtml(it.prospectoNombre)}</strong> — ${escapeHtml(it.usuario)}: ${escapeHtml(it.cantidad>1?it.cantidad+' novedades nuevas':(it.nota==null?'agregó un seguimiento':it.nota))}</span>
        <span class="vt-nov-cuando">${escapeHtml(tiempoRelativo(it.creadoEn))}</span>
      </button>`).join('')}
    </div>
  </div>`;
  }

  function htmlTarjeta(o){
    const p=o.crm_prospectos;
    const novedad=tb.novedades.has(o.id);
    const monto=o.monto_estimado==null?'-':fmtMonto(o.monto_estimado,o.moneda||'ARS');
    const opts=ESTADOS.filter(e=>e.valor!==o.estado).map(e=>`<option value="${escapeHtml(e.valor)}">${escapeHtml(e.etiqueta)}</option>`).join('');
    const moviendo=tb.moviendo.has(o.id);
    return `
<div class="vt-card${moviendo?' vt-moviendo':''}" data-op-id="${escapeHtml(o.id)}">
  <span class="vt-drag" data-vt-drag title="Arrastrá para cambiar de estado" aria-hidden="true">⠿</span>
  <div class="vt-card-info">
    <div class="vt-card-tit">${novedad?'<span class="vt-dot" title="Tiene un seguimiento nuevo que todavía no viste"></span>':''}${escapeHtml(p&&p.nombre||'-')}</div>
    <div class="vt-card-sub">${escapeHtml(o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre||'Sin tipo de servicio')}</div>
    <div class="vt-card-monto">${escapeHtml(monto)}</div>
    <div class="vt-card-pie"><span>${escapeHtml(fmtFecha(o.proxima_fecha_seguimiento))}</span><span>${escapeHtml(nombreResponsable(o))}</span></div>
  </div>
  <div class="vt-card-acc">
    <button type="button" class="vt-link" data-vt-ficha="${escapeHtml(o.id)}">Ver detalle →</button>
    ${C.htmlBotonWhatsApp(p&&p.telefono)}
    <select class="form-select vt-mover" data-vt-mover aria-label="Mover a otra columna"${moviendo?' disabled':''}>
      <option value="">Mover a…</option>${opts}
    </select>
  </div>
</div>`;
  }

  // Tablero: actualización optimista sobre cambiarEstado; revierte si el PATCH falla o RLS no devuelve la fila.
  async function moverOportunidad(id,nuevo){
    const op=tb.oportunidades.find(o=>o.id===id);
    if(!op||op.estado===nuevo||tb.moviendo.has(id)) return;
    if(!ESTADOS.some(e=>e.valor===nuevo)) return;
    const anterior=op.estado;
    op.estado=nuevo;
    tb.moviendo.add(id);
    V.repintar();
    let res=null;
    try{
      res=await cambiarEstado(id,anterior,nuevo);
      Object.assign(op,res.fila); // la fila no trae los joins: se conservan los ya cargados
    }catch(e){
      console.error('[ventas] Error cambiando estado',e);
      op.estado=anterior;
      showToast('Error al cambiar el estado: '+mensajeError(e,{permiso:MSG_PERMISO_OP}),true);
    }finally{
      tb.moviendo.delete(id);
      if(enVista('tablero')) V.repintar();
    }
    if(res) await res.seguimiento;
  }

  // ── Arrastre con eventos de puntero (funciona con mouse y touch) ──
  const UMBRAL=5, BORDE=48, PASO=14;

  function dragInicio(e){
    const h=e.target.closest('[data-vt-drag]');
    if(!h||tb.drag) return;
    if(e.pointerType==='mouse'&&e.button!==0) return;
    const card=h.closest('.vt-card');
    if(!card||tb.moviendo.has(card.dataset.opId)) return;
    tb.drag={id:card.dataset.opId,card,handle:h,pointerId:e.pointerId,x0:e.clientX,y0:e.clientY,activo:false,ghost:null,dx:0,dy:0,col:null};
    try{h.setPointerCapture(e.pointerId);}catch(_){/* sin captura: igual funciona dentro del contenedor */}
  }

  function dragMover(e){
    const d=tb.drag;
    if(!d||e.pointerId!==d.pointerId) return;
    if(!d.activo){
      if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<UMBRAL) return;
      const r=d.card.getBoundingClientRect();
      d.ghost=d.card.cloneNode(true);
      d.ghost.classList.add('vt-ghost');
      d.ghost.removeAttribute('data-op-id');
      d.ghost.style.width=r.width+'px';
      d.ghost.style.left=r.left+'px';
      d.ghost.style.top=r.top+'px';
      document.body.appendChild(d.ghost);
      d.card.classList.add('vt-dragging');
      d.activo=true;
    }
    e.preventDefault();
    d.ghost.style.transform=`translate(${e.clientX-d.x0}px,${e.clientY-d.y0}px)`;
    const bajo=document.elementFromPoint(e.clientX,e.clientY);
    const col=bajo?bajo.closest('#tab-ventas .vt-col'):null;
    if(col!==d.col){
      if(d.col) d.col.classList.remove('vt-col-over');
      if(col) col.classList.add('vt-col-over');
      d.col=col;
    }
    // Auto-scroll horizontal del tablero y vertical de la página cerca de los bordes
    const board=d.card.closest('.vt-board');
    if(board){
      const br=board.getBoundingClientRect();
      if(e.clientX<br.left+BORDE) board.scrollLeft-=PASO;
      else if(e.clientX>br.right-BORDE) board.scrollLeft+=PASO;
    }
    if(e.clientY<BORDE) window.scrollBy(0,-PASO);
    else if(e.clientY>window.innerHeight-BORDE) window.scrollBy(0,PASO);
  }

  function dragFin(e,cancelado){
    const d=tb.drag;
    if(!d||(e&&e.pointerId!==undefined&&e.pointerId!==d.pointerId)) return;
    tb.drag=null;
    try{d.handle.releasePointerCapture(d.pointerId);}catch(_){/* ya liberada */}
    if(d.ghost) d.ghost.remove();
    d.card.classList.remove('vt-dragging');
    if(d.col) d.col.classList.remove('vt-col-over');
    if(!d.activo||cancelado||!d.col) return;
    const destino=d.col.dataset.estado;
    if(destino) moverOportunidad(d.id,destino);
  }

  // Mover/soltar se escuchan en document: si el tablero se repinta durante el arrastre, la captura
  // del puntero se pierde y los eventos ya no pasan por #tab-ventas.
  document.addEventListener('pointermove',e=>{if(tb.drag) dragMover(e);},{passive:false});
  document.addEventListener('pointerup',e=>{if(tb.drag) dragFin(e,false);});
  document.addEventListener('pointercancel',e=>{if(tb.drag) dragFin(e,true);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tb.drag) dragFin(null,true);});

  V.registrarPantalla({
    id:'tablero',
    html:htmlTablero,
    entrar:entrarTablero,
    on:{
      change(e){
        const f=e.target.closest('[data-vt-filtro]');
        if(f){
          if(f.dataset.vtFiltro==='resp') tb.filtroResp=f.value; else tb.filtroTipo=f.value;
          V.repintar();
          return;
        }
        const m=e.target.closest('[data-vt-mover]');
        if(m&&m.value){
          const card=m.closest('.vt-card');
          if(card) moverOportunidad(card.dataset.opId,m.value);
        }
      },
      pointerdown:dragInicio
    }
  });

  // ══════════════════════════════════════════
  //  PANTALLA: NUEVA OPORTUNIDAD
  // ══════════════════════════════════════════
  const np={cargando:false,error:'',prospectos:[],responsables:[],prospecto:null,modo:'buscar',guardando:false,creandoProspecto:false};

  async function entrarNueva(){
    Object.assign(np,{cargando:true,error:'',prospectos:[],responsables:[],prospecto:null,modo:'buscar',guardando:false,creandoProspecto:false});
    V.repintar();
    try{
      const [prospectos,resp]=await Promise.all([
        api('crm_prospectos?select=id,nombre&order=nombre.asc'),
        esGerencia()?C.cargarResponsables():Promise.resolve([]),
        C.cargarCatalogosActivos(['crm_tipos_servicio','crm_tipos_cliente','crm_referidores'])
      ]);
      np.prospectos=Array.isArray(prospectos)?prospectos:[];
      np.responsables=resp;
    }catch(e){
      console.error('[ventas] Error cargando el formulario',e);
      np.error='No se pudo cargar el formulario: '+mensajeError(e);
    }finally{
      np.cargando=false;
    }
    if(enVista('nueva')) V.repintar();
  }

  function htmlNueva(){
    const cab=`<button type="button" class="btn-secondary" data-vt-ir="tablero">← Volver al tablero</button><h2 class="vt-h2">Nueva oportunidad</h2>`;
    if(np.cargando) return `<div class="vt-np" data-vt-pantalla="nueva">${cab}<div class="vt-msg">Cargando…</div></div>`;
    if(np.error) return `<div class="vt-np" data-vt-pantalla="nueva">${cab}<div class="vt-msg vt-error">${escapeHtml(np.error)}</div></div>`;
    const optResp=np.responsables.map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.nombre)}</option>`).join('');
    return `
<div class="vt-np" data-vt-pantalla="nueva">
  ${cab}
  <form data-vt-form="nueva-op" autocomplete="off">
    <div class="form-group">
      <label class="form-label">Prospecto (cliente que cotiza)</label>
      <div data-vt-np-prospecto>${htmlProspecto()}</div>
    </div>
    <div class="vt-np-grid">
      <div class="form-group"><label class="form-label">N° de referencia (opcional)</label>
        <input class="form-input" type="text" name="numero_referencia" placeholder="Ej: 4806-BIS" maxlength="60"></div>
      <div class="form-group"><label class="form-label">Fecha de ingreso</label>
        <input class="form-input" type="date" name="fecha_ingreso" value="${escapeHtml(hoyAR())}" required></div>
      <div class="form-group"><label class="form-label">Tipo de servicio</label>
        ${C.htmlSelectConCrear({nombre:'tipo_servicio_id',tabla:'crm_tipos_servicio',placeholder:'Elegir tipo de servicio'})}</div>
      <div class="form-group"><label class="form-label">Cantidad de equipos</label>
        <input class="form-input" type="number" name="cantidad_equipos" min="0" step="1" inputmode="numeric" placeholder="Ej: 3"></div>
      <div class="form-group"><label class="form-label">Monto estimado</label>
        <input class="form-input" type="number" name="monto_estimado" min="0" step="any" inputmode="decimal"></div>
      <div class="form-group"><label class="form-label">Moneda</label>
        <select class="form-select" name="moneda"><option value="ARS" selected>Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select></div>
      <div class="form-group"><label class="form-label">Fecha de envío (opcional)</label>
        <input class="form-input" type="date" name="fecha_envio"></div>
      <div class="form-group"><label class="form-label">Comisión (opcional)</label>
        <input class="form-input" type="number" name="comision_monto" min="0" step="any" inputmode="decimal"></div>
      <div class="form-group"><label class="form-label">Responsable</label>
        ${esGerencia()
          ?`<select class="form-select" name="responsable_id" required><option value="">Elegir responsable</option>${optResp}</select>`
          :`<div class="vt-np-fijo">${escapeHtml(usuarioActual&&usuarioActual.nombre||'-')}</div>`}</div>
    </div>
    <div class="form-group"><textarea class="form-textarea" name="comentarios" rows="3" placeholder="Comentarios (opcional)"></textarea></div>
    <p class="vt-error" data-vt-np-error hidden></p>
    <button type="submit" class="btn-primary" data-vt-np-guardar${np.guardando?' disabled':''}>${np.guardando?'Guardando...':'Crear oportunidad'}</button>
  </form>
</div>`;
  }

  function htmlProspecto(){
    if(np.prospecto){
      return `<div class="vt-np-sel"><span>${escapeHtml(np.prospecto.nombre)}</span><button type="button" class="btn-danger" data-vt-np="quitar">Quitar</button></div>`;
    }
    const modos=`<div class="vt-np-modos">
      <button type="button" class="vt-sub-btn${np.modo==='buscar'?' vt-activo':''}" data-vt-np="modo-buscar">Buscar existente</button>
      <button type="button" class="vt-sub-btn${np.modo==='crear'?' vt-activo':''}" data-vt-np="modo-crear">Crear prospecto nuevo</button>
    </div>`;
    if(np.modo==='buscar'){
      return modos+`<div class="vt-bp">
        <input class="form-input" type="text" data-vt-bp-input placeholder="Buscar prospecto por nombre..." autocomplete="off">
        <div class="vt-bp-lista" data-vt-bp-lista hidden></div>
      </div>`;
    }
    // No es un <form>: va embebido dentro del <form> de la oportunidad (no se anidan forms)
    return modos+`<div class="vt-np-nuevo" data-vt-np-nuevo>
      <input class="form-input" type="text" data-p="nombre" placeholder="Nombre del prospecto" maxlength="160">
      ${C.htmlSelectConCrear({nombre:'p_tipo_cliente_id',tabla:'crm_tipos_cliente',placeholder:'Tipo de cliente'})}
      <input class="form-input" type="text" data-p="contacto_nombre" placeholder="Persona de contacto" maxlength="120">
      <input class="form-input" type="tel" data-p="telefono" placeholder="Teléfono" maxlength="40">
      <input class="form-input" type="email" data-p="email" placeholder="Email" maxlength="160">
      ${C.htmlSelectConCrear({nombre:'p_referido_por_id',tabla:'crm_referidores',placeholder:'Referido por (opcional)'})}
      <textarea class="form-textarea vt-ancho" data-p="notas" rows="2" placeholder="Notas (opcional)"></textarea>
      <div class="vt-ancho"><button type="button" class="btn-primary" data-vt-np="crear-prospecto"${np.creandoProspecto?' disabled':''}>${np.creandoProspecto?'Creando...':'Crear prospecto'}</button></div>
      <p class="vt-error vt-ancho" data-vt-np-perror hidden></p>
    </div>`;
  }

  function pintarProspecto(){
    const box=C.cuerpo()&&C.cuerpo().querySelector('[data-vt-np-prospecto]');
    if(box) box.innerHTML=htmlProspecto();
    return box;
  }

  function mostrarError(sel,msg){
    const p=C.cuerpo()&&C.cuerpo().querySelector(sel);
    if(!p) return;
    p.textContent=msg||'';
    p.hidden=!msg;
  }

  // ── Buscador de prospectos (filtro en memoria) ──
  function pintarListaProspectos(input){
    const lista=input.closest('.vt-bp').querySelector('[data-vt-bp-lista]');
    const q=input.value.trim().toLowerCase();
    const filtrados=q?np.prospectos.filter(p=>String(p.nombre).toLowerCase().includes(q)):np.prospectos;
    lista.innerHTML=filtrados.length
      ?filtrados.map(p=>`<button type="button" class="vt-bp-item" data-vt-bp-id="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</button>`).join('')
      :'<div class="vt-msg">Sin resultados</div>';
    lista.hidden=false;
  }
  function ocultarListaProspectos(){
    const b=C.cuerpo();
    if(!b) return;
    b.querySelectorAll('[data-vt-bp-lista]').forEach(l=>{l.hidden=true;});
  }
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.vt-bp')) ocultarListaProspectos();});

  async function crearProspecto(){
    if(np.creandoProspecto) return;
    const box=C.cuerpo().querySelector('[data-vt-np-nuevo]');
    if(!box) return;
    const val=k=>{const el=box.querySelector('[data-p="'+k+'"]');return el?el.value.trim():'';};
    const sel=n=>{const el=box.querySelector('select[name="'+n+'"]');return el&&el.value&&el.value!=='__crear__'?el.value:'';};
    mostrarError('[data-vt-np-perror]','');
    const nombre=val('nombre');
    if(!nombre){mostrarError('[data-vt-np-perror]','El nombre es obligatorio.');return;}
    const btn=box.querySelector('[data-vt-np="crear-prospecto"]');
    np.creandoProspecto=true;
    if(btn){btn.disabled=true;btn.textContent='Creando...';}
    try{
      const filas=await api('crm_prospectos?select=id,nombre',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({
        nombre,
        tipo_cliente_id:sel('p_tipo_cliente_id')||null,
        contacto_nombre:val('contacto_nombre')||null,
        telefono:val('telefono')||null,
        email:val('email')||null,
        referido_por_id:sel('p_referido_por_id')||null,
        notas:val('notas')||null
      })});
      const fila=Array.isArray(filas)?filas[0]:null;
      if(!fila) throw new Error('row-level security');
      np.prospectos.push(fila);
      np.prospectos.sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
      np.prospecto=fila;
      np.creandoProspecto=false;
      pintarProspecto();
    }catch(e){
      console.error('[ventas] Error creando prospecto',e);
      np.creandoProspecto=false;
      if(btn){btn.disabled=false;btn.textContent='Crear prospecto';}
      mostrarError('[data-vt-np-perror]','Error al crear el prospecto: '+mensajeError(e,{permiso:'No tenés permiso para crear prospectos'}));
    }
  }

  async function guardarOportunidad(form){
    if(np.guardando) return;
    if(!exigirPermiso(puedeVerModulo('ventas'),'No tenés permiso para crear oportunidades')) return;
    mostrarError('[data-vt-np-error]','');
    const f=form.elements;
    const v=n=>f[n]?String(f[n].value).trim():'';
    if(!np.prospecto){mostrarError('[data-vt-np-error]','Elegí un prospecto existente o creá uno nuevo.');return;}
    const responsableId=esGerencia()?v('responsable_id'):(usuarioActual&&usuarioActual.id);
    if(!responsableId){mostrarError('[data-vt-np-error]','Elegí un responsable.');return;}
    if(!v('fecha_ingreso')){mostrarError('[data-vt-np-error]','Completá la fecha de ingreso.');return;}
    const cant=v('cantidad_equipos');
    if(cant!==''&&!(Number.isInteger(Number(cant))&&Number(cant)>=0)){mostrarError('[data-vt-np-error]','La cantidad de equipos tiene que ser un número entero (0 o más).');return;}
    const tipoServ=v('tipo_servicio_id');
    const cuerpoReq={
      prospecto_id:np.prospecto.id,
      numero_referencia:v('numero_referencia')||null,
      fecha_ingreso:v('fecha_ingreso'),
      tipo_servicio_id:tipoServ&&tipoServ!=='__crear__'?tipoServ:null,
      cantidad_equipos:cant!==''?Number(cant):null,
      monto_estimado:v('monto_estimado')!==''?Number(v('monto_estimado')):null,
      moneda:v('moneda')==='USD'?'USD':'ARS',
      fecha_envio:v('fecha_envio')||null,
      comision_monto:v('comision_monto')!==''?Number(v('comision_monto')):null,
      responsable_id:responsableId,
      comentarios:v('comentarios')?f.comentarios.value:null
    };
    const btn=form.querySelector('[data-vt-np-guardar]');
    np.guardando=true;
    if(btn){btn.disabled=true;btn.textContent='Guardando...';}
    let fila=null;
    try{
      const filas=await api('crm_oportunidades?select=id',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpoReq)});
      fila=Array.isArray(filas)?filas[0]:null;
      if(!fila) throw new Error('row-level security');
    }catch(e){
      console.error('[ventas] Error guardando oportunidad',e);
      np.guardando=false;
      if(btn){btn.disabled=false;btn.textContent='Crear oportunidad';}
      mostrarError('[data-vt-np-error]','Error al guardar: '+mensajeError(e,{permiso:'No tenés permiso para crear oportunidades'}));
      return;
    }
    // Seguimiento inicial: si falla no se avisa ni se revierte, la oportunidad ya se guardó
    try{
      await api('crm_seguimientos',{method:'POST',body:JSON.stringify({oportunidad_id:fila.id,nota:'Oportunidad creada.',usuario_id:usuarioActual.id})});
    }catch(e){console.warn('[ventas] No se pudo registrar el seguimiento inicial',e);}
    np.guardando=false;
    showToast('Oportunidad creada','success');
    V.ir('ficha',{id:fila.id}); // como el original: después del alta se abre la ficha
  }

  V.registrarPantalla({
    id:'nueva',
    html:htmlNueva,
    entrar:entrarNueva,
    on:{
      click(e){
        const it=e.target.closest('[data-vt-bp-id]');
        if(it){
          const p=np.prospectos.find(x=>x.id===it.dataset.vtBpId);
          if(p){np.prospecto=p;pintarProspecto();mostrarError('[data-vt-np-error]','');}
          return;
        }
        const b=e.target.closest('[data-vt-np]');
        if(!b||b.disabled) return;
        const acc=b.dataset.vtNp;
        if(acc==='quitar'){np.prospecto=null;pintarProspecto();}
        else if(acc==='modo-buscar'||acc==='modo-crear'){
          np.modo=acc==='modo-crear'?'crear':'buscar';
          const box=pintarProspecto();
          const foco=box&&box.querySelector(np.modo==='crear'?'[data-p="nombre"]':'[data-vt-bp-input]');
          if(foco) foco.focus();
        }
        else if(acc==='crear-prospecto') crearProspecto();
      },
      input(e){
        if(e.target.matches('[data-vt-bp-input]')) pintarListaProspectos(e.target);
      },
      focusin(e){
        if(e.target.matches('[data-vt-bp-input]')) pintarListaProspectos(e.target);
      },
      keydown(e){
        if(e.key!=='Enter') return;
        // Enter dentro del buscador o del alta de prospecto no debe enviar el formulario de la oportunidad
        if(e.target.matches('[data-vt-bp-input]')){e.preventDefault();return;}
        if(e.target.closest('[data-vt-np-nuevo]')&&e.target.tagName!=='TEXTAREA'){e.preventDefault();crearProspecto();}
      },
      submit(e){
        const form=e.target.closest('form[data-vt-form="nueva-op"]');
        if(!form) return;
        e.preventDefault();
        guardarOportunidad(form);
      }
    }
  });

  V.oportunidades={filtrarOportunidades,agruparPorEstado,moverOportunidad,cambiarEstado,calcularNovedades,itemsNovedades};
})();
