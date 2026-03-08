const NUM_CHOICES = 4;
const DATE_FMT_OPTIONS = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
const PARTIES = [
  "Republican",
  "Democratic",
  "Independent",
  "Whig",
  "Democratic-Republican",
  "Whig",
  "Federalist",
  "Independent"
];
const BASE_PARTIES = ["Republican", "Democratic"];

let presidents = [];
let score = 0;
let total = 0;
let maxQuestions = 10;
let askedQuestions = new Set();
let currentQuestion = null;

function normalizeHeader(h) {
  return (h || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseDate(s) {
  s = (s || "").trim();
  if (!s) throw new Error("Empty date string");

  const m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})$/);
  if (!m) throw new Error(`Invalid date format: ${s}`);

  const year = parseInt(m[1], 10);
  const monStr = m[2].toLowerCase();
  const day = parseInt(m[3], 10);

  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  if (!(monStr in monthMap)) {
    throw new Error(`Invalid month: ${m[2]}`);
  }

  return new Date(Date.UTC(year, monthMap[monStr], day));
}

function parseVps(vps) {
  return (vps || "")
    .split(";")
    .map(v => v.trim())
    .filter(v => v !== "");
}

function getPresidentByNumber(number) {
  if (number < 1 || number > presidents.length) return null;
  return presidents.find(p => p.number === number) || null;
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", DATE_FMT_OPTIONS);
}

function dateInTerm(d, p) {
  return d >= p.term_start && d <= p.term_end;
}

