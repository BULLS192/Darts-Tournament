// --- Global state ---

let players = [];
let teams = [];
let matches = [];          // R1 matches list
let winnersBracket = [];   // [round][match]
let mysteryOutEntries = [];
let specialShots = [];     // Big Hits

let teamLosses = {};       // teamId -> 0,1,2
let losersMatches = [];    // flat list
let losersWaitingQueue = [];

let finalsState = {
  match1Winner: null,
  match2Winner: null,
  champion: null,
  runnerUp: null
};

let tournamentLocked = false;

// Player DB for reuse
const PLAYER_DB_KEY = "dartPlayerDatabase";
let playerDatabase = [];

// Master Out possibilities 1–180
let possibleOutMap = {};

// For SVG lines on resize
let lastLoserRoundsForLines = [];

// --- DOM READY ---

document.addEventListener("DOMContentLoaded", () => {
  const playerForm = document.getElementById("player-form");
  const generateTeamsBtn = document.getElementById("generate-teams-btn");
  const generateMatchesBtn = document.getElementById("generate-matches-btn");
  const reseedBracketBtn = document.getElementById("reseed-bracket-btn");
  const manualTeamForm = document.getElementById("manual-team-form");
  const mysteryOutForm = document.getElementById("mystery-out-form");
  const featsForm = document.getElementById("feats-form");
  const calculatePayoutsBtn = document.getElementById("calculate-payouts-btn");
  const finalsMatch1Btn = document.getElementById("finals-match1-btn");
  const finalsMatch2Btn = document.getElementById("finals-match2-btn");
  const saveBtn = document.getElementById("save-tournament-btn");
  const loadBtn = document.getElementById("load-tournament-btn");
  const displayModeBtn = document.getElementById("toggle-display-mode-btn");
  const loadSavedPlayersBtn = document.getElementById("load-saved-players-btn");
  const clearSavedPlayersBtn = document.getElementById("clear-saved-players-btn");

  initPlayerDatabase();
  buildPossibleOutMap();

  playerForm.addEventListener("submit", handleAddPlayer);
  generateTeamsBtn.addEventListener("click", handleGenerateTeams);
  generateMatchesBtn.addEventListener("click", handleGenerateBracket);
  reseedBracketBtn.addEventListener("click", handleReseedBracket);
  manualTeamForm.addEventListener("submit", handleManualTeamAdd);
  mysteryOutForm.addEventListener("submit", handleMysteryOutAdd);
  if (featsForm) featsForm.addEventListener("submit", handleAddSpecialShot);
  calculatePayoutsBtn.addEventListener("click", handleCalculatePayouts);
  finalsMatch1Btn.addEventListener("click", () => handleFinalMatch(1));
  finalsMatch2Btn.addEventListener("click", () => handleFinalMatch(2));
  saveBtn.addEventListener("click", saveTournamentState);
  loadBtn.addEventListener("click", loadTournamentState);
  displayModeBtn.addEventListener("click", toggleDisplayMode);
  loadSavedPlayersBtn.addEventListener("click", handleLoadSavedPlayers);
  clearSavedPlayersBtn.addEventListener("click", handleClearSavedPlayers);

  // Initial render
  renderPlayers();
  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderMysteryOutBoard();
  populateManualTeamSelects();
  populateMysteryAndFeatSelects();
  renderSpecialShots();
  renderStandings();
  renderSummary();
  renderCourtAssignments();
  updateLockedUI();

  // Redraw SVG lines on resize
  window.addEventListener("resize", () => {
    drawBracketLines("winners-bracket", winnersBracket);
    drawBracketLines("losers-bracket", lastLoserRoundsForLines);
  });
});

// --- Player DB ---

function initPlayerDatabase() {
  const data = localStorage.getItem(PLAYER_DB_KEY);
  if (!data) {
    playerDatabase = [];
    return;
  }
  try {
    playerDatabase = JSON.parse(data) || [];
  } catch {
    playerDatabase = [];
  }
}

function savePlayerDatabase() {
  try {
    localStorage.setItem(PLAYER_DB_KEY, JSON.stringify(playerDatabase));
  } catch (e) {
    console.error("Failed to save player database", e);
  }
}

function addPlayerToDatabase(player) {
  const exists = playerDatabase.some(p =>
    p.firstName === player.firstName &&
    p.lastName === player.lastName &&
    p.nickname === player.nickname &&
    p.gender === player.gender
  );
  if (!exists) {
    playerDatabase.push({ ...player, paid: false });
    savePlayerDatabase();
  }
}

function handleLoadSavedPlayers() {
  if (!playerDatabase.length) {
    alert("No saved players in the database.");
    return;
  }

  let added = 0;
  playerDatabase.forEach(dbPlayer => {
    const exists = players.some(p =>
      p.firstName === dbPlayer.firstName &&
      p.lastName === dbPlayer.lastName &&
      p.nickname === dbPlayer.nickname &&
      p.gender === dbPlayer.gender
    );
    if (!exists) {
      const newPlayer = {
        ...dbPlayer,
        id: Date.now() + Math.floor(Math.random() * 1000000)
      };
      players.push(newPlayer);
      added++;
    }
  });

  if (added === 0) {
    alert("All saved players are already in this tournament.");
  } else {
    alert(`Loaded ${added} saved player(s) into this tournament.`);
  }

  renderPlayers();
  populateManualTeamSelects();
  populateMysteryAndFeatSelects();
  renderSummary();
}

function handleClearSavedPlayers() {
  if (!confirm("Clear the saved player database? This does NOT remove players from the current tournament.")) return;
  playerDatabase = [];
  savePlayerDatabase();
  alert("Saved player database cleared.");
}

// --- Master Out possibilities (1–180) ---

function buildPossibleOutMap() {
  possibleOutMap = {};
  for (let n = 1; n <= 180; n++) {
    possibleOutMap[n] = false;
  }

  const dartScores = [];
  for (let v = 1; v <= 20; v++) {
    dartScores.push(v);        // single
    dartScores.push(2 * v);    // double
    dartScores.push(3 * v);    // triple
  }
  dartScores.push(25);
  dartScores.push(50);

  const finishingDarts = [];
  for (let v = 1; v <= 20; v++) {
    finishingDarts.push(2 * v); // doubles
    finishingDarts.push(3 * v); // triples
  }
  finishingDarts.push(50);

  // 1 dart
  finishingDarts.forEach(last => {
    if (last >= 1 && last <= 180) possibleOutMap[last] = true;
  });
  // 2 darts
  dartScores.forEach(d1 => {
    finishingDarts.forEach(last => {
      const total = d1 + last;
      if (total >= 1 && total <= 180) possibleOutMap[total] = true;
    });
  });
  // 3 darts
  dartScores.forEach(d1 => {
    dartScores.forEach(d2 => {
      finishingDarts.forEach(last => {
        const total = d1 + d2 + last;
        if (total >= 1 && total <= 180) possibleOutMap[total] = true;
      });
    });
  });
}

// --- Players ---

