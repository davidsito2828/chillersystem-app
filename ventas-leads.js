// ══════════════════════════════════════════
//  VENTAS — Leads: tablero (kanban), nuevo lead y ficha del lead con seguimientos.
//  Un lead es un potencial cliente antes de que haya algo concreto para cotizar; cuando se
//  concreta se convierte en Oportunidad (Nueva oportunidad con {leadId, prospectoId}).
//  Se carga con defer después de ventas-listado.js. Usa de ventas-oportunidades.js el selector
//  de prospecto y del núcleo el motor de arrastre. Reutiliza las globales de index.html:
//  api, escapeHtml, showToast, exigirPermiso, esGerencia, puedeVerModulo, usuarioActual.
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V||!V.oportunidades){console.error('[ventas] ventas-leads.js necesita ventas.js y ventas-oportunidades.js cargados antes');return;}
  const {fmtFecha,hoyAR,nombreResponsable,nombreUsuarioSeguimiento,mensajeError}=V.util;
  const C=V.comun;

  const ESTADOS_LEAD=[
    {valor:'por_contactar',etiqueta:'Por contactar'},
    {valor:'en_conversacion',etiqueta:'En conversación'},
    {valor:'convertido',etiqueta:'Convertido a oportunidad'},
    {valor:'sin_interes',etiqueta:'Sin interés'}
  ];
  const TIPOS_CONTACTO=['Llamada','Email','WhatsApp','Reunión','Otro'];
  const MSG_PERMISO_LEAD='No tenés permiso para modificar este lead';
  const MSG_PERMISO_ELIMINAR='No tenés permiso para eliminar leads';
  const MSG_CONFIRMAR_ELIMINAR='Se va a eliminar este lead junto con todo su historial de seguimientos. No se puede deshacer. ¿Confirmás?';
  const RUTA_TABLERO='crm_leads?select=*,crm_prospectos(id,nombre,tipo_cliente_id,contacto_nombre,telefono),usuarios(nombre)&order=created_at.desc,id.asc';
  const SELECT_LEAD='crm_leads?select=*,crm_prospectos(id,nombre,contacto_nombre,telefono,email,tipo_cliente_id,referido_por_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),usuarios(nombre)&id=eq.';

  // ── Funciones puras (probadas en Node) ──
  function etiquetaEstadoLead(valor){
    const e=ESTADOS_LEAD.find(x=>x.valor===valor);
    return e?e.etiqueta:String(valor==null?'':valor);
  }
  function filtrarLeads(lista,{responsable=''}={}){
    return (lista||[]).filter(l=>!responsable||l.responsable_id===responsable);
  }
  function agruparLeadsPorEstado(lista){
    const grupos={};
    ESTADOS_LEAD.forEach(e=>{grupos[e.valor]=[];});
    (lista||[]).forEach(l=>{if(grupos[l.estado]) grupos[l.estado].push(l);});
    return grupos;
  }
  // REGLA DE CONVERSIÓN: pasar a 'convertido' un lead sin oportunidad no cambia el estado, abre
  // Nueva oportunidad con el lead. Con oportunidad_id ya cargada, el cambio se permite normalmente.
  // Devuelve {accion:'ninguna'} | {accion:'convertir',leadId,prospectoId} | {accion:'cambiar',leadId,anterior,nuevo}.
  function resolverCambioEstadoLead(lead,destino){
    if(!lead||!ESTADOS_LEAD.some(e=>e.valor===destino)||lead.estado===destino) return {accion:'ninguna'};
    if(destino==='convertido'&&!lead.oportunidad_id){
      return {accion:'convertir',leadId:lead.id,prospectoId:lead.prospecto_id||(lead.crm_prospectos&&lead.crm_prospectos.id)||null};
    }
    return {accion:'cambiar',leadId:lead.id,anterior:lead.estado,nuevo:destino};
  }
  function puedeEliminarLead(lead){
    return esGerencia()||(!!usuarioActual&&!!lead&&!!lead.responsable_id&&usuarioActual.id===lead.responsable_id);
  }
  // Fecha (YYYY-MM-DD) en Argentina de un timestamp: created_at viene en UTC
  function fechaARDeTimestamp(ts){
    const t=Date.parse(ts);
    if(!Number.isFinite(t)) return null;
    const partes={};
    new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(new Date(t)).forEach(p=>{partes[p.type]=p.value;});
    return partes.year+'-'+partes.month+'-'+partes.day;
  }
  const fecha=f=>f?fmtFecha(f):'-';

  // Cambio de estado compartido (tablero y ficha): PATCH con return=representation; si RLS no
  // devuelve la fila, lanza error. seguimiento es la promesa del registro automático (nunca rechaza).
  async function cambiarEstadoLead(id,anterior,nuevo){
    if(!ESTADOS_LEAD.some(e=>e.valor===nuevo)) throw new Error('Estado inválido');
    const filas=await api('crm_leads?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({estado:nuevo})});
    const fila=Array.isArray(filas)?filas[0]:null;
    if(!fila) throw new Error('row-level security');
    const seguimiento=api('crm_seguimientos_leads',{method:'POST',body:JSON.stringify({
      lead_id:id,
      nota:`Estado cambiado de "${etiquetaEstadoLead(anterior)}" a "${etiquetaEstadoLead(nuevo)}".`,
      usuario_id:usuarioActual.id
    })}).catch(e=>{console.warn('[ventas] No se pudo registrar el seguimiento del cambio de estado del lead',e);});
    return {fila,seguimiento};
  }

  function abrirConversion(r){V.ir('nueva',{leadId:r.leadId,prospectoId:r.prospectoId});}
  function enVista(id){const b=C.cuerpo();return !!b&&!!b.querySelector('[data-vt-pantalla="'+id+'"]');}

  C.agregarCss(`
.vt-ld-intro{font-size:13px;color:var(--text-dim);margin:0 0 14px;}
.vt-ld-acc{display:flex;gap:8px;flex-wrap:wrap;}
.vt-ld-conv{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:var(--r);padding:8px 12px;margin:0 0 12px;font-size:13px;color:#065f46;}
.vt-ld-conv .vt-link{flex:none;font-size:13px;color:#065f46;}
.vt-ld-convertir{margin:0 0 12px;}
`);

  // ══════════════════════════════════════════
  //  PANTALLA: TABLERO DE LEADS
  // ══════════════════════════════════════════
  const tl={cargando:false,error:'',leads:[],responsables:[],filtroResp:'',moviendo:new Set(),seq:0};

  async function entrarTablero(){
    const seq=++tl.seq;
    tl.cargando=true;tl.error='';V.repintar();
    try{
      const [leads,resp]=await Promise.all([
        C.cargarTodo(RUTA_TABLERO),
        esGerencia()?C.cargarResponsables():Promise.resolve([])
      ]);
      if(seq!==tl.seq) return;
      tl.leads=leads;
      tl.responsables=resp;
    }catch(e){
      if(seq!==tl.seq) return;
      console.error('[ventas] Error cargando el tablero de leads',e);
      tl.error='No se pudo cargar el tablero de leads: '+mensajeError(e);
    }finally{
      if(seq===tl.seq) tl.cargando=false;
    }
    if(seq===tl.seq&&enVista('leads')) V.repintar();
  }

  function htmlTablero(){
    const intro='<p class="vt-ld-intro">Seguimiento de potenciales clientes antes de que haya algo concreto para cotizar. Cuando se concreta, se convierte en Oportunidad.</p>';
    if(tl.cargando&&!tl.leads.length) return `<div data-vt-pantalla="leads">${intro}<div class="vt-msg">Cargando…</div></div>`;
    if(tl.error) return `<div data-vt-pantalla="leads">${intro}<div class="vt-msg vt-error">${escapeHtml(tl.error)}</div></div>`;
    const grupos=agruparLeadsPorEstado(filtrarLeads(tl.leads,{responsable:esGerencia()?tl.filtroResp:''}));
    const optResp=tl.responsables.map(r=>`<option value="${escapeHtml(r.id)}"${r.id===tl.filtroResp?' selected':''}>${escapeHtml(r.nombre)}</option>`).join('');
    return `
<div data-vt-pantalla="leads">
  ${intro}
  <div class="vt-toolbar">
    <div class="vt-filtros">
      ${esGerencia()?`<select class="form-select" data-vt-ld-filtro="resp"><option value="">Todos los responsables</option>${optResp}</select>`:''}
    </div>
    <div class="vt-ld-acc">
      <button type="button" class="vt-sub-btn" disabled title="Próximamente">Ver listado <small>Próximamente</small></button>
      <button type="button" class="btn-primary" data-vt-ir="nuevo-lead">+ Nuevo lead</button>
    </div>
  </div>
  <div class="vt-board">
    ${ESTADOS_LEAD.map(e=>`
    <div class="vt-col" data-estado="${escapeHtml(e.valor)}">
      <div class="vt-col-head">${escapeHtml(e.etiqueta)} (${grupos[e.valor].length})</div>
      ${grupos[e.valor].length?grupos[e.valor].map(htmlTarjeta).join(''):'<p class="vt-col-vacia">Sin leads</p>'}
    </div>`).join('')}
  </div>
</div>`;
  }

  function htmlTarjeta(l){
    const p=l.crm_prospectos;
    const moviendo=tl.moviendo.has(l.id);
    const opts=ESTADOS_LEAD.filter(e=>e.valor!==l.estado).map(e=>`<option value="${escapeHtml(e.valor)}">${escapeHtml(e.etiqueta)}</option>`).join('');
    return `
<div class="vt-card${moviendo?' vt-moviendo':''}" data-lead-id="${escapeHtml(l.id)}">
  <span class="vt-drag" data-vt-drag title="Arrastrá para cambiar de estado" aria-hidden="true">⠿</span>
  <div class="vt-card-info">
    <div class="vt-card-tit">${escapeHtml(p&&p.nombre||'-')}</div>
    <div class="vt-card-sub">${escapeHtml(p&&p.contacto_nombre||'Sin contacto')}</div>
    <div class="vt-card-pie"><span>${escapeHtml(fmtFecha(l.proxima_fecha_contacto))}</span><span>${escapeHtml(nombreResponsable(l))}</span></div>
  </div>
  <div class="vt-card-acc">
    <button type="button" class="vt-link" data-vt-ficha-lead="${escapeHtml(l.id)}">Ver detalle →</button>
    ${C.htmlBotonWhatsApp(p&&p.telefono)}
    <select class="form-select vt-mover" data-vt-ld-mover aria-label="Mover a otra columna"${moviendo?' disabled':''}>
      <option value="">Mover a…</option>${opts}
    </select>
  </div>
</div>`;
  }

  // Arrastre y "Mover a…": aplica la regla de conversión; si no, actualización optimista con
  // reversión si el PATCH falla o RLS no devuelve la fila.
  async function moverLead(id,destino){
    const lead=tl.leads.find(l=>l.id===id);
    if(!lead||tl.moviendo.has(id)) return;
    const r=resolverCambioEstadoLead(lead,destino);
    if(r.accion==='convertir'){abrirConversion(r);return;}
    if(r.accion!=='cambiar') return;
    lead.estado=r.nuevo;
    tl.moviendo.add(id);
    V.repintar();
    let res=null;
    try{
      res=await cambiarEstadoLead(id,r.anterior,r.nuevo);
      Object.assign(lead,res.fila); // la fila no trae los joins: se conservan los ya cargados
    }catch(e){
      console.error('[ventas] Error cambiando estado del lead',e);
      lead.estado=r.anterior;
      showToast('Error al cambiar el estado: '+mensajeError(e,{permiso:MSG_PERMISO_LEAD}),true);
    }finally{
      tl.moviendo.delete(id);
      if(enVista('leads')) V.repintar();
    }
    if(res) await res.seguimiento;
  }

  const arrastre=C.crearArrastre({atributoId:'data-lead-id',bloqueado:id=>tl.moviendo.has(id),onSoltar:moverLead});

  V.registrarPantalla({
    id:'leads',
    html:htmlTablero,
    entrar:entrarTablero,
    on:{
      change(e){
        const f=e.target.closest('[data-vt-ld-filtro]');
        if(f){tl.filtroResp=f.value;V.repintar();return;}
        const m=e.target.closest('[data-vt-ld-mover]');
        if(m&&m.value){
          const card=m.closest('.vt-card');
          const destino=m.value;
          m.value='';
          if(card) moverLead(card.dataset.leadId,destino);
        }
      },
      pointerdown:arrastre.inicio
    }
  });

  // ══════════════════════════════════════════
  //  PANTALLA: NUEVO LEAD (interna, resalta "Leads")
  // ══════════════════════════════════════════
  const nl={cargando:false,error:'',prospectos:[],responsables:[],prospecto:null,modo:'buscar',guardando:false,creandoProspecto:false,seq:0};
  const selNl=V.oportunidades.crearSelectorProspecto(nl);

  function mostrarError(sel,msg){
    const p=C.cuerpo()&&C.cuerpo().querySelector(sel);
    if(!p) return;
    p.textContent=msg||'';
    p.hidden=!msg;
  }

  async function entrarNuevo(){
    const seq=++nl.seq;
    Object.assign(nl,{cargando:true,error:'',prospectos:[],responsables:[],prospecto:null,modo:'buscar',guardando:false,creandoProspecto:false});
    V.repintar();
    try{
      const [prospectos,resp]=await Promise.all([
        api('crm_prospectos?select=id,nombre&order=nombre.asc'),
        esGerencia()?C.cargarResponsables():Promise.resolve([]),
        C.cargarCatalogosActivos(['crm_tipos_cliente','crm_referidores'])
      ]);
      if(seq!==nl.seq) return;
      nl.prospectos=Array.isArray(prospectos)?prospectos:[];
      nl.responsables=resp;
    }catch(e){
      if(seq!==nl.seq) return;
      console.error('[ventas] Error cargando el formulario de lead',e);
      nl.error='No se pudo cargar el formulario: '+mensajeError(e);
    }finally{
      if(seq===nl.seq) nl.cargando=false;
    }
    if(seq===nl.seq&&enVista('nuevo-lead')) V.repintar();
  }

  function htmlNuevo(){
    const cab=`<button type="button" class="btn-secondary" data-vt-ir="leads">← Volver a Leads</button><h2 class="vt-h2">Nuevo lead</h2>`;
    if(nl.cargando) return `<div class="vt-np" data-vt-pantalla="nuevo-lead">${cab}<div class="vt-msg">Cargando…</div></div>`;
    if(nl.error) return `<div class="vt-np" data-vt-pantalla="nuevo-lead">${cab}<div class="vt-msg vt-error">${escapeHtml(nl.error)}</div></div>`;
    const optResp=nl.responsables.map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.nombre)}</option>`).join('');
    return `
