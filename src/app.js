import { RANKS, cardText, canSplit, handValue, hiLoValue, isBlackjack, isSoft, splitValue } from "./cards.js?v=2";
import {
  activeHand,
  canAct,
  dealerTurn,
  discardRound,
  doubleDown,
  ensureShoe,
  hit,
  split,
  stand,
  startRound,
  surrender,
} from "./game.js?v=6";
import { askOllama, bankPrompt, coachPrompt, listOllamaModels, outcomePrompt, defaultBankPrompt, defaultCoachPrompt } from "./ollama.js?v=3";
import { basicStrategy, explainStrategy, professionalStrategy } from "./strategy.js?v=4";
import { initSlotsWorld, destroySlotsWorld, updateSlotsAvatar, updateSlotsPeers, triggerSlotsEmote } from "./slots.js?v=20";
import { loadLab, resetLab, saveLab } from "./storage.js?v=20";
import { initNetwork, connectServer, disconnectServer, createRoom, joinRoom, leaveRoom, sendNetworkBet, sendNetworkAction, sendNetworkChat, sendNetworkAvatar, sendSlotEnter, sendSlotState, sendSlotLeave, validateServerUrl } from "./network.js?v=4";

let lab = loadLab();
normalizeBankPolicy();
initNetwork(handleNetworkEvent);
const launchConnect = applyLaunchParams();
const app = document.querySelector("#app");
const nav = document.querySelector("nav");
const bankrollLabel = document.querySelector("#bankrollLabel");
let autoTimer = null;
let kenoTimer = null;
const DENOM_OPTIONS = [1, 5, 10, 25, 50, 100];
const KENO_PAYTABLE = { 0: 0, 1: 0, 2: 0, 3: 1, 4: 2, 5: 5, 6: 20, 7: 100, 8: 1000, 9: 5000, 10: 25000 };
const BOT_NAMES = ["Mara", "Rico", "Jules", "Rin", "Tess", "Noor", "Cal", "Ivy", "Ezra", "Pax"];

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function ensureTablePlayersInfo() {
  const count = Math.max(1, Math.min(4, Number(lab.tablePlayers || 1)));
  const minBankroll = Math.max(0, Number(lab.rules.botBankrollMin || 2000));
  const maxBankroll = Math.max(minBankroll, Number(lab.rules.botBankrollMax || 10000));
  lab.tablePlayersInfo = Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return { id: "you", name: "You", bankroll: lab.bankroll, isBot: false };
    }
    const existing = lab.tablePlayersInfo?.[index];
    const bankroll = existing?.isBot ? Number(existing.bankroll) : randomRange(minBankroll, maxBankroll);
    return { id: `bot_${index}`, name: BOT_NAMES[(index - 1) % BOT_NAMES.length], bankroll, isBot: true };
  });
}

function loadPlayers() {
  ensureTablePlayersInfo();
  toast(`Loaded ${lab.tablePlayersInfo.length} table ${lab.tablePlayersInfo.length === 1 ? "player" : "players"}.`, "good");
}

function playersPanelMarkup() {
  if (lab.tablePlayers <= 1) return "";
  const players = lab.tablePlayersInfo.length ? lab.tablePlayersInfo : [];
  const rows = players.length
    ? players.map((player, idx) => `
        <div class="player-row ${player.isBot ? "bot-player" : "user-player"}">
          <span>${idx === 0 ? "You" : escapeHtml(player.name)}</span>
          <strong>${player.isBot ? chips(player.bankroll) : chips(lab.bankroll)}</strong>
          <small>${player.isBot ? "Bot bankroll" : "Your bankroll"}</small>
        </div>
      `).join("")
    : `<p class="fine">No players loaded yet. Click Load players to spawn the table.</p>`;
  return `
    <div class="players-panel">
      <div class="players-panel-head">
        <strong>Table players</strong>
      </div>
      ${rows}
    </div>
  `;
}

function tablePlayersMarkup(round) {
  if (lab.tablePlayers <= 1) return "";
  const players = lab.tablePlayersInfo.length
    ? lab.tablePlayersInfo
    : Array.from({ length: lab.tablePlayers }, (_, idx) => ({ id: `seat_${idx}`, name: idx === 0 ? "You" : `Seat ${idx + 1}`, bankroll: idx === 0 ? lab.bankroll : 0, isBot: idx > 0 }));
  return `
    <section class="table-players">
      <div class="section-head"><h3>Table seats</h3><button id="loadPlayers" class="secondary">Load players</button></div>
      <div class="player-seat-grid">
        ${players.map((player, idx) => {
          const hand = round?.hands?.[idx];
          const cards = hand?.cards?.length ? hand.cards.map((card, cidx) => cardMarkup(card, false, cidx)).join("") : "";
          return `
            <div class="player-seat ${player.isBot ? "bot-seat" : "user-seat"} ${round?.currentHand === idx && round?.state === "playing" ? "current-seat" : ""}">
              <div class="seat-label">
                <strong>${escapeHtml(player.name)}</strong>
                ${player.isBot ? "<span class='badge'>BOT</span>" : "<span class='badge'>YOU</span>"}
              </div>
              <div class="seat-bankroll">${chips(player.isBot ? player.bankroll : lab.bankroll)}</div>
              <div class="seat-chips">${chipStack(player.isBot ? player.bankroll : lab.bankroll)}</div>
              ${cards ? `<div class="seat-cards">${cards}</div>` : "<div class='seat-cards empty'>No cards dealt yet</div>"}
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function chipStack(amount) {
  const chipsCount = Math.min(5, Math.max(1, Math.round(Number(amount) / 500)));
  return `
    <div class="chip-stack" title="Bet ${chips(amount)}">
      ${Array.from({ length: chipsCount }, (_, index) => `<i style="--index:${index}"></i>`).join("")}
      <span>${chips(amount)}</span>
    </div>
  `;
}

function handOwnerLabel(idx) {
  ensureTablePlayersInfo();
  const owner = lab.tablePlayersInfo[idx];
  return owner ? `${escapeHtml(owner.name)} ${owner.isBot ? "(bot)" : "(you)"}` : `Seat ${idx + 1}`;
}

function updateBotBankrolls(round) {
  if (!lab.tablePlayersInfo?.length) return;
  round.hands.forEach((hand, idx) => {
    const owner = lab.tablePlayersInfo[idx];
    if (!owner?.isBot) return;
    const net = Number(hand.net || 0);
    owner.bankroll = Math.max(0, Number(owner.bankroll) + net);
  });
}

function handleRoundSummary(round) {
  if (!round || !lab.tablePlayersInfo?.length) return;
  lab.tablePlayersInfo[0] = { ...lab.tablePlayersInfo[0], bankroll: lab.bankroll };
  updateBotBankrolls(round);
}

function handleTablePlayersBeforeDeal() {
  if (lab.tablePlayers > 1 && !lab.tablePlayersInfo?.length) {
    ensureTablePlayersInfo();
  }
}

function handleTablePlayersAfterRender() {
  if (lab.tablePlayers > 1 && !lab.tablePlayersInfo?.length) {
    ensureTablePlayersInfo();
  }
}

function handleTablePlayersUpdateCount() {
  const count = Math.max(1, Math.min(4, Number(lab.tablePlayers || 1)));
  lab.tablePlayers = count;
  if (lab.tablePlayersInfo?.length !== count) ensureTablePlayersInfo();
}

function handleNetworkEvent(event) {
  if (!event) return;
  if (event.type === "connected") {
    lab.multiplayer.connected = true;
    lab.multiplayer.status = "connected";
    lab.multiplayer.playerId = event.playerId || lab.multiplayer.playerId;
    lab.multiplayer.username = lab.multiplayer.username || "Player";
    render();
    return;
  }
  if (event.type === "joined") {
    lab.multiplayer.connected = true;
    lab.multiplayer.playerId = event.playerId;
    lab.multiplayer.username = event.username || lab.multiplayer.username;
    lab.multiplayer.status = "connected";
    render();
    return;
  }
  if (event.type === "disconnected") {
    lab.multiplayer.connected = false;
    lab.multiplayer.status = "offline";
    lab.multiplayer.room = null;
    lab.round = lab.round || null;
    render();
    return;
  }
  if (event.type === "status") {
    lab.multiplayer.status = event.status || lab.multiplayer.status;
    render();
    return;
  }
  if (event.type === "lobby") {
    lab.multiplayer.rooms = event.rooms || [];
    lab.multiplayer.status = "connected";
    render();
    return;
  }
  if (event.type === "room") {
    lab.multiplayer.room = event.room || null;
    lab.multiplayer.status = "in-room";
    if (lab.multiplayer.room) {
      lab.round = lab.multiplayer.room.round || null;
      if (Array.isArray(lab.multiplayer.room.shoe)) {
        lab.shoe = lab.multiplayer.room.shoe;
        lab.shoeCount = lab.multiplayer.room.shoe.length;
      } else {
        lab.shoe = [];
        lab.shoeCount = Number.isInteger(lab.multiplayer.room.shoe?.count) ? lab.multiplayer.room.shoe.count : 0;
      }
      lab.runningCount = lab.multiplayer.room.runningCount || 0;
      lab.trueCount = lab.multiplayer.room.trueCount || 0;
      lab.rules = lab.multiplayer.room.rules || lab.rules;
    }
    render();
    return;
  }
  if (event.type === "slot_lobby") {
    lab.multiplayer.slotPlayers = Array.isArray(event.players) ? event.players : [];
    updateSlotsPeers(lab.multiplayer.slotPlayers, lab.multiplayer.playerId);
    if (lab.activeView === "slots") updateSlotLobbyStatus();
    saveLab(lab);
    return;
  }
  if (event.type === "error") {
    toast(event.message || "Server error.", "bad");
  }
}

function isMultiplayerMode() {
  return lab.multiplayer?.mode === "remote";
}

function isMultiplayerSession() {
  return isMultiplayerMode() && isMultiplayerConnected() && isMultiplayerRoom();
}

function shoeCardCount() {
  return Number.isInteger(lab.shoeCount) ? lab.shoeCount : Array.isArray(lab.shoe) ? lab.shoe.length : 0;
}

function shoeCards() {
  return Array.isArray(lab.shoe) ? lab.shoe : [];
}

function isMultiplayerConnected() {
  return isMultiplayerMode() && lab.multiplayer?.connected;
}

function isMultiplayerRoom() {
  return isMultiplayerConnected() && lab.multiplayer?.room;
}

function isMultiplayerPlayerTurn() {
  return isMultiplayerRoom() && lab.multiplayer.playerId === lab.multiplayer.room.currentPlayerId;
}

document.querySelector("#resetAll").addEventListener("click", () => {
  if (!confirm("Reset bankroll, history, and rules to defaults?")) return;
  lab = resetLab();
  render();
});

nav.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    lab.activeView = button.dataset.view;
    render();
  });
});

ensureShoe(lab);
updateServices();
render();
discoverOllamaModels();
if (launchConnect) {
  connectServer(launchConnect.serverUrl, launchConnect.username, lab.avatar);
}

function applyLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view) lab.activeView = view;
  const serverUrl = params.get("mpServer");
  const username = params.get("mpName");
  if (!serverUrl || !username) return null;
  const validation = validateServerUrl(serverUrl);
  if (!validation.ok) {
    lab.multiplayer.status = validation.message;
    return null;
  }
  lab.multiplayer.serverUrl = validation.wsUrl;
  lab.multiplayer.username = username;
  lab.multiplayer.mode = "remote";
  lab.multiplayer.status = "connecting";
  if (!view) lab.activeView = "multiplayer";
  return { serverUrl: validation.wsUrl, username };
}

function render() {
  bankrollLabel.textContent = chips(lab.bankroll);
  nav.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.view === lab.activeView));
  if (lab.activeView !== "slots") {
    if (isMultiplayerConnected()) sendSlotLeave();
    destroySlotsWorld();
  }
  if (lab.activeView === "rules") renderRules();
  else if (lab.activeView === "history") renderHistory();
  else if (lab.activeView === "strategy") renderStrategy();
  else if (lab.activeView === "bank") renderBank();
  else if (lab.activeView === "drinks") renderDrinks();
  else if (lab.activeView === "auto") renderAuto();
  else if (lab.activeView === "slots") renderSlots();
  else if (lab.activeView === "keno") renderKeno();
  else if (lab.activeView === "multiplayer") renderMultiplayer();
  else renderTable();
  saveLab(lab);
}

function renderTable() {
  if (lab.tablePlayers > 1) ensureTablePlayersInfo();
  const round = isMultiplayerMode() && isMultiplayerRoom() ? lab.multiplayer.room.round : lab.round;
  const current = activeHand(lab);
  app.innerHTML = `
    <section class="topbar">
      <div>
        <p class="eyebrow">Practice table</p>
        <h1>Blackjack Lab</h1>
        <p class="runtime-badge">Standalone local app: index.html + JavaScript + CSS. No Streamlit runtime.</p>
      </div>
      <div class="top-stats">
        ${metric("Bankroll", chips(lab.bankroll))}
        ${metric("Thirst", `${Math.round(lab.drink.thirst)}%`)}
        ${metric("Debt", chips(activeDebt()))}
        ${metric("Clock", casinoClock())}
        ${metric("Shoe", `${shoeCardCount()}/${lab.rules.decks * 52}`)}
        ${metric("Running count", lab.runningCount)}
        ${metric("True count", lab.trueCount.toFixed(2))}
      </div>
    </section>

    <section class="table-layout">
      <article class="felt">
        ${round ? tableMarkup(round) : emptyTableMarkup()}
      </article>
      <aside class="control-panel">
        ${serviceNoticeMarkup()}
        <h2>Round Controls</h2>
        ${round && round.state === "dealer" ? dealerControlsMarkup(round) : round && round.state !== "done" ? playControlsMarkup(current) : betControlsMarkup(round)}
        <div id="coachPanel" class="coach-panel"></div>
        ${handOddsMarkup(round, current)}
        <div class="button-row tight">
          <button id="toggleShoeChart">${lab.ui.showShoeChart ? "Hide" : "Show"} probability chart</button>
        </div>
        ${lab.ui.showShoeChart ? shoeProbabilityMarkup() : ""}
        <h3>Shoe Setup</h3>
        <button id="shuffleShoe">Shuffle ${lab.rules.decks}-deck shoe</button>
        <p class="fine">Penetration: ${lab.rules.penetration}% | Dealer: ${lab.rules.dealerMode}</p>
      </aside>
    </section>
  `;

  bindTableActions();
  renderCoach();
}

function renderMultiplayer() {
  const connected = lab.multiplayer?.connected;
  const room = lab.multiplayer?.room;
  const status = lab.multiplayer?.status || "offline";
  app.innerHTML = `
    <section class="topbar">
      <div>
        <p class="eyebrow">Multiplayer lobby</p>
        <h1>Shared Blackjack</h1>
        <p class="runtime-badge">Connect to a central server, join a shared table, and play with synced state across clients.</p>
      </div>
      <div class="top-stats">
        ${metric("Connection", connected ? "Online" : "Offline")}
        ${metric("Player", lab.multiplayer?.username || "Guest")}
        ${metric("Status", status)}
        ${metric("Room", room ? room.name : "None")}
      </div>
    </section>
    <section class="table-layout">
      <aside class="control-panel">
        ${connected ? (room ? multiplayerRoomPanelMarkup(room) : multiplayerLobbyMarkup()) : multiplayerConnectMarkup()}
      </aside>
      <article class="felt">
        ${room ? (room.round ? tableMarkup(room.round) : emptyTableMarkup()) : `<div class="dealer-zone"><span class="zone-label">Multiplayer Table</span><div class="empty-seat">Join a room to display the shared blackjack table.</div></div>`}
      </article>
    </section>
  `;
  bindMultiplayerActions();
  if (room) bindTableActions();
}

function multiplayerConnectMarkup() {
  const validation = validateServerUrl(lab.multiplayer?.serverUrl || "ws://localhost:9000");
  return `
    <section class="multiplayer-panel">
      <h2>Connect to server</h2>
      <label>Server URL <input id="mpServerUrl" type="text" value="${escapeHtml(lab.multiplayer?.serverUrl || "ws://localhost:9000")}"></label>
      <label>Username <input id="mpUsername" type="text" value="${escapeHtml(lab.multiplayer?.username || "")}"></label>
      <div class="button-row">
        <button id="mpConnect" class="primary">Connect</button>
      </div>
      <p class="fine">Paste the backend ngrok HTTPS address here; it will be converted to a secure WebSocket URL.</p>
      <p class="fine">Endpoint preview: ${escapeHtml(validation.ok ? validation.wsUrl : validation.message)}</p>
      <p class="fine">Once connected, you can create or join a shared blackjack room.</p>
    </section>
  `;
}

function multiplayerLobbyMarkup() {
  return `
    <section class="multiplayer-panel">
      <h2>Lobby</h2>
      <div class="button-row tight">
        <button id="mpCreateRoom" class="primary">Create Room</button>
      </div>
      <div class="lobby-list">
        ${lab.multiplayer.rooms.length ? lab.multiplayer.rooms.map((room) => `
          <div class="lobby-item">
            <div><strong>${escapeHtml(room.name)}</strong> <span>${room.playerCount} players</span></div>
            <div>${escapeHtml(room.state)}</div>
            <button data-room-id="${room.id}" class="join-room">Join</button>
          </div>
        `).join("") : `<p class="fine">No rooms available. Create one to start a shared table.</p>`}
      </div>
    </section>
  `;
}

