const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {};
let playerScores = {};
const colors = [
    "#8B0000",
    "#006400",
    "#00008B",
    "#FFD700",
    "#FF4500",
    "#4B0082",
    "#A0522D",
    "#2F4F4F",
];

app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {
    socket.on("setNickname", (nickname) => {
        socket.nickname = nickname;
        io.emit(
            "roomList",
            Object.keys(rooms).map((room) => ({
                room,
                playerCount: rooms[room].players.length,
                maxPlayers: 8,
            }))
        );
    });

    socket.on("createRoom", () => {
        const room = `Room ${Math.floor(Math.random() * 1000)}`;
        rooms[room] = { players: [], votes: {}, roundCount: 0, liar: null };
        io.emit(
            "roomList",
            Object.keys(rooms).map((room) => ({
                room,
                playerCount: rooms[room].players.length,
                maxPlayers: 8,
            }))
        );
        io.to(room).emit("roomInfo", rooms[room]);
    });

    socket.on("joinRoom", (room) => {
        if (rooms[room]) {
            if (!rooms[room].players.some((p) => p.id === socket.id)) {
                socket.join(room);
                rooms[room].players.push({
                    id: socket.id,
                    nickname: socket.nickname,
                });
                const randomColor =
                    colors[rooms[room].players.length % colors.length];
                socket.color = randomColor;
            }
            io.to(room).emit("receiveMessage", {
                message: `<b style="color: ${socket.color}">${socket.nickname}</b>님이 로비에 들어왔습니다.`,
                color: "#000000",
            });
            io.to(room).emit("roomInfo", { players: rooms[room].players });
            io.emit(
                "roomList",
                Object.keys(rooms).map((room) => ({
                    room,
                    playerCount: rooms[room].players.length,
                    maxPlayers: 8,
                }))
            );
        }
    });

    socket.on("leaveRoom", (room) => {
        if (rooms[room]) {
            const idx = rooms[room].players.findIndex(
                (p) => p.id === socket.id
            );
            if (idx !== -1) {
                rooms[room].players.splice(idx, 1);
                io.to(room).emit(
                    "receiveMessage",
                    `<b style="color: ${socket.color}">${socket.nickname}</b>님이 로비에서 나갔습니다.`
                );
                io.to(room).emit("updateRoomInfo", {
                    players: rooms[room].players,
                });
                io.emit(
                    "roomList",
                    Object.keys(rooms).map((room) => ({
                        room,
                        playerCount: rooms[room].players.length,
                        maxPlayers: 8,
                    }))
                );
            }
        }
    });

    socket.on("disconnect", () => {
        for (let room in rooms) {
            const idx = rooms[room].players.indexOf(socket.id);
            if (idx !== -1) {
                rooms[room].players.splice(idx, 1);
                io.to(room).emit(
                    "receiveMessage",
                    `<b style="color: ${socket.color}">${socket.nickname}</b>님이 로비에서 나갔습니다.`
                );
                io.to(room).emit("updateroomInfo", {
                    players: rooms[room].players,
                });
            }
            io.emit(
                "roomList",
                Object.keys(rooms).map((room) => ({
                    room,
                    playerCount: rooms[room].players.length,
                    maxPlayers: 8,
                }))
            );
        }
    });

    socket.on("sendMessage", ({ room, message }) => {
        const nickname = socket.nickname;
        const color = socket.color;
        io.to(room).emit("receiveMessage", {
            message: `<b>${nickname}</b>: ${message}`,
            color: color,
        });
    });

    socket.on("startGame", (room) => {
        const players = rooms[room].players
            .map((player) => {
                const playerSocket = io.sockets.sockets.get(player.id);
                if (playerSocket) {
                    return {
                        id: player.id,
                        nickname: playerSocket.nickname,
                    };
                } else {
                    console.error(
                        `Socket not found for player ID: ${player.id}`
                    );
                    return null;
                }
            })
            .filter((player) => player !== null);

        const liarIndex = Math.floor(Math.random() * players.length);
        const liar = players[liarIndex].id;
        rooms[room].liar = liar;

        players.forEach((player) => {
            if (player.id === liar) {
                io.to(player.id).emit("roleAssigned", { role: "liar" });
            } else {
                io.to(player.id).emit("roleAssigned", { role: "citizen" });
            }
        });

        io.to(room).emit("gameStarted");
    });

    socket.on("submitWord", (word) => {
        const room = Object.keys(socket.rooms).find((r) => r !== socket.id);
        io.to(room).emit("wordSubmitted", { player: socket.nickname, word });
    });

    socket.on("submitVote", ({ votedPlayer }) => {
        const room = Object.keys(socket.rooms).find((r) => r !== socket.id);
        const roomData = rooms[room];
        roomData.votes[votedPlayer] = (roomData.votes[votedPlayer] || 0) + 1;
        io.to(room).emit("votingResult", {
            votedPlayer,
            message: `${votedPlayer} has the most votes!`,
        });
    });

    socket.on("executionResult", ({ room, executedPlayer, isLiar }) => {
        const roomData = rooms[room];
        if (isLiar) {
            playerScores[executedPlayer] =
                (playerScores[executedPlayer] || 0) - 1;
            io.to(room).emit("roundResult", {
                result: "citizensWin",
                message: "Citizens win!",
            });
        } else {
            const liar = roomData.liar;
            playerScores[liar] = (playerScores[liar] || 0) + 1;
            io.to(room).emit("roundResult", {
                result: "liarWins",
                message: "Liar wins!",
            });
        }
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});
