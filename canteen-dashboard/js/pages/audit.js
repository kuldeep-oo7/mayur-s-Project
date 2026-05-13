import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export default async function renderAudit() {
    const container = document.createElement('div');
    
    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <h2 class="page-title">Audit & Exception Log</h2>
                <p class="page-sub">Review all price anomalies and flagged entries</p>
            </div>
        </div>

        <div class="grid-1">
            <div class="card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="mb-0">Flagged Purchases</h3>
                    <div class="flex gap-2">
                        <input type="month" id="audit-month" class="form-control" style="width:180px;">
                    </div>
                </div>
                
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Item</th>
                                <th>Vendor</th>
                                <th>Price</th>
                                <th>Status / Alert</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="audit-body">
                            <tr><td colspan="6" class="text-center">Loading exceptions...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const tbody = container.querySelector('#audit-body');
    const monthFilter = container.querySelector('#audit-month');

    // Default to the most recent month that has data (not calendar today)
    const today = new Date();
    const fallbackMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    try {
        const months = await api.getAvailableMonths();
        monthFilter.value = months?.length ? months[0] : fallbackMonth;
    } catch {
        monthFilter.value = fallbackMonth;
    }

    const loadExceptions = async () => {
        try {
            const allPurchases = await api.getPurchases({ month: monthFilter.value });
            const exceptions = allPurchases.filter(p => p.alert);

            if (exceptions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No exceptions found for this month.</td></tr>';
                return;
            }

            tbody.innerHTML = exceptions.map(p => {
                const isSpike = p.alert.includes('spike');
                return `
                    <tr>
                        <td>${escapeHtml(p.date)}</td>
                        <td><strong>${escapeHtml(p.item)}</strong></td>
                        <td>${escapeHtml(p.supplierName || 'Unknown')}</td>
                        <td>₹${(p.price || 0).toFixed(2)}</td>
                        <td>
                            <span class="badge" style="background:${isSpike ? '#fee2e2' : '#dcfce7'}; color:${isSpike ? '#ef4444' : '#10b981'}; font-weight:600;">
                                <i data-lucide="${isSpike ? 'alert-triangle' : 'trending-down'}" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>
                                ${escapeHtml(p.alert)}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-outline btn-sm" onclick="window.location.hash='#/records'">View Details</button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            lucide.createIcons({ root: tbody });
        } catch (err) {
            console.error("Audit load failed:", err);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load audit data</td></tr>';
        }
    };

    monthFilter.addEventListener('change', loadExceptions);
    loadExceptions();

    return container;
}
