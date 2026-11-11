"use strict";
// ===================================================================
//  LIONS-GAME – Multiplayer-Galgenmaennchen (Server)
//  - liefert die Webseite aus ./public aus
//  - steuert Lobby, Runden, Leben, Chat und Mauszeiger per WebSocket (/ws)
// ===================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const WORDS = require("./words");

// ── Einstellungen ───────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const CHOOSE_TIME_MS  = 45_000;   // Zeit fuer den Wortgeber
const GUESS_TIME_MS   = 180_000;  // max. Ratezeit pro Runde
const PENALTY_TIME_MS = 10_000;   // Zeit fuer die "Wem ziehe ich ein Leben ab?"-Entscheidung
const ROUND_END_MS    = 6_000;    // Ergebnisanzeige zwischen den Runden
const GAME_END_MS     = 20_000;   // Endstand, danach zurueck zur Lobby

const MAX_LIVES   = 7;
const MAX_WRONG   = 10;           // Galgenmaennchen komplett
const MIN_PLAYERS = 2;

const POINTS_LETTER       = 10;   // pro aufgedecktem Buchstaben
const POINTS_SOLVE        = 50;   // Wort geloest
const POINTS_MASTER_WRONG = 5;    // Wortgeber pro falschem Buchstaben
const POINTS_MASTER_WIN   = 50;   // Wortgeber gewinnt die Runde

const ALPHABET   = "abcdefghijklmnopqrstuvwxyzäöüß";
const WORD_REGEX = /^[a-zäöüß]{2,40}$/;
const COLORS = [
    "#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#38bdf8",
    "#818cf8", "#c084fc", "#f472b6", "#a3e635", "#fbbf24", "#22d3ee"
];

// ── Statischer Webserver ────────────────────────────────────────────
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "text/javascript; charset=utf-8",
    ".png":  "image/png",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon"
};

const server = http.createServer((req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
        res.writeHead(400); return res.end("Bad Request");
    }
    if (urlPath === "/") urlPath = "/index.html";

    const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403); return res.end("Forbidden");
    }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not Found"); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
        res.end(data);
    });
});

// ── Spielzustand ────────────────────────────────────────────────────
const players = new Map();   // id -> { id, name, color, ws, score, lives, lastChat, lastCursor }
const order   = [];          // Spieler-IDs in Beitrittsreihenfolge
let hostId = null;
let nextId = 1;

const game = {
    phase: "lobby",          // lobby | choosing | guessing | roundEnd | gameEnd
    round: 0,
    totalRounds: 0,
    masterQueue: [],         // wer noch Wortgeber wird
    masterId: null,
    word: "",
    guessed: new Set(),      // richtige Buchstaben
    wrong: [],               // falsche Buchstaben
    participants: new Set(), // Rater dieser Runde
    pending: null,           // { guesserId, letter } – wartet auf Entscheidung des Wortgebers
    phaseEndsAt: 0,
    timer: null,
    penaltyEndsAt: 0,
    penaltyTimer: null,
    result: null,
    recentWords: []
};

