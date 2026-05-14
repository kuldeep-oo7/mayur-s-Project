import { api } from '../api.js';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

export default async function renderDashboard() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr" style="margin-bottom:20px;">
            <div>
                <div class="page-title">Dashboard</div>
                <div class="page-sub" id="dash-sub">Loading data…</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <label style="font-size:13px;color:var(--text-secondary);font-weight:500;">Period:</label>
                <select id="dash-month" class="form-control" style="width:160px;font-size:13px;">
                    <option value="">Loading…</option>
                </select>
            </div>
        </div>

        <!-- KPIs -->
        <div class="grid-5 mb-4">
            <div class="kpi-card">
                <i data-lucide="indian-rupee" class="kpi-icon"></i>
                <span class="kpi-label">Total Spend</span>
                <span class="kpi-value" id="kpi-spend">---</span>
            </div>
            <div class="kpi-card">
                <i data-lucide="shopping-cart" class="kpi-icon"></i>
                <span class="kpi-label">Purchases</span>
                <span class="kpi-value" id="kpi-purchases">---</span>
            </div>
            <div class="kpi-card">
                <i data-lucide="tag" class="kpi-icon"></i>
                <span class="kpi-label">Avg Order Value</span>
                <span class="kpi-value" id="kpi-avg">---</span>
            </div>
            <div class="kpi-card">
                <i data-lucide="truck" class="kpi-icon"></i>
                <span class="kpi-label">Top Vendor</span>
                <span class="kpi-value" id="kpi-vendor" style="font-size:1.1rem;">---</span>
            </div>
            <div class="kpi-card">
                <i data-lucide="package" class="kpi-icon"></i>
                <span class="kpi-label">Top Item</span>
                <span class="kpi-value" id="kpi-item" style="font-size:1.1rem;">---</span>
            </div>
        </div>

        <!-- Charts -->
        <div class="grid-2">
            <div class="card">
                <h3 class="card-title">Vendor Wise Spend</h3>
                <div class="chart-container"><canvas id="vendorChart"></canvas></div>
            </div>
            <div class="card">
                <h3 class="card-title">Category Distribution</h3>
                <div class="chart-container"><canvas id="categoryChart"></canvas></div>
            </div>
            <div class="card" style="grid-column:span 2;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <h3 class="card-title mb-0">Monthly Purchase Trend</h3>
                    <span id="trend-note" style="font-size:11px;color:var(--text-muted);"></span>
                </div>
                <div class="chart-container" style="height:320px;"><canvas id="trendChart"></canvas></div>
            </div>
        </div>

        <!-- Empty state -->
        <div id="dash-empty" style="display:none;" class="card" style="text-align:center;padding:48px;">
            <i data-lucide="inbox" style="width:40px;height:40px;color:var(--text-muted);display:block;margin:0 auto 12px;"></i>
            <div style="color:var(--text-muted);font-size:14px;">No purchases found for this period.</div>
        </div>
    `;

    let vendorChart = null, categoryChart = null, trendChart = null;
    const monthSel  = container.querySelector('#dash-month');
    const subEl     = container.querySelector('#dash-sub');

    // ── Populate month dropdown ───────────────────────────────────────────────
    async function loadMonths() {
        try {
            const months = await api.getAvailableMonths();
            if (!months.length) {
                monthSel.innerHTML = '<option value="">No data yet</option>';
                return;
            }
            monthSel.innerHTML = months.map((m, i) =>
                `<option value="${m}"${i === 0 ? ' selected' : ''}>${fmtMonth(m)}</option>`
            ).join('');
        } catch {
            monthSel.innerHTML = '<option value="">Error loading months</option>';
        }
    }

    // ── Load analytics for selected month ────────────────────────────────────
    async function loadAnalytics() {
        const month = monthSel.value;
        if (!month) return;

        subEl.textContent = `Showing data for ${fmtMonth(month)}`;

        try {
            const stats = await api.getStatsSummary(month);
            const kpi   = stats.kpis?.[0] || {};
            const empty = !kpi.monthlyPurchases;

            container.querySelector('#dash-empty').style.display = empty ? 'block' : 'none';

            // ── KPIs ──────────────────────────────────────────────────────
            container.querySelector('#kpi-spend').textContent =
                '₹' + (kpi.monthlySpend || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
            container.querySelector('#kpi-purchases').textContent = kpi.monthlyPurchases || 0;
            container.querySelector('#kpi-avg').textContent =
                '₹' + (kpi.avgOrderValue || 0).toFixed(0);
            container.querySelector('#kpi-vendor').textContent =
                (stats.topVendor?.[0]?.name) || '—';
            container.querySelector('#kpi-item').textContent =
                (stats.topItem?.[0]?.item) || '—';

            // ── Chart 1: Vendor Spend ────────────────────────────────────
            const vCanvas = container.querySelector('#vendorChart');
            if (vCanvas && stats.vendorSpend?.length) {
                if (vendorChart) vendorChart.destroy();
                vendorChart = new Chart(vCanvas, {
                    type: 'bar',
                    data: {
                        labels: stats.vendorSpend.map(r => r.label),
                        datasets: [{
                            label: 'Spend (₹)',
                            data:  stats.vendorSpend.map(r => r.value),
                            backgroundColor: '#111827',
                            borderRadius: 6,
                            borderSkipped: false,
                            barPercentage: 0.6,
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { grid: { display: false } },
                            y: {
                                beginAtZero: true,
                                border: { display: false },
                                grid: { color: 'rgba(0,0,0,0.05)' },
                                ticks: { callback: v => '₹' + v.toLocaleString('en-IN') }
                            }
                        }
                    }
                });
            }

            // ── Chart 2: Category Doughnut ────────────────────────────────
            const cCanvas = container.querySelector('#categoryChart');
            if (cCanvas && stats.categoryDist?.length) {
                if (categoryChart) categoryChart.destroy();
                categoryChart = new Chart(cCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: stats.categoryDist.map(r => r.label),
                        datasets: [{
                            data: stats.categoryDist.map(r => r.value),
                            backgroundColor: ['#111827','#374151','#4b5563','#6b7280','#9ca3af','#d1d5db'],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        cutout: '75%',
                        plugins: { legend: { position: 'bottom', labels: { font: { size: 12, family: 'Inter' }, padding: 20, usePointStyle: true, pointStyle: 'circle' } } }
                    }
                });
            }

            // ── Chart 3: Monthly Trend (all time) ─────────────────────────
            const tCanvas = container.querySelector('#trendChart');
            if (tCanvas && stats.monthlyTrend?.length) {
                if (trendChart) trendChart.destroy();
                const trendData = stats.monthlyTrend;
                // Highlight selected month bar
                const bgColors = trendData.map(r =>
                    r.label === month ? '#111827' : '#e5e7eb'
                );
                trendChart = new Chart(tCanvas, {
                    type: 'bar',
                    data: {
                        labels: trendData.map(r => fmtMonth(r.label)),
                        datasets: [{
                            label: 'Monthly Spend (₹)',
                            data:  trendData.map(r => r.value),
                            backgroundColor: bgColors,
                            borderRadius: 6,
                            borderSkipped: false,
                            barPercentage: 0.6,
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: {
                                label: ctx => '₹' + ctx.raw.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                            }}
                        },
                        scales: {
                            x: { grid: { display: false } },
                            y: {
                                beginAtZero: true,
                                border: { display: false },
                                grid: { color: 'rgba(0,0,0,0.05)' },
                                ticks: { callback: v => '₹' + v.toLocaleString('en-IN') }
                            }
                        }
                    }
                });
                container.querySelector('#trend-note').textContent =
                    `Selected month highlighted · All ${trendData.length} months shown`;
            }

        } catch (err) {
            console.error('Dashboard analytics failed:', err);
            subEl.textContent = 'Error loading data';
        }
    }

    // ── Wire up month selector ────────────────────────────────────────────────
    monthSel.addEventListener('change', loadAnalytics);

    // ── Boot sequence ─────────────────────────────────────────────────────────
    await loadMonths();
    setTimeout(loadAnalytics, 50);   // slight delay so canvas is in DOM

    lucide.createIcons({ root: container });
    return container;
}
