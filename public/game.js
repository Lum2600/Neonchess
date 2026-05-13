// ==========================================
// 1. GESTIONE MULTIPLAYER TRAMITE SOCKET.IO
// ==========================================
const socket = typeof io !== 'undefined' ? io() : null;
let isMultiplayer = false;
let roomCode = '';
let isRemoteMoveExecuting = false;

// --- VARIABILI GLOBALI AGGIUNTIVE ---
let sfxEnabled = true;
let isOnlineClassic = false;

// --- GESTIONE AUDIO UI ---
function toggleMusic(turnOn) {
    document.getElementById('btn-mus-on').classList.toggle('active', turnOn);
    document.getElementById('btn-mus-off').classList.toggle('active', !turnOn);

    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) {
        if (turnOn) {
            bgMusic.volume = 0.4;
            bgMusic.play().catch(e => console.log("Autoplay bloccato dal browser"));
        } else {
            bgMusic.volume = 0;
            bgMusic.pause();
        }
    }
    if (turnOn) document.body.classList.remove('music-off');
    else document.body.classList.add('music-off');
}

function killAllMenus() {
    const overlays = ['multiplayer-overlay', 'start-screen', 'mp-menu', 'mp-waiting'];
    overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('show');
        }
    });

    let tut = document.getElementById('tutorial-overlay');
    if (tut) tut.classList.remove('show');

    const gameUI = document.getElementById('game-ui');
    if (gameUI) {
        gameUI.style.display = 'flex';
        gameUI.classList.add('show');
    }
}

function openSettings() {
    const menu = document.getElementById('start-screen');
    if (menu) {
        menu.style.display = 'flex';
        document.body.classList.add('settings-open');
    }
}

function closeSettings() {
    const menu = document.getElementById('start-screen');
    if (menu) {
        menu.style.display = 'none';
        document.body.classList.remove('settings-open');
    }
}

function toggleSfx(turnOn) {
    document.getElementById('btn-sfx-on').classList.toggle('active', turnOn);
    document.getElementById('btn-sfx-off').classList.toggle('active', !turnOn);
    sfxEnabled = turnOn;
}

function setMpMode(isClassic) {
    isOnlineClassic = isClassic;
    document.getElementById('btn-mp-god').classList.toggle('active', !isClassic);
    document.getElementById('btn-mp-classic').classList.toggle('active', isClassic);
}

function openMultiplayerMenu() { document.getElementById('multiplayer-overlay').classList.add('show'); }
function closeMultiplayerMenu() {
    const overlay = document.getElementById('multiplayer-overlay');
    if (overlay) overlay.classList.remove('show');

    document.getElementById('mp-menu').style.display = 'block';
    document.getElementById('mp-waiting').style.display = 'none';
    isMultiplayer = false;
    roomCode = '';
}

function createRoom() {
    const user = document.getElementById('player-username').value.trim() || "GUEST";
    socket.emit('createRoom', { username: user, isClassic: isOnlineClassic });
}

function joinRoom() {
    const user = document.getElementById('player-username').value.trim() || "GUEST";
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) { alert("Inserisci un codice stanza valido!"); return; }
    socket.emit('joinRoom', { roomCode: code, username: user });
}

function findRandomMatch() {
    document.getElementById('mp-menu').style.display = 'none';
    document.getElementById('mp-waiting').style.display = 'block';
    document.getElementById('display-room-code').innerText = "RICERCA IN CORSO...";
    const user = document.getElementById('player-username').value.trim() || "GUEST";
    socket.emit('findMatch', { username: user, isClassic: isOnlineClassic });
}

function resignGame() {
    if (gameOver) return;
    const conf = confirm("Sei sicuro di voler abbandonare? La partita verrà data vinta all'avversario.");
    if (!conf) return;

    document.getElementById('start-screen').style.display = 'none';
    document.body.classList.remove('settings-open');

    let winnerTeam = (myTeam === 'W') ? 'B' : 'W';

    if (isMultiplayer && socket) {
        socket.emit('playerResign', { roomCode: roomCode, team: myTeam });
    }

    triggerEnd(winnerTeam, 'RESA', "Hai abbandonato la partita. Vittoria all'avversario.");
}

if (socket) {
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

        let btnHum = document.getElementById('btn-opp-hum');
        if (btnHum) btnHum.classList.add('active');
        let btnAi = document.getElementById('btn-opp-ai');
        if (btnAi) btnAi.classList.remove('active');
    });

    const handleStartLogic = (data) => {
        isMultiplayer = true;
        roomCode = data.roomCode;
        let syncedIsClassic = data.isClassic;

        let p1N = data.p1Name || "GUEST";
        let p2N = data.p2Name || "GUEST";
        if (document.getElementById('name-w')) document.getElementById('name-w').innerText = p1N;
        if (document.getElementById('name-b')) document.getElementById('name-b').innerText = p2N;

        if (data.seed) gameSeed = data.seed;

        const vsScreen = document.getElementById('vs-screen');
        if (vsScreen) {
            const topText = document.getElementById('vs-p1-text');
            const botText = document.getElementById('vs-p2-text');

            if (myTeam === 'W') {
                if (topText) topText.innerText = "TU (BIANCO)";
                if (botText) botText.innerText = p2N + " (NERO)";
            } else {
                if (topText) topText.innerText = p1N + " (BIANCO)";
                if (botText) botText.innerText = "TU (NERO)";
            }

            vsScreen.classList.remove('exit');
            vsScreen.classList.add('show', 'animate');

            setTimeout(() => {
                vsScreen.classList.remove('animate');
                vsScreen.classList.add('exit');

                setTimeout(() => {
                    vsScreen.classList.remove('show', 'exit');
                    killAllMenus();
                    startGame(syncedIsClassic, true);
                }, 400);
            }, 2200);
        } else {
            killAllMenus();
            startGame(syncedIsClassic, true);
        }
    };

    socket.on('gameStart', handleStartLogic);

    socket.on('errorMsg', (msg) => { alert(msg); });

    socket.on('receiveMove', (data) => {
        isRemoteMoveExecuting = true;
        if (data.isSkip) {
            isRemoteMoveExecuting = false;
            skipTurn(true);
            return;
        }
        document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
        animateMovement(data.fr, data.fc, data.tr, data.tc, data.color, () => {
            executeMove(data.fr, data.fc, data.tr, data.tc, data.special, true, data.promoPiece, data.seedSync);
        }, data.special ? data.special.bouncePoint : null);
    });

    socket.on('opponentDisconnected', () => {
        if (gameOver) return;
        triggerEnd(myTeam, 'DISCONNESSO', "L'avversario ha abbandonato la partita.");
    });

    socket.on('opponentResigned', () => {
        if (gameOver) return;
        triggerEnd(myTeam, 'VITTORIA', "L'avversario si è arreso! Hai vinto la partita.");
    });
}

// ==========================================
// 2. VARIABILI GLOBALI E DATABASE
// ==========================================
let musicStarted = false;
let sfxVolume = 0.5;
let gfxLevel = 'HI';
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const playlist = [
    "musica/Aria Math.mp3",
    "musica/C418 - Blind Spots (Minecraft Volume Beta).mp3",
    "musica/Mice on Venus.mp3",
    "musica/Moog City.mp3"
];
let currentSongIndex = -1;

const glyphs = {
    'r': '♜\uFE0E', 'n': '♞\uFE0E', 'b': '♝\uFE0E', 'q': '♛\uFE0E', 'k': '♚\uFE0E', 'p': '♟\uFE0E',
    'R': '♜\uFE0E', 'N': '♞\uFE0E', 'B': '♝\uFE0E', 'Q': '♛\uFE0E', 'K': '♚\uFE0E', 'P': '♙\uFE0E'
};

// --- NUOVO DATABASE AGGIORNATO ---
const db = {
    'p': [
        { n: "Guardian", t: "common", d: "Si teletrasporta davanti agli alleati sotto scacco per salvarli." },
        { n: "Hurdle", t: "common", d: "Scavalca le pedine avversarie muovendosi in avanti." },
        { n: "Energy Shield", t: "rare", d: "Sopravvive al primo attacco rimbalzando il nemico via." },
        { n: "Leap of Faith", t: "rare", d: "(Istante) I tuoi pedoni avanzano al massimo possibile." },
        { n: "Vanguard", t: "epic", d: "I pedoni si promuovono a metà scacchiera (riga 4/5)." },
        { n: "Necromancy", t: "epic", d: "Resuscita le tue pedine morte come pedoni. Se muoiono ancora, muoiono per sempre." },
        { n: "Wololo", t: "epic", d: "(Istante) Converte tutti i pedoni avversari in alleati." },
        { n: "Mass Infection", t: "legend", d: "Fine turno: infetta i pedoni nemici adiacenti convertendoli in alleati." }
    ],
    'n': [
        { n: "Cavalry", t: "common", d: "Trasporta gli alleati adiacenti donando loro mosse a L." },
        { n: "L-Slide", t: "common", d: "Può fermarsi lungo il percorso a L." },
        { n: "Pacifist", t: "rare", d: "I nemici adiacenti (tranne il Re) non possono attaccare." },
        { n: "Mount", t: "rare", d: "Acquisisce i movimenti dell'ultimo pezzo alleato morto." },
        { n: "Trample", t: "epic", d: "Mangia automaticamente le pedine su cui salta." },
        { n: "Explosive", t: "epic", d: "Atterrare polverizza l'area." },
        { n: "Cavalry Charge", t: "legend", d: "Tutti gli alleati hanno mosse a L e una vita bonus." },
        { n: "Ghost Rider", t: "legend", d: "Il cavallo può muoversi due volte di fila." }
    ],
    'b': [
        { n: "Side Step", t: "common", d: "Move orizzontale +1." },
        { n: "Phasing", t: "common", d: "Attraversa tutte le pedine sulla sua diagonale." },
        { n: "Stun Ray", t: "rare", d: "Stordisce per 1 turno i nemici che minaccia." },
        { n: "Vault", t: "rare", d: "Scavalca alleati diagonali e può dare scacco." },
        { n: "Wide Beam", t: "epic", d: "Mangia tutto anche sulle diagonali adiacenti." },
        { n: "Wall Bounce", t: "epic", d: "Rimbalza sui bordi percorrendo la nuova diagonale." },
        { n: "Chain Reaction", t: "legend", d: "A fine mossa, disintegra l'intera linea di fronte a lui." }
    ],
    'r': [
        { n: "Phoenix Rook", t: "common", d: "Torna in vita al punto di partenza se uccisa." },
        { n: "Homecoming", t: "common", d: "Teletrasporto in una base libera." },
        { n: "Ally Vault", t: "rare", d: "Scavalca le pedine alleate senza fermarsi." },
        { n: "Voodoo Death", t: "rare", d: "Maledizione: se uccisa, distrugge una torre del nemico." },
        { n: "Air Superiority", t: "epic", d: "(Istante) Bombarda le torri nemiche, Mussolini te ne invia 2 nuove." },
        { n: "Gravity Well", t: "epic", d: "Blocca i nemici sulla sua linea di tiro." },
        { n: "Juggernaut", t: "legend", d: "Enorme: schiaccia e distrugge ogni cosa adiacente quando atterra." },
        { n: "Factory", t: "legend", d: "Genera Torre lasciando cella." }
    ],
    'q': [
        { n: "Knight Soul", t: "common", d: "Aggiunge mosse cavallo." },
        { n: "Brainwash", t: "rare", d: "Converte la Regina e la teletrasporta in salvo." },
        { n: "Immortal", t: "epic", d: "Rinasce se uccisa (Solo Originali)." },
        { n: "Annihilation", t: "legend", d: "Passa attraverso e uccide nemici." }
    ],
    'k': [
        { n: "Row Warp", t: "common", d: "Warp sulla sua riga." },
        { n: "Emperor", t: "rare", d: "Move come Regina." },
        { n: "Great Resurrection", t: "epic", d: "(Istante) Resuscita tutti nella tua metà." },
        { n: "The Betrayal", t: "legend", d: "Warp su un nemico e lo distrugge." }
    ]
};

const openingBook = {
    "6444": ["1434", "1232", "1424", "1222"], "6444-1434-7655": ["0122", "0625"], "6444-1434-7152": ["0122", "0625"],
    "6444-1232-7655": ["1323", "0122", "1424"], "6343": ["1333", "0625"], "6343-1333-6242": ["1424", "1222"],
    "6343-0625-6242": ["1424", "1626"], "7655": ["1333", "0625"], "6242": ["1434", "1232", "1424"]
};

let myTeam = 'W', gameHasStarted = false, opponentMode = 'HUMAN', timerEnabled = false, timeLimitMinutes = 5;
let gameSeed = Math.floor(Math.random() * 1000000);
let isClassicMode = false;
let currentMoveSequence = "";

