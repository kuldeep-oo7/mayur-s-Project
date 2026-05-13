export function getMonthKey(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return parts[0] + '-' + parts[1]; // ISO YYYY-MM
    return '';
}

export function formatMonth(yyyy_mm) {
    if (!yyyy_mm) return '';
    const parts = yyyy_mm.split('-');
    if (parts.length !== 2) return yyyy_mm;
    const [yyyy, mm] = parts;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const idx = parseInt(mm) - 1;
    return (idx >= 0 && idx < 12) ? `${months[idx]} ${yyyy}` : yyyy_mm;
}

export function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function catClass(cat) {
    const m = { 
        'Vegetable': 'b-vegetable', 
        'Grocery/Dry': 'b-grocery', 
        'Dairy': 'b-dairy', 
        'Fruit': 'b-fruit', 
        'Spice': 'b-spice' 
    };
    return 'b-' + (m[cat] || 'other');
}
