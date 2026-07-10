const points = [100, 200, 300, 400, 500];
const sampleTopics = ["Science", "History", "Movies", "Sports", "Music"];
const storageKey = "quizmaster-board";
const themeStorageKey = "quizmaster-theme";
const modeStorageKey = "quizmaster-mode";
const setupStorageKey = "quizmaster-setup-collapsed";
const hostKeyPrefix = "quizmaster-host-key:";
const playerIdPrefix = "quizmaster-player-id:";

const form = document.querySelector("#topic-form");
const playerForm = document.querySelector("#player-form");
const hostSessionForm = document.querySelector("#host-session-form");
const joinSessionForm = document.querySelector("#join-session-form");
const topicsInput = document.querySelector("#topics");
const multiplayerTopicsInput = document.querySelector("#multiplayer-topics");
const playerNameInput = document.querySelector("#player-name");
const joinCodeInput = document.querySelector("#join-code");
const joinNicknameInput = document.querySelector("#join-nickname");
const questionTopicInput = document.querySelector("#question-topic");
const questionPointsInput = document.querySelector("#question-points");
const questionTextInput = document.querySelector("#question-text");
const addQuestionButton = document.querySelector("#add-question");
const questionList = document.querySelector("#question-list");
const multiplayerQuestionTopicInput = document.querySelector("#multiplayer-question-topic");
const multiplayerQuestionPointsInput = document.querySelector("#multiplayer-question-points");
const multiplayerQuestionTextInput = document.querySelector("#multiplayer-question-text");
const multiplayerAddQuestionButton = document.querySelector("#multiplayer-add-question");
const multiplayerQuestionList = document.querySelector("#multiplayer-question-list");
const sampleButton = document.querySelector("#sample-topics");
const multiplayerSampleButton = document.querySelector("#multiplayer-sample-topics");
const resetButton = document.querySelector("#reset-board");
const themeToggle = document.querySelector("#theme-toggle");
const setupToggle = document.querySelector("#setup-toggle");
const modeSwitch = document.querySelector("#mode-switch");
const singleModeButton = document.querySelector("#single-mode");
const multiModeButton = document.querySelector("#multi-mode");
const singlePanel = document.querySelector("#single-panel");
const multiPanel = document.querySelector("#multi-panel");
const hostSessionPanel = document.querySelector("#host-session-panel");
const sessionCode = document.querySelector("#session-code");
const sessionLink = document.querySelector("#session-link");
const multiplayerScoreboard = document.querySelector("#multiplayer-scoreboard");
const multiplayerMessage = document.querySelector("#multiplayer-message");
const activeQuestionPanel = document.querySelector("#multiplayer-active-question");
const hostQuestionActions = document.querySelector("#host-question-actions");
const awardPointsButton = document.querySelector("#award-points");
const noPointsButton = document.querySelector("#no-points");
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
let currentMode = localStorage.getItem(modeStorageKey) === "multi" ? "multi" : "single";
let setupCollapsed = localStorage.getItem(setupStorageKey) === "true";
let multiplayerSession = null;
let multiplayerHostKey = "";
let multiplayerPlayerId = "";
let multiplayerPollTimer = null;
let singleSetupQuestions = [];
let multiplayerSetupQuestions = [];

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

const setSetupCollapsed = (collapsed, { persist = true } = {}) => {
  setupCollapsed = collapsed;

  if (persist) {
    localStorage.setItem(setupStorageKey, String(collapsed));
  }

  modeSwitch.classList.toggle("hidden", collapsed);
  form.classList.toggle("hidden", collapsed);
  hostSessionForm.classList.toggle("hidden", collapsed);
  joinSessionForm.classList.toggle("hidden", collapsed);

  const label = collapsed ? "Setup" : "Hide setup";
  setupToggle.querySelector("span").textContent = label;
  setupToggle.title = collapsed ? "Show setup controls" : "Hide setup controls";
  setupToggle.setAttribute("aria-label", setupToggle.title);
  setupToggle.setAttribute("aria-expanded", String(!collapsed));
};