function presidentOnDate(d) {
  return presidents.find(p => dateInTerm(d, p)) || null;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomDateBetween(a, b) {
  let start = a.getTime();
  let end = b.getTime();
  if (end < start) [start, end] = [end, start];

  const dayMs = 24 * 60 * 60 * 1000;
  const deltaDays = Math.floor((end - start) / dayMs);
  return new Date(start + randomInt(0, deltaDays) * dayMs);
}

function getDisambiguator(correctPresident) {
  if (correctPresident.name.includes("Cleveland")) {
    return correctPresident.number === 22 ? " (Term 1)" : " (Term 2)";
  }
  if (correctPresident.name.includes("Trump")) {
    return correctPresident.number === 45 ? " (Term 1)" : " (Term 2)";
  }
  return "";
}

function pickDistractors(correctName, questionName, k) {
  const distractors = [];
  let correctNumber = 0;
  let addIndex = 1;

  for (const p of presidents) {
    if (p.name === correctName) {
      correctNumber = p.number;
      break;
    }
  }

  const exclusions = [correctName, questionName];

  while (distractors.length < k) {
    const indexIter = addIndex * randomChoice([-1, 1]);
    const addPres = getPresidentByNumber(correctNumber + indexIter);

    if (
      addPres &&
      !distractors.includes(addPres.name) &&
      !exclusions.includes(addPres.name)
    ) {
      distractors.push(addPres.name);
    }

    addIndex += 1;

    if (addIndex > 200) break;
  }

  // Fallback if nearby presidents were not enough
  if (distractors.length < k) {
    const pool = presidents
      .map(p => p.name)
      .filter(name => !distractors.includes(name) && !exclusions.includes(name));
    while (distractors.length < k && pool.length > 0) {
      const idx = randomInt(0, pool.length - 1);
      distractors.push(pool.splice(idx, 1)[0]);
    }
  }

  return distractors;
}

function getVp(president) {
  const vps = president.vps || [];
  if (vps.length === 0 || !vps[0]) return null;
  return randomChoice(vps);
}

function makeBeforeAfterQuestion() {
  const i = randomInt(1, presidents.length - 2);
  const target = presidents[i];

  const askAfter = randomChoice([true, false]);
  const correct = askAfter ? presidents[i + 1] : presidents[i - 1];
  const direction = askAfter ? "after" : "before";
  const disambiguator = getDisambiguator(target);

  const prompt = `Which president came ${direction} ${target.name}${disambiguator}?`;

  let options = [correct.name, ...pickDistractors(correct.name, target.name, NUM_CHOICES - 1)];
  options = shuffle(options);
  const correctIndex = options.indexOf(correct.name);

  return { prompt, options, correctIndex, correctAnswer: correct.name, qtype: "before_after" };
}

function makeNumberQuestion() {
  const pres = randomChoice(presidents);
  const prompt = `Which president was number ${pres.number}?`;

  let options = [pres.name, ...pickDistractors(pres.name, null, NUM_CHOICES - 1)];
  options = shuffle(options);
  const correctIndex = options.indexOf(pres.name);

  return { prompt, options, correctIndex, correctAnswer: pres.name, qtype: "number" };
}

function makePresidentOnDateQuestion() {
  const overallStart = presidents[0].term_start;
  const overallEnd = presidents[presidents.length - 1].term_end;

  let d = randomDateBetween(overallStart, overallEnd);
  let correctPres = presidentOnDate(d);

  if (!correctPres) {
    const p = randomChoice(presidents);
    d = randomDateBetween(p.term_start, p.term_end);
    correctPres = p;
  }

  const prompt = `Who was president on ${formatDate(d)}?`;

  let options = [correctPres.name, ...pickDistractors(correctPres.name, null, NUM_CHOICES - 1)];
  options = shuffle(options);
  const correctIndex = options.indexOf(correctPres.name);

  return { prompt, options, correctIndex, correctAnswer: correctPres.name, qtype: "on_date" };
}

function makePartyQuestion() {
  const pres = randomChoice(presidents);
  const correctParty = pres.party;
  const prompt = `Of which party was ${pres.name}?`;

  const distractors = [];

  for (const baseParty of BASE_PARTIES) {
    if (baseParty !== correctParty) {
      distractors.push(baseParty);
    }
  }

  while (distractors.length < NUM_CHOICES - 1) {
    const chooseParty = randomChoice(PARTIES);
    if (!distractors.includes(chooseParty) && chooseParty !== correctParty) {
      distractors.push(chooseParty);
    }
  }

  let options = shuffle([...distractors, correctParty]);
  const correctIndex = options.indexOf(correctParty);

  return { prompt, options, correctIndex, correctAnswer: correctParty, qtype: "party" };
}

function makeTermQuestion() {
  const pres = randomChoice(presidents);
  const termStart = pres.term_start;
  const termEnd = pres.term_end;
  const termLength = ((termEnd - termStart) / (1000 * 60 * 60 * 24 * 365)).toFixed(1);

  const prompt = `Who was president for ${termLength} years from ${formatDate(termStart)} to ${formatDate(termEnd)}?`;

  let options = shuffle([
    ...pickDistractors(pres.name, null, NUM_CHOICES - 1),
    pres.name
  ]);
  const correctIndex = options.indexOf(pres.name);

  return { prompt, options, correctIndex, correctAnswer: pres.name, qtype: "term" };
}

function makeVpQuestion() {
  let correctPres = null;
  let correctVp = null;

  while (correctVp === null) {
    correctPres = randomChoice(presidents);
    correctVp = getVp(correctPres);
  }

  const correctVps = correctPres.vps || [];
  const prompt = `Who was the vice president of ${correctPres.name}?`;

  const distractors = [];
  const exclusions = [correctVp, correctPres.name, "", null, ...correctVps];

  let guard = 0;
  while (distractors.length < NUM_CHOICES - 1 && guard < 500) {
    guard += 1;
    const offset = randomInt(1, presidents.length);
    const sign = randomChoice([-1, 1]);
    const nearbyPres = getPresidentByNumber(correctPres.number + sign * offset);

    if (nearbyPres && nearbyPres.name !== correctPres.name) {
      const chooseVp = getVp(nearbyPres);
      if (
        chooseVp &&
        !distractors.includes(chooseVp) &&
        !exclusions.includes(chooseVp)
      ) {
        distractors.push(chooseVp);
      }
    }
  }

  // Fallback pool from all VPs
  if (distractors.length < NUM_CHOICES - 1) {
    const allVps = [];
    for (const p of presidents) {
      for (const vp of p.vps || []) {
        if (vp && !allVps.includes(vp)) allVps.push(vp);
      }
    }

    const pool = allVps.filter(vp => !distractors.includes(vp) && !exclusions.includes(vp));
    while (distractors.length < NUM_CHOICES - 1 && pool.length > 0) {
      const idx = randomInt(0, pool.length - 1);
      distractors.push(pool.splice(idx, 1)[0]);
    }
  }

  let options = shuffle([correctVp, ...distractors]);
  const correctIndex = options.indexOf(correctVp);

  return { prompt, options, correctIndex, correctAnswer: correctVp, qtype: "vp" };
}

function gradeScore(scoreFraction) {
  const gradeDict = [
    ["A+++", 1.0],
    ["A+", 0.95],
    ["A", 0.9],
    ["A-", 0.85],
    ["B+", 0.83],
    ["B", 0.8],
    ["B-", 0.75],
    ["C+", 0.73],
    ["C", 0.7],
    ["C-", 0.65],
    ["D+", 0.63],
    ["D", 0.6],
    ["D-", 0.55],
    ["F", 0.5]
  ];

  for (const [grade, threshold] of gradeDict) {
    if (scoreFraction >= threshold) return grade;
  }
  return "F";
}

function parseCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }

  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error("CSV is empty.");
  }

  const headers = parseCSVLine(lines[0]);
  const hdrMap = {};
  headers.forEach(h => {
    hdrMap[normalizeHeader(h)] = h;
  });

  function col(...candidates) {
    for (const c of candidates) {
      const key = normalizeHeader(c);
      if (hdrMap[key]) return headers.indexOf(hdrMap[key]);
    }
    throw new Error(`Missing required column. Tried: ${candidates.join(", ")}`);
  }

  const colNumber = col("Number");
  const colName = col("Name");
  const colStart = col("Term Start", "TermStart");
  const colEnd = col("Term End", "TermEnd");
  const colVps = col("Vice Presidents");
  const colParty = col("Party");

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);

    try {
      const number = parseInt((fields[colNumber] || "").trim(), 10);
      const name = (fields[colName] || "").trim();
      const term_start = parseDate(fields[colStart] || "");
      const term_end = parseDate(fields[colEnd] || "");
      const vps = parseVps(fields[colVps] || "");
      const party = (fields[colParty] || "").trim();

      if (!number || !name) throw new Error("Missing required value");

      rows.push({ number, name, term_start, term_end, party, vps });
    } catch (e) {
      console.warn("Skipping malformed row:", lines[i], e);
    }
  }

  rows.sort((a, b) => a.term_start - b.term_start);

  if (rows.length < 4) {
    throw new Error("Need at least 4 presidents to create 4-choice questions.");
  }

  return rows;
}

