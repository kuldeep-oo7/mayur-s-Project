import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export default async function renderRecords() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <div class="page-title">Purchase Records</div>
                <div class="page-sub">Browse, search and manage all purchase entries</div>
            </div>
        </div>

        <div class="filter-bar">
            <div class="form-group" style="min-width:180px;">
                <label class="form-label">Month</label>
                <input type="month" id="filter-month" class="form-control">
            </div>
            <div class="form-group" style="min-width:160px;">
                <label class="form-label">Vendor</label>
                <select id="filter-vendor" class="form-control">
                    <option value="">All Vendors</option>
                </select>
            </div>
            <div class="form-group" style="flex:1; min-width:200px;">
                <label class="form-label">Search</label>
                <div style="position:relative;">
                    <i data-lucide="search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--text-muted);pointer-events:none;"></i>
                    <input type="text" id="filter-search" class="form-control" placeholder="Item, vendor, bill no…" style="padding-left:34px;">
                </div>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" id="btn-clear-filters">
                    <i data-lucide="x"></i> Clear
                </button>
            </div>
        </div>

        <div class="card" style="padding:0; overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-color);">
                <span id="records-count" style="font-size:0.875rem;color:var(--text-muted);">Loading…</span>
                <button class="btn btn-outline" id="btn-load-more" style="display:none;">
                    <i data-lucide="chevrons-down"></i> Load More
                </button>
            </div>
            <div class="table-container">
                <table class="table" id="records-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Bill No.</th>
                            <th>Vendor</th>
                            <th>Item (Category)</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Total</th>
                            <th>GST</th>
                            <th>IGST</th>
                            <th>Final</th>
                            <th>By</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="records-body">
                        <tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">Loading…</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const tbody        = container.querySelector('#records-body');
    const monthFilter  = container.querySelector('#filter-month');
    const vendorFilter = container.querySelector('#filter-vendor');
    const searchInput  = container.querySelector('#filter-search');
    const clearBtn     = container.querySelector('#btn-clear-filters');
    const loadMoreBtn  = container.querySelector('#btn-load-more');
    const countEl      = container.querySelector('#records-count');

    let currentPage  = 1;
    const PAGE_SIZE  = 50;
    let allRows      = [];   // all fetched rows for current filter set
    let vendorsMap   = {};
    let itemsMap     = {};
    let categoriesMap = {};
    let usersMap     = {};

    // Default to the most recent month that has data (not calendar today)
    const now = new Date();
    const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    try {
        const months = await api.getAvailableMonths();
        monthFilter.value = months?.length ? months[0] : fallbackMonth;
    } catch {
        monthFilter.value = fallbackMonth;
    }

    // ── Render ──────────────────────────────────────────────────────────────
    const renderRows = () => {
        const q = searchInput.value.trim().toLowerCase();
        const filtered = q
            ? allRows.filter(p => {
                const vendor   = (p.supplierName || vendorsMap[p.vendorId]?.name || '').toLowerCase();
                const item     = (p.item || itemsMap[p.itemId]?.name || '').toLowerCase();
                const billNo   = (p.invoiceNo || '').toLowerCase();
                const category = (p.category || '').toLowerCase();
                return vendor.includes(q) || item.includes(q) || billNo.includes(q) || category.includes(q);
            })
            : allRows;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">
                ${q ? `No records matching "<strong>${escapeHtml(q)}</strong>"` : 'No records found for this period.'}
            </td></tr>`;
            countEl.textContent = '0 records';
            return;
        }

        countEl.textContent = q
            ? `${filtered.length} of ${allRows.length} records`
            : `${allRows.length} record${allRows.length !== 1 ? 's' : ''}`;

        tbody.innerHTML = filtered.map(p => {
            const vendor   = escapeHtml(p.supplierName || vendorsMap[p.vendorId]?.name || '—');
            const item     = escapeHtml(p.item || itemsMap[p.itemId]?.name || '—');
            const category = escapeHtml(p.category || categoriesMap[p.categoryId]?.name || '—');
            const unit     = escapeHtml(p.unit || 'pcs');
            const enteredBy = escapeHtml(usersMap[p.userId]?.username || (p.userId === 1 ? 'admin' : 'staff'));

            return `<tr>
                <td style="white-space:nowrap;">${escapeHtml(p.date)}</td>
                <td style="color:var(--text-muted);">${escapeHtml(p.invoiceNo || '—')}</td>
                <td>${vendor}</td>
                <td>${item} <small class="text-muted">(${category})</small></td>
                <td>${escapeHtml(String(p.quantity))} <small class="text-muted">${unit}</small></td>
                <td>₹${(p.price || 0).toFixed(2)}</td>
                <td>₹${(p.total || 0).toFixed(2)}</td>
                <td style="color:var(--text-muted);">₹${(p.gst || 0).toFixed(2)}</td>
                <td style="color:var(--text-muted);">₹${(p.igst || 0).toFixed(2)}</td>
                <td><strong>₹${(p.finalAmount || p.total || 0).toFixed(2)}</strong></td>
                <td><span class="badge" style="background:var(--bg-main);color:var(--text-secondary);">${enteredBy}</span></td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-ghost delete-btn" style="padding:4px 8px;color:var(--danger);" data-id="${p.id}" title="Delete">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        lucide.createIcons({ root: tbody });
    };

    // ── Fetch ───────────────────────────────────────────────────────────────
    const fetchAndRender = async (append = false) => {
        if (!append) {
            currentPage = 1;
            allRows = [];
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">Loading…</td></tr>`;
            loadMoreBtn.style.display = 'none';
            countEl.textContent = 'Loading…';
        }

        try {
            const purchases = await api.getPurchases({
                month:    monthFilter.value,
                vendorId: vendorFilter.value,
                page:     currentPage,
                limit:    PAGE_SIZE
            });

            allRows = append ? [...allRows, ...purchases] : purchases;
            loadMoreBtn.style.display = purchases.length === PAGE_SIZE ? 'inline-flex' : 'none';
            renderRows();
        } catch (err) {
            console.error('Fetch error:', err);
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--danger);">Error loading records.</td></tr>`;
            countEl.textContent = '';
        }
    };

    // ── Init data ───────────────────────────────────────────────────────────
    const initData = async () => {
        try {
            const [v, i, c, u] = await Promise.all([
                api.getVendors(),
                api.getItems(),
                api.getCategories(),
                api.getUsers().catch(() => [])   // admin-only, may fail for staff
            ]);

            v.forEach(x => vendorsMap[x.id]    = x);
            i.forEach(x => itemsMap[x.id]      = x);
            c.forEach(x => categoriesMap[x.id] = x);
            u.forEach(x => usersMap[x.id]      = x);

            vendorFilter.innerHTML = '<option value="">All Vendors</option>'
                + v.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');

            await fetchAndRender();
        } catch (err) {
            console.error('Failed to load metadata:', err);
            window.showToast('Failed to connect to backend', 'error');
        }
    };

    // ── Events ──────────────────────────────────────────────────────────────
    monthFilter.addEventListener('change',  () => fetchAndRender(false));
    vendorFilter.addEventListener('change', () => fetchAndRender(false));

    let searchDebounce;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(renderRows, 180);
    });

    loadMoreBtn.addEventListener('click', () => {
        currentPage++;
        fetchAndRender(true);
    });

    clearBtn.addEventListener('click', () => {
        monthFilter.value  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        vendorFilter.value = '';
        searchInput.value  = '';
        fetchAndRender(false);
    });

    container.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (!deleteBtn) return;
        if (!confirm('Delete this record?')) return;

        try {
            await api.deletePurchase(deleteBtn.dataset.id);
            window.showToast('Record deleted', 'success');
            allRows = allRows.filter(r => String(r.id) !== deleteBtn.dataset.id);
            renderRows();
        } catch (err) {
            window.showToast('Delete failed: ' + err.message, 'error');
        }
    });

    initData();
    return container;
}
