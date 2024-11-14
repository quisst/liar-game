const socket = io();

let players = [];
let currentPlayerIndex = 0;
let timer;
const timeLimit = 30;

socket.on("gameStarted", (playerData) => {
    players = playerData;
    console.log(players);
    resetGameUI();
    updatePlayersUI();
    updateTurn(currentPlayerIndex);
    startTimer();
});

function updatePlayersUI() {
    const playersSection = document.getElementById("playersSection");
    playersSection.innerHTML = "";

    players.forEach((player, index) => {
        const playerDiv = document.createElement("div");
        playerDiv.classList.add("player");
        playerDiv.id = `player${index + 1}`;
        playerDiv.innerHTML = `
            <p class="player-name">${player.nickname}</p>
            <p class="player-word">설명 단어: <span id="wordInput${index}"></span></p>
        `;
        playersSection.appendChild(playerDiv);
    });
}

function updateTurn(index) {
    document.querySelectorAll(".player").forEach((playerDiv, i) => {
        const wordElement = playerDiv.querySelector(".player-word span");
        if (i === index) {
            wordElement.disabled = false;
            document.getElementById("turnMessage").innerText = `${
                playerDiv.querySelector(".player-name").innerText
            }님이 단어를 설명하실 차례입니다.`;
        } else {
            wordElement.disabled = true;
        }
    });
}

function startTimer() {
    let timeLeft = timeLimit;
    document.getElementById("timeLeft").innerText = timeLeft;

    timer = setInterval(() => {
        timeLeft--;
        document.getElementById("timeLeft").innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            document.getElementById(`explainWord`).value = "";
            nextTurn();
        }
    }, 1000);
}

document.getElementById("sendExplain").addEventListener("click", () => {
    const word = document.getElementById("explainWord").value;
    socket.emit("submitWord", word);
    nextTurn();
});

function nextTurn() {
    clearInterval(timer);
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    updateTurn(currentPlayerIndex);
    startTimer();
}

socket.on("votingPhase", () => {
    updateGameUI("voting");
});

document.getElementById("submitVote").addEventListener("click", () => {
    const votedPlayer = document.getElementById("voteSelect").value;
    socket.emit("submitVote", { votedPlayer });
});

socket.on("defenseChance", () => {
    document.querySelectorAll(".player-word-input").forEach((input) => {
        input.disabled = true;
    });
    document.getElementById(`explainWord`).disabled = false;
    startTimer();
});

document.getElementById("defenseButton").addEventListener("click", () => {
    const defenseMessage = document.getElementById("defenseInput").value;
    socket.emit("submitDefense", { defenseMessage });
    document.getElementById("defenseButton").disabled = true;
});

socket.on("finalVotePhase", () => {
    document.getElementById("finalVoteSection").style.display = "block";
});

document.getElementById("submitFinalVote").addEventListener("click", () => {
    const verdict = document.querySelector(
        'input[name="verdict"]:checked'
    ).value;
    socket.emit("finalVote", { verdict });
});

socket.on("roundResult", ({ result, message }) => {
    document.getElementById("roundResultMessage").innerText = message;
    updatePlayerScores(result);
});

document.getElementById("sendMessage").addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        const message = document.getElementById("message").value;
        socket.emit("sendMessage", { room: currentRoom, message });
        document.getElementById("message").value = "";
    }
});

socket.on("receiveMessage", ({ message, color }) => {
    const messageElement = document.createElement("div");
    const [nickname, ...rest] = message.split(": ");
    messageElement.innerHTML = `<span style="color: ${color}">${nickname}</span>: ${rest.join(
        ": "
    )}`;
    document.getElementById("messages").appendChild(messageElement);
});

function resetGameUI() {
    document.getElementById("inputSection").style.display = "none";
    document.getElementById("finalVoteSection").style.display = "none";
    document.getElementById("roundResultSection").style.display = "none";
}

function updateGameUI(stage) {
    switch (stage) {
        case "wordSubmission":
            document.getElementById("inputSection").style.display = "block";
            break;
        case "voting":
            document.getElementById("voteSection").style.display = "block";
            break;
        case "defense":
            document.getElementById("defenseSection").style.display = "block";
            break;
        case "finalVote":
            document.getElementById("finalVoteSection").style.display = "block";
            break;
        case "roundResult":
            document.getElementById("roundResultSection").style.display =
                "block";
            break;
    }
}