function updateScoreDisplay() {
  document.getElementById("score").textContent = `Score: ${score}/${total}`;
}

function showMessage(msg, className = "") {
  const result = document.getElementById("result");
  result.className = className;
  result.textContent = msg;
}

function renderQuestion(q) {
  currentQuestion = q;

  document.getElementById("prompt").textContent = q.prompt;

  const choicesDiv = document.getElementById("choices");
  choicesDiv.innerHTML = "";

  const labels = ["A", "B", "C", "D"];

  q.options.forEach((option, i) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = `${labels[i]}. ${option}`;
    btn.onclick = () => submitAnswer(i);
    choicesDiv.appendChild(btn);
  });

  showMessage("");
}

function generateQuestion() {
  const questionTypes = ["before_after", "on_date", "vp", "number", "party", "term"];

  while (true) {
    let q;
    const qtype = randomChoice(questionTypes);

    if (qtype === "before_after") q = makeBeforeAfterQuestion();
    else if (qtype === "vp") q = makeVpQuestion();
    else if (qtype === "number") q = makeNumberQuestion();
    else if (qtype === "party") q = makePartyQuestion();
    else if (qtype === "term") q = makeTermQuestion();
    else q = makePresidentOnDateQuestion();

    const questionId = `${q.qtype}||${q.correctAnswer}`;
    if (!askedQuestions.has(questionId)) {
      askedQuestions.add(questionId);
      return q;
    }

    if (askedQuestions.size > 1000) {
      return q;
    }
  }
}

function submitAnswer(choiceIndex) {
  if (!currentQuestion) return;

  total += 1;

  if (choiceIndex === currentQuestion.correctIndex) {
    score += 1;
    showMessage("✅ Correct.", "correct");
  } else {
    const labels = ["A", "B", "C", "D"];
    const correctLabel = labels[currentQuestion.correctIndex];
    const correctAnswer = currentQuestion.options[currentQuestion.correctIndex];
    showMessage(`❌ Incorrect. Correct answer: ${correctLabel}. ${correctAnswer}`, "incorrect");
  }

  updateScoreDisplay();

  if (askedQuestions.size >= maxQuestions || total >= maxQuestions) {
    endQuiz();
  } else {
    setTimeout(() => {
      renderQuestion(generateQuestion());
    }, 800);
  }
}

function endQuiz() {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const grade = total > 0 ? gradeScore(score / total) : "N/A";

  document.getElementById("prompt").textContent =
    `Final score: ${score}/${total} = ${pct}%. Grade: ${grade}`;

  document.getElementById("choices").innerHTML = "";
  showMessage("Quiz complete.");
  document.getElementById("startBtn").disabled = false;
}

async function loadPresidents(csvPath) {
  const resp = await fetch(csvPath);
  if (!resp.ok) {
    throw new Error(`Could not load CSV: ${csvPath}`);
  }
  const text = await resp.text();
  presidents = parseCSV(text);
}

async function startQuiz() {
  try {
    const csvPath = "us_presidents.csv";
    const requestedLength = parseInt(document.getElementById("numQuestions").value, 10);

    maxQuestions = Math.min(Math.max(requestedLength || 10, 1), 200);

    if (presidents.length === 0) {
      await loadPresidents(csvPath);
    }

    score = 0;
    total = 0;
    askedQuestions = new Set();
    currentQuestion = null;

    updateScoreDisplay();
    showMessage("Loaded CSV successfully.", "info");
    document.getElementById("startBtn").disabled = true;

    renderQuestion(generateQuestion());
  } catch (err) {
    console.error(err);
    showMessage(`Error: ${err.message}`, "incorrect");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startBtn").addEventListener("click", startQuiz);
});