// Simuliert 3 Spieler gegen einen laufenden Server.
// Aufruf:  node test/simulate.js [ws://localhost:8082/ws]
const WebSocket = require("ws");
const URL = process.argv[2] || "ws://localhost:8082/ws";

let failed = 0;
function check(cond, text) {
    console.log(`${cond ? "OK  " : "FAIL"} ${text}`);
    if (!cond) failed++;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function client(name) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(URL);
        const c = { ws, name, state: null, chats: [], errors: [], cursors: [], id: null };
        c.send = (m) => ws.send(JSON.stringify(m));
        ws.on("message", (d) => {
            const m = JSON.parse(d);
            if (m.type === "state") c.state = m;
            if (m.type === "chat") c.chats.push(m);
            if (m.type === "error") c.errors.push(m.message);
            if (m.type === "cursor") c.cursors.push(m);
            if (m.type === "welcome") { c.id = m.id; resolve(c); }
            if (m.type === "error" && !c.id) resolve(c);
        });
        ws.on("open", () => c.send({ type: "join", name }));
        ws.on("error", reject);
    });
}

(async () => {
    const a = await client("Anna");
    const b = await client("Ben");
    const c = await client("Cem");
    const dup = await client("anna");
    await sleep(200);

    check(dup.id === null && dup.errors[0]?.includes("vergeben"), "Doppelter Name wird abgelehnt");
    dup.ws.close();
    check(a.state.players.length === 3, "Lobby zeigt 3 Spieler");
    check(a.state.hostId === a.id, "Erster Spieler ist Host");

    b.send({ type: "start" });
    await sleep(150);
    check(b.errors.some(e => e.includes("Host")), "Nicht-Host kann nicht starten");

    a.send({ type: "start" });
    await sleep(150);
    check(a.state.phase === "choosing" && a.state.masterId === a.id, "Spiel startet, Anna ist Wortgeber");
    check(b.state.timeLeftMs > 40000 && b.state.timeLeftMs <= 45000, "45-Sekunden-Timer laeuft");

    a.send({ type: "setWord", word: "hallo welt" });
    await sleep(100);
    check(a.errors.some(e => e.includes("Ungültig")), "Ungueltiges Wort wird abgelehnt");

    a.send({ type: "setWord", word: "Hallo" });
    await sleep(150);
    check(b.state.phase === "guessing", "Ratephase beginnt");
    check(b.state.word.length === 5 && b.state.word.every(l => l.ch === null), "Rater sehen das Wort nicht");
    check(a.state.word.map(l => l.ch).join("") === "hallo", "Wortgeber sieht sein Wort");
    check(b.state.players.every(p => p.id === a.id || p.lives === 7), "Rater haben 7 Leben");

    b.send({ type: "guess", letter: "l" });
    await sleep(100);
    check(c.state.word.filter(l => l.revealed).length === 2, "Richtiger Buchstabe wird aufgedeckt");

    c.send({ type: "guess", letter: "x" });
    await sleep(100);
    check(a.state.pending?.guesserId === c.id, "Falsch geraten -> Wortgeber muss entscheiden");

    b.send({ type: "guess", letter: "a" });
    await sleep(100);
    check(!b.state.guessed.includes("a"), "Raten ist waehrend der Entscheidung gesperrt");

    b.send({ type: "penalty", targetId: c.id });
    await sleep(100);
    check(c.state.players.find(p => p.id === c.id).lives === 7, "Nur der Wortgeber darf Leben abziehen");

    a.send({ type: "penalty", targetId: b.id });
    await sleep(100);
    check(b.state.players.find(p => p.id === b.id).lives === 6 && !b.state.pending,
          "Wortgeber zieht Ben ein Leben ab (6 uebrig)");

    a.send({ type: "cursor", x: 0.5, y: 0.25 });
    await sleep(100);
    check(b.cursors.some(m => m.id === a.id && m.x === 0.5), "Mauszeiger wird an andere uebertragen");

    a.send({ type: "chat", text: "es ist hallo" });
    await sleep(350);
    check(a.errors.some(e => e.includes("verraten")), "Wortgeber darf das Wort nicht verraten");

    b.send({ type: "chat", text: "Hallo zusammen" });
    await sleep(350);
    check(c.chats.some(m => m.name === "Ben" && m.text === "Hallo zusammen"), "Chat-Nachricht kommt an");

    c.send({ type: "chat", text: "hallo" });
    await sleep(150);
    check(b.state.phase === "roundEnd" && b.state.result.winner === "guessers" && b.state.result.solverId === c.id,
          "Cem erraet das Wort im Chat -> Runde gewonnen");

    console.log("... warte auf die naechste Runde (6 s)");
    await sleep(6300);
    check(b.state.phase === "choosing" && b.state.masterId === b.id && b.state.round === 2,
          "Runde 2: Ben ist Wortgeber");

    c.ws.close();
    await sleep(200);
    check(a.state.players.length === 2, "Spieler, die gehen, werden aus der Lobby entfernt");

    a.ws.close(); b.ws.close();
    console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : "\nAlle Tests bestanden");
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
