const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const db = require('./db');
const { initGemini } = require('./gemini');

const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

function isLocalOrigin(origin) {
    return origin && (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://[::1]') ||
        origin.startsWith('http://0.0.0.0')
    );
}

function isVercelOrigin(origin) {
    return origin && origin.endsWith('.vercel.app');
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || isLocalOrigin(origin) || isVercelOrigin(origin)) {
            return callback(null, true);
        }
        console.warn('CORS blocked request from origin:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set.');
    process.exit(1);
}

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
const missing = requiredEnvVars.filter(varName => !process.env[varName]);
if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(maxRequests, windowMs) {
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        const record = rateLimitMap.get(key) || { count: 0, start: now };
        if (now - record.start > windowMs) { record.count = 1; record.start = now; }
        else record.count++;
        rateLimitMap.set(key, record);
        if (record.count > maxRequests) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        next();
    };
}

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', rateLimit(10, 60000), (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', { origin: req.headers.origin, ip: req.ip, username });
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string')
        return res.status(400).json({ error: 'Username and password are required' });
    if (username.length > 64 || password.length > 128)
        return res.status(400).json({ error: 'Invalid credentials' });

    db.get('SELECT * FROM users WHERE username = ? AND status = ?', [username.trim(), 'active'], async (err, user) => {
        if (err)   return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '8h', issuer: 'canteen-dashboard' }
        );
        res.json({ message: 'Login successful', token, user: { id: user.id, username: user.username, role: user.role } });
    });
});

function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, { issuer: 'canteen-dashboard' }, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
}

function validateString(value, name, maxLen = 255) {
    if (!value || typeof value !== 'string' || !value.trim()) return `${name} is required`;
    if (value.length > maxLen) return `${name} must be under ${maxLen} characters`;
    return null;
}

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users/me', authenticateToken, (req, res) => res.json({ user: req.user }));

app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT id, username, role, status FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    const uErr = validateString(username, 'Username', 64); if (uErr) return res.status(400).json({ error: uErr });
    const pErr = validateString(password, 'Password', 128); if (pErr) return res.status(400).json({ error: pErr });
    if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Role must be admin or staff' });

    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username.trim(), hash, role], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, username: username.trim(), role, status: 'active' });
    });
});

