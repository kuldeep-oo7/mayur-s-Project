import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { runOCR, terminateOCR } from '../ocr.js';
import { parseInvoice } from '../invoiceParser.js';

const DEFAULT_CAT_MAP = {
    'Tomato':'Vegetable','Potato':'Vegetable','Onion':'Vegetable','Green Chilli':'Vegetable','Red Chilli':'Vegetable','Coriander':'Vegetable','Ginger':'Vegetable','Garlic':'Vegetable','Brinjal':'Vegetable','Okra':'Vegetable','Cauliflower':'Vegetable','Cabbage':'Vegetable','Spinach':'Vegetable','Fenugreek':'Vegetable','Cluster Beans':'Vegetable','Ridge Gourd':'Vegetable','Bitter Gourd':'Vegetable','Bottle Gourd':'Vegetable','Pumpkin':'Vegetable','Raw Banana':'Vegetable','Sweet Potato':'Vegetable','Yam':'Vegetable','Carrot':'Vegetable','Radish':'Vegetable','Beetroot':'Vegetable','Cucumber':'Vegetable','Lemon':'Vegetable','Capsicum':'Vegetable','Corn':'Vegetable','Mushroom':'Vegetable','Peas':'Vegetable','Spring Onion':'Vegetable','Turmeric':'Vegetable',
    'Milk':'Dairy','Paneer':'Dairy','Curd':'Dairy','Ghee':'Dairy','Butter':'Dairy','Cream':'Dairy',
    'Rice':'Grocery/Dry','Wheat Flour':'Grocery/Dry','Sugar':'Grocery/Dry','Salt':'Grocery/Dry','Oil':'Grocery/Dry','Besan':'Grocery/Dry','Maida':'Grocery/Dry','Toor Dal':'Grocery/Dry','Moong Dal':'Grocery/Dry','Chana Dal':'Grocery/Dry','Urad Dal':'Grocery/Dry','Masoor Dal':'Grocery/Dry','Rajma':'Grocery/Dry',
    'Cumin':'Spice','Mustard':'Spice','Turmeric Powder':'Spice','Red Chilli Powder':'Spice','Coriander Powder':'Spice','Garam Masala':'Spice','Kitchen King Masala':'Spice','Kashmiri Chilli Powder':'Spice'
};
let CAT_MAP = { ...DEFAULT_CAT_MAP };
let KNOWN_ITEMS = Object.keys(DEFAULT_CAT_MAP).sort();
const KNOWN_ITEMS_DATA = {};

let scanRows = [];
let scanRowCounter = 0;