<div class="vt-np" data-vt-pantalla="nuevo-lead">
  ${cab}
  <form data-vt-form="nuevo-lead" autocomplete="off">
    <div class="form-group">
      <label class="form-label">Prospecto (potencial cliente)</label>
      <div data-vt-np-prospecto>${selNl.html()}</div>
    </div>
    <div class="vt-np-grid">
      <div class="form-group"><label class="form-label">Próximo contacto (opcional)</label>
        <input class="form-input" type="date" name="proxima_fecha_contacto"></div>
      <div class="form-group"><label class="form-label">Responsable</label>
        ${esGerencia()
          ?`<select class="form-select" name="responsable_id" required><option value="">Elegir responsable</option>${optResp}</select>`
          :`<div class="vt-np-fijo">${escapeHtml(usuarioActual&&usuarioActual.nombre||'-')}</div>`}</div>
    </div>
    <div class="form-group"><textarea class="form-textarea" name="notas" rows="3" placeholder="Notas (opcional): cómo surgió, qué le interesaría, etc."></textarea></div>
    <p class="vt-error" data-vt-np-error hidden></p>
    <button type="submit" class="btn-primary" data-vt-nl-guardar${nl.guardando?' disabled':''}>${nl.guardando?'Guardando...':'Crear lead'}</button>
  </form>
