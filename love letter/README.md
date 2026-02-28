# Love Letter — Multiplayer

A real-time multiplayer Love Letter card game for 2–4 players.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```
You'll see:
```
🃏 Love Letter server running!
   Local:  http://localhost:3000
```

### 3. Share with friends via ngrok

In a **second terminal**:
```bash
# If you don't have ngrok yet:
# https://ngrok.com/download — it's free, takes 2 minutes to set up

ngrok http 3000
```

ngrok will give you a public URL like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Send that URL to your friends. You all open it in your browser and you're ready to play!

## How to Play

1. **Host** enters their name and clicks **Create Room** — gets a 4-letter code
2. **Friends** enter their name, click **Join Room**, enter the code
3. Host clicks **Start Game** when everyone is in (2–4 players)
4. Each turn: a card is automatically drawn, then click a card in your hand to play it
5. Win rounds to collect tokens — first to reach the token goal wins!

## Card Reference

| # | Card | Effect |
|---|------|--------|
| 1 | Guard (×5) | Guess a player's card — if correct, they're eliminated |
| 2 | Priest (×2) | Secretly look at another player's hand |
| 3 | Baron (×2) | Compare hands — lower card is eliminated |
| 4 | Handmaid (×2) | Protected from effects until your next turn |
| 5 | Prince (×2) | Force any player (including yourself) to discard and redraw |
| 6 | King (×1) | Trade hands with another player |
| 7 | Countess (×1) | Must play this if you also hold the King or Prince |
| 8 | Princess (×1) | Eliminated if you discard this card |

**Tokens to win:** 2 players = 7, 3 players = 5, 4 players = 4

## Requirements

- Node.js 16+
- npm