let classMods = { 'W': {}, 'B': {} };
let deadPieces = { 'W': [], 'B': [] };
let castlingRights = { 'W': { k: true, r1: true, r8: true }, 'B': { k: true, r1: true, r8: true } };
let lastMove = null; let turno = 'W'; let grid = []; let selected = null; let hints = [];
let nextThresholdIndex = 0; const thresholds = [2, 5, 8, 15];
let halfMoveClock = 0; let positionHistory = {}; let gameOver = false; let isAnimating = false;
let originalQueens = []; let timeLeftW = 0; let timeLeftB = 0; let timerInterval = null; let lastTime = 0;
let initialPositions = {};

// Tracker per i nuovi Modificatori
let recentModdedClasses = [];
let promotedPieces = [];
let clonedPieces = [];
let recentSpawns = [];
let isCheckingLogic = false;
let arrowStartCell = null;
let ghostRiderActive = null;
let zombiePawns = [];
let pawnShields = [];
let stunnedPieces = [];
let usedBonusLives = []; // Tiene traccia di chi ha già usato la vita extra di Cavalry Charge

// ==========================================
// 3. AUDIO PLAYER E CONTROLLI
// ==========================================
function playNextSong() {
    let music = document.getElementById('bg-music');
    if (!music) return;
    let nextIndex;
    do { nextIndex = Math.floor(Math.random() * playlist.length); } while (nextIndex === currentSongIndex);

    currentSongIndex = nextIndex;
    music.src = playlist[currentSongIndex];
    let volSlider = document.getElementById('vol-slider');
    if (volSlider) music.volume = volSlider.value;

    music.playbackRate = 1.0; music.preservesPitch = true;

    let fileName = playlist[currentSongIndex].split('/').pop().replace('.mp3', '');
    let titleEl = document.getElementById('song-title');
    if (titleEl) titleEl.innerText = fileName;

    music.play().then(() => {
        let btn = document.getElementById('play-pause-btn');
        if (btn) btn.innerText = "⏸";
    }).catch(e => console.log("Attesa interazione audio..."));
}

function togglePlayPause() {
    let music = document.getElementById('bg-music');
    let btn = document.getElementById('play-pause-btn');
    if (!music || !btn) return;
    if (music.paused) { music.play(); btn.innerText = "⏸"; }
    else { music.pause(); btn.innerText = "▶"; }
}

const progressBar = document.getElementById('song-progress');
if (progressBar) {
    progressBar.addEventListener('input', () => {
        let music = document.getElementById('bg-music');
        if (music && music.duration) music.currentTime = (progressBar.value / 100) * music.duration;
    });
}

