# Blackjack Lab Mini Client

Public mini client for Blackjack Lab. This repo is intentionally small: it is the browser game and GitHub Pages entry point only.

## Play

Open the Pages site for this repo, enter a player name, and launch the casino. The landing page reads a public `connection.json` manifest published by the host server, then opens:

```text
play.html?view=slots&mpServer=<current websocket>&mpName=<player>
```

## Features

- Third-person slots floor with generated casino areas.
- Multiplayer player presence in the slot lobby.
- Emotes and visual player avatars.
- Slot cabinets, blackjack table areas, keno, bankroll, bank, drinks, and local training tools.
- Public manifest loader so the server URL can change without republishing the mini client.

## Repo Structure

- `index.html` - GitHub Pages landing page and connection manifest loader.
- `play.html` - playable browser game client.
- `src/` - static JavaScript, CSS, and Three.js assets.
- `connection-settings.js` - optional public manifest URL setting.
- `connection.json` - offline/local fallback manifest for testing.
- `.github/workflows/pages.yml` - static GitHub Pages deployment workflow.

## Connection Setup

Set the connection manifest in one of three ways:

1. Edit `connection-settings.js`.
2. Open the page with `?manifest=https://.../connection.json`.
3. Paste and save the manifest URL on the landing page.

The connection manifest repo should contain only:

- `index.html`
- `connection.json`

## Security Boundary

This public repo must not contain:

- server code
- ngrok tokens
- host publish config
- local player data
- Node dependencies
- backend secrets
- the full development workspace

The host keeps those private and publishes only current connection details to the separate manifest repo.
