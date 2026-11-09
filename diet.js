const state = {
  unit: getUnit(),
  ...loadDietData(), // { diet: [{date,intake,burn}], weights: {date: kg} }
};

const toUnit = (kg) => (state.unit === "kg" ? kg : kg * KG_TO_LB);
const fromUnit = (v) => (state.unit === "kg" ? v : v / KG_TO_LB);
const fmtW = (kg, digits = 1) => `${toUnit(kg).toFixed(digits)} ${state.unit}`;
const fmtK = (n) => Math.round(n).toLocaleString();

function entries() {
  return [...state.diet]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ ...e, weight: state.weights[e.date] ?? null }));
}

// Predicted weight per day: start from the first weigh-in and add the running calorie balance.
function predictions(list) {
  const firstIdx = list.findIndex((e) => e.weight != null);
  if (firstIdx < 0) return list.map(() => null);
  let w = list[firstIdx].weight;
  return list.map((e, i) => {
    if (i < firstIdx) return null;
    if (i > firstIdx) w += (list[i - 1].intake - list[i - 1].burn) / KCAL_PER_KG;
    return w;
  });
}

let weightChart, calChart;
function renderCharts() {
  const list = entries();
  const pred = predictions(list);
  const accent = cssVar("--accent");
  const ideal = cssVar("--ideal");
  const s2 = cssVar("--series-2");

  const wOpts = baseChartOptions(`Weight (${state.unit})`);
  wOpts.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} ${state.unit}` };
  if (weightChart) weightChart.destroy();
  weightChart = new Chart(document.getElementById("weight-chart"), {
    type: "line",
    data: {
      labels: list.map((e) => fmtDate(e.date)),
      datasets: [
        { label: "Measured", data: list.map((e) => (e.weight == null ? null : toUnit(e.weight))), borderColor: accent, backgroundColor: accent, borderWidth: 2, pointRadius: 2.5, tension: 0.25, spanGaps: true },
        { label: "Predicted", data: pred.map((p) => (p == null ? null : toUnit(p))), borderColor: ideal, backgroundColor: ideal, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.25 },
      ],
    },
    options: wOpts,
  });

  const recent = list.slice(-14);
  const cOpts = baseChartOptions("kcal");
  cOpts.plugins.tooltip.callbacks = {
    label: (c) => ` ${c.dataset.label}: ${fmtK(c.parsed.y)} kcal`,
    footer: (items) => {
      const e = recent[items[0].dataIndex];
      const net = e.intake - e.burn;
      return `Balance: ${net > 0 ? "+" : ""}${fmtK(net)} kcal`;
    },
  };
  if (calChart) calChart.destroy();
  calChart = new Chart(document.getElementById("cal-chart"), {
    type: "bar",
    data: {
      labels: recent.map((e) => fmtDate(e.date)),
      datasets: [
        { label: "Eaten", data: recent.map((e) => e.intake), backgroundColor: accent, borderRadius: 4, maxBarThickness: 18 },
        { label: "Burned", data: recent.map((e) => e.burn), backgroundColor: s2, borderRadius: 4, maxBarThickness: 18 },
      ],
    },
    options: cOpts,
  });
}

function renderStats() {
  const list = entries();
  const last7 = list.slice(-7);
  const avg = (k) => last7.reduce((t, e) => t + e[k], 0) / (last7.length || 1);
  const avgIn = avg("intake");
  const avgOut = avg("burn");
  const net = avgIn - avgOut;
  const weighed = list.filter((e) => e.weight != null);
  const first = weighed[0], last = weighed.at(-1);
  const change = first && last ? last.weight - first.weight : 0;
  const weeklyPace = (net * 7) / KCAL_PER_KG;

  const stats = [
    { label: "Avg eaten (7 days)", value: fmtK(avgIn), delta: "kcal per day" },
    { label: "Avg burned (7 days)", value: fmtK(avgOut), delta: "kcal per day" },
    { label: "Daily balance", value: `${net > 0 ? "+" : ""}${fmtK(net)}`, delta: net < 0 ? "kcal deficit" : "kcal surplus", cls: net < 0 ? "up" : "" },
    { label: "Current weight", value: last ? fmtW(last.weight) : "–", delta: first ? `${change > 0 ? "+" : ""}${fmtW(change)} since ${fmtDate(first.date)}` : "no weigh-ins yet" },
  ];
  document.getElementById("stats").innerHTML = stats.map((s) => `
    <div class="card stat">
      <div class="label">${s.label}</div>
      <div class="value ${s.cls || ""}">${s.value}</div>
      <div class="delta">${s.delta}</div>
    </div>`).join("");

  const pace = toUnit(Math.abs(weeklyPace)).toFixed(2);
  document.getElementById("trend-badge").textContent =
    weeklyPace < -0.02 ? `Losing ~${pace} ${state.unit}/week` :
    weeklyPace > 0.02 ? `Gaining ~${pace} ${state.unit}/week` : "Holding steady";
}

function renderUnits() {
  document.getElementById("w-label").textContent = `Today's weight (${state.unit})`;
  document.querySelectorAll("[data-unit]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.unit === state.unit));
  fillForm();
}

function renderAll() {
  renderUnits();
  renderStats();
  renderCharts();
}

const form = document.getElementById("log");

// Show what's already logged for the chosen day, so re-submitting edits it instead of duplicating.
function fillForm() {
  const date = form.date.value;
  const e = state.diet.find((x) => x.date === date);
  const w = state.weights[date];
  form.intake.value = e ? e.intake : "";
  form.burn.value = e ? e.burn : "";
  form.weight.value = w != null ? +toUnit(w).toFixed(1) : "";
}

form.date.value = isoDate(new Date());
form.date.addEventListener("change", fillForm);

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const date = form.date.value;
  state.diet = state.diet.filter((e) => e.date !== date).concat({ date, intake: +form.intake.value, burn: +form.burn.value });
  if (form.weight.value) state.weights[date] = +fromUnit(parseFloat(form.weight.value)).toFixed(2);
  store.set(K.diet, state.diet);
  store.set(K.weights, state.weights);
  renderAll();
});

document.querySelectorAll("[data-unit]").forEach((b) => b.addEventListener("click", () => {
  state.unit = b.dataset.unit;
  setUnit(state.unit);
  renderAll();
}));

document.getElementById("reset").addEventListener("click", () => {
  const d = demoDiet();
  state.diet = d.diet;
  state.weights = d.weights;
  store.set(K.diet, state.diet);
  store.set(K.weights, state.weights);
  renderAll();
});

chartDefaults();
renderAll();
onThemeChange(renderCharts);
initProfileDialog(renderAll);