function multiplayerRoomPanelMarkup(room) {
  const isPlayerTurn = room.currentPlayerId === lab.multiplayer.playerId;
  return `
    <section class="multiplayer-panel">
      <h2>Room: ${escapeHtml(room.name)}</h2>
      <div class="room-info">
        <p><strong>Players</strong></p>
        <ul>${room.players.map((player) => `<li>${avatarStatusMarkup(player.avatar)} ${escapeHtml(player.username)}${player.id === lab.multiplayer.playerId ? " (you)" : ""}${player.id === room.currentPlayerId ? " • current" : ""}</li>`).join("")}</ul>
      </div>
      ${multiplayerRoomControlsMarkup(room, isPlayerTurn)}
      <div class="button-row tight">
        <button id="mpLeaveRoom">Leave Room</button>
      </div>
      ${chatPanelMarkup(room)}
      <p class="fine">Actions are sent to the server for validation. Only the current player may move while a round is active.</p>
    </section>
  `;
}

function multiplayerRoomControlsMarkup(room, isPlayerTurn) {
  if (!room.round || room.round.state === "done") {
    return `
      <div class="multiplayer-controls">
        <h3>Place a bet</h3>
        <label>Bet <input id="betInput" type="number" min="${lab.rules.minBet}" max="${lab.rules.maxBet}" value="100"></label>
        <div class="button-row tight">
          <button id="dealHand" class="primary">Deal hand</button>
        </div>
        <p class="fine">Start a round on the server. Your bet is validated by the central dealer.</p>
      </div>
    `;
  }

  const disabled = !isPlayerTurn || room.currentPlayerId == null;
  return `
    <div class="multiplayer-controls">
      <h3>Round actions</h3>
      <div class="action-grid">
        <button id="hitBtn" ${disabled ? "disabled" : ""}>Hit</button>
        <button id="standBtn" ${disabled ? "disabled" : ""}>Stand</button>
        <button id="doubleBtn" ${disabled ? "disabled" : ""}>Double</button>
        <button id="splitBtn" ${disabled ? "disabled" : ""}>Split</button>
        <button id="surrenderBtn" ${disabled ? "disabled" : ""}>Surrender</button>
      </div>
      <p class="fine">${isPlayerTurn ? "You are the current player." : "Waiting for the current player to act."}</p>
    </div>
  `;
}

function bindMultiplayerActions() {
  document.querySelector("#mpConnect")?.addEventListener("click", () => {
    const url = document.querySelector("#mpServerUrl")?.value.trim();
    const username = document.querySelector("#mpUsername")?.value.trim();
    if (!url || !username) return toast("Server URL and username are required.", "bad");
    const validation = validateServerUrl(url);
    if (!validation.ok) return toast(validation.message, "bad");
    lab.multiplayer.serverUrl = validation.wsUrl;
    lab.multiplayer.username = username;
    lab.multiplayer.mode = "remote";
    lab.activeView = "multiplayer";
    render();
    connectServer(validation.wsUrl, username, lab.avatar);
  });

  document.querySelectorAll(".join-room").forEach((button) => {
    button.addEventListener("click", () => {
      const roomId = button.dataset.roomId;
      joinRoom(roomId);
    });
  });

  document.querySelector("#mpCreateRoom")?.addEventListener("click", () => {
    const name = prompt("Room name:", `Blackjack Table ${lab.multiplayer.rooms.length + 1}`);
    if (!name) return;
    createRoom(name);
  });

  document.querySelector("#mpLeaveRoom")?.addEventListener("click", () => {
    leaveRoom();
  });

  document.querySelector("#sendChat")?.addEventListener("click", () => {
    const input = document.querySelector("#chatInput");
    const message = input?.value.trim();
    if (!message) return;
    sendNetworkChat(message);
    if (input) input.value = "";
  });

  document.querySelector("#chatInput")?.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.querySelector("#sendChat")?.click();
    }
  });
}

function canUseTable() {
  if (isMultiplayerSession()) {
    return true;
  }
  return lab.drink.thirst > 0 && !hardBlockedByLoan();
}

function chatPanelMarkup(room) {
  const messages = Array.isArray(room.chat) ? room.chat : [];
  return `
    <div class="chat-panel">
      <h3>Room chat</h3>
      <div class="chat-log">
        ${messages.length
          ? messages.map((msg) => `<div class="chat-message"><strong>${escapeHtml(msg.sender)}:</strong> ${escapeHtml(msg.message)}</div>`).join("")
          : `<div class="chat-empty">No messages yet.</div>`}
      </div>
      <div class="chat-input-row">
        <input id="chatInput" type="text" placeholder="Type a message..." maxlength="200">
        <button id="sendChat" class="primary">Send</button>
      </div>
    </div>
  `;
}

function tableBlockReason() {
  if (isMultiplayerSession()) {
    if (!isMultiplayerConnected()) return "Connect and join a room before taking actions.";
    if (!isMultiplayerRoom()) return "Join a room before playing.";
  }
  if (lab.drink.thirst <= 0) return "You are too thirsty to keep playing. Visit the Drink Server.";
  if (hardBlockedByLoan()) return "The teller has frozen table action until an overdue loan is repaid.";
  return "";
}

function renderAuto() {
  if (lab.bankroll < lab.bank.policy.autoUnlockBankroll) {
    app.innerHTML = `
      <section class="topbar">
        <div><p class="eyebrow">Simulation mode</p><h1>Auto Lab locked</h1><p class="runtime-badge">Auto Lab requires at least ${chips(lab.bank.policy.autoUnlockBankroll)} available bankroll.</p></div>
        <div class="top-stats">${metric("Bankroll", chips(lab.bankroll))}${metric("Needed", chips(lab.bank.policy.autoUnlockBankroll - lab.bankroll))}${metric("Clock", casinoClock())}</div>
      </section>
      <section class="service-panel"><h2>Build the bankroll first</h2><p>Play manually, use the ATM, or negotiate with Jessup at the bank. Auto Lab unlocks once your bankroll reaches the configured threshold.</p><button id="goBank" class="primary">Go to Bank</button></section>
    `;
    document.querySelector("#goBank")?.addEventListener("click", () => { lab.activeView = "bank"; render(); });
    return;
  }
  if (!lab.auto.running && lab.auto.handsPlayed >= lab.auto.handsTarget && lab.round?.state !== "done") {
    lab.round = null;
  }
  const round = lab.round;
  app.innerHTML = `
    <section class="topbar">
      <div>
        <p class="eyebrow">Simulation mode</p>
        <h1>Auto Lab</h1>
        <p class="runtime-badge">Watch the AI player run hands and write every decision to the CSV chart.</p>
      </div>
      <div class="top-stats">
        ${metric("Mode", autoModeLabel(lab.auto.mode))}
        ${metric("Progress", `${lab.auto.handsPlayed}/${lab.auto.handsTarget}`)}
        ${metric("Bankroll", chips(lab.bankroll))}
        ${metric("True count", lab.trueCount.toFixed(2))}
      </div>
    </section>
    <section class="table-layout">
      <article class="felt">
        ${round ? tableMarkup(round) : emptyTableMarkup()}
      </article>
      <aside class="control-panel">
        ${autoWatchPanel(round)}
        <h2>Auto Player Rules</h2>
        <label>Player style
          <select id="autoMode" ${lab.auto.running ? "disabled" : ""}>
            <option value="pro" ${lab.auto.mode === "pro" ? "selected" : ""}>Pro EV / count-aware</option>
            <option value="advantage" ${lab.auto.mode === "advantage" ? "selected" : ""}>Advantage pro / higher variance</option>
            <option value="basic" ${lab.auto.mode === "basic" ? "selected" : ""}>Basic strategy</option>
            <option value="low" ${lab.auto.mode === "low" ? "selected" : ""}>Low risk / conservative</option>
            <option value="high" ${lab.auto.mode === "high" ? "selected" : ""}>High risk / aggressive</option>
            <option value="adaptive" ${lab.auto.mode === "adaptive" ? "selected" : ""}>Adaptive pro hybrid</option>
          </select>
        </label>
        <label>Betting model
          <select id="autoBettingMode" ${lab.auto.running ? "disabled" : ""}>
            <option value="smart" ${lab.auto.bettingMode === "smart" ? "selected" : ""}>Smart conservative ramp</option>
            <option value="count" ${lab.auto.bettingMode === "count" ? "selected" : ""}>Aggressive count ramp</option>
            <option value="kelly" ${lab.auto.bettingMode === "kelly" ? "selected" : ""}>Kelly-lite ramp</option>
            <option value="flat" ${lab.auto.bettingMode === "flat" ? "selected" : ""}>Flat bet</option>
          </select>
        </label>
        <label>Hands to play <input id="autoHands" type="number" min="1" max="1000" value="${lab.auto.handsTarget}" ${lab.auto.running ? "disabled" : ""}></label>
        <label>Base bet <input id="autoBet" type="number" min="${lab.rules.minBet}" max="${lab.rules.maxBet}" value="${lab.auto.bet}" ${lab.auto.running ? "disabled" : ""}></label>
        <label>Max spread units <input id="autoSpread" type="number" min="1" max="30" value="${lab.auto.spreadUnits}" ${lab.auto.running ? "disabled" : ""}></label>
        <label>Bankroll risk cap % <input id="autoRiskPct" type="number" min="0.25" max="10" step="0.25" value="${lab.auto.bankrollRiskPct}" ${lab.auto.running ? "disabled" : ""}></label>
        <label>Step speed (ms) <input id="autoSpeed" type="number" min="150" max="5000" step="50" value="${lab.auto.speedMs}" ${lab.auto.running ? "disabled" : ""}></label>
        <details class="rule-editor" open>
          <summary>Auto Strategy Rules</summary>
          <div class="rule-grid">
            ${pairRuleField("pair2", "Split 2,2")}
            ${pairRuleField("pair3", "Split 3,3")}
            ${pairRuleField("pair4", "Split 4,4")}
            ${pairRuleField("pair6", "Split 6,6")}
            ${pairRuleField("pair7", "Split 7,7")}
            ${pairRuleField("pair8", "Split 8,8")}
            ${pairRuleField("pair9", "Split 9,9")}
            ${pairRuleField("pair10", "Split 10s")}
            ${pairRuleField("pairA", "Split A,A")}
            <label class="check"><input data-auto-rule="surrender16" type="checkbox" ${lab.auto.strategyRules.surrender16 ? "checked" : ""} ${lab.auto.running ? "disabled" : ""}>Surrender hard 16 vs 9-A</label>
            <label class="check"><input data-auto-rule="surrender15v10" type="checkbox" ${lab.auto.strategyRules.surrender15v10 ? "checked" : ""} ${lab.auto.running ? "disabled" : ""}>Surrender hard 15 vs 10</label>
          </div>
        </details>
        <div class="button-row">
          <button id="startAuto" class="primary" ${lab.auto.running ? "disabled" : ""}>Start auto mode</button>
          <button id="stopAuto" ${!lab.auto.running ? "disabled" : ""}>Stop</button>
          <button id="clearAutoLog" ${lab.auto.running ? "disabled" : ""}>Clear auto log</button>
        </div>
        <h3>Current decision</h3>
        <div class="advice">${autoDecisionPanel()}</div>
        <h3>Player run breakdown</h3>
        ${autoRunBreakdown()}
        <h3>System grade</h3>
        ${autoGradePanel()}
        <h3>Auto log</h3>
        <div class="auto-log">${lab.auto.log.slice(0, 10).map((line) => `<p>${escapeHtml(line)}</p>`).join("") || `<p class="fine">No auto hands yet.</p>`}</div>
      </aside>
    </section>
  `;
  bindAutoActions();
}

function renderSlots() {
  updateServices();
  app.innerHTML = `
    <section class="topbar slots-topbar">
      <div>
        <p class="eyebrow">Casino floor</p>
        <h1>Slots Walkaround</h1>
        <p class="runtime-badge">WASD moves. Drag mouse to steer camera. Click cabinets to inspect.</p>
      </div>
      <div class="top-stats">
        ${metric("Bankroll", chips(lab.bankroll))}
        ${metric("Slot lobby", isMultiplayerConnected() ? `${remoteSlotPlayers().length + 1} online` : "Local")}
        ${metric("ATM", chips(lab.bank.atm.balance))}
        ${metric("Clock", casinoClock())}
      </div>
    </section>
    <section class="slots-layout">
      <article class="slots-stage">
        <div id="slotsWorld" class="slots-world" tabindex="0" aria-label="Third person slots floor"></div>
        <div class="slots-hud">
          <strong id="slotFocusName">Explore the floor</strong>
          <span id="slotFocusInfo">Approach a cabinet to inspect it. New chunks generate as you walk.</span>
        </div>
      </article>
      <aside class="control-panel slots-panel">
        <h2>Floor Controls</h2>
        <p class="fine">Use WASD to move, drag the mouse on the floor to rotate the camera, and click a cabinet to inspect it. Press Escape to leave a cabinet. The floor expands in chunks as you approach new borders.</p>
        <p class="fine" id="slotLobbyStatus">${slotLobbyStatusText()}</p>
        <div class="slot-emotes">
          <button data-slot-emote="wave">Wave</button>
          <button data-slot-emote="cheer">Cheer</button>
          <button data-slot-emote="jackpot">Jackpot</button>
          <button data-slot-emote="think">Think</button>
        </div>
        <div class="slot-detail" id="slotDetail">
          <strong>No machine selected</strong>
          <span>Cabinets light up when you get close.</span>
        </div>
        <div class="slot-console" id="slotConsole">
          <div class="slot-console-head">
            <strong id="slotConsoleTitle">Machine Console</strong>
            <span>Seated play</span>
          </div>
          <div class="slot-machine-wrap" id="slotMachineFace"></div>
          <div class="slot-wager-grid">
            <label>Denom <select id="slotDenom"></select></label>
            <label>Paylines <select id="slotPaylines"></select></label>
          </div>
          <strong class="slot-bet-readout" id="slotBetReadout">Select a cabinet</strong>
          <div class="button-row tight">
            <button id="slotSit" disabled>Sit down</button>
            <button id="slotLeave" disabled>Leave</button>
            <button id="slotPlay" class="primary" disabled>Spin</button>
            <button id="slotRules" disabled>Rules</button>
          </div>
        </div>
        <p id="slotResult" class="slot-result">No spin yet.</p>
        <div id="slotHistory" class="slot-history"></div>
        ${avatarPanelMarkup()}
        <div id="slotRulesPanel"></div>
      </aside>
    </section>
  `;
  initSlotsWorld({
    container: document.querySelector("#slotsWorld"),
    detail: document.querySelector("#slotDetail"),
    name: document.querySelector("#slotFocusName"),
    info: document.querySelector("#slotFocusInfo"),
    sitButton: document.querySelector("#slotSit"),
    leaveButton: document.querySelector("#slotLeave"),
    playButton: document.querySelector("#slotPlay"),
    rulesButton: document.querySelector("#slotRules"),
    denomSelect: document.querySelector("#slotDenom"),
    paylineSelect: document.querySelector("#slotPaylines"),
    betReadout: document.querySelector("#slotBetReadout"),
    machineFace: document.querySelector("#slotMachineFace"),
    resultBox: document.querySelector("#slotResult"),
    historyBox: document.querySelector("#slotHistory"),
    rulesPanel: document.querySelector("#slotRulesPanel"),
    console: document.querySelector("#slotConsole"),
    consoleTitle: document.querySelector("#slotConsoleTitle"),
    avatar: lab.avatar,
    playerId: lab.multiplayer?.playerId || "",
    username: lab.multiplayer?.username || "Guest",
    peers: lab.multiplayer?.slotPlayers || [],
    botConversation: {
      enabled: lab.rules.botConversationsEnabled,
      useOllama: lab.rules.botConversationsUseOllama,
      frequencySeconds: lab.rules.botConversationFrequencySeconds,
      ollamaUrl: lab.rules.ollamaUrl,
      ollamaModel: lab.rules.ollamaModel,
    },
    onBlackjackTable: (table) => {
      lab.activeView = "table";
      toast(`${table.name}: seated at blackjack.`, "good");
      render();
    },
    onPresence: (state, reason) => {
      if (!isMultiplayerConnected()) return;
      const payload = {
        ...state,
        username: lab.multiplayer?.username || "Guest",
        avatar: lab.avatar,
        telemetry: {
          bankroll: lab.bankroll,
          atmBalance: lab.bank?.atm?.balance || 0,
          activeDebt: activeDebt(),
          thirst: lab.drink?.thirst ?? 100,
          activeView: lab.activeView,
        },
      };
      if (reason === "enter") sendSlotEnter(payload);
      else sendSlotState(payload);
    },
    getBankroll: () => lab.bankroll,
    commitBankroll: (delta) => {
      lab.bankroll = Math.max(0, lab.bankroll + delta);
      bankrollLabel.textContent = chips(lab.bankroll);
      saveLab(lab);
      document.querySelectorAll(".top-stats .metric strong").forEach((node) => {
        if (node.parentElement?.innerText.startsWith("Bankroll")) node.textContent = chips(lab.bankroll);
      });
    },
  });
  bindAvatarActions();
  bindSlotEmotes();
  updateSlotsPeers(lab.multiplayer?.slotPlayers || [], lab.multiplayer?.playerId || "");
}

function bindSlotEmotes() {
  document.querySelectorAll("[data-slot-emote]").forEach((button) => {
    button.addEventListener("click", () => triggerSlotsEmote(button.dataset.slotEmote));
  });
}

function remoteSlotPlayers() {
  const selfId = lab.multiplayer?.playerId || "";
  return (lab.multiplayer?.slotPlayers || []).filter((player) => player.id && player.id !== selfId);
}

function slotLobbyStatusText() {
  if (!isMultiplayerConnected()) return "Multiplayer presence is offline. Connect in the Multiplayer tab to see other players here.";
  const remotes = remoteSlotPlayers();
  return remotes.length
    ? `Slot lobby online: ${remotes.map((player) => player.username || "Guest").join(", ")}`
    : "Slot lobby online: waiting for other connected players to enter Slots.";
}

function updateSlotLobbyStatus() {
  const status = document.querySelector("#slotLobbyStatus");
  if (status) status.textContent = slotLobbyStatusText();
}

