const canvas = document.getElementById("overlay");
const ctx2d = canvas.getContext("2d");
const trail = document.getElementById("trail");
const tctx = trail.getContext("2d");
const ribbonBtn = document.getElementById("ribbon");
const solidBtn = document.getElementById("solid");
const exportBtn = document.getElementById("export");
const stage = document.getElementById("stage");
const uploadBtn = document.getElementById("upload");
const shootBtn = document.getElementById("shoot");
const cameraBox = document.getElementById("camera");
const camVideo = document.getElementById("cam");
const countEl = document.getElementById("count");
const camCancel = document.getElementById("cam-cancel");
const fileInput = document.getElementById("file");
const score = document.getElementById("score");
const sctx = score.getContext("2d");
const nowEl = document.getElementById("now");
const whyEl = document.getElementById("why");
const playBtn = document.getElementById("play");
const againBtn = document.getElementById("again");
const musicBtn = document.getElementById("music");
const pointerBtn = document.getElementById("pointer");
const handBtn = document.getElementById("hand");
const haltBtn = document.getElementById("halt");
const recordBtn = document.getElementById("record");
const airInput = document.getElementById("air");
const tempoInput = document.getElementById("tempo");
const photo = document.getElementById("scroll");

let piece = DATA;
let canonNotes = piece.notes;
let handOrder = false;

canvas.width = piece.width;
canvas.height = piece.height;
score.width = piece.width;
score.height = 108;

const PIANO_LOW = 48;
const PIANO_SPAN = 48;

