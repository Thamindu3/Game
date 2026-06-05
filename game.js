'use strict';

// ══════════════════════════════════════════════════════
//  SURGE: Endless Survivor  —  game.js
// ══════════════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const BASE_W = 480, BASE_H = 780;
let scale = 1;

function resize() {
  scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
  canvas.width  = BASE_W;
  canvas.height = BASE_H;
  canvas.style.width  = BASE_W * scale + 'px';
  canvas.style.height = BASE_H * scale + 'px';
  canvas.style.left   = (window.innerWidth  - BASE_W * scale) / 2 + 'px';
  canvas.style.top    = (window.innerHeight - BASE_H * scale) / 2 + 'px';
}
window.addEventListener('resize', resize);
resize();

// ──────────────────────────────────────────────────────
//  Audio (Web Audio API — no files needed)
// ──────────────────────────────────────────────────────
const Audio = (() => {
  let ctx;
  function get() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, type, dur, vol = 0.12, freqEnd = null) {
    try {
      const ac = get();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + dur);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.start(); osc.stop(ac.currentTime + dur);
    } catch(e) {}
  }
  return {
    shoot:   () => tone(380, 'square',   0.08, 0.06, 220),
    hit:     () => tone(220, 'sawtooth', 0.1,  0.08, 120),
    kill:    () => tone(160, 'sawtooth', 0.18, 0.1,  60),
    xp:      () => tone(700, 'sine',     0.08, 0.05, 900),
    hurt:    () => tone(140, 'square',   0.25, 0.18, 80),
    level: () => {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => tone(f, 'sine', 0.2, 0.14), i * 90);
      });
    },
    death: () => {
      tone(200, 'sawtooth', 0.6, 0.25, 40);
    },
  };
})();

// ──────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────
const WORLD = 2800;

const ENEMY_DEF = {
  basic: { maxHp: 30,  speed: 68,  dmg: 10, xp: 1,  r: 14, col: '#e74c3c', glow: '#ff6b6b', shape: 'circle' },
  fast:  { maxHp: 18,  speed: 145, dmg: 8,  xp: 1,  r: 10, col: '#f39c12', glow: '#ffd93d', shape: 'diamond' },
  tank:  { maxHp: 280, speed: 40,  dmg: 28, xp: 6,  r: 24, col: '#8e44ad', glow: '#a855f7', shape: 'hex' },
  swarm: { maxHp: 10,  speed: 98,  dmg: 5,  xp: 1,  r: 8,  col: '#c0392b', glow: '#e74c3c', shape: 'circle' },
  elite: { maxHp: 700, speed: 55,  dmg: 38, xp: 22, r: 32, col: '#922b21', glow: '#ff0000', shape: 'hex' },
};

const ALL_UPGRADES = [
  { id: 'damage',      name: '⚔️  Power Surge',    desc: '+30% damage output',          rarity: 'common'   },
  { id: 'speed',       name: '💨  Swiftness',       desc: '+20% movement speed',         rarity: 'common'   },
  { id: 'fireRate',    name: '🔥  Rapid Fire',      desc: '+25% attack speed',            rarity: 'common'   },
  { id: 'maxHp',       name: '❤️  Vitality',        desc: '+40 max HP & restore 40 HP',  rarity: 'common'   },
  { id: 'regen',       name: '💚  Regeneration',    desc: '+3 HP regenerated per second', rarity: 'uncommon' },
  { id: 'pickupRange', name: '🧲  Magnet Field',    desc: 'Double XP pickup range',       rarity: 'uncommon' },
  { id: 'multiShot',   name: '💫  Multi-Shot',      desc: '+1 extra bullet per volley',   rarity: 'uncommon' },
  { id: 'orb',         name: '🌀  Orbit Orb',       desc: 'Add a deadly orbiting orb',    rarity: 'rare'     },
  { id: 'pierce',      name: '🗡️  Pierce',          desc: 'Bullets pass through enemies', rarity: 'rare'     },
  { id: 'aura',        name: '☄️  Flame Aura',      desc: 'Burn all nearby enemies',      rarity: 'rare'     },
  { id: 'bulletSize',  name: '🎯  Heavy Rounds',    desc: '+40% bullet size & +10% dmg',  rarity: 'uncommon' },
  { id: 'xpBoost',     name: '⭐  XP Surge',        desc: '+50% XP from every kill',      rarity: 'uncommon' },
];