function avatarPanelMarkup() {
  return `
    <section class="avatar-panel">
      <h3>Avatar customization</h3>
      <p class="fine">Choose a custom head/body/limb style and colors for your casino avatar.</p>
      <label>Style
        <select id="avatarStyle">
          <option value="classic">Classic</option>
          <option value="neon">Neon</option>
          <option value="armor">Armor</option>
        </select>
      </label>
      <label>Body shape
        <select id="avatarBodyShape">
          <option value="box">Block</option>
          <option value="tapered">Tapered</option>
          <option value="armor">Armored</option>
        </select>
      </label>
      <label>Skin tone <input id="avatarSkinTone" type="color" value="${lab.avatar.skinTone}"></label>
      <label>Body color <input id="avatarBodyColor" type="color" value="${lab.avatar.bodyColor}"></label>
      <label>Limbs color <input id="avatarLimbColor" type="color" value="${lab.avatar.limbColor}"></label>
      <label>Visor color <input id="avatarVisorColor" type="color" value="${lab.avatar.visorColor}"></label>
      <label>Accent color <input id="avatarAccentColor" type="color" value="${lab.avatar.accentColor}"></label>
      <label class="check"><input id="showCollisionBox" type="checkbox" ${lab.avatar.showCollision ? "checked" : ""}> Show collision box</label>
      <div class="avatar-presets">
        <label>Preset name <input id="avatarPresetName" type="text" placeholder="New preset name"></label>
        <label>Saved preset
          <select id="avatarPresetSelect">
            ${lab.avatarPresets.length ? lab.avatarPresets.map((preset, index) => `<option value="${index}">${escapeHtml(preset.name)}</option>`).join("") : `<option value="">No saved presets</option>`}
          </select>
        </label>
        <div class="button-row tight">
          <button id="saveAvatarPreset" class="secondary">Save preset</button>
          <button id="loadAvatarPreset">Load preset</button>
          <button id="deleteAvatarPreset">Delete preset</button>
        </div>
      </div>
      <div class="button-row tight">
        <button id="avatarApply" class="primary">Apply avatar</button>
      </div>
    </section>
  `;
}

function bindAvatarActions() {
  const styleInput = document.querySelector("#avatarStyle");
  const bodyShapeInput = document.querySelector("#avatarBodyShape");
  const skinInput = document.querySelector("#avatarSkinTone");
  const bodyInput = document.querySelector("#avatarBodyColor");
  const limbInput = document.querySelector("#avatarLimbColor");
  const visorInput = document.querySelector("#avatarVisorColor");
  const accentInput = document.querySelector("#avatarAccentColor");
  const collisionToggle = document.querySelector("#showCollisionBox");
  const presetNameInput = document.querySelector("#avatarPresetName");
  const presetSelect = document.querySelector("#avatarPresetSelect");
  const applyButton = document.querySelector("#avatarApply");
  const savePresetButton = document.querySelector("#saveAvatarPreset");
  const loadPresetButton = document.querySelector("#loadAvatarPreset");
  const deletePresetButton = document.querySelector("#deleteAvatarPreset");

  if (!styleInput || !bodyShapeInput || !skinInput || !bodyInput || !limbInput || !visorInput || !accentInput || !applyButton) return;

  styleInput.value = lab.avatar.style;
  bodyShapeInput.value = lab.avatar.bodyShape || "box";
  skinInput.value = lab.avatar.skinTone;
  bodyInput.value = lab.avatar.bodyColor;
  limbInput.value = lab.avatar.limbColor;
  visorInput.value = lab.avatar.visorColor;
  accentInput.value = lab.avatar.accentColor;
  if (collisionToggle) collisionToggle.checked = Boolean(lab.avatar.showCollision);

  applyButton.addEventListener("click", () => {
    lab.avatar.style = styleInput.value;
    lab.avatar.bodyShape = bodyShapeInput.value;
    lab.avatar.skinTone = skinInput.value;
    lab.avatar.bodyColor = bodyInput.value;
    lab.avatar.limbColor = limbInput.value;
    lab.avatar.visorColor = visorInput.value;
    lab.avatar.accentColor = accentInput.value;
    lab.avatar.showCollision = Boolean(collisionToggle?.checked);
    saveLab(lab);
    updateSlotsAvatar(lab.avatar);
    if (isMultiplayerConnected()) sendNetworkAvatar(lab.avatar);
    toast("Avatar updated.", "good");
  });

  savePresetButton?.addEventListener("click", () => {
    const name = presetNameInput?.value.trim() || `Preset ${lab.avatarPresets.length + 1}`;
    const preset = {
      name,
      avatar: {
        style: styleInput.value,
        bodyShape: bodyShapeInput.value,
        skinTone: skinInput.value,
        bodyColor: bodyInput.value,
        limbColor: limbInput.value,
        visorColor: visorInput.value,
        accentColor: accentInput.value,
        showCollision: Boolean(collisionToggle?.checked),
      },
    };
    lab.avatarPresets = [...lab.avatarPresets, preset];
    saveLab(lab);
    render();
    toast(`Saved preset '${name}'.`, "good");
  });

  loadPresetButton?.addEventListener("click", () => {
    const index = Number(presetSelect?.value);
    const preset = lab.avatarPresets[index];
    if (!preset) return toast("Select a preset to load.", "bad");
    lab.avatar = { ...preset.avatar };
    saveLab(lab);
    render();
    toast(`Loaded preset '${preset.name}'.`, "good");
  });

  deletePresetButton?.addEventListener("click", () => {
    const index = Number(presetSelect?.value);
    const preset = lab.avatarPresets[index];
    if (!preset) return toast("Select a preset to delete.", "bad");
    lab.avatarPresets = lab.avatarPresets.filter((_, i) => i !== index);
    saveLab(lab);
    render();
    toast(`Deleted preset '${preset.name}'.`, "good");
  });
}

function avatarStatusMarkup(avatar) {
  if (!avatar) return "";
  const styleLabel = escapeHtml(avatar.style || "classic");
  const bodyColor = escapeHtml(avatar.bodyColor || "#23335f");
  const outline = escapeHtml(avatar.skinTone || "#f1c27d");
  return `<span class="avatar-chip" title="${styleLabel}" style="background:${bodyColor}; border-color:${outline};"></span> ${styleLabel}`;
}

function renderKeno() {
  ensureKenoState();
  if (lab.keno.animating && !kenoTimer) lab.keno.animating = false;
  window.pickKenoNumber = (value) => pickKenoNumber(Number(value));
  const activeCard = lab.keno.cards[lab.keno.activeCard] || lab.keno.cards[0];
  const picked = new Set(activeCard.picks || []);
  const drawnNumbers = lab.keno.revealedDraw?.length ? lab.keno.revealedDraw : lab.keno.lastDraw || [];
  const drawn = new Set(drawnNumbers);
  const cardHits = lab.keno.lastHits?.[lab.keno.activeCard] || [];
  const hits = new Set(cardHits);
  app.innerHTML = `
    <section class="topbar">
      <div>
        <p class="eyebrow">Keno lounge</p>
        <h1>Keno</h1>
        <p class="runtime-badge">Pick exactly 10 numbers from 1-100. The house draws 20.</p>
      </div>
      <div class="top-stats">${metric("Bankroll", chips(lab.bankroll))}${metric("Cards", lab.keno.cards.length)}${metric("Picked", `${picked.size}/10`)}${metric("Last hits", hits.size)}</div>
    </section>
    <section class="keno-layout">
      <article class="control-panel">
        <div class="keno-board">
          ${Array.from({ length: 100 }, (_, index) => {
            const n = index + 1;
            const classes = ["keno-number", picked.has(n) ? "picked" : "", drawn.has(n) ? "drawn" : "", hits.has(n) ? "hit" : ""].filter(Boolean).join(" ");
            return `<button class="${classes}" data-keno="${n}" onpointerup="window.pickKenoNumber(${n})">${n}</button>`;
          }).join("")}
        </div>
        <div class="keno-result">${escapeHtml(lab.keno.message || "Pick 10 numbers, choose a denom, then draw.")}</div>
        <div class="keno-draw-strip" id="kenoDrawStrip">${drawnNumbers.map((n) => `<span class="${picked.has(n) ? "hit" : ""}">${n}</span>`).join("")}</div>
      </article>
      <aside class="control-panel">
        <h2>Keno Ticket</h2>
        <div class="keno-card-tabs">
          ${lab.keno.cards.map((card, index) => `<button data-keno-card="${index}" class="${index === lab.keno.activeCard ? "active" : ""}">Card ${index + 1}</button>`).join("")}
        </div>
        <label>Cards
          <select id="kenoCardCount">
            ${[1, 2, 3, 4].map((count) => `<option value="${count}" ${lab.keno.cards.length === count ? "selected" : ""}>${count} card${count === 1 ? "" : "s"}</option>`).join("")}
          </select>
        </label>
        <label>Denom
          <select id="kenoDenom">
            ${DENOM_OPTIONS.map((denom) => `<option value="${denom}" ${lab.keno.denom === denom ? "selected" : ""}>${denom} pts</option>`).join("")}
          </select>
        </label>
        <p class="fine">Ticket cost: ${chips((lab.keno.denom || 1) * lab.keno.cards.length)}. Each card pays independently by hit count.</p>
        <div class="button-row">
          <button id="kenoDraw" class="primary" ${kenoCanDraw() ? "" : "disabled"}>${lab.keno.animating ? "Drawing..." : "Draw 20 numbers"}</button>
          <button id="kenoClear">Clear picks</button>
        </div>
        <h3>Rules</h3>
        <p class="fine">Select 10 numbers on each active card. One draw reveals 20 numbers from 1-100. Hits are matches between a card and the draw. Multi-card keno uses the same draw for every card, charging one denom per card.</p>
        <h3>Payouts</h3>
        <div class="keno-paytable">
          ${Object.entries(KENO_PAYTABLE).map(([hit, mult]) => `<span><strong>${hit} hits</strong><em>${mult}x</em></span>`).join("")}
        </div>
        <h3>Last Draw</h3>
        <p class="fine" id="kenoLastDraw">${drawnNumbers.length ? drawnNumbers.join(", ") : "No draw yet."}</p>
        <h3>History</h3>
        <div class="keno-history">
          ${lab.keno.history.length ? lab.keno.history.slice(0, 8).map(kenoHistoryRow).join("") : `<p class="fine">No keno draws yet.</p>`}
        </div>
      </aside>
    </section>
  `;
  bindKenoActions();
}

function defaultKenoState() {
  return {
    denom: 5,
    activeCard: 0,
    cards: [{ picks: [] }],
    lastDraw: [],
    revealedDraw: [],
    lastHits: [],
    message: "",
    animating: false,
    history: [],
  };
}

function ensureKenoState() {
  lab.keno ??= defaultKenoState();
  if (!lab.keno.cards) lab.keno.cards = [{ picks: [...(lab.keno.picks || [])] }];
  lab.keno.activeCard = Math.min(Math.max(0, Number(lab.keno.activeCard || 0)), lab.keno.cards.length - 1);
  lab.keno.cards.forEach((card) => { card.picks ??= []; });
  lab.keno.lastDraw ??= [];
  lab.keno.revealedDraw ??= [];
  lab.keno.lastHits ??= [];
}

function kenoCanDraw() {
  return !lab.keno.animating && lab.keno.cards.length > 0 && lab.keno.cards.every((card) => card.picks.length === 10);
}

function bindKenoActions() {
  ensureKenoState();
  document.querySelectorAll("[data-keno-card]").forEach((button) => {
    button.addEventListener("click", () => {
      lab.keno.activeCard = Number(button.dataset.kenoCard);
      render();
    });
  });
  document.querySelector("#kenoCardCount")?.addEventListener("change", (event) => {
    const count = Number(event.target.value);
    while (lab.keno.cards.length < count) lab.keno.cards.push({ picks: [] });
    lab.keno.cards = lab.keno.cards.slice(0, count);
    lab.keno.activeCard = Math.min(lab.keno.activeCard, lab.keno.cards.length - 1);
    lab.keno.lastDraw = [];
    lab.keno.revealedDraw = [];
    lab.keno.lastHits = [];
    render();
  });
  document.querySelector("#kenoDenom")?.addEventListener("change", (event) => {
    lab.keno.denom = Number(event.target.value);
    render();
  });
  document.querySelector("#kenoClear")?.addEventListener("click", () => {
    clearInterval(kenoTimer);
    kenoTimer = null;
    lab.keno.animating = false;
    lab.keno.cards[lab.keno.activeCard].picks = [];
    lab.keno.lastDraw = [];
    lab.keno.revealedDraw = [];
    lab.keno.lastHits = [];
    lab.keno.message = "Ticket cleared.";
    render();
  });
  document.querySelector("#kenoDraw")?.addEventListener("click", () => drawKeno());
}

function kenoHistoryRow(item) {
  const hitGroups = (item.hits || []).map((hits) => Array.isArray(hits) ? hits : []);
  const best = Math.max(0, ...hitGroups.map((hits) => hits.length));
  return `<div class="keno-history-row"><strong>${chips(item.win)} won</strong><span>${item.cards?.length || 1} card(s) | best ${best} hits | wager ${chips(item.wager)}</span><small>${new Date(item.at).toLocaleString()}</small></div>`;
}

function pickKenoNumber(value) {
  ensureKenoState();
  if (lab.keno.animating) return;
  const picks = lab.keno.cards[lab.keno.activeCard].picks;
  if (picks.includes(value)) {
    lab.keno.cards[lab.keno.activeCard].picks = picks.filter((item) => item !== value);
  } else if (picks.length < 10) {
    picks.push(value);
    picks.sort((a, b) => a - b);
  } else {
    toast("Keno tickets use exactly 10 picks.", "bad");
  }
  lab.keno.lastDraw = [];
  lab.keno.revealedDraw = [];
  lab.keno.lastHits = [];
  render();
}

function drawKeno() {
  ensureKenoState();
  if (!kenoCanDraw()) return toast("Pick exactly 10 numbers on every active keno card first.", "bad");
  const wager = Number(lab.keno.denom || 1) * lab.keno.cards.length;
  if (lab.bankroll < wager) return toast("Not enough bankroll for this keno ticket.", "bad");
  lab.bankroll -= wager;
  const draw = secureSampleNumbers(100, 20);
  const cardResults = lab.keno.cards.map((card) => {
    const hits = card.picks.filter((pick) => draw.includes(pick));
    const win = Number(lab.keno.denom || 1) * (KENO_PAYTABLE[hits.length] || 0);
    return { hits, win };
  });
  const win = cardResults.reduce((sum, card) => sum + card.win, 0);
  lab.keno.lastDraw = draw;
  lab.keno.revealedDraw = [];
  lab.keno.lastHits = cardResults.map((card) => card.hits);
  lab.keno.animating = true;
  lab.keno.message = "Drawing numbers...";
  lab.keno.history.unshift({ at: new Date().toISOString(), cards: lab.keno.cards.map((card) => [...card.picks]), draw, hits: cardResults.map((card) => card.hits), wager, win });
  lab.keno.history = lab.keno.history.slice(0, 20);
  render();
  animateKenoDraw(draw, cardResults, wager, win);
}

function animateKenoDraw(draw, cardResults, wager, win) {
  clearInterval(kenoTimer);
  let index = 0;
  kenoTimer = setInterval(() => {
    const number = draw[index];
    lab.keno.revealedDraw.push(number);
    const button = document.querySelector(`[data-keno="${number}"]`);
    const activeHits = new Set(cardResults[lab.keno.activeCard]?.hits || []);
    button?.classList.add("drawn");
    if (activeHits.has(number)) button?.classList.add("hit");
    const strip = document.querySelector("#kenoDrawStrip");
    if (strip) strip.insertAdjacentHTML("beforeend", `<span class="${activeHits.has(number) ? "hit" : ""}">${number}</span>`);
    const last = document.querySelector("#kenoLastDraw");
    if (last) last.textContent = lab.keno.revealedDraw.join(", ");
    index += 1;
    if (index >= draw.length) {
      clearInterval(kenoTimer);
      kenoTimer = null;
      lab.bankroll += win;
      lab.keno.animating = false;
      const bestHits = Math.max(...cardResults.map((card) => card.hits.length));
      lab.keno.message = `${lab.keno.cards.length} card draw complete. Best card: ${bestHits} hits. ${win ? `Won ${chips(win)}.` : `No payout. Lost ${chips(wager)}.`}`;
      saveLab(lab);
      render();
    }
  }, 180);
}