const readBoard = () => {
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    return { topics: [], questions: [], played: [], players: [], credits: {} };
  }

  try {
    const parsed = JSON.parse(stored);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    const questions = sanitizeQuestions(parsed.questions);
    const played = Array.isArray(parsed.played) ? parsed.played : [];
    const players = Array.isArray(parsed.players) ? parsed.players : [];
    const credits =
      parsed.credits && typeof parsed.credits === "object" && !Array.isArray(parsed.credits)
        ? parsed.credits
        : {};

    return { topics, questions, played, players, credits };
  } catch {
    return { topics: [], questions: [], played: [], players: [], credits: {} };
  }
};

const writeBoard = (state) => {
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const parseTopicText = (value) => {
  const seen = new Set();

  return value
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

const parseTopics = () => parseTopicText(topicsInput.value);

const pointKey = (topicIndex, pointIndex) => `${topicIndex}:${pointIndex}`;

const pointIndexForValue = (value) => points.indexOf(Number(value));

const sanitizeQuestions = (questions) => {
  if (!Array.isArray(questions)) {
    return [];
  }

  const seen = new Set();
  const sanitized = [];

  questions.forEach((question) => {
    const topic = typeof question.topic === "string" ? question.topic.trim() : "";
    const text = typeof question.text === "string" ? question.text.trim() : "";
    const pointValue = Number(question.points);

    if (!topic || !text || !points.includes(pointValue)) {
      return;
    }

    const key = `${topic.toLowerCase()}:${pointValue}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    sanitized.push({ topic, points: pointValue, text });
  });

  return sanitized;
};

const mergeTopicsWithQuestions = (topicText, questions) => {
  const topics = parseTopicText(topicText);
  const seen = new Set(topics.map((topic) => topic.toLowerCase()));

  sanitizeQuestions(questions).forEach((question) => {
    const key = question.topic.toLowerCase();

    if (!seen.has(key)) {
      topics.push(question.topic);
      seen.add(key);
    }
  });

  return topics.slice(0, 8);
};

const questionMap = (topics, questions) => {
  const mapped = new Map();

  sanitizeQuestions(questions).forEach((question) => {
    const topicIndex = topics.findIndex((topic) => topic.toLowerCase() === question.topic.toLowerCase());
    const pointIndex = pointIndexForValue(question.points);

    if (topicIndex >= 0 && pointIndex >= 0) {
      mapped.set(pointKey(topicIndex, pointIndex), question);
    }
  });

  return mapped;
};

const playerId = () => {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createQuestionBuilder = ({ topicInput, pointsInput, textInput, addButton, list, getQuestions, setQuestions }) => {
  const render = () => {
    list.innerHTML = "";

    getQuestions().forEach((question, index) => {
      const item = document.createElement("li");
      item.className = "question-row";

      const value = document.createElement("span");
      value.className = "question-row-value";
      value.textContent = question.points;

      const body = document.createElement("span");
      body.className = "question-row-body";

      const topic = document.createElement("span");
      topic.className = "question-row-topic";
      topic.textContent = question.topic;

      const text = document.createElement("span");
      text.className = "question-row-text";
      text.textContent = question.text;

      const removeButton = document.createElement("button");
      removeButton.className = "remove-player";
      removeButton.type = "button";
      removeButton.title = `Remove ${question.topic} for ${question.points}`;
      removeButton.setAttribute("aria-label", removeButton.title);
      removeButton.textContent = "x";
      removeButton.addEventListener("click", () => {
        setQuestions(getQuestions().filter((_, currentIndex) => currentIndex !== index));
        render();
      });

      body.append(topic, text);
      item.append(value, body, removeButton);
      list.append(item);
    });
  };

  const addQuestion = () => {
    const topic = topicInput.value.trim();
    const text = textInput.value.trim();
    const pointValue = Number(pointsInput.value);

    if (!topic) {
      topicInput.focus();
      return;
    }

    if (!text) {
      textInput.focus();
      return;
    }

    const existingIndex = getQuestions().findIndex(
      (question) => question.topic.toLowerCase() === topic.toLowerCase() && question.points === pointValue
    );
    const nextQuestion = { topic, points: pointValue, text };
    const nextQuestions = [...getQuestions()];

    if (existingIndex >= 0) {
      nextQuestions[existingIndex] = nextQuestion;
    } else {
      nextQuestions.push(nextQuestion);
    }

    setQuestions(sanitizeQuestions(nextQuestions));
    textInput.value = "";
    textInput.focus();
    render();
  };

  addButton.addEventListener("click", addQuestion);

  return {
    render,
    setQuestions: (questions) => {
      setQuestions(sanitizeQuestions(questions));
      render();
    },
  };
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

const renderSingleScoreboard = (state) => {
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
      renderSingleApp(nextState);
    });

    item.append(rank, name, score, removeButton);
    scoreboard.append(item);
  });
};

const renderEmptyState = (message = "Add one topic per line and create the quiz board.") => {
  board.innerHTML = "";
  board.style.gridTemplateColumns = "";
  const emptyState = emptyTemplate.content.cloneNode(true);
  emptyState.querySelector("p").textContent = message;
  board.append(emptyState);
  updateCount([]);
};

const playerNameById = (players, id) => {
  const player = players.find((currentPlayer) => currentPlayer.id === id);
  return player ? player.name : "";
};

const showCreditDialog = (state, key, topic, pointValue, questionText = "") => {
  pendingCreditKey = key;
  creditTitle.textContent = `Who gets ${pointValue} points?`;
  creditDetail.textContent = questionText || `${topic} was marked played. Choose the player to credit.`;
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

const renderSingleBoard = (state) => {
  const { topics, questions, played, credits, players } = state;

  if (topics.length === 0) {
    renderEmptyState();
    return;
  }

  const playedSet = new Set(played);
  const questionsByKey = questionMap(topics, questions);
  const usesCustomQuestions = sanitizeQuestions(questions).length > 0;
  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${topics.length}, minmax(128px, 1fr))`;

  topics.forEach((topic, topicIndex) => {
    const topicCell = document.createElement("div");
    topicCell.className = "topic-cell";
    topicCell.textContent = topic;
    board.append(topicCell);

    points.forEach((pointValue, pointIndex) => {
      const key = pointKey(topicIndex, pointIndex);
      const question = questionsByKey.get(key);
      const pointButton = document.createElement("button");
      pointButton.className = "point-button";
      pointButton.type = "button";
      pointButton.textContent = pointValue;
      pointButton.setAttribute("aria-pressed", playedSet.has(key));
      pointButton.title = `${topic} for ${pointValue} points`;

      if (usesCustomQuestions && !question) {
        pointButton.classList.add("empty-question");
        pointButton.textContent = "-";
        pointButton.title = "No question added";
        pointButton.disabled = true;
        board.append(pointButton);
        return;
      }

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
          questions: current.questions || [],
          players: current.players,
          played: [...currentPlayed],
          credits: nextCredits,
        };
        writeBoard(nextState);
        renderSingleApp(nextState);

        if (!wasPlayed) {
          const currentQuestion = questionMap(current.topics, current.questions).get(key);
          showCreditDialog(nextState, key, current.topics[topicIndex], pointValue, currentQuestion?.text || "");
        }
      });

      board.append(pointButton);
    });
  });

  updateCount(topics);
};

const renderSingleApp = (state) => {
  activeQuestionPanel.classList.add("hidden");
  hostQuestionActions.classList.add("hidden");
  renderSingleBoard(state);
  renderSingleScoreboard(state);
  setSetupCollapsed(setupCollapsed, { persist: false });
};

const setMode = (mode) => {
  currentMode = mode;
  localStorage.setItem(modeStorageKey, mode);
  singleModeButton.classList.toggle("active", mode === "single");
  multiModeButton.classList.toggle("active", mode === "multi");
  singleModeButton.setAttribute("aria-selected", String(mode === "single"));
  multiModeButton.setAttribute("aria-selected", String(mode === "multi"));
  singlePanel.classList.toggle("active", mode === "single");
  multiPanel.classList.toggle("active", mode === "multi");
  setSetupCollapsed(setupCollapsed, { persist: false });

  if (mode === "single") {
    stopMultiplayerPolling();
    renderSingleApp(readBoard());
    return;
  }

  renderMultiplayerApp(multiplayerSession);
  startMultiplayerPolling();
};

const sessionPlayerIdKey = (code) => `${playerIdPrefix}${code}`;

const sessionHostKeyKey = (code) => `${hostKeyPrefix}${code}`;

const normalizeCode = (code) => code.trim().toUpperCase();

const setMultiplayerMessage = (message) => {
  multiplayerMessage.textContent = message;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (response.ok) {
    return response.json();
  }

  let message = "Request failed.";

  try {
    const body = await response.json();
    message = body.detail || body.message || message;
  } catch {
    message = await response.text();
  }

  throw new Error(message);
};

const rememberSession = (session, { hostKey = "", playerId: joinedPlayerId = "" } = {}) => {
  multiplayerSession = session;
  joinCodeInput.value = session.code;

  if (hostKey) {
    multiplayerHostKey = hostKey;
    sessionStorage.setItem(sessionHostKeyKey(session.code), hostKey);
  } else {
    multiplayerHostKey = sessionStorage.getItem(sessionHostKeyKey(session.code)) || "";
  }

  if (joinedPlayerId) {
    multiplayerPlayerId = joinedPlayerId;
    sessionStorage.setItem(sessionPlayerIdKey(session.code), joinedPlayerId);
  } else {
    multiplayerPlayerId = sessionStorage.getItem(sessionPlayerIdKey(session.code)) || "";
  }
};

const pollMultiplayerSession = async () => {
  if (currentMode !== "multi" || !multiplayerSession) {
    return;
  }

  try {
    const session = await fetchJson(`/api/sessions/${multiplayerSession.code}`);
    rememberSession(session);
    renderMultiplayerApp(session);
  } catch (error) {
    setMultiplayerMessage(error.message);
  }
};

const startMultiplayerPolling = () => {
  stopMultiplayerPolling();

  if (!multiplayerSession) {
    return;
  }

  multiplayerPollTimer = window.setInterval(pollMultiplayerSession, 1000);
};

const stopMultiplayerPolling = () => {
  if (multiplayerPollTimer) {
    window.clearInterval(multiplayerPollTimer);
    multiplayerPollTimer = null;
  }
};

const renderMultiplayerScoreboard = (session) => {
  multiplayerScoreboard.innerHTML = "";

  if (!session || session.players.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "scoreboard-empty";
    emptyItem.textContent = "Waiting for players to join.";
    multiplayerScoreboard.append(emptyItem);
    return;
  }

  session.players.forEach((player, index) => {
    const item = document.createElement("li");
    item.className = `scoreboard-row${player.currentTurn ? " current-turn" : ""}`;

    const rank = document.createElement("span");
    rank.className = "scoreboard-rank";
    rank.textContent = index + 1;

    const name = document.createElement("span");
    name.className = "scoreboard-name";
    name.textContent = player.currentTurn ? `${player.nickname} to choose` : player.nickname;

    const score = document.createElement("span");
    score.className = "scoreboard-score";
    score.textContent = player.score;

    item.append(rank, name, score);
    multiplayerScoreboard.append(item);
  });
};

const renderActiveQuestion = (session) => {
  activeQuestionPanel.innerHTML = "";
  hostQuestionActions.classList.add("hidden");

  if (!session || !session.currentQuestion) {
    activeQuestionPanel.classList.add("hidden");
    return;
  }

  const question = session.currentQuestion;
  const remaining = Math.max(0, question.remainingSeconds);
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  activeQuestionPanel.classList.remove("hidden");

  const detail = document.createElement("div");
  detail.className = "active-question-detail";

  const title = document.createElement("strong");
  title.textContent = `${question.selectedByNickname} chose ${question.topic} for ${question.points}`;

  const timer = document.createElement("span");
  timer.className = question.expired ? "question-timer expired" : "question-timer";
  timer.textContent = `${minutes}:${seconds}`;

  detail.append(title, timer);
  activeQuestionPanel.append(detail);

  if (question.text) {
    const text = document.createElement("p");
    text.className = "active-question-text";
    text.textContent = question.text;
    activeQuestionPanel.append(text);
  }

  if (multiplayerHostKey) {
    hostQuestionActions.classList.remove("hidden");
  }
};

const renderMultiplayerBoard = (session) => {
  if (!session) {
    renderEmptyState("Host or join a multiplayer session.");
    return;
  }

  const playedSet = new Set(session.played);
  const isCurrentPlayer = Boolean(multiplayerPlayerId && session.currentPlayerId === multiplayerPlayerId);
  const hasActiveQuestion = Boolean(session.currentQuestion);
  const questionsByKey = new Map((session.questions || []).map((question) => [question.key, question]));

  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${session.topics.length}, minmax(128px, 1fr))`;

  session.topics.forEach((topic, topicIndex) => {
    const topicCell = document.createElement("div");
    topicCell.className = "topic-cell";
    topicCell.textContent = topic;
    board.append(topicCell);

    points.forEach((pointValue, pointIndex) => {
      const key = pointKey(topicIndex, pointIndex);
      const question = questionsByKey.get(key);
      const pointButton = document.createElement("button");
      pointButton.className = "point-button";
      pointButton.type = "button";
      pointButton.textContent = pointValue;
      pointButton.title = `${topic} for ${pointValue} points`;

      if (!question) {
        pointButton.classList.add("empty-question");
        pointButton.textContent = "-";
        pointButton.title = "No question added";
        pointButton.disabled = true;
        board.append(pointButton);
        return;
      }

      if (playedSet.has(key)) {
        pointButton.classList.add("played");
        pointButton.disabled = true;
      }

      if (session.currentQuestion && session.currentQuestion.key === key) {
        pointButton.classList.add("active-question");
        pointButton.textContent = "Active";
      }

      if (!isCurrentPlayer || hasActiveQuestion || playedSet.has(key)) {
        pointButton.disabled = true;
      }

      pointButton.addEventListener("click", async () => {
        try {
          const updatedSession = await fetchJson(`/api/sessions/${session.code}/questions/${key}/select`, {
            method: "POST",
            body: JSON.stringify({ playerId: multiplayerPlayerId }),
          });
          rememberSession(updatedSession);
          renderMultiplayerApp(updatedSession);
        } catch (error) {
          setMultiplayerMessage(error.message);
        }
      });

      board.append(pointButton);
    });
  });

  updateCount(session.topics);
};

const renderMultiplayerApp = (session) => {
  renderMultiplayerScoreboard(session);
  renderActiveQuestion(session);
  renderMultiplayerBoard(session);

  if (!session) {
    hostSessionPanel.classList.add("hidden");
    return;
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}?session=${session.code}`;
  hostSessionPanel.classList.toggle("hidden", !multiplayerHostKey);
  sessionCode.textContent = session.code;
  sessionLink.value = joinUrl;

  if (!session.players.length) {
    setMultiplayerMessage(`Share code ${session.code} with players.`);
  } else if (session.currentQuestion) {
    setMultiplayerMessage("Question is active. The host closes it and decides points.");
  } else {
    const currentPlayer = session.players.find((player) => player.currentTurn);
    setMultiplayerMessage(currentPlayer ? `${currentPlayer.nickname} chooses the next question.` : "");
  }
};

