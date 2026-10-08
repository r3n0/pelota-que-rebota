/*
Pelotita Loca — rebote con física real (Matter.js).

- La física la resuelve Matter.js: gravedad, colisiones, rotación y torque.
- En cada choque contra un borde la figura cambia, ciclando entre círculo,
  triángulo, cuadrado y pentágono. Cada figura tiene su masa, fricción y
  elasticidad, así el rebote cambia "acorde a la física".
- Cada rebote dispara un blip corto hecho con p5.sound.
- Si el cursor está encima de la pelota, la simulación se pausa.

Nota sobre el audio: el navegador no deja crear/arrancar un AudioContext sin
un gesto del usuario (click, tap o tecla). Por eso el audio no se arma en
setup() sino en el primer gesto real, y hasta entonces no suena nada.
*/

const { Engine, Composite, Bodies, Body, Events } = Matter;

const RADIO = 84; // radio base (circunradio) de las figuras
const VELOCIDAD_MAX = 24;
const FUERZA_SALTO = 20; // impulso hacia arriba al presionar la barra espaciadora

// Sistema de partículas: se emiten en la posición del mouse y viven 10 segundos.
const VIDA_PARTICULA = 10000; // ms
const PARTICULAS_POR_FRAME = 2;

// Figuras y sus propiedades físicas. El círculo rueda y rebota más; los
// polígonos pierden más energía en las esquinas.
const FIGURAS = [
  { tipo: "circle", lados: 0, restitution: 0.92, friction: 0.02, frictionAir: 0.002, density: 0.0015 },
  { tipo: "triangle", lados: 3, restitution: 0.7, friction: 0.1, frictionAir: 0.004, density: 0.0025 },
  { tipo: "square", lados: 4, restitution: 0.78, friction: 0.08, frictionAir: 0.003, density: 0.002 },
  { tipo: "pentagon", lados: 5, restitution: 0.84, friction: 0.05, frictionAir: 0.003, density: 0.0018 },
];

let engine;
let mundo;
let pelota; // cuerpo de Matter que representa la pelota
let figura; // configuración de la figura actual
let indiceFigura = 0;
let colorActual; // color de la pelota; cambia en cada rebote
let particulas = [];
let mouseActivo = false; // el mouse ya se movió al menos una vez

// Cadena de audio: oscilador -> envelope -> salida.
let osc;
let env;
let audioListo = false;

let choquePendiente = false;
let velocidadChoque = 0;
let ultimoCambio = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);

  engine = Engine.create();
  mundo = engine.world;
  engine.gravity.y = 1;

  crearParedes();

  figura = FIGURAS[0];
  pelota = crearCuerpo(figura, width / 2, height / 3);
  Composite.add(mundo, pelota);
  colorActual = colorAleatorio();

  Events.on(engine, "collisionStart", detectarChoque);
}

function draw() {
  background(120);

  const sobreLaPelota = dist(mouseX, mouseY, pelota.position.x, pelota.position.y) <= RADIO + 6;

  if (!sobreLaPelota) {
    Engine.update(engine, 1000 / 60);
    resolverChoque();
  }

  if (mouseActivo) {
    emitirParticulas();
  }
  actualizarParticulas();

  dibujarPelota();
  dibujarParticulas();
  dibujarTitulo();

  if (!audioListo) {
    avisoAudio();
  }
}

function crearParedes() {
  const grosor = 80;
  // restitution 0: Matter usa max(restA, restB), así manda la de la pelota.
  const opciones = { isStatic: true, restitution: 0, friction: 0.4, label: "pared" };

  Composite.add(mundo, [
    Bodies.rectangle(width / 2, height + grosor / 2, width * 3, grosor, opciones), // suelo
    Bodies.rectangle(width / 2, -grosor / 2, width * 3, grosor, opciones), // techo
    Bodies.rectangle(-grosor / 2, height / 2, grosor, height * 3, opciones), // izquierda
    Bodies.rectangle(width + grosor / 2, height / 2, grosor, height * 3, opciones), // derecha
  ]);
}

function crearCuerpo(cfg, x, y) {
  const opciones = {
    restitution: cfg.restitution,
    friction: cfg.friction,
    frictionAir: cfg.frictionAir,
    density: cfg.density,
    label: "pelota",
  };
  return cfg.tipo === "circle" ? Bodies.circle(x, y, RADIO, opciones) : Bodies.polygon(x, y, cfg.lados, RADIO, opciones);
}

// Matter avisa los choques durante Engine.update; acá solo marcamos la intención.
function detectarChoque(evento) {
  for (const par of evento.pairs) {
    const otro = par.bodyA === pelota ? par.bodyB : par.bodyB === pelota ? par.bodyA : null;
    if (otro && otro.isStatic) {
      velocidadChoque = Math.hypot(pelota.velocity.x, pelota.velocity.y);
      choquePendiente = true;
    }
  }
}

// Cambiar el cuerpo en pleno update de Matter es peligroso: lo hacemos después.
function resolverChoque() {
  if (!choquePendiente) {
    return;
  }
  choquePendiente = false;

  // Evita doble cambio en las esquinas y rebotes demasiado flojos.
  if (millis() - ultimoCambio < 90 || velocidadChoque < 1.5) {
    return;
  }
  ultimoCambio = millis();

  cambiarFigura();
  tocarRebote(velocidadChoque);
}

