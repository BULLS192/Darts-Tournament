// Simple in-browser state (no server yet)
let players = [];
let teams = [];
let matches = [];          // first-round list for table (winner side)
let winnersBracket = [];   // array of rounds: winnersBracket[roundIndex][matchIndex]
let mysteryOutEntries = [];
let lastLoserRoundsForLines = []; // for redrawing SVG on resize
let bigHits = [];     // High-Ton, White Horse, 9-Mark, Hat-Trick



// Double-elim tracking
let teamLosses = {};       // teamId -> 0,1,2
let losersMatches = [];    // flat list of losers bracket matches
let losersWaitingQueue = [];

// Finals / king seat
let finalsState = {
  match1Winner: null,
  match2Winner: null,
  champion: null,
  runnerUp: null
};

// Lock when tournament has started
let tournamentLocked = false;

// Player "database" for reuse between tournaments
const PLAYER_DB_KEY = "dartPlayerDatabase";
let playerDatabase = [];

// Which numbers 1–180 have a possible Master Out
let possibleOutMap = {};

// DOM READY
document.addEventListener("DOMContentLoaded", () => {
  const playerForm = document.getElementById("player-form");
  const generateTeamsBtn = document.getElementById("generate-teams-btn");
  const generateMatchesBtn = document.getElementById("generate-matches-btn");
  const reseedBracketBtn = document.getElementById("reseed-bracket-btn");
  const manualTeamForm = document.getElementById("manual-team-form");
  const mysteryOutForm = document.getElementById("mystery-out-form");
  const calculatePayoutsBtn = document.getElementById("calculate-payouts-btn");
  const finalsMatch1Btn = document.getElementById("finals-match1-btn");
  const finalsMatch2Btn = document.getElementById("finals-match2-btn");
  const saveBtn = document.getElementById("save-tournament-btn");
  const loadBtn = document.getElementById("load-tournament-btn");
  const displayModeBtn = document.getElementById("toggle-display-mode-btn");
  const loadSavedPlayersBtn = document.getElementById("load-saved-players-btn");
  const clearSavedPlayersBtn = document.getElementById("clear-saved-players-btn");
  const featsForm = document.getElementById("feats-form");

 


  initPlayerDatabase();
  buildPossibleOutMap();   // build Master Out possibilities

  playerForm.addEventListener("submit", handleAddPlayer);
  generateTeamsBtn.addEventListener("click", handleGenerateTeams);
  generateMatchesBtn.addEventListener("click", handleGenerateBracket);
  reseedBracketBtn.addEventListener("click", handleReseedBracket);
  manualTeamForm.addEventListener("submit", handleManualTeamAdd);
  mysteryOutForm.addEventListener("submit", handleMysteryOutAdd);
  calculatePayoutsBtn.addEventListener("click", handleCalculatePayouts);
  finalsMatch1Btn.addEventListener("click", () => handleFinalMatch(1));
  finalsMatch2Btn.addEventListener("click", () => handleFinalMatch(2));
  saveBtn.addEventListener("click", saveTournamentState);
  loadBtn.addEventListener("click", loadTournamentState);
  displayModeBtn.addEventListener("click", toggleDisplayMode);
  loadSavedPlayersBtn.addEventListener("click", handleLoadSavedPlayers);
  clearSavedPlayersBtn.addEventListener("click", handleClearSavedPlayers);
  if (featsForm) {
    featsForm.addEventListener("submit", handleAddBigHit);
  }


  renderPlayers();
  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderMysteryOutBoard();
  populateManualTeamSelects();
  populateMysteryPlayerSelect();
  renderBigHits();
  renderStandings();
  renderSummary();
  updateLockedUI();
 // redraw SVG lines when the window resizes
  window.addEventListener("resize", () => {
    drawBracketLines("winners-bracket", winnersBracket);
    drawBracketLines("losers-bracket", lastLoserRoundsForLines);
  });
});

// ---------- PLAYER DATABASE ----------