function midiOf(name) {
  const m = String(name).match(/^([A-G])(#?)(-?\d+)$/);
  if (!m) return PIANO_LOW + PIANO_SPAN / 2;
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return (Number(m[3]) + 1) * 12 + pc;
}

function pitchUnit(name) {
  const midi = typeof name === "number" ? name : midiOf(name);
  return Math.max(0, Math.min(1, (midi - PIANO_LOW) / PIANO_SPAN));
}

let audio = null;
let master = null;
let dry = null;
let wet = null;
let raf = 0;
let playing = [];
let ribbon = false;
let solid = false;
let phase = "idle";
let noteSeat = null;
let shownNow = -1;
let rotX = -0.38;
let rotY = 0.62;
let cubeStrips = [];
let strokePts = {};
let solidZoom = 1;
let dragging = false;
let dispersion = 0;
let particleMode = true;
let releaseAfter = 0;
const lightPaper = document.body.classList.contains("paper");
const meshLayer = document.createElement("canvas");
const meshContext = meshLayer.getContext("2d");
let lastOrbitFrame = 0;
let starRibbons = [];
let lastX = 0;
let lastY = 0;
let solidLoopOn = false;
let pointerOn = false;
let handOn = false;
let tracing = false;
let handVisits = [];
let handVisit = null;
let handVoices = [];
let lineVoice = null;
let pointerVisits = [];
let readShown = 0;
let saved = null;
let lastPointer = -1;
let pointerVoices = [];
let recorder = null;
let recordArmed = false;
let recordChunks = [];
let recordCanvas = null;
let recordFrame = 0;
const dots = [];
let scoreCount = 0;
const scored = {};

function endpointGap(a, b) {
  const ae = [a.points[0], a.points[a.points.length - 1]];
  const be = [b.points[0], b.points[b.points.length - 1]];
  let best = 1e9;
  for (let i = 0; i < ae.length; i++) {
    for (let j = 0; j < be.length; j++) {
      const d = Math.hypot(ae[i][0] - be[j][0], ae[i][1] - be[j][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function buildPhrases() {
  const out = [];
  const source = piece.notes;
  for (let i = 0; i < source.length; ) {
    const phrase = [source[i]];
    let j = i + 1;
    while (j < source.length && endpointGap(source[j - 1], source[j]) <= 22) {
      phrase.push(source[j]);
      j++;
    }
    out.push(phrase);
    i = j;
  }
  return out;
}

let phrases = buildPhrases();
let bodies = [];

function tempo() {
  return Number(tempoInput.value) / 100;
}

function impulse() {
  const rate = audio.sampleRate;
  const seconds = 5.8;
  const length = Math.floor(rate * seconds);
  const buffer = audio.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let lowL = 0;
  let lowR = 0;
  const taps = [
    [0.017, 0.42, 0.08],
    [0.034, 0.1, 0.3],
    [0.058, 0.18, 0.16],
  ];
  for (let i = 0; i < length; i++) {
    const env = Math.pow(1 - i / length, 1.05);
    lowL += 0.16 * ((Math.random() * 2 - 1) - lowL);
    lowR += 0.16 * ((Math.random() * 2 - 1) - lowR);
    let tapL = 0;
    let tapR = 0;
    const time = i / rate;
    taps.forEach(function (tap) {
      if (Math.abs(time - tap[0]) < 1 / rate) {
        tapL += tap[1];
        tapR += tap[2];
      }
    });
    left[i] = (lowL * 0.75 + tapL) * env * 0.55;
    right[i] = (lowR * 0.75 + tapR) * env * 0.55;
  }
  return buffer;
}

function applyAir() {
  if (!dry) return;
  const amount = Number(airInput.value) / 100;
  dry.gain.value = 1 - amount * 0.7;
  wet.gain.value = amount * 0.95;
}

function ensureAudio() {
  if (audio) return;
  audio = new AudioContext();
  master = audio.createGain();
  dry = audio.createGain();
  wet = audio.createGain();
  const convolver = audio.createConvolver();
  convolver.buffer = impulse();
  master.connect(dry);
  master.connect(convolver);
  convolver.connect(wet);
  dry.connect(audio.destination);
  wet.connect(audio.destination);
  applyAir();
}

function boxStrike(freq, t, dur, cutoff, level) {
  const bright = Math.max(0.16, Math.min(1, (cutoff - 400) / 4800));
  const ring = Math.min(2.1, Math.max(0.9, dur * 1.8));
  const gain = audio.createGain();
  gain.gain.value = level;
  gain.connect(master);
  function partial(ratio, amp, decay) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    osc.connect(g);
    g.connect(gain);
    const d = Math.max(0.03, decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.start(t);
    osc.stop(t + d + 0.03);
    return osc;
  }
  const parts = [
    partial(1, 1, ring),
    partial(2.86, 0.34 * bright, 0.14 + bright * 0.16),
    partial(5.4, 0.14 * bright, 0.045),
  ];
  return { osc: parts[0], gain: gain, parts: parts };
}

function phraseDur(phrase) {
  const scale = handOrder ? 1 : 1 / tempo();
  const raw = handOrder
    ? phrase.reduce(function (max, note) { return Math.max(max, note.dur); }, 0)
    : phrase.reduce(function (sum, note) { return sum + note.dur; }, 0);
  return Math.max(0.08, raw * scale);
}

function phraseGap(phrase) {
  const scale = handOrder ? 1 : 1 / tempo();
  let gap = phrase[phrase.length - 1].rest * scale;
  if (handOrder && gap === 0) gap = -0.025;
  return gap;
}

function playChord(phrase, t) {
  const low = phrase.length > 1;
  const dur = phraseDur(phrase);
  const groups = {};
  phrase.forEach(function (note) {
    const freq = low ? note.freq / 2 : note.freq;
    if (!groups[freq]) groups[freq] = { cutoff: 0, count: 0 };
    groups[freq].cutoff += note.cutoff;
    groups[freq].count += 1;
  });
  const freqs = Object.keys(groups);
  const level = 0.22 / Math.sqrt(freqs.length);
  const voices = freqs.map(function (freq) {
    const group = groups[freq];
    return boxStrike(Number(freq), t, dur, group.cutoff / group.count, level);
  });
  return { dur: dur, voices: voices };
}

function phraseLabel(phrase) {
  const names = [];
  phrase.forEach(function (note) {
    if (names.indexOf(note.name) < 0) names.push(note.name);
  });
  names.sort(function (a, b) { return midiOf(a) - midiOf(b); });
  return names;
}

function pitchY(name) {
  const t = pitchUnit(name);
  return score.height - 18 - t * (score.height - 36);
}

function drawScore() {
  sctx.clearRect(0, 0, score.width, score.height);
  sctx.strokeStyle = "rgba(231,215,188,0.28)";
  sctx.fillStyle = "rgba(231,215,188,0.75)";
  sctx.font = "12px Songti SC, serif";
  sctx.lineWidth = 1;
  for (let oct = 3; oct <= 7; oct++) {
    const y = pitchY("C" + oct);
    sctx.beginPath();
    sctx.moveTo(36, y);
    sctx.lineTo(score.width - 8, y);
    sctx.stroke();
    sctx.fillText("C" + oct, 6, y + 4);
  }
  dots.forEach(function (dot) {
    sctx.fillStyle = dot.low ? "rgba(255,246,220,0.95)" : "rgba(231,215,188,0.8)";
    sctx.beginPath();
    sctx.arc(dot.x, dot.y, dot.low ? 4.5 : 3.2, 0, Math.PI * 2);
    sctx.fill();
  });
}

function addScore(names, low) {
  const x = 48 + scoreCount * ((score.width - 64) / phrases.length);
  names.forEach(function (name) {
    dots.push({ x: x, y: pitchY(name), low: low });
  });
  scoreCount += 1;
  drawScore();
}

function clearTrail() {
  trail.width = piece.width;
  trail.height = piece.height;
  tctx.fillStyle = "#070707";
  tctx.fillRect(0, 0, trail.width, trail.height);
}

function emitTip(note, u) {
  const pts = note.points;
  if (!pts.length) return;
  const i = Math.min(pts.length - 1, Math.max(0, Math.floor(u * pts.length)));
  const from = Math.max(0, i - 1);
  for (let k = from; k <= i; k++) {
    const p = pts[k];
    tctx.fillStyle = "rgba(255,255,255,0.9)";
    tctx.beginPath();
    tctx.arc(p[0], p[1], Math.max(1.1, p[2] * 0.55), 0, Math.PI * 2);
    tctx.fill();
    for (let n = 0; n < 7; n++) {
      tctx.fillStyle = "rgba(255,255,255," + (0.15 + Math.random() * 0.5) + ")";
      tctx.beginPath();
      tctx.arc(
        p[0] + (Math.random() - 0.5) * p[2] * 2.2,
        p[1] + (Math.random() - 0.5) * p[2] * 2.2,
        Math.max(0.6, p[2] * 0.28),
        0,
        Math.PI * 2
      );
      tctx.fill();
    }
  }
}

const CUBE = 0.9;

const FACE_GEOM = [
  { u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1] },
  { u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 0] },
  { u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 0] },
  { u: [-1, 0, 0], v: [0, 1, 0], o: [0, 0, -1] },
  { u: [0, 0, 1], v: [0, 1, 0], o: [-1, 0, 0] },
  { u: [1, 0, 0], v: [0, 0, 1], o: [0, -1, 0] },
];

const SEAMS = [
  [[1, -1, 1], [1, 1, 1]],
  [[1, 1, 1], [1, 1, -1]],
  [[1, 1, -1], [-1, 1, -1]],
  [[-1, -1, -1], [-1, 1, -1]],
  [[-1, -1, 1], [-1, -1, -1]],
];

function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm3(a) {
  const L = len3(a) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}
function lerp3(a, b, t) { return add3(a, mul3(sub3(b, a), t)); }
function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

function reliefOf(name) {
  return 0.012 + pitchUnit(name) * 0.048;
}

function onFace(faceIndex, u, v) {
  const f = FACE_GEOM[faceIndex];
  return mul3(add3(f.o, add3(mul3(f.u, u), mul3(f.v, v))), CUBE);
}

function faceNormal(faceIndex) {
  return FACE_GEOM[faceIndex].o.slice();
}

function columnsInOrder() {
  const seen = {};
  const ids = [];
  (piece.notes || []).forEach(function (note) {
    const id = note.column || 1;
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  });
  ids.sort(function (a, b) { return a - b; });
  return ids;
}

function notesOf(col) {
  const list = [];
  piece.notes.forEach(function (note, index) {
    if ((note.column || 1) === col) list.push({ note: note, index: index });
  });
  return list;
}

function assignFaces(ids) {
  const faces = [[], [], [], [], [], []];
  if (!ids.length) return faces;
  const per = Math.ceil(ids.length / 6);
  ids.forEach(function (id, i) {
    faces[Math.min(5, Math.floor(i / per))].push(id);
  });
  return faces;
}

function mapperFor(items, faceIndex) {
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  items.forEach(function (item) {
    item.note.points.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    });
  });
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const sH = 1.7 / bw;
  const sV = 1.7 / bh;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const n = faceNormal(faceIndex);
  const thickScale = Math.min(sH, sV) * CUBE;
  const step = Math.max(sH, sV) * CUBE * 2.2;
  return {
    point: function (px, py, imageR, noteIndex, along, name) {
      const u = (px - cx) * sH;
      const v = -(py - cy) * sV;
      const lift = reliefOf(name);
      return {
        p: add3(onFace(faceIndex, u, v), mul3(n, lift)),
        n: n.slice(),
        r: Math.max(imageR * thickScale * 2.2, step * 0.42, 0.016),
        thick: Math.max(imageR * thickScale * 1.4, 0.012),
        noteIndex: noteIndex,
        along: along,
        bridge: false,
      };
    },
  };
}

// 支架半径。球体直径若按 120 毫米来印，0.02 大约是 3 毫米粗。
function bridgeGirth(prev, next) {
  const r = Math.max(0.02, Math.min(prev.r, next.r) * 0.72);
  const thick = Math.max(0.016, Math.min(prev.thick, next.thick) * 0.72);
  return { r: r, thick: thick };
}

function bridgeBetween(prev, next) {
  const gap = dist3(prev.p, next.p);
  if (gap < 0.01) return [];
  const steps = Math.max(2, Math.min(28, Math.round(gap / 0.018)));
  const girth = bridgeGirth(prev, next);
  const out = [];
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    out.push({
      p: lerp3(prev.p, next.p, t),
      n: norm3(lerp3(prev.n, next.n, t)),
      r: girth.r,
      thick: girth.thick,
      noteIndex: -1,
      along: 0,
      bridge: true,
    });
  }
  return out;
}

function chainColumn(items, map) {
  const out = [];
  items.forEach(function (item) {
    const pts = item.note.points;
    if (!pts.length) return;
    const denom = Math.max(1, pts.length - 1);
    const forward = pts.map(function (p, k) {
      return map.point(p[0], p[1], p[2], item.index, k / denom, item.note.name);
    });
    let chosen = forward;
    if (out.length) {
      const tail = out[out.length - 1].p;
      const dForward = dist3(tail, forward[0].p);
      const dBack = dist3(tail, forward[forward.length - 1].p);
      if (dBack < dForward) chosen = forward.slice().reverse();
      bridgeBetween(out[out.length - 1], chosen[0]).forEach(function (pt) { out.push(pt); });
    }
    chosen.forEach(function (pt) { out.push(pt); });
  });
  return out;
}

function joinEnds(a, b) {
  if (!a.length) return b.slice();
  if (!b.length) return a.slice();
  const endsA = [a[0], a[a.length - 1]];
  const endsB = [b[0], b[b.length - 1]];
  let best = null;
  endsA.forEach(function (pa, ia) {
    endsB.forEach(function (pb, ib) {
      const d = dist3(pa.p, pb.p);
      if (!best || d < best.d) best = { d: d, ia: ia, ib: ib };
    });
  });
  const left = best.ia === 0 ? a.slice().reverse() : a.slice();
  const right = best.ib === 0 ? b.slice() : b.slice().reverse();
  bridgeBetween(left[left.length - 1], right[0]).forEach(function (pt) { left.push(pt); });
  return left.concat(right);
}

function closestOnSeg(p, a, b) {
  const ab = sub3(b, a);
  const denom = dot3(ab, ab) || 1;
  let t = dot3(sub3(p, a), ab) / denom;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return lerp3(a, b, t);
}

function nearestToSeg(chain, a, b) {
  let best = chain[0];
  let bestD = 1e9;
  chain.forEach(function (pt) {
    const d = dist3(pt.p, closestOnSeg(pt.p, a, b));
    if (d < bestD) {
      bestD = d;
      best = pt;
    }
  });
  return best;
}

function seamStrip(fromPt, toPt, seam, nFrom, nTo) {
  const a = mul3(seam[0], CUBE);
  const b = mul3(seam[1], CUBE);
  const e1 = closestOnSeg(fromPt.p, a, b);
  const e2 = closestOnSeg(toPt.p, a, b);
  const knots = [
    fromPt,
    { p: e1, n: nFrom, r: fromPt.r, thick: fromPt.thick },
    { p: e2, n: nTo, r: toPt.r, thick: toPt.thick },
    toPt,
  ];
  const out = [fromPt];
  for (let i = 0; i < knots.length - 1; i++) {
    out.push.apply(out, bridgeBetween(knots[i], knots[i + 1]));
    out.push(knots[i + 1]);
  }
  return out;
}

function chainFace(columns, faceIndex) {
  const items = [];
  columns.forEach(function (col) {
    notesOf(col).forEach(function (item) { items.push(item); });
  });
  if (!items.length) return [];
  const map = mapperFor(items, faceIndex);
  let chain = [];
  columns.forEach(function (col) {
    const part = chainColumn(notesOf(col), map);
    chain = joinEnds(chain, part);
  });
  return chain;
}

function layerMap(items, layerIndex, layerCount, frame) {
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  if (frame) {
    minX = frame.minX;
    minY = frame.minY;
    maxX = frame.maxX;
    maxY = frame.maxY;
  } else {
    items.forEach(function (item) {
      item.note.points.forEach(function (p) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      });
    });
  }
  const bh = Math.max(1, maxY - minY);
  const s = 1.62 / bh;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const lon0 = ((layerIndex + 0.5) / layerCount) * Math.PI * 2;
  const vMax = 0.81;
  const latScale = 1.15 / vMax;
  const radius = 0.78;
  return {
    point: function (px, py, imageR, noteIndex, along, name) {
      const u = (px - cx) * s;
      const v = -(py - cy) * s;
      let lat = v * latScale;
      if (lat > 1.2) lat = 1.2;
      if (lat < -1.2) lat = -1.2;
      const lon = lon0 + u * latScale;
      const cl = Math.cos(lat);
      const sl = Math.sin(lat);
      const n = [cl * Math.sin(lon), sl, cl * Math.cos(lon)];
      return {
        p: mul3(n, radius),
        n: n,
        r: Math.max(imageR * s * 2.1, 0.009),
        thick: Math.max(imageR * s * 1.35, 0.012) + 0.004 + pitchUnit(name) * 0.012,
        noteIndex: noteIndex,
        along: along,
        bridge: false,
      };
    },
  };
}

function bridgeThrough(prev, next) {
  const a = prev.p;
  const b = next.p;
  const mid = lerp3(a, b, 0.5);
  const bow = mul3(mid, 0.18);
  const steps = Math.max(8, Math.min(42, Math.round(dist3(a, b) / 0.015)));
  const out = [];
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push({
      p: [
        u * u * a[0] + 2 * u * t * bow[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * bow[1] + t * t * b[1],
        u * u * a[2] + 2 * u * t * bow[2] + t * t * b[2],
      ],
      n: norm3(lerp3(prev.n, next.n, t)),
      r: bridgeGirth(prev, next).r,
      thick: bridgeGirth(prev, next).thick,
      noteIndex: -1,
      along: 0,
      bridge: true,
    });
  }
  return out;
}

