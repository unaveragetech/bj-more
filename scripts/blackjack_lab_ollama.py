import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request


API = "https://api.github.com"
TOKEN = os.environ["GITHUB_TOKEN"]
REPO = os.environ["GITHUB_REPOSITORY"]
ISSUE_NUMBER = os.environ["ISSUE_NUMBER"]
MODEL = os.environ.get("OLLAMA_MODEL", "Beelzebub4883/h-e-r-living-model:Beta")


def github_request(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"GitHub API {method} {path} failed: {error.code} {detail}") from error


def extract_payload(issue):
    body = issue.get("body") or ""
    match = re.search(r"```json\s*([\s\S]*?)\s*```", body, re.IGNORECASE)
    if not match:
      raise ValueError("No JSON request block found in the issue body.")
    payload = json.loads(match.group(1))
    if payload.get("app") != "blackjack-lab":
        raise ValueError("Issue JSON is not a Blackjack Lab request.")
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Request prompt is empty.")
    if len(prompt) > 18000:
        raise ValueError("Request prompt is too large.")
    return payload


def system_prompt(kind):
    if kind == "banker":
        return (
            "You are Jessup, Blackjack Lab's casino bank teller. Be blunt, house-favoring, and practical. "
            "When loan JSON is requested, return compact JSON only and keep terms inside the provided policy ranges."
        )
    if kind == "coach":
        return (
            "You are Blackjack Lab's blackjack coach. The deterministic best move in the prompt is authoritative. "
            "Explain the best play using only visible state, probabilities, count, and the legal actions provided."
        )
    return "You are Blackjack Lab's assistant. Answer only the casino training request in the prompt."


def run_ollama(payload):
    kind = str(payload.get("kind") or "assistant").lower()
    prompt = "\n".join([
        system_prompt(kind),
        "",
        "BLACKJACK_LAB_REQUEST:",
        payload["prompt"],
    ])
    result = subprocess.run(
        ["ollama", "run", MODEL, prompt],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=900,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Ollama returned a non-zero exit code.")
    output = re.sub(r"<think>[\s\S]*?</think>", "", result.stdout).strip()
    return output[:12000] or "Jessup returned an empty response."


def already_answered(request_id):
    comments = github_request("GET", f"/repos/{REPO}/issues/{ISSUE_NUMBER}/comments?per_page=100")
    marker = f"blackjack-lab-ai-response:{request_id}"
    return any(marker in (comment.get("body") or "") for comment in comments)


def main():
    issue = github_request("GET", f"/repos/{REPO}/issues/{ISSUE_NUMBER}")
    payload = extract_payload(issue)
    request_id = str(payload.get("requestId") or f"issue-{ISSUE_NUMBER}")
    if already_answered(request_id):
        print(f"Request {request_id} already has a response.")
        return
    response = run_ollama(payload)
    body = "\n".join([
        f"<!-- blackjack-lab-ai-response:{request_id} -->",
        f"### Blackjack Lab AI Response ({payload.get('kind', 'assistant')})",
        "",
        response,
        "",
        "---",
        f"Model: `{MODEL}`",
        f"Request: `{request_id}`",
    ])
    github_request("POST", f"/repos/{REPO}/issues/{ISSUE_NUMBER}/comments", {"body": body})
    print(f"Commented response for {request_id}.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise
