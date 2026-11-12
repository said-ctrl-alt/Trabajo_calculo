/* Canvas views consume the same Cartesian state as the numeric dashboard. */
(function (root) {
  'use strict';
  const M=root.WindModel;
  const colors={a:'#8ccce5',b:'#b9df95',current:'#ffffff',result:'#f7bf76',grid:'#28483d',text:'#c9ded3'};
  function arrow(ctx,from,to,color,width=2) {
    const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
    if(len<.01)return; // The null vector has no positive-length arrow.
    const ux=dx/len,uy=dy/len,head=Math.min(9,len*.4);
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(to.x,to.y);
    ctx.lineTo(to.x-ux*head-uy*head*.5,to.y-uy*head+ux*head*.5);
    ctx.lineTo(to.x-ux*head+uy*head*.5,to.y-uy*head-ux*head*.5);ctx.closePath();ctx.fill();
  }
  class Views {
    constructor(vectorCanvas,parkCanvas) {
      this.vector=vectorCanvas;this.park=parkCanvas;
      this.vctx=vectorCanvas.getContext('2d');this.pctx=parkCanvas.getContext('2d');
      this.particles=[];this.rotation=Array(6).fill(0);this.density=1;
      this.ready=Boolean(this.vctx&&this.pctx);
    }
    size(canvas) {
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(root.devicePixelRatio||1,2);
      if(!rect.width||!rect.height)return false;
      const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      canvas.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
      return {w:rect.width,h:rect.height};
    }
    drawVectors(state) {
      if(!this.ready)return;
      const size=this.size(this.vector);if(!size)return;
      const {w,h}=size,c=this.vctx;
      c.clearRect(0,0,w,h);c.fillStyle='#10271f';c.fillRect(0,0,w,h);
      const op=M.operations(state.a,state.b),result=state.operation==='sum'?op.sum:op.difference;
      const vectors=[state.a,state.b,state.current,...(state.operation==='none'?[]:[result])];
      // Bound by lengths so rotating between A and B does not make the axes jump.
      const extent=Math.max(10,Math.ceil(Math.max(...vectors.map(M.magnitude))/5)*5);
      const scale=(Math.min(w,h)/2-43)/extent,origin={x:w/2,y:h/2};
      const point=v=>{const p=M.screenVector(v,scale);return {x:origin.x+p.x,y:origin.y+p.y};};
      c.font='11px system-ui';c.textBaseline='middle';
      for(let n=-extent;n<=extent;n+=extent/4) {
        const x=origin.x+n*scale,y=origin.y-n*scale;
        c.strokeStyle=colors.grid;c.lineWidth=1;c.beginPath();c.moveTo(x,24);c.lineTo(x,h-24);c.moveTo(24,y);c.lineTo(w-24,y);c.stroke();
        if(n){c.fillStyle=colors.text;c.fillText(String(n),x+3,origin.y+15);c.fillText(String(n),origin.x+5,y-8);}
      }
      arrow(c,{x:25,y:origin.y},{x:w-20,y:origin.y},'#638c79',1);
      arrow(c,{x:origin.x,y:h-25},{x:origin.x,y:20},'#638c79',1);
      c.fillStyle=colors.text;c.fillText('X · E',w-51,origin.y-15);c.fillText('Y · N',origin.x+10,23);c.fillText('0',origin.x-12,origin.y+14);
      for(const [v,color,label,index] of [[state.a,colors.a,'A',0],[state.b,colors.b,'B',1]]) {
        const p=point(v),px=point({x:v.x,y:0});c.save();c.setLineDash([3,5]);c.strokeStyle=color;c.globalAlpha=.6;
        c.beginPath();c.moveTo(px.x,px.y);c.lineTo(p.x,p.y);c.lineTo(origin.x,p.y);c.stroke();c.restore();
        arrow(c,origin,p,color,1.8);c.fillStyle=color;c.fillText(label,p.x+9,p.y+(index?14:-12));
        const angle=M.polar(v).angle;
        if(angle!==null){c.strokeStyle=color;c.beginPath();c.arc(origin.x,origin.y,23+index*13,0,-M.radians(angle),angle>0);c.stroke();}
      }
      if(state.operation!=='none') {
        const p=point(result);arrow(c,origin,p,colors.result,2);c.fillStyle=colors.result;
        c.fillText(state.operation==='sum'?'A + B':'B − A',p.x+8,p.y-12);
      }
      const p=point(state.current);arrow(c,origin,p,colors.current,3);
      if(M.magnitude(state.current)>M.EPS){c.fillStyle='white';c.fillText('v actual',p.x+8,p.y+28);}
      c.fillStyle='white';c.beginPath();c.arc(origin.x,origin.y,3,0,Math.PI*2);c.fill();
    }
    seedParticles(count) {
      while(this.particles.length<count)this.particles.push({x:Math.random()*M.PARAMS.land,y:Math.random()*M.PARAMS.land,trail:[],size:.6+Math.random()*.8});
      this.particles.length=count;
    }
    clearTrails() {this.particles.forEach(p=>{p.trail=[];});}
    drawPark(state,dt=0) {
      if(!this.ready)return;
      const size=this.size(this.park);if(!size)return;
      const {w,h}=size,c=this.pctx,land=M.PARAMS.land;
      const scale=(Math.min(w,h)-60)/land,left=(w-land*scale)/2,top=(h-land*scale)/2;
      const point=p=>({x:left+p.x*scale,y:top+(land-p.y)*scale});
      c.clearRect(0,0,w,h);c.fillStyle='#10271f';c.fillRect(0,0,w,h);
      c.font='11px system-ui';c.textBaseline='middle';c.lineWidth=1;
      for(let n=0;n<=land;n+=400) {
        const p=point({x:n,y:n});c.strokeStyle=colors.grid;c.beginPath();
        c.moveTo(p.x,top);c.lineTo(p.x,top+land*scale);c.moveTo(left,p.y);c.lineTo(left+land*scale,p.y);c.stroke();
        c.fillStyle=colors.text;c.fillText(String(n),p.x-10,top+land*scale+16);c.fillText(String(n),Math.max(0,left-30),p.y);
      }
      c.strokeStyle='#5b806d';c.strokeRect(left,top,land*scale,land*scale);
      c.save();c.beginPath();c.rect(left,top,land*scale,land*scale);c.clip();
      const wind=state.current,polar=M.polar(wind),unit=polar.speed>M.EPS?{x:wind.x/polar.speed,y:wind.y/polar.speed}:{x:0,y:0};
      const normal={x:-unit.y,y:unit.x},distance=land*Math.SQRT2;
      const turbines=state.farm.turbines;
      for(const t of turbines) {
        if(t.power<=M.EPS)continue;
        const r=M.PARAMS.diameter/2,endRadius=r+M.PARAMS.expansion*distance;
        const corners=[{x:t.x+normal.x*r,y:t.y+normal.y*r},
          {x:t.x+unit.x*distance+normal.x*endRadius,y:t.y+unit.y*distance+normal.y*endRadius},
          {x:t.x+unit.x*distance-normal.x*endRadius,y:t.y+unit.y*distance-normal.y*endRadius},
          {x:t.x-normal.x*r,y:t.y-normal.y*r}].map(point);
        const start=point(t),end=point({x:t.x+unit.x*distance,y:t.y+unit.y*distance});
        const gradient=c.createLinearGradient(start.x,start.y,end.x,end.y);
        gradient.addColorStop(0,'rgba(247,191,118,.24)');gradient.addColorStop(1,'rgba(247,191,118,0)');
        c.fillStyle=gradient;c.beginPath();corners.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();
      }
      const count=Math.round(Math.min(180,Math.max(60,w/4))*this.density);this.seedParticles(count);
      for(const p of this.particles) {
        if(dt>0&&polar.speed>M.EPS) {
          const local=M.localSpeed(p,wind,turbines);
          // Shared visual time scale on both axes; physical dashboard time is separate.
          p.trail.push({x:p.x,y:p.y});if(p.trail.length>30)p.trail.shift();
          p.x+=unit.x*local*dt*M.PARAMS.visualTimeScale;p.y+=unit.y*local*dt*M.PARAMS.visualTimeScale;
          if(p.x<0||p.x>land||p.y<0||p.y>land){p.x=(p.x%land+land)%land;p.y=(p.y%land+land)%land;p.trail=[];}
        }
        const at=point(p);c.lineWidth=p.size;c.strokeStyle='rgba(203,237,218,.42)';
        c.beginPath();p.trail.forEach((q,i)=>{const z=point(q);i?c.lineTo(z.x,z.y):c.moveTo(z.x,z.y);});c.lineTo(at.x,at.y);c.stroke();
        c.fillStyle='rgba(218,245,226,.64)';c.beginPath();c.arc(at.x,at.y,p.size*.7,0,Math.PI*2);c.fill();
      }
      const selected=turbines.find(t=>t.id===state.selected);
      if(selected&&turbines.length>1) {
        const others=turbines.filter(t=>t.id!==selected.id);
        const nearest=others.reduce((a,b)=>Math.hypot(b.x-selected.x,b.y-selected.y)<Math.hypot(a.x-selected.x,a.y-selected.y)?b:a);
        const a=point(selected),b=point(nearest);
        c.save();c.setLineDash([3,5]);c.strokeStyle='#72947f';c.lineWidth=1;
        c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();
        c.fillStyle='#c7dccf';c.font='11px system-ui';
        c.fillText(`${Math.round(Math.hypot(nearest.x-selected.x,nearest.y-selected.y))} m`,(a.x+b.x)/2+6,(a.y+b.y)/2-8);
      }
      for(const [i,t] of turbines.entries()) {
        const p=point(t),angle=M.radians(t.yaw),front={x:Math.cos(angle),y:-Math.sin(angle)};
        const side={x:-front.y,y:front.x};
        if(dt>0&&t.power>M.EPS)this.rotation[i]=(this.rotation[i]+dt*t.speed*t.factor*.65)%(Math.PI*2);
        c.fillStyle='#193c2e';c.strokeStyle=state.selected===t.id?'#ffffff':'#608b72';c.lineWidth=1.5;
        c.beginPath();c.arc(p.x,p.y,state.selected===t.id?22:18,0,Math.PI*2);c.fill();c.stroke();
        arrow(c,p,{x:p.x+front.x*27,y:p.y+front.y*27},colors.result,1.5);
        c.strokeStyle=t.power>M.EPS?'#d3f2df':'#81948b';c.lineWidth=3;c.lineCap='round';
        for(let blade=0;blade<3;blade++) {
          const phase=this.rotation[i]+blade*Math.PI*2/3;
          c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x+side.x*Math.cos(phase)*16+front.x*Math.sin(phase)*5,p.y+side.y*Math.cos(phase)*16+front.y*Math.sin(phase)*5);c.stroke();
        }
        c.lineCap='butt';c.fillStyle='white';c.beginPath();c.arc(p.x,p.y,3,0,Math.PI*2);c.fill();
        c.font='bold 11px system-ui';c.fillText(`T${t.id}`,p.x-8,p.y+32);
      }
      c.restore();
      const start={x:w-102,y:68},delta=M.screenVector(wind,2);
      arrow(c,start,{x:start.x+delta.x,y:start.y+delta.y},'#b9df95',2.5);
      c.fillStyle=colors.text;c.font='11px system-ui';c.fillText(polar.angle===null?'Calma':'Flujo actual',w-130,18);
    }
  }
  root.WindViews=Views;
})(globalThis);
