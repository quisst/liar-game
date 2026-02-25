const socket = io();

// 현재 방 정보
const urlParams = new URLSearchParams(window.location.search);
const currentRoom = urlParams.get("room");

// 기본 상태
let players = [];
let currentPlayerIndex = 0;
let timer;
const timeLimit = 30;

// 닉네임/방 재설정 (새로고침 대응)
const nickname = localStorage.getItem("nickname");
if (nickname) {
    socket.emit("setNickname", nickname);
}
if (currentRoom) {
    socket.emit("joinRoom", currentRoom);
}

// 역할/제시어 정보 수신
socket.on("roleInfo", ({ role, keyword }) => {
    const roleInfo = document.getElementById("roleInfo");
    const keywordSpan = document.getElementById("keyword");

    if (role === "liar") {
        roleInfo.innerText = "당신은 라이어입니다. 제시어를 모르는 척 설명해 보세요!";
        keywordSpan.innerText = "비밀";
    } else {
        roleInfo.innerText = "당신은 시민입니다. 제시어를 들키지 않게 설명해 보세요!";
        keywordSpan.innerText = keyword || "";
    }
});

// 게임 시작: 플레이어 목록 수신
socket.on("gameStarted", (playerData) => {
    players = playerData;
    resetGameUI();
    updatePlayersUI();
    populateVoteOptions();
    updateTurn(currentPlayerIndex);
    startTimer();
    document.getElementById("currentStage").innerText = "단어 설명 단계";
    document.getElementById("inputSection").style.display = "block";
});

// 로비에서 재접속한 경우 roomInfo 로도 플레이어 목록 갱신
socket.on("roomInfo", ({ players: roomPlayers }) => {
    players = roomPlayers;
    updatePlayersUI();
    populateVoteOptions();
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
            <p class="player-word">설명 단어: <span id="wordDisplay${index}"></span></p>
        `;
        playersSection.appendChild(playerDiv);
    });
}

function populateVoteOptions() {
    const voteSelect = document.getElementById("voteSelect");
    if (!voteSelect) return;
    voteSelect.innerHTML = "";

    players.forEach((player) => {
        const option = document.createElement("option");
        option.value = player.nickname;
        option.textContent = player.nickname;
        voteSelect.appendChild(option);
    });
}

function updateTurn(index) {
    const playerDivs = document.querySelectorAll(".player");
    if (!playerDivs.length) return;

    playerDivs.forEach((playerDiv, i) => {
        if (i === index) {
            document.getElementById("turnMessage").innerText = `${
                playerDiv.querySelector(".player-name").innerText
            }님이 단어를 설명하실 차례입니다.`;
        }
    });
}

function startTimer() {
    let timeLeft = timeLimit;
    document.getElementById("timeLeft").innerText = timeLeft;

    clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        document.getElementById("timeLeft").innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            document.getElementById("explainWord").value = "";
            nextTurn();
        }
    }, 1000);
}

document.getElementById("sendExplain").addEventListener("click", () => {
    const wordInput = document.getElementById("explainWord");
    const word = wordInput.value.trim();
    if (!word) return;
    socket.emit("submitWord", word);
    wordInput.value = "";
    nextTurn();
});

// 다른 플레이어의 설명 단어 표시
socket.on("wordSubmitted", ({ player, word }) => {
    const index = players.findIndex((p) => p.nickname === player);
    if (index !== -1) {
        const span = document.getElementById(`wordDisplay${index}`);
        if (span) {
            span.innerText = word;
        }
    }
});

function nextTurn() {
    if (!players.length) return;
    clearInterval(timer);
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;

    if (currentPlayerIndex === 0) {
        // 한 바퀴 돌았으면 투표 단계로
        document.getElementById("currentStage").innerText = "투표 단계";
        document.getElementById("inputSection").style.display = "none";
        document.getElementById("voteSection").style.display = "block";
        return;
    }

    updateTurn(currentPlayerIndex);
    startTimer();
}

// 투표 전송
document.getElementById("submitVote").addEventListener("click", () => {
    const votedPlayer = document.getElementById("voteSelect").value;
    if (!votedPlayer) return;
    socket.emit("submitVote", { votedPlayer });
    document.getElementById("submitVote").disabled = true;
});

// 투표 결과 또는 재투표 안내
socket.on("votingResult", ({ message }) => {
    document.getElementById("currentStage").innerText = "투표 결과";
    const roundResultMessage = document.getElementById("roundResultMessage");
    if (roundResultMessage) {
        roundResultMessage.innerText = message;
        document.getElementById("roundResultSection").style.display = "block";
    }
    // 재투표 안내 후에는 다시 투표 가능하게 버튼 활성화
    document.getElementById("submitVote").disabled = false;
});

// 라운드 최종 결과
socket.on("roundResult", ({ result, message }) => {
    document.getElementById("currentStage").innerText = "라운드 결과";
    document.getElementById("roundResultMessage").innerText = message;
    document.getElementById("roundResultSection").style.display = "block";
    document.getElementById("voteSection").style.display = "none";
    // 다음 라운드 버튼 표시
    const nextBtn = document.getElementById("nextRoundButton");
    if (nextBtn) {
        nextBtn.style.display = "inline-block";
    }
});

// 점수판 업데이트
socket.on("scoreUpdate", (scores) => {
    const scoreList = document.getElementById("scoreList");
    if (!scoreList) return;
    scoreList.innerHTML = "";

    players.forEach((player) => {
        const li = document.createElement("li");
        const score = scores[player.nickname] || 0;
        li.textContent = `${player.nickname}: ${score}점`;
        scoreList.appendChild(li);
    });
});

// 채팅 입력
document.getElementById("sendMessage").addEventListener("click", () => {
    const input = document.getElementById("message");
    const message = input.value.trim();
    if (!message) return;
    socket.emit("sendMessage", { room: currentRoom, message });
    input.value = "";
});

document
    .getElementById("message")
    .addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            const message = event.target.value.trim();
            if (!message) return;
            socket.emit("sendMessage", { room: currentRoom, message });
            event.target.value = "";
            event.preventDefault();
        }
    });

// 채팅 수신
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
    document.getElementById("voteSection").style.display = "none";
    document.getElementById("finalVoteSection").style.display = "none";
    document.getElementById("roundResultSection").style.display = "none";
    const nextBtn = document.getElementById("nextRoundButton");
    if (nextBtn) {
        nextBtn.style.display = "none";
    }
}

// 다음 라운드 시작
const nextRoundButton = document.getElementById("nextRoundButton");
if (nextRoundButton) {
    nextRoundButton.addEventListener("click", () => {
        if (!currentRoom) return;
        currentPlayerIndex = 0;
        socket.emit("nextRound", currentRoom);
    });
}
