import { askOllama } from "./ollama.js?v=3";

let runtime = null;

const CHUNK_SIZE = 18;
const KEEP_RADIUS = 1;
const DENOMS = [1, 5, 10, 25, 50, 100];
const SYMBOL_SETS = [
  ["7", "BAR", "CHERRY", "BELL", "LEMON", "PLUM", "WILD"],
  ["A", "K", "Q", "J", "10", "GEM", "CROWN", "WILD"],
  ["VAULT", "BOND", "KEY", "LOCK", "CASH", "SAFE", "WILD"],
  ["SUN", "MOON", "STAR", "ORB", "NOVA", "COMET", "WILD"],
  ["ACE", "CLUB", "HEART", "SPADE", "DIAMOND", "JOKER", "WILD"],
  ["BUFFALO", "EAGLE", "WOLF", "COIN", "RANCH", "BONUS", "WILD"],
  ["DRAGON", "LOTUS", "FIRE", "PEARL", "FAN", "FREE", "WILD"],
  ["SHIP", "MAP", "CHEST", "SKULL", "ANCHOR", "BONUS", "WILD"],
];
const NAME_LEFT = ["Lucky", "Neon", "Royal", "Vault", "Midnight", "Cherry", "Golden", "Electric", "Velvet", "Ace"];
const NAME_RIGHT = ["Lantern", "Queens", "Runner", "Sevens", "Current", "Diamond", "Moon", "Circuit", "Banker", "Jackpot", "Buffalo", "Dragon"];
const PALETTE = [0xd99a18, 0xd84f45, 0x1f6ccf, 0x18b981, 0x8b5cf6, 0xf97316, 0x06b6d4, 0xef4444, 0x84cc16];
const GAME_TYPES = ["classic", "video", "bonus", "multiplier", "freeSpins", "holdRespin", "megaways", "mystery", "cascading", "wheelBonus", "pickBonus", "expandingWilds", "sap", "wap"];
const ROOM_TYPES = [
  { id: "main", label: "Main Slot Hall", floor: 0x26313b, carpet: 0x7f1d1d, slots: [6, 13] },
  { id: "highLimit", label: "High Limit Salon", floor: 0x172033, carpet: 0x1f6ccf, slots: [4, 8] },
  { id: "foodCourt", label: "Food Court", floor: 0x3a3328, carpet: 0x365314, slots: [1, 4] },
  { id: "garden", label: "Garden Atrium", floor: 0x1f342b, carpet: 0x14532d, slots: [2, 6] },
  { id: "retro", label: "Retro Arcade Row", floor: 0x2d263b, carpet: 0x8b5cf6, slots: [5, 10] },
  { id: "transit", label: "Stair Landing", floor: 0x202833, carpet: 0x334155, slots: [0, 3] },
];
const EMOTES = {
  wave: "WAVE",
  cheer: "CHEER",
  jackpot: "JACKPOT",
  think: "THINK",
};
const HIGH_LIMIT_CREDIT_REQUIREMENT = 25000;
const BOT_NAMES = ["Mara", "Vince", "Jules", "Rin", "Tess", "Noor", "Cal", "Ivy", "Ezra", "Pax", "Mika", "Sol"];
const BOT_CHAT_LINES = [
  "This machine has been cold all morning.",
  "I am chasing one more bonus, then I swear I am done.",
  "High limit looks quiet tonight.",
  "Did you see that jackpot bubble?",
  "I like the garden room. Less noise.",
  "Food court tables are softer than they look.",
];
const SYMBOL_ART = {
  "7": "7", BAR: "BAR", CHERRY: "🍒", BELL: "🔔", LEMON: "🍋", PLUM: "🟣", WILD: "★",
  A: "A", K: "K", Q: "Q", J: "J", "10": "10", GEM: "💎", CROWN: "♛",
  VAULT: "▣", BOND: "$", KEY: "⚿", LOCK: "▣", CASH: "💵", SAFE: "▤",
  SUN: "☀", MOON: "☾", STAR: "✦", ORB: "●", NOVA: "✹", COMET: "☄",
  ACE: "A", CLUB: "♣", HEART: "♥", SPADE: "♠", DIAMOND: "♦", JOKER: "JOKER",
  BUFFALO: "BUF", EAGLE: "EGL", WOLF: "WLF", COIN: "◎", RANCH: "R", BONUS: "BONUS",
  DRAGON: "龍", LOTUS: "✿", FIRE: "🔥", PEARL: "○", FAN: "FAN", FREE: "FREE",
  SHIP: "SHIP", MAP: "MAP", CHEST: "▧", SKULL: "☠", ANCHOR: "⚓",
};

Object.assign(SYMBOL_ART, {
  CHERRY: "CH", BELL: "BELL", LEMON: "LEM", PLUM: "PLM", WILD: "WILD",
  GEM: "GEM", CROWN: "CRN", VAULT: "VLT", KEY: "KEY", LOCK: "LCK", CASH: "CASH", SAFE: "SAFE",
  SUN: "SUN", MOON: "MOON", STAR: "STAR", ORB: "ORB", NOVA: "NOVA", COMET: "CMT",
  CLUB: "CLB", HEART: "HRT", SPADE: "SPD", DIAMOND: "DIA",
  COIN: "COIN", RANCH: "RCH", DRAGON: "DRG", LOTUS: "LOT", PEARL: "PRL",
  CHEST: "CHST", SKULL: "SKL", ANCHOR: "ANCH",
});

export async function initSlotsWorld(config) {
  destroySlotsWorld();
  if (!config.container) return;

  config.container.innerHTML = `<div class="slots-loading">Loading casino floor...</div>`;
  let THREE;
  try {
    THREE = await import("./vendor/three.module.js");
  } catch (error) {
    config.container.innerHTML = `<div class="slots-loading error">Three.js could not load: ${escapeHtml(error.message)}</div>`;
    return;
  }

  config.container.innerHTML = "";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101820);
  scene.fog = new THREE.Fog(0x101820, 26, 58);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  config.container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xfff6dd, 0x17202a, 1.45);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.65);
  key.position.set(6, 10, 8);
  key.castShadow = true;
  scene.add(key);

  runtime = {
    ...config,
    THREE,
    renderer,
    scene,
    camera,
    chunks: new Map(),
    machineObjects: [],
    keys: new Set(),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    cameraYaw: 0,
    cameraPitch: 0.35,
    cameraDistance: 6.4,
    mouseDown: false,
    lastMouse: { x: 0, y: 0 },
    avatar: config.avatar || defaultAvatar(),
    walkPhase: 0,
    player: buildPlayer(THREE, scene, config.avatar || defaultAvatar()),
    remotePlayers: new Map(),
    bots: [],
    tableObjects: [],
    localEmote: null,
    localEmoteLabel: null,
    selected: null,
    seated: null,
    selectedTable: null,
    spinning: false,
    frame: 0,
    lastPresenceAt: 0,
    lastPresenceSnapshot: "",
    lastBotConversationAt: 0,
    lastChunk: "",
    clock: new THREE.Clock(),
    spinHistory: [],
    lastWapLinks: [],
  };
  runtime.spinButton = runtime.playButton;
  runtime.rulesButton = runtime.rulesButton || runtime.showRulesButton;
  runtime.localEmoteLabel = buildEmoteLabel(THREE, "");
  runtime.localEmoteLabel.visible = false;
  scene.add(runtime.localEmoteLabel);

  runtime.onKeyDown = (event) => {
    if (runtime.seated && event.key === "Escape") {
      leaveMachine();
      return;
    }
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      runtime.keys.add(key);
    }
  };
  runtime.onKeyUp = (event) => runtime.keys.delete(event.key.toLowerCase());
  runtime.onPointerDown = (event) => {
    runtime.mouseDown = true;
    runtime.lastMouse = { x: event.clientX, y: event.clientY };
    runtime.container.focus();
  };
  runtime.onPointerMove = (event) => {
    if (!runtime.mouseDown || runtime.seated) return;
    const dx = event.clientX - runtime.lastMouse.x;
    const dy = event.clientY - runtime.lastMouse.y;
    runtime.cameraYaw -= dx * 0.0018;
    runtime.cameraPitch = clamp(runtime.cameraPitch + dy * 0.0012, -0.08, 0.85);
    runtime.lastMouse = { x: event.clientX, y: event.clientY };
  };
  runtime.onPointerUp = () => { runtime.mouseDown = false; };
  runtime.onClick = (event) => inspectClickedMachine(event);
  runtime.onWheel = (event) => {
    event.preventDefault();
    runtime.cameraDistance = clamp(runtime.cameraDistance + Math.sign(event.deltaY) * 0.65, 3.8, 10.5);
  };
  runtime.onResize = () => resize(runtime);
  runtime.onSit = () => sitAtSelected();
  runtime.onLeave = () => leaveMachine();
  runtime.onSpin = () => spinSelected();
  runtime.onRules = () => showRulesForSelected();
  runtime.onDenom = () => updateBetReadout();
  runtime.onPaylines = () => updateBetReadout();

  runtime.container.addEventListener("keydown", runtime.onKeyDown);
  runtime.container.addEventListener("keyup", runtime.onKeyUp);
  runtime.container.addEventListener("pointerdown", runtime.onPointerDown);
  runtime.container.addEventListener("pointermove", runtime.onPointerMove);
  window.addEventListener("pointerup", runtime.onPointerUp);
  runtime.container.addEventListener("click", runtime.onClick);
  runtime.container.addEventListener("wheel", runtime.onWheel, { passive: false });
  window.addEventListener("resize", runtime.onResize);
  runtime.sitButton?.addEventListener("click", runtime.onSit);
  runtime.leaveButton?.addEventListener("click", runtime.onLeave);
  runtime.spinButton?.addEventListener("click", runtime.onSpin);
  runtime.rulesButton?.addEventListener("click", runtime.onRules);
  runtime.denomSelect?.addEventListener("change", runtime.onDenom);
  runtime.paylineSelect?.addEventListener("change", runtime.onPaylines);

  resize(runtime);
  ensureChunks();
  const starter = nearestMachine(3.2) || runtime.machineObjects[0];
  if (starter) runtime.selected = starter.machine;
  runtime.container.focus();
  updateMachinePanel();
  updateSlotsPeers(config.peers || [], config.playerId || "");
  publishPresence("enter", true);
  animate();
}

export function destroySlotsWorld() {
  if (!runtime) return;
  document.body.classList.remove("slot-seated");
  cancelAnimationFrame(runtime.frame);
  runtime.container.removeEventListener("keydown", runtime.onKeyDown);
  runtime.container.removeEventListener("keyup", runtime.onKeyUp);
  runtime.container.removeEventListener("pointerdown", runtime.onPointerDown);
  runtime.container.removeEventListener("pointermove", runtime.onPointerMove);
  window.removeEventListener("pointerup", runtime.onPointerUp);
  runtime.container.removeEventListener("click", runtime.onClick);
  runtime.container.removeEventListener("wheel", runtime.onWheel);
  window.removeEventListener("resize", runtime.onResize);
  runtime.sitButton?.removeEventListener("click", runtime.onSit);
  runtime.leaveButton?.removeEventListener("click", runtime.onLeave);
  runtime.spinButton?.removeEventListener("click", runtime.onSpin);
  runtime.rulesButton?.removeEventListener("click", runtime.onRules);
  runtime.denomSelect?.removeEventListener("change", runtime.onDenom);
  runtime.paylineSelect?.removeEventListener("change", runtime.onPaylines);
  runtime.renderer.dispose();
  runtime.container.innerHTML = "";
  runtime = null;
}