function joinThrough(a, b) {
  if (!a.length) return b.slice();
  if (!b.length) return a.slice();
  const endsA = [a[0], a[a.length - 1]];
  const endsB = [b[0], b[b.length - 1]];
  let best = null;
  endsA.forEach(function (pa, ia) {
    endsB.forEach(function (pb, ib) {
      const d = dist3(pa.p, pb.p);
      if (!best || d < best.d) best = { d: d, ia: ia, ib: ib };
    });
  });
  const left = best.ia === 0 ? a.slice().reverse() : a.slice();
  const right = best.ib === 0 ? b.slice() : b.slice().reverse();
  bridgeThrough(left[left.length - 1], right[0]).forEach(function (pt) { left.push(pt); });
  return left.concat(right);
}

function handLayerMap(items, layerIndex, layerCount) {
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let sy = 0;
  let sn = 0;
  items.forEach(function (item) {
    item.note.points.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
      sy += p[1];
      sn += 1;
    });
  });
  const s = 1.62 / Math.max(1, piece.height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pageY = sn ? sy / sn : cy;
  const lat = (0.5 - pageY / Math.max(1, piece.height)) * 2.1;
  const lon = ((layerIndex + 0.5) / layerCount) * Math.PI * 2;
  const radius = 0.72;
  const radial = Math.cos(lat) * radius;
  const y0 = Math.sin(lat) * radius;
  const pageN = norm3([Math.cos(lon), 0, -Math.sin(lon)]);
  return {
    point: function (px, py, imageR, noteIndex, along, name) {
      const u = (px - cx) * s;
      const v = -(py - cy) * s;
      const lift = (pitchUnit(name) - 0.5) * 0.03;
      return {
        p: [
          radial * Math.sin(lon) + pageN[0] * (u + lift),
          y0 + v,
          radial * Math.cos(lon) + pageN[2] * (u + lift),
        ],
        n: pageN.slice(),
        r: Math.max(imageR * s * 2.1, 0.008),
        thick: Math.max(imageR * s * 1.35, 0.01),
        noteIndex: noteIndex,
        along: along,
        bridge: false,
      };
    },
  };
}

function slicesInHandOrder() {
  const notes = piece.notes;
  const slices = Math.min(12, Math.max(1, notes.length));
  const groups = [];
  for (let s = 0; s < slices; s++) {
    const start = Math.floor(s * notes.length / slices);
    const end = Math.floor((s + 1) * notes.length / slices);
    const items = [];
    for (let i = start; i < end; i++) items.push({ note: notes[i], index: i });
    if (items.length) groups.push(items);
  }
  return groups;
}

function buildCubeStrips() {
  const chains = [];
  if (handOrder) {
    const groups = slicesInHandOrder();
    groups.forEach(function (items, index) {
      chains.push(chainColumn(items, handLayerMap(items, index, groups.length)));
    });
  } else {
    const cols = columnsInOrder();
    cols.forEach(function (col, index) {
      const items = notesOf(col);
      if (!items.length) return;
      chains.push(chainColumn(items, layerMap(items, index, cols.length)));
    });
  }
  let grown = [];
  chains.forEach(function (chain) {
    grown = joinThrough(grown, chain);
  });
  if (grown.length) {
    const c = [0, 0, 0];
    grown.forEach(function (pt) {
      c[0] += pt.p[0];
      c[1] += pt.p[1];
      c[2] += pt.p[2];
    });
    c[0] /= grown.length;
    c[1] /= grown.length;
    c[2] /= grown.length;
    grown.forEach(function (pt) { pt.p = sub3(pt.p, c); });
  }
  return grown.length ? [grown] : [];
}

function indexStrokes(strips) {
  const map = {};
  strips.forEach(function (chain) {
    chain.forEach(function (pt) {
      if (pt.noteIndex < 0 || pt.bridge) return;
      (map[pt.noteIndex] = map[pt.noteIndex] || []).push(pt);
    });
  });
  Object.keys(map).forEach(function (key) {
    map[key].sort(function (a, b) { return a.along - b.along; });
  });
  return map;
}

function buildBodies() {
  meshView = "";
  cubeStrips = buildCubeStrips();
  strokePts = indexStrokes(cubeStrips);
  // Keep the grains fixed to their ribbon as the camera turns.
  let seed = 1729;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  starRibbons = cubeStrips.map(chain => {
    const rings = tubeRings(chain);
    const grains = [];
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1], b = rings[i];
      const count = a.bridge || b.bridge ? 4 : 18;
      for (let j = 0; j < count; j++) {
        const t = random(), u = random();
        const point = lerp3(lerp3(a.L, a.R, u), lerp3(b.L, b.R, u), t);
        // Displace each grain from its own stroke in a spherical direction.
        const azimuth = random() * Math.PI * 2;
        const height = random() * 2 - 1;
        const radial = Math.sqrt(1 - height * height);
        const distance = 0.012 + random() ** 3 * 0.54;
        grains.push({ point, note: a.noteIndex, size: 0.32 + random() ** 4 * 1.42,
          dx: radial * Math.cos(azimuth) * distance, dy: height * distance,
          dz: radial * Math.sin(azimuth) * distance, phase: azimuth });
      }
    }
    return { rings, grains };
  });
  return cubeStrips;
}

function project(x, y, z) {
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  const f = 3.4 / (3.4 + z2);
  return { x: x1 * f, y: y1 * f, z: z2, s: f };
}

function sizeSolidCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(2, Math.round(rect.width * dpr));
  canvas.height = Math.max(2, Math.round(rect.height * dpr));
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
}

function screenOfModel(p) {
  const q = project(p[0], p[1], p[2]);
  const fit = Math.min(canvas.width, canvas.height) * 0.5 * solidZoom;
  return {
    x: canvas.width * 0.5 + q.x * fit,
    y: canvas.height * 0.5 - q.y * fit,
    z: q.z,
    s: q.s,
  };
}

function tubeRings(chain) {
  let prevSide = null;
  return chain.map(function (pt, i) {
    const a = chain[Math.max(0, i - 1)].p;
    const b = chain[Math.min(chain.length - 1, i + 1)].p;
    let tangent = norm3(sub3(b, a));
    if (len3(sub3(b, a)) < 1e-6) tangent = [1, 0, 0];
    let side = cross3(pt.n, tangent);
    if (len3(side) < 1e-4) side = cross3([0, 1, 0], tangent);
    side = norm3(side);
    if (prevSide && dot3(side, prevSide) < 0) side = mul3(side, -1);
    prevSide = side;
    const left = add3(pt.p, mul3(side, -pt.r));
    const right = add3(pt.p, mul3(side, pt.r));
    const up = mul3(pt.n, pt.thick);
    return {
      L: left,
      R: right,
      TL: add3(left, up),
      TR: add3(right, up),
      noteIndex: pt.noteIndex,
      along: pt.along,
      bridge: pt.bridge,
    };
  });
}

function seatMap() {
  if (noteSeat) return noteSeat;
  noteSeat = {};
  phrases.forEach(function (phrase, phraseIndex) {
    phrase.forEach(function (note) {
      noteSeat[piece.notes.indexOf(note)] = { phraseIndex: phraseIndex, name: note.name };
    });
  });
  return noteSeat;
}

function staffAnchor(phraseIndex, name) {
  const t = pitchUnit(name);
  const span = Math.max(1, phrases.length - 1);
  return {
    x: canvas.width * 0.16 + (phraseIndex / span) * canvas.width * 0.7,
    y: canvas.height * 0.78 - t * canvas.height * 0.56,
  };
}

function drawStaffStage(alpha) {
  ctx2d.save();
  ctx2d.globalAlpha = alpha;
  ctx2d.strokeStyle = "rgba(244,240,232,0.45)";
  ctx2d.fillStyle = "rgba(244,240,232,0.9)";
  ctx2d.font = "15px Songti SC, serif";
  ctx2d.lineWidth = 1;
  for (let oct = 3; oct <= 7; oct++) {
    const a = staffAnchor(0, "C" + oct);
    const b = staffAnchor(Math.max(0, phrases.length - 1), "C" + oct);
    ctx2d.beginPath();
    ctx2d.moveTo(a.x - 28, a.y);
    ctx2d.lineTo(b.x + 16, b.y);
    ctx2d.stroke();
    ctx2d.fillText("C" + oct, a.x - 52, a.y + 5);
  }
  phrases.forEach(function (phrase, index) {
    phraseLabel(phrase).forEach(function (name) {
      const p = staffAnchor(index, name);
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, phrase.length > 1 ? 5 : 3.4, 0, Math.PI * 2);
      ctx2d.fill();
    });
  });
  ctx2d.restore();
}

const GLASS_EDGES = [
  [[-1, -1, -1], [1, -1, -1]], [[1, -1, -1], [1, 1, -1]], [[1, 1, -1], [-1, 1, -1]], [[-1, 1, -1], [-1, -1, -1]],
  [[-1, -1, 1], [1, -1, 1]], [[1, -1, 1], [1, 1, 1]], [[1, 1, 1], [-1, 1, 1]], [[-1, 1, 1], [-1, -1, 1]],
  [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1]], [[1, 1, -1], [1, 1, 1]], [[-1, 1, -1], [-1, 1, 1]],
];

