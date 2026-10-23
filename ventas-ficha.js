// ══════════════════════════════════════════
//  VENTAS — Ficha de la oportunidad: datos, edición, estado, eliminación,
//  historial y registro de seguimientos, y marca de "vista" (crm_vistas).
//  Se carga con defer después de ventas-oportunidades.js (usa V.oportunidades.cambiarEstado).
//  Pantalla interna 'ficha': no tiene ítem en el submenú y deja resaltado "Tablero".
// ══════════════════════════════════════════
(function(){
  'use strict';
  const V=window.Ventas;
  if(!V||!V.oportunidades){console.error('[ventas] ventas-ficha.js necesita ventas.js y ventas-oportunidades.js cargados antes');return;}
  const {fmtFecha,hoyAR,fmtMonto,ESTADOS,etiquetaEstado,nombreResponsable,nombreUsuarioSeguimiento,mensajeError}=V.util;
  const C=V.comun;
  const O=V.oportunidades;

  const TIPOS_CONTACTO=['Llamada','Email','WhatsApp','Reunión','Otro'];
  const MSG_PERMISO_OP='No tenés permiso para modificar esta oportunidad';
  const MSG_PERMISO_ELIMINAR='No tenés permiso para eliminar oportunidades';
  const MSG_CONFIRMAR_ELIMINAR='Se va a eliminar esta oportunidad junto con todo su historial de seguimientos. No se puede deshacer. ¿Confirmás?';
  const SELECT_OP='crm_oportunidades?select=*,crm_prospectos(id,nombre,contacto_nombre,telefono,email,tipo_cliente_id,referido_por_id,crm_tipos_cliente(nombre),crm_referidores(nombre)),crm_tipos_servicio(nombre),usuarios(nombre)&id=eq.';
  const CATALOGOS=['crm_tipos_servicio','crm_tipos_cliente','crm_referidores'];

  // En la ficha las fechas vacías se muestran como '-' (igual que el original)
  function fecha(f){return f?fmtFecha(f):'-';}
  // Elimina gerencia o el responsable de la oportunidad (el agente de ventas borra las suyas)
  function puedeEliminar(op){return esGerencia()||(!!usuarioActual&&!!op&&!!op.responsable_id&&usuarioActual.id===op.responsable_id);}

  C.agregarCss(`
.vt-ficha{max-width:960px;}
.vt-fc-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;}
.vt-fc-head .vt-h2{margin:0;}
.vt-fc-estado{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.vt-fc-estado .form-select{width:auto;min-width:170px;}
.vt-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;}
.vt-badge-en_seguimiento{background:#fef3c7;color:#b45309;}
.vt-badge-aceptado{background:#d1fae5;color:#047857;}
.vt-badge-rechazado{background:#ffe4e6;color:#be123c;}
.vt-badge-en_espera{background:#f1f5f9;color:#334155;}
.vt-fc-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px;margin:12px 0 8px;}
.vt-fc-confirm{background:#fff1f2;border:1px solid #fecdd3;border-radius:var(--r);padding:12px;margin-bottom:10px;font-size:13px;color:#9f1239;}
.vt-fc-confirm p{margin:0 0 10px;}
.vt-fc-confirm div{display:flex;gap:8px;flex-wrap:wrap;}
.vt-fc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:14px;}
.vt-fc-etq{display:block;font-size:11px;color:var(--text-dim);margin-bottom:3px;}
.vt-fc-val{font-size:13px;color:var(--text);overflow-wrap:anywhere;}
.vt-fc-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim);margin-top:6px;}
.vt-fc-coment{font-size:13px;color:var(--text-dim);margin:12px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;}
.vt-fc-form-coment{margin-top:12px;}
.vt-fc-h3{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:22px 0 10px;}
.vt-fc-seg-box{margin-bottom:12px;}
.vt-fc-seg-form{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px;display:flex;flex-direction:column;gap:10px;}
.vt-fc-seg-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;}
.vt-fc-seg-btns{display:flex;gap:8px;}
.vt-segs{display:flex;flex-direction:column;gap:10px;}
.vt-seg{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:12px;}
.vt-seg-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px;}
.vt-seg-tit{font-size:13px;font-weight:600;color:var(--text);}
.vt-seg-autor{font-size:11px;color:var(--text-dim);}
.vt-seg-nota{font-size:13px;color:var(--text-dim);margin:0;white-space:pre-wrap;overflow-wrap:anywhere;}
.vt-seg-prox{font-size:11px;color:var(--accent);margin:4px 0 0;}
`);

  const fc={id:null,cargando:false,error:'',noEncontrada:false,op:null,segs:[],editando:false,guardando:false,
    eliminando:false,cambiandoEstado:false,segAbierto:false,segGuardando:false,recargarAlCancelar:false,seq:0};

  function abierta(id){const a=V.vistaActual();return a.vista==='ficha'&&a.params&&a.params.id===id;}
  function cuerpo(){return C.cuerpo();}
  function q(sel){const b=cuerpo();return b?b.querySelector(sel):null;}
  function mostrarError(sel,msg){const p=q(sel);if(!p)return;p.textContent=msg||'';p.hidden=!msg;}

  // ── Carga ──────────────────────────────────
  async function cargar(id,{catalogos=true}={}){
    const seq=++fc.seq;
    const [ops,segs]=await Promise.all([
      api(SELECT_OP+encodeURIComponent(id)),
      api('crm_seguimientos?select=*,usuarios(nombre)&oportunidad_id=eq.'+encodeURIComponent(id)+'&order=fecha_contacto.desc,created_at.desc'),
      catalogos?C.cargarCatalogosActivos(CATALOGOS):Promise.resolve()
    ]);
    if(seq!==fc.seq||fc.id!==id) return false; // respuesta vieja: se descarta
    fc.op=(Array.isArray(ops)&&ops[0])||null;
    fc.noEncontrada=!fc.op;
    fc.segs=Array.isArray(segs)?segs:[];
    return true;
  }

  // Deja constancia de que este usuario vio la ficha (upsert en crm_vistas). Si falla, solo console.warn.
  function marcarVista(id){
    return api('crm_vistas?on_conflict=oportunidad_id,usuario_id',{
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({oportunidad_id:id,usuario_id:usuarioActual.id,last_viewed_at:new Date().toISOString()})
    }).catch(e=>{console.warn('[ventas] No se pudo marcar la oportunidad como vista',e);});
  }

  async function entrar(params){
    const id=params&&params.id?String(params.id):null;
    Object.assign(fc,{id,cargando:!!id,error:'',noEncontrada:!id,op:null,segs:[],editando:false,guardando:false,
      eliminando:false,cambiandoEstado:false,segAbierto:false,segGuardando:false,recargarAlCancelar:false});
    V.repintar();
    if(!id) return;
    try{
      const ok=await cargar(id);
      if(!ok) return;
      if(fc.op) marcarVista(id);
    }catch(e){
      console.error('[ventas] Error cargando la ficha',e);
      if(fc.id===id) fc.error='No se pudo cargar la oportunidad: '+mensajeError(e);
    }finally{
      if(fc.id===id) fc.cargando=false;
    }
    if(abierta(id)) V.repintar();
  }

  // ── Render ─────────────────────────────────
  const VOLVER='<button type="button" class="btn-secondary" data-vt-ir="tablero">← Volver al tablero</button>';

  function html(){
    if(fc.cargando) return `<div class="vt-ficha" data-vt-pantalla="ficha">${VOLVER}<div class="vt-msg">Cargando…</div></div>`;
    if(fc.error) return `<div class="vt-ficha" data-vt-pantalla="ficha">${VOLVER}<div class="vt-msg vt-error">${escapeHtml(fc.error)}</div></div>`;
    if(fc.noEncontrada||!fc.op) return `<div class="vt-ficha" data-vt-pantalla="ficha"><p class="vt-msg">Oportunidad no encontrada.</p>${VOLVER}</div>`;
    const op=fc.op, p=op.crm_prospectos;
    const ed=fc.editando;
    const otros=ESTADOS.filter(e=>e.valor!==op.estado).map(e=>`<option value="${escapeHtml(e.valor)}">${escapeHtml(e.etiqueta)}</option>`).join('');
    const estadoOff=ed||fc.cambiandoEstado;
    return `
<div class="vt-ficha" data-vt-pantalla="ficha">
  ${VOLVER}
  <div class="vt-fc-head">
    <h2 class="vt-h2">${escapeHtml(p&&p.nombre||'-')}</h2>
    <div class="vt-fc-estado">
      <span class="vt-badge vt-badge-${escapeHtml(op.estado)}">${escapeHtml(etiquetaEstado(op.estado))}</span>
      <select class="form-select" data-vt-fc-estado aria-label="Cambiar estado"${estadoOff?' disabled':''}${ed?' title="Guardá o cancelá la edición para cambiar el estado"':''}>
        <option value="">Cambiar estado…</option>${otros}
      </select>
    </div>
  </div>
  <div class="vt-fc-bar">
    ${C.htmlBotonWhatsApp(p&&p.telefono)}
    ${ed
      ?`<button type="button" class="btn-secondary" data-vt-fc="cancelar">Cancelar</button>
        <button type="button" class="btn-primary" data-vt-fc="guardar">Guardar cambios</button>`
      :`<button type="button" class="btn-edit" data-vt-fc="editar">Editar</button>
        ${puedeEliminar(op)?`<button type="button" class="btn-danger" data-vt-fc="eliminar">Eliminar oportunidad</button>`:''}`}
  </div>
  <div data-vt-fc-confirm></div>
  <p class="vt-error" data-vt-fc-error hidden></p>
  <form data-vt-fc-form autocomplete="off">
    <div class="vt-fc-grid">${ed?htmlCamposEdicion(op,p):htmlCamposLectura(op,p)}</div>
    ${ed
      ?`<div class="form-group vt-fc-form-coment"><textarea class="form-textarea" name="comentarios" rows="3" placeholder="Comentarios (opcional)">${escapeHtml(op.comentarios||'')}</textarea></div>`
      :(op.comentarios?`<p class="vt-fc-coment">Comentarios: ${escapeHtml(op.comentarios)}</p>`:'')}
  </form>
  <div data-vt-fc-hist>${htmlHistorial()}</div>
</div>`;
  }

  function campo(etq,val,extra=''){
    return `<div class="vt-fc-campo"${extra}><span class="vt-fc-etq">${escapeHtml(etq)}</span><div class="vt-fc-val">${escapeHtml(val)}</div></div>`;
  }
  function campoEd(etq,control){
    return `<div class="vt-fc-campo"><label class="vt-fc-etq">${escapeHtml(etq)}</label>${control}</div>`;
  }
  function textoComision(op){
    return op.comision_monto?`${fmtMonto(op.comision_monto,op.moneda||'ARS')} (${op.comision_liquidada?'liquidada':'pendiente'})`:'-';
  }

  function htmlCamposLectura(op,p){
    return [
      campo('N° de referencia',op.numero_referencia||'-'),
      campo('Tipo de cliente',(p&&p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre)||'-'),
      campo('Contacto',(p&&p.contacto_nombre)||'-'),
      campo('Teléfono',(p&&p.telefono)||'-'),
      campo('Email',(p&&p.email)||'-'),
      campo('Referido por',(p&&p.crm_referidores&&p.crm_referidores.nombre)||'-'),
      campo('Tipo de servicio',(op.crm_tipos_servicio&&op.crm_tipos_servicio.nombre)||'-'),
      campo('Cantidad de equipos',op.cantidad_equipos==null?'-':String(op.cantidad_equipos)),
      campo('Monto estimado',op.monto_estimado==null?'-':fmtMonto(op.monto_estimado,op.moneda||'ARS')),
      campo('Comisión',textoComision(op)),
      campo('Fecha de ingreso',fecha(op.fecha_ingreso)),
      campo('Fecha de envío',fecha(op.fecha_envio)),
      campo('Fecha de cierre',fecha(op.fecha_cierre)),
      op.estado==='aceptado'?campo('Fecha de facturación',fecha(op.fecha_facturacion)):'',
      campo('Próximo seguimiento',fecha(op.proxima_fecha_seguimiento),' data-vt-fc-proxima'),
      campo('Responsable',nombreResponsable(op))
    ].join('');
  }

  function htmlCamposEdicion(op,p){
    const inp=(nombre,valor,attrs='')=>`<input class="form-input" name="${nombre}" value="${escapeHtml(valor==null?'':valor)}"${attrs}>`;
    const prosp=!!p;
    return [
      campoEd('N° de referencia',inp('numero_referencia',op.numero_referencia,' type="text" maxlength="60" placeholder="Ej: 4806-BIS"')),
      prosp?campoEd('Tipo de cliente',C.htmlSelectConCrear({nombre:'p_tipo_cliente_id',tabla:'crm_tipos_cliente',valor:p.tipo_cliente_id||'',
        placeholder:'Elegir tipo de cliente',actual:p.tipo_cliente_id?{id:p.tipo_cliente_id,nombre:p.crm_tipos_cliente&&p.crm_tipos_cliente.nombre}:null})):campo('Tipo de cliente','-'),
      prosp?campoEd('Contacto',inp('p_contacto_nombre',p.contacto_nombre,' type="text" maxlength="120"')):campo('Contacto','-'),
      prosp?campoEd('Teléfono',inp('p_telefono',p.telefono,' type="tel" maxlength="40"')):campo('Teléfono','-'),
      prosp?campoEd('Email',inp('p_email',p.email,' type="email" maxlength="160"')):campo('Email','-'),
      prosp?campoEd('Referido por',C.htmlSelectConCrear({nombre:'p_referido_por_id',tabla:'crm_referidores',valor:p.referido_por_id||'',
        placeholder:'Referido por (opcional)',actual:p.referido_por_id?{id:p.referido_por_id,nombre:p.crm_referidores&&p.crm_referidores.nombre}:null})):campo('Referido por','-'),
      campoEd('Tipo de servicio',C.htmlSelectConCrear({nombre:'tipo_servicio_id',tabla:'crm_tipos_servicio',valor:op.tipo_servicio_id||'',
        placeholder:'Elegir tipo de servicio',actual:op.tipo_servicio_id?{id:op.tipo_servicio_id,nombre:op.crm_tipos_servicio&&op.crm_tipos_servicio.nombre}:null})),
      campoEd('Cantidad de equipos',inp('cantidad_equipos',op.cantidad_equipos,' type="number" min="0" step="1" inputmode="numeric"')),
      campoEd('Monto estimado',inp('monto_estimado',op.monto_estimado,' type="number" min="0" step="any" inputmode="decimal"')),
      campoEd('Moneda',`<select class="form-select" name="moneda"><option value="ARS"${op.moneda!=='USD'?' selected':''}>Pesos (ARS)</option><option value="USD"${op.moneda==='USD'?' selected':''}>Dólares (USD)</option></select>`),
      campoEd('Comisión',inp('comision_monto',op.comision_monto,' type="number" min="0" step="any" inputmode="decimal"')
        +`<label class="vt-fc-check"><input type="checkbox" name="comision_liquidada"${op.comision_liquidada?' checked':''}> Liquidada</label>`),
      campo('Fecha de ingreso',fecha(op.fecha_ingreso)),
      campoEd('Fecha de envío',inp('fecha_envio',op.fecha_envio,' type="date"')),
      campo('Fecha de cierre',fecha(op.fecha_cierre)),
      op.estado==='aceptado'?campoEd('Fecha de facturación',inp('fecha_facturacion',op.fecha_facturacion,' type="date"')):'',
      campo('Próximo seguimiento',fecha(op.proxima_fecha_seguimiento),' data-vt-fc-proxima'),
      campo('Responsable',nombreResponsable(op))
    ].join('');
  }

  function htmlHistorial(){
    const segs=fc.segs;
    const lista=segs.length
      ?`<div class="vt-segs">${segs.map(s=>`
        <div class="vt-seg">
          <div class="vt-seg-head">
            <span class="vt-seg-tit">${escapeHtml(s.tipo_contacto||'Contacto')} — ${escapeHtml(fecha(s.fecha_contacto))}</span>
            <span class="vt-seg-autor">${escapeHtml(nombreUsuarioSeguimiento(s))}</span>
          </div>
          ${s.nota?`<p class="vt-seg-nota">${escapeHtml(s.nota)}</p>`:''}
          ${s.proxima_fecha_seguimiento?`<p class="vt-seg-prox">Próximo seguimiento: ${escapeHtml(fecha(s.proxima_fecha_seguimiento))}</p>`:''}
        </div>`).join('')}</div>`
      :'<p class="vt-msg">Todavía no hay seguimientos registrados.</p>';
    return `
  <h3 class="vt-fc-h3">Historial de seguimientos (${segs.length})</h3>
  <div class="vt-fc-seg-box">${fc.segAbierto?htmlFormSeguimiento():'<button type="button" class="btn-primary" data-vt-fc="seg-abrir">Registrar seguimiento</button>'}</div>
  ${lista}`;
  }

  function htmlFormSeguimiento(){
    return `
<form class="vt-fc-seg-form" data-vt-fc-seg novalidate autocomplete="off">
  <div class="vt-fc-seg-campos">
    <div class="form-group"><label class="form-label">Fecha de contacto</label>
      <input class="form-input" type="date" name="fecha_contacto" value="${escapeHtml(hoyAR())}"></div>
    <div class="form-group"><label class="form-label">Tipo de contacto</label>
      <select class="form-select" name="tipo_contacto">${TIPOS_CONTACTO.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Próxima fecha de seguimiento (opcional)</label>
      <input class="form-input" type="date" name="proxima_fecha_seguimiento"></div>
  </div>
  <textarea class="form-textarea" name="nota" rows="3" placeholder="Nota sobre el contacto"></textarea>
  <p class="vt-error" data-vt-fc-seg-error hidden></p>
  <div class="vt-fc-seg-btns">
    <button type="submit" class="btn-primary" data-vt-fc-seg-guardar>Guardar seguimiento</button>
    <button type="button" class="btn-secondary" data-vt-fc="seg-cancelar">Cancelar</button>
  </div>
</form>`;
  }

  // Repinta solo el historial y "Próximo seguimiento" (no pisa una edición en curso)
  function pintarHistorial(){
    const h=q('[data-vt-fc-hist]');
    if(h) h.innerHTML=htmlHistorial();
    const pr=q('[data-vt-fc-proxima] .vt-fc-val');
    if(pr&&fc.op) pr.textContent=fecha(fc.op.proxima_fecha_seguimiento);
  }

  function botones(sel,{disabled,texto}){
    const b=q(sel);
    if(!b) return;
    b.disabled=disabled;
    if(texto) b.textContent=texto;
  }

  // ── Acciones ───────────────────────────────
  async function guardarCambios(){
    if(fc.guardando||!fc.op) return;
    if(!exigirPermiso(puedeVerModulo('ventas'),MSG_PERMISO_OP)) return;
    const form=q('form[data-vt-fc-form]');
    if(!form) return;
    const op=fc.op, p=op.crm_prospectos, id=op.id;
    const f=form.elements;
    const v=n=>f[n]?String(f[n].value).trim():'';
    const sel=n=>{const x=v(n);return x&&x!=='__crear__'?x:null;};
    mostrarError('[data-vt-fc-error]','');
    const cant=v('cantidad_equipos');
    if(cant!==''&&!(Number.isInteger(Number(cant))&&Number(cant)>=0)){mostrarError('[data-vt-fc-error]','La cantidad de equipos tiene que ser un número entero (0 o más).');return;}
    const cuerpoOp={
      numero_referencia:v('numero_referencia')||null,
      tipo_servicio_id:sel('tipo_servicio_id'),
      cantidad_equipos:cant!==''?Number(cant):null,
      monto_estimado:v('monto_estimado')!==''?Number(v('monto_estimado')):null,
      moneda:v('moneda')==='USD'?'USD':'ARS',
      fecha_envio:v('fecha_envio')||null,
      fecha_facturacion:op.estado==='aceptado'?(v('fecha_facturacion')||null):null,
      comision_monto:v('comision_monto')!==''?Number(v('comision_monto')):null,
      comision_liquidada:!!(f.comision_liquidada&&f.comision_liquidada.checked),
      comentarios:v('comentarios')||null
    };
    const cuerpoProsp=p?{
      tipo_cliente_id:sel('p_tipo_cliente_id'),
      contacto_nombre:v('p_contacto_nombre')||null,
      telefono:v('p_telefono')||null,
      email:v('p_email')||null,
      referido_por_id:sel('p_referido_por_id')
    }:null;
    fc.guardando=true;
    botones('[data-vt-fc="guardar"]',{disabled:true,texto:'Guardando...'});
    botones('[data-vt-fc="cancelar"]',{disabled:true});
    const liberar=()=>{fc.guardando=false;botones('[data-vt-fc="guardar"]',{disabled:false,texto:'Guardar cambios'});botones('[data-vt-fc="cancelar"]',{disabled:false});};
    // 1) Oportunidad
    try{
      const filas=await api('crm_oportunidades?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(cuerpoOp)});
      const fila=Array.isArray(filas)?filas[0]:null;
      if(!fila) throw new Error('row-level security');
      if(fc.op&&fc.op.id===id) Object.assign(fc.op,fila);
    }catch(e){
      console.error('[ventas] Error guardando oportunidad',e);
      liberar();
      mostrarError('[data-vt-fc-error]','Error al guardar: '+mensajeError(e,{permiso:MSG_PERMISO_OP}));
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
        fc.recargarAlCancelar=true; // la oportunidad ya cambió: al cancelar se recarga para no mostrar datos viejos
        mostrarError('[data-vt-fc-error]','Se guardó la oportunidad, pero falló el prospecto: '+mensajeError(e,{permiso:'No tenés permiso para modificar este prospecto'}));
        return;
      }
    }
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha',e);}
    fc.guardando=false;
    fc.editando=false;
    fc.recargarAlCancelar=false;
    if(abierta(id)) V.repintar();
  }

  async function cancelarEdicion(){
    if(fc.guardando) return;
    fc.editando=false;
    if(!fc.recargarAlCancelar||!fc.op){V.repintar();return;}
    const id=fc.op.id;
    fc.recargarAlCancelar=false;
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha',e);}
    if(abierta(id)) V.repintar();
  }

  function pedirConfirmacionEliminar(){
    const box=q('[data-vt-fc-confirm]');
    if(!box) return;
    box.innerHTML=`<div class="vt-fc-confirm" role="alertdialog">
      <p>${escapeHtml(MSG_CONFIRMAR_ELIMINAR)}</p>
      <div><button type="button" class="btn-danger" data-vt-fc="eliminar-si">Sí, eliminar</button>
      <button type="button" class="btn-secondary" data-vt-fc="eliminar-no">Cancelar</button></div>
    </div>`;
  }

  async function eliminar(){
    if(fc.eliminando||!fc.op) return;
    const op=fc.op;
    if(!exigirPermiso(puedeEliminar(op),MSG_PERMISO_ELIMINAR)) return;
    mostrarError('[data-vt-fc-error]','');
    fc.eliminando=true;
    botones('[data-vt-fc="eliminar-si"]',{disabled:true,texto:'Eliminando...'});
    botones('[data-vt-fc="eliminar-no"]',{disabled:true});
    botones('[data-vt-fc="eliminar"]',{disabled:true,texto:'Eliminando...'});
    let msg='';
    try{
      const filas=await api('crm_oportunidades?id=eq.'+encodeURIComponent(op.id),{method:'DELETE',headers:{'Prefer':'return=representation'}});
      if(!Array.isArray(filas)||!filas.length) msg=MSG_PERMISO_ELIMINAR;
    }catch(e){
      console.error('[ventas] Error eliminando oportunidad',e);
      const m=mensajeError(e,{permiso:MSG_PERMISO_ELIMINAR});
      msg=m===MSG_PERMISO_ELIMINAR?m:'Error al eliminar: '+m;
    }
    fc.eliminando=false;
    if(msg){
      const box=q('[data-vt-fc-confirm]');
      if(box) box.innerHTML='';
      botones('[data-vt-fc="eliminar"]',{disabled:false,texto:'Eliminar oportunidad'});
      mostrarError('[data-vt-fc-error]',msg);
      return;
    }
    showToast('Oportunidad eliminada','success');
    V.ir('tablero');
  }

  async function cambiarEstadoFicha(nuevo){
    const op=fc.op;
    if(!op||!nuevo||nuevo===op.estado||fc.cambiandoEstado||fc.editando) return;
    const id=op.id, anterior=op.estado;
    fc.cambiandoEstado=true;
    const s=q('[data-vt-fc-estado]');
    if(s) s.disabled=true;
    try{
      const res=await O.cambiarEstado(id,anterior,nuevo);
      if(fc.op&&fc.op.id===id) Object.assign(fc.op,res.fila);
      await res.seguimiento;
    }catch(e){
      console.error('[ventas] Error cambiando estado',e);
      fc.cambiandoEstado=false;
      showToast('Error al cambiar el estado: '+mensajeError(e,{permiso:MSG_PERMISO_OP}),true);
      if(abierta(id)) V.repintar();
      return;
    }
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha',e);}
    fc.cambiandoEstado=false;
    if(abierta(id)) V.repintar();
  }

  async function guardarSeguimiento(form){
    if(fc.segGuardando||!fc.op) return;
    const id=fc.op.id;
    const f=form.elements;
    const fechaContacto=String(f.fecha_contacto.value||'').trim();
    const nota=String(f.nota.value||'').trim();
    mostrarError('[data-vt-fc-seg-error]','');
    if(!fechaContacto){mostrarError('[data-vt-fc-seg-error]','Completá la fecha de contacto.');return;}
    if(!nota){mostrarError('[data-vt-fc-seg-error]','Escribí una nota sobre el contacto.');return;}
    fc.segGuardando=true;
    botones('[data-vt-fc-seg-guardar]',{disabled:true,texto:'Guardando...'});
    try{
      // proxima_fecha_seguimiento, si se completa, actualiza sola la de la oportunidad (trigger de la base)
      await api('crm_seguimientos',{method:'POST',body:JSON.stringify({
        oportunidad_id:id,
        fecha_contacto:fechaContacto,
        tipo_contacto:String(f.tipo_contacto.value||''),
        nota,
        proxima_fecha_seguimiento:String(f.proxima_fecha_seguimiento.value||'')||null,
        usuario_id:usuarioActual.id
      })});
    }catch(e){
      console.error('[ventas] Error registrando seguimiento',e);
      fc.segGuardando=false;
      botones('[data-vt-fc-seg-guardar]',{disabled:false,texto:'Guardar seguimiento'});
      mostrarError('[data-vt-fc-seg-error]','Error al guardar: '+mensajeError(e,{permiso:'No tenés permiso para registrar seguimientos en esta oportunidad'}));
      return;
    }
    fc.segGuardando=false;
    fc.segAbierto=false;
    // Recarga la ficha: solo se repinta historial y próximo seguimiento si hay una edición en curso
    try{await cargar(id,{catalogos:false});}catch(e){console.warn('[ventas] No se pudo recargar la ficha',e);}
    if(!abierta(id)) return;
    if(fc.editando) pintarHistorial(); else V.repintar();
  }

  V.registrarPantalla({
    id:'ficha',
    interna:true,
    resaltar:'tablero',
    html,
    entrar,
    on:{
      click(e){
        const b=e.target.closest('[data-vt-fc]');
        if(!b||b.disabled) return;
        const acc=b.dataset.vtFc;
        if(acc==='editar'){fc.editando=true;V.repintar();}
        else if(acc==='cancelar') cancelarEdicion();
        else if(acc==='guardar') guardarCambios();
        else if(acc==='eliminar') pedirConfirmacionEliminar();
        else if(acc==='eliminar-no'){const box=q('[data-vt-fc-confirm]');if(box)box.innerHTML='';}
        else if(acc==='eliminar-si') eliminar();
        else if(acc==='seg-abrir'){fc.segAbierto=true;pintarHistorial();const t=q('form[data-vt-fc-seg] textarea');if(t)t.focus();}
        else if(acc==='seg-cancelar'){if(!fc.segGuardando){fc.segAbierto=false;pintarHistorial();}}
      },
      change(e){
        const s=e.target.closest('[data-vt-fc-estado]');
        if(s&&s.value) cambiarEstadoFicha(s.value);
      },
      submit(e){
        const seg=e.target.closest('form[data-vt-fc-seg]');
        if(seg){e.preventDefault();guardarSeguimiento(seg);return;}
        const ed=e.target.closest('form[data-vt-fc-form]');
        if(ed){e.preventDefault();if(fc.editando) guardarCambios();}
      }
    }
  });

  V.ficha={marcarVista,puedeEliminar};
})();
