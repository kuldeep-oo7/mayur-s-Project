import { api } from '../api.js';
import { catClass, escapeHtml } from '../utils.js';

export default async function renderSpending() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <h2 class="page-title">Spending Summary</h2>
                <p class="page-sub">Where your budget goes across categories and suppliers</p>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <label style="font-size:13px;color:var(--text-secondary);font-weight:500;">Period:</label>
                <select id="spend-month" class="form-control" style="width:160px;font-size:13px;">
                    <option value="">All Time</option>
                </select>
            </div>
        </div>

        <div class="grid-2 mb-4">
            <div class="card">
                <h3 class="card-title">By Category</h3>
                <p class="card-sub">Spend distribution across categories</p>
                <div class="chart-container" style="height:260px;">
                    <canvas id="spend-cat-chart"></canvas>
                </div>
            </div>
            <div class="card">
                <h3 class="card-title">By Supplier</h3>
                <p class="card-sub">Spend distribution across vendors</p>
                <div class="chart-container" style="height:260px;">
                    <canvas id="spend-sup-chart"></canvas>
                </div>
            </div>
        </div>

        <div class="card">
            <h3 class="card-title mb-3">Top 10 Items by Spend</h3>
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Total Qty</th>
                            <th>Avg Rate ₹</th>
                            <th>Total Spend ₹</th>
                            <th>% of Budget</th>
                            <th>Trend</th>
                        </tr>
                    </thead>
                    <tbody id="top10-body"></tbody>
                </table>
            </div>
        </div>
    `;

    // Populate month dropdown
    const monthSel = container.querySelector('#spend-month');
    try {
        const months = await api.getAvailableMonths();
        const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        months.forEach((m, i) => {
            const [y, mo] = m.split('-');
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = `${MONTH_NAMES[parseInt(mo)-1]} ${y}`;
            if (i === 0) opt.selected = true;
            monthSel.appendChild(opt);
        });
    } catch { /* keep "All Time" default */ }

    monthSel.addEventListener('change', () => renderSpendingReport(container, monthSel.value || null));

    // Delay slightly so canvas elements are in DOM
    setTimeout(() => renderSpendingReport(container, monthSel.value || null), 50);
    lucide.createIcons({ root: container });
    return container;
}

let catChartInstance = null;
let supChartInstance = null;

async function renderSpendingReport(container, month) {
    try {
        const filters = month ? { month } : {};
        const purchases = await api.getPurchases(filters);
        const valid = purchases.filter(p => (+p.finalAmount || +p.total) && p.category && p.supplierName);

        const tbody = container.querySelector('#top10-body');
        if (!valid.length) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">No data yet</td></tr>';
            return;
        }

        const totalSpendAll = valid.reduce((s, p) => s + (+p.finalAmount || +p.total || 0), 0);

        // Category aggregation
        const catAcc = {};
        valid.forEach(p => {
            const cat = p.category || 'Other';
            catAcc[cat] = (catAcc[cat] || 0) + (+p.finalAmount || +p.total || 0);
        });

        // Supplier aggregation
        const supAcc = {};
        valid.forEach(p => {
            const sup = p.supplierName;
            if (sup) supAcc[sup] = (supAcc[sup] || 0) + (+p.finalAmount || +p.total || 0);
        });

        // Charts
        const catKeys = Object.keys(catAcc), catVals = Object.values(catAcc).map(v => Math.round(v));
        const supKeys = Object.keys(supAcc), supVals = Object.values(supAcc).map(v => Math.round(v));

        // Destroy existing charts
        if (catChartInstance) catChartInstance.destroy();
        if (supChartInstance) supChartInstance.destroy();

        const catCanvas = container.querySelector('#spend-cat-chart');
        const supCanvas = container.querySelector('#spend-sup-chart');

        if (catCanvas) {
            catChartInstance = new Chart(catCanvas, {
                type: 'doughnut',
                data: {
                    labels: catKeys,
                    datasets: [{ data: catVals, backgroundColor: ['#7ec845','#e8a020','#4094e8','#e86440','#c864c8'] }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }
            });
        }

        if (supCanvas) {
            supChartInstance = new Chart(supCanvas, {
                type: 'doughnut',
                data: {
                    labels: supKeys,
                    datasets: [{ data: supVals, backgroundColor: ['#7ec845','#e8a020','#4094e8','#e86440','#c864c8','#64c8a0'] }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }
            });
        }

        // Top 10 items
        const itemAgg = {};
        valid.forEach(p => {
            const key = p.item;
            if (!key) return;
            if (!itemAgg[key]) {
                itemAgg[key] = { qty: 0, spend: 0, rates: [], category: p.category, unit: p.unit };
            }
            itemAgg[key].qty += (+p.quantity || 0);
            itemAgg[key].spend += (+p.finalAmount || +p.total || 0);
            itemAgg[key].rates.push(+p.price || 0);
        });

        const top10 = Object.entries(itemAgg)
            .map(([item, data]) => ({
                item,
                category: data.category,
                unit: data.unit,
                qty: data.qty,
                avgRate: data.rates.length ? data.rates.reduce((s, v) => s + v, 0) / data.rates.length : 0,
                spend: data.spend,
                pct: (data.spend / totalSpendAll * 100)
            }))
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 10);

        // Compute trend labels
        const trends = computeTrends(valid);
        const computeTrendLabel = (item) => {
            const t = trends[item];
            if (!t) return '—';
            return `<span class="${t.cls}">${t.label}</span>`;
        };

        if (tbody) {
            tbody.innerHTML = top10.map(t => `
                <tr>
                    <td><strong>${escapeHtml(t.item)}</strong></td>
                    <td><span class="badge ${catClass(t.category)}">${escapeHtml(t.category)}</span></td>
                    <td>${t.qty.toFixed(1)} ${t.unit || ''}</td>
                    <td>₹${t.avgRate.toFixed(2)}</td>
                    <td>₹${t.spend.toFixed(0)}</td>
                    <td>${t.pct.toFixed(1)}%</td>
                    <td>${computeTrendLabel(t.item)}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error("Spending report failed:", err);
    }
}

function computeTrends(purchases) {
    const trends = {};
    const items = [...new Set(purchases.map(p => p.item).filter(Boolean))];
    items.forEach(item => {
        const rows = purchases.filter(p => p.item === item).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!rows.length) return;
        const rates = rows.map(r => +r.price || 0).filter(v => v > 0);
        if (!rates.length) return;
        const first = rates[rates.length - 1];
        const last = rates[0];
        const pct = first > 0 ? ((last - first) / first) * 100 : 0;
        let label, cls;
        if (pct >= 10) { label = '📈 Rising'; cls = 't-rising'; }
        else if (pct > 3) { label = '🔺 Slight Rise'; cls = 't-slight'; }
        else if (pct <= -10) { label = '📉 Dropping'; cls = 't-dropping'; }
        else if (pct < -3) { label = '🔻 Falling'; cls = 't-falling'; }
        else { label = '🟢 Stable'; cls = 't-stable'; }
        trends[item] = { label, cls };
    });
    return trends;
}