function initPlayerDatabase() {
  const data = localStorage.getItem(PLAYER_DB_KEY);
  if (!data) {
    playerDatabase = [];
    return;
  }
  try {
    playerDatabase = JSON.parse(data) || [];
  } catch (e) {
    console.error("Failed to parse player database", e);
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
    playerDatabase.push({ ...player });
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
        // Ensure unique id in this tournament
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
  populateMysteryPlayerSelect();
  renderSummary();
}

function handleClearSavedPlayers() {
  const ok = confirm(
    "Clear the saved player database? This does NOT remove players from the current tournament."
  );
  if (!ok) return;
  playerDatabase = [];
  savePlayerDatabase();
  alert("Saved player database cleared.");
}

// ---------- MASTER OUT POSSIBILITIES (1–180) ----------

function buildPossibleOutMap() {
  possibleOutMap = {};
  for (let n = 1; n <= 180; n++) {
    possibleOutMap[n] = false;
  }

  // All possible scores from a single dart
  const dartScores = [];
  for (let v = 1; v <= 20; v++) {
    dartScores.push(v);        // single
    dartScores.push(2 * v);    // double
    dartScores.push(3 * v);    // triple
  }
  dartScores.push(25);         // outer bull
  dartScores.push(50);         // bull

  // Valid finishing darts: double, triple, bull (Master Out)
  const finishingDarts = [];
  for (let v = 1; v <= 20; v++) {
    finishingDarts.push(2 * v); // doubles
    finishingDarts.push(3 * v); // triples
  }
  finishingDarts.push(50);      // bull finish

  // 1 dart finishes
  finishingDarts.forEach(last => {
    if (last >= 1 && last <= 180) {
      possibleOutMap[last] = true;
    }
  });

  // 2 dart finishes
  dartScores.forEach(d1 => {
    finishingDarts.forEach(last => {
      const total = d1 + last;
      if (total >= 1 && total <= 180) {
        possibleOutMap[total] = true;
      }
    });
  });

  // 3 dart finishes
  dartScores.forEach(d1 => {
    dartScores.forEach(d2 => {
      finishingDarts.forEach(last => {
        const total = d1 + d2 + last;
        if (total >= 1 && total <= 180) {
          possibleOutMap[total] = true;
        }
      });
    });
  });
}

// ---------- PLAYERS ----------

function handleAddPlayer(event) {
  event.preventDefault();

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const nicknameInput = document.getElementById("nickname");
  const genderSelect = document.getElementById("gender");

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const nickname = nicknameInput.value.trim();
  const gender = genderSelect.value;

  if (!firstName || !lastName || !gender) {
    alert("Please fill in first name, last name, and gender.");
    return;
  }

  const newPlayer = {
    id: Date.now(), // simple unique id
    firstName,
    lastName,
    nickname,
    gender,
    paid: false
  };

  players.push(newPlayer);
  addPlayerToDatabase(newPlayer);

  // Clear form
  firstNameInput.value = "";
  lastNameInput.value = "";
  nicknameInput.value = "";
  genderSelect.value = "";

  renderPlayers();
  populateManualTeamSelects();
  populateMysteryPlayerSelect();
  renderSummary();
}

function formatDisplayName(player) {
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
  const player = players.find(p => p.id === playerId);
  if (!player) return;
  player.paid = !player.paid;
  renderPlayers();
}

function removePlayer(playerId) {
  if (!confirm("Remove this player?")) return;

  players = players.filter(p => p.id !== playerId);

  // Remove any teams that contain this player
  teams = teams.filter(team => {
    const p1Id = team.player1 ? team.player1.id : null;
    const p2Id = team.player2 ? team.player2.id : null;
    return p1Id !== playerId && p2Id !== playerId;
  });

  resetAllBracketState();

  renderPlayers();
  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  populateManualTeamSelects();
  populateMysteryPlayerSelect();
  renderMysteryOutBoard();
  renderStandings();
  renderSummary();
}

// ---------- SUMMARY ----------

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

// ---------- UTILS ----------

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
  const p1 = formatDisplayName(team.player1);
  if (!team.player2) {
    return `Team ${team.id}: ${p1} + (bye)`;
  }
  const p2 = formatDisplayName(team.player2);
  return `Team ${team.id}: ${p1} & ${p2}`;
}

function getTeamLosses(team) {
  if (!team || !teamLosses) return 0;
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

// ---------- TEAMS ----------

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

    const team = {
      id: teamNumber,
      player1: p1,
      player2: p2
    };
    teams.push(team);
    teamNumber++;
  }

  resetAllBracketState();

  renderTeams();
  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  populateManualTeamSelects();
  renderSummary();
}