const createMultiplayerSession = async () => {
  const questions = sanitizeQuestions(multiplayerSetupQuestions);
  const topics = mergeTopicsWithQuestions(multiplayerTopicsInput.value, questions);

  if (topics.length === 0) {
    if (questions.length === 0) {
      multiplayerTopicsInput.focus();
    }
    setMultiplayerMessage("Add at least one topic before hosting.");
    return;
  }

  try {
    const response = await fetchJson("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ topics, questions }),
    });
    rememberSession(response.session, { hostKey: response.hostKey });
    setSetupCollapsed(true);
    setMode("multi");
    renderMultiplayerApp(response.session);
    startMultiplayerPolling();
  } catch (error) {
    setMultiplayerMessage(error.message);
  }
};

const joinMultiplayerSession = async () => {
  const code = normalizeCode(joinCodeInput.value);
  const nickname = joinNicknameInput.value.trim();

  if (!code) {
    joinCodeInput.focus();
    return;
  }

  if (!nickname) {
    joinNicknameInput.focus();
    return;
  }

  try {
    const response = await fetchJson(`/api/sessions/${code}/players`, {
      method: "POST",
      body: JSON.stringify({ nickname }),
    });
    rememberSession(response.session, { playerId: response.playerId });
    setSetupCollapsed(true);
    setMode("multi");
    renderMultiplayerApp(response.session);
    startMultiplayerPolling();
  } catch (error) {
    setMultiplayerMessage(error.message);
  }
};