// ── Hilfsfunktionen ─────────────────────────────────────────────────
function send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastRaw(msg, exceptId = null) {
    const data = JSON.stringify(msg);
    for (const p of players.values()) {
        if (p.id !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
    }
}

function broadcastState() {
    for (const p of players.values()) send(p.ws, stateFor(p.id));
}

function systemChat(text, kind = "info") {
    broadcastRaw({ type: "chat", system: true, kind, text });
}

function sendError(id, message) {
    const p = players.get(id);
    if (p) send(p.ws, { type: "error", message });
}

function playerName(id) {
    return players.get(id)?.name ?? "?";
}

function cleanText(raw, maxLen) {
    return String(raw ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
}

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function isRunning() {
    return game.phase === "choosing" || game.phase === "guessing" || game.phase === "roundEnd";
}

function aliveGuessers() {
    return [...game.participants].filter(id => players.has(id) && players.get(id).lives > 0);
}

function isSolved() {
    return [...game.word].every(ch => game.guessed.has(ch));
}

function pickRandomWord() {
    let available = WORDS.filter(w => !game.recentWords.includes(w));
    if (available.length === 0) { game.recentWords = []; available = [...WORDS]; }
    const word = available[Math.floor(Math.random() * available.length)];
    game.recentWords.push(word);
    if (game.recentWords.length > 3) game.recentWords.shift();
    return word;
}

function setPhaseTimer(ms, fn) {
    clearPhaseTimer();
    game.phaseEndsAt = Date.now() + ms;
    game.timer = setTimeout(fn, ms);
}

function clearPhaseTimer() {
    clearTimeout(game.timer);
    game.timer = null;
    game.phaseEndsAt = 0;
}

function clearPending() {
    clearTimeout(game.penaltyTimer);
    game.penaltyTimer = null;
    game.penaltyEndsAt = 0;
    game.pending = null;
}

// Zustand fuer einen bestimmten Spieler (der Wortgeber sieht das Wort, die anderen nicht)
function stateFor(viewerId) {
    const now = Date.now();
    const showAll = viewerId === game.masterId || game.phase === "roundEnd";
    const showWord = game.phase === "guessing" || game.phase === "roundEnd";

    return {
        type: "state",
        you: viewerId,
        hostId,
        phase: game.phase,
        round: game.round,
        totalRounds: game.totalRounds,
        masterId: game.masterId,
        minPlayers: MIN_PLAYERS,
        maxLives: MAX_LIVES,
        maxWrong: MAX_WRONG,
        players: order.map(id => {
            const p = players.get(id);
            return {
                id: p.id, name: p.name, color: p.color, score: p.score,
                lives: p.lives, playing: game.participants.has(id)
            };
        }),
        word: showWord
            ? [...game.word].map(ch => {
                const revealed = game.guessed.has(ch);
                return { ch: revealed || showAll ? ch : null, revealed };
            })
            : [],
        guessed: [...game.guessed],
        wrong: [...game.wrong],
        pending: game.pending ? { ...game.pending } : null,
        timeLeftMs: game.phaseEndsAt ? Math.max(0, game.phaseEndsAt - now) : 0,
        penaltyLeftMs: game.penaltyEndsAt ? Math.max(0, game.penaltyEndsAt - now) : 0,
        result: game.result
    };
}

// ── Spielablauf ─────────────────────────────────────────────────────
function startGame(byId) {
    if (byId !== hostId) return sendError(byId, "Nur der Host kann das Spiel starten.");
    if (game.phase !== "lobby" && game.phase !== "gameEnd") return;
    if (players.size < MIN_PLAYERS) {
        return sendError(byId, `Es werden mindestens ${MIN_PLAYERS} Spieler benötigt.`);
    }

    for (const p of players.values()) { p.score = 0; p.lives = MAX_LIVES; }
    game.masterQueue = [...order];
    game.round = 0;
    game.totalRounds = order.length;
    game.result = null;

    systemChat(`🎮 Das Spiel startet! Jeder ist einmal Wortgeber (${game.totalRounds} Runden).`, "good");
    nextRound();
}

function nextRound() {
    clearPhaseTimer();
    clearPending();

    if (players.size < MIN_PLAYERS) return backToLobby("Zu wenige Spieler – zurück zur Lobby.");

    game.masterQueue = game.masterQueue.filter(id => players.has(id));
    if (game.masterQueue.length === 0) return endGame();

    game.masterId = game.masterQueue.shift();
    game.round++;
    game.word = "";
    game.guessed = new Set();
    game.wrong = [];
    game.result = null;
    game.participants = new Set(order.filter(id => id !== game.masterId));
    for (const p of players.values()) p.lives = MAX_LIVES;
    game.phase = "choosing";

    setPhaseTimer(CHOOSE_TIME_MS, () => {
        systemChat(`⏰ ${playerName(game.masterId)} war zu langsam – es wird ein zufälliges Wort genommen.`, "warn");
        startGuessing(pickRandomWord());
    });

    systemChat(`✏️ Runde ${game.round}/${game.totalRounds}: ${playerName(game.masterId)} denkt sich ein Wort aus…`);
    broadcastState();
}

function setWord(id, raw) {
    if (game.phase !== "choosing" || id !== game.masterId) return;
    const word = String(raw ?? "").trim().toLowerCase();
    if (!WORD_REGEX.test(word)) {
        return sendError(id, "Ungültiges Wort: nur Buchstaben a–z, ä, ö, ü, ß (2–40 Zeichen, keine Leerzeichen).");
    }
    startGuessing(word);
}

function startGuessing(word) {
    game.word = word;
    game.phase = "guessing";
    setPhaseTimer(GUESS_TIME_MS, () => endRound("master", "⏰ Die Ratezeit ist abgelaufen."));
    systemChat(`🔤 Das Wort steht fest (${word.length} Buchstaben). Ratet los!`, "good");
    broadcastState();
}

function guess(id, raw) {
    if (game.phase !== "guessing" || game.pending) return;
    const p = players.get(id);
    if (!p || !game.participants.has(id) || p.lives <= 0) return;

    const letter = String(raw ?? "").toLowerCase();
    if (letter.length !== 1 || !ALPHABET.includes(letter)) return;
    if (game.guessed.has(letter) || game.wrong.includes(letter)) return;

    // Richtiger Buchstabe
    if (game.word.includes(letter)) {
        game.guessed.add(letter);
        const count = [...game.word].filter(ch => ch === letter).length;
        p.score += POINTS_LETTER * count;
        if (isSolved()) {
            p.score += POINTS_SOLVE;
            return endRound("guessers", `🎉 ${p.name} hat den letzten Buchstaben gefunden!`, id);
        }
        return broadcastState();
    }

    // Falscher Buchstabe
    game.wrong.push(letter);
    const master = players.get(game.masterId);
    if (master) master.score += POINTS_MASTER_WRONG;
    systemChat(`❌ ${p.name} hat „${letter.toUpperCase()}" falsch geraten.`, "bad");

    if (game.wrong.length >= MAX_WRONG) {
        return endRound("master", "💀 Das Galgenmännchen ist komplett!");
    }

    // Der Wortgeber entscheidet, wer ein Leben verliert
    game.pending = { guesserId: id, letter };
    game.penaltyEndsAt = Date.now() + PENALTY_TIME_MS;
    game.penaltyTimer = setTimeout(() => {
        const alive = aliveGuessers();
        const target = alive.includes(id) ? id : alive[Math.floor(Math.random() * alive.length)];
        applyPenalty(target, true);
    }, PENALTY_TIME_MS);
    broadcastState();
}

function choosePenalty(byId, targetId) {
    if (game.phase !== "guessing" || !game.pending || byId !== game.masterId) return;
    if (!aliveGuessers().includes(targetId)) {
        return sendError(byId, "Dieser Spieler kann kein Leben mehr verlieren.");
    }
    applyPenalty(targetId, false);
}

function applyPenalty(targetId, auto) {
    clearPending();
    const t = players.get(targetId);
    if (t && t.lives > 0) {
        t.lives--;
        systemChat(auto
            ? `💔 Keine Entscheidung – ${t.name} verliert ein Leben (${t.lives} übrig).`
            : `💔 ${playerName(game.masterId)} zieht ${t.name} ein Leben ab (${t.lives} übrig).`, "bad");
        if (t.lives === 0) systemChat(`☠️ ${t.name} hat keine Leben mehr.`, "bad");
    }
    if (aliveGuessers().length === 0) {
        return endRound("master", "☠️ Kein Rater hat noch Leben übrig.");
    }
    broadcastState();
}

function endRound(winner, reason, solverId = null) {
    clearPhaseTimer();
    clearPending();

    if (winner === "master") {
        const m = players.get(game.masterId);
        if (m) m.score += POINTS_MASTER_WIN;
    }

    game.phase = "roundEnd";
    game.result = {
        winner,                    // guessers | master | none
        reason,
        word: game.word,
        solverId,
        masterId: game.masterId,
        last: game.masterQueue.filter(id => players.has(id)).length === 0
    };

    const wordText = game.word ? ` Das Wort war „${game.word.toUpperCase()}".` : "";
    systemChat(reason + wordText, winner === "guessers" ? "good" : "warn");

    setPhaseTimer(ROUND_END_MS, nextRound);
    broadcastState();
}

function endGame() {
    clearPhaseTimer();
    clearPending();

    game.phase = "gameEnd";
    game.masterId = null;
    game.word = "";
    game.participants = new Set();

    const ranking = order
        .map(id => players.get(id))
        .sort((a, b) => b.score - a.score)
        .map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score }));
    game.result = { ranking };

    systemChat(`🏆 Spiel vorbei! Gewinner: ${ranking[0]?.name ?? "-"} mit ${ranking[0]?.score ?? 0} Punkten.`, "good");
    setPhaseTimer(GAME_END_MS, () => backToLobby());
    broadcastState();
}

