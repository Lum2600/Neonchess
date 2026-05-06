// --- GESTIONE MULTIPLAYER TRAMITE SOCKET.IO ---
const socket = typeof io !== 'undefined' ? io() : null;
let isMultiplayer = false;
let roomCode = '';
let isRemoteMoveExecuting = false;

function openMultiplayerMenu() { document.getElementById('multiplayer-overlay').classList.add('show'); }
function closeMultiplayerMenu() { 
    document.getElementById('multiplayer-overlay').classList.remove('show'); 
    document.getElementById('mp-menu').style.display = 'block';
    document.getElementById('mp-waiting').style.display = 'none';
    if (isMultiplayer && roomCode && !gameHasStarted) location.reload();
}

function createRoom() {
    if(!socket) return alert("Errore: Server Multiplayer non rilevato.");
    const username = document.getElementById('player-username').value.trim() || "GIOCATORE 1";
    socket.emit('createRoom', username);
}

function joinRoom() {
    if(!socket) return alert("Errore: Server Multiplayer non rilevato.");
    const code = document.getElementById('join-code').value.toUpperCase();
    const username = document.getElementById('player-username').value.trim() || "GIOCATORE 2";
    if(code.length > 0) {
        roomCode = code; 
        socket.emit('joinRoom', { code: code, username: username });
    }
}

if(socket) {
    socket.on('roomCreated', (code) => {
        roomCode = code;
        document.getElementById('mp-menu').style.display = 'none';
        document.getElementById('mp-waiting').style.display = 'block';
        document.getElementById('display-room-code').innerText = code;
        isMultiplayer = true;
    });

    socket.on('assignTeam', (team) => {
        setTeam(team);
        opponentMode = 'HUMAN'; 
        document.getElementById('btn-opp-hum').classList.add('active');
        document.getElementById('btn-opp-ai').classList.remove('active');
        
        // Giriamo l'intera scacchiera per chi gioca col nero online!
        if(team === 'B') document.body.classList.add('play-as-black');
        else document.body.classList.remove('play-as-black');
    });

    socket.on('gameStart', (names) => {
        isMultiplayer = true; 
        
        // Imposta gli username a schermo
        document.getElementById('name-w').innerText = names.p1Name;
        document.getElementById('name-b').innerText = names.p2Name;
        
        startGame(false, true); 
        closeMultiplayerMenu(); 
        showModAlert("VS " + (myTeam === 'W' ? names.p2Name : names.p1Name), "mod-c1");
    });

    socket.on('errorMsg', (msg) => { alert(msg); });

    socket.on('receiveMove', (data) => {
        isRemoteMoveExecuting = true;
        document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
        animateMovement(data.fr, data.fc, data.tr, data.tc, data.color, () => {
            // FIX MULTIPLAYER: Passiamo anche il seme di casualità ricevuto dall'avversario
            executeMove(data.fr, data.fc, data.tr, data.tc, data.special, true, data.promoPiece, data.seedSync);
        });
    });

    socket.on('opponentDisconnected', () => {
        if(gameOver) return;
        triggerEnd(myTeam, 'DISCONNESSO', "L'avversario ha abbandonato la partita.");
    });
}

// --- GESTIONE AUDIO E OPZIONI ---
let musicStarted = false;
let sfxVolume = 0.5;
let gfxLevel = 'HI'; 
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function tryStartMusic() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    if (musicStarted) return;
    let music = document.getElementById('bg-music');
    music.volume = document.getElementById('vol-slider').value;
    music.play().then(() => { musicStarted = true; }).catch(e => console.log("Attesa interazione..."));
}

document.body.addEventListener('click', tryStartMusic, { once: true });

function updateVolume(val) { document.getElementById('bg-music').volume = val; document.getElementById('vol-slider').value = val; tryStartMusic(); }
function updateSfxVolume(val) { sfxVolume = parseFloat(val); document.getElementById('sfx-slider').value = val; if(audioCtx.state === 'suspended') audioCtx.resume(); }

function playMoveSound(type = 'move') {
    if(sfxVolume <= 0) return;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    
    if(type === 'check') {
        const playBeep = (timeOffset) => {
            const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
            osc.connect(gainNode); gainNode.connect(audioCtx.destination);
            osc.type = 'square'; osc.frequency.setValueAtTime(600, now + timeOffset); osc.frequency.exponentialRampToValueAtTime(800, now + timeOffset + 0.15);
            gainNode.gain.setValueAtTime(sfxVolume * 0.7, now + timeOffset); gainNode.gain.exponentialRampToValueAtTime(0.01, now + timeOffset + 0.2);
            osc.start(now + timeOffset); osc.stop(now + timeOffset + 0.2);
        };
        playBeep(0); playBeep(0.2);
    } 
    else if(type === 'capture') {
        const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gainNode.gain.setValueAtTime(sfxVolume * 0.8, now); gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        const osc2 = audioCtx.createOscillator(); osc2.type = 'square'; osc2.frequency.setValueAtTime(800, now); osc2.frequency.exponentialRampToValueAtTime(100, now + 0.1); osc2.connect(gainNode);
        osc2.start(now); osc2.stop(now + 0.15); osc.start(now); osc.stop(now + 0.15);
    } else {
        const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gainNode.gain.setValueAtTime(sfxVolume, now); gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    }
}

function playDropSound(tier) {
    if(sfxVolume <= 0) return; if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); const now = audioCtx.currentTime;
    
    if (tier === 'common') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.3 * sfxVolume, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (tier === 'rare') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.setValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.3 * sfxVolume, now); gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (tier === 'epic') {
        osc.type = 'square'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.4);
        const osc2 = audioCtx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(300, now); osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.4); osc2.connect(gainNode);
        gainNode.gain.setValueAtTime(0.4 * sfxVolume, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5); osc2.start(now); osc2.stop(now + 0.5);
    } else if (tier === 'legend') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.8);
        const osc2 = audioCtx.createOscillator(); osc2.type = 'square'; osc2.frequency.setValueAtTime(225, now); osc2.frequency.exponentialRampToValueAtTime(1800, now + 0.8); osc2.connect(gainNode);
        const osc3 = audioCtx.createOscillator(); osc3.type = 'triangle'; osc3.frequency.setValueAtTime(75, now); osc3.frequency.exponentialRampToValueAtTime(600, now + 0.8); osc3.connect(gainNode);
        gainNode.gain.setValueAtTime(0.5 * sfxVolume, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        osc.start(now); osc.stop(now + 1.0); osc2.start(now); osc2.stop(now + 1.0); osc3.start(now); osc3.stop(now + 1.0);
    }
}

// --- MOTORE DI GIOCO ---
let myTeam = 'W', gameHasStarted = false, opponentMode = 'HUMAN', timerEnabled = false, timeLimitMinutes = 5;

// === FIX MULTIPLAYER: MOTORE NUMERI CASUALI SINCRONIZZATO ===
let gameSeed = Math.floor(Math.random() * 1000000); 
function getGameRandom() {
    gameSeed = (gameSeed * 9301 + 49297) % 233280;
    return gameSeed / 233280;
}

function setOpponent(mode) {
    opponentMode = mode; document.getElementById('btn-opp-hum').classList.toggle('active', mode === 'HUMAN'); document.getElementById('btn-opp-ai').classList.toggle('active', mode === 'AI');
    if (mode === 'AI') { setTeam('W'); document.getElementById('team-selector-row').style.opacity = '0.3'; document.getElementById('team-selector-row').style.pointerEvents = 'none'; } 
    else { document.getElementById('team-selector-row').style.opacity = '1'; document.getElementById('team-selector-row').style.pointerEvents = 'auto'; }
    tryStartMusic();
}

function setTeam(t) { 
    myTeam = t; 
    document.getElementById('btn-team-w').classList.toggle('active', t==='W'); 
    document.getElementById('btn-team-b').classList.toggle('active', t==='B'); 
    document.body.setAttribute('data-team', t); 
    tryStartMusic(); 
}
function setGraphics(lvl) {
    gfxLevel = lvl;
    document.getElementById('btn-gfx-hi').classList.toggle('active', lvl === 'HI');
    document.getElementById('btn-gfx-med').classList.toggle('active', lvl === 'MED');
    document.getElementById('btn-gfx-lo').classList.toggle('active', lvl === 'LO');
    document.body.setAttribute('data-gfx', lvl);
    tryStartMusic();
}

