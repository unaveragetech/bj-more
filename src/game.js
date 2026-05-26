import { buildShoe, canSplit, cardText, handValue, hiLoValue, isBlackjack, isSoft } from "./cards.js?v=2";
import { askOllama, dealerPrompt } from "./ollama.js";

export function ensureShoe(lab, force = false) {
  const totalCards = lab.rules.decks * 52;
  const penetrationCards = Math.floor(totalCards * (1 - lab.rules.penetration / 100));
  if (force || lab.shoe.length <= penetrationCards) {
    lab.shoe = buildShoe(Number(lab.rules.decks));
    lab.discard = [];
    lab.runningCount = 0;
    lab.trueCount = 0;
    lab.round = null;
  }
}

export function draw(lab) {
  if (!lab.shoe.length) ensureShoe(lab, true);
  const card = lab.shoe.pop();
  lab.runningCount += hiLoValue(card);
  lab.trueCount = lab.shoe.length ? lab.runningCount / Math.max(1, lab.shoe.length / 52) : lab.runningCount;
  return card;
}

export function startRound(lab, bet, playerCount = 1) {
  ensureShoe(lab);
  const wager = Number(bet);
  const players = Math.max(1, Math.min(4, Number(playerCount || 1)));
  if (!Number.isFinite(wager) || wager < lab.rules.minBet || wager > lab.rules.maxBet) {
    throw new Error(`Bet must be between ${lab.rules.minBet} and ${lab.rules.maxBet}.`);
  }
  const totalWager = wager * players;
  if (lab.bankroll < totalWager) throw new Error("Not enough bankroll.");

  lab.bankroll -= totalWager;
  lab.tablePlayers = players;
  const dealer = [draw(lab), draw(lab)];
  const hands = Array.from({ length: players }, () => ({ cards: [draw(lab), draw(lab)], bet: wager, status: "playing", doubled: false, surrendered: false, result: "" }));

  lab.round = {
    id: `round_${Date.now()}`,
    startedAt: new Date().toISOString(),
    dealer,
    hands,
    currentHand: 0,
    state: "playing",
    messages: ["Round dealt."],
  };

  if (lab.rules.dealerPeek && isBlackjack(dealer)) {
    resolveRound(lab);
    return;
  }

  let nextPlaying = -1;
  for (let index = 0; index < hands.length; index += 1) {
    const hand = hands[index];
    if (isBlackjack(hand.cards)) {
      hand.status = "blackjack";
    } else if (nextPlaying < 0) {
      nextPlaying = index;
    }
  }

  if (nextPlaying >= 0) {
    lab.round.currentHand = nextPlaying;
  } else {
    lab.round.state = "dealer";
  }
}

export function activeHand(lab) {
  return lab.round?.hands[lab.round.currentHand];
}

export function canAct(lab, action) {
  const hand = activeHand(lab);
  if (!hand || hand.status !== "playing") return false;
  if (action === "hit" || action === "stand") return true;
  if (action === "double") {
    const canDoubleAfterSplit = lab.rules.doubleAfterSplit || lab.round.hands.length === 1;
    return hand.cards.length === 2 && lab.bankroll >= hand.bet && canDoubleAfterSplit;
  }
  if (action === "split") {
    if (lab.round.hands.length >= lab.rules.maxSplitHands) return false;
    if (!canSplit(hand.cards) || lab.bankroll < hand.bet) return false;
    const isAces = hand.cards[0].rank === "A";
    return !isAces || lab.rules.allowResplitAces || !lab.round.hands.some((h) => h.splitAces);
  }
  if (action === "surrender") return lab.rules.allowSurrender && hand.cards.length === 2 && lab.round.hands.length === 1;
  return false;
}

export function hit(lab) {
  const hand = activeHand(lab);
  hand.cards.push(draw(lab));
  if (handValue(hand.cards) > 21) {
    hand.status = "bust";
    hand.result = "BUST";
    nextHandOrDealer(lab);
  }
}

export function stand(lab) {
  activeHand(lab).status = "stand";
  nextHandOrDealer(lab);
}

export function doubleDown(lab) {
  const hand = activeHand(lab);
  lab.bankroll -= hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(draw(lab));
  hand.status = handValue(hand.cards) > 21 ? "bust" : "stand";
  hand.result = hand.status === "bust" ? "BUST" : "";
  nextHandOrDealer(lab);
}

export function split(lab) {
  const hand = activeHand(lab);
  lab.bankroll -= hand.bet;
  const moved = hand.cards.pop();
  const splitAces = moved.rank === "A";
  const newHand = { cards: [moved, draw(lab)], bet: hand.bet, status: "playing", doubled: false, surrendered: false, result: "", splitAces };
  hand.cards.push(draw(lab));
  hand.splitAces = splitAces;
  lab.round.hands.splice(lab.round.currentHand + 1, 0, newHand);
  if (splitAces) {
    hand.status = "stand";
    newHand.status = "stand";
    nextHandOrDealer(lab);
  }
}