function populateManualTeamSelects() {
  const p1Select = document.getElementById("manualPlayer1");
  const p2Select = document.getElementById("manualPlayer2");

  if (!p1Select || !p2Select) return;

  // Players already on a team can't be chosen again
  const usedPlayerIds = new Set();
  teams.forEach(team => {
    if (team.player1) usedPlayerIds.add(team.player1.id);
    if (team.player2) usedPlayerIds.add(team.player2.id);
  });

  const availablePlayers = players.filter(p => !usedPlayerIds.has(p.id));

  function fillSelect(select) {
    select.innerHTML = "";

    if (availablePlayers.length < 2) {
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

    availablePlayers.forEach(player => {
      const opt = document.createElement("option");
      opt.value = String(player.id);
      opt.textContent = formatDisplayName(player);
      select.appendChild(opt);
    });
  }

  fillSelect(p1Select);
  fillSelect(p2Select);
}

function handleManualTeamAdd(event) {
  event.preventDefault();

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

  const nextTeamId =
    teams.length > 0 ? Math.max(...teams.map(t => t.id)) + 1 : 1;

  const newTeam = {
    id: nextTeamId,
    player1: p1,
    player2: p2
  };

  teams.push(newTeam);

  // Clear selections
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
}

function renderTeams() {
  const tbody = document.querySelector("#teams-table tbody");
  tbody.innerHTML = "";

  teams.forEach(team => {
    const tr = document.createElement("tr");

    const tdTeam = document.createElement("td");
    tdTeam.textContent = team.id;

    const tdP1 = document.createElement("td");
    tdP1.textContent = formatDisplayName(team.player1);

    const tdP2 = document.createElement("td");
    if (team.player2) {
      tdP2.textContent = formatDisplayName(team.player2);
    } else {
      tdP2.textContent = "(waiting for partner / bye)";
    }

    tr.appendChild(tdTeam);
    tr.appendChild(tdP1);
    tr.appendChild(tdP2);

    tbody.appendChild(tr);
  });

  renderSummary();
}

// ---------- WINNER BRACKET & RESEED ----------

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

  // Reset double-elim tracking
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

  // Fill initial slots with teams, rest as null (BYEs)
  const slots = new Array(bracketSize).fill(null);
  for (let i = 0; i < teamCount; i++) {
    slots[i] = teams[i];
  }

  let matchIdCounter = 1;

  // Round 1
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
      winner: null
    });
  }
  winnersBracket.push(round1);

  // Later rounds placeholders
  for (let r = 2; r <= roundsCount; r++) {
    const prevRound = winnersBracket[r - 2];
    const thisRound = [];
    for (let i = 0; i < prevRound.length; i += 2) {
      thisRound.push({
        id: matchIdCounter++,
        round: r,
        index: thisRound.length,
        team1: null,
        team2: null,
        winner: null
      });
    }
    winnersBracket.push(thisRound);
  }

  // First round list for table
  matches = winnersBracket[0].map(m => ({
    id: m.id,
    team1: m.team1,
    team2: m.team2,
    winner: null
  }));

  // Auto-advance BYEs in Round 1 only
  autoAdvanceRound1Byes();
}

function autoAdvanceRound1Byes() {
  if (!winnersBracket.length) return;
  const round = winnersBracket[0];

  for (let mIndex = 0; mIndex < round.length; mIndex++) {
    const match = round[mIndex];
    if (match.winner) continue;

    const hasTeam1 = !!match.team1;
    const hasTeam2 = !!match.team2;

    if (hasTeam1 && !hasTeam2) {
      setMatchWinner(0, mIndex, match.team1, false);
    } else if (!hasTeam1 && hasTeam2) {
      setMatchWinner(0, mIndex, match.team2, false);
    }
  }

  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
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
}

function handleReseedBracket() {
  if (tournamentLocked) {
    alert("Tournament already started — reseeding is disabled.");
    return;
  }

  if (teams.length < 2) {
    alert("You need at least 2 teams to reseed.");
    return;
  }

  if (!matches || matches.length === 0) {
    alert("No matches exist yet. Please generate the first round first.");
    return;
  }

  if (!confirm("Are you sure you want to reshuffle all teams and regenerate matches?")) {
    return;
  }

  // Randomize teams order again
  const shuffledTeams = shuffleArray(teams);
  matches = [];
  winnersBracket = [];
  losersMatches = [];
  losersWaitingQueue = [];
  finalsState = { match1Winner: null, match2Winner: null, champion: null, runnerUp: null };

  // Recreate first-round matches with new random order
  let matchNumber = 1;
  for (let i = 0; i < shuffledTeams.length; i += 2) {
    const t1 = shuffledTeams[i];
    const t2 = shuffledTeams[i + 1] || null;

    const match = {
      id: matchNumber,
      team1: t1,
      team2: t2,
      winner: null,
    };
    matches.push(match);
    matchNumber++;
  }

  // Reset losses
  teamLosses = {};
  teams.forEach(t => (teamLosses[t.id] = 0));

  renderMatches();
  renderWinnersBracket();
  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
  renderSummary();

  alert("Bracket reseeded successfully!");
}

// ---------- LOCKING UI ----------