function secureSampleNumbers(max, count) {
  const pool = Array.from({ length: max }, (_, index) => index + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = secureInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function secureInt(maxExclusive) {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
}

function renderBank() {
  updateServices();
  const loans = lab.bank.loans.filter((loan) => loan.status === "active");
  const pendingOffer = lab.bank.pendingOffer;
  const pendingOfferTab = lab.bank.pendingOfferTab || "offer";
  const activeOffer = pendingOffer && pendingOffer.alternative && !pendingOffer.approved ? pendingOffer.alternative : pendingOffer;
  const showAlternative = Boolean(pendingOffer && pendingOffer.alternative && !pendingOffer.approved);
  app.innerHTML = `
    <section class="topbar">
      <div><p class="eyebrow">Casino bank</p><h1>Teller desk</h1><p class="runtime-badge">Jessup teller model: ${lab.bank.model}</p></div>
      <div class="top-stats">${metric("Clock", casinoClock())}${metric("Bankroll", chips(lab.bankroll))}${metric("ATM", chips(lab.bank.atm.balance))}${metric("Active debt", chips(activeDebt()))}${metric("Trust", `${lab.bank.trust}%`)}</div>
    </section>
    <section class="service-layout">
      <article class="service-panel">
        <h2>Negotiate Funds</h2>
        ${pendingOffer ? `
          <p class="fine">Jessup has proposed terms for your request:</p>
          <div class="teller-tabs">
            <button data-bank-tab="offer" class="tab ${pendingOfferTab === "offer" ? "active" : ""}">Offer</button>
            <button data-bank-tab="reason" class="tab ${pendingOfferTab === "reason" ? "active" : ""}">Reason</button>
          </div>
          <div class="offer-panel">
            ${pendingOfferTab === "offer" ? `
              <div class="offer-box">
                ${showAlternative ? `<p class="fine">Original request declined. Here is an alternative loan offer:</p>` : ""}
                <strong>${activeOffer.kind === "grant" ? "Grant" : "Loan"}: ${chips(activeOffer.amount)}</strong>
                <span>${activeOffer.kind === "grant" ? "No repayment required." : `Repay ${chips(Math.round(activeOffer.amount * (1 + activeOffer.interestPercent / 100)))} at ${activeOffer.interestPercent}% interest in ${activeOffer.dueMinutes} minutes.`}</span>
                <p class="fine">${escapeHtml(activeOffer.message || pendingOffer.message || "Jessup made an offer.")}</p>
                ${showAlternative ? `<p class="fine">Alternative reason: ${escapeHtml(pendingOffer.reason || pendingOffer.message || "No additional reasoning provided.")}</p>` : ""}
                <div class="button-row tight">
                  <button id="acceptOffer" class="primary">Accept offer</button>
                  <button id="denyOffer">Deny offer</button>
                </div>
              </div>
            ` : `
              <div class="offer-box">
                <p class="fine">Why Jessup responded this way:</p>
                <pre class="offer-reason">${escapeHtml(pendingOffer.reason || pendingOffer.message || "No reasoning provided.")}</pre>
                ${pendingOffer.raw ? `<p class="fine">Raw response:</p><pre class="offer-reason">${escapeHtml(pendingOffer.raw)}</pre>` : ""}
              </div>
            `}
          </div>
        ` : `
          <label>Requested amount <input id="loanAmount" type="number" min="${lab.bank.policy.minLoan}" max="${lab.bank.policy.maxLoan}" value="${Math.min(500, lab.bank.policy.maxLoan)}"></label>
          <label>What should Jessup know? <textarea id="loanPurpose" rows="5">I need more practice funds and can repay after a few winning hands.</textarea></label>
          <button id="askTeller" class="primary">Ask teller</button>
          <p id="tellerStatus" class="fine">${escapeHtml(lab.bank.lastMessage)}</p>
        `}
      </article>
      <article class="service-panel">
        <h2>ATM Account</h2>
        <p class="fine">Deposits accrue ${lab.bank.policy.atmApr}% APR over casino clock time.</p>
        <label>Amount <input id="atmAmount" type="number" min="1" value="250"></label>
        <div class="button-row">
          <button id="atmDeposit" class="primary">Deposit</button>
          <button id="atmWithdraw">Withdraw</button>
        </div>
        <p class="fine">ATM balance: ${chips(lab.bank.atm.balance)} | Last accrual ${new Date(lab.bank.atm.lastInterestAt).toLocaleString()}</p>
      </article>
      <article class="service-panel">
        <h2>Loans</h2>
        <p class="fine">Active loans: ${loans.length} | Paid loans: ${lab.bank.loans.filter((loan) => loan.status === "paid").length} | Trust: ${lab.bank.trust}%</p>
        ${loans.length ? loans.map(loanMarkup).join("") : `<p class="fine">No active loans.</p>`}
      </article>
      <article class="service-panel">
        <h2>Bank conversation history</h2>
        ${bankHistoryMarkup()}
      </article>
      <article class="service-panel wide">
        <h2>Teller Notifications</h2>
        ${bankNotifications().map((item) => `<div class="notice ${item.kind}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></div>`).join("")}
      </article>
    </section>
  `;
  bindBankActions();
}

function updateServices() {
  accrueAtmInterest();
  const last = new Date(lab.drink.lastTickAt || new Date()).getTime();
  const minutes = Math.max(0, (Date.now() - last) / 60000);
  if (minutes > 0.1) {
    lab.drink.thirst = clamp(lab.drink.thirst - minutes * 0.35, 0, 100);
    lab.drink.lastTickAt = new Date().toISOString();
  }
  lab.bank.notifications = bankNotifications();
}

function casinoNow() {
  const start = new Date(lab.bank.clock.startedAt || new Date()).getTime();
  return new Date(start + (Date.now() - start));
}

function casinoClock() {
  return casinoNow().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function accrueAtmInterest() {
  const atm = lab.bank.atm;
  if (!atm.lastInterestAt) atm.lastInterestAt = new Date().toISOString();
  const elapsedHours = Math.max(0, (Date.now() - new Date(atm.lastInterestAt).getTime()) / 3600000);
  if (elapsedHours < 0.01 || atm.balance <= 0) return;
  const hourlyRate = Number(lab.bank.policy.atmApr || 0) / 100 / 365 / 24;
  atm.balance = Math.round((atm.balance * Math.pow(1 + hourlyRate, elapsedHours)) * 100) / 100;
  atm.lastInterestAt = new Date().toISOString();
}

function drainThirst(wager, action) {
  const speed = lab.round ? 1.25 : 1;
  const risk = Math.min(4, Math.max(0.7, Number(wager || 0) / Math.max(100, lab.bankroll || 100)));
  const actionCost = { deal: 1.2, hit: 0.9, stand: 0.55, double: 1.8, split: 1.7, surrender: 0.75 }[action] || 0.8;
  lab.drink.thirst = clamp(lab.drink.thirst - actionCost * speed * (1 + risk), 0, 100);
  lab.drink.lastTickAt = new Date().toISOString();
}

function hardBlockedByLoan() {
  const now = casinoNow().getTime();
  return lab.bank.loans.some((loan) => loan.status === "active" && now - new Date(loan.dueAt).getTime() > 10 * 60000);
}

function activeDebt() {
  return lab.bank.loans.filter((loan) => loan.status === "active").reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
}

function bankNotifications() {
  const notices = [];
  const now = casinoNow().getTime();
  for (const loan of lab.bank.loans.filter((item) => item.status === "active")) {
    const dueMs = new Date(loan.dueAt).getTime() - now;
    if (dueMs <= 0) {
      notices.push({ kind: "bad", title: "Teller request", body: `Loan payment due now: ${chips(loan.balance)}.` });
    } else if (dueMs < 5 * 60000) {
      notices.push({ kind: "warn", title: "Teller reminder", body: `Loan due soon: ${chips(loan.balance)} in ${Math.ceil(dueMs / 60000)} min.` });
    }
  }
  if (lab.drink.thirst <= 0) notices.push({ kind: "bad", title: "Drink required", body: "You must buy a drink before continuing play." });
  else if (lab.drink.thirst < 20) notices.push({ kind: "warn", title: "Drink meter low", body: "Visit the Drink Server soon or table play will stop." });
  if (lab.bank.trust < 35) notices.push({ kind: "warn", title: "Low bank trust", body: `Trust score is ${lab.bank.trust}%. Repaying loans on time will help Jessup approve more requests.` });
  else if (lab.bank.trust > 75) notices.push({ kind: "good", title: "Trusted borrower", body: `Trust score is ${lab.bank.trust}%. The bank is more likely to offer favorable terms.` });
  if (!notices.length) notices.push({ kind: "good", title: "Table clear", body: "No teller holds. Drink meter is acceptable." });
  return notices;
}

function bankLoanSummary(activeLoans) {
  const now = casinoNow().getTime();
  return {
    activeDebt: activeLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0),
    activeLoanCount: activeLoans.length,
    paidLoanCount: lab.bank.loans.filter((loan) => loan.status === "paid").length,
    overdueLoanCount: activeLoans.filter((loan) => new Date(loan.dueAt).getTime() < now).length,
    declinedOfferCount: lab.bank.history.filter((entry) => entry.type === "denied").length,
    trustScore: Number(lab.bank.trust || 0),
  };
}

function fallbackAlternativeOffer(decision, requestedAmount, policy) {
  return {
    kind: "loan",
    amount: clamp(Math.max(policy.minLoan, Math.min(policy.maxLoan, Math.round(requestedAmount * 0.5))), policy.minLoan, policy.maxLoan),
    interestPercent: clamp(policy.maxInterest, policy.minInterest, policy.maxInterest),
    dueMinutes: clamp(policy.maxDueMinutes, policy.minDueMinutes, policy.maxDueMinutes),
    message: decision.message ? `Alternative terms: ${decision.message}` : "Jessup offers a lower alternative loan.",
    reason: "Alternative loan is provided so the user can accept or deny a smaller offer.",
  };
}

function adjustBankTrust(delta, reason) {
  if (!delta) return;
  lab.bank.trust = clamp(Number(lab.bank.trust || 0) + delta, 0, 100);
  lab.bank.trustHistory.unshift({
    at: new Date().toISOString(),
    change: delta,
    reason: String(reason || "Trust adjusted"),
    trust: lab.bank.trust,
  });
  lab.bank.trustHistory = lab.bank.trustHistory.slice(0, 40);
}

function serviceNoticeMarkup() {
  return `
    <section class="service-notices">
      <div class="drink-meter small"><i style="width:${clamp(lab.drink.thirst, 0, 100)}%"></i></div>
      ${bankNotifications().slice(0, 3).map((notice) => `<div class="notice ${notice.kind}"><strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.body)}</span></div>`).join("")}
    </section>
  `;
}

function thirstLabel() {
  if (lab.drink.thirst <= 0) return "Too thirsty to play. Buy and consume a drink.";
  if (lab.drink.thirst < 20) return "Low. Risky or fast play may lock the table soon.";
  if (lab.drink.thirst < 55) return "Manageable, but draining.";
  return "Comfortable.";
}

function renderDrinks() {
  updateServices();
  app.innerHTML = `
    <section class="topbar">
      <div><p class="eyebrow">Drink server</p><h1>Refreshments</h1><p class="runtime-badge">Thirst drains faster with larger bets, risky moves, and faster play.</p></div>
      <div class="top-stats">${metric("Thirst", `${Math.round(lab.drink.thirst)}%`)}${metric("Bankroll", chips(lab.bankroll))}${metric("Play status", canUseTable() ? "Ready" : "Blocked")}</div>
    </section>
    <section class="drink-meter-wrap">
      <div class="drink-meter"><i style="width:${clamp(lab.drink.thirst, 0, 100)}%"></i></div>
      <p class="fine">${thirstLabel()}</p>
    </section>
    <section class="drink-grid">
      ${drinkMenu().map((drink) => `
        <article class="drink-card">
          <h2>${drink.name}</h2>
          <p>${drink.description}</p>
          <strong>${chips(drink.cost)}</strong>
          <button data-drink="${drink.id}" class="primary">Buy and drink +${drink.refill}%</button>
        </article>
      `).join("")}
    </section>
    <section class="history-list">
      <h2>Recent drink orders</h2>
      ${lab.drink.purchases.length ? lab.drink.purchases.slice(0, 8).map((item) => `<div class="history-row"><strong>${escapeHtml(item.name)}</strong><span>${chips(item.cost)} | +${item.refill}% thirst</span><small>${new Date(item.at).toLocaleString()}</small></div>`).join("") : `<p class="fine">No drinks purchased yet.</p>`}
    </section>
  `;
  document.querySelectorAll("[data-drink]").forEach((button) => {
    button.addEventListener("click", () => buyDrink(button.dataset.drink));
  });
}

function bindBankActions() {
  document.querySelector("#askTeller")?.addEventListener("click", async () => {
    const amount = Math.max(50, Number(document.querySelector("#loanAmount").value) || 0);
    const purpose = document.querySelector("#loanPurpose").value.trim();
    const status = document.querySelector("#tellerStatus");
    status.textContent = "Jessup is reviewing the request...";
    try {
      const activeLoans = lab.bank.loans.filter((loan) => loan.status === "active");
      const response = await askOllama({
        url: lab.rules.ollamaUrl,
        model: lab.bank.model,
        prompt: bankPrompt({
          amount,
          purpose,
          bankroll: lab.bankroll,
          activeLoans,
          thirst: lab.drink.thirst,
          history: lab.bank.history,
          policy: lab.bank.policy,
          clock: casinoClock(),
          loanSummary: bankLoanSummary(activeLoans),
          promptTemplate: lab.rules.bankPrompt,
        }),
      });
      const decision = parseTellerDecision(response, amount);
      if (decision.approved) {
        recordTellerOffer(decision, response, purpose);
      } else {
        applyTellerDecision(decision, response, "denied");
      }
      render();
    } catch (error) {
      const decision = fallbackTellerDecision(amount);
      applyTellerDecision(decision, `Jessup unavailable; local teller fallback used. ${error.message}`, "denied");
      render();
    }
  });
  document.querySelectorAll("[data-pay-loan]").forEach((button) => {
    button.addEventListener("click", () => {
      payLoan(button.dataset.payLoan);
    });
  });
  document.querySelectorAll("[data-bank-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!lab.bank.pendingOffer) return;
      lab.bank.pendingOfferTab = button.dataset.bankTab;
      saveLab(lab);
      render();
    });
  });
  document.querySelector("#acceptOffer")?.addEventListener("click", () => acceptTellerOffer());
  document.querySelector("#denyOffer")?.addEventListener("click", () => denyTellerOffer());
  document.querySelector("#atmDeposit")?.addEventListener("click", () => atmMove("deposit"));
  document.querySelector("#atmWithdraw")?.addEventListener("click", () => atmMove("withdraw"));
}

function applyTellerDecision(decision, raw, status = "final") {
  const now = Date.now();
  const policy = lab.bank.policy;
  const wasPendingOffer = Boolean(lab.bank.pendingOffer);
  const amount = clamp(Number(decision.amount || 0), 0, policy.maxLoan);
  const approved = Boolean(decision.approved) && amount > 0;

  if (status === "accepted") {
    if (approved && decision.kind === "grant") {
      lab.bankroll += Math.min(policy.grantMax, amount);
      lab.bank.lastMessage = decision.message || "Jessup approved a small courtesy credit.";
      adjustBankTrust(2, "Grant accepted by player");
    } else if (approved) {
      const interestPercent = clamp(Number(decision.interestPercent || policy.minInterest), policy.minInterest, policy.maxInterest);
      const dueMinutes = clamp(Number(decision.dueMinutes || policy.minDueMinutes), policy.minDueMinutes, policy.maxDueMinutes);
      const balance = Math.round(amount * (1 + interestPercent / 100));
      lab.bankroll += amount;
      lab.bank.loans.unshift({
        id: `loan_${now}`,
        principal: amount,
        balance,
        interestPercent,
        dueAt: new Date(casinoNow().getTime() + dueMinutes * 60000).toISOString(),
        status: "active",
        createdAt: new Date(now).toISOString(),
      });
      lab.bank.lastMessage = decision.message || `Offer accepted: ${chips(amount)} at ${interestPercent}% interest.`;
      adjustBankTrust(1, "Loan accepted by player");
    }
  } else if (status === "denied") {
    if (wasPendingOffer && decision.kind === "deny") {
      lab.bank.lastMessage = decision.message || "You declined the teller offer.";
      adjustBankTrust(-1, "Offer denied by player");
    } else {
      lab.bank.lastMessage = decision.message || "Jessup declined the request. Try again later with a smaller amount.";
      adjustBankTrust(-2, "Loan request denied");
      lab.bank.nextEligibleAt = new Date(casinoNow().getTime() + policy.cooldownMinutes * 60000).toISOString();
    }
    lab.bank.pendingOffer = null;
  }

  lab.bank.history.unshift({ at: new Date().toISOString(), type: status, status, decision, raw });
  lab.bank.history = lab.bank.history.slice(0, 60);
  lab.bank.pendingOffer = null;
  saveLab(lab);
}

function recordTellerOffer(decision, raw, purpose) {
  const offer = {
    ...decision,
    type: "offer",
    purpose,
    request: { amount: decision.amount, purpose },
    reason: decision.reason || decision.message || "",
    createdAt: new Date().toISOString(),
    raw,
  };
  if (!offer.approved && !offer.alternative) {
    offer.alternative = fallbackAlternativeOffer(decision, decision.amount, lab.bank.policy);
  }
  lab.bank.pendingOffer = offer;
  lab.bank.pendingOfferTab = "offer";
  lab.bank.lastMessage = offer.message || `Jessup offered ${chips(offer.amount)}.`;
  lab.bank.history.unshift({ at: new Date().toISOString(), type: "offer", decision, raw });
  lab.bank.history = lab.bank.history.slice(0, 60);
  saveLab(lab);
}

function acceptTellerOffer() {
  const offer = lab.bank.pendingOffer;
  if (!offer) return;
  const decision = offer.alternative && !offer.approved ? { ...offer.alternative, approved: true } : { ...offer, approved: true };
  const acceptedMessage = offer.alternative && !offer.approved
    ? offer.alternative.message || offer.message || "Alternative offer accepted."
    : offer.message || "User accepted the teller terms.";
  applyTellerDecision(decision, `Offer accepted: ${acceptedMessage}`, "accepted");
  render();
}

function denyTellerOffer() {
  const offer = lab.bank.pendingOffer;
  if (!offer) return;
  const decision = { ...offer, approved: false, kind: "deny" };
  applyTellerDecision(decision, `Offer denied by user.`, "denied");
  render();
}

function bankHistoryMarkup() {
  const history = lab.bank.history.slice(0, 8);
  if (!history.length) return `<p class="fine">No recent bank conversations.</p>`;
  return history.map((item) => {
    const when = new Date(item.at).toLocaleString();
    const kind = item.type === "offer" ? "Offer" : item.type === "accepted" ? "Accepted" : item.type === "paid" ? "Repaid" : "Denied";
    const decision = item.decision || {};
    const amount = decision.amount ? chips(decision.amount) : decision.balance ? chips(decision.balance) : "-";
    const terms = decision.kind === "loan" ? `${decision.interestPercent}% / ${decision.dueMinutes}m` : decision.kind === "grant" ? "grant" : "";
    const reason = decision.reason ? ` | ${escapeHtml(decision.reason)}` : "";
    return `<div class="history-row"><strong>${escapeHtml(kind)}</strong><span>${amount}${terms ? ` | ${escapeHtml(terms)}` : ""}${reason}</span><small>${escapeHtml(when)} | ${escapeHtml(decision.message || "No message")}</small></div>`;
  }).join("");
}

function parseTellerDecision(text, requestedAmount) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fallbackTellerDecision(requestedAmount, text);
  try {
    const parsed = JSON.parse(match[0]);
    const decision = {
      approved: Boolean(parsed.approved),
      kind: ["loan", "grant", "deny"].includes(parsed.kind) ? parsed.kind : parsed.approved ? "loan" : "deny",
      amount: Number(parsed.amount || requestedAmount),
      interestPercent: Number(parsed.interestPercent || 12),
      dueMinutes: Number(parsed.dueMinutes || 20),
      message: String(parsed.message || text).slice(0, 240),
      reason: String(parsed.reason || parsed.message || text).slice(0, 240),
      alternative: null,
    };
    if (parsed.alternative && typeof parsed.alternative === "object") {
      decision.alternative = {
        kind: ["loan", "grant", "deny"].includes(parsed.alternative.kind) ? parsed.alternative.kind : "loan",
        amount: Number(parsed.alternative.amount || Math.max(0, requestedAmount * 0.5)),
        interestPercent: Number(parsed.alternative.interestPercent || decision.interestPercent),
        dueMinutes: Number(parsed.alternative.dueMinutes || decision.dueMinutes),
        message: String(parsed.alternative.message || text).slice(0, 240),
        reason: String(parsed.alternative.reason || parsed.reason || parsed.message || text).slice(0, 240),
      };
    }
    return decision;
  } catch {
    return fallbackTellerDecision(requestedAmount, text);
  }
}

function fallbackTellerDecision(amount, message = "") {
  const debt = activeDebt();
  const policy = lab.bank.policy;
  if (lab.bank.trust < 25) {
    return {
      approved: false,
      kind: "deny",
      amount: 0,
      interestPercent: 0,
      dueMinutes: policy.cooldownMinutes,
      message: "Trust too low for a new loan right now.",
    };
  }
  const kindness = Number(policy.kindness || 0) / 100;
  const cap = Math.min(policy.maxLoan, Math.max(policy.minLoan, lab.bankroll * (0.25 + kindness * 0.5)));
  const approved = amount <= cap && debt < lab.bankroll * (0.5 + kindness);
  return {
    approved,
    kind: approved ? "loan" : "deny",
    amount: approved ? clamp(amount, policy.minLoan, policy.maxLoan) : 0,
    interestPercent: approved ? Math.round(policy.maxInterest - kindness * (policy.maxInterest - policy.minInterest) * 0.35) : 0,
    dueMinutes: approved ? Math.round(policy.minDueMinutes + kindness * (policy.maxDueMinutes - policy.minDueMinutes) * 0.4) : policy.cooldownMinutes,
    message: approved ? `Fine. House terms: ${chips(amount)} with interest. Don't make me chase you.` : message || "No. Too much risk for too little house edge.",
  };
}

function atmMove(kind) {
  accrueAtmInterest();
  const amount = Math.max(1, Number(document.querySelector("#atmAmount")?.value) || 0);
  if (kind === "deposit") {
    if (lab.bankroll < amount) return toast("Not enough bankroll to deposit.", "bad");
    lab.bankroll -= amount;
    lab.bank.atm.balance += amount;
  } else {
    if (lab.bank.atm.balance < amount) return toast("Not enough ATM balance.", "bad");
    lab.bank.atm.balance -= amount;
    lab.bankroll += amount;
  }
  lab.bank.atm.lastInterestAt = new Date().toISOString();
  saveLab(lab);
  render();
}

function payLoan(id) {
  const loan = lab.bank.loans.find((item) => item.id === id && item.status === "active");
  if (!loan) return;
  if (lab.bankroll < loan.balance) return toast("Not enough bankroll to repay this loan.", "bad");
  const now = casinoNow().getTime();
  const overdue = now > new Date(loan.dueAt).getTime();
  lab.bankroll -= loan.balance;
  loan.status = "paid";
  loan.paidAt = new Date().toISOString();
  lab.bank.lastMessage = overdue ? `Late repayment received: ${chips(loan.balance)}.` : `Loan repaid: ${chips(loan.balance)}.`;
  adjustBankTrust(overdue ? 2 : 5, overdue ? "Late loan repayment" : "On-time loan repayment");
  lab.bank.history.unshift({
    at: new Date().toISOString(),
    type: "paid",
    status: "paid",
    decision: { ...loan },
    raw: `Loan repaid ${chips(loan.balance)}.`,
  });
  lab.bank.history = lab.bank.history.slice(0, 60);
  saveLab(lab);
  render();
}

function loanMarkup(loan) {
  const due = new Date(loan.dueAt);
  const overdue = Date.now() > due.getTime();
  return `
    <div class="loan-row ${overdue ? "overdue" : ""}">
      <strong>${chips(loan.balance)}</strong>
      <span>Principal ${chips(loan.principal)} | ${loan.interestPercent}% interest</span>
      <small>Due ${due.toLocaleString()}</small>
      <button data-pay-loan="${loan.id}" class="primary">Repay loan</button>
    </div>
  `;
}

function buyDrink(id) {
  const drink = drinkMenu().find((item) => item.id === id);
  if (!drink) return;
  if (lab.bankroll < drink.cost) return toast("Not enough bankroll for that drink.", "bad");
  lab.bankroll -= drink.cost;
  lab.drink.thirst = clamp(lab.drink.thirst + drink.refill, 0, 100);
  lab.drink.lastTickAt = new Date().toISOString();
  lab.drink.purchases.unshift({ ...drink, at: new Date().toISOString() });
  lab.drink.purchases = lab.drink.purchases.slice(0, 30);
  saveLab(lab);
  render();
}

function drinkMenu() {
  return [
    { id: "water", name: "Water", cost: 25, refill: 25, description: "Simple table water. Cheap and reliable." },
    { id: "sparkling", name: "Fancy Water", cost: 75, refill: 45, description: "A cleaner refill with a little table presence." },
    { id: "electrolyte", name: "Electrolyte Bottle", cost: 150, refill: 70, description: "Keeps longer sessions moving." },
    { id: "reserve", name: "Reserve Mineral Water", cost: 300, refill: 100, description: "Full reset for serious sessions." },
  ];
}

function emptyTableMarkup() {
  return `
    <div class="dealer-zone">
      <span class="zone-label">Dealer</span>
      <div class="empty-seat">Shuffle and deal to begin.</div>
    </div>
    <div class="shoe-visual">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
    <div class="player-zone">
      <span class="zone-label">Player</span>
      <div class="empty-seat">Training stats persist locally.</div>
    </div>
  `;
}

function tableMarkup(round) {
  const hideHole = round.state !== "done";
  return `
    <div class="count-ribbon">
      <span>RC <strong>${lab.runningCount}</strong></span>
      <span>TC <strong>${lab.trueCount.toFixed(2)}</strong></span>
      <span>Shoe <strong>${shoeCardCount()}</strong></span>
    </div>
    ${lab.activeView === "auto" ? autoTableOverlay(round) : ""}
    <div class="dealer-zone">
      <span class="zone-label">Dealer ${hideHole ? "" : `(${handValue(round.dealer)})`}</span>
      <div class="hand-row">${round.dealer.map((card, idx) => cardMarkup(card, hideHole && idx === 1, idx)).join("")}</div>
    </div>
    <div class="shoe-visual">${Array.from({ length: Math.min(24, Math.ceil(shoeCardCount() / 13)) }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
    <div class="player-zone">
      <span class="zone-label">Player Hands</span>
      <div class="hands-grid">
        ${round.hands.map((hand, idx) => handMarkup(hand, idx, idx === round.currentHand && round.state === "playing")).join("")}
      </div>
    </div>
    ${tablePlayersMarkup(round)}
    ${round.state === "done" ? `<div class="result-banner ${round.summary.result.toLowerCase()}"><strong>${round.summary.result}</strong><span>Net ${chips(round.summary.net)} | Dealer ${round.summary.dealer}</span></div>` : ""}
  `;
}

function handMarkup(hand, idx, active) {
  return `
    <div class="player-hand ${active ? "active" : ""} ${hand.result ? resultClass(hand.result) : ""}">
      <div class="hand-head"><strong>Hand ${idx + 1}</strong><span>${handOwnerLabel(idx)} | ${handValue(hand.cards)} | ${chips(hand.bet)}</span></div>
      <div class="hand-row">${hand.cards.map((card, cardIdx) => cardMarkup(card, false, cardIdx)).join("")}</div>
      ${chipStack(hand.bet)}
      <small>${hand.result || hand.status}</small>
    </div>
  `;
}

function cardMarkup(card, hidden = false, idx = 0) {
  const red = ["H", "D"].includes(card.suit);
  const count = hiLoValue(card);
  const countText = count > 0 ? `+${count}` : String(count);
  if (hidden) return `<div class="card hidden" style="--deal:${idx}"><b>◆</b><em class="count-badge">?</em></div>`;
  return `<div class="card ${red ? "red" : ""}" style="--deal:${idx}"><b>${card.rank}</b><span>${cardText(card).slice(-1)}</span><em class="count-badge ${count > 0 ? "plus" : count < 0 ? "minus" : ""}">${countText}</em></div>`;
}

function betControlsMarkup(round) {
  const blocked = !canUseTable();
  if (isMultiplayerSession()) {
    const remoteRound = round;
    return `
      <label>Bet <input id="betInput" type="number" min="${lab.rules.minBet}" max="${lab.rules.maxBet}" value="100"></label>
      <button id="dealHand" class="primary" ${blocked || (remoteRound?.state !== "done" && remoteRound) ? "disabled" : ""}>${remoteRound && remoteRound.state !== "done" ? "Waiting for server round" : "Place bet on server"}</button>
      <p class="fine">Server validates all bets and actions. If a round is active, wait for it to finish.</p>
    `;
  }
  const players = Number(lab.tablePlayers || 1);
  return `
    <label>Bet <input id="betInput" type="number" min="${lab.rules.minBet}" max="${lab.rules.maxBet}" value="100"></label>
    <label>Players <input id="playerCount" type="number" min="1" max="4" value="${players}"></label>
    <div class="button-row tight">
      <button id="dealHand" class="primary" ${blocked ? "disabled" : ""}>Deal hand</button>
    </div>
    ${playersPanelMarkup()}
    ${lab.round?.state === "done" ? `<button id="clearRound">Clear table</button>` : ""}
  `;
}

function playControlsMarkup(hand) {
  const blocked = !canUseTable();
  return `
    <div class="action-grid">
      <button id="hitBtn" ${blocked || !canAct(lab, "hit") ? "disabled" : ""}>Hit</button>
      <button id="standBtn" ${blocked || !canAct(lab, "stand") ? "disabled" : ""}>Stand</button>
      <button id="doubleBtn" ${blocked || !canAct(lab, "double") ? "disabled" : ""}>Double</button>
      <button id="splitBtn" ${blocked || !canAct(lab, "split") ? "disabled" : ""}>Split</button>
      <button id="surrenderBtn" ${blocked || !canAct(lab, "surrender") ? "disabled" : ""}>Surrender</button>
    </div>
    <p class="fine">Active total: ${handValue(hand.cards)}${isSoft(hand.cards) ? " soft" : ""}</p>
  `;
}

function dealerControlsMarkup(round) {
  const playerBj = round.hands.some((hand) => hand.status === "blackjack" || isBlackjack(hand.cards));
  return `
    <div class="settle-panel">
      <strong>${playerBj ? "Blackjack dealt" : "Dealer turn ready"}</strong>
      <span>${playerBj ? "Natural 21 is locked in. Reveal the dealer and settle the payout." : "Player actions are complete. Continue to resolve the dealer hand."}</span>
    </div>
    <button id="continueDealer" class="primary">Reveal dealer and settle</button>
  `;
}

function handOddsMarkup(round, hand) {
  if (!round || !hand) {
    return `<section class="odds-panel"><h3>Hand Percentages</h3><p class="fine">Deal a hand to see live hit and dealer pressure percentages.</p></section>`;
  }
  const odds = nextCardOdds(hand.cards);
  const dealer = dealerPressure(round.dealer[0]);
  return `
    <section class="odds-panel">
      <h3>Hand Percentages</h3>
      <div class="mini-metrics">
        ${miniMetric("Total", `${handValue(hand.cards)}${isSoft(hand.cards) ? " soft" : ""}`)}
        ${miniMetric("Bust next card", `${odds.bust}%`)}
        ${miniMetric("Improve", `${odds.improve}%`)}
        ${miniMetric("Worsen", `${odds.worsen}%`)}
        ${miniMetric("Make 21", `${odds.twentyOne}%`)}
        ${miniMetric("Dealer bust", `${dealer.bust}%`)}
        ${miniMetric("Dealer 17-21", `${dealer.made}%`)}
      </div>
    </section>
  `;
}

function shoeProbabilityMarkup() {
  const ranks = shoeProbabilityData().map((item) => {
    return `
      <div class="prob-row">
        <strong>${item.rank}</strong>
        <span>${item.count}</span>
        <div><i style="width:${item.percent}%"></i></div>
        <em>${item.percent.toFixed(1)}%</em>
        <small class="${item.hiLo > 0 ? "plus" : item.hiLo < 0 ? "minus" : ""}">${item.hiLo > 0 ? "+" : ""}${item.hiLo}</small>
      </div>
    `;
  }).join("");
  return `
    <section class="shoe-chart">
      <div class="section-head"><h3>Shoe Probability</h3><span>${shoeCardCount()} cards left</span></div>
      ${ranks}
    </section>
  `;
}

function shoeProbabilityData() {
  const cards = shoeCards();
  const counts = rankCounts(cards);
  const total = Math.max(1, shoeCardCount());
  return RANKS.map((rank) => {
    const count = counts[rank] || 0;
    const sample = cards.find((card) => card.rank === rank);
    const hiLo = sample ? hiLoValue(sample) : rank === "A" || ["10", "J", "Q", "K"].includes(rank) ? -1 : ["2", "3", "4", "5", "6"].includes(rank) ? 1 : 0;
    return {
      rank,
      count,
      percent: Number(((count / total) * 100).toFixed(2)),
      hiLo,
    };
  });
}

function rankCounts(cards) {
  return cards.reduce((acc, card) => {
    acc[card.rank] = (acc[card.rank] || 0) + 1;
    return acc;
  }, {});
}

function nextCardOdds(cards) {
  const shoe = shoeCards();
  const total = Math.max(1, shoeCardCount());
  const current = handValue(cards);
  let bust = 0;
  let improve = 0;
  let worsen = 0;
  let twentyOne = 0;
  for (const card of shoe) {
    const next = handValue([...cards, card]);
    if (next > 21) bust += 1;
    if (next > current && next <= 21) improve += 1;
    if (next < current) worsen += 1;
    if (next === 21) twentyOne += 1;
  }
  return {
    bust: Math.round((bust / total) * 100),
    improve: Math.round((improve / total) * 100),
    worsen: Math.round((worsen / total) * 100),
    twentyOne: Math.round((twentyOne / total) * 100),
  };
}

function dealerPressure(upCard) {
  const shoe = shoeCards();
  const total = Math.max(1, shoeCardCount());
  let bust = 0;
  let made = 0;
  for (const card of shoe) {
    const value = handValue([upCard, card]);
    if (value >= 17 && value <= 21) made += 1;
    if (value > 21) bust += 1;
  }
  return {
    bust: Math.round((bust / total) * 100),
    made: Math.round((made / total) * 100),
  };
}

function autoTableOverlay(round) {
  const visual = lab.auto.visual;
  const run = lab.auto.currentRun || validAutoRuns()[0];
  const tone = visual?.tone || (round?.summary?.result?.toLowerCase() || "idle");
  const action = visual?.action ? visual.action.toUpperCase() : round?.state === "done" ? round.summary.result : "WATCHING";
  const message = visual?.message || (lab.auto.running ? "Auto player is reading the table." : "Start auto mode to watch the player think.");
  const net = run ? chips(run.net) : "0 pts";
  const hands = run ? `${run.hands}/${run.handsTarget}` : `${lab.auto.handsPlayed}/${lab.auto.handsTarget}`;
  return `
    <div class="auto-table-hud ${tone}">
      <div>
        <span>Best move</span>
        <strong>${escapeHtml(action)}</strong>
      </div>
      <p>${escapeHtml(message)}</p>
      <div class="auto-scoreline">
        <span>Hands <b>${hands}</b></span>
        <span>Run net <b>${net}</b></span>
        <span>Bankroll <b>${chips(lab.bankroll)}</b></span>
      </div>
    </div>
  `;
}

function autoWatchPanel(round) {
  const run = lab.auto.currentRun || validAutoRuns()[0];
  const visual = lab.auto.visual;
  const wins = run?.wins || 0;
  const losses = run?.losses || 0;
  const pushes = run?.pushes || 0;
  const total = Math.max(1, wins + losses + pushes);
  const current = round && activeHand(lab);
  return `
    <section class="auto-watch">
      <div class="section-head"><h3>Live Watch</h3><span>${lab.auto.running ? "running" : "ready"}</span></div>
      <div class="decision-tile ${visual?.tone || "idle"}">
        <small>${visual?.phase || "next action"}</small>
        <strong>${visual?.action ? visual.action.toUpperCase() : current ? chooseAutoAction(current).toUpperCase() : "WAIT"}</strong>
        <span>${visual?.message || "The simulation will call out each decision here."}</span>
      </div>
      <div class="score-bars">
        <label>Wins <span>${wins}</span><i style="width:${(wins / total) * 100}%"></i></label>
        <label>Losses <span>${losses}</span><i class="loss" style="width:${(losses / total) * 100}%"></i></label>
        <label>Pushes <span>${pushes}</span><i class="push" style="width:${(pushes / total) * 100}%"></i></label>
      </div>
      <div class="mini-metrics">
        ${miniMetric("Current total", current ? handValue(current.cards) : round?.state === "done" ? "settled" : "-")}
        ${miniMetric("Dealer", round ? (round.state === "done" ? handValue(round.dealer) : cardText(round.dealer[0])) : "-")}
        ${miniMetric("Run net", run ? chips(run.net) : "0 pts")}
        ${miniMetric("Best bet", chips(autoBetForNextHand()))}
      </div>
    </section>
  `;
}

function bindTableActions() {
  document.querySelector("#shuffleShoe")?.addEventListener("click", () => {
    if (isMultiplayerMode()) return toast("Shoe shuffling is handled by the server.", "warn");
    ensureShoe(lab, true);
    render();
  });
  document.querySelector("#dealHand")?.addEventListener("click", () => {
    try {
      if (!canUseTable()) throw new Error(tableBlockReason());
      const bet = Number(document.querySelector("#betInput").value) || 100;
      const playerCountInput = Number(document.querySelector("#playerCount")?.value || lab.tablePlayers || 1);
      const playerCount = Math.max(1, Math.min(4, playerCountInput));
      lab.tablePlayers = playerCount;
      ensureTablePlayersInfo();
      drainThirst(bet, "deal");
      if (isMultiplayerSession()) {
        sendNetworkBet(bet);
      } else {
        startRound(lab, bet, playerCount);
      }
      render();
    } catch (error) {
      toast(error.message, "bad");
    }
  });
  document.querySelector("#loadPlayers")?.addEventListener("click", () => {
    loadPlayers();
    render();
  });
  document.querySelector("#clearRound")?.addEventListener("click", () => {
    if (isMultiplayerMode()) {
      return toast("Room state is controlled by the server.", "warn");
    }
    discardRound(lab);
    render();
  });
  document.querySelector("#continueDealer")?.addEventListener("click", async () => {
    if (isMultiplayerMode()) return toast("Room state is controlled by the server.", "warn");
    await dealerTurn(lab);
    render();
  });
  document.querySelector("#toggleShoeChart")?.addEventListener("click", () => {
    lab.ui.showShoeChart = !lab.ui.showShoeChart;
    render();
  });
  document.querySelector("#hitBtn")?.addEventListener("click", async () => {
    if (!canUseTable()) return toast(tableBlockReason(), "bad");
    if (isMultiplayerSession()) {
      if (!isMultiplayerPlayerTurn()) return toast("Wait for the current player to act.", "bad");
      sendNetworkAction("hit");
    } else {
      drainThirst(activeHand(lab)?.bet || 100, "hit");
      hit(lab);
      if (lab.round?.state === "dealer") await dealerTurn(lab);
    }
    render();
  });
  document.querySelector("#standBtn")?.addEventListener("click", async () => {
    if (!canUseTable()) return toast(tableBlockReason(), "bad");
    if (isMultiplayerSession()) {
      if (!isMultiplayerPlayerTurn()) return toast("Wait for the current player to act.", "bad");
      sendNetworkAction("stand");
    } else {
      drainThirst(activeHand(lab)?.bet || 100, "stand");
      stand(lab);
      if (lab.round?.state === "dealer") await dealerTurn(lab);
    }
    render();
  });
  document.querySelector("#doubleBtn")?.addEventListener("click", async () => {
    if (!canUseTable()) return toast(tableBlockReason(), "bad");
    if (isMultiplayerSession()) {
      if (!isMultiplayerPlayerTurn()) return toast("Wait for the current player to act.", "bad");
      sendNetworkAction("double");
    } else {
      drainThirst((activeHand(lab)?.bet || 100) * 2, "double");
      doubleDown(lab);
      if (lab.round?.state === "dealer") await dealerTurn(lab);
    }
    render();
  });
  document.querySelector("#splitBtn")?.addEventListener("click", async () => {
    if (!canUseTable()) return toast(tableBlockReason(), "bad");
    if (isMultiplayerSession()) {
      if (!isMultiplayerPlayerTurn()) return toast("Wait for the current player to act.", "bad");
      sendNetworkAction("split");
    } else {
      drainThirst(activeHand(lab)?.bet || 100, "split");
      split(lab);
      if (lab.round?.state === "dealer") await dealerTurn(lab);
    }
    render();
  });
  document.querySelector("#surrenderBtn")?.addEventListener("click", async () => {
    if (!canUseTable()) return toast(tableBlockReason(), "bad");
    if (isMultiplayerSession()) {
      if (!isMultiplayerPlayerTurn()) return toast("Wait for the current player to act.", "bad");
      sendNetworkAction("surrender");
    } else {
      drainThirst(activeHand(lab)?.bet || 100, "surrender");
      surrender(lab);
      if (lab.round?.state === "dealer") await dealerTurn(lab);
    }
    render();
  });
}

function renderCoach() {
  const panel = document.querySelector("#coachPanel");
  if (!panel) return;
  const round = lab.round;
  const hand = activeHand(lab);
  if (round?.state === "dealer") {
    const playerBj = round.hands.some((item) => item.status === "blackjack" || isBlackjack(item.cards));
    panel.innerHTML = `<h3>Coach</h3><div class="advice"><strong>${playerBj ? "BLACKJACK" : "SETTLE"}</strong><span>${playerBj ? "You were dealt a natural. Reveal the dealer to pay or push the hand." : "Player actions are complete. Reveal dealer cards to settle."}</span></div>`;
    return;
  }
  if (!round || round.state !== "playing" || !hand) {
    panel.innerHTML = `<h3>Coach</h3><p class="fine">Deal a hand to get basic strategy and optional Ollama explanations.</p>`;
    return;
  }
  const recommendation = basicStrategy(hand.cards, round.dealer[0], lab.rules);
  const coachState = buildCoachState(round, hand, recommendation);
  panel.innerHTML = `
    <h3>Coach</h3>
    <div class="advice"><strong>${recommendation.toUpperCase()}</strong><span>${explainStrategy(recommendation, hand.cards, round.dealer[0])}</span></div>
    <details class="coach-state">
      <summary>Full state sent to Ollama</summary>
      <pre>${escapeHtml(JSON.stringify(coachState.visibleState, null, 2))}</pre>
    </details>
    <button id="ollamaCoach">Ask Ollama why</button>
    <button id="takeAdvice" class="primary">Take advice: ${recommendation.toUpperCase()}</button>
    <p id="ollamaAnswer" class="fine"></p>
    <p id="outcomeAnswer" class="fine"></p>
  `;
  document.querySelector("#ollamaCoach").addEventListener("click", async () => {
    const answer = document.querySelector("#ollamaAnswer");
    answer.textContent = "Asking Ollama...";
    try {
      const text = await askOllama({
        url: lab.rules.ollamaUrl,
        model: lab.rules.ollamaModel,
        prompt: coachPrompt(round, lab.rules, coachState, lab.rules.coachPrompt),
      });
      answer.textContent = text;
      lab.adviceLog.unshift({ at: new Date().toISOString(), recommendation, model: lab.rules.ollamaModel, state: coachState.visibleState, text });
      saveLab(lab);
    } catch (error) {
      answer.textContent = `Ollama unavailable: ${error.message}`;
    }
  });
  document.querySelector("#takeAdvice").addEventListener("click", async () => {
    await takeAdvice(coachState);
  });
}

function bindAutoActions() {
  document.querySelector("#autoMode")?.addEventListener("change", (event) => {
    lab.auto.mode = event.target.value;
    saveLab(lab);
  });
  document.querySelector("#autoBettingMode")?.addEventListener("change", (event) => {
    lab.auto.bettingMode = event.target.value;
    saveLab(lab);
  });
  document.querySelector("#autoHands")?.addEventListener("change", (event) => {
    lab.auto.handsTarget = Math.max(1, Number(event.target.value) || 1);
    saveLab(lab);
  });
  document.querySelector("#autoBet")?.addEventListener("change", (event) => {
    lab.auto.bet = Math.max(lab.rules.minBet, Number(event.target.value) || lab.rules.minBet);
    saveLab(lab);
  });
  document.querySelector("#autoSpread")?.addEventListener("change", (event) => {
    lab.auto.spreadUnits = clamp(Math.round(Number(event.target.value) || 1), 1, 30);
    saveLab(lab);
  });
  document.querySelector("#autoRiskPct")?.addEventListener("change", (event) => {
    lab.auto.bankrollRiskPct = clamp(Number(event.target.value) || 2, 0.25, 10);
    saveLab(lab);
  });
  document.querySelector("#autoSpeed")?.addEventListener("change", (event) => {
    lab.auto.speedMs = Math.max(150, Number(event.target.value) || 900);
    saveLab(lab);
  });
  document.querySelectorAll("[data-auto-rule]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const key = event.target.dataset.autoRule;
      lab.auto.strategyRules[key] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      saveLab(lab);
      render();
    });
  });
  document.querySelector("#startAuto")?.addEventListener("click", () => {
    lab.auto.running = true;
    lab.auto.handsPlayed = 0;
    lab.auto.currentRun = createAutoRun();
    setAutoVisual("start", "ready", `Starting ${autoModeLabel(lab.auto.mode)} for ${lab.auto.handsTarget} hands.`, "deal");
    lab.auto.log.unshift(`Started ${autoModeLabel(lab.auto.mode)} simulation for ${lab.auto.handsTarget} hands.`);
    saveLab(lab);
    scheduleAutoStep(100);
    render();
  });
  document.querySelector("#stopAuto")?.addEventListener("click", () => {
    stopAuto("Stopped by user.");
  });
  document.querySelector("#clearAutoLog")?.addEventListener("click", () => {
    lab.auto.log = [];
    render();
  });
  document.querySelector("#clearAutoRuns")?.addEventListener("click", () => {
    if (!confirm("Clear stored auto run grades and summaries? Decision CSV rows will stay.")) return;
    lab.autoRuns = [];
    render();
  });
}