const RARITY_COLOR = { common: '#aaa', uncommon: '#3498db', rare: '#f1c40f' };

// ──────────────────────────────────────────────────────
//  Utility
// ──────────────────────────────────────────────────────
const lerp   = (a, b, t) => a + (b - a) * t;
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand   = (a, b) => Math.random() * (b - a) + a;
const randI  = (a, b) => Math.floor(rand(a, b + 1));
const dist   = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle  = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const fmt    = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

// ──────────────────────────────────────────────────────
//  Game State
// ──────────────────────────────────────────────────────
let state = 'menu';
let player, enemies, bullets, xpOrbs, particles, orbs;
let camera, shake;
let time, wave, spawnTimer, eliteTimer;
let pendingUpgrades = [];
let highScore = parseInt(localStorage.getItem('surge_hs') || '0');

// ──────────────────────────────────────────────────────
//  Joystick (virtual thumbstick)
// ──────────────────────────────────────────────────────
const joy = {
  on: false, tid: null,
  bx: 0, by: 0, sx: 0, sy: 0,
  dx: 0, dy: 0,
  R: 58,
};

function joyToCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = joyToCanvas(t.clientX, t.clientY);
    if (state === 'playing' && !joy.on) {
      joy.on = true; joy.tid = t.identifier;
      joy.bx = p.x; joy.by = p.y;
      joy.sx = p.x; joy.sy = p.y;
      joy.dx = 0;   joy.dy = 0;
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.tid) continue;
    const p = joyToCanvas(t.clientX, t.clientY);
    const dx = p.x - joy.bx, dy = p.y - joy.by;
    const d = Math.hypot(dx, dy);
    if (d > joy.R) {
      joy.sx = joy.bx + dx / d * joy.R;
      joy.sy = joy.by + dy / d * joy.R;
    } else { joy.sx = p.x; joy.sy = p.y; }
    joy.dx = (joy.sx - joy.bx) / joy.R;
    joy.dy = (joy.sy - joy.by) / joy.R;
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.tid) {
      joy.on = false; joy.tid = null;
      joy.dx = 0; joy.dy = 0;
    }
  }
}, { passive: false });

// ──────────────────────────────────────────────────────
//  Keyboard
// ──────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true;  if (['ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault(); });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

function getInput() {
  let mx = 0, my = 0;
  if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  if (keys['KeyW'] || keys['ArrowUp'])    my -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  my += 1;
  if (joy.on) { mx = joy.dx; my = joy.dy; }
  const len = Math.hypot(mx, my);
  return len > 0 ? { x: mx / len, y: my / len } : { x: 0, y: 0 };
}

// ──────────────────────────────────────────────────────
//  Spawn helpers
// ──────────────────────────────────────────────────────
function spawnEdge() {
  const margin = 60;
  const side = randI(0, 3);
  let x, y;
  if (side === 0) { x = rand(0, WORLD); y = player.y - BASE_H / 2 - margin; }
  else if (side === 1) { x = rand(0, WORLD); y = player.y + BASE_H / 2 + margin; }
  else if (side === 2) { x = player.x - BASE_W / 2 - margin; y = rand(0, WORLD); }
  else                 { x = player.x + BASE_W / 2 + margin; y = rand(0, WORLD); }
  return { x: clamp(x, 30, WORLD - 30), y: clamp(y, 30, WORLD - 30) };
}