export default async function renderScanner() {
    scanRows = [];
    scanRowCounter = 0;

    await refreshKnownItems();

    const container = document.createElement('div');

    container.innerHTML = `
        <div class="page-hdr">
            <div>
                <div class="page-title">Scan Invoice</div>
                <div class="page-sub">Upload invoice for reference, enter items, then save to log</div>
            </div>
        </div>

        <!-- Step 1: Invoice details + optional image -->
        <div class="card mb-4">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                <h3 class="card-title mb-0">Step 1 — Invoice Details</h3>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="btn btn-outline btn-sm" id="btn-upload-trigger" title="Attach invoice image">
                        <i data-lucide="image" style="width:14px;height:14px;"></i> Attach Image
                    </button>
                    <button class="btn btn-primary btn-sm" id="btn-auto-extract" style="display:none; gap:6px;">
                        <i data-lucide="scan-line" style="width:14px;height:14px;"></i> Auto Extract
                    </button>
                    <input type="file" id="invoice-file" accept="image/*" style="display:none">
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px; align-items:flex-end; flex-wrap:wrap;">
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Date <span style="color:var(--danger)">*</span></label>
                    <input type="date" id="scan-date" class="form-control">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Supplier / Party Name <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="scan-supplier" class="form-control" placeholder="Search or enter…" list="scan-supplier-list">
                    <datalist id="scan-supplier-list"></datalist>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Invoice / Bill No</label>
                    <input type="text" id="scan-invoice" class="form-control" placeholder="Optional">
                </div>
            </div>

            <!-- Image preview (hidden until uploaded) -->
            <div id="invoice-preview" style="display:none; margin-top:16px;">
                <div style="display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                    <img id="invoice-img" src="" alt="Invoice"
                         style="max-width:420px; width:100%; border-radius:8px; border:1px solid var(--border-color); cursor:zoom-in; max-height:340px; object-fit:contain; background:var(--bg-main)">
                    <div style="flex-shrink:0;">
                        <button class="btn btn-ghost btn-sm" id="btn-clear-img" style="color:var(--danger);">
                            <i data-lucide="x" style="width:14px;height:14px;"></i> Remove
                        </button>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Click image to zoom</div>
                    </div>
                </div>
            </div>

            <!-- OCR Progress (hidden by default) -->
            <div id="ocr-progress-wrap" style="display:none; margin-top:16px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                    <i data-lucide="loader" style="width:15px;height:15px; color:var(--primary); animation:spin 1s linear infinite;"></i>
                    <span id="ocr-status-text" style="font-size:13px; color:var(--text-secondary);">Reading invoice…</span>
                    <span id="ocr-pct" style="font-size:12px; color:var(--text-muted); margin-left:auto;">0%</span>
                </div>
                <div style="height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
                    <div id="ocr-progress-bar" style="height:100%; width:0%; background:var(--primary); border-radius:3px; transition:width .2s;"></div>
                </div>
            </div>

            <!-- OCR Review Panel (hidden until extraction done) -->
            <div id="ocr-review-panel" style="display:none; margin-top:16px; border:1.5px solid var(--primary); border-radius:var(--radius); padding:16px; background:var(--bg-card);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="check-circle" style="width:16px;height:16px; color:var(--success);"></i>
                        <span style="font-size:13px; font-weight:600; color:var(--text-primary);">Extraction Complete</span>
                        <span id="ocr-extracted-count" style="font-size:11px; color:var(--text-muted);"></span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-ghost btn-sm" id="btn-ocr-discard" style="color:var(--danger);">Discard</button>
                        <button class="btn btn-primary btn-sm" id="btn-ocr-apply">
                            <i data-lucide="check" style="width:13px;height:13px;"></i> Apply to Form
                        </button>
                    </div>
                </div>

                <!-- Extracted header fields preview -->
                <div id="ocr-header-preview" style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px; padding:10px 12px; background:var(--bg-main); border-radius:var(--radius-sm); font-size:12px;">
                </div>

                <!-- Extracted items preview table -->
                <div id="ocr-items-preview" style="max-height:220px; overflow-y:auto; font-size:12px;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="color:var(--text-muted); font-size:11px; text-transform:uppercase; letter-spacing:.5px;">
                                <th style="padding:4px 8px; text-align:left; border-bottom:1px solid var(--border-color);">Item</th>
                                <th style="padding:4px 8px; text-align:center; border-bottom:1px solid var(--border-color);">Unit</th>
                                <th style="padding:4px 8px; text-align:right; border-bottom:1px solid var(--border-color);">Qty</th>
                                <th style="padding:4px 8px; text-align:right; border-bottom:1px solid var(--border-color);">Rate</th>
                                <th style="padding:4px 8px; text-align:right; border-bottom:1px solid var(--border-color);">Amount</th>
                                <th style="padding:4px 8px; text-align:center; border-bottom:1px solid var(--border-color);">Conf.</th>
                            </tr>
                        </thead>
                        <tbody id="ocr-items-tbody"></tbody>
                    </table>
                </div>

                <!-- Raw OCR text (collapsible) -->
                <details style="margin-top:10px;">
                    <summary style="font-size:11px; color:var(--text-muted); cursor:pointer; user-select:none;">Show raw OCR text</summary>
                    <pre id="ocr-raw-text" style="font-size:10px; color:var(--text-muted); white-space:pre-wrap; margin:8px 0 0; max-height:120px; overflow-y:auto; background:var(--bg-main); padding:8px; border-radius:4px;"></pre>
                </details>
            </div>
        </div>

        <!-- Step 2: Item table -->
        <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="card-title mb-0">Step 2 — Enter Items</h3>
                <button class="btn btn-outline btn-sm" id="btn-add-row-trigger">
                    <i data-lucide="plus" style="width:14px;height:14px;"></i> Add Row
                </button>
            </div>
            <div class="table-container mb-3" style="min-height:200px;">
                <table class="table" id="scan-table">
                    <thead>
                        <tr>
                            <th style="width:36px;">#</th>
                            <th>Item Name</th>
                            <th style="width:120px;">Category</th>
                            <th style="width:80px;">Unit</th>
                            <th style="width:72px;">Qty</th>
                            <th style="width:88px;">Rate ₹</th>
                            <th style="width:70px;">GST %</th>
                            <th style="width:88px;">Amount ₹</th>
                            <th style="width:36px;"></th>
                        </tr>
                    </thead>
                    <tbody id="scan-rows-body"></tbody>
                </table>
            </div>

            <!-- Footer: totals + save -->
            <div style="display:flex; align-items:center; gap:16px; padding:12px 16px; background:var(--bg-main); border-radius:var(--radius-sm);">
                <span style="font-size:13px; color:var(--text-secondary);">
                    Items: <strong id="scan-item-count">0</strong>
                </span>
                <span style="font-size:13px; color:var(--text-secondary);">
                    Total: <strong id="scan-total" style="color:var(--primary); font-size:15px;">₹0.00</strong>
                </span>
                <span style="flex:1;"></span>
                <button class="btn btn-ghost btn-sm" style="color:var(--danger);" id="btn-clear-rows">Clear Rows</button>
                <button class="btn btn-primary" id="save-all-btn" style="min-width:140px;">
                    <i data-lucide="check" style="width:15px;height:15px;"></i> Save All (0)
                </button>
            </div>
        </div>

        <div id="scan-success-msg"></div>
    `;

    const fileInput       = container.querySelector('#invoice-file');
    const uploadBtn       = container.querySelector('#btn-upload-trigger');
    const autoExtractBtn  = container.querySelector('#btn-auto-extract');
    const clearImgBtn     = container.querySelector('#btn-clear-img');
    const previewEl       = container.querySelector('#invoice-preview');
    const imgEl           = container.querySelector('#invoice-img');
    const ocrProgressWrap = container.querySelector('#ocr-progress-wrap');
    const ocrProgressBar  = container.querySelector('#ocr-progress-bar');
    const ocrPct          = container.querySelector('#ocr-pct');
    const ocrStatusText   = container.querySelector('#ocr-status-text');
    const ocrReviewPanel  = container.querySelector('#ocr-review-panel');
    const addRowBtn       = container.querySelector('#btn-add-row-trigger');
    const clearRowsBtn    = container.querySelector('#btn-clear-rows');
    const saveAllBtn      = container.querySelector('#save-all-btn');
    const dateInput       = container.querySelector('#scan-date');

    // Store current file for OCR
    let currentFile = null;
    let lastExtracted = null; // { date, invoiceNo, supplier, items }

    const today = new Date().toISOString().slice(0, 10);
    dateInput.value = today;
    dateInput.max   = today;

    // ── Image attachment ─────────────────────────────────────────────────────
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        currentFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            imgEl.src = ev.target.result;
            previewEl.style.display = 'block';
            autoExtractBtn.style.display = 'flex';
            ocrReviewPanel.style.display = 'none';
            lucide.createIcons({ root: container.querySelector('.card') });
        };
        reader.readAsDataURL(file);
    });

    clearImgBtn.addEventListener('click', () => {
        imgEl.src = '';
        previewEl.style.display = 'none';
        fileInput.value = '';
        currentFile = null;
        autoExtractBtn.style.display = 'none';
        ocrProgressWrap.style.display = 'none';
        ocrReviewPanel.style.display  = 'none';
        lastExtracted = null;
    });

    imgEl.addEventListener('click', () => {
        const zoomed = imgEl.dataset.zoomed === 'true';
        imgEl.style.maxWidth  = zoomed ? '420px' : 'none';
        imgEl.style.maxHeight = zoomed ? '340px' : 'none';
        imgEl.style.cursor    = zoomed ? 'zoom-in' : 'zoom-out';
        imgEl.dataset.zoomed  = zoomed ? '' : 'true';
    });

    // ── OCR Auto Extract ─────────────────────────────────────────────────────
    autoExtractBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        // Reset UI
        autoExtractBtn.disabled = true;
        autoExtractBtn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px; animation:spin 1s linear infinite;"></i> Reading…`;
        lucide.createIcons({ root: autoExtractBtn });
        ocrProgressWrap.style.display = 'block';
        ocrReviewPanel.style.display  = 'none';
        ocrProgressBar.style.width    = '0%';
        ocrPct.textContent            = '0%';
        ocrStatusText.textContent     = 'Enhancing image…';

        try {
            // Pre-process image: grayscale + contrast boost + upscale
            ocrStatusText.textContent = 'Enhancing image quality…';
            const processedBlob = await preprocessInvoiceImage(currentFile);

            const rawText = await runOCR(processedBlob, (pct) => {
                ocrProgressBar.style.width = pct + '%';
                ocrPct.textContent         = pct + '%';
                if (pct < 20)       ocrStatusText.textContent = 'Loading OCR engine…';
                else if (pct < 50)  ocrStatusText.textContent = 'Reading invoice text…';
                else if (pct < 90)  ocrStatusText.textContent = 'Extracting fields…';
                else                ocrStatusText.textContent = 'Parsing items…';
            });

            // Parse
            const parsed = parseInvoice(rawText, KNOWN_ITEMS);
            lastExtracted = parsed;

            // Show review panel
            ocrProgressWrap.style.display = 'none';
            showOCRReview(container, parsed);

        } catch (err) {
            console.error('OCR failed:', err);
            ocrProgressWrap.style.display = 'none';
            window.showToast('OCR failed: ' + (err.message || 'Unknown error'), 'error');
        } finally {
            autoExtractBtn.disabled = false;
            autoExtractBtn.innerHTML = `<i data-lucide="scan-line" style="width:14px;height:14px;"></i> Re-extract`;
            lucide.createIcons({ root: autoExtractBtn });
        }
    });

    // ── Review panel actions ─────────────────────────────────────────────────
    container.querySelector('#btn-ocr-apply').addEventListener('click', async () => {
        if (!lastExtracted) return;
        ocrReviewPanel.style.display = 'none';
        const btn = container.querySelector('#btn-ocr-apply');
        btn.disabled = true;
        btn.textContent = 'Mapping…';
        try {
            await applyExtractedData(container, lastExtracted);
            window.showToast(`Applied: ${lastExtracted.items.length} items — MDM resolution complete`, 'success');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;"></i> Apply to Form`;
            lucide.createIcons({ root: btn });
        }
    });

    container.querySelector('#btn-ocr-discard').addEventListener('click', () => {
        ocrReviewPanel.style.display = 'none';
        lastExtracted = null;
    });

    addRowBtn.addEventListener('click', () => addScanRow(container));
    clearRowsBtn.addEventListener('click', () => clearScanRows(container));
    saveAllBtn.addEventListener('click', () => saveAllToLog(container));

    container.querySelector('#scan-rows-body').addEventListener('input', (e) => {
        const input = e.target;
        const parts = input.id.split('_');
        if (parts.length < 2) return;
        const field = parts[0];
        const id = parts.slice(1).join('_');
        if (field === 'item') onScanItemChange(id, input.value, container);
        else if (['qty','rate','amt','gst'].includes(field)) setScanNum(id, field, input.value, container);
        else if (['cat','unit'].includes(field)) setScanField(id, field, input.value);
    });

    container.querySelector('#scan-rows-body').addEventListener('keydown', (e) => {
        const parts = e.target.id.split('_');
        if (parts.length >= 2) handleScanKeydown(e, parts.slice(1).join('_'), parts[0], container);
    });

    container.querySelector('#scan-rows-body').addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-row-btn');
        if (btn) deleteScanRow(btn.dataset.id, container);
    });

    for (let i = 0; i < 5; i++) addScanRow(container);
    await refreshSupplierList(container);

    // Inject spin keyframe once
    if (!document.querySelector('#ocr-spin-style')) {
        const style = document.createElement('style');
        style.id = 'ocr-spin-style';
        style.textContent = `@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`;
        document.head.appendChild(style);
    }

    lucide.createIcons({ root: container });

    // Clean up OCR worker when this page is replaced
    container._cleanup = () => terminateOCR().catch(() => {});

    return container;
}

