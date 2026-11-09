// Strength standards as bodyweight multiples for a one-rep max.
// Men: arvo.guru strength standards table. Women: lower-ratio community standards (coachway.io).
const STANDARDS = {
  male: {
    bench:    { beginner: 0.5,  novice: 0.75, intermediate: 1.25, advanced: 1.75 },
    squat:    { beginner: 0.75, novice: 1.0,  intermediate: 1.75, advanced: 2.25 },
    deadlift: { beginner: 1.0,  novice: 1.25, intermediate: 2.0,  advanced: 2.5  },
    ohp:      { beginner: 0.35, novice: 0.55, intermediate: 0.8,  advanced: 1.05 },
  },
  female: {
    bench:    { beginner: 0.25, novice: 0.5,  intermediate: 0.75, advanced: 1.0  },
    squat:    { beginner: 0.5,  novice: 0.75, intermediate: 1.25, advanced: 1.5  },
    deadlift: { beginner: 0.6,  novice: 1.0,  intermediate: 1.5,  advanced: 1.9  },
    ohp:      { beginner: 0.2,  novice: 0.35, intermediate: 0.5,  advanced: 0.7  },
  },
};
const MAIN_LIFTS = ["bench", "squat", "deadlift", "ohp"];
const LIFT_NAMES = { bench: "Bench press", squat: "Squat", deadlift: "Deadlift", ohp: "Overhead press" };
const SHORT_NAMES = { bench: "Bench", squat: "Squat", deadlift: "Deadlift", ohp: "OHP" };
const CUSTOM = "__custom";
// Weeks for the ideal curve to cover ~63% of the gap from beginner to intermediate.
const IDEAL_TIME_CONSTANT_WEEKS = 20;

const liftName = (k) => LIFT_NAMES[k] || k;
const shortName = (k) => SHORT_NAMES[k] || k;

const state = {
  unit: getUnit(),
  lift: "bench",
  sessions: loadSessions(),
  routines: loadRoutines(),
  template: "last", // "last" | "blank" | a routine id: what the session form starts from
};

// Epley estimate of a one-rep max.
const est1RM = (w, reps) => (reps === 1 ? w : w * (1 + reps / 30));
const toUnit = (kg) => (state.unit === "kg" ? kg : kg * KG_TO_LB);
const fromUnit = (v) => (state.unit === "kg" ? v : v / KG_TO_LB);
const fmtW = (kg, digits = 1) => `${+toUnit(kg).toFixed(digits)} ${state.unit}`;

function demoSessions() {
  const rand = seeded(42);
  const start = addDays(new Date(), -7 * 15);
  // Weekly trend per lift: starting weight (kg) and gain per week.
  const trend = {
    bench: [50, 1.6], ohp: [30, 0.8], squat: [65, 2.6], deadlift: [85, 3.1], "Barbell row": [40, 1.2],
  };
  const at = (lift, week, factor = 1) => {
    const [w0, gain] = trend[lift];
    const raw = (w0 + gain * week * (1 - week / 50) + (rand() - 0.5) * 3) * factor;
    return Math.round(raw / 2.5) * 2.5;
  };
  const ex = (lift, week, sets, reps, factor) => ({ lift, sets, reps, weight: at(lift, week, factor) });

  const sessions = [];
  for (let week = 0; week < 16; week++) {
    const days = [
      { day: 0, name: "Push", exercises: [ex("bench", week, 3, 5), ex("ohp", week, 3, 6)] },
      { day: 2, name: "Legs", exercises: [ex("squat", week, 3, 5), ex("deadlift", week, 3, 5)] },
      // Lighter, higher-rep day: same lifts at ~92% for 8 reps, plus rows.
      { day: 4, name: "Full body", exercises: [ex("bench", week, 3, 8, 0.92), ex("squat", week, 3, 8, 0.92), ex("Barbell row", week, 3, 8)] },
    ];
    for (const d of days) {
      const date = addDays(start, week * 7 + d.day);
      if (date > new Date()) continue;
      sessions.push({ id: `demo-${week}-${d.day}`, date: isoDate(date), name: d.name, exercises: d.exercises });
    }
  }
  return sessions;
}

function loadSessions() {
  let s = store.get(K.sessions, null);
  if (!s) { s = demoSessions(); store.set(K.sessions, s); }
  return s;
}