function ensureTournamentLocked() {
  if (!tournamentLocked) {
    tournamentLocked = false;
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


// ---------- LOSSES / LOSER BRACKET HELPERS ----------

function recordLoss(team) {
  if (!team) return;
  if (teamLosses[team.id] === undefined) {
    teamLosses[team.id] = 0;
  }
  teamLosses[team.id] += 1;

  if (teamLosses[team.id] === 1) {
    // First loss → drop to loser bracket
    addTeamToLosersQueue(team);
  } else if (teamLosses[team.id] >= 2) {
    // Second loss → eliminated
  }
}

function addTeamToLosersQueue(team) {
  losersWaitingQueue.push(team);

  if (losersWaitingQueue.length >= 2) {
    const t1 = losersWaitingQueue.shift();
    const t2 = losersWaitingQueue.shift();

    const index = losersMatches.length;
    const round = Math.floor(index / 2) + 1; // 2 matches per visual "round"
    const match = {
      id: index + 1,
      round,
      team1: t1,
      team2: t2,
      winner: null
    };
    losersMatches.push(match);

    renderLosersBracket();
    renderFinalsSection();
    renderStandings();
  }
}

// ---------- WINNER MATCH HANDLING ----------

function setMatchWinner(roundIndex, matchIndex, winnerTeam, fromClick = true) {
  const match = winnersBracket[roundIndex][matchIndex];
  if (!match) return;

  match.winner = winnerTeam;
  ensureTournamentLocked();

  // determine loser
  let loserTeam = null;
  if (match.team1 && match.team2) {
    loserTeam =
      match.team1.id === winnerTeam.id ? match.team2 : match.team1;
  } else if (match.team1 || match.team2) {
    // BYE case: no loser
    loserTeam = null;
  }

  if (loserTeam) {
    recordLoss(loserTeam);
  }

  // Update first-round table display
  if (roundIndex === 0) {
    const tableMatch = matches.find(m => m.id === match.id);
    if (tableMatch) {
      tableMatch.winner = winnerTeam;
    }
  }

  // Propagate to next winner round
  if (roundIndex + 1 < winnersBracket.length) {
    const nextRound = winnersBracket[roundIndex + 1];
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const nextMatch = nextRound[nextMatchIndex];

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
  }
}

function chooseWinnerForMatch(roundIndex, matchIndex) {
  const match = winnersBracket[roundIndex][matchIndex];

  const hasTeam1 = !!match.team1;
  const hasTeam2 = !!match.team2;

  if (!hasTeam1 && !hasTeam2) {
    alert("No teams assigned to this match yet.");
    return;
  }

  // BYE cases
  if (hasTeam1 && !hasTeam2) {
    setMatchWinner(roundIndex, matchIndex, match.team1);
    return;
  }
  if (!hasTeam1 && hasTeam2) {
    setMatchWinner(roundIndex, matchIndex, match.team2);
    return;
  }

  const option1 = formatTeamLabelWithLosses(match.team1);
  const option2 = formatTeamLabelWithLosses(match.team2);

  const choice = prompt(
    `Select winner for Match ${match.id}:\n` +
      `1) ${option1}\n` +
      `2) ${option2}\n\n` +
      `Enter 1 or 2 (Cancel to abort).`
  );

  if (choice === "1") {
    setMatchWinner(roundIndex, matchIndex, match.team1);
  } else if (choice === "2") {
    setMatchWinner(roundIndex, matchIndex, match.team2);
  }
}

function renderWinnersBracket() {
  const container = document.getElementById("winners-bracket");
  if (!container) return;

  container.innerHTML = "";
  container.className = "bracket-container bracket-container-top";

  if (!winnersBracket || winnersBracket.length === 0) {
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

    // group matches into pairs; each pair will feed one match in the next round
    for (let i = 0; i < roundMatches.length; i += 2) {
      const remaining = roundMatches.length - i;
      const pairDiv = document.createElement("div");
      pairDiv.className = remaining >= 2 ? "match-pair" : "match-pair single";

      // match A in the pair
      const matchA = roundMatches[i];
      if (matchA) {
        const boxA = document.createElement("div");
        boxA.className = "match-box";
        boxA.dataset.round = String(rIndex);
        boxA.dataset.matchIndex = String(i);

        const labelA = document.createElement("div");
        labelA.className = "match-label";
        labelA.textContent = `Match ${matchA.id}`;
        boxA.appendChild(labelA);

        const t1A = document.createElement("div");
        t1A.className = "team-line";
        t1A.textContent = matchA.team1
          ? formatTeamLabelWithLosses(matchA.team1)
          : "TBD / BYE";
        boxA.appendChild(t1A);

        const t2A = document.createElement("div");
        t2A.className = "team-line";
        t2A.textContent = matchA.team2
          ? formatTeamLabelWithLosses(matchA.team2)
          : "TBD / BYE";
        boxA.appendChild(t2A);

        if (matchA.winner) {
          const wA = document.createElement("div");
          wA.className = "team-line";
          wA.textContent = `Winner: ${formatTeamLabelWithLosses(
            matchA.winner
          )}`;
          boxA.appendChild(wA);
        }

        boxA.addEventListener("click", () =>
          chooseWinnerForMatch(rIndex, i)
        );

        pairDiv.appendChild(boxA);
      }

      // match B in the pair (if it exists)
      if (remaining >= 2) {
        const matchB = roundMatches[i + 1];
        if (matchB) {
          const boxB = document.createElement("div");
          boxB.className = "match-box";
          boxB.dataset.round = String(rIndex);
          boxB.dataset.matchIndex = String(i + 1);

          const labelB = document.createElement("div");
          labelB.className = "match-label";
          labelB.textContent = `Match ${matchB.id}`;
          boxB.appendChild(labelB);

          const t1B = document.createElement("div");
          t1B.className = "team-line";
          t1B.textContent = matchB.team1
            ? formatTeamLabelWithLosses(matchB.team1)
            : "TBD / BYE";
          boxB.appendChild(t1B);

          const t2B = document.createElement("div");
          t2B.className = "team-line";
          t2B.textContent = matchB.team2
            ? formatTeamLabelWithLosses(matchB.team2)
            : "TBD / BYE";
          boxB.appendChild(t2B);

          if (matchB.winner) {
            const wB = document.createElement("div");
            wB.className = "team-line";
            wB.textContent = `Winner: ${formatTeamLabelWithLosses(
              matchB.winner
            )}`;
            boxB.appendChild(wB);
          }

          boxB.addEventListener("click", () =>
            chooseWinnerForMatch(rIndex, i + 1)
          );

          pairDiv.appendChild(boxB);
        }
      }

      roundDiv.appendChild(pairDiv);
    }

    container.appendChild(roundDiv);
  });

  // draw the SVG bracket lines
  drawBracketLines("winners-bracket", winnersBracket);
}

// ---------- LOSER BRACKET ----------

function setLosersMatchWinner(matchIndex, winnerTeam) {
  const match = losersMatches[matchIndex];
  if (!match) return;

  match.winner = winnerTeam;
  ensureTournamentLocked();

  // determine loser
  let loserTeam = null;
  if (match.team1 && match.team2) {
    loserTeam =
      match.team1.id === winnerTeam.id ? match.team2 : match.team1;
  }

  if (loserTeam) {
    recordLoss(loserTeam); // usually second loss → elimination
  }

  // Winner stays alive in loser bracket (still only 1 loss overall)
  addTeamToLosersQueue(winnerTeam);

  renderLosersBracket();
  renderFinalsSection();
  renderStandings();
  renderSummary();
}

function chooseWinnerForLosersMatch(globalIndex) {
  const match = losersMatches[globalIndex];
  if (!match) return;

  const hasTeam1 = !!match.team1;
  const hasTeam2 = !!match.team2;

  if (!hasTeam1 && !hasTeam2) {
    alert("No teams assigned to this match yet.");
    return;
  }

  // Just in case, handle 1-team matches:
  if (hasTeam1 && !hasTeam2) {
    setLosersMatchWinner(globalIndex, match.team1);
    return;
  }
  if (!hasTeam1 && hasTeam2) {
    setLosersMatchWinner(globalIndex, match.team2);
    return;
  }

  const option1 = formatTeamLabelWithLosses(match.team1);
  const option2 = formatTeamLabelWithLosses(match.team2);

  const choice = prompt(
    `Select winner for Loser Match ${match.id} (Round ${match.round}):\n` +
      `1) ${option1}\n` +
      `2) ${option2}\n\n` +
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

  if (!losersMatches || losersMatches.length === 0) {
    container.textContent = "No teams in the loser bracket yet.";
    lastLoserRoundsForLines = [];
    return;
  }

  // group by round number as before
  const roundsMap = new Map();
  losersMatches.forEach(match => {
    const r = match.round || 1;
    if (!roundsMap.has(r)) {
      roundsMap.set(r, []);
    }
    roundsMap.get(r).push(match);
  });

  const roundNumbers = Array.from(roundsMap.keys()).sort((a, b) => a - b);
  const roundsArray = []; // for SVG lines

  roundNumbers.forEach((roundNum, rIndex) => {
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
        const boxA = document.createElement("div");
        boxA.className = "match-box";
        boxA.dataset.round = String(rIndex);
        boxA.dataset.matchIndex = String(i);

        const labelA = document.createElement("div");
        labelA.className = "match-label";
        labelA.textContent = `Match ${matchA.id}`;
        boxA.appendChild(labelA);

        const t1A = document.createElement("div");
        t1A.className = "team-line";
        t1A.textContent = matchA.team1
          ? formatTeamLabelWithLosses(matchA.team1)
          : "TBD";
        boxA.appendChild(t1A);

        const t2A = document.createElement("div");
        t2A.className = "team-line";
        t2A.textContent = matchA.team2
          ? formatTeamLabelWithLosses(matchA.team2)
          : "TBD";
        boxA.appendChild(t2A);

        if (matchA.winner) {
          const wA = document.createElement("div");
          wA.className = "team-line";
          wA.textContent = `Winner: ${formatTeamLabelWithLosses(
            matchA.winner
          )}`;
          boxA.appendChild(wA);
        }

        const globalIndexA = losersMatches.indexOf(matchA);
        boxA.addEventListener("click", () =>
          chooseWinnerForLosersMatch(globalIndexA)
        );

        pairDiv.appendChild(boxA);
      }

      if (remaining >= 2) {
        const matchB = matchesInRound[i + 1];
        if (matchB) {
          const boxB = document.createElement("div");
          boxB.className = "match-box";
          boxB.dataset.round = String(rIndex);
          boxB.dataset.matchIndex = String(i + 1);

          const labelB = document.createElement("div");
          labelB.className = "match-label";
          labelB.textContent = `Match ${matchB.id}`;
          boxB.appendChild(labelB);

          const t1B = document.createElement("div");
          t1B.className = "team-line";
          t1B.textContent = matchB.team1
            ? formatTeamLabelWithLosses(matchB.team1)
            : "TBD";
          boxB.appendChild(t1B);

          const t2B = document.createElement("div");
          t2B.className = "team-line";
          t2B.textContent = matchB.team2
            ? formatTeamLabelWithLosses(matchB.team2)
            : "TBD";
          boxB.appendChild(t2B);

          if (matchB.winner) {
            const wB = document.createElement("div");
            wB.className = "team-line";
            wB.textContent = `Winner: ${formatTeamLabelWithLosses(
              matchB.winner
            )}`;
            boxB.appendChild(wB);
          }

          const globalIndexB = losersMatches.indexOf(matchB);
          boxB.addEventListener("click", () =>
            chooseWinnerForLosersMatch(globalIndexB)
          );

          pairDiv.appendChild(boxB);
        }
      }

      roundDiv.appendChild(pairDiv);
    }

    container.appendChild(roundDiv);
  });

  // remember these rounds for resize redraw
  lastLoserRoundsForLines = roundsArray;
  drawBracketLines("losers-bracket", roundsArray);
}

