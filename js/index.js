const socket = io();

const nicknameInput = document.getElementById("nicknameInput");
const nicknameSubmit = document.getElementById("nicknameSubmit");
const roomList = document.getElementById("roomList");
const createRoomButton = document.getElementById("createRoom");
const lobby = document.getElementById("lobby");

nicknameSubmit.addEventListener("click", () => {
    const nickname = nicknameInput.value.trim();
    if (nickname) {
        localStorage.setItem("nickname", nickname);
        socket.emit("setNickname", nickname);
        document.getElementById("nicknameSection").style.display = "none";
        document.getElementById("gameRoomSection").style.display = "block";
        document.getElementById("gameRoomSection").style.width = "1000px";
        document.getElementById("gameRoomSection").style.margin = "0 auto";
        document.getElementById("gameRoomSection").style.marginTop = "200px";
    } else {
        alert("Please enter a valid nickname.");
    }
});

createRoomButton.addEventListener("click", () => {
    socket.emit("createRoom");
});

socket.on("roomList", (rooms) => {
    roomList.innerHTML = "";
    rooms.forEach(({ room, playerCount, maxPlayers }) => {
        const li = document.createElement("li");
        li.textContent = `${room} (${playerCount}/${maxPlayers})`;
        const joinButton = document.createElement("button");
        joinButton.textContent = "Join";
        joinButton.addEventListener("click", () => {
            window.location.href = `lobby.html?room=${room}`;
        });
        li.appendChild(joinButton);
        roomList.appendChild(li);
    });
});