function drawGlass(alpha) {
  ctx2d.save();
  ctx2d.globalAlpha = alpha == null ? 1 : alpha;
  ctx2d.strokeStyle = "rgba(244,240,232,0.72)";
  ctx2d.lineWidth = 1.15;
  GLASS_EDGES.forEach(function (pair) {
    const a = screenOfModel(mul3(pair[0], CUBE));
    const b = screenOfModel(mul3(pair[1], CUBE));
    ctx2d.beginPath();
    ctx2d.moveTo(a.x, a.y);
    ctx2d.lineTo(b.x, b.y);
    ctx2d.stroke();
  });
  ctx2d.restore();
}

function drawMorph(t) {
  ctx2d.fillStyle = "#070707";
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const seats = seatMap();
  drawStaffStage(1 - t);
  const tris = [];
  cubeStrips.forEach(function (chain) {
    if (chain.length < 2) return;
    const rings = tubeRings(chain);
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i];
      const B = rings[i + 1];
      const bridge = A.bridge || B.bridge;
      const seat = seats[A.noteIndex] || seats[B.noteIndex];
      const anchor = seat ? staffAnchor(seat.phraseIndex, seat.name) : { x: canvas.width * 0.5, y: canvas.height * 0.5 };
      const local = bridge ? Math.max(0, (t - 0.42) / 0.58) : t;
      function moved(p) {
        const s = screenOfModel(p);
        return {
          x: anchor.x + (s.x - anchor.x) * local,
          y: anchor.y + (s.y - anchor.y) * local,
          z: s.z,
        };
      }
      function push(a, b, c) {
        const pa = moved(a);
        const pb = moved(b);
        const pc = moved(c);
        tris.push({ z: (pa.z + pb.z + pc.z) / 3, bridge: bridge, pts: [pa, pb, pc] });
      }
      push(A.L, B.L, B.R);
      push(A.L, B.R, A.R);
      push(A.TL, A.TR, B.TR);
      push(A.TL, B.TR, B.TL);
    }
  });
  tris.sort(function (a, b) { return b.z - a.z; });
  tris.forEach(function (tri) {
    ctx2d.fillStyle = tri.bridge ? "rgba(210,202,186," + (0.35 * t) + ")" : "rgba(244,240,232," + (0.2 + 0.75 * t) + ")";
    ctx2d.beginPath();
    ctx2d.moveTo(tri.pts[0].x, tri.pts[0].y);
    ctx2d.lineTo(tri.pts[1].x, tri.pts[1].y);
    ctx2d.lineTo(tri.pts[2].x, tri.pts[2].y);
    ctx2d.closePath();
    ctx2d.fill();
  });
}

function faceShade(normal) {
  const light = norm3([0.35, 0.82, 0.4]);
  const d = Math.max(0, dot3(normal, light));
  const g = Math.round(16 + d * 36);
  return "rgb(" + g + "," + (g + 1) + "," + (g + 3) + ")";
}

function headAt(noteIndex, u) {
  const pts = strokePts[noteIndex];
  if (!pts || !pts.length) return null;
  let prev = pts[0];
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].along + 1e-6 >= u) {
      const span = pts[i].along - prev.along;
      const t = span > 1e-4 ? (u - prev.along) / span : 0;
      return lerp3(prev.p, pts[i].p, Math.min(1, Math.max(0, t)));
    }
    prev = pts[i];
  }
  return pts[pts.length - 1].p;
}

// Composite the opaque mesh as a single layer so overlapping faces fade together.
let meshView = "";
function paintMaterial(opacity) {
  const view = [rotX, rotY, solidZoom, canvas.width, canvas.height].join("/");
  if (meshView !== view) {
    renderMaterial();
    meshView = view;
  }
  ctx2d.globalAlpha = opacity;
  ctx2d.drawImage(meshLayer, 0, 0);
}

function renderMaterial() {
  if (meshLayer.width !== canvas.width) meshLayer.width = canvas.width;
  if (meshLayer.height !== canvas.height) meshLayer.height = canvas.height;
  meshContext.clearRect(0, 0, canvas.width, canvas.height);
  const faces = [];
  for (const { rings } of starRibbons) {
    let prev;
    for (const ring of rings) {
      const row = [ring.L, ring.R, ring.TR, ring.TL].map(screenOfModel);
      if (prev) {
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          const points = [prev[i], prev[j], row[j], row[i]];
          const depth = points.reduce((sum, p) => sum + p.z, 0) / 4;
          faces.push({ points, depth, tone: [246, 190, 226, 203][i] });
        }
      }
      prev = row;
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const { points, tone } of faces) {
    meshContext.fillStyle = 'rgb(' + tone + ',' + tone + ',' + tone + ')';
    meshContext.beginPath();
    for (const p of points) meshContext.lineTo(p.x, p.y);
    meshContext.closePath();
    meshContext.fill();
  }
}

function drawSolid(now) {
  ctx2d.fillStyle = "#070707";
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const byNote = {};
  for (let i = 0; i < playing.length; i++) {
    const note = playing[i];
    if (note.noteIndex != null) byNote[note.noteIndex] = note;
  }
  const clock = performance.now() / 1000;
  const dt = lastOrbitFrame ? Math.min(clock - lastOrbitFrame, 0.12) : 0;
  if (particleMode && clock >= releaseAfter) {
    dispersion = Math.min(1, dispersion + dt / 2.8);
    if (!dragging) rotY += dt * 0.16;
  } else if (!particleMode) {
    dispersion = Math.max(0, dispersion - dt / 1.8);
  }
  lastOrbitFrame = clock;
  const pixelScale = Math.min(canvas.width, canvas.height) / 650 * solidZoom;
  ctx2d.save();
  ctx2d.fillStyle = "#fff";
  function star(point, size, alpha) {
    const q = screenOfModel(point);
    const radius = Math.max(0.45, size * q.s * pixelScale);
    ctx2d.globalAlpha = Math.min(1, alpha);
    ctx2d.beginPath();
    ctx2d.arc(q.x, q.y, radius, 0, Math.PI * 2);
    ctx2d.fill();
    if (size > 1.65) {
      ctx2d.globalAlpha *= 0.3;
      ctx2d.fillRect(q.x - radius * 2.6, q.y - 0.45, radius * 5.2, 0.9);
      ctx2d.fillRect(q.x - 0.45, q.y - radius * 2.6, 0.9, radius * 5.2);
    }
  }
  const spread = dispersion * dispersion * (3 - 2 * dispersion);
  const material = 1 - spread;
  if (material > 0) paintMaterial(material);
  for (const { grains } of starRibbons) {
    if (material === 1) break;
    for (const grain of grains) {
      const note = byNote[grain.note];
      const sounding = phase === "play" && note && now >= note.start && now <= note.start + note.dur;
      const wave = Math.sin(clock * 0.72 + grain.phase);
      const drift = spread * (0.87 + 0.13 * wave);
      const point = [grain.point[0] + drift * (grain.dx + grain.dz * wave * 0.16),
        grain.point[1] + drift * grain.dy, grain.point[2] + drift * grain.dz];
      star(point, grain.size * (sounding ? 1.35 : 1), (sounding ? 1 : 0.74) * spread);
    }
  }
  ctx2d.restore();
  if (now >= 0) {
    Object.keys(byNote).forEach(function (key) {
      const note = byNote[key];
      if (now < note.start || now > note.start + note.dur) return;
      const u = (now - note.start) / Math.max(0.001, note.dur);
      if (phase !== "play" || !strokePts[note.noteIndex]?.length) return;
      const tail = Math.max(0, u - 0.32);
      const tip = Math.min(1, u + 0.055);
      const path = new Path2D();
      const first = screenOfModel(headAt(note.noteIndex, tail));
      path.moveTo(first.x, first.y);
      let last = first;
      for (let i = 1; i <= 12; i++) {
        last = screenOfModel(headAt(note.noteIndex, tail + (tip - tail) * i / 12));
        path.lineTo(last.x, last.y);
      }
      const fade = ctx2d.createLinearGradient(first.x, first.y, last.x, last.y);
      // The paper theme inverts the canvas after compositing.
      const white = lightPaper ? "0,0,0" : "255,255,255";
      fade.addColorStop(0, "rgba(" + white + ",0)");
      fade.addColorStop(0.68, "rgba(" + white + ",0.9)");
      fade.addColorStop(1, "rgb(" + white + ")");
      ctx2d.save();
      ctx2d.lineJoin = "round";
      ctx2d.lineCap = "butt";
      if (lightPaper) {
        // A soft local shadow separates the white light from pale paper.
        ctx2d.strokeStyle = "rgba(140,140,140,.45)";
        ctx2d.lineWidth = Math.max(5, 17 * pixelScale);
        ctx2d.filter = "blur(" + Math.max(2, 5 * pixelScale) + "px)";
        ctx2d.stroke(path);
        ctx2d.filter = "none";
      }
      ctx2d.strokeStyle = fade;
      ctx2d.shadowColor = "rgb(" + white + ")";
      ctx2d.shadowBlur = 22 * pixelScale;
      ctx2d.lineWidth = Math.max(3, 12 * pixelScale);
      ctx2d.globalAlpha = 0.45;
      ctx2d.stroke(path);
      ctx2d.globalAlpha = 1;
      ctx2d.shadowBlur = 8 * pixelScale;
      ctx2d.lineWidth = Math.max(1.5, 3 * pixelScale);
      ctx2d.stroke(path);
      ctx2d.restore();
    });
  }
}

let exporting = false;

