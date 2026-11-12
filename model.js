/* Pure mathematical / educational wind model. Also loadable in Node for tests. */
(function (root) {
  'use strict';
  const EPS = 1e-9;
  const PARAMS = Object.freeze({ rho: 1.225, diameter: 80, cp: .42, efficiency: .92,
    rated: 2e6, cutIn: 3, cutOut: 25, ct: .8, expansion: .05,
    land: 1600, margin: 80, separation: 240, visualTimeScale: 20 });
  const radians = a => a * Math.PI / 180;
  const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const magnitude = v => Math.hypot(v.x,v.y);
  function cartesian(speed,angle) {
    const x=speed*Math.cos(radians(angle)), y=speed*Math.sin(radians(angle));
    return {x:Math.abs(x)<EPS?0:x,y:Math.abs(y)<EPS?0:y};
  }
  function polar(v) {
    const speed=magnitude(v);
    return {speed,angle:speed<EPS?null:Math.atan2(v.y,v.x)*180/Math.PI};
  }
  function operations(a,b) {
    const dot=a.x*b.x+a.y*b.y, ma=magnitude(a),mb=magnitude(b),denominator=ma*mb;
    return {sum:{x:a.x+b.x,y:a.y+b.y},difference:{x:b.x-a.x,y:b.y-a.y},
      dot,cross:a.x*b.y-a.y*b.x,
      angle:ma<EPS||mb<EPS?null:Math.acos(clamp(dot/denominator,-1,1))*180/Math.PI};
  }
  function readNumber(raw,min,max) {
    if(String(raw).trim()==='')return null;
    const n=Number(raw);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
  }
  function screenVector(v,scale) {return {x:v.x*scale,y:-v.y*scale};}
  function advance(p,v,dt,scale) {
    const d=screenVector(v,scale);return {x:p.x+d.x*dt,y:p.y+d.y*dt};
  }
  function interpolate(a,b,progress) {
    if(progress<=0)return {...a};if(progress>=1)return {...b};
    const p=polar(a),q=polar(b),t=progress*progress*(3-2*progress);
    const start=p.angle??q.angle??0, end=q.angle??start;
    return cartesian(p.speed+(q.speed-p.speed)*t,start+wrap(end-start)*t);
  }
  function alignment(wind,yaw) {
    const p=polar(wind);if(p.angle===null)return 0;
    // yaw is the outward/front-facing normal: aligned when it faces upstream.
    return Math.max(0,Math.cos(radians(wrap(p.angle+180-yaw))))**3;
  }
  function available(speed) {return .5*PARAMS.rho*Math.PI*(PARAMS.diameter/2)**2*speed**3;}
  function electrical(speed) {
    return speed<PARAMS.cutIn||speed>=PARAMS.cutOut?0:
      Math.min(PARAMS.rated,available(speed)*PARAMS.cp*PARAMS.efficiency);
  }
  function validLayout(turbines) {
    return turbines.length>0&&turbines.every((t,i)=>
      [t.x,t.y,t.yaw].every(Number.isFinite)&&
      t.x>=PARAMS.margin&&t.x<=PARAMS.land-PARAMS.margin&&
      t.y>=PARAMS.margin&&t.y<=PARAMS.land-PARAMS.margin&&
      turbines.slice(0,i).every(o=>Math.hypot(t.x-o.x,t.y-o.y)>=PARAMS.separation-EPS));
  }
  function wakeDeficit(source,point,wind) {
    const speed=magnitude(wind);
    if(speed<PARAMS.cutIn||speed>=PARAMS.cutOut||source.power<=EPS)return 0;
    const dx=point.x-source.x,dy=point.y-source.y;
    const downstream=(dx*wind.x+dy*wind.y)/speed;
    const crosswind=Math.abs((-dx*wind.y+dy*wind.x)/speed);
    const radius=PARAMS.diameter/2+PARAMS.expansion*downstream;
    if(downstream<=EPS||crosswind>radius)return 0;
    // Jensen top-hat, evaluated at the receiving hub (no partial rotor overlap).
    return (source.speed/speed)*(1-Math.sqrt(1-PARAMS.ct)) /
      (1+2*PARAMS.expansion*downstream/PARAMS.diameter)**2;
  }
  function localSpeed(point,wind,sources) {
    const deficit=Math.sqrt(sources.reduce((sum,t)=>sum+wakeDeficit(t,point,wind)**2,0));
    return magnitude(wind)*(1-clamp(deficit,0,1));
  }
  function evaluate(turbines,wind,hours=1) {
    const ambient=magnitude(wind), idealOne=electrical(ambient), solved=[];
    const sorted=[...turbines].sort((a,b)=>(a.x-b.x)*wind.x+(a.y-b.y)*wind.y);
    for(const t of sorted) {
      const speed=localSpeed(t,wind,solved), factor=alignment(wind,t.yaw);
      const withoutWake=idealOne*factor;
      const power=idealOne===0?0:Math.min(withoutWake,electrical(speed)*factor);
      const status=ambient>=PARAMS.cutOut?'Corte de seguridad':speed<PARAMS.cutIn?'Sin recurso':factor<.001?'Desalineada':'Generando';
      solved.push({...t,speed,factor,power,status,withoutWake,
        yawLoss:idealOne-withoutWake,wakeLoss:withoutWake-power});
    }
    const ordered=turbines.map(t=>solved.find(s=>s.id===t.id));
    const sum=key=>ordered.reduce((a,t)=>a+t[key],0);
    const power=sum('power'),ideal=idealOne*turbines.length;
    return {turbines:ordered,power,ideal,available:available(ambient)*turbines.length,
      yawLoss:sum('yawLoss'),wakeLoss:sum('wakeLoss'),
      performance:ideal>EPS?power/ideal:null,energy:power/1e6*hours};
  }
  function layouts() {
    const make=(name,points)=>({name,turbines:points.map(([x,y],i)=>({id:i+1,x,y,yaw:180}))});
    return [make('Filas alineadas',[[280,500],[800,500],[1320,500],[280,1100],[800,1100],[1320,1100]]),
      make('Filas escalonadas',[[280,350],[800,650],[1320,950],[280,950],[800,1250],[1320,350]]),
      make('Perímetro abierto',[[250,250],[800,250],[1350,250],[250,1350],[800,1350],[1350,1350]]),
      make('Dos columnas',[[450,280],[450,800],[450,1320],[1150,280],[1150,800],[1150,1320]])];
  }
  function optimize(turbines,wind,hours=1) {
    const before=evaluate(turbines,wind,hours),angle=polar(wind).angle;
    const raw=[{name:'Actual',turbines:turbines.map(t=>({...t}))}];
    const bases=[{name:'Posiciones actuales',turbines},...layouts()];
    for(const base of bases) {
      for(const rotation of [0,30,60,90]) {
        const r=radians(rotation),cos=Math.cos(r),sin=Math.sin(r),center=PARAMS.land/2;
        raw.push({name:`${base.name} · ${rotation}° · orientadas`,turbines:base.turbines.map(t=>{
          const x=t.x-center,y=t.y-center;
          return {...t,x:center+x*cos-y*sin,y:center+x*sin+y*cos,yaw:angle===null?t.yaw:wrap(angle+180)};
        })});
      }
    }
    const candidates=raw.filter(c=>validLayout(c.turbines)).map(c=>({...c,result:evaluate(c.turbines,wind,hours)}));
    const best=candidates.reduce((a,b)=>b.result.power>a.result.power+EPS?b:a);
    return {before,candidates,best,wind:{...wind},hours,
      gain:before.power>EPS?100*(best.result.power-before.power)/before.power:null};
  }
  const api={EPS,PARAMS,radians,wrap,clamp,magnitude,cartesian,polar,operations,readNumber,
    screenVector,advance,interpolate,alignment,available,electrical,validLayout,wakeDeficit,localSpeed,evaluate,layouts,optimize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.WindModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
