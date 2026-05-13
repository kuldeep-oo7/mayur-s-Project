import { api } from '../api.js';

export default async function renderExport() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <h2 class="page-title">Export Data</h2>
                <p class="page-sub">Download your purchase data as Excel workbook with multiple sheets</p>
            </div>
        </div>

        <div class="card mb-4">
            <h3 class="card-title">Export Options</h3>
            <p class="card-sub mb-3">The exported workbook contains 5 sheets covering all aspects of your data</p>

            <div class="grid-2 gap-4 mb-4">
                <div class="p-3" style="background:var(--bg-main); border-radius:var(--radius-sm);">
                    <strong style="color:var(--primary);">Sheet 1 — Purchase Log</strong>
                    <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">All individual purchase entries with date, supplier, item, qty, rate, amount</div>
                </div>
                <div class="p-3" style="background:var(--bg-main); border-radius:var(--radius-sm);">
                    <strong style="color:var(--primary);">Sheet 2 — Item Price Summary</strong>
                    <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Each item with its rate by date, average rate, total qty, total spend, and trend</div>
                </div>
                <div class="p-3" style="background:var(--bg-main); border-radius:var(--radius-sm);">
                    <strong style="color:var(--primary);">Sheet 3 — Period Comparison</strong>
                    <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Side-by-side rate comparison across all dates for quick analysis</div>
                </div>
                <div class="p-3" style="background:var(--bg-main); border-radius:var(--radius-sm);">
                    <strong style="color:var(--primary);">Sheet 4 — Monthly Spend</strong>
                    <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Aggregated spend per item per month with trend indicators</div>
                </div>
                <div class="p-3" style="background:var(--bg-main); border-radius:var(--radius-sm);">
                    <strong style="color:var(--primary);">Sheet 5 — Spending Summary</strong>
                    <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Category breakdown, supplier breakdown, and top 10 items by spend</div>
                </div>
            </div>

            <div class="flex gap-3">
                <button class="btn btn-primary" id="btn-export-workbook">
                    <i data-lucide="download" style="width:16px"></i> Download Excel Workbook
                </button>
                <button class="btn btn-outline" onclick="window.location.hash='#/records'">Back to Records</button>
            </div>
        </div>

        <div id="export-status"></div>
    `;

    container.querySelector('#btn-export-workbook').addEventListener('click', () => exportWorkbook(container));

    lucide.createIcons({ root: container });
    return container;
}

function getMonthKey(d) {
    if (!d) return '';
    const p = d.split('-');
    // ISO format: YYYY-MM-DD → month key YYYY-MM
    if (p.length === 3 && p[0].length === 4) return p[0] + '-' + p[1];
    return '';
}

async function exportWorkbook(container) {
    const statusEl = container.querySelector('#export-status');
    statusEl.innerHTML = '<div class="toast" style="position:static; margin-top:10px;">Preparing export… (this may take a moment)</div>';

    // Allow UI to update
    await new Promise(r => setTimeout(r, 100));

    try {
        const wb = XLSX.utils.book_new();
        const purchases = await api.getPurchases();

        if (!purchases.length) {
            statusEl.innerHTML = '<div class="toast err" style="position:static; margin-top:10px;">No data to export</div>';
            return;
        }

        // ─── Sheet 1: Purchase Log ────────────────────────────────────────
        const logData = purchases
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(p => ({
                Date: p.date || '',
                Supplier: p.supplierName || '',
                'Invoice No': p.invoiceNo || '',
                'Item (English)': p.item || '',
                Category: p.category || '',
                Unit: p.unit || '',
                Qty: p.quantity || 0,
                'Rate ₹': p.price || 0,
                'Amount ₹': p.finalAmount || p.total || 0
            }));
        const ws1 = XLSX.utils.json_to_sheet(logData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Purchase Log');

        // Prepare sorted unique dates and months
        const dates = [...new Set(purchases.map(p => p.date).filter(Boolean))]
            .sort();
        const months = [...new Set(purchases.map(p => getMonthKey(p.date)).filter(Boolean))]
            .sort();

        // Item trends
        const items = [...new Set(purchases.map(p => p.item).filter(Boolean))].sort();

        // ─── Sheet 2: Item Price Summary ──────────────────────────────────
        const trends = computeTrends(purchases);
        const s2header = ['Item','Category','Unit', ...dates.flatMap(d => [`Rate ${d}`, `Qty ${d}`]), 'Avg Rate ₹', 'Total Qty', 'Total Spend ₹', 'Trend', 'Δ%'];
        const s2rows = items.map(item => {
            const t = trends[item] || {};
            const dateVals = dates.map(d => {
                const recs = purchases.filter(p => p.item === item && p.date === d);
                if (!recs.length) return ['', ''];
                const avgRate = recs.reduce((s, r) => s + (+r.price || 0), 0) / recs.length;
                const totalQty = recs.reduce((s, r) => s + (+r.quantity || 0), 0);
                return [avgRate.toFixed(2), totalQty.toFixed(2)];
            }).flat();
            return [
                item,
                t.category || '',
                t.unit || '',
                ...dateVals,
                (t.avg || 0).toFixed(2),
                (t.totalQty || 0).toFixed(2),
                (t.totalSpend || 0).toFixed(0),
                t.label || '',
                t.pct ? (t.pct > 0 ? '+' : '') + t.pct.toFixed(1) + '%' : ''
            ];
        });
        const ws2 = XLSX.utils.aoa_to_sheet([s2header, ...s2rows]);
        XLSX.utils.book_append_sheet(wb, ws2, 'Item Price Summary');

        // ─── Sheet 3: Period Comparison ───────────────────────────────────
        const s3header = ['Item','Category', ...dates, 'Avg Rate ₹', 'Trend', 'Δ%'];
        const s3rows = items.map(item => {
            const t = trends[item] || {};
            const rateCells = dates.map(d => {
                const recs = purchases.filter(p => p.item === item && p.date === d);
                if (!recs.length) return '—';
                const avg = recs.reduce((s, r) => s + (+r.price || 0), 0) / recs.length;
                return '₹' + avg.toFixed(2);
            });
            return [
                item,
                t.category || '',
                ...rateCells,
                (t.avg || 0).toFixed(2),
                t.label || '',
                t.pct ? (t.pct > 0 ? '+' : '') + t.pct.toFixed(1) + '%' : ''
            ];
        });
        const ws3 = XLSX.utils.aoa_to_sheet([s3header, ...s3rows]);
        XLSX.utils.book_append_sheet(wb, ws3, 'Period Comparison');

        // ─── Sheet 4: Monthly Spend Report ────────────────────────────────
        const s4header = ['Item','Category','Month','Suppliers','Avg Rate ₹','Total Qty','Total Spend ₹','Trend'];
        const s4rows = [];
        items.forEach(item => {
            const t = trends[item] || {};
            months.forEach(mo => {
                const recs = purchases.filter(p => p.item === item && getMonthKey(p.date) === mo);
                if (!recs.length) return;
                const avg = recs.reduce((s, r) => s + (+r.price || 0), 0) / recs.length;
                const qty = recs.reduce((s, r) => s + (+r.quantity || 0), 0);
                const amt = recs.reduce((s, r) => s + (+r.finalAmount || +r.total || 0), 0);
                const sups = [...new Set(recs.map(r => r.supplierName).filter(Boolean))].join(', ');
                s4rows.push([item, recs[0]?.category || '', formatMonth(mo), sups, avg.toFixed(2), qty.toFixed(2), amt.toFixed(0), t.label || '']);
            });
        });
        const ws4 = XLSX.utils.aoa_to_sheet([s4header, ...s4rows]);
        XLSX.utils.book_append_sheet(wb, ws4, 'Monthly Spend Report');

        // ─── Sheet 5: Spending Summary ────────────────────────────────────
        const totalSpend = purchases.reduce((s, p) => s + (+p.finalAmount || +p.total || 0), 0);
        const catAcc = {}, supAcc = {};
        purchases.forEach(p => {
            const cat = p.category || 'Other';
            catAcc[cat] = (catAcc[cat] || 0) + (+p.finalAmount || +p.total || 0);
            if (p.supplierName) supAcc[p.supplierName] = (supAcc[p.supplierName] || 0) + (+p.finalAmount || +p.total || 0);
        });
        const s5 = [
            ['CATEGORY BREAKDOWN'],
            ['Category', 'Total Spend ₹', '% of Budget'],
            ...Object.entries(catAcc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v.toFixed(0), (v / totalSpend * 100).toFixed(1) + '%']),
            [],
            ['SUPPLIER BREAKDOWN'],
            ['Supplier', 'Total Spend ₹', '% of Budget'],
            ...Object.entries(supAcc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v.toFixed(0), (v / totalSpend * 100).toFixed(1) + '%']),
            [],
            ['TOP 10 ITEMS BY SPEND'],
            ['Item', 'Category', 'Total Qty', 'Avg Rate ₹', 'Total Spend ₹', '% of Budget', 'Trend'],
            ...Object.entries(trends)
                .sort((a, b) => b[1].totalSpend - a[1].totalSpend)
                .slice(0, 10)
                .map(([item, t]) => [
                    item,
                    t.category || '',
                    (t.totalQty || 0).toFixed(2),
                    (t.avg || 0).toFixed(2),
                    (t.totalSpend || 0).toFixed(0),
                    (t.totalSpend / totalSpend * 100).toFixed(1) + '%',
                    t.label || ''
                ])
        ];
        const ws5 = XLSX.utils.aoa_to_sheet(s5);
        XLSX.utils.book_append_sheet(wb, ws5, 'Spending Summary');

        // Write file
        const today = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `CanteenDashboard_Export_${today}.xlsx`);

        statusEl.innerHTML = '<div class="toast ok" style="position:static; margin-top:10px;">✓ Export complete! Check your Downloads folder.</div>';
    } catch (err) {
        console.error(err);
        statusEl.innerHTML = '<div class="toast err" style="position:static; margin-top:10px;">Export failed: ' + err.message + '</div>';
    }
}

function computeTrends(purchases) {
    const trends = {};
    const items = [...new Set(purchases.map(p => p.item).filter(Boolean))];

    items.forEach(item => {
        const rows = purchases
            .filter(p => p.item === item)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!rows.length) return;
        const rates = rows.map(r => +r.price || 0).filter(v => v > 0);
        if (!rates.length) return;
        const first = rates[rates.length - 1];
        const last = rates[0];
        const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
        const min = Math.min(...rates);
        const qtyTotal = rows.reduce((s, r) => s + (+r.quantity || 0), 0);
        const amtTotal = rows.reduce((s, r) => s + (+r.finalAmount || +r.total || 0), 0);
        const pct = first > 0 ? ((last - first) / first) * 100 : 0;

        let label, cls;
        if (pct >= 10) { label = '📈 Rising'; cls = 't-rising'; }
        else if (pct > 3) { label = '🔺 Slight Rise'; cls = 't-slight'; }
        else if (pct <= -10) { label = '📉 Dropping'; cls = 't-dropping'; }
        else if (pct < -3) { label = '🔻 Falling'; cls = 't-falling'; }
        else { label = '🟢 Stable'; cls = 't-stable'; }

        trends[item] = {
            first, last, pct, avg, min,
            label, cls,
            totalQty: qtyTotal,
            totalSpend: amtTotal,
            category: rows[0].category || '',
            unit: rows[0].unit || ''
        };
    });

    return trends;
}

function formatMonth(yyyy_mm) {
    if (!yyyy_mm) return '';
    const parts = yyyy_mm.split('-');
    if (parts.length !== 2) return yyyy_mm;
    const [yyyy, mm] = parts;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const idx = parseInt(mm) - 1;
    return (idx >= 0 && idx < 12) ? `${months[idx]} ${yyyy}` : yyyy_mm;
}
