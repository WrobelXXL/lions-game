// ===================================================================
//  HANGMAN – Galgenmaennchen  (German Words, Full‑featured)
// ===================================================================

// ── German Word Pool ────────────────────────────────────────────────
const WORDS = [
  // Kurze Woerter
  "ei","os","ab","an","da","du","er","es","ja","ob",
  "um","am","im","so","wo","au","oh","tu","zu","in",
  // 3‑4 Buchstaben
  "aal","bar","ehe","fee","gel","hut","ire","jet","kot","lob",
  "mut","not","ort","pik","rat","see","tag","uhr","wal","zoo",
  "auto","bahn","chip","dach","echo","fest","glas","haus","idee","jazz",
  "kalt","laut","mond","netz","obst","park","quiz","rund","sand","tier",
  "ufer","voll","wand","yoga","zeit","baum","bild","brot","dorf","esel",
  // 5‑6 Buchstaben
  "adler","birne","dampf","engel","farbe","geist","harfe","igeln","jubel","kerze",
  "lampe","mauer","nacht","offen","perle","regen","sonne","traum","umbau","vogel",
  "wolke","yacht","zebra","apfel","blitz","draht","ebene","fahrt","gabel","haben",
  "insel","jetzt","kampf","leben","markt","nudel","olive","pfeil","reise","stern",
  "tisch","unten","viele","woche","zucht","blume","braut","decke","feuer","gruen",
  "herde","irren","kiste","lehne","milch","nabel","opfer","platz","ratte","stoff",
  "turbo","vinyl","weich","ziege","antik","buero","chaos","diamant","donner",
  // 7‑9 Buchstaben
  "anfang","balkon","chemie","einzig","flugel","garten","herbst","kaffee","laufen",
  "mangel","orange","palast","rechts","silber","urlaub","winter","zufall","absatz",
  "brezel","dunkel","eltern","frosch","gurken","himmel","kirche","lachen","messer",
  "neblig","pflege","sauber","treppe","wetter","zahlen","bruecke","drachen","erdball",
  "flammen","goldene","hundert","kartell","laterne","monster","pfeffer","richter",
  "schrank","teppich","umstand","vorsatz","wachsen","zeitung","abgrund","blatter",
  "dreimal","eisberg","fenster","gitarre","kreativ","sammeln","tausend","vorhang",
  // 10+ Buchstaben
  "abenteuer","bernstein","dachboden","edelstein","feuerwehr","geburtstag","handschuh",
  "kartoffel","lavendel","marmelade","nachricht","orangerie","pantoffel","rucksack",
  "schmetterling","tagebuch","unterhose","verwandter","wasserfall","zauberstab",
  "achterbahn","bibliothek","drehteller","eisenbahn","flusspferd","gleitschirm",
  "halbinsel","konfiteure","leuchtturm","maulwurf","nachthemd","polizistin",
  "rolltreppe","sonnenuhr","taschenlampe","weihnachten","zahnbuerste","regenschirm",
  "staubsauger","briefkasten","kaffeemaschine","schokolade","wolkenkratzer",
  "fingerhut","blumenvase","einbahnstrasse","kirschbaum","butterblume",
  "zitroneneis","himbeermarmelade","fahrradkette","kuckucksuhr",
  // Richtig lange Woerter
  "donaudampfschifffahrt","kraftfahrzeughaftpflichtversicherung",
  "rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz",
  "grundstuecksverkehrsgenehmigungszustaendigkeitsuebertragungsverordnung"
];

// ── State ───────────────────────────────────────────────────────────
let currentWord      = "";
let guessedLetters   = new Set();
let wrongLetters     = [];
let round            = 1;
let recentWords      = [];          // last 3 words (min gap)
let gameOver         = false;
let confettiId       = null;

const MAX_WRONG = 10;               // body parts: see drawPart()

// ── DOM References ──────────────────────────────────────────────────
const canvas         = document.getElementById("hangman-canvas");
const ctx            = canvas.getContext("2d");
const wordDisplay    = document.getElementById("word-display");
const wrongDisplay   = document.getElementById("wrong-letters");
const keyboard       = document.getElementById("keyboard");
const overlay        = document.getElementById("overlay");
const overlayTitle   = document.getElementById("overlay-title");
const overlayMsg     = document.getElementById("overlay-message");
const overlayBtn     = document.getElementById("overlay-btn");
const roundNum       = document.getElementById("round-num");
const speechBubble   = document.getElementById("speech-bubble");
const confettiCanvas = document.getElementById("confetti-canvas");