// ── Image pre-processor ───────────────────────────────────────────────────────
/**
 * Enhance invoice image before OCR:
 *  1. Grayscale conversion
 *  2. Contrast stretch (darken text, lighten background)
 *  3. Upscale to minimum 1600 px wide (Tesseract accuracy improves above 300 DPI)
 *
 * @param {File|Blob} file
 * @returns {Promise<Blob>}  PNG blob ready for Tesseract
 */
function preprocessInvoiceImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // fallback: use original

        img.onload = () => {
            URL.revokeObjectURL(url);
            try {
                // ── 1. Draw at target scale ──────────────────────────────
                const MIN_W = 1800;   // min pixel width for good OCR
                const scale = img.width < MIN_W ? MIN_W / img.width : 1;
                const w = Math.round(img.width  * scale);
                const h = Math.round(img.height * scale);

                const canvas = document.createElement('canvas');
                canvas.width  = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled  = true;
                ctx.imageSmoothingQuality  = 'high';
                ctx.drawImage(img, 0, 0, w, h);

                // ── 2. Grayscale + contrast stretch ──────────────────────
                const id   = ctx.getImageData(0, 0, w, h);
                const data = id.data;

                // First pass: compute mean luminance (for adaptive threshold)
                let sum = 0;
                for (let i = 0; i < data.length; i += 4) {
                    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                }
                const mean = sum / (data.length / 4);

                // Second pass: grayscale + stretch
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

                    // Contrast stretch: push darks darker, lights lighter
                    let enhanced;
                    if (gray < mean) {
                        // Below mean → push toward black (text)
                        enhanced = Math.max(0, gray * (gray / mean) * 0.75);
                    } else {
                        // Above mean → push toward white (background)
                        enhanced = Math.min(255, 255 - (255 - gray) * ((255 - gray) / (255 - mean)) * 0.6);
                    }

                    data[i] = data[i + 1] = data[i + 2] = Math.round(enhanced);
                    // alpha unchanged
                }
                ctx.putImageData(id, 0, 0);

                canvas.toBlob(blob => resolve(blob || file), 'image/png');
            } catch (e) {
                resolve(file); // fallback
            }
        };

        img.src = url;
    });
}