setInterval(() => {
    let music = document.getElementById('bg-music');
    let durationEl = document.getElementById('song-duration');
    if (!music || !music.duration || !durationEl) return;
    if (progressBar) progressBar.value = (music.currentTime / music.duration) * 100;
    let fmt = (s) => {
        let m = Math.floor(s / 60); let sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    durationEl.innerText = `${fmt(music.currentTime)} / ${fmt(music.duration)}`;
}, 500);

const player = document.getElementById('music-player');
const handle = document.getElementById('music-player-handle');
let isDragging = false; let startX, startY, initialX, initialY;

if (handle && player) {
    handle.addEventListener('mousedown', (e) => {
        isDragging = true; startX = e.clientX; startY = e.clientY;
        initialX = player.offsetLeft; initialY = player.offsetTop;
        player.style.bottom = 'auto';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        player.style.left = (initialX + (e.clientX - startX)) + 'px';
        player.style.top = (initialY + (e.clientY - startY)) + 'px';
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
}

function tryStartMusic() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (musicStarted) return;
    let music = document.getElementById('bg-music');
    if (music) { music.addEventListener('ended', playNextSong); playNextSong(); }
    musicStarted = true;
}
document.body.addEventListener('click', tryStartMusic, { once: true });

function updateVolume(val) { let m = document.getElementById('bg-music'); if (m) m.volume = val; let s = document.getElementById('vol-slider'); if (s) s.value = val; tryStartMusic(); }
function updateSfxVolume(val) { sfxVolume = parseFloat(val); let s = document.getElementById('sfx-slider'); if (s) s.value = val; if (audioCtx.state === 'suspended') audioCtx.resume(); }

function playMoveSound(type = 'move') {
    if (sfxVolume <= 0) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    if (type === 'check') {
        const playBeep = (timeOffset) => {
            const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
            osc.connect(gainNode); gainNode.connect(audioCtx.destination);
            osc.type = 'square'; osc.frequency.setValueAtTime(600, now + timeOffset); osc.frequency.exponentialRampToValueAtTime(800, now + timeOffset + 0.15);
            gainNode.gain.setValueAtTime(sfxVolume * 0.7, now + timeOffset); gainNode.gain.exponentialRampToValueAtTime(0.01, now + timeOffset + 0.2);
            osc.start(now + timeOffset); osc.stop(now + timeOffset + 0.2);
        };
        playBeep(0); playBeep(0.2);
    }
    else if (type === 'capture') {
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
    if (sfxVolume <= 0) return; if (audioCtx.state === 'suspended') audioCtx.resume();
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

// ==========================================
// 4. MENU E IMPOSTAZIONI
// ==========================================
function getGameRandom() { gameSeed = (gameSeed * 9301 + 49297) % 233280; return gameSeed / 233280; }

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(getGameRandom() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function setOpponent(mode) {
    opponentMode = mode;
    document.getElementById('btn-opp-hum').classList.toggle('active', mode === 'HUMAN');
    document.getElementById('btn-opp-ai').classList.toggle('active', mode === 'AI');
    if (mode === 'AI') { setTeam('W'); document.getElementById('team-selector-row').style.opacity = '0.3'; document.getElementById('team-selector-row').style.pointerEvents = 'none'; }
    else { document.getElementById('team-selector-row').style.opacity = '1'; document.getElementById('team-selector-row').style.pointerEvents = 'auto'; }
    tryStartMusic();
}

function setTeam(team) {
    myTeam = team;
    document.body.setAttribute('data-team', team);
    const btnW = document.getElementById('btn-team-w');
    const btnB = document.getElementById('btn-team-b');
    if (btnW) btnW.classList.toggle('active', team === 'W');
    if (btnB) btnB.classList.toggle('active', team === 'B');
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

function openTutorial() { let el = document.getElementById('tutorial-overlay'); if (el) { el.style.display = ''; el.classList.add('show'); } }
function closeTutorial() { let el = document.getElementById('tutorial-overlay'); if (el) el.classList.remove('show'); }

function promptDev() {
    const password = prompt("Inserisci la password di accesso al sistema:");
    if (!password) return;
    socket.emit('tryDevMode', password);
}

if (socket) {
    socket.on('devAuthResponse', (data) => {
        if (data.success) {
            alert("Accesso Sviluppatore Garantito. Comandi sbloccati.");
            document.body.classList.add('dev-authenticated');
        } else {
            alert("Accesso Negato: Password Errata.");
        }
    });

    socket.on('admin_verified', (data) => {
        if (data.success) {
            console.log("Accesso garantito. Sei identificato come Amministratore.");
            document.body.classList.add('is-admin');
        } else {
            alert("Password errata. Accesso negato.");
        }
    });
}

function identificaAdmin() {
    const password = prompt("Inserisci Password Amministratore:");
    if (!password) return;
    socket.emit('auth_admin', password);
}

function openDev() {
    document.getElementById('dev-overlay').classList.add('show');
    buildDevPanel('W', 'dev-w-mods');
    buildDevPanel('B', 'dev-b-mods');

    let devOverlay = document.getElementById('dev-overlay');
    if (!document.getElementById('dev-tier-controls')) {
        let devControls = document.createElement('div');
        devControls.id = 'dev-tier-controls';
        devControls.style.width = '100%';
        devControls.style.textAlign = 'center';
        devControls.style.marginTop = '20px';
        devControls.style.paddingTop = '15px';
        devControls.style.borderTop = '1px solid var(--glass-border)';
        devControls.style.display = 'flex';
        devControls.style.gap = '10px';
        devControls.style.justifyContent = 'center';
        devControls.style.flexWrap = 'wrap';

        devControls.innerHTML = `
            <div style="width: 100%; color: var(--t4); font-family: 'Orbitron'; margin-bottom: 5px; font-size: 0.9rem;">FORCE GRAPHICS TIER:</div>
            <button class="opt-btn" onclick="setDevTier(0)">BASE</button>
            <button class="opt-btn" style="color:var(--t1); border-color:var(--t1);" onclick="setDevTier(1)">T1</button>
            <button class="opt-btn" style="color:var(--t2); border-color:var(--t2);" onclick="setDevTier(2)">T2</button>
            <button class="opt-btn" style="color:var(--t3); border-color:var(--t3);" onclick="setDevTier(3)">T3</button>
            <button class="opt-btn" style="color:var(--t4); border-color:var(--t4);" onclick="setDevTier(4)">OD (T4)</button>
        `;
        let container = devOverlay.querySelector('.options-box') || devOverlay;
        container.appendChild(devControls);
    }
}

function setDevTier(level) {
    document.body.classList.remove('mod-level-1', 'mod-level-2', 'mod-level-3', 'overdrive');
    nextThresholdIndex = level;
    if (level >= 1) document.body.classList.add('mod-level-1');
    if (level >= 2) document.body.classList.add('mod-level-2');
    if (level >= 3) document.body.classList.add('mod-level-3');
    if (level >= 4) document.body.classList.add('overdrive');

    let progress = level / 4;
    document.documentElement.style.setProperty('--od-mix', `${progress * 100}%`);
    updateKillsCounter(); closeDev();
}

function closeDev() {
    document.getElementById('dev-overlay').classList.remove('show');
    refreshModPanels();
    if (gameHasStarted) draw();
}

function forceOverdrive() { closeDev(); triggerOverdrive(); }

function buildDevPanel(color, containerId) {
    let html = ''; let pieces = ['p', 'n', 'b', 'r', 'q', 'k'];
    pieces.forEach(pc => {
        html += `<div style="margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">`;
        html += `<span style="font-size:1.5rem; text-shadow:0 0 5px var(--${color === 'W' ? 'white' : 'black'});" class="piece ${color}">${glyphs[color === 'W' ? pc.toUpperCase() : pc]}</span>`;
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

        // Applica poteri istantanei o globali se testati da Dev
        if (modName === 'Energy Shield') {
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c] && grid[r][c].toLowerCase() === 'p' && (grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === color) pawnShields.push({ r, c });
        }
    }
}

function refreshModPanels() {
    ['W', 'B'].forEach(color => {
        let listId = color === 'W' ? 'w-mods-list' : 'b-mods-list';
        let list = document.getElementById(listId);
        if (!list) return;
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
        btn.onclick = () => { overlay.classList.remove('show'); isAnimating = false; callback(p); };
        container.appendChild(btn);
    });
    overlay.classList.add('show');
}

function skipTurn(isRemote = false) {
    if (!ghostRiderActive) return;
    ghostRiderActive = null;
    document.getElementById('skip-turn-btn').style.display = 'none';
    turno = (turno === 'W') ? 'B' : 'W';
    draw();
    checkGameState();

    if (isMultiplayer && !isRemote) {
        socket.emit('sendMove', { roomCode: roomCode, moveData: { isSkip: true } });
    }
    if (opponentMode === 'AI' && turno === 'B' && !gameOver && !isMultiplayer) {
        setTimeout(playAI, 800);
    }
}

// ==========================================
// 5. MOTORE DI GIOCO (START & INIZIALIZZAZIONE)
// ==========================================
function startGame(classic = false, fromMultiplayer = false) {
    if (isMultiplayer && !fromMultiplayer && !gameHasStarted) return;

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-ui').classList.add('show');
    document.body.classList.remove('settings-open');
    document.body.classList.add('game-started');
    tryStartMusic();

    if (!gameHasStarted) {
        isClassicMode = classic;
        init();
        gameHasStarted = true;

        let mainBtn = document.getElementById('main-play-btn');
        if (mainBtn) mainBtn.innerText = "RESUME";

        let cbtn = document.getElementById('classic-play-btn');
        if (cbtn) cbtn.style.display = 'none';

        let resignRow = document.getElementById('resign-row');
        if (resignRow) resignRow.style.display = 'flex';

        if (isClassicMode) {
            document.body.classList.add('classic-mode');
            document.querySelector('.header').innerText = "NEON CHESS: CLASSIC";
            let kc = document.getElementById('kills-counter');
            if (kc) {
                kc.innerText = "CLASSIC MODE ACTIVE";
                kc.className = 'kills-counter impatience-1';
                kc.style.borderColor = 'var(--t1)'; kc.style.color = 'var(--t1)'; kc.style.textShadow = '0 0 10px var(--t1)';
            }
        }
    }
    lastTime = Date.now();
}

function startClock() {
    lastTime = Date.now();
    timerInterval = setInterval(() => {
        if (gameOver || isAnimating || document.getElementById('start-screen').style.display !== 'none') { lastTime = Date.now(); return; }
        let now = Date.now(); let delta = now - lastTime; lastTime = now;
        if (turno === 'W') { timeLeftW -= delta; if (timeLeftW <= 0) { timeLeftW = 0; triggerEnd('B', 'TIME OUT', `Tempo scaduto per il Team White.`); } }
        else { timeLeftB -= delta; if (timeLeftB <= 0) { timeLeftB = 0; triggerEnd('W', 'TIME OUT', `Tempo scaduto per il Team Black.`); } }
        updateTimersUI();
    }, 50);
}

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
    halfMoveClock = 0; positionHistory = {}; currentMoveSequence = ""; gameOver = false;
    originalQueens = ["0,3", "7,3"]; nextThresholdIndex = 0;
    classMods = { 'W': {}, 'B': {} }; deadPieces = { 'W': [], 'B': [] };

    recentModdedClasses = []; promotedPieces = []; clonedPieces = []; recentSpawns = [];
    zombiePawns = []; ghostRiderActive = null;
    pawnShields = []; stunnedPieces = []; usedBonusLives = [];

    document.getElementById('skip-turn-btn').style.display = 'none';

    initialPositions = {};
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c]) initialPositions[`${r},${c}`] = grid[r][c];

    document.body.classList.remove('mod-level-1', 'mod-level-2', 'mod-level-3', 'overdrive', 'human-vs-human');
    let wL = document.getElementById('w-mods-list'), bL = document.getElementById('b-mods-list');
    if (wL) wL.innerHTML = ''; if (bL) bL.innerHTML = '';

    let bgm = document.getElementById('bg-music');
    if (bgm) { bgm.playbackRate = 1.0; bgm.preservesPitch = true; }

    timeLeftW = timeLimitMinutes * 60 * 1000; timeLeftB = timeLimitMinutes * 60 * 1000;
    lastTime = Date.now();
    clearInterval(timerInterval); if (timerEnabled) startClock();

    updateScores(); updateTimersUI(); updateKillsCounter(); draw();
}

// ==========================================
// 6. LOGICA DELLA SCACCHIERA E MOSSE
// ==========================================
function draw() {
    let b = document.getElementById('board');
    if (!b) return;
    b.innerHTML = '';

    let playerToCheck = turno;
    let chK = findKing(playerToCheck); let inCheck = isInCheck(playerToCheck);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let cl = `cell ${(r + c) % 2 == 0 ? 'l' : 'd'}`;
            if (selected && selected.r == r && selected.c == c) cl += ' sel';
            if (ghostRiderActive && ghostRiderActive.r == r && ghostRiderActive.c == c) cl += ' sel';
            if (lastMove && lastMove.to.r == r && lastMove.to.c == c) cl += ' last-move';
            if (hints && hints.find(h => h.r == r && h.c == c)) cl += grid[r][c] ? ' h-c' : ' h-m';
            if (inCheck && chK && chK.r === r && chK.c === c) cl += ' check';

            let pHTML = '';
            if (grid[r][c]) {
                let color = grid[r][c] == grid[r][c].toUpperCase() ? 'W' : 'B'; let pc = grid[r][c].toLowerCase();
                let mod = getMod(r, c, color, pc); let aClass = mod ? `aura-${mod.t}` : '';

                let animClass = '';
                if (recentModdedClasses && recentModdedClasses.some(x => x.color === color && x.cl === pc && !isPromoted(r, c))) animClass = 'mod-receive-anim';

                let isPromo = isPromoted(r, c);
                let isClone = clonedPieces && clonedPieces.some(s => s.r === r && s.c === c);

                // --- INDICATORI SCUDO E STORDIMENTO ---
                if (pawnShields.some(s => s.r === r && s.c === c)) animClass += ' shielded';
                if (stunnedPieces.some(s => s.r === r && s.c === c)) aClass += ' stunned';

                // --- CONTROLLO AURA PACIFISTA ---
                let isPacified = false;
                let enemyColor = color === 'W' ? 'B' : 'W';
                if (pc !== 'k') {
                    [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(d => {
                        let nr = r + d[0], nc = c + d[1];
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            let adj = grid[nr][nc];
                            if (adj && adj.toLowerCase() === 'n' && (adj === adj.toUpperCase() ? 'W' : 'B') === enemyColor && getMod(nr, nc, enemyColor, 'n')?.n === 'Pacifist') isPacified = true;
                        }
                    });
                }
                if (isPacified) animClass += ' pacified';

                let spawnClass = (gfxLevel !== 'LO' && recentSpawns && (recentSpawns.some(s => s.r === r && s.c === c) || isPromo)) ? 'spawn-anim' : '';
                let cloneTag = isPromo ? '<span class="clone-tag" style="color:var(--t2); border-color:var(--t2);">[P]</span>' : (isClone ? '<span class="clone-tag">[C]</span>' : '');

                pHTML = `<div class="piece ${color} ${aClass} ${spawnClass} ${animClass}">${glyphs[grid[r][c]]}${cloneTag}</div>`;
            }
            b.innerHTML += `<div class="${cl}" onclick="clickCell(${r},${c})">${pHTML}</div>`;
        }
    }
}

function getMovesPseudoLegal(r, c, color, testGrid = grid, ignoreMods = false, isAttackCheck = false) {
    let p = testGrid[r][c]; if (!p) return []; let cl = p.toLowerCase(); let mods = ignoreMods || isPromoted(r, c) ? null : classMods[color][cl]; let m = []; let dir = color == 'W' ? -1 : 1;
    let enemyColor = color === 'W' ? 'B' : 'W';

    // --- Controllo STUN e PACIFY AURA ---
    if (!ignoreMods) {
        if (stunnedPieces.some(s => s.r === r && s.c === c)) return [];

        if (cl !== 'k') {
            let isPacified = false;
            [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(d => {
                let nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    let adj = testGrid[nr][nc];
                    if (adj && adj.toLowerCase() === 'n' && (adj === adj.toUpperCase() ? 'W' : 'B') === enemyColor && getMod(nr, nc, enemyColor, 'n')?.n === 'Pacifist') isPacified = true;
                }
            });
            if (isPacified) return [];
        }
    }

    if (cl == 'p') {
        let blockedByAlly = testGrid[r + dir]?.[c] && (testGrid[r + dir][c] === testGrid[r + dir][c].toUpperCase() ? 'W' : 'B') === color;
        let blockedByEnemy = testGrid[r + dir]?.[c] && (testGrid[r + dir][c] === testGrid[r + dir][c].toUpperCase() ? 'W' : 'B') !== color;

        if (!testGrid[r + dir]?.[c]) {
            m.push({ r: r + dir, c: c });
            if ((color == 'W' && r == 6) || (color == 'B' && r == 1)) {
                if (!testGrid[r + 2 * dir]?.[c]) m.push({ r: r + 2 * dir, c: c });
            }
        } else if (mods?.n === 'Hurdle' && blockedByEnemy) {
            // Hurdle: Salta il nemico se la cella dopo è libera
            if (r + 2 * dir >= 0 && r + 2 * dir < 8 && !testGrid[r + 2 * dir]?.[c]) {
                m.push({ r: r + 2 * dir, c: c });
            }
        }

        if (testGrid[r + dir]?.[c - 1] && (testGrid[r + dir][c - 1] == testGrid[r + dir][c - 1].toUpperCase() ? 'W' : 'B') != color) m.push({ r: r + dir, c: c - 1 });
        if (testGrid[r + dir]?.[c + 1] && (testGrid[r + dir][c + 1] == testGrid[r + dir][c + 1].toUpperCase() ? 'W' : 'B') != color) m.push({ r: r + dir, c: c + 1 });
        if (lastMove && lastMove.piece.toLowerCase() === 'p' && Math.abs(lastMove.to.r - lastMove.from.r) === 2 && lastMove.to.r === r && Math.abs(lastMove.to.c - c) === 1) m.push({ r: r + dir, c: lastMove.to.c, isEnPassant: true });

        if (mods?.n == 'King Soul') [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => { let nr = r + d[0], nc = c + d[1]; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !testGrid[nr][nc]) m.push({ r: nr, c: nc }); });
        if (mods?.n == 'Front Bite' && testGrid[r + dir]?.[c] && (testGrid[r + dir][c] == testGrid[r + dir][c].toUpperCase() ? 'W' : 'B') != color) m.push({ r: r + dir, c: c });

        if (mods?.n === 'Guardian' && !isAttackCheck) {
            // Cerca alleati minacciati per saltare davanti
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    let ally = testGrid[i][j];
                    if (ally && (ally === ally.toUpperCase() ? 'W' : 'B') === color) {
                        if (isUnderAttack(i, j, enemyColor, testGrid)) {
                            [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => {
                                let nr = i + d[0], nc = j + d[1];
                                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !testGrid[nr][nc]) m.push({ r: nr, c: nc });
                            });
                        }
                    }
                }
            }
        }
    }

    // --- Controllo Cavalleria Aggiuntiva ---
    let isNextToCavalry = false;
    if (!isAttackCheck) {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => {
            let nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                let adj = testGrid[nr][nc];
                if (adj && adj.toLowerCase() === 'n' && (adj === adj.toUpperCase() ? 'W' : 'B') === color && getMod(nr, nc, color, 'n')?.n === 'Cavalry') isNextToCavalry = true;
            }
        });
    }

    if (cl == 'n' || isNextToCavalry || classMods[color]['n']?.n === 'Cavalry Charge') {
        [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(d => {
            let nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (!testGrid[nr][nc] || (testGrid[nr][nc] == testGrid[nr][nc].toUpperCase() ? 'W' : 'B') != color)) m.push({ r: nr, c: nc });
        });
        if (cl == 'n' && mods?.n == 'L-Slide' && !isAttackCheck) {
            [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]].forEach(d => {
                let nr = r + d[0], nc = c + d[1];
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (!testGrid[nr][nc] || (testGrid[nr][nc] == testGrid[nr][nc].toUpperCase() ? 'W' : 'B') != color)) m.push({ r: nr, c: nc });
            });
        }
        if (cl == 'n' && mods?.n == 'Mount' && deadPieces[color].length > 0) {
            let ld = deadPieces[color][deadPieces[color].length - 1].toLowerCase();
            if (ld !== 'n' && ld !== 'k') {
                testGrid[r][c] = color === 'W' ? ld.toUpperCase() : ld;
                m.push(...getMovesPseudoLegal(r, c, color, testGrid, true, isAttackCheck));
                testGrid[r][c] = p;
            }
        }
    }

    let dirs = [];
    if (cl == 'b' || cl == 'q' || (cl == 'k' && mods?.n == 'Emperor')) dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (cl == 'r' || cl == 'q' || (cl == 'k' && mods?.n == 'Emperor')) dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

    dirs.forEach(d_orig => {
        let d = [...d_orig]; let nr = r, nc = c; let bounced = false; let bouncePoint = null;
        while (true) {
            nr += d[0]; nc += d[1];
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) {
                if (cl == 'b' && mods?.n == 'Wall Bounce' && !bounced) {
                    nr -= d[0]; nc -= d[1]; bouncePoint = { r: nr, c: nc };
                    if (nr + d[0] < 0 || nr + d[0] > 7) d[0] *= -1;
                    if (nc + d[1] < 0 || nc + d[1] > 7) d[1] *= -1;
                    bounced = true; continue;
                } else break;
            }
            let t = testGrid[nr][nc];
            let moveObj = { r: nr, c: nc }; if (bouncePoint) moveObj.bouncePoint = bouncePoint;

            if (t) {
                let isE = (t == t.toUpperCase() ? 'W' : 'B') != color;
                if (isE) { m.push(moveObj); if (cl === 'q' && mods?.n === 'Annihilation') continue; }
                else if (cl === 'r' && mods?.n === 'Ally Vault') { continue; } // Scavalca alleato
                if (mods?.n === 'Vault' && !isE) continue;
                if (cl === 'b' && mods?.n === 'Phasing') continue; // Passa attraverso tutto
                if (cl !== 'q' || mods?.n !== 'Annihilation') break;
            } else m.push(moveObj);
        }
    });

    if (cl == 'k' && mods?.n !== 'Emperor') {
        [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => { let nr = r + d[0], nc = c + d[1]; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (!testGrid[nr][nc] || (testGrid[nr][nc] == testGrid[nr][nc].toUpperCase() ? 'W' : 'B') != color)) m.push({ r: nr, c: nc }); });
        if (mods?.n == 'Row Warp') for (let j = 0; j < 8; j++) if (!testGrid[r][j]) m.push({ r: r, c: j });
        if (mods?.n == 'The Betrayal') for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { let t = testGrid[i][j]; if (t && (t === t.toUpperCase() ? 'W' : 'B') !== color && t.toLowerCase() !== 'k') m.push({ r: i, c: j }); }
    }
    if (cl == 'q' && mods?.n == 'Knight Soul') [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(d => { let nr = r + d[0], nc = c + d[1]; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (!testGrid[nr][nc] || (testGrid[nr][nc] == testGrid[nr][nc].toUpperCase() ? 'W' : 'B') != color)) m.push({ r: nr, c: nc }); });
    if (cl == 'b' && mods?.n == 'Side Step') { if (c > 0 && (!testGrid[r][c - 1] || (testGrid[r][c - 1] == testGrid[r][c - 1].toUpperCase() ? 'W' : 'B') != color)) m.push({ r: r, c: c - 1 }); if (c < 7 && (!testGrid[r][c + 1] || (testGrid[r][c + 1] == testGrid[r][c + 1].toUpperCase() ? 'W' : 'B') != color)) m.push({ r: r, c: c + 1 }); }
    if (cl === 'r' && mods?.n === 'Homecoming') { let iks = Object.keys(initialPositions).filter(k => initialPositions[k] === p && !testGrid[parseInt(k.split(',')[0])][parseInt(k.split(',')[1])]); iks.forEach(ik => { m.push({ r: parseInt(ik.split(',')[0]), c: parseInt(ik.split(',')[1]) }); }); }

    return m;
}

