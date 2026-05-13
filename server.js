const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingQueue = []; 
// La griglia iniziale standard (Maiuscole = Bianco, Minuscole = Nero)
const initialBoard = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
];

// Funzione per dare una griglia nuova di zecca a ogni nuova partita
function getNewBoard() {
    return JSON.parse(JSON.stringify(initialBoard)); 
}
let activeRooms = {};  
let rateLimits = {}; // Memoria per lo scudo Anti-Spam

function sanitizeString(str) {
    if (!str) return "Sconosciuto";
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().substring(0, 15);
}

// MIDDLEWARE ANTI-SPAM (Scudo DDoS)
io.use((socket, next) => {
    socket.use((packet, nextPacket) => {
        const now = Date.now();
        if (!rateLimits[socket.id]) rateLimits[socket.id] = { count: 0, lastReset: now };
        
        const limiter = rateLimits[socket.id];
        
        // Ogni secondo, azzera il contatore
        if (now - limiter.lastReset > 1000) {
            limiter.count = 0;
            limiter.lastReset = now;
        }
        
        limiter.count++;
        
        // Se manda più di 10 richieste al secondo, è un Bot/Hacker!
        if (limiter.count > 10) {
            console.warn(`Spam bloccato dal giocatore: ${socket.id}`);
            return nextPacket(new Error('Rate limit superato. Fermo!'));
        }
        nextPacket();
    });
    next();
});

io.on('connection', (socket) => {
    console.log('Nuovo giocatore connesso:', socket.id);

    // 1. MATCHMAKING GLOBALE
    socket.on('findMatch', (username) => {
        const cleanName = sanitizeString(username);
        socket.playerName = cleanName; 

        if (!waitingQueue.find(p => p.id === socket.id)) {
            waitingQueue.push(socket);
        }
        
        if (waitingQueue.length >= 2) {
            const player1 = waitingQueue.shift();
            const player2 = waitingQueue.shift();
            const roomCode = 'MATCH_' + Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // GENERIAMO IL SEME UNICO PER QUESTA PARTITA
            const matchSeed = Math.floor(Math.random() * 1000000);

            player1.join(roomCode);
            player2.join(roomCode);
            // Registriamo la stanza, i colori assegnati e chi deve muovere per primo
            activeRooms[roomCode] = { 
                p1: player1.id, 
                p2: player2.id,
                p1Color: 'W',
                p2Color: 'B',
                currentTurn: 'W', // Inizia sempre il Bianco
                board: getNewBoard()
            };
            
            player1.emit('assignTeam', 'W');
            player2.emit('assignTeam', 'B');

            // INVIAMO IL SEME A ENTRAMBI
            io.to(roomCode).emit('gameStart', { 
                p1Name: player1.playerName, 
                p2Name: player2.playerName,
                roomCode: roomCode,// <--- ECCO IL FIX SUL SERVER!
                seed: matchSeed 
            });
        }
    });

    // 2. STANZE PRIVATE
    socket.on('createRoom', () => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase(); 
        socket.join(roomCode);
        socket.roomCode = roomCode;
        activeRooms[roomCode] = { p1: socket.id, p2: null, turn: 'W', isPrivate: true };
        
        socket.emit('roomCreated', roomCode); 
        socket.emit('assignTeam', 'W');       
    });

    socket.on('joinRoom', (code) => {
        const roomCode = typeof code === 'string' ? code.toUpperCase() : code.roomCode.toUpperCase();
        
        if (activeRooms[roomCode] && !activeRooms[roomCode].p2) {
            const matchSeed = Math.floor(Math.random() * 1000000);
            io.to(roomCode).emit('gameStart', { p1Name: "HOST", p2Name: "GUEST", seed: matchSeed });
            socket.join(roomCode);
            socket.roomCode = roomCode;
            activeRooms[roomCode].p2 = socket.id;
            
            socket.emit('assignTeam', 'B'); 
            io.to(roomCode).emit('gameStart', { p1Name: "HOST", p2Name: "GUEST" });
        } else {
            socket.emit('error', 'Stanza inesistente o già piena!');
        }
    });

    socket.on('sendMove', (data) => {
        const room = activeRooms[data.roomCode];
        if (!room) return; // Se la stanza non esiste, ignora silenziosamente

        // 1. Identifica chi sta cercando di fare la mossa
        const isPlayer1 = socket.id === room.p1;
        const isPlayer2 = socket.id === room.p2;
        const playerColor = isPlayer1 ? room.p1Color : (isPlayer2 ? room.p2Color : null);

        // Se non sei un giocatore di questa stanza (es. spettatore o hacker), bloccato!
        if (!playerColor) return;

        // 2. CONTROLLO TURNO (Anti-Spam / Anti-Teletrasporto)
        if (room.currentTurn !== playerColor) {
            console.log(`[CHEAT DETECTED] Il giocatore ${socket.id} ha provato a muovere fuori turno!`);
            return; 
        }

        // 3. CONTROLLO PROPRIETÀ PEZZO
        if (data.moveData.color !== playerColor) {
            console.log(`[CHEAT DETECTED] Tentativo di muovere i pezzi avversari!`);
            return;
        }

        // 4. CONTROLLO GEOMETRICO (Fuori dalla scacchiera)
        const { fr, fc, tr, tc } = data.moveData;
        if (fr < 0 || fr > 7 || fc < 0 || fc > 7 || tr < 0 || tr > 7 || tc < 0 || tc > 7) {
            console.log(`[CHEAT DETECTED] Coordinate impossibili!`);
            return;
        }

        // -----------------------------------------------------
        // 5. CONTROLLO FISICO (C'è davvero una pedina lì?)
        // -----------------------------------------------------
        const board = room.board;
        const piece = board[fr][fc];

        if (!piece || piece === '') {
            console.log(`[CHEAT DETECTED] ${socket.id} ha provato a muovere il vuoto!`);
            return;
        }

        // 6. CONTROLLO IDENTITÀ PEZZO (È davvero la sua pedina?)
        const pieceColor = (piece === piece.toUpperCase()) ? 'W' : 'B';
        if (pieceColor !== playerColor) {
            console.log(`[CHEAT DETECTED] ${socket.id} sta hackerando i pezzi avversari!`);
            return;
        }

        // 7. AGGIORNAMENTO DELLA SCACCHIERA SUL SERVER
        // Se la mossa è valida, il server muove il pezzo sulla sua griglia segreta
        board[tr][tc] = piece;
        board[fr][fc] = ''; 

        // (Nota: per semplicità, non calcoliamo la logica delle esplosioni 
        // e dei cloni sul server, ci fidiamo del risultato finale del client)

        // Se la mossa passa tutti i controlli, il server aggiorna il turno...
        room.currentTurn = (room.currentTurn === 'W') ? 'B' : 'W';

        // ...e finalmente inoltra la mossa all'avversario!
        socket.to(data.roomCode).emit('receiveMove', data.moveData);
    });

    // 4. DISCONNESSIONI E PULIZIA MEMORIA
    socket.on('disconnect', () => {
        console.log('Giocatore disconnesso:', socket.id);
        
        // Pulisce la memoria del limitatore Anti-Spam
        delete rateLimits[socket.id];
        
        waitingQueue = waitingQueue.filter(p => p.id !== socket.id);

        if (socket.roomCode) {
            socket.to(socket.roomCode).emit('opponentDisconnected');
            delete activeRooms[socket.roomCode];
        }
    });
});

