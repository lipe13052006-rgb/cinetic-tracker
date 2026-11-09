// Shared helpers and shared data for both pages.
const KG_TO_LB = 2.20462;
const KCAL_PER_KG = 7700;

// One set of keys for the whole site, so Gym and Diet read the same profile, unit and weigh-ins.
const K = {
  profile: "k2-profile",   // { sex, height }  set once
  unit: "k2-unit",         // "kg" | "lb"
  weights: "k2-weights",   // { "YYYY-MM-DD": kg }  one weigh-in per day
  diet: "k2-diet",         // [{ date, intake, burn }]
  sessions: "k2-sessions", // [{ id, date, name, exercises: [{ lift, sets, reps, weight }] }]
};

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function isoDate(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Small deterministic random so demo data looks the same on every load.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---- Profile (sex + height), asked once ----
const getProfile = () => store.get(K.profile, null);
const profileOrDefault = () => getProfile() || { sex: "male", height: 178 };

function initProfileDialog(onSave) {
  const dlg = document.createElement("dialog");
  dlg.className = "dialog";
  dlg.innerHTML = `
    <form id="profile-form">
      <h3 id="pf-title">Welcome</h3>
      <p id="pf-text">Tell us about you once. We use it for the benchmark lines and your BMI.</p>
      <label>Sex
        <select name="sex"><option value="male">Male</option><option value="female">Female</option></select>
      </label>
      <label>Height (cm)
        <input type="number" name="height" min="120" max="230" required placeholder="e.g. 178">
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" id="pf-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form");
  const cancel = dlg.querySelector("#pf-cancel");

  function open(first) {
    const p = getProfile();
    form.sex.value = p ? p.sex : "male";
    form.height.value = p ? p.height : "";
    dlg.querySelector("#pf-title").textContent = first ? "Welcome" : "Your profile";
    cancel.hidden = first;
    if (!dlg.open) dlg.showModal();
  }
  // The first-run dialog can't be dismissed without saving.
  dlg.addEventListener("cancel", (e) => { if (!getProfile()) e.preventDefault(); });
  cancel.addEventListener("click", () => dlg.close());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    store.set(K.profile, { sex: form.sex.value, height: parseFloat(form.height.value) });
    dlg.close();
    onSave();
  });
  // Delegated, so buttons rendered later (like the profile card's) work too.
  document.addEventListener("click", (e) => { if (e.target.closest("[data-edit-profile]")) open(false); });
  if (!getProfile()) open(true);
  return open;
}

// ---- Units ----
const getUnit = () => store.get(K.unit, "kg");
const setUnit = (u) => store.set(K.unit, u);

// ---- Diet + weigh-in data (weights live here only; Gym just reads the latest) ----
function demoDiet() {
  const rand = seeded(7);
  const diet = [];
  const weights = {};
  let trueWeight = 84;
  for (let i = 55; i >= 0; i--) {
    const date = addDays(new Date(), -i);
    const weekend = [0, 6].includes(date.getDay());
    const intake = Math.round((weekend ? 2650 : 2200) + (rand() - 0.5) * 500);
    const burn = Math.round(2600 + (rand() - 0.5) * 400 + (weekend ? -150 : 100));
    trueWeight += (intake - burn) / KCAL_PER_KG;
    const iso = isoDate(date);
    diet.push({ date: iso, intake, burn });
    // Water weight makes weigh-ins noisy; people also skip some days.
    if (rand() > 0.2) weights[iso] = +(trueWeight + (rand() - 0.5) * 1.2).toFixed(1);
  }
  return { diet, weights };
}

function loadDietData() {
  let diet = store.get(K.diet, null);
  let weights = store.get(K.weights, null);
  if (!diet || !weights) {
    ({ diet, weights } = demoDiet());
    store.set(K.diet, diet);
    store.set(K.weights, weights);
  }
  return { diet, weights };
}

function latestWeight() {
  const { weights } = loadDietData();
  const dates = Object.keys(weights).sort();
  return dates.length ? { date: dates.at(-1), kg: weights[dates.at(-1)] } : null;
}

// ---- Charts ----
function chartDefaults() {
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = cssVar("--muted");
  Chart.defaults.borderColor = cssVar("--border");
}

function baseChartOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: cssVar("--surface"),
        titleColor: cssVar("--text"),
        bodyColor: cssVar("--text"),
        footerColor: cssVar("--muted"),
        borderColor: cssVar("--border"),
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { title: { display: !!yTitle, text: yTitle }, grid: { color: cssVar("--border") } },
    },
  };
}

function onThemeChange(cb) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    chartDefaults();
    cb();
  });
}