function scheduleAutoStep(delay = lab.auto.speedMs) {
  clearTimeout(autoTimer);
  if (!lab.auto.running) return;
  autoTimer = setTimeout(async () => {
    await runAutoStep();
  }, delay);
}

async function runAutoStep() {
  if (!lab.auto.running) return;
  try {
    if (!lab.round) {
      if (lab.auto.handsPlayed >= lab.auto.handsTarget) {
        stopAuto("Simulation complete.");
        return;
      }
      const wager = autoBetForNextHand();
      if (!canUseTable()) {
        stopAuto(tableBlockReason());
        return;
      }
      drainThirst(wager, "deal");
      startRound(lab, wager);
      setAutoVisual("deal", "deal", `Hand ${lab.auto.handsPlayed + 1} is on the table for ${chips(wager)}.`, "deal");
      lab.auto.log.unshift(`Hand ${lab.auto.handsPlayed + 1}: dealt ${lab.auto.mode} player for ${chips(wager)} at TC ${lab.trueCount.toFixed(2)}.`);
      saveLab(lab);
      render();
      scheduleAutoStep();
      return;
    }

    if (lab.round.state === "done") {
      lab.auto.handsPlayed += 1;
      recordAutoHand(lab.round);
      setAutoVisual("result", lab.round.summary.result, `Hand ${lab.auto.handsPlayed}: ${lab.round.summary.result} for ${chips(lab.round.summary.net)}.`, lab.round.summary.result.toLowerCase());
      lab.auto.log.unshift(`Hand ${lab.auto.handsPlayed}: ${lab.round.summary.result} net ${chips(lab.round.summary.net)}.`);
      discardRound(lab);
      saveLab(lab);
      render();
      scheduleAutoStep();
      return;
    }

    if (lab.round.state === "dealer") {
      setAutoVisual("dealer", "settle", "Player actions are complete. Dealer is resolving the hand.", "dealer");
      await dealerTurn(lab);
      saveLab(lab);
      render();
      scheduleAutoStep();
      return;
    }

    const hand = activeHand(lab);
    if (!hand) {
      await dealerTurn(lab);
      saveLab(lab);
      render();
      scheduleAutoStep();
      return;
    }
    const beforeCoach = buildCoachState(lab.round, hand, chooseAutoAction(hand, true));
    const action = beforeCoach.action;
    setAutoVisual("decision", action, autoDecisionMessage(action, beforeCoach.visibleState), "decision");
    drainThirst(hand.bet, action);
    await performAction(action);
    const after = currentOutcomeState();
    const row = makeDecisionRow({ before: beforeCoach.visibleState, after, action });
    row.model = `auto:${lab.auto.mode}`;
    lab.decisionRows.unshift(row);
    lab.decisionRows = lab.decisionRows.slice(0, 500);
    lab.auto.log.unshift(`Decision: ${action.toUpperCase()} on ${beforeCoach.visibleState.playerTotal} vs ${beforeCoach.visibleState.dealerUpCard}.`);
    saveLab(lab);
    render();
    scheduleAutoStep();
  } catch (error) {
    stopAuto(`Auto error: ${error.message}`);
  }
}

