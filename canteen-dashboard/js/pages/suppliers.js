import { api } from '../api.js';
import { catClass, escapeHtml } from '../utils.js';

// Local state to cache data and avoid re-fetching on every keystroke
const state = {
    purchases: [],
    suppliers: [],
    items: [],
    itemRates: {} // Pre-calculated best rates
};

export default async function renderSuppliers() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <h2 class="page-title">Supplier Comparison</h2>
                <p class="page-sub">Compare rates and spending across vendors</p>
            </div>
        </div>

        <!-- Supplier cards -->
        <div class="mb-4">
            <div id="supplier-cards" class="sup-grid"></div>
        </div>

        <!-- Rate comparison table -->
        <div class="card">
            <div class="flex justify-between items-center mb-3">
                <h3 class="card-title mb-0">Item-wise Rate by Supplier</h3>
                <input type="text" id="sup-search" placeholder="Filter items…"
                       class="form-control" style="width:180px; font-size:13px; padding:6px 10px;">
            </div>
            <p class="card-sub mb-3">Green highlight = cheapest rate for that item (using most recent purchase)</p>
            <div class="table-container">
                <table class="table">
                    <thead id="supplier-head">
                        <!-- header injected dynamically -->
                    </thead>
                    <tbody id="supplier-body"></tbody>
                </table>
            </div>
        </div>
    `;

    // Bind event listener properly
    const searchInput = container.querySelector('#sup-search');
    searchInput.addEventListener('input', (e) => renderTableBody(container, e.target.value));

    await fetchData();
    renderSupplierCards(container);
    renderTableHeader(container);
    renderTableBody(container);

    lucide.createIcons({ root: container });
    return container;
}

async function fetchData() {
    try {
        const allPurchases = await api.getPurchases();
        
        state.purchases = allPurchases
            .filter(p => p.date && (p.supplierName || p.vendorId) && p.item)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        state.suppliers = [...new Set(state.purchases.map(p => p.supplierName))].filter(Boolean).sort();
        state.items = [...new Set(state.purchases.map(p => p.item))].filter(Boolean).sort();

        state.itemRates = {};
        for (const p of state.purchases) {
            if (!state.itemRates[p.item]) {
                state.itemRates[p.item] = { category: p.category || '', rates: {} };
            }
            if (state.itemRates[p.item].rates[p.supplierName] === undefined) {
                state.itemRates[p.item].rates[p.supplierName] = +p.price || 0;
            }
        }
    } catch (err) {
        console.error("Suppliers data fetch failed:", err);
    }
}

function renderSupplierCards(container) {
    const cardsEl = container.querySelector('#supplier-cards');
    if (!cardsEl) return;
    if (!state.purchases.length) {
        cardsEl.innerHTML = '<div class="empty" style="padding:20px; color:var(--text-muted);">No supplier data yet</div>';
        return;
    }

    const spendBySupplier = {};
    state.purchases.forEach(p => {
        const s = p.supplierName || 'Unknown';
        spendBySupplier[s] = (spendBySupplier[s] || 0) + (+p.finalAmount || +p.total || 0);
    });

    const maxSpend = Math.max(...Object.values(spendBySupplier), 1);

    cardsEl.innerHTML = state.suppliers.map(sup => {
        const spend = spendBySupplier[sup] || 0;
        const itemsCount = new Set(state.purchases.filter(p => p.supplierName === sup).map(p => p.item)).size;
        const purchaseCount = state.purchases.filter(p => p.supplierName === sup).length;
        const pct = ((spend / maxSpend) * 100).toFixed(0);

        return `
            <div class="sup-card">
                <div class="sup-name">${escapeHtml(sup)}</div>
                <div class="sup-meta">${itemsCount} item${itemsCount !== 1 ? 's' : ''} · ${purchaseCount} purchase${purchaseCount !== 1 ? 's' : ''}</div>
                <div class="sup-total">₹${spend.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
            </div>
        `;
    }).join('');
}

function renderTableHeader(container) {
    const thead = container.querySelector('#supplier-head');
    if (!thead || !state.suppliers.length) return;

    thead.innerHTML = `
        <tr>
            <th>Item</th>
            <th>Category</th>
            ${state.suppliers.map(s => `<th title="${escapeHtml(s)}">${s.length > 15 ? s.slice(0, 14) + '…' : s}</th>`).join('')}
            <th style="position:sticky; right:0; background:var(--bg-card); z-index:1;">Best Price</th>
        </tr>
    `;
}

function renderTableBody(container, searchQuery = '') {
    const tbody = container.querySelector('#supplier-body');
    if (!tbody) return;
    
    if (!state.purchases.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No data to compare</td></tr>';
        return;
    }

    const search = searchQuery.toLowerCase().trim();
    const filteredItems = state.items.filter(i => i.toLowerCase().includes(search));

    tbody.innerHTML = filteredItems.map(item => {
        const itemData = state.itemRates[item];
        const category = itemData.category;
        
        const supRates = state.suppliers.map(sup => {
            const rate = itemData.rates[sup];
            return rate !== undefined ? rate : null;
        });

        const validRates = supRates.filter(v => v !== null);
        const minRate = validRates.length ? Math.min(...validRates) : null;

        const cells = supRates.map(v => {
            if (v === null) return '<td class="dim" style="color:var(--text-muted);">—</td>';
            const isBest = v === minRate;
            return `<td style="${isBest ? 'color:var(--success); font-weight:600;' : ''}">₹${v.toFixed(2)}${isBest ? ' ✓' : ''}</td>`;
        }).join('');

        const bestCell = minRate !== null
            ? `<td style="color:var(--success); font-weight:600;">₹${minRate.toFixed(2)}</td>`
            : '<td>—</td>';

        return `
            <tr>
                <td><strong>${escapeHtml(item)}</strong></td>
                <td><span class="badge ${catClass(category)}">${escapeHtml(category)}</span></td>
                ${cells}
                ${bestCell}
            </tr>
        `;
    }).join('');
}