function setTimer(enabled) { timerEnabled = enabled; document.getElementById('btn-timer-on').classList.toggle('active', enabled); document.getElementById('btn-timer-off').classList.toggle('active', !enabled); document.getElementById('time-select-row').style.display = enabled ? 'flex' : 'none'; tryStartMusic(); }
function setTimeVal(mins, btnElement) { timeLimitMinutes = mins; document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active')); btnElement.classList.add('active'); tryStartMusic(); }
function openTutorial() { document.getElementById('tutorial-overlay').classList.add('show'); }
function closeTutorial() { document.getElementById('tutorial-overlay').classList.remove('show'); }

function openSettings() { 
    document.getElementById('start-screen').style.display = 'flex'; 
    let devBtn = document.getElementById('dev-mode-btn');
    if(devBtn) devBtn.style.display = isMultiplayer ? 'none' : 'inline-block';
}

function promptDev() {
    let pwd = prompt("Inserisci la password per la DEV MODE:");
    if (pwd === "Murry2") openDev();
    else if (pwd !== null) alert("Password errata!");
}

function openDev() {
    document.getElementById('dev-overlay').classList.add('show');
    buildDevPanel('W', 'dev-w-mods');
    buildDevPanel('B', 'dev-b-mods');
}

function closeDev() {
    document.getElementById('dev-overlay').classList.remove('show');
    refreshModPanels();
    if (gameHasStarted) draw(); 
}

function forceOverdrive() {
    closeDev();
    triggerOverdrive();
}

function buildDevPanel(color, containerId) {
    let html = '';
    let pieces = ['p', 'n', 'b', 'r', 'q', 'k'];
    pieces.forEach(pc => {
        html += `<div style="margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">`;
        html += `<span style="font-size:1.5rem; text-shadow:0 0 5px var(--${color==='W'?'white':'black'});" class="piece ${color}">${glyphs[color === 'W' ? pc.toUpperCase() : pc]}</span>`;
        html += `<select onchange="setDevMod('${color}', '${pc}', this.value)" style="background:rgba(255,255,255,0.1); color:white; border:1px solid var(--t2); padding:6px; border-radius:4px; font-family:'Inter'; width:75%;">`;
        html += `<option value="" style="color:black;">Nessuno</option>`;
        db[pc].forEach(mod => {
            let sel = (classMods[color][pc] && classMods[color][pc].n === mod.n) ? 'selected' : '';
            html += `<option value="${mod.n}" style="color:black;" ${sel}>[${mod.t.toUpperCase()}] ${mod.n}</option>`;
        });
        html += `</select></div>`;
    });
    document.getElementById(containerId).innerHTML = html;
}

function setDevMod(color, pc, modName) {
    if (!modName) { delete classMods[color][pc]; } 
    else {
        let mod = db[pc].find(m => m.n === modName);
        classMods[color][pc] = mod;
        recentModdedClasses.push({ color: color, cl: pc });
        setTimeout(() => { recentModdedClasses = recentModdedClasses.filter(x => !(x.color === color && x.cl === pc)); }, 1200);
    }
}

function refreshModPanels() {
    ['W', 'B'].forEach(color => {
        let listId = color === 'W' ? 'w-mods-list' : 'b-mods-list';
        let list = document.getElementById(listId);
        list.innerHTML = '';
        ['p', 'n', 'b', 'r', 'q', 'k'].forEach(pc => {
            if (classMods[color][pc]) {
                let mod = classMods[color][pc];
                let icon = glyphs[color === 'W' ? pc.toUpperCase() : pc];
                list.innerHTML += `<div class="card c-${mod.t} mod-card-${pc}"><div class="card-header"><div class="card-title">${icon} ${mod.n}</div><div class="badge">${mod.t}</div></div><div class="card-desc">${mod.d}</div></div>`;
            }
        });
    });
}

function showPromotionUI(color, callback) {
    isAnimating = true; 
    let overlay = document.getElementById('promotion-overlay');
    let container = document.getElementById('promo-buttons');
    let pieces = ['q', 'r', 'b', 'n'];
    container.innerHTML = '';
    pieces.forEach(p => {
        let pieceChar = color === 'W' ? p.toUpperCase() : p;
        let btn = document.createElement('button');
        btn.className = 'play-btn'; 
        btn.style.fontSize = '3rem'; btn.style.padding = '10px 20px'; btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.border = '2px solid var(--t2)'; btn.style.color = color === 'W' ? 'var(--white)' : 'var(--black)';
        btn.innerHTML = glyphs[pieceChar];
        btn.onclick = () => {
            overlay.classList.remove('show');
            isAnimating = false;
            callback(p);
        };
        container.appendChild(btn);
    });
    overlay.classList.add('show');
}

let isClassicMode = false;
let currentMoveSequence = "";

const openingBook = {
    "6444": ["1434", "1232", "1424", "1222"], "6444-1434-7655": ["0122", "0625"], "6444-1434-7152": ["0122", "0625"],
    "6444-1232-7655": ["1323", "0122", "1424"], "6343": ["1333", "0625"], "6343-1333-6242": ["1424", "1222"], 
    "6343-0625-6242": ["1424", "1626"], "7655": ["1333", "0625"], "6242": ["1434", "1232", "1424"] 
};

function startGame(classic = false, fromMultiplayer = false) {
    if (isMultiplayer && !fromMultiplayer) return; 

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-ui').classList.add('show');
    tryStartMusic();
    
    if (!gameHasStarted) { 
        isClassicMode = classic;
        init(); 
        gameHasStarted = true; 
        document.getElementById('main-play-btn').innerText = "RESUME"; 
        document.getElementById('classic-play-btn').style.display = 'none';
        document.getElementById('resign-row').style.display = 'flex';
        
        if (isMultiplayer && myTeam === 'B') { document.body.classList.add('play-as-black'); } 
        else { document.body.classList.remove('play-as-black'); }
        
        if (isClassicMode) {
            document.body.classList.add('classic-mode');
            document.querySelector('.header').innerText = "NEON CHESS: CLASSIC";
            document.getElementById('kills-counter').innerText = "CLASSIC MODE ACTIVE";
            document.getElementById('kills-counter').className = 'kills-counter impatience-1';
            document.getElementById('kills-counter').style.borderColor = 'var(--t1)';
            document.getElementById('kills-counter').style.color = 'var(--t1)';
            document.getElementById('kills-counter').style.textShadow = '0 0 10px var(--t1)';
        }
    }
    lastTime = Date.now();
}

let classMods = { 'W': {}, 'B': {} }; let deadPieces = { 'W': [], 'B': [] };
let castlingRights = { 'W': { k: true, r1: true, r8: true }, 'B': { k: true, r1: true, r8: true } };
let lastMove = null; let turno = 'W'; let grid = []; let selected = null; let hints = [];
let nextThresholdIndex = 0; const thresholds = [2, 5, 8, 15];
let halfMoveClock = 0; let positionHistory = {}; let gameOver = false; let isAnimating = false; let recentSpawns = []; 
let originalQueens = []; let timeLeftW = 0; let timeLeftB = 0; let timerInterval = null; let lastTime = 0;
let initialPositions = {}; let recentModdedClasses = []; let promotedPieces = []; 

const glyphs = { 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♙' };
const db = {
    'p': [{ n: "King Soul", t: "common", d: "Si muove come il Re." }, { n: "Front Bite", t: "rare", d: "Può mangiare anche frontalmente." }, { n: "Necromancy", t: "epic", d: "Uccidere fa risorgere un pedone caduto." }, { n: "Mass Infection", t: "legend", d: "Fine turno: infetta nemici adiacenti in pedoni." }],
    'n': [{ n: "L-Slide", t: "common", d: "Può fermarsi lungo il percorso a L." }, { n: "Mount", t: "rare", d: "Acquisisce movimenti dell'ultimo morto." }, { n: "Explosive", t: "epic", d: "Atterrare polverizza l'area." }, { n: "Ghost Rider", t: "legend", d: "Teletrasporto ovunque vuoto." }],
    'b': [{ n: "Side Step", t: "common", d: "Move orizzontale +1." }, { n: "Vault", t: "rare", d: "Scavalca alleati diagonali e può dare scacco." }, { n: "Wall Bounce", t: "epic", d: "Rimbalza sui bordi percorrendo la nuova diagonale." }, { n: "Chain Reaction", t: "legend", d: "A fine mossa, disintegra i due nemici laterali frontali e l'intera diagonale di fronte a lui." }],
    'r': [{ n: "Homecoming", t: "common", d: "Teletrasporto in una base libera." }, { n: "Voodoo Death", t: "rare", d: "Maledizione: distrugge il killer." }, { n: "Gravity Well", t: "epic", d: "Blocca nemici sulla linea (eccetto il Re)." }, { n: "Factory", t: "legend", d: "Genera Torre lasciando cella." }],
    'q': [{ n: "Knight Soul", t: "common", d: "Aggiunge mosse cavallo." }, { n: "Brainwash", t: "rare", d: "Converte la Regina e la teletrasporta in salvo." }, { n: "Immortal", t: "epic", d: "Rinasce se uccisa (Solo Originali)." }, { n: "Annihilation", t: "legend", d: "Passa attraverso e uccide nemici." }],
    'k': [{ n: "Row Warp", t: "common", d: "Warp sulla sua riga." }, { n: "Emperor", t: "rare", d: "Move come Regina." }, { n: "The Betrayal", t: "epic", d: "Warp su un nemico e lo distrugge." }, { n: "Great Resurrection", t: "legend", d: "(Istante) Resuscita tutti nella tua metà." }]
};

function init() {
    grid = [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
    halfMoveClock = 0; positionHistory = {}; currentMoveSequence = "";
    originalQueens = ["0,3", "7,3"]; nextThresholdIndex = 0;
    classMods = { 'W': {}, 'B': {} }; deadPieces = { 'W': [], 'B': [] };
    recentModdedClasses = []; promotedPieces = [];
    
    initialPositions = {};
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c]) initialPositions[`${r},${c}`] = grid[r][c];

    document.body.classList.remove('mod-level-1', 'mod-level-2', 'mod-level-3', 'overdrive', 'human-vs-human');
    document.getElementById('w-mods-list').innerHTML = ''; document.getElementById('b-mods-list').innerHTML = '';
    
    let bgm = document.getElementById('bg-music');
    bgm.playbackRate = 1.0; bgm.preservesPitch = true;
    
    timeLeftW = timeLimitMinutes * 60 * 1000; timeLeftB = timeLimitMinutes * 60 * 1000;
    lastTime = Date.now();
    clearInterval(timerInterval); if(timerEnabled) startClock();
    
    updateScores(); updateTimersUI(); updateKillsCounter(); draw();
}

function startClock() {
    lastTime = Date.now();
    timerInterval = setInterval(() => {
        if(gameOver || isAnimating || document.getElementById('start-screen').style.display !== 'none') { lastTime = Date.now(); return; }
        let now = Date.now(); let delta = now - lastTime; lastTime = now;
        if(turno === 'W') { timeLeftW -= delta; if(timeLeftW <= 0) { timeLeftW = 0; triggerEnd('B', 'TIME OUT', `Tempo scaduto per il Team White.`); } } 
        else { timeLeftB -= delta; if(timeLeftB <= 0) { timeLeftB = 0; triggerEnd('W', 'TIME OUT', `Tempo scaduto per il Team Black.`); } }
        updateTimersUI();
    }, 50);
}

function triggerEnd(winnerColor, title, desc) {
    gameOver = true; clearInterval(timerInterval);
    if(gfxLevel !== 'LO') { document.getElementById('main-board-wrapper').classList.add('zoom-finish'); createParticles(); }
    setTimeout(() => {
        document.getElementById('game-over-screen').classList.add('show');
        let t = document.getElementById('go-title'); t.innerText = title;
        if(winnerColor) t.style.color = winnerColor === 'W' ? 'var(--white)' : 'var(--black)'; else t.style.color = 'var(--t2)';
        document.getElementById('go-desc').innerText = desc;
    }, gfxLevel !== 'LO' ? 2500 : 500); 
}

function updateTimersUI() {
    let container = document.getElementById('timers-container');
    if(!timerEnabled) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    let fmt = (ms) => {
        let totalTenths = Math.floor(ms / 100); let mins = Math.floor(totalTenths / 600);
        let secs = Math.floor((totalTenths % 600) / 10); let tenths = totalTenths % 10;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
    };
    let wT = document.getElementById('w-timer'), bT = document.getElementById('b-timer');
    wT.innerText = fmt(timeLeftW); bT.innerText = fmt(timeLeftB);
    wT.style.opacity = turno === 'W' ? '1' : '0.5'; wT.style.textShadow = turno === 'W' ? '0 0 10px var(--white)' : 'none';
    bT.style.opacity = turno === 'B' ? '1' : '0.5'; bT.style.textShadow = turno === 'B' ? '0 0 10px var(--black)' : 'none';
}

function getPositionKey() { return JSON.stringify(grid) + turno + JSON.stringify(castlingRights) + JSON.stringify(classMods); }

function triggerOverdrive() {
    if(document.body.classList.contains('overdrive')) return;
    isAnimating = true;
    
    let bgm = document.getElementById('bg-music');
    bgm.preservesPitch = false; bgm.playbackRate = 2.0;

    let alertEl = document.getElementById('overdrive-alert');
    alertEl.classList.add('show');
    playMoveSound('check');

    if(gfxLevel !== 'LO') {
        let wipe = document.createElement('div'); wipe.className = 'laser-wipe'; document.body.appendChild(wipe);
        setTimeout(() => {
            document.body.classList.add('overdrive');
            if(gfxLevel === 'HI') document.getElementById('main-board-wrapper').classList.add('board-overdrive-jump');
        }, 1300); 
        setTimeout(() => {
            alertEl.classList.remove('show'); wipe.remove(); document.getElementById('main-board-wrapper').classList.remove('board-overdrive-jump');
            isAnimating = false; if(opponentMode === 'AI' && turno === 'B' && !gameOver) setTimeout(playAI, 800);
        }, 3000);
    } else {
        document.body.classList.add('overdrive');
        setTimeout(() => { alertEl.classList.remove('show'); isAnimating = false; if(opponentMode === 'AI' && turno === 'B' && !gameOver) setTimeout(playAI, 800); }, 2000);
    }
}

function showModAlert(text, colorClass) {
    let alertEl = document.getElementById('mod-alert');
    alertEl.innerText = text; alertEl.classList.remove('show', 'mod-c1', 'mod-c2', 'mod-c3');
    void alertEl.offsetWidth; alertEl.classList.add('show', colorClass); playMoveSound('check');
    if(gfxLevel !== 'LO') { let flash = document.createElement('div'); flash.className = 'screen-flash'; document.body.appendChild(flash); setTimeout(() => flash.remove(), 600); }
    setTimeout(() => { alertEl.classList.remove('show'); }, 2500);
}

function updateKillsCounter() {
    let el = document.getElementById('kills-counter');
    if (!el) return;
    if (isClassicMode) { el.innerText = "CLASSIC MODE ACTIVE"; return; }

    let currentTotalDead = deadPieces['W'].length + deadPieces['B'].length;
    el.classList.remove('impatience-1', 'impatience-2', 'impatience-3', 'overdrive-text');

    if (nextThresholdIndex < thresholds.length) {
        let needed = thresholds[nextThresholdIndex]; let left = needed - currentTotalDead;
        el.innerText = `NEXT MOD IN: ${left} KILL${left !== 1 ? 'S' : ''} (MOD ${nextThresholdIndex+1}/4)`;
        if (nextThresholdIndex === 3) el.classList.add('impatience-3');
        else if (nextThresholdIndex === 2) el.classList.add('impatience-2');
        else if (nextThresholdIndex === 1) el.classList.add('impatience-1');
    } else {
        el.innerText = `OVERDRIVE MODE ACTIVE`; el.classList.add('overdrive-text');
    }
}

function isPromoted(r, c) { return promotedPieces.some(p => p.r === r && p.c === c); }
function getMod(r, c, color, cl) { return isPromoted(r, c) ? null : classMods[color][cl]; }

function giveModTo(targetColor) {
    let livingClasses = [];
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
        let p = grid[r][c];
        if(p && (p===p.toUpperCase()?'W':'B')===targetColor) { let cl = p.toLowerCase(); if(!livingClasses.includes(cl)) livingClasses.push(cl); }
    }
    if(livingClasses.length === 0) return;

    let pool = livingClasses.filter(c => !classMods[targetColor][c]);
    let targetClass = '', isOverwrite = false;

    // FIX MULTIPLAYER: Usa il seme di gioco sincronizzato
    if (pool.length > 0) targetClass = pool[Math.floor(getGameRandom() * pool.length)];
    else { targetClass = livingClasses[Math.floor(getGameRandom() * livingClasses.length)]; isOverwrite = true; }

    let tier = nextThresholdIndex < 2 ? ['common', 'rare'] : ['epic', 'legend'];
    let mods = db[targetClass].filter(x => tier.includes(x.t));
    if (mods.length === 0) mods = db[targetClass]; 
    
    // FIX MULTIPLAYER: Usa il seme di gioco sincronizzato
    let mod = mods[Math.floor(getGameRandom() * mods.length)];
    if (targetColor === 'W') playDropSound(mod.t);

    let listId = targetColor === 'W' ? 'w-mods-list' : 'b-mods-list';
    let list = document.getElementById(listId);

    if(isOverwrite) {
        let oldCards = list.querySelectorAll(`.mod-card-${targetClass}:not(.disabled-card)`);
        oldCards.forEach(card => card.classList.add('disabled-card'));
    }

    classMods[targetColor][targetClass] = mod;
    let icon = glyphs[targetClass==='p'?(targetColor==='W'?'P':'p'):(targetColor==='W'?targetClass.toUpperCase():targetClass)];
    list.innerHTML += `<div class="card c-${mod.t} mod-card-${targetClass}"><div class="card-header"><div class="card-title">${icon} ${mod.n}</div><div class="badge">${mod.t}</div></div><div class="card-desc">${mod.d}</div></div>`;

    recentModdedClasses.push({ color: targetColor, cl: targetClass });
    setTimeout(() => { recentModdedClasses = recentModdedClasses.filter(x => !(x.color === targetColor && x.cl === targetClass)); draw(); }, 1200);
    triggerInstantMods(targetColor, mod);
}

