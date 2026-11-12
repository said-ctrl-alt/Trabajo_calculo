(() => {
  'use strict';
  const M=window.WindModel, $=id=>document.getElementById(id);
  const fmt=(v,d=2)=>v===null?'No definida':(Math.abs(v)<.5*10**(-d)?0:v).toLocaleString('es-CO',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pair=v=>`(${fmt(v.x)}; ${fmt(v.y)})`;
  const angle=v=>v===null?'No definida':`${fmt(v)}°`;
  const text=(id,value)=>{const el=$(id);if(el.textContent!==String(value))el.textContent=String(value);};
  const layouts=M.layouts(), motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const state={a:{x:8,y:3},b:{x:4,y:10},current:{x:8,y:3},activeKey:'a',operation:'difference',
    turbines:layouts[0].turbines.map(t=>({...t})),hours:1,selected:1,farm:null};
  const views=new window.WindViews($('vector-canvas'),$('wind-canvas'));
  let mode='cartesian',transition=null,raf=0,lastTime=null,paused=false;
  let parkVisible=true,vectorVisible=true,comparison=null,presentation=-1;
  const invalid=new Set();
  let parkInvalid=false;
  const fields=key=>mode==='cartesian'?[`${key}-x`,`${key}-y`]:[`${key}-speed`,`${key}-angle`];
  const rowCells=new Map();
  for(const t of state.turbines) {
    const row=document.createElement('tr'),cells=[];
    for(let i=0;i<6;i++){const cell=document.createElement('td');row.append(cell);cells.push(cell);}
    $('turbine-table').append(row);rowCells.set(t.id,cells);
    const option=document.createElement('option');option.value=t.id;option.textContent=`T${t.id}`;$('turbine-select').append(option);
  }
  layouts.forEach((layout,i)=>{const option=document.createElement('option');option.value=i;option.textContent=layout.name;$('layout-select').append(option);});
  const custom=document.createElement('option');custom.value='custom';custom.textContent='Configuración personalizada';$('layout-select').append(custom);

  function syncInputs(key) {
    if(invalid.has(key))return; // Preserve invalid drafts instead of hiding them during another update.
    const v=state[key],p=M.polar(v);
    for(const [name,value] of Object.entries({x:v.x,y:v.y,speed:p.speed,angle:p.angle??0})) {
      // Preserve the field being edited; full precision remains in the model.
      const input=$(`${key}-${name}`);
      if(document.activeElement!==input)input.value=String(Number(value.toFixed(8)));
    }
    text(`${key}-summary`,`${pair(v)} m/s · ${fmt(p.speed)} m/s · ${angle(p.angle)}`);
  }
  function clearComparison(reason='Cambió el escenario. Ejecuta una nueva búsqueda para comparar el mismo viento.') {
    if(!comparison)return;
    comparison=null;text('comparison-status',reason);text('park-optimization',reason);$('comparison-summary').replaceChildren();
    const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent='Comparación pendiente de una nueva búsqueda.';row.append(cell);$('comparison-table').replaceChildren(row);
  }
  function cancelTransition() {transition=null;lastTime=null;}
  function applyVector(key) {
    cancelTransition();state.activeKey=key;state.current={...state[key]};clearComparison();views.clearTrails();
    parkInvalid=false;$('park-input-message').classList.remove('is-error');
    for(const id of ['park-speed','park-angle'])$(id).setAttribute('aria-invalid','false');
    text('park-input-message','Los controles editan la misma condición que el laboratorio.');
    text('flow-state',`Viento ${key.toUpperCase()} · actualización inmediata`);refresh();
  }
  function inputVector(key) {
    cancelTransition();
    const ids=fields(key),values=ids.map((id,i)=>M.readNumber($(id).value,mode==='polar'&&i===0?0:mode==='polar'?-180:-30,mode==='polar'&&i===1?180:30));
    ids.forEach((id,i)=>$(id).setAttribute('aria-invalid',String(values[i]===null)));
    let vector=values.includes(null)?null:mode==='cartesian'?{x:values[0],y:values[1]}:M.cartesian(...values);
    if(vector&&M.magnitude(vector)>30+M.EPS){vector=null;ids.forEach(id=>$(id).setAttribute('aria-invalid','true'));}
    if(!vector){invalid.add(key);text('input-message','Completa ambos campos. Magnitud ≤ 30 m/s; ángulos entre −180° y 180°. Se conserva el último viento válido.');text('flow-state','Edición inválida · transición detenida');$('input-message').classList.add('is-error');return;}
    invalid.delete(key);state[key]=vector;syncInputs(key);
    if(!invalid.size){text('input-message','Valores aplicados. 0° este · 90° norte · −90° sur.');$('input-message').classList.remove('is-error');}
    applyVector(key);
  }
  function updateMath() {
    const p=M.polar(state.a),q=M.polar(state.b),r=M.operations(state.a,state.b);
    text('result-a',`${fmt(p.speed)} m/s · ${angle(p.angle)}`);text('result-b',`${fmt(q.speed)} m/s · ${angle(q.angle)}`);
    text('result-sum',`${pair(r.sum)} m/s`);text('result-difference',`${pair(r.difference)} m/s`);
    text('result-dot',`${fmt(r.dot)} m²/s²`);text('result-cross',`${fmt(r.cross)} m²/s² · ${r.cross===0?'sin componente Z':r.cross>0?'+Z':'−Z'}`);
    text('result-angle',angle(r.angle));text('result-current',`${pair(state.current)} m/s`);
    syncInputs('a');syncInputs('b');
  }
  function updateFarm() {
    state.farm=M.evaluate(state.turbines,state.current,state.hours);
    const f=state.farm,p=M.polar(state.current);
    text('metric-speed',fmt(p.speed));text('metric-direction',angle(p.angle));text('metric-components',pair(state.current));text('metric-count',state.turbines.length);
    text('metric-available',fmt(f.available/1e6));text('metric-power',fmt(f.power/1e6));text('metric-energy',fmt(f.energy));
    text('metric-yaw',fmt(f.yawLoss/1e6));text('metric-wake',fmt(f.wakeLoss/1e6));text('metric-performance',f.performance===null?'No definido':`${fmt(f.performance*100)} %`);
    text('park-wind',`${fmt(p.speed)} m/s · ${angle(p.angle)}`);
    text('park-power',`${fmt(f.power/1e6)} MW`);
    text('park-loss',`${fmt((f.yawLoss+f.wakeLoss)/1e6)} MW`);
    text('park-performance',f.performance===null?'No definido':`${fmt(f.performance*100)} %`);
    syncParkInputs();
    for(const t of f.turbines) {
      const yaw=p.angle===null?null:Math.abs(M.wrap(p.angle+180-t.yaw));
      const values=[`T${t.id}`,`${fmt(t.speed)} m/s`,angle(yaw),`${fmt(t.power/1e6)} MW`,`${fmt(t.wakeLoss/1e6)} MW`,t.status];
      rowCells.get(t.id).forEach((cell,i)=>{if(cell.textContent!==values[i])cell.textContent=values[i];});
    }
    const selected=f.turbines.find(t=>t.id===state.selected);
    text('turbine-reading',`${selected.status} · ${fmt(selected.power/1e6)} MW · factor de orientación ${fmt(selected.factor*100)} %`);
  }
  function syncParkInputs() {
    text('park-edit-label',`Editar condición ${state.activeKey.toUpperCase()}`);
    for(const key of ['a','b'])$(`park-use-${key}`).setAttribute('aria-pressed',String(state.activeKey===key));
    if(parkInvalid)return;
    const p=M.polar(state.current);
    for(const [id,value] of [['park-speed',p.speed],['park-angle',p.angle??0]]) {
      if(document.activeElement!==$(id))$(id).value=String(Number(value.toFixed(8)));
    }
  }
  function draw(dt=0,vector=true) {
    if(vector)views.drawVectors(state);
    views.drawPark(state,dt);
  }
  function refresh() {updateMath();updateFarm();draw();schedule();}
  function schedule() {
    if(!raf&&!document.hidden&&!motion.matches&&!paused&&(parkVisible||(vectorVisible&&transition)))raf=requestAnimationFrame(frame);
  }
  function frame(now) {
    raf=0;
    if(document.hidden||paused||motion.matches||(!parkVisible&&!vectorVisible)){lastTime=null;return;}
    const dt=lastTime===null?0:Math.min((now-lastTime)/1000,.05);lastTime=now;
    if(transition) {
      transition.elapsed+=dt;
      const t=Math.min(1,transition.elapsed/1.75);
      state.current=M.interpolate(transition.from,transition.to,t);
      if(t===1){transition=null;state.activeKey='b';text('flow-state','Viento B · transición completa');}
      updateMath();updateFarm();if(vectorVisible)views.drawVectors(state);
    }
    if(parkVisible)views.drawPark(state,dt);
    schedule();
  }
  for(const key of ['a','b']) {
    for(const suffix of ['x','y','speed','angle'])$(`${key}-${suffix}`).addEventListener('input',()=>inputVector(key));
    $(`use-${key}`).addEventListener('click',()=>{if(!invalid.has(key))applyVector(key);});
  }
  function setMode(next) {
    mode=next;invalid.clear();
    document.querySelectorAll('.cartesian-fields').forEach(el=>el.hidden=mode!=='cartesian');
    document.querySelectorAll('.polar-fields').forEach(el=>el.hidden=mode!=='polar');
    for(const key of ['a','b'])for(const suffix of ['x','y','speed','angle'])$(`${key}-${suffix}`).setAttribute('aria-invalid','false');
    $('mode-cartesian').setAttribute('aria-pressed',String(mode==='cartesian'));$('mode-polar').setAttribute('aria-pressed',String(mode==='polar'));
    syncInputs('a');syncInputs('b');text('input-message','Coordenadas sincronizadas. Magnitud máxima: 30 m/s.');$('input-message').classList.remove('is-error');
  }
  $('mode-cartesian').addEventListener('click',()=>setMode('cartesian'));$('mode-polar').addEventListener('click',()=>setMode('polar'));
  $('operation').addEventListener('change',()=>{state.operation=$('operation').value;views.drawVectors(state);});
  function animateToB() {
    if(invalid.size||parkInvalid){text('input-message','Corrige los campos antes de iniciar la transición.');text('park-input-message','Corrige los campos pendientes del viento antes de iniciar la transición.');return;}
    clearComparison();
    if(motion.matches){state.activeKey='b';state.current={...state.b};cancelTransition();text('flow-state','Viento B · movimiento reducido');views.clearTrails();refresh();return;}
    paused=false;$('pause-button').textContent='Pausar movimiento';$('pause-button').setAttribute('aria-pressed','false');
    transition={from:{...state.current},to:{...state.b},elapsed:0};lastTime=null;text('flow-state','Transición visual actual → B');schedule();
  }
  $('animate-button').addEventListener('click',animateToB);
  $('park-animate').addEventListener('click',animateToB);
  for(const key of ['a','b'])$(`park-use-${key}`).addEventListener('click',()=>{if(!invalid.has(key))applyVector(key);});
  for(const id of ['park-speed','park-angle'])$(id).addEventListener('input',()=>{
    cancelTransition();
    const speed=M.readNumber($('park-speed').value,0,30);
    const direction=M.readNumber($('park-angle').value,-180,180);
    $('park-speed').setAttribute('aria-invalid',String(speed===null));
    $('park-angle').setAttribute('aria-invalid',String(direction===null));
    if(speed===null||direction===null) {
      parkInvalid=true;text('park-input-message','Completa magnitud (0–30 m/s) y ángulo (−180°–180°). Se conserva el último viento válido.');
      $('park-input-message').classList.add('is-error');text('flow-state','Edición inválida · transición detenida');return;
    }
    const key=state.activeKey;
    invalid.delete(key);state[key]=M.cartesian(speed,direction);
    for(const suffix of ['x','y','speed','angle'])$(`${key}-${suffix}`).setAttribute('aria-invalid','false');
    if(!invalid.size){text('input-message','Valores sincronizados desde el parque.');$('input-message').classList.remove('is-error');}
    applyVector(key);
  });
  function loadScenario(name) {
    cancelTransition();invalid.clear();parkInvalid=false;state.activeKey='a';
    for(const id of ['park-speed','park-angle'])$(id).setAttribute('aria-invalid','false');
    $('park-input-message').classList.remove('is-error');text('park-input-message','Los controles editan la misma condición que el laboratorio.');
    const scenarios={example:[{x:8,y:3},{x:4,y:10}],east:[{x:10,y:0},{x:10,y:0}],north:[{x:0,y:10},{x:0,y:10}],crossing:[M.cartesian(8,170),M.cartesian(8,-170)],zero:[{x:0,y:0},{x:0,y:0}]};
    [state.a,state.b]=scenarios[name];state.current={...state.a};
    setMode(mode);clearComparison();views.clearTrails();text('flow-state',`Escenario cargado · viento A`);refresh();
  }
  $('scenario').addEventListener('change',()=>loadScenario($('scenario').value));
  $('park-demo').addEventListener('click',()=>{
    state.turbines=layouts[0].turbines.map(t=>({...t}));state.hours=1;
    $('hours').value='1';$('hours').setAttribute('aria-invalid','false');text('hours-message','');
    $('scenario').value='east';$('layout-select').value='0';loadScenario('east');syncTurbine();
    text('park-optimization','Demo lista: 10 m/s hacia el este, frentes a 180°, filas alineadas. Busca una configuración con menos estelas.');
  });
  $('reset-button').addEventListener('click',()=>{
    state.turbines=layouts[0].turbines.map(t=>({...t}));state.hours=1;$('hours').value='1';$('hours').setAttribute('aria-invalid','false');text('hours-message','');
    $('scenario').value='example';$('layout-select').value='0';loadScenario('example');syncTurbine();
  });
  function syncTurbine() {
    const t=state.turbines.find(t=>t.id===state.selected);
    for(const key of ['x','y','yaw']){$(`turbine-${key}`).value=String(Number(t[key].toFixed(4)));$(`turbine-${key}`).setAttribute('aria-invalid','false');}
    text('turbine-message','Centros dentro del terreno; separación mínima 240 m.');$('turbine-message').classList.remove('is-error');
  }
  $('turbine-select').addEventListener('change',()=>{state.selected=Number($('turbine-select').value);syncTurbine();refresh();});
  for(const key of ['x','y','yaw'])$(`turbine-${key}`).addEventListener('input',()=>{
    const values={};let valid=true;
    for(const k of ['x','y','yaw']) {
      values[k]=M.readNumber($(`turbine-${k}`).value,k==='yaw'?-180:80,k==='yaw'?180:1520);
      $(`turbine-${k}`).setAttribute('aria-invalid',String(values[k]===null));if(values[k]===null)valid=false;
    }
    const next=state.turbines.map(t=>t.id===state.selected?{...t,...values}:t);
    if(!valid||!M.validLayout(next)){text('turbine-message','Posición no aplicada: completa los campos, respeta el margen de 80 m y la separación de 240 m.');$('turbine-message').classList.add('is-error');$(`turbine-${key}`).setAttribute('aria-invalid','true');return;}
    state.turbines=next;$('layout-select').value='custom';clearComparison();text('turbine-message','Cambio aplicado.');$('turbine-message').classList.remove('is-error');refresh();
  });
  $('layout-select').addEventListener('change',()=>{
    const selected=layouts[Number($('layout-select').value)];if(!selected)return;
    state.turbines=selected.turbines.map(t=>({...t}));clearComparison();syncTurbine();refresh();
  });
  $('align-button').addEventListener('click',()=>{
    const p=M.polar(state.current);if(p.angle===null){text('turbine-message','Sin viento no hay una dirección con la que alinear.');return;}
    state.turbines=state.turbines.map(t=>({...t,yaw:M.wrap(p.angle+180)}));clearComparison();syncTurbine();refresh();
  });
  $('hours').addEventListener('input',()=>{
    const hours=M.readNumber($('hours').value,.1,168);$('hours').setAttribute('aria-invalid',String(hours===null));
    if(hours===null){text('hours-message','Intervalo válido: 0,1 a 168 horas.');return;}
    text('hours-message','');state.hours=hours;clearComparison();refresh();
  });
  $('optimize-button').addEventListener('click',()=>{
    cancelTransition();comparison=M.optimize(state.turbines,state.current,state.hours);
    const {before,best,candidates,gain,wind,hours}=comparison,p=M.polar(wind);
    text('comparison-status',`${candidates.length} candidatos válidos · ${fmt(p.speed)} m/s · ${angle(p.angle)} · ${fmt(hours)} h. Mejor configuración evaluada; no garantiza un óptimo global.`);
    $('comparison-summary').replaceChildren();
    for(const [label,value] of [['Antes',`${fmt(before.power/1e6)} MW`],['Después',`${fmt(best.result.power/1e6)} MW`],['Mejora',gain===null?'No definida (base 0)':`${fmt(gain)} %`]]) {
      const card=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');name.textContent=label;number.textContent=value;card.append(name,number);$('comparison-summary').append(card);
    }
    const rows=[...candidates].sort((a,b)=>b.result.power-a.result.power).map(c=>{
      const row=document.createElement('tr');for(const value of [c.name,fmt(c.result.power/1e6),fmt((c.result.yawLoss+c.result.wakeLoss)/1e6),c===best?'Seleccionada':'Evaluada']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}return row;
    });
    $('comparison-table').replaceChildren(...rows);state.turbines=best.turbines.map(t=>({...t}));$('layout-select').value='custom';
    text('flow-state','Viento fijado para comparar');syncTurbine();refresh();
    text('turbine-message',`Aplicada: ${best.name}. Comparación disponible en Resultados.`);
    text('park-optimization',`Antes: ${fmt(before.power/1e6)} MW → después: ${fmt(best.result.power/1e6)} MW. Mejora: ${gain===null?'no definida (base cero)':fmt(gain)+' %'}. ${candidates.length} candidatos válidos; mejor evaluada, no óptimo global.`);
  });
  $('pause-button').addEventListener('click',()=>{paused=!paused;cancelTransition();$('pause-button').setAttribute('aria-pressed',String(paused));$('pause-button').textContent=paused?'Reanudar movimiento':'Pausar movimiento';text('flow-state',paused?'Movimiento en pausa':'Movimiento activo');schedule();});
  $('density').addEventListener('change',()=>{views.density=Number($('density').value);draw();});
  function resize(){draw();lastTime=null;schedule();}
  window.addEventListener('resize',resize,{passive:true});
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(resize);observer.observe($('vector-canvas'));observer.observe($('wind-canvas'));}
  if(typeof IntersectionObserver!=='undefined') {
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.target===$('wind-canvas'))parkVisible=entry.isIntersecting;else vectorVisible=entry.isIntersecting;}lastTime=null;schedule();},{threshold:0});
    observer.observe($('wind-canvas'));observer.observe($('vector-canvas'));
  }
  document.addEventListener('visibilitychange',()=>{lastTime=null;schedule();});
  motion.addEventListener('change',()=>{if(motion.matches&&transition){state.activeKey='b';state.current={...transition.to};cancelTransition();text('flow-state','Actualizado · movimiento reducido');}views.clearTrails();refresh();});
  const menuToggle=document.querySelector('.menu-toggle'),mainNav=document.querySelector('.main-nav');
  menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Cerrar navegación':'Abrir navegación');mainNav.classList.toggle('is-open',open);});
  mainNav.addEventListener('click',event=>{if(event.target.closest('a')){menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','Abrir navegación');mainNav.classList.remove('is-open');}});
  const stages=[{label:'1 / 4 · Contexto y objetivo · 2:30',ids:['enfoque','objetivos']},{label:'2 / 4 · Análisis vectorial · 2:30',ids:['laboratorio']},{label:'3 / 4 · Simulación y optimización · 2:30',ids:['simulador']},{label:'4 / 4 · Resultados y conclusiones · 2:30',ids:['hallazgos','cierre']}];
  function setPresentation(step) {
    presentation=step;document.body.classList.toggle('presenting',step>=0);$('presentation-bar').hidden=step<0;$('presentation-toggle').setAttribute('aria-pressed',String(step>=0));
    document.querySelectorAll('main > section').forEach(section=>section.hidden=step>=0&&!stages[step].ids.includes(section.id));
    if(step>=0){text('presentation-label',stages[step].label);$('presentation-prev').disabled=step===0;$('presentation-next').disabled=step===3;const section=$(stages[step].ids[0]);section.setAttribute('tabindex','-1');section.focus({preventScroll:true});section.scrollIntoView({behavior:'instant',block:'start'});}
    resize();
  }
  $('presentation-toggle').addEventListener('click',()=>setPresentation(presentation<0?0:-1));$('presentation-exit').addEventListener('click',()=>{setPresentation(-1);$('presentation-toggle').focus();});
  $('presentation-prev').addEventListener('click',()=>setPresentation(Math.max(0,presentation-1)));$('presentation-next').addEventListener('click',()=>setPresentation(Math.min(3,presentation+1)));
  for(const [id,step] of [['method-link',1],['edit-wind-link',1],['results-link',3]])$(id).addEventListener('click',event=>{if(presentation>=0){event.preventDefault();setPresentation(step);}});
  document.addEventListener('keydown',event=>{if(presentation>=0&&event.key==='Escape'){setPresentation(-1);$('presentation-toggle').focus();}});
  if(!views.ready)text('input-message','Canvas no está disponible en este navegador. Los cálculos y tablas siguen funcionando.');
  syncTurbine();syncInputs('a');syncInputs('b');refresh();
})();
