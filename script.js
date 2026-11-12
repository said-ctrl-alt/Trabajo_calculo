(() => {
  "use strict";

  const defaults = { startSpeed: 8, startAngle: 20, endSpeed: 12, endAngle: 65 };
  const inputIds = ["start-speed", "start-angle", "end-speed", "end-angle"];
  const inputs = Object.fromEntries(inputIds.map((id) => [id, document.getElementById(id)]));
  const canvas = document.getElementById("wind-canvas");
  const context = canvas.getContext("2d");
  const inputMessage = document.getElementById("input-message");
  const flowState = document.getElementById("flow-state");
  const particles = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let animationFrame;
  let current = { speed: defaults.startSpeed, angle: defaults.startAngle };
  let transition = null;
  let canvasWidth = 0;
  let canvasHeight = 0;

  const outputs = {
    vector: document.getElementById("vector-value"),
    direction: document.getElementById("direction-value"),
    componentX: document.getElementById("component-x"),
    componentY: document.getElementById("component-y"),
    angleDelta: document.getElementById("angle-delta"),
    alignment: document.getElementById("alignment-reading"),
    metricDirection: document.getElementById("metric-direction"),
    metricSpeed: document.getElementById("metric-speed"),
    metricEfficiency: document.getElementById("metric-efficiency"),
    efficiencyBar: document.getElementById("efficiency-bar"),
    metricEnergy: document.getElementById("metric-energy")
  };

  function numberFromInput(input) {
    return Number(input.value);
  }

  function readValues() {
    return {
      startSpeed: numberFromInput(inputs["start-speed"]),
      startAngle: numberFromInput(inputs["start-angle"]),
      endSpeed: numberFromInput(inputs["end-speed"]),
      endAngle: numberFromInput(inputs["end-angle"])
    };
  }

  function valuesAreValid(values) {
    return Number.isFinite(values.startSpeed) && Number.isFinite(values.endSpeed)
      && Number.isFinite(values.startAngle) && Number.isFinite(values.endAngle)
      && values.startSpeed >= 0 && values.startSpeed <= 30
      && values.endSpeed >= 0 && values.endSpeed <= 30
      && values.startAngle >= -180 && values.startAngle <= 180
      && values.endAngle >= -180 && values.endAngle <= 180;
  }

  function formatDecimal(value, digits = 1) {
    return value.toFixed(digits).replace(".", ",");
  }

  function wrapAngle(angle) {
    return ((angle + 180) % 360 + 360) % 360 - 180;
  }

  function angleLabel(angle) {
    const directions = [
      ["E", 0], ["ENE", 22.5], ["NE", 45], ["NNE", 67.5],
      ["N", 90], ["NNW", 112.5], ["NW", 135], ["WNW", 157.5],
      ["W", 180], ["WSW", -157.5], ["SW", -135], ["SSW", -112.5],
      ["S", -90], ["SSE", -67.5], ["SE", -45], ["ESE", -22.5]
    ];
    let nearest = directions[0];
    for (const direction of directions) {
      if (Math.abs(wrapAngle(angle - direction[1])) < Math.abs(wrapAngle(angle - nearest[1]))) nearest = direction;
    }
    return `${String(Math.round((angle + 360) % 360)).padStart(3, "0")}° · ${nearest[0]}`;
  }

  function alignmentFor(angle) {
    return Math.round(Math.abs(Math.cos(angle * Math.PI / 180)) * 100);
  }

  function updateReadings(flow) {
    const x = flow.speed * Math.cos(flow.angle * Math.PI / 180);
    const y = flow.speed * Math.sin(flow.angle * Math.PI / 180);
    const alignment = alignmentFor(flow.angle);
    const energy = Math.round(Math.min(100, (flow.speed / 15) ** 2 * alignment));
    const roundedAngle = Math.round((flow.angle + 360) % 360);

    outputs.vector.innerHTML = `${formatDecimal(flow.speed)} <small>m/s</small>`;
    outputs.direction.textContent = angleLabel(flow.angle);
    outputs.componentX.innerHTML = `${formatDecimal(x)} <small>m/s</small>`;
    outputs.componentY.innerHTML = `${formatDecimal(y)} <small>m/s</small>`;
    outputs.angleDelta.textContent = `${Math.abs(Math.round(wrapAngle(numberFromInput(inputs["end-angle"]) - numberFromInput(inputs["start-angle"]))))}°`;
    outputs.alignment.innerHTML = `${alignment}<small>%</small>`;
    outputs.metricDirection.innerHTML = `${String(roundedAngle).padStart(3, "0")}<span>°</span>`;
    outputs.metricSpeed.innerHTML = `${formatDecimal(flow.speed)} <small>m/s</small>`;
    outputs.metricEfficiency.innerHTML = `${alignment}<span>%</span>`;
    outputs.efficiencyBar.style.width = `${alignment}%`;
    outputs.metricEnergy.innerHTML = `${energy}<span>/100</span>`;
    document.querySelectorAll(".energy-bars i").forEach((bar, index) => {
      bar.style.background = index < Math.round(energy / 100 * 12) ? "#7cab87" : "#d7e5d9";
    });
  }

  function setError(message) {
    inputMessage.textContent = message;
    inputMessage.classList.add("is-error");
    flowState.textContent = "REVISA LOS VALORES";
  }

  function validateAndAnimate() {
    const values = readValues();
    if (!valuesAreValid(values)) {
      setError("Revisa los valores: magnitud entre 0 y 30 m/s; dirección entre −180° y 180°.");
      return;
    }
    inputMessage.textContent = "Los campos admiten de 0 a 30 m/s y de −180° a 180°.";
    inputMessage.classList.remove("is-error");
    if (reducedMotion) {
      current = { speed: values.endSpeed, angle: values.endAngle };
      transition = null;
      flowState.textContent = "FLUJO ACTUALIZADO";
      updateReadings(current);
      return;
    }
    transition = {
      from: { speed: values.startSpeed, angle: values.startAngle },
      to: { speed: values.endSpeed, angle: values.endAngle },
      startTime: performance.now(),
      duration: 1750
    };
    flowState.textContent = "ACTUALIZANDO FLUJO";
  }

  function updateTransition(now) {
    if (!transition) return;
    const progress = Math.min(1, (now - transition.startTime) / transition.duration);
    const eased = progress * progress * (3 - 2 * progress);
    const deltaAngle = wrapAngle(transition.to.angle - transition.from.angle);
    current.speed = transition.from.speed + (transition.to.speed - transition.from.speed) * eased;
    current.angle = transition.from.angle + deltaAngle * eased;
    updateReadings(current);
    if (progress === 1) {
      current = { ...transition.to };
      transition = null;
      flowState.textContent = "FLUJO ACTUALIZADO";
      updateReadings(current);
    }
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = bounds.width;
    canvasHeight = bounds.height;
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    particles.length = 0;
    const count = Math.max(34, Math.round(bounds.width / 13));
    for (let i = 0; i < count; i += 1) {
      particles.push({ x: Math.random() * bounds.width, y: Math.random() * bounds.height, phase: Math.random(), drift: .7 + Math.random() * .6 });
    }
  }

  function drawFlow(now) {
    if (!canvasWidth || !canvasHeight) return;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    updateTransition(now);
    const radians = current.angle * Math.PI / 180;
    const intensity = Math.min(1, current.speed / 20);
    const velocity = 0.35 + intensity * 1.8;
    const dx = Math.cos(radians);
    const dy = -Math.sin(radians);

    for (const particle of particles) {
      particle.phase += velocity * particle.drift / canvasWidth;
      if (particle.phase > 1) {
        particle.phase = 0;
        particle.y = Math.random() * canvasHeight;
      }
      const progress = particle.phase;
      const x = (particle.x + dx * progress * canvasWidth * 1.25 + canvasWidth) % canvasWidth;
      const y = (particle.y + dy * progress * canvasWidth * .72 + canvasHeight) % canvasHeight;
      const length = 11 + intensity * 33;
      const alpha = .12 + .33 * (1 - progress);
      context.beginPath();
      context.moveTo(x - dx * length, y - dy * length);
      context.quadraticCurveTo(x - dx * length * .35 + dy * 4, y - dy * length * .35 - dx * 4, x, y);
      context.strokeStyle = `rgba(218, 241, 224, ${alpha})`;
      context.lineWidth = .55 + intensity * .7;
      context.stroke();
    }

    const originX = canvasWidth * .35;
    const originY = canvasHeight * .56;
    const vectorLength = 36 + intensity * 75;
    const endX = originX + dx * vectorLength;
    const endY = originY + dy * vectorLength;

    function drawReferenceVector(speed, angle, color) {
      const referenceRadians = angle * Math.PI / 180;
      const referenceX = Math.cos(referenceRadians);
      const referenceY = -Math.sin(referenceRadians);
      const referenceLength = 25 + Math.min(1, speed / 20) * 62;
      const referenceEndX = originX + referenceX * referenceLength;
      const referenceEndY = originY + referenceY * referenceLength;
      context.save();
      context.setLineDash([2, 5]);
      context.beginPath();
      context.moveTo(originX, originY);
      context.lineTo(referenceEndX, referenceEndY);
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(referenceEndX, referenceEndY, 2.5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.restore();
    }

    const values = readValues();
    if (valuesAreValid(values)) {
      drawReferenceVector(values.startSpeed, values.startAngle, "rgba(157, 201, 215, .88)");
      drawReferenceVector(values.endSpeed, values.endAngle, "rgba(178, 212, 154, .88)");
    }

    context.save();
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(endX, endY);
    context.strokeStyle = "rgba(201, 237, 211, .94)";
    context.lineWidth = 1.5;
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(originX, originY, 3, 0, Math.PI * 2);
    context.fillStyle = "rgba(230, 249, 235, .95)";
    context.fill();
    context.beginPath();
    context.moveTo(endX, endY);
    context.lineTo(endX - dx * 8 + dy * 4, endY - dy * 8 - dx * 4);
    context.lineTo(endX - dx * 8 - dy * 4, endY - dy * 8 + dx * 4);
    context.closePath();
    context.fillStyle = "rgba(201, 237, 211, .95)";
    context.fill();
    context.restore();

    if (!reducedMotion) animationFrame = requestAnimationFrame(drawFlow);
  }

  function reset() {
    for (const [id, key] of Object.entries({
      "start-speed": "startSpeed",
      "start-angle": "startAngle",
      "end-speed": "endSpeed",
      "end-angle": "endAngle"
    })) inputs[id].value = defaults[key];
    current = { speed: defaults.startSpeed, angle: defaults.startAngle };
    transition = null;
    inputMessage.textContent = "Los campos admiten de 0 a 30 m/s y de −180° a 180°.";
    inputMessage.classList.remove("is-error");
    flowState.textContent = "TRANSICIÓN LISTA";
    updateReadings(current);
  }

  document.getElementById("animate-button").addEventListener("click", validateAndAnimate);
  document.getElementById("reset-button").addEventListener("click", reset);
  for (const [id, input] of Object.entries(inputs)) {
    input.addEventListener("input", () => {
      inputMessage.classList.remove("is-error");
      const values = readValues();
      if (valuesAreValid(values)) {
        if (id === "start-speed" || id === "start-angle") {
          current = { speed: values.startSpeed, angle: values.startAngle };
        }
        validateAndAnimate();
      }
      else setError("Revisa los valores: magnitud entre 0 y 30 m/s; dirección entre −180° y 180°.");
    });
  }

  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".main-nav");
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Abrir navegación" : "Cerrar navegación");
    mainNav.classList.toggle("is-open", !isOpen);
  });
  mainNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Abrir navegación");
      mainNav.classList.remove("is-open");
    }
  });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: .12 });
  document.querySelectorAll(".reveal").forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
    observer.observe(element);
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  updateReadings(current);
  drawFlow(performance.now());

})();