// ── Initialise ──────────────────────────────────────────────────────
buildKeyboard();
startNewRound();

// Canvas click → say "Hallo!"
canvas.addEventListener("click", (e) => {
    if (gameOver) return;
    // Head exists from wrongLetters.length >= 1
    if (wrongLetters.length < 1) return;
    // Head center approx (160, 105), radius 25
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const dx = x - 160, dy = y - 105;
    if (Math.sqrt(dx*dx + dy*dy) <= 30) {
        speechBubble.classList.remove("hidden");
        setTimeout(() => speechBubble.classList.add("hidden"), 1800);
    }
});

// Physical keyboard support
document.addEventListener("keydown", (e) => {
    if (gameOver) return;
    let key = e.key.toLowerCase();
    // Map umlauts from real keyboard
    if (key === "ä" || key === "ö" || key === "ü" || key === "ß") {
        // these are mapped on screen keyboard already
    }
    const btn = document.querySelector(`.key-btn[data-letter="${key}"]`);
    if (btn && !btn.disabled) btn.click();
});

// ── Functions ───────────────────────────────────────────────────────

function pickWord() {
    let available = WORDS.filter(w => !recentWords.includes(w));
    if (available.length === 0) {
        recentWords = [];
        available = [...WORDS];
    }
    const word = available[Math.floor(Math.random() * available.length)];
    recentWords.push(word);
    if (recentWords.length > 3) recentWords.shift();
    return word;
}

function startNewRound() {
    currentWord    = pickWord();
    guessedLetters = new Set();
    wrongLetters   = [];
    gameOver       = false;
    roundNum.textContent = round;
    speechBubble.classList.add("hidden");
    overlay.classList.add("hidden");
    if (confettiId) { cancelAnimationFrame(confettiId); confettiId = null; }

    renderWord();
    renderWrong();
    resetKeyboard();
    drawGallows();
}

/* ── Word rendering ── */
function renderWord() {
    wordDisplay.innerHTML = "";
    for (const ch of currentWord) {
        const box = document.createElement("div");
        box.classList.add("letter-box");
        if (guessedLetters.has(ch)) {
            box.textContent = ch;
            box.classList.add("revealed");
        }
        wordDisplay.appendChild(box);
    }
}

/* ── Wrong letters rendering ── */
function renderWrong() {
    wrongDisplay.innerHTML = "";
    wrongLetters.forEach(l => {
        const span = document.createElement("span");
        span.classList.add("wrong-letter");
        span.textContent = l;
        wrongDisplay.appendChild(span);
    });
}

/* ── Keyboard ── */
function buildKeyboard() {
    const letters = "abcdefghijklmnopqrstuvwxyzäöüß".split("");
    keyboard.innerHTML = "";
    letters.forEach(l => {
        const btn = document.createElement("button");
        btn.classList.add("key-btn");
        btn.dataset.letter = l;
        btn.textContent = l;
        btn.addEventListener("click", () => handleGuess(l, btn));
        keyboard.appendChild(btn);
    });
}

function resetKeyboard() {
    document.querySelectorAll(".key-btn").forEach(btn => {
        btn.disabled = false;
        btn.classList.remove("correct", "wrong");
    });
}

/* ── Core guess logic ── */
function handleGuess(letter, btn) {
    if (gameOver || guessedLetters.has(letter) || wrongLetters.includes(letter)) return;
    btn.disabled = true;

    if (currentWord.includes(letter)) {
        guessedLetters.add(letter);
        btn.classList.add("correct");
        renderWord();
        checkWin();
    } else {
        wrongLetters.push(letter);
        btn.classList.add("wrong");
        renderWrong();
        drawPart(wrongLetters.length);
        checkLose();
    }
}

function checkWin() {
    const allRevealed = [...currentWord].every(ch => guessedLetters.has(ch));
    if (allRevealed) {
        gameOver = true;
        setTimeout(() => showWinScreen(), 500);
    }
}