function triggerInstantMods(color, mod) {
    if (mod.n === 'Brainwash') {
        let enemyQ = color === 'W' ? 'q' : 'Q'; let myQ = color === 'W' ? 'Q' : 'q'; let qPos = null;
        for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(grid[r][c] === enemyQ) { qPos = {r, c}; grid[r][c] = ''; }
        if(qPos) {
            let empties = []; let enemyColor = color === 'W' ? 'B' : 'W';
            for(let i=0; i<8; i++) for(let j=0; j<8; j++) if(!grid[i][j]) { let backup = grid.map(row => [...row]); backup[i][j] = myQ; if(!isInCheck(enemyColor, backup)) empties.push({r:i, c:j}); }
            if(empties.length === 0) for(let i=0; i<8; i++) for(let j=0; j<8; j++) if(!grid[i][j]) empties.push({r:i, c:j});
            if(empties.length > 0) {
                // FIX MULTIPLAYER: Usa il seme di gioco sincronizzato
                let spot = empties[Math.floor(getGameRandom() * empties.length)]; grid[spot.r][spot.c] = myQ; recentSpawns.push({r: spot.r, c: spot.c});
                if (isPromoted(qPos.r, qPos.c)) { promotedPieces = promotedPieces.filter(p => p.r !== qPos.r || p.c !== qPos.c); promotedPieces.push({r: spot.r, c: spot.c}); }
                let idx = originalQueens.indexOf(qPos.r+","+qPos.c); if(idx !== -1) originalQueens.splice(idx, 1);
            }
        }
    }
    if (mod.n === 'Great Resurrection') {
        let myHalf = [], enemyHalf = [];
        for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!grid[r][c]) { if (color === 'W' && r >= 4) myHalf.push({r,c}); else if (color === 'B' && r <= 3) myHalf.push({r,c}); else enemyHalf.push({r,c}); }
        // FIX MULTIPLAYER: Usa il seme di gioco sincronizzato
        myHalf = myHalf.sort(() => getGameRandom() - 0.5); enemyHalf = enemyHalf.sort(() => getGameRandom() - 0.5);
        let emptiesForPop = enemyHalf.concat(myHalf); 
        while(deadPieces[color].length > 0 && emptiesForPop.length > 0) { let p = deadPieces[color].pop(); let pos = emptiesForPop.pop(); grid[pos.r][pos.c] = color === 'W' ? p.toUpperCase() : p.toLowerCase(); recentSpawns.push({r: pos.r, c: pos.c}); }
        updateScores();
    }
}