function spawnEnemy(type) {
  const def = ENEMY_DEF[type];
  const scale_ = 1 + wave * 0.1;
  const pos = spawnEdge();
  enemies.push({
    ...def,
    type,
    x: pos.x, y: pos.y,
    hp: def.maxHp * scale_,
    maxHp: def.maxHp * scale_,
    speed: def.speed * (1 + wave * 0.02),
    hitFlash: 0,
    atkTimer: 0,
    angle: 0,
  });
}

function updateSpawning(dt) {
  spawnTimer -= dt;
  const interval = Math.max(0.25, 2.2 - wave * 0.06);
  if (spawnTimer <= 0) {
    spawnTimer = interval;
    const count = 1 + Math.floor(wave / 5);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let type = 'basic';
      if (wave >= 2 && r < 0.22) type = 'swarm';
      else if (wave >= 4 && r < 0.35) type = 'fast';
      else if (wave >= 7 && r < 0.15) type = 'tank';
      spawnEnemy(type);
    }
  }
  eliteTimer -= dt;
  if (eliteTimer <= 0) {
    eliteTimer = 55;
    spawnEnemy('elite');
    spawnParticles(player.x, player.y, '#ff0000', 16);
  }
}

// ──────────────────────────────────────────────────────
//  Particles
// ──────────────────────────────────────────────────────
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(50, 200);
    particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: rand(1.5, 3.5),
      color, r: rand(2, 5),
    });
  }
}

// ──────────────────────────────────────────────────────
//  Shooting
// ──────────────────────────────────────────────────────
function nearestEnemies(count) {
  if (!enemies.length) return [];
  return enemies
    .slice()
    .sort((a, b) => dist(player, a) - dist(player, b))
    .slice(0, count);
}

function shoot() {
  const targets = nearestEnemies(player.bulletCount);
  if (!targets.length) return;
  Audio.shoot();
  for (const t of targets) {
    const a = angle(player, t);
    bullets.push({
      x: player.x, y: player.y,
      vx: Math.cos(a) * 440, vy: Math.sin(a) * 440,
      life: 1.4, dmg: player.dmg,
      pierce: player.pierce, hit: new Set(),
      r: 7 * player.bulletSize,
    });
  }
}

// ──────────────────────────────────────────────────────
//  Damage
// ──────────────────────────────────────────────────────
function damageEnemy(e, idx, dmg) {
  e.hp -= dmg;
  e.hitFlash = 0.12;
  Audio.hit();
  spawnParticles(e.x, e.y, e.glow, 4);
  if (e.hp <= 0) killEnemy(e, idx);
}

function killEnemy(e, idx) {
  spawnParticles(e.x, e.y, e.glow, 14);
  Audio.kill();
  const orbVal = e.xp;
  for (let i = 0; i < orbVal; i++) {
    xpOrbs.push({
      x: e.x + rand(-18, 18), y: e.y + rand(-18, 18),
      val: 1, r: 6,
    });
  }
  enemies.splice(idx, 1);
}

// ──────────────────────────────────────────────────────
//  Level Up
// ──────────────────────────────────────────────────────
function checkLevelUp() {
  while (player.xp >= player.xpNeeded) {
    player.xp -= player.xpNeeded;
    player.xpNeeded = Math.floor(player.xpNeeded * 1.35);
    player.level++;
    Audio.level();
    state = 'levelup';
    showLevelUp();
    break; // one at a time; remainder carries over
  }
}

function pickUpgrades() {
  const pool = ALL_UPGRADES.filter(u => {
    if (u.id === 'orb' && player.orbCount >= 4) return false;
    if (u.id === 'pierce' && player.pierce)     return false;
    if (u.id === 'aura' && player.aura)         return false;
    return true;
  });
  const result = [];
  while (result.length < 3 && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(i, 1)[0]);
  }
  return result;
}