const closeCurrentQuestion = async (award) => {
  if (!multiplayerSession || !multiplayerHostKey) {
    return;
  }

  try {
    const updatedSession = await fetchJson(`/api/sessions/${multiplayerSession.code}/questions/current/close`, {
      method: "POST",
      body: JSON.stringify({ hostKey: multiplayerHostKey, award }),
    });
    rememberSession(updatedSession);
    renderMultiplayerApp(updatedSession);
  } catch (error) {
    setMultiplayerMessage(error.message);
  }
};

const singleQuestionBuilder = createQuestionBuilder({
  topicInput: questionTopicInput,
  pointsInput: questionPointsInput,
  textInput: questionTextInput,
  addButton: addQuestionButton,
  list: questionList,
  getQuestions: () => singleSetupQuestions,
  setQuestions: (questions) => {
    singleSetupQuestions = questions;
  },
});

const multiplayerQuestionBuilder = createQuestionBuilder({
  topicInput: multiplayerQuestionTopicInput,
  pointsInput: multiplayerQuestionPointsInput,
  textInput: multiplayerQuestionTextInput,
  addButton: multiplayerAddQuestionButton,
  list: multiplayerQuestionList,
  getQuestions: () => multiplayerSetupQuestions,
  setQuestions: (questions) => {
    multiplayerSetupQuestions = questions;
  },
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const current = readBoard();
  const questions = sanitizeQuestions(singleSetupQuestions);
  const topics = mergeTopicsWithQuestions(topicsInput.value, questions);
  const nextState = { topics, questions, played: [], players: current.players, credits: {} };
  writeBoard(nextState);
  renderSingleApp(nextState);

  if (topics.length > 0) {
    setSetupCollapsed(true);
  }
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
  renderSingleApp(nextState);
  playerNameInput.value = "";
  playerNameInput.focus();
});

hostSessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createMultiplayerSession();
});

joinSessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinMultiplayerSession();
});

sampleButton.addEventListener("click", () => {
  topicsInput.value = sampleTopics.join("\n");
  topicsInput.focus();
});

multiplayerSampleButton.addEventListener("click", () => {
  multiplayerTopicsInput.value = sampleTopics.join("\n");
  multiplayerTopicsInput.focus();
});

resetButton.addEventListener("click", () => {
  if (currentMode === "multi") {
    setMultiplayerMessage("Create a new multiplayer session to reset the board.");
    return;
  }

  const current = readBoard();
  const nextState = {
    topics: current.topics,
    questions: current.questions || [],
    played: [],
    players: current.players,
    credits: {},
  };
  writeBoard(nextState);
  renderSingleApp(nextState);
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
});

setupToggle.addEventListener("click", () => setSetupCollapsed(!setupCollapsed));

singleModeButton.addEventListener("click", () => setMode("single"));

multiModeButton.addEventListener("click", () => setMode("multi"));

awardPointsButton.addEventListener("click", () => closeCurrentQuestion(true));

noPointsButton.addEventListener("click", () => closeCurrentQuestion(false));

sessionLink.addEventListener("focus", () => sessionLink.select());

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
  renderSingleApp(nextState);
  pendingCreditKey = null;
});

creditDialog.addEventListener("close", () => {
  if (creditDialog.returnValue !== "save") {
    pendingCreditKey = null;
  }
});

const initializeFromUrl = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = normalizeCode(params.get("session") || "");

  if (!code) {
    return;
  }

  joinCodeInput.value = code;
  setMode("multi");

  try {
    const session = await fetchJson(`/api/sessions/${code}`);
    rememberSession(session);
    renderMultiplayerApp(session);
    startMultiplayerPolling();
  } catch (error) {
    setMultiplayerMessage(error.message);
  }
};

const initialState = readBoard();
applyTheme(resolvedTheme());
topicsInput.value = initialState.topics.join("\n");
multiplayerTopicsInput.value = initialState.topics.length ? initialState.topics.join("\n") : "";
singleQuestionBuilder.setQuestions(initialState.questions || []);
multiplayerQuestionBuilder.setQuestions(initialState.questions || []);
if (initialState.topics.length === 0 && !new URLSearchParams(window.location.search).has("session")) {
  setSetupCollapsed(false, { persist: false });
} else {
  setSetupCollapsed(setupCollapsed, { persist: false });
}
setMode(currentMode);
initializeFromUrl();