function handleAddPlayer(e) {
  e.preventDefault();

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const nicknameInput = document.getElementById("nickname");
  const genderSelect = document.getElementById("gender");

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const nickname = nicknameInput.value.trim();
  const gender = genderSelect.value;

  if (!firstName || !lastName || !gender) {
    alert("Please fill first name, last name and gender.");
    return;
  }

  const newPlayer = {
    id: Date.now(),
    firstName,
    lastName,
    nickname,
    gender,
    paid: false
  };

  players.push(newPlayer);
  addPlayerToDatabase(newPlayer);

  firstNameInput.value = "";
  lastNameInput.value = "";
  nicknameInput.value = "";
  genderSelect.value = "";

  renderPlayers();
  populateManualTeamSelects();
  populateMysteryAndFeatSelects();
  renderSummary();
}

function formatDisplayName(player) {
  if (!player) return "";
  if (player.nickname) {
    return `${player.firstName} "${player.nickname}" ${player.lastName}`;
  }
  return `${player.firstName} ${player.lastName}`;
}

function renderPlayers() {
  const tbody = document.querySelector("#players-table tbody");
  tbody.innerHTML = "";

  players.forEach((player, index) => {
    const tr = document.createElement("tr");

    const tdIndex = document.createElement("td");
    tdIndex.textContent = index + 1;

    const tdName = document.createElement("td");
    tdName.textContent = formatDisplayName(player);

    const tdGender = document.createElement("td");
    tdGender.textContent = player.gender;

    const tdPaid = document.createElement("td");
    const paidCheckbox = document.createElement("input");
    paidCheckbox.type = "checkbox";
    paidCheckbox.checked = player.paid;
    paidCheckbox.addEventListener("change", () => togglePaid(player.id));
    tdPaid.appendChild(paidCheckbox);

    const tdActions = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Remove";
    deleteBtn.className = "action-btn";
    deleteBtn.addEventListener("click", () => removePlayer(player.id));
    tdActions.appendChild(deleteBtn);

    tr.appendChild(tdIndex);
    tr.appendChild(tdName);
    tr.appendChild(tdGender);
    tr.appendChild(tdPaid);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  renderSummary();
}

function togglePaid(playerId) {
  const p = players.find(x => x.id === playerId);
  if (!p) return;
  p.paid = !p.paid;
  renderPlayers();
}

function removePlayer(playerId) {
  if (!confirm("Remove this player?")) return;

  players = players.filter(p => p.id !== playerId);

  // Strip any teams containing this player
  teams = teams.filter(t => {
    const p1 = t.player1 ? t.player1.id : null;
    const p2 = t.player2 ? t.player2.id : null;
    return p1 !== playerId && p2 !== playerId;
  });

  resetAllBracketState();

  renderPlayers();
  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  populateManualTeamSelects();
  populateMysteryAndFeatSelects();
  renderMysteryOutBoard();
  renderSpecialShots();
  renderStandings();
  renderSummary();
  renderCourtAssignments();
}

function renderSummary() {
  const totalPlayers = players.length;
  const paidPlayers = players.filter(p => p.paid).length;
  const unpaidPlayers = totalPlayers - paidPlayers;
  const totalTeams = teams.length;
  const totalMatches = matches.length;

  const playersTotalEl = document.getElementById("summary-players-total");
  const playersPaidEl = document.getElementById("summary-players-paid");
  const playersUnpaidEl = document.getElementById("summary-players-unpaid");
  const teamsTotalEl = document.getElementById("summary-teams-total");
  const matchesTotalEl = document.getElementById("summary-matches-total");

  if (playersTotalEl) playersTotalEl.textContent = totalPlayers;
  if (playersPaidEl) playersPaidEl.textContent = paidPlayers;
  if (playersUnpaidEl) playersUnpaidEl.textContent = unpaidPlayers;
  if (teamsTotalEl) teamsTotalEl.textContent = totalTeams;
  if (matchesTotalEl) matchesTotalEl.textContent = totalMatches;
}

// --- Utils ---

function shuffleArray(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getPlayerById(id) {
  return players.find(p => p.id === id) || null;
}

function formatTeamLabel(team) {
  if (!team) return "TBD";
  const p1 = formatDisplayName(team.player1);
  if (!team.player2) {
    return `Team ${team.id}: ${p1} + (bye)`;
  }
  const p2 = formatDisplayName(team.player2);
  return `Team ${team.id}: ${p1} & ${p2}`;
}

function getTeamLosses(team) {
  if (!team) return 0;
  return teamLosses[team.id] || 0;
}

function formatTeamLabelWithLosses(team) {
  const base = formatTeamLabel(team);
  const losses = getTeamLosses(team);
  return `${base} (L: ${losses})`;
}

function resetAllBracketState() {
  matches = [];
  winnersBracket = [];
  teamLosses = {};
  losersMatches = [];
  losersWaitingQueue = [];
  finalsState = {
    match1Winner: null,
    match2Winner: null,
    champion: null,
    runnerUp: null
  };
  tournamentLocked = false;
  updateLockedUI();
  renderStandings();
}

// --- Teams ---

function handleGenerateTeams() {
  if (tournamentLocked) {
    alert("Tournament in progress. Cannot regenerate teams.");
    return;
  }
  if (players.length < 2) {
    alert("You need at least 2 players to generate teams.");
    return;
  }

  const shuffled = shuffleArray(players);
  teams = [];
  let teamNumber = 1;

  for (let i = 0; i < shuffled.length; i += 2) {
    const p1 = shuffled[i];
    const p2 = shuffled[i + 1] || null;
    teams.push({ id: teamNumber++, player1: p1, player2: p2 });
  }

  resetAllBracketState();

  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  populateManualTeamSelects();
  renderSummary();
  renderCourtAssignments();
}

function populateManualTeamSelects() {
  const p1Select = document.getElementById("manualPlayer1");
  const p2Select = document.getElementById("manualPlayer2");
  if (!p1Select || !p2Select) return;

  const usedIds = new Set();
  teams.forEach(t => {
    if (t.player1) usedIds.add(t.player1.id);
    if (t.player2) usedIds.add(t.player2.id);
  });

  const available = players.filter(p => !usedIds.has(p.id));

  function fillSelect(select) {
    select.innerHTML = "";
    if (available.length < 2) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Not enough available players";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select player…";
    select.appendChild(placeholder);
    available.forEach(p => {
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.textContent = formatDisplayName(p);
      select.appendChild(opt);
    });
  }

  fillSelect(p1Select);
  fillSelect(p2Select);
}

function handleManualTeamAdd(e) {
  e.preventDefault();
  if (tournamentLocked) {
    alert("Tournament in progress. Cannot add teams.");
    return;
  }

  const p1Select = document.getElementById("manualPlayer1");
  const p2Select = document.getElementById("manualPlayer2");
  const p1Id = parseInt(p1Select.value, 10);
  const p2Id = parseInt(p2Select.value, 10);

  if (!p1Id || !p2Id) {
    alert("Please select two players.");
    return;
  }
  if (p1Id === p2Id) {
    alert("Player 1 and Player 2 must be different.");
    return;
  }

  const p1 = players.find(p => p.id === p1Id);
  const p2 = players.find(p => p.id === p2Id);
  if (!p1 || !p2) {
    alert("Invalid player selection.");
    return;
  }

  const nextTeamId = teams.length ? Math.max(...teams.map(t => t.id)) + 1 : 1;
  teams.push({ id: nextTeamId, player1: p1, player2: p2 });

  p1Select.value = "";
  p2Select.value = "";

  resetAllBracketState();
  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  populateManualTeamSelects();
  renderSummary();
  renderCourtAssignments();
}

function renderTeams() {
  const tbody = document.querySelector("#teams-table tbody");
  tbody.innerHTML = "";
  teams.forEach(team => {
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = team.id;

    const tdP1 = document.createElement("td");
    tdP1.textContent = formatDisplayName(team.player1);

    const tdP2 = document.createElement("td");
    tdP2.textContent = team.player2
      ? formatDisplayName(team.player2)
      : "(waiting for partner / bye)";

    tr.appendChild(tdId);
    tr.appendChild(tdP1);
    tr.appendChild(tdP2);
    tbody.appendChild(tr);
  });
  renderSummary();
}

// --- Winners Bracket Build / Reseed ---

function buildWinnersBracket() {
  winnersBracket = [];

  const teamCount = teams.length;
  if (teamCount < 2) {
    winnersBracket = [];
    matches = [];
    return;
  }

  const roundsCount = Math.ceil(Math.log2(teamCount));
  const bracketSize = Math.pow(2, roundsCount);

  // Reset double elim state
  teamLosses = {};
  losersMatches = [];
  losersWaitingQueue = [];
  finalsState = {
    match1Winner: null,
    match2Winner: null,
    champion: null,
    runnerUp: null
  };
  teams.forEach(t => {
    teamLosses[t.id] = 0;
  });

  const slots = new Array(bracketSize).fill(null);
  for (let i = 0; i < teamCount; i++) {
    slots[i] = teams[i];
  }

  let matchIdCounter = 1;
  const round1 = [];
  for (let i = 0; i < bracketSize; i += 2) {
    const team1 = slots[i];
    const team2 = slots[i + 1];
    round1.push({
      id: matchIdCounter++,
      round: 1,
      index: round1.length,
      team1,
      team2,
      winner: null,
      board: null
    });
  }
  winnersBracket.push(round1);

  for (let r = 2; r <= roundsCount; r++) {
    const prev = winnersBracket[r - 2];
    const thisRound = [];
    for (let i = 0; i < prev.length; i += 2) {
      thisRound.push({
        id: matchIdCounter++,
        round: r,
        index: thisRound.length,
        team1: null,
        team2: null,
        winner: null,
        board: null
      });
    }
    winnersBracket.push(thisRound);
  }

  // R1 list for table
  matches = winnersBracket[0].map(m => ({
    id: m.id,
    team1: m.team1,
    team2: m.team2,
    winner: null,
    board: null
  }));

  autoAdvanceRound1Byes();
}

function autoAdvanceRound1Byes() {
  if (!winnersBracket.length) return;
  const round = winnersBracket[0];

  for (let i = 0; i < round.length; i++) {
    const match = round[i];
    if (match.winner) continue;
    const hasT1 = !!match.team1;
    const hasT2 = !!match.team2;

    if (hasT1 && !hasT2) {
      setMatchWinner(0, i, match.team1, false);
    } else if (!hasT1 && hasT2) {
      setMatchWinner(0, i, match.team2, false);
    }
  }

  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
  renderCourtAssignments();
}

function handleGenerateBracket() {
  if (teams.length < 2) {
    alert("You need at least 2 teams to generate a winner bracket.");
    return;
  }
  buildWinnersBracket();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
  renderSummary();
  renderCourtAssignments();
}

function handleReseedBracket() {
  if (tournamentLocked) {
    alert("Tournament in progress. Cannot reseed.");
    return;
  }
  if (teams.length < 2) {
    alert("You need at least 2 teams to reseed.");
    return;
  }

  const ok = confirm(
    "Reseeding will reset all brackets, losses, and finals, then randomize the bracket. Continue?"
  );
  if (!ok) return;

  teams = shuffleArray(teams);
  buildWinnersBracket();

  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
  renderSummary();
  renderCourtAssignments();
}

// --- Locking UI ---

function ensureTournamentLocked() {
  if (!tournamentLocked) {
    tournamentLocked = true;
    updateLockedUI();
  }
}

function updateLockedUI() {
  const generateTeamsBtn = document.getElementById("generate-teams-btn");
  const reseedBracketBtn = document.getElementById("reseed-bracket-btn");
  const manualTeamForm = document.getElementById("manual-team-form");
  if (!generateTeamsBtn || !reseedBracketBtn || !manualTeamForm) return;

  if (tournamentLocked) {
    generateTeamsBtn.disabled = true;
    reseedBracketBtn.disabled = true;
    manualTeamForm.querySelectorAll("input, select, button").forEach(el => {
      el.disabled = true;
    });
  } else {
    generateTeamsBtn.disabled = false;
    reseedBracketBtn.disabled = false;
    manualTeamForm.querySelectorAll("input, select, button").forEach(el => {
      el.disabled = false;
    });
  }
}

// --- Double elimination helpers ---

function recordLoss(team) {
  if (!team) return;
  if (teamLosses[team.id] === undefined) teamLosses[team.id] = 0;
  teamLosses[team.id] += 1;

  if (teamLosses[team.id] === 1) {
    addTeamToLosersQueue(team);
  } else if (teamLosses[team.id] >= 2) {
    // eliminated
  }
}

function addTeamToLosersQueue(team) {
  losersWaitingQueue.push(team);

  if (losersWaitingQueue.length >= 2) {
    const t1 = losersWaitingQueue.shift();
    const t2 = losersWaitingQueue.shift();
    const index = losersMatches.length;
    const round = Math.floor(index / 2) + 1;

    losersMatches.push({
      id: index + 1,
      round,
      team1: t1,
      team2: t2,
      winner: null,
      board: null
    });

    renderLosersBracket();
    renderFinalsSection();
    renderStandings();
    renderCourtAssignments();
  }
}

// --- Winner matches: set winner + board ---

function setMatchWinner(roundIndex, matchIndex, winnerTeam, fromClick = true) {
  const match = winnersBracket[roundIndex][matchIndex];
  if (!match) return;

  match.winner = winnerTeam;
  ensureTournamentLocked();

  let loserTeam = null;
  if (match.team1 && match.team2) {
    loserTeam = match.team1.id === winnerTeam.id ? match.team2 : match.team1;
  }

  if (loserTeam) {
    recordLoss(loserTeam);
  }

  // Update R1 table match
  if (roundIndex === 0) {
    const tableMatch = matches.find(m => m.id === match.id);
    if (tableMatch) {
      tableMatch.winner = winnerTeam;
    }
  }

  // propagate winner to next round
  if (roundIndex + 1 < winnersBracket.length) {
    const nextRound = winnersBracket[roundIndex + 1];
    const nextIndex = Math.floor(matchIndex / 2);
    const nextMatch = nextRound[nextIndex];
    if (matchIndex % 2 === 0) {
      nextMatch.team1 = winnerTeam;
    } else {
      nextMatch.team2 = winnerTeam;
    }
  }

  if (fromClick) {
    renderMatches();
    renderWinnersBracket();
    renderLosersBracket();
    renderFinalsSection();
    renderStandings();
    renderSummary();
    renderCourtAssignments();
  }
}

function chooseWinnerForMatch(roundIndex, matchIndex) {
  const match = winnersBracket[roundIndex][matchIndex];
  if (!match) return;

  const hasT1 = !!match.team1;
  const hasT2 = !!match.team2;

  if (!hasT1 && !hasT2) {
    alert("No teams assigned to this match yet.");
    return;
  }
  if (hasT1 && !hasT2) {
    setMatchWinner(roundIndex, matchIndex, match.team1);
    return;
  }
  if (!hasT1 && hasT2) {
    setMatchWinner(roundIndex, matchIndex, match.team2);
    return;
  }

  const opt1 = formatTeamLabelWithLosses(match.team1);
  const opt2 = formatTeamLabelWithLosses(match.team2);

  const choice = prompt(
    `Select winner for Match ${match.id}:\n` +
    `1) ${opt1}\n` +
    `2) ${opt2}\n\n` +
    `Enter 1 or 2 (Cancel to abort).`
  );

  if (choice === "1") {
    setMatchWinner(roundIndex, matchIndex, match.team1);
  } else if (choice === "2") {
    setMatchWinner(roundIndex, matchIndex, match.team2);
  }
}

// --- Render winners bracket with SVG lines & board selector ---

function renderWinnersBracket() {
  const container = document.getElementById("winners-bracket");
  if (!container) return;

  container.innerHTML = "";
  container.className = "bracket-container bracket-container-top";

  if (!winnersBracket.length) {
    container.textContent = "Generate the winner bracket to view it here.";
    return;
  }

  winnersBracket.forEach((roundMatches, rIndex) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = "bracket-round";

    const title = document.createElement("div");
    title.className = "bracket-round-title";
    title.textContent = `Round ${rIndex + 1}`;
    roundDiv.appendChild(title);

    for (let i = 0; i < roundMatches.length; i += 2) {
      const remaining = roundMatches.length - i;
      const pairDiv = document.createElement("div");
      pairDiv.className = remaining >= 2 ? "match-pair" : "match-pair single";

      const matchA = roundMatches[i];
      if (matchA) {
        const boxA = createMatchBoxWithBoard(matchA, rIndex, i, true);
        pairDiv.appendChild(boxA);
      }

      if (remaining >= 2) {
        const matchB = roundMatches[i + 1];
        if (matchB) {
          const boxB = createMatchBoxWithBoard(matchB, rIndex, i + 1, true);
          pairDiv.appendChild(boxB);
        }
      }

      roundDiv.appendChild(pairDiv);
    }

    container.appendChild(roundDiv);
  });

  drawBracketLines("winners-bracket", winnersBracket);
  renderCourtAssignments();
}

// helper to create match box with board dropdown
function createMatchBoxWithBoard(match, roundIndex, matchIndex, isWinnerBracket) {
  const box = document.createElement("div");
  box.className = "match-box";
  box.dataset.round = String(roundIndex);
  box.dataset.matchIndex = String(matchIndex);

  const label = document.createElement("div");
  label.className = "match-label";
  label.textContent = `Match ${match.id}`;
  box.appendChild(label);

  const t1Div = document.createElement("div");
  t1Div.className = "team-line";
  t1Div.textContent = match.team1
    ? formatTeamLabelWithLosses(match.team1)
    : isWinnerBracket
      ? "TBD / BYE"
      : "TBD";
  box.appendChild(t1Div);

  const t2Div = document.createElement("div");
  t2Div.className = "team-line";
  t2Div.textContent = match.team2
    ? formatTeamLabelWithLosses(match.team2)
    : isWinnerBracket
      ? "TBD / BYE"
      : "TBD";
  box.appendChild(t2Div);

  if (match.winner) {
    const wDiv = document.createElement("div");
    wDiv.className = "team-line";
    wDiv.textContent = `Winner: ${formatTeamLabelWithLosses(match.winner)}`;
    box.appendChild(wDiv);
  }

  // Board selector
  const boardSelect = document.createElement("select");
  boardSelect.style.marginTop = "4px";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Board -";
  boardSelect.appendChild(defaultOpt);

  for (let b = 1; b <= 20; b++) {
    const opt = document.createElement("option");
    opt.value = String(b);
    opt.textContent = `Board ${b}`;
    if (match.board === b) opt.selected = true;
    boardSelect.appendChild(opt);
  }

  boardSelect.addEventListener("change", () => {
    const value = parseInt(boardSelect.value, 10);
    match.board = isNaN(value) ? null : value;

    // sync R1 table if winner bracket
    if (isWinnerBracket && roundIndex === 0) {
      const tableMatch = matches.find(m => m.id === match.id);
      if (tableMatch) {
        tableMatch.board = match.board;
        renderMatches(); // will also call renderCourtAssignments
        return;
      }
    }

    renderCourtAssignments();
  });

  box.appendChild(boardSelect);

  // click to choose winner (for both winner & loser bracket)
  box.addEventListener("click", (ev) => {
    // avoid triggering when clicking the select
    if (ev.target === boardSelect) return;
    if (isWinnerBracket) {
      chooseWinnerForMatch(roundIndex, matchIndex);
    } else {
      const globalIndex = losersMatches.indexOf(match);
      if (globalIndex >= 0) chooseWinnerForLosersMatch(globalIndex);
    }
  });

  return box;
}

// --- Loser bracket ---

function setLosersMatchWinner(matchIndex, winnerTeam) {
  const match = losersMatches[matchIndex];
  if (!match) return;

  match.winner = winnerTeam;
  ensureTournamentLocked();

  let loserTeam = null;
  if (match.team1 && match.team2) {
    loserTeam = match.team1.id === winnerTeam.id ? match.team2 : match.team1;
  }

  if (loserTeam) recordLoss(loserTeam);
  addTeamToLosersQueue(winnerTeam); // winner continues with 1 loss

  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
  renderSummary();
  renderCourtAssignments();
}

function chooseWinnerForLosersMatch(globalIndex) {
  const match = losersMatches[globalIndex];
  if (!match) return;

  const hasT1 = !!match.team1;
  const hasT2 = !!match.team2;

  if (!hasT1 && !hasT2) {
    alert("No teams assigned to this match yet.");
    return;
  }
  if (hasT1 && !hasT2) {
    setLosersMatchWinner(globalIndex, match.team1);
    return;
  }
  if (!hasT1 && hasT2) {
    setLosersMatchWinner(globalIndex, match.team2);
    return;
  }

  const opt1 = formatTeamLabelWithLosses(match.team1);
  const opt2 = formatTeamLabelWithLosses(match.team2);

  const choice = prompt(
    `Select winner for Loser Match ${match.id} (Round ${match.round}):\n` +
    `1) ${opt1}\n` +
    `2) ${opt2}\n\n` +
    `Enter 1 or 2 (Cancel to abort).`
  );

  if (choice === "1") {
    setLosersMatchWinner(globalIndex, match.team1);
  } else if (choice === "2") {
    setLosersMatchWinner(globalIndex, match.team2);
  }
}

function renderLosersBracket() {
  const container = document.getElementById("losers-bracket");
  if (!container) return;

  container.innerHTML = "";
  container.className = "bracket-container bracket-container-bottom";

  if (!losersMatches.length) {
    container.textContent = "No teams in the loser bracket yet.";
    lastLoserRoundsForLines = [];
    renderCourtAssignments();
    return;
  }

  const roundsMap = new Map();
  losersMatches.forEach(match => {
    const r = match.round || 1;
    if (!roundsMap.has(r)) roundsMap.set(r, []);
    roundsMap.get(r).push(match);
  });

  const roundNumbers = Array.from(roundsMap.keys()).sort((a, b) => a - b);
  const roundsArray = [];

  roundNumbers.forEach((roundNum, idx) => {
    const matchesInRound = roundsMap.get(roundNum) || [];
    roundsArray.push(matchesInRound);

    const roundDiv = document.createElement("div");
    roundDiv.className = "bracket-round";

    const title = document.createElement("div");
    title.className = "bracket-round-title";
    title.textContent = `Round ${roundNum}`;
    roundDiv.appendChild(title);

    for (let i = 0; i < matchesInRound.length; i += 2) {
      const remaining = matchesInRound.length - i;
      const pairDiv = document.createElement("div");
      pairDiv.className = remaining >= 2 ? "match-pair" : "match-pair single";

      const matchA = matchesInRound[i];
      if (matchA) {
        const boxA = createMatchBoxWithBoard(matchA, idx, i, false);
        pairDiv.appendChild(boxA);
      }

      if (remaining >= 2) {
        const matchB = matchesInRound[i + 1];
        if (matchB) {
          const boxB = createMatchBoxWithBoard(matchB, idx, i + 1, false);
          pairDiv.appendChild(boxB);
        }
      }

      roundDiv.appendChild(pairDiv);
    }

    container.appendChild(roundDiv);
  });

  lastLoserRoundsForLines = roundsArray;
  drawBracketLines("losers-bracket", roundsArray);
  renderCourtAssignments();
}

// --- R1 table ---

function renderMatches() {
  const tbody = document.querySelector("#matches-table tbody");
  tbody.innerHTML = "";

  matches.forEach(match => {
    const tr = document.createElement("tr");

    const tdMatch = document.createElement("td");
    tdMatch.textContent = match.id;

    const tdTeamA = document.createElement("td");
    tdTeamA.textContent = match.team1
      ? formatTeamLabelWithLosses(match.team1)
      : "TBD / BYE";

    const tdTeamB = document.createElement("td");
    tdTeamB.textContent = match.team2
      ? formatTeamLabelWithLosses(match.team2)
      : "TBD / BYE";

    const tdBoard = document.createElement("td");
    tdBoard.textContent = match.board ? `Board ${match.board}` : "-";

    if (match.winner) {
      tdMatch.textContent += " ⭐";
      if (match.team1 && match.winner.id === match.team1.id) {
        tdTeamA.textContent += " (WIN)";
      }
      if (match.team2 && match.winner.id === match.team2.id) {
        tdTeamB.textContent += " (WIN)";
      }
    }

    tr.appendChild(tdMatch);
    tr.appendChild(tdTeamA);
    tr.appendChild(tdTeamB);
    tr.appendChild(tdBoard);

    tbody.appendChild(tr);
  });

  renderSummary();
  renderCourtAssignments();
}

// --- Finals / King seat ---

function getKingSeatTeam() {
  if (!winnersBracket.length) return null;
  const lastRound = winnersBracket[winnersBracket.length - 1];
  if (!lastRound.length) return null;
  const finalMatch = lastRound[lastRound.length - 1];
  return finalMatch.winner || null;
}

function getLosersChampionTeam() {
  if (!losersMatches.length) return null;
  const lastMatch = losersMatches[losersMatches.length - 1];
  return lastMatch.winner || null;
}

function handleFinalMatch(matchNumber) {
  const king = getKingSeatTeam();
  const challenger = getLosersChampionTeam();
  if (!king || !challenger) {
    alert("Need both a winner bracket champion and loser bracket champion first.");
    return;
  }
  if (finalsState.champion) {
    alert("Finals are already complete.");
    return;
  }

  ensureTournamentLocked();

  if (matchNumber === 2) {
    if (!finalsState.match1Winner) {
      alert("Play Finals Match 1 first.");
      return;
    }
    if (finalsState.match1Winner.id === king.id) {
      alert("King seat already won Match 1. No Match 2 needed.");
      return;
    }
  }

  const kingLabel = formatTeamLabelWithLosses(king);
  const challengerLabel = formatTeamLabelWithLosses(challenger);

  const choice = prompt(
    `Select winner for Finals Match ${matchNumber}:\n` +
    `1) King seat: ${kingLabel}\n` +
    `2) Challenger: ${challengerLabel}\n\n` +
    `Enter 1 or 2 (Cancel to abort).`
  );

  if (choice !== "1" && choice !== "2") return;

  const winnerTeam = choice === "1" ? king : challenger;
  const loserTeam = choice === "1" ? challenger : king;

  if (matchNumber === 1) {
    finalsState.match1Winner = winnerTeam;
    if (winnerTeam.id === king.id) {
      finalsState.champion = king;
      finalsState.runnerUp = challenger;
    }
  } else {
    finalsState.match2Winner = winnerTeam;
    finalsState.champion = winnerTeam;
    finalsState.runnerUp = winnerTeam.id === king.id ? challenger : king;
  }

  renderFinalsSection();
  renderStandings();
}

function renderFinalsSection() {
  const kingLabelEl = document.getElementById("finals-king-seat-label");
  const challengerLabelEl = document.getElementById("finals-challenger-label");
  const match1ResultEl = document.getElementById("finals-match1-result");
  const match2ResultEl = document.getElementById("finals-match2-result");
  const summaryNoteEl = document.getElementById("finals-summary-note");

  const king = getKingSeatTeam();
  const challenger = getLosersChampionTeam();

  kingLabelEl.textContent = king ? formatTeamLabelWithLosses(king) : "Not decided yet";
  challengerLabelEl.textContent = challenger
    ? formatTeamLabelWithLosses(challenger)
    : "Not decided yet";

  match1ResultEl.textContent = finalsState.match1Winner
    ? `Winner: ${formatTeamLabelWithLosses(finalsState.match1Winner)}`
    : "";

  match2ResultEl.textContent = finalsState.match2Winner
    ? `Winner: ${formatTeamLabelWithLosses(finalsState.match2Winner)}`
    : "";

  if (finalsState.champion && finalsState.runnerUp) {
    summaryNoteEl.textContent = `Champion: ${formatTeamLabelWithLosses(
      finalsState.champion
    )} | Runner-up: ${formatTeamLabelWithLosses(
      finalsState.runnerUp
    )}. Challenger must beat the king seat twice; king seat only needs one win.`;
  } else if (king && challenger) {
    summaryNoteEl.textContent =
      "Finals ready: challenger must beat the king seat twice. Click Finals Match 1 to start.";
  } else {
    summaryNoteEl.textContent =
      "Finals use king seat rules: the challenger from the loser bracket must beat the king seat team twice.";
  }
}

// --- Standings ---

function renderStandings() {
  const panel = document.getElementById("standings-panel");
  if (!panel) return;

  if (!teams.length) {
    panel.textContent = "No teams yet.";
    return;
  }

  const champion = finalsState.champion || null;
  const runnerUp = finalsState.runnerUp || null;

  const eliminated = [];
  const oneLoss = [];
  const unbeaten = [];

  teams.forEach(t => {
    const losses = getTeamLosses(t);
    if (losses >= 2) eliminated.push(t);
    else if (losses === 1) oneLoss.push(t);
    else unbeaten.push(t);
  });

  let html = "";
  html += "<p><strong>Champion:</strong> " +
    (champion ? formatTeamLabelWithLosses(champion) : "TBD") +
    "</p>";
  html += "<p><strong>Runner-up:</strong> " +
    (runnerUp ? formatTeamLabelWithLosses(runnerUp) : "TBD") +
    "</p>";

  html += "<p><strong>Unbeaten (0 losses):</strong><br>";
  html += unbeaten.length
    ? unbeaten.map(formatTeamLabelWithLosses).join("<br>")
    : "None";
  html += "</p>";

  html += "<p><strong>One loss:</strong><br>";
  html += oneLoss.length
    ? oneLoss.map(formatTeamLabelWithLosses).join("<br>")
    : "None";
  html += "</p>";

  html += "<p><strong>Eliminated (2 losses):</strong><br>";
  html += eliminated.length
    ? eliminated.map(formatTeamLabelWithLosses).join("<br>")
    : "None";
  html += "</p>";

  panel.innerHTML = html;
}

// --- Court assignments ---

function renderCourtAssignments() {
  const tbody = document.querySelector("#court-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const rows = [];

  // Winner bracket matches with board assigned & no winner yet
  winnersBracket.forEach((roundMatches, rIndex) => {
    roundMatches.forEach(match => {
      if (
        match.board &&
        !match.winner &&
        (match.team1 || match.team2)
      ) {
        rows.push({
          board: match.board,
          bracket: "Winner",
          round: rIndex + 1,
          matchId: match.id,
          label: `${formatTeamLabel(match.team1)} vs ${formatTeamLabel(
            match.team2
          )}`
        });
      }
    });
  });

  // Loser bracket matches with board assigned & no winner yet
  losersMatches.forEach(match => {
    if (
      match.board &&
      !match.winner &&
      (match.team1 || match.team2)
    ) {
      rows.push({
        board: match.board,
        bracket: "Loser",
        round: match.round || 1,
        matchId: match.id,
        label: `${formatTeamLabel(match.team1)} vs ${formatTeamLabel(
          match.team2
        )}`
      });
    }
  });

  // Sort by board, then bracket, then round
  rows.sort((a, b) => {
    if (a.board !== b.board) return a.board - b.board;
    if (a.bracket !== b.bracket) return a.bracket.localeCompare(b.bracket);
    if (a.round !== b.round) return a.round - b.round;
    return a.matchId - b.matchId;
  });

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No active matches with boards assigned.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");

    const tdBoard = document.createElement("td");
    tdBoard.textContent = row.board;

    const tdBracket = document.createElement("td");
    tdBracket.textContent = row.bracket;

    const tdRound = document.createElement("td");
    tdRound.textContent = row.round;

    const tdMatch = document.createElement("td");
    tdMatch.textContent = row.matchId;

    const tdTeams = document.createElement("td");
    tdTeams.textContent = row.label;

    tr.appendChild(tdBoard);
    tr.appendChild(tdBracket);
    tr.appendChild(tdRound);
    tr.appendChild(tdMatch);
    tr.appendChild(tdTeams);

    tbody.appendChild(tr);
  });
}

// --- Display mode ---

function toggleDisplayMode() {
  document.body.classList.toggle("display-mode");
}

// --- Mystery Out ---

function populateMysteryAndFeatSelects() {
  const mysterySelect = document.getElementById("mysteryPlayerSelect");
  const featSelect = document.getElementById("featPlayerSelect");
  const selects = [mysterySelect, featSelect].filter(Boolean);
  if (!selects.length) return;

  selects.forEach(select => {
    select.innerHTML = "";

    if (!players.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No players yet";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select player…";
    select.appendChild(placeholder);

    players.forEach(p => {
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.textContent = formatDisplayName(p);
      select.appendChild(opt);
    });
  });
}

function handleMysteryOutAdd(e) {
  e.preventDefault();

  const playerSelect = document.getElementById("mysteryPlayerSelect");
  const outInput = document.getElementById("mysteryOutNumber");

  const playerId = parseInt(playerSelect.value, 10);
  const outNumber = parseInt(outInput.value, 10);

  if (!playerId) {
    alert("Please select a player.");
    return;
  }
  if (!outNumber || outNumber < 1 || outNumber > 180) {
    alert("Please enter a number between 1 and 180.");
    return;
  }

  if (!possibleOutMap[outNumber]) {
    alert("This number has no possible Master Out. It is marked as 'No Out'.");
    return;
  }

  const player = getPlayerById(playerId);
  if (!player) {
    alert("Selected player not found.");
    return;
  }

  mysteryOutEntries.push({
    id: Date.now(),
    playerId,
    outNumber,
    timestamp: new Date().toISOString()
  });

  playerSelect.value = "";
  outInput.value = "";

  renderMysteryOutBoard();
}

function renderMysteryOutBoard() {
  const bodies = [];
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`mystery-out-table-${i}`);
    if (!el) return;
    el.innerHTML = "";
    bodies.push(el);
  }

  const grouped = new Map();
  mysteryOutEntries.forEach(entry => {
    const key = entry.outNumber;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  });

  for (let n = 1; n <= 180; n++) {
    const entries = grouped.get(n) || [];
    const isPossible = !!possibleOutMap[n];

    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = n;

    const tdFirst = document.createElement("td");
    const tdOthers = document.createElement("td");

    if (!isPossible) {
      tdFirst.textContent = "No Out";
      tdOthers.textContent = "-";
    } else if (!entries.length) {
      tdFirst.textContent = "";
      tdOthers.textContent = "-";

      tdNum.style.cursor = "pointer";
      tdFirst.style.cursor = "pointer";

      const handler = () => showMysteryPlayerDropdown(n, tdFirst);
      tdNum.addEventListener("click", handler);
      tdFirst.addEventListener("click", handler);
    } else {
      const first = entries[0];
      const firstPlayer = getPlayerById(first.playerId);
      tdFirst.textContent = firstPlayer
        ? formatDisplayName(firstPlayer)
        : "Unknown";

      if (entries.length > 1) {
        const span = document.createElement("span");
        span.textContent = `${entries.length - 1} more`;
        const names = entries.slice(1)
          .map(e => {
            const p = getPlayerById(e.playerId);
            return p ? formatDisplayName(p) : "Unknown";
          })
          .join(", ");
        span.title = names;
        tdOthers.appendChild(span);
      } else {
        tdOthers.textContent = "-";
      }
    }

    tr.appendChild(tdNum);
    tr.appendChild(tdFirst);
    tr.appendChild(tdOthers);

    // 6 columns × 30 rows
    const colIndex = Math.floor((n - 1) / 30); // 0..5
    const targetBody = bodies[colIndex] || bodies[0];
    targetBody.appendChild(tr);
  }
}