// ── OCR Review helpers ────────────────────────────────────────────────────────

function showOCRReview(container, parsed) {
    const panel = container.querySelector('#ocr-review-panel');
    panel.style.display = 'block';

    // Header preview pills
    const headerEl = container.querySelector('#ocr-header-preview');
    const pillStyle = 'padding:4px 10px; border-radius:20px; background:var(--bg-main); border:1px solid var(--border-color);';
    const taxPill = parsed.gstPercent ? `<span style="${pillStyle}"><b>GST:</b> ${parsed.gstPercent}%</span>` : 
                    (parsed.cgst || parsed.sgst) ? `<span style="${pillStyle}"><b>Taxes:</b> CGST ${parsed.cgst||0} + SGST ${parsed.sgst||0}</span>` : '';
    
    headerEl.innerHTML = [
        parsed.date      ? `<span style="${pillStyle}"><b>Date:</b> ${escapeHtml(parsed.date)}</span>` : '<span style="color:var(--danger); font-size:11px;">⚠ Date not found</span>',
        parsed.supplier  ? `<span style="${pillStyle}"><b>Supplier:</b> ${escapeHtml(parsed.supplier.slice(0,35))}</span>` : '<span style="color:var(--warning); font-size:11px;">⚠ Supplier unclear</span>',
        parsed.invoiceNo ? `<span style="${pillStyle}"><b>Bill No:</b> ${escapeHtml(parsed.invoiceNo)}</span>` : '',
        parsed.gstin     ? `<span style="${pillStyle}; font-family:monospace; font-size:11px;"><b>GSTIN:</b> ${escapeHtml(parsed.gstin)}</span>` : '',
        taxPill,
    ].filter(Boolean).join('');

    // Items table
    const tbody = container.querySelector('#ocr-items-tbody');
    const confColor = c => c > 0.65 ? 'var(--success)' : c > 0.35 ? 'var(--warning)' : 'var(--danger)';
    const confLabel = c => c > 0.65 ? 'High' : c > 0.35 ? 'Med' : 'Low';

    if (parsed.items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:12px; text-align:center; color:var(--text-muted); font-size:12px;">No items could be extracted. Try a clearer image.</td></tr>`;
    } else {
        tbody.innerHTML = parsed.items.map((it, i) => `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:5px 8px;">${escapeHtml(it.item)}${it.rawItem !== it.item ? `<span style="color:var(--text-muted); font-size:10px; margin-left:4px;">(${escapeHtml(it.rawItem)})</span>` : ''}</td>
                <td style="padding:5px 8px; text-align:center; color:var(--text-muted);">${escapeHtml(it.unit)}</td>
                <td style="padding:5px 8px; text-align:right;">${it.qty}</td>
                <td style="padding:5px 8px; text-align:right;">₹${it.rate.toFixed(2)}</td>
                <td style="padding:5px 8px; text-align:right; font-weight:600;">₹${it.amount.toFixed(2)}</td>
                <td style="padding:5px 8px; text-align:center; font-size:11px; color:${confColor(it.confidence)};">${confLabel(it.confidence)}</td>
            </tr>
        `).join('');
    }

    // Raw text
    container.querySelector('#ocr-raw-text').textContent = parsed.rawText;

    // Count badge
    const total = parsed.items.reduce((s, i) => s + i.amount, 0);
    container.querySelector('#ocr-extracted-count').textContent =
        `${parsed.items.length} item${parsed.items.length !== 1 ? 's' : ''} · ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    lucide.createIcons({ root: panel });
}

async function applyExtractedData(container, parsed) {
    // Fill header fields
    if (parsed.date)      container.querySelector('#scan-date').value     = parsed.date;
    if (parsed.supplier)  container.querySelector('#scan-supplier').value = parsed.supplier;
    if (parsed.invoiceNo) container.querySelector('#scan-invoice').value  = parsed.invoiceNo;

    if (parsed.items.length === 0) return;

    // ── MDM Batch Resolve ────────────────────────────────────────────────────
    let mdmResults = [];
    try {
        mdmResults = await api.mdmResolveBatch(parsed.items.map(it => it.item));
    } catch { /* silent – fall back to raw names */ }

    // Queue low-confidence items as pending review (fire-and-forget)
    mdmResults.forEach((r, i) => {
        if (!r.matched && parsed.items[i]?.item) {
            api.addMdmPending({
                raw_string:           parsed.items[i].item,
                source:               'ocr',
                suggested_master_id:  r.master_id || null,
                confidence:           r.confidence || 0,
            }).catch(() => {});
        }
    });

    // Clear existing rows and replace with extracted items
    scanRows = [];
    container.querySelector('#scan-rows-body').innerHTML = '';
    scanRowCounter = 0;

    for (let i = 0; i < parsed.items.length; i++) {
        const it  = parsed.items[i];
        const mdm = mdmResults[i] || {};
        const id  = 'sr_' + (++scanRowCounter);

        // Use MDM standard name when confidence ≥ 80, else use raw OCR name
        const displayName = (mdm.matched && mdm.confidence >= 80) ? mdm.standard_name : it.item;
        const knownCat    = mdm.category || KNOWN_ITEMS_DATA[it.item]?.category || DEFAULT_CAT_MAP[it.item] || 'Grocery/Dry';

        scanRows.push({ id, item: displayName, category: knownCat, unit: it.unit,
                        qty: String(it.qty), rate: String(it.rate), gstPercent: String(parsed.gstPercent || 0), amount: String(it.amount) });

        const dlId  = 'dl_' + id;
        const tbody = container.querySelector('#scan-rows-body');
        const rowNum = scanRows.length;

        // MDM indicator badge
        let mdmBadge = '';
        if (mdm.matched && mdm.confidence >= 80) {
            mdmBadge = `<span style="font-size:9px;background:#dcfce7;color:#16a34a;padding:1px 5px;border-radius:8px;margin-left:4px;" title="Auto-mapped via MDM (${mdm.confidence}% confidence)">MDM ✓</span>`;
        } else if (mdm.matched && mdm.confidence >= 50) {
            mdmBadge = `<span class="mdm-suggest-badge" data-id="${id}" data-name="${escapeHtml(mdm.standard_name)}" style="font-size:9px;background:#fef9c3;color:#854d0e;padding:1px 5px;border-radius:8px;margin-left:4px;cursor:pointer;" title="Click to apply MDM suggestion: ${escapeHtml(mdm.standard_name)} (${mdm.confidence}%)">Suggest: ${escapeHtml(mdm.standard_name)} →</span>`;
        } else if (it.item) {
            mdmBadge = `<span style="font-size:9px;background:#fee2e2;color:#b91c1c;padding:1px 5px;border-radius:8px;margin-left:4px;" title="Unknown item — sent for review">Pending ⏳</span>`;
        }

        const tr = document.createElement('tr');
        tr.id = 'tr_' + id;
        tr.style.background = 'var(--bg-main)';
        tr.innerHTML = `
            <td class="row-num" style="color:var(--text-muted);font-size:12px;text-align:center;">${rowNum}</td>
            <td>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">
                    <input class="form-control" id="item_${id}" list="${dlId}" value="${escapeHtml(displayName)}"
                           placeholder="Item name" style="padding:6px 10px;font-size:13px;min-width:160px;">
                    ${mdmBadge}
                </div>
                <datalist id="${dlId}">${KNOWN_ITEMS.map(ki => `<option value="${escapeHtml(ki)}">`).join('')}</datalist>
                <div id="alert_${id}" style="display:none;font-size:10px;margin-top:2px;"></div>
            </td>
            <td>
                <select class="form-control" id="cat_${id}" style="padding:6px 10px;font-size:13px;min-width:120px;">
                    ${['Vegetable','Grocery/Dry','Dairy','Fruit','Spice','Transport Support'].map(c => `<option${c===knownCat?' selected':''}>${c}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="form-control" id="unit_${id}" style="padding:6px 10px;font-size:13px;width:80px;">
                    ${['kg','g','pcs','piece','dozen','litre','ml','pack','box','bale','service'].map(u => `<option${u===it.unit?' selected':''}>${u}</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="form-control" id="qty_${id}" min="0" step="0.01"
                       value="${it.qty}" style="padding:6px 10px;font-size:13px;width:70px;">
            </td>
            <td>
                <input type="number" class="form-control" id="rate_${id}" min="0" step="0.01"
                       value="${it.rate}" style="padding:6px 10px;font-size:13px;width:85px;">
            </td>
            <td>
                <input type="number" class="form-control" id="gst_${id}" min="0" max="28" step="0.01"
                       value="${parsed.gstPercent || 0}" style="padding:6px 10px;font-size:13px;width:65px;" title="GST %">
            </td>
            <td>
                <input type="number" class="form-control" id="amt_${id}" min="0" step="0.01"
                       value="${it.amount}" style="padding:6px 10px;font-size:13px;width:85px;font-weight:600;color:var(--primary);">
            </td>
            <td>
                <button class="btn btn-ghost delete-row-btn" data-id="${id}" title="Remove row"
                        style="padding:4px 6px;color:var(--danger);">
                    <i data-lucide="x" style="width:14px;height:14px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
        lucide.createIcons({ root: tr });

        // Wire up "Suggest" click — one-click apply MDM name
        tr.querySelectorAll('.mdm-suggest-badge').forEach(badge => {
            badge.addEventListener('click', () => {
                const inp = container.querySelector(`#item_${badge.dataset.id}`);
                if (inp) {
                    inp.value = badge.dataset.name;
                    const row = scanRows.find(r => r.id === badge.dataset.id);
                    if (row) row.item = badge.dataset.name;
                    badge.style.background = '#dcfce7';
                    badge.style.color = '#16a34a';
                    badge.textContent = 'MDM ✓';
                    badge.style.cursor = 'default';
                }
            });
        });
    }

    // Add one blank row at the bottom
    addScanRow(container);
    updateScanTotals(container);

    // Scroll to Step 2
    container.querySelector('#scan-rows-body').closest('.card')?.scrollIntoView({ behavior: 'smooth' });
}

// ── Data refresh ─────────────────────────────────────────────────────────────

async function refreshKnownItems() {
    try {
        const [itemsList, categoriesList] = await Promise.all([
            api.getItems(),
            api.getCategories()
        ]);
        const catIdMap = {};
        categoriesList.forEach(c => catIdMap[c.id] = c.name);
        itemsList.forEach(i => {
            if (i.status === 'active') {
                KNOWN_ITEMS_DATA[i.name] = {
                    id: i.id,
                    category: catIdMap[i.categoryId] || 'Unknown',
                    unit: i.unit || 'kg',
                    price: i.defaultPrice || 0
                };
            }
        });
        KNOWN_ITEMS = [...new Set([...Object.keys(DEFAULT_CAT_MAP), ...itemsList.map(i => i.name)])].sort();
    } catch (err) {
        console.error('Scanner data refresh failed:', err);
    }
}

async function refreshSupplierList(container) {
    try {
        const allData = await api.getPurchases();
        const suppliers = [...new Set(allData.map(r => r.supplierName).filter(Boolean))].sort();
        const dlEl = container.querySelector('#scan-supplier-list');
        if (dlEl) dlEl.innerHTML = suppliers.map(s => `<option value="${escapeHtml(s)}">`).join('');
    } catch { /* silent fallback */ }
}

// ── Row management ────────────────────────────────────────────────────────────

function addScanRow(container) {
    const id = 'sr_' + (++scanRowCounter);
    scanRows.push({ id, item: '', category: 'Vegetable', unit: 'kg', qty: '', rate: '', gstPercent: '', amount: '' });

    const tbody  = container.querySelector('#scan-rows-body');
    const rowNum = scanRows.length;
    const dlId   = 'dl_' + id;
    const allItems = KNOWN_ITEMS;

    const tr = document.createElement('tr');
    tr.id = 'tr_' + id;
    tr.innerHTML = `
        <td class="row-num" style="color:var(--text-muted);font-size:12px;text-align:center;">${rowNum}</td>
        <td>
            <input class="form-control" id="item_${id}" list="${dlId}" value=""
                   placeholder="Item name" style="padding:6px 10px;font-size:13px;min-width:160px;">
            <datalist id="${dlId}">${allItems.map(i => `<option value="${escapeHtml(i)}">`).join('')}</datalist>
            <div id="alert_${id}" style="display:none;font-size:10px;margin-top:2px;"></div>
        </td>
        <td>
            <select class="form-control" id="cat_${id}" style="padding:6px 10px;font-size:13px;min-width:120px;">
                ${['Vegetable','Grocery/Dry','Dairy','Fruit','Spice'].map(c => `<option${c==='Vegetable'?' selected':''}>${c}</option>`).join('')}
            </select>
        </td>
        <td>
            <select class="form-control" id="unit_${id}" style="padding:6px 10px;font-size:13px;width:80px;">
                ${['kg','g','pcs','piece','dozen','litre','ml','pack','box','service'].map(u => `<option${u==='kg'?' selected':''}>${u}</option>`).join('')}
            </select>
        </td>
        <td>
            <input type="number" class="form-control" id="qty_${id}" min="0" step="0.01"
                   placeholder="0" style="padding:6px 10px;font-size:13px;width:70px;">
        </td>
        <td>
            <input type="number" class="form-control" id="rate_${id}" min="0" step="0.01"
                   placeholder="0.00" style="padding:6px 10px;font-size:13px;width:85px;">
        </td>
        <td>
            <input type="number" class="form-control" id="gst_${id}" min="0" max="28" step="0.01"
                   placeholder="0" style="padding:6px 10px;font-size:13px;width:65px;" title="GST %">
        </td>
        <td>
            <input type="number" class="form-control" id="amt_${id}" min="0" step="0.01"
                   placeholder="0.00" style="padding:6px 10px;font-size:13px;width:85px;font-weight:600;color:var(--primary);">
        </td>
        <td>
            <button class="btn btn-ghost delete-row-btn" data-id="${id}" title="Remove row"
                    style="padding:4px 6px;color:var(--danger);">
                <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    lucide.createIcons({ root: tr });
    updateScanTotals(container);
}

function onScanItemChange(id, value, container) {
    const row = scanRows.find(r => r.id === id);
    if (!row) return;
    row.item = value.trim();

    const known = KNOWN_ITEMS_DATA[value] || (DEFAULT_CAT_MAP[value] ? { category: DEFAULT_CAT_MAP[value] } : null);
    const alertEl = container.querySelector('#alert_' + id);
    if (alertEl) { alertEl.style.display = 'none'; alertEl.innerHTML = ''; }

    if (known) {
        if (known.category) {
            row.category = known.category;
            const el = container.querySelector('#cat_' + id);
            if (el) el.value = known.category;
        }
        if (known.unit) {
            row.unit = known.unit;
            const el = container.querySelector('#unit_' + id);
            if (el) el.value = known.unit;
        }
        if (known.price) {
            row.rate = known.price;
            const rateEl = container.querySelector('#rate_' + id);
            if (rateEl) rateEl.value = known.price;

            if (known.id && alertEl) {
                api.getItemPriceHistory(known.id).then(history => {
                    if (!history?.length) return;
                    const lastPrice = history[0].price;
                    const curr = parseFloat(container.querySelector('#rate_' + id)?.value) || known.price;
                    if (curr > lastPrice * 1.1) {
                        alertEl.style.display = 'block';
                        alertEl.style.color = 'var(--danger)';
                        alertEl.innerHTML = `<i data-lucide="alert-triangle" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px;"></i> Price spike! Last: ₹${lastPrice.toFixed(2)}`;
                        row.alert = `Price spike! Last: ₹${lastPrice.toFixed(2)}`;
                        lucide.createIcons({ root: alertEl });
                    } else if (curr < lastPrice * 0.9) {
                        alertEl.style.display = 'block';
                        alertEl.style.color = 'var(--success)';
                        alertEl.innerHTML = `<i data-lucide="trending-down" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px;"></i> Saving! Last: ₹${lastPrice.toFixed(2)}`;
                        row.alert = `Saving! Last: ₹${lastPrice.toFixed(2)}`;
                        lucide.createIcons({ root: alertEl });
                    } else {
                        row.alert = null;
                    }
                }).catch(err => console.error("Failed to fetch price history", err));
            }

            const qty = parseFloat(container.querySelector('#qty_' + id)?.value) || 0;
            if (qty > 0) {
                const amt = (qty * known.price).toFixed(2);
                row.amount = amt;
                const amtEl = container.querySelector('#amt_' + id);
                if (amtEl) amtEl.value = amt;
            }
        }
    }
    updateScanTotals(container);
}