function cambiarFigura() {
  const x = pelota.position.x;
  const y = pelota.position.y;
  const velocidad = { x: pelota.velocity.x, y: pelota.velocity.y };
  const giro = pelota.angularVelocity;

  Composite.remove(mundo, pelota);

  indiceFigura = (indiceFigura + 1) % FIGURAS.length;
  figura = FIGURAS[indiceFigura];
  pelota = crearCuerpo(figura, x, y);
  Composite.add(mundo, pelota);
  colorActual = colorAleatorio();

  // Conserva el movimiento: solo cambia la forma, no la energía.
  Body.setVelocity(pelota, velocidad);
  Body.setAngularVelocity(pelota, giro);
}

function colorAleatorio() {
  // Componentes con piso 80 para que el color se vea sobre el fondo gris.
  return color(random(80, 255), random(80, 255), random(80, 255));
}

function dibujarPelota() {
  fill(colorActual);
  noStroke();

  if (figura.tipo === "circle") {
    circle(pelota.position.x, pelota.position.y, RADIO * 2);
  } else {
    // Los vértices que expone Matter ya vienen rotados en coordenadas del mundo.
    beginShape();
    for (const v of pelota.vertices) {
      vertex(v.x, v.y);
    }
    endShape(CLOSE);
  }
}

function dibujarTitulo() {
  fill(255);
  noStroke();
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(28);
  text("Pelotita Loca", width / 2, 14);
  textStyle(NORMAL);
}

function avisoAudio() {
  fill(255);
  noStroke();
  textAlign(CENTER, TOP);
  textSize(14);
  text("Haz clic para activar el sonido", width / 2, 54);
}

function tocarRebote(velocidad) {
  if (!audioListo) {
    return;
  }
  // A golpe más fuerte, sonido más agudo.
  const frecuencia = map(constrain(velocidad, 0, VELOCIDAD_MAX), 0, VELOCIDAD_MAX, 140, 620);
  osc.freq(frecuencia * random(0.95, 1.05));
  env.play();
}

// Se llama en el primer gesto real del usuario: recién ahí se puede crear el
// AudioContext y arrancar el sonido.
function activarAudio() {
  if (audioListo) {
    return;
  }

  osc = new p5.Oscillator("sine");
  osc.disconnect(); // se saca de la salida directa: suena a través del envelope
  env = new p5.Envelope();
  env.setADSR(0.005, 0.06, 0.05, 0.15);
  osc.connect(env);
  osc.start();
  osc.amp(0.35);

  userStartAudio(); // reanuda el contexto ya creado
  audioListo = true;
}

class Particula {
  constructor(x, y) {
    this.pos = createVector(x, y);
    const angulo = random(TWO_PI);
    this.vel = createVector(cos(angulo), sin(angulo)).mult(random(0.5, 3.5));
    this.nacimiento = millis();
    this.tamano = random(4, 10);
    // Se guarda como [r, g, b] para no depender de la API de color al pasar el alfa.
    this.rgb = [random(80, 255), random(80, 255), random(80, 255)];
  }

  get edad() {
    return millis() - this.nacimiento;
  }

  get viva() {
    return this.edad < VIDA_PARTICULA;
  }

  actualizar() {
    this.pos.add(this.vel);
    this.vel.mult(0.98); // rozamiento: pierden velocidad con el tiempo
  }

  dibujar() {
    const alfa = map(this.edad, 0, VIDA_PARTICULA, 255, 0); // se desvanecen
    fill(this.rgb[0], this.rgb[1], this.rgb[2], alfa);
    noStroke();
    circle(this.pos.x, this.pos.y, this.tamano);
  }
}

function emitirParticulas() {
  for (let i = 0; i < PARTICULAS_POR_FRAME; i++) {
    particulas.push(new Particula(mouseX, mouseY));
  }
}

function actualizarParticulas() {
  for (const p of particulas) {
    p.actualizar();
  }
  // Se descartan las que superaron los 10 segundos de vida.
  particulas = particulas.filter((p) => p.viva);
}

function dibujarParticulas() {
  for (const p of particulas) {
    p.dibujar();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // Las paredes son cuerpos físicos: hay que rehacerlas con el nuevo tamaño.
  for (const cuerpo of Composite.allBodies(mundo)) {
    if (cuerpo.isStatic) {
      Composite.remove(mundo, cuerpo);
    }
  }
  crearParedes();
  Body.setPosition(pelota, {
    x: constrain(pelota.position.x, RADIO, width - RADIO),
    y: constrain(pelota.position.y, RADIO, height - RADIO),
  });
}

function mousePressed() {
  activarAudio();
}

function mouseMoved() {
  mouseActivo = true;
}

function touchStarted() {
  activarAudio();
}

function keyPressed() {
  activarAudio();

  // Barra espaciadora: impulso fuerte hacia arriba (conserva el movimiento lateral).
  if (key === " " || key === "Spacebar") {
    Body.setVelocity(pelota, { x: pelota.velocity.x, y: -FUERZA_SALTO });
    return false; // evita el scroll por defecto de la barra espaciadora
  }
}