function showLevelUp() {
  pendingUpgrades = pickUpgrades();
  const cards = document.getElementById('upgradeCards');
  cards.innerHTML = '';
  pendingUpgrades.forEach(u => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `
      <div class="upgrade-name" style="color:${RARITY_COLOR[u.rarity]}">${u.name}</div>
      <div class="upgrade-desc">${u.desc}</div>`;
    const pick = () => { applyUpgrade(u.id); };
    card.addEventListener('click', pick);
    card.addEventListener('touchend', e => { e.preventDefault(); pick(); });
    cards.appendChild(card);
  });
  document.getElementById('levelUpScreen').classList.remove('hidden');
}

function applyUpgrade(id) {
  switch (id) {
    case 'damage':      player.dmg       *= 1.30; break;
    case 'speed':       player.speed     *= 1.20; break;
    case 'fireRate':    player.fireRate  *= 1.25; break;
    case 'maxHp':       player.maxHp += 40; player.hp = Math.min(player.maxHp, player.hp + 40); break;
    case 'regen':       player.regen     += 3;    break;
    case 'pickupRange': player.pickupR   *= 2;    break;
    case 'multiShot':   player.bulletCount = Math.min(5, player.bulletCount + 1); break;
    case 'pierce':      player.pierce    = true;  break;
    case 'aura':        player.aura      = true;  break;
    case 'bulletSize':  player.bulletSize *= 1.4; player.dmg *= 1.1; break;
    case 'xpBoost':     player.xpMult    += 0.5;  break;
    case 'orb': {
      const orbIdx = player.orbCount++;
      const colors = ['#3498db', '#9b59b6', '#2ecc71', '#e67e22'];
      orbs.push({
        angle: (orbIdx / 4) * Math.PI * 2,
        dist: 55 + orbIdx * 18,
        speed: 2.2 + orbIdx * 0.3,
        x: player.x, y: player.y,
        dmg: player.dmg * 0.6,
        r: 11,
        cooldown: 0,
        color: colors[orbIdx % 4],
      });
      break;
    }
  }
  document.getElementById('levelUpScreen').classList.add('hidden');
  state = 'playing';
  // Carry-over levels
  if (player.xp >= player.xpNeeded) checkLevelUp();
}

// ──────────────────────────────────────────────────────
//  Game Over
// ──────────────────────────────────────────────────────
function gameOver() {
  state = 'dead';
  Audio.death();
  const t = Math.floor(time);
  const isNew = t > highScore;
  if (isNew) { highScore = t; localStorage.setItem('surge_hs', t); }
  document.getElementById('statsBox').innerHTML = `
    <div class="stat-row"><span>Survived</span><span class="stat-val">${fmt(t)}</span></div>
    <div class="stat-row"><span>Level reached</span><span class="stat-val">${player.level}</span></div>
    <div class="stat-row"><span>Wave reached</span><span class="stat-val">${wave + 1}</span></div>
    <div class="stat-row">
      <span>Best time</span>
      <span class="stat-val stat-best">${fmt(highScore)}${isNew ? '<span class="stat-new">NEW!</span>' : ''}</span>
    </div>`;
  document.getElementById('gameOverScreen').classList.remove('hidden');
}

// ──────────────────────────────────────────────────────
//  Init
// ──────────────────────────────────────────────────────
function startGame() {
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  document.getElementById('levelUpScreen').classList.add('hidden');

  player = {
    x: WORLD / 2, y: WORLD / 2,
    hp: 100, maxHp: 100,
    speed: 165, dmg: 25,
    fireRate: 1.0, fireTimer: 0,
    bulletCount: 1, pierce: false,
    bulletSize: 1.0,
    pickupR: 90,
    regen: 0,
    aura: false, auraTimer: 0,
    xpMult: 1.0,
    orbCount: 0,
    xp: 0, xpNeeded: 10, level: 1,
    invincible: 0,
  };

  enemies   = [];
  bullets   = [];
  xpOrbs    = [];
  particles = [];
  orbs      = [];

  camera = { x: player.x - BASE_W / 2, y: player.y - BASE_H / 2 };
  shake  = { x: 0, y: 0, intensity: 0, dur: 0 };

  time = 0; wave = 0; spawnTimer = 0; eliteTimer = 50;
  state = 'playing';
}

