import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export default async function renderBudget() {
    const container = document.createElement('div');

    // Default to the most recent month that has purchase data (not calendar today)
    const now = new Date();
    const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let currentMonth = fallbackMonth;
    try {
        const months = await api.getAvailableMonths();
        if (months?.length) currentMonth = months[0];
    } catch { /* use fallback */ }

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <div class="page-title">Budget vs Actual</div>
                <div class="page-sub">Set monthly category budgets and track spend against them</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <input type="month" id="budget-month" class="form-control" style="width:160px;" value="${currentMonth}">
            </div>
        </div>

        <!-- Summary cards -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;" id="budget-summary">
            <div class="card skeleton" style="height:88px;"></div>
            <div class="card skeleton" style="height:88px;"></div>
            <div class="card skeleton" style="height:88px;"></div>
            <div class="card skeleton" style="height:88px;"></div>
        </div>

        <!-- Budget table -->
        <div class="card" style="padding:0;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-color);">
                <span style="font-weight:600;font-size:14px;">Category Budgets</span>
                <button class="btn btn-primary btn-sm" id="btn-add-budget">
                    <i data-lucide="plus" style="width:14px;height:14px;"></i> Add Budget
                </button>
            </div>

            <!-- Add form (hidden by default) -->
            <div id="add-budget-form" style="display:none;padding:16px 20px;background:var(--bg-main);border-bottom:1px solid var(--border-color);">
                <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
                    <div class="form-group" style="margin-bottom:0;min-width:180px;">
                        <label class="form-label">Category</label>
                        <select id="new-budget-category" class="form-control">
                            <option value="">Select category…</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;min-width:140px;">
                        <label class="form-label">Monthly Budget (₹)</label>
                        <input type="number" id="new-budget-amount" class="form-control" placeholder="e.g. 25000" min="0" step="100">
                    </div>
                    <button class="btn btn-primary" id="btn-save-budget">Save</button>
                    <button class="btn btn-ghost" id="btn-cancel-budget">Cancel</button>
                </div>
            </div>

            <div id="budget-table-wrap">
                <div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>
            </div>
        </div>
    `;

    const monthInput   = container.querySelector('#budget-month');
    const addBtn       = container.querySelector('#btn-add-budget');
    const addForm      = container.querySelector('#add-budget-form');
    const saveBtn      = container.querySelector('#btn-save-budget');
    const cancelBtn    = container.querySelector('#btn-cancel-budget');
    const catSelect    = container.querySelector('#new-budget-category');
    const amountInput  = container.querySelector('#new-budget-amount');
    const summaryEl    = container.querySelector('#budget-summary');
    const tableWrap    = container.querySelector('#budget-table-wrap');

    // ── Helpers ───────────────────────────────────────────────────────────────

    function formatINR(n) {
        return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }

    function pctColor(pct) {
        if (pct >= 100) return 'var(--danger)';
        if (pct >= 80)  return 'var(--warning)';
        return 'var(--success)';
    }

    function progressBar(pct) {
        const capped = Math.min(pct, 100);
        return `
            <div style="height:6px;background:var(--border-color);border-radius:4px;overflow:hidden;margin-top:6px;">
                <div style="height:100%;width:${capped}%;background:${pctColor(pct)};border-radius:4px;transition:width 0.4s ease;"></div>
            </div>`;
    }

    // ── Load & render ─────────────────────────────────────────────────────────

    const load = async () => {
        const month = monthInput.value;
        summaryEl.innerHTML = `
            <div class="card skeleton" style="height:88px;"></div>
            <div class="card skeleton" style="height:88px;"></div>
            <div class="card skeleton" style="height:88px;"></div>
            <div class="card skeleton" style="height:88px;"></div>`;
        tableWrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">Loading…</div>`;

        try {
            const [budgets, purchases, categories] = await Promise.all([
                api.getBudgets(month),
                api.getPurchases({ month }),
                api.getCategories()
            ]);

            // Actual spend per category
            const actualMap = {};
            purchases.forEach(p => {
                const cat = p.category || 'Uncategorised';
                actualMap[cat] = (actualMap[cat] || 0) + (p.finalAmount || p.total || 0);
            });

            // Budget map
            const budgetMap = {};
            budgets.forEach(b => budgetMap[b.category] = { id: b.id, amount: b.amount });

            // All categories that have either a budget or actual spend
            const allCats = [...new Set([
                ...Object.keys(budgetMap),
                ...Object.keys(actualMap)
            ])].sort();

            // Populate category dropdown (only cats without a budget yet)
            const dbCats = categories.map(c => c.name);
            const unbudgeted = dbCats.filter(c => !budgetMap[c]);
            catSelect.innerHTML = '<option value="">Select category…</option>' +
                unbudgeted.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

            // ── Summary cards ────────────────────────────────────────────────
            const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
            const totalActual = Object.values(actualMap).reduce((s, v) => s + v, 0);
            const totalRemain = totalBudget - totalActual;
            const overBudget  = allCats.filter(c => budgetMap[c] && (actualMap[c] || 0) > budgetMap[c].amount).length;

            summaryEl.innerHTML = `
                <div class="card">
                    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Total Budget</div>
                    <div style="font-size:22px;font-weight:800;color:var(--primary);">${formatINR(totalBudget)}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${budgets.length} categories set</div>
                </div>
                <div class="card">
                    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Total Spent</div>
                    <div style="font-size:22px;font-weight:800;color:var(--text-primary);">${formatINR(totalActual)}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${totalBudget > 0 ? ((totalActual/totalBudget)*100).toFixed(1) : 0}% of budget used</div>
                </div>
                <div class="card">
                    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Remaining</div>
                    <div style="font-size:22px;font-weight:800;color:${totalRemain >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatINR(Math.abs(totalRemain))}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${totalRemain < 0 ? 'over budget' : 'available'}</div>
                </div>
                <div class="card">
                    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Over Budget</div>
                    <div style="font-size:22px;font-weight:800;color:${overBudget > 0 ? 'var(--danger)' : 'var(--success)'};">${overBudget}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${overBudget === 0 ? 'all within budget' : `categor${overBudget === 1 ? 'y' : 'ies'} exceeded`}</div>
                </div>`;

            // ── Table ────────────────────────────────────────────────────────
            if (allCats.length === 0) {
                tableWrap.innerHTML = `
                    <div style="padding:48px;text-align:center;color:var(--text-muted);">
                        <i data-lucide="bar-chart-2" style="width:36px;height:36px;margin-bottom:12px;display:block;margin-inline:auto;"></i>
                        No budget data yet. Click <strong>Add Budget</strong> to set a category budget.
                    </div>`;
                lucide.createIcons({ root: tableWrap });
                return;
            }

            tableWrap.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th style="text-align:right;">Budget</th>
                                <th style="text-align:right;">Actual Spend</th>
                                <th style="text-align:right;">Remaining</th>
                                <th style="width:160px;">Usage</th>
                                <th style="width:36px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${allCats.map(cat => {
                                const budget  = budgetMap[cat]?.amount || 0;
                                const actual  = actualMap[cat] || 0;
                                const remain  = budget - actual;
                                const pct     = budget > 0 ? (actual / budget) * 100 : 0;
                                const budgetId = budgetMap[cat]?.id;

                                return `<tr>
                                    <td>
                                        <strong>${escapeHtml(cat)}</strong>
                                        ${budget === 0 ? '<span class="badge" style="background:var(--warning-light);color:var(--warning);margin-left:6px;">No budget</span>' : ''}
                                    </td>
                                    <td style="text-align:right;">
                                        ${budget > 0
                                            ? `<span class="editable-budget" data-cat="${escapeHtml(cat)}" data-id="${budgetId || ''}" style="cursor:pointer;border-bottom:1px dashed var(--border-color);" title="Click to edit">${formatINR(budget)}</span>`
                                            : '<span style="color:var(--text-muted);">—</span>'}
                                    </td>
                                    <td style="text-align:right;">${formatINR(actual)}</td>
                                    <td style="text-align:right;color:${remain >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                        ${remain < 0 ? '-' : ''}${formatINR(Math.abs(remain))}
                                    </td>
                                    <td>
                                        ${budget > 0 ? `
                                            <div style="display:flex;align-items:center;gap:8px;">
                                                <div style="flex:1;">${progressBar(pct)}</div>
                                                <span style="font-size:11px;font-weight:600;color:${pctColor(pct)};min-width:36px;text-align:right;">${pct.toFixed(0)}%</span>
                                            </div>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}
                                    </td>
                                    <td>
                                        ${budgetId ? `<button class="btn btn-ghost delete-budget-btn" data-id="${budgetId}" style="padding:4px 6px;color:var(--danger);" title="Remove budget">
                                            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                                        </button>` : ''}
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;

            lucide.createIcons({ root: tableWrap });

            // Inline edit on click
            tableWrap.querySelectorAll('.editable-budget').forEach(el => {
                el.addEventListener('click', () => {
                    const cat = el.dataset.cat;
                    const id  = el.dataset.id;
                    const cur = budgetMap[cat]?.amount || 0;
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.value = cur;
                    input.min = '0';
                    input.step = '100';
                    input.className = 'form-control';
                    input.style.cssText = 'width:110px;padding:4px 8px;font-size:13px;display:inline-block;';
                    el.replaceWith(input);
                    input.focus();
                    input.select();

                    const commit = async () => {
                        const val = parseFloat(input.value);
                        if (!isNaN(val) && val >= 0) {
                            await api.setBudget(month, cat, val);
                            load();
                        } else {
                            load();
                        }
                    };
                    input.addEventListener('blur', commit);
                    input.addEventListener('keydown', e => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') load();
                    });
                });
            });

            // Delete budget
            tableWrap.addEventListener('click', async (e) => {
                const btn = e.target.closest('.delete-budget-btn');
                if (!btn) return;
                if (!confirm('Remove this budget?')) return;
                await api.deleteBudget(btn.dataset.id);
                load();
            });

        } catch (err) {
            summaryEl.innerHTML = '';
            tableWrap.innerHTML = `<div style="padding:24px;color:var(--danger);">Error loading budget data: ${escapeHtml(err.message)}</div>`;
        }
    };

    // ── Events ────────────────────────────────────────────────────────────────
    monthInput.addEventListener('change', load);

    addBtn.addEventListener('click', () => {
        addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
        if (addForm.style.display !== 'none') amountInput.focus();
    });

    cancelBtn.addEventListener('click', () => { addForm.style.display = 'none'; });

    saveBtn.addEventListener('click', async () => {
        const cat = catSelect.value;
        const amt = parseFloat(amountInput.value);
        if (!cat) { window.showToast('Select a category', 'error'); return; }
        if (isNaN(amt) || amt < 0) { window.showToast('Enter a valid amount', 'error'); return; }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
            await api.setBudget(monthInput.value, cat, amt);
            window.showToast('Budget saved');
            addForm.style.display = 'none';
            amountInput.value = '';
            catSelect.value = '';
            load();
        } catch (err) {
            window.showToast('Save failed: ' + err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    });

    load();
    return container;
}
