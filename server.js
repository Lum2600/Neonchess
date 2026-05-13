const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingQueueGod = []; 
let waitingQueueClassic = []; 

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

function getNewBoard() {
    return JSON.parse(JSON.stringify(initialBoard)); 
}
let activeRooms = {};  
let rateLimits = {}; 

function sanitizeString(str) {
    if (!str) return "Sconosciuto";
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().substring(0, 15);
}

// MIDDLEWARE ANTI-SPAM
io.use((socket, next) => {
    socket.use((packet, nextPacket) => {
        const now = Date.now();
        if (!rateLimits[socket.id]) rateLimits[socket.id] = { count: 0, lastReset: now };
        
        const limiter = rateLimits[socket.id];
        
        if (now - limiter.lastReset > 1000) {
            limiter.count = 0;
            limiter.lastReset = now;
        }
        
        limiter.count++;
        
        if (limiter.count > 15) {
            console.warn(`Spam bloccato dal giocatore: ${socket.id}`);
            return nextPacket(new Error('Rate limit superato. Fermo!'));
        }
        nextPacket();
    });
    next();
});

io.on('connection', (socket) => {
    console.log('Nuovo giocatore connesso:', socket.id);

    // 1. MATCHMAKING GLOBALE (Code Separate)
    socket.on('findMatch', (data) => {
        let userStr = (typeof data === 'string') ? data : (data.username || "GUEST");
        let isClassic = data.isClassic || false;
        
        const cleanName = sanitizeString(userStr);
        socket.playerName = cleanName; 
        
        let targetQueue = isClassic ? waitingQueueClassic : waitingQueueGod;

        if (!targetQueue.find(p => p.id === socket.id)) {
            targetQueue.push(socket);
        }
        
        if (targetQueue.length >= 2) {
            const player1 = targetQueue.shift();
            const player2 = targetQueue.shift();
            const roomCode = 'MATCH_' + Math.random().toString(36).substring(2, 8).toUpperCase();
            
            const matchSeed = Math.floor(Math.random() * 1000000);

            player1.join(roomCode);
            player2.join(roomCode);
            player1.roomCode = roomCode; 
            player2.roomCode = roomCode; 

            activeRooms[roomCode] = { 
                p1: player1.id, 
                p2: player2.id,
                p1Color: 'W',
                p2Color: 'B',
                currentTurn: 'W', 
                board: getNewBoard(),
                isClassic: isClassic
            };
            
            player1.emit('assignTeam', 'W');
            player2.emit('assignTeam', 'B');

            io.to(roomCode).emit('gameStart', { 
                p1Name: player1.playerName, 
                p2Name: player2.playerName,
                roomCode: roomCode,
                seed: matchSeed,
                isClassic: isClassic
            });
        }
    });

    // 2. STANZE PRIVATE
   socket.on('createRoom', (data) => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        
        activeRooms[roomCode] = {
            p1: socket.id,
            p2: null,
            p1Color: 'W',
            currentTurn: 'W',
            isClassic: data.isClassic, 
            board: getNewBoard() 
        };
        
        socket.join(roomCode);
        socket.roomCode = roomCode;
        
        socket.emit('roomCreated', roomCode);
        console.log(`[ROOM] Stanza creata: ${roomCode} | Modalità Classic: ${data.isClassic}`);
    });

    socket.on('joinRoom', (data) => {
        const codeStr = typeof data === 'string' ? data : data.roomCode;
        const roomCode = codeStr.toUpperCase();
        
        if (activeRooms[roomCode] && !activeRooms[roomCode].p2) {
            const matchSeed = Math.floor(Math.random() * 1000000);
            const isClassic = activeRooms[roomCode].isClassic;
            
            socket.join(roomCode);
            socket.roomCode = roomCode;
            activeRooms[roomCode].p2 = socket.id;
            
            socket.emit('assignTeam', 'B'); 
            io.to(roomCode).emit('gameStart', { 
                p1Name: "HOST", 
                p2Name: data.username || "GUEST", 
                roomCode: roomCode,
                seed: matchSeed,
                isClassic: isClassic 
            });
        } else {
            socket.emit('errorMsg', 'Stanza inesistente o già piena!');
        }
    });

    // 3. MOVIMENTO (Logica snellita per evitare falsi positivi su Necromancy/Explosions)
    socket.on('sendMove', (data) => {
        const room = activeRooms[data.roomCode];
        if (!room) return; 

        const isPlayer1 = socket.id === room.p1;
        const isPlayer2 = socket.id === room.p2;
        const playerColor = isPlayer1 ? room.p1Color : (isPlayer2 ? room.p2Color : null);

        if (!playerColor) return;

        // Gestione Ghost Rider Skip
        if (data.moveData && data.moveData.isSkip) {
             room.currentTurn = (room.currentTurn === 'W') ? 'B' : 'W';
             socket.to(data.roomCode).emit('receiveMove', data.moveData);
             return;
        }

        if (room.currentTurn !== playerColor) {
            console.log(`[CHEAT DETECTED] Fuori turno!`);
            return; 
        }

        room.currentTurn = (room.currentTurn === 'W') ? 'B' : 'W';
        socket.to(data.roomCode).emit('receiveMove', data.moveData);
    });

    // 4. RESA DEL GIOCATORE
    socket.on('playerResign', (data) => {
        if (activeRooms[data.roomCode]) {
            socket.to(data.roomCode).emit('opponentResigned');
        }
    });

    // 5. DISCONNESSIONI
    socket.on('disconnect', () => {
        console.log('Giocatore disconnesso:', socket.id);
        
        delete rateLimits[socket.id];
        waitingQueueGod = waitingQueueGod.filter(p => p.id !== socket.id);
        waitingQueueClassic = waitingQueueClassic.filter(p => p.id !== socket.id);

        if (socket.roomCode) {
            socket.to(socket.roomCode).emit('opponentDisconnected');
            delete activeRooms[socket.roomCode];
        }
    });
});

const authenticatedDevs = new Set();
const authorizedAdmins = new Set();

io.on('connection', (socket) => {
    socket.on('tryDevMode', (pass) => {
        const SECRET_PASS = "bicocca2026"; 
        if (pass === SECRET_PASS) {
            authenticatedDevs.add(socket.id); 
            socket.emit('devAuthResponse', { success: true });
        } else {
            socket.emit('devAuthResponse', { success: false });
        }
    });

    socket.on('forceOverdrive', () => {
        if (authenticatedDevs.has(socket.id)) io.emit('triggerOverdrive'); 
    });

    socket.on('auth_admin', (pass) => {
        const CHIAVE_SEGRETA = "bicocca2026"; 
        if (pass === CHIAVE_SEGRETA) {
            authorizedAdmins.add(socket.id); 
            socket.emit('admin_verified', { success: true });
        } else {
            socket.emit('admin_verified', { success: false });
        }
    });

    socket.on('disconnect', () => {
        authenticatedDevs.delete(socket.id); 
        authorizedAdmins.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Ultra-Sicuro in ascolto sulla porta ${PORT}`);
});