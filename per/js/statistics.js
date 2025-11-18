"use strict";

const qs = (s, r = document) => r.querySelector(s);

export function initStatistics() {
  const view = qs("#view-statistics");
  if (!view) return;

  view.innerHTML = `
    <div class="section-header">
      <h2><span class="icon icon-chart"></span> Statystyki</h2>
    </div>
    <div class="toolbar">
      <select id="stats-range">
        <option value="week">Tydzień</option>
        <option value="month" selected>Miesiąc</option>
        <option value="year">Rok</option>
      </select>
    </div>
    <div class="charts">
      <div class="chart-card">
        <h3>Statystyki</h3>
        <p class="muted">Szczegółowe wykresy zostaną dodane później.</p>
      </div>
    </div>
  `;
}

export default { initStatistics };