function animate() {
  if (!runtime) return;
  const dt = Math.min(0.05, runtime.clock.getDelta());
  updatePlayer(dt);
  updateBots(dt);
  updateEmoteDisplays();
  ensureChunks();
  publishPresence("move");
  runtime.scene.updateMatrixWorld(true);
  updateFocus();
  updateCamera();
  runtime.renderer.render(runtime.scene, runtime.camera);
  runtime.frame = requestAnimationFrame(animate);
}

function updatePlayer(dt) {
  if (runtime.seated) {
    resetWalkPose();
    return;
  }
  const { player, keys } = runtime;
  const walkSpeed = 5.6;
  const forward = (keys.has("w") ? 1 : 0) + (keys.has("s") ? -0.75 : 0);
  const strafe = (keys.has("d") ? 1 : 0) + (keys.has("a") ? -1 : 0);
  const moving = !!forward || !!strafe;
  if (!moving) {
    resetWalkPose();
    return;
  }
  const yaw = runtime.cameraYaw;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const nextX = player.position.x + (-sin * forward + cos * strafe) * walkSpeed * dt;
  const nextZ = player.position.z + (-cos * forward - sin * strafe) * walkSpeed * dt;
  if (!canEnterPosition(nextX, nextZ)) {
    resetWalkPose();
    return;
  }
  player.position.x = nextX;
  player.position.z = nextZ;
  player.rotation.y = yaw;
  runtime.walkPhase += dt * 8;
  runtime.walkPhase %= Math.PI * 2;
  applyWalkAnimation(runtime.walkPhase);
}

function canEnterPosition(x, z) {
  const cx = Math.floor((x + CHUNK_SIZE / 2) / CHUNK_SIZE);
  const cz = Math.floor((z + CHUNK_SIZE / 2) / CHUNK_SIZE);
  const room = roomTypeAt(cx, cz);
  if (room.id !== "highLimit") return true;
  const bankroll = Number(runtime.getBankroll?.() || 0);
  if (bankroll >= HIGH_LIMIT_CREDIT_REQUIREMENT) return true;
  runtime.info.textContent = `High Limit Salon locked: ${chips(HIGH_LIMIT_CREDIT_REQUIREMENT)} credit required. Current credit ${chips(bankroll)}.`;
  runtime.keys.clear();
  return false;
}

function applyWalkAnimation(phase) {
  if (!runtime?.player?.userData?.parts) return;
  const parts = runtime.player.userData.parts;
  const swing = Math.sin(phase) * 0.7;
  const bob = Math.sin(phase * 2) * 0.04;
  parts.leftArm.rotation.x = swing;
  parts.rightArm.rotation.x = -swing;
  if (parts.leftHand) parts.leftHand.position.z = Math.sin(phase) * 0.08;
  if (parts.rightHand) parts.rightHand.position.z = -Math.sin(phase) * 0.08;
  parts.leftLeg.rotation.x = -swing;
  parts.rightLeg.rotation.x = swing;
  if (parts.leftFoot) parts.leftFoot.rotation.x = -swing * 0.25;
  if (parts.rightFoot) parts.rightFoot.rotation.x = swing * 0.25;
  runtime.player.position.y = bob;
  parts.head.position.y = 1.48 + bob * 0.65;
}

function resetWalkPose() {
  if (!runtime?.player?.userData?.parts) return;
  const parts = runtime.player.userData.parts;
  parts.leftArm.rotation.x = 0;
  parts.rightArm.rotation.x = 0;
  if (parts.leftHand) parts.leftHand.position.z = -0.01;
  if (parts.rightHand) parts.rightHand.position.z = -0.01;
  parts.leftLeg.rotation.x = 0;
  parts.rightLeg.rotation.x = 0;
  if (parts.leftFoot) parts.leftFoot.rotation.x = 0;
  if (parts.rightFoot) parts.rightFoot.rotation.x = 0;
  runtime.player.position.y = 0;
  parts.head.position.y = 1.48;
}

function ensureChunks() {
  const cx = Math.floor((runtime.player.position.x + CHUNK_SIZE / 2) / CHUNK_SIZE);
  const cz = Math.floor((runtime.player.position.z + CHUNK_SIZE / 2) / CHUNK_SIZE);
  const chunkKey = `${cx},${cz}`;
  if (chunkKey === runtime.lastChunk && runtime.chunks.size) return;
  runtime.lastChunk = chunkKey;

  const needed = new Set();
  for (let z = cz - KEEP_RADIUS; z <= cz + KEEP_RADIUS; z++) {
    for (let x = cx - KEEP_RADIUS; x <= cx + KEEP_RADIUS; x++) {
      const key = `${x},${z}`;
      needed.add(key);
      if (!runtime.chunks.has(key)) runtime.chunks.set(key, buildChunk(x, z));
    }
  }

  for (const [key, chunk] of runtime.chunks.entries()) {
    if (!needed.has(key)) {
      runtime.scene.remove(chunk.group);
      runtime.machineObjects = runtime.machineObjects.filter((item) => !chunk.machines.includes(item));
      runtime.tableObjects = runtime.tableObjects.filter((item) => !chunk.tables.includes(item));
      runtime.bots = runtime.bots.filter((bot) => bot.chunkKey !== key);
      runtime.chunks.delete(key);
    }
  }
}

function updateEmoteDisplays() {
  if (!runtime) return;
  const now = performance.now();
  if (runtime.localEmoteLabel) {
    const active = runtime.localEmote && runtime.localEmote.until > now;
    runtime.localEmoteLabel.visible = Boolean(active);
    if (active) {
      runtime.localEmoteLabel.position.set(runtime.player.position.x, runtime.player.position.y + 2.25, runtime.player.position.z);
    }
  }
  for (const remote of runtime.remotePlayers.values()) {
    const active = remote.emote && remote.emote.until > Date.now();
    remote.emoteLabel.visible = Boolean(active);
    if (active) {
      remote.emoteLabel.position.set(remote.group.position.x, remote.group.position.y + 2.55, remote.group.position.z);
    }
  }
}

function buildChunk(cx, cz) {
  const { THREE, scene } = runtime;
  const seed = hash(`${cx}:${cz}:casino`);
  const rng = mulberry32(seed);
  const room = roomTypeFor(cx, cz, rng);
  const group = new THREE.Group();
  group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

  const floorColor = room.floor;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(CHUNK_SIZE, 0.22, CHUNK_SIZE),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.82 })
  );
  floor.position.y = -0.12;
  floor.receiveShadow = true;
  group.add(floor);

  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUNK_SIZE - 3, CHUNK_SIZE - 5),
    new THREE.MeshStandardMaterial({ color: room.carpet, roughness: 0.94 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = 0.01;
  group.add(carpet);

  addChunkWalls(THREE, group, cx, cz, room);
  addCasinoArchitecture(THREE, group, rng, room);
  addRoomFeatures(THREE, group, rng, room);
  for (let i = -6; i <= 6; i += 4) {
    const light = new THREE.PointLight(PALETTE[Math.floor(rng() * PALETTE.length)], 0.85, 7);
    light.position.set(i, 3.2, -6 + rng() * 12);
    group.add(light);
  }

  const machines = [];
  const tables = [];
  if (cx === 0 && cz === 0) {
    const welcome = createMachineDefinition(cx, cz, 0, 0, rng);
    welcome.name = "Welcome Sevens";
    welcome.theme = "Medium volatility digital starter cabinet";
    welcome.x = 0;
    welcome.z = 2.6;
    const object = buildMachine(THREE, group, welcome, welcome.x, welcome.z);
    machines.push(object);
    runtime.machineObjects.push(object);
  }
  const machineCount = room.slots[0] + Math.floor(rng() * (room.slots[1] - room.slots[0] + 1));
  const used = [];
  for (let index = 0; index < machineCount; index++) {
    let localX = 0;
    let localZ = 0;
    let tries = 0;
    do {
      localX = -7 + rng() * 14;
      localZ = -6.5 + rng() * 12.5;
      tries++;
    } while (tries < 25 && (used.some((point) => Math.hypot(point.x - localX, point.z - localZ) < 2.35) || reservedByRoom(room, localX, localZ)));
    if (cx === 0 && cz === 0 && Math.hypot(localX, localZ - 2.6) < 2.2) continue;
    used.push({ x: localX, z: localZ });
    const machine = createMachineDefinition(cx, cz, index, Math.round(localX * 10), rng);
    machine.x = cx * CHUNK_SIZE + localX;
    machine.z = cz * CHUNK_SIZE + localZ;
    const object = buildMachine(THREE, group, machine, localX, localZ);
    machines.push(object);
    runtime.machineObjects.push(object);
  }
  addBlackjackTables(THREE, group, rng, room, tables, cx, cz);
  addBotsToChunk(THREE, group, rng, room, machines, `${cx},${cz}`);

  scene.add(group);
  return { group, machines, tables };
}

function roomTypeAt(cx, cz) {
  const seed = hash(`${cx}:${cz}:casino`);
  return roomTypeFor(cx, cz, mulberry32(seed));
}

function roomTypeFor(cx, cz, rng) {
  if (cx === 0 && cz === 0) return ROOM_TYPES[0];
  const roll = rng();
  if ((cx + cz) % 5 === 0) return ROOM_TYPES.find((room) => room.id === "transit");
  if (roll < 0.18) return ROOM_TYPES.find((room) => room.id === "foodCourt");
  if (roll < 0.34) return ROOM_TYPES.find((room) => room.id === "garden");
  if (roll < 0.52) return ROOM_TYPES.find((room) => room.id === "highLimit");
  if (roll < 0.72) return ROOM_TYPES.find((room) => room.id === "retro");
  return ROOM_TYPES[0];
}

function reservedByRoom(room, localX, localZ) {
  if (room.id === "foodCourt" && Math.abs(localX) < 4.8 && Math.abs(localZ) < 4.5) return true;
  if (room.id === "transit" && Math.abs(localX) < 5.2 && Math.abs(localZ) < 5.2) return true;
  if (room.id === "garden" && Math.abs(localX) < 3.4 && Math.abs(localZ) < 3.4) return true;
  return false;
}

function addCasinoArchitecture(THREE, group, rng, room) {
  const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.18, roughness: 0.45 });
  [-6.8, 6.8].forEach((x) => {
    [-6.8, 6.8].forEach((z) => {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.2, 12), columnMaterial);
      column.position.set(x, 1.55, z);
      column.castShadow = true;
      group.add(column);
      if (rng() < 0.45 || room.id === "garden") addPlant(THREE, group, x + (x > 0 ? -0.48 : 0.48), z + (z > 0 ? -0.48 : 0.48), rng);
    });
  });
  for (let z = -6; z <= 6; z += 4) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(CHUNK_SIZE - 2, 0.14, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x0f1720, roughness: 0.5 })
    );
    beam.position.set(0, 3.18, z);
    group.add(beam);
  }
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.46, 0.12),
    new THREE.MeshStandardMaterial({ color: PALETTE[Math.floor(rng() * PALETTE.length)], emissive: 0x221100, emissiveIntensity: 0.25 })
  );
  sign.position.set(0, 2.65, -8.15);
  group.add(sign);
  const label = buildAreaLabel(THREE, room.label);
  label.position.set(0, 3.05, -8.05);
  group.add(label);
}