function exportObj() {
  if (exporting) return;
  if (!cubeStrips.length) buildBodies();
  const chains = [];
  cubeStrips.forEach(function (chain) {
    const samples = [];
    chain.forEach(function (pt) {
      const radius = Math.max(0.02, pt.r, pt.thick * 0.5);
      samples.push([
        Math.round(pt.p[0] * 10000) / 10000,
        Math.round(pt.p[1] * 10000) / 10000,
        Math.round(pt.p[2] * 10000) / 10000,
        Math.round(radius * 10000) / 10000,
      ]);
    });
    if (samples.length) chains.push(samples);
  });
  if (!chains.length) {
    nowEl.textContent = "No form to export";
    return;
  }
  exporting = true;
  nowEl.textContent = "Sealing the 3D mesh";
  whyEl.textContent = "Joining intersections and checking for open edges.";
  const meshRequest = typeof window.requestPrintableMesh === "function"
    ? window.requestPrintableMesh({chains: chains})
    : fetch("/solidify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chains: chains }),
  });
  meshRequest.then(function (res) {
    if (!res.ok) {
      return res.json().then(function (data) {
        nowEl.textContent = "Could not create a printable mesh";
        whyEl.textContent = (data && data.error) ? data.error : "Mesh export failed";
      });
    }
    return res.blob().then(function (blob) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "Ink-Sound-Form.obj";
      link.click();
      const thin = res.headers.get("X-Solid-Thin-Mm");
      nowEl.textContent = "Mesh downloaded";
      whyEl.textContent = "Watertight mesh in millimetres. Longest side: 120 mm. Minimum rod width: "
        + (thin ? Number(thin).toFixed(1) : "3")
        + " mm. Preview ribbons export as round rods.";
    });
  }).catch(function () {
    nowEl.textContent = "Mesh export unavailable";
    whyEl.textContent = "The mesh could not be completed. Try a shorter connected reading and export again.";
  }).then(function () {
    exporting = false;
  });
}

function meshBundle() {
  if (!cubeStrips.length) buildBodies();
  const lines = ["# one object per note, bridges separate"];
  const buckets = {};
  let count = 0;
  function bucket(name) {
    if (!buckets[name]) buckets[name] = { faces: [], sum: [0, 0, 0], n: 0 };
    return buckets[name];
  }
  function put(name, p, index) {
    const item = bucket(name);
    item.sum[0] += p[0];
    item.sum[1] += p[1];
    item.sum[2] += p[2];
    item.n += 1;
    item.seen = item.seen || {};
    if (!item.seen[index]) {
      item.seen[index] = true;
    }
  }
  cubeStrips.forEach(function (chain) {
    if (chain.length < 2) return;
    const rings = tubeRings(chain);
    const bases = [];
    rings.forEach(function (ring) {
      bases.push(count);
      [ring.L, ring.R, ring.TR, ring.TL].forEach(function (p) {
        lines.push("v " + p[0].toFixed(5) + " " + p[1].toFixed(5) + " " + p[2].toFixed(5));
        count += 1;
      });
    });
    for (let i = 0; i < rings.length - 1; i++) {
      const aRing = rings[i];
      const bRing = rings[i + 1];
      const same = aRing.noteIndex >= 0 && aRing.noteIndex === bRing.noteIndex && !aRing.bridge && !bRing.bridge;
      const name = same ? "note_" + aRing.noteIndex : "bridge";
      const item = bucket(name);
      const a = bases[i];
      const b = bases[i + 1];
      [ringVerts(aRing), ringVerts(bRing)].forEach(function (pts, which) {
        const base = which === 0 ? a : b;
        pts.forEach(function (p, k) { put(name, p, base + k); });
      });
      function face(a1, b1, c1, d1) {
        item.faces.push([a1 + 1, b1 + 1, c1 + 1]);
        item.faces.push([a1 + 1, c1 + 1, d1 + 1]);
      }
      face(a, a + 1, b + 1, b);
      face(a, a + 3, b + 3, b);
      face(a + 1, a + 2, b + 2, b + 1);
      face(a + 3, a + 2, b + 2, b + 3);
    }
  });
  const centroids = {};
  Object.keys(buckets).forEach(function (name) {
    const item = buckets[name];
    lines.push("o " + name);
    item.faces.forEach(function (f) {
      lines.push("f " + f[0] + " " + f[1] + " " + f[2]);
    });
    if (item.n) {
      centroids[name] = [
        Math.round(item.sum[0] / item.n * 10000) / 10000,
        Math.round(item.sum[1] / item.n * 10000) / 10000,
        Math.round(item.sum[2] / item.n * 10000) / 10000,
      ];
    }
  });
  return { obj: lines.join("\n"), centroids: centroids };
}

function ringVerts(ring) {
  return [ring.L, ring.R, ring.TR, ring.TL];
}

function timedScore(centroids) {
  const notes = [];
  let t = 0;
  const lead = 0.08;
  phrases.forEach(function (phrase) {
    const dur = phraseDur(phrase);
    const low = phrase.length > 1;
    const names = phraseLabel(phrase);
    phrase.forEach(function (note) {
      const index = piece.notes.indexOf(note);
      const object = index < 0 ? "bridge" : "note_" + index;
      const place = centroids[object] || [0, 0, 0];
      notes.push({
        index: index,
        name: note.name,
        chord: names.join(" "),
        low: low,
        freq: low ? note.freq / 2 : note.freq,
        start: Math.round((t + lead) * 1000) / 1000,
        dur: Math.round(dur * 1000) / 1000,
        object: object,
        x: place[0],
        y: place[1],
        z: place[2],
      });
    });
    t += dur + phraseGap(phrase);
  });
  return {
    label: saved ? saved.label : "Score reading",
    lead: lead,
    seconds: Math.round((t + lead) * 1000) / 1000,
    notes: notes,
  };
}