function findKing(color, testGrid = grid) { let target = color === 'W' ? 'K' : 'k'; for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(testGrid[r][c]===target) return {r,c}; return null; }

function isUnderAttack(tR, tC, aColor, testGrid = grid) { 
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) { let p = testGrid[r][c]; if(p && (p===p.toUpperCase()?'W':'B')===aColor) { if(getMovesPseudoLegal(r, c, aColor, testGrid, false).some(m => m.r===tR && m.c===tC)) return true; } } return false; 
}

let isCheckingLogic=false; function isInCheck(color, testGrid = grid) { if(isCheckingLogic) return false; let kPos = findKing(color, testGrid); if (!kPos) return false; isCheckingLogic=true; let attack=isUnderAttack(kPos.r, kPos.c, color==='W'?'B':'W', testGrid); isCheckingLogic=false; return attack; }

function simulateMoveDestruction(testGrid, fr, fc, tr, tc, pColor, special) {
    let p = testGrid[fr][fc]; if (!p) return; let cl = p.toLowerCase(); let mod = getMod(fr, fc, pColor, cl);
    let enemyColor = pColor === 'W' ? 'B' : 'W'; let target = testGrid[tr][tc];

    if (cl === 'q' && mod?.n === 'Annihilation') { let dr = Math.sign(tr-fr), dc = Math.sign(tc-fc); let cr = fr+dr, cc = fc+dc; while (cr!==tr || cc!==tc) { if (testGrid[cr][cc] && testGrid[cr][cc].toLowerCase() !== 'k') testGrid[cr][cc] = ''; cr += dr; cc += dc; } }

    if (special && special.isEnPassant) testGrid[fr][tc] = ''; 
    if (special && special.isCastle) { if (special.isCastle === 'K') { testGrid[fr][tc-1] = testGrid[fr][tc+1]; testGrid[fr][tc+1] = ''; } if (special.isCastle === 'Q') { testGrid[fr][tc+1] = testGrid[fr][tc-2]; testGrid[fr][tc-2] = ''; } }

    testGrid[tr][tc] = p; testGrid[fr][fc] = '';
    
    let isAttackerDead = false;
    if (target && target.toLowerCase() === 'r' && getMod(tr, tc, enemyColor, 'r')?.n === 'Voodoo Death') isAttackerDead = true;

    if (isAttackerDead) { testGrid[tr][tc] = ''; } 
    else {
        if (cl === 'n' && mod?.n === 'Explosive') { for(let i=-1; i<=1; i++) for(let j=-1; j<=1; j++) { if(i===0 && j===0) continue; let nr=tr+i, nc=tc+j; if(nr>=0 && nr<8 && nc>=0 && nc<8 && testGrid[nr][nc] && (testGrid[nr][nc]===testGrid[nr][nc].toUpperCase()?'W':'B')!==pColor && testGrid[nr][nc].toLowerCase() !== 'k') { testGrid[nr][nc] = ''; } } }
        if (cl === 'b' && mod?.n === 'Chain Reaction') {
            let dr = Math.sign(tr-fr), dc = Math.sign(tc-fc);
            let s1r = tr + dr, s1c = tc; let t1 = testGrid[s1r]?.[s1c]; if(t1 && t1.toLowerCase() !== 'k' && (t1===t1.toUpperCase()?'W':'B')!==pColor) testGrid[s1r][s1c] = '';
            let s2r = tr, s2c = tc + dc; let t2 = testGrid[s2r]?.[s2c]; if(t2 && t2.toLowerCase() !== 'k' && (t2===t2.toUpperCase()?'W':'B')!==pColor) testGrid[s2r][s2c] = '';
            let kr = tr + dr, kc = tc + dc; while(kr>=0 && kr<8 && kc>=0 && kc<8) { let tK = testGrid[kr][kc]; if (tK && tK.toLowerCase() !== 'k' && (tK===tK.toUpperCase()?'W':'B')!==pColor) testGrid[kr][kc] = ''; kr += dr; kc += dc; }
        }
    }
}

function getLegalMoves(r, c) {
    let pColor = grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B'; let enemyColor = pColor === 'W' ? 'B' : 'W'; let p = grid[r][c];
    if (p.toLowerCase() !== 'k') { for(let i=0; i<8; i++) { if(grid[r][i] && grid[r][i].toLowerCase()==='r' && (grid[r][i]===grid[r][i].toUpperCase()?'W':'B')===enemyColor && getMod(r, i, enemyColor, 'r')?.n==='Gravity Well') return []; if(grid[i][c] && grid[i][c].toLowerCase()==='r' && (grid[i][c]===grid[i][c].toUpperCase()?'W':'B')===enemyColor && getMod(i, c, enemyColor, 'r')?.n==='Gravity Well') return []; } }

    let legalMoves = [];
    for (let m of getMovesPseudoLegal(r, c, pColor, grid, false)) {
        if (grid[m.r][m.c] && grid[m.r][m.c].toLowerCase() === 'k') continue;
        let backup = grid.map(row => [...row]); simulateMoveDestruction(backup, r, c, m.r, m.c, pColor, m);
        if (!isInCheck(pColor, backup)) legalMoves.push(m);
    }
    if (p.toLowerCase() === 'k' && !isInCheck(pColor)) {
        let row = pColor === 'W' ? 7 : 0;
        if (castlingRights[pColor].k && r === row) {
            if (castlingRights[pColor].r8 && !grid[row][c+1] && !grid[row][c+2] && !isUnderAttack(row, c+1, enemyColor) && !isUnderAttack(row, c+2, enemyColor)) legalMoves.push({ r: row, c: c + 2, isCastle: 'K' });
            if (castlingRights[pColor].r1 && !grid[row][c-1] && !grid[row][c-2] && !grid[row][c-3] && !isUnderAttack(row, c-1, enemyColor) && !isUnderAttack(row, c-2, enemyColor)) legalMoves.push({ r: row, c: c - 2, isCastle: 'Q' });
        }
    }
    return legalMoves;
}