function getLegalMoves(r, c) {
    let pColor = grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B'; let enemyColor = pColor === 'W' ? 'B' : 'W'; let p = grid[r][c];
    if (p.toLowerCase() !== 'k') { for (let i = 0; i < 8; i++) { if (grid[r][i] && grid[r][i].toLowerCase() === 'r' && (grid[r][i] === grid[r][i].toUpperCase() ? 'W' : 'B') === enemyColor && getMod(r, i, enemyColor, 'r')?.n === 'Gravity Well') return []; if (grid[i][c] && grid[i][c].toLowerCase() === 'r' && (grid[i][c] === grid[i][c].toUpperCase() ? 'W' : 'B') === enemyColor && getMod(i, c, enemyColor, 'r')?.n === 'Gravity Well') return []; } }

    let legalMoves = [];
    for (let m of getMovesPseudoLegal(r, c, pColor, grid, false)) {
        if (grid[m.r][m.c] && grid[m.r][m.c].toLowerCase() === 'k') continue;
        let backup = grid.map(row => [...row]); simulateMoveDestruction(backup, r, c, m.r, m.c, pColor, m);
        if (!isInCheck(pColor, backup)) legalMoves.push(m);
    }

    if (p.toLowerCase() === 'k' && !isInCheck(pColor)) {
        let row = pColor === 'W' ? 7 : 0;
        let expectedRook = pColor === 'W' ? 'R' : 'r';

        if (castlingRights[pColor].k && r === row && c === 4) {
            if (castlingRights[pColor].r8 && grid[row][7] === expectedRook && !grid[row][5] && !grid[row][6] && !isUnderAttack(row, 5, enemyColor) && !isUnderAttack(row, 6, enemyColor)) {
                legalMoves.push({ r: row, c: 6, isCastle: 'K' });
            }
            if (castlingRights[pColor].r1 && grid[row][0] === expectedRook && !grid[row][1] && !grid[row][2] && !grid[row][3] && !isUnderAttack(row, 2, enemyColor) && !isUnderAttack(row, 3, enemyColor)) {
                legalMoves.push({ r: row, c: 2, isCastle: 'Q' });
            }
        }
    }
    return legalMoves;
}

function animateMovement(fr, fc, tr, tc, pColor, callback, bouncePoint = null) {
    let board = document.getElementById('board');
    let startCell = board.children[fr * 8 + fc]; let endCell = board.children[tr * 8 + tc];
    if (!startCell || !endCell) { callback(); return; }
    let piece = startCell.querySelector('.piece'); if (!piece) { callback(); return; }

    isAnimating = true;
    let startRect = piece.getBoundingClientRect(); let endRect = endCell.getBoundingClientRect();
    let dX = (endRect.left + endRect.width / 2) - (startRect.left + startRect.width / 2);
    let dY = (endRect.top + endRect.height / 2) - (startRect.top + startRect.height / 2);

    if (document.body.getAttribute('data-team') === 'B') { dX = -dX; dY = -dY; }

    let glowColor = pColor === 'W' ? 'var(--t2)' : 'var(--t4)';
    if (gfxLevel !== 'LO') piece.style.filter = `drop-shadow(0 0 15px ${glowColor}) brightness(1.5)`;
    piece.style.zIndex = "100";

    piece.style.transition = 'none';
    piece.style.transform = `translate(0px, 0px) scale(1) rotate(var(--rot, 0deg))`;
    void piece.offsetWidth;

    if (bouncePoint) {
        let bounceCell = board.children[bouncePoint.r * 8 + bouncePoint.c];
        if (bounceCell) {
            let bounceRect = bounceCell.getBoundingClientRect();
            let bX = (bounceRect.left + bounceRect.width / 2) - (startRect.left + startRect.width / 2);
            let bY = (bounceRect.top + bounceRect.height / 2) - (startRect.top + startRect.height / 2);

            if (document.body.getAttribute('data-team') === 'B') { bX = -bX; bY = -bY; }

            piece.style.transition = 'transform 0.2s linear';
            piece.style.transform = `translate(${bX}px, ${bY}px) scale(1.3) rotate(var(--rot, 0deg))`;

            setTimeout(() => {
                let wrapper = document.getElementById('main-board-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('board-elastic-anim');
                    void wrapper.offsetWidth;
                    wrapper.classList.add('board-elastic-anim');
                    setTimeout(() => wrapper.classList.remove('board-elastic-anim'), 500);
                }
                piece.style.transition = 'transform 0.2s linear';
                piece.style.transform = `translate(${dX}px, ${dY}px) scale(1.3) rotate(var(--rot, 0deg))`;
                setTimeout(() => { isAnimating = false; callback(); }, 200);
            }, 200);
            return;
        }
    }

    piece.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    if (gfxLevel !== 'LO') piece.style.transition += ', filter 0.35s ease';
    piece.style.transform = `translate(${dX}px, ${dY}px) scale(1.3) rotate(var(--rot, 0deg))`;
    setTimeout(() => { isAnimating = false; callback(); }, 350);
}

function executeMove(fr, fc, tr, tc, special = null, isRemote = false, remotePromoPiece = null, remoteSeed = null) {
    let p = grid[fr][fc]; let pColor = p === p.toUpperCase() ? 'W' : 'B'; let enemyColor = pColor === 'W' ? 'B' : 'W';
    let target = grid[tr][tc]; let cl = p.toLowerCase(); let mod = getMod(fr, fc, pColor, cl);
    let pendingAnims = []; let isAttackerDead = false;
    let diedThisTurn = [];

    let isCapture = target || (special && special.isEnPassant);
    if (isCapture) playMoveSound('capture'); else playMoveSound('move');

    if (cl === 'b' && mod?.n === 'Wall Bounce') {
        if (Math.abs(tr - fr) !== Math.abs(tc - fc)) {
            let wrapper = document.getElementById('main-board-wrapper');
            if (wrapper) {
                wrapper.classList.remove('board-elastic-anim');
                void wrapper.offsetWidth;
                wrapper.classList.add('board-elastic-anim');
                setTimeout(() => wrapper.classList.remove('board-elastic-anim'), 500);
            }
        }
    }

    currentMoveSequence += (currentMoveSequence ? "-" : "") + fr + "" + fc + "" + tr + "" + tc;

    let wasPromotedIdx = promotedPieces.findIndex(pos => pos.r === fr && pos.c === fc);
    let wasPromoted = wasPromotedIdx !== -1;
    if (wasPromoted) promotedPieces.splice(wasPromotedIdx, 1);

    let wasClonedIdx = clonedPieces.findIndex(pos => pos.r === fr && pos.c === fc);
    let wasCloned = wasClonedIdx !== -1;
    if (wasCloned) clonedPieces.splice(wasClonedIdx, 1);

    let wasZombieIdx = zombiePawns.findIndex(pos => pos.r === fr && pos.c === fc);
    let wasZombie = wasZombieIdx !== -1;
    if (wasZombie) zombiePawns.splice(wasZombieIdx, 1);

    clonedPieces = clonedPieces.filter(pos => pos.r !== tr || pos.c !== tc);
    promotedPieces = promotedPieces.filter(pos => pos.r !== tr || pos.c !== tc);
    if (special && special.isEnPassant) { clonedPieces = clonedPieces.filter(pos => pos.r !== fr || pos.c !== tc); promotedPieces = promotedPieces.filter(pos => pos.r !== fr || pos.c !== tc); }

    if (cl === 'q' && mod?.n === 'Annihilation') {
        let dr = Math.sign(tr - fr), dc = Math.sign(tc - fc); let cr = fr + dr, cc = fc + dc;
        while (cr !== tr || cc !== tc) {
            if (grid[cr][cc] && grid[cr][cc].toLowerCase() !== 'k') {
                let passedTarget = grid[cr][cc];
                let ptMod = getMod(cr, cc, enemyColor, passedTarget.toLowerCase());
                grid[cr][cc] = '';

                if (passedTarget.toLowerCase() === 'r' && ptMod?.n === 'Voodoo Death' && cl !== 'k') {
                    let attackerRooks = [];
                    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (grid[i][j] && grid[i][j].toLowerCase() === 'r' && (grid[i][j] === grid[i][j].toUpperCase() ? 'W' : 'B') === pColor) attackerRooks.push({ r: i, c: j });
                    if (attackerRooks.length > 0) {
                        let sacrificedRook = attackerRooks[Math.floor(getGameRandom() * attackerRooks.length)];
                        if (sacrificedRook.r === fr && sacrificedRook.c === fc) isAttackerDead = true;
                        else {
                            let rPiece = grid[sacrificedRook.r][sacrificedRook.c];
                            grid[sacrificedRook.r][sacrificedRook.c] = '';
                            let rookZombieIdx = zombiePawns.findIndex(pos => pos.r === sacrificedRook.r && pos.c === sacrificedRook.c);
                            if (rookZombieIdx !== -1) zombiePawns.splice(rookZombieIdx, 1);
                            diedThisTurn.push({ color: pColor, piece: rPiece, r: sacrificedRook.r, c: sacrificedRook.c, isZombie: rookZombieIdx !== -1 });
                            pendingAnims.push({ type: 'capture', r: sacrificedRook.r, c: sacrificedRook.c, color: pColor });
                        }
                    } else isAttackerDead = true;
                }

                let ezIdx = zombiePawns.findIndex(pos => pos.r === cr && pos.c === cc);
                if (ezIdx !== -1) zombiePawns.splice(ezIdx, 1);
                diedThisTurn.push({ color: enemyColor, piece: passedTarget, r: cr, c: cc, isZombie: ezIdx !== -1 });
                pendingAnims.push({ type: 'capture', r: cr, c: cc, color: enemyColor });
            }
            cr += dr; cc += dc;
        }
    }

    // --- INIZIO BLOCCO TARGET CORRETTO ---
    if (target) {
        let targetMod = getMod(tr, tc, enemyColor, target.toLowerCase());
        let targetWasZombieIdx = zombiePawns.findIndex(pos => pos.r === tr && pos.c === tc);
        let targetIsZombie = targetWasZombieIdx !== -1;
        if (targetIsZombie) zombiePawns.splice(targetWasZombieIdx, 1);

        // --- ENERGY SHIELD (Rimbalzo all'indietro) ---
        let shieldIdx = pawnShields.findIndex(s => s.r === tr && s.c === tc);
        if (target.toLowerCase() === 'p' && targetMod?.n === 'Energy Shield' && shieldIdx !== -1) {
            pawnShields.splice(shieldIdx, 1); // Lo scudo si rompe
            if (targetIsZombie) zombiePawns.push({ r: tr, c: tc }); // Ripristina lo stato zombie per evitare bug

            // Calcola la direzione dell'attacco
            let dr = Math.sign(tr - fr);
            let dc = Math.sign(tc - fc);

            // Respinge indietro di una casella
            let bounceR = tr - dr;
            let bounceC = tc - dc;

            // Se la casella indietro è fuori dalla mappa o occupata, torna alla casella di partenza
            if (bounceR < 0 || bounceR > 7 || bounceC < 0 || bounceC > 7 || grid[bounceR][bounceC] || (dr === 0 && dc === 0)) {
                bounceR = fr;
                bounceC = fc;
            }

            // L'attaccante finisce nella nuova casella
            tr = bounceR;
            tc = bounceC;

            target = null; // Il pedone bersaglio NON muore
            isAttackerDead = false; // L'attaccante NON muore
        }
        // --- VOODOO DEATH ---
        else if (target.toLowerCase() === 'r' && targetMod?.n === 'Voodoo Death') {
            let attackerRooks = [];
            for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
                let piece = grid[i][j];
                if (piece && piece.toLowerCase() === 'r' && (piece === piece.toUpperCase() ? 'W' : 'B') === pColor && !(i === fr && j === fc)) {
                    attackerRooks.push({ r: i, c: j });
                }
            }
            if (cl === 'r') attackerRooks.push({ r: fr, c: fc });

            if (attackerRooks.length > 0) {
                let sacrificedRook = attackerRooks[Math.floor(getGameRandom() * attackerRooks.length)];
                if (sacrificedRook.r === fr && sacrificedRook.c === fc) {
                    isAttackerDead = true;
                } else {
                    let rPiece = grid[sacrificedRook.r][sacrificedRook.c];
                    grid[sacrificedRook.r][sacrificedRook.c] = '';
                    let rookZombieIdx = zombiePawns.findIndex(pos => pos.r === sacrificedRook.r && pos.c === sacrificedRook.c);
                    if (rookZombieIdx !== -1) zombiePawns.splice(rookZombieIdx, 1);
                    diedThisTurn.push({ color: pColor, piece: rPiece, r: sacrificedRook.r, c: sacrificedRook.c, isZombie: rookZombieIdx !== -1 });
                    pendingAnims.push({ type: 'capture', r: sacrificedRook.r, c: sacrificedRook.c, color: pColor });
                }
            } else if (cl !== 'k') {
                isAttackerDead = true;
            }
        }
        // --- PHOENIX ROOK ---
        else if (target.toLowerCase() === 'r' && targetMod?.n === 'Phoenix Rook') {
            let homeRank = enemyColor === 'W' ? 7 : 0;
            let homeCol = tc < 4 ? 0 : 7;
            let homeTarget = grid[homeRank][homeCol];
            if (homeTarget && homeTarget.toLowerCase() !== 'k') {
                diedThisTurn.push({ color: homeTarget === homeTarget.toUpperCase() ? 'W' : 'B', piece: homeTarget, r: homeRank, c: homeCol, isZombie: false });
                pendingAnims.push({ type: 'capture', r: homeRank, c: homeCol, color: enemyColor });
            }
            grid[homeRank][homeCol] = enemyColor === 'W' ? 'R' : 'r';
            recentSpawns.push({ r: homeRank, c: homeCol });
            target = null; // Annulla kill per stats, si è salvato
        }

        // REGISTRAZIONE UCCISIONE NORMALE
        if (target) {
            diedThisTurn.push({ color: enemyColor, piece: target, r: tr, c: tc, isZombie: targetIsZombie });
            pendingAnims.push({ type: 'capture', r: tr, c: tc, color: enemyColor });
        }
    }
    // --- FINE BLOCCO TARGET CORRETTO ---

