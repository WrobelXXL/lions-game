// ===================================================================
//  LIONS-GAME – Multiplayer-Galgenmaennchen (Client)
// ===================================================================

// ── DOM References ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const joinScreen     = $("join-screen");
const joinForm       = $("join-form");
const nameInput      = $("name-input");
const joinError      = $("join-error");
const app            = $("app");

const playerList     = $("player-list");
const playerCount    = $("player-count");
const startBtn       = $("start-btn");
const lobbyHint      = $("lobby-hint");

const roundInfo      = $("round-info");
const timerEl        = $("timer");
const timerValue     = $("timer-value");
const statusText     = $("status-text");
const wordForm       = $("word-form");
const wordInput      = $("word-input");
const penaltyPanel   = $("penalty-panel");
const penaltyText    = $("penalty-text");
const penaltyButtons = $("penalty-buttons");
const penaltyTimer   = $("penalty-timer");

const canvas         = $("hangman-canvas");
const ctx            = canvas.getContext("2d");
const wordDisplay    = $("word-display");
const wrongDisplay   = $("wrong-letters");
const wrongCount     = $("wrong-count");
const keyboard       = $("keyboard");

const chatMessages   = $("chat-messages");
const chatForm       = $("chat-form");
const chatInput      = $("chat-input");

const overlay        = $("overlay");
const overlayTitle   = $("overlay-title");
const overlayMsg     = $("overlay-message");
const overlayBtn     = $("overlay-btn");
const confettiCanvas = $("confetti-canvas");

const cursorLayer    = $("cursor-layer");
const toast          = $("toast");

const LETTERS = "abcdefghijklmnopqrstuvwxyzäöüß".split("");

// ── State ───────────────────────────────────────────────────────────
let ws           = null;
let myId         = null;
let state        = null;       // letzter Zustand vom Server
let stateTime    = 0;          // wann er empfangen wurde (fuer Countdown)
let confettiId   = null;
let lastOverlay  = "";         // verhindert, dass das Overlay staendig neu startet
let lastCursorSend = 0;
let toastTimeout = null;
const cursors    = new Map();  // id -> DOM-Element

// ── Initialise ──────────────────────────────────────────────────────
buildKeyboard();
drawHangman(0);
nameInput.value = localStorage.getItem("lions-name") || "";
nameInput.focus();

// ── WebSocket ───────────────────────────────────────────────────────
function connect(onOpen) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", (e) => handleMessage(JSON.parse(e.data)));
    ws.addEventListener("close", () => {
        const wasInGame = myId !== null;
        ws = null;
        myId = null;
        state = null;
        clearCursors();
        if (wasInGame) {
            app.classList.add("hidden");
            overlay.classList.add("hidden");
            joinScreen.classList.remove("hidden");
            joinError.textContent = "Verbindung zum Server verloren. Bitte erneut beitreten.";
        } else {
            joinError.textContent = "Server nicht erreichbar.";
        }
    });
}

function sendMsg(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handleMessage(msg) {
    switch (msg.type) {
        case "welcome":
            myId = msg.id;
            joinScreen.classList.add("hidden");
            app.classList.remove("hidden");
            chatMessages.innerHTML = "";
            break;
        case "state":
            state = msg;
            stateTime = Date.now();
            render();
            break;
        case "chat":
            addChat(msg);
            break;
        case "cursor":
            moveCursor(msg);
            break;
        case "cursorLeave":
            removeCursor(msg.id);
            break;
        case "error":
            if (myId === null) joinError.textContent = msg.message;
            else showToast(msg.message);
            break;
    }
}

// ── Join ────────────────────────────────────────────────────────────
joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { joinError.textContent = "Bitte gib einen Namen ein."; return; }
    localStorage.setItem("lions-name", name);
    joinError.textContent = "";

    const join = () => sendMsg({ type: "join", name });
    if (ws && ws.readyState === WebSocket.OPEN) join();
    else connect(join);
});

// ── Buttons & Forms ─────────────────────────────────────────────────
startBtn.addEventListener("click", () => sendMsg({ type: "start" }));

wordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const word = wordInput.value.trim().toLowerCase();
    if (!/^[a-zäöüß]{2,40}$/.test(word)) {
        showToast("Nur Buchstaben (a–z, ä, ö, ü, ß), 2–40 Zeichen, keine Leerzeichen.");
        return;
    }
    sendMsg({ type: "setWord", word });
    wordInput.value = "";
});

chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    sendMsg({ type: "chat", text });
    chatInput.value = "";
});

// Physische Tastatur (nur wenn kein Eingabefeld aktiv ist)
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const btn = keyboard.querySelector(`.key-btn[data-letter="${key}"]`);
    if (btn && !btn.disabled) btn.click();
});

// ── Mauszeiger senden ───────────────────────────────────────────────
document.addEventListener("mousemove", (e) => {
    if (myId === null) return;
    const now = Date.now();
    if (now - lastCursorSend < 50) return;
    lastCursorSend = now;
    sendMsg({ type: "cursor", x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
});

document.documentElement.addEventListener("mouseleave", () => {
    if (myId !== null) sendMsg({ type: "cursor", x: null, y: null });
});

// Countdown lokal weiterzaehlen
setInterval(updateTimers, 250);

// ── Rendering ───────────────────────────────────────────────────────
function me() {
    return state?.players.find(p => p.id === myId);
}

function nameOf(id) {
    return state?.players.find(p => p.id === id)?.name ?? "?";
}

function render() {
    if (!state) return;
    renderPlayers();
    renderLobbyActions();
    renderStatus();
    renderWordForm();
    renderPenalty();
    renderWord();
    renderWrong();
    renderKeyboard();
    drawHangman(state.wrong.length);
    renderOverlay();
    updateTimers();
}

function renderPlayers() {
    playerCount.textContent = state.players.length;
    playerList.innerHTML = "";
    const inGame = state.phase !== "lobby";

    state.players.forEach(p => {
        const li = document.createElement("li");
        li.className = "player";
        li.style.setProperty("--color", p.color);
        if (p.id === myId) li.classList.add("me");
        if (p.id === state.masterId) li.classList.add("master");
        if (inGame && p.playing && p.lives === 0) li.classList.add("dead");

        const top = document.createElement("div");
        top.className = "player-top";

        const name = document.createElement("span");
        name.className = "player-name";
        name.textContent = (p.id === state.hostId ? "👑 " : "") + p.name + (p.id === myId ? " (du)" : "");

        const score = document.createElement("span");
        score.className = "player-score";
        score.textContent = `${p.score} P`;

        top.append(name, score);
        li.appendChild(top);

        if (inGame && state.phase !== "gameEnd") {
            const sub = document.createElement("div");
            if (p.id === state.masterId) {
                sub.className = "player-tag";
                sub.textContent = "✏️ Wortgeber";
            } else if (p.playing) {
                sub.className = "player-lives";
                sub.textContent = "❤️".repeat(p.lives) + "🖤".repeat(state.maxLives - p.lives);
            } else {
                sub.className = "player-tag";
                sub.textContent = "👀 schaut zu (nächste Runde)";
            }
            li.appendChild(sub);
        }
        playerList.appendChild(li);
    });
}

function renderLobbyActions() {
    const isHost = state.hostId === myId;
    const canStart = state.phase === "lobby" || state.phase === "gameEnd";
    const enough = state.players.length >= state.minPlayers;

    startBtn.classList.toggle("hidden", !(isHost && canStart));
    startBtn.disabled = !enough;
    startBtn.textContent = state.phase === "gameEnd" ? "↻ Neues Spiel" : "▶ Spiel starten";

    if (!canStart) {
        lobbyHint.textContent = "Spiel läuft…";
    } else if (!enough) {
        lobbyHint.textContent = `Warte auf Mitspieler (mind. ${state.minPlayers})…`;
    } else if (isHost) {
        lobbyHint.textContent = "Du bist Host – starte das Spiel, wenn alle da sind.";
    } else {
        lobbyHint.textContent = `Warte, bis ${nameOf(state.hostId)} das Spiel startet…`;
    }
}

function renderStatus() {
    const isMaster = state.masterId === myId;
    const my = me();

    roundInfo.textContent = state.round > 0 ? `Runde ${state.round}/${state.totalRounds}` : "";

    let text = "";
    switch (state.phase) {
        case "lobby":
            text = "Warte in der Lobby, bis das Spiel gestartet wird.";
            break;
        case "choosing":
            text = isMaster
                ? "✏️ Gib ein geheimes Wort ein!"
                : `⏳ ${nameOf(state.masterId)} wählt gerade ein Wort… bitte kurz warten.`;
            break;
        case "guessing":
            if (isMaster) text = "👀 Die anderen raten dein Wort.";
            else if (state.pending) text = `⚖️ ${nameOf(state.masterId)} entscheidet, wer ein Leben verliert…`;
            else if (!my?.playing) text = "👀 Du schaust in dieser Runde zu.";
            else if (my.lives === 0) text = "☠️ Du hast keine Leben mehr – schau den anderen zu.";
            else text = "🔤 Rate einen Buchstaben oder schreib das ganze Wort in den Chat!";
            break;
        case "roundEnd":
            text = state.result?.reason ?? "";
            break;
        case "gameEnd":
            text = "🏆 Das Spiel ist vorbei!";
            break;
    }
    statusText.textContent = text;
}

function renderWordForm() {
    const show = state.phase === "choosing" && state.masterId === myId;
    const wasHidden = wordForm.classList.contains("hidden");
    wordForm.classList.toggle("hidden", !show);
    if (show && wasHidden) {
        wordInput.value = "";
        wordInput.focus();
    }
}

function renderPenalty() {
    const show = state.phase === "guessing" && state.pending && state.masterId === myId;
    penaltyPanel.classList.toggle("hidden", !show);
    if (!show) return;

    const p = state.pending;
    penaltyText.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = p.guesserId ? nameOf(p.guesserId) : "Ein Spieler";
    penaltyText.append(strong, ` hat „${p.letter.toUpperCase()}" falsch geraten. Wem ziehst du ein Leben ab?`);

    penaltyButtons.innerHTML = "";
    state.players
        .filter(pl => pl.playing && pl.lives > 0)
        .forEach(pl => {
            const btn = document.createElement("button");
            btn.className = "btn btn-danger";
            btn.textContent = `${pl.name} (${pl.lives} ❤️)`;
            btn.addEventListener("click", () => sendMsg({ type: "penalty", targetId: pl.id }));
            penaltyButtons.appendChild(btn);
        });
}

function renderWord() {
    wordDisplay.innerHTML = "";
    state.word.forEach(l => {
        const box = document.createElement("div");
        box.classList.add("letter-box");
        if (l.ch) {
            box.textContent = l.ch;
            box.classList.add(l.revealed ? "revealed" : "secret");
        }
        wordDisplay.appendChild(box);
    });
}

function renderWrong() {
    wrongCount.textContent = state.wrong.length ? `${state.wrong.length}/${state.maxWrong}` : "";
    wrongDisplay.innerHTML = "";
    state.wrong.forEach(l => {
        const span = document.createElement("span");
        span.classList.add("wrong-letter");
        span.textContent = l;
        wrongDisplay.appendChild(span);
    });
}

function buildKeyboard() {
    keyboard.innerHTML = "";
    LETTERS.forEach(l => {
        const btn = document.createElement("button");
        btn.classList.add("key-btn");
        btn.dataset.letter = l;
        btn.textContent = l;
        btn.disabled = true;
        btn.addEventListener("click", () => sendMsg({ type: "guess", letter: l }));
        keyboard.appendChild(btn);
    });
}

function renderKeyboard() {
    const my = me();
    const canGuess = state.phase === "guessing" && !state.pending &&
                     my?.playing && my.lives > 0;

    keyboard.querySelectorAll(".key-btn").forEach(btn => {
        const l = btn.dataset.letter;
        const correct = state.guessed.includes(l);
        const wrong = state.wrong.includes(l);
        btn.classList.toggle("correct", correct);
        btn.classList.toggle("wrong", wrong);
        btn.disabled = !canGuess || correct || wrong;
    });
}

function updateTimers() {
    if (!state) return;
    const elapsed = Date.now() - stateTime;

    const showTimer = state.phase === "choosing" || state.phase === "guessing";
    timerEl.classList.toggle("hidden", !showTimer);
    if (showTimer) {
        const secs = Math.ceil(Math.max(0, state.timeLeftMs - elapsed) / 1000);
        timerValue.textContent = secs;
        timerEl.classList.toggle("urgent", secs <= 10);
    }

    if (state.pending) {
        penaltyTimer.textContent = Math.ceil(Math.max(0, state.penaltyLeftMs - elapsed) / 1000);
    }
}

// ── Overlay (Rundenende / Spielende) ────────────────────────────────
function renderOverlay() {
    let key = "";
    if (state.phase === "roundEnd") key = `round-${state.round}`;
    if (state.phase === "gameEnd")  key = "game";

    if (!key) {
        hideOverlay();
        return;
    }
    if (key === lastOverlay) return;
    lastOverlay = key;

    overlayMsg.innerHTML = "";
    overlayBtn.classList.add("hidden");
    stopConfetti();

    if (state.phase === "roundEnd") {
        const r = state.result;
        const iWon = r.winner === "guessers" ? r.masterId !== myId : r.winner === "master" && r.masterId === myId;

        if (r.winner === "guessers")    overlayTitle.textContent = "🎉 Wort erraten!";
        else if (r.winner === "master") overlayTitle.textContent = `💀 ${nameOf(r.masterId)} gewinnt die Runde`;
        else                            overlayTitle.textContent = "Runde abgebrochen";

        const p = document.createElement("p");
        p.textContent = r.reason;
        overlayMsg.appendChild(p);

        if (r.word) {
            const w = document.createElement("p");
            w.append("Das Wort war: ");
            const strong = document.createElement("strong");
            strong.textContent = r.word.toUpperCase();
            strong.style.color = r.winner === "guessers" ? "#4ade80" : "#f87171";
            strong.style.fontSize = "1.3em";
            w.appendChild(strong);
            overlayMsg.appendChild(w);
        }

        const next = document.createElement("p");
        next.className = "muted small";
        next.textContent = r.last ? "Gleich kommt der Endstand…" : "Die nächste Runde startet gleich…";
        overlayMsg.appendChild(next);

        if (iWon) startConfetti();
    } else {
        const ranking = state.result?.ranking ?? [];
        overlayTitle.textContent = "🏆 Endstand";
        const ol = document.createElement("ol");
        ranking.forEach((p, i) => {
            const li = document.createElement("li");
            li.textContent = `${["🥇", "🥈", "🥉"][i] ?? ""} ${p.name} – ${p.score} Punkte`;
            li.style.color = p.color;
            ol.appendChild(li);
        });
        overlayMsg.appendChild(ol);

        overlayBtn.textContent = "Schließen";
        overlayBtn.onclick = () => hideOverlay(true);
        overlayBtn.classList.remove("hidden");

        if (ranking[0]?.id === myId) startConfetti();
    }

    overlay.classList.remove("hidden");
}

function hideOverlay(keepKey = false) {
    overlay.classList.add("hidden");
    stopConfetti();
    if (!keepKey) lastOverlay = "";
}

// ── Chat ────────────────────────────────────────────────────────────
function addChat(msg) {
    const atBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 40;

    const div = document.createElement("div");
    div.className = "chat-msg";
    if (msg.system) {
        div.classList.add("system", msg.kind || "info");
        div.textContent = msg.text;
    } else {
        const name = document.createElement("span");
        name.className = "chat-name";
        name.style.color = msg.color;
        name.textContent = msg.name + ": ";
        div.append(name, msg.text);
    }
    chatMessages.appendChild(div);

    // Nicht unendlich wachsen lassen
    while (chatMessages.children.length > 200) chatMessages.firstChild.remove();
    if (atBottom || msg.fromId === myId) chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Live-Mauszeiger der anderen ─────────────────────────────────────
function moveCursor(msg) {
    if (msg.x === null) { removeCursor(msg.id); return; }

    let el = cursors.get(msg.id);
    const player = state?.players.find(p => p.id === msg.id);
    if (!el) {
        if (!player) return;
        el = document.createElement("div");
        el.className = "remote-cursor";
        el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M3 2l7 19 2.5-7.5L20 11z" fill="${player.color}" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>
        </svg><span></span>`;
        const label = el.querySelector("span");
        label.textContent = player.name;
        label.style.background = player.color;
        cursorLayer.appendChild(el);
        cursors.set(msg.id, el);
    }
    el.style.transform = `translate(${msg.x * window.innerWidth}px, ${msg.y * window.innerHeight}px)`;
}

function removeCursor(id) {
    const el = cursors.get(id);
    if (el) { el.remove(); cursors.delete(id); }
}

function clearCursors() {
    cursors.forEach(el => el.remove());
    cursors.clear();
}

// ── Toast ───────────────────────────────────────────────────────────
function showToast(text) {
    toast.textContent = text;
    toast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3000);
}

// ── Canvas Drawing ──────────────────────────────────────────────────
function drawHangman(wrongCount) {
    drawGallows();
    for (let i = 1; i <= wrongCount; i++) drawPart(i);
}

function drawGallows() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth   = 4;
    ctx.lineCap     = "round";

    // Base
    ctx.beginPath(); ctx.moveTo(20, 340); ctx.lineTo(180, 340); ctx.stroke();
    // Vertical pole
    ctx.beginPath(); ctx.moveTo(60, 340); ctx.lineTo(60, 30);  ctx.stroke();
    // Horizontal beam
    ctx.beginPath(); ctx.moveTo(60, 30);  ctx.lineTo(160, 30); ctx.stroke();
    // Rope
    ctx.beginPath(); ctx.moveTo(160, 30); ctx.lineTo(160, 70); ctx.stroke();
}

function drawPart(step) {
    ctx.strokeStyle = "#f1f5f9";
    ctx.fillStyle   = "#f1f5f9";
    ctx.lineWidth   = 3;
    ctx.lineCap     = "round";

    switch (step) {
        case 1: // Head
            ctx.beginPath(); ctx.arc(160, 95, 25, 0, Math.PI * 2); ctx.stroke();
            break;
        case 2: // Body
            ctx.beginPath(); ctx.moveTo(160, 120); ctx.lineTo(160, 210); ctx.stroke();
            break;
        case 3: // Left arm
            ctx.beginPath(); ctx.moveTo(160, 145); ctx.lineTo(120, 185); ctx.stroke();
            break;
        case 4: // Right arm
            ctx.beginPath(); ctx.moveTo(160, 145); ctx.lineTo(200, 185); ctx.stroke();
            break;
        case 5: // Left leg
            ctx.beginPath(); ctx.moveTo(160, 210); ctx.lineTo(125, 270); ctx.stroke();
            break;
        case 6: // Right leg
            ctx.beginPath(); ctx.moveTo(160, 210); ctx.lineTo(195, 270); ctx.stroke();
            break;
        case 7: // Left foot
            ctx.beginPath(); ctx.moveTo(125, 270); ctx.lineTo(110, 270); ctx.stroke();
            break;
        case 8: // Right foot
            ctx.beginPath(); ctx.moveTo(195, 270); ctx.lineTo(210, 270); ctx.stroke();
            break;
        case 9: // Eyes
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(150, 88); ctx.lineTo(155, 96); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(155, 88); ctx.lineTo(150, 96); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(165, 88); ctx.lineTo(170, 96); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(170, 88); ctx.lineTo(165, 96); ctx.stroke();
            break;
        case 10: // Sad mouth
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(160, 108, 8, Math.PI, 0, true); ctx.stroke();
            break;
    }
}

// ── Confetti ────────────────────────────────────────────────────────
function startConfetti() {
    stopConfetti();
    const cc = confettiCanvas;
    cc.width  = window.innerWidth;
    cc.height = window.innerHeight;
    const cctx = cc.getContext("2d");

    const pieces = Array.from({ length: 200 }, () => ({
        x:  Math.random() * cc.width,
        y:  Math.random() * cc.height - cc.height,
        w:  Math.random() * 10 + 5,
        h:  Math.random() * 6 + 3,
        dx: (Math.random() - 0.5) * 4,
        dy: Math.random() * 4 + 2,
        rot: Math.random() * 360,
        dr: (Math.random() - 0.5) * 8,
        color: `hsl(${Math.random() * 360}, 85%, 60%)`
    }));

    function frame() {
        cctx.clearRect(0, 0, cc.width, cc.height);
        pieces.forEach(p => {
            p.x   += p.dx;
            p.y   += p.dy;
            p.rot += p.dr;
            if (p.y > cc.height + 20) {
                p.y = -20;
                p.x = Math.random() * cc.width;
            }
            cctx.save();
            cctx.translate(p.x, p.y);
            cctx.rotate(p.rot * Math.PI / 180);
            cctx.fillStyle = p.color;
            cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            cctx.restore();
        });
        confettiId = requestAnimationFrame(frame);
    }
    frame();
}

function stopConfetti() {
    if (confettiId) { cancelAnimationFrame(confettiId); confettiId = null; }
    confettiCanvas.getContext("2d").clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}