// ──────────────────────────────────────────────────────
//  Update
// ──────────────────────────────────────────────────────
function update(dt) {
  time += dt;
  wave = Math.floor(time / 12);

  // ── Player movement ──
  const dir = getInput();
  player.x = clamp(player.x + dir.x * player.speed * dt, 24, WORLD - 24);
  player.y = clamp(player.y + dir.y * player.speed * dt, 24, WORLD - 24);

  // ── Camera ──
  camera.x = lerp(camera.x, player.x - BASE_W / 2, 0.12);
  camera.y = lerp(camera.y, player.y - BASE_H / 2, 0.12);

  // ── Screen shake ──
  if (shake.dur > 0) {
    shake.dur -= dt;
    shake.x = (Math.random() - 0.5) * shake.intensity * 2;
    shake.y = (Math.random() - 0.5) * shake.intensity * 2;
  } else { shake.x = 0; shake.y = 0; }

  // ── Regen & invincibility ──
  if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
  if (player.invincible > 0) player.invincible -= dt;

  // ── Auto-shoot ──
  player.fireTimer -= dt;
  if (player.fireTimer <= 0 && enemies.length > 0) {
    player.fireTimer = 1 / player.fireRate;
    shoot();
  }

  // ── Orbit orbs ──
  for (const orb of orbs) {
    orb.angle += orb.speed * dt;
    orb.x = player.x + Math.cos(orb.angle) * orb.dist;
    orb.y = player.y + Math.sin(orb.angle) * orb.dist;
    orb.cooldown -= dt;
    if (orb.cooldown <= 0) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (dist(orb, e) < orb.r + e.r) {
          damageEnemy(e, i, orb.dmg);
          orb.cooldown = 0.28;
          break;
        }
      }
    }
  }

  // ── Flame aura ──
  if (player.aura) {
    player.auraTimer -= dt;
    if (player.auraTimer <= 0) {
      player.auraTimer = 0.45;
      const R = 85;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (dist(player, e) < R + e.r) damageEnemy(e, i, player.dmg * 0.45);
      }
      spawnParticles(player.x, player.y, '#ff6b35', 5);
    }
  }

  // ── Bullets ──
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { bullets.splice(i, 1); continue; }
    let dead = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (b.hit.has(e)) continue;
      if (dist(b, e) < b.r + e.r) {
        damageEnemy(e, j, b.dmg);
        b.hit.add(e);
        if (!b.pierce) { bullets.splice(i, 1); dead = true; break; }
      }
    }
    if (dead) continue;
  }

  // ── Enemies ──
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hitFlash > 0) e.hitFlash -= dt;
    e.angle += dt * (e.type === 'elite' ? 1.5 : 0.8);

    const a = angle(e, player);
    e.x += Math.cos(a) * e.speed * dt;
    e.y += Math.sin(a) * e.speed * dt;

    if (dist(e, player) < e.r + 18 && player.invincible <= 0) {
      e.atkTimer -= dt;
      if (e.atkTimer <= 0) {
        player.hp -= e.dmg;
        player.invincible = 0.65;
        e.atkTimer = 1.0;
        shake.intensity = 9; shake.dur = 0.22;
        Audio.hurt();
        spawnParticles(player.x, player.y, '#ff4444', 10);
        if (player.hp <= 0) { gameOver(); return; }
      }
    } else {
      e.atkTimer = 0;
    }
  }

  // ── Particles ──
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.86; p.vy *= 0.86;
    p.life -= p.decay * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ── XP orbs ──
  for (let i = xpOrbs.length - 1; i >= 0; i--) {
    const o = xpOrbs[i];
    const d = dist(player, o);
    if (d < player.pickupR) {
      const a = angle(o, player);
      const spd = Math.max(220, 600 - d * 4);
      o.x += Math.cos(a) * spd * dt;
      o.y += Math.sin(a) * spd * dt;
    }
    if (dist(player, o) < 16) {
      player.xp += o.val * player.xpMult;
      xpOrbs.splice(i, 1);
      Audio.xp();
      checkLevelUp();
    }
  }

  updateSpawning(dt);
}