function setScanField(id, field, value) {
    const row = scanRows.find(r => r.id === id);
    if (row) row[field] = value;
}

function setScanNum(id, field, value, container) {
    const row = scanRows.find(r => r.id === id);
    if (!row) return;
    row[field] = value;
    if (field === 'qty' || field === 'rate') {
        const qty  = parseFloat(container.querySelector('#qty_'  + id)?.value) || 0;
        const rate = parseFloat(container.querySelector('#rate_' + id)?.value) || 0;
        if (qty > 0 && rate > 0) {
            const amt = (qty * rate).toFixed(2);
            row.amount = amt;
            const amtEl = container.querySelector('#amt_' + id);
            if (amtEl) amtEl.value = amt;
        }
    }
    if (field === 'gst') {
        // Store GST percentage in row
        row.gstPercent = parseFloat(value) || 0;
    }
    updateScanTotals(container);
}

function deleteScanRow(id, container) {
    scanRows = scanRows.filter(r => r.id !== id);
    container.querySelector('#tr_' + id)?.remove();
    scanRows.forEach((r, i) => {
        const cell = container.querySelector(`#tr_${r.id} .row-num`);
        if (cell) cell.textContent = i + 1;
    });
    updateScanTotals(container);
}

function clearScanRows(container) {
    scanRows = [];
    container.querySelector('#scan-rows-body').innerHTML = '';
    for (let i = 0; i < 5; i++) addScanRow(container);
    updateScanTotals(container);
}