function chooseAutoAction(hand, logAdaptive = false) {
  const basic = basicStrategy(hand.cards, lab.round.dealer[0], lab.rules);
  const legal = ["hit", "stand", "double", "split", "surrender"].filter((candidate) => canAct(lab, candidate));
  const override = autoRuleOverride(hand, legal);
  if (override) {
    if (logAdaptive) lab.auto.log.unshift(`Rule override chose ${override.toUpperCase()}.`);
    return override;
  }
  const pro = professionalAction(hand);
  if (lab.auto.mode === "adaptive") {
    const adaptive = adaptiveAction(hand, legal, pro, logAdaptive);
    if (adaptive) return adaptive;
  }
  if (lab.auto.mode === "low") return lowRiskAction(hand, legal, basic);
  if (lab.auto.mode === "advantage") return legal.includes(pro) ? pro : legalFallback(pro, legal);
  if (lab.auto.mode === "high") return highRiskAction(hand, legal, pro);
  if (lab.auto.mode === "pro") return legal.includes(pro) ? pro : legalFallback(pro, legal);
  return legal.includes(basic) ? basic : legal[0] || "stand";
}

function professionalAction(hand) {
  return professionalStrategy(hand.cards, lab.round.dealer[0], {
    ...lab.rules,
    allowSurrender: lab.rules.allowSurrender,
    surrender16: lab.auto.strategyRules.surrender16,
    surrender15v10: lab.auto.strategyRules.surrender15v10,
    trueCount: lab.trueCount,
    aggressive: lab.auto.mode === "advantage" || lab.auto.mode === "high",
  });
}

function autoRuleOverride(hand, legal) {
  const dealer = dealerValue(lab.round.dealer[0]);
  if (canSplit(hand.cards)) {
    const pair = splitValue(hand.cards[0]);
    const key = `pair${pair}`;
    const rule = lab.auto.strategyRules[key];
    if (rule && rule !== "chart") {
      const wantsSplit = pairRuleAllows(rule, dealer);
      if (wantsSplit && legal.includes("split")) return "split";
      if (!wantsSplit && legal.includes("hit") && ["2", "3", "4", "6", "7"].includes(String(pair))) return "hit";
      if (!wantsSplit && legal.includes("stand") && ["8", "9", "10", "A"].includes(String(pair))) return "stand";
    }
  }
  const total = handValue(hand.cards);
  if (!isSoft(hand.cards) && legal.includes("surrender")) {
    if (lab.auto.strategyRules.surrender16 && total === 16 && dealer >= 9) return "surrender";
    if (lab.auto.strategyRules.surrender15v10 && total === 15 && dealer === 10) return "surrender";
  }
  return "";
}

function pairRuleAllows(rule, dealer) {
  if (rule === "always") return true;
  if (rule === "never") return false;
  if (rule === "2-6") return dealer >= 2 && dealer <= 6;
  if (rule === "2-7") return dealer >= 2 && dealer <= 7;
  if (rule === "2-8") return dealer >= 2 && dealer <= 8;
  if (rule === "2-9") return dealer >= 2 && dealer <= 9;
  if (rule === "5-6") return dealer >= 5 && dealer <= 6;
  if (rule === "2-6,8-9") return (dealer >= 2 && dealer <= 6) || dealer === 8 || dealer === 9;
  return false;
}

function dealerValue(card) {
  return card.value === 11 ? 11 : card.value;
}

function legalFallback(preferred, legal) {
  if (legal.includes(preferred)) return preferred;
  if (preferred === "double" && legal.includes("hit")) return "hit";
  if (preferred === "surrender" && legal.includes("hit")) return "hit";
  if (preferred === "split" && legal.includes("hit")) return "hit";
  return legal.includes("stand") ? "stand" : legal[0] || "stand";
}

function autoBetForNextHand() {
  const base = clamp(Number(lab.auto.bet) || lab.rules.minBet, lab.rules.minBet, lab.rules.maxBet);
  const trueCount = Math.floor(Number(lab.trueCount || 0));
  const maxSpread = clamp(Math.round(Number(lab.auto.spreadUnits) || 1), 1, 30);
  const riskCap = Math.max(lab.rules.minBet, Math.floor(lab.bankroll * (Number(lab.auto.bankrollRiskPct || 2) / 100)));
  let units = 1;
  if (lab.auto.bettingMode === "smart") {
    units = trueCount < 3 ? 1 : Math.min(maxSpread, trueCount - 1);
  } else if (lab.auto.bettingMode === "count") {
    units = trueCount <= 1 ? 1 : Math.min(maxSpread, trueCount);
  } else if (lab.auto.bettingMode === "kelly") {
    units = trueCount <= 0 ? 1 : Math.min(maxSpread, 1 + trueCount * 1.5);
  }
  return Math.max(lab.rules.minBet, Math.min(lab.rules.maxBet, riskCap, Math.round(base * units)));
}

function setAutoVisual(phase, action, message, tone = "idle") {
  lab.auto.visual = {
    phase,
    action,
    message,
    tone,
    at: new Date().toISOString(),
  };
}

function autoDecisionMessage(action, state) {
  const base = `${action.toUpperCase()} on ${state.playerTotal}${state.playerIsSoft ? " soft" : ""} vs ${state.dealerUpCard}.`;
  if (action === "double") return `${base} Pressing value with one-card commitment.`;
  if (action === "split") return `${base} Splitting to create stronger hands.`;
  if (action === "surrender") return `${base} Cutting the loss before the dealer resolves.`;
  if (action === "stand") return `${base} Holding and making the dealer prove it.`;
  return `${base} Drawing because the current hand needs help.`;
}

function resultClass(result) {
  const text = String(result).toLowerCase();
  if (text.includes("blackjack") || text.includes("win")) return "hand-win";
  if (text.includes("lose") || text.includes("bust")) return "hand-lose";
  if (text.includes("push")) return "hand-push";
  return "";
}

function lowRiskAction(hand, legal, basic) {
  const total = handValue(hand.cards);
  const dealer = lab.round.dealer[0].value === 11 ? 11 : lab.round.dealer[0].value;
  if (legal.includes("surrender") && total === 16 && dealer >= 9) return "surrender";
  if (basic === "double") return legal.includes("hit") ? "hit" : "stand";
  if (basic === "split" && ![8, "A"].includes(hand.cards[0].rank === "A" ? "A" : hand.cards[0].value)) return total >= 12 ? "stand" : "hit";
  if (total >= 13 && dealer <= 6 && legal.includes("stand")) return "stand";
  return legal.includes(basic) ? basic : legal[0] || "stand";
}

function highRiskAction(hand, legal, basic) {
  const total = handValue(hand.cards);
  if (legal.includes("double") && total >= 9 && total <= 11) return "double";
  if (legal.includes("split") && canSplit(hand.cards) && ![10, 5].includes(hand.cards[0].value)) return "split";
  if (total <= 16 && legal.includes("hit")) return "hit";
  return legal.includes(basic) ? basic : legal[0] || "stand";
}

function adaptiveAction(hand, legal, fallback, logChoice = false) {
  const total = handValue(hand.cards);
  const soft = isSoft(hand.cards);
  const dealer = cardText(lab.round.dealer[0]);
  const candidates = legal.map((action) => {
    const matches = lab.decisionRows.filter((row) =>
      row.action === action &&
      Number(row.player_total_before) === total &&
      String(row.player_soft_before) === String(soft) &&
      row.dealer_up === dealer &&
      row.net !== ""
    );
    if (matches.length < 2) return null;
    const avg = matches.reduce((sum, row) => sum + Number(row.net || 0), 0) / matches.length;
    return { action, avg, samples: matches.length };
  }).filter(Boolean).sort((a, b) => b.avg - a.avg);
  if (candidates[0]) {
    if (logChoice) lab.auto.log.unshift(`Adaptive chose ${candidates[0].action} from ${candidates[0].samples} similar rows, avg ${chips(candidates[0].avg)}.`);
    return candidates[0].action;
  }
  if (logChoice && fallback !== basicStrategy(hand.cards, lab.round.dealer[0], lab.rules)) {
    lab.auto.log.unshift(`Adaptive used pro fallback ${fallback} at TC ${lab.trueCount.toFixed(2)}.`);
  }
  return legal.includes(fallback) ? fallback : legalFallback(fallback, legal);
}

function stopAuto(reason) {
  clearTimeout(autoTimer);
  const status = reason === "Simulation complete." ? "complete" : "stopped";
  finishAutoRun(status);
  lab.auto.running = false;
  setAutoVisual(status, status, reason, status === "complete" ? "win" : "dealer");
  lab.auto.log.unshift(reason);
  saveLab(lab);
  render();
}

function autoDecisionPanel() {
  if (!lab.round || lab.round.state !== "playing" || !activeHand(lab)) {
    return `<strong>Waiting</strong><span>Next wager would be ${chips(autoBetForNextHand())} with ${lab.auto.bettingMode} betting.</span>`;
  }
  const hand = activeHand(lab);
  const action = chooseAutoAction(hand);
  const state = buildCoachState(lab.round, hand, action);
  return `<strong>${action.toUpperCase()}</strong><span>${autoModeLabel(lab.auto.mode)} player on ${state.visibleState.playerTotal} vs ${state.visibleState.dealerUpCard}</span>`;
}

function autoModeLabel(mode) {
  return {
    advantage: "Advantage pro",
    pro: "Pro EV",
    basic: "Basic strategy",
    low: "Low risk",
    high: "High risk",
    adaptive: "Adaptive pro",
  }[mode] || mode;
}

function createAutoRun() {
  return {
    id: `auto_${Date.now()}`,
    schemaVersion: 4,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    status: "running",
    mode: lab.auto.mode,
    modeLabel: autoModeLabel(lab.auto.mode),
    bettingMode: lab.auto.bettingMode,
    spreadUnits: lab.auto.spreadUnits,
    handsTarget: lab.auto.handsTarget,
    bet: Number(lab.auto.bet),
    bankrollStart: lab.bankroll,
    bankrollEnd: lab.bankroll,
    hands: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    busts: 0,
    surrenders: 0,
    doubles: 0,
    splits: 0,
    decisions: 0,
    totalBet: 0,
    minBet: 0,
    maxBet: 0,
    paid: 0,
    net: 0,
    largestWin: 0,
    largestLoss: 0,
    handSummaries: [],
  };
}

function recordAutoHand(round) {
  const run = lab.auto.currentRun;
  if (!run || !round?.summary) return;
  const summary = round.summary;
  const net = Number(summary.net || 0);
  const hands = round.hands || [];
  run.hands += 1;
  run.bankrollEnd = lab.bankroll;
  run.totalBet += Number(summary.totalBet || 0);
  run.minBet = run.minBet ? Math.min(run.minBet, Number(summary.totalBet || 0)) : Number(summary.totalBet || 0);
  run.maxBet = Math.max(run.maxBet || 0, Number(summary.totalBet || 0));
  run.paid += Number(summary.paid || 0);
  run.net += net;
  run.wins += summary.result === "WIN" ? 1 : 0;
  run.losses += summary.result === "LOSE" ? 1 : 0;
  run.pushes += summary.result === "PUSH" ? 1 : 0;
  run.blackjacks += hands.filter((hand) => String(hand.result).startsWith("BLACKJACK")).length;
  run.busts += hands.filter((hand) => hand.status === "bust" || hand.result === "BUST").length;
  run.surrenders += hands.filter((hand) => hand.status === "surrender" || hand.result === "SURRENDER").length;
  run.doubles += hands.filter((hand) => hand.doubled).length;
  run.splits += Math.max(0, hands.length - 1);
  run.decisions += hands.reduce((sum, hand) => sum + Math.max(1, hand.cards.length - 1), 0);
  run.largestWin = Math.max(run.largestWin, net);
  run.largestLoss = Math.min(run.largestLoss, net);
  run.handSummaries.unshift({
    at: summary.finishedAt || round.finishedAt || new Date().toISOString(),
    result: summary.result,
    net,
    dealer: summary.dealer,
    player: summary.player,
    trueCount: summary.trueCount,
  });
  run.handSummaries = run.handSummaries.slice(0, 40);
}

function finishAutoRun(status) {
  const run = lab.auto.currentRun;
  if (!run) return;
  run.status = status;
  run.finishedAt = new Date().toISOString();
  run.bankrollEnd = lab.bankroll;
  if (run.hands > 0) {
    lab.autoRuns.unshift(JSON.parse(JSON.stringify(run)));
    lab.autoRuns = lab.autoRuns.slice(0, 100);
  }
  lab.auto.currentRun = null;
}

function autoRunBreakdown(run = lab.auto.currentRun || validAutoRuns()[0]) {
  if (!run) return `<div class="run-card"><p class="fine">No auto run data yet. Start a simulation to build the player view.</p></div>`;
  const roi = run.totalBet ? ((run.net / run.totalBet) * 100).toFixed(1) : "0.0";
  const winRate = run.hands ? Math.round((run.wins / run.hands) * 100) : 0;
  const bustRate = run.hands ? Math.round((run.busts / run.hands) * 100) : 0;
  const title = run.status === "running" ? "Current run" : `Latest run: ${run.status}`;
  return `
    <div class="run-card">
      <div class="run-title"><strong>${title}</strong><span>${escapeHtml(run.modeLabel || autoModeLabel(run.mode))}</span></div>
      <div class="mini-metrics">
        ${miniMetric("Hands", `${run.hands}/${run.handsTarget}`)}
        ${miniMetric("Net", chips(run.net))}
        ${miniMetric("ROI", `${roi}%`)}
        ${miniMetric("Win rate", `${winRate}%`)}
        ${miniMetric("Busts", `${bustRate}%`)}
        ${miniMetric("Avg bet", chips(run.hands ? run.totalBet / run.hands : 0))}
        ${miniMetric("Bet range", `${chips(run.minBet || run.bet)} - ${chips(run.maxBet || run.bet)}`)}
        ${miniMetric("Bankroll", `${chips(run.bankrollStart)} -> ${chips(run.bankrollEnd)}`)}
      </div>
      <p class="fine">From the player side: ${run.wins} wins, ${run.losses} losses, ${run.pushes} pushes, ${run.blackjacks} blackjacks, ${run.doubles} doubles, ${run.splits} splits, ${run.surrenders} surrenders. Betting: ${escapeHtml(run.bettingMode || "flat")} up to ${run.spreadUnits || 1} units.</p>
    </div>
  `;
}

function autoGradePanel() {
  const grade = autoSystemGrade();
  if (!grade.runs) return `<div class="grade-card"><strong>No grade yet</strong><span>Run at least one auto simulation to score the system over time.</span></div>`;
  return `
    <div class="grade-card grade-${grade.letter.toLowerCase().replace("+", "plus")}">
      <strong>${grade.letter}</strong>
      <span>${grade.score}/100 over ${grade.hands} hands</span>
      <p>${grade.summary}</p>
      <div class="mini-metrics">
        ${miniMetric("Runs", grade.runs)}
        ${miniMetric("Net", chips(grade.net))}
        ${miniMetric("ROI", `${grade.roi}%`)}
        ${miniMetric("Win rate", `${grade.winRate}%`)}
      </div>
    </div>
  `;
}

function autoSystemGrade() {
  const runs = validAutoRuns();
  const hands = runs.reduce((sum, run) => sum + Number(run.hands || 0), 0);
  if (!runs.length || !hands) return { runs: 0 };
  const net = runs.reduce((sum, run) => sum + Number(run.net || 0), 0);
  const totalBet = runs.reduce((sum, run) => sum + Number(run.totalBet || 0), 0);
  const wins = runs.reduce((sum, run) => sum + Number(run.wins || 0), 0);
  const busts = runs.reduce((sum, run) => sum + Number(run.busts || 0), 0);
  const roi = totalBet ? (net / totalBet) * 100 : 0;
  const winRate = (wins / hands) * 100;
  const bustRate = (busts / hands) * 100;
  const sampleBonus = Math.min(10, Math.log10(hands + 1) * 4);
  const score = clamp(Math.round(50 + roi * 6 + (winRate - 42) * 1.1 - Math.max(0, bustRate - 24) * 0.8 + sampleBonus), 0, 100);
  return {
    runs: runs.length,
    hands,
    net,
    roi: roi.toFixed(1),
    winRate: Math.round(winRate),
    score,
    letter: gradeLetter(score),
    summary: `Grades edge, win rate, bust control, and sample size. More hands make the grade more trustworthy.`,
  };
}

function validAutoRuns() {
  return (lab.autoRuns || []).filter((run) => run.schemaVersion === 4);
}

