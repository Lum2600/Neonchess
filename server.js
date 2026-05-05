const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Diciamo al server di "servire" i file della cartella 'public' (il tuo index.html, musica, ecc.)
app.use(express.static('public'));

// Oggetto per memorizzare le stanze di gioco
const rooms = {};

// Quando un utente si collega al sito...
io.on('connection', (socket) => {
    console.log('Un utente si è connesso:', socket.id);

    // Quando un utente clicca "Crea Partita"
    socket.on('createRoom', () => {
        // Genera un codice di 4 caratteri (es. A4B9)
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        rooms[roomCode] = { players: [socket.id] };
        socket.join(roomCode); // Il giocatore entra nella stanza
        
        socket.emit('roomCreated', roomCode);
        socket.emit('assignTeam', 'W'); // Chi crea la stanza è sempre il BIANCO
        
        console.log(`Stanza creata: ${roomCode} dal player ${socket.id}`);
    });

    // Quando un utente inserisce il codice per entrare
    socket.on('joinRoom', (roomCode) => {
        // Se la stanza esiste e c'è solo 1 giocatore in attesa...
        if (rooms[roomCode] && rooms[roomCode].players.length === 1) {
            rooms[roomCode].players.push(socket.id);
            socket.join(roomCode);
            
            socket.emit('assignTeam', 'B'); // Il secondo giocatore è il NERO
            
            // Avvisiamo entrambi i giocatori nella stanza che la partita inizia!
            io.to(roomCode).emit('gameStart');
            console.log(`Player ${socket.id} entrato nella stanza ${roomCode}`);
        } else {
            socket.emit('errorMsg', 'Stanza piena o inesistente!');
        }
    });

    // Quando un giocatore muove un pezzo, riceve i dati e li passa all'avversario
    socket.on('sendMove', (data) => {
        // "broadcast.to" manda il pacchetto a tutti nella stanza TRANNE a chi l'ha inviato
        socket.broadcast.to(data.roomCode).emit('receiveMove', data.moveData);
    });

    // Quando un giocatore chiude la pagina o gli cade la connessione
    socket.on('disconnect', () => {
        console.log('Utente disconnesso:', socket.id);
        
        // Cerchiamo in quale stanza era e avvisiamo l'altro giocatore
        for (const roomCode in rooms) {
            if (rooms[roomCode].players.includes(socket.id)) {
                io.to(roomCode).emit('opponentDisconnected');
                delete rooms[roomCode]; // Chiudiamo la stanza per pulizia
                break;
            }
        }
    });
});

// Avviamo il server sulla porta 3000 (o quella fornita dal servizio di hosting in futuro)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server online! Vai su http://localhost:${PORT}`);
});