// ── Vendors ───────────────────────────────────────────────────────────────────
app.get('/api/vendors', authenticateToken, (req, res) => {
    db.all('SELECT * FROM vendors ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/vendors', authenticateToken, (req, res) => {
    const err = validateString(req.body.name, 'Vendor name');
    if (err) return res.status(400).json({ error: err });
    db.run('INSERT INTO vendors (name) VALUES (?)', [req.body.name.trim()], function(dbErr) {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        res.json({ id: this.lastID, name: req.body.name.trim(), status: 'active' });
    });
});

// ── Categories ────────────────────────────────────────────────────────────────
app.get('/api/categories', authenticateToken, (req, res) => {
    db.all('SELECT * FROM categories ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categories', authenticateToken, (req, res) => {
    const err = validateString(req.body.name, 'Category name');
    if (err) return res.status(400).json({ error: err });
    db.run('INSERT INTO categories (name) VALUES (?)', [req.body.name.trim()], function(dbErr) {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        res.json({ id: this.lastID, name: req.body.name.trim(), status: 'active' });
    });
});

// ── Items ─────────────────────────────────────────────────────────────────────
app.get('/api/items', authenticateToken, (req, res) => {
    db.all('SELECT * FROM items ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/items', authenticateToken, (req, res) => {
    const { name, categoryId, defaultPrice, unit } = req.body;
    const nameErr = validateString(name, 'Item name');
    if (nameErr) return res.status(400).json({ error: nameErr });
    if (!categoryId || isNaN(Number(categoryId))) return res.status(400).json({ error: 'Valid categoryId is required' });
    if (defaultPrice !== undefined && isNaN(Number(defaultPrice))) return res.status(400).json({ error: 'defaultPrice must be a number' });

    db.run(
        'INSERT INTO items (name, categoryId, defaultPrice, unit) VALUES (?, ?, ?, ?)',
        [name.trim(), Number(categoryId), defaultPrice ? Number(defaultPrice) : null, unit || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, name: name.trim(), categoryId, defaultPrice, unit, status: 'active' });
        }
    );
});

// ── Status toggle ─────────────────────────────────────────────────────────────
app.put('/api/:type/:id/status', authenticateToken, (req, res) => {
    const { type, id } = req.params;
    const { status } = req.body;
    const tableMap = { vendors: 'vendors', categories: 'categories', items: 'items', users: 'users' };
    const table = tableMap[type];
    if (!table) return res.status(400).json({ error: 'Invalid type' });
    if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Status must be active or inactive' });
    if (table === 'users' && req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    db.run(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, Number(id)], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated' });
    });
});

// ── Stats / Analytics ─────────────────────────────────────────────────────────

// Returns list of distinct months that have purchase data (newest first)
app.get('/api/stats/months', authenticateToken, (req, res) => {
    db.all(
        `SELECT DISTINCT STRFTIME('%Y-%m', date) as month FROM purchases ORDER BY month DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => r.month));
        }
    );
});

app.get('/api/stats/summary', authenticateToken, (req, res) => {
    const runQuery = (currentMonth) => {
        const monthPattern = `${currentMonth}%`;

        db.serialize(() => {
            const results = { month: currentMonth };
            let pending = 6;
            const done = (key, rows) => { results[key] = rows; if (--pending === 0) res.json(results); };
            const fail = (err) => res.status(500).json({ error: err.message });

            // KPIs scoped to selected month; avg order value is all-time
            db.all(
                `SELECT SUM(CASE WHEN date LIKE ? THEN finalAmount ELSE 0 END) as monthlySpend,
                        COUNT(CASE WHEN date LIKE ? THEN 1 END) as monthlyPurchases,
                        AVG(finalAmount) as avgOrderValue FROM purchases`,
                [monthPattern, monthPattern],
                (err, rows) => err ? fail(err) : done('kpis', rows)
            );
            // Top vendor and item scoped to selected month
            db.all(
                `SELECT v.name FROM purchases p JOIN vendors v ON p.vendorId = v.id
                 WHERE p.date LIKE ? GROUP BY p.vendorId ORDER BY SUM(p.finalAmount) DESC LIMIT 1`,
                [monthPattern], (err, rows) => err ? fail(err) : done('topVendor', rows));
            db.all(
                `SELECT item FROM purchases WHERE date LIKE ? GROUP BY item ORDER BY SUM(quantity) DESC LIMIT 1`,
                [monthPattern], (err, rows) => err ? fail(err) : done('topItem', rows));
            // Charts: vendor spend and category dist scoped to selected month
            db.all(
                `SELECT v.name as label, SUM(p.finalAmount) as value FROM purchases p
                 JOIN vendors v ON p.vendorId = v.id WHERE p.date LIKE ? GROUP BY p.vendorId ORDER BY value DESC`,
                [monthPattern], (err, rows) => err ? fail(err) : done('vendorSpend', rows));
            db.all(
                `SELECT category as label, SUM(finalAmount) as value FROM purchases
                 WHERE date LIKE ? GROUP BY category ORDER BY value DESC`,
                [monthPattern], (err, rows) => err ? fail(err) : done('categoryDist', rows));
            // Monthly trend always shows all months (for the trend chart)
            db.all(
                `SELECT STRFTIME('%Y-%m', date) as label, SUM(finalAmount) as value
                 FROM purchases GROUP BY label ORDER BY label ASC`,
                [], (err, rows) => err ? fail(err) : done('monthlyTrend', rows));
        });
    };

    // Accept explicit month param (YYYY-MM), otherwise auto-detect most recent data month
    if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
        runQuery(req.query.month);
    } else {
        db.get(
            `SELECT STRFTIME('%Y-%m', date) as month FROM purchases ORDER BY date DESC LIMIT 1`,
            [],
            (err, row) => runQuery(row?.month || new Date().toISOString().slice(0, 7))
        );
    }
});

app.get('/api/stats/trends/:item', authenticateToken, (req, res) => {
    db.all(`SELECT date, price, finalAmount FROM purchases WHERE item = ? ORDER BY date ASC`,
        [req.params.item],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/items/:id/price-history', authenticateToken, (req, res) => {
    db.all(
        `SELECT date, price, supplierName FROM purchases
         WHERE itemId = ? OR item = (SELECT name FROM items WHERE id = ?)
         ORDER BY date DESC LIMIT 5`,
        [req.params.id, req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ── Purchases ─────────────────────────────────────────────────────────────────
app.get('/api/purchases', authenticateToken, (req, res) => {
    const { month, vendorId } = req.query;
    const page   = req.query.page  ? parseInt(req.query.page)  : null;
    const limit  = req.query.limit ? parseInt(req.query.limit) : null;
    const offset = (page && limit) ? (page - 1) * limit : null;

    let sql = 'SELECT * FROM purchases WHERE 1=1';
    const params = [];
    if (month)    { sql += ' AND date LIKE ?'; params.push(`${month}%`); }
    if (vendorId && !isNaN(Number(vendorId))) { sql += ' AND vendorId = ?'; params.push(Number(vendorId)); }
    sql += ' ORDER BY date DESC';
    if (limit !== null) {
        sql += ' LIMIT ?'; params.push(limit);
        if (offset !== null) { sql += ' OFFSET ?'; params.push(offset); }
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/purchases', authenticateToken, (req, res) => {
    const p = req.body;
    if (!p.date || !p.item) return res.status(400).json({ error: 'date and item are required' });

    db.run(
        `INSERT INTO purchases (date, vendorId, itemId, categoryId, userId, supplierName, invoiceNo,
         item, category, unit, quantity, price, total, gst, igst, finalAmount, remarks, alert)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.date, p.vendorId||null, p.itemId||null, p.categoryId||null, req.user.id,
         p.supplierName||null, p.invoiceNo||null, p.item, p.category||null,
         p.unit||null, p.quantity||null, p.price||null, p.total||null,
         p.gst||null, p.igst||null, p.finalAmount||null, p.remarks||null, p.alert||null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, ...p });
        }
    );
});

