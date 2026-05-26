# Blackjack Lab Mini Client

This is the public mini client for Blackjack Lab. It is meant for players: open the page, confirm the server connection, choose a name, and enter the multiplayer casino.

The host/server code is not in this repo. The host runs the private multiplayer server and publishes a tiny public connection manifest so players can always find the current WebSocket URL.

## Quick Start For Players

1. Open the GitHub Pages site for this repo.
2. Check the **Connection** panel.
3. If the status says `online` and the server shows a `ws://` or `wss://` URL, enter your player name.
4. Click **Enter Casino**.
5. The game opens directly into the Slots floor with multiplayer enabled.

If the page says `Manifest unavailable`, paste the connection manifest URL from the host into **Connection manifest URL**, click **Save Manifest**, then click **Enter Casino**.

## What The Connection Manifest Is

The host publishes a separate minimal repo or page containing only:

- `connection.json`
- `index.html`

`connection.json` looks like this:

```json
{
  "status": "online",
  "wsUrl": "wss://example.ngrok-free.app",
  "updatedAt": "2026-05-26T18:00:00.000Z"
}
```

The mini client reads `wsUrl` and launches the game as:

```text
play.html?view=slots&mpServer=<current websocket>&mpName=<player>
```

## Where Multiplayer Matters

Multiplayer is most visible in the **Slots** floor:

- other connected players appear in the shared slot lobby
- player names and avatars are broadcast through the server
- emotes and position updates let players see each other moving around
- players can gather around slot machines and blackjack table areas

The **Multiplayer** tab also supports shared blackjack rooms controlled by the backend server.

## What You Can Play

- Slots floor walkaround
- Generated slot machines and casino areas
- Blackjack practice and multiplayer table flow
- Keno
- Bankroll, bank, drink, history, and strategy tools
- Player avatars and emotes

## Repo Structure

- `index.html` - GitHub Pages landing page and connection manifest loader.
- `play.html` - actual browser game client.
- `src/` - static JavaScript, CSS, and Three.js assets.
- `connection-settings.js` - optional public manifest URL setting.
- `connection.json` - offline/local fallback manifest for testing.
- `.github/workflows/pages.yml` - static GitHub Pages deployment workflow.

## Security Boundary

This repo intentionally contains only the public browser client. It must not include:

- server code
- ngrok tokens
- host publish config
- local player data
- Node dependencies
- backend secrets
- the full development workspace

The host keeps private infrastructure separate and publishes only current connection details to the manifest repo.