function addChunkWalls(THREE, group, cx, cz, room) {
  const wallMaterial = new THREE.MeshStandardMaterial({ color: room.id === "highLimit" ? 0x111827 : 0x18212a, roughness: 0.86 });
  const half = CHUNK_SIZE / 2;
  const walls = [];
  if (room.id === "highLimit") {
    const doorWidth = 4.2;
    walls.push([0, 1.9, half, CHUNK_SIZE, 3.8, 0.32]);
    walls.push([-half, 1.9, 0, 0.32, 3.8, CHUNK_SIZE]);
    walls.push([half, 1.9, 0, 0.32, 3.8, CHUNK_SIZE]);
    walls.push([-(CHUNK_SIZE - doorWidth) / 4 - doorWidth / 2, 1.9, -half, (CHUNK_SIZE - doorWidth) / 2, 3.8, 0.32]);
    walls.push([(CHUNK_SIZE - doorWidth) / 4 + doorWidth / 2, 1.9, -half, (CHUNK_SIZE - doorWidth) / 2, 3.8, 0.32]);
    addHighLimitDoor(THREE, group, 0, -half + 0.04);
  }
  if (cz === 0) walls.push([0, 1.9, half, CHUNK_SIZE, 3.8, 0.3]);
  if (Math.abs(cx) % 3 === 2) walls.push([cx > 0 ? half : -half, 1.9, 0, 0.3, 3.8, CHUNK_SIZE]);
  for (const [x, y, z, w, h, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    group.add(wall);
  }
}

function addHighLimitDoor(THREE, group, x, z) {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd99a18, roughness: 0.28, metalness: 0.72 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.62, roughness: 0.18, metalness: 0.25 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.8, 0.18), frameMat);
  frame.position.set(x, 1.42, z);
  group.add(frame);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.65, 2.24, 0.2), glassMat);
  glass.position.set(x, 1.36, z - 0.02);
  group.add(glass);
  const label = buildAreaLabel(THREE, `${chips(HIGH_LIMIT_CREDIT_REQUIREMENT)} CREDIT REQUIRED`);
  label.position.set(x, 2.95, z - 0.08);
  label.scale.set(2.8, 0.68, 1);
  group.add(label);
}

function addRoomFeatures(THREE, group, rng, room) {
  if (room.id === "foodCourt") {
    addFoodCourt(THREE, group, rng);
  } else if (room.id === "transit") {
    addTransitCore(THREE, group, rng);
  } else if (room.id === "garden") {
    addGardenAtrium(THREE, group, rng);
  } else if (room.id === "highLimit") {
    addHighLimitLounge(THREE, group, rng);
  } else if (room.id === "retro") {
    addRetroArcadeTrim(THREE, group, rng);
  }
}

function addFoodCourt(THREE, group, rng) {
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x4b3425, roughness: 0.66 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.1, 1.0), counterMat);
  counter.position.set(0, 0.55, -6.7);
  counter.castShadow = true;
  group.add(counter);
  for (let i = -3; i <= 3; i += 2) {
    addTableSet(THREE, group, i, 0.2 + rng() * 2.6, rng);
  }
  addAreaKiosk(THREE, group, -5.6, 5.9, 0xd99a18);
  addAreaKiosk(THREE, group, 5.6, 5.9, 0x18b981);
}

function addTableSet(THREE, group, x, z, rng) {
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x5b3b25, roughness: 0.6 });
  const seatMat = new THREE.MeshStandardMaterial({ color: PALETTE[Math.floor(rng() * PALETTE.length)], roughness: 0.52 });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.18, 20), tableMat);
  table.position.set(x, 0.55, z);
  table.castShadow = true;
  group.add(table);
  [[0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95]].forEach(([sx, sz]) => {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.28, 12), seatMat);
    seat.position.set(x + sx, 0.28, z + sz);
    seat.castShadow = true;
    group.add(seat);
  });
}

function addTransitCore(THREE, group, rng) {
  const stairMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.62, metalness: 0.12 });
  for (let i = 0; i < 8; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 0.58), stairMat);
    step.position.set(-2.8, 0.08 + i * 0.13, -2.6 + i * 0.42);
    step.castShadow = true;
    group.add(step);
  }
  const escalator = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.25, 5.4),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.55 })
  );
  escalator.position.set(3.1, 0.75, -0.75);
  escalator.rotation.x = -0.36;
  escalator.castShadow = true;
  group.add(escalator);
  addAreaKiosk(THREE, group, 0, 5.8, 0x06b6d4);
  for (let x = -6; x <= 6; x += 6) addPlant(THREE, group, x, -5.8, rng);
}

function addGardenAtrium(THREE, group, rng) {
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.86 });
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.45, 0.55, 28), planterMat);
  planter.position.set(0, 0.26, 0);
  planter.castShadow = true;
  group.add(planter);
  for (let i = 0; i < 7; i++) {
    const angle = (Math.PI * 2 * i) / 7;
    addPlant(THREE, group, Math.cos(angle) * 1.45, Math.sin(angle) * 1.45, rng, 1.25);
  }
  const skylight = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
  );
  skylight.rotation.x = -Math.PI / 2;
  skylight.position.y = 3.45;
  group.add(skylight);
}

function addHighLimitLounge(THREE, group, rng) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd99a18, roughness: 0.28, metalness: 0.65 });
  [-4.8, 4.8].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 10.8), railMat);
    rail.position.set(x, 0.72, 0);
    rail.castShadow = true;
    group.add(rail);
  });
  addLoungeSeat(THREE, group, -1.8, 5.6, 0x581c87);
  addLoungeSeat(THREE, group, 1.8, 5.6, 0x1e3a8a);
  if (rng() < 0.75) addPlant(THREE, group, 0, -5.8, rng, 1.2);
  const velvet = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.12, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.45 })
  );
  velvet.position.set(0, 1.15, -6.35);
  group.add(velvet);
}

function addRetroArcadeTrim(THREE, group, rng) {
  for (let x = -6; x <= 6; x += 3) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: PALETTE[Math.floor(rng() * PALETTE.length)] })
    );
    strip.position.set(x, 2.4, -8.45);
    group.add(strip);
  }
}

function addLoungeSeat(THREE, group, x, z, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.36, 0.9), mat);
  base.position.set(x, 0.36, z);
  base.castShadow = true;
  group.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.82, 0.18), mat);
  back.position.set(x, 0.85, z + 0.45);
  back.castShadow = true;
  group.add(back);
}

function addAreaKiosk(THREE, group, x, z, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.08 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.8, 0.32), mat);
  post.position.set(x, 0.9, z);
  group.add(post);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 0.18), mat);
  top.position.set(x, 2.0, z);
  group.add(top);
}

function addPlant(THREE, group, x, z, rng, scale = 1) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, 0.36 * scale, 12),
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.78 })
  );
  pot.position.set(x, 0.18 * scale, z);
  pot.castShadow = true;
  group.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: rng() > 0.5 ? 0x16a34a : 0x22c55e, roughness: 0.68 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18 * scale, 0.85 * scale, 8), leafMat);
    const angle = (Math.PI * 2 * i) / 5;
    leaf.position.set(x + Math.cos(angle) * 0.12 * scale, 0.72 * scale, z + Math.sin(angle) * 0.12 * scale);
    leaf.rotation.z = Math.cos(angle) * 0.35;
    leaf.rotation.x = Math.sin(angle) * 0.35;
    leaf.castShadow = true;
    group.add(leaf);
  }
}

function buildAreaLabel(THREE, label) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(3.3, 0.82, 1);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(8, 14, 22, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label.toUpperCase(), canvas.width / 2, 76);
  texture.needsUpdate = true;
  return sprite;
}

function addBotsToChunk(THREE, group, rng, room, machines, chunkKey) {
  if (chunkKey === "0,0") return;
  const botCount = room.id === "foodCourt" ? 2 + Math.floor(rng() * 3)
    : room.id === "transit" ? 1 + Math.floor(rng() * 2)
    : 1 + Math.floor(rng() * 4);
  for (let i = 0; i < botCount; i++) {
    const avatar = botAvatar(rng);
    const botGroup = buildPlayer(THREE, group, avatar);
    const name = BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)];
    const label = buildNameLabel(THREE, name);
    group.add(label);
    const bot = {
      group: botGroup,
      label,
      name,
      avatar,
      chunkKey,
      machines,
      rng,
      walkPhase: rng() * Math.PI * 2,
      state: "wander",
      timer: 1 + rng() * 4,
      target: randomBotTarget(rng),
      seatedMachine: null,
      emote: null,
      emoteLabel: buildEmoteLabel(THREE, ""),
    };
    bot.emoteLabel.visible = false;
    group.add(bot.emoteLabel);
    bot.group.position.set(-6 + rng() * 12, 0, -5 + rng() * 10);
    runtime.bots.push(bot);
  }
}

function addBlackjackTables(THREE, group, rng, room, tables, cx, cz) {
  const count = room.id === "foodCourt" ? 2 : room.id === "highLimit" ? 1 : rng() < 0.38 ? 1 : 0;
  const reserved = room.id === "foodCourt"
    ? [{ x: -4.8, z: -1.8 }, { x: 4.8, z: -1.8 }]
    : room.id === "highLimit"
    ? [{ x: 0, z: 4.1 }]
    : [{ x: -5.4 + rng() * 10.8, z: 4.7 }];
  for (let i = 0; i < count; i++) {
    const pos = reserved[i] || { x: -5 + rng() * 10, z: 4 + rng() * 2 };
    const table = buildBlackjackTable(THREE, group, pos.x, pos.z, room, `${cx}:${cz}:bj:${i}`);
    tables.push(table);
    runtime.tableObjects.push(table);
  }
}

