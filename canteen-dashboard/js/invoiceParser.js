/**
 * invoiceParser.js  v2  —  Indian Standard GST Invoice Parser
 *
 * Handles:
 *  • Multi-column GST tables (HSN | Item | Qty | Unit | Rate | Taxable | CGST% | CGST | SGST% | SGST | Total)
 *  • Indian number format  ₹1,00,000.50  /  Rs.500  /  plain 1,500.00
 *  • CGST / SGST / IGST rows  →  skipped automatically
 *  • HSN / SAC codes         →  detected and stripped from item rows
 *  • GSTIN-anchored supplier extraction
 *  • Common OCR mis-reads (0/O, 1/I, 5/S)
 */

// ── Unit map ─────────────────────────────────────────────────────────────────
const UNIT_MAP = {
    'kg':'kg','kgs':'kg','kilo':'kg','kilogram':'kg','kilograms':'kg',
    'g':'g','gm':'g','gms':'g','gram':'g','grams':'g',
    'l':'litre','ltr':'litre','lts':'litre','litre':'litre','litres':'litre',
    'liter':'litre','liters':'litre',
    'ml':'ml',
    'pcs':'pcs','pc':'pcs','piece':'pcs','pieces':'pcs',
    'nos':'pcs','no':'pcs','number':'pcs',
    'dz':'dozen','dzn':'dozen','dozen':'dozen','doz':'dozen',
    'pk':'pack','pkt':'pack','pack':'pack','packs':'pack',
    'packet':'pack','packets':'pack',
    'box':'box','bx':'box','boxes':'box',
    'srv':'service','service':'service','svc':'service',
    'bd':'bundle','bundle':'bundle','bndl':'bundle',
    'mtr':'mtr','meter':'mtr','metre':'mtr','meters':'mtr','m':'mtr',
    'sqft':'sqft','sft':'sqft','sqm':'sqm',
    'ctn':'ctn','carton':'ctn',
    'btl':'bottle','bottle':'bottle','bottles':'bottle',
    'tin':'tin','tins':'tin',
    'skt':'sachet','sachet':'sachet',
    'ltr':'litre',
    'doz':'dozen',
};

function normaliseUnit(raw) {
    if (!raw) return 'kg';
    const s = raw.toLowerCase().replace(/[^a-z]/g, '');
    return UNIT_MAP[s] || raw.toLowerCase().trim() || 'kg';
}

// ── Indian number parser ─────────────────────────────────────────────────────
// Strips:  ₹  Rs.  Rs  and commas (Indian 1,00,000 format)
function parseIndianNum(s) {
    if (s === null || s === undefined || s === '') return NaN;
    const clean = String(s)
        .replace(/[₹₹]/g, '')
        .replace(/^Rs\.?\s*/i, '')
        .replace(/\s+/g, '')
        .replace(/,/g, '');
    return parseFloat(clean);
}

