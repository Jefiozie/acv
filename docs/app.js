(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let appData = { centerparcs: {}, availability: {} };
  let charts = {};
  let refreshTimer = null;

  // ── Theme ──────────────────────────────────────────────────────
  function getInitialTheme() {
    const stored = localStorage.getItem('acv-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('acv-theme', theme);
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    renderCenterparcs(appData.centerparcs);
  }

  // ── Helpers ────────────────────────────────────────────────────
  /** Read a CSS custom property value from :root */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function formatDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'short',
    });
  }

  // ── Fetch ──────────────────────────────────────────────────────
  async function fetchData() {
    const bust = '?t=' + Date.now();
    const [cp, av] = await Promise.all([
      fetch('./centerparcs_cache.json' + bust).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('./availability_cache.json' + bust).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);
    return { centerparcs: cp, availability: av };
  }

  // ── Center Parcs charts ────────────────────────────────────────
  function renderCenterparcs(cp) {
    const container = document.getElementById('centerparcs-charts');

    // Destroy old Chart instances to avoid canvas re-use errors
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    container.innerHTML = '';

    const entries = Object.entries(cp);
    if (!entries.length) {
      container.innerHTML = '<p class="empty">Geen data beschikbaar.</p>';
      return;
    }

    entries.forEach(([id, info]) => {
      const history = (info.history || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const labels = history.map(h => formatDate(h.date));
      const originals = history.map(h => parseFloat(h.originalPrice));
      const promos = history.map(h => parseFloat(h.promoPrice));
      const latest = history[history.length - 1] || {};

      const card = document.createElement('div');
      card.className = 'chart-card';
      card.innerHTML = `
        <div class="card-header">
          <div>
            <h3 class="booking-id">${id}</h3>
            <span class="first-seen">Eerste keer gezien: ${new Date(info.firstSeen).toLocaleDateString('nl-NL')}</span>
          </div>
          <div class="price-badges">
            <span class="badge badge-promo">€${latest.promoPrice ?? info.latestPromoPrice}</span>
            <span class="badge badge-original">€${latest.originalPrice ?? info.latestOriginalPrice}</span>
            <span class="badge badge-discount">−${latest.discount ?? 0}%</span>
            <span class="badge badge-stock">🏕️ ${latest.stock ?? '?'}</span>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="chart-${id}"></canvas>
        </div>
      `;
      container.appendChild(card);

      const ctx = document.getElementById('chart-' + id).getContext('2d');
      charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Origineel',
              data: originals,
              borderColor: cssVar('--text-muted'),
              backgroundColor: 'transparent',
              borderDash: [5, 4],
              borderWidth: 2,
              pointRadius: history.length === 1 ? 5 : 3,
              tension: 0.35,
            },
            {
              label: 'Promo',
              data: promos,
              borderColor: cssVar('--accent'),
              backgroundColor: cssVar('--accent-muted'),
              fill: true,
              borderWidth: 2,
              pointRadius: history.length === 1 ? 5 : 3,
              tension: 0.35,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: {
              labels: {
                color: cssVar('--text'),
                font: { family: 'inherit', size: 11 },
                boxWidth: 12,
                padding: 10,
              },
            },
            tooltip: {
              backgroundColor: cssVar('--surface'),
              titleColor: cssVar('--text'),
              bodyColor: cssVar('--text-muted'),
              borderColor: cssVar('--border'),
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: ctx => ' €' + ctx.parsed.y.toFixed(0) + '  ' + ctx.dataset.label,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: cssVar('--text-muted'), font: { family: 'inherit', size: 10 }, maxTicksLimit: 8 },
              grid: { color: cssVar('--border') },
              border: { color: cssVar('--border') },
            },
            y: {
              ticks: {
                color: cssVar('--text-muted'),
                font: { family: 'inherit', size: 10 },
                callback: v => '€' + v,
              },
              grid: { color: cssVar('--border') },
              border: { color: cssVar('--border') },
            },
          },
        },
      });
    });
  }

  // ── Availability calendar ──────────────────────────────────────
  function renderAvailability(av) {
    const grid = document.getElementById('availability-grid');
    grid.innerHTML = '';

    const entries = Object.entries(av).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
      grid.innerHTML = '<p class="empty">Geen beschikbaarheidsdata.</p>';
      return;
    }

    entries.forEach(([date, info]) => {
      const label = new Date(date + 'T00:00:00').toLocaleDateString('nl-NL', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      const stateClass = info.state === 'available' ? 'avail-full'
        : info.state === 'semi' ? 'avail-semi'
        : 'avail-none';
      const stateLabel = info.state === 'available' ? 'Beschikbaar'
        : info.state === 'semi' ? 'Gedeeltelijk'
        : 'Niet beschikbaar';
      const slots = (info.slots || [])
        .map(s => `<span class="slot">${s}</span>`)
        .join('');

      const card = document.createElement('div');
      card.className = 'avail-card ' + stateClass;
      card.innerHTML = `
        <div class="avail-date">${label}</div>
        <div class="avail-state">${stateLabel}</div>
        ${slots ? '<div class="avail-slots">' + slots + '</div>' : ''}
      `;
      grid.appendChild(card);
    });
  }

  // ── Refresh ────────────────────────────────────────────────────
  async function refresh() {
    const indicator = document.getElementById('refresh-indicator');
    indicator.classList.add('spinning');
    try {
      appData = await fetchData();
      renderCenterparcs(appData.centerparcs);
      renderAvailability(appData.availability);
      document.getElementById('last-updated').textContent =
        'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      console.error('Data ophalen mislukt:', err);
      document.getElementById('last-updated').textContent = 'Laden mislukt';
    } finally {
      indicator.classList.remove('spinning');
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, 60_000);
  }

  // ── Boot ───────────────────────────────────────────────────────
  applyTheme(getInitialTheme());
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  refresh().then(startAutoRefresh);

})();
