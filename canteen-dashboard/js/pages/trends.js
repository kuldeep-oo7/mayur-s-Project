import { api } from '../api.js';
import { catClass, escapeHtml } from '../utils.js';

const state = {
    trends:          {},   // item → aggregate
    purchasesByItem: {},   // item → sorted purchase rows
    items:           [],
    categories:      [],
};

let chartInstance  = null;
let expandedItems  = new Set();   // tracks which rows are expanded

export default async function renderTrends() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <h2 class="page-title">Price Trends</h2>
                <p class="page-sub">First vs latest rate comparison for every tracked item</p>
            </div>
            <div class="page-hdr-right">
                <select id="trend-item-select" class="form-control" style="min-width:200px;">
                    <option value="">— Select item for chart —</option>
                </select>
            </div>
        </div>

        <!-- Stats row -->
        <div class="grid-4 mb-4">
            <div class="card">
                <div class="stat-label">Current Rate</div>
                <div class="stat-value" id="trend-current">—</div>
            </div>
            <div class="card">
                <div class="stat-label">Average Rate</div>
                <div class="stat-value" id="trend-average">—</div>
            </div>
            <div class="card">
                <div class="stat-label">Lowest Rate</div>
                <div class="stat-value" id="trend-lowest">—</div>
            </div>
            <div class="card">
                <div class="stat-label">Trend</div>
                <div class="stat-value" id="trend-trend" style="font-size:18px;">—</div>
            </div>
        </div>

        <!-- Chart -->
        <div class="card mb-4">
            <h3 class="card-title">Rate Over Time</h3>
            <p class="card-sub" id="trend-chart-sub">Select an item above to view its price chart</p>
            <div class="chart-container" style="height:280px;">
                <canvas id="trend-item-chart"></canvas>
            </div>
        </div>

        <!-- Summary table -->
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div>
                    <h3 class="card-title mb-0">All Items — Trend Summary</h3>
                    <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                        Click any row to expand purchase history
                    </p>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <input type="text" id="trend-search" placeholder="Filter items…"
                           class="form-control" style="width:160px; font-size:13px; padding:6px 10px;">
                    <select id="trend-cat-filter" class="form-control"
                            style="font-size:13px; padding:6px 10px; min-width:140px;">
                        <option value="">All Categories</option>
                    </select>
                    <select id="trend-sort" class="form-control"
                            style="font-size:13px; padding:6px 10px; min-width:130px;">
                        <option value="name">Sort: Name</option>
                        <option value="change_desc">Sort: Biggest Rise</option>
                        <option value="change_asc">Sort: Biggest Drop</option>
                        <option value="spend_desc">Sort: Most Spend</option>
                    </select>
                </div>
            </div>

            <div class="table-container">
                <table class="table" id="trend-table">
                    <thead>
                        <tr>
                            <th style="width:20px;"></th>
                            <th>Item</th>
                            <th>Category</th>
                            <th style="text-align:right;">First Rate ₹</th>
                            <th style="text-align:right;">Latest Rate ₹</th>
                            <th style="text-align:right;">Change ₹</th>
                            <th style="text-align:right;">Change %</th>
                            <th>Trend</th>
                            <th style="text-align:right;">Avg Rate ₹</th>
                            <th style="text-align:right;">Total Qty</th>
                            <th style="text-align:right;">Total Spend ₹</th>
                        </tr>
                    </thead>
                    <tbody id="trend-summary-body"></tbody>
                </table>
            </div>
        </div>`;

    try {
        await loadTrends();
        populateFilters(container);
        renderTrendTable(container);

        container.querySelector('#trend-search').addEventListener('input', () => renderTrendTable(container));
        container.querySelector('#trend-cat-filter').addEventListener('change', () => renderTrendTable(container));
        container.querySelector('#trend-sort').addEventListener('change', () => renderTrendTable(container));
        container.querySelector('#trend-item-select').addEventListener('change', () => renderChart(container));

        // Row click → expand/collapse
        container.querySelector('#trend-summary-body').addEventListener('click', e => {
            const tr = e.target.closest('tr.trend-item-row');
            if (!tr) return;
            const item = tr.dataset.item;
            if (!item) return;
            if (expandedItems.has(item)) expandedItems.delete(item);
            else expandedItems.add(item);
            renderTrendTable(container);
        });

        lucide.createIcons({ root: container });
    } catch (err) {
        console.error('renderTrends error:', err);
        container.innerHTML = `<div class="card" style="border-left:4px solid var(--danger);">
            <p style="color:var(--danger); font-weight:600;">Error loading Trends</p>
            <p style="color:var(--text-muted); font-size:13px;">${escapeHtml(err.message)}</p>
        </div>`;
    }

    return container;
}

// ── Load all purchases and build trend aggregates ─────────────────────────────
async function loadTrends() {
    const purchases = await api.getPurchases();   // all records, no filter

    const trends   = {};
    const byItem   = {};
    const itemsSet = new Set();
    const catsSet  = new Set();

    // Sort purchases by date ascending so first/last are correct
    const sorted = [...purchases].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    for (const p of sorted) {
        const item = (p.item || '').trim();
        if (!item) continue;
        const price = parseFloat(p.price) || 0;
        const qty   = parseFloat(p.quantity) || 0;
        const amt   = parseFloat(p.finalAmount) || parseFloat(p.total) || (price * qty);

        itemsSet.add(item);
        if (p.category) catsSet.add(p.category);

        // Per-item list
        if (!byItem[item]) byItem[item] = [];
        byItem[item].push({
            date:     p.date,
            rate:     price,
            qty,
            unit:     p.unit || '',
            supplier: p.supplierName || p.supplier || '',
            invoiceNo: p.invoiceNo || '',
            amount:   amt,
        });

        // Aggregates
        if (!trends[item]) {
            trends[item] = {
                category:   p.category || '',
                unit:       p.unit || '',
                firstDate:  p.date,
                lastDate:   p.date,
                firstRate:  price,
                lastRate:   price,
                minRate:    price > 0 ? price : Infinity,
                maxRate:    price,
                sumRate:    0,
                count:      0,
                totalQty:   0,
                totalSpend: 0,
            };
        }
        const t = trends[item];
        // first = earliest date (array is sorted asc)
        if (p.date < t.firstDate) { t.firstDate = p.date; t.firstRate = price; }
        if (p.date > t.lastDate)  { t.lastDate  = p.date; t.lastRate  = price; }
        if (price > 0 && price < t.minRate) t.minRate = price;
        if (price > t.maxRate) t.maxRate = price;
        t.sumRate    += price;
        t.count      += 1;
        t.totalQty   += qty;
        t.totalSpend += amt;
    }

    // Compute derived fields
    for (const [, t] of Object.entries(trends)) {
        t.avg    = t.count > 0 ? t.sumRate / t.count : 0;
        t.min    = t.minRate === Infinity ? 0 : t.minRate;
        t.change = t.lastRate - t.firstRate;
        t.pct    = t.firstRate > 0 ? (t.change / t.firstRate) * 100 : 0;

        if      (t.pct >= 10)  { t.label = '📈 Rising';      t.cls = 't-rising';   }
        else if (t.pct > 3)    { t.label = '🔺 Slight Rise'; t.cls = 't-slight';   }
        else if (t.pct <= -10) { t.label = '📉 Dropping';    t.cls = 't-dropping'; }
        else if (t.pct < -3)   { t.label = '🔻 Falling';     t.cls = 't-falling';  }
        else                   { t.label = '🟢 Stable';       t.cls = 't-stable';   }
    }

    state.trends          = trends;
    state.purchasesByItem = byItem;
    state.items           = [...itemsSet].sort();
    state.categories      = [...catsSet].sort();
}

// ── Populate dropdowns ────────────────────────────────────────────────────────
function populateFilters(container) {
    const itemSel  = container.querySelector('#trend-item-select');
    const catSel   = container.querySelector('#trend-cat-filter');

    itemSel.innerHTML = '<option value="">— Select item for chart —</option>' +
        state.items.map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');

    catSel.innerHTML = '<option value="">All Categories</option>' +
        state.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

// ── Render summary table with expandable rows ─────────────────────────────────
function renderTrendTable(container) {
    const search  = (container.querySelector('#trend-search')?.value || '').toLowerCase();
    const catF    = container.querySelector('#trend-cat-filter')?.value || '';
    const sortBy  = container.querySelector('#trend-sort')?.value || 'name';

    let entries = Object.entries(state.trends).filter(([item, t]) =>
        item.toLowerCase().includes(search) && (!catF || t.category === catF)
    );

    // Sort
    entries.sort((a, b) => {
        if (sortBy === 'change_desc') return b[1].pct - a[1].pct;
        if (sortBy === 'change_asc')  return a[1].pct - b[1].pct;
        if (sortBy === 'spend_desc')  return b[1].totalSpend - a[1].totalSpend;
        return a[0].localeCompare(b[0]);
    });

    const tbody = container.querySelector('#trend-summary-body');
    if (!tbody) return;

    if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-muted);">No items found</td></tr>`;
        return;
    }

    const rows = [];

    for (const [item, t] of entries) {
        const isExpanded = expandedItems.has(item);
        const changeColor = t.change > 0 ? 'var(--danger)' : t.change < 0 ? 'var(--success)' : 'var(--text-muted)';
        const purchases   = state.purchasesByItem[item] || [];

        // ── Main row ──────────────────────────────────────────────────────
        rows.push(`
            <tr class="trend-item-row" data-item="${escapeHtml(item)}"
                style="cursor:pointer; transition:background .15s;"
                onmouseover="this.style.background='var(--bg-main)'"
                onmouseout="this.style.background=''">
                <td style="text-align:center; color:var(--text-muted); font-size:12px;">
                    ${isExpanded ? '▼' : '▶'}
                </td>
                <td><strong>${escapeHtml(item)}</strong></td>
                <td><span class="badge ${catClass(t.category)}">${escapeHtml(t.category)}</span></td>
                <td style="text-align:right;">₹${t.firstRate.toFixed(2)}</td>
                <td style="text-align:right; font-weight:600;">₹${t.lastRate.toFixed(2)}</td>
                <td style="text-align:right; color:${changeColor}; font-weight:600;">
                    ${t.change > 0 ? '+' : ''}₹${t.change.toFixed(2)}
                </td>
                <td style="text-align:right;" class="${t.cls}">
                    ${t.pct !== 0 ? (t.pct > 0 ? '+' : '') + t.pct.toFixed(1) + '%' : '—'}
                </td>
                <td class="${t.cls}">${t.label}</td>
                <td style="text-align:right;">₹${t.avg.toFixed(2)}</td>
                <td style="text-align:right;">${t.totalQty.toFixed(1)} ${t.unit}</td>
                <td style="text-align:right; font-weight:600;">₹${t.totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
            </tr>`);

        // ── Expanded purchase history ─────────────────────────────────────
        if (isExpanded) {
            rows.push(`
                <tr class="trend-detail-row">
                    <td colspan="11" style="padding:0; background:var(--bg-main);">
                        <div style="padding:8px 16px 12px 40px;">
                            <div style="font-size:11px; font-weight:600; color:var(--text-muted);
                                        text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px;">
                                Price History — ${escapeHtml(item)}
                                (${purchases.length} purchase${purchases.length !== 1 ? 's' : ''})
                            </div>
                            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                                <thead>
                                    <tr style="color:var(--text-muted); font-size:11px;
                                               text-transform:uppercase; letter-spacing:.4px;">
                                        <th style="padding:4px 10px; text-align:left;
                                                   border-bottom:1px solid var(--border-color);">Date</th>
                                        <th style="padding:4px 10px; text-align:right;
                                                   border-bottom:1px solid var(--border-color);">Rate ₹</th>
                                        <th style="padding:4px 10px; text-align:right;
                                                   border-bottom:1px solid var(--border-color);">Qty</th>
                                        <th style="padding:4px 10px; text-align:left;
                                                   border-bottom:1px solid var(--border-color);">Supplier</th>
                                        <th style="padding:4px 10px; text-align:right;
                                                   border-bottom:1px solid var(--border-color);">Amount ₹</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${purchases.map((p, idx) => {
                                        // Highlight rate change vs previous purchase
                                        const prev = idx > 0 ? purchases[idx - 1].rate : null;
                                        const rateColor = prev === null ? '' :
                                            p.rate > prev ? 'color:var(--danger);' :
                                            p.rate < prev ? 'color:var(--success);' : '';
                                        const rateChange = prev !== null && prev > 0 ?
                                            ` <span style="font-size:10px; ${rateColor}">
                                                ${p.rate > prev ? '▲' : p.rate < prev ? '▼' : ''}
                                                ${Math.abs(((p.rate - prev) / prev) * 100).toFixed(1)}%
                                              </span>` : '';

                                        return `<tr style="border-bottom:1px solid var(--border-color);">
                                            <td style="padding:5px 10px; color:var(--text-secondary);">
                                                ${escapeHtml(p.date)}
                                            </td>
                                            <td style="padding:5px 10px; text-align:right;
                                                       font-weight:600; ${rateColor}">
                                                ₹${p.rate.toFixed(2)}${rateChange}
                                            </td>
                                            <td style="padding:5px 10px; text-align:right;">
                                                ${p.qty.toFixed(1)} ${escapeHtml(p.unit)}
                                            </td>
                                            <td style="padding:5px 10px; color:var(--text-secondary);">
                                                ${escapeHtml(p.supplier || '—')}
                                            </td>
                                            <td style="padding:5px 10px; text-align:right; font-weight:600;">
                                                ₹${p.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>`);
        }
    }

    tbody.innerHTML = rows.join('');
}

// ── Render chart for selected item ────────────────────────────────────────────
async function renderChart(container) {
    const item   = container.querySelector('#trend-item-select')?.value;
    const canvas = container.querySelector('#trend-item-chart');
    if (!canvas) return;

    const curEl   = container.querySelector('#trend-current');
    const avgEl   = container.querySelector('#trend-average');
    const lowEl   = container.querySelector('#trend-lowest');
    const trendEl = container.querySelector('#trend-trend');
    const subEl   = container.querySelector('#trend-chart-sub');

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    if (!item) {
        [curEl, avgEl, lowEl, trendEl].forEach(el => { if (el) el.textContent = '—'; });
        if (subEl) subEl.textContent = 'Select an item above to view its price chart';
        return;
    }

    const t = state.trends[item];
    if (!t) return;

    // Update stat cards
    if (curEl)   curEl.textContent   = '₹' + t.lastRate.toFixed(2);
    if (avgEl)   avgEl.textContent   = '₹' + t.avg.toFixed(2);
    if (lowEl)   lowEl.textContent   = '₹' + t.min.toFixed(2);
    if (trendEl) { trendEl.textContent = t.label; trendEl.className = 'stat-value ' + t.cls; }

    // Use stored purchases for chart
    const purchases = state.purchasesByItem[item] || [];
    if (subEl) subEl.textContent = `${item} — ${purchases.length} purchase${purchases.length !== 1 ? 's' : ''} recorded`;

    const labels = purchases.map(p => p.date);
    const values = purchases.map(p => p.rate);
    const isRising = t.pct >= 0;

    chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Rate ₹',
                data:  values,
                borderColor:     isRising ? '#e74c3c' : '#27ae60',
                backgroundColor: isRising ? 'rgba(231,76,60,0.08)' : 'rgba(39,174,96,0.08)',
                fill:       true,
                tension:    0.3,
                pointRadius: 5,
                pointHoverRadius: 7,
                spanGaps:   true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₹${ctx.parsed.y.toFixed(2)}`,
                        afterLabel: ctx => {
                            const p = purchases[ctx.dataIndex];
                            return p ? ` Qty: ${p.qty} ${p.unit}  |  ${p.supplier}` : '';
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: false, ticks: { callback: v => '₹' + v } },
                x: { ticks: { maxRotation: 45, minRotation: 0 } }
            }
        }
    });
}
