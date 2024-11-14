const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const room = urlParams.get("room");
const roomTitle = document.getElementById("roomTitle");
roomTitle.textContent = `${room} Lobby`;

const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendMessage = document.getElementById("sendMessage");
const leaveRoomButton = document.getElementById("leaveRoom");
const startGameButton = document.getElementById("startGame");

const nickname = localStorage.getItem("nickname");
if (nickname) {
    socket.emit("setNickname", nickname);
}

socket.emit("joinRoom", room);

socket.on("roomInfo", ({ players }) => {
    const playerCount = players.length;
    const maxPlayers = 8;
    document.getElementById(
        "playerCount"
    ).textContent = `Players: ${playerCount}/${maxPlayers}`;

    const participantList = document.getElementById("participantList");
    participantList.innerHTML = "";
    players.forEach((players) => {
        const li = document.createElement("li");
        li.textContent = players.nickname;
        participantList.appendChild(li);
    });

    if (playerCount >= 4) {
        startGameButton.style.display = "block";
    } else {
        startGameButton.style.display = "none";
    }
});

socket.on("updateRoomInfo", ({ players }) => {
    const playerCount = players.length;
    const maxPlayers = 8;
    document.getElementById(
        "playerCount"
    ).textContent = `Players: ${playerCount}/${maxPlayers}`;

    const participantList = document.getElementById("participantList");
    participantList.innerHTML = "";
    players.forEach((players) => {
        const li = document.createElement("li");
        li.textContent = players.nickname;
        participantList.appendChild(li);
    });

    if (playerCount >= 4) {
        startGameButton.style.display = "block";
    } else {
        startGameButton.style.display = "none";
    }
});

sendMessage.addEventListener("click", () => {
    const message = messageInput.value;
    socket.emit("sendMessage", { room, message });
    messageInput.value = "";
});

messageInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        const message = messageInput.value;
        socket.emit("sendMessage", { room, message });
        messageInput.value = "";
        event.preventDefault();
    }
});

socket.on("receiveMessage", ({ message, color }) => {
    const messageElement = document.createElement("div");
    const [nickname, ...rest] = message.split(": ");
    messageElement.innerHTML = `<span style="color: ${color}">${nickname}</span>: ${rest.join(
        ": "
    )}`;
    messages.appendChild(messageElement);
});

leaveRoomButton.addEventListener("click", () => {
    socket.emit("leaveRoom", room);
    window.location.href = "index.html";
});

startGameButton.addEventListener("click", () => {
    socket.emit("startGame", room);
});

socket.on("gameStarted", () => {
    window.location.href = "game.html";
});