function backToLobby(message) {
    clearPhaseTimer();
    clearPending();
    Object.assign(game, {
        phase: "lobby", round: 0, totalRounds: 0, masterQueue: [], masterId: null,
        word: "", guessed: new Set(), wrong: [], participants: new Set(), result: null
    });
    for (const p of players.values()) p.lives = MAX_LIVES;
    if (message) systemChat(message, "warn");
    broadcastState();
}

// ── Spieler beitreten / verlassen ───────────────────────────────────
function join(ws, conn, rawName) {
    if (conn.id) return;
    const name = cleanText(rawName, 16);

    if (!name) return send(ws, { type: "error", message: "Bitte gib einen Namen ein." });
    if ([...players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) {
        return send(ws, { type: "error", message: "Dieser Name ist schon vergeben." });
    }

    const id = String(nextId++);
    const used = new Set([...players.values()].map(p => p.color));
    const color = COLORS.find(c => !used.has(c)) ?? COLORS[Math.floor(Math.random() * COLORS.length)];

    players.set(id, { id, name, color, ws, score: 0, lives: MAX_LIVES, lastChat: 0, lastCursor: 0 });
    order.push(id);
    conn.id = id;
    if (!hostId) hostId = id;

    // Spaeter Beigetretene schauen erst zu und werden spaeter auch Wortgeber
    if (isRunning()) {
        game.masterQueue.push(id);
        game.totalRounds++;
    }

    send(ws, { type: "welcome", id });
    systemChat(`👋 ${name} ist der Lobby beigetreten.`);
    broadcastState();
}

function leave(id) {
    const p = players.get(id);
    if (!p) return;

    players.delete(id);
    order.splice(order.indexOf(id), 1);
    game.participants.delete(id);

    const qi = game.masterQueue.indexOf(id);
    if (qi !== -1) { game.masterQueue.splice(qi, 1); game.totalRounds--; }

    broadcastRaw({ type: "cursorLeave", id });
    systemChat(`🚪 ${p.name} hat das Spiel verlassen.`);

    if (hostId === id) {
        hostId = order[0] ?? null;
        if (hostId) systemChat(`👑 ${playerName(hostId)} ist jetzt Host.`);
    }

    if (isRunning() && players.size < MIN_PLAYERS) {
        return backToLobby("Zu wenige Spieler – zurück zur Lobby.");
    }
    if ((game.phase === "choosing" || game.phase === "guessing") && id === game.masterId) {
        return endRound("none", "🚪 Der Wortgeber hat das Spiel verlassen.");
    }
    if (game.phase === "guessing" && game.pending?.guesserId === id) {
        // Wortgeber darf trotzdem noch jemand anderem ein Leben abziehen
        game.pending.guesserId = null;
    }
    if (game.phase === "guessing" && aliveGuessers().length === 0) {
        return endRound("master", "☠️ Kein Rater hat noch Leben übrig.");
    }
    broadcastState();
}

// ── Chat & Mauszeiger ───────────────────────────────────────────────
function chat(id, raw) {
    const p = players.get(id);
    if (!p) return;
    const text = cleanText(raw, 200);
    if (!text) return;

    const now = Date.now();
    if (now - p.lastChat < 300) return;   // Spam-Schutz
    p.lastChat = now;

    if (game.phase === "guessing" && game.word) {
        const normalized = text.toLowerCase();

        // Ganzes Wort im Chat erraten (wie bei Scribble)
        if (game.participants.has(id) && p.lives > 0 && normalized === game.word) {
            p.score += POINTS_SOLVE;
            for (const ch of game.word) game.guessed.add(ch);
            return endRound("guessers", `🎉 ${p.name} hat das Wort erraten!`, id);
        }

        // Wortgeber darf das Wort nicht verraten
        if (id === game.masterId && normalized.includes(game.word)) {
            return sendError(id, "Du darfst das Wort nicht verraten! 🤫");
        }
    }

    broadcastRaw({ type: "chat", fromId: id, name: p.name, color: p.color, text });
}

function cursor(id, msg) {
    const p = players.get(id);
    if (!p) return;

    if (msg.x === null || msg.y === null) {
        return broadcastRaw({ type: "cursor", id, x: null, y: null }, id);
    }
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;

    const now = Date.now();
    if (now - p.lastCursor < 30) return;
    p.lastCursor = now;

    broadcastRaw({ type: "cursor", id, x: clamp(msg.x, 0, 1), y: clamp(msg.y, 0, 1) }, id);
}

// ── WebSocket ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

function handleMessage(ws, conn, msg) {
    if (msg.type === "join") return join(ws, conn, msg.name);
    if (!conn.id) return;

    switch (msg.type) {
        case "start":       return startGame(conn.id);
        case "setWord":     return setWord(conn.id, msg.word);
        case "guess":       return guess(conn.id, msg.letter);
        case "penalty":     return choosePenalty(conn.id, String(msg.targetId));
        case "chat":        return chat(conn.id, msg.text);
        case "cursor":      return cursor(conn.id, msg);
        case "backToLobby":
            if (conn.id === hostId && game.phase === "gameEnd") backToLobby();
            return;
    }
}

wss.on("connection", (ws) => {
    const conn = { id: null };
    ws.isAlive = true;

    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("message", (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (msg && typeof msg === "object") handleMessage(ws, conn, msg);
    });
    ws.on("close", () => { if (conn.id) leave(conn.id); });
    ws.on("error", () => {});
});

// Tote Verbindungen aufraeumen
const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false;
        ws.ping();
    }
}, 30_000);

server.listen(PORT, () => {
    console.log(`Lions-Game läuft auf http://localhost:${PORT}`);
});

// Sauber beenden (z. B. bei "docker compose down")
function shutdown() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.close(1001, "Server wird beendet");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