// Aggiungi un oggetto per tenere traccia dei permessi dei socket attivi
const authenticatedDevs = new Set();

io.on('connection', (socket) => {
    
    socket.on('tryDevMode', (pass) => {
        const SECRET_PASS = "bicocca2026"; // La tua password segreta

        if (pass === SECRET_PASS) {
            authenticatedDevs.add(socket.id); // Registriamo il "buttafuori"
            socket.emit('devAuthResponse', { success: true });
            console.log(`[AUTH] Utente ${socket.id} autenticato come DEV.`);
        } else {
            socket.emit('devAuthResponse', { success: false });
        }
    });

    // PROTEZIONE: Ogni comando sensibile deve controllare i permessi!
    socket.on('forceOverdrive', () => {
        if (authenticatedDevs.has(socket.id)) {
            io.emit('triggerOverdrive'); // Esegue il comando per tutti
        } else {
            console.log(`[HACK-ALERT] Tentativo non autorizzato da ${socket.id}`);
        }
    });

    socket.on('disconnect', () => {
        authenticatedDevs.delete(socket.id); // Pulizia quando esce
    });
});
// Lista dei socket autorizzati (vive solo nella RAM del server)
const authorizedAdmins = new Set();

io.on('connection', (socket) => {
    
    // Gestione della richiesta di identificazione
    socket.on('auth_admin', (pass) => {
        const CHIAVE_SEGRETA = "bicocca2026"; // La tua password

        if (pass === CHIAVE_SEGRETA) {
            authorizedAdmins.add(socket.id); // Marchiamo il socket come Admin
            socket.emit('admin_verified', { success: true });
            console.log(`[AUTH] Socket ${socket.id} identificato come Admin.`);
        } else {
            socket.emit('admin_verified', { success: false });
        }
    });

    // Quando l'utente si disconnette, lo rimuoviamo dalla lista
    socket.on('disconnect', () => {
        authorizedAdmins.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Ultra-Sicuro in ascolto sulla porta ${PORT}`);
});