</div>`;
  }

  async function guardarLead(form){
    if(nl.guardando) return;
    if(!exigirPermiso(puedeVerModulo('ventas'),'No tenés permiso para crear leads')) return;
    mostrarError('[data-vt-np-error]','');
    const f=form.elements;
    const v=n=>f[n]?String(f[n].value).trim():'';
    if(!nl.prospecto){mostrarError('[data-vt-np-error]','Elegí un prospecto existente o creá uno nuevo.');return;}
    const responsableId=esGerencia()?v('responsable_id'):(usuarioActual&&usuarioActual.id);
    if(!responsableId){mostrarError('[data-vt-np-error]','Elegí un responsable.');return;}
    const cuerpoReq={
      prospecto_id:nl.prospecto.id,
      responsable_id:responsableId,
      proxima_fecha_contacto:v('proxima_fecha_contacto')||null,
      notas:v('notas')?f.notas.value:null
    };
    const btn=form.querySelector('[data-vt-nl-guardar]');
    nl.guardando=true;
    if(btn){btn.disabled=true;btn.textContent='Guardando...';}
    let fila=null;
    try{
      const filas=await api('crm_leads?select=id',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpoReq)});
      fila=Array.isArray(filas)?filas[0]:null;
      if(!fila) throw new Error('row-level security');
    }catch(e){
      console.error('[ventas] Error guardando lead',e);
      nl.guardando=false;
      if(btn){btn.disabled=false;btn.textContent='Crear lead';}
      mostrarError('[data-vt-np-error]','Error al guardar: '+mensajeError(e,{permiso:'No tenés permiso para crear leads'}));
      return;
    }
    // Registro en el historial: si falla no se avisa ni se revierte, el lead ya se guardó
    try{
      await api('crm_seguimientos_leads',{method:'POST',body:JSON.stringify({lead_id:fila.id,nota:'Lead creado.',usuario_id:usuarioActual.id})});
    }catch(e){console.warn('[ventas] No se pudo registrar el seguimiento inicial del lead',e);}
    nl.guardando=false;
    showToast('Lead creado','success');
    V.ir('ficha-lead',{id:fila.id});
  }

  V.registrarPantalla({
    id:'nuevo-lead',
    interna:true,
    resaltar:'leads',
    html:htmlNuevo,
    entrar:entrarNuevo,
    on:{
      click(e){selNl.click(e);},
      input(e){selNl.input(e);},
      focusin(e){selNl.focusin(e);},
      keydown(e){selNl.keydown(e);},
      submit(e){
        const form=e.target.closest('form[data-vt-form="nuevo-lead"]');
        if(!form) return;
        e.preventDefault();
        guardarLead(form);
      }
    }
  });

  // ══════════════════════════════════════════
  //  PANTALLA: FICHA DEL LEAD (interna, resalta "Leads")
  // ══════════════════════════════════════════
  const fl={id:null,cargando:false,error:'',noEncontrado:false,lead:null,segs:[],editando:false,guardando:false,
    eliminando:false,cambiandoEstado:false,segAbierto:false,segGuardando:false,recargarAlCancelar:false,seq:0};

  function abierta(id){const a=V.vistaActual();return a.vista==='ficha-lead'&&a.params&&a.params.id===id;}
  function q(sel){const b=C.cuerpo();return b?b.querySelector(sel):null;}
  function botones(sel,{disabled,texto}){
    const b=q(sel);
    if(!b) return;
    b.disabled=disabled;
    if(texto) b.textContent=texto;
  }

  async function cargar(id,{catalogos=true}={}){
    const seq=++fl.seq;
    const [leads,segs]=await Promise.all([
      api(SELECT_LEAD+encodeURIComponent(id)),
      api('crm_seguimientos_leads?select=*,usuarios(nombre)&lead_id=eq.'+encodeURIComponent(id)+'&order=fecha_contacto.desc,created_at.desc'),
      catalogos?C.cargarCatalogosActivos(['crm_tipos_cliente','crm_referidores']):Promise.resolve()
    ]);
    if(seq!==fl.seq||fl.id!==id) return false; // respuesta vieja: se descarta
    fl.lead=(Array.isArray(leads)&&leads[0])||null;
    fl.noEncontrado=!fl.lead;
    fl.segs=Array.isArray(segs)?segs:[];
    return true;
  }

  async function entrarFicha(params){
    const id=params&&params.id?String(params.id):null;
    Object.assign(fl,{id,cargando:!!id,error:'',noEncontrado:!id,lead:null,segs:[],editando:false,guardando:false,
      eliminando:false,cambiandoEstado:false,segAbierto:false,segGuardando:false,recargarAlCancelar:false});
    V.repintar();
    if(!id) return;
    try{
      await cargar(id);
    }catch(e){
      console.error('[ventas] Error cargando la ficha del lead',e);
      if(fl.id===id) fl.error='No se pudo cargar el lead: '+mensajeError(e);
    }finally{
      if(fl.id===id) fl.cargando=false;
    }
    if(abierta(id)) V.repintar();
  }

  const VOLVER='<button type="button" class="btn-secondary" data-vt-ir="leads">← Volver a Leads</button>';

  function htmlFicha(){
    if(fl.cargando) return `<div class="vt-ficha" data-vt-pantalla="ficha-lead">${VOLVER}<div class="vt-msg">Cargando…</div></div>`;
    if(fl.error) return `<div class="vt-ficha" data-vt-pantalla="ficha-lead">${VOLVER}<div class="vt-msg vt-error">${escapeHtml(fl.error)}</div></div>`;
    if(fl.noEncontrado||!fl.lead) return `<div class="vt-ficha" data-vt-pantalla="ficha-lead"><p class="vt-msg">Lead no encontrado.</p>${VOLVER}</div>`;
    const l=fl.lead, p=l.crm_prospectos, ed=fl.editando;
    const opts=ESTADOS_LEAD.map(e=>`<option value="${escapeHtml(e.valor)}"${e.valor===l.estado?' selected':''}>${escapeHtml(e.etiqueta)}</option>`).join('');
    return `
