// ══════════════════════════════════════════
//  VENTAS — Listados de oportunidades y de leads: filtros, orden por columna y exportación a
//  Excel (con los helpers de Ventas.comun). Se carga con defer después de ventas-ficha.js y
//  registra las pantallas 'listado' y 'leads-listado' (interna, resalta "Leads").
//  Los datos de leads (estados, fecha AR de created_at) vienen de V.leads (ventas-leads.js, que se
//  carga después): se usan recién al dibujar o exportar, no al cargar este archivo.
//  Reutiliza las globales de index.html: api, escapeHtml, showToast, esGerencia, ExcelJS (CDN).
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V){console.error('[ventas] ventas-listado.js necesita ventas.js cargado antes');return;}
  const {fmtFecha,hoyAR,fmtMonto,ESTADOS,etiquetaEstado,nombreResponsable,mensajeError}=V.util;
  const C=V.comun;
  const {fechaExcel,numeroExcel,textoExcel}=C;
  const LD=()=>V.leads;

  const RUTA_LISTADO='crm_oportunidades?select=*,crm_prospectos(id,nombre,tipo_cliente_id,contacto_nombre,telefono,email,referido_por_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),crm_tipos_servicio(nombre),usuarios(nombre)&order=fecha_ingreso.desc,id.asc';
  const RUTA_LEADS='crm_leads?select=*,crm_prospectos(id,nombre,tipo_cliente_id,contacto_nombre,telefono,email,referido_por_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),usuarios(nombre)&order=created_at.desc,id.asc';

  // ── Funciones puras comunes ──
  const pr=o=>(o&&o.crm_prospectos)||{};
  function comparar(a,b){return a.localeCompare(b,'es',{sensitivity:'base'});}
  // Al tocar la columna activa se invierte; una columna nueva empieza ascendente
  function siguienteOrden(actual,col){
    if(actual.col===col) return {col,dir:actual.dir==='asc'?'desc':'asc'};
    return {col,dir:'asc'};
  }
  const incluye=(v,q)=>String(v||'').toLowerCase().includes(q);

  // ── Oportunidades (probadas en Node) ──
  // Texto que se compara al ordenar por cada columna (igual que valorColumna del original)
  function valorColumna(o,col){
    switch(col){
      case 'numero_referencia': return o.numero_referencia||'';
      case 'fecha_ingreso': return o.fecha_ingreso||'';
      case 'cliente': return pr(o).nombre||'';
      case 'tipo_cliente': return (pr(o).crm_tipos_cliente&&pr(o).crm_tipos_cliente.nombre)||'';
      case 'tipo_servicio': return (o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre)||'';
      case 'monto_estimado': return String(o.monto_estimado==null?0:o.monto_estimado);
      case 'estado': return o.estado||'';
      case 'es_compulsa': return o.es_compulsa===true?'1':'0';
      case 'fecha_envio': return o.fecha_envio||'';
      case 'proxima_fecha_seguimiento': return o.proxima_fecha_seguimiento||'';
      case 'responsable': return nombreResponsable(o);
    }
    return '';
  }

  // compulsa: '' todas, 'si' solo compulsas, 'no' sin compulsa
  function filtrarListado(lista,{busqueda='',estado='',responsable='',tipoCliente='',compulsa=''}={}){
    const q=String(busqueda||'').trim().toLowerCase();
    return (lista||[]).filter(o=>
      (!q||incluye(pr(o).nombre,q)||incluye(o.numero_referencia,q)||incluye(o.comentarios,q))&&
      (!estado||o.estado===estado)&&
      (!compulsa||(compulsa==='si')===(o.es_compulsa===true))&&
      (!responsable||o.responsable_id===responsable)&&
      (!tipoCliente||pr(o).tipo_cliente_id===tipoCliente));
  }

  // Orden estable; el monto se compara como número, el resto como texto ('es', sin mayúsculas ni acentos)
  function ordenarListado(lista,col,dir){
    const signo=dir==='asc'?1:-1;
    return (lista||[]).slice().sort((a,b)=>{
      if(col==='monto_estimado') return signo*((Number(a.monto_estimado)||0)-(Number(b.monto_estimado)||0));
      return signo*comparar(valorColumna(a,col),valorColumna(b,col));
    });
  }

  const COLUMNAS_EXCEL=[
    {key:'numero_referencia',header:'N° de referencia',width:16},
    {key:'fecha_ingreso',header:'Fecha de ingreso',width:14,tipo:'fecha'},
    {key:'cliente',header:'Cliente',width:30},
    {key:'tipo_cliente',header:'Tipo de cliente',width:18},
    {key:'contacto',header:'Contacto',width:22},
    {key:'telefono',header:'Teléfono',width:18},
    {key:'email',header:'Email',width:26},
    {key:'referido_por',header:'Referido por',width:20},
    {key:'cantidad_equipos',header:'Cantidad de equipos',width:12,tipo:'entero'},
    {key:'tipo_servicio',header:'Tipo de servicio',width:22},
    {key:'moneda',header:'Moneda',width:10},
    {key:'monto_estimado',header:'Monto estimado',width:16,tipo:'monto'},
    {key:'estado',header:'Estado',width:15},
    {key:'compulsa',header:'Compulsa',width:11},
    {key:'fecha_envio',header:'Fecha de envío',width:14,tipo:'fecha'},
    {key:'proxima_fecha_seguimiento',header:'Próximo seguimiento',width:14,tipo:'fecha'},
    {key:'comentarios',header:'Comentarios',width:40},
    {key:'comision',header:'Comisión',width:14,tipo:'monto'},
    {key:'responsable',header:'Responsable',width:20}
  ];

  // Una fila por oportunidad, con fechas como Date y montos/cantidades como número
  function filasExcel(lista){
    return (lista||[]).map(o=>{
      const p=pr(o);
      return {
        numero_referencia:textoExcel(o.numero_referencia),
        fecha_ingreso:fechaExcel(o.fecha_ingreso),
        cliente:textoExcel(p.nombre),
        tipo_cliente:textoExcel(p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre),
        contacto:textoExcel(p.contacto_nombre),
        telefono:textoExcel(p.telefono),
        email:textoExcel(p.email),
        referido_por:textoExcel(p.crm_referidores&&p.crm_referidores.nombre),
        cantidad_equipos:numeroExcel(o.cantidad_equipos),
        tipo_servicio:textoExcel(o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre),
        moneda:o.moneda==='USD'?'USD':'ARS',
        monto_estimado:numeroExcel(o.monto_estimado),
        estado:etiquetaEstado(o.estado),
        compulsa:o.es_compulsa===true?'Sí':'No',
        fecha_envio:fechaExcel(o.fecha_envio),
        proxima_fecha_seguimiento:fechaExcel(o.proxima_fecha_seguimiento),
        comentarios:textoExcel(o.comentarios),
        comision:numeroExcel(o.comision_monto),
        responsable:nombreResponsable(o)
      };
    });
  }
  // Libro con la hoja 'Oportunidades' (recibe ExcelJS para poder probarlo en Node)
  function construirLibro(ExcelJSLib,lista){
    return C.libroExcel(ExcelJSLib,{hoja:'Oportunidades',columnas:COLUMNAS_EXCEL,filas:filasExcel(lista)});
  }
  function nombreArchivo(){return 'oportunidades_ventas_'+hoyAR()+'.xlsx';}

  // ── Leads (probadas en Node) ──
  // Columna "Fecha ingreso" = created_at; se ordena por el timestamp completo (como el original)
  function valorColumnaLead(l,col){
    switch(col){
      case 'fecha_ingreso': return l.created_at||'';
      case 'cliente': return pr(l).nombre||'';
      case 'tipo_cliente': return (pr(l).crm_tipos_cliente&&pr(l).crm_tipos_cliente.nombre)||'';
      case 'estado': return l.estado||'';
      case 'proxima_fecha_contacto': return l.proxima_fecha_contacto||'';
      case 'responsable': return (l.usuarios&&l.usuarios.nombre)||'';
    }
    return '';
  }
  function filtrarListadoLeads(lista,{busqueda='',estado='',responsable='',tipoCliente=''}={}){
    const q=String(busqueda||'').trim().toLowerCase();
    return (lista||[]).filter(l=>
      (!q||incluye(pr(l).nombre,q)||incluye(l.notas,q))&&
      (!estado||l.estado===estado)&&
      (!responsable||l.responsable_id===responsable)&&
      (!tipoCliente||pr(l).tipo_cliente_id===tipoCliente));
  }
  function ordenarListadoLeads(lista,col,dir){
    const signo=dir==='asc'?1:-1;
    return (lista||[]).slice().sort((a,b)=>signo*comparar(valorColumnaLead(a,col),valorColumnaLead(b,col)));
  }
  const COLUMNAS_EXCEL_LEADS=[
    {key:'fecha_ingreso',header:'Fecha de ingreso',width:14,tipo:'fecha'},
    {key:'cliente',header:'Cliente',width:30},
    {key:'tipo_cliente',header:'Tipo de cliente',width:18},
    {key:'contacto',header:'Contacto',width:22},
    {key:'telefono',header:'Teléfono',width:18},
    {key:'estado',header:'Estado',width:24},
    {key:'proximo_contacto',header:'Próximo contacto',width:14,tipo:'fecha'},
    {key:'notas',header:'Notas',width:40},
    {key:'responsable',header:'Responsable',width:20}
  ];
  // Fecha de ingreso = día de created_at en hora argentina
  function filasExcelLeads(lista){
    return (lista||[]).map(l=>{
      const p=pr(l);
      return {
        fecha_ingreso:fechaExcel(LD().fechaARDeTimestamp(l.created_at)),
        cliente:textoExcel(p.nombre),
        tipo_cliente:textoExcel(p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre),
        contacto:textoExcel(p.contacto_nombre),
        telefono:textoExcel(p.telefono),
        estado:LD().etiquetaEstadoLead(l.estado),
        proximo_contacto:fechaExcel(l.proxima_fecha_contacto),
        notas:textoExcel(l.notas),
        responsable:nombreResponsable(l)
      };
    });
  }
  function construirLibroLeads(ExcelJSLib,lista){
    return C.libroExcel(ExcelJSLib,{hoja:'Leads',columnas:COLUMNAS_EXCEL_LEADS,filas:filasExcelLeads(lista)});
  }
  function nombreArchivoLeads(){return 'leads_ventas_'+hoyAR()+'.xlsx';}

  C.agregarCss(`
.vt-ls-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.vt-ls-filtros .form-input{width:260px;max-width:100%;}
.vt-ls-filtros .form-select{width:auto;min-width:170px;}
.vt-ls-tit{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim);margin:14px 0 8px;}
.vt-ls-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);}
.vt-ls-tabla{width:100%;min-width:1280px;border-collapse:collapse;font-size:12px;}
.vt-ls-tabla.vt-ls-leads{min-width:900px;}
.vt-ls-tabla th{background:var(--bg3);color:var(--text-dim);font-weight:600;text-align:left;padding:9px 10px;border-bottom:1px solid var(--border);white-space:nowrap;}
.vt-ls-tabla td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:top;}
.vt-ls-tabla tbody tr:last-child td{border-bottom:0;}
.vt-ls-orden{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;white-space:nowrap;}
.vt-ls-orden:hover{color:var(--accent);}
.vt-ls-com{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vt-ls-tabla .vt-link{white-space:nowrap;}
.vt-ls-volver{margin-bottom:12px;}
.vt-badge-lead-por_contactar{background:#f1f5f9;color:#334155;}
.vt-badge-lead-en_conversacion{background:#fef3c7;color:#b45309;}
.vt-badge-lead-convertido{background:#d1fae5;color:#047857;}
.vt-badge-lead-sin_interes{background:#ffe4e6;color:#be123c;}
`);

  const fecha=f=>f?fmtFecha(f):'-';
  const txt=v=>escapeHtml(v==null?'-':v);
  const opt=(v,t,sel)=>`<option value="${escapeHtml(v)}"${v===sel?' selected':''}>${escapeHtml(t)}</option>`;

  // ══════════════════════════════════════════
  //  Pantalla de listado genérica: carga paginada, filtros (búsqueda, estado, responsable solo
  //  para gerencia, tipo de cliente), orden por encabezado y "Exportar a Excel" de lo visible.
  //  cfg: {id, interna?, resaltar?, ruta, error, cabecera?, placeholder, estados(), filtroCompulsa?, filtrar, ordenar,
  //        htmlTabla(lista, th), vacio, excel(lista) → {hoja, columnas, filas, archivo}}
  // ══════════════════════════════════════════
  function crearPantallaListado(cfg){
    const st={cargando:false,error:'',datos:[],responsables:[],busqueda:'',estado:'',resp:'',tipo:'',compulsa:'',
      orden:{col:'fecha_ingreso',dir:'desc'},exportando:false,seq:0};
    const enVista=()=>V.vistaActual().vista===cfg.id;

    async function entrar(){
      const seq=++st.seq;
      st.cargando=true;st.error='';V.repintar();
      try{
        const [datos,resp]=await Promise.all([
          C.cargarTodo(cfg.ruta),
          esGerencia()?C.cargarResponsables():Promise.resolve([]),
          C.cargarCatalogosActivos(['crm_tipos_cliente'])
        ]);
        if(seq!==st.seq) return;
        st.datos=datos;
        st.responsables=resp;
      }catch(e){
        if(seq!==st.seq) return;
        console.error('[ventas] Error cargando '+cfg.id,e);
        st.error=cfg.error+mensajeError(e);
      }finally{
        if(seq===st.seq) st.cargando=false;
      }
      if(seq===st.seq&&enVista()) V.repintar();
    }

    function visibles(){
      const f=cfg.filtrar(st.datos,{busqueda:st.busqueda,estado:st.estado,responsable:esGerencia()?st.resp:'',tipoCliente:st.tipo,compulsa:st.compulsa});
      return cfg.ordenar(f,st.orden.col,st.orden.dir);
    }

    function html(){
      const cab=cfg.cabecera||'';
      const envolver=c=>`<div data-vt-pantalla="${escapeHtml(cfg.id)}">${cab}${c}</div>`;
      if(st.cargando&&!st.datos.length) return envolver('<div class="vt-msg">Cargando…</div>');
      if(st.error) return envolver(`<div class="vt-msg vt-error">${escapeHtml(st.error)}</div>`);
      return envolver(`
  <div class="vt-toolbar">
    <div class="vt-ls-filtros">
      <input type="text" class="form-input" data-vt-ls="busqueda" placeholder="${escapeHtml(cfg.placeholder)}" value="${escapeHtml(st.busqueda)}" autocomplete="off">
      <select class="form-select" data-vt-ls="estado"><option value="">Todos los estados</option>${cfg.estados().map(e=>opt(e.valor,e.etiqueta,st.estado)).join('')}</select>
      ${esGerencia()?`<select class="form-select" data-vt-ls="resp"><option value="">Todos los responsables</option>${st.responsables.map(r=>opt(r.id,r.nombre,st.resp)).join('')}</select>`:''}
      <select class="form-select" data-vt-ls="tipo"><option value="">Todos los tipos de cliente</option>${C.catalogo('crm_tipos_cliente').map(t=>opt(t.id,t.nombre,st.tipo)).join('')}</select>
      ${cfg.filtroCompulsa?`<select class="form-select" data-vt-ls="compulsa" aria-label="Compulsa">${opt('','Todas',st.compulsa)}${opt('si','Solo compulsas',st.compulsa)}${opt('no','Sin compulsa',st.compulsa)}</select>`:''}
    </div>
    <button type="button" class="btn-secondary" data-vt-ls-exportar${st.exportando?' disabled':''}>${st.exportando?'Generando…':'Exportar a Excel'}</button>
  </div>
  <div data-vt-ls-res>${htmlResultados()}</div>`);
    }

    function th(col,etq){
      const ind=st.orden.col!==col?'':st.orden.dir==='asc'?' ▲':' ▼';
      const aria=st.orden.col!==col?'none':st.orden.dir==='asc'?'ascending':'descending';
      return `<th aria-sort="${aria}"><button type="button" class="vt-ls-orden" data-vt-orden="${escapeHtml(col)}">${escapeHtml(etq)}${ind}</button></th>`;
    }

    function htmlResultados(){
      const lista=visibles();
      return `
  <div class="vt-ls-tit">Listado (${lista.length})</div>
  <div class="vt-ls-wrap">${cfg.htmlTabla(lista,th)}</div>
  ${lista.length?'':`<p class="vt-msg">${escapeHtml(cfg.vacio)}</p>`}`;
    }

    // Redibuja solo la tabla (no los filtros, así la búsqueda no pierde el foco)
    function repintarResultados(){
      const b=C.cuerpo();
      const r=b&&b.querySelector('[data-vt-ls-res]');
      if(r) r.innerHTML=htmlResultados(); else V.repintar();
    }

    async function exportar(){
      if(st.exportando||!C.excelDisponible()) return;
      const lista=visibles();
      st.exportando=true;V.repintar();
      try{
        await C.exportarExcel(cfg.excel(lista));
      }finally{
        st.exportando=false;
        if(enVista()) V.repintar();
      }
    }

    function aplicarFiltro(el){
      const k=el.dataset.vtLs;
      if(k==='busqueda') st.busqueda=el.value;
      else if(k==='estado') st.estado=el.value;
      else if(k==='resp') st.resp=el.value;
      else if(k==='tipo') st.tipo=el.value;
      else if(k==='compulsa'&&cfg.filtroCompulsa) st.compulsa=el.value;
      else return;
      repintarResultados();
    }

    V.registrarPantalla({
      id:cfg.id,
      interna:!!cfg.interna,
      resaltar:cfg.resaltar,
      html,
      entrar,
      on:{
        click(e){
          const o=e.target.closest('[data-vt-orden]');
          if(o){st.orden=siguienteOrden(st.orden,o.dataset.vtOrden);repintarResultados();return;}
          const x=e.target.closest('[data-vt-ls-exportar]');
          if(x&&!x.disabled) exportar();
        },
        input(e){if(e.target.matches('[data-vt-ls="busqueda"]')) aplicarFiltro(e.target);},
        change(e){if(e.target.matches('select[data-vt-ls]')) aplicarFiltro(e.target);},
        keydown(e){if(e.key==='Enter'&&e.target.matches('[data-vt-ls="busqueda"]')) e.preventDefault();}
      }
    });
  }

  // ══════════════════════════════════════════
  //  PANTALLA: LISTADO DE OPORTUNIDADES
  // ══════════════════════════════════════════
  crearPantallaListado({
    id:'listado',
    ruta:RUTA_LISTADO,
    error:'No se pudo cargar el listado: ',
    placeholder:'Buscar por cliente, N° o comentarios...',
    estados:()=>ESTADOS,
    filtroCompulsa:true,
    filtrar:filtrarListado,
    ordenar:ordenarListado,
    vacio:'No hay oportunidades que coincidan.',
    excel:lista=>({hoja:'Oportunidades',columnas:COLUMNAS_EXCEL,filas:filasExcel(lista),archivo:nombreArchivo()}),
    htmlTabla(lista,th){
      const filas=lista.map(o=>{
        const p=pr(o);
        const telEmail=[p.telefono,p.email].filter(Boolean).join(' / ')||'-';
        return `
      <tr>
        <td><button type="button" class="vt-link" data-vt-ficha="${escapeHtml(o.id)}">${escapeHtml(o.numero_referencia||'Ver')}</button></td>
        <td>${escapeHtml(fecha(o.fecha_ingreso))}</td>
        <td>${txt(p.nombre)}</td>
        <td>${txt(p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre)}</td>
        <td>${txt(p.contacto_nombre)}</td>
        <td>${escapeHtml(telEmail)}</td>
        <td>${txt(p.crm_referidores&&p.crm_referidores.nombre)}</td>
        <td>${txt(o.cantidad_equipos)}</td>
        <td>${txt(o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre)}</td>
        <td>${escapeHtml(o.monto_estimado==null?'-':fmtMonto(o.monto_estimado,o.moneda))}</td>
        <td><span class="vt-badge vt-badge-${escapeHtml(o.estado)}">${escapeHtml(etiquetaEstado(o.estado))}</span></td>
        <td>${escapeHtml(o.es_compulsa===true?'Sí':'-')}</td>
        <td>${escapeHtml(fecha(o.fecha_envio))}</td>
        <td>${escapeHtml(fecha(o.proxima_fecha_seguimiento))}</td>
        <td class="vt-ls-com" title="${escapeHtml(o.comentarios||'')}">${txt(o.comentarios)}</td>
        <td>${escapeHtml(o.comision_monto?fmtMonto(o.comision_monto,o.moneda):'-')}</td>
        <td>${escapeHtml(nombreResponsable(o))}</td>
      </tr>`;
      }).join('');
      return `
    <table class="vt-ls-tabla">
      <thead><tr>
        ${th('numero_referencia','N°')}${th('fecha_ingreso','Fecha ingreso')}${th('cliente','Cliente')}${th('tipo_cliente','Tipo cliente')}
        <th>Contacto</th><th>Teléfono/Email</th><th>Referido por</th><th>Cant. equipos</th>
        ${th('tipo_servicio','Tipo servicio')}${th('monto_estimado','Monto estimado')}${th('estado','Estado')}${th('es_compulsa','Compulsa')}${th('fecha_envio','Fecha envío')}${th('proxima_fecha_seguimiento','Prox. seguimiento')}
        <th>Comentarios</th><th>Comisión</th>
        ${th('responsable','Responsable')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
    }
  });

  // ══════════════════════════════════════════
  //  PANTALLA: LISTADO DE LEADS (interna, resalta "Leads")
  // ══════════════════════════════════════════
  crearPantallaListado({
    id:'leads-listado',
    interna:true,
    resaltar:'leads',
    ruta:RUTA_LEADS,
    error:'No se pudo cargar el listado de leads: ',
    cabecera:'<div class="vt-ls-volver"><button type="button" class="btn-secondary" data-vt-ir="leads">← Volver a Leads</button></div>',
    placeholder:'Buscar por cliente o notas...',
    estados:()=>LD().ESTADOS_LEAD,
    filtrar:filtrarListadoLeads,
    ordenar:ordenarListadoLeads,
    vacio:'No hay leads que coincidan.',
    excel:lista=>({hoja:'Leads',columnas:COLUMNAS_EXCEL_LEADS,filas:filasExcelLeads(lista),archivo:nombreArchivoLeads()}),
    htmlTabla(lista,th){
      const filas=lista.map(l=>{
        const p=pr(l);
        return `
      <tr>
        <td>${escapeHtml(fecha(LD().fechaARDeTimestamp(l.created_at)))}</td>
        <td><button type="button" class="vt-link" data-vt-ficha-lead="${escapeHtml(l.id)}">${escapeHtml(p.nombre||'Ver')}</button></td>
        <td>${txt(p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre)}</td>
        <td>${txt(p.contacto_nombre)}</td>
        <td><span class="vt-badge vt-badge-lead-${escapeHtml(l.estado)}">${escapeHtml(LD().etiquetaEstadoLead(l.estado))}</span></td>
        <td>${escapeHtml(fecha(l.proxima_fecha_contacto))}</td>
        <td>${escapeHtml(nombreResponsable(l))}</td>
      </tr>`;
      }).join('');
      return `
    <table class="vt-ls-tabla vt-ls-leads">
      <thead><tr>
        ${th('fecha_ingreso','Fecha ingreso')}${th('cliente','Cliente')}${th('tipo_cliente','Tipo cliente')}
        <th>Contacto</th>
        ${th('estado','Estado')}${th('proxima_fecha_contacto','Próximo contacto')}${th('responsable','Responsable')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
    }
  });

  V.listado={filtrarListado,ordenarListado,siguienteOrden,valorColumna,filasExcel,construirLibro,fechaExcel,nombreArchivo,COLUMNAS_EXCEL,
    valorColumnaLead,filtrarListadoLeads,ordenarListadoLeads,filasExcelLeads,construirLibroLeads,nombreArchivoLeads,COLUMNAS_EXCEL_LEADS};
})();