function buildBlackjackTable(THREE, group, localX, localZ, room, id) {
  const tableGroup = new THREE.Group();
  tableGroup.position.set(localX, 0, localZ);
  const felt = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.55, 0.22, 28, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: room.id === "highLimit" ? 0x064e3b : 0x065f46, roughness: 0.58 })
  );
  felt.rotation.y = Math.PI;
  felt.position.y = 0.62;
  felt.castShadow = true;
  tableGroup.add(felt);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.48, 0.62, 18),
    new THREE.MeshStandardMaterial({ color: 0x3f2a18, roughness: 0.62 })
  );
  base.position.y = 0.3;
  tableGroup.add(base);
  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.055, 10, 32, Math.PI),
    new THREE.MeshStandardMaterial({ color: room.id === "highLimit" ? 0xd99a18 : 0x7c2d12, roughness: 0.32, metalness: room.id === "highLimit" ? 0.55 : 0.1 })
  );
  rail.position.y = 0.77;
  rail.rotation.x = Math.PI / 2;
  tableGroup.add(rail);
  const sign = buildAreaLabel(THREE, room.id === "highLimit" ? "HIGH LIMIT BLACKJACK" : "BLACKJACK");
  sign.position.set(0, 1.65, -0.65);
  sign.scale.set(1.85, 0.46, 1);
  tableGroup.add(sign);
  const clickables = [felt, rail, base];
  group.add(tableGroup);
  const table = {
    id,
    name: room.id === "highLimit" ? "High Limit Blackjack" : "Blackjack Table",
    room,
    x: group.position.x + localX,
    z: group.position.z + localZ,
    group: tableGroup,
    clickables,
  };
  clickables.forEach((mesh) => { mesh.userData.blackjackTable = table; });
  return table;
}

function botAvatar(rng) {
  const colors = ["#23335f", "#7f1d1d", "#14532d", "#4c1d95", "#78350f", "#0f766e"];
  const skin = ["#f1c27d", "#c68642", "#8d5524", "#ffdbac", "#e0ac69"];
  return {
    skinTone: skin[Math.floor(rng() * skin.length)],
    bodyColor: colors[Math.floor(rng() * colors.length)],
    limbColor: colors[Math.floor(rng() * colors.length)],
    visorColor: "#101820",
    accentColor: `#${PALETTE[Math.floor(rng() * PALETTE.length)].toString(16).padStart(6, "0")}`,
    style: rng() > 0.82 ? "neon" : rng() > 0.65 ? "armor" : "classic",
    bodyShape: rng() > 0.72 ? "tapered" : "box",
  };
}

function randomBotTarget(rng) {
  return { x: -6.5 + rng() * 13, z: -6 + rng() * 12 };
}

function updateBots(dt) {
  if (!runtime?.bots?.length) return;
  for (const bot of runtime.bots) {
    bot.timer -= dt;
    if (bot.state === "play") {
      updateBotPlaying(bot, dt);
    } else {
      updateBotWalking(bot, dt);
    }
    bot.label.position.set(bot.group.position.x, bot.group.position.y + 2.08, bot.group.position.z);
    updateBotEmote(bot);
  }
}

function updateBotWalking(bot, dt) {
  const dx = bot.target.x - bot.group.position.x;
  const dz = bot.target.z - bot.group.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.25 || bot.timer <= 0) {
    if (bot.machines.length && bot.rng() < 0.48) {
      const machine = bot.machines[Math.floor(bot.rng() * bot.machines.length)];
      bot.state = "play";
      bot.seatedMachine = machine;
      bot.timer = 3 + bot.rng() * 8;
      bot.group.position.set(machine.group.position.x, 0, machine.group.position.z + 1.35);
      bot.group.rotation.y = Math.PI;
      startBotEmote(bot, bot.rng() > 0.5 ? "think" : "wave");
      return;
    }
    bot.target = randomBotTarget(bot.rng);
    bot.timer = 2 + bot.rng() * 6;
    return;
  }
  const speed = 1.25 + bot.rng() * 0.012;
  bot.group.position.x += (dx / dist) * speed * dt;
  bot.group.position.z += (dz / dist) * speed * dt;
  bot.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
  bot.walkPhase += dt * 7;
  applyBotWalk(bot, bot.walkPhase);
  maybeStartBotConversation(bot);
}

function updateBotPlaying(bot) {
  resetBotPose(bot);
  if (bot.timer <= 0) {
    bot.state = "wander";
    bot.seatedMachine = null;
    bot.target = randomBotTarget(bot.rng);
    bot.timer = 2 + bot.rng() * 6;
    if (bot.rng() > 0.55) startBotEmote(bot, bot.rng() > 0.5 ? "jackpot" : "cheer");
  }
}

function applyBotWalk(bot, phase) {
  const parts = bot.group.userData.parts;
  if (!parts) return;
  const swing = Math.sin(phase) * 0.55;
  parts.leftArm.rotation.x = swing;
  parts.rightArm.rotation.x = -swing;
  parts.leftLeg.rotation.x = -swing;
  parts.rightLeg.rotation.x = swing;
}

function resetBotPose(bot) {
  const parts = bot.group.userData.parts;
  if (!parts) return;
  parts.leftArm.rotation.x = 0;
  parts.rightArm.rotation.x = 0;
  parts.leftLeg.rotation.x = 0;
  parts.rightLeg.rotation.x = 0;
}

function startBotEmote(bot, kind) {
  const label = EMOTES[kind] || EMOTES.wave;
  bot.emote = { kind, label, until: performance.now() + 2800 };
  updateEmoteLabel(bot.emoteLabel, label);
  applyEmotePose(bot.group, kind, true);
}

function updateBotEmote(bot) {
  const active = bot.emote && bot.emote.until > performance.now();
  bot.emoteLabel.visible = Boolean(active);
  if (active) {
    bot.emoteLabel.position.set(bot.group.position.x, bot.group.position.y + 2.48, bot.group.position.z);
  } else {
    applyEmotePose(bot.group, "", false);
  }
}

function maybeStartBotConversation(bot) {
  const settings = runtime.botConversation || {};
  if (!settings.enabled) return;
  const now = performance.now();
  const intervalMs = Math.max(4, Number(settings.frequencySeconds || 18)) * 1000;
  if (now - runtime.lastBotConversationAt < intervalMs) return;
  if (bot.rng() > 0.015) return;
  const neighbor = runtime.bots.find((other) => other !== bot && other.chunkKey === bot.chunkKey && Math.hypot(other.group.position.x - bot.group.position.x, other.group.position.z - bot.group.position.z) < 4.2);
  if (!neighbor) return;
  runtime.lastBotConversationAt = now;
  runBotConversation(bot, neighbor);
}

async function runBotConversation(a, b) {
  const settings = runtime.botConversation || {};
  let lineA = BOT_CHAT_LINES[Math.floor(a.rng() * BOT_CHAT_LINES.length)];
  let lineB = BOT_CHAT_LINES[Math.floor(b.rng() * BOT_CHAT_LINES.length)];
  if (settings.useOllama) {
    try {
      const prompt = [
        "Write a tiny two-line casino NPC conversation.",
        "Each line must be under 9 words.",
        "No narration. Format exactly:",
        `${a.name}: ...`,
        `${b.name}: ...`,
        "Topic: slots, blackjack, food court, high limit rooms, or casino luck.",
      ].join("\n");
      const answer = await askOllama({ url: settings.ollamaUrl, model: settings.ollamaModel, prompt });
      const lines = String(answer || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
      lineA = sanitizeBotLine(lines[0]?.replace(new RegExp(`^${a.name}:\\s*`, "i"), "")) || lineA;
      lineB = sanitizeBotLine(lines[1]?.replace(new RegExp(`^${b.name}:\\s*`, "i"), "")) || lineB;
    } catch (error) {
      // Local fallback keeps the floor alive when Ollama is unavailable.
    }
  }
  speakBotLine(a, lineA, "think");
  setTimeout(() => speakBotLine(b, lineB, "wave"), 1200);
}

function sanitizeBotLine(value) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 56);
}

function speakBotLine(bot, line, emoteKind = "think") {
  bot.emote = { kind: emoteKind, label: line, until: performance.now() + 4200 };
  updateEmoteLabel(bot.emoteLabel, line);
  applyEmotePose(bot.group, emoteKind, true);
}

function createMachineDefinition(cx, cz, row, col, rng) {
  const family = SYMBOL_SETS[Math.floor(rng() * SYMBOL_SETS.length)];
  const color = PALETTE[Math.floor(rng() * PALETTE.length)];
  const gameType = GAME_TYPES[Math.floor(rng() * GAME_TYPES.length)];
  const reels = gameType === "classic" ? 3 : rng() > 0.18 ? 5 : 3;
  const style = gameType === "classic" || rng() < 0.38 ? "physical" : "digital";
  const maxLines = reels === 3 ? [1, 3][Math.floor(rng() * 2)] : gameType === "video" ? [15, 20, 25][Math.floor(rng() * 3)] : [5, 9, 15][Math.floor(rng() * 3)];
  const volatility = ["low", "medium", "high"][Math.floor(rng() * 3)];
  const name = `${NAME_LEFT[Math.floor(rng() * NAME_LEFT.length)]} ${NAME_RIGHT[Math.floor(rng() * NAME_RIGHT.length)]}`;
  const premium = family[family.length - 2];
  const wild = family[family.length - 1];
  const progressiveType = gameType === "sap" ? "SAP" : gameType === "wap" ? "WAP" : "";
  const progressiveBase = progressiveType === "WAP" ? 75000 + Math.floor(rng() * 425000) : progressiveType === "SAP" ? 5000 + Math.floor(rng() * 65000) : 0;
  const progressiveOdds = progressiveType === "WAP" ? 85000 + Math.floor(rng() * 120000) : progressiveType === "SAP" ? 9000 + Math.floor(rng() * 30000) : 0;
  const linkedGames = progressiveType === "WAP" ? wapLinkedGames(name, rng) : [];
  return {
    id: `${cx}:${cz}:${row}:${col}`,
    name,
    theme: `${capitalize(volatility)} volatility ${style} ${reels}-reel cabinet`,
    color,
    reels,
    style,
    gameType,
    progressiveType,
    progressiveTotal: progressiveBase,
    progressiveOdds,
    linkedGames,
    freeSpins: 0,
    freeSpinLock: null,
    tamperHeat: 0,
    tamperThreshold: 2 + Math.floor(rng() * 3),
    staffIncidents: 0,
    featureMultiplier: gameType === "multiplier" ? 2 + Math.floor(rng() * 4) : 1,
    maxLines,
    volatility,
    symbols: family,
    weights: family.map((_, index) => Math.max(2, 16 - index * (volatility === "high" ? 2.2 : 1.4))),
    paytable: {
      [wild]: reels === 5 ? 75 : 45,
      [premium]: reels === 5 ? 32 : 22,
      [family[0]]: reels === 5 ? 18 : 12,
      [family[1]]: 10,
      [family[2]]: 7,
      default: gameType === "multiplier" ? 5 : volatility === "low" ? 4 : 3,
    },
  };
}

function wapLinkedGames(sourceName, rng) {
  const count = 3 + Math.floor(rng() * 5);
  return Array.from({ length: count }, (_, index) => {
    const left = NAME_LEFT[Math.floor(rng() * NAME_LEFT.length)];
    const right = NAME_RIGHT[Math.floor(rng() * NAME_RIGHT.length)];
    const share = 6 + Math.floor(rng() * 17);
    return { name: index === 0 ? sourceName : `${left} ${right}`, share };
  });
}

