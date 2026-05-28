# Blackjack Lab Mini Client

Blackjack Lab is a browser casino playground with a multiplayer slots floor, blackjack tables, keno, player avatars, emotes, bankroll systems, and host surveillance. This repository is the public mini client: it contains only static browser files that players can open from GitHub Pages or download locally.

The private host server is not published here. The host runs the multiplayer server locally, opens an ngrok tunnel, and publishes a tiny connection manifest so players always know where to connect.

## Play From GitHub Pages

1. Open the GitHub Pages site: <https://unaveragetech.github.io/bj-more/>
2. Wait for the Connection panel to show `online` and a `wss://...ngrok-free.app` server.
3. Enter the player name other people should see.
4. Click **Enter Casino**.

The page launches `play.html` directly into the multiplayer slots floor with the current server URL already attached.

## How Connection Works

The host publishes a separate branch named `connection` containing only:

- `connection.json`
- `index.html`

The mini client reads:

```text
https://raw.githubusercontent.com/unaveragetech/bj-more/connection/connection.json
```

Expected manifest shape:

```json
{
  "app": "blackjack-lab",
  "status": "online",
  "httpUrl": "https://example.ngrok-free.app",
  "wsUrl": "wss://example.ngrok-free.app",
  "localWsUrl": "ws://localhost:9000",
  "port": 9000,
  "source": "ngrok-cli",
  "updatedAt": "2026-05-27T20:00:00.000Z"
}
```

Only `wsUrl` is required for players. If the host restarts, the manifest updates and the GitHub Pages launcher picks up the new tunnel on refresh.

## Downloaded Mini Client

Players who download the mini-client package can run:

```bat
blackjack-lab.bat mini
```

That command pulls the `connection` branch, reads `connection.json`, starts a local static mini-client server, and opens the game with multiplayer already configured.

## What Multiplayer Includes

- Shared slots floor presence with player names, avatars, emotes, and movement.
- Generated slot floor areas, cabinets, progressive labels, and table areas.
- Shared blackjack rooms from the Multiplayer tab.
- Host-side surveillance showing players, rooms, games, slot presence, inputs, and reported balances.

## GitHub Ollama / Jessup Bridge

GitHub Pages cannot safely call a private local Ollama server, so Blackjack Lab includes an issue-based AI bridge:

1. In the game, use **Ask Ollama why** or **Ask teller** as usual.
2. If local Ollama is unavailable, the app creates a prepared GitHub issue link containing the exact coach or banker prompt.
3. Submit the issue in this repo. The `Blackjack Lab Ollama Request` workflow installs Ollama, pulls the configured Jessup model, runs the prompt, and comments the response back on the issue.
4. Paste the issue number into **Rules -> GitHub AI issue #** and click **Check GitHub AI response** to read the latest workflow answer.

The workflow defaults to `Beelzebub4883/h-e-r-living-model:Beta`. Repo admins can set the GitHub Actions variable `BLACKJACK_LAB_OLLAMA_MODEL` to another Ollama model name if the public Jessup model changes. The browser never stores a GitHub token.

## Security Boundary

This public repo must contain only static player-facing files:

- `index.html`
- `play.html`
- `connection-settings.js`
- `connection.json` fallback
- `.nojekyll`
- `.github/workflows/pages.yml`
- `.github/workflows/blackjack-lab-ollama.yml`
- `scripts/blackjack_lab_ollama.py`
- `src/` browser assets
- this `README.md`

It must not contain server code, BAT host launchers, ngrok tokens, surveillance keys, host configs, local player data, logs, `node_modules`, or the private development workspace.

## Troubleshooting

- **Manifest unavailable**: the host server is probably offline, the connection branch has not updated yet, or GitHub raw content is temporarily stale. Click **Refresh**.
- **Server shows `ws://localhost:9000`**: the host has not published a public ngrok tunnel yet. Remote players need a `wss://...ngrok-free.app` URL.
- **Game opens but no other players appear**: confirm everyone is using the same current manifest and the same live host session.
- **Browser blocks connection**: GitHub Pages is HTTPS, so remote multiplayer must use `wss://`, not plain `ws://`.