function gradeLetter(score) {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function miniMetric(label, value) {
  return `<span><small>${label}</small><strong>${value}</strong></span>`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderRules() {
  app.innerHTML = `
    <section class="topbar">
      <div><p class="eyebrow">Rule builder</p><h1>Customize the table</h1></div>
      <div class="top-stats">${metric("Decks", lab.rules.decks)}${metric("BJ payout", `${lab.rules.blackjackPayout}:1`)}${metric("Dealer", lab.rules.dealerHitsSoft17 ? "H17" : "S17")}</div>
    </section>
    <section class="settings-grid">
      ${numberField("decks", "Shoe decks", 1, 8, 1)}
      ${numberField("penetration", "Shuffle at penetration %", 25, 95, 5)}
      ${numberField("blackjackPayout", "Blackjack payout", 1, 2, 0.1)}
      ${numberField("regularPayout", "Regular win payout", 0.5, 2, 0.1)}
      ${numberField("minBet", "Min bet", 1, 1000, 1)}
      ${numberField("maxBet", "Max bet", 100, 50000, 100)}
      ${numberField("botBankrollMin", "Bot bankroll minimum", 100, 20000, 100)}
      ${numberField("botBankrollMax", "Bot bankroll maximum", 100, 20000, 100)}
      ${bankPolicyField("kindness", "Banker kindness %", 0, 100, 5)}
      ${bankPolicyField("cooldownMinutes", "Loan cooldown minutes", 1, 120, 1)}
      ${bankPolicyField("minLoan", "Minimum loan", 1, 10000, 50)}
      ${bankPolicyField("maxLoan", "Maximum loan", 100, 100000, 100)}
      ${bankPolicyField("minInterest", "Minimum loan interest %", 0, 50, 1)}
      ${bankPolicyField("maxInterest", "Maximum loan interest %", 1, 100, 1)}
      ${bankPolicyField("minDueMinutes", "Minimum due minutes", 1, 120, 1)}
      ${bankPolicyField("maxDueMinutes", "Maximum due minutes", 5, 240, 5)}
      ${bankPolicyField("grantMax", "Maximum rare grant", 0, 5000, 50)}
      ${bankPolicyField("autoUnlockBankroll", "Auto Lab unlock bankroll", 0, 100000, 500)}
      ${bankPolicyField("atmApr", "ATM interest APR %", 0, 50, 0.5)}
      ${checkboxField("dealerHitsSoft17", "Dealer hits soft 17")}
      ${checkboxField("doubleAfterSplit", "Double after split")}
      ${checkboxField("allowSurrender", "Allow surrender")}
      ${checkboxField("allowResplitAces", "Allow resplit aces")}
      ${numberField("maxSplitHands", "Max split hands", 2, 8, 1)}
      ${checkboxField("dealerPeek", "Dealer peeks for blackjack")}
      ${checkboxField("botConversationsEnabled", "Slots bots can talk")}
      ${checkboxField("botConversationsUseOllama", "Use Ollama for bot conversations")}
      ${numberField("botConversationFrequencySeconds", "Bot conversation cooldown seconds", 4, 120, 1)}
      <label>Dealer mode
        <select data-rule="dealerMode">
          <option value="rules" ${lab.rules.dealerMode === "rules" ? "selected" : ""}>Rule-based dealer</option>
          <option value="ollama" ${lab.rules.dealerMode === "ollama" ? "selected" : ""}>Ollama assisted dealer</option>
        </select>
      </label>
      <label>Ollama URL <input data-rule="ollamaUrl" value="${lab.rules.ollamaUrl}"></label>
      <label>Ollama model
        <select data-rule="ollamaModel" id="ollamaModelSelect">
          ${ollamaModelOptions()}
        </select>
      </label>
      <label class="full-width">Coach prompt<textarea data-rule="coachPrompt" rows="10">${escapeHtml(lab.rules.coachPrompt || defaultCoachPrompt())}</textarea></label>
      <label class="full-width">Bank teller prompt<textarea data-rule="bankPrompt" rows="10">${escapeHtml(lab.rules.bankPrompt || defaultBankPrompt())}</textarea></label>
    </section>
    <div class="button-row">
      <button id="saveRules" class="primary">Save rules and reshuffle</button>
      <button id="refreshModels">Refresh Ollama models</button>
      <button id="testOllama">Test selected model</button>
    </div>
    <p id="ollamaStatus" class="fine">Installed generator models: ${lab.ollamaModels.length ? lab.ollamaModels.join(", ") : "not loaded yet"}</p>
  `;
  document.querySelector("#saveRules").addEventListener("click", () => {
    app.querySelectorAll("[data-rule], [data-bank-policy]").forEach((input) => {
      const key = input.dataset.rule;
      if (input.dataset.bankPolicy) lab.bank.policy[input.dataset.bankPolicy] = Number(input.value);
      else if (input.type === "checkbox") lab.rules[key] = input.checked;
      else if (input.type === "number") lab.rules[key] = Number(input.value);
      else lab.rules[key] = input.value;
    });
    normalizeBankPolicy();
    ensureShoe(lab, true);
    toast("Rules saved. Shoe reshuffled.", "good");
    render();
  });
  document.querySelector("#refreshModels").addEventListener("click", async () => {
    await discoverOllamaModels(true);
  });
  document.querySelector("#testOllama").addEventListener("click", async () => {
    const status = document.querySelector("#ollamaStatus");
    status.textContent = "Testing Ollama...";
    try {
      const text = await askOllama({
        url: lab.rules.ollamaUrl,
        model: document.querySelector("#ollamaModelSelect").value,
        prompt: "Blackjack hard 16 vs dealer 10. Say the best basic strategy move and why in one sentence.",
      });
      status.textContent = `Ollama OK (${document.querySelector("#ollamaModelSelect").value}): ${text}`;
    } catch (error) {
      status.textContent = `Ollama test failed: ${error.message}`;
    }
  });
}

function renderHistory() {
  const totals = stats();
  app.innerHTML = `
    <section class="topbar">
      <div><p class="eyebrow">Game tracking</p><h1>All hands played</h1></div>
      <div class="top-stats">${metric("Rounds", lab.history.length)}${metric("Wins", totals.wins)}${metric("Net", chips(totals.net))}${metric("Accuracy", `${totals.accuracy}%`)}</div>
    </section>
    <section class="history-list">
      ${lab.history.length ? lab.history.map(historyRow).join("") : `<p class="fine">No completed rounds yet.</p>`}
    </section>
    <section class="history-list">
      <div class="section-head">
        <div>
          <h2>Auto Run Gradebook</h2>
          <p class="fine">Player perspective summaries and long-term grading across all stored simulations.</p>
        </div>
        <button id="clearAutoRuns" ${lab.auto.running ? "disabled" : ""}>Clear auto grades</button>
      </div>
      ${autoGradePanel()}
      <div class="run-list">
        ${validAutoRuns().length ? validAutoRuns().map(autoRunRow).join("") : `<p class="fine">No saved auto runs yet.</p>`}
      </div>
    </section>
    <section class="history-list">
      <h2>Decision CSV</h2>
      <textarea class="csv-box" readonly>${decisionCsv()}</textarea>
    </section>
  `;
  document.querySelector("#clearAutoRuns")?.addEventListener("click", () => {
    if (!confirm("Clear stored auto run grades and summaries? Decision CSV rows will stay.")) return;
    lab.autoRuns = [];
    render();
  });
}

function renderStrategy() {
  app.innerHTML = `
    <section class="topbar">
      <div>
        <p class="eyebrow">Practice reference</p>
        <h1>Blackjack decisions</h1>
        <p class="runtime-badge">Learn when doubles, splits, and surrender are powerful, and when they are traps.</p>
      </div>
    </section>
    <section class="strategy-grid">
      <article><h2>Hard totals</h2><p>5-8 hit. 9 double vs 3-6. 10 double vs 2-9. 11 double vs 2-10. 12 stand vs 4-6. 13-16 stand vs 2-6. 17+ stand.</p></article>
      <article><h2>Soft totals</h2><p>A2-A3 double vs 5-6. A4-A5 double vs 4-6. A6 double vs 3-6. A7 stand vs 2,7,8; double vs 3-6; hit vs 9-A. A8-A9 stand.</p></article>
      <article><h2>Pairs</h2><p>Aces and 8s always split. 10s stand. 5s play like hard 10. 9s split vs 2-6,8,9.</p></article>
      <article><h2>Ollama setup</h2><p>Run Ollama locally, set the model in Rules, then use the coach button or Ollama dealer mode. If Ollama is unavailable the app falls back to deterministic rules.</p></article>
    </section>
    <section class="strategy-lessons">
      <article class="lesson-card">
        <div><span class="lesson-tag good">Good double</span><h2>Doubling Down</h2></div>
        <p>Doubling is strongest when your starting hand has high upside and the dealer is likely to make a weak total or bust. You are trading one more card for twice the wager, so the spot needs to be clearly favorable.</p>
        <div class="position-grid">
          <div><strong>Good positions</strong><ul><li>Hard 11 vs dealer 2-10</li><li>Hard 10 vs dealer 2-9</li><li>Hard 9 vs dealer 3-6</li><li>Soft 18 vs dealer 3-6</li><li>Soft 13-17 mostly vs dealer 4-6</li></ul></div>
          <div><strong>Bad positions</strong><ul><li>Hard 9 vs dealer 7-A</li><li>Hard 10 vs dealer 10/A unless using advanced count rules</li><li>Soft 18 vs dealer 9-A</li><li>Any stiff hand where one card can easily leave you trapped</li></ul></div>
        </div>
      </article>
      <article class="lesson-card">
        <div><span class="lesson-tag good">Good split</span><h2>Splitting Pairs</h2></div>
        <p>Splitting turns one paired hand into two independent hands. Use it when the pair is weak as a total but strong as two starting cards, or when each new hand has a better path against the dealer up card.</p>
        <div class="position-grid">
          <div><strong>Good positions</strong><ul><li>A,A: always split</li><li>8,8: usually always split to escape hard 16</li><li>2,2 and 3,3: split against weak dealer cards or your custom Auto rules</li><li>6,6 and 7,7: split against dealer weakness</li><li>9,9 vs 2-6, 8, 9</li></ul></div>
          <div><strong>Bad positions</strong><ul><li>10,10: almost always stand on 20</li><li>5,5: treat as hard 10, usually double instead</li><li>4,4 outside dealer 5-6</li><li>Small pairs against dealer 8-A unless you intentionally override the rule</li></ul></div>
        </div>
      </article>
      <article class="lesson-card">
        <div><span class="lesson-tag warn">Damage control</span><h2>Surrender</h2></div>
        <p>Surrender is not giving up emotionally; it is buying back half your bet when the hand is mathematically in bad shape. It is useful because losing half is better than losing the full wager in the worst positions.</p>
        <div class="position-grid">
          <div><strong>Good positions</strong><ul><li>Hard 16 vs dealer 9, 10, or Ace</li><li>Hard 15 vs dealer 10</li><li>Some count-aware spots where the shoe is rich in high cards</li></ul></div>
          <div><strong>Bad positions</strong><ul><li>Hands that can profitably hit or stand</li><li>Soft hands with flexibility</li><li>Strong totals like 17+</li><li>Pairs you should split instead, such as 8,8</li></ul></div>
        </div>
      </article>
      <article class="lesson-card">
        <div><span class="lesson-tag">Table position</span><h2>Dealer Up Card</h2></div>
        <p>Most good actions depend on the dealer card. Dealer 2-6 is the pressure zone where the dealer breaks more often, so standing, doubling, and splitting become stronger. Dealer 7-A is danger territory where you usually need to build a better hand.</p>
        <div class="position-grid">
          <div><strong>Dealer weak</strong><ul><li>2-6: let the dealer fail when your hand is stable</li><li>Double more often with 9-11 and soft draws</li><li>Split pairs that create playable hands</li></ul></div>
          <div><strong>Dealer strong</strong><ul><li>7-A: hit more weak totals</li><li>Be careful doubling marginal hands</li><li>Surrender the worst hard 15/16 spots when allowed</li></ul></div>
        </div>
      </article>
    </section>
    <section class="history-list">
      <h2>AI advice log</h2>
      ${lab.adviceLog.length ? lab.adviceLog.map((item) => `<div class="history-row"><strong>${item.recommendation}</strong><span>${item.text}</span><small>${new Date(item.at).toLocaleString()}</small></div>`).join("") : `<p class="fine">No Ollama advice requested yet.</p>`}
      <h2>Recent decision data shown to Ollama</h2>
      <textarea class="csv-box" readonly>${decisionCsv(20)}</textarea>
    </section>
  `;
}

function numberField(key, label, min, max, step) {
  return `<label>${label}<input data-rule="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${lab.rules[key]}"></label>`;
}

function bankPolicyField(key, label, min, max, step) {
  return `<label>${label}<input data-bank-policy="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${lab.bank.policy[key]}"></label>`;
}

function normalizeBankPolicy() {
  const policy = lab.bank.policy;
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

function checkboxField(key, label) {
  return `<label class="check"><input data-rule="${key}" type="checkbox" ${lab.rules[key] ? "checked" : ""}>${label}</label>`;
}

function pairRuleField(key, label) {
  const value = lab.auto.strategyRules[key] || "chart";
  const options = [
    ["chart", "Use strategy chart"],
    ["always", "Always split"],
    ["never", "Never split"],
    ["2-6", "Split vs 2-6"],
    ["2-7", "Split vs 2-7"],
    ["2-8", "Split vs 2-8"],
    ["2-9", "Split vs 2-9"],
    ["5-6", "Split vs 5-6"],
    ["2-6,8-9", "Split vs 2-6, 8-9"],
  ];
  return `
    <label>${label}
      <select data-auto-rule="${key}" ${lab.auto.running ? "disabled" : ""}>
        ${options.map(([rule, text]) => `<option value="${rule}" ${value === rule ? "selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
  `;
}

function historyRow(round) {
  return `<div class="history-row ${round.summary.result.toLowerCase()}"><strong>${round.summary.result}</strong><span>Bet ${chips(round.summary.totalBet)} | Net ${chips(round.summary.net)} | Dealer ${round.summary.dealer}</span><small>${round.summary.player}</small></div>`;
}

function autoRunRow(run) {
  const roi = run.totalBet ? ((run.net / run.totalBet) * 100).toFixed(1) : "0.0";
  const winRate = run.hands ? Math.round((run.wins / run.hands) * 100) : 0;
  return `
    <div class="run-row">
      <strong>${escapeHtml(run.modeLabel || autoModeLabel(run.mode))}</strong>
      <span>${run.hands} hands | ${run.status} | Net ${chips(run.net)} | ROI ${roi}% | Win ${winRate}%</span>
      <small>${new Date(run.startedAt).toLocaleString()} | ${run.blackjacks} BJ, ${run.busts} busts, ${run.doubles} doubles, ${run.splits} splits</small>
    </div>
  `;
}

function stats() {
  const wins = lab.history.filter((r) => r.summary.result === "WIN").length;
  const net = lab.history.reduce((sum, r) => sum + r.summary.net, 0);
  return { wins, net, accuracy: lab.history.length ? Math.round((wins / lab.history.length) * 100) : 0 };
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function buildCoachState(round, hand, action) {
  const handOdds = nextCardOdds(hand.cards);
  const dealerOdds = dealerPressure(round.dealer[0]);
  const shoe = shoeProbabilityData();
  const visibleState = {
    playerHand: hand.cards.map(cardText),
    playerTotal: handValue(hand.cards),
    playerIsSoft: isSoft(hand.cards),
    dealerUpCard: cardText(round.dealer[0]),
    activeHandIndex: round.currentHand + 1,
    numberOfHands: round.hands.length,
    bet: hand.bet,
    bankroll: lab.bankroll,
    runningCount: lab.runningCount,
    trueCount: Number(lab.trueCount.toFixed(2)),
    cardsRemainingInShoe: shoeCardCount(),
    cardsDealtThisShoe: lab.rules.decks * 52 - shoeCardCount(),
    handPercentages: {
      bustOnNextCard: `${handOdds.bust}%`,
      improveOnHit: `${handOdds.improve}%`,
      worsenOnHit: `${handOdds.worsen}%`,
      make21OnHit: `${handOdds.twentyOne}%`,
      note: isSoft(hand.cards) ? "Soft hands can often take one card without busting because the Ace may count as 1." : "Bust percentage is for the immediate next card only.",
    },
    dealerUpCardPercentages: {
      oneCardBust: `${dealerOdds.bust}%`,
      oneCard17To21: `${dealerOdds.made}%`,
    },
    shoeRankProbabilities: shoe,
    autoStrategyRules: lab.auto.strategyRules,
    surrenderAllowed: lab.rules.allowSurrender,
    doubleAfterSplit: lab.rules.doubleAfterSplit,
    dealerHitsSoft17: lab.rules.dealerHitsSoft17,
  };
  return {
    action,
    visibleState,
    legalActions: ["hit", "stand", "double", "split", "surrender"].filter((candidate) => canAct(lab, candidate)),
    recentCsv: decisionCsv(12),
  };
}

async function takeAdvice(coachState) {
  const before = JSON.parse(JSON.stringify(coachState.visibleState));
  const action = coachState.action;
  try {
    await performAction(action);
    const after = currentOutcomeState();
    const row = makeDecisionRow({ before, after, action });
    lab.decisionRows.unshift(row);
    lab.decisionRows = lab.decisionRows.slice(0, 500);
    saveLab(lab);
    await tellOllamaOutcome(before, after, action, row);
    render();
  } catch (error) {
    toast(`Could not take advice: ${error.message}`, "bad");
  }
}

async function performAction(action) {
  if (action === "hit") hit(lab);
  else if (action === "stand") stand(lab);
  else if (action === "double") doubleDown(lab);
  else if (action === "split") split(lab);
  else if (action === "surrender") surrender(lab);
  else throw new Error(`Unknown advice action: ${action}`);
  if (lab.round?.state === "dealer") await dealerTurn(lab);
}

function currentOutcomeState() {
  const round = lab.round;
  const hand = activeHand(lab) || round?.hands?.at(-1);
  return {
    roundState: round?.state || "none",
    playerHands: round?.hands?.map((h) => ({
      cards: h.cards.map(cardText),
      total: handValue(h.cards),
      soft: isSoft(h.cards),
      status: h.status,
      result: h.result,
      strength: handStrength(handValue(h.cards), isSoft(h.cards)),
    })) || [],
    activeHandTotal: hand ? handValue(hand.cards) : "",
    dealerCards: round?.dealer?.map(cardText) || [],
    dealerTotal: round && round.state !== "playing" ? handValue(round.dealer) : "",
    dealerSoft: round && round.state !== "playing" ? isSoft(round.dealer) : "",
    dealerStrength: round && round.state !== "playing" ? handStrength(handValue(round.dealer), isSoft(round.dealer)) : "",
    summary: round?.summary || null,
    bankroll: lab.bankroll,
    runningCount: lab.runningCount,
    trueCount: Number(lab.trueCount.toFixed(2)),
    cardsRemainingInShoe: shoeCardCount(),
  };
}

async function tellOllamaOutcome(before, after, action, row) {
  const outcomeEl = document.querySelector("#outcomeAnswer");
  if (outcomeEl) outcomeEl.textContent = "Showing Ollama the outcome...";
  try {
    const text = await askOllama({
      url: lab.rules.ollamaUrl,
      model: lab.rules.ollamaModel,
      prompt: outcomePrompt({ before, after, action, result: row, recentCsv: decisionCsv(20) }),
    });
    lab.adviceLog.unshift({
      at: new Date().toISOString(),
      recommendation: `outcome:${action}`,
      model: lab.rules.ollamaModel,
      state: before,
      text,
    });
    saveLab(lab);
    if (outcomeEl) outcomeEl.textContent = text;
  } catch (error) {
    if (outcomeEl) outcomeEl.textContent = `Outcome not sent to Ollama: ${error.message}`;
  }
}

function makeDecisionRow({ before, after, action }) {
  const summary = after.summary || {};
  const active = after.playerHands[before.activeHandIndex - 1] || after.playerHands[0] || {};
  return {
    timestamp: new Date().toISOString(),
    model: lab.rules.ollamaModel,
    action,
    player_cards_before: before.playerHand.join(" "),
    player_total_before: before.playerTotal,
    player_soft_before: before.playerIsSoft,
    player_strength_before: handStrength(before.playerTotal, before.playerIsSoft),
    dealer_up: before.dealerUpCard,
    dealer_total_after: after.dealerTotal,
    dealer_soft_after: after.dealerSoft,
    dealer_strength_after: after.dealerStrength,
    player_total_after: active.total ?? after.activeHandTotal,
    player_soft_after: active.soft ?? "",
    player_strength_after: active.strength ?? "",
    round_state_after: after.roundState,
    hand_result: active.result || active.status || "",
    round_result: summary.result || "",
    bet: before.bet,
    net: summary.net ?? "",
    running_count: after.runningCount,
    true_count: after.trueCount,
    cards_remaining: after.cardsRemainingInShoe,
  };
}

function decisionCsv(limit = lab.decisionRows.length) {
  const headers = [
    "timestamp",
    "model",
    "action",
    "player_cards_before",
    "player_total_before",
    "player_soft_before",
    "player_strength_before",
    "dealer_up",
    "dealer_total_after",
    "dealer_soft_after",
    "dealer_strength_after",
    "player_total_after",
    "player_soft_after",
    "player_strength_after",
    "round_state_after",
    "hand_result",
    "round_result",
    "bet",
    "net",
    "running_count",
    "true_count",
    "cards_remaining",
  ];
  const rows = lab.decisionRows.slice(0, limit);
  return [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n");
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function handStrength(total, soft) {
  if (total > 21) return "bust";
  if (total === 21) return soft ? "soft_21" : "made_21";
  if (soft) return total >= 18 ? "strong_soft" : "drawing_soft";
  if (total >= 17) return "pat_hard";
  if (total >= 13) return "stiff_hard";
  if (total >= 9) return "double_candidate";
  return "weak_hard";
}

function ollamaModelOptions() {
  const models = lab.ollamaModels.length ? lab.ollamaModels : [lab.rules.ollamaModel];
  if (!models.includes(lab.rules.ollamaModel)) models.unshift(lab.rules.ollamaModel);
  return models.map((model) => `<option value="${model}" ${model === lab.rules.ollamaModel ? "selected" : ""}>${model}</option>`).join("");
}

async function discoverOllamaModels(forceRender = false) {
  try {
    const models = await listOllamaModels(lab.rules.ollamaUrl);
    lab.ollamaModels = models;
    if (!models.includes(lab.rules.ollamaModel) && models.length) {
      lab.rules.ollamaModel = preferredModel(models);
    }
    saveLab(lab);
    if (forceRender || lab.activeView === "rules") render();
  } catch (error) {
    lab.ollamaModels = [];
    saveLab(lab);
    const status = document.querySelector("#ollamaStatus");
    if (status) status.textContent = `Could not load Ollama models: ${error.message}`;
  }
}

function preferredModel(models) {
  const preferred = ["gemma3:latest", "nova-sim:latest", "jessup-sim:latest", "lfm2.5-thinking:1.2b"];
  return preferred.find((model) => models.includes(model)) || models[0];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[ch]);
}

function chips(value) {
  const sign = Number(value) > 0 ? "" : Number(value) < 0 ? "-" : "";
  return `${sign}${Math.abs(Number(value)).toLocaleString()} pts`;
}

function toast(message, kind) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