function updateScanTotals(container) {
    const valid = scanRows.filter(r => r.item && parseFloat(r.qty) > 0 && parseFloat(r.rate) > 0);
    const total = valid.reduce((s, r) => s + (parseFloat(r.amount) || parseFloat(r.qty) * parseFloat(r.rate) || 0), 0);
    const countEl = container.querySelector('#scan-item-count');
    const totalEl = container.querySelector('#scan-total');
    const saveBtn = container.querySelector('#save-all-btn');
    if (countEl) countEl.textContent = valid.length;
    if (totalEl) totalEl.textContent = '₹' + total.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    if (saveBtn) {
        saveBtn.innerHTML = `<i data-lucide="check" style="width:15px;height:15px;"></i> Save All (${valid.length})`;
        lucide.createIcons({ root: saveBtn });
    }
}

function handleScanKeydown(e, id, field, container) {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const order = ['item', 'qty', 'rate', 'amt'];
    const idx = order.indexOf(field);

    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        if (field === 'rate' || field === 'amt') {
            e.preventDefault();
            const rowIdx = scanRows.findIndex(r => r.id === id);
            if (rowIdx < scanRows.length - 1) {
                container.querySelector('#item_' + scanRows[rowIdx + 1].id)?.focus();
            } else {
                addScanRow(container);
                container.querySelector('#item_' + scanRows[scanRows.length - 1].id)?.focus();
            }
        } else if (idx >= 0 && idx < order.length - 1 && e.key === 'Enter') {
            e.preventDefault();
            container.querySelector('#' + order[idx + 1] + '_' + id)?.focus();
        }
    }
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveAllToLog(container) {
    const date      = container.querySelector('#scan-date').value.trim();
    const supplier  = container.querySelector('#scan-supplier').value.trim();
    const invoiceNo = container.querySelector('#scan-invoice').value.trim();

    if (!date) {
        window.showToast('Please enter date', 'error');
        container.querySelector('#scan-date').focus();
        return;
    }
    if (!supplier) {
        window.showToast('Please enter supplier name', 'error');
        container.querySelector('#scan-supplier').focus();
        return;
    }

    const validRows = scanRows.filter(r => r.item && parseFloat(r.qty) > 0 && parseFloat(r.rate) > 0);
    if (validRows.length === 0) {
        window.showToast('No valid items to save — fill in item, qty and rate', 'error');
        return;
    }

    const saveBtn = container.querySelector('#save-all-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader" style="width:15px;height:15px;"></i> Saving…`;
    lucide.createIcons({ root: saveBtn });

    try {
        let vendors = await api.getVendors();
        let vendor  = vendors.find(v => v.name.toLowerCase() === supplier.toLowerCase());
        const vendorId = vendor ? vendor.id : (await api.addVendor(supplier)).id;

        const categories = await api.getCategories();
        const categoryMap = {};
        categories.forEach(c => categoryMap[c.name] = c.id);

        const payload = validRows.map(r => {
            const qty    = parseFloat(r.qty)    || 0;
            const rate   = parseFloat(r.rate)   || 0;
            const gstPct = parseFloat(r.gstPercent) || 0;
            const amount = parseFloat(r.amount) || qty * rate;
            const taxableAmount = amount;
            const cgst = parseFloat((taxableAmount * gstPct / 100 / 2).toFixed(2)) || 0;
            const sgst = parseFloat((taxableAmount * gstPct / 100 / 2).toFixed(2)) || 0;
            const finalAmount = taxableAmount + cgst + sgst;
            
            return {
                date,
                supplierName: supplier,
                invoiceNo,
                item:        r.item,
                category:    r.category,
                categoryId:  categoryMap[r.category] || null,
                unit:        r.unit || 'pcs',
                quantity:    qty,
                price:       rate,
                total:       qty * rate,
                gstPercent:  gstPct,
                cgst:        cgst,
                sgst:        sgst,
                igst:        0,
                cess:        0,
                finalAmount: finalAmount,
                vendorId,
                alert:       r.alert,
                remarks:     'Scan Entry'
            };
        });

        await api.addPurchasesBatch(payload);

        const total = validRows.reduce((s, r) => s + (parseFloat(r.amount) || parseFloat(r.qty) * parseFloat(r.rate) || 0), 0);
        window.showToast(`${validRows.length} item${validRows.length !== 1 ? 's' : ''} saved!`);

        container.querySelector('#scan-success-msg').innerHTML = `
            <div class="card mt-3" style="border-left:3px solid var(--success); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                <div>
                    <div style="color:var(--success); font-weight:600; font-size:14px;">
                        <i data-lucide="check-circle" style="width:15px;height:15px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                        ${validRows.length} item${validRows.length !== 1 ? 's' : ''} saved to Purchase Log
                    </div>
                    <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">
                        ${date} · ${supplier}${invoiceNo ? ' · Bill: ' + escapeHtml(invoiceNo) : ''} · Total: ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-outline btn-sm" id="btn-start-new">+ New Invoice</button>
                    <button class="btn btn-primary btn-sm" id="btn-view-log">View Records</button>
                </div>
            </div>
        `;
        lucide.createIcons({ root: container.querySelector('#scan-success-msg') });

        container.querySelector('#btn-start-new').addEventListener('click', () => {
            const today = new Date().toISOString().slice(0, 10);
            container.querySelector('#scan-date').value    = today;
            container.querySelector('#scan-supplier').value = '';
            container.querySelector('#scan-invoice').value  = '';
            // clear image
            container.querySelector('#invoice-img').src        = '';
            container.querySelector('#invoice-preview').style.display = 'none';
            container.querySelector('#invoice-file').value     = '';
            clearScanRows(container);
            container.querySelector('#scan-success-msg').innerHTML = '';
            container.querySelector('#scan-date').focus();
        });

        container.querySelector('#btn-view-log').addEventListener('click', () => {
            window.location.hash = '#/records';
        });

        // Reset rows after save
        scanRows = [];
        container.querySelector('#scan-rows-body').innerHTML = '';
        for (let i = 0; i < 5; i++) addScanRow(container);
        updateScanTotals(container);
        refreshKnownItems();

    } catch (err) {
        console.error(err);
        window.showToast('Save failed: ' + err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        updateScanTotals(container);
    }
}