function updateCamera() {
  const { camera, player, seated } = runtime;
  if (seated) {
    camera.position.set(player.position.x, 3.1, player.position.z + 2.7);
    camera.lookAt(player.position.x, 1.25, player.position.z - 1.5);
    return;
  }
  const distance = runtime.cameraDistance;
  const height = 4.2 + runtime.cameraPitch * 2.2;
  camera.position.set(
    player.position.x + Math.sin(runtime.cameraYaw) * distance,
    height,
    player.position.z + Math.cos(runtime.cameraYaw) * distance
  );
  camera.lookAt(player.position.x, 1.0 + runtime.cameraPitch, player.position.z);
}

function updateFocus() {
  if (runtime.seated) return;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const item of runtime.machineObjects) {
    const distance = distanceToMachine(item);
    item.glow.material.opacity = 0.2;
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  let nearestTable = null;
  let nearestTableDistance = Infinity;
  for (const item of runtime.tableObjects) {
    const distance = distanceToTable(item);
    if (distance < nearestTableDistance) {
      nearestTable = item;
      nearestTableDistance = distance;
    }
  }
  if (nearestTable && nearestTableDistance < 2.85 && nearestTableDistance < nearestDistance) {
    setSelectedTable(nearestTable);
    return;
  }
  if (nearest && nearestDistance < 2.9) {
    nearest.glow.material.opacity = 0.9;
    setSelected(nearest.machine);
  } else {
    setSelected(null);
  }
}

function inspectClickedMachine(event) {
  if (runtime.seated) return;
  const rect = runtime.renderer.domElement.getBoundingClientRect();
  runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);
  const meshes = [
    ...runtime.machineObjects.flatMap((item) => item.clickables || []),
    ...runtime.tableObjects.flatMap((item) => item.clickables || []),
  ];
  const hit = runtime.raycaster.intersectObjects(meshes, false)[0];
  if (hit?.object?.userData?.blackjackTable) {
    setSelectedTable(hit.object.userData.blackjackTable);
    return;
  }
  if (!hit?.object?.userData?.machineObject) return;
  const item = hit.object.userData.machineObject;
  setSelected(item.machine);
  item.glow.material.opacity = 0.95;
}

function nearestMachine(maxDistance = Infinity) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const item of runtime.machineObjects) {
    const distance = distanceToMachine(item);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= maxDistance ? nearest : null;
}

function distanceToMachine(item) {
  const dx = runtime.player.position.x - item.machine.x;
  const dz = runtime.player.position.z - item.machine.z;
  return Math.hypot(dx, dz);
}

function distanceToTable(item) {
  const dx = runtime.player.position.x - item.x;
  const dz = runtime.player.position.z - item.z;
  return Math.hypot(dx, dz);
}

function setSelected(machine) {
  if (runtime.selected === machine) return;
  runtime.selected = machine;
  runtime.selectedTable = null;
  updateMachinePanel();
}

function setSelectedTable(table) {
  if (runtime.selectedTable === table) return;
  runtime.selectedTable = table;
  runtime.selected = null;
  updateMachinePanel();
}

function sitAtSelected() {
  if (runtime.selectedTable) {
    runtime.onBlackjackTable?.(runtime.selectedTable);
    return;
  }
  if (!runtime.selected) return;
  runtime.seated = runtime.selected;
  runtime.player.position.set(runtime.selected.x, 0, runtime.selected.z + 1.75);
  runtime.player.rotation.y = Math.PI;
  runtime.keys.clear();
  runtime.info.textContent = `Seated at ${runtime.seated.name}. Pick denomination and paylines, then spin.`;
  document.body.classList.add("slot-seated");
  updateMachinePanel();
  publishPresence("sit", true);
}

function leaveMachine() {
  runtime.seated = null;
  runtime.keys.clear();
  document.body.classList.remove("slot-seated");
  runtime.container.focus();
  updateMachinePanel();
  publishPresence("leave-seat", true);
}

function updateMachinePanel() {
  if (runtime.selectedTable && !runtime.seated) {
    const table = runtime.selectedTable;
    runtime.name.textContent = table.name;
    if (runtime.consoleTitle) runtime.consoleTitle.textContent = table.name;
    runtime.info.textContent = `${table.name}. Sit down to open the blackjack table.`;
    runtime.detail.innerHTML = `<strong>${escapeHtml(table.name)}</strong><span>${table.room.id === "highLimit" ? `${chips(HIGH_LIMIT_CREDIT_REQUIREMENT)} credit room.` : "Table games area."}</span>`;
    runtime.sitButton.disabled = false;
    runtime.sitButton.textContent = "Sit at blackjack";
    runtime.leaveButton.disabled = true;
    runtime.spinButton.disabled = true;
    if (runtime.rulesButton) runtime.rulesButton.disabled = true;
    runtime.machineFace.innerHTML = emptyMachineMarkup();
    runtime.betReadout.textContent = "Blackjack uses the main Table rules.";
    if (runtime.rulesPanel) runtime.rulesPanel.innerHTML = "";
    return;
  }
  const machine = runtime.seated || runtime.selected;
  const seated = Boolean(runtime.seated);
  if (!machine) {
    runtime.name.textContent = "Explore the floor";
    runtime.info.textContent = "Approach a cabinet to inspect it. New chunks generate as you move.";
    runtime.detail.innerHTML = `<strong>No machine selected</strong><span>Cabinets light up when you get close.</span>`;
    runtime.sitButton.disabled = true;
    runtime.sitButton.textContent = "Sit down";
    runtime.leaveButton.disabled = true;
    runtime.spinButton.disabled = true;
    if (runtime.rulesButton) runtime.rulesButton.disabled = true;
    runtime.machineFace.innerHTML = emptyMachineMarkup();
    runtime.paylineSelect.innerHTML = paylineOptions(1);
    if (runtime.rulesPanel) runtime.rulesPanel.innerHTML = "";
    updateBetReadout();
    return;
  }
  runtime.name.textContent = machine.name;
  if (runtime.consoleTitle) runtime.consoleTitle.textContent = machine.name;
  runtime.info.textContent = seated ? `${machine.theme}. You are seated.` : machine.theme;
  runtime.detail.innerHTML = machineDetailMarkup(machine, seated);
  runtime.sitButton.disabled = seated;
  runtime.sitButton.textContent = "Sit down";
  runtime.leaveButton.disabled = !seated;
  runtime.spinButton.disabled = !seated || runtime.spinning;
  if (runtime.rulesButton) runtime.rulesButton.disabled = false;
  runtime.denomSelect.innerHTML = DENOMS.map((denom) => `<option value="${denom}">${denom} pts</option>`).join("");
  runtime.paylineSelect.innerHTML = paylineOptions(machine.maxLines);
  runtime.machineFace.innerHTML = machineFaceMarkup(machine, null);
  updateBetReadout();
}

function updateBetReadout() {
  const machine = runtime.seated || runtime.selected;
  const denom = Number(runtime.denomSelect?.value || 1);
  const lines = Number(runtime.paylineSelect?.value || 1);
  const wager = denom * lines;
  if (!runtime.betReadout) return;
  if (!machine) {
    runtime.betReadout.textContent = "Select a cabinet";
    return;
  }
  const lock = machine.freeSpins > 0 ? freeSpinLock(machine) : null;
  runtime.betReadout.textContent = lock
    ? `${wager} pts per spin | bonus earned at ${lock.denom} x ${lock.lines} | staff heat ${machine.tamperHeat || 0}/${machine.tamperThreshold || 3}`
    : `${wager} pts per spin`;
}

function spinSelected() {
  const machine = runtime.seated;
  if (!machine || runtime.spinning) return;
  runtime.resultBox.classList.remove("staff");
  const denom = Number(runtime.denomSelect.value || 1);
  const lines = Math.min(Number(runtime.paylineSelect.value || 1), machine.maxLines);
  const wager = denom * lines;
  const isFreeSpin = machine.freeSpins > 0;
  let tamperNotice = "";
  if (isFreeSpin && freeSpinTampered(machine, denom, lines)) {
    const tamper = recordFreeSpinTamper(machine, denom, lines);
    if (tamper.caught) {
      handleFreeSpinTamper(machine, denom, lines, tamper);
      return;
    }
    tamperNotice = ` Staff glances over: bonus bracket mismatch noticed (${tamper.heat}/${tamper.threshold}).`;
  }
  if (!isFreeSpin && runtime.getBankroll() < wager) {
    runtime.resultBox.textContent = "Not enough bankroll for that spin.";
    return;
  }
  runtime.spinning = true;
  runtime.spinButton.disabled = true;
  if (isFreeSpin) machine.freeSpins -= 1;
  else runtime.commitBankroll(-wager);
  if (machine.progressiveType && !isFreeSpin) {
    machine.progressiveTotal += Math.max(1, Math.round(wager * (machine.progressiveType === "WAP" ? 0.12 : 0.08)));
  }
  const result = generateSpin(machine, lines, denom, isFreeSpin);
  animateReels(machine, result, () => {
    if (machine.progressiveType && result.progressiveWin) {
      result.win += machine.progressiveTotal;
      machine.progressiveTotal = machine.progressiveType === "WAP" ? 75000 : 5000;
    }
    updateProgressiveLabel(machine);
    if (result.awardedFreeSpins) {
      machine.freeSpins += result.awardedFreeSpins;
      machine.freeSpinLock = { denom, lines, wager };
    }
    runtime.commitBankroll(result.win);
    const feature = result.awardedFreeSpins ? ` Awarded ${result.awardedFreeSpins} free spins.` : result.featureText ? ` ${result.featureText}` : "";
    const net = isFreeSpin ? result.win : result.win - wager;
    runtime.resultBox.textContent = result.win ? `Won ${chips(result.win)} on ${result.hits.length} line(s)${result.progressiveWin ? " plus progressive" : ""}. Net ${chips(net)}.${feature}${tamperNotice}` : `No hit. ${isFreeSpin ? "Free spin used." : `Lost ${chips(wager)}.`}${feature}${tamperNotice}`;
    runtime.spinHistory.unshift({ machine: machine.name, wager: isFreeSpin ? 0 : wager, win: result.win });
    runtime.spinHistory = runtime.spinHistory.slice(0, 5);
    runtime.historyBox.innerHTML = runtime.spinHistory.map((item) => `<p><strong>${escapeHtml(item.machine)}</strong> bet ${chips(item.wager)} won ${chips(item.win)}</p>`).join("");
    runtime.spinning = false;
    runtime.spinButton.disabled = false;
    if (machine.freeSpins <= 0) machine.freeSpinLock = null;
    updateMachinePanel();
  });
}

function freeSpinLock(machine) {
  if (!machine.freeSpinLock) {
    const denom = Number(runtime.denomSelect?.value || 1);
    const lines = Math.min(Number(runtime.paylineSelect?.value || 1), machine.maxLines);
    machine.freeSpinLock = { denom, lines, wager: denom * lines };
  }
  return machine.freeSpinLock;
}

function freeSpinTampered(machine, denom, lines) {
  const lock = freeSpinLock(machine);
  return denom !== Number(lock.denom) || lines !== Number(lock.lines);
}

