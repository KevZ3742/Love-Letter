const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, 'public')));

// ── 2019 EDITION: 21 cards ──
const DECK_DEF = [
  { val: 0, count: 2 },  // Spy
  { val: 1, count: 6 },  // Guard
  { val: 2, count: 2 },  // Priest
  { val: 3, count: 2 },  // Baron
  { val: 4, count: 2 },  // Handmaid
  { val: 5, count: 2 },  // Prince
  { val: 6, count: 2 },  // Chancellor
  { val: 7, count: 1 },  // King
  { val: 8, count: 1 },  // Countess
  { val: 9, count: 1 },  // Princess
];

const TOKENS_TO_WIN = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 };

const rooms = {};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const deck = [];
  for (const { val, count } of DECK_DEF) deck.push(...Array(count).fill(val));
  return shuffle(deck);
}

function broadcast(room, msg) {
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
  });
}

function broadcastGameState(room) {
  const g = room.game;
  room.players.forEach((p, myIdx) => {
    if (p.ws.readyState !== WebSocket.OPEN) return;
    p.ws.send(JSON.stringify({
      type: 'game_state',
      round: room.round,
      currentPlayer: g.currentPlayer,
      deckCount: g.deck.length,
      log: g.log.slice(-40),
      tokensToWin: g.tokensToWin,
      myIndex: myIdx,
      phase: g.phase,
      lastDiscard: g.lastDiscard ?? null,
      players: g.players.map((gp, i) => ({
        name: gp.name,
        tokens: gp.tokens,
        eliminated: gp.eliminated,
        protected: gp.protected,
        discards: gp.discards,
        handCount: gp.hand.length,
        hand: i === myIdx ? gp.hand : gp.hand.map(() => null),
      })),
    }));
  });
}

function initRound(room) {
  const deck = createDeck();
  const aside = deck.pop();
  const prevTokens = room.game ? room.game.players.map(p => p.tokens) : room.players.map(() => 0);

  // First player is whoever won last round (stored on room), defaulting to 0
  const firstPlayer = room.lastRoundWinner ?? 0;

  const gamePlayers = room.players.map((p, i) => ({
    name: p.name,
    tokens: prevTokens[i] || 0,
    hand: [deck.pop()],
    discards: [],
    protected: false,
    eliminated: false,
    playedSpy: false,
  }));

  // First player draws an extra card (they go first)
  gamePlayers[firstPlayer].hand.push(deck.pop());

  room.game = {
    deck, aside,
    players: gamePlayers,
    currentPlayer: firstPlayer,
    log: [],
    tokensToWin: TOKENS_TO_WIN[room.players.length],
    phase: 'play',
    chancellorDraw: null,
  };

  broadcastGameState(room);
  notifyTurn(room);
}

function notifyTurn(room) {
  const g = room.game;
  const cur = g.currentPlayer;
  const p = room.players[cur];
  if (p?.ws.readyState === WebSocket.OPEN) {
    p.ws.send(JSON.stringify({ type: 'your_turn', hand: g.players[cur].hand }));
  }
}

function addLog(room, msg) { room.game.log.push(msg); }

function valName(v) {
  const names = {0:'Spy',1:'Guard',2:'Priest',3:'Baron',4:'Handmaid',5:'Prince',6:'Chancellor',7:'King',8:'Countess',9:'Princess'};
  return names[v] ?? `Card ${v}`;
}

function drawCard(g, pi) {
  if (g.deck.length > 0) { g.players[pi].hand.push(g.deck.pop()); return true; }
  if (g.aside !== null) { g.players[pi].hand.push(g.aside); g.aside = null; return true; }
  return false;
}

