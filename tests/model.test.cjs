const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const close = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<e, `${a} ≠ ${b}`);

test('example: components, magnitudes, angles and vector operations', () => {
  const a={x:8,y:3}, b={x:4,y:10}, r=M.operations(a,b);
  close(M.polar(a).speed,Math.sqrt(73)); close(M.polar(b).speed,Math.sqrt(116));
  close(M.polar(a).angle,20.556045219583464);
  close(M.polar(b).angle,68.19859051364818);
  assert.deepEqual(r.sum,{x:12,y:13}); assert.deepEqual(r.difference,{x:-4,y:7});
  assert.equal(r.dot,62); assert.equal(r.cross,68); close(r.angle,47.64254529406473);
});
for(const [angle,x,y] of [[0,1,0],[90,0,-1],[180,-1,0],[-90,0,1],[45,1,-1],[-45,1,1],[135,-1,-1]]) {
  test(`Canvas and particle direction at ${angle}°`,()=>{
    const v=M.cartesian(8,angle), p=M.screenVector(v,2);
    close(p.x,2*v.x); close(p.y,-2*v.y);
    assert.equal(Math.sign(Math.abs(p.x)<1e-9?0:p.x),x);
    assert.equal(Math.sign(Math.abs(p.y)<1e-9?0:p.y),y);
    const move=M.advance({x:0,y:0},v,.25,2);
    close(move.x,p.x*.25); close(move.y,p.y*.25);
  });
}
test('null vectors have no direction or inter-vector angle, no displacement',()=>{
  assert.equal(M.polar({x:0,y:0}).angle,null);
  assert.equal(M.operations({x:0,y:0},{x:1,y:0}).angle,null);
  assert.deepEqual(M.advance({x:2,y:3},{x:0,y:0},1,5),{x:2,y:3});
});
test('small but nonzero vectors retain a defined angle',()=>{
  close(M.operations({x:1e-6,y:0},{x:0,y:1e-6}).angle,90);
});
test('particle displacement is independent of frame count and proportional to speed',()=>{
  let a={x:0,y:0},b={x:0,y:0};
  for(let i=0;i<60;i++)a=M.advance(a,{x:8,y:3},1/60,3);
  for(let i=0;i<120;i++)b=M.advance(b,{x:8,y:3},1/120,3);
  close(a.x,b.x);close(a.y,b.y);close(a.x,24);close(a.y,-9);
  close(M.advance({x:0,y:0},{x:16,y:6},1,3).x,48);
});
test('short transition crosses ±180 and begins from actual current vector',()=>{
  const a=M.cartesian(8,170),b=M.cartesian(8,-170);
  const mid=M.interpolate(a,b,.5);close(Math.abs(M.polar(mid).angle),180);
  assert.deepEqual(M.interpolate(a,b,0),a);assert.deepEqual(M.interpolate(a,b,1),b);
  const target={x:-8,y:0};assert.deepEqual(M.interpolate(mid,target,0),mid);
});
test('empty, non-finite and outside values are rejected',()=>{
  for(const value of ['', ' ', 'NaN','Infinity','31','-31'])assert.equal(M.readNumber(value,-30,30),null);
  assert.equal(M.readNumber('0',-30,30),0);
});
test('farm: downstream loss, reversed wind, orientation, zero and operating limits',()=>{
  const farm=[{id:1,x:250,y:600,yaw:180},{id:2,x:750,y:600,yaw:180}];
  const r=M.evaluate(farm,{x:10,y:0},1);
  assert.ok(r.turbines[1].speed<r.turbines[0].speed);assert.ok(r.wakeLoss>0);
  assert.ok(r.power<r.ideal);close(r.energy,r.power/1e6);
  close(M.evaluate(farm,{x:10,y:0},2).energy,2*r.energy);
  assert.equal(M.evaluate(farm,{x:0,y:0},1).power,0);
  assert.equal(M.evaluate(farm,{x:30,y:0},1).power,0);
  const turned=farm.map(t=>({...t,yaw:0}));assert.equal(M.evaluate(turned,{x:10,y:0},1).power,0);
  const reversed=M.evaluate(turned,{x:-10,y:0},1);
  assert.ok(reversed.turbines[0].speed<reversed.turbines[1].speed);
  assert.ok(r.power<=farm.length*M.PARAMS.rated);
  close(r.ideal-r.yawLoss-r.wakeLoss,r.power);
});
test('constraints, reproducibility and finite-candidate optimizer',()=>{
  const wind={x:10,y:0}, initial=M.layouts()[0];
  assert.equal(M.validLayout(initial.turbines),true);
  assert.equal(M.validLayout([{id:1,x:0,y:0,yaw:0}]),false);
  assert.equal(M.validLayout([{id:1,x:500,y:500,yaw:0},{id:2,x:501,y:500,yaw:0}]),false);
  const first=M.optimize(initial.turbines,wind,1),second=M.optimize(initial.turbines,wind,1);
  assert.deepEqual(first,second);
  assert.ok(first.candidates.every(c=>M.validLayout(c.turbines)));
  close(first.best.result.power,Math.max(...first.candidates.map(c=>c.result.power)));
  assert.ok(first.best.result.power>=first.before.power);
  assert.ok(first.gain>0);
});