// CAVALRY CHARGE (Vita Bonus Globale)
let globalMod = classMods[enemyColor]['n']?.n === 'Cavalry Charge';
if (globalMod && target && target.toLowerCase() !== 'k' && target.toLowerCase() !== 'n') {
    let pieceID = tr + "," + tc; // id temporaneo
    if (!usedBonusLives.includes(pieceID)) {
        usedBonusLives.push(pieceID);
        // Teletrasporto per salvarsi
        let empties = [];
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (!grid[i][j]) empties.push({ r: i, c: j });
        if (empties.length > 0) {
            let spot = empties[Math.floor(getGameRandom() * empties.length)];
            grid[spot.r][spot.c] = target;
            recentSpawns.push(spot);
            diedThisTurn = diedThisTurn.filter(d => d.r !== tr || d.c !== tc); // Rimuove dalla morte
        }
    }
}

if (isAttackerDead) {
    diedThisTurn.push({ color: pColor, piece: p, r: fr, c: fc, isZombie: wasZombie });
    pendingAnims.push({ type: 'capture', r: tr, c: tc, color: pColor });
    let pIdx = originalQueens.indexOf(fr + "," + fc); if (pIdx !== -1) originalQueens.splice(pIdx, 1);
}

if (special && special.isEnPassant) {
    grid[fr][tc] = '';
    let epZombieIdx = zombiePawns.findIndex(pos => pos.r === fr && pos.c === tc);
    let epZombie = epZombieIdx !== -1;
    if (epZombie) zombiePawns.splice(epZombieIdx, 1);
    diedThisTurn.push({ color: enemyColor, piece: pColor === 'W' ? 'p' : 'P', r: fr, c: tc, isZombie: epZombie });
    pendingAnims.push({ type: 'capture', r: fr, c: tc, color: enemyColor });
}

if (special && special.isCastle) { if (special.isCastle === 'K') { grid[fr][tc - 1] = grid[fr][tc + 1]; grid[fr][tc + 1] = ''; } if (special.isCastle === 'Q') { grid[fr][tc + 1] = grid[fr][tc - 2]; grid[fr][tc - 2] = ''; } }

grid[tr][tc] = isAttackerDead ? '' : p; grid[fr][fc] = '';

let needsPromotion = false;

if (!isAttackerDead) {
    if (target && target.toLowerCase() === 'q' && getMod(tr, tc, enemyColor, 'q')?.n === 'Immortal' && originalQueens.includes(tr + "," + tc)) { let br = enemyColor === 'W' ? 7 : 0; if (!grid[br][3]) { grid[br][3] = target; let idx = originalQueens.indexOf(tr + "," + tc); if (idx !== -1) originalQueens[idx] = br + ",3"; } else { let idx = originalQueens.indexOf(tr + "," + tc); if (idx !== -1) originalQueens.splice(idx, 1); } }
    let pIdx = originalQueens.indexOf(fr + "," + fc); if (pIdx !== -1) originalQueens[pIdx] = tr + "," + tc;

    if (cl === 'p') {
        let promoRank = (mod?.n === 'Vanguard') ? (pColor === 'W' ? 4 : 3) : (pColor === 'W' ? 0 : 7);
        if ((pColor === 'W' && tr <= promoRank) || (pColor === 'B' && tr >= promoRank)) needsPromotion = true;
    }

    // TRAMPLE (Cavallo)
    if (cl === 'n' && mod?.n === 'Trample') {
        let dr = tr - fr, dc = tc - fc;
        let er1 = fr + dr, ec1 = fc;
        let er2 = fr, ec2 = fc + dc;
        [{ r: er1, c: ec1 }, { r: er2, c: ec2 }].forEach(pos => {
            if (grid[pos.r]?.[pos.c] && grid[pos.r][pos.c].toLowerCase() !== 'k' && (grid[pos.r][pos.c] === grid[pos.r][pos.c].toUpperCase() ? 'W' : 'B') !== pColor) {
                diedThisTurn.push({ color: enemyColor, piece: grid[pos.r][pos.c], r: pos.r, c: pos.c, isZombie: false });
                grid[pos.r][pos.c] = ''; pendingAnims.push({ type: 'capture', r: pos.r, c: pos.c, color: enemyColor });
            }
        });
    }

    // JUGGERNAUT (Torre)
    if (cl === 'r' && mod?.n === 'Juggernaut') {
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            let nr = tr + i, nc = tc + j;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && grid[nr][nc] && grid[nr][nc].toLowerCase() !== 'k' && !(nr === tr && nc === tc)) {
                diedThisTurn.push({ color: (grid[nr][nc] === grid[nr][nc].toUpperCase() ? 'W' : 'B'), piece: grid[nr][nc], r: nr, c: nc, isZombie: false });
                grid[nr][nc] = ''; pendingAnims.push({ type: 'capture', r: nr, c: nc, color: enemyColor });
            }
        }
    }
}