function showMysteryPlayerDropdown(outNumber, cell) {
  if (!players.length) {
    alert("No players available yet.");
    return;
  }

  const existingSelect = cell.querySelector("select");
  if (existingSelect) return;

  cell.innerHTML = "";

  const select = document.createElement("select");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select player…";
  select.appendChild(placeholder);

  players.forEach(p => {
    const opt = document.createElement("option");
    opt.value = String(p.id);
    opt.textContent = formatDisplayName(p);
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const playerId = parseInt(select.value, 10);
    if (!playerId) return;

    const player = getPlayerById(playerId);
    if (!player) {
      alert("Player not found.");
      return;
    }

    mysteryOutEntries.push({
      id: Date.now(),
      playerId,
      outNumber,
      timestamp: new Date().toISOString()
    });

    renderMysteryOutBoard();
  });

  cell.appendChild(select);
  select.focus();
}

// --- Big Hits (Special Shots) ---

function handleAddSpecialShot(e) {
  e.preventDefault();

  const playerSelect = document.getElementById("featPlayerSelect");
  const typeSelect = document.getElementById("featTypeSelect");

  if (!playerSelect || !typeSelect) return;

  const playerId = parseInt(playerSelect.value, 10);
  const shotType = typeSelect.value;

  if (!playerId) {
    alert("Please select a player.");
    return;
  }
  if (!shotType) {
    alert("Please select a Big Hit type.");
    return;
  }

  const player = getPlayerById(playerId);
  if (!player) {
    alert("Selected player not found.");
    return;
  }

  specialShots.push({
    id: Date.now(),
    playerId,
    type: shotType,
    timestamp: new Date().toISOString()
  });

  playerSelect.value = "";
  typeSelect.value = "";

  renderSpecialShots();
}

