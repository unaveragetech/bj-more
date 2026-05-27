const KEY = "blackjack-lab-v1";

export function loadLab() {
  let raw = "";
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = "";
  }
  if (raw) {
    try {
      return normalizeLab(JSON.parse(raw));
    } catch {
      const seeded = defaultLab();
      saveLab(seeded);
      return seeded;
    }
  }
  const seeded = defaultLab();
  saveLab(seeded);
  return seeded;
}

export function saveLab(lab) {
  try {
    const persisted = {
      ...lab,
      multiplayer: {
        serverUrl: lab.multiplayer?.serverUrl || "ws://localhost:9000",
        username: lab.multiplayer?.username || "",
        mode: lab.multiplayer?.mode || "local",
        status: lab.multiplayer?.status || "offline",
        connected: false,
        playerId: lab.multiplayer?.playerId || "",
        slotPlayers: [],
      },
    };
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    // Local training state is best-effort when browser storage is unavailable.
  }
}

export function resetLab() {
  const seeded = defaultLab();
  saveLab(seeded);
  return seeded;
}

function defaultLab() {
  return {
    activeView: "table",
    economyDefaultsV2: true,
    bankroll: 5000,
    runningCount: 0,
    trueCount: 0,
    rules: {
      decks: 6,
      penetration: 75,
      dealerHitsSoft17: false,
      blackjackPayout: 1.5,
      regularPayout: 1,
      doubleAfterSplit: true,
      allowSurrender: true,
      allowResplitAces: false,
      maxSplitHands: 4,
      dealerPeek: true,
      maxBet: 50000,
      minBet: 1,
      dealerMode: "rules",
      ollamaModel: "gemma3:latest",
      ollamaUrl: "http://localhost:11434",
      bankPrompt: "",
      botConversationsEnabled: true,
      botConversationsUseOllama: false,
      botConversationFrequencySeconds: 18,
      botBankrollMin: 2000,
      botBankrollMax: 10000,
    },
    ollamaModels: [],
    shoe: [],
    discard: [],
    round: null,
    ui: {
      showShoeChart: true,
    },
    bank: {
      model: "jessup-sim:latest",
      policy: {
        kindness: 25,
        cooldownMinutes: 10,
        minLoan: 100,
        maxLoan: 2500,
        minInterest: 12,
        maxInterest: 35,
        minDueMinutes: 10,
        maxDueMinutes: 60,
        grantMax: 100,
        autoUnlockBankroll: 10000,
        atmApr: 6,
      },
      clock: {
        startedAt: new Date().toISOString(),
      },
      atm: {
        balance: 1000,
        lastInterestAt: new Date().toISOString(),
      },
      lastMessage: "The teller is available if you need house credit.",
      notifications: [],
      loans: [],
      history: [],
      pendingOffer: null,
      trust: 50,
      trustHistory: [],
      nextEligibleAt: "",
    },
    drink: {
      thirst: 100,
      intoxication: 0,
      luckBoostUntil: "",
      luckBoostPercent: 0,
      lastTickAt: new Date().toISOString(),
      purchases: [],
    },
    security: {
      heat: 0,
      blackoutUntil: "",
      ejectedUntil: "",
      lastIncident: "",
      incidents: [],
    },
    roulette: {
      betType: "red",
      number: 7,
      amount: 25,
      lastSpin: null,
      history: [],
    },
    auto: {
      running: false,
      mode: "pro",
      bettingMode: "smart",
      spreadUnits: 3,
      bankrollRiskPct: 2,
      strategyRules: {
        pair2: "always",
        pair3: "2-7",
        pair4: "5-6",
        pair6: "2-6",
        pair7: "2-7",
        pair8: "always",
        pair9: "2-6,8-9",
        pair10: "never",
        pairA: "always",
        surrender16: true,
        surrender15v10: true,
      },
      handsTarget: 25,
      handsPlayed: 0,
      bet: 100,
      speedMs: 900,
      log: [],
      currentRun: null,
      visual: null,
      strategyUpgradeV2: true,
      strategyUpgradeV3: true,
      strategyUpgradeV4: true,
      strategyUpgradeV5: true,
    },
    history: [],
    adviceLog: [],
    decisionRows: [],
    autoRuns: [],
    keno: {
      denom: 5,
      activeCard: 0,
      cards: [{ picks: [] }],
      lastDraw: [],
      revealedDraw: [],
      lastHits: [],
      message: "",
      animating: false,
      history: [],
    },
    avatar: {
      skinTone: "#f1c27d",
      bodyColor: "#23335f",
      limbColor: "#42536c",
      visorColor: "#101820",
      accentColor: "#d99a18",
      style: "classic",
      bodyShape: "box",
      showCollision: false,
    },
    avatarPresets: [],
    multiplayer: {
      serverUrl: "ws://localhost:9000",
      username: "",
      connected: false,
      playerId: "",
      status: "offline",
      mode: "local",
      rooms: [],
      room: null,
      slotPlayers: [],
    },
    tablePlayers: 1,
  };
}