let finishMove = (promoPiece) => {
    let startingSeed = gameSeed;
    if (isRemote && remoteSeed !== null) gameSeed = remoteSeed;

    if (needsPromotion && promoPiece) { grid[tr][tc] = pColor === 'W' ? promoPiece.toUpperCase() : promoPiece.toLowerCase(); recentSpawns.push({ r: tr, c: tc }); promotedPieces.push({ r: tr, c: tc }); cl = promoPiece.toLowerCase(); mod = getMod(tr, tc, pColor, cl); }
    else if (wasPromoted && !isAttackerDead) promotedPieces.push({ r: tr, c: tc });

    if (wasCloned && !isAttackerDead) clonedPieces.push({ r: tr, c: tc });
    if (wasZombie && !isAttackerDead) zombiePawns.push({ r: tr, c: tc });

    if (!isAttackerDead) {
        if (cl === 'n' && mod?.n === 'Explosive') {
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue; let nr = tr + i, nc = tc + j;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && grid[nr][nc] && (grid[nr][nc] === grid[nr][nc].toUpperCase() ? 'W' : 'B') !== pColor && grid[nr][nc].toLowerCase() !== 'k') {
                    let tExplode = grid[nr][nc]; grid[nr][nc] = '';
                    let exZombieIdx = zombiePawns.findIndex(pos => pos.r === nr && pos.c === nc);
                    if (exZombieIdx !== -1) zombiePawns.splice(exZombieIdx, 1);
                    diedThisTurn.push({ color: enemyColor, piece: tExplode, r: nr, c: nc, isZombie: exZombieIdx !== -1 });
                    pendingAnims.push({ type: 'capture', r: nr, c: nc, color: enemyColor });
                }
            }
        }
        if (cl === 'b' && mod?.n === 'Chain Reaction') {
            let dr = Math.sign(tr - fr), dc = Math.sign(tc - fc); let s1r = tr + dr, s1c = tc;
            if (s1r >= 0 && s1r < 8 && s1c >= 0 && s1c < 8) {
                let t1 = grid[s1r][s1c];
                if (t1 && t1.toLowerCase() !== 'k' && (t1 === t1.toUpperCase() ? 'W' : 'B') !== pColor) {
                    grid[s1r][s1c] = ''; let exZ = zombiePawns.findIndex(pos => pos.r === s1r && pos.c === s1c); if (exZ !== -1) zombiePawns.splice(exZ, 1);
                    diedThisTurn.push({ color: enemyColor, piece: t1, r: s1r, c: s1c, isZombie: exZ !== -1 }); pendingAnims.push({ type: 'capture', r: s1r, c: s1c, color: enemyColor });
                }
            }
            let s2r = tr, s2c = tc + dc;
            if (s2r >= 0 && s2r < 8 && s2c >= 0 && s2c < 8) {
                let t2 = grid[s2r][s2c];
                if (t2 && t2.toLowerCase() !== 'k' && (t2 === t2.toUpperCase() ? 'W' : 'B') !== pColor) {
                    grid[s2r][s2c] = ''; let exZ = zombiePawns.findIndex(pos => pos.r === s2r && pos.c === s2c); if (exZ !== -1) zombiePawns.splice(exZ, 1);
                    diedThisTurn.push({ color: enemyColor, piece: t2, r: s2r, c: s2c, isZombie: exZ !== -1 }); pendingAnims.push({ type: 'capture', r: s2r, c: s2c, color: enemyColor });
                }
            }
            let kr = tr + dr, kc = tc + dc;
            while (kr >= 0 && kr < 8 && kc >= 0 && kc < 8) {
                let tK = grid[kr][kc];
                if (tK && tK.toLowerCase() !== 'k' && (tK === tK.toUpperCase() ? 'W' : 'B') !== pColor) {
                    grid[kr][kc] = ''; let exZ = zombiePawns.findIndex(pos => pos.r === kr && pos.c === kc); if (exZ !== -1) zombiePawns.splice(exZ, 1);
                    diedThisTurn.push({ color: enemyColor, piece: tK, r: kr, c: kc, isZombie: exZ !== -1 }); pendingAnims.push({ type: 'capture', r: kr, c: kc, color: enemyColor });
                } kr += dr; kc += dc;
            }
        }
        if (cl === 'b' && mod?.n === 'Wide Beam') {
            let dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
            let cr = fr + dr, cc = fc + dc;
            while (cr !== tr || cc !== tc) {
                let nr1 = cr + dc, nc1 = cc - dr;
                if (nr1 >= 0 && nr1 < 8 && nc1 >= 0 && nc1 < 8 && grid[nr1][nc1] && grid[nr1][nc1].toLowerCase() !== 'k' && (grid[nr1][nc1] === grid[nr1][nc1].toUpperCase() ? 'W' : 'B') !== pColor) {
                    diedThisTurn.push({ color: enemyColor, piece: grid[nr1][nc1], r: nr1, c: nc1, isZombie: false });
                    grid[nr1][nc1] = ''; pendingAnims.push({ type: 'capture', r: nr1, c: nc1, color: enemyColor });
                }
                let nr2 = cr - dc, nc2 = cc + dr;
                if (nr2 >= 0 && nr2 < 8 && nc2 >= 0 && nc2 < 8 && grid[nr2][nc2] && grid[nr2][nc2].toLowerCase() !== 'k' && (grid[nr2][nc2] === grid[nr2][nc2].toUpperCase() ? 'W' : 'B') !== pColor) {
                    diedThisTurn.push({ color: enemyColor, piece: grid[nr2][nc2], r: nr2, c: nc2, isZombie: false });
                    grid[nr2][nc2] = ''; pendingAnims.push({ type: 'capture', r: nr2, c: nc2, color: enemyColor });
                }
                cr += dr; cc += dc;
            }
        }
        if (cl === 'r' && mod?.n === 'Factory' && !wasCloned) {
            if (fr >= 0 && fr < 8 && fc >= 0 && fc < 8 && !grid[fr][fc]) {
                grid[fr][fc] = pColor === 'W' ? 'R' : 'r';
                recentSpawns.push({ r: fr, c: fc });
                clonedPieces.push({ r: fr, c: fc });
            }
        }
    }

    if (classMods[pColor]['p']?.n === 'Mass Infection') {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
            if (grid[i][j] && grid[i][j].toLowerCase() === 'p' && (grid[i][j] === grid[i][j].toUpperCase() ? 'W' : 'B') === pColor) {
                [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(d => {
                    let nr = i + d[0], nc = j + d[1];
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && grid[nr][nc]) {
                        let t = grid[nr][nc];
                        if ((t === t.toUpperCase() ? 'W' : 'B') !== pColor && t.toLowerCase() !== 'k') {
                            if (t.toLowerCase() === 'p') {
                                grid[nr][nc] = pColor === 'W' ? 'P' : 'p';
                                clonedPieces.push({ r: nr, c: nc }); recentSpawns.push({ r: nr, c: nc });
                                let ezIdx = zombiePawns.findIndex(pos => pos.r === nr && pos.c === nc);
                                if (ezIdx !== -1) zombiePawns.splice(ezIdx, 1);
                            } else {
                                let isLastRank = (enemyColor === 'W' && nr === 0) || (enemyColor === 'B' && nr === 7);
                                if (isLastRank) { grid[nr][nc] = enemyColor === 'W' ? 'Q' : 'q'; promotedPieces.push({ r: nr, c: nc }); }
                                else { grid[nr][nc] = enemyColor === 'W' ? 'P' : 'p'; clonedPieces.push({ r: nr, c: nc }); }
                                recentSpawns.push({ r: nr, c: nc });
                            }
                        }
                    }
                });
            }
        }
    }

    updateCastlingRights(p, fr, fc); lastMove = { piece: p, from: { r: fr, c: fc }, to: { r: tr, c: tc } };

    promotedPieces = promotedPieces.filter(pos => grid[pos.r][pos.c] !== '');
    clonedPieces = clonedPieces.filter(pos => grid[pos.r][pos.c] !== '');

    diedThisTurn.forEach(d => {
        if (d.isZombie) return;

        if (classMods[d.color]['p']?.n === 'Necromancy') {
            let empties = [];
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    if (!grid[i][j] && !wouldPawnGiveCheck(i, j, d.color)) {
                        empties.push({ r: i, c: j });
                    }
                }
            }
            if (empties.length > 0) {
                let spot = empties[Math.floor(getGameRandom() * empties.length)];
                grid[spot.r][spot.c] = d.color === 'W' ? 'P' : 'p';
                zombiePawns.push({ r: spot.r, c: spot.c });
                clonedPieces.push({ r: spot.r, c: spot.c });
                recentSpawns.push({ r: spot.r, c: spot.c });
            } else {
                deadPieces[d.color].push(d.piece);
            }
        } else {
            deadPieces[d.color].push(d.piece);
        }
    });

    // STUN RAY (Alfieri stordiscono a fine turno)
    stunnedPieces = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        let pb = grid[i][j];
        if (pb && pb.toLowerCase() === 'b' && getMod(i, j, pb === pb.toUpperCase() ? 'W' : 'B', 'b')?.n === 'Stun Ray') {
            let bColor = pb === pb.toUpperCase() ? 'W' : 'B';
            let moves = getMovesPseudoLegal(i, j, bColor, grid, false, true);
            moves.forEach(m => { if (grid[m.r][m.c]) stunnedPieces.push({ r: m.r, c: m.c }); });
        }
    }

    updateScores(); pendingAnims.forEach(a => { if (a.type === 'capture') createCaptureExplosion(a.r, a.c, a.color); });

    let gaveDrop = false; let overdriveTriggered = false;

    if (!isClassicMode) {
        let currentTotalDead = deadPieces['W'].length + deadPieces['B'].length; let unlockedTierText = ""; let unlockedColor = "";
        while (nextThresholdIndex < thresholds.length && currentTotalDead >= thresholds[nextThresholdIndex]) {
            giveModTo('W'); giveModTo('B');
            if (nextThresholdIndex === 0) { unlockedTierText = "TIER 1 UNLOCKED"; unlockedColor = "mod-c1"; document.body.classList.add('mod-level-1'); }
            else if (nextThresholdIndex === 1) { unlockedTierText = "TIER 2 UNLOCKED"; unlockedColor = "mod-c2"; document.body.classList.add('mod-level-2'); }
            else if (nextThresholdIndex === 2) { unlockedTierText = "EPIC TIER UNLOCKED"; unlockedColor = "mod-c3"; document.body.classList.add('mod-level-3'); }
            nextThresholdIndex++; gaveDrop = true;

            playNextSong();

            if (nextThresholdIndex >= thresholds.length) { triggerOverdrive(); overdriveTriggered = true; unlockedTierText = ""; }
        }
        if (unlockedTierText !== "") showModAlert(unlockedTierText, unlockedColor);
    }

    updateKillsCounter();
    if (target || cl === 'p') halfMoveClock = 0; else halfMoveClock++;

    let key = getPositionKey(); positionHistory[key] = (positionHistory[key] || 0) + 1;

    let isGhostRiderFirstMove = (cl === 'n' && mod?.n === 'Ghost Rider' && !ghostRiderActive && !isAttackerDead);

    if (isGhostRiderFirstMove) {
        ghostRiderActive = { r: tr, c: tc };
        document.getElementById('skip-turn-btn').style.display = 'block';
    } else {
        ghostRiderActive = null;
        document.getElementById('skip-turn-btn').style.display = 'none';
        turno = (turno === 'W') ? 'B' : 'W';
    }

    draw();
    checkGameState();

    if (isMultiplayer && !isRemote) {
        socket.emit('sendMove', { roomCode: roomCode, moveData: { fr, fc, tr, tc, special, promoPiece, color: pColor, seedSync: startingSeed } });
    }
    if (isRemote) isRemoteMoveExecuting = false;

    if (opponentMode === 'AI' && turno === 'B' && !gameOver && !isMultiplayer) { if (!overdriveTriggered) { let delay = gaveDrop ? 3000 : 800; setTimeout(playAI, delay); } }
};

if (needsPromotion) {
    if (isRemote) finishMove(remotePromoPiece);
    else if (opponentMode === 'AI' && pColor === 'B' && !isMultiplayer) finishMove('q');
    else showPromotionUI(pColor, finishMove);
} else { finishMove(null); }


function evaluateMove(fr, fc, tr, tc, special) {
    let pColor = 'B'; let enemyColor = 'W'; let p = grid[fr][fc]; let cl = p.toLowerCase(); let mod = getMod(fr, fc, pColor, cl);
    let score = Math.random() * 0.5; let target = grid[tr][tc];

    if (target) score += getPieceValue(target) * 10;
    if (special && special.isEnPassant) score += 10;
    if (special && special.isCastle) score += 20;

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

    if (ghostRiderActive) {
        let moves = getLegalMoves(ghostRiderActive.r, ghostRiderActive.c);
        let bestMove = null; let bestScore = -Infinity;
        moves.forEach(m => {
            let score = evaluateMove(ghostRiderActive.r, ghostRiderActive.c, m.r, m.c, m);
            if (score > bestScore) { bestScore = score; bestMove = { fr: ghostRiderActive.r, fc: ghostRiderActive.c, tr: m.r, tc: m.c, special: m }; }
        });
        if (bestMove && bestScore > 0.5) {
            document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
            animateMovement(bestMove.fr, bestMove.fc, bestMove.tr, bestMove.tc, 'B', () => { executeMove(bestMove.fr, bestMove.fc, bestMove.tr, bestMove.tc, bestMove.special); }, bestMove.special ? bestMove.special.bouncePoint : null);
        } else {
            skipTurn(false);
        }
        return;
    }

    let bestMove = null;
    if (openingBook[currentMoveSequence]) {
        let bookMoves = openingBook[currentMoveSequence]; let chosenMoveStr = bookMoves[Math.floor(Math.random() * bookMoves.length)];
        let f_r = parseInt(chosenMoveStr[0]), f_c = parseInt(chosenMoveStr[1]); let t_r = parseInt(chosenMoveStr[2]), t_c = parseInt(chosenMoveStr[3]);
        let legalMoves = getLegalMoves(f_r, f_c); let validSpecial = legalMoves.find(m => m.r === t_r && m.c === t_c);
        if (validSpecial !== undefined) bestMove = { fr: f_r, fc: f_c, tr: t_r, tc: t_c, special: validSpecial };
    }

    if (!bestMove) {
        let bestScore = -Infinity; let bestMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                let p = grid[r][c];
                if (p && (p === p.toUpperCase() ? 'W' : 'B') === 'B') {
                    let moves = getLegalMoves(r, c);
                    moves.forEach(m => {
                        let score = evaluateMove(r, c, m.r, m.c, m);
                        if (score > bestScore) { bestScore = score; bestMoves = [{ fr: r, fc: c, tr: m.r, tc: m.c, special: m }]; }
                        else if (Math.abs(score - bestScore) < 0.001) bestMoves.push({ fr: r, fc: c, tr: m.r, tc: m.c, special: m });
                    });
                }
            }
        }
        if (bestMoves.length > 0) bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    if (bestMove) {
        document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
        animateMovement(bestMove.fr, bestMove.fc, bestMove.tr, bestMove.tc, 'B', () => { executeMove(bestMove.fr, bestMove.fc, bestMove.tr, bestMove.tc, bestMove.special); }, bestMove.special ? bestMove.special.bouncePoint : null);
    }
}

function clickCell(r, c) {
    clearArrows();
    if (gameOver || isAnimating || (opponentMode === 'AI' && turno === 'B') || isRemoteMoveExecuting) return;
    if (isMultiplayer && turno !== myTeam) return;

    let p = grid[r][c]; let col = p ? (p == p.toUpperCase() ? 'W' : 'B') : null;

    if (ghostRiderActive) {
        if (col === turno && r === ghostRiderActive.r && c === ghostRiderActive.c) {
            selected = { r, c }; hints = getLegalMoves(r, c); draw();
        } else if (selected && hints.find(h => h.r == r && h.c == c)) {
            let sr = selected.r, sc = selected.c; let sColor = grid[sr][sc] === grid[sr][sc].toUpperCase() ? 'W' : 'B';
            let m = hints.find(h => h.r == r && h.c == c);
            selected = null; hints = []; document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
            animateMovement(sr, sc, r, c, sColor, () => executeMove(sr, sc, r, c, m, false), m.bouncePoint);
        } else {
            selected = null; hints = []; draw();
        }
        return;
    }

    recentSpawns = [];
    if (selected) {
        let m = hints.find(h => h.r == r && h.c == c);
        if (m) {
            let sr = selected.r, sc = selected.c; let sColor = grid[sr][sc] === grid[sr][sc].toUpperCase() ? 'W' : 'B';
            selected = null; hints = []; document.querySelectorAll('.cell').forEach(el => el.classList.remove('h-c', 'h-m', 'sel'));
            animateMovement(sr, sc, r, c, sColor, () => executeMove(sr, sc, r, c, m, false), m.bouncePoint);
        } else if (col === turno) { selected = { r, c }; hints = getLegalMoves(r, c); draw(); }
        else { selected = null; hints = []; draw(); }
    } else if (col === turno) { selected = { r, c }; hints = getLegalMoves(r, c); draw(); }
}

// ==========================================
// 7. FUNZIONI DI UTILITÀ E FINE PARTITA
// ==========================================
function triggerEnd(winnerColor, title, desc) {
    gameOver = true;
    clearInterval(timerInterval);

    let endTitle = "PATTA"; let titleColor = "var(--t2)";
    if (winnerColor) { if (winnerColor === myTeam) { endTitle = "VITTORIA"; titleColor = "var(--t1)"; } else { endTitle = "SCONFITTA"; titleColor = "var(--t4)"; } }
    else if (title === 'DISCONNESSO' || title === 'RESA') { endTitle = "ABBANDONO"; }

    let goScreen = document.getElementById('game-over-screen');
    if (goScreen) document.body.appendChild(goScreen);

    let snapshotHTML = "";
    let currentBoard = document.getElementById('board');
    if (currentBoard) {
        snapshotHTML = currentBoard.innerHTML;
    }

    if (gfxLevel !== 'LO') {
        let wrapper = document.getElementById('main-board-wrapper');
        let bgm = document.getElementById('bg-music');
        if (bgm) { let fade = setInterval(() => { if (bgm.volume > 0.1) bgm.volume -= 0.1; else { bgm.pause(); clearInterval(fade); } }, 100); }

        if (wrapper) { wrapper.classList.remove('zoom-finish', 'crash-finish', 'board-overdrive-jump'); wrapper.classList.add('board-vibrate'); }
        playMoveSound('check');

        setTimeout(() => {
            let pieces = document.querySelectorAll('.piece');
            pieces.forEach(p => { let randomDelay = Math.random() * 0.4; p.style.animationDelay = `${randomDelay}s`; p.classList.add('piece-falling'); });
            playMoveSound('capture');
        }, 500);

        setTimeout(() => { if (wrapper) wrapper.classList.remove('board-vibrate'); showGameOver(endTitle, titleColor, desc, snapshotHTML); }, 2500);
    } else {
        let bgm = document.getElementById('bg-music'); if (bgm) bgm.pause();
        setTimeout(() => showGameOver(endTitle, titleColor, desc, snapshotHTML), 500);
    }
}