function getMovesPseudoLegal(r, c, color, testGrid = grid, ignoreMods = false) {
    let p = testGrid[r][c]; if (!p) return []; let cl = p.toLowerCase(); let mods = ignoreMods || isPromoted(r, c) ? null : classMods[color][cl]; let m = []; let dir = color == 'W' ? -1 : 1;

    if (cl == 'p') {
        if (!testGrid[r + dir]?.[c]) { m.push({ r: r + dir, c: c }); if ((color == 'W' && r == 6) || (color == 'B' && r == 1)) if (!testGrid[r + 2 * dir]?.[c]) m.push({ r: r + 2 * dir, c: c }); }
        if (testGrid[r + dir]?.[c - 1] && (testGrid[r + dir][c - 1] == testGrid[r + dir][c - 1].toUpperCase() ? 'W' : 'B') != color) m.push({ r: r + dir, c: c - 1 });
        if (testGrid[r + dir]?.[c + 1] && (testGrid[r + dir][c + 1] == testGrid[r + dir][c + 1].toUpperCase() ? 'W' : 'B') != color) m.push({ r: r + dir, c: c + 1 });
        if (lastMove && lastMove.piece.toLowerCase() === 'p' && Math.abs(lastMove.to.r - lastMove.from.r) === 2 && lastMove.to.r === r && Math.abs(lastMove.to.c - c) === 1) m.push({ r: r + dir, c: lastMove.to.c, isEnPassant: true });
        if (mods?.n == 'King Soul') [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(d => { let nr = r+d[0], nc = c+d[1]; if (nr>=0 && nr<8 && nc>=0 && nc<8 && !testGrid[nr][nc]) m.push({ r: nr, c: nc }); });
        if (mods?.n == 'Front Bite' && testGrid[r + dir]?.[c] && (testGrid[r + dir][c] == testGrid[r + dir][c].toUpperCase() ? 'W' : 'B') != color) m.push({ r: r + dir, c: c });
    }

    if (cl == 'n') {
        [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(d => { let nr = r+d[0], nc = c+d[1]; if (nr>=0 && nr<8 && nc>=0 && nc<8 && (!testGrid[nr][nc] || (testGrid[nr][nc]==testGrid[nr][nc].toUpperCase()?'W':'B')!=color)) m.push({ r: nr, c: nc }); });
        if (mods?.n == 'L-Slide') [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]].forEach(d => { let nr = r+d[0], nc = c+d[1]; if (nr>=0 && nr<8 && nc>=0 && nc<8 && (!testGrid[nr][nc] || (testGrid[nr][nc]==testGrid[nr][nc].toUpperCase()?'W':'B')!=color)) m.push({ r: nr, c: nc }); });
        if (mods?.n == 'Ghost Rider') for (let i=0; i<8; i++) for (let j=0; j<8; j++) if (!testGrid[i][j]) m.push({ r: i, c: j });
        if (mods?.n == 'Mount' && deadPieces[color].length > 0) { let ld = deadPieces[color][deadPieces[color].length - 1].toLowerCase(); if(ld !== 'n' && ld !== 'k') { testGrid[r][c] = color === 'W' ? ld.toUpperCase() : ld; m.push(...getMovesPseudoLegal(r, c, color, testGrid, true)); testGrid[r][c] = p; } }
    }

    let dirs = [];
    if (cl == 'b' || cl == 'q' || (cl == 'k' && mods?.n == 'Emperor')) dirs.push([-1,-1], [-1,1], [1,-1], [1,1]);
    if (cl == 'r' || cl == 'q' || (cl == 'k' && mods?.n == 'Emperor')) dirs.push([-1,0], [1,0], [0,-1], [0,1]);
    dirs.forEach(d_orig => {
        let d = [...d_orig]; let nr = r, nc = c; let bounced = false;
        while (true) {
            nr += d[0]; nc += d[1];
            if (nr<0 || nr>7 || nc<0 || nc>7) { if (mods?.n == 'Wall Bounce' && !bounced) { nr -= d[0]; nc -= d[1]; if (nr + d[0] < 0 || nr + d[0] > 7) d[0] *= -1; if (nc + d[1] < 0 || nc + d[1] > 7) d[1] *= -1; bounced = true; continue; } else break; }
            let t = testGrid[nr][nc];
            if (t) { let isE = (t==t.toUpperCase()?'W':'B')!=color; if (isE) { m.push({ r: nr, c: nc }); if (cl === 'q' && mods?.n === 'Annihilation') continue; } if (mods?.n === 'Vault' && !isE) continue; if (cl !== 'q' || mods?.n !== 'Annihilation') break; } else m.push({ r: nr, c: nc });
        }
    });

    if (cl == 'k' && mods?.n !== 'Emperor') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(d => { let nr=r+d[0], nc=c+d[1]; if(nr>=0&&nr<8&&nc>=0&&nc<8&&(!testGrid[nr][nc]||(testGrid[nr][nc]==testGrid[nr][nc].toUpperCase()?'W':'B')!=color)) m.push({r:nr,c:nc}); });
        if (mods?.n == 'Row Warp') for (let j=0; j<8; j++) if (!testGrid[r][j]) m.push({ r: r, c: j });
        if (mods?.n == 'The Betrayal') for(let i=0; i<8; i++) for(let j=0; j<8; j++) { let t=testGrid[i][j]; if(t&&(t===t.toUpperCase()?'W':'B')!==color&&t.toLowerCase()!=='k') m.push({r:i, c:j}); }
    }
    if (cl == 'q' && mods?.n == 'Knight Soul') [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(d => { let nr=r+d[0],nc=c+d[1]; if(nr>=0&&nr<8&&nc>=0&&nc<8&&(!testGrid[nr][nc]||(testGrid[nr][nc]==testGrid[nr][nc].toUpperCase()?'W':'B')!=color)) m.push({r:nr,c:nc}); });
    if (cl == 'b' && mods?.n == 'Side Step') { if (c>0 && (!testGrid[r][c-1] || (testGrid[r][c-1]==testGrid[r][c-1].toUpperCase()?'W':'B')!=color)) m.push({ r: r, c: c-1 }); if (c<7 && (!testGrid[r][c+1] || (testGrid[r][c+1]==testGrid[r][c+1].toUpperCase()?'W':'B')!=color)) m.push({ r: r, c: c+1 }); }
    
    if (cl === 'r' && mods?.n === 'Homecoming') { let iks = Object.keys(initialPositions).filter(k => initialPositions[k]===p && !testGrid[parseInt(k.split(',')[0])][parseInt(k.split(',')[1])]); iks.forEach(ik => { m.push({ r: parseInt(ik.split(',')[0]), c: parseInt(ik.split(',')[1]) }); }); }

    return m;
}

function getPieceValue(p) { if(!p) return 0; const vals = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0}; return vals[p.toLowerCase()] || 0; }

function evaluateMove(fr, fc, tr, tc, special) {
    let pColor = 'B'; let enemyColor = 'W'; let p = grid[fr][fc]; let cl = p.toLowerCase(); let mod = getMod(fr, fc, pColor, cl);
    let score = Math.random() * 0.5; let target = grid[tr][tc];

    if (target) score += getPieceValue(target) * 10;
    if (special && special.isEnPassant) score += 10; 
    if (special && special.isCastle) score += 20; 

    if (cl === 'q' && mod?.n === 'Annihilation') { let dr = Math.sign(tr-fr), dc = Math.sign(tc-fc); let cr = fr+dr, cc = fc+dc; while (cr!==tr || cc!==tc) { if (grid[cr][cc] && grid[cr][cc].toLowerCase() !== 'k') score += getPieceValue(grid[cr][cc]) * 10; cr += dr; cc += dc; } }
    if (cl === 'n' && mod?.n === 'Explosive') { for(let i=-1; i<=1; i++) for(let j=-1; j<=1; j++) { if(i===0 && j===0) continue; let nr=tr+i, nc=tc+j; if(nr>=0 && nr<8 && nc>=0 && nc<8 && grid[nr][nc] && (grid[nr][nc]===grid[nr][nc].toUpperCase()?'W':'B')!==pColor && grid[nr][nc].toLowerCase() !== 'k') score += getPieceValue(grid[nr][nc]) * 10; } }
    if (cl === 'b' && mod?.n === 'Chain Reaction') {
        let dr = Math.sign(tr-fr), dc = Math.sign(tc-fc);
        let s1r = tr + dr, s1c = tc; if(s1r>=0 && s1r<8 && s1c>=0 && s1c<8) { let t1 = grid[s1r][s1c]; if (t1 && t1.toLowerCase() !== 'k' && (t1===t1.toUpperCase()?'W':'B')!==pColor) score += getPieceValue(t1) * 10; }
        let s2r = tr, s2c = tc + dc; if(s2r>=0 && s2r<8 && s2c>=0 && s2c<8) { let t2 = grid[s2r][s2c]; if (t2 && t2.toLowerCase() !== 'k' && (t2===t2.toUpperCase()?'W':'B')!==pColor) score += getPieceValue(t2) * 10; }
        let kr = tr + dr, kc = tc + dc; while(kr>=0 && kr<8 && kc>=0 && kc<8) { let tK = grid[kr][kc]; if (tK && tK.toLowerCase() !== 'k' && (tK===tK.toUpperCase()?'W':'B')!==pColor) score += getPieceValue(tK) * 10; kr += dr; kc += dc; }
    }

    let isAttackedEnd = isUnderAttack(tr, tc, enemyColor, grid); let isDefendedEnd = isUnderAttack(tr, tc, pColor, grid);
    if (isAttackedEnd) { if (isDefendedEnd) score -= getPieceValue(p) * 2; else score -= getPieceValue(p) * 10; }
    if (isUnderAttack(fr, fc, enemyColor, grid)) score += getPieceValue(p) * 8; 

    if ((tr === 3 || tr === 4) && (tc === 3 || tc === 4)) score += 1.5; else if (tr >= 2 && tr <= 5 && tc >= 2 && tc <= 5) score += 0.5; 
    if (cl === 'p') { score += tr * 0.5; if (tr === 7) score += 800; }
    
    let backup = grid.map(row => [...row]); simulateMoveDestruction(backup, fr, fc, tr, tc, pColor, special);
    if (isInCheck(enemyColor, backup)) score += 12; 

    return score;
}