function recordFreeSpinTamper(machine, denom, lines) {
  const lock = freeSpinLock(machine);
  const attempted = denom * lines;
  const pressure = attempted > (lock.wager || 1) ? 2 : 1;
  machine.tamperHeat = Number(machine.tamperHeat || 0) + pressure;
  const threshold = Number(machine.tamperThreshold || 3);
  return { caught: machine.tamperHeat >= threshold, heat: machine.tamperHeat, threshold, pressure };
}

function handleFreeSpinTamper(machine, denom, lines, tamper = {}) {
  const lock = freeSpinLock(machine);
  const attempted = denom * lines;
  const heat = Number(tamper.heat || machine.tamperHeat || 1);
  const charge = Math.max(100, Math.round(Math.max(attempted, lock.wager || 1) * (8 + heat * 2)));
  machine.staffIncidents = Number(machine.staffIncidents || 0) + 1;
  machine.tamperHeat = 0;
  machine.tamperThreshold = 2 + secureInt(3);
  machine.freeSpins = 0;
  machine.freeSpinLock = null;
  runtime.commitBankroll(-charge);
  runtime.resultBox.classList.add("staff");
  runtime.resultBox.textContent = `Floor staff catches the bracket play: free spins were earned at ${lock.denom} x ${lock.lines}, then pushed to ${denom} x ${lines}. Staff voided the bonus, reset the heat, and charged ${chips(charge)}.`;
  runtime.spinHistory.unshift({ machine: "Floor Staff", wager: charge, win: 0 });
  runtime.spinHistory = runtime.spinHistory.slice(0, 5);
  runtime.historyBox.innerHTML = runtime.spinHistory.map((item) => `<p><strong>${escapeHtml(item.machine)}</strong> ${item.machine === "Floor Staff" ? "charged" : "bet"} ${chips(item.wager)} won ${chips(item.win)}</p>`).join("");
  updateMachinePanel();
}

function generateSpin(machine, activeLines, denom, isFreeSpin = false) {
  const rng = cryptoRng();
  const rows = 3;
  const grid = Array.from({ length: rows }, () => []);
  for (let reel = 0; reel < machine.reels; reel++) {
    for (let row = 0; row < rows; row++) grid[row][reel] = weightedSymbol(machine, rng);
  }
  const lines = linePatterns(machine.reels).slice(0, activeLines);
  const hits = [];
  let win = 0;
  for (const line of lines) {
    const symbols = line.map((row, reel) => grid[row][reel]);
    const base = symbols[0] === "WILD" ? symbols.find((symbol) => symbol !== "WILD") || symbols[0] : symbols[0];
    let count = 0;
    for (const symbol of symbols) {
      if (symbol === base || symbol === "WILD") count++;
      else break;
    }
    if (count >= (machine.reels === 3 ? 3 : 3)) {
      const multiplier = (machine.paytable[base] || machine.paytable.default) * Math.max(1, count - 2);
      const lineWin = denom * multiplier;
      hits.push({ line, base, count, lineWin });
      win += lineWin;
    }
  }
  const scatterSymbols = grid.flat().filter((symbol) => symbol === "BONUS" || symbol === "FREE" || symbol === "COIN").length;
  const featureRoll = rng();
  const nameBoost = /jackpot|dragon|moon|vault|lucky/i.test(machine.name) ? 0.04 : 0;
  const freeSpinTriggered = scatterSymbols >= 3 || (machine.gameType === "freeSpins" && featureRoll < 0.22 + nameBoost) || (["bonus", "megaways", "cascading", "sap", "wap"].includes(machine.gameType) && featureRoll < 0.08 + nameBoost);
  const awardedFreeSpins = freeSpinTriggered && ["bonus", "freeSpins", "megaways", "cascading", "wap", "sap"].includes(machine.gameType) ? Math.max(5, scatterSymbols * 2) : 0;
  let featureText = "";
  if (machine.gameType === "multiplier" && hits.length) {
    win *= machine.featureMultiplier;
    featureText = `${machine.featureMultiplier}x multiplier feature applied.`;
  }
  if (machine.gameType === "bonus" && (scatterSymbols >= 3 || featureRoll < 0.18 + nameBoost)) {
    const bonusWin = denom * activeLines * (10 + Math.max(scatterSymbols, 3) * 4);
    win += bonusWin;
    featureText = `Pick bonus mini-game paid ${chips(bonusWin)}.`;
  }
  if (machine.gameType === "holdRespin" && (scatterSymbols >= 3 || featureRoll < 0.2 + nameBoost)) {
    const respinWin = denom * activeLines * Math.max(scatterSymbols, 3) * 8;
    win += respinWin;
    featureText = `Hold-and-respin coins paid ${chips(respinWin)}.`;
  }
  if (machine.gameType === "megaways" && (hits.length || featureRoll < 0.2 + nameBoost)) {
    const waysWin = denom * Math.max(1, scatterSymbols, 2) * 6;
    win += waysWin;
    featureText = `Megaways-style extra ways paid ${chips(waysWin)}.`;
  }
  if (machine.gameType === "mystery" && featureRoll < 0.24 + nameBoost) {
    const mysteryWin = denom * activeLines * (8 + Math.floor(rng() * 22));
    win += mysteryWin;
    featureText = `Mystery symbol reveal paid ${chips(mysteryWin)}.`;
  }
  if (machine.gameType === "cascading" && (hits.length || featureRoll < 0.18 + nameBoost)) {
    const cascades = 1 + Math.floor(rng() * 4);
    const cascadeWin = denom * activeLines * cascades * 5;
    win += cascadeWin;
    featureText = `${cascades} cascade${cascades === 1 ? "" : "s"} paid ${chips(cascadeWin)}.`;
  }
  if (machine.gameType === "wheelBonus" && featureRoll < 0.16 + nameBoost) {
    const wheelSlices = [10, 15, 20, 35, 50, 75, 100];
    const slice = wheelSlices[Math.floor(rng() * wheelSlices.length)];
    const wheelWin = denom * slice;
    win += wheelWin;
    featureText = `Bonus wheel landed ${slice}x for ${chips(wheelWin)}.`;
  }
  if (machine.gameType === "pickBonus" && featureRoll < 0.18 + nameBoost) {
    const picks = 2 + Math.floor(rng() * 4);
    const pickWin = denom * activeLines * picks * 6;
    win += pickWin;
    featureText = `Pick-a-prize mini game found ${picks} prizes for ${chips(pickWin)}.`;
  }
  if (machine.gameType === "expandingWilds" && (hits.length || featureRoll < 0.2 + nameBoost)) {
    const wildWin = denom * activeLines * 12;
    win += wildWin;
    featureText = `Expanding wild feature paid ${chips(wildWin)}.`;
  }
  if (isFreeSpin && win > 0) {
    win = Math.round(win * 1.5);
    featureText = `${featureText} Free spin boost applied.`.trim();
  }
  const progressiveWin = Boolean(machine.progressiveType && hits.some((hit) => hit.base === "WILD" && hit.count >= machine.reels));
  return { grid, hits, win, progressiveWin, awardedFreeSpins, featureText };
}

function updateProgressiveLabel(machine) {
  const object = runtime.machineObjects.find((item) => item.machine === machine);
  if (!object?.label) return;
  object.group.remove(object.label);
  object.label = buildProgressiveLabel(runtime.THREE, machine);
  object.label.position.set(0, 3.0, 0);
  object.group.add(object.label);
}

function showRulesForSelected() {
  const machine = runtime.seated || runtime.selected;
  if (!machine || !runtime.rulesPanel) return;
  runtime.rulesPanel.innerHTML = slotRulesMarkup(machine);
}

function animateReels(machine, result, done) {
  let tick = 0;
  const spinRng = cryptoRng();
  runtime.resultBox.textContent = "Reels spinning...";
  runtime.machineFace.classList?.add("is-spinning");
  const timer = setInterval(() => {
    tick++;
    const temp = Array.from({ length: 3 }, () => Array.from({ length: machine.reels }, () => weightedSymbol(machine, spinRng)));
    const visibleGrid = temp.map((row, rowIndex) => row.map((symbol, reelIndex) => tick > 4 + reelIndex ? result.grid[rowIndex][reelIndex] : symbol));
    runtime.machineFace.innerHTML = machineFaceMarkup(machine, tick < 12 ? visibleGrid : result.grid, tick < 12);
    if (tick >= 12) {
      clearInterval(timer);
      runtime.machineFace.innerHTML = machineFaceMarkup(machine, result.grid, false, result.hits);
      runtime.machineFace.classList?.remove("is-spinning");
      done();
    }
  }, machine.style === "physical" ? 115 : 80);
}

function buildMachine(THREE, group, machine, localX, localZ) {
  const cabinet = new THREE.Group();
  cabinet.position.set(localX, 0, localZ);
  cabinet.rotation.y = (hash(machine.id) % 5 - 2) * 0.08;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 2.15, 0.82),
    new THREE.MeshStandardMaterial({ color: machine.style === "physical" ? 0x151b22 : 0x202a36, metalness: 0.28, roughness: 0.36 })
  );
  body.position.y = 1.05;
  body.castShadow = true;
  cabinet.add(body);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, machine.style === "physical" ? 0.5 : 0.72, 0.06),
    new THREE.MeshStandardMaterial({ color: machine.color, emissive: machine.color, emissiveIntensity: 0.62 })
  );
  screen.position.set(0, 1.38, 0.43);
  cabinet.add(screen);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.3, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: machine.color, emissiveIntensity: 0.08, roughness: 0.34 })
  );
  panel.position.set(0, 0.82, 0.44);
  cabinet.add(panel);

  const topper = new THREE.Mesh(
    new THREE.BoxGeometry(machine.progressiveType ? 1.15 : 0.9, machine.progressiveType ? 0.36 : 0.22, 0.52),
    new THREE.MeshStandardMaterial({ color: machine.color, emissive: machine.color, emissiveIntensity: 0.35 })
  );
  topper.position.set(0, 2.28, 0.02);
  cabinet.add(topper);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.35, 0.96),
    new THREE.MeshStandardMaterial({ color: 0x0f1720, roughness: 0.5 })
  );
  base.position.y = 0.18;
  cabinet.add(base);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.14, 32),
    new THREE.MeshBasicMaterial({ color: machine.color, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  cabinet.add(glow);

  const leftLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.65, 0.08),
    new THREE.MeshBasicMaterial({ color: machine.color })
  );
  leftLight.position.set(-0.66, 1.18, 0.43);
  cabinet.add(leftLight);
  const rightLight = leftLight.clone();
  rightLight.position.x = 0.66;
  cabinet.add(rightLight);

  let label = null;
  if (machine.progressiveType) {
    label = buildProgressiveLabel(THREE, machine);
    label.position.set(0, 3.0, 0);
    cabinet.add(label);
  }

  const clickables = [body, screen, panel, topper, base];
  group.add(cabinet);
  const object = { machine, group: cabinet, glow, label, clickables };
  clickables.forEach((mesh) => { mesh.userData.machineObject = object; });
  return object;
}

