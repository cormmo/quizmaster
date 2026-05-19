const points = [100, 200, 300, 400, 500];
const sampleTopics = ["Science", "History", "Movies", "Sports", "Music"];
const storageKey = "quizmaster-board";
const themeStorageKey = "quizmaster-theme";

const form = document.querySelector("#topic-form");
const playerForm = document.querySelector("#player-form");
const topicsInput = document.querySelector("#topics");
const playerNameInput = document.querySelector("#player-name");
const sampleButton = document.querySelector("#sample-topics");
const resetButton = document.querySelector("#reset-board");
const themeToggle = document.querySelector("#theme-toggle");
const board = document.querySelector("#board");
const boardCount = document.querySelector("#board-count");
const scoreboard = document.querySelector("#scoreboard");
const emptyTemplate = document.querySelector("#empty-state-template");
const creditDialog = document.querySelector("#credit-dialog");
const creditForm = document.querySelector("#credit-form");
const creditTitle = document.querySelector("#credit-title");
const creditDetail = document.querySelector("#credit-detail");
const creditOptions = document.querySelector("#credit-options");
const creditSaveButton = document.querySelector("#credit-save");

let pendingCreditKey = null;

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

const storedTheme = () => {
  const theme = localStorage.getItem(themeStorageKey);
  return theme === "dark" || theme === "light" ? theme : "";
};

const resolvedTheme = () => storedTheme() || (systemTheme.matches ? "dark" : "light");

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;
  themeToggle.title = label;
  themeToggle.setAttribute("aria-label", label);
};

const readBoard = () => {
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    return { topics: [], played: [], players: [], credits: {} };
  }

  try {
    const parsed = JSON.parse(stored);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    const played = Array.isArray(parsed.played) ? parsed.played : [];
    const players = Array.isArray(parsed.players) ? parsed.players : [];
    const credits =
      parsed.credits && typeof parsed.credits === "object" && !Array.isArray(parsed.credits)
        ? parsed.credits
        : {};

    return { topics, played, players, credits };
  } catch {
    return { topics: [], played: [], players: [], credits: {} };
  }
};