// ---------- ROUND 1 LIST ----------

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

    if (match.winner) {
      tdMatch.textContent += " ⭐";
      tdTeamA.textContent +=
        match.team1 && match.winner.id === match.team1.id ? " (WIN)" : "";
      tdTeamB.textContent +=
        match.team2 && match.winner.id === match.team2.id ? " (WIN)" : "";
    }

    tr.appendChild(tdMatch);
    tr.appendChild(tdTeamA);
    tr.appendChild(tdTeamB);

    tbody.appendChild(tr);
  });

  renderSummary();
}

// ---------- FINALS / KING SEAT ----------

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
    alert("Need both a winner champion (king seat) and a loser champion first.");
    return;
  }

  if (finalsState.champion) {
    alert("Finals are already complete.");
    return;
  }

  ensureTournamentLocked();

  if (matchNumber === 2) {
    // Second match only needed if challenger won match 1
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

  if (choice !== "1" && choice !== "2") {
    return;
  }

  const winnerTeam = choice === "1" ? king : challenger;
  const loserTeam = choice === "1" ? challenger : king;

  if (matchNumber === 1) {
    finalsState.match1Winner = winnerTeam;

    // If king seat wins Match 1 → tournament over
    if (winnerTeam.id === king.id) {
      finalsState.champion = king;
      finalsState.runnerUp = challenger;
    }
  } else if (matchNumber === 2) {
    // Only called if challenger won Match 1
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

  kingLabelEl.textContent = king
    ? formatTeamLabelWithLosses(king)
    : "Not decided yet";
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

// ---------- STANDINGS PANEL ----------

function renderStandings() {
  const panel = document.getElementById("standings-panel");
  if (!panel) return;

  const allTeams = teams.slice();
  if (allTeams.length === 0) {
    panel.textContent = "No teams yet.";
    return;
  }

  const champion = finalsState.champion || null;
  const runnerUp = finalsState.runnerUp || null;

  const eliminated = [];
  const oneLoss = [];
  const unbeaten = [];

  allTeams.forEach(team => {
    const losses = getTeamLosses(team);
    if (losses >= 2) {
      eliminated.push(team);
    } else if (losses === 1) {
      oneLoss.push(team);
    } else {
      unbeaten.push(team);
    }
  });

  let html = "";

  html += "<p><strong>Champion:</strong> " +
    (champion ? formatTeamLabelWithLosses(champion) : "TBD") +
    "</p>";

  html += "<p><strong>Runner-up:</strong> " +
    (runnerUp ? formatTeamLabelWithLosses(runnerUp) : "TBD") +
    "</p>";

  html += "<p><strong>Unbeaten teams (0 losses):</strong><br>";
  html += unbeaten.length
    ? unbeaten.map(t => formatTeamLabelWithLosses(t)).join("<br>")
    : "None";
  html += "</p>";

  html += "<p><strong>Still alive with 1 loss:</strong><br>";
  html += oneLoss.length
    ? oneLoss.map(t => formatTeamLabelWithLosses(t)).join("<br>")
    : "None";
  html += "</p>";

  html += "<p><strong>Eliminated (2 losses):</strong><br>";
  html += eliminated.length
    ? eliminated.map(t => formatTeamLabelWithLosses(t)).join("<br>")
    : "None";
  html += "</p>";

  panel.innerHTML = html;
}

// ---------- DISPLAY MODE ----------

function toggleDisplayMode() {
  document.body.classList.toggle("display-mode");
}

// ---------- MYSTERY OUT (MASTER OUT 1–180 FULL BOARD) ----------

function populateMysteryPlayerSelect() {
  const mysterySelect = document.getElementById("mysteryPlayerSelect");
  const featSelect = document.getElementById("featPlayerSelect");

  const selects = [mysterySelect, featSelect].filter(Boolean);

  if (selects.length === 0) return;

  selects.forEach(select => {
    select.innerHTML = "";

    if (players.length === 0) {
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

    players.forEach(player => {
      const opt = document.createElement("option");
      opt.value = String(player.id);
      opt.textContent = formatDisplayName(player);
      select.appendChild(opt);
    });
  });
}

function handleMysteryOutAdd(event) {
  event.preventDefault();

  const playerSelect = document.getElementById("mysteryPlayerSelect");
  const outInput = document.getElementById("mysteryOutNumber");

  const playerId = parseInt(playerSelect.value, 10);
  const outNumber = parseInt(outInput.value, 10);

  if (!playerId) {
    alert("Please select a player.");
    return;
  }

  if (!outNumber || outNumber < 1 || outNumber > 180) {
    alert("Please enter a valid Master Out number between 1 and 180.");
    return;
  }

  // Check if number is actually checkout-able
  if (!possibleOutMap[outNumber]) {
    alert("This number has no possible Master Out. It will show as 'No Out' on the board.");
    return;
  }

  const player = getPlayerById(playerId);
  if (!player) {
    alert("Selected player not found.");
    return;
  }

  const entry = {
    id: Date.now(),
    playerId,
    outNumber,
    timestamp: new Date().toISOString()
  };

  mysteryOutEntries.push(entry);

  // Clear
  playerSelect.value = "";
  outInput.value = "";

  renderMysteryOutBoard();
}

function renderMysteryOutBoard() {
  const tbody1 = document.getElementById("mystery-out-table-1");
  const tbody2 = document.getElementById("mystery-out-table-2");
  const tbody3 = document.getElementById("mystery-out-table-3");
  if (!tbody1 || !tbody2 || !tbody3) return;

  tbody1.innerHTML = "";
  tbody2.innerHTML = "";
  tbody3.innerHTML = "";

  // Group recorded outs by number
  const grouped = new Map();
  mysteryOutEntries.forEach(entry => {
    const key = entry.outNumber;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(entry);
  });

  for (let outNum = 1; outNum <= 180; outNum++) {
    const entries = grouped.get(outNum) || [];
    const isPossible = !!possibleOutMap[outNum];

    const tr = document.createElement("tr");

    const tdOut = document.createElement("td");
    tdOut.textContent = outNum;

    const tdFirst = document.createElement("td");
    const tdOthers = document.createElement("td");

    if (!isPossible) {
      // mathematically impossible
      tdFirst.textContent = "No Out";
      tdOthers.textContent = "-";
    } else if (entries.length === 0) {
      // possible, but nobody yet
      tdFirst.textContent = "";
      tdOthers.textContent = "-";
    } else {
      const firstEntry = entries[0];
      const otherEntries = entries.slice(1);
      const firstPlayer = getPlayerById(firstEntry.playerId);
      tdFirst.textContent = firstPlayer
        ? formatDisplayName(firstPlayer)
        : "Unknown (player removed)";

      if (otherEntries.length === 0) {
        tdOthers.textContent = "-";
      } else {
        const span = document.createElement("span");
        span.textContent = `${otherEntries.length} more`;
        const names = otherEntries
          .map(e => {
            const p = getPlayerById(e.playerId);
            return p ? formatDisplayName(p) : "Unknown (player removed)";
          })
          .join(", ");
        span.title = names;
        tdOthers.appendChild(span);
      }
    }

    tr.appendChild(tdOut);
    tr.appendChild(tdFirst);
    tr.appendChild(tdOthers);

    let targetBody;
    if (outNum <= 60) {
      targetBody = tbody1;
    } else if (outNum <= 120) {
      targetBody = tbody2;
    } else {
      targetBody = tbody3;
    }
    targetBody.appendChild(tr);
  }
}

// ---------- BIG HITS (High-Ton, White Horse, 9-Mark, Hat-Trick) ----------

function handleAddBigHit(event) {
  event.preventDefault();

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
    alert("Please select a shot type.");
    return;
  }

  const player = getPlayerById(playerId);
  if (!player) {
    alert("Selected player not found.");
    return;
  }

  bigHits.push({
    id: Date.now(),
    playerId,
    type: shotType,
    timestamp: new Date().toISOString()
  });

  // reset form
  playerSelect.value = "";
  typeSelect.value = "";

  renderBigHits();
}

function renderBigHits() {
  const tbody = document.querySelector("#feats-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!bigHits.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No big hits recorded yet.";
    tbody.appendChild(tr);
    tr.appendChild(td);
    return;
  }

  bigHits
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
      tdTime.textContent = isNaN(d.getTime())
        ? "-"
        : d.toLocaleString();

      tr.appendChild(tdIndex);
      tr.appendChild(tdPlayer);
      tr.appendChild(tdType);
      tr.appendChild(tdTime);

      tbody.appendChild(tr);
    });
}


