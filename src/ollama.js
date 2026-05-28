export async function askOllama({ url, model, prompt }) {
  const response = await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2, top_p: 0.9 },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = await response.json();
  return stripThinking(data.response?.trim() || "");
}

export function githubAiIssueUrl({ repo = "unaveragetech/bj-more", kind = "coach", model = "jessup", prompt, metadata = {} }) {
  const cleanKind = String(kind || "coach").replace(/[^\w-]/g, "").slice(0, 32) || "coach";
  const requestId = `bjlab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    requestId,
    app: "blackjack-lab",
    kind: cleanKind,
    model: String(model || "jessup").slice(0, 80),
    prompt: String(prompt || "").slice(0, 18000),
    metadata,
  };
  const body = [
    "Blackjack Lab AI request. The workflow will run the configured Ollama/Jessup model and comment the answer here.",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "<!-- blackjack-lab-ai-request -->",
  ].join("\n");
  const params = new URLSearchParams({
    title: `[Blackjack Lab AI] ${cleanKind} ${requestId}`,
    labels: "blackjack-lab-ai",
    body,
  });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

export async function fetchGithubAiResponses({ repo = "unaveragetech/bj-more", issueNumber }) {
  const number = Number(issueNumber);
  if (!Number.isInteger(number) || number <= 0) throw new Error("Enter a valid GitHub issue number.");
  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${number}/comments`, {
    headers: { "Accept": "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub comments returned ${response.status}`);
  const comments = await response.json();
  return comments
    .filter((comment) => String(comment.body || "").includes("blackjack-lab-ai-response"))
    .map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "github-actions",
      createdAt: comment.created_at,
      body: String(comment.body || "").replace(/<!-- blackjack-lab-ai-response:[^>]+-->/g, "").trim(),
      url: comment.html_url,
    }));
}

export async function listOllamaModels(url) {
  const response = await fetch(`${url.replace(/\/$/, "")}/api/tags`);
  if (!response.ok) throw new Error(`Ollama tags returned ${response.status}`);
  const data = await response.json();
  return (data.models || [])
    .filter((model) => model.details?.family !== "bert")
    .map((model) => model.name || model.model)
    .filter(Boolean);
}

export function dealerPrompt(round, rules, visibleState) {
  return [
    "You are simulating a blackjack dealer for a training app.",
    "Return exactly one word: HIT or STAND.",
    `Rules: dealerHitsSoft17=${rules.dealerHitsSoft17}.`,
    `Visible state: ${visibleState}.`,
    "Do not explain.",
  ].join("\n");
}

export function defaultCoachPrompt() {
  return [
    "You are Blackjack Lab's training coach.",
    "The deterministic basic-strategy engine has already chosen the best move. Treat that move as authoritative.",
    "Use the provided hand percentages, dealer pressure percentages, running/true count, shoe rank probabilities, and visible game state when they are relevant.",
    "Explain why that move is best, compare it briefly against the other legal choices, and do not invent hidden cards.",
    "Return 2-4 concise sentences for a player practicing blackjack.",
    "If the user wants a simple, precise explanation, focus on the immediate hand and dealer upcard.",
  ].join("\n");
}

export function coachPrompt(round, rules, recommendation, promptTemplate) {
  const instructions = promptTemplate?.trim() ? promptTemplate.trim() : defaultCoachPrompt();
  return [
    instructions,
    `AUTHORITATIVE_BEST_MOVE: ${recommendation.action.toUpperCase()}`,
    `VISIBLE_GAME_STATE: ${JSON.stringify(recommendation.visibleState)}`,
    `LEGAL_ACTIONS: ${JSON.stringify(recommendation.legalActions)}`,
    `RULES: ${JSON.stringify(rules)}`,
    `RECENT_DECISION_CSV: ${recommendation.recentCsv || "timestamp,action,player_total,dealer_up,result,net"}`,
  ].join("\n");
}

export function outcomePrompt({ before, after, action, result, recentCsv }) {
  return [
    "You are Blackjack Lab's learning journal.",
    "The player clicked Take Advice, the recommended move was executed, and this is the outcome.",
    "Give one short lesson for future similar decisions. Do not claim the move was wrong if it matches basic strategy but lost due to variance.",
    `ACTION_TAKEN: ${action}`,
    `BEFORE_STATE: ${JSON.stringify(before)}`,
    `AFTER_STATE: ${JSON.stringify(after)}`,
    `RESULT: ${JSON.stringify(result)}`,
    `RECENT_DECISION_CSV: ${recentCsv}`,
  ].join("\n");
}

export function defaultBankPrompt() {
  return [
    "You are Jessup, the blackjack bank teller in a local training app.",
    "You are crass, blunt, and house-favoring. Do not be friendly unless the kindness setting is high.",
    "Decide whether to approve a bankroll increase/loan request. You may say no, stall, or offer less than requested.",
    "If you approve, respond with an offer. Do not finalize the loan automatically. The user will choose to accept or reject your proposal.",
    "If you decline the requested amount, still provide an alternative loan the user can accept or deny.",
    "The house should profit: prefer loans over grants, higher interest when risk is high, shorter due windows when the player is losing.",
    "Trust score influences your decision. Low trust should make approvals harder and terms more punitive.",
    "Return ONLY compact JSON with keys: approved(boolean), kind('loan'|'grant'|'deny'), amount(number), interestPercent(number), dueMinutes(number), message(string), reason(string), alternative(object).",
    "The alternative object should contain kind, amount, interestPercent, dueMinutes, message, and reason.",
    "Grants should be very rare and never exceed grantMax.",
  ].join("\n");
}

export function bankPrompt({ amount, purpose, bankroll, activeLoans, thirst, history, policy, clock, loanSummary, promptTemplate }) {
  const instructions = promptTemplate?.trim() ? promptTemplate.trim() : defaultBankPrompt();
  return [
    instructions,
    `Policy ranges: kindness=${policy.kindness}/100, minLoan=${policy.minLoan}, maxLoan=${policy.maxLoan}, minInterest=${policy.minInterest}, maxInterest=${policy.maxInterest}, minDueMinutes=${policy.minDueMinutes}, maxDueMinutes=${policy.maxDueMinutes}, grantMax=${policy.grantMax}, cooldownMinutes=${policy.cooldownMinutes}.`,
    `CASINO_CLOCK_24H: ${clock}`,
    `REQUEST_AMOUNT: ${amount}`,
    `PURPOSE: ${purpose}`,
    `BANKROLL: ${bankroll}`,
    `ACTIVE_LOANS: ${JSON.stringify(activeLoans)}`,
    `TOTAL_ACTIVE_DEBT: ${loanSummary.activeDebt}`,
    `ACTIVE_LOAN_COUNT: ${loanSummary.activeLoanCount}`,
    `PAID_LOAN_COUNT: ${loanSummary.paidLoanCount}`,
    `OVERDUE_LOAN_COUNT: ${loanSummary.overdueLoanCount}`,
    `DECLINED_OFFER_COUNT: ${loanSummary.declinedOfferCount}`,
    `TRUST_SCORE: ${loanSummary.trustScore}`,
    `THIRST: ${thirst}`,
    `RECENT_BANK_HISTORY: ${JSON.stringify(history.slice(0, 8))}`,
  ].join("\n");
}

function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