function playAI() {
    if (gameOver) return;
    let bestMove = null; 
    if (openingBook[currentMoveSequence]) {
        let bookMoves = openingBook[currentMoveSequence]; let chosenMoveStr = bookMoves[Math.floor(Math.random() * bookMoves.length)];
        let f_r = parseInt(chosenMoveStr[0]), f_c = parseInt(chosenMoveStr[1]); let t_r = parseInt(chosenMoveStr[2]), t_c = parseInt(chosenMoveStr[3]);
        let legalMoves = getLegalMoves(f_r, f_c); let validSpecial = legalMoves.find(m => m.r === t_r && m.c === t_c);
        if (validSpecial !== undefined) bestMove = {fr: f_r, fc: f_c, tr: t_r, tc: t_c, special: validSpecial};
    }

    if (!bestMove) {
        let bestScore = -Infinity; let bestMoves = [];
        for(let r=0; r<8; r++) {
            for(let c=0; c<8; c++) {
                let p = grid[r][c];
                if(p && (p===p.toUpperCase()?'W':'B') === 'B') {
                    let moves = getLegalMoves(r, c);
                    moves.forEach(m => {
                        let score = evaluateMove(r, c, m.r, m.c, m);
                        if(score > bestScore) { bestScore = score; bestMoves = [{fr: r, fc: c, tr: m.r, tc: m.c, special: m}]; } 
                        else if (Math.abs(score - bestScore) < 0.001) bestMoves.push({fr: r, fc: c, tr: m.r, tc: m.c, special: m});
                    });
                }
            }
        }
        if (bestMoves.length > 0) bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    if (bestMove) {
        document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
        animateMovement(bestMove.fr, bestMove.fc, bestMove.tr, bestMove.tc, 'B', () => { executeMove(bestMove.fr, bestMove.fc, bestMove.tr, bestMove.tc, bestMove.special); });
    }
}

function animateMovement(fr, fc, tr, tc, pColor, callback) {
    let board = document.getElementById('board');
    let startCell = board.children[fr * 8 + fc]; let endCell = board.children[tr * 8 + tc];
    if (!startCell || !endCell) { callback(); return; }
    let piece = startCell.querySelector('.piece'); if (!piece) { callback(); return; }

    isAnimating = true;
    let startRect = piece.getBoundingClientRect(); let endRect = endCell.getBoundingClientRect();
    let dX = (endRect.left + endRect.width/2) - (startRect.left + startRect.width/2);
    let dY = (endRect.top + endRect.height/2) - (startRect.top + startRect.height/2);

    if (document.body.classList.contains('play-as-black')) { dX = -dX; dY = -dY; }

    let glowColor = pColor === 'W' ? 'var(--t2)' : 'var(--t4)';
    piece.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    if(gfxLevel !== 'LO') piece.style.transition += ', filter 0.35s ease';
    
    let rot = '';
    if (document.body.classList.contains('play-as-black')) rot = ' rotate(180deg)';
    else if (opponentMode === 'HUMAN' && !isMultiplayer && pColor === 'B') rot = ' rotate(180deg)';

    piece.style.transform = `translate(${dX}px, ${dY}px) scale(1.3)${rot}`;
    
    if(gfxLevel !== 'LO') piece.style.filter = `drop-shadow(0 0 15px ${glowColor}) brightness(1.5)`;
    piece.style.zIndex = "100";

    setTimeout(() => { isAnimating = false; callback(); }, 350);
}

function clickCell(r, c) {
    clearArrows(); // Cancella le frecce appena tocchi col tasto sinistro
    
    if (gameOver || isAnimating || (opponentMode === 'AI' && turno === 'B') || isRemoteMoveExecuting) return;
    
    if (isMultiplayer && turno !== myTeam) return;
    
    recentSpawns = []; let p = grid[r][c]; let col = p ? (p == p.toUpperCase() ? 'W' : 'B') : null;

    if (selected) {
        let m = hints.find(h => h.r == r && h.c == c);
        if (m) {
            let sr = selected.r, sc = selected.c; let sColor = grid[sr][sc] === grid[sr][sc].toUpperCase() ? 'W' : 'B';
            selected = null; hints = []; document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
            animateMovement(sr, sc, r, c, sColor, () => executeMove(sr, sc, r, c, m, false)); 
        } else if (col === turno) { selected = { r, c }; hints = getLegalMoves(r, c); draw(); } 
        else { selected = null; hints = []; draw(); }
    } else if (col === turno) { selected = { r, c }; hints = getLegalMoves(r, c); draw(); }
}

function createCaptureExplosion(r, c, color) {
    if(gfxLevel === 'LO') return; let cell = document.getElementById('board').children[r * 8 + c]; if(!cell) return;
    let burst = document.createElement('div'); burst.className = `capture-burst ${color}`; cell.appendChild(burst);
    let count = gfxLevel === 'HI' ? 5 : 2;
    for(let i=0; i<count; i++) {
        let spark = document.createElement('div'); spark.className = `spark ${color}`;
        spark.style.setProperty('--tx', (Math.random()*60-30)+'px'); spark.style.setProperty('--ty', (Math.random()*60-30)+'px');
        cell.appendChild(spark); setTimeout(() => spark.remove(), 400);
    }
    setTimeout(() => burst.remove(), 400);
}

function createParticles() {
    if(gfxLevel === 'LO') return; const colors = ['#00d9ff', '#ff003c', '#00ff88', '#bc13fe', '#ffaa00']; let count = gfxLevel === 'HI' ? 45 : 15;
    for(let i=0; i<count; i++) {
        let p = document.createElement('div'); p.className = 'particle'; let size = Math.random() * 8 + 3; p.style.width = size+'px'; p.style.height = size+'px';
        p.style.background = colors[Math.floor(Math.random()*colors.length)]; p.style.boxShadow = `0 0 12px ${p.style.background}`;
        p.style.left = (Math.random()*100)+'vw'; p.style.top = (Math.random()*100)+'vh'; p.style.animationDuration = (Math.random()*2.5+1.5)+'s'; document.body.appendChild(p);
    }
}

// FIX MULTIPLAYER: executeMove adesso accetta il parametro remoteSeed
function executeMove(fr, fc, tr, tc, special = null, isRemote = false, remotePromoPiece = null, remoteSeed = null) {
    let p = grid[fr][fc]; let pColor = p === p.toUpperCase() ? 'W' : 'B'; let enemyColor = pColor === 'W' ? 'B' : 'W';
    let target = grid[tr][tc]; let cl = p.toLowerCase(); let mod = getMod(fr, fc, pColor, cl);
    let pendingAnims = []; let isAttackerDead = false;

    let isCapture = target || (special && special.isEnPassant);
    if(isCapture) playMoveSound('capture'); else playMoveSound('move');
    
    currentMoveSequence += (currentMoveSequence ? "-" : "") + fr + "" + fc + "" + tr + "" + tc;

    let wasPromoted = isPromoted(fr, fc);
    if (wasPromoted) promotedPieces = promotedPieces.filter(pos => pos.r !== fr || pos.c !== fc);

    if (cl === 'q' && mod?.n === 'Annihilation') { let dr = Math.sign(tr-fr), dc = Math.sign(tc-fc); let cr = fr+dr, cc = fc+dc; while (cr!==tr || cc!==tc) { if (grid[cr][cc] && grid[cr][cc].toLowerCase() !== 'k') { let passedTarget = grid[cr][cc]; deadPieces[enemyColor].push(passedTarget); pendingAnims.push({type: 'capture', r: cr, c: cc, color: enemyColor}); grid[cr][cc] = ''; if (passedTarget.toLowerCase() === 'r' && getMod(cr, cc, enemyColor, 'r')?.n === 'Voodoo Death') isAttackerDead = true; } cr += dr; cc += dc; } }
    if (target) { deadPieces[enemyColor].push(target); pendingAnims.push({type: 'capture', r: tr, c: tc, color: enemyColor}); if (target.toLowerCase() === 'r' && getMod(tr, tc, enemyColor, 'r')?.n === 'Voodoo Death') isAttackerDead = true; }

    if (isAttackerDead) { deadPieces[pColor].push(p); pendingAnims.push({type: 'capture', r: tr, c: tc, color: pColor}); let pIdx = originalQueens.indexOf(fr+","+fc); if(pIdx !== -1) originalQueens.splice(pIdx, 1); }

    if (special && special.isEnPassant) { grid[fr][tc] = ''; deadPieces[enemyColor].push(pColor==='W'?'p':'P'); pendingAnims.push({type: 'capture', r: fr, c: tc, color: enemyColor}); }
    if (special && special.isCastle) { if (special.isCastle === 'K') { grid[fr][tc-1] = grid[fr][tc+1]; grid[fr][tc+1] = ''; } if (special.isCastle === 'Q') { grid[fr][tc+1] = grid[fr][tc-2]; grid[fr][tc-2] = ''; } }

    grid[tr][tc] = isAttackerDead ? '' : p; grid[fr][fc] = '';
    
    let needsPromotion = false;
    
    if (!isAttackerDead) {
        if(target && target.toLowerCase()==='q' && getMod(tr, tc, enemyColor, 'q')?.n==='Immortal' && originalQueens.includes(tr+","+tc)){ let br = enemyColor === 'W' ? 7 : 0; if(!grid[br][3]) { grid[br][3] = target; let idx = originalQueens.indexOf(tr+","+tc); if(idx !== -1) originalQueens[idx] = br+",3"; } else { let idx = originalQueens.indexOf(tr+","+tc); if(idx !== -1) originalQueens.splice(idx, 1); } }
        let pIdx = originalQueens.indexOf(fr+","+fc); if(pIdx !== -1) originalQueens[pIdx] = tr+","+tc;
        if (cl === 'p') { if ((pColor === 'W' && tr === 0) || (pColor === 'B' && tr === 7)) needsPromotion = true; }
    }

    let finishMove = (promoPiece) => {
        let startingSeed = gameSeed; // FIX MULTIPLAYER: Salviamo lo stato del dado prima di usarlo
        
        if (isRemote && remoteSeed !== null) {
            gameSeed = remoteSeed; // Sincronizzazione forzata per il giocatore in ricezione
        }

        if (needsPromotion && promoPiece) { grid[tr][tc] = pColor === 'W' ? promoPiece.toUpperCase() : promoPiece.toLowerCase(); recentSpawns.push({r: tr, c: tc}); promotedPieces.push({r: tr, c: tc}); cl = promoPiece.toLowerCase(); mod = getMod(tr, tc, pColor, cl); } 
        else if (wasPromoted && !isAttackerDead) promotedPieces.push({r: tr, c: tc}); 

        if (!isAttackerDead) {
            if (cl === 'n' && mod?.n === 'Explosive') { for(let i=-1; i<=1; i++) for(let j=-1; j<=1; j++) { if(i===0 && j===0) continue; let nr=tr+i, nc=tc+j; if(nr>=0 && nr<8 && nc>=0 && nc<8 && grid[nr][nc] && (grid[nr][nc]===grid[nr][nc].toUpperCase()?'W':'B')!==pColor && grid[nr][nc].toLowerCase() !== 'k') { deadPieces[enemyColor].push(grid[nr][nc]); pendingAnims.push({type: 'capture', r: nr, c: nc, color: enemyColor}); grid[nr][nc] = ''; } } }
            if (cl === 'b' && mod?.n === 'Chain Reaction') {
                let dr = Math.sign(tr-fr), dc = Math.sign(tc-fc); let s1r = tr + dr, s1c = tc; if (s1r>=0 && s1r<8 && s1c>=0 && s1c<8) { let t1 = grid[s1r][s1c]; if (t1 && t1.toLowerCase() !== 'k' && (t1===t1.toUpperCase()?'W':'B')!==pColor) { deadPieces[enemyColor].push(t1); pendingAnims.push({type: 'capture', r: s1r, c: s1c, color: enemyColor}); grid[s1r][s1c] = ''; } }
                let s2r = tr, s2c = tc + dc; if (s2r>=0 && s2r<8 && s2c>=0 && s2c<8) { let t2 = grid[s2r][s2c]; if (t2 && t2.toLowerCase() !== 'k' && (t2===t2.toUpperCase()?'W':'B')!==pColor) { deadPieces[enemyColor].push(t2); pendingAnims.push({type: 'capture', r: s2r, c: s2c, color: enemyColor}); grid[s2r][s2c] = ''; } }
                let kr = tr + dr, kc = tc + dc; while(kr>=0 && kr<8 && kc>=0 && kc<8) { let tK = grid[kr][kc]; if (tK && tK.toLowerCase() !== 'k' && (tK===tK.toUpperCase()?'W':'B')!==pColor) { deadPieces[enemyColor].push(tK); pendingAnims.push({type: 'capture', r: kr, c: kc, color: enemyColor}); grid[kr][kc] = ''; } kr += dr; kc += dc; }
            }
            if (cl === 'r' && mod?.n === 'Factory') { if(fr>=0 && fr<8 && fc>=0 && fc<8 && !grid[fr][fc]) { grid[fr][fc] = pColor === 'W' ? 'R' : 'r'; recentSpawns.push({r: fr, c: fc}); } }
        }

        if (cl === 'p' && mod?.n === 'Necromancy' && target && deadPieces[pColor].length > 0) { let empties = []; for(let i=0; i<8; i++) for(let j=0; j<8; j++) if(!grid[i][j]) empties.push({r:i, c:j}); if(empties.length > 0) { let spot = empties[Math.floor(getGameRandom()*empties.length)]; grid[spot.r][spot.c] = pColor === 'W' ? 'P' : 'p'; deadPieces[pColor].shift(); recentSpawns.push({r: spot.r, c: spot.c}); } }
        if (classMods[pColor]['p']?.n === 'Mass Infection') { for(let i=0; i<8; i++) for(let j=0; j<8; j++) { if(grid[i][j] && grid[i][j].toLowerCase()==='p' && (grid[i][j]===grid[i][j].toUpperCase()?'W':'B')===pColor) { [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(d => { let nr=i+d[0], nc=j+d[1]; if(nr>=0 && nr<8 && nc>=0 && nc<8 && grid[nr][nc]) { let t = grid[nr][nc]; if((t===t.toUpperCase()?'W':'B')!==pColor && t.toLowerCase()!=='k' && t.toLowerCase()!=='p') { grid[nr][nc] = enemyColor === 'W' ? 'P' : 'p'; recentSpawns.push({r: nr, c: nc}); } } }); } } }

        updateCastlingRights(p, fr, fc); lastMove = { piece: p, from: {r: fr, c: fc}, to: {r: tr, c: tc} };
        promotedPieces = promotedPieces.filter(pos => grid[pos.r][pos.c] !== '');
        updateScores(); pendingAnims.forEach(a => { if(a.type === 'capture') createCaptureExplosion(a.r, a.c, a.color); });

        let gaveDrop = false; let overdriveTriggered = false;

        if (!isClassicMode) {
            let currentTotalDead = deadPieces['W'].length + deadPieces['B'].length; let unlockedTierText = ""; let unlockedColor = "";
            while (nextThresholdIndex < thresholds.length && currentTotalDead >= thresholds[nextThresholdIndex]) {
                giveModTo('W'); giveModTo('B');
                if (nextThresholdIndex === 0) { unlockedTierText = "TIER 1 UNLOCKED"; unlockedColor = "mod-c1"; document.body.classList.add('mod-level-1'); }
                else if (nextThresholdIndex === 1) { unlockedTierText = "TIER 2 UNLOCKED"; unlockedColor = "mod-c2"; document.body.classList.add('mod-level-2'); }
                else if (nextThresholdIndex === 2) { unlockedTierText = "EPIC TIER UNLOCKED"; unlockedColor = "mod-c3"; document.body.classList.add('mod-level-3'); }
                nextThresholdIndex++; gaveDrop = true;
                if (nextThresholdIndex >= thresholds.length) { triggerOverdrive(); overdriveTriggered = true; unlockedTierText = "";  }
            }
            if (unlockedTierText !== "") showModAlert(unlockedTierText, unlockedColor);
        }

        updateKillsCounter(); draw(); 
        if (target || cl === 'p') halfMoveClock = 0; else halfMoveClock++;
        turno = (turno === 'W') ? 'B' : 'W';
        let key = getPositionKey(); positionHistory[key] = (positionHistory[key] || 0) + 1;
        checkGameState();

        // FIX MULTIPLAYER: Inviamo la mossa *insieme* allo stato del dado alla fine!
        if (isMultiplayer && !isRemote) {
            socket.emit('sendMove', { 
                roomCode: roomCode, 
                moveData: { fr, fc, tr, tc, special, promoPiece, color: pColor, seedSync: startingSeed } 
            });
        }
        if (isRemote) isRemoteMoveExecuting = false;

        if (opponentMode === 'AI' && turno === 'B' && !gameOver && !isMultiplayer) { if (!overdriveTriggered) { let delay = gaveDrop ? 3000 : 800; setTimeout(playAI, delay); } }
    };

    if (needsPromotion) {
        if (isRemote) finishMove(remotePromoPiece);
        else if (opponentMode === 'AI' && pColor === 'B' && !isMultiplayer) finishMove('q');
        else showPromotionUI(pColor, finishMove);
    } else { finishMove(null); }
}

function checkGameState() {
    let enemyColor = turno; let enemyHasMoves = false; let piecesLeft = 0;
    for(let r=0; r<8; r++) { for(let c=0; c<8; c++) { if(grid[r][c]) { piecesLeft++; if ((grid[r][c]===grid[r][c].toUpperCase()?'W':'B')===enemyColor) { if(!enemyHasMoves && getLegalMoves(r, c).length > 0) enemyHasMoves = true; } } } }
    
    let isCheck = isInCheck(enemyColor); if (isCheck && enemyHasMoves) playMoveSound('check');

    if(!enemyHasMoves) {
        if (isCheck) triggerEnd(enemyColor === 'W' ? 'B' : 'W', 'MATE', `Il Team ${enemyColor === 'W' ? 'Black' : 'White'} trionfa!`);
        else triggerEnd(null, 'STALEMATE', 'Nessuna mossa legale. La partita è patta.');
        return;
    } 
    let key = getPositionKey();
    if (halfMoveClock >= 100 || piecesLeft === 2 || positionHistory[key] >= 3) { let reason = piecesLeft === 2 ? 'Materiale insufficiente' : (positionHistory[key] >= 3 ? 'Tripla ripetizione' : 'Regola delle 50 mosse'); triggerEnd(null, 'PATTA', `${reason}. La partita è in parità.`); }
    updateTurnDisplay(); updateTimersUI();
}

function updateCastlingRights(p, r, c) { let col = p===p.toUpperCase()?'W':'B'; if (p.toLowerCase()==='k') castlingRights[col].k = false; if (p.toLowerCase()==='r') { if(c===0) castlingRights[col].r1=false; if(c===7) castlingRights[col].r8=false; } }

function updateTurnDisplay() {
    let td = document.getElementById('turn-display'); td.innerText = turno === 'W' ? "TURN: WHITE" : "TURN: BLACK"; td.style.color = turno === 'W' ? "var(--white)" : "var(--black)"; td.style.textShadow = `0 0 10px ${turno === 'W' ? "var(--white)" : "var(--black)"}`;
}

function updateScores() {
    let wScore = 0; let bScore = 0; const vals = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0};
    for(let r=0; r<8; r++) { for(let c=0; c<8; c++) { let p = grid[r][c]; if(p) { let val = vals[p.toLowerCase()] || 0; if(p === p.toUpperCase()) wScore += val; else bScore += val; } } }
    
    let wAdv = wScore > bScore ? `+${wScore - bScore}` : ''; let bAdv = bScore > wScore ? `+${bScore - wScore}` : '';
    document.getElementById('w-captures').innerHTML = deadPieces['B'].map(p => `<span class="piece B" style="margin-right:-8px; font-size:0.85em;">${glyphs[p]}</span>`).join('') + (wAdv ? `<span style="font-size:0.8rem; margin-left:12px; font-family:'Inter', sans-serif; font-weight:bold; color:var(--white); opacity:0.8;">${wAdv}</span>` : '');
    document.getElementById('b-captures').innerHTML = (bAdv ? `<span style="font-size:0.8rem; margin-right:12px; font-family:'Inter', sans-serif; font-weight:bold; color:var(--black); opacity:0.8;">${bAdv}</span>` : '') + deadPieces['W'].map(p => `<span class="piece W" style="margin-left:-8px; font-size:0.85em;">${glyphs[p]}</span>`).join('');
}

function draw() {
    let b = document.getElementById('board'); b.innerHTML = '';
    let chK = findKing(turno); let inCheck = isInCheck(turno);

    if (isMultiplayer && myTeam === 'B') {
        document.body.classList.add('play-as-black');
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let cl = `cell ${(r + c) % 2 == 0 ? 'l' : 'd'}`;
            if (selected && selected.r == r && selected.c == c) cl += ' sel'; if (lastMove && lastMove.to.r == r && lastMove.to.c == c) cl += ' last-move'; if (hints.find(h => h.r == r && h.c == c)) cl += grid[r][c] ? ' h-c' : ' h-m'; if (inCheck && chK && chK.r === r && chK.c === c) cl += ' check';

            let pHTML = '';
            if (grid[r][c]) {
                let color = grid[r][c] == grid[r][c].toUpperCase() ? 'W' : 'B'; let pc = grid[r][c].toLowerCase(); 
                let mod = getMod(r, c, color, pc); let aClass = mod ? `aura-${mod.t}` : '';
                let animClass = ''; if (recentModdedClasses.some(x => x.color === color && x.cl === pc && !isPromoted(r, c))) animClass = 'mod-receive-anim';
                let isPromo = isPromoted(r, c); let isClone = recentSpawns.some(s => s.r === r && s.c === c) && !isPromo;
                let spawnClass = (gfxLevel !== 'LO' && (isClone || isPromo)) ? 'spawn-anim' : '';
                let cloneTag = isPromo ? '<span class="clone-tag" style="color:var(--t2); border-color:var(--t2);">[P]</span>' : (isClone ? '<span class="clone-tag">[C]</span>' : '');

                pHTML = `<div class="piece ${color} ${aClass} ${spawnClass} ${animClass}">${glyphs[grid[r][c]]}${cloneTag}</div>`;
            }
            b.innerHTML += `<div class="${cl}" onclick="clickCell(${r},${c})">${pHTML}</div>`;
        }
    }
}