function executePlay(room, pi, cardVal, target, guess) {
  const g = room.game;
  const player = g.players[pi];
  const n = (i) => g.players[i].name;

  const cardIdx = player.hand.indexOf(cardVal);
  if (cardIdx === -1) {
    room.players[pi].ws?.send(JSON.stringify({ type: 'error', msg: 'Card not in hand' }));
    return;
  }
  player.hand.splice(cardIdx, 1);
  player.discards.push(cardVal);
  g.lastDiscard = cardVal;
  if (cardVal === 0) player.playedSpy = true;

  switch (cardVal) {
    case 9: // Princess
      addLog(room, `💔 ${player.name} discards the Princess and is eliminated!`);
      player.eliminated = true;
      player.discards.push(...player.hand); player.hand = [];
      break;

    case 8: // Countess
      addLog(room, `💎 ${player.name} plays the Countess.`);
      break;

    case 0: // Spy
      addLog(room, `🕵️ ${player.name} plays the Spy.`);
      break;

    case 4: // Handmaid
      player.protected = true;
      addLog(room, `🌸 ${player.name} plays the Handmaid — protected until next turn.`);
      break;

    case 1: // Guard
      if (target == null) {
        addLog(room, `⚔️ ${player.name} plays the Guard (no valid targets).`);
      } else {
        const t = g.players[target];
        if (t.hand[0] === guess) {
          addLog(room, `⚔️ ${player.name} guesses ${n(target)} holds ${valName(guess)} — correct! ${n(target)} eliminated.`);
          t.eliminated = true;
          if (t.hand[0] === 0) t.playedSpy = true; // spy forced out
          t.discards.push(...t.hand); t.hand = [];
        } else {
          addLog(room, `⚔️ ${player.name} guesses ${n(target)} holds ${valName(guess)} — wrong.`);
        }
      }
      break;

    case 2: // Priest
      if (target == null) {
        addLog(room, `📜 ${player.name} plays the Priest (no valid targets).`);
      } else {
        const t = g.players[target];
        addLog(room, `📜 ${player.name} looks at ${n(target)}'s hand.`);
        room.players[pi].ws?.send(JSON.stringify({
          type: 'peek', target: n(target), card: t.hand[0], cardName: valName(t.hand[0])
        }));
      }
      break;

    case 3: // Baron
      if (target == null) {
        addLog(room, `🗡️ ${player.name} plays the Baron (no valid targets).`);
      } else {
        const t = g.players[target];
        const pv = player.hand[0], tv = t.hand[0];

        // Tell both players privately what was compared
        const baronMsg = (myVal, theirName, theirVal) =>
          `🗡️ Baron comparison — you held ${myVal} (${valName(myVal)}), ${theirName} held ${theirVal} (${valName(theirVal)})`;
        room.players[pi].ws?.send(JSON.stringify({ type: 'baron_reveal', msg: baronMsg(pv, n(target), tv) }));
        room.players[target].ws?.send(JSON.stringify({ type: 'baron_reveal', msg: baronMsg(tv, player.name, pv) }));

        if (pv > tv) {
          addLog(room, `🗡️ ${player.name} compares with ${n(target)} — ${n(target)} is eliminated!`);
          t.eliminated = true;
          if (tv === 0) t.playedSpy = true; // spy forced out
          t.discards.push(...t.hand); t.hand = [];
        } else if (tv > pv) {
          addLog(room, `🗡️ ${player.name} compares with ${n(target)} — ${player.name} is eliminated!`);
          player.eliminated = true;
          if (pv === 0) player.playedSpy = true; // spy forced out
          player.discards.push(...player.hand); player.hand = [];
        } else {
          addLog(room, `🗡️ ${player.name} ties with ${n(target)} — no effect.`);
        }
      }
      break;

    case 5: // Prince
      if (target == null) {
        addLog(room, `👑 ${player.name} plays the Prince (no valid targets).`);
      } else {
        const t = g.players[target];
        const discarded = t.hand[0];
        t.discards.push(discarded); t.hand = [];
        if (discarded === 0) t.playedSpy = true; // spy forced out by Prince
        addLog(room, `👑 ${player.name} forces ${n(target)} to discard ${valName(discarded)}.`);
        if (discarded === 9) {
          addLog(room, `💔 ${n(target)} discards the Princess — eliminated!`);
          t.eliminated = true;
        } else {
          drawCard(g, target);
        }
      }
      break;

    case 6: { // Chancellor
      const drawn = [];
      if (g.deck.length > 0) drawn.push(g.deck.pop());
      if (g.deck.length > 0) drawn.push(g.deck.pop());

      if (drawn.length === 0) {
        addLog(room, `📋 ${player.name} plays the Chancellor (no cards to draw — no effect).`);
        break;
      }

      const allCards = [...player.hand, ...drawn];
      addLog(room, `📋 ${player.name} plays the Chancellor and examines ${allCards.length} cards.`);
      g.phase = 'chancellor';
      g.chancellorDraw = { pi, allCards };
      broadcastGameState(room);
      room.players[pi].ws?.send(JSON.stringify({ type: 'chancellor_choice', cards: allCards }));
      return; // wait for chancellor_keep
    }

    case 7: // King
      if (target == null) {
        addLog(room, `♔ ${player.name} plays the King (no valid targets).`);
      } else {
        addLog(room, `♔ ${player.name} trades hands with ${n(target)}.`);
        [player.hand, g.players[target].hand] = [g.players[target].hand, player.hand];
      }
      break;
  }

  checkRoundEnd(room) || advanceTurn(room);
}