function showGameOver(title, color, desc, snapshotHTML = "") {
    let gameUi = document.getElementById('game-ui'); if (gameUi) gameUi.style.display = 'none';
    let goScreen = document.getElementById('game-over-screen');
    if (goScreen) {
        goScreen.classList.add('show');
        let t = document.getElementById('go-title');
        if (t) { t.innerText = title; t.style.color = color; t.style.textShadow = `0 0 20px ${color}`; t.classList.remove('glitch-anim'); void t.offsetWidth; t.classList.add('glitch-anim'); }
        let d = document.getElementById('go-desc'); if (d) d.innerText = desc;

        let snapBoard = document.getElementById('go-snapshot-board');
        if (snapBoard && snapshotHTML) {
            snapBoard.innerHTML = snapshotHTML;
        }
    }
}

function updateTimersUI() {
    let container = document.getElementById('timers-container');
    if (!timerEnabled) { if (container) container.style.display = 'none'; return; }
    if (container) container.style.display = 'flex';
    let fmt = (ms) => { let totalTenths = Math.floor(ms / 100); let mins = Math.floor(totalTenths / 600); let secs = Math.floor((totalTenths % 600) / 10); let tenths = totalTenths % 10; return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`; };
    let wT = document.getElementById('w-timer'), bT = document.getElementById('b-timer');
    if (wT) { wT.innerText = fmt(timeLeftW); wT.style.opacity = turno === 'W' ? '1' : '0.5'; wT.style.textShadow = turno === 'W' ? '0 0 10px var(--white)' : 'none'; }
    if (bT) { bT.innerText = fmt(timeLeftB); bT.style.opacity = turno === 'B' ? '1' : '0.5'; bT.style.textShadow = turno === 'B' ? '0 0 10px var(--black)' : 'none'; }
}

function getPositionKey() { return JSON.stringify(grid) + turno + JSON.stringify(castlingRights) + JSON.stringify(classMods); }

function triggerOverdrive() {
    if (document.body.classList.contains('overdrive')) return;
    isAnimating = true;
    let alertEl = document.getElementById('overdrive-alert');
    if (alertEl) alertEl.classList.add('show');
    playMoveSound('check');

    if (gfxLevel !== 'LO') {
        let wipe = document.createElement('div'); wipe.className = 'laser-wipe'; document.body.appendChild(wipe);
        setTimeout(() => {
            document.body.classList.add('overdrive');
            if (gfxLevel === 'HI') { let w = document.getElementById('main-board-wrapper'); if (w) w.classList.add('board-overdrive-jump'); }
        }, 1300);
        setTimeout(() => {
            if (alertEl) alertEl.classList.remove('show'); wipe.remove();
            let w = document.getElementById('main-board-wrapper'); if (w) w.classList.remove('board-overdrive-jump');
            isAnimating = false; if (opponentMode === 'AI' && turno === 'B' && !gameOver) setTimeout(playAI, 800);
        }, 3000);
    } else {
        document.body.classList.add('overdrive');
        setTimeout(() => { if (alertEl) alertEl.classList.remove('show'); isAnimating = false; if (opponentMode === 'AI' && turno === 'B' && !gameOver) setTimeout(playAI, 800); }, 2000);
    }
}

function showModAlert(text, colorClass) {
    let alertEl = document.getElementById('mod-alert'); if (!alertEl) return;
    alertEl.innerText = text; alertEl.classList.remove('show', 'mod-c1', 'mod-c2', 'mod-c3');
    void alertEl.offsetWidth; alertEl.classList.add('show', colorClass); playMoveSound('check');
    if (gfxLevel !== 'LO') { let flash = document.createElement('div'); flash.className = 'screen-flash'; document.body.appendChild(flash); setTimeout(() => flash.remove(), 600); }
    setTimeout(() => { alertEl.classList.remove('show'); }, 2500);
}

function updateKillsCounter() {
    let el = document.getElementById('kills-counter'); if (!el) return;
    if (isClassicMode) { el.innerText = "CLASSIC MODE ACTIVE"; return; }
    let currentTotalDead = deadPieces['W'].length + deadPieces['B'].length;
    let progress = nextThresholdIndex / thresholds.length;
    document.documentElement.style.setProperty('--od-mix', `${progress * 100}%`);
    el.classList.remove('impatience-1', 'impatience-2', 'impatience-3', 'overdrive-text');
    if (nextThresholdIndex < thresholds.length) {
        let needed = thresholds[nextThresholdIndex]; let left = needed - currentTotalDead;
        el.innerText = `NEXT MOD IN: ${left} KILL${left !== 1 ? 'S' : ''} (MOD ${nextThresholdIndex + 1}/4)`;
        if (nextThresholdIndex === 3) el.classList.add('impatience-3'); else if (nextThresholdIndex === 2) el.classList.add('impatience-2'); else if (nextThresholdIndex === 1) el.classList.add('impatience-1');
    } else { el.innerText = `OVERDRIVE MODE ACTIVE`; el.classList.add('overdrive-text'); }
}

function isPromoted(r, c) { return promotedPieces.some(p => p.r === r && p.c === c); }
function getMod(r, c, color, cl) { return isPromoted(r, c) ? null : classMods[color][cl]; }
function getPieceValue(p) { if (!p) return 0; const vals = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 }; return vals[p.toLowerCase()] || 0; }

function giveModTo(targetColor) {
    let livingClasses = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        let p = grid[r][c];
        if (p && (p === p.toUpperCase() ? 'W' : 'B') === targetColor) { let cl = p.toLowerCase(); if (!livingClasses.includes(cl)) livingClasses.push(cl); }
    }
    if (livingClasses.length === 0) return;

    let pool = livingClasses.filter(c => !classMods[targetColor][c]);
    let targetClass = '', isOverwrite = false;

    if (pool.length > 0) targetClass = pool[Math.floor(getGameRandom() * pool.length)];
    else { targetClass = livingClasses[Math.floor(getGameRandom() * livingClasses.length)]; isOverwrite = true; }

    let tier = nextThresholdIndex < 2 ? ['common', 'rare'] : ['epic', 'legend'];
    let mods = db[targetClass].filter(x => tier.includes(x.t));
    if (mods.length === 0) mods = db[targetClass];

    let mod = mods[Math.floor(getGameRandom() * mods.length)];
    if (targetColor === 'W') playDropSound(mod.t);

    let listId = targetColor === 'W' ? 'w-mods-list' : 'b-mods-list';
    let list = document.getElementById(listId);

    if (isOverwrite && list) {
        let oldCards = list.querySelectorAll(`.mod-card-${targetClass}:not(.disabled-card)`);
        oldCards.forEach(card => card.classList.add('disabled-card'));
    }

    classMods[targetColor][targetClass] = mod;
    let icon = glyphs[targetClass === 'p' ? (targetColor === 'W' ? 'P' : 'p') : (targetColor === 'W' ? targetClass.toUpperCase() : targetClass)];
    if (list) list.innerHTML += `<div class="card c-${mod.t} mod-card-${targetClass}"><div class="card-header"><div class="card-title">${icon} ${mod.n}</div><div class="badge">${mod.t}</div></div><div class="card-desc">${mod.d}</div></div>`;

    recentModdedClasses.push({ color: targetColor, cl: targetClass });
    setTimeout(() => { recentModdedClasses = recentModdedClasses.filter(x => !(x.color === targetColor && x.cl === targetClass)); draw(); }, 1200);
    triggerInstantMods(targetColor, mod);
}

function triggerInstantMods(color, mod) {
    if (mod.n === 'Energy Shield') {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c] && grid[r][c].toLowerCase() === 'p' && (grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === color) pawnShields.push({ r, c });
    }

    if (mod.n === 'Leap of Faith') {
        let dir = color === 'W' ? -1 : 1;
        let endRank = color === 'W' ? 1 : 6;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (grid[r][c] && grid[r][c].toLowerCase() === 'p' && (grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === color) {
                    let targetR = r;
                    while (targetR !== endRank && !grid[targetR + dir]?.[c]) targetR += dir;
                    if (targetR !== r) { grid[targetR][c] = grid[r][c]; grid[r][c] = ''; recentSpawns.push({ r: targetR, c }); }
                }
            }
        }
    }

    if (mod.n === 'Vanguard') {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (grid[r][c] && grid[r][c].toLowerCase() === 'p' && (grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === color) {
                    if ((color === 'W' && r <= 4) || (color === 'B' && r >= 3)) {
                        grid[r][c] = color === 'W' ? 'Q' : 'q';
                        promotedPieces.push({ r, c }); recentSpawns.push({ r, c });
                    }
                }
            }
        }
    }

    if (mod.n === 'Wololo') {
        let enemyColor = color === 'W' ? 'B' : 'W';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (grid[r][c] && grid[r][c].toLowerCase() === 'p' && (grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === enemyColor) {
                    grid[r][c] = color === 'W' ? 'P' : 'p';
                    recentSpawns.push({ r, c });
                }
            }
        }
    }

    if (mod.n === 'Air Superiority') {
        let enemyColor = color === 'W' ? 'B' : 'W';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (grid[r][c] && grid[r][c].toLowerCase() === 'r' && (grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === enemyColor) {
                    deadPieces[enemyColor].push(grid[r][c]); grid[r][c] = ''; createCaptureExplosion(r, c, enemyColor);
                }
            }
        }
        let empties = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!grid[r][c]) empties.push({ r, c });
        empties = shuffleArray(empties);
        for (let i = 0; i < 2 && i < empties.length; i++) {
            grid[empties[i].r][empties[i].c] = color === 'W' ? 'R' : 'r';
            recentSpawns.push({ r: empties[i].r, c: empties[i].c });
        }
        updateScores();
    }

    if (mod.n === 'Brainwash') {
        let enemyQ = color === 'W' ? 'q' : 'Q'; let myQ = color === 'W' ? 'Q' : 'q'; let qPos = null;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c] === enemyQ) { qPos = { r, c }; grid[r][c] = ''; }
        if (qPos) {
            let empties = []; let enemyColor = color === 'W' ? 'B' : 'W';
            for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (!grid[i][j]) { let backup = grid.map(row => [...row]); backup[i][j] = myQ; if (!isInCheck(enemyColor, backup)) empties.push({ r: i, c: j }); }
            if (empties.length === 0) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (!grid[i][j]) empties.push({ r: i, c: j });
            if (empties.length > 0) {
                let spot = empties[Math.floor(getGameRandom() * empties.length)]; grid[spot.r][spot.c] = myQ;
                recentSpawns.push({ r: spot.r, c: spot.c }); clonedPieces.push({ r: spot.r, c: spot.c });
                if (isPromoted(qPos.r, qPos.c)) { promotedPieces = promotedPieces.filter(p => p.r !== qPos.r || p.c !== qPos.c); promotedPieces.push({ r: spot.r, c: spot.c }); }
                let idx = originalQueens.indexOf(qPos.r + "," + qPos.c); if (idx !== -1) originalQueens.splice(idx, 1);
            }
        }
    }
    if (mod.n === 'Great Resurrection') {
        let myHalf = [], enemyHalf = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!grid[r][c]) { if (color === 'W' && r >= 4) myHalf.push({ r, c }); else if (color === 'B' && r <= 3) myHalf.push({ r, c }); else enemyHalf.push({ r, c }); }
        myHalf = shuffleArray(myHalf); enemyHalf = shuffleArray(enemyHalf);
        let emptiesForPop = enemyHalf.concat(myHalf);
        while (deadPieces[color].length > 0 && emptiesForPop.length > 0) {
            let p = deadPieces[color].pop(); let pos = emptiesForPop.pop();
            grid[pos.r][pos.c] = color === 'W' ? p.toUpperCase() : p.toLowerCase();
            recentSpawns.push({ r: pos.r, c: pos.c }); clonedPieces.push({ r: pos.r, c: pos.c });
        }
        updateScores();
    }
    if (mod.n === 'Necromancy') {
        let emptiesForNecro = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!grid[r][c]) emptiesForNecro.push({ r, c });
        emptiesForNecro = shuffleArray(emptiesForNecro);
        while (deadPieces[color].length > 0 && emptiesForNecro.length > 0) {
            deadPieces[color].pop();
            let spot = emptiesForNecro.pop();
            grid[spot.r][spot.c] = color === 'W' ? 'P' : 'p';
            zombiePawns.push({ r: spot.r, c: spot.c });
            clonedPieces.push({ r: spot.r, c: spot.c });
            recentSpawns.push({ r: spot.r, c: spot.c });
        }
        updateScores(); draw();
    }
}

function findKing(color, testGrid = grid) { let target = color === 'W' ? 'K' : 'k'; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (testGrid[r][c] === target) return { r, c }; return null; }

function isUnderAttack(tR, tC, aColor, testGrid = grid) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { let p = testGrid[r][c]; if (p && (p === p.toUpperCase() ? 'W' : 'B') === aColor) { if (getMovesPseudoLegal(r, c, aColor, testGrid, false, true).some(m => m.r === tR && m.c === tC)) return true; } } return false;
}

function isInCheck(color, testGrid = grid) {
    if (isCheckingLogic) return false;
    let kPos = findKing(color, testGrid);
    if (!kPos) return false;
    isCheckingLogic = true;
    let attack = isUnderAttack(kPos.r, kPos.c, color === 'W' ? 'B' : 'W', testGrid);
    isCheckingLogic = false;
    return attack;
}

function simulateMoveDestruction(testGrid, fr, fc, tr, tc, pColor, special) {
    let p = testGrid[fr][fc]; if (!p) return; let cl = p.toLowerCase(); let mod = getMod(fr, fc, pColor, cl);
    let enemyColor = pColor === 'W' ? 'B' : 'W'; let target = testGrid[tr][tc];

    if (cl === 'q' && mod?.n === 'Annihilation') { let dr = Math.sign(tr - fr), dc = Math.sign(tc - fc); let cr = fr + dr, cc = fc + dc; while (cr !== tr || cc !== tc) { if (testGrid[cr][cc] && testGrid[cr][cc].toLowerCase() !== 'k') testGrid[cr][cc] = ''; cr += dr; cc += dc; } }
    if (special && special.isEnPassant) testGrid[fr][tc] = '';
    if (special && special.isCastle) { if (special.isCastle === 'K') { testGrid[fr][tc - 1] = testGrid[fr][tc + 1]; testGrid[fr][tc + 1] = ''; } if (special.isCastle === 'Q') { testGrid[fr][tc + 1] = testGrid[fr][tc - 2]; testGrid[fr][tc - 2] = ''; } }

    testGrid[tr][tc] = p; testGrid[fr][fc] = '';

    let isAttackerDead = false;

    if (target && target.toLowerCase() === 'r' && getMod(tr, tc, enemyColor, 'r')?.n === 'Voodoo Death' && cl !== 'k') isAttackerDead = true;

    if (isAttackerDead) { testGrid[tr][tc] = ''; }
    else {
        if (cl === 'n' && mod?.n === 'Explosive') { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { if (i === 0 && j === 0) continue; let nr = tr + i, nc = tc + j; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && testGrid[nr][nc] && (testGrid[nr][nc] === testGrid[nr][nc].toUpperCase() ? 'W' : 'B') !== pColor && testGrid[nr][nc].toLowerCase() !== 'k') { testGrid[nr][nc] = ''; } } }
        if (cl === 'b' && mod?.n === 'Chain Reaction') {
            let dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
            let s1r = tr + dr, s1c = tc; let t1 = testGrid[s1r]?.[s1c]; if (t1 && t1.toLowerCase() !== 'k' && (t1 === t1.toUpperCase() ? 'W' : 'B') !== pColor) testGrid[s1r][s1c] = '';
            let s2r = tr, s2c = tc + dc; let t2 = testGrid[s2r]?.[s2c]; if (t2 && t2.toLowerCase() !== 'k' && (t2 === t2.toUpperCase() ? 'W' : 'B') !== pColor) testGrid[s2r][s2c] = '';
            let kr = tr + dr, kc = tc + dc; while (kr >= 0 && kr < 8 && kc >= 0 && kc < 8) { let tK = testGrid[kr][kc]; if (tK && tK.toLowerCase() !== 'k' && (tK === tK.toUpperCase() ? 'W' : 'B') !== pColor) testGrid[kr][kc] = ''; kr += dr; kc += dc; }
        }
    }
}

function checkGameState() {
    let enemyColor = turno; let enemyHasMoves = false; let piecesLeft = 0;
    for (let r = 0; r < 8; r++) { for (let c = 0; c < 8; c++) { if (grid[r][c]) { piecesLeft++; if ((grid[r][c] === grid[r][c].toUpperCase() ? 'W' : 'B') === enemyColor) { if (!enemyHasMoves && getLegalMoves(r, c).length > 0) enemyHasMoves = true; } } } }

    let isCheck = isInCheck(enemyColor); if (isCheck && enemyHasMoves) playMoveSound('check');

    if (!enemyHasMoves) {
        if (isCheck) triggerEnd(enemyColor === 'W' ? 'B' : 'W', 'MATE', `Il Team ${enemyColor === 'W' ? 'Black' : 'White'} trionfa!`);
        else triggerEnd(null, 'STALEMATE', 'Nessuna mossa legale. La partita è patta.');
        return;
    }
    let key = getPositionKey();
    if (halfMoveClock >= 100 || piecesLeft === 2 || positionHistory[key] >= 3) { let reason = piecesLeft === 2 ? 'Materiale insufficiente' : (positionHistory[key] >= 3 ? 'Tripla ripetizione' : 'Regola delle 50 mosse'); triggerEnd(null, 'PATTA', `${reason}. La partita è in parità.`); }
    updateTurnDisplay(); updateTimersUI();
}

function updateCastlingRights(p, r, c) { let col = p === p.toUpperCase() ? 'W' : 'B'; if (p.toLowerCase() === 'k') castlingRights[col].k = false; if (p.toLowerCase() === 'r') { if (c === 0) castlingRights[col].r1 = false; if (c === 7) castlingRights[col].r8 = false; } }
function updateTurnDisplay() { let td = document.getElementById('turn-display'); if (!td) return; td.innerText = turno === 'W' ? "TURN: WHITE" : "TURN: BLACK"; td.style.color = turno === 'W' ? "var(--white)" : "var(--black)"; td.style.textShadow = `0 0 10px ${turno === 'W' ? "var(--white)" : "var(--black)"}`; }

function updateScores() {
    let wScore = 0; let bScore = 0; const vals = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0 };
    for (let r = 0; r < 8; r++) { for (let c = 0; c < 8; c++) { let p = grid[r][c]; if (p) { let val = vals[p.toLowerCase()] || 0; if (p === p.toUpperCase()) wScore += val; else bScore += val; } } }

    let wAdv = wScore > bScore ? `+${wScore - bScore}` : ''; let bAdv = bScore > wScore ? `+${bScore - wScore}` : '';
    let wc = document.getElementById('w-captures'); if (wc) wc.innerHTML = deadPieces['B'].map(p => `<span class="piece B" style="margin-right:-8px; font-size:0.85em;">${glyphs[p]}</span>`).join('') + (wAdv ? `<span style="font-size:0.8rem; margin-left:12px; font-family:'Inter', sans-serif; font-weight:bold; color:var(--white); opacity:0.8;">${wAdv}</span>` : '');
    let bc = document.getElementById('b-captures'); if (bc) bc.innerHTML = (bAdv ? `<span style="font-size:0.8rem; margin-right:12px; font-family:'Inter', sans-serif; font-weight:bold; color:var(--black); opacity:0.8;">${bAdv}</span>` : '') + deadPieces['W'].map(p => `<span class="piece W" style="margin-left:-8px; font-size:0.85em;">${glyphs[p]}</span>`).join('');
}

function createCaptureExplosion(r, c, color) {
    if (gfxLevel === 'LO') return; let cell = document.getElementById('board').children[r * 8 + c]; if (!cell) return;
    let burst = document.createElement('div'); burst.className = `capture-burst ${color}`; cell.appendChild(burst);
    let count = gfxLevel === 'HI' ? 5 : 2;
    for (let i = 0; i < count; i++) {
        let spark = document.createElement('div'); spark.className = `spark ${color}`;
        spark.style.setProperty('--tx', (Math.random() * 60 - 30) + 'px'); spark.style.setProperty('--ty', (Math.random() * 60 - 30) + 'px');
        cell.appendChild(spark); setTimeout(() => spark.remove(), 400);
    }
    setTimeout(() => burst.remove(), 400);
}

// ==========================================
// 8. SISTEMA FRECCE STRATEGICHE (TASTO DESTRO)
// ==========================================
let boardWrapper = document.getElementById('main-board-wrapper');
if (boardWrapper) {
    boardWrapper.addEventListener('contextmenu', e => e.preventDefault());
}

window.addEventListener('mousedown', e => {
    if (e.button === 0) { clearArrows(); return; }
    if (e.button !== 2) return;
    if (!e.target.closest('.board-wrapper')) return;

    let boardEl = document.getElementById('board');
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect(); const cellSize = rect.width / 8;
    let c = Math.floor((e.clientX - rect.left) / cellSize); let r = Math.floor((e.clientY - rect.top) / cellSize);
    if (r < 0 || r > 7 || c < 0 || c > 7) return;

    if (document.body.getAttribute('data-team') === 'B') { c = 7 - c; r = 7 - r; }
    arrowStartCell = { r, c };
});

window.addEventListener('mouseup', e => {
    if (e.button !== 2) return;
    if (!arrowStartCell) return;

    let boardEl = document.getElementById('board');
    const rect = boardEl.getBoundingClientRect(); const cellSize = rect.width / 8;
    let c = Math.floor((e.clientX - rect.left) / cellSize); let r = Math.floor((e.clientY - rect.top) / cellSize);

    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
        if (document.body.getAttribute('data-team') === 'B') { c = 7 - c; r = 7 - r; }
        if (arrowStartCell.r !== r || arrowStartCell.c !== c) { drawArrow(arrowStartCell.r, arrowStartCell.c, r, c); }
    }
    arrowStartCell = null;
});

function drawArrow(r1, c1, r2, c2) {
    let brd = document.getElementById('board');
    brd.style.position = 'relative';

    let svg = document.getElementById('arrow-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'arrow-svg';
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.position = 'absolute'; svg.style.top = '0'; svg.style.left = '0';
        svg.style.width = '100%'; svg.style.height = '100%';
        svg.style.pointerEvents = 'none'; svg.style.zIndex = '500';
        svg.style.filter = 'drop-shadow(0 0 5px rgba(0, 243, 255, 1))';

        let defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        let marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead'); marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5');
        marker.setAttribute('refX', '5'); marker.setAttribute('refY', '5'); marker.setAttribute('orient', 'auto');

        let polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 5, 0 10'); polygon.setAttribute('fill', 'rgba(0, 243, 255, 0.9)');
        marker.appendChild(polygon); defs.appendChild(marker); svg.appendChild(defs); brd.appendChild(svg);
    }

    const x1 = (c1 * 12.5) + 6.25; const y1 = (r1 * 12.5) + 6.25;
    const x2 = (c2 * 12.5) + 6.25; const y2 = (r2 * 12.5) + 6.25;
    let isKnightMove = (Math.abs(r2 - r1) === 2 && Math.abs(c2 - c1) === 1) || (Math.abs(r2 - r1) === 1 && Math.abs(c2 - c1) === 2);

    let graphic;
    if (isKnightMove) {
        let cx = x1; let cy = y2;
        graphic = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        graphic.setAttribute('d', `M ${x1} ${y1} L ${cx} ${cy} L ${x2} ${y2}`);
        graphic.setAttribute('fill', 'none'); graphic.setAttribute('stroke-linejoin', 'round');
    } else {
        graphic = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        graphic.setAttribute('x1', x1); graphic.setAttribute('y1', y1); graphic.setAttribute('x2', x2); graphic.setAttribute('y2', y2);
    }

    graphic.setAttribute('stroke', 'rgba(0, 243, 255, 0.9)'); graphic.setAttribute('stroke-width', '1.2');
    graphic.setAttribute('marker-end', 'url(#arrowhead)'); graphic.setAttribute('stroke-linecap', 'butt');

    let startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startCircle.setAttribute('cx', x1); startCircle.setAttribute('cy', y1);
    startCircle.setAttribute('r', '0.6'); startCircle.setAttribute('fill', 'rgba(0, 243, 255, 0.9)');

    svg.appendChild(startCircle); svg.appendChild(graphic);
}

function clearArrows() {
    let svg = document.getElementById('arrow-svg');
    if (svg) {
        const elements = svg.querySelectorAll('path, line, circle');
        elements.forEach(el => el.remove());
    }
}

function wouldPawnGiveCheck(spawnR, spawnC, pawnTeam) {
    let enemyKingChar = (pawnTeam === 'W') ? 'k' : 'K';
    let kingR = -1, kingC = -1;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (grid[r][c] === enemyKingChar) {
                kingR = r;
                kingC = c;
                break;
            }
        }
    }
    if (kingR === -1) return false;

    let dir = (pawnTeam === 'W') ? -1 : 1;
    if (kingR === spawnR + dir && (kingC === spawnC - 1 || kingC === spawnC + 1)) {
        return true;
    }
    return false;
}