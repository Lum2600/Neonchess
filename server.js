const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    console.log('Un utente si è connesso:', socket.id);

    // Quando un utente clicca "Crea Partita" (Player 1 - Bianco)
    socket.on('createRoom', (username) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

        // Salviamo anche l'username
        rooms[roomCode] = {
            players: [socket.id],
            usernames: { [socket.id]: username || "Player 1" }
        };

        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        socket.emit('assignTeam', 'W');

        console.log(`Stanza creata: ${roomCode} dal player ${username}`);
    });

    // Quando un utente entra (Player 2 - Nero)
    socket.on('joinRoom', (data) => {
        const roomCode = data.code;
        const username = data.username || "Player 2";

        if (rooms[roomCode] && rooms[roomCode].players.length === 1) {
            rooms[roomCode].players.push(socket.id);
            rooms[roomCode].usernames[socket.id] = username;

            socket.join(roomCode);
            socket.emit('assignTeam', 'B');

            // Recuperiamo i due nomi
            const p1Id = rooms[roomCode].players[0];
            const p2Id = socket.id;
            const p1Name = rooms[roomCode].usernames[p1Id];
            const p2Name = username;

            // Inviamo l'ordine di inizio partita con i nomi completi!
            io.to(roomCode).emit('gameStart', {
                p1Name: p1Name,
                p2Name: p2Name
            });

            console.log(`Player ${username} entrato nella stanza ${roomCode}`);
        } else {
            socket.emit('errorMsg', 'Stanza piena o codice errato!');
        }
    });

    socket.on('sendMove', (data) => {
        socket.broadcast.to(data.roomCode).emit('receiveMove', data.moveData);
    });

    socket.on('disconnect', () => {
        console.log('Utente disconnesso:', socket.id);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players.includes(socket.id)) {
                io.to(roomCode).emit('opponentDisconnected');
                delete rooms[roomCode];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server online! Vai su http://localhost:${PORT}`);
});