// ==========================================
// SISTEMA FRECCE STRATEGICHE (TASTO SINISTRO - TRASCINAMENTO)
// ==========================================
let arrowStartCell = null;

// 1. Registra la cella di partenza (Quando PREMI il Tasto Sinistro)
window.addEventListener('mousedown', e => {
    if (e.button !== 0) return; 
    if (!e.target.closest('.board-wrapper')) return;
    
    let boardEl = document.getElementById('board');
    const rect = boardEl.getBoundingClientRect();
    const cellSize = rect.width / 8;
    let c = Math.floor((e.clientX - rect.left) / cellSize);
    let r = Math.floor((e.clientY - rect.top) / cellSize);
    
    if(r < 0 || r > 7 || c < 0 || c > 7) return;

    if (document.body.getAttribute('data-team') === 'B') { c = 7 - c; r = 7 - r; }
    arrowStartCell = {r, c};
});

// 2. Registra la cella di arrivo e disegna (Quando RILASCI il Tasto Sinistro)
window.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    if (!arrowStartCell) return;
    
    let boardEl = document.getElementById('board');
    const rect = boardEl.getBoundingClientRect();
    const cellSize = rect.width / 8;
    let c = Math.floor((e.clientX - rect.left) / cellSize);
    let r = Math.floor((e.clientY - rect.top) / cellSize);
    
    if(r >= 0 && r <= 7 && c >= 0 && c <= 7) {
        if (document.body.getAttribute('data-team') === 'B') { c = 7 - c; r = 7 - r; }
        
        if (arrowStartCell.r !== r || arrowStartCell.c !== c) {
            drawArrow(arrowStartCell.r, arrowStartCell.c, r, c);
        }
    }
    arrowStartCell = null;
});