function ensureSolidLoop() {
  if (solidLoopOn) return;
  solidLoopOn = true;
  function tick() {
    if (!solid) {
      solidLoopOn = false;
      return;
    }
    if (!raf && phase !== "morph" && phase !== "read") drawSolid(shownNow);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function fitCanvases() {
  score.width = piece.width;
  if (solid) {
    sizeSolidCanvas();
    return;
  }
  canvas.width = piece.width;
  canvas.height = piece.height;
  canvas.style.width = "";
  canvas.style.height = "";
  clearTrail();
}

function adopt(score) {
  phase = "idle";
  noteSeat = null;
  stop();
  handOrder = false;
  handOn = false;
  tracing = false;
  handVisits = [];
  handVisit = null;
  pointerVisits = [];
  saved = null;
  if (handBtn) handBtn.classList.remove("on");
  document.body.classList.remove("hand");
  setSolid(false);
  piece = score;
  canonNotes = score.notes;
  phrases = buildPhrases();
  bodies = buildBodies();

  fitCanvases();
  dots.length = 0;
  scoreCount = 0;
  Object.keys(scored).forEach(function (key) { delete scored[key]; });
  drawScore();
  nowEl.textContent = "Detected " + score.notes.length + " strokes";
  whyEl.textContent = phrases.length + " phrases";
}

function paint(note, alpha) {
  ctx2d.fillStyle = "rgba(255,246,220," + alpha + ")";
  for (let i = 0; i < note.points.length; i++) {
    const p = note.points[i];
    ctx2d.beginPath();
    ctx2d.arc(p[0], p[1], Math.max(6, p[2] * 3.4), 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function updateCaption(now) {
  let active = -1;
  for (let i = 0; i < playing.length; i++) {
    const note = playing[i];
    if (now < note.start) continue;
    if (now < note.start + note.dur) active = i;
  }
  if (active < 0) return -1;
  const note = playing[active];
  nowEl.textContent = note.name + "    " + (note.index + 1) + " / " + phrases.length;
  whyEl.textContent = note.words.replace(/[长短粗细浓淡快慢疏密中]/g, word => ({
    长: "long", 短: "short", 粗: "thick", 细: "thin", 浓: "dark", 淡: "pale",
    快: "fast", 慢: "slow", 疏: "sparse", 密: "dense", 中: "medium"
  })[word]);
  if (!scored[note.phrase]) {
    scored[note.phrase] = true;
    addScore(note.names, note.low);
  }
  return active;
}

function draw(now) {
  const active = updateCaption(now);
  if (solid) {
    shownNow = now;
    drawSolid(now);
    return;
  }
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (active < 0) return;
  const phrase = playing[active].phrase;
  let sx = 0;
  let count = 0;
  for (let i = 0; i < playing.length; i++) {
    const note = playing[i];
    if (note.phrase !== phrase || now < note.start) continue;
    if (ribbon) emitTip(note, (now - note.start) / note.dur);
    else paint(note, 0.9);
    for (let k = 0; k < note.points.length; k++) {
      sx += note.points[k][0];
      count += 1;
    }
  }
  if (count) {
    const x = sx / count;
    ctx2d.strokeStyle = "rgba(255,246,220,0.7)";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(x, 0);
    ctx2d.lineTo(x, canvas.height);
    ctx2d.stroke();
  }
}

function finishRecorder() {
  if (recorder && recorder.state === "recording") recorder.stop();
  recorder = null;
  if (recordFrame) cancelAnimationFrame(recordFrame);
  recordFrame = 0;
  recordBtn.textContent = "Export audio";
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  finishRecorder();
  pointerVoices.forEach(function (item) {
    (item.parts || [item.osc]).forEach(function (osc) {
      try { osc.stop(); } catch (e) { /* already ended */ }
    });
  });
  pointerVoices = [];
  if (audio) audio.close();
  audio = null;
  master = null;
  dry = null;
  wet = null;
  playing = [];
}

function paintRecord() {
  if (!recordCanvas) return;
  const ctx = recordCanvas.getContext("2d");
  ctx.fillStyle = "#070707";
  ctx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);
  if (solid) {
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(score, 0, canvas.height + 8);
  } else {
    ctx.drawImage(photo, 0, 0, piece.width, piece.height);
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(score, 0, piece.height + 8);
  }
  if (recorder && recorder.state === "recording") {
    recordFrame = requestAnimationFrame(paintRecord);
  }
}

function attachRecorder() {
  recordArmed = false;
  recordCanvas = document.createElement("canvas");
  recordCanvas.width = solid ? canvas.width : piece.width;
  recordCanvas.height = (solid ? canvas.height : piece.height) + 140;
  const dest = audio.createMediaStreamDestination();
  master.connect(dest);
  const stream = recordCanvas.captureStream(30);
  dest.stream.getAudioTracks().forEach(function (track) { stream.addTrack(track); });
  recordChunks = [];
  const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  recorder = new MediaRecorder(stream, { mimeType: type });
  recorder.ondataavailable = function (event) {
    if (event.data.size) recordChunks.push(event.data);
  };
  recorder.onstop = function () {
    const blob = new Blob(recordChunks, { type: "video/webm" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Ink-Sound-Form.webm";
    link.click();
  };
  recorder.start();
  recordBtn.textContent = "Recording";
  paintRecord();
}

function drawFlatPhrase(phrase) {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (!phrase) return;
  phrase.forEach(function (note) { paint(note, 0.9); });
  let sx = 0;
  let count = 0;
  phrase.forEach(function (note) {
    note.points.forEach(function (point) {
      sx += point[0];
      count += 1;
    });
  });
  if (!count) return;
  const x = sx / count;
  ctx2d.strokeStyle = "rgba(255,246,220,0.7)";
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  ctx2d.moveTo(x, 0);
  ctx2d.lineTo(x, canvas.height);
  ctx2d.stroke();
}

function remember(label) {
  saved = {
    label: label,
    handOrder: handOrder,
    notes: piece.notes.slice(),
    phrases: phrases.map(function (phrase) { return phrase.slice(); }),
  };
}

function recall() {
  if (!saved) return false;
  handOrder = saved.handOrder;
  piece.notes = saved.notes.slice();
  phrases = saved.phrases.map(function (phrase) { return phrase.slice(); });
  noteSeat = null;
  bodies = buildBodies();
  return true;
}

function paintKept() {
  if (solid) return;
  canvas.width = piece.width;
  canvas.height = piece.height;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  piece.notes.forEach(function (note) { paint(note, 0.55); });
}

function finishCanonRead(count) {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  phase = "idle";
  const n = Math.max(0, Math.min(count, phrases.length));
  if (!n) {
    nowEl.textContent = "No strokes read yet";
    whyEl.textContent = saved ? "Your previous reading is saved." : "";
    return;
  }
  const shown = phrases.slice(0, n);
  const notes = [];
  shown.forEach(function (phrase) {
    phrase.forEach(function (note) { notes.push(note); });
  });
  handOrder = false;
  piece.notes = notes;
  phrases = shown;
  noteSeat = null;
  bodies = buildBodies();
  remember("Score reading");
  nowEl.textContent = "Score reading · " + notes.length + " strokes";
  whyEl.textContent = "Build a 3D form or play this reading.";
  paintKept();
}

function beginRead() {
  useCanon();
  phase = "read";
  readShown = 0;
  noteSeat = null;
  pointerOn = false;
  pointerBtn.classList.remove("on");
  pointerVisits = [];
  handOn = false;
  tracing = false;
  handVisits = [];
  handVisit = null;
  stopHandVoices();
  if (handBtn) handBtn.classList.remove("on");
  document.body.classList.remove("hand");
  lastPointer = -1;
  ribbon = false;
  if (ribbonBtn) ribbonBtn.classList.remove("on");
  document.body.classList.remove("ribbon");
  stop();
  setSolid(false);
  dots.length = 0;
  scoreCount = 0;
  Object.keys(scored).forEach(function (key) { delete scored[key]; });
  clearTrail();
  drawScore();
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  nowEl.textContent = "Score reading";
  whyEl.textContent = "Reading right to left. Select Stop to keep the current passage.";
  const step = 0.09;
  const t0 = performance.now();
  function frame(now) {
    if (phase !== "read") return;
    const index = Math.min(phrases.length, Math.floor((now - t0) / 1000 / step));
    if (readShown === 0 && phrases.length) {
      addScore(phraseLabel(phrases[0]), phrases[0].length > 1);
      readShown = 1;
    }
    while (readShown < index) {
      const phrase = phrases[readShown];
      addScore(phraseLabel(phrase), phrase.length > 1);
      readShown += 1;
    }
    const current = phrases[Math.min(phrases.length - 1, Math.max(0, index - 1))];
    drawFlatPhrase(current);
    const names = current ? phraseLabel(current) : [];
    nowEl.textContent = names.join(" ") + "    " + Math.min(phrases.length, Math.max(readShown, 1)) + " / " + phrases.length;
    whyEl.textContent = "Score reading";
    if (index < phrases.length) raf = requestAnimationFrame(frame);
    else finishCanonRead(phrases.length);
  }
  raf = requestAnimationFrame(frame);
}

function beginPiece() {
  beginRead();
}

function beginMorph() {
  phase = "morph";
  setSolid(true);
  nowEl.textContent = "Folding the score into a sphere";
  whyEl.textContent = saved ? saved.label : "";
  const t0 = performance.now();
  const dur = 4600;
  function frame(now) {
    if (phase !== "morph") return;
    if (canvas.width < 10) sizeSolidCanvas();
    const t = Math.min(1, (now - t0) / dur);
    const eased = t * t * (3 - 2 * t);
    drawMorph(eased);
    if (t < 1) raf = requestAnimationFrame(frame);
    else {
      phase = "done";
      raf = 0;
      nowEl.textContent = "Form ready";
      whyEl.textContent = (saved ? saved.label + " " : "") + piece.notes.length + " strokes. Select Play audio to listen. Drag to rotate.";
      startParticleRelease();
      drawSolid(1);
    }
  }
  requestAnimationFrame(function () {
    if (phase !== "morph") return;
    sizeSolidCanvas();
    raf = requestAnimationFrame(frame);
  });
}

function beginPerformance() {
  phase = "play";
  nowEl.textContent = "Playing the form";
  whyEl.textContent = "3 / 3";
  play(true);
}

function play(keepScore) {
  const arm = recordArmed;
  pointerOn = false;
  pointerBtn.classList.remove("on");
  lastPointer = -1;
  stop();
  recordArmed = arm;
  if (keepScore) {
    phrases.forEach(function (_, index) { scored[index] = true; });
  } else {
    dots.length = 0;
    scoreCount = 0;
    Object.keys(scored).forEach(function (key) { delete scored[key]; });
    drawScore();
  }
  clearTrail();
  ensureAudio();
  if (recordArmed) attachRecorder();
  const t0 = audio.currentTime + 0.06;
  let t = t0;
  playing = [];
  phrases.forEach(function (phrase, phraseId) {
    const sounded = playChord(phrase, t);
    const names = phraseLabel(phrase);
    const chord = phrase.length > 1;
    phrase.forEach(function (note) {
      playing.push({
        name: chord ? names.join(" ") : names[0],
        pitch: note.name,
        noteIndex: piece.notes.indexOf(note),
        names: names,
        low: chord,
        words: chord ? "Lower octave" : note.words,
        points: note.points,
        start: t - t0,
        dur: sounded.dur,
        phrase: phraseId,
        index: phraseId,
      });
    });
    t += sounded.dur + phraseGap(phrase);
  });
  const total = t - t0;

  function frame() {
    const now = audio.currentTime - t0;
    draw(now);
    if (now < total) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      shownNow = total;
      if (solid) drawSolid(total);
      if (phase === "play") {
        phase = "done";
        nowEl.textContent = "Playback complete";
        whyEl.textContent = solid ? "Drag to rotate or select Replay." : "Select Replay to listen again.";
      } else {
        nowEl.textContent = "";
        whyEl.textContent = "";
      }
      finishRecorder();
    }
  }
  raf = requestAnimationFrame(frame);
}

function useCanon() {
  if (!handOrder && piece.notes === canonNotes) return;
  handOrder = false;
  piece.notes = canonNotes;
  noteSeat = null;
  phrases = buildPhrases();
  bodies = buildBodies();
}

function strokeNear(x, y) {
  let best = -1;
  let dist = 28;
  canonNotes.forEach(function (note, index) {
    note.points.forEach(function (point) {
      const d = Math.hypot(point[0] - x, point[1] - y);
      if (d < dist) {
        dist = d;
        best = index;
      }
    });
  });
  return best;
}

function centroid(note) {
  let x = 0;
  let y = 0;
  note.points.forEach(function (point) {
    x += point[0];
    y += point[1];
  });
  const n = Math.max(1, note.points.length);
  return [x / n, y / n];
}

function drawHandTrace() {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  handVisits.forEach(function (visit, index) {
    paint(visit.note, index === handVisits.length - 1 ? 0.95 : 0.4);
  });
  if (handVisits.length < 2) return;
  ctx2d.strokeStyle = "rgba(255,246,220,0.55)";
  ctx2d.lineWidth = 1.25;
  ctx2d.beginPath();
  handVisits.forEach(function (visit, index) {
    const c = centroid(visit.note);
    if (index === 0) ctx2d.moveTo(c[0], c[1]);
    else ctx2d.lineTo(c[0], c[1]);
  });
  ctx2d.stroke();
}

function stopHandVoices() {
  hushLine(true);
}

function hushLine(kill) {
  if (!lineVoice || !audio) {
    lineVoice = null;
    return;
  }
  const t = audio.currentTime;
  try {
    lineVoice.gain.gain.cancelScheduledValues(t);
    const from = lineVoice.open ? 0.07 : 0.0001;
    lineVoice.gain.gain.setValueAtTime(from, t);
    lineVoice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    if (kill) lineVoice.osc.stop(t + 0.08);
  } catch (e) { /* already stopped */ }
  lineVoice.open = false;
  if (kill) lineVoice = null;
}

function moveLine(note) {
  ensureAudio();
  boxStrike(note.freq, audio.currentTime, 0.85, note.cutoff, 0.2);
}

function beatLength() {
  return 60 / Number(tempoInput.value || 100);
}

function stepLength(seconds) {
  const beat = beatLength();
  const q = seconds / beat;
  if (q < 0.35) return beat * 0.5;
  if (q < 0.75) return beat;
  return beat * 2;
}

function stepRest(seconds) {
  const beat = beatLength();
  const q = seconds / beat;
  if (q < 0.22) return 0;
  if (q < 0.7) return beat * 0.5;
  return beat;
}

function takeHand(event) {
  const pos = imageXY(event);
  const index = strokeNear(pos.x, pos.y);
  if (index < 0) return;
  if (handVisit && handVisit.canonIndex === index) {
    handVisit.t1 = performance.now();
    return;
  }
  const now = performance.now();
  if (handVisit) handVisit.t1 = now;
  const note = canonNotes[index];
  handVisit = { canonIndex: index, note: note, t0: now, t1: now };
  handVisits.push(handVisit);
  moveLine(note);
  drawHandTrace();
  nowEl.textContent = note.name + "    " + handVisits.length;
  whyEl.textContent = "Release to pause. Select Stop to save the strokes.";
}

function sealVisits(visits) {
  return visits.map(function (visit, index) {
    const dwell = Math.max(0.04, (visit.t1 - visit.t0) / 1000);
    let rest = 0;
    if (index + 1 < visits.length) {
      rest = Math.max(0, (visits[index + 1].t0 - visit.t1) / 1000);
    }
    return {
      column: visit.note.column,
      name: visit.note.name,
      freq: visit.note.freq,
      midi: visit.note.midi,
      chord: null,
      dur: Math.round(stepLength(dwell) * 1000) / 1000,
      rest: Math.round(stepRest(rest) * 1000) / 1000,
      cutoff: visit.note.cutoff,
      attack: visit.note.attack,
      words: visit.note.words,
      points: visit.note.points,
    };
  });
}

function pauseHand() {
  tracing = false;
  if (handVisit) handVisit.t1 = performance.now();
  hushLine(false);
  nowEl.textContent = "Read " + handVisits.length + " strokes";
  whyEl.textContent = handVisits.length
    ? "Continue tracing or select Stop to save."
    : "Drag across the ink.";
}

function sealHandRecord() {
  if (handVisit) handVisit.t1 = performance.now();
  tracing = false;
  handOn = false;
  stopHandVoices();
  if (handBtn) handBtn.classList.remove("on");
  document.body.classList.remove("hand");
  const visits = handVisits.slice();
  handVisits = [];
  handVisit = null;
  if (!visits.length) {
    nowEl.textContent = "No strokes touched";
    whyEl.textContent = saved ? "Your previous reading is saved." : "Drag across the ink.";
    return;
  }
  handOrder = true;
  piece.notes = sealVisits(visits);
  noteSeat = null;
  phrases = piece.notes.map(function (note) { return [note]; });
  bodies = buildBodies();
  remember("Trace strokes");
  phase = "idle";
  nowEl.textContent = "Trace reading · " + piece.notes.length + " strokes";
  whyEl.textContent = "Build a 3D form or play this reading.";
  paintKept();
}

function sealPointerRecord() {
  pointerOn = false;
  pointerBtn.classList.remove("on");
  if (pointerVisits.length) pointerVisits[pointerVisits.length - 1].t1 = performance.now();
  const visits = pointerVisits.slice();
  pointerVisits = [];
  lastPointer = -1;
  if (!visits.length) {
    nowEl.textContent = "No strokes selected";
    whyEl.textContent = saved ? "Your previous reading is saved." : "Move the pointer over the ink.";
    return;
  }
  const notes = [];
  const next = visits.map(function (visit, index) {
    const dwell = Math.max(0.04, (visit.t1 - visit.t0) / 1000);
    let rest = 0;
    if (index + 1 < visits.length) rest = Math.max(0, (visits[index + 1].t0 - visit.t1) / 1000);
    const dur = stepLength(dwell);
    const gap = stepRest(rest);
    return visit.phrase.map(function (note) {
      const copy = Object.assign({}, note, { dur: dur, rest: gap, chord: null });
      notes.push(copy);
      return copy;
    });
  });
  handOrder = true;
  piece.notes = notes;
  phrases = next;
  noteSeat = null;
  bodies = buildBodies();
  remember("Pointer reading");
  phase = "idle";
  nowEl.textContent = "Pointer reading · " + notes.length + " strokes";
  whyEl.textContent = "Build a 3D form or play this reading.";
  paintKept();
}

function settleReading() {
  if (phase === "read") finishCanonRead(readShown);
  if (tracing || handVisits.length) sealHandRecord();
  if (pointerOn || pointerVisits.length) sealPointerRecord();
}

function haltRead() {
  if (phase === "play" || phase === "morph") {
    phase = "idle";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stop();
    nowEl.textContent = "Stopped";
    whyEl.textContent = saved ? "Reading saved. Build a form or replay the audio." : "";
    return;
  }
  const had = phase === "read" || tracing || handOn || handVisits.length || pointerOn || pointerVisits.length;
  settleReading();
  handOn = false;
  tracing = false;
  pointerOn = false;
  pointerBtn.classList.remove("on");
  if (handBtn) handBtn.classList.remove("on");
  document.body.classList.remove("hand");
  if (!had) {
    nowEl.textContent = "No active reading";
    whyEl.textContent = saved ? "Your previous reading is saved." : "";
  }
}

function showForm() {
  settleReading();
  if (phase === "play" || phase === "morph") {
    phase = "idle";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stop();
  }
  if (!saved) {
    nowEl.textContent = "No reading yet";
    whyEl.textContent = "Start a score, pointer or trace reading first.";
    return;
  }
  recall();
  beginMorph();
}

function playMusic(keepScore) {
  settleReading();
  if (!saved) {
    nowEl.textContent = "No reading yet";
    whyEl.textContent = "Start a score, pointer or trace reading first.";
    return;
  }
  recall();
  phase = "play";
  if (!solid) setSolid(true);
  play(!!keepScore);
}

function wavBlob(buffer) {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const bytes = frames * channels * 2;
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);
  function write(offset, text) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }
  write(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes, true);
  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

function exportMusic() {
  settleReading();
  if (phase === "morph" || phase === "play") {
    phase = "idle";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stop();
  }
  if (!saved) {
    nowEl.textContent = "No reading yet";
    whyEl.textContent = "Read some strokes before exporting audio.";
    return;
  }
  recall();
  let seconds = 0.2;
  phrases.forEach(function (phrase) {
    seconds += phraseDur(phrase) + phraseGap(phrase);
  });
  seconds += 6.2;
  const rate = 44100;
  const offline = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const prev = { audio: audio, master: master, dry: dry, wet: wet };
  audio = offline;
  master = offline.createGain();
  dry = offline.createGain();
  wet = offline.createGain();
  const convolver = offline.createConvolver();
  convolver.buffer = impulse();
  master.connect(dry);
  master.connect(convolver);
  convolver.connect(wet);
  dry.connect(offline.destination);
  wet.connect(offline.destination);
  applyAir();
  let t = 0.08;
  phrases.forEach(function (phrase) {
    const sounded = playChord(phrase, t);
    t += sounded.dur + phraseGap(phrase);
  });
  nowEl.textContent = "Rendering audio";
  whyEl.textContent = "";
  offline.startRendering().then(function (buffer) {
    audio = prev.audio;
    master = prev.master;
    dry = prev.dry;
    wet = prev.wet;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(wavBlob(buffer));
    link.download = "Ink-Sound-Form.wav";
    link.click();
    nowEl.textContent = "Audio exported";
    whyEl.textContent = "Ink-Sound-Form.wav";
  }).catch(function () {
    audio = prev.audio;
    master = prev.master;
    dry = prev.dry;
    wet = prev.wet;
    nowEl.textContent = "Audio export failed";
    whyEl.textContent = "";
  });
}

function imageXY(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * piece.width,
    y: (event.clientY - rect.top) / rect.height * piece.height,
  };
}

function phraseNear(x, y) {
  let best = -1;
  let dist = 70;
  phrases.forEach(function (phrase, index) {
    phrase.forEach(function (note) {
      note.points.forEach(function (point) {
        const d = Math.hypot(point[0] - x, point[1] - y);
        if (d < dist) {
          dist = d;
          best = index;
        }
      });
    });
  });
  return best;
}

function playPointer(index) {
  if (index === lastPointer) {
    if (index >= 0 && pointerVisits.length) pointerVisits[pointerVisits.length - 1].t1 = performance.now();
    return;
  }
  lastPointer = index;
  if (index < 0) return;
  const now = performance.now();
  const last = pointerVisits[pointerVisits.length - 1];
  if (last) last.t1 = now;
  pointerVisits.push({ index: index, phrase: phrases[index], t0: now, t1: now });
  ensureAudio();
  pointerVoices.forEach(function (item) {
    (item.parts || [item.osc]).forEach(function (osc) {
      try { osc.stop(); } catch (e) { /* ended */ }
    });
  });
  const phrase = phrases[index];
  const sounded = playChord(phrase, audio.currentTime + 0.02);
  pointerVoices = sounded.voices;
  const names = phraseLabel(phrase);
  const chord = phrase.length > 1;
  playing = phrase.map(function (note) {
    return {
      name: chord ? names.join(" ") : names[0],
      pitch: note.name,
      noteIndex: piece.notes.indexOf(note),
      names: names,
      low: chord,
      words: chord ? "Lower octave" : note.words,
      points: note.points,
      start: 0,
      dur: 999,
      phrase: index,
      index: index,
    };
  });
  draw(1);
}

function startParticleRelease() {
  particleMode = true;
  dispersion = 0;
  lastOrbitFrame = 0;
  releaseAfter = performance.now() / 1000 + 0.45;
}

function setSolid(on) {
  if (on && !solid) {
    startParticleRelease();
  }
  solid = on;
  solidBtn.classList.toggle("on", solid);
  document.body.classList.toggle("solid", solid);
  if (solid) {
    ribbon = false;
    if (ribbonBtn) ribbonBtn.classList.remove("on");
    document.body.classList.remove("ribbon");
    pointerOn = false;
    pointerBtn.classList.remove("on");
    requestAnimationFrame(function () {
      sizeSolidCanvas();
      ensureSolidLoop();
      if (!playing.length && phase !== "morph" && phase !== "play") {
        if (handOrder) {
          nowEl.textContent = "Reading folded into a sphere";
          whyEl.textContent = piece.notes.length + " strokes. Replay to hear the rhythm. Drag to rotate.";
        } else {
          nowEl.textContent = "Arranging four octaves";
          whyEl.textContent = "Folding into a sphere. Drag to rotate.";
        }
      }
    });
  } else {
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.width = piece.width;
    canvas.height = piece.height;
    clearTrail();
  }
}

canvas.addEventListener("pointerdown", function (event) {
  if (handOn && !solid) {
    tracing = true;
    handVisit = null;
    try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* already captured */ }
    takeHand(event);
    return;
  }
  if (!solid || event.button !== 0) return;
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* already captured */ }
});
canvas.addEventListener("pointerup", function () {
  if (tracing) pauseHand();
  dragging = false;
});
canvas.addEventListener("pointercancel", function () {
  if (tracing) pauseHand();
  dragging = false;
});
canvas.addEventListener("pointermove", function (event) {
  if (tracing) {
    takeHand(event);
    return;
  }
  if (pointerOn && !solid) {
    const pos = imageXY(event);
    playPointer(phraseNear(pos.x, pos.y));
    return;
  }
  if (!dragging || !solid) return;
  rotY += (event.clientX - lastX) * 0.008;
  rotX += (event.clientY - lastY) * 0.008;
  lastX = event.clientX;
  lastY = event.clientY;
});
canvas.addEventListener("dblclick", function () {
  if (!solid || phase === "morph") return;
  particleMode = !particleMode;
  releaseAfter = 0;
});
canvas.addEventListener("wheel", function (event) {
  if (!solid) return;
  event.preventDefault();
  solidZoom = Math.min(2.6, Math.max(0.45, solidZoom - event.deltaY * 0.001));
}, { passive: false });
window.addEventListener("resize", function () {
  if (solid) sizeSolidCanvas();
});

solidBtn.addEventListener("click", showForm);

if (exportBtn) {
  exportBtn.addEventListener("click", function () {
    settleReading();
    if (!saved) {
      nowEl.textContent = "No reading yet";
      whyEl.textContent = "Read some strokes before exporting a mesh.";
      return;
    }
    recall();
    exportObj();
  });
}

function openScroll() {
  if (!stage.classList.contains("rolled")) return;
  stage.classList.replace("rolled", "unrolling");
}

document.addEventListener("pointermove", openScroll);
document.addEventListener("pointerdown", openScroll);
document.addEventListener("keydown", function (event) {
  if (event.key === "Enter" || event.key === " ") openScroll();
});

let uploadRevision = 0;
let displayedPhotoURL = photo.src;
const readingControls = [playBtn, pointerBtn, handBtn, haltBtn, solidBtn, musicBtn, againBtn, exportBtn, recordBtn];

async function sendImage(blob) {
  if (typeof characterStudy !== "undefined" && characterStudy.mode !== "off") leaveCharacter();
  const revision = ++uploadRevision;
  const url = URL.createObjectURL(blob);
  const incoming = new Image();
  incoming.src = url;
  try {
    await incoming.decode();
    if (revision !== uploadRevision) return;
    stop();
    cancelAnimationFrame(raf);
    phase = "idle";
    handOn = pointerOn = tracing = ribbon = false;
    document.body.classList.remove("hand", "ribbon");
    handBtn.classList.remove("on");
    pointerBtn.classList.remove("on");
    setSolid(false);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    sctx.clearRect(0, 0, score.width, score.height);
    readingControls.forEach(button => button.disabled = true);
    stage.classList.remove("unrolling");
    stage.classList.add("rolled");
    photo.src = url;
    nowEl.textContent = "Recognising strokes";
    whyEl.textContent = "Reading the ink on your scroll.";
    let result;
    if (typeof window.analyzeScrollImage === "function") {
      result = await window.analyzeScrollImage(blob);
    } else {
      const res = await fetch("/recognize", { method: "POST", body: blob });
      if (!res.ok) throw new Error("Recognition failed");
      result = await res.json();
    }
    if (revision !== uploadRevision) return;
    if (!result.notes?.length) throw new Error("No strokes");
    if (displayedPhotoURL.startsWith("blob:")) URL.revokeObjectURL(displayedPhotoURL);
    displayedPhotoURL = url;
    adopt(result);
    readingControls.forEach(button => button.disabled = false);
  } catch {
    if (revision !== uploadRevision) return;
    photo.src = displayedPhotoURL;
    nowEl.textContent = "Could not read the image";
    whyEl.textContent = "Try clear ink on light paper and check the local recognition service.";
    readingControls.forEach(button => button.disabled = false);
  } finally {
    if (url !== displayedPhotoURL) URL.revokeObjectURL(url);
  }
}

uploadBtn.addEventListener("click", function () {
  fileInput.click();
});

fileInput.addEventListener("change", function () {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  sendImage(file);
});

let camStream = null;
let camTimer = 0;

function stopCamera() {
  if (camTimer) clearInterval(camTimer);
  camTimer = 0;
  if (camStream) {
    camStream.getTracks().forEach(function (track) { track.stop(); });
  }
  camStream = null;
  camVideo.srcObject = null;
  if (cameraBox) cameraBox.hidden = true;
}

function captureFrame() {
  const w = camVideo.videoWidth || 1280;
  const h = camVideo.videoHeight || 720;
  const shot = document.createElement("canvas");
  shot.width = w;
  shot.height = h;
  shot.getContext("2d").drawImage(camVideo, 0, 0, w, h);
  stopCamera();
  shot.toBlob(function (blob) {
    if (blob) sendImage(blob);
  }, "image/jpeg", 0.92);
}

if (camCancel) camCancel.addEventListener("click", stopCamera);

if (shootBtn) {
  shootBtn.addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      nowEl.textContent = "Camera unavailable";
      whyEl.textContent = "The browser could not access this camera.";
      return;
    }
    stopCamera();
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } }
    }).then(function (stream) {
      camStream = stream;
      camVideo.srcObject = stream;
      cameraBox.hidden = false;
      countEl.textContent = "3";
      return camVideo.play();
    }).then(function () {
      let left = 3;
      camTimer = setInterval(function () {
        left -= 1;
        if (left > 0) {
          countEl.textContent = String(left);
          return;
        }
        clearInterval(camTimer);
        camTimer = 0;
        countEl.textContent = "";
        captureFrame();
      }, 1000);
    }).catch(function () {
      stopCamera();
      nowEl.textContent = "Camera unavailable";
      whyEl.textContent = "Allow camera access and try again.";
    });
  });
}