function normalizeLab(lab) {
  const defaults = defaultLab();
  const wasAutoRunning = Boolean(lab.auto?.running);
  const needsStrategyUpgrade = !lab.auto?.strategyUpgradeV2;
  const needsStableProUpgrade = !lab.auto?.strategyUpgradeV3;
  const needsProfileRepair = !lab.auto?.strategyUpgradeV4;
  const needsLogRepair = !lab.auto?.strategyUpgradeV5;
  lab.rules = { ...defaults.rules, ...(lab.rules || {}) };
  lab.rules.botConversationsEnabled = lab.rules.botConversationsEnabled ?? defaults.rules.botConversationsEnabled;
  lab.rules.botConversationsUseOllama = lab.rules.botConversationsUseOllama ?? defaults.rules.botConversationsUseOllama;
  lab.rules.botConversationFrequencySeconds = Math.max(4, Number(lab.rules.botConversationFrequencySeconds || defaults.rules.botConversationFrequencySeconds));
  if (!lab.rules.ollamaModel || lab.rules.ollamaModel === "llama3.1") {
    lab.rules.ollamaModel = defaults.rules.ollamaModel;
  }
  lab.ollamaModels ??= [];
  lab.shoe ??= [];
  lab.discard ??= [];
  lab.round ??= null;
  lab.ui = { ...defaults.ui, ...(lab.ui || {}) };
  lab.bank = { ...defaults.bank, ...(lab.bank || {}) };
  lab.bank.policy = { ...defaults.bank.policy, ...(lab.bank.policy || {}) };
  normalizeBankPolicy(lab.bank.policy);
  lab.bank.clock = { ...defaults.bank.clock, ...(lab.bank.clock || {}) };
  lab.bank.atm = { ...defaults.bank.atm, ...(lab.bank.atm || {}) };
  lab.avatar = { ...defaults.avatar, ...(lab.avatar || {}) };
  lab.avatar.bodyShape = lab.avatar.bodyShape || defaults.avatar.bodyShape;
  lab.avatarPresets = Array.isArray(lab.avatarPresets) ? lab.avatarPresets : [];
  if (!lab.economyDefaultsV2) {
    if (Number(lab.bankroll) === 10000) lab.bankroll = defaults.bankroll;
    if (Number(lab.bank.atm.balance || 0) === 0) lab.bank.atm.balance = defaults.bank.atm.balance;
    lab.economyDefaultsV2 = true;
  }
  lab.bank.notifications ??= [];
  lab.bank.loans ??= [];
  lab.bank.history ??= [];
  lab.bank.pendingOffer ??= null;
  lab.bank.trust ??= defaults.bank.trust;
  lab.bank.trustHistory ??= [];
  lab.drink = { ...defaults.drink, ...(lab.drink || {}) };
  lab.drink.intoxication = clamp(Number(lab.drink.intoxication || 0), 0, 100);
  lab.drink.luckBoostPercent = clamp(Number(lab.drink.luckBoostPercent || 0), 0, 12);
  lab.drink.luckBoostUntil = lab.drink.luckBoostUntil || "";
  lab.security = { ...defaults.security, ...(lab.security || {}) };
  lab.security.heat = clamp(Number(lab.security.heat || 0), 0, 100);
  lab.security.incidents = Array.isArray(lab.security.incidents) ? lab.security.incidents : [];
  lab.roulette = { ...defaults.roulette, ...(lab.roulette || {}) };
  lab.roulette.history = Array.isArray(lab.roulette.history) ? lab.roulette.history : [];
  lab.rules.botBankrollMin = Math.max(0, Number(lab.rules.botBankrollMin ?? defaults.rules.botBankrollMin));
  lab.rules.botBankrollMax = Math.max(lab.rules.botBankrollMin, Number(lab.rules.botBankrollMax ?? defaults.rules.botBankrollMax));
  lab.tablePlayers = Math.max(1, Math.min(4, Number(lab.tablePlayers || defaults.tablePlayers)));
  lab.tablePlayersInfo = Array.isArray(lab.tablePlayersInfo) ? lab.tablePlayersInfo : [];
  lab.drink.purchases ??= [];
  lab.auto = { ...defaults.auto, ...(lab.auto || {}) };
  lab.auto.strategyRules = { ...defaults.auto.strategyRules, ...(lab.auto.strategyRules || {}) };
  if (needsStrategyUpgrade && lab.auto.mode === "basic") {
    lab.auto.mode = "pro";
  }
  if (needsStableProUpgrade && ["pro", "adaptive", "high", "advantage"].includes(lab.auto.mode)) {
    lab.auto.mode = "pro";
    lab.auto.bettingMode = "smart";
    lab.auto.spreadUnits = 3;
    lab.auto.bankrollRiskPct = 2;
  }
  if (needsProfileRepair && ["adaptive", "high", "advantage"].includes(lab.auto.mode) && ["kelly", "count"].includes(lab.auto.bettingMode)) {
    lab.auto.mode = "pro";
    lab.auto.bettingMode = "smart";
    lab.auto.spreadUnits = 3;
    lab.auto.bankrollRiskPct = 2;
    lab.auto.log = ["Auto profile repaired to stable Pro EV with smart betting."];
  }
  if (needsLogRepair && lab.auto.mode === "pro" && lab.auto.bettingMode === "smart") {
    lab.auto.log = ["Auto profile repaired to stable Pro EV with smart betting."];
  }
  lab.auto.strategyUpgradeV2 = true;
  lab.auto.strategyUpgradeV3 = true;
  lab.auto.strategyUpgradeV4 = true;
  lab.auto.strategyUpgradeV5 = true;
  lab.auto.running = false;
  lab.auto.currentRun = null;
  lab.auto.visual ??= null;
  if (wasAutoRunning) lab.round = null;
  if (lab.activeView === "auto" && lab.auto.handsPlayed >= lab.auto.handsTarget && lab.round?.state !== "done") {
    lab.round = null;
  }
  lab.multiplayer = {
    serverUrl: lab.multiplayer?.serverUrl || defaults.multiplayer.serverUrl,
    username: lab.multiplayer?.username || defaults.multiplayer.username,
    connected: false,
    playerId: lab.multiplayer?.playerId || defaults.multiplayer.playerId,
    status: "offline",
    mode: lab.multiplayer?.mode || defaults.multiplayer.mode,
    rooms: [],
    room: null,
    slotPlayers: [],
  };
  lab.history ??= [];
  lab.adviceLog ??= [];
  lab.decisionRows ??= [];
  lab.autoRuns ??= [];
  lab.keno = { ...defaults.keno, ...(lab.keno || {}) };
  if (!lab.keno.cards) lab.keno.cards = [{ picks: [...(lab.keno.picks || [])] }];
  lab.keno.cards.forEach((card) => { card.picks ??= []; });
  lab.keno.activeCard = Math.min(Math.max(0, Number(lab.keno.activeCard || 0)), lab.keno.cards.length - 1);
  lab.keno.lastDraw ??= [];
  lab.keno.revealedDraw ??= [];
  lab.keno.lastHits ??= [];
  lab.keno.animating = false;
  lab.keno.history ??= [];
  return lab;
}

function normalizeBankPolicy(policy) {
  policy.kindness = clamp(Number(policy.kindness || 0), 0, 100);
  policy.cooldownMinutes = Math.max(1, Number(policy.cooldownMinutes || 1));
  policy.minLoan = Math.max(1, Number(policy.minLoan || 1));
  policy.maxLoan = Math.max(policy.minLoan, Number(policy.maxLoan || policy.minLoan));
  policy.minInterest = Math.max(0, Number(policy.minInterest || 0));
  policy.maxInterest = Math.max(policy.minInterest, Number(policy.maxInterest || policy.minInterest));
  policy.minDueMinutes = Math.max(1, Number(policy.minDueMinutes || 1));
  policy.maxDueMinutes = Math.max(policy.minDueMinutes, Number(policy.maxDueMinutes || policy.minDueMinutes));
  policy.grantMax = Math.max(0, Number(policy.grantMax || 0));
  policy.autoUnlockBankroll = Math.max(0, Number(policy.autoUnlockBankroll || 0));
  policy.atmApr = clamp(Number(policy.atmApr || 0), 0, 50);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
