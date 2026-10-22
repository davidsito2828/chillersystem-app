// ══════════════════════════════════════════
//  MÓDULO VENTAS (CRM) — se carga desde index.html con defer
//  Reutiliza las globales de index.html: api, escapeHtml, showToast,
//  exigirPermiso, esGerencia, usuarioActual. Expone window.Ventas.
//  Las pantallas se registran con Ventas.registrarPantalla (ver
//  ventas-oportunidades.js); Catálogos se registra acá mismo.
// ══════════════════════════════════════════
(function(){
  'use strict';

  // ── Utilidades ─────────────────────────────
  // 'YYYY-MM-DD' → 'dd/mm/aaaa' sin pasar por new Date() (evita corrimiento por zona horaria)
  function fmtFecha(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso==null?'':String(iso));
    return m?m[3]+'/'+m[2]+'/'+m[1]:'Sin fecha';
  }
  // Fecha de hoy en Argentina como 'YYYY-MM-DD'
  function hoyAR(){
    const partes={};
    new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(new Date()).forEach(p=>{partes[p.type]=p.value;});
    return partes.year+'-'+partes.month+'-'+partes.day;
  }
  // Monto es-AR sin decimales: '$ 1.234.567' / 'US$ 1.234.567'.
  // Separador de miles manual: Intl 'es' no agrupa números de 4 cifras (1234 → '1234').
  function fmtMonto(n,moneda){
    const v=Math.round(Number(n));
    const num=Number.isFinite(v)?v:0;
    const txt=String(Math.abs(num)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    return (num<0?'-':'')+(moneda==='USD'?'US$ ':'$ ')+txt;
  }
  // Teléfono argentino → '549' + 10 dígitos nacionales, o null si no se puede normalizar.
  // Saca el 54/9 internacional, el 0 de larga distancia y el 15 posterior al código de área
  // (área de 2, 3 o 4 dígitos). Los 10 dígitos nacionales empiezan con 1, 2 o 3 y nunca con 15.
  function normalizarTelAR(tel){
    let d=String(tel==null?'':tel).replace(/\D/g,'');
    if(d.startsWith('00')) d=d.slice(2);
    if(d.startsWith('54')){d=d.slice(2);if(d.startsWith('9'))d=d.slice(1);}
    if(d.startsWith('0')) d=d.slice(1);
    const valido=x=>x.length===10&&/^[123]/.test(x)&&!x.startsWith('15');
    if(d.length===12){
      for(const k of [2,3,4]){
        if(d.substr(k,2)!=='15') continue;
        const sin15=d.slice(0,k)+d.slice(k+2);
        if(valido(sin15)){d=sin15;break;}
      }
    }
    return valido(d)?'549'+d:null;
  }
  function waLink(tel){
    const n=normalizarTelAR(tel);
    return n?'https://wa.me/'+n:null;
  }

  const ESTADOS=[
    {valor:'en_seguimiento',etiqueta:'En seguimiento'},
    {valor:'aceptado',etiqueta:'Aceptado'},
    {valor:'rechazado',etiqueta:'Rechazado'},
    {valor:'en_espera',etiqueta:'En espera'}
  ];
  function etiquetaEstado(valor){
    const e=ESTADOS.find(x=>x.valor===valor);
    return e?e.etiqueta:String(valor==null?'':valor);
  }
  // Nombre a mostrar del responsable: cuenta real (usuarios) o texto libre (histórico sin cuenta)
  function nombreResponsable(o){
    return (o&&o.usuarios&&o.usuarios.nombre)||(o&&o.responsable_nombre_libre)||'-';
  }
  // Traduce errores de PostgREST a mensajes claros
  function mensajeError(e,{permiso='No tenés permiso para realizar esta acción',duplicado='Ya existe un valor con ese nombre'}={}){
    const m=String(e&&e.message||'');
    if(/duplicate key|23505|unique constraint/i.test(m)) return duplicado;
    if(/row-level security|42501|permission denied/i.test(m)) return permiso;
    return m||'error desconocido';
  }

  // ── Registro de pantallas ──────────────────
  // Cada pantalla: {id, html() → string, entrar?() → al mostrarla, on?: {click,change,input,submit,keydown,pointerdown,...}}
  const SUBMENU=[
    {id:'tablero',label:'Tablero'},
    {id:'leads',label:'Leads'},
    {id:'agenda',label:'Agenda'},
    {id:'nueva',label:'Nueva oportunidad'},
    {id:'listado',label:'Listado'},
    {id:'resumen',label:'Resumen ejecutivo'},
    {id:'facturacion',label:'Novedades de Facturación'},
    {id:'catalogos',label:'Catálogos',visible:()=>esGerencia()}
  ];
  const EVENTOS=['click','change','input','submit','keydown','focusin','pointerdown'];
  const pantallas={};
  const nucleo={vista:null,eventos:false};

  function registrarPantalla(p){pantallas[p.id]=p;}
  function contenedor(){return document.getElementById('tab-ventas');}
  function cuerpo(){const el=contenedor();return el?el.querySelector('.vt-body'):null;}
  function itemsVisibles(){return SUBMENU.filter(it=>!it.visible||it.visible());}
  function disponible(it){return !!pantallas[it.id];}
  function pantallaActiva(){return pantallas[nucleo.vista]||null;}

  function mostrar(){
    const el=contenedor();
    if(!el) return;
    inyectarCss();
    engancharEventos(el);
    const disponibles=itemsVisibles().filter(disponible);
    if(!disponibles.some(it=>it.id===nucleo.vista)) nucleo.vista=disponibles.length?disponibles[0].id:null;
    const sub=itemsVisibles().map(it=>disponible(it)
      ?`<button type="button" class="vt-sub-btn${it.id===nucleo.vista?' vt-activo':''}" data-vt-ir="${escapeHtml(it.id)}">${escapeHtml(it.label)}</button>`
      :`<button type="button" class="vt-sub-btn" disabled title="Próximamente">${escapeHtml(it.label)} <small>Próximamente</small></button>`
    ).join('');
    el.innerHTML=`
<div class="panel-header">
  <div>
    <div class="panel-title">💰 Ventas</div>
    <div class="panel-count">Seguimiento comercial</div>
  </div>
</div>
<div class="vt-subnav">${sub}</div>
<div class="vt-body"></div>`;
    repintar();
    const p=pantallaActiva();
    if(p&&p.entrar) p.entrar();
  }

  // Vuelve a dibujar el cuerpo de la pantalla activa con su estado actual
  function repintar(){
    const b=cuerpo();
    if(!b) return;
    const p=pantallaActiva();
    b.innerHTML=p?p.html():`<div class="empty-state"><div class="empty-icon">🚧</div><div class="empty-title">Módulo en construcción</div><div>Las pantallas de Ventas van a estar disponibles próximamente.</div></div>`;
  }

  function ir(id){
    if(!pantallas[id]) return;
    nucleo.vista=id;
    mostrar();
  }

  // Eventos delegados en #tab-ventas (se enganchan una sola vez): el núcleo resuelve la
  // navegación y los SelectConCrear; el resto se despacha a la pantalla activa.
  function engancharEventos(el){
    if(nucleo.eventos) return;
    nucleo.eventos=true;
    EVENTOS.forEach(tipo=>el.addEventListener(tipo,e=>{
      if(tipo==='click'){
        const b=e.target.closest('[data-vt-ir]');
        if(b&&el.contains(b)&&!b.disabled){ir(b.dataset.vtIr);return;}
        if(sccClick(e)) return;
        if(waClick(e)) return;
      }
      if(tipo==='change'&&sccChange(e)) return;
      if(tipo==='keydown'&&sccKeydown(e)) return;
      const p=pantallaActiva();
      if(p&&p.on&&p.on[tipo]) p.on[tipo](e);
    }));
  }

  // ── Catálogos activos (para los desplegables de los formularios) ──
  const catalogosActivos={};
  async function cargarCatalogosActivos(tablas){
    await Promise.all(tablas.map(async t=>{
      const filas=await api(t+'?select=id,nombre&activo=eq.true&order=nombre.asc');
      catalogosActivos[t]=Array.isArray(filas)?filas:[];
    }));
  }
  function catalogo(tabla){return catalogosActivos[tabla]||[];}
  function nombreEnCatalogo(tabla,id){const r=catalogo(tabla).find(x=>x.id===id);return r?r.nombre:'';}

  // Usuarios que pueden ser responsables de una oportunidad
  async function cargarResponsables(){
    const filas=await api('usuarios?select=id,nombre&activo=eq.true&jerarquia=in.(gerencia,supervisor_admin,administrativo,vendedor)&order=nombre.asc');
    return Array.isArray(filas)?filas:[];
  }

  // ── SelectConCrear: desplegable de catálogo con "+ Crear nuevo…" inline ──
  const CREAR='__crear__';
  function htmlSelectConCrear({nombre,tabla,valor='',placeholder,creando=false,clase=''}){
    const opts=catalogo(tabla).map(r=>`<option value="${escapeHtml(r.id)}"${r.id===valor?' selected':''}>${escapeHtml(r.nombre)}</option>`).join('');
    return `
<div class="vt-scc ${escapeHtml(clase)}" data-scc-nombre="${escapeHtml(nombre)}" data-scc-tabla="${escapeHtml(tabla)}" data-scc-ph="${escapeHtml(placeholder)}">
  <select class="form-select" name="${escapeHtml(nombre)}" data-scc-select data-prev="${escapeHtml(valor)}">
    <option value="">${escapeHtml(placeholder)}</option>${opts}
    <option value="${CREAR}">+ Crear nuevo…</option>
  </select>
  ${creando?`<div class="vt-scc-nuevo">
    <input class="form-input" data-scc-input maxlength="120" placeholder="Nombre nuevo" autocomplete="off">
    <button type="button" class="btn-primary" data-scc-accion="crear">Crear</button>
    <button type="button" class="btn-secondary" data-scc-accion="cancelar">Cancelar</button>
  </div>`:''}
</div>`;
  }
  function sccRepintar(w,valor,creando){
    const nuevo=document.createElement('div');
    nuevo.innerHTML=htmlSelectConCrear({nombre:w.dataset.sccNombre,tabla:w.dataset.sccTabla,valor,placeholder:w.dataset.sccPh,creando,
      clase:[...w.classList].filter(c=>c!=='vt-scc').join(' ')});
    const w2=nuevo.firstElementChild;
    w.replaceWith(w2);
    if(creando){const i=w2.querySelector('[data-scc-input]');if(i)i.focus();}
    return w2;
  }
  function sccChange(e){
    const s=e.target.closest('[data-scc-select]');
    if(!s) return false;
    const w=s.closest('.vt-scc');
    if(s.value===CREAR) sccRepintar(w,s.dataset.prev||'',true);
    else s.dataset.prev=s.value;
    return true;
  }
  function sccClick(e){
    const b=e.target.closest('[data-scc-accion]');
    if(!b) return false;
    const w=b.closest('.vt-scc');
    const prev=w.querySelector('[data-scc-select]').dataset.prev||'';
    if(b.dataset.sccAccion==='cancelar') sccRepintar(w,prev,false);
    else sccCrear(w);
    return true;
  }
  function sccKeydown(e){
    if(!e.target.matches('[data-scc-input]')) return false;
    const w=e.target.closest('.vt-scc');
    if(e.key==='Enter'){e.preventDefault();sccCrear(w);return true;}
    if(e.key==='Escape'){e.preventDefault();sccRepintar(w,w.querySelector('[data-scc-select]').dataset.prev||'',false);return true;}
    return false;
  }
  async function sccCrear(w){
    if(w.dataset.ocupado) return;
    const tabla=w.dataset.sccTabla;
    const input=w.querySelector('[data-scc-input]');
    const nombre=String(input?input.value:'').trim();
    if(!nombre){showToast('El nombre no puede estar vacío',true);return;}
    w.dataset.ocupado='1';
    w.querySelectorAll('button,input').forEach(x=>{x.disabled=true;});
    const reactivar=()=>{delete w.dataset.ocupado;w.querySelectorAll('button,input').forEach(x=>{x.disabled=false;});if(input)input.focus();};
    try{
      // Duplicados ignorando mayúsculas contra todo el catálogo (activos e inactivos)
      const todos=await api(tabla+'?select=id,nombre,activo')||[];
      const clave=nombre.toLocaleLowerCase('es');
      const dup=todos.find(r=>String(r.nombre).trim().toLocaleLowerCase('es')===clave);
      if(dup&&dup.activo){
        if(!catalogo(tabla).some(r=>r.id===dup.id)) catalogosActivos[tabla]=catalogo(tabla).concat({id:dup.id,nombre:dup.nombre});
        showToast('Ya existe "'+dup.nombre+'": quedó seleccionado','success');
        sccRepintar(w,dup.id,false);
        return;
      }
      if(dup){showToast('"'+dup.nombre+'" existe pero está inactivo. Pedile a gerencia que lo active en Catálogos',true);reactivar();return;}
      const filas=await api(tabla,{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({nombre})});
      const fila=Array.isArray(filas)?filas[0]:null;
      if(!fila){showToast('Pedile a gerencia que lo agregue en Catálogos',true);reactivar();return;}
      catalogosActivos[tabla]=catalogo(tabla).concat({id:fila.id,nombre:fila.nombre})
        .sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
      showToast('Valor agregado','success');
      sccRepintar(w,fila.id,false);
    }catch(err){
      console.error('[ventas] Error creando valor en '+tabla,err);
      showToast(mensajeError(err,{permiso:'Pedile a gerencia que lo agregue en Catálogos'}),true);
      reactivar();
    }
  }

  // ── Botón WhatsApp ─────────────────────────
  function htmlBotonWhatsApp(tel,clase=''){
    const link=waLink(tel);
    return link
      ?`<a class="vt-wa ${escapeHtml(clase)}" href="${escapeHtml(link)}" target="_blank" rel="noopener">WhatsApp</a>`
      :`<button type="button" class="vt-wa vt-wa-off ${escapeHtml(clase)}" data-vt-wa-off aria-disabled="true" title="Sin teléfono válido">WhatsApp</button>`;
  }
  function waClick(e){
    if(!e.target.closest('[data-vt-wa-off]')) return false;
    showToast('El prospecto no tiene un teléfono válido para WhatsApp',true);
    return true;
  }

  // ── Estilos propios (prefijo .vt-) ─────────
  const css=[];
  function agregarCss(txt){css.push(txt);const st=document.getElementById('vt-estilos');if(st)st.textContent+=txt;}
  function inyectarCss(){
    if(document.getElementById('vt-estilos')) return;
    const st=document.createElement('style');
    st.id='vt-estilos';
    st.textContent=css.join('\n');
    document.head.appendChild(st);
  }
  agregarCss(`
.vt-subnav{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px;border-bottom:1px solid var(--border);}
.vt-sub-btn{background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--r);padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;}
.vt-sub-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent);}
.vt-sub-btn.vt-activo{background:var(--accent);border-color:var(--accent);color:#fff;}
.vt-sub-btn:disabled{opacity:.5;cursor:not-allowed;}
.vt-sub-btn small{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim);}
.vt-body{padding:16px 18px;}
.vt-msg{padding:14px;font-size:12px;color:var(--text-dim);}
.vt-msg.vt-error,.vt-error{color:var(--red);}
.vt-scc{display:flex;flex-direction:column;gap:6px;}
.vt-scc-nuevo{display:flex;gap:6px;align-items:center;}
.vt-scc-nuevo .form-input{flex:1;min-width:0;}
.vt-wa{font-size:11px;font-weight:600;color:var(--green);text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font-family:inherit;}
.vt-wa:hover{text-decoration:underline;}
.vt-wa-off{color:var(--text-muted);cursor:not-allowed;}
.vt-wa-off:hover{text-decoration:none;}
.vt-cat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;}
.vt-cat-card{border:1px solid var(--border);border-radius:var(--r);background:var(--bg2);display:flex;flex-direction:column;}
.vt-cat-head{padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg3);border-radius:var(--r) var(--r) 0 0;}
.vt-cat-add,.vt-cat-ren{display:flex;gap:6px;align-items:center;}
.vt-cat-add{padding:10px 14px;border-bottom:1px solid var(--border);}
.vt-cat-add .form-input,.vt-cat-ren .form-input{flex:1;min-width:0;}
.vt-cat-lista{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto;}
.vt-cat-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border);font-size:13px;}
.vt-cat-item:last-child{border-bottom:0;}
.vt-cat-item.vt-inactivo .vt-cat-nombre{opacity:.45;text-decoration:line-through;}
.vt-cat-nombre{flex:1;min-width:0;overflow-wrap:anywhere;}
.vt-cat-acc{display:flex;gap:5px;flex-shrink:0;}
.vt-cat-ren{flex:1;}
.vt-tag{font-size:9px;font-weight:700;text-transform:uppercase;color:var(--text-dim);border:1px solid var(--border);border-radius:4px;padding:1px 5px;margin-left:6px;}
`);

  // ══════════════════════════════════════════
  //  PANTALLA: CATÁLOGOS (solo gerencia)
  // ══════════════════════════════════════════
  const CATALOGOS=[
    {tabla:'crm_tipos_cliente',titulo:'Tipos de cliente'},
    {tabla:'crm_tipos_servicio',titulo:'Tipos de servicio'},
    {tabla:'crm_referidores',titulo:'Referidores'}
  ];
  const MSG_SIN_PERMISO='No tenés permiso para modificar catálogos';
  const cat={datos:{},errores:{},editando:null,ocupado:false};

  function ordenar(lista){
    return lista.slice().sort((a,b)=>(a.activo===b.activo?0:a.activo?-1:1)||String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
  }

  function htmlCatalogos(){
    return `<div class="vt-cat-grid">${CATALOGOS.map(htmlCatalogo).join('')}</div>`;
  }

  function htmlCatalogo(c){
    const t=escapeHtml(c.tabla);
    const lista=cat.datos[c.tabla];
    const err=cat.errores[c.tabla];
    let cuerpoHtml, resumen='';
    if(err) cuerpoHtml=`<div class="vt-msg vt-error">${escapeHtml(err)}</div>`;
    else if(!lista) cuerpoHtml=`<div class="vt-msg">Cargando…</div>`;
    else if(!lista.length) cuerpoHtml=`<div class="vt-msg">Sin valores cargados.</div>`;
    else cuerpoHtml=`<ul class="vt-cat-lista">${ordenar(lista).map(r=>htmlItem(c,r)).join('')}</ul>`;
    if(lista){
      const activos=lista.filter(r=>r.activo).length;
      resumen=`${lista.length} valor${lista.length===1?'':'es'} · ${activos} activo${activos===1?'':'s'}`;
    }
    const dis=cat.ocupado?' disabled':'';
    return `
<div class="vt-cat-card">
  <div class="vt-cat-head"><div class="panel-title">${escapeHtml(c.titulo)}</div><div class="panel-count">${escapeHtml(resumen)}</div></div>
  <form class="vt-cat-add" data-vt-form="agregar" data-tabla="${t}">
    <input class="form-input" name="nombre" maxlength="120" placeholder="Nuevo valor" autocomplete="off"${lista?'':' disabled'}>
    <button type="submit" class="btn-primary"${dis}${lista?'':' disabled'}>Agregar</button>
  </form>
  ${cuerpoHtml}
</div>`;
  }

  function htmlItem(c,r){
    const t=escapeHtml(c.tabla), id=escapeHtml(r.id);
    const dis=cat.ocupado?' disabled':'';
    const ed=cat.editando;
    if(ed&&ed.tabla===c.tabla&&ed.id===r.id){
      return `
<li class="vt-cat-item">
  <form class="vt-cat-ren" data-vt-form="renombrar" data-tabla="${t}" data-id="${id}">
    <input class="form-input" name="nombre" maxlength="120" value="${escapeHtml(r.nombre)}" autocomplete="off">
    <button type="submit" class="btn-primary"${dis}>Guardar</button>
    <button type="button" class="btn-secondary" data-vt-accion="cancelar"${dis}>Cancelar</button>
  </form>
</li>`;
    }
    return `
<li class="vt-cat-item${r.activo?'':' vt-inactivo'}">
  <span class="vt-cat-nombre">${escapeHtml(r.nombre)}</span>${r.activo?'':'<span class="vt-tag">Inactivo</span>'}
  <div class="vt-cat-acc">
    <button type="button" class="btn-edit" data-vt-accion="editar" data-tabla="${t}" data-id="${id}"${dis}>Renombrar</button>
    <button type="button" class="${r.activo?'btn-secondary':'btn-green'}" data-vt-accion="toggle" data-tabla="${t}" data-id="${id}"${dis}>${r.activo?'Desactivar':'Activar'}</button>
  </div>
</li>`;
  }

  async function cargarCatalogos(){
    cat.editando=null;
    await Promise.all(CATALOGOS.map(async c=>{
      try{
        const filas=await api(c.tabla+'?select=id,nombre,activo&order=nombre.asc');
        cat.datos[c.tabla]=Array.isArray(filas)?filas:[];
        delete cat.errores[c.tabla];
      }catch(e){
        console.error('[ventas] Error cargando '+c.tabla,e);
        cat.errores[c.tabla]='No se pudo cargar: '+(e&&e.message||'error desconocido');
      }
    }));
    if(nucleo.vista==='catalogos') repintar();
  }

  // Valida nombre: trim, no vacío, sin duplicados ignorando mayúsculas. Devuelve el nombre o null.
  function validarNombre(tabla,valor,idExcluido){
    const nombre=String(valor==null?'':valor).trim();
    if(!nombre){showToast('El nombre no puede estar vacío',true);return null;}
    const clave=nombre.toLocaleLowerCase('es');
    const dup=(cat.datos[tabla]||[]).some(r=>r.id!==idExcluido&&String(r.nombre).trim().toLocaleLowerCase('es')===clave);
    if(dup){showToast('Ya existe un valor con ese nombre',true);return null;}
    return nombre;
  }

  // Ejecuta una escritura con api(); espera la fila devuelta (Prefer: return=representation).
  // Si RLS filtra la fila, PostgREST devuelve [] sin error: se trata como falta de permiso.
  async function escribir(tabla,ruta,metodo,cuerpoReq){
    if(!exigirPermiso(esGerencia(),MSG_SIN_PERMISO)) return null;
    cat.ocupado=true; repintar();
    try{
      const filas=await api(ruta,{method:metodo,headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpoReq)});
      const fila=Array.isArray(filas)?filas[0]:null;
      if(!fila){showToast('⛔ '+MSG_SIN_PERMISO,true);return null;}
      const lista=cat.datos[tabla]||(cat.datos[tabla]=[]);
      const i=lista.findIndex(r=>r.id===fila.id);
      if(i>=0) lista[i]=fila; else lista.push(fila);
      return fila;
    }catch(e){
      console.error('[ventas] Error en '+metodo+' '+tabla,e);
      showToast(mensajeError(e,{permiso:MSG_SIN_PERMISO}),true);
      return null;
    }finally{
      cat.ocupado=false;
    }
  }

  async function agregar(tabla,valor){
    const nombre=validarNombre(tabla,valor,null);
    if(!nombre) return;
    const fila=await escribir(tabla,tabla,'POST',{nombre});
    repintar();
    if(fila) showToast('Valor agregado','success');
    const input=contenedor().querySelector(`form[data-vt-form="agregar"][data-tabla="${CSS.escape(tabla)}"] input`);
    if(input&&!fila) input.value=String(valor==null?'':valor);
    if(input) input.focus();
  }

  async function renombrar(tabla,id,valor){
    const actual=(cat.datos[tabla]||[]).find(r=>r.id===id);
    if(!actual) return;
    const nombre=validarNombre(tabla,valor,id);
    if(!nombre) return;
    if(nombre===actual.nombre){cat.editando=null;repintar();return;}
    const fila=await escribir(tabla,tabla+'?id=eq.'+encodeURIComponent(id),'PATCH',{nombre});
    if(fila){cat.editando=null;showToast('Nombre actualizado','success');}
    repintar();
    if(!fila){
      const input=contenedor().querySelector('form[data-vt-form="renombrar"] input');
      if(input){input.value=String(valor==null?'':valor);input.focus();}
    }
  }

  async function alternarActivo(tabla,id){
    const actual=(cat.datos[tabla]||[]).find(r=>r.id===id);
    if(!actual) return;
    const fila=await escribir(tabla,tabla+'?id=eq.'+encodeURIComponent(id),'PATCH',{activo:!actual.activo});
    repintar();
    if(fila) showToast(fila.activo?'Valor activado':'Valor desactivado','success');
  }

  registrarPantalla({
    id:'catalogos',
    html:htmlCatalogos,
    entrar:cargarCatalogos,
    on:{
      click(e){
        const b=e.target.closest('[data-vt-accion]');
        if(!b||b.disabled||cat.ocupado) return;
        const acc=b.dataset.vtAccion;
        if(acc==='editar'){
          cat.editando={tabla:b.dataset.tabla,id:b.dataset.id};repintar();
          const input=contenedor().querySelector('form[data-vt-form="renombrar"] input');
          if(input){input.focus();input.select();}
        }
        else if(acc==='cancelar'){cat.editando=null;repintar();}
        else if(acc==='toggle'){alternarActivo(b.dataset.tabla,b.dataset.id);}
      },
      submit(e){
        const f=e.target.closest('form[data-vt-form]');
        if(!f) return;
        e.preventDefault();
        if(cat.ocupado) return;
        const valor=f.elements.nombre?f.elements.nombre.value:'';
        if(f.dataset.vtForm==='agregar') agregar(f.dataset.tabla,valor);
        else if(f.dataset.vtForm==='renombrar') renombrar(f.dataset.tabla,f.dataset.id,valor);
      },
      keydown(e){
        if(e.key==='Escape'&&cat.editando&&e.target.closest('form[data-vt-form="renombrar"]')){cat.editando=null;repintar();}
      }
    }
  });

  window.Ventas={
    mostrar,ir,repintar,registrarPantalla,
    util:{fmtFecha,hoyAR,fmtMonto,normalizarTelAR,waLink,ESTADOS,etiquetaEstado,nombreResponsable,mensajeError},
    comun:{cargarCatalogosActivos,catalogo,nombreEnCatalogo,cargarResponsables,htmlSelectConCrear,htmlBotonWhatsApp,agregarCss,contenedor,cuerpo}
  };
})();