function renderSpecialShots() {
  const tbody = document.querySelector("#feats-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!specialShots.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No Big Hits recorded yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  specialShots
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .forEach((entry, index) => {
      const tr = document.createElement("tr");

      const tdIndex = document.createElement("td");
      tdIndex.textContent = index + 1;

      const player = getPlayerById(entry.playerId);
      const tdPlayer = document.createElement("td");
      tdPlayer.textContent = player
        ? formatDisplayName(player)
        : "Unknown (player removed)";

      const tdType = document.createElement("td");
      tdType.textContent = entry.type;

      const tdTime = document.createElement("td");
      const d = new Date(entry.timestamp);
      tdTime.textContent = isNaN(d.getTime()) ? "-" : d.toLocaleString();

      tr.appendChild(tdIndex);
      tr.appendChild(tdPlayer);
      tr.appendChild(tdType);
      tr.appendChild(tdTime);

      tbody.appendChild(tr);
    });
}

// --- Payouts ---

function handleCalculatePayouts() {
  const entryFeeInput = document.getElementById("entryFee");
  const manualPotInput = document.getElementById("manualPot");

  const mysteryPercentInput = document.getElementById("payoutMysteryPercent");
  const firstPercentInput = document.getElementById("payoutFirstPercent");
  const secondPercentInput = document.getElementById("payoutSecondPercent");
  const thirdPercentInput = document.getElementById("payoutThirdPercent");
  const fourthPercentInput = document.getElementById("payoutFourthPercent");
  const fifthPercentInput = document.getElementById("payoutFifthPercent");
  const sixthPercentInput = document.getElementById("payoutSixthPercent");
  const teamOutPercentInput = document.getElementById("payoutTeamOutPercent");

  const mysteryFixedInput = document.getElementById("payoutMysteryFixed");
  const firstFixedInput = document.getElementById("payoutFirstFixed");
  const secondFixedInput = document.getElementById("payoutSecondFixed");
  const thirdFixedInput = document.getElementById("payoutThirdFixed");
  const fourthFixedInput = document.getElementById("payoutFourthFixed");
  const fifthFixedInput = document.getElementById("payoutFifthFixed");
  const sixthFixedInput = document.getElementById("payoutSixthFixed");
  const teamOutFixedInput = document.getElementById("payoutTeamOutFixed");

  const honeyPerPlayerInput = document.getElementById("honeyPotPerPlayer");
  const honeyThresholdInput = document.getElementById("honeyPotThreshold");

  const payoutsTableBody = document.querySelector("#payouts-table tbody");
  const payoutsInfo = document.getElementById("payouts-info");

  payoutsTableBody.innerHTML = "";
  payoutsInfo.textContent = "";

  const paidPlayers = players.filter(p => p.paid).length;
  const femalePlayers = players.filter(p => p.gender === "F").length;

  const entryFee = parseFloat(entryFeeInput.value);
  const manualPot = parseFloat(manualPotInput.value);

  let totalPot = 0;
  let potSource = "";

  if (!isNaN(manualPot) && manualPot > 0) {
    totalPot = manualPot;
    potSource = "manual";
  } else if (!isNaN(entryFee) && entryFee > 0 && paidPlayers > 0) {
    totalPot = entryFee * paidPlayers;
    potSource = "calculated";
  }

  const mysteryPercent = parseFloat(mysteryPercentInput.value) || 0;
  const firstPercent = parseFloat(firstPercentInput.value) || 0;
  const secondPercent = parseFloat(secondPercentInput.value) || 0;
  const thirdPercent = parseFloat(thirdPercentInput.value) || 0;
  const fourthPercent = parseFloat(fourthPercentInput.value) || 0;
  const fifthPercent = parseFloat(fifthPercentInput.value) || 0;
  const sixthPercent = parseFloat(sixthPercentInput.value) || 0;
  const teamOutPercent = parseFloat(teamOutPercentInput.value) || 0;

  const mysteryFixed = parseFloat(mysteryFixedInput.value);
  const firstFixed = parseFloat(firstFixedInput.value);
  const secondFixed = parseFloat(secondFixedInput.value);
  const thirdFixed = parseFloat(thirdFixedInput.value);
  const fourthFixed = parseFloat(fourthFixedInput.value);
  const fifthFixed = parseFloat(fifthFixedInput.value);
  const sixthFixed = parseFloat(sixthFixedInput.value);
  const teamOutFixed = parseFloat(teamOutFixedInput.value);

  const honeyPerPlayer = parseFloat(honeyPerPlayerInput.value) || 0;
  const honeyThreshold = parseInt(honeyThresholdInput.value, 10) || 4;

  const percentSum =
    mysteryPercent +
    firstPercent +
    secondPercent +
    thirdPercent +
    fourthPercent +
    fifthPercent +
    sixthPercent +
    teamOutPercent;

  const honeyActive = femalePlayers >= honeyThreshold;
  let honeyAmount = 0;
  if (honeyActive && honeyPerPlayer > 0) {
    honeyAmount = honeyPerPlayer * 2; // 2 players per team
  }

  let baseForPercent = totalPot;
  if (honeyAmount > 0 && honeyAmount < baseForPercent) {
    baseForPercent -= honeyAmount;
  } else if (honeyAmount >= baseForPercent && totalPot > 0) {
    honeyAmount = totalPot;
    baseForPercent = 0;
  }

  let mysteryAmount = 0;
  let firstAmount = 0;
  let secondAmount = 0;
  let thirdAmount = 0;
  let fourthAmount = 0;
  let fifthAmount = 0;
  let sixthAmount = 0;
  let teamOutAmount = 0;

  if (baseForPercent > 0 && percentSum > 0) {
    const factor = baseForPercent / 100;
    mysteryAmount = factor * mysteryPercent;
    firstAmount = factor * firstPercent;
    secondAmount = factor * secondPercent;
    thirdAmount = factor * thirdPercent;
    fourthAmount = factor * fourthPercent;
    fifthAmount = factor * fifthPercent;
    sixthAmount = factor * sixthPercent;
    teamOutAmount = factor * teamOutPercent;
  }

  // overrides with fixed values
  if (!isNaN(mysteryFixed) && mysteryFixed > 0) mysteryAmount = mysteryFixed;
  if (!isNaN(firstFixed) && firstFixed > 0) firstAmount = firstFixed;
  if (!isNaN(secondFixed) && secondFixed > 0) secondAmount = secondFixed;
  if (!isNaN(thirdFixed) && thirdFixed > 0) thirdAmount = thirdFixed;
  if (!isNaN(fourthFixed) && fourthFixed > 0) fourthAmount = fourthFixed;
  if (!isNaN(fifthFixed) && fifthFixed > 0) fifthAmount = fifthFixed;
  if (!isNaN(sixthFixed) && sixthFixed > 0) sixthAmount = sixthFixed;
  if (!isNaN(teamOutFixed) && teamOutFixed > 0) teamOutAmount = teamOutFixed;

  function addRow(label, percent, amount) {
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    tdItem.textContent = label;

    const tdPercent = document.createElement("td");
    tdPercent.textContent =
      percent !== null && percent !== undefined
        ? `${percent.toFixed(1)}%`
        : "-";

    const tdAmount = document.createElement("td");
    tdAmount.textContent = `$${amount.toFixed(2)}`;

    tr.appendChild(tdItem);
    tr.appendChild(tdPercent);
    tr.appendChild(tdAmount);

    const tbody = document.querySelector("#payouts-table tbody");
    tbody.appendChild(tr);
  }

  if (totalPot <= 0) {
    addRow("Total Pot", null, 0);
    addRow("Mystery Out", mysteryPercent, 0);
    addRow("1st place", firstPercent, 0);
    addRow("2nd place", secondPercent, 0);
    addRow("3rd place", thirdPercent, 0);
    addRow("4th place", fourthPercent, 0);
    addRow("5th place", fifthPercent, 0);
    addRow("6th place", sixthPercent, 0);
    addRow("Team Out", teamOutPercent, 0);
    addRow("Honey Pot (team)", null, 0);
    payoutsInfo.textContent =
      "No valid pot defined. Set an entry fee and mark players as paid, or enter a manual total pot.";
    return;
  }

  addRow("Total Pot", null, totalPot);
  addRow("Mystery Out", mysteryPercent, mysteryAmount);
  addRow("1st place", firstPercent, firstAmount);
  addRow("2nd place", secondPercent, secondAmount);
  addRow("3rd place", thirdPercent, thirdAmount);
  addRow("4th place", fourthPercent, fourthAmount);
  addRow("5th place", fifthPercent, fifthAmount);
  addRow("6th place", sixthPercent, sixthAmount);
  addRow("Team Out", teamOutPercent, teamOutAmount);
  addRow("Honey Pot (team)", null, honeyAmount);

  let infoText = `Total pot: $${totalPot.toFixed(
    2
  )}. Paid players: ${paidPlayers}. Female players: ${femalePlayers}. `;

  if (potSource === "manual") {
    infoText += "Pot source: manual entry. ";
  } else if (potSource === "calculated") {
    infoText += "Pot source: entry fee × paid players. ";
  } else {
    infoText += "Pot source: unknown (check values). ";
  }

  infoText += `Base for percentages after Honey Pot: $${baseForPercent.toFixed(
    2
  )}. `;

  if (honeyActive) {
    infoText += `Honey Pot is ACTIVE (≥ ${honeyThreshold} female players). `;
  } else {
    infoText += `Honey Pot is NOT active (need at least ${honeyThreshold} female players). `;
  }

  if (percentSum !== 100) {
    infoText += `Note: your percentage fields add up to ${percentSum.toFixed(
      1
    )}%, not 100%. Amounts are still proportional to the base pot; fixed values override where entered.`;
  }

  payoutsInfo.textContent = infoText;
}

// --- SVG Lines between rounds ---

function drawBracketLines(containerId, roundsArray) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const old = container.querySelector("svg.svg-connector-layer");
  if (old) old.remove();

  if (!roundsArray || !roundsArray.length) return;

  const width = container.scrollWidth || container.clientWidth;
  const height = container.scrollHeight || container.clientHeight;
  if (!width || !height) return;

  const containerRect = container.getBoundingClientRect();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("svg-connector-layer");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  for (let r = 0; r < roundsArray.length - 1; r++) {
    const roundMatches = roundsArray[r] || [];
    for (let m = 0; m < roundMatches.length; m++) {
      const srcBox = container.querySelector(
        `.match-box[data-round="${r}"][data-match-index="${m}"]`
      );
      if (!srcBox) continue;

      const nextMatchIndex = Math.floor(m / 2);
      const dstBox = container.querySelector(
        `.match-box[data-round="${r + 1}"][data-match-index="${nextMatchIndex}"]`
      );
      if (!dstBox) continue;

      const srcRect = srcBox.getBoundingClientRect();
      const dstRect = dstBox.getBoundingClientRect();

      const x1 =
        srcRect.right - containerRect.left + container.scrollLeft;
      const y1 =
        srcRect.top +
        srcRect.height / 2 -
        containerRect.top +
        container.scrollTop;

      const x2 =
        dstRect.left - containerRect.left + container.scrollLeft;
      const y2 =
        dstRect.top +
        dstRect.height / 2 -
        containerRect.top +
        container.scrollTop;

      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", d);
      path.setAttribute("stroke", "#4b5563");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "none");

      svg.appendChild(path);
    }
  }

  container.appendChild(svg);
}

