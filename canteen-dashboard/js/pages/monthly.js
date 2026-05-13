import { api } from '../api.js';
import { formatMonth, getMonthKey, catClass, escapeHtml } from '../utils.js';

export default async function renderMonthly() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <h2 class="page-title">Monthly Report</h2>
                <p class="page-sub">Spend breakdown by month</p>
            </div>
            <div class="page-hdr-right">
                <select id="month-select" class="form-control" style="min-width:160px;">
                    <option value="">All Time</option>
                </select>
            </div>
        </div>

        <!-- Month stats -->
        <div class="grid-3 mb-4" id="month-stats-row"></div>

        <!-- Table -->
        <div class="card">
            <h3 class="card-title mb-3">Monthly Item Summary</h3>
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Total Qty</th>
                            <th>Avg Rate ₹</th>
                            <th>Total Spend ₹</th>
                            <th>Trend</th>
                        </tr>
                    </thead>
                    <tbody id="monthly-body"></tbody>
                </table>
            </div>
        </div>
    `;

    await populateMonthSelect(container);
    await renderMonthlyReport(container);

    // Bind month-select change to re-render with container
    const monthSel = container.querySelector('#month-select');
    if (monthSel) {
        monthSel.addEventListener('change', () => renderMonthlyReport(container));
    }

    lucide.createIcons({ root: container });
    return container;
}

async function populateMonthSelect(container) {
    const sel = container.querySelector('#month-select');
    if (!sel) return;
    try {
        const months = await api.getAvailableMonths();
        // Default to most recent month with data
        sel.innerHTML = '<option value="">All Time</option>' +
            months.map((m, i) => `<option value="${m}"${i===0?' selected':''}>${formatMonth(m)}</option>`).join('');
    } catch {
        sel.innerHTML = '<option value="">All Time</option>';
    }
}

async function renderMonthlyReport(container = document) {
    const selMonth = (container.querySelector('#month-select') || {}).value || '';
    
    try {
        const data = await api.getPurchases({ month: selMonth });

        const body = container.querySelector('#monthly-body');
        if (!body) return;

        if (!data.length) {
            body.innerHTML = '<tr><td colspan="6" class="text-center">No data for this period on server</td></tr>';
            return;
        }

    // Stats
    const totalSpend = data.reduce((s, p) => s + (+p.finalAmount || +p.total || 0), 0);
    const totalQty = data.reduce((s, p) => s + (+p.quantity || 0), 0);
    const uniqueItems = new Set(data.map(p => p.item)).size;

    const statsRow = container.querySelector('#month-stats-row');
    if (statsRow) {
        statsRow.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total Spend</div>
                <div class="stat-value green">₹${totalSpend.toLocaleString('en-IN', {maximumFractionDigits: 0})}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Qty</div>
                <div class="stat-value">${totalQty.toFixed(1)} units</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Unique Items</div>
                <div class="stat-value blue">${uniqueItems}</div>
            </div>
        `;
    }

    // Group by item
    const items = [...new Set(data.map(p => p.item))].sort();
    const trends = await computeTrends(data);

    body.innerHTML = items.map(item => {
        const rows = data.filter(p => p.item === item);
        const qty = rows.reduce((s, p) => s + (+p.quantity || 0), 0);
        const avgRate = rows.reduce((s, p) => s + (+p.price || 0), 0) / rows.length;
        const spend = rows.reduce((s, p) => s + (+p.finalAmount || +p.total || 0), 0);
        const t = trends[item];
        const cat = rows[0]?.category || '';
        const trendLabel = t ? `<span class="${t.cls}">${t.label}</span>` : '—';

        return `
            <tr>
                <td><strong>${escapeHtml(item)}</strong></td>
                <td><span class="badge ${catClass(cat)}">${escapeHtml(cat)}</span></td>
                <td>${qty.toFixed(1)} ${rows[0]?.unit || ''}</td>
                <td>₹${avgRate.toFixed(2)}</td>
                <td>₹${spend.toFixed(0)}</td>
                <td>${trendLabel}</td>
            </tr>
        `;
    }).join('');
    } catch (err) {
        console.error("Monthly report failed:", err);
        const errBody = container.querySelector('#monthly-body');
        if (errBody) errBody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--danger);">Error loading report from server</td></tr>';
    }
}

async function computeTrends(purchases) {
    const trends = {};
    const items = [...new Set(purchases.map(p => p.item).filter(Boolean))];

    items.forEach(item => {
        const rows = purchases.filter(p => p.item === item).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!rows.length) return;
        const rates = rows.map(r => +r.price || 0).filter(v => v > 0);
        if (!rates.length) return;
        const first = rates[rates.length - 1];
        const last = rates[0];
        const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
        const pct = first > 0 ? ((last - first) / first) * 100 : 0;
        let label, cls;
        if (pct >= 10) { label = '📈 Rising'; cls = 't-rising'; }
        else if (pct > 3) { label = '🔺 Slight Rise'; cls = 't-slight'; }
        else if (pct <= -10) { label = '📉 Dropping'; cls = 't-dropping'; }
        else if (pct < -3) { label = '🔻 Falling'; cls = 't-falling'; }
        else { label = '🟢 Stable'; cls = 't-stable'; }

        trends[item] = { label, cls, pct };
    });

    return trends;
}

window.renderMonthlyReport = renderMonthlyReport;