function handleChancellorKeep(room, pi, keepCard) {
  const g = room.game;
  if (g.phase !== 'chancellor' || !g.chancellorDraw || g.chancellorDraw.pi !== pi) return;

  const { allCards } = g.chancellorDraw;
  const keepIdx = allCards.indexOf(keepCard);
  if (keepIdx === -1) {
    room.players[pi].ws?.send(JSON.stringify({ type: 'error', msg: 'Invalid card selection' }));
    return;
  }

  const returnCards = shuffle(allCards.filter((_, i) => i !== keepIdx));
  g.deck.unshift(...returnCards);
  g.players[pi].hand = [keepCard];
  g.phase = 'play';
  g.chancellorDraw = null;

  addLog(room, `📋 ${g.players[pi].name} keeps a card and returns ${returnCards.length} to the deck.`);
  checkRoundEnd(room) || advanceTurn(room);
}

function checkRoundEnd(room) {
  const g = room.game;
  const alive = g.players.filter(p => !p.eliminated);
  if (alive.length === 1) { endRound(room, [alive[0]]); return true; }
  if (g.deck.length === 0 && g.aside === null && g.phase !== 'chancellor') {
    const maxVal = Math.max(...alive.map(p => p.hand[0] ?? 0));
    let winners = alive.filter(p => p.hand[0] === maxVal);
    if (winners.length > 1) {
      const maxDiscard = Math.max(...winners.map(p => p.discards.reduce((s, v) => s + v, 0)));
      winners = winners.filter(p => p.discards.reduce((s, v) => s + v, 0) === maxDiscard);
    }
    endRound(room, winners);
    return true;
  }
  return false;
}

function endRound(room, winners) {
  const g = room.game;

  // Award a token to every tied winner
  winners.forEach(w => w.tokens++);

  // Remember who goes first next round (first winner in turn order)
  room.lastRoundWinner = g.players.indexOf(winners[0]);

  // Spy bonus: if exactly one player played/discarded a Spy this round AND they survived
  const allSpyPlayers = g.players.filter(p => p.playedSpy);
  if (allSpyPlayers.length === 1 && !allSpyPlayers[0].eliminated) {
    allSpyPlayers[0].tokens++;
    addLog(room, `🕵️ ${allSpyPlayers[0].name} was the only Spy played — gains a bonus token!`);
  }

  const isTie = winners.length > 1;
  const winnerNames = winners.map(w => w.name).join(' & ');
  addLog(room, isTie
    ? `✨ ${winnerNames} tie — both win the round and each gain a token!`
    : `✨ ${winnerNames} wins the round! (${winners[0].tokens} token${winners[0].tokens !== 1 ? 's' : ''})`
  );

  // Check for game winner (could be multiple if tokens pushed them over simultaneously)
  const gameWinners = g.players.filter(p => p.tokens >= g.tokensToWin);
  const gameOver = gameWinners.length > 0;
  const primaryWinner = gameWinners[0] ?? winners[0];

  broadcast(room, {
    type: gameOver ? 'game_over' : 'round_over',
    winner: gameOver && gameWinners.length > 1
      ? gameWinners.map(w => w.name).join(' & ')
      : primaryWinner.name,
    isTie,
    roundWinners: winners.map(w => w.name),
    scores: g.players.map(p => ({ name: p.name, tokens: p.tokens })),
    log: g.log.slice(-40),
    tokensToWin: g.tokensToWin,
  });
}