// ── Date extractor ───────────────────────────────────────────────────────────
function normalizeOcrText(text) {
    return String(text || '')
        .replace(/[oO]/g, '0')
        .replace(/[lI]/g, '1')
        .replace(/[sS](?=\d)/g, '5')
        .replace(/[‘’`´]/g, "'")
        .replace(/[\u2013\u2014]/g, '-');
}

function parseDateCandidate(candidate) {
    const t = normalizeOcrText(candidate).trim();
    const patterns = [
        /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/,
        /\b(\d{1,2})[-./](\d{1,2})[-./](\d{4})\b/,
        /\b(\d{1,2})[-./](\d{1,2})[-./](\d{2})\b/,
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4}|\d{2})\b/i,
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
    ];
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

    for (const re of patterns) {
        const m = t.match(re);
        if (!m) continue;
        let y, mo, d;

        if (re.source.startsWith('\\b(\\d{4})')) {
            [, y, mo, d] = m.map(Number);
        } else if (/Jan|Feb/i.test(re.source) && re.source.startsWith('\\b(Jan')) {
            const mn = m[1].toLowerCase().slice(0, 3);
            d = parseInt(m[2], 10); mo = months[mn]; y = parseInt(m[3], 10); if (y < 100) y += 2000;
        } else if (/Jan|Feb/i.test(re.source)) {
            d = parseInt(m[1], 10);
            const mn = m[2].toLowerCase().slice(0, 3);
            mo = months[mn]; y = parseInt(m[3], 10); if (y < 100) y += 2000;
        } else {
            d = parseInt(m[1], 10); mo = parseInt(m[2], 10); y = parseInt(m[3], 10);
            if (y < 100) y += 2000;
            if (mo > 12 && d <= 12) [d, mo] = [mo, d];
        }

        if (!d || !mo || !y || mo > 12 || d > 31) continue;
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
}

export function extractDate(text) {
    const cleaned = normalizeOcrText(text);
    const labelMatch = cleaned.match(/(?:invoice\s*date|bill\s*date|date|dt)\s*[:\-–]?\s*([\d\w\s\-/.,]{6,40})/i);
    if (labelMatch) {
        const candidate = labelMatch[1].split(/[|]/)[0].trim();
        const parsed = parseDateCandidate(candidate);
        if (parsed) return parsed;
    }

    const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const parsed = parseDateCandidate(line);
        if (parsed) return parsed;
    }
    return null;
}

// ── Invoice number extractor ─────────────────────────────────────────────────
export function extractInvoiceNo(text) {
    const cleaned = normalizeOcrText(text);
    const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const labelPatterns = [
        /(?:tax\s+invoice|invoice|inv|bill|challan|receipt|voucher|ref|memo)\s*(?:no|number|#|num)?\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/-\s]{1,40})/i,
        /(?:no|number|#)\s*\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/-\s]{1,40})/i,
    ];

    for (const line of lines) {
        for (const re of labelPatterns) {
            const m = line.match(re);
            if (m) return m[1].trim().replace(/\s+/g, ' ');
        }
    }

    const fallback = cleaned.match(/\b([A-Z]{1,4}[\/\-]?\d{3,12}|\d{4,12})\b/);
    return fallback ? fallback[1].trim() : '';
}

// ── GSTIN extractor ──────────────────────────────────────────────────────────
export function extractGSTIN(text) {
    const m = text.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/);
    return m ? m[1] : '';
}

// ── GST Percent extractor ────────────────────────────────────────────────────
export function extractGSTPercent(text) {
    // Look for patterns like "9%", "18%", "28%" for GST rates
    const cleaned = normalizeOcrText(text);
    const matches = cleaned.match(/\b(0\.25|0\.5|1|1\.5|2\.5|5|6|9|12|14|18|28)(?:\s*%|\s*gst)/i);
    if (matches) return parseFloat(matches[1]);
    
    // Try pattern: "GST 9" or "GST: 18%"
    const gstMatch = cleaned.match(/\bGST\s*:?\s*(\d{1,2}(?:\.\d+)?)\s*%?\b/i);
    if (gstMatch) return parseFloat(gstMatch[1]);
    return null;
}

// ── CGST/SGST/IGST/CESS extractors from row data ─────────────────────────────
export function extractTaxFromRow(line) {
    const cleaned = normalizeOcrText(line);
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    
    const NUM_RE = /^-?\d{1,9}(?:[.,]\d{1,4})?$/;
    const isNum = s => NUM_RE.test(s.replace(/,/g, ''));
    const parseN = s => parseFloat(s.replace(/,/g, ''));
    
    // Extract all numbers from the line
    const numbers = tokens.filter(isNum).map(parseN);
    
    // Typical patterns from GST invoices:
    // CGST row: values appear like [rate, cgst_amount, sgst_rate, sgst_amount, cess, total]
    // or simpler: [cgst%, cgst_amt, sgst%, sgst_amt, cess, total]
    
    let cgst = null, sgst = null, igst = null, cess = null;
    
    // If line contains CGST/SGST pattern, extract the amounts
    if (/cgst/i.test(line)) {
        // CGST line typically has the percentage and amount
        const cgstMatch = cleaned.match(/cgst[^%]*?(\d{1,2}(?:\.\d+)?)\s*%?\s*[\d,.\s]*(\d{1,9}(?:\.\d+)?)/i);
        if (cgstMatch) cgst = parseFloat(cgstMatch[2]);
    }
    
    if (/sgst/i.test(line)) {
        const sgstMatch = cleaned.match(/sgst[^%]*?(\d{1,2}(?:\.\d+)?)\s*%?\s*[\d,.\s]*(\d{1,9}(?:\.\d+)?)/i);
        if (sgstMatch) sgst = parseFloat(sgstMatch[2]);
    }
    
    if (/igst/i.test(line)) {
        const igstMatch = cleaned.match(/igst[^%]*?(\d{1,2}(?:\.\d+)?)\s*%?\s*[\d,.\s]*(\d{1,9}(?:\.\d+)?)/i);
        if (igstMatch) igst = parseFloat(igstMatch[2]);
    }
    
    if (/cess/i.test(line)) {
        const cessMatch = cleaned.match(/cess[^%]*?(\d{1,2}(?:\.\d+)?)\s*%?\s*[\d,.\s]*(\d{1,9}(?:\.\d+)?)/i);
        if (cessMatch) cess = parseFloat(cessMatch[2]);
    }
    
    // If no explicit tax row matched, try to infer from general numbers
    // Usually CGST = SGST = same value (for intra-state) or 0 for IGST invoice
    if (!cgst && !sgst && numbers.length >= 2) {
        // Last few numbers are usually taxes; if there are pairs of similar numbers, they might be CGST/SGST
        if (numbers.length >= 2) {
            const last = numbers[numbers.length - 1];
            const secondLast = numbers[numbers.length - 2];
            // If they're similar (within 20%), might be CGST/SGST pair
            if (last > 0 && secondLast > 0 && Math.abs(last - secondLast) / Math.max(last, secondLast) < 0.2) {
                cgst = secondLast;
                sgst = last;
            }
        }
    }
    
    return { cgst, sgst, igst, cess };
}

// ── Supplier extractor ───────────────────────────────────────────────────────
export function extractSupplier(text) {
    const cleaned = normalizeOcrText(text);
    const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
        const m = line.match(/^(?:from|supplier|vendor|party|sold\s+by|billed?\s+by|bill\s*to|ship\s*to|company|firm|name|seller)\s*[:\-]?\s*(.+)$/i);
        if (m) {
            const value = m[1].trim();
            if (value.length > 2) return value;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (/^(?:bill\s*to|ship\s*to|from|supplier|vendor|party|seller)\b/i.test(lines[i])) {
            const labelOnly = lines[i].replace(/^(?:bill\s*to|ship\s*to|from|supplier|vendor|party|seller)\b[:\-]?/i, '').trim();
            if (labelOnly.length > 2) return labelOnly;
            if (lines[i + 1] && !/^(?:invoice|bill|date|gst|hsn|tax|total|amount|qty|rate|phone|address|pan|cin|email|web|bank)/i.test(lines[i + 1])) {
                return lines[i + 1];
            }
        }
    }

    const gstinMatch = cleaned.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/);
    if (gstinMatch) {
        const idx = cleaned.indexOf(gstinMatch[0]);
        const before = cleaned.slice(Math.max(0, idx - 300), idx);
        const gstLines = before.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 3);
        for (const line of gstLines.slice(-5).reverse()) {
            if (/^\d/.test(line)) continue;
            if (/^(?:invoice|bill|tax|date|gst|hsn|total|amount|item|phone|address|pin|mob|email|web|state|bank)/i.test(line)) continue;
            return line.replace(/[*_#|]+/g, '').trim();
        }
    }

    for (const line of lines.slice(0, 8)) {
        if (/^\d/.test(line)) continue;
        if (/^(?:invoice|bill|date|gst|hsn|tax|total|amount|item|description|qty|rate|sr|sl|no\.|phone|address|gstin|pan|cin|email|web|bank)/i.test(line)) continue;
        if (line.split(/\s+/).length >= 2 && line.length > 4) return line.replace(/[*_#|]+/g, '').trim();
    }
    return '';
}

// ── Fuzzy item matcher ───────────────────────────────────────────────────────
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i || j)
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    return dp[m][n];
}

export function fuzzyMatchItem(raw, knownItems) {
    if (!raw) return null;
    const clean = raw.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (!clean) return null;

    const exact = knownItems.find(k => k.toLowerCase() === clean);
    if (exact) return exact;

    const sw = knownItems.filter(k =>
        k.toLowerCase().startsWith(clean) || clean.startsWith(k.toLowerCase())
    );
    if (sw.length === 1) return sw[0];
    if (sw.length > 1) return sw.sort((a, b) => a.length - b.length)[0];

    const maxDist = clean.length < 6 ? 2 : 3;
    let best = null, bestDist = Infinity;
    for (const k of knownItems) {
        const d = levenshtein(clean, k.toLowerCase());
        if (d < bestDist && d <= maxDist) { best = k; bestDist = d; }
    }
    return best;
}

// ── Row skip patterns (GST-aware) ────────────────────────────────────────────
const SKIP_RE = [
    // Table headers
    /^(?:s\.?no|sr\.?\s*no|sl\.?\s*no|sno|#)\s*[.:\s]/i,
    /^(?:item|goods|description|particulars|product|material)(?:\s+(?:name|desc|details))?[:\s#./]?$/i,
    /^(?:qty|quantity|uom|unit(?:\s+of\s+meas(?:ure)?)?)(?:[:\s#./]|$)/i,
    /^(?:rate|price|unit\s*(?:price|rate)|mrp|basic\s*(?:rate|price)?)(?:[:\s#./]|$)/i,
    /^(?:amount|value|amt|taxable\s*(?:value|amount)|basic\s*amount)(?:[:\s#./]|$)/i,
    /^(?:hsn|sac|hsn\/sac|hsn\s*code|sac\s*code)(?:[:\s#./]|$)/i,
    // Tax rows
    /\b(?:cgst|sgst|igst|utgst|cess)\b/i,
    /\btax\s*(?:amount|total|@|%)/i,
    /\b(?:output|input)\s*tax\b/i,
    // Totals & summaries
    /\b(?:sub.?total|grand.?total|net.?(?:amount|total|payable)|bill\s*amount|invoice\s*total)\b/i,
    /\b(?:total|balance|payable|due|net)\s*(?:tax|gst|amount|payable|value|rs|inr)?[:\s]*[\d₹]/i,
    /\b(?:round.?off|rounding|adjustment|adj\.?)\b/i,
    // Extra charges
    /\b(?:freight|shipping|delivery|transport|packing|loading|labour|labor|handling|forwarding|insurance)\b/i,
    /\b(?:discount|rebate|trade\s*disc(?:ount)?)\b.*\d/i,
    /\b(?:advance|received|balance\s*due|paid\s*amount)\b/i,
    // Metadata lines
    /^(?:date|invoice|bill|from|supplier|vendor|party|phone|mob|address|gstin|pan|cin|email|website|bank|ifsc|account|upi)(?:[:\s#./]|$)/i,
    // Separator lines
    /^\s*[-=*_]{3,}\s*$/,
];

function shouldSkip(line) {
    return SKIP_RE.some(re => re.test(line));
}

// Common Indian GST rates (used to filter tax-% columns in multi-column rows)
const GST_RATE_SET = new Set([0.1, 0.25, 1, 1.5, 2.5, 5, 6, 9, 12, 14, 18, 28]);
function isGSTRate(v) {
    return GST_RATE_SET.has(v) || GST_RATE_SET.has(parseFloat((v * 2).toFixed(2)));
}

// HSN/SAC: 4-8 digit integer, no decimal
function isHSNCode(s) {
    return /^\d{4,8}$/.test(s);
}

// ── Item row regex (unit at end of text portion) ─────────────────────────────
const UNIT_RE = /^(kg|kgs?|g|gm|gms?|l|ltr?|lts?|litre?s?|ml|pcs?|piece?s?|nos?|no|number|dz|doz|dozen|pk|pkt|pack|box|bx|bundle|bd|srv|service|mtr?|sqft?|ctn|btl|bottle|tin|skt|sachet)$/i;

// ── Core item extractor ──────────────────────────────────────────────────────
/**
 * @param {string}   text        Raw OCR output
 * @param {string[]} knownItems  Known item names for fuzzy matching
 * @returns {Array<{item,rawItem,unit,qty,rate,amount,confidence}>}
 */
export function extractItems(text, knownItems = []) {
    // Pre-clean: strip ₹/Rs. from the full text so tokenisation is cleaner
    const cleaned = text
        .replace(/[₹₹]/g, ' ')
        .replace(/\bRs\.?\s*/gi, ' ');

    const lines = cleaned.split(/\n/).map(l =>
        l.replace(/\|/g, ' ').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim()
    );

    const NUM_RE = /^-?\d{1,9}(?:[.,]\d{1,4})?$/;
    const isNum  = s => NUM_RE.test(s.replace(/,/g, ''));
    const parseN = s => parseFloat(s.replace(/,/g, ''));

    const items = [];

    for (const line of lines) {
        if (line.length < 3) continue;
        if (shouldSkip(line)) continue;

        const tokens = line.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) continue;
        if (tokens[0].length > 25) continue;  // company address, not item

        // ── Strip leading serial number ──────────────────────────────────
        let rest = [...tokens];
        if (isNum(rest[0]) && parseN(rest[0]) < 2000 && !rest[0].includes('.')) {
            rest = rest.slice(1);
        }
        if (rest.length < 2) continue;

        // ── Remove ONE HSN/SAC code token (4-8 plain digits) ────────────
        // It typically appears right after the item description text
        // We scan left-to-right and remove the first token that looks like HSN
        let hsnRemoved = false;
        rest = rest.filter(tok => {
            if (!hsnRemoved && isHSNCode(tok)) { hsnRemoved = true; return false; }
            return true;
        });
        if (rest.length < 2) continue;

        // ── Find the longest TRAILING run of numbers ─────────────────────
        let trailNums = [];
        for (let i = rest.length - 1; i >= 0; i--) {
            if (isNum(rest[i])) {
                trailNums.unshift({ i, val: parseN(rest[i]) });
            } else break;
        }

        // Need at least 2 trailing numbers
        if (trailNums.length < 2) {
            // scattered numbers — pick last 3
            const all = rest
                .map((t, i) => isNum(t) ? { i, val: parseN(t) } : null)
                .filter(Boolean);
            if (all.length >= 2) trailNums = all.slice(-3);
            else continue;
        }

        // ── Remove GST rate tokens from trailing numbers ─────────────────
        // e.g. columns:  qty  rate  taxable_amt  9  tax_amt  9  tax_amt  total
        const nonGST = trailNums.filter(t => !isGSTRate(t.val));
        const relevant = nonGST.length >= 2 ? nonGST : trailNums;

        // ── Extract qty, rate, amount ────────────────────────────────────
        let qty, rate, amount;

        if (relevant.length >= 3) {
            qty    = relevant[relevant.length - 3].val;
            rate   = relevant[relevant.length - 2].val;
            amount = relevant[relevant.length - 1].val;
        } else {
            qty    = relevant[0].val;
            rate   = relevant[1].val;
            amount = parseFloat((qty * rate).toFixed(2));
        }

        // ── Sanity: amount ≈ qty × rate (25% tolerance for discounts/rounding) ──
        if (qty > 0 && rate > 0 && amount > 0) {
            const exp = qty * rate;
            if (Math.abs(exp - amount) > exp * 0.25) {
                // Try swap qty ↔ rate
                if (Math.abs(rate * qty - amount) <= (rate * qty) * 0.25) {
                    [qty, rate] = [rate, qty];
                } else if (relevant.length >= 2) {
                    // Recompute with last 2 only
                    qty    = relevant[relevant.length - 2].val;
                    rate   = relevant[relevant.length - 1].val;
                    amount = parseFloat((qty * rate).toFixed(2));
                }
            }
        }

        if (!qty  || qty  <= 0 || qty  > 100000) continue;
        if (!rate || rate <= 0 || rate > 1000000) continue;

        // ── Extract item name (everything before the first relevant number) ──
        const firstRelevantIdx = relevant.length >= 3
            ? relevant[relevant.length - 3].i
            : relevant[0].i;
        let textTokens = rest.slice(0, firstRelevantIdx);

        // Check last text token is a unit
        let unit = 'kg';
        if (textTokens.length > 0 && UNIT_RE.test(textTokens[textTokens.length - 1])) {
            unit = normaliseUnit(textTokens.pop());
        }

        const rawName = textTokens
            .join(' ')
            .replace(/^\d+\.?\s*/, '')
            .replace(/[*_#|]+/g, '')
            .trim();

        if (!rawName || rawName.length < 2) continue;

        // ── Fuzzy match & confidence ─────────────────────────────────────
        const matchedName = fuzzyMatchItem(rawName, knownItems) || capitalise(rawName);
        const exp = qty * rate;
        const amtClose = amount > 0 ? Math.abs(exp - amount) / exp < 0.15 : true;
        const confidence = (matchedName !== capitalise(rawName) ? 0.4 : 0)
                         + (amtClose ? 0.4 : 0)
                         + (UNIT_RE.test(unit) ? 0.2 : 0);

        items.push({ item: matchedName, rawItem: rawName, unit, qty, rate, amount, confidence });
    }

    // De-duplicate: keep first occurrence
    const seen = new Set();
    return items.filter(it => {
        const key = it.item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ── Extract overall tax details from invoice ─────────────────────────────────
function extractInvoiceTaxes(text) {
    const cleaned = normalizeOcrText(text);
    const lines = cleaned.split(/\n/).map(l => l.trim()).filter(Boolean);
    
    let gstPercent = null;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;
    
    // Parse each line looking for tax information
    for (const line of lines) {
        if (/cgst|sgst|igst|cess/i.test(line)) {
            const taxes = extractTaxFromRow(line);
            if (taxes.cgst) totalCgst += taxes.cgst;
            if (taxes.sgst) totalSgst += taxes.sgst;
            if (taxes.igst) totalIgst += taxes.igst;
            if (taxes.cess) totalCess += taxes.cess;
        }
        
        // Try to extract GST percentage from line
        if (!gstPercent && /gst|tax/i.test(line)) {
            const pctMatch = line.match(/\b(\d{1,2})(?:\s*%|\s*(?:gst|tax))/i);
            if (pctMatch) gstPercent = parseFloat(pctMatch[1]);
        }
    }
    
    // If no specific percentage found but we have taxes, try to reverse-calculate
    if (!gstPercent && totalCgst > 0) {
        // Rough estimate: if CGST ≈ SGST, then total tax rate ≈ CGST + SGST
        // For 9% GST: CGST = SGST = 4.5%
        // For 18% GST: CGST = SGST = 9%
        if (totalCgst === totalSgst) {
            gstPercent = totalCgst * 2; // Each is half
        }
    }
    
    return {
        gstPercent: gstPercent || null,
        totalCgst: totalCgst || null,
        totalSgst: totalSgst || null,
        totalIgst: totalIgst || null,
        totalCess: totalCess || null
    };
}

// ── Helper ───────────────────────────────────────────────────────────────────
function capitalise(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Master parse function ────────────────────────────────────────────────────
export function parseInvoice(ocrText, knownItems = []) {
    const taxes = extractInvoiceTaxes(ocrText);
    return {
        date:       extractDate(ocrText)      || '',
        invoiceNo:  extractInvoiceNo(ocrText) || '',
        supplier:   extractSupplier(ocrText)  || '',
        gstin:      extractGSTIN(ocrText)     || '',
        gstPercent: taxes.gstPercent,
        cgst:       taxes.totalCgst,
        sgst:       taxes.totalSgst,
        igst:       taxes.totalIgst,
        cess:       taxes.totalCess,
        items:      extractItems(ocrText, knownItems),
        rawText:    ocrText,
    };
}
