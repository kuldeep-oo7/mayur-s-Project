import { api } from '../api.js';

export default async function renderReports() {
    const container = document.createElement('div');
    
    container.innerHTML = `
        <!-- Filter Bar -->
        <div class="filter-bar mb-4">
            <div style="flex: 1; min-width: 200px;">
                <label class="form-label">Date Range (Start)</label>
                <input type="date" id="rep-start" class="form-control">
            </div>
            <div style="flex: 1; min-width: 200px;">
                <label class="form-label">Date Range (End)</label>
                <input type="date" id="rep-end" class="form-control">
            </div>
            <div style="flex: 1; min-width: 200px;">
                <label class="form-label">Vendor</label>
                <select id="rep-vendor" class="form-control">
                    <option value="">All Vendors</option>
                </select>
            </div>
            <div style="flex: 1; min-width: 200px;">
                <label class="form-label">Category</label>
                <select id="rep-category" class="form-control">
                    <option value="">All Categories</option>
                </select>
            </div>
            <div style="flex: 1; min-width: 200px;">
                <label class="form-label">Item</label>
                <select id="rep-item" class="form-control">
                    <option value="">All Items</option>
                </select>
            </div>
            <div>
                <button class="btn btn-outline" id="btn-export-excel"><i data-lucide="file-spreadsheet"></i> Excel</button>
            </div>
        </div>

        <div class="grid-2">
            <!-- Summary Table for the selected criteria -->
            <div class="card" style="grid-column: span 2;">
                <h3>Filtered Summary</h3>
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table class="table" id="report-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Vendor</th>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Total</th>
                                <th>GST</th>
                                <th>IGST</th>
                                <th>Final Amount</th>
                                <th>Entered By</th>
                            </tr>
                        </thead>
                        <tbody id="report-body">
                            <tr><td colspan="10" style="text-align: center;">Loading data...</td></tr>
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan="8" style="text-align: right;">Gross Spend:</th>
                                <th id="report-total" style="font-size: 1.1rem;">₹0.00</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Price Fluctuation Line Chart -->
            <div class="card" style="grid-column: span 2;">
                <h3>Price Trends (Selected Data)</h3>
                <div class="chart-container" style="height: 350px;">
                    <canvas id="rep-priceChart"></canvas>
                </div>
            </div>
        </div>
    `;

    // Elements
    const body = container.querySelector('#report-body');
    const totalEl = container.querySelector('#report-total');
    
    const startFilter = container.querySelector('#rep-start');
    const endFilter = container.querySelector('#rep-end');
    const vendorFilter = container.querySelector('#rep-vendor');
    const categoryFilter = container.querySelector('#rep-category');
    const itemFilter = container.querySelector('#rep-item');
    
    // Set default dates (Last 30 days)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);
    
    startFilter.valueAsDate = lastMonth;
    endFilter.valueAsDate = today;

    let vendorsMap = {};
    let itemsMap = {};
    let categoriesMap = {};
    let currentData = [];
    let priceChartInstance = null;

    const initReport = async () => {
        try {
            const [v, i, c] = await Promise.all([
                api.getVendors(),
                api.getItems(),
                api.getCategories()
            ]);
            
            v.forEach(x => vendorsMap[x.id] = x);
            i.forEach(x => itemsMap[x.id] = x);
            c.forEach(x => categoriesMap[x.id] = x);

            vendorFilter.innerHTML += v.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
            categoryFilter.innerHTML += c.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
            itemFilter.innerHTML += i.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
            
            await loadFilteredData();
        } catch (err) {
            console.error("Report init failed:", err);
            body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--danger);">Failed to load data from server</td></tr>';
        }
    };

    const loadFilteredData = async () => {
        const s = startFilter.value;
        const e = endFilter.value;
        const vid = vendorFilter.value ? parseInt(vendorFilter.value) : null;
        const cid = categoryFilter.value ? parseInt(categoryFilter.value) : null;
        const iid = itemFilter.value ? parseInt(itemFilter.value) : null;

        try {
            let purchases = await api.getPurchases();

            // Client-side filters
            if (s) purchases = purchases.filter(p => p.date >= s);
            if (e) purchases = purchases.filter(p => p.date <= e);
            if (vid) purchases = purchases.filter(p => p.vendorId === vid);
            if (cid) purchases = purchases.filter(p => p.categoryId === cid);
            if (iid) purchases = purchases.filter(p => p.itemId === iid);

            currentData = purchases.sort((a,b) => new Date(a.date) - new Date(b.date));

            renderTable();
            renderChart();
        } catch (err) {
            console.error("Report filter failed:", err);
        }
    };

    const renderTable = () => {
        if (currentData.length === 0) {
            body.innerHTML = `<tr><td colspan="10" style="text-align: center;">No data found.</td></tr>`;
            totalEl.textContent = '₹0.00';
            return;
        }

        let grossTotal = 0;
        body.innerHTML = currentData.map(p => {
            const rowFinal = p.finalAmount || p.total;
            grossTotal += rowFinal;
            return `
                <tr>
                    <td>${escapeHtml(p.date)}</td>
                    <td>${escapeHtml(p.supplierName || vendorsMap[p.vendorId]?.name || '-')}</td>
                    <td>${escapeHtml(p.item || itemsMap[p.itemId]?.name || '-')}</td>
                    <td>${p.quantity} <small class="text-muted">${p.unit || 'pcs'}</small></td>
                    <td>₹${(p.price || 0).toFixed(2)}</td>
                    <td>₹${(p.total || 0).toFixed(2)}</td>
                    <td>₹${(p.gst || 0).toFixed(2)}</td>
                    <td>₹${(p.igst || 0).toFixed(2)}</td>
                    <td><strong>₹${rowFinal.toFixed(2)}</strong></td>
                    <td><span class="badge" style="background:#e2e8f0; color:#475569;">${p.userId === 1 ? 'admin' : 'staff'}</span></td>
                </tr>
            `;
        }).join('');
        
        totalEl.textContent = '₹' + grossTotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
    };

    const renderChart = () => {
        const canvas = container.querySelector('#rep-priceChart');
        if (!canvas) return;

        if (priceChartInstance) {
            priceChartInstance.destroy();
        }

        // Group data by date
        const grouped = {};
        currentData.forEach(p => {
            grouped[p.date] = (grouped[p.date] || 0) + (p.finalAmount || p.total);
        });

        const labels = Object.keys(grouped);
        const data = Object.values(grouped);

        priceChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Spend (₹)',
                    data: data,
                    backgroundColor: '#10b981',
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    };

    // Export Logic using SheetJS (xlsx)
    container.querySelector('#btn-export-excel').addEventListener('click', () => {
        if (!window.XLSX || currentData.length === 0) {
            window.showToast("No data or export library not loaded.", "error");
            return;
        }

        const wb = XLSX.utils.book_new();
        
        const exportData = currentData.map(p => ({
            Date: p.date,
            'Bill Number': p.billNumber || p.invoiceNo || '',
            Vendor: p.supplierName || vendorsMap[p.vendorId]?.name || 'Unknown',
            Category: p.category || categoriesMap[p.categoryId]?.name || 'Unknown',
            Item: p.item || itemsMap[p.itemId]?.name || 'Unknown',
            Quantity: p.quantity,
            Unit: p.unit || 'pcs',
            'Price (₹)': p.price,
            'Total (₹)': p.total,
            'GST (₹)': p.gst || 0,
            'IGST (₹)': p.igst || 0,
            'Final Amount (₹)': p.finalAmount || p.total,
            'Entered By': p.userId === 1 ? 'admin' : 'staff'
        }));
        
        // Add a total row
        const sum = currentData.reduce((acc, p) => acc + (p.finalAmount || p.total), 0);
        exportData.push({
            Date: 'TOTAL',
            'Bill Number': '', Vendor: '', Category: '', Item: '', Quantity: '', Unit: '', 'Price (₹)': '',
            'Total (₹)': '', 'GST (₹)': '', 'IGST (₹)': '',
            'Final Amount (₹)': sum,
            'Entered By': ''
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, `Canteen_Report_${startFilter.value}_to_${endFilter.value}.xlsx`);
    });

    // Event Listeners for Filters
    [startFilter, endFilter, vendorFilter, categoryFilter, itemFilter].forEach(el => {
        el.addEventListener('change', loadFilteredData);
    });

    setTimeout(initReport, 50);

    return container;
}
