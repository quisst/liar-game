const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const keywords = require("./keywords");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 방별 게임 상태
// rooms[room] = {
//   players: [{ id, nickname, color }],
//   liar: '닉네임',
//   keyword: '제시어',
//   votes: { [nickname]: count },
//   votedCount: number,
//   votesRound: 1 | 2,
//   gameStarted: boolean
// }
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
        // 닉네임만 설정해도 로비 방 목록 갱신
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
        rooms[room] = {
            players: [],
            votes: {},
            votedCount: 0,
            votesRound: 1,
            liar: null,
            keyword: null,
            gameStarted: false,
        };
        io.emit(
            "roomList",
            Object.keys(rooms).map((room) => ({
                room,
                playerCount: rooms[room].players.length,
                maxPlayers: 8,
            }))
        );
    });

    socket.on("joinRoom", (room) => {
        if (!rooms[room]) return;

        socket.join(room);

        const roomData = rooms[room];

        // 같은 닉네임이 이미 있으면 소켓 ID와 색만 교체 (새로고침 대응)
        let player = roomData.players.find(
            (p) => p.nickname === socket.nickname
        );

        if (!player) {
            const randomColor =
                colors[roomData.players.length % colors.length];
            socket.color = randomColor;
            player = {
                id: socket.id,
                nickname: socket.nickname,
                color: randomColor,
            };
            roomData.players.push(player);
        } else {
            socket.color = player.color;
            player.id = socket.id;
        }

        io.to(room).emit("receiveMessage", {
            message: `<b style="color: ${socket.color}">${socket.nickname}</b>님이 로비에 들어왔습니다.`,
            color: "#000000",
        });

        io.to(room).emit("roomInfo", { players: roomData.players });

        io.emit(
            "roomList",
            Object.keys(rooms).map((room) => ({
                room,
                playerCount: rooms[room].players.length,
                maxPlayers: 8,
            }))
        );

        // 이미 게임이 시작된 방에 재접속한 경우, 역할/제시어 정보 다시 전달
        if (roomData.gameStarted) {
            const role =
                roomData.liar === socket.nickname ? "liar" : "citizen";
            socket.emit("roleInfo", {
                role,
                keyword: role === "citizen" ? roomData.keyword : null,
            });
            socket.emit("gameStarted", roomData.players);
        }
    });

    socket.on("leaveRoom", (room) => {
        const roomData = rooms[room];
        if (!roomData) return;

        const idx = roomData.players.findIndex(
            (p) => p.nickname === socket.nickname
        );
        if (idx !== -1) {
            const [leftPlayer] = roomData.players.splice(idx, 1);
            io.to(room).emit("receiveMessage", {
                message: `<b style="color: ${leftPlayer.color}">${leftPlayer.nickname}</b>님이 로비에서 나갔습니다.`,
                color: "#000000",
            });
            io.to(room).emit("updateRoomInfo", {
                players: roomData.players,
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
    });

    socket.on("disconnect", () => {
        for (const room in rooms) {
            const roomData = rooms[room];
            const idx = roomData.players.findIndex(
                (p) => p.nickname === socket.nickname
            );
            if (idx !== -1) {
                const [leftPlayer] = roomData.players.splice(idx, 1);
                io.to(room).emit("receiveMessage", {
                    message: `<b style="color: ${leftPlayer.color}">${leftPlayer.nickname}</b>님이 로비에서 나갔습니다.`,
                    color: "#000000",
                });
                io.to(room).emit("updateRoomInfo", {
                    players: roomData.players,
                });
            }
        }

        io.emit(
            "roomList",
            Object.keys(rooms).map((room) => ({
                room,
                playerCount: rooms[room].players.length,
                maxPlayers: 8,
            }))
        );
    });

    socket.on("sendMessage", ({ room, message }) => {
        const nickname = socket.nickname;
        const color = socket.color || "#000000";
        io.to(room).emit("receiveMessage", {
            message: `<b>${nickname}</b>: ${message}`,
            color: color,
        });
    });

    socket.on("startGame", (room) => {
        startRound(room);
    });

    socket.on("nextRound", (room) => {
        startRound(room);
    });

    socket.on("submitWord", (word) => {
        const room = Object.keys(socket.rooms).find((r) => r !== socket.id);
        if (!room) return;
        io.to(room).emit("wordSubmitted", {
            player: socket.nickname,
            word,
        });
    });

    socket.on("submitVote", ({ votedPlayer }) => {
        const room = Object.keys(socket.rooms).find((r) => r !== socket.id);
        if (!room) return;
        const roomData = rooms[room];
        if (!roomData || !roomData.gameStarted) return;

        roomData.votes[votedPlayer] =
            (roomData.votes[votedPlayer] || 0) + 1;
        roomData.votedCount = (roomData.votedCount || 0) + 1;

        const totalPlayers = roomData.players.length;
        if (roomData.votedCount < totalPlayers) {
            return;
        }

        // 모든 플레이어 투표 완료 → 결과 집계
        let maxVotes = 0;
        let candidates = [];
        for (const [nickname, count] of Object.entries(roomData.votes)) {
            if (count > maxVotes) {
                maxVotes = count;
                candidates = [nickname];
            } else if (count === maxVotes) {
                candidates.push(nickname);
            }
        }

        // 투표 상태 초기화
        roomData.votes = {};
        roomData.votedCount = 0;

        if (candidates.length === 1) {
            // 단일 최다 득표자 → 즉시 처형
            const executedPlayer = candidates[0];
            const isLiar = executedPlayer === roomData.liar;
            handleExecutionResult(room, executedPlayer, isLiar);
        } else {
            // 동률인 경우
            if (roomData.votesRound === 1) {
                roomData.votesRound = 2;
                io.to(room).emit("votingResult", {
                    votedPlayer: null,
                    message: `동률입니다. 다음 후보들 중에서 다시 한 번 투표하세요: ${candidates.join(
                        ", "
                    )}`,
                    tie: true,
                });
            } else {
                // 두 번째 투표에서도 동률 → 처형 실패, 라이어 승리
                const liarNickname = roomData.liar;
                playerScores[liarNickname] =
                    (playerScores[liarNickname] || 0) + 1;
                io.to(room).emit("roundResult", {
                    result: "liarWins",
                    message:
                        "두 번의 투표 모두 동률입니다. 처형에 실패했고, 라이어가 승리했습니다!",
                });
                // 점수판 업데이트
                const roomScores = {};
                roomData.players.forEach((p) => {
                    roomScores[p.nickname] =
                        playerScores[p.nickname] || 0;
                });
                io.to(room).emit("scoreUpdate", roomScores);
                roomData.votesRound = 1;
            }
        }
    });

    socket.on("executionResult", ({ room, executedPlayer, isLiar }) => {
        handleExecutionResult(room, executedPlayer, isLiar);
    });
});

function startRound(room) {
    const roomData = rooms[room];
    if (!roomData) return;

    const players = roomData.players;
    if (players.length < 4) return; // 최소 인원 검증

    // 라이어/제시어 선정
    const liarIndex = Math.floor(Math.random() * players.length);
    const liarPlayer = players[liarIndex];
    const liarNickname = liarPlayer.nickname;
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];

    roomData.liar = liarNickname;
    roomData.keyword = keyword;
    roomData.votes = {};
    roomData.votedCount = 0;
    roomData.votesRound = 1;
    roomData.gameStarted = true;

    // 각 플레이어에게 역할 및 제시어 전달
    players.forEach((player) => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (!playerSocket) return;
        const role = player.nickname === liarNickname ? "liar" : "citizen";
        playerSocket.emit("roleInfo", {
            role,
            keyword: role === "citizen" ? keyword : null,
        });
    });

    // 게임 시작 및 플레이어 목록 전송
    io.to(room).emit(
        "gameStarted",
        players.map((p) => ({ nickname: p.nickname }))
    );
}

