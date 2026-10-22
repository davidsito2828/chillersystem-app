// ══════════════════════════════════════════
//  MÓDULO VENTAS (CRM) — se carga desde index.html con defer
//  Reutiliza las globales de index.html: api, escapeHtml, showToast,
//  exigirPermiso, esGerencia. Expone window.Ventas.
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

  // ── Configuración ──────────────────────────
  const SUBMENU=[
    {id:'tablero',label:'Tablero'},
    {id:'leads',label:'Leads'},
    {id:'agenda',label:'Agenda'},
    {id:'nueva',label:'Nueva oportunidad'},
    {id:'listado',label:'Listado'},
    {id:'resumen',label:'Resumen ejecutivo'},
    {id:'facturacion',label:'Novedades de Facturación'},
    {id:'catalogos',label:'Catálogos',disponible:true,visible:()=>esGerencia()}
  ];
  const CATALOGOS=[
    {tabla:'crm_tipos_cliente',titulo:'Tipos de cliente'},
    {tabla:'crm_tipos_servicio',titulo:'Tipos de servicio'},
    {tabla:'crm_referidores',titulo:'Referidores'}
  ];
  const MSG_SIN_PERMISO='No tenés permiso para modificar catálogos';

  const estado={vista:null,datos:{},errores:{},editando:null,ocupado:false,eventos:false};

  // ── Estilos propios (prefijo .vt-) ─────────
  function inyectarCss(){
    if(document.getElementById('vt-estilos')) return;
    const st=document.createElement('style');
    st.id='vt-estilos';
    st.textContent=`
.vt-subnav{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px;border-bottom:1px solid var(--border);}
.vt-sub-btn{background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--r);padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;}
.vt-sub-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent);}
.vt-sub-btn.vt-activo{background:var(--accent);border-color:var(--accent);color:#fff;}
.vt-sub-btn:disabled{opacity:.5;cursor:not-allowed;}
.vt-sub-btn small{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim);}
.vt-body{padding:16px 18px;}
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
.vt-msg{padding:14px;font-size:12px;color:var(--text-dim);}
.vt-msg.vt-error{color:var(--red);}
`;
    document.head.appendChild(st);
  }

  // ── Render general ─────────────────────────
  function contenedor(){return document.getElementById('tab-ventas');}
  function itemsVisibles(){return SUBMENU.filter(it=>!it.visible||it.visible());}

  function mostrar(){
    const el=contenedor();
    if(!el) return;
    inyectarCss();
    engancharEventos(el);
    const disponibles=itemsVisibles().filter(it=>it.disponible);
    if(!disponibles.some(it=>it.id===estado.vista)) estado.vista=disponibles.length?disponibles[0].id:null;
    render();
    if(estado.vista==='catalogos') cargarCatalogos();
  }

  function render(){
    const el=contenedor();
    if(!el) return;
    const sub=itemsVisibles().map(it=>it.disponible
      ?`<button type="button" class="vt-sub-btn${it.id===estado.vista?' vt-activo':''}" data-vt-accion="vista" data-vista="${escapeHtml(it.id)}">${escapeHtml(it.label)}</button>`
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
<div class="vt-body">${renderVista()}</div>`;
  }

  function renderVista(){
    if(estado.vista==='catalogos') return renderCatalogos();
    return `<div class="empty-state"><div class="empty-icon">🚧</div><div class="empty-title">Módulo en construcción</div><div>Las pantallas de Ventas van a estar disponibles próximamente.</div></div>`;
  }

  // ── Catálogos ──────────────────────────────
  function ordenar(lista){
    return lista.slice().sort((a,b)=>(a.activo===b.activo?0:a.activo?-1:1)||String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
  }

  function renderCatalogos(){
    return `<div class="vt-cat-grid">${CATALOGOS.map(renderCatalogo).join('')}</div>`;
  }

  function renderCatalogo(cat){
    const t=escapeHtml(cat.tabla);
    const lista=estado.datos[cat.tabla];
    const err=estado.errores[cat.tabla];
    let cuerpo, resumen='';
    if(err) cuerpo=`<div class="vt-msg vt-error">${escapeHtml(err)}</div>`;
    else if(!lista) cuerpo=`<div class="vt-msg">Cargando…</div>`;
    else if(!lista.length) cuerpo=`<div class="vt-msg">Sin valores cargados.</div>`;
    else cuerpo=`<ul class="vt-cat-lista">${ordenar(lista).map(r=>renderItem(cat,r)).join('')}</ul>`;
    if(lista) resumen=`${lista.length} valor${lista.length===1?'':'es'} · ${lista.filter(r=>r.activo).length} activo${lista.filter(r=>r.activo).length===1?'':'s'}`;
    const dis=estado.ocupado?' disabled':'';
    return `
<div class="vt-cat-card">
  <div class="vt-cat-head"><div class="panel-title">${escapeHtml(cat.titulo)}</div><div class="panel-count">${escapeHtml(resumen)}</div></div>
  <form class="vt-cat-add" data-vt-form="agregar" data-tabla="${t}">
    <input class="form-input" name="nombre" maxlength="120" placeholder="Nuevo valor" autocomplete="off"${lista?'':' disabled'}>
    <button type="submit" class="btn-primary"${dis}${lista?'':' disabled'}>Agregar</button>
  </form>
  ${cuerpo}
</div>`;
  }

  function renderItem(cat,r){
    const t=escapeHtml(cat.tabla), id=escapeHtml(r.id);
    const dis=estado.ocupado?' disabled':'';
    const ed=estado.editando;
    if(ed&&ed.tabla===cat.tabla&&ed.id===r.id){
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
    await Promise.all(CATALOGOS.map(async cat=>{
      try{
        const filas=await api(cat.tabla+'?select=id,nombre,activo&order=nombre.asc');
        estado.datos[cat.tabla]=Array.isArray(filas)?filas:[];
        delete estado.errores[cat.tabla];
      }catch(e){
        console.error('[ventas] Error cargando '+cat.tabla,e);
        estado.errores[cat.tabla]='No se pudo cargar: '+(e&&e.message||'error desconocido');
      }
    }));
    if(estado.vista==='catalogos') render();
  }

  function mensajeError(e){
    const m=String(e&&e.message||'');
    if(/duplicate key|23505|unique constraint/i.test(m)) return 'Ya existe un valor con ese nombre';
    if(/row-level security|42501|permission denied/i.test(m)) return MSG_SIN_PERMISO;
    return 'Error: '+(m||'no se pudo guardar');
  }

  // Valida nombre: trim, no vacío, sin duplicados ignorando mayúsculas. Devuelve el nombre o null.
  function validarNombre(tabla,valor,idExcluido){
    const nombre=String(valor==null?'':valor).trim();
    if(!nombre){showToast('El nombre no puede estar vacío',true);return null;}
    const clave=nombre.toLocaleLowerCase('es');
    const dup=(estado.datos[tabla]||[]).some(r=>r.id!==idExcluido&&String(r.nombre).trim().toLocaleLowerCase('es')===clave);
    if(dup){showToast('Ya existe un valor con ese nombre',true);return null;}
    return nombre;
  }

  // Ejecuta una escritura con api(); espera la fila devuelta (Prefer: return=representation).
  // Si RLS filtra la fila, PostgREST devuelve [] sin error: se trata como falta de permiso.
  async function escribir(tabla,ruta,metodo,cuerpo){
    if(!exigirPermiso(esGerencia(),MSG_SIN_PERMISO)) return null;
    estado.ocupado=true; render();
    try{
      const filas=await api(ruta,{method:metodo,headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpo)});
      const fila=Array.isArray(filas)?filas[0]:null;
      if(!fila){showToast('⛔ '+MSG_SIN_PERMISO,true);return null;}
      const lista=estado.datos[tabla]||(estado.datos[tabla]=[]);
      const i=lista.findIndex(r=>r.id===fila.id);
      if(i>=0) lista[i]=fila; else lista.push(fila);
      return fila;
    }catch(e){
      console.error('[ventas] Error en '+metodo+' '+tabla,e);
      showToast(mensajeError(e),true);
      return null;
    }finally{
      estado.ocupado=false;
    }
  }

  async function agregar(tabla,valor){
    const nombre=validarNombre(tabla,valor,null);
    if(!nombre) return;
    const fila=await escribir(tabla,tabla,'POST',{nombre});
    render();
    if(fila) showToast('Valor agregado','success');
    const input=contenedor().querySelector(`form[data-vt-form="agregar"][data-tabla="${CSS.escape(tabla)}"] input`);
    if(input&&!fila) input.value=String(valor==null?'':valor);
    if(input) input.focus();
  }

  async function renombrar(tabla,id,valor){
    const actual=(estado.datos[tabla]||[]).find(r=>r.id===id);
    if(!actual) return;
    const nombre=validarNombre(tabla,valor,id);
    if(!nombre) return;
    if(nombre===actual.nombre){estado.editando=null;render();return;}
    const fila=await escribir(tabla,tabla+'?id=eq.'+encodeURIComponent(id),'PATCH',{nombre});
    if(fila){estado.editando=null;showToast('Nombre actualizado','success');}
    render();
    if(!fila){
      const input=contenedor().querySelector('form[data-vt-form="renombrar"] input');
      if(input){input.value=String(valor==null?'':valor);input.focus();}
    }
  }

  async function alternarActivo(tabla,id){
    const actual=(estado.datos[tabla]||[]).find(r=>r.id===id);
    if(!actual) return;
    const fila=await escribir(tabla,tabla+'?id=eq.'+encodeURIComponent(id),'PATCH',{activo:!actual.activo});
    render();
    if(fila) showToast(fila.activo?'Valor activado':'Valor desactivado','success');
  }

  // ── Eventos (delegados, se enganchan una sola vez) ──
  function engancharEventos(el){
    if(estado.eventos) return;
    estado.eventos=true;
    el.addEventListener('click',e=>{
      const b=e.target.closest('[data-vt-accion]');
      if(!b||!el.contains(b)||b.disabled||estado.ocupado) return;
      const acc=b.dataset.vtAccion;
      if(acc==='vista'){estado.vista=b.dataset.vista;estado.editando=null;mostrar();}
      else if(acc==='editar'){estado.editando={tabla:b.dataset.tabla,id:b.dataset.id};render();
        const input=el.querySelector('form[data-vt-form="renombrar"] input');
        if(input){input.focus();input.select();}}
      else if(acc==='cancelar'){estado.editando=null;render();}
      else if(acc==='toggle'){alternarActivo(b.dataset.tabla,b.dataset.id);}
    });
    el.addEventListener('submit',e=>{
      const f=e.target.closest('form[data-vt-form]');
      if(!f) return;
      e.preventDefault();
      if(estado.ocupado) return;
      const valor=f.elements.nombre?f.elements.nombre.value:'';
      if(f.dataset.vtForm==='agregar') agregar(f.dataset.tabla,valor);
      else if(f.dataset.vtForm==='renombrar') renombrar(f.dataset.tabla,f.dataset.id,valor);
    });
    el.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&estado.editando&&e.target.closest('form[data-vt-form="renombrar"]')){estado.editando=null;render();}
    });
  }

  window.Ventas={mostrar,util:{fmtFecha,hoyAR,fmtMonto}};
})();