<div class="vt-ficha" data-vt-pantalla="ficha-lead">
  ${VOLVER}
  <div class="vt-fc-head">
    <h2 class="vt-h2">${escapeHtml(p&&p.nombre||'-')}</h2>
    <div class="vt-fc-estado">
      <select class="form-select" data-vt-ld-estado aria-label="Estado del lead"${ed||fl.cambiandoEstado?' disabled':''}${ed?' title="Guardá o cancelá la edición para cambiar el estado"':''}>${opts}</select>
    </div>
  </div>
  <div class="vt-fc-bar">
    ${C.htmlBotonWhatsApp(p&&p.telefono)}
    ${ed
      ?`<button type="button" class="btn-secondary" data-vt-ld="cancelar">Cancelar</button>
        <button type="button" class="btn-primary" data-vt-ld="guardar">Guardar cambios</button>`
      :`<button type="button" class="btn-edit" data-vt-ld="editar">Editar</button>
        ${puedeEliminarLead(l)?`<button type="button" class="btn-danger" data-vt-ld="eliminar">Eliminar lead</button>`:''}`}
  </div>
  <div data-vt-ld-confirm></div>
  <p class="vt-error" data-vt-ld-error hidden></p>
  ${l.oportunidad_id
    ?`<div class="vt-ld-conv">Convertido a oportunidad — <button type="button" class="vt-link" data-vt-ficha="${escapeHtml(l.oportunidad_id)}">ver ficha →</button></div>`
    :`<div class="vt-ld-convertir"><button type="button" class="btn-primary" data-vt-ld="convertir">Convertir a oportunidad</button></div>`}
  <form data-vt-ld-form autocomplete="off">
    <div class="vt-fc-grid">${ed?htmlCamposEdicion(l,p):htmlCamposLectura(l,p)}</div>
    ${ed
      ?`<div class="form-group vt-fc-form-coment"><textarea class="form-textarea" name="notas" rows="3" placeholder="Notas (opcional)">${escapeHtml(l.notas||'')}</textarea></div>`
      :(l.notas?`<p class="vt-fc-coment">Notas: ${escapeHtml(l.notas)}</p>`:'')}
  </form>
  <div data-vt-ld-hist>${htmlHistorial()}</div>
