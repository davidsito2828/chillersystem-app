// ══════════════════════════════════════════
//  VENTAS — Resumen ejecutivo: totales, desglose mensual con gráficos (SVG propio, sin
//  librerías), tablas por estado / tipo de cliente / referidor y comisiones.
//  Regla de monedas: nunca se suman montos de monedas distintas; todo monto agregado va
//  por separado en ARS y USD, una línea por moneda.
//  Se carga con defer después de ventas-agenda.js y registra la pantalla 'resumen'.
//  Reutiliza las globales de index.html: escapeHtml, esGerencia.
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V){console.error('[ventas] ventas-resumen.js necesita ventas.js cargado antes');return;}
  const {fmtMonto,hoyAR,ESTADOS,nombreResponsable,mensajeError}=V.util;
  const C=V.comun;

  const RUTA_RESUMEN='crm_oportunidades?select=id,estado,fecha_ingreso,fecha_cierre,monto_estimado,moneda,comision_monto,comision_liquidada,responsable_id,responsable_nombre_libre,tipo_servicio_id,crm_prospectos(tipo_cliente_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),crm_tipos_servicio(nombre),usuarios(nombre)&order=fecha_ingreso.desc,id.asc';

  // ── Monedas (probadas en Node) ──
  const MONEDAS=['ARS','USD'];
  function monedaDe(o){return o&&o.moneda==='USD'?'USD':'ARS';}
  // Suma un campo numérico por moneda: {ARS, USD}
  function sumarPorMoneda(lista,campo='monto_estimado'){
    const tot={ARS:0,USD:0};
    for(const o of (lista||[])){
      const v=Number(o&&o[campo]);
      if(o&&o[campo]!=null&&Number.isFinite(v)) tot[monedaDe(o)]+=v;
    }
    return tot;
  }
  // Monedas con algún monto en el conjunto (suma distinta de 0), en orden ARS, USD
  function monedasConMonto(tot){return MONEDAS.filter(m=>tot&&tot[m]!==0&&Number.isFinite(tot[m]));}
  // Una línea por moneda; si ninguna tiene monto, [vacio] ('$ 0' en totales, '-' en filas)
  function lineasMonto(tot,vacio='$ 0'){
    const ms=monedasConMonto(tot);
    return ms.length?ms.map(m=>fmtMonto(tot[m],m)):[vacio];
  }
  // '0%' si el total es 0 (como formatearPorcentaje del original)
  function porcentaje(parte,total){
    if(!total) return '0%';
    return ((parte/total)*100).toFixed(0)+'%';
  }
  // % de monto de una fila, dentro de cada moneda y alineado con lineasMonto(fila, '-')
  function lineasPorcentaje(totFila,totGeneral){
    const ms=monedasConMonto(totFila);
    return ms.length?ms.map(m=>porcentaje(totFila[m],totGeneral[m])):['-'];
  }

  // ── Resumen (probadas en Node) ──
  function fecha10(v){return String(v==null?'':v).slice(0,10);}
  function filtrarResumen(lista,{desde='',hasta='',responsable=''}={}){
    return (lista||[]).filter(o=>
      (!desde||fecha10(o.fecha_ingreso)>=desde)&&
      (!hasta||fecha10(o.fecha_ingreso)<=hasta)&&
      (!responsable||o.responsable_id===responsable));
  }
  // Agrupa por nombre: [{nombre, cantidad, monto:{ARS,USD}}] ordenado por cantidad descendente (estable)
  function agruparPorNombre(lista,nombreDe){
    const grupos=new Map();
    for(const o of lista){
      const nombre=nombreDe(o);
      if(!grupos.has(nombre)) grupos.set(nombre,[]);
      grupos.get(nombre).push(o);
    }
    return Array.from(grupos.entries())
      .map(([nombre,del])=>({nombre,cantidad:del.length,monto:sumarPorMoneda(del)}))
      .sort((a,b)=>b.cantidad-a.cantidad);
  }
  // tiposCliente: catálogo activo [{id,nombre}]; un tipo que no está (inactivo) cuenta como 'Otro'
  function calcularResumen(filtradas,tiposCliente=[]){
    const lista=filtradas||[];
    const nombresTipo=new Map((tiposCliente||[]).map(t=>[t.id,t.nombre]));
    const porEstado=ESTADOS.map(({valor,etiqueta})=>{
      const del=lista.filter(o=>o.estado===valor);
      return {valor,etiqueta,cantidad:del.length,monto:sumarPorMoneda(del)};
    });
    const porTipoCliente=agruparPorNombre(lista,o=>{
      const id=o.crm_prospectos&&o.crm_prospectos.tipo_cliente_id;
      return id?(nombresTipo.has(id)?nombresTipo.get(id):'Otro'):'Sin tipo de cliente';
    });
    const porReferidor=agruparPorNombre(lista,o=>(o.crm_prospectos&&o.crm_prospectos.crm_referidores&&o.crm_prospectos.crm_referidores.nombre)||'Sin referidor');
    const aceptadas=lista.filter(o=>o.estado==='aceptado');
    const rechazadas=lista.filter(o=>o.estado==='rechazado');
    const denom=aceptadas.length+rechazadas.length;
    const comisionTotal=sumarPorMoneda(aceptadas,'comision_monto');
    const comisionLiquidada=sumarPorMoneda(aceptadas.filter(o=>o.comision_liquidada),'comision_monto');
    const comisionPendiente={ARS:comisionTotal.ARS-comisionLiquidada.ARS,USD:comisionTotal.USD-comisionLiquidada.USD};
    return {
      totalCantidad:lista.length,
      totalMonto:sumarPorMoneda(lista),
      montoAceptado:sumarPorMoneda(aceptadas),
      porEstado,porTipoCliente,porReferidor,
      tasaConversion:denom>0?aceptadas.length/denom:null,
      comisionTotal,comisionLiquidada,comisionPendiente
    };
  }
  function textoTasa(t){return t===null?'-':(t*100).toFixed(0)+'%';}

  // ── Desglose mensual (probadas en Node; igual que utils/resumenMensual.ts) ──
  const CATEGORIA_OTROS='Otros';
  const MAX_CATEGORIAS=7; // + 'Otros' = 8, el techo de la paleta categórica
  const MESES_CORTOS=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const COLORES_CATEGORIA=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
  const COLOR_OTROS='#94a3b8';
  const COLOR_CREADAS='#0d9488';
  const COLOR_ACEPTADAS='#16a34a';

  function mesClave(fechaISO){return String(fechaISO==null?'':fechaISO).slice(0,7);} // '2026-03-15' → '2026-03'
  // '2026-01' → 'ene 2026' (abreviaturas fijas, sin toLocaleDateString)
  function etiquetaMes(clave){
    const m=/^(\d{4})-(\d{2})/.exec(String(clave==null?'':clave));
    const i=m?+m[2]-1:-1;
    return i>=0&&i<12?MESES_CORTOS[i]+' '+m[1]:String(clave==null?'':clave);
  }
  // Claves 'AAAA-MM' entre dos fechas (inclusive), también los meses sin datos
  function enumerarMeses(fechaDesde,fechaHasta){
    const [anioDesde,mesDesde]=mesClave(fechaDesde).split('-').map(Number);
    const [anioHasta,mesHasta]=mesClave(fechaHasta).split('-').map(Number);
    const meses=[];
    let anio=anioDesde, mes=mesDesde, iteraciones=0;
    // Tope de seguridad: si por error desde > hasta (o fechas inválidas), no entra en loop infinito.
    while((anio<anioHasta||(anio===anioHasta&&mes<=mesHasta))&&iteraciones<600){
      meses.push(anio+'-'+String(mes).padStart(2,'0'));
      mes+=1;
      if(mes>12){mes=1;anio+=1;}
      iteraciones+=1;
    }
    return meses;
  }
  // Primer día del mes 'cantidad' meses antes del de hoy ('YYYY-MM-DD'), con aritmética de año y mes
  function mesesAtras(cantidad,hoy){
    const [y,m]=String(hoy).split('-').map(Number);
    const total=y*12+(m-1)-cantidad;
    const anio=Math.floor(total/12), mes=total-anio*12+1;
    return anio+'-'+String(mes).padStart(2,'0')+'-01';
  }
  // Rango efectivo del desglose: el del filtro; lo que falte, los últimos 12 meses hasta hoy
  function rangoDesglose(desde,hasta,hoy){
    const d=desde||mesesAtras(11,hoy), h=hasta||hoy;
    return {desde:d,hasta:h,meses:enumerarMeses(d,h)};
  }
  // Las categorías con más casos, hasta MAX_CATEGORIAS (empates en orden de aparición)
  function topCategorias(items,obtenerCategoria){
    const totales=new Map();
    for(const it of (items||[])){
      const c=obtenerCategoria(it);
      totales.set(c,(totales.get(c)||0)+1);
    }
    return Array.from(totales.entries()).sort((a,b)=>b[1]-a[1]).slice(0,MAX_CATEGORIAS).map(([c])=>c);
  }
  // Una fila por mes: {mes, mesEtiqueta, total, valores: Map(categoría → cantidad)}; lo que no está
  // entre las principales se pliega en 'Otros' y lo que cae fuera de los meses se descarta.
  function agruparPorMesYCategoria(items,obtenerFecha,obtenerCategoria,categoriasPrincipales,meses){
    const principales=new Set(categoriasPrincipales);
    const porMes=new Map((meses||[]).map(m=>[m,new Map()]));
    for(const it of (items||[])){
      const bucket=porMes.get(mesClave(obtenerFecha(it)));
      if(!bucket) continue;
      const cruda=obtenerCategoria(it);
      const cat=principales.has(cruda)?cruda:CATEGORIA_OTROS;
      bucket.set(cat,(bucket.get(cat)||0)+1);
    }
    return (meses||[]).map(mes=>{
      const valores=porMes.get(mes);
      let total=0;
      for(const v of valores.values()) total+=v;
      return {mes,mesEtiqueta:etiquetaMes(mes),total,valores};
    });
  }
  function colorDeCategoria(cat,principales){
    if(cat===CATEGORIA_OTROS) return COLOR_OTROS;
    const i=principales.indexOf(cat);
    return i>=0&&i<COLORES_CATEGORIA.length?COLORES_CATEGORIA[i]:COLOR_OTROS;
  }
  function categoriaServicio(o){return (o.crm_tipos_servicio&&o.crm_tipos_servicio.nombre)||'Sin tipo de servicio';}
  // 'Creadas' por fecha_ingreso; 'Aceptadas' (estado aceptado) por fecha_cierre
  function desgloseMensual(oportunidades,{desde='',hasta='',responsable='',dimension='tipo_servicio',hoy}){
    const base=responsable?(oportunidades||[]).filter(o=>o.responsable_id===responsable):(oportunidades||[]);
    const r=rangoDesglose(desde,hasta,hoy);
    const enRango=f=>!!f&&f>=r.desde&&f<=r.hasta;
    const creadas=base.filter(o=>enRango(fecha10(o.fecha_ingreso)));
    const aceptadas=base.filter(o=>o.estado==='aceptado'&&enRango(fecha10(o.fecha_cierre)));
    const cat=dimension==='responsable'?nombreResponsable:categoriaServicio;
    // Una sola lista para los dos gráficos: la misma categoría tiene siempre el mismo color
    const principales=topCategorias(creadas.concat(aceptadas),cat);
    const filasCreadas=agruparPorMesYCategoria(creadas,o=>fecha10(o.fecha_ingreso),cat,principales,r.meses);
    const filasAceptadas=agruparPorMesYCategoria(aceptadas,o=>fecha10(o.fecha_cierre),cat,principales,r.meses);
    const hayOtros=filasCreadas.concat(filasAceptadas).some(f=>(f.valores.get(CATEGORIA_OTROS)||0)>0);
    const filasTotales=r.meses.map((mes,i)=>({mes,mesEtiqueta:etiquetaMes(mes),creadas:filasCreadas[i].total,aceptadas:filasAceptadas[i].total}));
    return {desde:r.desde,hasta:r.hasta,meses:r.meses,principales,categorias:hayOtros?principales.concat(CATEGORIA_OTROS):principales,filasCreadas,filasAceptadas,filasTotales};
  }

  // ── Gráfico de barras en SVG (probado en Node) ──
  // etiquetas: una por mes; series: [{nombre, color, valores:[n por mes]}]; apilado: barras apiladas o agrupadas
  function pasoEje(max){
    if(max<=5) return 1;
    const crudo=max/5, pot=Math.pow(10,Math.floor(Math.log10(crudo)));
    for(const f of [1,2,5,10]) if(f*pot>=crudo) return f*pot;
    return 10*pot;
  }
  const r2=x=>Math.round(x*100)/100;
  function svgBarras({etiquetas=[],series=[],apilado=false,titulo=''}){
    const n=etiquetas.length;
    const ML=40, MR=10, MT=12, ALTO_PLOT=190;
    if(!n){
      return `<svg class="vt-rs-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 60" role="img" aria-label="${escapeHtml(titulo+' — sin datos')}"><text x="160" y="34" text-anchor="middle" font-size="12" fill="currentColor">Sin datos para este período.</text></svg>`;
    }
    const plotW=Math.max(280,Math.min(900,n*40));
    const slot=plotW/n;
    const rotar=slot<50;
    const salto=Math.max(1,Math.ceil(16/slot));
    const MB=rotar?52:24;
    const W=ML+plotW+MR, H=MT+ALTO_PLOT+MB, base=MT+ALTO_PLOT;
    const valor=(s,i)=>{const v=Number(s.valores[i]);return Number.isFinite(v)&&v>0?v:0;};
    let max=0;
    for(let i=0;i<n;i++){
      if(apilado) max=Math.max(max,series.reduce((a,s)=>a+valor(s,i),0));
      else for(const s of series) max=Math.max(max,valor(s,i));
    }
    const paso=pasoEje(max);
    const maxEje=Math.max(paso,Math.ceil(max/paso)*paso);
    const alto=v=>v/maxEje*ALTO_PLOT;
    const partes=[];
    for(let v=0;v<=maxEje;v+=paso){
      const y=r2(base-alto(v));
      partes.push(`<line x1="${ML}" y1="${y}" x2="${ML+plotW}" y2="${y}" stroke="#e1e0d9" stroke-dasharray="3 3"/>`);
      partes.push(`<text x="${ML-6}" y="${r2(y+4)}" text-anchor="end" font-size="11" fill="currentColor">${v}</text>`);
    }
    partes.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${base}" stroke="#94a3b8"/>`);
    partes.push(`<line x1="${ML}" y1="${base}" x2="${ML+plotW}" y2="${base}" stroke="#94a3b8"/>`);
    for(let i=0;i<n;i++){
      const x0=ML+i*slot;
      if(apilado){
        const bw=slot*0.6, bx=r2(x0+(slot-bw)/2);
        let acum=0;
        for(const s of series){
          const v=valor(s,i);
          if(!v) continue;
          const h=alto(v), y=base-alto(acum)-h;
          acum+=v;
          partes.push(`<rect x="${bx}" y="${r2(y)}" width="${r2(bw)}" height="${r2(h)}" fill="${escapeHtml(s.color)}" data-vt-barra="1"><title>${escapeHtml(etiquetas[i]+' · '+s.nombre+': '+v)}</title></rect>`);
        }
      }else{
        const gw=slot*0.7, bw=gw/Math.max(1,series.length), gx=x0+(slot-gw)/2;
        series.forEach((s,k)=>{
          const v=valor(s,i);
          if(!v) return;
          const h=alto(v);
          partes.push(`<rect x="${r2(gx+k*bw)}" y="${r2(base-h)}" width="${r2(bw)}" height="${r2(h)}" fill="${escapeHtml(s.color)}" data-vt-barra="1"><title>${escapeHtml(etiquetas[i]+' · '+s.nombre+': '+v)}</title></rect>`);
        });
      }
      if(i%salto!==0) continue;
      const cx=r2(x0+slot/2);
      partes.push(rotar
        ?`<text x="${cx}" y="${base+14}" text-anchor="end" font-size="11" fill="currentColor" transform="rotate(-40 ${cx} ${base+14})">${escapeHtml(etiquetas[i])}</text>`
        :`<text x="${cx}" y="${base+16}" text-anchor="middle" font-size="11" fill="currentColor">${escapeHtml(etiquetas[i])}</text>`);
    }
    return `<svg class="vt-rs-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${H}" style="min-width:${Math.round(W*0.7)}px;max-width:${Math.round(W*1.5)}px" role="img" aria-label="${escapeHtml(titulo)}">${partes.join('')}</svg>`;
  }

  C.agregarCss(`
.vt-rs-h1{font-size:18px;font-weight:800;margin:0 0 14px;color:var(--text);}
.vt-rs-filtros{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;}
.vt-rs-campo{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-dim);}
.vt-rs-campo .form-input{width:auto;}
.vt-rs-filtros .form-select{width:auto;min-width:190px;}
.vt-rs-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:22px;}
.vt-rs-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;box-shadow:var(--shadow);}
.vt-rs-card-tit{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);}
.vt-rs-card-val{font-size:20px;font-weight:800;margin-top:4px;color:var(--text);}
.vt-rs-card-val.vt-rs-chico{font-size:17px;}
.vt-rs-card-nota{font-size:10px;color:var(--text-muted);margin-top:3px;}
.vt-rs-verde{color:#047857!important;}
.vt-rs-ambar{color:#d97706!important;}
.vt-rs-linea{display:block;white-space:nowrap;}
.vt-rs-sec{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:0 0 10px;}
.vt-rs-bloque{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:14px;margin-bottom:18px;min-width:0;}
.vt-rs-bloque h4{font-size:13px;font-weight:700;margin:0 0 10px;color:var(--text);}
.vt-rs-dim-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
.vt-rs-dim-head .vt-rs-sec{margin:0;}
.vt-rs-dim{display:flex;gap:6px;}
.vt-rs-graficos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;}
.vt-rs-graf{overflow-x:auto;-webkit-overflow-scrolling:touch;color:var(--text-dim);}
.vt-rs-svg{display:block;width:100%;height:auto;margin:0 auto;}
.vt-rs-leyenda{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:var(--text);margin:8px 0 4px;}
.vt-rs-leyenda span{display:inline-flex;align-items:center;gap:5px;}
.vt-rs-leyenda i{display:inline-block;width:10px;height:10px;border-radius:2px;}
.vt-rs-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:10px;}
.vt-rs-tabla{width:100%;border-collapse:collapse;font-size:12px;}
.vt-rs-tabla.vt-rs-mensual{min-width:480px;}
.vt-rs-tabla th{background:var(--bg3);color:var(--text-dim);font-weight:600;text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap;}
.vt-rs-tabla td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:top;}
.vt-rs-tabla tbody tr:last-child td{border-bottom:0;}
.vt-rs-mensual th:not(:first-child),.vt-rs-mensual td:not(:first-child){text-align:right;}
.vt-rs-mensual td:first-child{white-space:nowrap;}
.vt-rs-tabla tr.vt-rs-total td{font-weight:700;background:var(--bg3);}
.vt-rs-tabla-wrap{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:22px;}
.vt-rs-tabla-wrap .vt-rs-tabla{min-width:520px;}
.vt-rs-pie{font-size:11px;color:var(--text-muted);margin:-8px 0 22px;}
@media print{
  #tab-ventas .vt-noprint{display:none!important;}
  body.vt-imprimiendo>*:not(#tab-ventas){display:none!important;}
  body.vt-imprimiendo #tab-ventas{display:block!important;border:0!important;box-shadow:none!important;}
  body.vt-imprimiendo #tab-ventas>.panel-header,body.vt-imprimiendo #tab-ventas .vt-subnav{display:none!important;}
  body.vt-imprimiendo #tab-ventas .vt-body{padding:0!important;}
  body.vt-imprimiendo .vt-rs-graf,body.vt-imprimiendo .vt-rs-tw,body.vt-imprimiendo .vt-rs-tabla-wrap{overflow:visible!important;}
  body.vt-imprimiendo .vt-rs-svg{min-width:0!important;}
  body.vt-imprimiendo .vt-rs-card,body.vt-imprimiendo .vt-rs-bloque,body.vt-imprimiendo .vt-rs-tabla tr{break-inside:avoid;}
  body.vt-imprimiendo #tab-ventas *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
}
`);

  // ══════════════════════════════════════════
  //  PANTALLA: RESUMEN EJECUTIVO
  // ══════════════════════════════════════════
  const rs={cargando:false,error:'',datos:[],responsables:[],desde:'',hasta:'',resp:'',dimension:'tipo_servicio',seq:0};
  const enVista=()=>V.vistaActual().vista==='resumen';

  async function entrar(){
    const seq=++rs.seq;
    rs.cargando=true;rs.error='';V.repintar();
    try{
      const [datos,resp]=await Promise.all([
        C.cargarTodo(RUTA_RESUMEN),
        esGerencia()?C.cargarResponsables():Promise.resolve([]),
        C.cargarCatalogosActivos(['crm_tipos_cliente','crm_tipos_servicio'])
      ]);
      if(seq!==rs.seq) return;
      rs.datos=datos;
      rs.responsables=resp;
    }catch(e){
      if(seq!==rs.seq) return;
      console.error('[ventas] Error cargando el resumen ejecutivo',e);
      rs.error='No se pudo cargar el resumen: '+mensajeError(e);
    }finally{
      if(seq===rs.seq) rs.cargando=false;
    }
    if(seq===rs.seq&&enVista()) V.repintar();
  }

  const lineas=arr=>arr.map(t=>`<span class="vt-rs-linea">${escapeHtml(t)}</span>`).join('');
  const opt=(v,t,sel)=>`<option value="${escapeHtml(v)}"${v===sel?' selected':''}>${escapeHtml(t)}</option>`;

  function html(){
    const envolver=c=>`<div data-vt-pantalla="resumen"><h2 class="vt-rs-h1">Resumen ejecutivo de ventas</h2>${c}</div>`;
    if(rs.cargando&&!rs.datos.length) return envolver('<div class="vt-msg">Cargando…</div>');
    if(rs.error) return envolver(`<div class="vt-msg vt-error">${escapeHtml(rs.error)}</div>`);
    return envolver(`
  <div class="vt-toolbar vt-noprint">
    <div class="vt-rs-filtros">
      <label class="vt-rs-campo">Desde (fecha de ingreso)<input type="date" class="form-input" data-vt-rs-filtro="desde" value="${escapeHtml(rs.desde)}"></label>
      <label class="vt-rs-campo">Hasta<input type="date" class="form-input" data-vt-rs-filtro="hasta" value="${escapeHtml(rs.hasta)}"></label>
      ${esGerencia()?`<select class="form-select" data-vt-rs-filtro="resp" aria-label="Responsable"><option value="">Todos los responsables</option>${rs.responsables.map(r=>opt(r.id,r.nombre,rs.resp)).join('')}</select>`:''}
    </div>
    <button type="button" class="btn-secondary" data-vt-rs-imprimir>Imprimir</button>
  </div>
  <div data-vt-rs-res>${htmlResultados()}</div>`);
  }

  function filtroResp(){return esGerencia()?rs.resp:'';}

  function htmlResultados(){
    const filtradas=filtrarResumen(rs.datos,{desde:rs.desde,hasta:rs.hasta,responsable:filtroResp()});
    const r=calcularResumen(filtradas,C.catalogo('crm_tipos_cliente'));
    const card=(tit,val,{clase='',nota=''}={})=>`<div class="vt-rs-card"><div class="vt-rs-card-tit">${escapeHtml(tit)}</div><div class="vt-rs-card-val ${clase}">${val}</div>${nota?`<div class="vt-rs-card-nota">${escapeHtml(nota)}</div>`:''}</div>`;
    return `
  <div class="vt-rs-cards" data-vt-rs-totales>
    ${card('Oportunidades',escapeHtml(String(r.totalCantidad)))}
    ${card('Monto estimado total',lineas(lineasMonto(r.totalMonto)),{clase:'vt-rs-chico'})}
    ${card('Monto aceptado',lineas(lineasMonto(r.montoAceptado)),{clase:'vt-rs-chico vt-rs-verde'})}
    ${card('Tasa de conversión',escapeHtml(textoTasa(r.tasaConversion)),{nota:'aceptadas / (aceptadas + rechazadas)'})}
  </div>
  ${htmlDesglose()}
  <h3 class="vt-rs-sec">Por estado</h3>
  ${htmlTablaGrupos('Estado',r.porEstado.map(f=>({nombre:f.etiqueta,cantidad:f.cantidad,monto:f.monto})),r,'estado')}
  <h3 class="vt-rs-sec">Por tipo de cliente</h3>
  ${htmlTablaGrupos('Tipo de cliente',r.porTipoCliente,r,'tipo_cliente')}
  <h3 class="vt-rs-sec">Por referidor</h3>
  ${htmlTablaGrupos('Referidor',r.porReferidor,r,'referidor')}
  <h3 class="vt-rs-sec">Comisiones (oportunidades aceptadas)</h3>
  <div class="vt-rs-cards" data-vt-rs-comisiones>
    ${card('Total',lineas(lineasMonto(r.comisionTotal)),{clase:'vt-rs-chico'})}
    ${card('Liquidada',lineas(lineasMonto(r.comisionLiquidada)),{clase:'vt-rs-chico vt-rs-verde'})}
    ${card('Pendiente',lineas(lineasMonto(r.comisionPendiente)),{clase:'vt-rs-chico vt-rs-ambar'})}
  </div>`;
  }

  function htmlTablaGrupos(titulo,filas,r,id){
    const cuerpoT=filas.length?filas.map(f=>`
      <tr>
        <td>${escapeHtml(f.nombre)}</td>
        <td>${f.cantidad}</td>
        <td>${escapeHtml(porcentaje(f.cantidad,r.totalCantidad))}</td>
        <td>${lineas(lineasMonto(f.monto,'-'))}</td>
        <td>${lineas(lineasPorcentaje(f.monto,r.totalMonto))}</td>
      </tr>`).join(''):`<tr><td colspan="5" class="vt-msg">Sin datos para este período.</td></tr>`;
    return `
  <div class="vt-rs-tabla-wrap"><table class="vt-rs-tabla" data-vt-rs-tabla="${escapeHtml(id)}">
    <thead><tr><th>${escapeHtml(titulo)}</th><th>Cantidad</th><th>% cantidad</th><th>Monto estimado</th><th>% monto</th></tr></thead>
    <tbody>${cuerpoT}</tbody>
  </table></div>`;
  }

  // Tabla de un gráfico mensual: una fila por categoría, una columna por mes (+ fila Total)
  function htmlTablaMensual(etiquetas,filas,totales,id){
    return `
    <div class="vt-rs-tw"><table class="vt-rs-tabla vt-rs-mensual" data-vt-rs-tabla="${escapeHtml(id)}">
      <thead><tr><th>${filas.length>1?'Categoría':''}</th>${etiquetas.map(e=>`<th>${escapeHtml(e)}</th>`).join('')}</tr></thead>
      <tbody>
        ${filas.map(f=>`<tr><td>${escapeHtml(f.nombre)}</td>${f.valores.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}
        ${totales?`<tr class="vt-rs-total"><td>Total</td>${totales.map(v=>`<td>${v}</td>`).join('')}</tr>`:''}
      </tbody>
    </table></div>`;
  }

  function htmlLeyenda(series){
    if(series.length<=1) return '';
    return `<div class="vt-rs-leyenda">${series.map(s=>`<span><i style="background:${escapeHtml(s.color)}"></i>${escapeHtml(s.nombre)}</span>`).join('')}</div>`;
  }

  function htmlGraficoMensual(titulo,filas,d,id){
    const etiquetas=filas.map(f=>f.mesEtiqueta);
    const series=d.categorias.map(c=>({nombre:c,color:colorDeCategoria(c,d.principales),valores:filas.map(f=>f.valores.get(c)||0)}));
    return `
    <div class="vt-rs-bloque" data-vt-rs-grafico="${escapeHtml(id)}">
      <h4>${escapeHtml(titulo)}</h4>
      <div class="vt-rs-graf">${svgBarras({etiquetas,series,apilado:true,titulo})}</div>
      ${htmlLeyenda(series)}
      ${htmlTablaMensual(etiquetas,series,filas.map(f=>f.total),id)}
    </div>`;
  }

  function htmlDesglose(){
    const d=desgloseMensual(rs.datos,{desde:rs.desde,hasta:rs.hasta,responsable:filtroResp(),dimension:rs.dimension,hoy:hoyAR()});
    const etiquetas=d.filasTotales.map(f=>f.mesEtiqueta);
    const seriesTot=[
      {nombre:'Creadas',color:COLOR_CREADAS,valores:d.filasTotales.map(f=>f.creadas)},
      {nombre:'Aceptadas',color:COLOR_ACEPTADAS,valores:d.filasTotales.map(f=>f.aceptadas)}
    ];
    const tituloTot='Oportunidades creadas vs. aceptadas, por mes';
    const etiquetaDim=rs.dimension==='tipo_servicio'?'tipo de servicio':'responsable';
    const sinCatalogos=!C.catalogo('crm_tipos_servicio').length&&!(esGerencia()&&rs.responsables.length);
    const boton=(dim,txt)=>`<button type="button" class="${rs.dimension===dim?'btn-primary':'btn-secondary'}" data-vt-rs-dim="${dim}" aria-pressed="${rs.dimension===dim}">${txt}</button>`;
    return `
  <div class="vt-rs-bloque" data-vt-rs-grafico="totales">
    <h3 class="vt-rs-sec">${escapeHtml(tituloTot)}</h3>
    <div class="vt-rs-graf">${svgBarras({etiquetas,series:seriesTot,apilado:false,titulo:tituloTot})}</div>
    ${htmlLeyenda(seriesTot)}
    ${htmlTablaMensual(etiquetas,seriesTot,null,'totales')}
  </div>
  <div class="vt-rs-dim-head">
    <h3 class="vt-rs-sec">Oportunidades por mes, por ${escapeHtml(etiquetaDim)}</h3>
    <div class="vt-rs-dim vt-noprint">${boton('tipo_servicio','Por tipo de servicio')}${boton('responsable','Por responsable')}</div>
  </div>
  ${sinCatalogos?'<p class="vt-rs-card-nota">Sin catálogos cargados para desglosar.</p>':''}
  <div class="vt-rs-graficos">
    ${htmlGraficoMensual('Creadas por mes',d.filasCreadas,d,'creadas')}
    ${htmlGraficoMensual('Aceptadas por mes',d.filasAceptadas,d,'aceptadas')}
  </div>
  <p class="vt-rs-pie">“Creadas” se cuenta por fecha de ingreso; “Aceptadas” por fecha de cierre (cuando pasó a Aceptado) — una oportunidad puede quedar en un mes distinto en cada gráfico si se cerró después de ingresar.</p>`;
  }

  // Redibuja solo los resultados (no los filtros)
  function repintarResultados(){
    const b=C.cuerpo();
    const r=b&&b.querySelector('[data-vt-rs-res]');
    if(r) r.innerHTML=htmlResultados(); else V.repintar();
  }

  // Imprimir solo el módulo: la clase en body activa los estilos @media print; afterprint la saca
  function resumenVisible(){
    const el=C.contenedor();
    return enVista()&&!!el&&el.style.display!=='none'&&!!el.querySelector('[data-vt-pantalla="resumen"]');
  }
  function imprimir(){
    document.body.classList.add('vt-imprimiendo');
    window.print();
  }
  if(typeof window.addEventListener==='function'){
    window.addEventListener('beforeprint',()=>{if(resumenVisible()) document.body.classList.add('vt-imprimiendo');});
    window.addEventListener('afterprint',()=>{document.body.classList.remove('vt-imprimiendo');});
  }

  V.registrarPantalla({
    id:'resumen',
    html,
    entrar,
    on:{
      click(e){
        const d=e.target.closest('[data-vt-rs-dim]');
        if(d){rs.dimension=d.dataset.vtRsDim==='responsable'?'responsable':'tipo_servicio';repintarResultados();return;}
        if(e.target.closest('[data-vt-rs-imprimir]')) imprimir();
      },
      change(e){
        const f=e.target.closest('[data-vt-rs-filtro]');
        if(!f) return;
        const k=f.dataset.vtRsFiltro;
        if(k==='desde') rs.desde=f.value;
        else if(k==='hasta') rs.hasta=f.value;
        else if(k==='resp') rs.resp=f.value;
        else return;
        repintarResultados();
      }
    }
  });

  V.resumen={MONEDAS,monedaDe,sumarPorMoneda,monedasConMonto,lineasMonto,porcentaje,lineasPorcentaje,
    filtrarResumen,calcularResumen,textoTasa,
    CATEGORIA_OTROS,COLORES_CATEGORIA,COLOR_OTROS,mesClave,etiquetaMes,enumerarMeses,mesesAtras,rangoDesglose,
    topCategorias,agruparPorMesYCategoria,colorDeCategoria,desgloseMensual,svgBarras};
})();