function checkLose() {
    if (wrongLetters.length >= MAX_WRONG) {
        gameOver = true;
        setTimeout(() => showLoseScreen(), 600);
    }
}

/* ── Overlay screens ── */
function showWinScreen() {
    overlayTitle.textContent = "🎉 Gewonnen!";
    overlayMsg.innerHTML     = `Das Wort war: <strong style="color:#4ade80;font-size:1.3em">${currentWord.toUpperCase()}</strong>`;
    overlayBtn.textContent   = "Continue";
    overlayBtn.className     = "win-btn";
    overlayBtn.onclick       = () => { round++; startNewRound(); };
    overlay.classList.remove("hidden");
    startConfetti();
}

function showLoseScreen() {
    // Reveal word
    for (const ch of currentWord) guessedLetters.add(ch);
    renderWord();

    overlayTitle.textContent = "💀 Game Over";
    overlayMsg.innerHTML     = `Das Wort war: <strong style="color:#f87171;font-size:1.3em">${currentWord.toUpperCase()}</strong>`;
    overlayBtn.textContent   = "Retry";
    overlayBtn.className     = "lose-btn";
    overlayBtn.onclick       = () => { round++; startNewRound(); };
    overlay.classList.remove("hidden");
}

// ── Canvas Drawing ──────────────────────────────────────────────────

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGallows() {
    clearCanvas();
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

    switch(step) {
        case 1: // Head
            ctx.beginPath();
            ctx.arc(160, 95, 25, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case 2: // Body
            ctx.beginPath();
            ctx.moveTo(160, 120); ctx.lineTo(160, 210);
            ctx.stroke();
            break;
        case 3: // Left arm
            ctx.beginPath();
            ctx.moveTo(160, 145); ctx.lineTo(120, 185);
            ctx.stroke();
            break;
        case 4: // Right arm
            ctx.beginPath();
            ctx.moveTo(160, 145); ctx.lineTo(200, 185);
            ctx.stroke();
            break;
        case 5: // Left leg
            ctx.beginPath();
            ctx.moveTo(160, 210); ctx.lineTo(125, 270);
            ctx.stroke();
            break;
        case 6: // Right leg
            ctx.beginPath();
            ctx.moveTo(160, 210); ctx.lineTo(195, 270);
            ctx.stroke();
            break;
        case 7: // Left foot
            ctx.beginPath();
            ctx.moveTo(125, 270); ctx.lineTo(110, 270);
            ctx.stroke();
            break;
        case 8: // Right foot
            ctx.beginPath();
            ctx.moveTo(195, 270); ctx.lineTo(210, 270);
            ctx.stroke();
            break;
        case 9: // Eyes
            ctx.lineWidth = 2;
            // left eye X
            ctx.beginPath(); ctx.moveTo(150,88); ctx.lineTo(155,96); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(155,88); ctx.lineTo(150,96); ctx.stroke();
            // right eye X
            ctx.beginPath(); ctx.moveTo(165,88); ctx.lineTo(170,96); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(170,88); ctx.lineTo(165,96); ctx.stroke();
            break;
        case 10: // Sad mouth  → game over!
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(160, 108, 8, Math.PI, 0, true);
            ctx.stroke();
            break;
    }
}

// ── Confetti ────────────────────────────────────────────────────────
function startConfetti() {
    const cc = confettiCanvas;
    cc.width  = window.innerWidth;
    cc.height = window.innerHeight;
    const cctx = cc.getContext("2d");

    const pieces = Array.from({length: 200}, () => ({
        x:  Math.random() * cc.width,
        y:  Math.random() * cc.height - cc.height,
        w:  Math.random() * 10 + 5,
        h:  Math.random() * 6 + 3,
        dx: (Math.random() - 0.5) * 4,
        dy: Math.random() * 4 + 2,
        rot: Math.random() * 360,
        dr: (Math.random() - 0.5) * 8,
        color: `hsl(${Math.random()*360}, 85%, 60%)`
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
            cctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
            cctx.restore();
        });
        confettiId = requestAnimationFrame(frame);
    }
    frame();
}
