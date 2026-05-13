import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

export default async function renderEntry() {
    const container = document.createElement('div');
    
    // Generate base HTML
    container.innerHTML = `
        <div class="card" style="max-width: 1400px; margin: 0 auto; overflow-x: auto;">
            <div class="flex justify-between items-center mb-4">
                <h2>Tabular Purchase Entry</h2>
                <div class="flex gap-4 items-center bg-gray-50 p-2 border rounded">
                    <span style="font-weight: 600; font-size: 0.875rem;">Tax Mode:</span>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 0.875rem;">
                        <input type="radio" name="tax_mode" value="percent" checked> Percentage (%)
                    </label>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 0.875rem;">
                        <input type="radio" name="tax_mode" value="flat"> Rupees (₹)
                    </label>
                </div>
            </div>
            
            <form id="entry-form">
                <!-- Header Fields -->
                <div class="grid-3 mb-4" style="border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
                    <div class="form-group">
                        <label class="form-label">Date</label>
                        <input type="date" id="entry-date" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Invoice / Bill No</label>
                        <input type="text" id="entry-invoice" class="form-control" placeholder="Optional">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Transport Amount (₹)</label>
                        <input type="number" step="0.01" id="entry-transport" class="form-control" placeholder="0.00" value="0">
                    </div>
                </div>
                
                <!-- Dynamic Table -->
                <div class="table-container mb-4" style="overflow: visible;">
                    <table class="table" style="min-width: 1100px;">
                        <thead>
                            <tr>
                                <th style="width: 40px;">Sr</th>
                                <th style="width: 14%;">Vendor</th>
                                <th style="width: 14%;">Item</th>
                                <th style="width: 14%;">Category</th>
                                <th style="width: 8%;">Qty</th>
                                <th style="width: 6%;">Unit</th>
                                <th style="width: 10%;">Unit Price</th>
                                <th style="width: 10%;">Total Amt</th>
                                <th style="width: 8%;">GST</th>
                                <th style="width: 8%;">IGST</th>
                                <th style="width: 10%;">Final Amt</th>
                                <th style="width: 14%;">Remark</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="entry-rows">
                            <!-- Rows injected via JS -->
                        </tbody>
                    </table>
                </div>

                <div class="flex justify-between items-center" style="margin-top: 16px;">
                    <button type="button" class="btn btn-outline" id="btn-add-row"><i data-lucide="plus-circle" style="width: 16px;"></i> Add Row</button>
                    <div class="flex gap-4 items-center">
                        <div style="margin-right: 24px;">
                            <span class="text-muted" style="font-size: 0.875rem;">Gross Total: </span>
                            <strong id="gross-total" style="font-size: 1.25rem;">₹0.00</strong>
                        </div>
                        <button type="button" class="btn btn-outline" id="btn-reset">Clear form</button>
                        <button type="submit" class="btn btn-primary" style="padding: 10px 32px;">Save Invoice</button>
                    </div>
                </div>
            </form>
        </div>
    `;

    // Elements
    const form = container.querySelector('#entry-form');
    const dateInput = container.querySelector('#entry-date');
    const invoiceInput = container.querySelector('#entry-invoice');
    const transportInput = container.querySelector('#entry-transport');
    const rowsBody = container.querySelector('#entry-rows');
    const addRowBtn = container.querySelector('#btn-add-row');
    const taxRadios = container.querySelectorAll('input[name="tax_mode"]');
    const grossTotalEl = container.querySelector('#gross-total');

    // Global Data — loaded from API
    let vendors = [];
    let items = [];
    let categoriesList = [];
    let categoriesMap = {};
    let itemsMap = {};
    let vendorsMap = {};
    
    let rowCount = 0;

    // Set Default Date
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    dateInput.max = `${yyyy}-${mm}-${dd}`; // Prevent future dates

    // Load Dropdown Data from API
    const loadData = async () => {
        try {
            const [v, i, c] = await Promise.all([
                api.getVendors(),
                api.getItems(),
                api.getCategories()
            ]);

            vendors = v.filter(x => x.status === 'active');
            items = i.filter(x => x.status === 'active');
            categoriesList = c.filter(x => x.status === 'active');
            
            categoriesList.forEach(cat => categoriesMap[cat.id] = cat);
            items.forEach(item => itemsMap[item.id] = item);
            vendors.forEach(ven => vendorsMap[ven.id] = ven);
            
            // Ensure at least one line is visible initially
            addRow();
        } catch (err) {
            console.error("Failed to load entry data:", err);
            window.showToast("Failed to load form data from server", "error");
        }
    };

    // Calculate internal row
    const calculateRow = (rowEl) => {
        const qty = parseFloat(rowEl.querySelector('.col-qty').value) || 0;
        const price = parseFloat(rowEl.querySelector('.col-price').value) || 0;
        const totalAmt = qty * price;
        rowEl.querySelector('.col-total').value = totalAmt.toFixed(2);

        const gstVal = parseFloat(rowEl.querySelector('.col-gst').value) || 0;
        const igstVal = parseFloat(rowEl.querySelector('.col-igst').value) || 0;
        
        const taxMode = container.querySelector('input[name="tax_mode"]:checked').value;
        
        let finalGst = 0;
        let finalIgst = 0;
        
        if (taxMode === 'percent') {
            finalGst = totalAmt * (gstVal / 100);
            finalIgst = totalAmt * (igstVal / 100);
        } else {
            finalGst = gstVal;
            finalIgst = igstVal;
        }
        
        const finalAmount = totalAmt + finalGst + finalIgst;
        rowEl.querySelector('.col-final').value = finalAmount.toFixed(2);
        
        calculateGross();
    };

    // Calculate entire bottom total
    const calculateGross = () => {
        let gross = 0;
        container.querySelectorAll('.col-final').forEach(el => {
            gross += parseFloat(el.value) || 0;
        });
        
        const tAmount = parseFloat(transportInput.value) || 0;
        gross += tAmount;
        
        grossTotalEl.textContent = '₹' + gross.toFixed(2);
    };

    // Event: Toggle Tax Mode triggers recalculation on all rows
    taxRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            container.querySelectorAll('#entry-rows tr').forEach(row => calculateRow(row));
        });
    });

    transportInput.addEventListener('input', calculateGross);

    // Add Row logic
    const addRow = () => {
        rowCount++;
        const tr = document.createElement('tr');
        
        // Build generic selects for vendor & item
        const vendorSelect = '<select class="form-control col-vendor" required style="padding:6px; font-size:13px;"><option value="">Select...</option>' + 
            vendors.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('') + 
            '</select>';
            
        // Exclude the 'Transport Fee' item from the manual item list because it is handled by the header transport amount
        const filteredItems = items.filter(i => i.name !== 'Transport Fee');
        const itemSelect = '<select class="form-control col-item" required style="padding:6px; font-size:13px;"><option value="">Select...</option>' + 
            filteredItems.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('') + 
            '</select>';

        tr.innerHTML = `
            <td class="row-num text-center" style="font-weight: 600;">${rowCount}</td>
            <td>${vendorSelect}</td>
            <td>${itemSelect}</td>
            <td><input type="text" class="form-control col-cat" readonly disabled style="padding:6px; font-size:13px; background:var(--bg-main);" placeholder="-"></td>
            <td><input type="number" class="form-control col-qty" min="1" value="1" required style="padding: 6px; font-size:13px;"></td>
            <td><input type="text" class="form-control col-unit" readonly disabled style="padding:6px; font-size:13px; background:var(--bg-main);" placeholder="-"></td>
            <td><input type="number" step="0.01" class="form-control col-price" required style="padding: 6px; font-size:13px;"></td>
            <td><input type="text" class="form-control col-total" readonly style="background:var(--bg-main); padding: 6px; font-size:13px;"></td>
            <td><input type="number" step="0.01" class="form-control col-gst" style="padding: 6px; font-size:13px;" placeholder="0"></td>
            <td><input type="number" step="0.01" class="form-control col-igst" style="padding: 6px; font-size:13px;" placeholder="0"></td>
            <td><input type="text" class="form-control col-final" readonly style="background:var(--bg-main); font-weight:bold; padding: 6px; font-size:13px;"></td>
            <td><input type="text" class="form-control col-remark" style="padding: 6px; font-size:13px;" placeholder="Remark"></td>
            <td>
                <button type="button" class="btn btn-outline btn-danger btn-remove-row" style="padding: 4px; border:none;" title="Remove row">
                    <i data-lucide="trash-2" style="width: 16px; color: var(--danger);"></i>
                </button>
            </td>
        `;

        rowsBody.appendChild(tr);
        lucide.createIcons({ root: tr });

        // Events for this row
        const itemEl = tr.querySelector('.col-item');
        const catEl = tr.querySelector('.col-cat');
        const priceEl = tr.querySelector('.col-price');
        const unitEl = tr.querySelector('.col-unit');
        
        itemEl.addEventListener('change', (e) => {
            const iId = parseInt(e.target.value);
            if(iId && itemsMap[iId]) {
                const iData = itemsMap[iId];
                catEl.value = categoriesMap[iData.categoryId]?.name || 'Unknown';
                // only attach category id as dataset for saving later
                catEl.dataset.catid = iData.categoryId;
                priceEl.value = iData.defaultPrice;
                unitEl.value = iData.unit || 'pcs';
                calculateRow(tr);
            } else {
                catEl.value = '';
                catEl.dataset.catid = '';
                priceEl.value = '';
                unitEl.value = '';
                calculateRow(tr);
            }
        });

        tr.querySelectorAll('.col-qty, .col-price, .col-gst, .col-igst').forEach(input => {
            input.addEventListener('input', () => calculateRow(tr));
        });

        tr.querySelector('.btn-remove-row').addEventListener('click', () => {
            tr.remove();
            // Re-sequence numbers
            const allRows = rowsBody.querySelectorAll('tr');
            allRows.forEach((r, idx) => {
                r.querySelector('.row-num').textContent = idx + 1;
            });
            rowCount = allRows.length;
            calculateGross();
        });
    };

    addRowBtn.addEventListener('click', addRow);

    // Save Logic — uses API
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dateVal = dateInput.value;
        const invoiceVal = invoiceInput.value;
        const taxMode = container.querySelector('input[name="tax_mode"]:checked').value;
        const tAmount = parseFloat(transportInput.value) || 0;
        const rows = rowsBody.querySelectorAll('tr');
        if (rows.length === 0) {
            window.showToast('Please add at least one item.', 'error');
            return;
        }

        let purchasesToSave = [];

        // Loop rows
        for (let row of rows) {
            const vId = parseInt(row.querySelector('.col-vendor').value);
            const iId = parseInt(row.querySelector('.col-item').value);
            const catIdText = row.querySelector('.col-cat').dataset.catid;
            const cId = parseInt(catIdText);

            if (!vId || !iId || isNaN(cId)) continue;

            const qty = parseFloat(row.querySelector('.col-qty').value) || 0;
            const price = parseFloat(row.querySelector('.col-price').value) || 0;
            const tCost = qty * price;

            let rawGst = parseFloat(row.querySelector('.col-gst').value) || 0;
            let rawIgst = parseFloat(row.querySelector('.col-igst').value) || 0;

            let finalGst = taxMode === 'percent' ? tCost * (rawGst / 100) : rawGst;
            let finalIgst = taxMode === 'percent' ? tCost * (rawIgst / 100) : rawIgst;

            // Get denormalized names from maps
            const vendorName = vendorsMap[vId]?.name || 'Unknown';
            const itemRecord = itemsMap[iId];
            const itemName = itemRecord?.name || 'Unknown';
            const itemUnit = itemRecord?.unit || 'pcs';
            const categoryName = categoriesMap[cId]?.name || 'Other';

            purchasesToSave.push({
                date: dateVal,
                billNumber: invoiceVal,
                vendorId: vId,
                itemId: iId,
                categoryId: cId,
                quantity: qty,
                price: price,
                total: tCost,
                gst: parseFloat(finalGst.toFixed(2)),
                igst: parseFloat(finalIgst.toFixed(2)),
                finalAmount: parseFloat((tCost + finalGst + finalIgst).toFixed(2)),
                // Denormalized fields for analytics
                supplierName: vendorName,
                invoiceNo: invoiceVal,
                item: itemName,
                category: categoryName,
                unit: itemUnit,
                remarks: row.querySelector('.col-remark').value
            });
        }

        if (purchasesToSave.length === 0) {
            window.showToast('Please complete all row selects.', 'error');
            return;
        }

        // Logic for standalone Transport Row
        if (tAmount > 0) {
            const firstVendorId = purchasesToSave.length > 0 ? purchasesToSave[0].vendorId : null;

            if (!firstVendorId) {
                window.showToast('Please select a vendor in at least one row to attribute transport charges', 'error');
                return;
            }

            // Find Transport Support cat and item from API data
            const transportCat = categoriesList.find(c => c.name === 'Transport Support');
            const transportItem = items.find(i => i.name === 'Transport Fee');

            if (transportCat && transportItem) {
                const vendorName = vendorsMap[firstVendorId]?.name || 'Unknown';
                purchasesToSave.push({
                    date: dateVal,
                    billNumber: invoiceVal,
                    vendorId: firstVendorId,
                    itemId: transportItem.id,
                    categoryId: transportCat.id,
                    quantity: 1,
                    price: tAmount,
                    total: tAmount,
                    gst: 0,
                    igst: 0,
                    finalAmount: tAmount,
                    supplierName: vendorName,
                    invoiceNo: invoiceVal,
                    item: 'Transport Fee',
                    category: 'Transport Support',
                    unit: 'service',
                    remarks: 'Transport Charge for Invoice'
                });
            }
        }

        try {
            // Save each purchase via API
            for (const purchase of purchasesToSave) {
                await api.addPurchase(purchase);
            }
            window.showToast(`${purchasesToSave.length} item(s) saved successfully!`);

            // Clear Form
            rowsBody.innerHTML = '';
            rowCount = 0;
            invoiceInput.value = '';
            transportInput.value = '';
            grossTotalEl.textContent = '₹0.00';
            addRow();

        } catch(e) {
            console.error(e);
            window.showToast('Error saving invoice: ' + e.message, 'error');
        }
    });

    container.querySelector('#btn-reset').addEventListener('click', () => {
        form.reset();
        dateInput.valueAsDate = new Date();
        rowsBody.innerHTML = '';
        rowCount = 0;
        grossTotalEl.textContent = '₹0.00';
        addRow();
    });

    await loadData();
    lucide.createIcons({ root: container });

    return container;
}