const writeBoard = (state) => {
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const parseTopics = () => {
  const seen = new Set();

  return topicsInput.value
    .split(/\r?\n|,/)
    .map((topic) => topic.trim())
    .filter(Boolean)
    .filter((topic) => {
      const key = topic.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const pointKey = (topicIndex, pointIndex) => `${topicIndex}:${pointIndex}`;

const playerId = () => {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const updateCount = (topics) => {
  const topicText = topics.length === 1 ? "topic" : "topics";
  boardCount.textContent = `${topics.length} ${topicText}`;
};

const getPointValue = (key) => {
  const pointIndex = Number(key.split(":")[1]);
  return points[pointIndex] || 0;
};

const scorePlayers = (state) => {
  const scores = new Map(state.players.map((player) => [player.id, 0]));

  Object.entries(state.credits).forEach(([key, playerIdValue]) => {
    if (!scores.has(playerIdValue)) {
      return;
    }

    scores.set(playerIdValue, scores.get(playerIdValue) + getPointValue(key));
  });

  return state.players
    .map((player) => ({
      ...player,
      score: scores.get(player.id) || 0,
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
};

const renderScoreboard = (state) => {
  const rankedPlayers = scorePlayers(state);
  scoreboard.innerHTML = "";

  if (rankedPlayers.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "scoreboard-empty";
    emptyItem.textContent = "Add players to start tracking points.";
    scoreboard.append(emptyItem);
    return;
  }

  rankedPlayers.forEach((player, index) => {
    const item = document.createElement("li");
    item.className = "scoreboard-row";

    const rank = document.createElement("span");
    rank.className = "scoreboard-rank";
    rank.textContent = index + 1;

    const name = document.createElement("span");
    name.className = "scoreboard-name";
    name.textContent = player.name;

    const score = document.createElement("span");
    score.className = "scoreboard-score";
    score.textContent = player.score;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-player";
    removeButton.type = "button";
    removeButton.title = `Remove ${player.name}`;
    removeButton.setAttribute("aria-label", `Remove ${player.name}`);
    removeButton.textContent = "x";
    removeButton.addEventListener("click", () => {
      const current = readBoard();
      const nextCredits = Object.fromEntries(
        Object.entries(current.credits).filter(([, creditedPlayerId]) => creditedPlayerId !== player.id)
      );
      const nextState = {
        ...current,
        players: current.players.filter((currentPlayer) => currentPlayer.id !== player.id),
        credits: nextCredits,
      };
      writeBoard(nextState);
      renderApp(nextState);
    });

    item.append(rank, name, score, removeButton);
    scoreboard.append(item);
  });
};

const renderEmptyState = () => {
  board.innerHTML = "";
  board.style.gridTemplateColumns = "";
  board.append(emptyTemplate.content.cloneNode(true));
  updateCount([]);
};

const playerNameById = (players, id) => {
  const player = players.find((currentPlayer) => currentPlayer.id === id);
  return player ? player.name : "";
};

const showCreditDialog = (state, key, topic, pointValue) => {
  pendingCreditKey = key;
  creditTitle.textContent = `Who gets ${pointValue} points?`;
  creditDetail.textContent = `${topic} was marked played. Choose the player to credit.`;
  creditOptions.innerHTML = "";
  creditSaveButton.disabled = state.players.length === 0;

  if (state.players.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "credit-empty";
    emptyMessage.textContent = "Add a player to the score board before awarding points.";
    creditOptions.append(emptyMessage);
  } else {
    state.players.forEach((player, index) => {
      const option = document.createElement("label");
      option.className = "credit-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "credit-player";
      input.value = player.id;
      input.checked = index === 0;

      const name = document.createElement("span");
      name.textContent = player.name;

      option.append(input, name);
      creditOptions.append(option);
    });
  }

  if (typeof creditDialog.showModal === "function") {
    creditDialog.returnValue = "";
    creditDialog.showModal();
  } else {
    window.alert(creditDetail.textContent);
  }
};

const renderBoard = (state) => {
  const { topics, played, credits, players } = state;

  if (topics.length === 0) {
    renderEmptyState();
    return;
  }

  const playedSet = new Set(played);
  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${topics.length}, minmax(128px, 1fr))`;

  topics.forEach((topic, topicIndex) => {
    const topicCell = document.createElement("div");
    topicCell.className = "topic-cell";
    topicCell.textContent = topic;
    board.append(topicCell);

    points.forEach((pointValue, pointIndex) => {
      const key = pointKey(topicIndex, pointIndex);
      const pointButton = document.createElement("button");
      pointButton.className = "point-button";
      pointButton.type = "button";
      pointButton.textContent = pointValue;
      pointButton.setAttribute("aria-pressed", playedSet.has(key));
      pointButton.title = `${topic} for ${pointValue} points`;

      if (playedSet.has(key)) {
        pointButton.classList.add("played");

        const creditedPlayerName = playerNameById(players, credits[key]);
        if (creditedPlayerName) {
          pointButton.classList.add("credited");
          pointButton.title = `${topic} for ${pointValue} points, credited to ${creditedPlayerName}`;

          const valueLabel = document.createElement("span");
          valueLabel.className = "point-value";
          valueLabel.textContent = pointValue;

          const playerLabel = document.createElement("span");
          playerLabel.className = "point-credit";
          playerLabel.textContent = creditedPlayerName;

          pointButton.replaceChildren(valueLabel, playerLabel);
        }
      }

      pointButton.addEventListener("click", () => {
        const current = readBoard();
        const currentPlayed = new Set(current.played);
        const nextCredits = { ...current.credits };
        const wasPlayed = currentPlayed.has(key);

        if (wasPlayed) {
          currentPlayed.delete(key);
          delete nextCredits[key];
        } else {
          currentPlayed.add(key);
        }

        const nextState = {
          topics: current.topics,
          players: current.players,
          played: [...currentPlayed],
          credits: nextCredits,
        };
        writeBoard(nextState);
        renderApp(nextState);

        if (!wasPlayed) {
          showCreditDialog(nextState, key, current.topics[topicIndex], pointValue);
        }
      });

      board.append(pointButton);
    });
  });

  updateCount(topics);
};

const renderApp = (state) => {
  renderBoard(state);
  renderScoreboard(state);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const current = readBoard();
  const topics = parseTopics();
  const nextState = { topics, played: [], players: current.players, credits: {} };
  writeBoard(nextState);
  renderApp(nextState);
});

playerForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = playerNameInput.value.trim();

  if (!name) {
    playerNameInput.focus();
    return;
  }

  const current = readBoard();
  const exists = current.players.some((player) => player.name.toLowerCase() === name.toLowerCase());

  if (exists) {
    playerNameInput.select();
    return;
  }

  const nextState = {
    ...current,
    players: [...current.players, { id: playerId(), name }],
  };
  writeBoard(nextState);
  renderApp(nextState);
  playerNameInput.value = "";
  playerNameInput.focus();
});

sampleButton.addEventListener("click", () => {
  topicsInput.value = sampleTopics.join("\n");
  topicsInput.focus();
});

resetButton.addEventListener("click", () => {
  const current = readBoard();
  const nextState = { topics: current.topics, played: [], players: current.players, credits: {} };
  writeBoard(nextState);
  renderApp(nextState);
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
});

systemTheme.addEventListener("change", () => {
  if (!storedTheme()) {
    applyTheme(resolvedTheme());
  }
});

creditForm.addEventListener("submit", (event) => {
  if (event.submitter && event.submitter.value !== "save") {
    pendingCreditKey = null;
    return;
  }

  const selectedPlayer = creditForm.querySelector('input[name="credit-player"]:checked');

  if (!selectedPlayer || !pendingCreditKey) {
    event.preventDefault();
    return;
  }

  const current = readBoard();
  const nextState = {
    ...current,
    credits: {
      ...current.credits,
      [pendingCreditKey]: selectedPlayer.value,
    },
  };
  writeBoard(nextState);
  renderApp(nextState);
  pendingCreditKey = null;
});

creditDialog.addEventListener("close", () => {
  if (creditDialog.returnValue !== "save") {
    pendingCreditKey = null;
  }
});

const initialState = readBoard();
applyTheme(resolvedTheme());
topicsInput.value = initialState.topics.join("\n");
renderApp(initialState);