// 3. Funzione che disegna fisicamente la linea SVG (Centrata e Neon!)
function drawArrow(r1, c1, r2, c2) {
    let brd = document.getElementById('board');
    brd.style.position = 'relative'; 

    let svg = document.getElementById('arrow-svg');
    
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'arrow-svg';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '500';
        svg.style.filter = 'drop-shadow(0 0 6px rgba(0, 243, 255, 0.8))';
        
        let defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        let marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '4');
        marker.setAttribute('markerHeight', '4');
        marker.setAttribute('refX', '2.5');
        marker.setAttribute('refY', '2');
        marker.setAttribute('orient', 'auto');
        
        let polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 4 2, 0 4');
        polygon.setAttribute('fill', 'rgba(0, 243, 255, 0.9)'); 
        
        marker.appendChild(polygon);
        defs.appendChild(marker);
        svg.appendChild(defs);
        brd.appendChild(svg);
    }

    const cellSize = 100 / 8; 
    const x1 = c1 * cellSize + cellSize / 2;
    const y1 = r1 * cellSize + cellSize / 2;
    const x2 = c2 * cellSize + cellSize / 2;
    const y2 = r2 * cellSize + cellSize / 2;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1 + '%');
    line.setAttribute('y1', y1 + '%');
    line.setAttribute('x2', x2 + '%');
    line.setAttribute('y2', y2 + '%');
    line.setAttribute('stroke', 'rgba(0, 243, 255, 0.9)'); 
    line.setAttribute('stroke-width', '1.5%'); 
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.setAttribute('stroke-linecap', 'round');
    
    svg.appendChild(line);
}

// 4. Funzione per pulire le frecce
function clearArrows() {
    let svg = document.getElementById('arrow-svg');
    if (svg) {
        const lines = svg.querySelectorAll('line');
        lines.forEach(l => l.remove());
    }
}