const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Carica il gioco dalla cartella "public"
app.use(express.static('public'));

let waitingQueue = []; 
let activeRooms = {};  

function sanitizeString(str) {
    if (!str) return "Sconosciuto";
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().substring(0, 15);
}

io.on('connection', (socket) => {
    console.log('Nuovo giocatore connesso:', socket.id);

    // ==========================================
    // 1. MATCHMAKING GLOBALE (Cerca Partita)
    // ==========================================
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

            player1.join(roomCode);
            player2.join(roomCode);
            activeRooms[roomCode] = { p1: player1.id, p2: player2.id, isPrivate: false };
            player1.roomCode = roomCode;
            player2.roomCode = roomCode;

            player1.emit('assignTeam', 'W');
            player2.emit('assignTeam', 'B');

            io.to(roomCode).emit('gameStart', { p1Name: player1.playerName, p2Name: player2.playerName });
        }
    });

    // ==========================================
    // 2. STANZE PRIVATE (Crea e Unisciti)
    // ==========================================
    // Ascolta quando un giocatore clicca "CREA STANZA"
    socket.on('createRoom', () => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase(); // Codice di 4 lettere
        socket.join(roomCode);
        socket.roomCode = roomCode;
        activeRooms[roomCode] = { p1: socket.id, p2: null, isPrivate: true };
        
        socket.emit('roomCreated', roomCode); // Risponde al client col codice
        socket.emit('assignTeam', 'W');       // Chi crea è sempre il Bianco
        console.log(`Stanza privata creata: ${roomCode}`);
    });

    // Ascolta quando un giocatore inserisce un codice e clicca "ENTRA"
    socket.on('joinRoom', (code) => {
        const roomCode = typeof code === 'string' ? code.toUpperCase() : code.roomCode.toUpperCase();
        
        if (activeRooms[roomCode] && !activeRooms[roomCode].p2) {
            socket.join(roomCode);
            socket.roomCode = roomCode;
            activeRooms[roomCode].p2 = socket.id;
            
            socket.emit('assignTeam', 'B'); // Chi entra è sempre il Nero
            
            // La stanza è piena, avvia la partita per entrambi!
            io.to(roomCode).emit('gameStart', { p1Name: "HOST", p2Name: "GUEST" });
            console.log(`Giocatore entrato nella stanza privata: ${roomCode}`);
        } else {
            // Se la stanza non esiste o è già piena
            socket.emit('error', 'Stanza inesistente o già piena!');
        }
    });

    // ==========================================
    // 3. PASSACARTE DELLE MOSSE E DISCONNESSIONI
    // ==========================================
    socket.on('sendMove', (data) => {
        socket.to(data.roomCode).emit('receiveMove', data.moveData);
    });

    socket.on('disconnect', () => {
        console.log('Giocatore disconnesso:', socket.id);
        waitingQueue = waitingQueue.filter(p => p.id !== socket.id);

        if (socket.roomCode) {
            socket.to(socket.roomCode).emit('opponentDisconnected');
            delete activeRooms[socket.roomCode];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});