playBtn.addEventListener("click", function () {
  beginRead();
});

if (musicBtn) {
  musicBtn.addEventListener("click", function () {
    playMusic(false);
  });
}

againBtn.addEventListener("click", function () {
  playMusic(true);
});

if (handBtn) {
  handBtn.addEventListener("click", function () {
    if (phase === "read") finishCanonRead(readShown);
    if (phase === "morph" || phase === "play") {
      phase = "idle";
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stop();
    }
    pointerOn = false;
    pointerBtn.classList.remove("on");
    if (pointerVisits.length) sealPointerRecord();
    if (solid) setSolid(false);
    handOn = !handOn;
    handBtn.classList.toggle("on", handOn);
    document.body.classList.toggle("hand", handOn);
    if (handOn) {
      handVisits = [];
      handVisit = null;
      nowEl.textContent = "Trace strokes";
      whyEl.textContent = "Drag over existing ink. Release to pause and select Stop to save.";
    } else if (handVisits.length || handVisit) {
      sealHandRecord();
    } else {
      tracing = false;
      stopHandVoices();
      nowEl.textContent = saved ? saved.label + " reading saved" : "";
      whyEl.textContent = saved ? "Build a 3D form or play this reading." : "";
    }
  });
}

if (haltBtn) {
  haltBtn.addEventListener("click", haltRead);
}

pointerBtn.addEventListener("click", function () {
  if (!pointerOn && phase === "read") finishCanonRead(readShown);
  if (!pointerOn && (tracing || handVisits.length)) sealHandRecord();
  pointerOn = !pointerOn;
  pointerBtn.classList.toggle("on", pointerOn);
  if (pointerOn) {
    if (phase === "morph" || phase === "play") {
      phase = "idle";
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stop();
    }
    if (solid) setSolid(false);
    useCanon();
    handOn = false;
    tracing = false;
    handVisits = [];
    handVisit = null;
    stopHandVoices();
    if (handBtn) handBtn.classList.remove("on");
    document.body.classList.remove("hand");
    pointerVisits = [];
    lastPointer = -1;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    nowEl.textContent = "Pointer reading";
    whyEl.textContent = "Move over the ink. Select Stop to save your sequence.";
  } else {
    sealPointerRecord();
  }
});

recordBtn.addEventListener("click", exportMusic);

airInput.addEventListener("input", applyAir);
bodies = buildBodies();
clearTrail();
drawScore();