function buildPlayer(THREE, scene, avatar = defaultAvatar()) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: parseColor(avatar.bodyColor), roughness: avatar.style === "armor" ? 0.18 : 0.5, metalness: avatar.style === "armor" ? 0.6 : 0.05 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: parseColor(avatar.skinTone), roughness: avatar.style === "armor" ? 0.32 : 0.62, metalness: avatar.style === "armor" ? 0.15 : 0.0 });
  const limbMaterial = new THREE.MeshStandardMaterial({ color: parseColor(avatar.limbColor), roughness: avatar.style === "armor" ? 0.22 : 0.48, metalness: avatar.style === "armor" ? 0.35 : 0.06 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: parseColor(avatar.visorColor), roughness: 0.25, metalness: 0.2 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: parseColor(avatar.accentColor), emissive: avatar.style === "neon" ? parseColor(avatar.accentColor) : 0x000000, emissiveIntensity: avatar.style === "neon" ? 0.55 : 0.0, roughness: 0.18, metalness: 0.35 });

  const bodyGeometry = avatar.bodyShape === "tapered"
    ? new THREE.BoxGeometry(0.7, 0.98, 0.42)
    : avatar.bodyShape === "armor"
    ? new THREE.BoxGeometry(0.78, 1.06, 0.46)
    : new THREE.BoxGeometry(0.74, 0.94, 0.44);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.8;
  body.castShadow = true;
  group.add(body);

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.5), bodyMaterial);
  shoulders.position.y = 1.22;
  shoulders.castShadow = true;
  group.add(shoulders);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.42), bodyMaterial);
  hips.position.y = 0.29;
  hips.castShadow = true;
  group.add(hips);

  const collisionBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.35, 0.42),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, visible: false })
  );
  collisionBox.position.y = 0.78;
  group.add(collisionBox);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 18), skinMaterial);
  head.position.y = 1.48;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.72 }));
  hair.position.y = 1.55;
  hair.castShadow = true;
  group.add(hair);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.56, 4, 10), limbMaterial);
  leftArm.position.set(-0.48, 0.92, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.48;
  group.add(rightArm);

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 12), skinMaterial);
  leftHand.position.set(-0.5, 0.5, -0.01);
  group.add(leftHand);
  const rightHand = leftHand.clone();
  rightHand.position.x = 0.5;
  group.add(rightHand);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 4, 10), limbMaterial);
  leftLeg.position.set(-0.16, -0.04, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.16;
  group.add(rightLeg);

  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.36), limbMaterial);
  leftFoot.position.set(-0.16, -0.5, -0.08);
  group.add(leftFoot);
  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.16;
  group.add(rightFoot);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.12), visorMaterial);
  visor.position.set(0, 1.5, -0.2);
  group.add(visor);

  const accent = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 12, 24), accentMaterial);
  accent.rotation.x = Math.PI / 2;
  accent.position.set(0, 1.14, 0);
  group.add(accent);

  group.userData.parts = { body, shoulders, hips, collisionBox, head, hair, leftArm, rightArm, leftHand, rightHand, leftLeg, rightLeg, leftFoot, rightFoot, visor, accent };
  applyAvatarToPlayer(group, avatar);
  group.position.set(0, 0, 4.5);
  scene.add(group);
  return group;
}

function parseColor(value) {
  return Number(String(value || "").replace(/^#/, "0x")) || 0x23335f;
}

function defaultAvatar() {
  return {
    skinTone: "#f1c27d",
    bodyColor: "#23335f",
    limbColor: "#42536c",
    visorColor: "#101820",
    accentColor: "#d99a18",
    style: "classic",
    bodyShape: "box",
    showCollision: false,
  };
}

function applyAvatarToPlayer(player, avatar = defaultAvatar()) {
  if (!player?.userData?.parts) return;
  const parts = player.userData.parts;
  const skinColor = parseColor(avatar.skinTone);
  const bodyColor = parseColor(avatar.bodyColor);
  const limbColor = parseColor(avatar.limbColor);
  const visorColor = parseColor(avatar.visorColor);
  const accentColor = parseColor(avatar.accentColor);
  const isNeon = avatar.style === "neon";
  const isArmor = avatar.style === "armor";

  if (parts.head?.material) {
    parts.head.material.color.setHex(skinColor);
    parts.head.material.metalness = isArmor ? 0.2 : 0.0;
    parts.head.material.roughness = isArmor ? 0.35 : 0.62;
  }
  if (parts.body?.material) {
    parts.body.material.color.setHex(bodyColor);
    parts.body.material.roughness = isArmor ? 0.18 : 0.5;
    parts.body.material.metalness = isArmor ? 0.6 : 0.05;
  }
  [parts.shoulders, parts.hips].forEach((part) => {
    if (!part?.material) return;
    part.material.color.setHex(bodyColor);
    part.material.roughness = isArmor ? 0.18 : 0.5;
    part.material.metalness = isArmor ? 0.6 : 0.05;
  });
  if (parts.leftArm?.material) {
    parts.leftArm.material.color.setHex(limbColor);
    parts.leftArm.material.roughness = isArmor ? 0.22 : 0.48;
    parts.leftArm.material.metalness = isArmor ? 0.35 : 0.06;
  }
  if (parts.rightArm?.material) {
    parts.rightArm.material.color.setHex(limbColor);
    parts.rightArm.material.roughness = isArmor ? 0.22 : 0.48;
    parts.rightArm.material.metalness = isArmor ? 0.35 : 0.06;
  }
  [parts.leftHand, parts.rightHand].forEach((part) => {
    if (!part?.material) return;
    part.material.color.setHex(skinColor);
    part.material.roughness = isArmor ? 0.35 : 0.62;
  });
  if (parts.leftLeg?.material) {
    parts.leftLeg.material.color.setHex(limbColor);
    parts.leftLeg.material.roughness = isArmor ? 0.22 : 0.48;
    parts.leftLeg.material.metalness = isArmor ? 0.35 : 0.06;
  }
  if (parts.rightLeg?.material) {
    parts.rightLeg.material.color.setHex(limbColor);
    parts.rightLeg.material.roughness = isArmor ? 0.22 : 0.48;
    parts.rightLeg.material.metalness = isArmor ? 0.35 : 0.06;
  }
  [parts.leftFoot, parts.rightFoot].forEach((part) => {
    if (!part?.material) return;
    part.material.color.setHex(limbColor);
    part.material.roughness = isArmor ? 0.22 : 0.48;
    part.material.metalness = isArmor ? 0.35 : 0.06;
  });
  if (parts.visor?.material) {
    parts.visor.material.color.setHex(visorColor);
    parts.visor.material.roughness = 0.25;
    parts.visor.material.metalness = 0.2;
    parts.visor.material.emissive.setHex(isNeon ? accentColor : 0x000000);
    parts.visor.material.emissiveIntensity = isNeon ? 0.35 : 0.0;
  }
  if (parts.accent?.material) {
    parts.accent.material.color.setHex(accentColor);
    parts.accent.material.emissive.setHex(isNeon ? accentColor : 0x000000);
    parts.accent.material.emissiveIntensity = isNeon ? 0.45 : 0.0;
    parts.accent.material.metalness = isArmor ? 0.45 : 0.35;
  }
  if (parts.collisionBox) {
    parts.collisionBox.visible = Boolean(avatar.showCollision);
  }
}

export function updateSlotsAvatar(avatar) {
  if (!runtime?.player) return;
  runtime.avatar = avatar || defaultAvatar();
  applyAvatarToPlayer(runtime.player, runtime.avatar);
  publishPresence("avatar", true);
}

export function triggerSlotsEmote(kind) {
  if (!runtime?.player) return;
  const label = EMOTES[kind] || EMOTES.wave;
  runtime.localEmote = { kind, label, until: performance.now() + 3200 };
  updateEmoteLabel(runtime.localEmoteLabel, label);
  applyEmotePose(runtime.player, kind, true);
  publishPresence("emote", true);
  setTimeout(() => {
    if (!runtime?.player) return;
    applyEmotePose(runtime.player, kind, false);
    publishPresence("emote-end", true);
  }, 1400);
}

export function updateSlotsPeers(peers = [], selfId = "") {
  if (!runtime?.scene || !runtime?.THREE) return;
  const activeIds = new Set();
  for (const peer of peers) {
    if (!peer?.id || peer.id === selfId) continue;
    activeIds.add(peer.id);
    let remote = runtime.remotePlayers.get(peer.id);
    if (!remote) {
      remote = buildRemotePlayer(runtime.THREE, runtime.scene, peer);
      runtime.remotePlayers.set(peer.id, remote);
    }
    updateRemotePlayer(remote, peer);
  }
  for (const [id, remote] of runtime.remotePlayers.entries()) {
    if (activeIds.has(id)) continue;
    runtime.scene.remove(remote.group);
    runtime.scene.remove(remote.label);
    runtime.scene.remove(remote.emoteLabel);
    runtime.remotePlayers.delete(id);
  }
}

function publishPresence(reason = "move", force = false) {
  if (!runtime?.onPresence || !runtime.player) return;
  const now = performance.now();
  const state = slotPresenceState();
  const snapshot = JSON.stringify(state);
  if (!force && (now - runtime.lastPresenceAt < 250 || snapshot === runtime.lastPresenceSnapshot)) return;
  runtime.lastPresenceAt = now;
  runtime.lastPresenceSnapshot = snapshot;
  runtime.onPresence(state, reason);
}

function slotPresenceState() {
  return {
    position: {
      x: Number(runtime.player.position.x.toFixed(3)),
      y: Number(runtime.player.position.y.toFixed(3)),
      z: Number(runtime.player.position.z.toFixed(3)),
    },
    rotationY: Number(runtime.player.rotation.y.toFixed(3)),
    seatedMachineId: runtime.seated?.id || "",
    selectedMachineId: runtime.selected?.id || "",
    emote: runtime.localEmote && runtime.localEmote.until > performance.now()
      ? { kind: runtime.localEmote.kind, label: runtime.localEmote.label, until: Date.now() + Math.max(250, runtime.localEmote.until - performance.now()) }
      : null,
  };
}

function buildRemotePlayer(THREE, scene, peer) {
  const group = buildPlayer(THREE, scene, peer.avatar || defaultAvatar());
  group.userData.remote = true;
  const label = buildNameLabel(THREE, peer.username || "Guest");
  const emoteLabel = buildEmoteLabel(THREE, "");
  emoteLabel.visible = false;
  scene.add(label);
  scene.add(emoteLabel);
  return { group, label, emoteLabel, username: "", emote: null };
}

function updateRemotePlayer(remote, peer) {
  const position = peer.position || {};
  const x = Number(position.x || 0);
  const y = Number(position.y || 0);
  const z = Number(position.z || 0);
  remote.group.position.set(x, y, z);
  remote.group.rotation.y = Number(peer.rotationY || 0);
  applyAvatarToPlayer(remote.group, peer.avatar || defaultAvatar());
  const username = peer.username || "Guest";
  if (remote.username !== username) {
    remote.username = username;
    updateNameLabel(remote.label, username);
  }
  remote.label.position.set(x, y + 2.1, z);
  if (peer.emote?.label) {
    const until = Number(peer.emote.until || 0);
    remote.emote = { label: peer.emote.label, until };
    updateEmoteLabel(remote.emoteLabel, peer.emote.label);
    applyEmotePose(remote.group, peer.emote.kind, until > Date.now());
  } else {
    remote.emote = null;
    applyEmotePose(remote.group, "", false);
  }
}

function applyEmotePose(player, kind, active) {
  const parts = player?.userData?.parts;
  if (!parts) return;
  if (!active) {
    parts.leftArm.rotation.z = 0;
    parts.rightArm.rotation.z = 0;
    parts.leftArm.rotation.x = 0;
    parts.rightArm.rotation.x = 0;
    return;
  }
  if (kind === "wave") {
    parts.rightArm.rotation.z = -1.35;
    parts.rightArm.rotation.x = -0.55;
  } else if (kind === "cheer" || kind === "jackpot") {
    parts.leftArm.rotation.z = 1.25;
    parts.rightArm.rotation.z = -1.25;
    parts.leftArm.rotation.x = -0.35;
    parts.rightArm.rotation.x = -0.35;
  } else {
    parts.leftArm.rotation.x = 0.85;
    parts.rightArm.rotation.x = 0.85;
  }
}

function buildNameLabel(THREE, username) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.9, 0.72, 1);
  updateNameLabel(sprite, username);
  return sprite;
}