export function surrender(lab) {
  const hand = activeHand(lab);
  hand.surrendered = true;
  hand.status = "surrender";
  hand.result = "SURRENDER";
  nextHandOrDealer(lab);
}

function nextHandOrDealer(lab) {
  const next = lab.round.hands.findIndex((h, idx) => idx > lab.round.currentHand && h.status === "playing");
  if (next >= 0) {
    lab.round.currentHand = next;
  } else {
    lab.round.state = "dealer";
  }
}

export async function dealerTurn(lab) {
  const round = lab.round;
  if (!round || round.state === "done") return;
  round.state = "dealer";
  const allDone = round.hands.every((h) => ["bust", "surrender", "blackjack"].includes(h.status));
  if (!allDone) {
    while (await dealerShouldHit(lab)) {
      round.dealer.push(draw(lab));
    }
  }
  resolveRound(lab);
}

async function dealerShouldHit(lab) {
  const value = handValue(lab.round.dealer);
  const soft = isSoft(lab.round.dealer);
  if (lab.rules.dealerMode === "ollama") {
    try {
      const visible = `dealer=${lab.round.dealer.map(cardText).join(",")} value=${value} soft=${soft}`;
      const answer = await askOllama({
        url: lab.rules.ollamaUrl,
        model: lab.rules.ollamaModel,
        prompt: dealerPrompt(lab.round, lab.rules, visible),
      });
      lab.round.messages.push(`Ollama dealer: ${answer}`);
      if (/^hit/i.test(answer)) return value < 21;
      if (/^stand/i.test(answer)) return false;
    } catch (error) {
      lab.round.messages.push(`Ollama unavailable; used rule dealer. ${error.message}`);
    }
  }
  if (value < 17) return true;
  return value === 17 && soft && lab.rules.dealerHitsSoft17;
}

export function resolveRound(lab) {
  const round = lab.round;
  const dealerValue = handValue(round.dealer);
  const dealerBj = isBlackjack(round.dealer);
  let totalBet = 0;
  let paid = 0;
  for (const [idx, hand] of round.hands.entries()) {
    const value = handValue(hand.cards);
    const bj = hand.status === "blackjack" || isBlackjack(hand.cards);
    totalBet += hand.bet;
    let handPaid = 0;
    if (hand.status === "surrender") {
      hand.result = "SURRENDER";
      handPaid = hand.bet / 2;
    } else if (hand.status === "bust" || value > 21) {
      hand.result = "LOSE";
    } else if (bj && !dealerBj) {
      handPaid = hand.bet + hand.bet * Number(lab.rules.blackjackPayout);
      hand.result = `BLACKJACK +${handPaid - hand.bet}`;
    } else if (dealerBj && !bj) {
      hand.result = "LOSE";
    } else if (dealerValue > 21 || value > dealerValue) {
      handPaid = hand.bet + hand.bet * Number(lab.rules.regularPayout);
      hand.result = `WIN +${handPaid - hand.bet}`;
    } else if (value === dealerValue) {
      handPaid = hand.bet;
      hand.result = "PUSH";
    } else {
      hand.result = "LOSE";
    }
    hand.net = handPaid - hand.bet;
    if (Array.isArray(lab.tablePlayersInfo)) {
      const player = lab.tablePlayersInfo[idx];
      if (player?.isBot) {
        player.bankroll = Math.max(0, Number(player.bankroll) + hand.net);
      }
    }
    paid += handPaid;
  }
  lab.bankroll += paid;
  if (Array.isArray(lab.tablePlayersInfo) && lab.tablePlayersInfo[0]) {
    lab.tablePlayersInfo[0].bankroll = lab.bankroll;
  }
  const net = paid - totalBet;
  round.state = "done";
  round.finishedAt = new Date().toISOString();
  round.summary = {
    result: net > 0 ? "WIN" : net < 0 ? "LOSE" : "PUSH",
    totalBet,
    paid,
    net,
    dealer: dealerValue,
    player: round.hands.map((h, i) => `H${i + 1}:${h.result}(${handValue(h.cards)})`).join("; "),
    remainingCards: lab.shoe.length,
    runningCount: lab.runningCount,
    trueCount: Number(lab.trueCount.toFixed(2)),
  };
  lab.history.unshift(JSON.parse(JSON.stringify(round)));
  lab.discard.push(...round.dealer, ...round.hands.flatMap((h) => h.cards));
}

export function discardRound(lab) {
  lab.round = null;
}