</div>`;
  }

  function campo(etq,val,extra=''){
    return `<div class="vt-fc-campo"${extra}><span class="vt-fc-etq">${escapeHtml(etq)}</span><div class="vt-fc-val">${escapeHtml(val)}</div></div>`;
  }
  function campoEd(etq,control){
    return `<div class="vt-fc-campo"><label class="vt-fc-etq">${escapeHtml(etq)}</label>${control}</div>`;
  }

  function htmlCamposLectura(l,p){
    return [
      campo('Tipo de cliente',(p&&p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre)||'-'),
      campo('Contacto',(p&&p.contacto_nombre)||'-'),
      campo('Teléfono',(p&&p.telefono)||'-'),
      campo('Email',(p&&p.email)||'-'),
      campo('Referido por',(p&&p.crm_referidores&&p.crm_referidores.nombre)||'-'),
      campo('Próximo contacto',fecha(l.proxima_fecha_contacto),' data-vt-ld-proxima'),
      campo('Creado',fecha(fechaARDeTimestamp(l.created_at))),
      campo('Responsable',nombreResponsable(l))
    ].join('');
  }

  function htmlCamposEdicion(l,p){
    const inp=(nombre,valor,attrs='')=>`<input class="form-input" name="${nombre}" value="${escapeHtml(valor==null?'':valor)}"${attrs}>`;
    const prosp=!!p;
    return [
      prosp?campoEd('Tipo de cliente',C.htmlSelectConCrear({nombre:'p_tipo_cliente_id',tabla:'crm_tipos_cliente',valor:p.tipo_cliente_id||'',
        placeholder:'Elegir tipo de cliente',actual:p.tipo_cliente_id?{id:p.tipo_cliente_id,nombre:p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre}:null})):campo('Tipo de cliente','-'),
      prosp?campoEd('Contacto',inp('p_contacto_nombre',p.contacto_nombre,' type="text" maxlength="120"')):campo('Contacto','-'),
      prosp?campoEd('Teléfono',inp('p_telefono',p.telefono,' type="tel" maxlength="40"')):campo('Teléfono','-'),
      prosp?campoEd('Email',inp('p_email',p.email,' type="email" maxlength="160"')):campo('Email','-'),
      prosp?campoEd('Referido por',C.htmlSelectConCrear({nombre:'p_referido_por_id',tabla:'crm_referidores',valor:p.referido_por_id||'',
        placeholder:'Referido por (opcional)',actual:p.referido_por_id?{id:p.referido_por_id,nombre:p.crm_referidores&&p.crm_referidores.nombre}:null})):campo('Referido por','-'),
      campoEd('Próximo contacto',inp('proxima_fecha_contacto',l.proxima_fecha_contacto,' type="date"')),
      campo('Creado',fecha(fechaARDeTimestamp(l.created_at))),
      campo('Responsable',nombreResponsable(l))
    ].join('');
  }

  function htmlHistorial(){
    const segs=fl.segs;
    const lista=segs.length
      ?`<div class="vt-segs">${segs.map(s=>`
        <div class="vt-seg">
          <div class="vt-seg-head">
            <span class="vt-seg-tit">${escapeHtml(s.tipo_contacto||'Contacto')} — ${escapeHtml(fecha(s.fecha_contacto))}</span>
            <span class="vt-seg-autor">${escapeHtml(nombreUsuarioSeguimiento(s))}</span>
          </div>
          ${s.nota?`<p class="vt-seg-nota">${escapeHtml(s.nota)}</p>`:''}
          ${s.proxima_fecha_contacto?`<p class="vt-seg-prox">Próximo contacto: ${escapeHtml(fecha(s.proxima_fecha_contacto))}</p>`:''}
        </div>`).join('')}</div>`
      :'<p class="vt-msg">Todavía no hay seguimientos registrados.</p>';
    return `
  <h3 class="vt-fc-h3">Historial de seguimientos (${segs.length})</h3>
  <div class="vt-fc-seg-box">${fl.segAbierto?htmlFormSeguimiento():'<button type="button" class="btn-primary" data-vt-ld="seg-abrir">Registrar seguimiento</button>'}</div>
  ${lista}`;
  }

  function htmlFormSeguimiento(){
    return `