// ---------- PAYOUTS ----------

function handleCalculatePayouts() {
  const entryFeeInput = document.getElementById("entryFee");
  const manualPotInput = document.getElementById("manualPot");
  const mysteryPercentInput = document.getElementById("payoutMysteryPercent");
  const firstPercentInput = document.getElementById("payoutFirstPercent");
  const secondPercentInput = document.getElementById("payoutSecondPercent");
  const thirdPercentInput = document.getElementById("payoutThirdPercent");
  const honeyPerPlayerInput = document.getElementById("honeyPotPerPlayer");

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
  const percentSum =
    mysteryPercent + firstPercent + secondPercent + thirdPercent;

  const honeyPerPlayer = parseFloat(honeyPerPlayerInput.value) || 0;
  const honeyActive = femalePlayers >= 4;

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

  if (baseForPercent > 0 && percentSum > 0) {
    const factor = baseForPercent / 100;
    mysteryAmount = factor * mysteryPercent;
    firstAmount = factor * firstPercent;
    secondAmount = factor * secondPercent;
    thirdAmount = factor * thirdPercent;
  }

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

    payoutsTableBody.appendChild(tr);
  }

  if (totalPot <= 0) {
    addRow("Total Pot", null, 0);
    addRow("Mystery Out", mysteryPercent, 0);
    addRow("1st place", firstPercent, 0);
    addRow("2nd place", secondPercent, 0);
    addRow("3rd place", thirdPercent, 0);
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
    infoText += "Honey Pot is ACTIVE (at least 4 female players). ";
  } else {
    infoText +=
      "Honey Pot is NOT active (need at least 4 female players). ";
  }

  if (percentSum !== 100) {
    infoText += `Note: your percentages add up to ${percentSum.toFixed(
      1
    )}%, not 100%. Amounts are still calculated proportionally against the base pot.`;
  }

  payoutsInfo.textContent = infoText;
}

// ---------- SAVE / LOAD TOURNAMENT (LOCAL STORAGE) ----------

function saveTournamentState() {
   const state = {
    players,
    teams,
    matches,
    winnersBracket,
    mysteryOutEntries,
    bigHits,
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
    bigHits = state.bigHits || [];


    renderPlayers();
    renderTeams();
    renderMatches();
    renderWinnersBracket();
    renderLosersBracket();
    renderFinalsSection();
    renderMysteryOutBoard();
    populateManualTeamSelects();
    populateMysteryPlayerSelect();
    renderBigHits();
    renderStandings();
    renderSummary();
    updateLockedUI();

    alert("Tournament state loaded.");
  } catch (e) {
    console.error(e);
    alert("Failed to load saved tournament state.");
  }
}

function drawBracketLines(containerId, roundsArray) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // remove old SVG
  const old = container.querySelector("svg.svg-connector-layer");
  if (old) old.remove();

  if (!roundsArray || roundsArray.length === 0) return;

  // need full scroll size so lines match scrolled content
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

      // draw a bracket-style polyline: horizontal → vertical → horizontal
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