function advanceTurn(room) {
  const g = room.game;
  let next = (g.currentPlayer + 1) % g.players.length;
  let tries = 0;
  while (g.players[next].eliminated && tries < g.players.length) {
    next = (next + 1) % g.players.length; tries++;
  }
  g.players[next].protected = false;
  g.currentPlayer = next;
  if (!g.players[next].eliminated) drawCard(g, next);
  broadcastGameState(room);
  notifyTurn(room);
}

wss.on('connection', (ws) => {
  let myRoom = null, myCode = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create_room') {
      const code = Math.random().toString(36).slice(2,6).toUpperCase();
      rooms[code] = { players: [], game: null, round: 1 };
      myCode = code; myRoom = rooms[code];
      myRoom.players.push({ name: msg.name, ws });
      ws.send(JSON.stringify({ type: 'room_created', code, playerIndex: 0 }));
    }
    else if (msg.type === 'join_room') {
      const code = msg.code.toUpperCase();
      if (!rooms[code]) { ws.send(JSON.stringify({ type: 'error', msg: 'Room not found' })); return; }
      const room = rooms[code];
      if (room.players.length >= 6) { ws.send(JSON.stringify({ type: 'error', msg: 'Room is full (max 6)' })); return; }
      if (room.game) { ws.send(JSON.stringify({ type: 'error', msg: 'Game already in progress' })); return; }
      myCode = code; myRoom = room;
      const idx = room.players.length;
      room.players.push({ name: msg.name, ws });
      ws.send(JSON.stringify({ type: 'room_joined', code, playerIndex: idx }));
      broadcast(room, { type: 'lobby', players: room.players.map(p => p.name), code });
    }
    else if (msg.type === 'start_game') {
      if (!myRoom || myRoom.players.length < 2) { ws.send(JSON.stringify({ type: 'error', msg: 'Need at least 2 players' })); return; }
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      if (pi !== 0) { ws.send(JSON.stringify({ type: 'error', msg: 'Only the host can start' })); return; }
      myRoom.round = 1;
      broadcast(myRoom, { type: 'game_starting', players: myRoom.players.map(p => p.name) });
      initRound(myRoom);
    }
    else if (msg.type === 'play_card') {
      if (!myRoom?.game) return;
      const g = myRoom.game;
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      if (pi !== g.currentPlayer) { ws.send(JSON.stringify({ type: 'error', msg: 'Not your turn' })); return; }
      if (g.phase === 'chancellor') { ws.send(JSON.stringify({ type: 'error', msg: 'Resolve Chancellor first' })); return; }
      const hand = g.players[pi].hand;
      if (hand.includes(8) && hand.some(v => v === 5 || v === 7) && msg.card !== 8) {
        ws.send(JSON.stringify({ type: 'error', msg: 'You must play the Countess!' })); return;
      }
      executePlay(myRoom, pi, msg.card, msg.target ?? null, msg.guess ?? null);
    }
    else if (msg.type === 'chancellor_keep') {
      if (!myRoom?.game) return;
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      handleChancellorKeep(myRoom, pi, msg.card);
    }
    else if (msg.type === 'next_round') {
      if (!myRoom) return;
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      if (pi !== 0) return;
      myRoom.round++;
      broadcast(myRoom, { type: 'next_round' });
      initRound(myRoom);
    }
  });

  ws.on('close', () => {
    if (!myRoom) return;
    const idx = myRoom.players.findIndex(p => p.ws === ws);
    if (idx !== -1) {
      broadcast(myRoom, { type: 'player_left', name: myRoom.players[idx].name });
      myRoom.players.splice(idx, 1);
      if (myRoom.players.length === 0) delete rooms[myCode];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🃏 Love Letter (2019 Edition) running!\n   Local:  http://localhost:${PORT}\n   Share your ngrok URL with friends (2–6 players)\n`));
