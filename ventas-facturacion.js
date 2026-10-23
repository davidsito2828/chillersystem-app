// ══════════════════════════════════════════
//  VENTAS — Novedades de Facturación: oportunidades aceptadas con fecha de facturación, por mes.
//  Solo informativa: avisa de altas nuevas para pasarle al área de facturación ("a este cliente
//  hay que empezarlo a facturar"); no lleva control de la facturación recurrente.
//  Se carga con defer después de ventas-resumen.js (usa sus totales por moneda) y registra la
//  pantalla 'facturacion'. Reutiliza las globales de index.html: escapeHtml.
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V||!V.resumen){console.error('[ventas] ventas-facturacion.js necesita ventas.js y ventas-resumen.js cargados antes');return;}
  const {fmtFecha,hoyAR,fmtMonto,nombreResponsable,mensajeError}=V.util;
  const {sumarPorMoneda,lineasMonto}=V.resumen;
  const C=V.comun;

  const RUTA_FACTURACION='crm_oportunidades?select=*,crm_prospectos(id,nombre,tipo_cliente_id,contacto_nombre,telefono,email,referido_por_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),crm_tipos_servicio(nombre),usuarios(nombre)&estado=eq.aceptado&fecha_facturacion=not.is.null&order=fecha_facturacion.asc,id.asc';

  // ── Funciones puras (probadas en Node) ──
  // 'AAAA-MM' válido (el input type=month lo da así; en Safari de escritorio es un texto libre)
  function esMesValido(txt){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(txt==null?'':txt).trim());}
  // Del mes elegido ('' = todas), siempre por fecha de facturación ascendente (orden estable)
  function filtrarFacturacion(lista,mes){
    const base=mes?(lista||[]).filter(o=>String(o.fecha_facturacion||'').slice(0,7)===mes):(lista||[]).slice();
    return base.sort((a,b)=>{
      const fa=String(a.fecha_facturacion||''), fb=String(b.fecha_facturacion||'');
      return fa<fb?-1:fa>fb?1:0;
    });
  }
  function totalesFacturacion(lista){return sumarPorMoneda(lista);}
  function mensajeVacio(mes){return mes?'No hay novedades de facturación para este mes.':'No hay novedades de facturación.';}

  const COLUMNAS_EXCEL_FACTURACION=[
    {key:'cliente',header:'Cliente',width:30},
    {key:'tipo_servicio',header:'Tipo de servicio',width:22},
    {key:'moneda',header:'Moneda',width:10},
    {key:'monto_estimado',header:'Monto estimado',width:16,tipo:'monto'},
    {key:'fecha_facturacion',header:'Fecha de facturación',width:16,tipo:'fecha'},
    {key:'responsable',header:'Responsable',width:20},
    {key:'comentarios',header:'Comentarios',width:40}
  ];
  function filasExcelFacturacion(lista){
    return (lista||[]).map(o=>({
      cliente:C.textoExcel(o.crm_prospectos&&o.crm_prospectos.nombre),
      tipo_servicio:C.textoExcel(o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre),
      moneda:o.moneda==='USD'?'USD':'ARS',
      monto_estimado:C.numeroExcel(o.monto_estimado),
      fecha_facturacion:C.fechaExcel(o.fecha_facturacion),
      responsable:nombreResponsable(o),
      comentarios:C.textoExcel(o.comentarios)
    }));
  }
  const HOJA_FACTURACION='Novedades facturación';
  // Libro con la hoja 'Novedades facturación' (recibe ExcelJS para poder probarlo en Node)
  function construirLibroFacturacion(ExcelJSLib,lista){
    return C.libroExcel(ExcelJSLib,{hoja:HOJA_FACTURACION,columnas:COLUMNAS_EXCEL_FACTURACION,filas:filasExcelFacturacion(lista)});
  }
  function nombreArchivoFacturacion(mes){return 'novedades_facturacion_'+(mes||'todas')+'.xlsx';}

  C.agregarCss(`
.vt-fc-mes{width:auto!important;min-width:160px;}
.vt-fc-tabla{min-width:800px!important;}
.vt-fc-tit{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;}
.vt-fc-totales{display:inline-block;}
.vt-fc-tabla td.vt-fc-monto{white-space:nowrap;}
`);

  // ══════════════════════════════════════════
  //  PANTALLA: NOVEDADES DE FACTURACIÓN
  // ══════════════════════════════════════════
  const fc={cargando:false,error:'',datos:[],mes:null,exportando:false,seq:0};
  const enVista=()=>V.vistaActual().vista==='facturacion';

  async function entrar(){
    if(fc.mes===null) fc.mes=hoyAR().slice(0,7);
    const seq=++fc.seq;
    fc.cargando=true;fc.error='';V.repintar();
    try{
      const datos=await C.cargarTodo(RUTA_FACTURACION);
      if(seq!==fc.seq) return;
      fc.datos=datos;
    }catch(e){
      if(seq!==fc.seq) return;
      console.error('[ventas] Error cargando las novedades de facturación',e);
      fc.error='No se pudieron cargar las novedades de facturación: '+mensajeError(e);
    }finally{
      if(seq===fc.seq) fc.cargando=false;
    }
    if(seq===fc.seq&&enVista()) V.repintar();
  }

  function html(){
    if(fc.mes===null) fc.mes=hoyAR().slice(0,7);
    const envolver=c=>`<div data-vt-pantalla="facturacion">${c}</div>`;
    if(fc.cargando&&!fc.datos.length) return envolver('<div class="vt-msg">Cargando…</div>');
    if(fc.error) return envolver(`<div class="vt-msg vt-error">${escapeHtml(fc.error)}</div>`);
    return envolver(`
  <div class="vt-toolbar">
    <div class="vt-ls-filtros">
      <input type="month" class="form-input vt-fc-mes" data-vt-fc-mes value="${escapeHtml(fc.mes||'')}" placeholder="AAAA-MM" aria-label="Mes de facturación" autocomplete="off">
      <button type="button" class="btn-secondary" data-vt-fc-todas${fc.mes?'':' hidden'}>Ver todas</button>
    </div>
    <button type="button" class="btn-secondary" data-vt-fc-exportar${fc.exportando?' disabled':''}>${fc.exportando?'Generando…':'Exportar a Excel'}</button>
  </div>
  <div data-vt-fc-res>${htmlResultados()}</div>`);
  }

  function htmlResultados(){
    const lista=filtrarFacturacion(fc.datos,fc.mes);
    const total=lineasMonto(totalesFacturacion(lista)).map(t=>`<span class="vt-rs-linea">${escapeHtml(t)}</span>`).join('');
    const txt=v=>escapeHtml(v==null||v===''?'-':v);
    const filas=lista.map(o=>`
      <tr>
        <td><button type="button" class="vt-link" data-vt-ficha="${escapeHtml(o.id)}">${txt(o.crm_prospectos&&o.crm_prospectos.nombre)}</button></td>
        <td>${txt(o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre)}</td>
        <td class="vt-fc-monto">${o.monto_estimado==null?'-':escapeHtml(fmtMonto(o.monto_estimado,o.moneda||'ARS'))}</td>
        <td>${escapeHtml(o.fecha_facturacion?fmtFecha(o.fecha_facturacion):'-')}</td>
        <td>${escapeHtml(nombreResponsable(o))}</td>
        <td class="vt-ls-com" title="${escapeHtml(o.comentarios||'')}">${txt(o.comentarios)}</td>
      </tr>`).join('');
    return `
  <div class="vt-ls-tit vt-fc-tit" data-vt-fc-tit><span>Novedades (${lista.length}) — total estimado</span><span class="vt-fc-totales">${total}</span></div>
  <div class="vt-ls-wrap"><table class="vt-ls-tabla vt-fc-tabla">
    <thead><tr><th>Cliente</th><th>Tipo servicio</th><th>Monto estimado</th><th>Fecha facturación</th><th>Responsable</th><th>Comentarios</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>
  ${lista.length?'':`<p class="vt-msg">${escapeHtml(mensajeVacio(fc.mes))}</p>`}`;
  }

  // Redibuja solo los resultados (el selector de mes no pierde el foco mientras se escribe)
  function repintarResultados(){
    const b=C.cuerpo();
    const r=b&&b.querySelector('[data-vt-fc-res]');
    if(!r){V.repintar();return;}
    r.innerHTML=htmlResultados();
    const t=b.querySelector('[data-vt-fc-todas]');
    if(t) t.hidden=!fc.mes;
  }

  // '' = todas; un texto incompleto o inválido (Safari) no cambia el filtro
  function aplicarMes(el){
    const v=String(el.value||'').trim();
    if(v!==''&&!esMesValido(v)) return;
    if(v===fc.mes) return;
    fc.mes=v;
    repintarResultados();
  }

  async function exportar(){
    if(fc.exportando||!C.excelDisponible()) return;
    const lista=filtrarFacturacion(fc.datos,fc.mes);
    fc.exportando=true;V.repintar();
    try{
      await C.exportarExcel({hoja:HOJA_FACTURACION,columnas:COLUMNAS_EXCEL_FACTURACION,filas:filasExcelFacturacion(lista),archivo:nombreArchivoFacturacion(fc.mes)});
    }finally{
      fc.exportando=false;
      if(enVista()) V.repintar();
    }
  }

  V.registrarPantalla({
    id:'facturacion',
    html,
    entrar,
    on:{
      click(e){
        const t=e.target.closest('[data-vt-fc-todas]');
        if(t){fc.mes='';V.repintar();return;}
        const x=e.target.closest('[data-vt-fc-exportar]');
        if(x&&!x.disabled) exportar();
      },
      input(e){if(e.target.matches('[data-vt-fc-mes]')) aplicarMes(e.target);},
      change(e){if(e.target.matches('[data-vt-fc-mes]')) aplicarMes(e.target);},
      keydown(e){if(e.key==='Enter'&&e.target.matches('[data-vt-fc-mes]')) e.preventDefault();}
    }
  });

  V.facturacion={esMesValido,filtrarFacturacion,totalesFacturacion,mensajeVacio,COLUMNAS_EXCEL_FACTURACION,
    filasExcelFacturacion,construirLibroFacturacion,nombreArchivoFacturacion};
})();
