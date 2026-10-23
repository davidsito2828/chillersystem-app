// ══════════════════════════════════════════
//  VENTAS — Agenda: vencimientos de oportunidades (próximo seguimiento) y de leads (próximo
//  contacto) en una sola lista, agrupados en Vencidos / Hoy / Esta semana / Sin fecha programada.
//  Solo lo activo: oportunidades en_seguimiento y leads por_contactar / en_conversacion.
//  Se carga con defer después de ventas-leads.js y registra la pantalla 'agenda'.
//  Reutiliza las globales de index.html: escapeHtml, esGerencia.
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V){console.error('[ventas] ventas-agenda.js necesita ventas.js cargado antes');return;}
  const {hoyAR,fmtMonto,nombreResponsable,mensajeError}=V.util;
  const C=V.comun;

  const RUTA_OPORTUNIDADES='crm_oportunidades?select=*,crm_prospectos(id,nombre,tipo_cliente_id),crm_tipos_servicio(nombre),usuarios(nombre)&estado=eq.en_seguimiento&order=proxima_fecha_seguimiento.asc.nullslast,id.asc';
  const RUTA_LEADS='crm_leads?select=*,crm_prospectos(id,nombre,contacto_nombre),usuarios(nombre)&estado=in.(por_contactar,en_conversacion)&order=proxima_fecha_contacto.asc.nullslast,id.asc';
  const GRUPOS=[
    {id:'vencidos',titulo:'Vencidos',descripcion:'Seguimientos o contactos que ya deberían haberse hecho.'},
    {id:'hoy',titulo:'Hoy',descripcion:'Programados para hoy.'},
    {id:'semana',titulo:'Esta semana',descripcion:'Próximos 7 días.'},
    {id:'sin_fecha',titulo:'Sin fecha programada',descripcion:'En curso pero sin una próxima fecha — fácil perderles el rastro.'}
  ];
  const ETIQUETA_TIPO={oportunidad:'Oportunidad',lead:'Lead'};

  // ── Funciones puras (probadas en Node) ──
  // 'YYYY-MM-DD' → [año, mes, día] o null
  function partes(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso==null?'':String(iso));
    return m?[+m[1],+m[2],+m[3]]:null;
  }
  // Días de 'desde' a 'hasta' (negativo si 'hasta' es anterior), con Date.UTC: sin zona horaria ni cambio de hora
  function diasEntre(desde,hasta){
    const a=partes(desde), b=partes(hasta);
    if(!a||!b) return NaN;
    return Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/86400000);
  }
  // 'mié 23/10': día de la semana con Intl (es-AR, en UTC sobre las partes) + día/mes del texto
  const FMT_DIA=new Intl.DateTimeFormat('es-AR',{weekday:'short',timeZone:'UTC'});
  function fechaCorta(iso){
    const p=partes(iso);
    if(!p) return '';
    const dia=FMT_DIA.format(new Date(Date.UTC(p[0],p[1]-1,p[2]))).replace(/[.,]/g,'').trim();
    return dia+' '+String(p[2]).padStart(2,'0')+'/'+String(p[1]).padStart(2,'0');
  }

  // Normaliza oportunidades y leads a una forma común (como ItemAgenda del original)
  function itemsAgenda({oportunidades=[],leads=[]}={}){
    const ops=(oportunidades||[]).map(o=>({
      id:o.id,
      tipo:'oportunidad',
      cliente:(o.crm_prospectos&&o.crm_prospectos.nombre)||'-',
      subtitulo:(o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre)||'Sin tipo de servicio',
      fecha:o.proxima_fecha_seguimiento||null,
      responsableId:o.responsable_id||null,
      responsableNombre:nombreResponsable(o),
      montoTexto:o.monto_estimado==null?'':fmtMonto(o.monto_estimado,o.moneda||'ARS')
    }));
    const lds=(leads||[]).map(l=>({
      id:l.id,
      tipo:'lead',
      cliente:(l.crm_prospectos&&l.crm_prospectos.nombre)||'-',
      subtitulo:(l.crm_prospectos&&l.crm_prospectos.contacto_nombre)||'Sin contacto',
      fecha:l.proxima_fecha_contacto||null,
      responsableId:l.responsable_id||null,
      responsableNombre:nombreResponsable(l),
      montoTexto:''
    }));
    return ops.concat(lds);
  }

  // Agrupa respecto de hoy ('YYYY-MM-DD'): < 0 vencidos, 0 hoy, 1..7 semana, sin fecha aparte;
  // más de 7 días no se muestra. Vencidos y semana por fecha ascendente (orden estable).
  function agruparAgenda(items,hoy,{tipo='',responsable=''}={}){
    const g={vencidos:[],hoy:[],semana:[],sin_fecha:[]};
    for(const i of (items||[])){
      if(tipo&&i.tipo!==tipo) continue;
      if(responsable&&i.responsableId!==responsable) continue;
      if(!i.fecha){g.sin_fecha.push(i);continue;}
      const diff=diasEntre(hoy,i.fecha);
      if(!Number.isFinite(diff)) continue;
      if(diff<0) g.vencidos.push(i);
      else if(diff===0) g.hoy.push(i);
      else if(diff<=7) g.semana.push(i);
    }
    const porFecha=(a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:0;
    g.vencidos.sort(porFecha);
    g.semana.sort(porFecha);
    return g;
  }

  C.agregarCss(`
.vt-ag-sec{margin-bottom:22px;}
.vt-ag-tit{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin:0 0 2px;}
.vt-ag-tit-vencidos{color:#e11d48;}
.vt-ag-tit-hoy{color:#d97706;}
.vt-ag-tit-semana{color:#475569;}
.vt-ag-tit-sin_fecha{color:#64748b;}
.vt-ag-desc{font-size:11px;color:var(--text-muted);margin:0 0 10px;}
.vt-ag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;}
.vt-ag-card{display:block;width:100%;text-align:left;font-family:inherit;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:10px 12px;cursor:pointer;color:var(--text);}
.vt-ag-card:hover{border-color:var(--accent);}
.vt-ag-card>span{display:block;}
.vt-ag-fila{display:flex!important;align-items:center;justify-content:space-between;gap:8px;}
.vt-ag-tipo{font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;flex-shrink:0;}
.vt-ag-tipo-oportunidad{background:#ccfbf1;color:#0f766e;}
.vt-ag-tipo-lead{background:#e0e7ff;color:#4338ca;}
.vt-ag-fecha{font-size:11px;font-weight:600;color:#64748b;}
.vt-ag-fecha.vt-ag-vencido{color:#e11d48;}
.vt-ag-fecha.vt-ag-hoy{color:#d97706;}
.vt-ag-cliente{font-size:13px;font-weight:600;margin-top:6px;overflow-wrap:anywhere;}
.vt-ag-sub{font-size:11px;color:var(--text-dim);margin-top:2px;}
.vt-ag-pie{margin-top:6px;font-size:11px;}
.vt-ag-monto{font-weight:700;color:#0f766e;}
.vt-ag-resp{color:var(--text-dim);}
`);

  // ══════════════════════════════════════════
  //  PANTALLA: AGENDA
  // ══════════════════════════════════════════
  const ag={cargando:false,error:'',items:[],responsables:[],filtroTipo:'',filtroResp:'',seq:0};

  async function entrar(){
    const seq=++ag.seq;
    ag.cargando=true;ag.error='';V.repintar();
    try{
      const [oportunidades,leads,resp]=await Promise.all([
        C.cargarTodo(RUTA_OPORTUNIDADES),
        C.cargarTodo(RUTA_LEADS),
        esGerencia()?C.cargarResponsables():Promise.resolve([])
      ]);
      if(seq!==ag.seq) return;
      ag.items=itemsAgenda({oportunidades,leads});
      ag.responsables=resp;
    }catch(e){
      if(seq!==ag.seq) return;
      console.error('[ventas] Error cargando la agenda',e);
      ag.error='No se pudo cargar la agenda: '+mensajeError(e);
    }finally{
      if(seq===ag.seq) ag.cargando=false;
    }
    if(seq===ag.seq&&V.vistaActual().vista==='agenda') V.repintar();
  }

  function html(){
    if(ag.cargando&&!ag.items.length) return `<div data-vt-pantalla="agenda"><div class="vt-msg">Cargando…</div></div>`;
    if(ag.error) return `<div data-vt-pantalla="agenda"><div class="vt-msg vt-error">${escapeHtml(ag.error)}</div></div>`;
    const hoy=hoyAR();
    const grupos=agruparAgenda(ag.items,hoy,{tipo:ag.filtroTipo,responsable:esGerencia()?ag.filtroResp:''});
    const opt=(v,t,sel)=>`<option value="${escapeHtml(v)}"${v===sel?' selected':''}>${escapeHtml(t)}</option>`;
    return `
<div data-vt-pantalla="agenda">
  <div class="vt-toolbar">
    <div class="vt-filtros">
      <select class="form-select" data-vt-ag-filtro="tipo">
        ${opt('','Todo (oportunidades y leads)',ag.filtroTipo)}${opt('oportunidad','Solo oportunidades',ag.filtroTipo)}${opt('lead','Solo leads',ag.filtroTipo)}
      </select>
      ${esGerencia()?`<select class="form-select" data-vt-ag-filtro="resp"><option value="">Todos los responsables</option>${ag.responsables.map(r=>opt(r.id,r.nombre,ag.filtroResp)).join('')}</select>`:''}
    </div>
  </div>
  ${GRUPOS.map(gr=>`
  <section class="vt-ag-sec" data-vt-ag-grupo="${gr.id}">
    <h3 class="vt-ag-tit vt-ag-tit-${gr.id}">${escapeHtml(gr.titulo)} (${grupos[gr.id].length})</h3>
    <p class="vt-ag-desc">${escapeHtml(gr.descripcion)}</p>
    ${grupos[gr.id].length?`<div class="vt-ag-grid">${grupos[gr.id].map(i=>htmlTarjeta(i,hoy)).join('')}</div>`:'<p class="vt-msg">Nada por acá.</p>'}
  </section>`).join('')}
</div>`;
  }

  function htmlTarjeta(i,hoy){
    const diff=i.fecha?diasEntre(hoy,i.fecha):null;
    const claseFecha=diff==null?'':diff<0?' vt-ag-vencido':diff===0?' vt-ag-hoy':'';
    const abrir=i.tipo==='lead'?`data-vt-ficha-lead="${escapeHtml(i.id)}"`:`data-vt-ficha="${escapeHtml(i.id)}"`;
    return `
    <button type="button" class="vt-ag-card" ${abrir}>
      <span class="vt-ag-fila">
        <span class="vt-ag-tipo vt-ag-tipo-${i.tipo}">${escapeHtml(ETIQUETA_TIPO[i.tipo]||i.tipo)}</span>
        ${i.fecha?`<span class="vt-ag-fecha${claseFecha}">${escapeHtml(fechaCorta(i.fecha)+(diff<0?` (vencido hace ${Math.abs(diff)}d)`:''))}</span>`:''}
      </span>
      <span class="vt-ag-cliente">${escapeHtml(i.cliente)}</span>
      <span class="vt-ag-sub">${escapeHtml(i.subtitulo)}</span>
      <span class="vt-ag-fila vt-ag-pie"><span class="vt-ag-monto">${escapeHtml(i.montoTexto||'')}</span><span class="vt-ag-resp">${escapeHtml(i.responsableNombre)}</span></span>
    </button>`;
  }

  V.registrarPantalla({
    id:'agenda',
    html,
    entrar,
    on:{
      change(e){
        const f=e.target.closest('[data-vt-ag-filtro]');
        if(!f) return;
        if(f.dataset.vtAgFiltro==='tipo') ag.filtroTipo=f.value; else ag.filtroResp=f.value;
        V.repintar();
      }
    }
  });

  V.agenda={diasEntre,fechaCorta,itemsAgenda,agruparAgenda};
})();
