const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingQueue = []; 
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
            activeRooms[roomCode] = { p1: player1.id, p2: player2.id, turn: 'W', isPrivate: false };
            
            player1.emit('assignTeam', 'W');
            player2.emit('assignTeam', 'B');

            // INVIAMO IL SEME A ENTRAMBI
            io.to(roomCode).emit('gameStart', { 
                p1Name: player1.playerName, 
                p2Name: player2.playerName,
                roomCode: roomCode // <--- ECCO IL FIX SUL SERVER!
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

    // 3. PASSACARTE DELLE MOSSE E ANTI-CHEAT
    socket.on('sendMove', (data) => {
        const room = activeRooms[data.roomCode];
        if (!room) return; // Se la stanza non c'è, ignora.

        // Identifichiamo chi sta cercando di muovere
        const isPlayer1 = socket.id === room.p1; // P1 è il Bianco
        const isPlayer2 = socket.id === room.p2; // P2 è il Nero

        // ANTI-CHEAT: Controllo del Turno Assoluto
        // Se un giocatore prova a muovere quando non è il suo turno, il server lo blocca.
        if ((isPlayer1 && room.turn !== 'W') || (isPlayer2 && room.turn !== 'B')) {
            console.warn(`Hackeraggio sventato! ${socket.id} ha provato a muovere fuori turno.`);
            return; // IGNORA LA MOSSA COMPLETAMENTE
        }

        // ANTI-CHEAT: Validazione Coordinate (Fuori dalla scacchiera)
        const move = data.moveData;
        if (move.fr < 0 || move.fr > 7 || move.fc < 0 || move.fc > 7 || 
            move.tr < 0 || move.tr > 7 || move.tc < 0 || move.tc > 7) {
            console.warn(`Hackeraggio sventato! Mossa fuori dalla scacchiera.`);
            return; 
        }

        // Se la mossa è sicura, passiamo il turno all'avversario sul Server
        room.turn = room.turn === 'W' ? 'B' : 'W';

        // Inoltra la mossa lecita all'avversario
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Ultra-Sicuro in ascolto sulla porta ${PORT}`);
});