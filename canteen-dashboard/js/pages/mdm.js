import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

// ── Confidence badge helper ───────────────────────────────────────────────────
function confBadge(score) {
    if (score >= 80) return `<span style="background:var(--success-light,#dcfce7);color:var(--success);font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">${score}%</span>`;
    if (score >= 50) return `<span style="background:#fef9c3;color:#854d0e;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">${score}%</span>`;
    return `<span style="background:#fee2e2;color:var(--danger);font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">${score}%</span>`;
}

function langBadge(lang) {
    const map = { gu: '🇮🇳 Gujarati', hi: '🇮🇳 Hindi', en: '🔤 English' };
    return `<span style="font-size:10px;background:var(--bg-main);border:1px solid var(--border-color);padding:1px 6px;border-radius:10px;">${map[lang] || lang}</span>`;
}

export default async function renderMDM() {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <div class="page-title">Item Master (MDM)</div>
                <div class="page-sub">Three-layer alias mapping: Golden Record → Translations → Vendor SKUs</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <button class="btn btn-outline btn-sm" id="btn-test-resolve">
                    <i data-lucide="search" style="width:14px;height:14px;"></i> Test Resolve
                </button>
                <button class="btn btn-primary btn-sm" id="btn-add-master">
                    <i data-lucide="plus" style="width:14px;height:14px;"></i> Add Item
                </button>
            </div>
        </div>

        <!-- Pending Approvals Banner -->
        <div id="pending-banner" style="display:none;" class="card" style="border-left:4px solid var(--warning);padding:16px 20px;margin-bottom:16px;">
        </div>

        <!-- Tab bar -->
        <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--border-color);padding-bottom:0;">
            <button class="mdm-tab active" data-tab="master"   style="padding:8px 18px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;border-bottom:2px solid var(--primary);margin-bottom:-2px;color:var(--primary);">Item Master</button>
            <button class="mdm-tab"        data-tab="aliases"  style="padding:8px 18px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-muted);">Aliases <span id="alias-count-badge"></span></button>
            <button class="mdm-tab"        data-tab="skumap"   style="padding:8px 18px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-muted);">Vendor SKU Map <span id="sku-count-badge"></span></button>
            <button class="mdm-tab"        data-tab="pending"  style="padding:8px 18px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-muted);">Pending <span id="pending-count-badge"></span></button>
        </div>

        <!-- ── Tab: Item Master ─────────────────────────────────────────────── -->
        <div id="tab-master">
            <div id="add-master-form" style="display:none;" class="card" style="margin-bottom:16px;padding:16px 20px;background:var(--bg-main);">
                <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
                    <div class="form-group" style="margin-bottom:0;min-width:200px;">
                        <label class="form-label">Standard Name (Golden Record)</label>
                        <input type="text" id="new-master-name" class="form-control" placeholder="e.g. Chili Powder">
                    </div>
                    <div class="form-group" style="margin-bottom:0;min-width:100px;">
                        <label class="form-label">Base Unit</label>
                        <select id="new-master-unit" class="form-control">
                            <option>KG</option><option>G</option><option>LITRE</option>
                            <option>PCS</option><option>PACK</option><option>BALE</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;min-width:160px;">
                        <label class="form-label">Category</label>
                        <input type="text" id="new-master-cat" class="form-control" placeholder="e.g. Spice" list="cat-datalist">
                        <datalist id="cat-datalist"></datalist>
                    </div>
                    <button class="btn btn-primary" id="btn-save-master">Save</button>
                    <button class="btn btn-ghost"   id="btn-cancel-master">Cancel</button>
                </div>
            </div>

            <div class="card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px;">
                    <input type="text" id="master-search" class="form-control" placeholder="Search items…" style="max-width:280px;">
                    <span id="master-total" style="font-size:12px;color:var(--text-muted);margin-left:auto;"></span>
                </div>
                <div id="master-table-wrap">
                    <div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>
                </div>
            </div>
        </div>

        <!-- ── Tab: Aliases ──────────────────────────────────────────────────── -->
        <div id="tab-aliases" style="display:none;">
            <div class="card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <input type="text" id="alias-search" class="form-control" placeholder="Filter aliases…" style="max-width:280px;">
                    <select id="alias-lang-filter" class="form-control" style="width:140px;">
                        <option value="">All Languages</option>
                        <option value="gu">Gujarati</option>
                        <option value="hi">Hindi</option>
                        <option value="en">English</option>
                    </select>
                    <span id="alias-total" style="font-size:12px;color:var(--text-muted);margin-left:auto;"></span>
                </div>
                <div id="alias-table-wrap">
                    <div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>
                </div>
            </div>
        </div>

        <!-- ── Tab: Vendor SKU Map ───────────────────────────────────────────── -->
        <div id="tab-skumap" style="display:none;">
            <div class="card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px;">
                    <input type="text" id="sku-search" class="form-control" placeholder="Search SKUs or vendors…" style="max-width:280px;">
                    <span id="sku-total" style="font-size:12px;color:var(--text-muted);margin-left:auto;"></span>
                </div>
                <div id="sku-table-wrap">
                    <div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>
                </div>
            </div>
        </div>

        <!-- ── Tab: Pending ──────────────────────────────────────────────────── -->
        <div id="tab-pending" style="display:none;">
            <div class="card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;gap:10px;">
                    <button class="btn btn-sm btn-outline pending-status-btn active" data-status="pending">Pending</button>
                    <button class="btn btn-sm btn-ghost   pending-status-btn"        data-status="approved">Approved</button>
                    <button class="btn btn-sm btn-ghost   pending-status-btn"        data-status="dismissed">Dismissed</button>
                </div>
                <div id="pending-table-wrap">
                    <div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>
                </div>
            </div>
        </div>

        <!-- Resolve test modal -->
        <div id="resolve-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:none;align-items:center;justify-content:center;">
            <div class="card" style="width:480px;max-width:95vw;padding:24px;">
                <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Test Item Resolution</h3>
                <div style="display:flex;gap:10px;margin-bottom:16px;">
                    <input type="text" id="resolve-input" class="form-control" placeholder="Type raw string (Gujarati or English)…" style="flex:1;">
                    <button class="btn btn-primary" id="btn-do-resolve">Resolve</button>
                </div>
                <div id="resolve-result" style="min-height:60px;font-size:13px;"></div>
                <div style="text-align:right;margin-top:16px;">
                    <button class="btn btn-ghost" id="btn-close-modal">Close</button>
                </div>
            </div>
        </div>
    `;

    // ── State ─────────────────────────────────────────────────────────────────
    let masterData = [], aliasData = [], skuData = [], vendorsList = [];
    let currentPendingStatus = 'pending';

    // ── Tab switching ─────────────────────────────────────────────────────────
    function activateTab(name) {
        container.querySelectorAll('.mdm-tab').forEach(btn => {
            const isActive = btn.dataset.tab === name;
            btn.classList.toggle('active', isActive);
            btn.style.color       = isActive ? 'var(--primary)' : 'var(--text-muted)';
            btn.style.fontWeight  = isActive ? '600' : '500';
            btn.style.borderBottom = isActive ? '2px solid var(--primary)' : '2px solid transparent';
        });
        ['master','aliases','skumap','pending'].forEach(t =>
            container.querySelector(`#tab-${t}`).style.display = t === name ? '' : 'none'
        );
        if (name === 'aliases')  renderAliasTable();
        if (name === 'skumap')   renderSkuTable();
        if (name === 'pending')  loadPending();
    }

    container.querySelectorAll('.mdm-tab').forEach(btn =>
        btn.addEventListener('click', () => activateTab(btn.dataset.tab))
    );

    // ── Load all data ─────────────────────────────────────────────────────────
    async function loadAll() {
        try {
            [masterData, aliasData, skuData, vendorsList] = await Promise.all([
                api.getMdmMaster(),
                api.getMdmAliases(),
                api.getMdmSkuMap(),
                api.getVendors(),
            ]);
            // populate category datalist
            const cats = [...new Set(masterData.map(m => m.category).filter(Boolean))];
            container.querySelector('#cat-datalist').innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');

            renderMasterTable();
            updateBadges();
            await loadPendingBanner();
        } catch (err) {
            container.querySelector('#master-table-wrap').innerHTML =
                `<div style="padding:24px;color:var(--danger);">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    function updateBadges() {
        const ac = aliasData.length;
        const sc = skuData.length;
        container.querySelector('#alias-count-badge').innerHTML  = ac ? `<span style="font-size:10px;background:var(--primary);color:#fff;border-radius:10px;padding:1px 6px;margin-left:4px;">${ac}</span>` : '';
        container.querySelector('#sku-count-badge').innerHTML    = sc ? `<span style="font-size:10px;background:var(--primary);color:#fff;border-radius:10px;padding:1px 6px;margin-left:4px;">${sc}</span>` : '';
    }

    async function loadPendingBanner() {
        try {
            const { count } = await api.getMdmPendingCount();
            const badge = container.querySelector('#pending-count-badge');
            badge.innerHTML = count
                ? `<span style="font-size:10px;background:var(--warning);color:#fff;border-radius:10px;padding:1px 6px;margin-left:4px;">${count}</span>`
                : '';
            const banner = container.querySelector('#pending-banner');
            if (count > 0) {
                banner.style.display = '';
                banner.style.cssText += ';border-left:4px solid var(--warning);';
                banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:12px;">
                        <i data-lucide="alert-triangle" style="width:20px;height:20px;color:var(--warning);flex-shrink:0;"></i>
                        <div>
                            <div style="font-weight:600;font-size:14px;">${count} OCR item${count>1?'s':''} awaiting review</div>
                            <div style="font-size:12px;color:var(--text-muted);">Nitinbhai — please map these unrecognised invoice items to their standard names.</div>
                        </div>
                        <button class="btn btn-warning btn-sm" style="margin-left:auto;" onclick="this.closest('.mdm-tab');document.querySelector('[data-tab=pending]').click();">
                            Review Now →
                        </button>
                    </div>`;
                lucide.createIcons({ root: banner });
            } else {
                banner.style.display = 'none';
            }
        } catch {}
    }

    // ── Item Master Table ─────────────────────────────────────────────────────
    function renderMasterTable(filter = '') {
        const q = filter.toLowerCase();
        const rows = masterData.filter(m =>
            !q || m.standard_name.toLowerCase().includes(q) || (m.category||'').toLowerCase().includes(q)
        );
        container.querySelector('#master-total').textContent = `${rows.length} of ${masterData.length} items`;

        if (!rows.length) {
            container.querySelector('#master-table-wrap').innerHTML =
                '<div style="padding:40px;text-align:center;color:var(--text-muted);">No items found.</div>';
            return;
        }

        container.querySelector('#master-table-wrap').innerHTML = `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Standard Name</th>
                            <th>Category</th>
                            <th style="width:70px;text-align:center;">Unit</th>
                            <th style="width:70px;text-align:center;">Aliases</th>
                            <th style="width:70px;text-align:center;">SKUs</th>
                            <th style="width:80px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(m => `
                        <tr>
                            <td><strong>${escapeHtml(m.standard_name)}</strong></td>
                            <td><span class="badge">${escapeHtml(m.category||'—')}</span></td>
                            <td style="text-align:center;font-size:12px;color:var(--text-muted);">${escapeHtml(m.base_unit)}</td>
                            <td style="text-align:center;">
                                <button class="btn btn-ghost btn-sm" data-action="aliases" data-id="${m.id}" style="font-size:11px;padding:2px 8px;">
                                    ${m.alias_count} →
                                </button>
                            </td>
                            <td style="text-align:center;">
                                <button class="btn btn-ghost btn-sm" data-action="skus" data-id="${m.id}" style="font-size:11px;padding:2px 8px;">
                                    ${m.sku_count} →
                                </button>
                            </td>
                            <td style="text-align:right;">
                                <button class="btn btn-ghost btn-sm delete-master-btn" data-id="${m.id}" style="color:var(--danger);padding:3px 7px;">
                                    <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        lucide.createIcons({ root: container.querySelector('#master-table-wrap') });

        container.querySelectorAll('[data-action="aliases"]').forEach(btn =>
            btn.addEventListener('click', () => {
                activateTab('aliases');
                container.querySelector('#alias-search').value = masterData.find(m => m.id == btn.dataset.id)?.standard_name || '';
                renderAliasTable(container.querySelector('#alias-search').value);
            })
        );
        container.querySelectorAll('[data-action="skus"]').forEach(btn =>
            btn.addEventListener('click', () => {
                activateTab('skumap');
                container.querySelector('#sku-search').value = masterData.find(m => m.id == btn.dataset.id)?.standard_name || '';
                renderSkuTable(container.querySelector('#sku-search').value);
            })
        );
        container.querySelectorAll('.delete-master-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this item master? All aliases and SKU mappings will also be removed.')) return;
                try {
                    await api.deleteMdmMaster(btn.dataset.id);
                    window.showToast('Item deleted');
                    await loadAll();
                } catch(e) { window.showToast('Delete failed: ' + e.message, 'error'); }
            })
        );
    }

    container.querySelector('#master-search').addEventListener('input', e => renderMasterTable(e.target.value));

    // ── Add Item Master ───────────────────────────────────────────────────────
    container.querySelector('#btn-add-master').addEventListener('click', () => {
        const f = container.querySelector('#add-master-form');
        f.style.display = f.style.display === 'none' ? '' : 'none';
        if (f.style.display !== 'none') container.querySelector('#new-master-name').focus();
    });
    container.querySelector('#btn-cancel-master').addEventListener('click', () => {
        container.querySelector('#add-master-form').style.display = 'none';
    });
    container.querySelector('#btn-save-master').addEventListener('click', async () => {
        const name = container.querySelector('#new-master-name').value.trim();
        const unit = container.querySelector('#new-master-unit').value;
        const cat  = container.querySelector('#new-master-cat').value.trim();
        if (!name) { window.showToast('Name required', 'error'); return; }
        try {
            await api.addMdmMaster({ standard_name: name, base_unit: unit, category: cat || null });
            window.showToast('Item master added');
            container.querySelector('#new-master-name').value = '';
            container.querySelector('#add-master-form').style.display = 'none';
            await loadAll();
        } catch(e) { window.showToast('Failed: ' + e.message, 'error'); }
    });

    // ── Alias Table ───────────────────────────────────────────────────────────
    function renderAliasTable(search = '', langFilter = '') {
        const q = (search || container.querySelector('#alias-search').value).toLowerCase();
        const lf = langFilter || container.querySelector('#alias-lang-filter').value;
        const rows = aliasData.filter(a =>
            (!q  || a.alias.toLowerCase().includes(q) || (a.standard_name||'').toLowerCase().includes(q)) &&
            (!lf || a.language === lf)
        );
        container.querySelector('#alias-total').textContent = `${rows.length} aliases`;

        if (!rows.length) {
            container.querySelector('#alias-table-wrap').innerHTML =
                '<div style="padding:40px;text-align:center;color:var(--text-muted);">No aliases found.</div>';
            return;
        }
        container.querySelector('#alias-table-wrap').innerHTML = `
            <div class="table-container">
                <table class="table">
                    <thead><tr>
                        <th>Alias String</th>
                        <th>Language</th>
                        <th>Maps To (Standard)</th>
                        <th style="width:50px;"></th>
                    </tr></thead>
                    <tbody>
                        ${rows.map(a => `
                        <tr>
                            <td style="font-family:monospace;font-size:13px;">${escapeHtml(a.alias)}</td>
                            <td>${langBadge(a.language)}</td>
                            <td><strong>${escapeHtml(a.standard_name || '')}</strong></td>
                            <td>
                                <button class="btn btn-ghost btn-sm delete-alias-btn" data-id="${a.id}" style="color:var(--danger);padding:3px 7px;">
                                    <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        lucide.createIcons({ root: container.querySelector('#alias-table-wrap') });
        container.querySelectorAll('.delete-alias-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
                try {
                    await api.deleteMdmAlias(btn.dataset.id);
                    aliasData = aliasData.filter(a => a.id != btn.dataset.id);
                    renderAliasTable();
                    updateBadges();
                    window.showToast('Alias removed');
                } catch(e) { window.showToast('Failed: ' + e.message, 'error'); }
            })
        );
    }

    container.querySelector('#alias-search').addEventListener('input', () => renderAliasTable());
    container.querySelector('#alias-lang-filter').addEventListener('change', () => renderAliasTable());

    // ── SKU Map Table ─────────────────────────────────────────────────────────
    function renderSkuTable(search = '') {
        const q = (search || container.querySelector('#sku-search').value).toLowerCase();
        const rows = skuData.filter(s =>
            !q || s.sku_name.toLowerCase().includes(q) ||
            (s.standard_name||'').toLowerCase().includes(q) ||
            (s.vendor_name||'').toLowerCase().includes(q)
        );
        container.querySelector('#sku-total').textContent = `${rows.length} SKUs`;

        if (!rows.length) {
            container.querySelector('#sku-table-wrap').innerHTML =
                '<div style="padding:40px;text-align:center;color:var(--text-muted);">No SKU mappings found.</div>';
            return;
        }
        container.querySelector('#sku-table-wrap').innerHTML = `
            <div class="table-container">
                <table class="table">
                    <thead><tr>
                        <th>Vendor SKU Name</th>
                        <th>Vendor</th>
                        <th>Maps To</th>
                        <th style="text-align:center;width:80px;">Vendor Unit</th>
                        <th style="text-align:center;width:100px;">Conversion</th>
                        <th style="width:50px;"></th>
                    </tr></thead>
                    <tbody>
                        ${rows.map(s => `
                        <tr>
                            <td style="font-size:12px;font-family:monospace;">${escapeHtml(s.sku_name)}</td>
                            <td style="font-size:12px;">${escapeHtml(s.vendor_name || '(Any)')}</td>
                            <td><strong>${escapeHtml(s.standard_name || '')}</strong></td>
                            <td style="text-align:center;font-size:12px;">${escapeHtml(s.vendor_unit)}</td>
                            <td style="text-align:center;font-size:12px;">
                                ${s.conversion_factor !== 1
                                    ? `<span style="color:var(--primary);">1 ${escapeHtml(s.vendor_unit)} = ${s.conversion_factor} KG</span>`
                                    : '1:1'}
                            </td>
                            <td>
                                <button class="btn btn-ghost btn-sm delete-sku-btn" data-id="${s.id}" style="color:var(--danger);padding:3px 7px;">
                                    <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        lucide.createIcons({ root: container.querySelector('#sku-table-wrap') });
        container.querySelectorAll('.delete-sku-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
                try {
                    await api.deleteMdmSku(btn.dataset.id);
                    skuData = skuData.filter(s => s.id != btn.dataset.id);
                    renderSkuTable();
                    updateBadges();
                    window.showToast('SKU mapping removed');
                } catch(e) { window.showToast('Failed: ' + e.message, 'error'); }
            })
        );
    }

    container.querySelector('#sku-search').addEventListener('input', () => renderSkuTable());

    // ── Pending Approvals ─────────────────────────────────────────────────────
    async function loadPending() {
        container.querySelector('#pending-table-wrap').innerHTML =
            '<div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>';
        try {
            const rows = await api.getMdmPending(currentPendingStatus);
            renderPendingTable(rows);
        } catch(e) {
            container.querySelector('#pending-table-wrap').innerHTML =
                `<div style="padding:24px;color:var(--danger);">Error: ${escapeHtml(e.message)}</div>`;
        }
    }

    function renderPendingTable(rows) {
        if (!rows.length) {
            container.querySelector('#pending-table-wrap').innerHTML =
                `<div style="padding:48px;text-align:center;color:var(--text-muted);">
                    <i data-lucide="check-circle" style="width:32px;height:32px;display:block;margin:0 auto 12px;color:var(--success);"></i>
                    No ${currentPendingStatus} items
                </div>`;
            lucide.createIcons({ root: container.querySelector('#pending-table-wrap') });
            return;
        }

        const isPending = currentPendingStatus === 'pending';
        container.querySelector('#pending-table-wrap').innerHTML = `
            <div class="table-container">
                <table class="table">
                    <thead><tr>
                        <th>Raw OCR String</th>
                        <th>Source</th>
                        <th>AI Suggestion</th>
                        <th style="width:80px;text-align:center;">Confidence</th>
                        <th>Date</th>
                        ${isPending ? '<th style="width:200px;">Action</th>' : '<th>Resolved By</th>'}
                    </tr></thead>
                    <tbody>
                        ${rows.map(p => `
                        <tr>
                            <td><strong style="font-family:monospace;">${escapeHtml(p.raw_string)}</strong></td>
                            <td><span class="badge">${escapeHtml(p.source)}</span></td>
                            <td>${p.suggested_name ? `<span style="color:var(--primary);">→ ${escapeHtml(p.suggested_name)}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                            <td style="text-align:center;">${confBadge(p.confidence)}</td>
                            <td style="font-size:12px;color:var(--text-muted);">${p.created_at?.slice(0,10) || ''}</td>
                            ${isPending ? `
                            <td>
                                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                    <select class="form-control pending-master-sel" data-id="${p.id}" style="font-size:11px;padding:3px 6px;min-width:140px;">
                                        <option value="">Map to…</option>
                                        ${masterData.map(m => `<option value="${m.id}" ${m.id == p.suggested_master_id ? 'selected' : ''}>${escapeHtml(m.standard_name)}</option>`).join('')}
                                    </select>
                                    <button class="btn btn-sm" style="background:var(--success);color:#fff;padding:3px 8px;" data-action="approve" data-id="${p.id}">✓</button>
                                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:3px 8px;" data-action="dismiss" data-id="${p.id}">✕</button>
                                </div>
                            </td>` : `<td style="font-size:12px;">${escapeHtml(p.reviewed_by||'—')}</td>`}
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        lucide.createIcons({ root: container.querySelector('#pending-table-wrap') });

        if (!isPending) return;

        container.querySelectorAll('[data-action="approve"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sel = container.querySelector(`.pending-master-sel[data-id="${btn.dataset.id}"]`);
                const master_id = sel?.value;
                if (!master_id) { window.showToast('Select a standard item to map to', 'error'); return; }
                try {
                    await api.approveMdmPending(btn.dataset.id, { master_id: Number(master_id), create_alias: true, alias_lang: 'en' });
                    window.showToast('Mapped and alias created ✓', 'success');
                    await loadAll();
                    await loadPending();
                } catch(e) { window.showToast('Failed: ' + e.message, 'error'); }
            });
        });
        container.querySelectorAll('[data-action="dismiss"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.dismissMdmPending(btn.dataset.id);
                    window.showToast('Dismissed');
                    await loadPending();
                    await loadPendingBanner();
                } catch(e) { window.showToast('Failed: ' + e.message, 'error'); }
            });
        });
    }

    container.querySelectorAll('.pending-status-btn').forEach(btn =>
        btn.addEventListener('click', () => {
            container.querySelectorAll('.pending-status-btn').forEach(b => b.classList.remove('active','btn-outline'));
            btn.classList.add('active','btn-outline');
            currentPendingStatus = btn.dataset.status;
            loadPending();
        })
    );

    // ── Resolve Test Modal ────────────────────────────────────────────────────
    const modal = container.querySelector('#resolve-modal');
    container.querySelector('#btn-test-resolve').addEventListener('click', () => {
        modal.style.display = 'flex';
        container.querySelector('#resolve-input').focus();
    });
    container.querySelector('#btn-close-modal').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    container.querySelector('#btn-do-resolve').addEventListener('click', async () => {
        const raw = container.querySelector('#resolve-input').value.trim();
        if (!raw) return;
        const resultEl = container.querySelector('#resolve-result');
        resultEl.innerHTML = '<span style="color:var(--text-muted);">Resolving…</span>';
        try {
            const r = await api.mdmResolve(raw);
            if (r.matched) {
                resultEl.innerHTML = `
                    <div style="padding:12px;background:var(--bg-main);border-radius:8px;border:1px solid var(--border-color);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                            <span style="font-weight:700;font-size:15px;color:var(--success);">✓ Resolved</span>
                            ${confBadge(r.confidence)}
                            <span style="font-size:11px;color:var(--text-muted);">via ${r.matched_via}</span>
                        </div>
                        <div style="font-size:13px;"><b>Standard Name:</b> ${escapeHtml(r.standard_name)}</div>
                        <div style="font-size:13px;margin-top:4px;"><b>Category:</b> ${escapeHtml(r.category||'—')} &nbsp;|&nbsp; <b>Unit:</b> ${escapeHtml(r.base_unit)}</div>
                        ${r.conversion_factor !== 1 ? `<div style="font-size:12px;margin-top:4px;color:var(--primary);"><b>Unit conversion:</b> 1 vendor unit = ${r.conversion_factor} ${r.base_unit}</div>` : ''}
                    </div>`;
            } else {
                resultEl.innerHTML = `
                    <div style="padding:12px;background:#fff7ed;border-radius:8px;border:1px solid #fed7aa;">
                        <span style="font-weight:700;color:var(--warning);">⚠ No match found</span>
                        <div style="font-size:12px;margin-top:6px;color:var(--text-muted);">This string would be flagged as pending review for Nitinbhai to map manually.</div>
                    </div>`;
            }
        } catch(e) {
            resultEl.innerHTML = `<span style="color:var(--danger);">Error: ${escapeHtml(e.message)}</span>`;
        }
    });
    container.querySelector('#resolve-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') container.querySelector('#btn-do-resolve').click();
    });

    // ── Boot ──────────────────────────────────────────────────────────────────
    await loadAll();
    lucide.createIcons({ root: container });
    return container;
}