// ──────────────────────────────────────────────────────
//  Render helpers
// ──────────────────────────────────────────────────────
function ws(wx, wy) {
  return { x: wx - camera.x + shake.x, y: wy - camera.y + shake.y };
}

function drawHex(cx, cy, r, color, glow) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    i === 0
      ? ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      : ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.shadowBlur = 14; ctx.shadowColor = glow;
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowBlur = 0;
}

function drawDiamond(cx, cy, r, color, glow) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.7, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.7, cy);
  ctx.closePath();
  ctx.shadowBlur = 12; ctx.shadowColor = glow;
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowBlur = 0;
}

// ──────────────────────────────────────────────────────
//  Render
// ──────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, BASE_W, BASE_H);
  ctx.fillStyle = '#080c12';
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  if (state === 'menu') { renderMenu(); return; }
  if (state === 'dead') return;

  // ── World grid ──
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const gs = 80;
  const ox = -((camera.x + shake.x) % gs);
  const oy = -((camera.y + shake.y) % gs);
  for (let x = ox; x < BASE_W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BASE_H); ctx.stroke(); }
  for (let y = oy; y < BASE_H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(BASE_W, y); ctx.stroke(); }

  // ── World border ──
  const b0 = ws(0, 0), b1 = ws(WORLD, WORLD);
  ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 4;
  ctx.shadowBlur = 10; ctx.shadowColor = '#e74c3c';
  ctx.strokeRect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y);
  ctx.shadowBlur = 0;

  // ── XP Orbs ──
  ctx.shadowBlur = 10; ctx.shadowColor = '#f1c40f';
  for (const o of xpOrbs) {
    const s = ws(o.x, o.y);
    ctx.beginPath(); ctx.arc(s.x, s.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f'; ctx.fill();
  }
  ctx.shadowBlur = 0;

  // ── Particles ──
  for (const p of particles) {
    const s = ws(p.x, p.y);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath(); ctx.arc(s.x, s.y, p.r * Math.max(0.2, p.life), 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Orb weapons ──
  for (const o of orbs) {
    const s = ws(o.x, o.y);
    ctx.shadowBlur = 18; ctx.shadowColor = o.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = o.color; ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Enemies ──
  for (const e of enemies) {
    const s = ws(e.x, e.y);
    if (e.hitFlash > 0) ctx.fillStyle = '#fff';
    else                ctx.fillStyle = e.col;

    if (e.shape === 'hex') drawHex(s.x, s.y, e.r, ctx.fillStyle, e.glow);
    else if (e.shape === 'diamond') drawDiamond(s.x, s.y, e.r, ctx.fillStyle, e.glow);
    else {
      ctx.shadowBlur = 12; ctx.shadowColor = e.glow;
      ctx.beginPath(); ctx.arc(s.x, s.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : e.col;
      ctx.fill(); ctx.shadowBlur = 0;
    }

    // HP bar (only when damaged)
    if (e.hp < e.maxHp) {
      const bw = e.r * 2.6, bh = 4;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(s.x - bw/2, s.y - e.r - 10, bw, bh);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(s.x - bw/2, s.y - e.r - 10, bw * (e.hp / e.maxHp), bh);
    }
  }

  // ── Bullets ──
  ctx.shadowBlur = 14; ctx.shadowColor = '#0984e3';
  for (const b of bullets) {
    const s = ws(b.x, b.y);
    ctx.beginPath(); ctx.arc(s.x, s.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = '#74b9ff'; ctx.fill();
  }
  ctx.shadowBlur = 0;

  // ── Player ──
  const ps = ws(player.x, player.y);

  // Aura ring
  if (player.aura) {
    ctx.beginPath(); ctx.arc(ps.x, ps.y, 85, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,107,53,0.28)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle   = 'rgba(255,107,53,0.06)'; ctx.fill();
  }

  // Pickup range ring (faint)
  ctx.beginPath(); ctx.arc(ps.x, ps.y, player.pickupR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(241,196,15,0.08)'; ctx.lineWidth = 1; ctx.stroke();

  if (player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  ctx.shadowBlur = 24; ctx.shadowColor = '#3498db';
  ctx.beginPath(); ctx.arc(ps.x, ps.y, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#2980b9'; ctx.fill();
  // Inner highlight
  ctx.beginPath(); ctx.arc(ps.x - 5, ps.y - 5, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  ctx.shadowBlur = 0;

  // Direction arrow toward nearest enemy
  if (enemies.length > 0) {
    const t = nearestEnemies(1)[0];
    if (t) {
      const a = angle(player, t);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#74b9ff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ps.x + Math.cos(a) * 20, ps.y + Math.sin(a) * 20);
      ctx.lineTo(ps.x + Math.cos(a) * 30, ps.y + Math.sin(a) * 30);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ── HUD ──
  renderHUD();

  // ── Joystick ──
  if (joy.on) {
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(joy.bx, joy.by, joy.R, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(joy.sx, joy.sy, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function renderHUD() {
  const pad = 14;

  // Wave badge top-right
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(`WAVE ${wave + 1}`, BASE_W - pad, 28);

  // Level top-left
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`LVL ${player.level}`, pad, 28);

  // Timer center-top
  ctx.fillStyle = '#ddd';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(fmt(Math.floor(time)), BASE_W / 2, 28);

  // Bars at bottom
  const barW = BASE_W - pad * 2;
  const hpY  = BASE_H - 52;
  const xpY  = BASE_H - 30;
  const hpH  = 16, xpH = 10;

  // HP bar bg
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(pad, hpY, barW, hpH);
  // HP bar fill
  const hpRatio = Math.max(0, player.hp / player.maxHp);
  const hpCol = hpRatio > 0.5 ? '#27ae60' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c';
  ctx.fillStyle = hpCol;
  ctx.fillRect(pad, hpY, barW * hpRatio, hpH);
  // HP bar border
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, hpY, barW, hpH);
  // HP text
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp} HP`, BASE_W / 2, hpY + hpH - 3);

  // XP bar bg
  ctx.fillStyle = '#111';
  ctx.fillRect(pad, xpY, barW, xpH);
  // XP bar fill
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(pad, xpY, barW * (player.xp / player.xpNeeded), xpH);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.strokeRect(pad, xpY, barW, xpH);
}

function renderMenu() {
  // Background dots
  ctx.fillStyle = '#080c12';
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  // Title glow
  ctx.textAlign = 'center';
  ctx.shadowBlur = 40; ctx.shadowColor = '#3498db';
  ctx.fillStyle = '#3498db';
  ctx.font = 'bold 72px Arial';
  ctx.fillText('SURGE', BASE_W / 2, 190);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#888';
  ctx.font = '18px Arial';
  ctx.fillText('Endless Survivor', BASE_W / 2, 230);

  if (highScore > 0) {
    ctx.fillStyle = '#f1c40f';
    ctx.font = '14px Arial';
    ctx.fillText(`Best: ${fmt(highScore)}`, BASE_W / 2, 262);
  }
}

// ──────────────────────────────────────────────────────
//  UI events
// ──────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('startBtn').addEventListener('touchend', e => { e.preventDefault(); startGame(); });
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('touchend', e => { e.preventDefault(); startGame(); });

document.getElementById('highScoreDisplay').textContent = `Best: ${fmt(highScore)}`;

// ──────────────────────────────────────────────────────
//  Game Loop
// ──────────────────────────────────────────────────────
let lastTs = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (state === 'playing') update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