function bodyweightKg() {
  const w = latestWeight();
  return w ? w.kg : null;
}

function standardFor(lift) {
  return STANDARDS[profileOrDefault().sex][lift] || null;
}

function idealAt(weeks, lift) {
  const s = standardFor(lift);
  const bw = bodyweightKg();
  if (!s || !bw) return null;
  const frac = 1 - Math.exp(-Math.max(0, weeks) / IDEAL_TIME_CONSTANT_WEEKS);
  return bw * (s.beginner + (s.intermediate - s.beginner) * frac);
}

function levelFor(oneRm, lift) {
  const s = standardFor(lift);
  const bw = bodyweightKg();
  if (!s || !bw) return null;
  const ratio = oneRm / bw;
  if (ratio >= s.advanced) return "Advanced";
  if (ratio >= s.intermediate) return "Intermediate";
  if (ratio >= s.novice) return "Novice";
  if (ratio >= s.beginner) return "Beginner";
  return "Getting started";
}

function allLifts() {
  const custom = new Set();
  for (const s of state.sessions) for (const e of s.exercises) if (!MAIN_LIFTS.includes(e.lift)) custom.add(e.lift);
  return [...MAIN_LIFTS, ...[...custom].sort()];
}

function liftEntries(lift) {
  // Best estimated 1RM per day for the chosen lift.
  const byDate = {};
  for (const s of state.sessions) {
    for (const e of s.exercises) {
      if (e.lift !== lift) continue;
      byDate[s.date] = Math.max(byDate[s.date] || 0, est1RM(e.weight, e.reps));
    }
  }
  return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

const weeksBetween = (a, b) => (new Date(a) - new Date(b)) / (7 * 864e5);

let chart;
function renderChart() {
  const points = liftEntries(state.lift);
  const startDate = points[0]?.date;
  const hasIdeal = !!standardFor(state.lift) && bodyweightKg() != null;

  const accent = cssVar("--accent");
  const idealColor = cssVar("--ideal");
  const datasets = [
    { label: "Your est. 1RM", data: points.map((p) => +toUnit(p.value).toFixed(1)), borderColor: accent, backgroundColor: accent, borderWidth: 2.5, pointRadius: 3, tension: 0.3 },
  ];
  if (hasIdeal) {
    datasets.push({
      label: "Ideal progress",
      data: points.map((p) => +toUnit(idealAt(weeksBetween(p.date, startDate), state.lift)).toFixed(1)),
      borderColor: idealColor, backgroundColor: idealColor, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.3,
    });
  }
  const options = baseChartOptions(`Estimated 1RM (${state.unit})`);
  options.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${c.parsed.y} ${state.unit}` };

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("gym-chart"), {
    type: "line",
    data: { labels: points.map((p) => fmtDate(p.date)), datasets },
    options,
  });

  document.getElementById("ideal-legend").hidden = !hasIdeal;
  document.getElementById("ideal-note").hidden = !hasIdeal;

  const latest = points.at(-1);
  const level = latest && levelFor(latest.value, state.lift);
  document.getElementById("level-badge").textContent = !latest
    ? "No sessions yet"
    : level ? `${liftName(state.lift)}: ${level}` : liftName(state.lift);
}

function renderStats() {
  const points = liftEntries(state.lift);
  const first = points[0], last = points.at(-1);
  const volume = state.sessions
    .filter((s) => new Date(s.date) > addDays(new Date(), -7))
    .reduce((t, s) => t + s.exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0), 0);
  const gain = first && last ? last.value - first.value : 0;
  const ideal = last && idealAt(weeksBetween(last.date, first.date), state.lift);
  const vsIdeal = ideal != null ? last.value - ideal : null;

  const stats = [
    { label: `Current ${liftName(state.lift).toLowerCase()} 1RM`, value: last ? fmtW(last.value, 0) : "–", delta: "estimated" },
    { label: "Gained since start", value: `${gain >= 0 ? "+" : ""}${fmtW(gain, 0)}`, delta: first ? `since ${fmtDate(first.date)}` : "", cls: gain >= 0 ? "up" : "down" },
    vsIdeal != null
      ? { label: "Vs. ideal line", value: `${vsIdeal >= 0 ? "+" : ""}${fmtW(vsIdeal, 0)}`, delta: vsIdeal >= 0 ? "ahead of the curve" : "behind the curve", cls: vsIdeal >= 0 ? "up" : "down" }
      : { label: "Vs. ideal line", value: "–", delta: bodyweightKg() ? "no benchmark for this exercise" : "log your weight on the Diet page" },
    { label: "Sessions logged", value: state.sessions.length, delta: `${fmtW(volume, 0)} volume this week` },
  ];
  document.getElementById("stats").innerHTML = stats.map((s) => `
    <div class="card stat">
      <div class="label">${esc(s.label)}</div>
      <div class="value ${s.cls || ""}">${esc(s.value)}</div>
      <div class="delta">${esc(s.delta)}</div>
    </div>`).join("");
}

function renderSessions() {
  const rows = [...state.sessions].reverse().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  document.getElementById("sessions").innerHTML = rows.length ? rows.map((s) => `
    <div class="session">
      <div class="session-head">
        <div><strong>${esc(s.name || "Training")}</strong><span class="badge">${fmtDate(s.date)}</span></div>
        <button class="icon-btn" type="button" data-del="${esc(s.id)}" aria-label="Delete session">&times;</button>
      </div>
      <ul>${s.exercises.map((e) => `
        <li><span>${esc(liftName(e.lift))}</span><span>${e.sets} × ${e.reps} · ${fmtW(e.weight)}</span></li>`).join("")}
      </ul>
    </div>`).join("") : `<p class="hint">No sessions yet. Log your first one.</p>`;
}

function renderProfileCard() {
  const p = profileOrDefault();
  const w = latestWeight();
  const h = p.height / 100;
  const bmi = w ? (w.kg / (h * h)).toFixed(1) : "–";
  document.getElementById("profile-card").innerHTML = `
    <h3>You</h3>
    <div class="kv"><span>Sex</span><strong>${p.sex === "male" ? "Male" : "Female"}</strong></div>
    <div class="kv"><span>Height</span><strong>${p.height} cm</strong></div>
    <div class="kv"><span>Bodyweight</span><strong>${w ? fmtW(w.kg) : "–"}</strong></div>
    <div class="kv"><span>BMI</span><strong>${bmi}</strong></div>
    <p class="hint">${w ? `Latest weigh-in ${fmtDate(w.date)}. ` : ""}Your weight comes from the daily log on the <a href="diet.html">Diet page</a>.</p>
    <button class="btn btn-ghost btn-sm" type="button" data-edit-profile style="margin-top:10px">Edit profile</button>`;
}

function renderLiftPicker() {
  const lifts = allLifts();
  if (!lifts.includes(state.lift)) state.lift = "bench";
  document.getElementById("lift-picker").innerHTML = lifts
    .map((l) => `<button type="button" data-lift="${esc(l)}" aria-pressed="${l === state.lift}">${esc(shortName(l))}</button>`)
    .join("");
}

function renderUnits() {
  document.querySelectorAll("[data-unit]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.unit === state.unit));
  document.querySelectorAll(".wl").forEach((el) => { el.textContent = `Weight (${state.unit})`; });
}

function renderAll() {
  renderUnits();
  renderProfileCard();
  renderLiftPicker();
  renderStats();
  renderChart();
  renderSessions();
}

// ---- Routines and the session builder ----
const rowsEl = document.getElementById("rows");
const chipsEl = document.getElementById("templates");
const hintEl = document.getElementById("template-hint");
const routineMsg = document.getElementById("routine-msg");
const logForm = document.getElementById("log");

// Three starter routines that match the demo sessions. People can save their own.
function demoRoutines() {
  return [
    { id: "r-push", name: "Push", exercises: [{ lift: "bench", sets: 3, reps: 5 }, { lift: "ohp", sets: 3, reps: 6 }] },
    { id: "r-legs", name: "Legs", exercises: [{ lift: "squat", sets: 3, reps: 5 }, { lift: "deadlift", sets: 3, reps: 5 }] },
    { id: "r-full", name: "Full body", exercises: [{ lift: "bench", sets: 3, reps: 8 }, { lift: "squat", sets: 3, reps: 8 }, { lift: "Barbell row", sets: 3, reps: 8 }] },
  ];
}
function loadRoutines() {
  let r = store.get(K.routines, null);
  if (!r) { r = demoRoutines(); store.set(K.routines, r); }
  return r;
}

const newestFirst = () => [...state.sessions].reverse().sort((a, b) => b.date.localeCompare(a.date));

// The weight you used last time for a lift: in the same kind of session if possible, otherwise anywhere.
function lastWeight(lift, routineName) {
  const list = newestFirst();
  const find = (pred) => {
    for (const s of list) {
      if (!pred(s)) continue;
      const e = s.exercises.find((x) => x.lift === lift);
      if (e) return e.weight;
    }
    return null;
  };
  const same = routineName ? find((s) => (s.name || "").toLowerCase() === routineName.toLowerCase()) : null;
  return same != null ? same : find(() => true);
}

function refreshRows() {
  const rows = rowsEl.querySelectorAll(".ex-row");
  rows.forEach((r) => { r.querySelector("[data-remove]").disabled = rows.length === 1; });
}

function addRow(data = {}) {
  const row = document.createElement("div");
  row.className = "ex-row";
  row.innerHTML = `
    <div class="ex-top">
      <select name="lift" aria-label="Exercise">
        ${MAIN_LIFTS.map((l) => `<option value="${l}">${LIFT_NAMES[l]}</option>`).join("")}
        <option value="${CUSTOM}">Other exercise…</option>
      </select>
      <button type="button" class="icon-btn" data-remove aria-label="Remove exercise">&times;</button>
    </div>
    <input type="text" name="custom" maxlength="40" placeholder="Exercise name" aria-label="Exercise name" hidden>
    <div class="ex-nums">
      <label>Sets<input type="number" name="sets" min="1" max="20" value="3" required></label>
      <label>Reps<input type="number" name="reps" min="1" max="30" value="5" required></label>
      <label><span class="wl">Weight (${state.unit})</span><input type="number" name="weight" min="0.5" step="0.5" required></label>
    </div>`;
  const sel = row.querySelector('[name="lift"]');
  const custom = row.querySelector('[name="custom"]');
  if (data.lift) {
    if (MAIN_LIFTS.includes(data.lift)) sel.value = data.lift;
    else { sel.value = CUSTOM; custom.hidden = false; custom.required = true; custom.value = data.lift; }
  }
  if (data.sets) row.querySelector('[name="sets"]').value = data.sets;
  if (data.reps) row.querySelector('[name="reps"]').value = data.reps;
  if (data.weight != null) row.querySelector('[name="weight"]').value = +toUnit(data.weight).toFixed(1);
  rowsEl.appendChild(row);
  refreshRows();
}

function fillRows(list) {
  rowsEl.innerHTML = "";
  (list.length ? list : [{}]).forEach(addRow);
}

// Read the exercise rows. Weights are returned in kg (or undefined if empty).
function readRows() {
  return [...rowsEl.querySelectorAll(".ex-row")].map((r) => {
    let lift = r.querySelector('[name="lift"]').value;
    if (lift === CUSTOM) {
      const name = r.querySelector('[name="custom"]').value.trim();
      // Typing a main lift's name under "Other" still counts toward that lift.
      lift = MAIN_LIFTS.find((k) => LIFT_NAMES[k].toLowerCase() === name.toLowerCase()) || name;
    }
    const w = parseFloat(r.querySelector('[name="weight"]').value);
    return {
      lift,
      sets: +r.querySelector('[name="sets"]').value,
      reps: +r.querySelector('[name="reps"]').value,
      weight: Number.isNaN(w) ? undefined : fromUnit(w),
    };
  }).filter((x) => x.lift);
}

function renderTemplates() {
  const chips = [
    { id: "last", label: "Last session" },
    ...state.routines.map((r) => ({ id: r.id, label: r.name })),
    { id: "blank", label: "Blank" },
  ];
  chipsEl.innerHTML = chips.map((c) => `<button type="button" data-template="${esc(c.id)}" aria-pressed="${c.id === state.template}">${esc(c.label)}</button>`).join("");

  const routine = state.routines.find((r) => r.id === state.template);
  document.getElementById("delete-routine").hidden = !routine;
  hintEl.textContent =
    state.template === "blank" ? "Starting from scratch." :
    routine ? `Weights are from the last time you did ${routine.name}. Change what's different.` :
    "Filled in from your last session. Change what's different.";
}

function applyTemplate(id) {
  state.template = id;
  routineMsg.textContent = "";
  logForm.date.value = isoDate(new Date());

  const routine = state.routines.find((r) => r.id === id);
  if (id !== "blank" && !routine) state.template = "last";

  if (routine) {
    fillRows(routine.exercises.map((e) => ({ ...e, weight: lastWeight(e.lift, routine.name) })));
    logForm.name.value = routine.name;
  } else if (state.template === "last" && state.sessions.length) {
    const s = newestFirst()[0];
    fillRows(s.exercises);
    logForm.name.value = s.name || "";
  } else {
    fillRows([]);
    logForm.name.value = "";
  }
  renderTemplates();
}

rowsEl.addEventListener("change", (e) => {
  if (e.target.name !== "lift") return;
  const custom = e.target.closest(".ex-row").querySelector('[name="custom"]');
  const isCustom = e.target.value === CUSTOM;
  custom.hidden = !isCustom;
  custom.required = isCustom;
  if (isCustom) custom.focus();
});
rowsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  btn.closest(".ex-row").remove();
  refreshRows();
});
document.getElementById("add-row").addEventListener("click", () => addRow());

chipsEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-template]");
  if (b) applyTemplate(b.dataset.template);
});

document.getElementById("save-routine").addEventListener("click", () => {
  const name = logForm.name.value.trim();
  if (!name) {
    routineMsg.textContent = "Give the session a name first (like Pull day), then save it as a routine.";
    logForm.name.focus();
    return;
  }
  const exercises = readRows().map(({ lift, sets, reps }) => ({ lift, sets, reps }));
  if (!exercises.length) return;
  // Saving under an existing name updates that routine.
  let routine = state.routines.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (routine) routine.exercises = exercises;
  else { routine = { id: `r${Date.now()}`, name, exercises }; state.routines.push(routine); }
  store.set(K.routines, state.routines);
  state.template = routine.id;
  renderTemplates();
  routineMsg.textContent = `Saved routine "${routine.name}". Pick it any time under Start from.`;
});

document.getElementById("delete-routine").addEventListener("click", () => {
  state.routines = state.routines.filter((r) => r.id !== state.template);
  store.set(K.routines, state.routines);
  applyTemplate("last");
});

logForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const exercises = readRows();
  if (!exercises.length) return;

  state.sessions.push({ id: String(Date.now()), date: logForm.date.value, name: logForm.name.value.trim(), exercises });
  store.set(K.sessions, state.sessions);
  state.lift = exercises[0].lift;
  // Refill from the same starting point, so next time it already holds today's weights.
  applyTemplate(state.template);
  renderAll();
});

