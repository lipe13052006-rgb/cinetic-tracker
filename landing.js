// Sample charts for the landing page. Fixed fake data; nothing is read from or saved to storage.
chartDefaults();

function previewOptions() {
  const o = baseChartOptions();
  o.scales.x.ticks = { maxTicksLimit: 6, maxRotation: 0 };
  o.scales.y.ticks = { maxTicksLimit: 5 };
  o.plugins.tooltip.enabled = false;
  o.interaction = { mode: null };
  return o;
}

function drawPreviews() {
  const text = cssVar("--text");
  const green = cssVar("--green");
  const ideal = cssVar("--ideal");
  const rand = seeded(11);
  const weeks = Array.from({ length: 16 }, (_, i) => `Wk ${i + 1}`);

  // Bench press: a lifter starting near the beginner level and climbing past the ideal curve.
  const you = weeks.map((_, i) => +(62 + i * 1.9 * (1 - i / 60) + (rand() - 0.5) * 2.5).toFixed(1));
  const idealLift = weeks.map((_, i) => +(40 + (100 - 40) * (1 - Math.exp(-i / 20)) * 0.8).toFixed(1));

  if (window.gymPreview) window.gymPreview.destroy();
  window.gymPreview = new Chart(document.getElementById("home-gym"), {
    type: "line",
    data: {
      labels: weeks,
      datasets: [
        { data: you, borderColor: text, backgroundColor: text, borderWidth: 2.5, pointRadius: 2, tension: 0.35 },
        { data: idealLift, borderColor: ideal, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.35 },
      ],
    },
    options: previewOptions(),
  });

  // Weight: a gentle cut, with noisy weigh-ins around the predicted line.
  const predicted = weeks.map((_, i) => +(84 - i * 0.28).toFixed(1));
  const measured = predicted.map((p) => +(p + (rand() - 0.5) * 1.1).toFixed(1));

  if (window.dietPreview) window.dietPreview.destroy();
  window.dietPreview = new Chart(document.getElementById("home-diet"), {
    type: "line",
    data: {
      labels: weeks,
      datasets: [
        { data: measured, borderColor: green, backgroundColor: green, borderWidth: 2.5, pointRadius: 2, tension: 0.3 },
        { data: predicted, borderColor: ideal, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.3 },
      ],
    },
    options: previewOptions(),
  });
}

drawPreviews();
