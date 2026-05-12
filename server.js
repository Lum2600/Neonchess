const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Dice al server di caricare il gioco dalla cartella "public"
app.use(express.static('public'));

// ==========================================
// VARIABILI GLOBALI DEL SERVER
// ==========================================
let waitingQueue = []; // Coda per chi cerca partita
let activeRooms = {};  // Stanze in corso

// 1. PILASTRO: SANITIZZAZIONE INPUT (Addio hacker XSS!)
function sanitizeString(str) {
    if (!str) return "Sconosciuto";
    // Sostituisce i caratteri pericolosi e taglia il nome a 15 caratteri massimi
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().substring(0, 15);
}

io.on('connection', (socket) => {
    console.log('Nuovo giocatore connesso:', socket.id);

    // ==========================================
    // 2. PILASTRO: MATCHMAKING CASUALE
    // ==========================================
    socket.on('findMatch', (username) => {
        const cleanName = sanitizeString(username);
        socket.playerName = cleanName; // Salviamo il nome sicuro in memoria

        // Evitiamo che un giocatore clicchi 10 volte e si metta in coda con se stesso
        if (!waitingQueue.find(p => p.id === socket.id)) {
            waitingQueue.push(socket);
        }
        
        console.log(`Giocatori in coda: ${waitingQueue.length}`);

        // Il Matchmaker controlla: siamo almeno in 2?
        if (waitingQueue.length >= 2) {
            // Estraiamo i primi due in fila
            const player1 = waitingQueue.shift();
            const player2 = waitingQueue.shift();

            // Creiamo un codice stanza segreto e casuale
            const roomCode = 'MATCH_' + Math.random().toString(36).substring(2, 8).toUpperCase();

            // Sbattiamoli entrambi nella stanza
            player1.join(roomCode);
            player2.join(roomCode);

            // Registriamo la stanza e chi c'è dentro
            activeRooms[roomCode] = { p1: player1.id, p2: player2.id };
            player1.roomCode = roomCode;
            player2.roomCode = roomCode;

            // Assegniamo i colori (P1 = Bianco, P2 = Nero)
            player1.emit('assignTeam', 'W');
            player2.emit('assignTeam', 'B');

            // Avviamo la partita inviando i nomi a entrambi
            io.to(roomCode).emit('gameStart', {
                p1Name: player1.playerName,
                p2Name: player2.playerName
            });

            console.log(`Partita iniziata! Stanza segreta: ${roomCode}`);
        }
    });

    // Passacarte delle mosse
    socket.on('sendMove', (data) => {
        socket.to(data.roomCode).emit('receiveMove', data.moveData);
    });

    // ==========================================
    // 3. PILASTRO: GESTIONE SPIETATA DISCONNESSIONI
    // ==========================================
    socket.on('disconnect', () => {
        console.log('Giocatore disconnesso:', socket.id);

        // Se era in coda a cercare partita, togliamolo
        waitingQueue = waitingQueue.filter(p => p.id !== socket.id);

        // Se era in partita, avvisiamo l'avversario e polverizziamo la stanza
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