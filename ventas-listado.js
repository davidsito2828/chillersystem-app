// ══════════════════════════════════════════
//  VENTAS — Listado de oportunidades: filtros, orden por columna y exportación a Excel (ExcelJS)
//  Se carga con defer después de ventas-ficha.js y registra la pantalla 'listado' en window.Ventas.
//  Reutiliza las globales de index.html: api, escapeHtml, showToast, esGerencia, ExcelJS (CDN).
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V){console.error('[ventas] ventas-listado.js necesita ventas.js cargado antes');return;}
  const {fmtFecha,hoyAR,fmtMonto,ESTADOS,etiquetaEstado,nombreResponsable,mensajeError}=V.util;
  const C=V.comun;

  const RUTA_LISTADO='crm_oportunidades?select=*,crm_prospectos(id,nombre,tipo_cliente_id,contacto_nombre,telefono,email,referido_por_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),crm_tipos_servicio(nombre),usuarios(nombre)&order=fecha_ingreso.desc,id.asc';
  const MSG_SIN_EXCELJS='No se pudo cargar la librería de Excel. Revisá la conexión.';

  // ── Funciones puras (probadas en Node) ──
  const pr=o=>(o&&o.crm_prospectos)||{};
  function comparar(a,b){return a.localeCompare(b,'es',{sensitivity:'base'});}

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
      case 'fecha_envio': return o.fecha_envio||'';
      case 'proxima_fecha_seguimiento': return o.proxima_fecha_seguimiento||'';
      case 'responsable': return nombreResponsable(o);
    }
    return '';
  }

  function filtrarListado(lista,{busqueda='',estado='',responsable='',tipoCliente=''}={}){
    const q=String(busqueda||'').trim().toLowerCase();
    return (lista||[]).filter(o=>
      (!q||String(pr(o).nombre||'').toLowerCase().includes(q)||String(o.numero_referencia||'').toLowerCase().includes(q)||String(o.comentarios||'').toLowerCase().includes(q))&&
      (!estado||o.estado===estado)&&
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

  // Al tocar la columna activa se invierte; una columna nueva empieza ascendente
  function siguienteOrden(actual,col){
    if(actual.col===col) return {col,dir:actual.dir==='asc'?'desc':'asc'};
    return {col,dir:'asc'};
  }

  // 'YYYY-MM-DD' → Date en UTC (Excel la guarda sin corrimiento de día) o null
  function fechaExcel(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso==null?'':String(iso));
    return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;
  }
  function numeroExcel(v){
    if(v==null||v==='') return null;
    const n=Number(v);
    return Number.isFinite(n)?n:null;
  }
  const textoExcel=v=>v==null?'':String(v);

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
    {key:'fecha_envio',header:'Fecha de envío',width:14,tipo:'fecha'},
    {key:'proxima_fecha_seguimiento',header:'Próximo seguimiento',width:14,tipo:'fecha'},
    {key:'comentarios',header:'Comentarios',width:40},
    {key:'comision',header:'Comisión',width:14,tipo:'monto'},
    {key:'responsable',header:'Responsable',width:20}
  ];
  const FORMATOS={fecha:'dd/mm/yyyy',monto:'#,##0',entero:'0'};

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
    const wb=new ExcelJSLib.Workbook();
    const ws=wb.addWorksheet('Oportunidades');
    ws.columns=COLUMNAS_EXCEL.map(c=>({key:c.key,header:c.header,width:c.width,style:FORMATOS[c.tipo]?{numFmt:FORMATOS[c.tipo]}:{}}));
    filasExcel(lista).forEach(f=>ws.addRow(f));
    const enc=ws.getRow(1);
    enc.font={bold:true};
    enc.eachCell(cel=>{cel.numFmt='General';});
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:COLUMNAS_EXCEL.length}};
    return wb;
  }
  function nombreArchivo(){return 'oportunidades_ventas_'+hoyAR()+'.xlsx';}

  // ══════════════════════════════════════════
  //  PANTALLA: LISTADO
  // ══════════════════════════════════════════
  const ls={cargando:false,error:'',oportunidades:[],responsables:[],busqueda:'',estado:'',resp:'',tipo:'',orden:{col:'fecha_ingreso',dir:'desc'},exportando:false,seq:0};

  C.agregarCss(`
.vt-ls-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.vt-ls-filtros .form-input{width:260px;max-width:100%;}
.vt-ls-filtros .form-select{width:auto;min-width:170px;}
.vt-ls-tit{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim);margin:14px 0 8px;}
.vt-ls-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);}
.vt-ls-tabla{width:100%;min-width:1280px;border-collapse:collapse;font-size:12px;}
.vt-ls-tabla th{background:var(--bg3);color:var(--text-dim);font-weight:600;text-align:left;padding:9px 10px;border-bottom:1px solid var(--border);white-space:nowrap;}
.vt-ls-tabla td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:top;}
.vt-ls-tabla tbody tr:last-child td{border-bottom:0;}
.vt-ls-orden{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;white-space:nowrap;}
.vt-ls-orden:hover{color:var(--accent);}
.vt-ls-com{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vt-ls-tabla .vt-link{white-space:nowrap;}
`);

  async function entrarListado(){
    const seq=++ls.seq;
    ls.cargando=true;ls.error='';V.repintar();
    try{
      const [ops,resp]=await Promise.all([
        C.cargarTodo(RUTA_LISTADO),
        esGerencia()?C.cargarResponsables():Promise.resolve([]),
        C.cargarCatalogosActivos(['crm_tipos_cliente'])
      ]);
      if(seq!==ls.seq) return;
      ls.oportunidades=ops;
      ls.responsables=resp;
    }catch(e){
      if(seq!==ls.seq) return;
      console.error('[ventas] Error cargando el listado',e);
      ls.error='No se pudo cargar el listado: '+mensajeError(e);
    }finally{
      if(seq===ls.seq) ls.cargando=false;
    }
    if(seq===ls.seq&&V.vistaActual().vista==='listado') V.repintar();
  }

  function visibles(){
    const filtrados=filtrarListado(ls.oportunidades,{busqueda:ls.busqueda,estado:ls.estado,responsable:esGerencia()?ls.resp:'',tipoCliente:ls.tipo});
    return ordenarListado(filtrados,ls.orden.col,ls.orden.dir);
  }

  function htmlListado(){
    if(ls.cargando&&!ls.oportunidades.length) return `<div data-vt-pantalla="listado"><div class="vt-msg">Cargando…</div></div>`;
    if(ls.error) return `<div data-vt-pantalla="listado"><div class="vt-msg vt-error">${escapeHtml(ls.error)}</div></div>`;
    const opt=(v,t,sel)=>`<option value="${escapeHtml(v)}"${v===sel?' selected':''}>${escapeHtml(t)}</option>`;
    return `
<div data-vt-pantalla="listado">
  <div class="vt-toolbar">
    <div class="vt-ls-filtros">
      <input type="text" class="form-input" data-vt-ls="busqueda" placeholder="Buscar por cliente, N° o comentarios..." value="${escapeHtml(ls.busqueda)}" autocomplete="off">
      <select class="form-select" data-vt-ls="estado"><option value="">Todos los estados</option>${ESTADOS.map(e=>opt(e.valor,e.etiqueta,ls.estado)).join('')}</select>
      ${esGerencia()?`<select class="form-select" data-vt-ls="resp"><option value="">Todos los responsables</option>${ls.responsables.map(r=>opt(r.id,r.nombre,ls.resp)).join('')}</select>`:''}
      <select class="form-select" data-vt-ls="tipo"><option value="">Todos los tipos de cliente</option>${C.catalogo('crm_tipos_cliente').map(t=>opt(t.id,t.nombre,ls.tipo)).join('')}</select>
    </div>
    <button type="button" class="btn-secondary" data-vt-ls-exportar${ls.exportando?' disabled':''}>${ls.exportando?'Generando…':'Exportar a Excel'}</button>
  </div>
  <div data-vt-ls-res>${htmlResultados()}</div>
</div>`;
  }

  const fecha=f=>f?fmtFecha(f):'-';
  const txt=v=>escapeHtml(v==null?'-':v);

  function htmlResultados(){
    const lista=visibles();
    const th=(col,etq)=>{
      const ind=ls.orden.col!==col?'':ls.orden.dir==='asc'?' ▲':' ▼';
      const aria=ls.orden.col!==col?'none':ls.orden.dir==='asc'?'ascending':'descending';
      return `<th aria-sort="${aria}"><button type="button" class="vt-ls-orden" data-vt-orden="${col}">${escapeHtml(etq)}${ind}</button></th>`;
    };
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
        <td>${escapeHtml(fecha(o.fecha_envio))}</td>
        <td>${escapeHtml(fecha(o.proxima_fecha_seguimiento))}</td>
        <td class="vt-ls-com" title="${escapeHtml(o.comentarios||'')}">${txt(o.comentarios)}</td>
        <td>${escapeHtml(o.comision_monto?fmtMonto(o.comision_monto,o.moneda):'-')}</td>
        <td>${escapeHtml(nombreResponsable(o))}</td>
      </tr>`;
    }).join('');
    return `
  <div class="vt-ls-tit">Listado (${lista.length})</div>
  <div class="vt-ls-wrap">
    <table class="vt-ls-tabla">
      <thead><tr>
        ${th('numero_referencia','N°')}${th('fecha_ingreso','Fecha ingreso')}${th('cliente','Cliente')}${th('tipo_cliente','Tipo cliente')}
        <th>Contacto</th><th>Teléfono/Email</th><th>Referido por</th><th>Cant. equipos</th>
        ${th('tipo_servicio','Tipo servicio')}${th('monto_estimado','Monto estimado')}${th('estado','Estado')}${th('fecha_envio','Fecha envío')}${th('proxima_fecha_seguimiento','Prox. seguimiento')}
        <th>Comentarios</th><th>Comisión</th>
        ${th('responsable','Responsable')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>
  ${lista.length?'':'<p class="vt-msg">No hay oportunidades que coincidan.</p>'}`;
  }

  // Redibuja solo la tabla (no los filtros, así la búsqueda no pierde el foco)
  function repintarResultados(){
    const b=C.cuerpo();
    const r=b&&b.querySelector('[data-vt-ls-res]');
    if(r) r.innerHTML=htmlResultados(); else V.repintar();
  }

  // Descarga igual que exportarSeguimientoExcel de index.html (Blob + enlace con download)
  function descargar(buf,nombre){
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportar(){
    if(ls.exportando) return;
    if(!window.ExcelJS){showToast(MSG_SIN_EXCELJS,true);return;}
    const lista=visibles();
    ls.exportando=true;V.repintar();
    try{
      const buf=await construirLibro(window.ExcelJS,lista).xlsx.writeBuffer();
      descargar(buf,nombreArchivo());
    }catch(e){
      console.error('[ventas] Error exportando el listado',e);
      showToast('Error al generar el Excel: '+mensajeError(e),true);
    }finally{
      ls.exportando=false;
      if(V.vistaActual().vista==='listado') V.repintar();
    }
  }

  function aplicarFiltro(el){
    const k=el.dataset.vtLs;
    if(k==='busqueda') ls.busqueda=el.value;
    else if(k==='estado') ls.estado=el.value;
    else if(k==='resp') ls.resp=el.value;
    else if(k==='tipo') ls.tipo=el.value;
    else return;
    repintarResultados();
  }

  V.registrarPantalla({
    id:'listado',
    html:htmlListado,
    entrar:entrarListado,
    on:{
      click(e){
        const o=e.target.closest('[data-vt-orden]');
        if(o){ls.orden=siguienteOrden(ls.orden,o.dataset.vtOrden);repintarResultados();return;}
        const x=e.target.closest('[data-vt-ls-exportar]');
        if(x&&!x.disabled) exportar();
      },
      input(e){if(e.target.matches('[data-vt-ls="busqueda"]')) aplicarFiltro(e.target);},
      change(e){if(e.target.matches('select[data-vt-ls]')) aplicarFiltro(e.target);},
      keydown(e){if(e.key==='Enter'&&e.target.matches('[data-vt-ls="busqueda"]')) e.preventDefault();}
    }
  });

  V.listado={filtrarListado,ordenarListado,siguienteOrden,valorColumna,filasExcel,construirLibro,fechaExcel,nombreArchivo,COLUMNAS_EXCEL};
})();
