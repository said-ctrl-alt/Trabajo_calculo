const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

// Browser APIs are replaced only at the boundary. The model, renderer and
// application execute unchanged; these tests do not claim real-browser coverage.
function application(reducedMotion = false, viewport = { width: 640, height: 500 }) {
  let now = 0, nextFrame = 0;
  const frames = new Map(), globalEvents = new Map(), nodes = [];
  const observers = [];
  function makeNode(tag, attributes = {}) {
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    const handlers = new Map();
    const node = {
      tagName: tag.toUpperCase(), id: attributes.id || '', attributes,
      value: attributes.value || '', textContent: '', innerHTML: '', style: {}, dataset: {},
      hidden: Object.hasOwn(attributes, 'hidden'), disabled: false, width: 0, height: 0,
      classList: {
        add(...items) { items.forEach(x => classes.add(x)); },
        remove(...items) { items.forEach(x => classes.delete(x)); },
        contains(x) { return classes.has(x); },
        toggle(x, force) { const set = force ?? !classes.has(x); set ? classes.add(x) : classes.delete(x); return set; }
      },
      addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
      removeEventListener() {},
      dispatch(type, extra = {}) { for (const fn of handlers.get(type) || []) fn({ target: node, preventDefault() {}, ...extra }); },
      setAttribute(k, v) { attributes[k] = String(v); },
      getAttribute(k) { return attributes[k] ?? null; },
      removeAttribute(k) { delete attributes[k]; },
      toggleAttribute(k, force) { if (force) attributes[k] = ''; else delete attributes[k]; },
      getBoundingClientRect() { return { ...viewport, left: 0, top: 0 }; },
      focus() { document.activeElement = node; },
      scrollIntoView() { node.scrolled = true; },
      checkValidity() { return true; },
      setCustomValidity() {},
      append(...children) { node.children ||= []; node.children.push(...children); },
      replaceChildren(...children) { node.children = children; },
      closest(selector) { return selector === 'a' && tag === 'a' ? node : null; },
      querySelectorAll(selector) { return findAll(selector); },
      querySelector(selector) { return findAll(selector)[0] || null; }
    };
    if (tag === 'canvas') {
      const drawing = { clears: 0, strokes: [], path: [] };
      const context = new Proxy({
        clearRect() { drawing.clears++; drawing.strokes = []; },
        beginPath() { drawing.path = []; },
        moveTo(x, y) { drawing.path.push(['M', x, y]); },
        lineTo(x, y) { drawing.path.push(['L', x, y]); },
        stroke() { drawing.strokes.push({ color: this.strokeStyle, path: structuredClone(drawing.path) }); },
        createLinearGradient() { return { addColorStop() {} }; },
        measureText(text) { return { width: String(text).length * 7 }; }
      }, { get(target, key) { return target[key] ?? (() => {}); } });
      node.getContext = () => context; node.drawing = drawing;
    }
    nodes.push(node); return node;
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<([a-z][a-z\d-]*)\b([^>]*)>/gi)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
    makeNode(match[1], attrs);
  }
  function matches(node, selector) {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    return node.tagName.toLowerCase() === selector;
  }
  function findAll(selector) { if (selector === 'main > section') return nodes.filter(n => n.tagName === 'SECTION'); return nodes.filter(node => selector.split(',').some(s => matches(node, s.trim()))); }
  const get = id => nodes.find(n => n.id === id) || null;
  const document = {
    getElementById: get, querySelectorAll: findAll, querySelector: s => findAll(s)[0] || null,
    body: nodes.find(n => n.tagName === 'BODY'), documentElement: nodes.find(n => n.tagName === 'HTML'),
    hidden: false, visibilityState: 'visible', activeElement: null,
    createElement: tag => makeNode(tag), addEventListener(type, fn) { globalEvents.set(type, fn); }
  };
  for (const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const value = match[2].match(/<option\b[^>]*value="([^"]*)"/);
    if (value) get(match[1]).value = value[1];
  }
  const media = { matches: reducedMotion, addEventListener(type, fn) { media.listener = fn; } };
  const sandbox = {
    document, console, performance: { now: () => now }, devicePixelRatio: 1,
    matchMedia: () => media,
    addEventListener(type, fn) { globalEvents.set(type, fn); },
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    IntersectionObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe(node) { this.targets ||= []; this.targets.push(node); }
      unobserve() {} disconnect() {}
    },
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of ['model.js', 'renderer.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  let views;
  const RealViews = sandbox.WindViews;
  sandbox.WindViews = class extends RealViews {
    constructor(...args) { super(...args); views = this; }
    drawVectors(state) { this.lastVectors = structuredClone(state); return super.drawVectors(state); }
    drawPark(state, dt) { this.lastPark = structuredClone(state); return super.drawPark(state, dt); }
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'script.js'), 'utf8'), context, { filename: 'script.js' });
  return {
    get, media, document, views, sandbox,
    input(id, value) { const n = get(id); assert.ok(n, `Missing #${id}`); document.activeElement = n; n.value = String(value); n.dispatch('input'); },
    change(id, value) { const n = get(id); n.value = String(value); n.dispatch('change'); },
    click(id) { const n = get(id); assert.ok(n, `Missing #${id}`); document.activeElement = n; n.dispatch('click'); },
    frame(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); },
    resize() { globalEvents.get('resize')?.(); },
    key(key) { globalEvents.get('keydown')?.({ key, target: document.body, preventDefault() {} }); },
    visible(value) { for (const o of observers) o.fn((o.targets || []).map(target => ({ target, isIntersecting: value, intersectionRatio: value ? 1 : 0 }))); },
    get pendingFrames() { return frames.size; }
  };
}

