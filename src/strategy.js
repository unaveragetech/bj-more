import { canSplit, handValue, isSoft, splitValue } from "./cards.js";

export function basicStrategy(playerCards, dealerUpCard, options = {}) {
  const dealer = dealerUpCard.value === 11 ? 11 : dealerUpCard.value;
  const total = handValue(playerCards);

  if (canSplit(playerCards)) {
    const pair = splitValue(playerCards[0]);
    if (pair === "A" || pair === 8) return "split";
    if ([2, 3, 7].includes(pair)) return dealer >= 2 && dealer <= 7 ? "split" : "hit";
    if (pair === 4) return dealer >= 5 && dealer <= 6 ? "split" : "hit";
    if (pair === 5) return dealer >= 2 && dealer <= 9 ? "double" : "hit";
    if (pair === 6) return dealer >= 2 && dealer <= 6 ? "split" : "hit";
    if (pair === 9) return [2, 3, 4, 5, 6, 8, 9].includes(dealer) ? "split" : "stand";
    if (pair === 10) return "stand";
  }

  if (isSoft(playerCards) && total <= 21) {
    if (total <= 17) {
      if (total <= 15) return dealer >= 4 && dealer <= 6 ? "double" : "hit";
      return dealer >= 3 && dealer <= 6 ? "double" : "hit";
    }
    if (total === 18) {
      if (dealer >= 3 && dealer <= 6) return "double";
      if ([2, 7, 8].includes(dealer)) return "stand";
      return "hit";
    }
    return "stand";
  }

  if (total <= 8) return "hit";
  if (total === 9) return dealer >= 3 && dealer <= 6 ? "double" : "hit";
  if (total === 10) return dealer >= 2 && dealer <= 9 ? "double" : "hit";
  if (total === 11) return dealer === 11 ? "hit" : "double";
  if (total === 12) return dealer >= 4 && dealer <= 6 ? "stand" : "hit";
  if (total >= 13 && total <= 16) {
    if (options.allowSurrender && total === 16 && [9, 10, 11].includes(dealer)) return "surrender";
    return dealer >= 2 && dealer <= 6 ? "stand" : "hit";
  }
  return "stand";
}

export function professionalStrategy(playerCards, dealerUpCard, options = {}) {
  const dealer = dealerUpCard.value === 11 ? 11 : dealerUpCard.value;
  const total = handValue(playerCards);
  const soft = isSoft(playerCards);
  const trueCount = Number(options.trueCount || 0);
  const aggressive = Boolean(options.aggressive);
  const canSurrender = Boolean(options.allowSurrender);
  const surrender16 = options.surrender16 !== false;
  const surrender15v10 = options.surrender15v10 !== false;

  if (canSplit(playerCards)) {
    const pair = splitValue(playerCards[0]);
    if (pair === "A" || pair === 8) return "split";
    if (pair === 10) return "stand";
    if (pair === 9) return [2, 3, 4, 5, 6, 8, 9].includes(dealer) ? "split" : "stand";
    if (pair === 7) return dealer <= 7 ? "split" : "hit";
    if (pair === 6) return dealer <= 6 ? "split" : "hit";
    if (pair === 5) return dealer <= 9 ? "double" : "hit";
    if (pair === 4) return dealer === 5 || dealer === 6 ? "split" : "hit";
    if (pair === 3 || pair === 2) return dealer <= 7 ? "split" : "hit";
  }

  if (soft && total <= 21) {
    if (total <= 15) return dealer >= 4 && dealer <= 6 ? "double" : "hit";
    if (total === 16) return dealer >= 3 && dealer <= 6 ? "double" : "hit";
    if (total === 17) return dealer >= 3 && dealer <= 6 ? "double" : "hit";
    if (total === 18) {
      if (dealer >= 3 && dealer <= 6) return "double";
      if ([2, 7, 8].includes(dealer)) return "stand";
      return "hit";
    }
    return "stand";
  }

  if (canSurrender) {
    if (surrender16 && total === 16 && [9, 10, 11].includes(dealer)) return "surrender";
    if (surrender15v10 && total === 15 && dealer === 10) return trueCount >= 4 ? "stand" : "surrender";
  }

  if (total <= 8) return "hit";
  if (total === 9) {
    if (dealer >= 3 && dealer <= 6) return "double";
    if (aggressive && dealer === 2 && trueCount >= 1) return "double";
    if (aggressive && dealer === 7 && trueCount >= 3) return "double";
    return "hit";
  }
  if (total === 10) {
    if (dealer <= 9) return "double";
    if (aggressive && dealer === 10 && trueCount >= 4) return "double";
    if (aggressive && dealer === 11 && trueCount >= 4) return "double";
    return "hit";
  }
  if (total === 11) {
    if (dealer === 11 && (!aggressive || trueCount < 1)) return "hit";
    return "double";
  }
  if (total === 12) {
    if (dealer === 2) return aggressive && trueCount >= 3 ? "stand" : "hit";
    if (dealer === 3) return aggressive && trueCount >= 2 ? "stand" : "hit";
    return dealer >= 4 && dealer <= 6 ? "stand" : "hit";
  }
  if (total === 13) {
    if (aggressive && dealer === 2 && trueCount < -1) return "hit";
    return dealer >= 2 && dealer <= 6 ? "stand" : "hit";
  }
  if (total === 14) return dealer >= 2 && dealer <= 6 ? "stand" : "hit";
  if (total === 15) {
    if (dealer === 10 && trueCount >= 4) return "stand";
    return dealer >= 2 && dealer <= 6 ? "stand" : "hit";
  }
  if (total === 16) {
    if (aggressive && dealer === 10 && trueCount >= 0) return "stand";
    if (aggressive && dealer === 9 && trueCount >= 5) return "stand";
    return dealer >= 2 && dealer <= 6 ? "stand" : "hit";
  }
  return "stand";
}

export function explainStrategy(action, playerCards, dealerUpCard) {
  return `Basic strategy suggests ${action.toUpperCase()} against dealer ${dealerUpCard.rank}.`;
}