app.post('/api/purchases/batch', authenticateToken, (req, res) => {
    const purchases = req.body;
    if (!Array.isArray(purchases) || purchases.length === 0)
        return res.status(400).json({ error: 'Expected non-empty array of purchases' });
    if (purchases.length > 500)
        return res.status(400).json({ error: 'Batch limit is 500 items' });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        let errorOccurred = false;

        const stmt = db.prepare(
            `INSERT INTO purchases (date, vendorId, itemId, categoryId, userId, supplierName, invoiceNo,
             item, category, unit, quantity, price, total, gst, igst, finalAmount, remarks, alert)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        );

        for (const p of purchases) {
            stmt.run([
                p.date, p.vendorId||null, p.itemId||null, p.categoryId||null, req.user.id,
                p.supplierName||null, p.invoiceNo||null, p.item, p.category||null,
                p.unit||null, p.quantity||null, p.price||null, p.total||null,
                p.gst||null, p.igst||null, p.finalAmount||null, p.remarks||null, p.alert||null
            ], (err) => { if (err) errorOccurred = true; });
        }

        stmt.finalize((err) => {
            if (err || errorOccurred) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Batch insert failed' });
            }
            db.run('COMMIT');
            // Fire spike alert emails for flagged rows
            purchases.forEach(p => {
                if (p.alert?.includes('spike') && p.price) {
                    db.get(
                        `SELECT price FROM purchases WHERE (itemId = ? OR item = ?) AND date < ? ORDER BY date DESC LIMIT 1`,
                        [p.itemId||null, p.item, p.date],
                        (_, row) => { if (row) sendSpikeAlert(p.item, p.price, row.price, p.supplierName); }
                    );
                }
            });
            res.json({ message: `Successfully saved ${purchases.length} items` });
        });
    });
});

app.delete('/api/purchases/:id', authenticateToken, (req, res) => {
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run('DELETE FROM purchases WHERE id = ?', [Number(req.params.id)], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
});

// ── Budgets ───────────────────────────────────────────────────────────────────
app.get('/api/budgets', authenticateToken, (req, res) => {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
        return res.status(400).json({ error: 'month parameter required (YYYY-MM)' });
    db.all('SELECT * FROM budgets WHERE month = ? ORDER BY category', [month], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/budgets', authenticateToken, requireAdmin, (req, res) => {
    const { month, category, amount } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Valid month required (YYYY-MM)' });
    const catErr = validateString(category, 'Category');
    if (catErr) return res.status(400).json({ error: catErr });
    if (isNaN(Number(amount)) || Number(amount) < 0) return res.status(400).json({ error: 'amount must be a non-negative number' });

    db.run(
        `INSERT INTO budgets (month, category, amount) VALUES (?, ?, ?)
         ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount`,
        [month, category.trim(), Number(amount)],
        function(dbErr) {
            if (dbErr) return res.status(500).json({ error: dbErr.message });
            res.json({ id: this.lastID || null, month, category: category.trim(), amount: Number(amount) });
        }
    );
});

app.delete('/api/budgets/:id', authenticateToken, requireAdmin, (req, res) => {
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run('DELETE FROM budgets WHERE id = ?', [Number(req.params.id)], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
});

// ── MDM: Master Data Management ───────────────────────────────────────────────

// Gujarati/Hindi → English transliteration for common canteen items
const SCRIPT_MAP = {
    'મરચા':'chili','મરચો':'chili','મરચ':'chili',
    'પાવડર':'powder','પાઉડર':'powder',
    'હળદર':'turmeric','ઘાણા':'coriander','ધાણા':'coriander',
    'જીરૂ':'cumin','જીરા':'cumin','રાઈ':'mustard',
    'હિંગ':'asafoetida','હીંગ':'asafoetida',
    'મેથી':'fenugreek','કસૂરી':'kasuri',
    'આખા':'whole','આખો':'whole','તજ':'cinnamon',
    'ખાંડ':'sugar','શુગર':'sugar','ગોળ':'jaggery',
    'આમળી':'tamarind','બેસન':'besan',
    'શિંગ':'peanut','શિંગદાણા':'groundnut',
    'મીઠું':'salt','નમક':'salt',
    'કાજૂ':'cashew','ચોખા':'rice','પાપડ':'papdi','પાપડી':'papdi',
    'ચા':'tea','પૌવા':'poha','પૌઆ':'poha','મમરા':'mamra',
    'મકઈ':'corn','ફ્રાઈ':'fry','ફ્રૈ':'fry',
    'किचन':'kitchen','किंग':'king','मसाला':'masala',
    'हल्दी':'turmeric','धनिया':'coriander','नमक':'salt',
    'चीनी':'sugar','मिर्च':'chili','मिर्ची':'chili',
};

function transliterateToEn(text) {
    return text.split(/\s+/).map(w => SCRIPT_MAP[w] || w).join(' ');
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j-1], dp[i][j-1], dp[i-1][j]);
    return dp[m][n];
}

function mdmNorm(s) {
    return (s || '').toLowerCase().trim()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9઀-૿ऀ-ॿ ]/g, ''); // keep Gujarati, Devanagari, Latin
}

function fuzzyScore(rawNorm, candidateNorm) {
    if (!rawNorm || !candidateNorm) return 0;
    if (rawNorm === candidateNorm) return 100;

    const longer  = rawNorm.length > candidateNorm.length ? rawNorm : candidateNorm;
    const shorter = rawNorm.length > candidateNorm.length ? candidateNorm : rawNorm;

    if (longer.startsWith(shorter))
        return Math.round(92 * shorter.length / longer.length);
    if (longer.includes(shorter) && shorter.length > 3)
        return Math.round(80 * shorter.length / longer.length);

    // Token Jaccard
    const tA = new Set(rawNorm.split(' ').filter(t => t.length > 1));
    const tB = new Set(candidateNorm.split(' ').filter(t => t.length > 1));
    if (tA.size && tB.size) {
        const inter = [...tA].filter(t => tB.has(t)).length;
        const union = new Set([...tA, ...tB]).size;
        if (inter > 0) return Math.round((inter / union) * 88);
    }

    // Levenshtein fallback
    const maxLen = Math.max(rawNorm.length, candidateNorm.length);
    return maxLen ? Math.max(0, Math.round((1 - levenshtein(rawNorm, candidateNorm) / maxLen) * 70)) : 0;
}

function resolveItem(raw) {
    return new Promise((resolve, reject) => {
        const rawNorm       = mdmNorm(raw);
        const rawTranslit   = mdmNorm(transliterateToEn(raw));

        db.all(
            `SELECT 'master' AS src, m.id AS master_id, m.standard_name AS candidate,
                    m.standard_name, m.base_unit, m.category, 1.0 AS conversion_factor
             FROM item_master m
             UNION ALL
             SELECT 'alias' AS src, m.id AS master_id, a.alias AS candidate,
                    m.standard_name, m.base_unit, m.category, 1.0 AS conversion_factor
             FROM item_aliases a JOIN item_master m ON a.item_master_id = m.id
             UNION ALL
             SELECT 'sku' AS src, m.id AS master_id, s.sku_name AS candidate,
                    m.standard_name, m.base_unit, m.category, s.conversion_factor
             FROM supplier_sku_map s JOIN item_master m ON s.item_master_id = m.id`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                if (!rows.length) return resolve({ matched: false, raw, confidence: 0 });

                let best = null;
                for (const row of rows) {
                    const cNorm = mdmNorm(row.candidate);
                    const s1 = fuzzyScore(rawNorm, cNorm);
                    const s2 = rawTranslit !== rawNorm ? fuzzyScore(rawTranslit, cNorm) : 0;
                    const score = Math.max(s1, s2);
                    if (!best || score > best.score) best = { ...row, score };
                }

                if (!best || best.score < 20) return resolve({ matched: false, raw, confidence: 0 });
                resolve({
                    matched:        best.score >= 50,
                    raw,
                    confidence:     best.score,
                    master_id:      best.master_id,
                    standard_name:  best.standard_name,
                    base_unit:      best.base_unit,
                    category:       best.category,
                    conversion_factor: best.conversion_factor || 1.0,
                    matched_via:    best.src,
                });
            }
        );
    });
}

// ── MDM API endpoints ─────────────────────────────────────────────────────────

// POST /api/mdm/resolve  — resolve a raw OCR string to item_master
app.post('/api/mdm/resolve', authenticateToken, async (req, res) => {
    const { raw, vendor_id } = req.body;
    if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'raw string required' });
    try {
        const result = await resolveItem(raw.trim());
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/mdm/resolve/batch  — resolve array of raw strings
app.post('/api/mdm/resolve/batch', authenticateToken, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
    try {
        const results = await Promise.all(items.map(raw => resolveItem(String(raw).trim())));
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/mdm/master
app.get('/api/mdm/master', authenticateToken, (req, res) => {
    db.all(
        `SELECT m.*,
            (SELECT COUNT(*) FROM item_aliases   WHERE item_master_id = m.id) AS alias_count,
            (SELECT COUNT(*) FROM supplier_sku_map WHERE item_master_id = m.id) AS sku_count
         FROM item_master m ORDER BY m.standard_name`,
        [], (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)
    );
});

// POST /api/mdm/master
app.post('/api/mdm/master', authenticateToken, requireAdmin, (req, res) => {
    const { standard_name, base_unit = 'KG', category } = req.body;
    const e = validateString(standard_name, 'standard_name');
    if (e) return res.status(400).json({ error: e });
    db.run(
        'INSERT INTO item_master (standard_name, base_unit, category) VALUES (?,?,?)',
        [standard_name.trim(), base_unit.trim(), category || null],
        function(err) {
            if (err) return res.status(err.message.includes('UNIQUE') ? 409 : 500).json({ error: err.message });
            res.json({ id: this.lastID, standard_name, base_unit, category });
        }
    );
});

// PUT /api/mdm/master/:id
app.put('/api/mdm/master/:id', authenticateToken, requireAdmin, (req, res) => {
    const { standard_name, base_unit, category } = req.body;
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run(
        'UPDATE item_master SET standard_name=?, base_unit=?, category=? WHERE id=?',
        [standard_name, base_unit, category || null, Number(req.params.id)],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
    );
});

// DELETE /api/mdm/master/:id
app.delete('/api/mdm/master/:id', authenticateToken, requireAdmin, (req, res) => {
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run('DELETE FROM item_master WHERE id=?', [Number(req.params.id)],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
    );
});

// GET /api/mdm/aliases?master_id=
app.get('/api/mdm/aliases', authenticateToken, (req, res) => {
    const { master_id } = req.query;
    const sql    = master_id ? 'SELECT * FROM item_aliases WHERE item_master_id=? ORDER BY alias'
                             : 'SELECT a.*, m.standard_name FROM item_aliases a JOIN item_master m ON a.item_master_id=m.id ORDER BY m.standard_name, a.alias';
    const params = master_id ? [Number(master_id)] : [];
    db.all(sql, params, (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// POST /api/mdm/aliases
app.post('/api/mdm/aliases', authenticateToken, (req, res) => {
    const { item_master_id, alias, language = 'en' } = req.body;
    if (!item_master_id || !alias) return res.status(400).json({ error: 'item_master_id and alias required' });
    db.run(
        'INSERT INTO item_aliases (item_master_id, alias, language, created_by) VALUES (?,?,?,?)',
        [Number(item_master_id), alias.trim(), language, req.user.username],
        function(err) {
            if (err) return res.status(err.message.includes('UNIQUE') ? 409 : 500).json({ error: err.message });
            res.json({ id: this.lastID, item_master_id, alias, language });
        }
    );
});

// DELETE /api/mdm/aliases/:id
app.delete('/api/mdm/aliases/:id', authenticateToken, requireAdmin, (req, res) => {
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run('DELETE FROM item_aliases WHERE id=?', [Number(req.params.id)],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
    );
});

// GET /api/mdm/sku-map?master_id=
app.get('/api/mdm/sku-map', authenticateToken, (req, res) => {
    const { master_id } = req.query;
    const sql    = master_id
        ? `SELECT s.*, v.name AS vendor_name FROM supplier_sku_map s LEFT JOIN vendors v ON s.vendor_id=v.id WHERE s.item_master_id=? ORDER BY s.sku_name`
        : `SELECT s.*, m.standard_name, v.name AS vendor_name FROM supplier_sku_map s JOIN item_master m ON s.item_master_id=m.id LEFT JOIN vendors v ON s.vendor_id=v.id ORDER BY m.standard_name, s.sku_name`;
    const params = master_id ? [Number(master_id)] : [];
    db.all(sql, params, (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows));
});

// POST /api/mdm/sku-map
app.post('/api/mdm/sku-map', authenticateToken, (req, res) => {
    const { item_master_id, vendor_id, sku_name, vendor_unit = 'KG', conversion_factor = 1.0, notes } = req.body;
    if (!item_master_id || !sku_name) return res.status(400).json({ error: 'item_master_id and sku_name required' });
    db.run(
        'INSERT INTO supplier_sku_map (item_master_id, vendor_id, sku_name, vendor_unit, conversion_factor, notes) VALUES (?,?,?,?,?,?)',
        [Number(item_master_id), vendor_id ? Number(vendor_id) : null, sku_name.trim(), vendor_unit, Number(conversion_factor), notes || null],
        function(err) {
            if (err) return res.status(err.message.includes('UNIQUE') ? 409 : 500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// DELETE /api/mdm/sku-map/:id
app.delete('/api/mdm/sku-map/:id', authenticateToken, requireAdmin, (req, res) => {
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run('DELETE FROM supplier_sku_map WHERE id=?', [Number(req.params.id)],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
    );
});

// GET /api/mdm/pending
app.get('/api/mdm/pending', authenticateToken, (req, res) => {
    const { status = 'pending' } = req.query;
    db.all(
        `SELECT p.*, m.standard_name AS suggested_name FROM mdm_pending p
         LEFT JOIN item_master m ON p.suggested_master_id=m.id
         WHERE p.status=? ORDER BY p.created_at DESC`,
        [status],
        (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)
    );
});

// POST /api/mdm/pending  — create a pending review item
app.post('/api/mdm/pending', authenticateToken, (req, res) => {
    const { raw_string, source = 'ocr', suggested_master_id, confidence = 0 } = req.body;
    if (!raw_string) return res.status(400).json({ error: 'raw_string required' });
    // Avoid duplicates in pending state
    db.get('SELECT id FROM mdm_pending WHERE raw_string=? AND status=?', [raw_string, 'pending'], (err, existing) => {
        if (existing) return res.json({ id: existing.id, already_pending: true });
        db.run(
            'INSERT INTO mdm_pending (raw_string, source, suggested_master_id, confidence) VALUES (?,?,?,?)',
            [raw_string, source, suggested_master_id || null, Number(confidence)],
            function(err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ id: this.lastID });
            }
        );
    });
});

// PUT /api/mdm/pending/:id/approve  — create alias and resolve
app.put('/api/mdm/pending/:id/approve', authenticateToken, (req, res) => {
    const { master_id, create_alias = true, alias_lang = 'en' } = req.body;
    if (!master_id) return res.status(400).json({ error: 'master_id required' });
    db.get('SELECT * FROM mdm_pending WHERE id=?', [Number(req.params.id)], (err, row) => {
        if (!row) return res.status(404).json({ error: 'Pending item not found' });
        db.serialize(() => {
            db.run('UPDATE mdm_pending SET status=?,reviewed_by=?,resolved_master_id=? WHERE id=?',
                ['approved', req.user.username, Number(master_id), row.id]);
            if (create_alias) {
                db.run('INSERT OR IGNORE INTO item_aliases (item_master_id, alias, language, created_by) VALUES (?,?,?,?)',
                    [Number(master_id), row.raw_string, alias_lang, req.user.username]);
            }
            res.json({ ok: true, resolved_to: master_id });
        });
    });
});

// PUT /api/mdm/pending/:id/dismiss
app.put('/api/mdm/pending/:id/dismiss', authenticateToken, (req, res) => {
    if (isNaN(Number(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    db.run('UPDATE mdm_pending SET status=?,reviewed_by=? WHERE id=?',
        ['dismissed', req.user.username, Number(req.params.id)],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
    );
});

// GET /api/mdm/pending/count  — badge count
app.get('/api/mdm/pending/count', authenticateToken, (req, res) => {
    db.get('SELECT COUNT(*) as count FROM mdm_pending WHERE status=?', ['pending'],
        (err, row) => err ? res.status(500).json({ error: err.message }) : res.json({ count: row.count })
    );
});

// ── Email spike alerts ────────────────────────────────────────────────────────
function createMailTransport() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
    return nodemailer.createTransport({
        host: SMTP_HOST, port: Number(SMTP_PORT) || 587, secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
}

function sendSpikeAlert(item, currentPrice, lastPrice, supplier) {
    const transport = createMailTransport();
    if (!transport || !process.env.ALERT_EMAIL_TO) return;
    const pct = (((currentPrice - lastPrice) / lastPrice) * 100).toFixed(1);
    transport.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.ALERT_EMAIL_TO,
        subject: `⚠️ Price Spike: ${item} (+${pct}%)`,
        html: `<h2 style="color:#ef4444;">Price Spike Detected</h2>
               <p><b>Item:</b> ${item}<br><b>Supplier:</b> ${supplier||'—'}<br>
               <b>Previous:</b> ₹${lastPrice.toFixed(2)}<br>
               <b>Current:</b> <span style="color:#ef4444;">₹${currentPrice.toFixed(2)} (+${pct}%)</span></p>
               <p style="color:#64748b;font-size:12px;">Canteen Insights — automated alert</p>`
    }).catch(err => console.error('Spike alert email failed:', err.message));
}

// ── Admin backup ──────────────────────────────────────────────────────────────
app.post('/api/admin/backup', authenticateToken, requireAdmin, (req, res) => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const dbPath     = path.join(__dirname, 'db', 'canteen.sqlite');
    const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `canteen-backup-${timestamp}.sqlite`);

    fs.copyFile(dbPath, backupPath, (err) => {
        if (err) return res.status(500).json({ error: 'Backup failed: ' + err.message });
        res.json({ message: 'Backup created successfully', filename: path.basename(backupPath) });
    });
});

// ── Gemini OCR Integration ───────────────────────────────────────────────────
app.post('/api/ocr/gemini', authenticateToken, async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

        const genAI = initGemini();
        if (!genAI) {
            return res.status(500).json({ error: 'Gemini API key is not configured in the backend (.env).' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
        You are a highly capable invoice extraction assistant. Read the provided invoice image (it may be in English, Hindi, Gujarati, or other languages).
        Extract the following information and return ONLY a valid JSON object. Do not include markdown blocks or any other text.
        Make sure to translate item names to English if they are in another language.
        Format requirements:
        {
          "supplier": "string (name of the vendor/supplier)",
          "date": "YYYY-MM-DD",
          "invoiceNo": "string (invoice or bill number, if available)",
          "items": [
            {
              "name": "string (item name in English)",
              "qty": number (quantity, 1 if missing),
              "rate": number (price per unit)
            }
          ]
        }`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: mimeType || 'image/jpeg'
                }
            }
        ]);

        let responseText = result.response.text();
        // Clean up potential markdown formatting from the response
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsedData = JSON.parse(responseText);
        res.json(parsedData);
    } catch (err) {
        console.error('Gemini API Error:', err);
        res.status(500).json({ error: 'Failed to process image with Gemini: ' + err.message });
    }
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
