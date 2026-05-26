export const SUITS = ["S", "H", "D", "C"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function buildShoe(decks) {
  const shoe = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) shoe.push(card(rank, suit));
    }
  }
  return shuffle(shoe);
}

export function shuffle(cards) {
  const copy = washShuffle([...cards]);
  const riffled = riffleShuffle(copy, 4 + secureRandomInt(4));
  const cut = secureRandomInt(riffled.length || 1);
  const ready = [...riffled.slice(cut), ...riffled.slice(0, cut)];
  return fisherYates(ready);
}

function fisherYates(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function washShuffle(cards) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const item of cards) buckets[secureRandomInt(buckets.length)].push(item);
  return buckets.flatMap((bucket) => fisherYates(bucket));
}

function riffleShuffle(cards, passes) {
  let current = [...cards];
  for (let pass = 0; pass < passes; pass += 1) {
    const middle = Math.floor(current.length / 2) + secureRandomInt(9) - 4;
    const left = current.slice(0, Math.max(0, Math.min(current.length, middle)));
    const right = current.slice(left.length);
    const mixed = [];
    while (left.length || right.length) {
      const takeLeft = !right.length || (left.length && secureRandomInt(left.length + right.length) < left.length);
      const source = takeLeft ? left : right;
      const packet = Math.min(source.length, 1 + secureRandomInt(3));
      mixed.push(...source.splice(0, packet));
    }
    current = mixed;
  }
  return current;
}

export function card(rank, suit) {
  const value = rank === "A" ? 11 : ["K", "Q", "J"].includes(rank) ? 10 : Number(rank);
  return { id: `${rank}${suit}_${secureId()}`, rank, suit, value };
}

function secureRandomInt(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  do {
    cryptoObject().getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

function secureId() {
  const bytes = new Uint8Array(8);
  cryptoObject().getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cryptoObject() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto;
  throw new Error("Secure random generator unavailable.");
}

export function handValue(cards) {
  let total = cards.reduce((sum, c) => sum + c.value, 0);
  let aces = cards.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isSoft(cards) {
  const total = cards.reduce((sum, c) => sum + c.value, 0);
  return cards.some((c) => c.rank === "A") && total <= 21;
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

export function canSplit(cards) {
  return cards.length === 2 && splitValue(cards[0]) === splitValue(cards[1]);
}

export function splitValue(cardObj) {
  return cardObj.value === 10 ? 10 : cardObj.rank;
}

export function hiLoValue(cardObj) {
  if (["2", "3", "4", "5", "6"].includes(cardObj.rank)) return 1;
  if (["10", "J", "Q", "K", "A"].includes(cardObj.rank)) return -1;
  return 0;
}

export function cardText(cardObj) {
  const symbols = { S: "♠", H: "♥", D: "♦", C: "♣" };
  return `${cardObj.rank}${symbols[cardObj.suit]}`;
}