function updateNameLabel(sprite, username) {
  const canvas = sprite.material.map.image;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(8, 14, 22, 0.82)";
  roundRect(ctx, 12, 18, canvas.width - 24, 56, 14);
  ctx.fill();
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(username).slice(0, 18), canvas.width / 2, 54);
  sprite.material.map.needsUpdate = true;
}

function buildEmoteLabel(THREE, label) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 112;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.6, 0.78, 1);
  updateEmoteLabel(sprite, label);
  return sprite;
}

function updateEmoteLabel(sprite, label) {
  if (!sprite?.material?.map?.image) return;
  const canvas = sprite.material.map.image;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!label) {
    sprite.material.map.needsUpdate = true;
    return;
  }
  ctx.fillStyle = "rgba(250, 204, 21, 0.92)";
  roundRect(ctx, 18, 16, canvas.width - 36, 64, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(8, 14, 22, 0.8)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#111827";
  ctx.font = label.length > 18 ? "800 17px sans-serif" : "900 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, canvas.width / 2, 56, canvas.width - 44);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 14, 78);
  ctx.lineTo(canvas.width / 2 + 14, 78);
  ctx.lineTo(canvas.width / 2, 100);
  ctx.closePath();
  ctx.fill();
  sprite.material.map.needsUpdate = true;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function buildProgressiveLabel(THREE, machine) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(8, 14, 22, 0.86)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `#${machine.color.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = "#facc15";
  ctx.font = "900 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${machine.progressiveType} PROGRESSIVE`, canvas.width / 2, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 44px sans-serif";
  ctx.fillText(chips(machine.progressiveTotal), canvas.width / 2, 112);
  ctx.fillStyle = "#dbeafe";
  ctx.font = "800 20px sans-serif";
  ctx.fillText(`Hit chance ${progressiveChance(machine)}`, canvas.width / 2, 144);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(2.7, 0.84, 1);
  return sprite;
}

function machineDetailMarkup(machine, seated) {
  const progressive = machine.progressiveType ? `<span>${machine.progressiveType}: ${chips(machine.progressiveTotal)} progressive jackpot | hit chance ${progressiveChance(machine)}</span>` : "";
  const wap = machine.progressiveType === "WAP" ? `<span>Linked: ${machine.linkedGames.map((item) => `${escapeHtml(item.name)} ${item.share}%`).join(", ")}</span>` : "";
  return `
    <strong>${escapeHtml(machine.name)}</strong>
    <span>${escapeHtml(machine.theme)}</span>
    <span>${machine.reels} reels | up to ${machine.maxLines} paylines | ${machine.style} reels | ${machine.gameType}</span>
    ${progressive}
    ${wap}
    <span>Free spins bank: ${machine.freeSpins || 0}${machine.freeSpinLock ? ` | earned at ${machine.freeSpinLock.denom} x ${machine.freeSpinLock.lines}` : ""}</span>
    ${machine.freeSpinLock ? `<span>Staff heat: ${machine.tamperHeat || 0}/${machine.tamperThreshold || 3}</span>` : ""}
    ${machine.staffIncidents ? `<span>Staff incidents: ${machine.staffIncidents}</span>` : ""}
    <span>${seated ? "Seated: choose wager settings and spin." : "Stand close and sit to play."}</span>
  `;
}

function emptyMachineMarkup() {
  return `<div class="slot-machine-empty">Find a cabinet to see its game face.</div>`;
}

function machineFaceMarkup(machine, grid, spinning = false, hits = []) {
  const rows = grid || Array.from({ length: 3 }, (_, row) => Array.from({ length: machine.reels }, (_, reel) => machine.symbols[(row + reel) % machine.symbols.length]));
  const hitRows = new Set(hits.flatMap((hit) => hit.line.map((row, reel) => `${row}:${reel}`)));
  const progressive = machine.progressiveType ? `<div class="slot-progressive-chip">${machine.progressiveType} ${chips(machine.progressiveTotal)}</div>` : "";
  const freeSpinChip = machine.freeSpins ? `<div class="slot-free-chip">${machine.freeSpins} free spins banked${machine.freeSpinLock ? ` | earned ${machine.freeSpinLock.denom} x ${machine.freeSpinLock.lines} | heat ${machine.tamperHeat || 0}/${machine.tamperThreshold || 3}` : ""}</div>` : "";
  return `
    <div class="slot-machine-face ${machine.style} ${machine.gameType} ${spinning ? "spinning" : ""} ${hits.length ? "has-win" : ""}" style="--machine-color:#${machine.color.toString(16).padStart(6, "0")}">
      <div class="slot-machine-title">${escapeHtml(machine.name)}</div>
      ${progressive}
      ${freeSpinChip}
      <div class="slot-reels" style="grid-template-columns:repeat(${machine.reels}, minmax(44px, 1fr))">
        ${rows.map((row, rowIndex) => row.map((symbol, reelIndex) => `<span class="${hitRows.has(`${rowIndex}:${reelIndex}`) ? "hit" : ""}" title="${escapeHtml(symbol)}">${escapeHtml(SYMBOL_ART[symbol] || symbol)}</span>`).join("")).join("")}
      </div>
      <small>${machine.maxLines} line ${machine.volatility} variance ${machine.gameType} game</small>
    </div>
  `;
}

function slotRulesMarkup(machine) {
  const rows = Object.entries(machine.paytable).map(([symbol, amount]) => `<tr><td>${escapeHtml(SYMBOL_ART[symbol] || symbol)}</td><td>${amount}x denom per qualifying line</td></tr>`).join("");
  const progressive = machine.progressiveType ? `
    <p><strong>${machine.progressiveType} progressive:</strong> ${chips(machine.progressiveTotal)}. Estimated jackpot hit chance per spin: ${progressiveChance(machine)}.</p>
    ${machine.progressiveType === "WAP" ? `<p><strong>Linked games:</strong> ${machine.linkedGames.map((item) => `${escapeHtml(item.name)} contributes ${item.share}%`).join("; ")}.</p>` : ""}
  ` : "";
  return `
    <div class="slot-rules-panel">
      <h3>${escapeHtml(machine.name)} Rules</h3>
      <p>${escapeHtml(machine.theme)}. ${machine.gameType} game with ${machine.reels} reels and up to ${machine.maxLines} paylines.</p>
      <p>Three or more matching symbols from the left pay. WILD substitutes for line wins. BONUS, FREE, or COIN scatters can award features.</p>
      <p><strong>Features:</strong> ${featureDescription(machine)}</p>
      ${progressive}
      <table><thead><tr><th>Symbol</th><th>Pays</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `;
}

function featureDescription(machine) {
  const map = {
    classic: "Simple line pays with physical-reel style pacing.",
    video: "More paylines and wider symbol coverage.",
    bonus: "Three or more scatters can trigger a pick-style bonus credit award.",
    multiplier: `${machine.featureMultiplier}x multiplier applies to winning spins.`,
    freeSpins: "Three or more FREE/BONUS scatters award banked free spins.",
    holdRespin: "Three or more COIN/BONUS scatters trigger a hold-and-respin style feature award.",
    megaways: "Winning spins can add extra ways-style feature credits.",
    mystery: "A mystery symbol reveal can award a surprise credit bonus.",
    cascading: "Wins or feature rolls can trigger cascading-style repeat pays and free spins.",
    wheelBonus: "Feature spins can launch a wheel bonus with a random multiplier slice.",
    pickBonus: "Feature spins can open a pick-a-prize mini game.",
    expandingWilds: "Wild features can expand across reels for extra pays.",
    sap: "Standalone progressive jackpot fed by this cabinet only.",
    wap: "Wide area progressive jackpot linked to multiple generated cabinets.",
  };
  return map[machine.gameType] || "Generated slot game.";
}

function progressiveChance(machine) {
  if (!machine.progressiveOdds) return "n/a";
  return `${(100 / machine.progressiveOdds).toFixed(4)}%`;
}

function paylineOptions(maxLines) {
  return [1, 3, 5, 9, 15, 20, 25].filter((line) => line <= maxLines).map((line) => `<option value="${line}">${line} line${line === 1 ? "" : "s"}</option>`).join("");
}

function linePatterns(reels) {
  const patterns = [
    Array(reels).fill(1),
    Array(reels).fill(0),
    Array(reels).fill(2),
    Array.from({ length: reels }, (_, i) => i % 2 === 0 ? 0 : 1),
    Array.from({ length: reels }, (_, i) => i % 2 === 0 ? 2 : 1),
    Array.from({ length: reels }, (_, i) => i % 2 === 0 ? 1 : 0),
    Array.from({ length: reels }, (_, i) => i % 2 === 0 ? 1 : 2),
    Array.from({ length: reels }, (_, i) => i % 3),
    Array.from({ length: reels }, (_, i) => 2 - (i % 3)),
    Array.from({ length: reels }, (_, i) => i < reels / 2 ? 0 : 2),
    Array.from({ length: reels }, (_, i) => i < reels / 2 ? 2 : 0),
    Array.from({ length: reels }, (_, i) => Math.abs(2 - i) % 3),
    Array.from({ length: reels }, (_, i) => Math.abs(1 - i) % 3),
    Array.from({ length: reels }, (_, i) => i % 2),
    Array.from({ length: reels }, (_, i) => 2 - (i % 2)),
  ];
  return patterns;
}

function weightedSymbol(machine, rng) {
  const total = machine.weights.reduce((sum, item) => sum + item, 0);
  let roll = rng() * total;
  for (let i = 0; i < machine.symbols.length; i++) {
    roll -= machine.weights[i];
    if (roll <= 0) return machine.symbols[i];
  }
  return machine.symbols[0];
}

function resize(state) {
  const rect = state.container.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(360, rect.height);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
}

function cryptoRng() {
  return () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  };
}

function secureInt(maxExclusive) {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function chips(value) {
  return `${Math.round(Number(value || 0)).toLocaleString()} pts`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