function near(actual, expected, tolerance = 1e-7) { assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`); }
function setA(app, x, y) { app.input('a-x', x); app.input('a-y', y); }
function currentArrow(app) {
  const strokes = app.get('vector-canvas').drawing.strokes;
  const line = strokes.find(s => s.color === '#ffffff' && s.path.length === 2);
  if (!line) return null;
  return { x: line.path[1][1] - line.path[0][1], y: line.path[1][2] - line.path[0][2] };
}

for (const [name, x, y] of [['east', 8, 0], ['north', 0, 8], ['west', -8, 0], ['south', 0, -8], ['northeast', 8, 8], ['southeast', 8, -8], ['northwest', -8, 8]]) {
  test(`cartesian ${name}: values and real Canvas arrow point in the same direction`, () => {
    const app = application(true); setA(app, x, y);
    near(app.views.lastVectors.current.x, x); near(app.views.lastVectors.current.y, y);
    const arrow = currentArrow(app); assert.ok(arrow);
    assert.equal(Math.sign(arrow.x) || 0, Math.sign(x) || 0); assert.equal(Math.sign(arrow.y) || 0, Math.sign(-y) || 0);
    if (x && y) near(arrow.x / arrow.y, x / -y);
  });
}

test('reduced motion redraws immediately after input and resize', () => {
  const app = application(true), canvas = app.get('vector-canvas');
  const first = canvas.drawing.clears; setA(app, 0, -8);
  assert.ok(canvas.drawing.clears > first); assert.ok(currentArrow(app).y > 0);
  const next = canvas.drawing.clears; app.resize(); assert.ok(canvas.drawing.clears > next);
});

test('null wind has no current arrow, undefined direction and stationary particles', () => {
  const app = application(); setA(app, 0, 0); app.frame(1000);
  assert.equal(currentArrow(app), null);
  assert.match(app.get('metric-direction').textContent, /definida|—/i);
  const before = app.views.particles.map(p => [p.x, p.y]); app.frame(1016);
  assert.deepEqual(app.views.particles.map(p => [p.x, p.y]), before);
});

test('blank input preserves last valid wind and reports validation error', () => {
  const app = application(true); setA(app, 8, 0); app.input('a-x', '');
  near(app.views.lastVectors.current.x, 8); near(app.views.lastVectors.current.y, 0);
  assert.equal(app.get('a-x').getAttribute('aria-invalid'), 'true');
  assert.match(app.get('input-message').textContent, /válid|completa|vacío|revisa/i);
});

test('editing while transitioning replaces the animation without overwriting new values', () => {
  const app = application(); app.click('animate-button'); app.frame(400);
  setA(app, -8, -8); app.frame(2500);
  near(app.views.lastVectors.current.x, -8); near(app.views.lastVectors.current.y, -8);
  const arrow = currentArrow(app); assert.ok(arrow.x < 0 && arrow.y > 0);
});

test('reference operations are shown with correct values', () => {
  const app = application(true);
  assert.match(app.get('result-dot').textContent, /62/);
  assert.match(app.get('result-cross').textContent, /68/);
  assert.match(app.get('result-angle').textContent, /47,64/);
  assert.match(app.get('result-difference').textContent, /−4|-4/);
});

test('optimization fills comparison and wind edits invalidate it', () => {
  const app = application(true); app.click('optimize-button');
  assert.ok(app.get('comparison-table').children.length > 1);
  assert.equal(app.get('comparison-summary').children.length, 3);
  app.input('a-x', 9);
  assert.match(app.get('comparison-status').textContent, /cambi|nueva|ejecut|busca/i);
  assert.equal(app.get('comparison-summary').children.length, 0);
});

test('presentation can be entered, advanced and exited', () => {
  const app = application(true); app.click('presentation-toggle');
  assert.equal(app.get('presentation-bar').hidden, false);
  const first = app.get('presentation-label').textContent; app.click('presentation-next');
  assert.notEqual(app.get('presentation-label').textContent, first);
  app.click('presentation-exit'); assert.equal(app.get('presentation-bar').hidden, true);
});

for (const [angle, xSign, ySign] of [[0, 1, 0], [90, 0, -1], [180, -1, 0], [-90, 0, 1], [45, 1, -1], [-45, 1, 1], [135, -1, -1]]) {
  test(`polar ${angle} degrees synchronizes components and Canvas`, () => {
    const app = application(true); app.click('mode-polar'); app.input('a-speed', 8); app.input('a-angle', angle);
    const arrow = currentArrow(app);
    assert.equal(Math.sign(arrow.x) || 0, xSign); assert.equal(Math.sign(arrow.y) || 0, ySign);
    const vector = app.views.lastVectors.current;
    near(Number(app.get('a-x').value), vector.x, 1e-7); near(Number(app.get('a-y').value), vector.y, 1e-7);
  });
}

test('170 to -170 transition crosses the west direction, not east', () => {
  const app = application(); app.change('scenario', 'crossing'); app.click('animate-button');
  app.frame(0);
  for (let time = 25; time <= 875; time += 25) app.frame(time);
  assert.ok(app.views.lastVectors.current.x < -7.99);
  near(app.views.lastVectors.current.y, 0, 1e-7);
  for (let time = 900; time <= 1775; time += 25) app.frame(time);
  near(app.views.lastVectors.current.x, 8 * Math.cos(-170 * Math.PI / 180));
  near(app.views.lastVectors.current.y, 8 * Math.sin(-170 * Math.PI / 180));
});

test('invalid A remains visibly invalid while B is edited', () => {
  const app = application(true); app.input('a-x', ''); app.input('b-x', 6);
  assert.equal(app.get('a-x').value, '', 'the pending invalid field was silently replaced with old data');
  assert.equal(app.get('a-x').getAttribute('aria-invalid'), 'true');
  near(app.views.lastVectors.current.x, 6);
});

test('presentation stages hide unrelated sections and restore them on exit', () => {
  const app = application(true); app.click('presentation-toggle');
  assert.equal(app.get('enfoque').hidden, false); assert.equal(app.get('laboratorio').hidden, true);
  app.click('presentation-next'); assert.equal(app.get('enfoque').hidden, true); assert.equal(app.get('laboratorio').hidden, false);
  app.key('Escape'); assert.equal(app.get('presentation-bar').hidden, true);
  assert.equal(app.get('enfoque').hidden, false); assert.equal(app.get('laboratorio').hidden, false);
});

test('real particle renderer advances both components with one time scale', () => {
  const app = application(); setA(app, 8, 8); app.frame(0);
  const p = app.views.particles[0]; p.x = 80; p.y = 80; p.trail = [];
  app.frame(25);
  const visualTime = app.sandbox.WindModel.PARAMS.visualTimeScale;
  near(p.x - 80, 8 * .025 * visualTime); near(p.y - 80, 8 * .025 * visualTime);
  const screen = app.sandbox.WindModel.screenVector({ x: p.x - 80, y: p.y - 80 }, 1);
  assert.ok(screen.x > 0 && screen.y < 0);
});

test('doubling ambient magnitude doubles particle displacement outside wakes', () => {
  function displacement(speed) {
    const app = application(); setA(app, speed, 0); app.frame(0);
    const p = app.views.particles[0]; p.x = 80; p.y = 80; p.trail = [];
    app.frame(25); return p.x - 80;
  }
  near(displacement(16), 2 * displacement(8));
});

test('particle motion over equal elapsed time is independent of 30 versus 60 FPS', () => {
  function position(fps) {
    const app = application(); setA(app, 8, 0); app.frame(0);
    const p = app.views.particles[0]; p.x = 80; p.y = 80; p.trail = [];
    for (let i = 1; i <= fps; i++) app.frame(i * 1000 / fps);
    return p.x;
  }
  near(position(30), position(60));
});

test('unsafe turbine position is rejected and yaw edits affect power', () => {
  const app = application(true); app.change('scenario', 'east');
  const before = app.views.lastPark.farm.power;
  app.input('turbine-x', 0);
  near(app.views.lastPark.turbines[0].x, 280);
  assert.equal(app.get('turbine-x').getAttribute('aria-invalid'), 'true');
  app.input('turbine-x', 280); app.input('turbine-yaw', 0);
  near(app.views.lastPark.farm.turbines[0].power, 0);
  assert.ok(app.views.lastPark.farm.power < before);
});

test('energy interval changes energy but not power', () => {
  const app = application(true), before = app.views.lastPark.farm;
  app.input('hours', 2);
  near(app.views.lastPark.farm.power, before.power); near(app.views.lastPark.farm.energy, 2 * before.energy);
});

test('animation loop stops outside both views and resumes when visible', () => {
  const app = application(); app.frame(0); assert.equal(app.pendingFrames, 1);
  app.visible(false); app.frame(16); assert.equal(app.pendingFrames, 0);
  const before = app.views.particles.map(p => [p.x, p.y]); app.frame(1000);
  assert.deepEqual(app.views.particles.map(p => [p.x, p.y]), before);
  app.visible(true); assert.equal(app.pendingFrames, 1);
  app.frame(1016); app.frame(1032);
  assert.notDeepEqual(app.views.particles.map(p => [p.x, p.y]), before);
});

test('enabling reduced motion during transition draws the final state and stops animation', () => {
  const app = application(); app.click('animate-button'); app.frame(0); app.frame(25);
  const before = app.get('vector-canvas').drawing.clears;
  app.media.matches = true; app.media.listener({ matches: true });
  near(app.views.lastVectors.current.x, 4); near(app.views.lastVectors.current.y, 10);
  assert.ok(app.get('vector-canvas').drawing.clears > before);
  const arrow = currentArrow(app); near(arrow.x / arrow.y, 4 / -10);
  app.frame(50); assert.equal(app.pendingFrames, 0);
});

test('restarting transition starts from current intermediate vector without a jump', () => {
  const app = application(); app.click('animate-button'); app.frame(0);
  for (let time = 25; time <= 500; time += 25) app.frame(time);
  const before = app.views.lastVectors.current;
  assert.ok(before.x !== 8 || before.y !== 3);
  app.click('animate-button'); app.frame(525);
  near(app.views.lastVectors.current.x, before.x); near(app.views.lastVectors.current.y, before.y);
});

test('letters and out-of-range values preserve last valid state', () => {
  const app = application(true); const before = app.views.lastVectors.current;
  for (const invalid of ['abc', '', 'Infinity', '31']) {
    app.input('a-x', invalid);
    near(app.views.lastVectors.current.x, before.x); near(app.views.lastVectors.current.y, before.y);
    assert.equal(app.get('a-x').getAttribute('aria-invalid'), 'true');
  }
});

for (const [name, action] of [
  ['yaw', app => app.input('turbine-yaw', 160)],
  ['layout', app => app.change('layout-select', '1')],
  ['interval', app => app.input('hours', 2)]
]) {
  test(`${name} change invalidates comparison made under prior assumptions`, () => {
    const app = application(true); app.click('optimize-button');
    assert.equal(app.get('comparison-summary').children.length, 3);
    action(app); assert.equal(app.get('comparison-summary').children.length, 0);
    assert.match(app.get('comparison-status').textContent, /cambi|nueva|ejecut|busca/i);
  });
}

test('switching coordinate mode discards invalid draft and restores a usable valid state', () => {
  const app = application(true); app.input('a-x', ''); app.click('mode-polar');
  assert.equal(app.get('a-x').getAttribute('aria-invalid'), 'false');
  near(Number(app.get('a-x').value), 8);
  app.input('a-angle', 360); assert.equal(app.get('a-angle').getAttribute('aria-invalid'), 'true');
  app.click('mode-cartesian'); assert.equal(app.get('a-angle').getAttribute('aria-invalid'), 'false');
  app.click('animate-button'); near(app.views.lastVectors.current.x, 4); near(app.views.lastVectors.current.y, 10);
});

test('invalid turbine or time drafts do not invalidate a still-correct comparison', () => {
  const app = application(true); app.click('optimize-button');
  const power = app.views.lastPark.farm.power;
  app.input('turbine-x', ''); app.input('hours', '');
  assert.equal(app.get('comparison-summary').children.length, 3);
  near(app.views.lastPark.farm.power, power);
});

// Park-local wind controls keep the presentation's simulation stage autonomous.
// These contracts are written before the corresponding controls are implemented.
test('park A/B buttons select the matching condition immediately', () => {
  const app = application(true);
  app.click('park-use-b');
  assert.equal(app.views.lastPark.activeKey, 'b');
  near(app.views.lastPark.current.x, 4); near(app.views.lastPark.current.y, 10);
  app.click('park-use-a');
  assert.equal(app.views.lastPark.activeKey, 'a');
  near(app.views.lastPark.current.x, 8); near(app.views.lastPark.current.y, 3);
});

test('park polar controls update selected B, laboratory fields, metrics and Canvas together', () => {
  const app = application(true); app.click('park-use-b');
  app.input('park-speed', 8); app.input('park-angle', -90);
  const state = app.views.lastPark;
  assert.equal(state.activeKey, 'b');
  near(state.b.x, 0); near(state.b.y, -8);
  near(state.a.x, 8); near(state.a.y, 3);
  near(state.current.x, 0); near(state.current.y, -8);
  near(Number(app.get('b-x').value), 0); near(Number(app.get('b-y').value), -8);
  near(Number(app.get('b-speed').value), 8); near(Number(app.get('b-angle').value), -90);
  assert.equal(app.get('metric-speed').textContent, '8,00');
  assert.match(app.get('metric-direction').textContent, /-90,00|−90,00/);
  assert.ok(currentArrow(app).y > 0); near(currentArrow(app).x, 0);
});

test('park polar controls also edit A when A is selected', () => {
  const app = application(true); app.click('park-use-a');
  app.input('park-speed', 12); app.input('park-angle', 180);
  const state = app.views.lastPark;
  assert.equal(state.activeKey, 'a');
  near(state.a.x, -12); near(state.a.y, 0);
  near(state.b.x, 4); near(state.b.y, 10);
  near(state.current.x, -12); near(state.current.y, 0);
  near(Number(app.get('a-x').value), -12); near(Number(app.get('a-y').value), 0);
  assert.ok(currentArrow(app).x < 0); near(currentArrow(app).y, 0);
});

test('park transition button starts from the current intermediate vector without resetting to A', () => {
  const app = application(); app.click('animate-button'); app.frame(0);
  for (let time = 25; time <= 500; time += 25) app.frame(time);
  const before = app.views.lastPark.current;
  assert.ok(before.x !== 8 || before.y !== 3);
  app.click('park-animate'); app.frame(525);
  near(app.views.lastPark.current.x, before.x); near(app.views.lastPark.current.y, before.y);
  for (let time = 550; time <= 2300; time += 25) app.frame(time);
  near(app.views.lastPark.current.x, 4); near(app.views.lastPark.current.y, 10);
});

test('park demo restores east wind and initial layout reproducibly after optimization', () => {
  const app = application(true); app.click('optimize-button');
  app.click('park-demo');
  near(app.views.lastPark.current.x, 10); near(app.views.lastPark.current.y, 0);
  assert.equal(app.get('layout-select').value, '0');
  const expected = app.sandbox.WindModel.layouts()[0].turbines;
  for (let i = 0; i < expected.length; i++) {
    near(app.views.lastPark.turbines[i].x, expected[i].x);
    near(app.views.lastPark.turbines[i].y, expected[i].y);
    near(app.views.lastPark.turbines[i].yaw, expected[i].yaw);
  }
  const power = app.views.lastPark.farm.power;
  app.click('optimize-button'); app.click('park-demo');
  near(app.views.lastPark.farm.power, power);
  assert.equal(app.get('comparison-summary').children.length, 0);
});

test('blank park wind field preserves the flow and reports a local validation error', () => {
  const app = application(true); app.click('park-use-b');
  const before = app.views.lastPark.current;
  app.input('park-speed', '');
  near(app.views.lastPark.current.x, before.x); near(app.views.lastPark.current.y, before.y);
  assert.equal(app.get('park-speed').getAttribute('aria-invalid'), 'true');
  assert.equal(app.get('park-speed').value, '');
  assert.match(app.get('park-input-message').textContent, /válid|completa|vacío|revisa/i);
});

for (const [x,y] of [[8,0],[0,8],[-8,0],[0,-8],[8,3],[4,10]]) {
  test(`requested (${x}, ${y}): arrow and particles follow the same vector`, () => {
    const app=application(); setA(app,x,y); app.frame(0);
    const particle=app.views.particles[0];particle.x=80;particle.y=80;particle.trail=[];
    app.frame(25);
    const scale=app.sandbox.WindModel.PARAMS.visualTimeScale;
    near(particle.x-80,x*.025*scale);near(particle.y-80,y*.025*scale);
    const a=currentArrow(app);
    assert.equal(Math.sign(a.x)||0,Math.sign(x)||0);
    assert.equal(Math.sign(a.y)||0,Math.sign(-y)||0);
    if(x&&y)near(a.y/a.x,-y/x);
  });
}
for(const width of [280,680,920,1180]) {
  test(`renderer produces finite, correctly oriented geometry at ${width}px canvas width`,()=>{
    const app=application(true,{width,height:380});setA(app,4,10);
    const arrow=currentArrow(app);assert.ok(arrow.x>0&&arrow.y<0);near(arrow.y/arrow.x,-2.5);
    for(const id of ['vector-canvas','wind-canvas'])for(const stroke of app.get(id).drawing.strokes) {
      for(const point of stroke.path)assert.ok(point.slice(1).every(Number.isFinite));
    }
  });
}