// ---- Other events ----
document.querySelectorAll("[data-unit]").forEach((b) => b.addEventListener("click", () => {
  // Weights already typed into the form keep their value when the unit changes.
  const typed = readRows().length ? [...rowsEl.querySelectorAll('[name="weight"]')].map((i) => (i.value === "" ? null : fromUnit(parseFloat(i.value)))) : [];
  state.unit = b.dataset.unit;
  setUnit(state.unit);
  renderAll();
  rowsEl.querySelectorAll('[name="weight"]').forEach((i, n) => { i.value = typed[n] == null ? "" : +toUnit(typed[n]).toFixed(1); });
}));

document.getElementById("lift-picker").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lift]");
  if (!b) return;
  state.lift = b.dataset.lift;
  renderAll();
});

document.getElementById("sessions").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del]");
  if (!b) return;
  state.sessions = state.sessions.filter((s) => s.id !== b.dataset.del);
  store.set(K.sessions, state.sessions);
  renderAll();
});

document.getElementById("reset").addEventListener("click", () => {
  state.sessions = demoSessions();
  state.routines = demoRoutines();
  store.set(K.sessions, state.sessions);
  store.set(K.routines, state.routines);
  state.lift = "bench";
  applyTemplate("last");
  renderAll();
});

chartDefaults();
applyTemplate("last");
renderAll();
onThemeChange(renderChart);
initProfileDialog(renderAll);