<form class="vt-fc-seg-form" data-vt-ld-seg novalidate autocomplete="off">
  <div class="vt-fc-seg-campos">
    <div class="form-group"><label class="form-label">Fecha de contacto</label>
      <input class="form-input" type="date" name="fecha_contacto" value="${escapeHtml(hoyAR())}"></div>
    <div class="form-group"><label class="form-label">Tipo de contacto</label>
      <select class="form-select" name="tipo_contacto">${TIPOS_CONTACTO.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Próximo contacto (opcional)</label>
      <input class="form-input" type="date" name="proxima_fecha_contacto"></div>
  </div>
  <textarea class="form-textarea" name="nota" rows="2" placeholder="Nota sobre el contacto..."></textarea>
  <p class="vt-error" data-vt-ld-seg-error hidden></p>
  <div class="vt-fc-seg-btns">
    <button type="submit" class="btn-primary" data-vt-ld-seg-guardar>Guardar seguimiento</button>
    <button type="button" class="btn-secondary" data-vt-ld="seg-cancelar">Cancelar</button>
  </div>
</form>`;
  }

  // Repinta solo el historial y "Próximo contacto" (no pisa una edición en curso)
  function pintarHistorial(){
    const h=q('[data-vt-ld-hist]');
    if(h) h.innerHTML=htmlHistorial();
    const pr=q('[data-vt-ld-proxima] .vt-fc-val');
    if(pr&&fl.lead) pr.textContent=fecha(fl.lead.proxima_fecha_contacto);
  }

  async function guardarCambios(){
    if(fl.guardando||!fl.lead) return;
    if(!exigirPermiso(puedeVerModulo('ventas'),MSG_PERMISO_LEAD)) return;
    const form=q('form[data-vt-ld-form]');
    if(!form) return;
    const l=fl.lead, p=l.crm_prospectos, id=l.id;
    const f=form.elements;
    const v=n=>f[n]?String(f[n].value).trim():'';
    const sel=n=>{const x=v(n);return x&&x!=='__crear__'?x:null;};
    mostrarError('[data-vt-ld-error]','');
    const cuerpoLead={proxima_fecha_contacto:v('proxima_fecha_contacto')||null,notas:v('notas')||null};
    const cuerpoProsp=p?{
      tipo_cliente_id:sel('p_tipo_cliente_id'),
      contacto_nombre:v('p_contacto_nombre')||null,
      telefono:v('p_telefono')||null,
      email:v('p_email')||null,
      referido_por_id:sel('p_referido_por_id')
    }:null;
    fl.guardando=true;
    botones('[data-vt-ld="guardar"]',{disabled:true,texto:'Guardando...'});
    botones('[data-vt-ld="cancelar"]',{disabled:true});
    const liberar=()=>{fl.guardando=false;botones('[data-vt-ld="guardar"]',{disabled:false,texto:'Guardar cambios'});botones('[data-vt-ld="cancelar"]',{disabled:false});};
    // 1) Lead
    try{
      const filas=await api('crm_leads?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpoLead)});
      const fila=Array.isArray(filas)?filas[0]:null;
      if(!fila) throw new Error('row-level security');
      if(fl.lead&&fl.lead.id===id) Object.assign(fl.lead,fila);
    }catch(e){
      console.error('[ventas] Error guardando lead',e);
      liberar();
      mostrarError('[data-vt-ld-error]','Error al guardar: '+mensajeError(e,{permiso:MSG_PERMISO_LEAD}));
      return;
    }
    // 2) Prospecto (los datos de contacto viven en crm_prospectos)
    if(cuerpoProsp){
      try{
        const filas=await api('crm_prospectos?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpoProsp)});
        if(!Array.isArray(filas)||!filas[0]) throw new Error('row-level security');
      }catch(e){
        console.error('[ventas] Error guardando prospecto',e);
        liberar();
        fl.recargarAlCancelar=true; // el lead ya cambió: al cancelar se recarga para no mostrar datos viejos
        mostrarError('[data-vt-ld-error]','Se guardó el lead, pero falló el prospecto: '+mensajeError(e,{permiso:'No tenés permiso para modificar este prospecto'}));
        return;
      }
    }
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha del lead',e);}
    fl.guardando=false;
    fl.editando=false;
    fl.recargarAlCancelar=false;
    if(abierta(id)) V.repintar();
  }

  async function cancelarEdicion(){
    if(fl.guardando) return;
    fl.editando=false;
    if(!fl.recargarAlCancelar||!fl.lead){V.repintar();return;}
    const id=fl.lead.id;
    fl.recargarAlCancelar=false;
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha del lead',e);}
    if(abierta(id)) V.repintar();
  }

  function pedirConfirmacionEliminar(){
    const box=q('[data-vt-ld-confirm]');
    if(!box) return;
    box.innerHTML=`<div class="vt-fc-confirm" role="alertdialog">
      <p>${escapeHtml(MSG_CONFIRMAR_ELIMINAR)}</p>
      <div><button type="button" class="btn-danger" data-vt-ld="eliminar-si">Sí, eliminar</button>
      <button type="button" class="btn-secondary" data-vt-ld="eliminar-no">Cancelar</button></div>
    </div>`;
  }

  async function eliminar(){
    if(fl.eliminando||!fl.lead) return;
    const l=fl.lead;
    if(!exigirPermiso(puedeEliminarLead(l),MSG_PERMISO_ELIMINAR)) return;
    mostrarError('[data-vt-ld-error]','');
    fl.eliminando=true;
    botones('[data-vt-ld="eliminar-si"]',{disabled:true,texto:'Eliminando...'});
    botones('[data-vt-ld="eliminar-no"]',{disabled:true});
    botones('[data-vt-ld="eliminar"]',{disabled:true,texto:'Eliminando...'});
    let msg='';
    try{
      const filas=await api('crm_leads?id=eq.'+encodeURIComponent(l.id),{method:'DELETE',headers:{'Prefer':'return=representation'}});
      if(!Array.isArray(filas)||!filas.length) msg=MSG_PERMISO_ELIMINAR;
    }catch(e){
      console.error('[ventas] Error eliminando lead',e);
      const m=mensajeError(e,{permiso:MSG_PERMISO_ELIMINAR});
      msg=m===MSG_PERMISO_ELIMINAR?m:'Error al eliminar: '+m;
    }
    fl.eliminando=false;
    if(msg){
      const box=q('[data-vt-ld-confirm]');
      if(box) box.innerHTML='';
      botones('[data-vt-ld="eliminar"]',{disabled:false,texto:'Eliminar lead'});
      mostrarError('[data-vt-ld-error]',msg);
      return;
    }
    showToast('Lead eliminado','success');
    V.ir('leads');
  }

  async function cambiarEstadoFicha(destino,select){
    const l=fl.lead;
    if(!l||fl.cambiandoEstado||fl.editando) return;
    const r=resolverCambioEstadoLead(l,destino);
    if(r.accion==='convertir'){if(select) select.value=l.estado;abrirConversion(r);return;}
    if(r.accion!=='cambiar') return;
    const id=l.id;
    fl.cambiandoEstado=true;
    if(select) select.disabled=true;
    try{
      const res=await cambiarEstadoLead(id,r.anterior,r.nuevo);
      if(fl.lead&&fl.lead.id===id) Object.assign(fl.lead,res.fila);
      await res.seguimiento;
    }catch(e){
      console.error('[ventas] Error cambiando estado del lead',e);
      fl.cambiandoEstado=false;
      showToast('Error al cambiar el estado: '+mensajeError(e,{permiso:MSG_PERMISO_LEAD}),true);
      if(abierta(id)) V.repintar();
      return;
    }
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha del lead',e);}
    fl.cambiandoEstado=false;
    if(abierta(id)) V.repintar();
  }

  async function guardarSeguimiento(form){
    if(fl.segGuardando||!fl.lead) return;
    const id=fl.lead.id;
    const f=form.elements;
    const fechaContacto=String(f.fecha_contacto.value||'').trim();
    const nota=String(f.nota.value||'').trim();
    mostrarError('[data-vt-ld-seg-error]','');
    if(!fechaContacto){mostrarError('[data-vt-ld-seg-error]','Completá la fecha de contacto.');return;}
    if(!nota){mostrarError('[data-vt-ld-seg-error]','Escribí una nota sobre el contacto.');return;}
    fl.segGuardando=true;
    botones('[data-vt-ld-seg-guardar]',{disabled:true,texto:'Guardando...'});
    try{
      // proxima_fecha_contacto, si se completa, actualiza sola la del lead (trigger de la base)
      await api('crm_seguimientos_leads',{method:'POST',body:JSON.stringify({
        lead_id:id,
        fecha_contacto:fechaContacto,
        tipo_contacto:String(f.tipo_contacto.value||''),
        nota,
        proxima_fecha_contacto:String(f.proxima_fecha_contacto.value||'')||null,
        usuario_id:usuarioActual.id
      })});
    }catch(e){
      console.error('[ventas] Error registrando seguimiento del lead',e);
      fl.segGuardando=false;
      botones('[data-vt-ld-seg-guardar]',{disabled:false,texto:'Guardar seguimiento'});
      mostrarError('[data-vt-ld-seg-error]','Error al guardar: '+mensajeError(e,{permiso:'No tenés permiso para registrar seguimientos en este lead'}));
      return;
    }
    fl.segGuardando=false;
    fl.segAbierto=false;
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha del lead',e);}
    if(!abierta(id)) return;
    if(fl.editando) pintarHistorial(); else V.repintar();
  }

  V.registrarPantalla({
    id:'ficha-lead',
    interna:true,
    resaltar:'leads',
    html:htmlFicha,
    entrar:entrarFicha,
    on:{
      click(e){
        const b=e.target.closest('[data-vt-ld]');
        if(!b||b.disabled) return;
        const acc=b.dataset.vtLd;
        if(acc==='editar'){fl.editando=true;V.repintar();}
        else if(acc==='cancelar') cancelarEdicion();
        else if(acc==='guardar') guardarCambios();
        else if(acc==='eliminar') pedirConfirmacionEliminar();
        else if(acc==='eliminar-no'){const box=q('[data-vt-ld-confirm]');if(box)box.innerHTML='';}
        else if(acc==='eliminar-si') eliminar();
        else if(acc==='convertir'&&fl.lead){const r=resolverCambioEstadoLead(fl.lead,'convertido');if(r.accion==='convertir') abrirConversion(r);}
        else if(acc==='seg-abrir'){fl.segAbierto=true;pintarHistorial();const t=q('form[data-vt-ld-seg] textarea');if(t)t.focus();}
        else if(acc==='seg-cancelar'){if(!fl.segGuardando){fl.segAbierto=false;pintarHistorial();}}
      },
      change(e){
        const s=e.target.closest('[data-vt-ld-estado]');
        if(s) cambiarEstadoFicha(s.value,s);
      },
      submit(e){
        const seg=e.target.closest('form[data-vt-ld-seg]');
        if(seg){e.preventDefault();guardarSeguimiento(seg);return;}
        const ed=e.target.closest('form[data-vt-ld-form]');
        if(ed){e.preventDefault();if(fl.editando) guardarCambios();}
      }
    }
  });

  V.leads={ESTADOS_LEAD,etiquetaEstadoLead,filtrarLeads,agruparLeadsPorEstado,resolverCambioEstadoLead,puedeEliminarLead,fechaARDeTimestamp,cambiarEstadoLead};
})();