// --- Save / Load Tournament State ---

function saveTournamentState() {
  const state = {
    players,
    teams,
    matches,
    winnersBracket,
    mysteryOutEntries,
    specialShots,
    teamLosses,
    losersMatches,
    losersWaitingQueue,
    finalsState,
    tournamentLocked
  };

  try {
    localStorage.setItem("dartTournamentState", JSON.stringify(state));
    alert("Tournament state saved.");
  } catch (e) {
    console.error(e);
    alert("Failed to save tournament state.");
  }
}

function loadTournamentState() {
  const data = localStorage.getItem("dartTournamentState");
  if (!data) {
    alert("No saved tournament found.");
    return;
  }

  try {
    const state = JSON.parse(data);

    players = state.players || [];
    teams = state.teams || [];
    matches = state.matches || [];
    winnersBracket = state.winnersBracket || [];
    mysteryOutEntries = state.mysteryOutEntries || [];
    specialShots = state.specialShots || [];
    teamLosses = state.teamLosses || {};
    losersMatches = state.losersMatches || [];
    losersWaitingQueue = state.losersWaitingQueue || [];
    finalsState =
      state.finalsState || {
        match1Winner: null,
        match2Winner: null,
        champion: null,
        runnerUp: null
      };
    tournamentLocked = !!state.tournamentLocked;

    renderPlayers();
    renderTeams();
    renderMatches();
    renderWinnersBracket();
    renderLosersBracket();
    renderFinalsSection();
    renderMysteryOutBoard();
    populateManualTeamSelects();
    populateMysteryAndFeatSelects();
    renderSpecialShots();
    renderStandings();
    renderSummary();
    renderCourtAssignments();
    updateLockedUI();

    alert("Tournament state loaded.");
  } catch (e) {
    console.error(e);
    alert("Failed to load saved tournament state.");
  }
}