function handleExecutionResult(room, executedPlayer, isLiar) {
    const roomData = rooms[room];
    if (!roomData) return;

    if (isLiar) {
        // 시민 승리
        Object.values(roomData.players).forEach((player) => {
            if (player.nickname !== roomData.liar) {
                playerScores[player.nickname] =
                    (playerScores[player.nickname] || 0) + 1;
            }
        });
        io.to(room).emit("roundResult", {
            result: "citizensWin",
            message: `${executedPlayer}님은 라이어였습니다! 시민 승리!`,
        });
    } else {
        // 라이어 승리
        const liarNickname = roomData.liar;
        playerScores[liarNickname] =
            (playerScores[liarNickname] || 0) + 1;
        io.to(room).emit("roundResult", {
            result: "liarWins",
            message: `${executedPlayer}님은 라이어가 아니었습니다... 라이어 승리!`,
        });
    }

    // 점수판 업데이트
    const roomScores = {};
    roomData.players.forEach((p) => {
        roomScores[p.nickname] = playerScores[p.nickname] || 0;
    });
    io.to(room).emit("scoreUpdate", roomScores);

    // 다음 라운드를 위해 일부 상태 초기화
    roomData.votes = {};
    roomData.votedCount = 0;
    roomData.votesRound = 1;
    roomData.gameStarted = false;
}

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});
