const BetterSQLite = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbDir = path.resolve(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const srcPath = path.resolve(dbDir, 'canteen.sqlite');
const dbPath = process.env.VERCEL ? '/tmp/canteen.sqlite' : srcPath;
if (process.env.VERCEL && !fs.existsSync(dbPath)) {
    fs.copyFileSync(srcPath, dbPath);
}

const _db = new BetterSQLite(dbPath);
console.log('Connected to SQLite database');

function normalizeParams(params) {
    if (params === undefined || params === null) return [];
    if (Array.isArray(params)) return params;
    return [params];
}

// sqlite3-compatible shim around better-sqlite3 (synchronous internals, async callbacks via setImmediate)
const db = {
    get: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            const row = _db.prepare(sql).get(normalizeParams(params));
            if (callback) setImmediate(() => callback(null, row));
        } catch (err) {
            if (callback) setImmediate(() => callback(err));
        }
    },
    all: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            const rows = _db.prepare(sql).all(normalizeParams(params));
            if (callback) setImmediate(() => callback(null, rows));
        } catch (err) {
            if (callback) setImmediate(() => callback(err));
        }
    },
    run: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            const info = _db.prepare(sql).run(normalizeParams(params));
            if (callback) setImmediate(function() {
                callback.call({ lastID: info.lastInsertRowid, changes: info.changes }, null);
            });
        } catch (err) {
            if (callback) setImmediate(() => callback.call({}, err));
        }
    },
    serialize: function(fn) {
        if (fn) fn();
    },
    prepare: function(sql) {
        const stmt = _db.prepare(sql);
        return {
            run: function(params, callback) {
                if (typeof params === 'function') { callback = params; params = []; }
                try {
                    const info = stmt.run(normalizeParams(params));
                    if (callback) setImmediate(function() {
                        callback.call({ lastID: info.lastInsertRowid, changes: info.changes }, null);
                    });
                } catch (err) {
                    if (callback) setImmediate(() => callback.call({}, err));
                }
            },
            finalize: function(callback) {
                if (callback) setImmediate(() => callback(null));
            }
        };
    }
};

function initDB() {
    db.serialize(async () => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            status TEXT DEFAULT 'active'
        )`);

        db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
            if (row && row.count === 0) {
                const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'changeMe123!';
                const staffPass = process.env.DEFAULT_STAFF_PASSWORD || 'changeMe123!';
                const adminHash = await bcrypt.hash(adminPass, 10);
                const staffHash = await bcrypt.hash(staffPass, 10);
                db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', adminHash, 'admin']);
                db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['staff', staffHash, 'staff']);
                console.log('Seeded default users (admin, staff) - CHANGE DEFAULT PASSWORDS IMMEDIATELY');
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            status TEXT DEFAULT 'active'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            status TEXT DEFAULT 'active'
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            categoryId INTEGER,
            defaultPrice REAL,
            unit TEXT,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (categoryId) REFERENCES categories(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            vendorId INTEGER,
            itemId INTEGER,
            categoryId INTEGER,
            userId INTEGER,
            supplierName TEXT,
            invoiceNo TEXT,
            item TEXT,
            category TEXT,
            unit TEXT,
            quantity REAL,
            price REAL,
            total REAL,
            gstPercent REAL,
            cgst REAL,
            sgst REAL,
            igst REAL,
            cess REAL,
            finalAmount REAL,
            remarks TEXT,
            alert TEXT,
            FOREIGN KEY (vendorId) REFERENCES vendors(id),
            FOREIGN KEY (itemId) REFERENCES items(id),
            FOREIGN KEY (categoryId) REFERENCES categories(id),
            FOREIGN KEY (userId) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            UNIQUE(month, category)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS item_master (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            standard_name TEXT NOT NULL UNIQUE,
            base_unit TEXT NOT NULL DEFAULT 'KG',
            category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS item_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_master_id INTEGER NOT NULL,
            alias TEXT NOT NULL UNIQUE,
            language TEXT DEFAULT 'en',
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_master_id) REFERENCES item_master(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS supplier_sku_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_master_id INTEGER NOT NULL,
            vendor_id INTEGER,
            sku_name TEXT NOT NULL,
            vendor_unit TEXT DEFAULT 'KG',
            conversion_factor REAL DEFAULT 1.0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(vendor_id, sku_name),
            FOREIGN KEY (item_master_id) REFERENCES item_master(id) ON DELETE CASCADE,
            FOREIGN KEY (vendor_id) REFERENCES vendors(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS mdm_pending (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_string TEXT NOT NULL,
            source TEXT DEFAULT 'ocr',
            suggested_master_id INTEGER,
            confidence INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            reviewed_by TEXT,
            resolved_master_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (suggested_master_id) REFERENCES item_master(id),
            FOREIGN KEY (resolved_master_id) REFERENCES item_master(id)
        )`);

        db.get('SELECT COUNT(*) as count FROM item_master', (err, row) => {
            if (err || row.count > 0) return;
            const masters = [
                ['Chili Powder',       'KG',  'Spice'],
                ['Turmeric Powder',    'KG',  'Spice'],
                ['Coriander Powder',   'KG',  'Spice'],
                ['Whole Red Chili',    'KG',  'Spice'],
                ['Whole Coriander',    'KG',  'Spice'],
                ['Cumin',              'KG',  'Spice'],
                ['Mustard Seeds',      'KG',  'Spice'],
                ['Asafoetida',         'KG',  'Spice'],
                ['Fenugreek Seeds',    'KG',  'Spice'],
                ['Kasuri Methi',       'KG',  'Spice'],
                ['Cinnamon',           'KG',  'Spice'],
                ['Tea Masala',         'KG',  'Spice'],
                ['Kitchen King Masala','KG',  'Spice'],
                ['Pav Bhaji Masala',   'KG',  'Spice'],
                ['Biryani Masala',     'KG',  'Spice'],
                ['Paneer Masala',      'KG',  'Spice'],
                ['Sambhar Masala',     'KG',  'Spice'],
                ['Sugar',              'KG',  'Grocery/Dry'],
                ['Jaggery',            'KG',  'Grocery/Dry'],
                ['Tamarind',           'KG',  'Grocery/Dry'],
                ['Besan',              'KG',  'Grocery/Dry'],
                ['Peanuts',            'KG',  'Grocery/Dry'],
                ['Salt',               'KG',  'Grocery/Dry'],
                ['Cashew',             'KG',  'Grocery/Dry'],
                ['Rice Papdi',         'KG',  'Grocery/Dry'],
                ['Fryums',             'KG',  'Grocery/Dry'],
                ['Tea',                'KG',  'Grocery/Dry'],
                ['Poha',               'KG',  'Grocery/Dry'],
                ['Mamra',              'KG',  'Grocery/Dry'],
                ['Corn Poha',          'KG',  'Grocery/Dry'],
                ['Cotton Waste',       'KG',  'Transport Support'],
            ];
            const stmt = db.prepare('INSERT OR IGNORE INTO item_master (standard_name, base_unit, category) VALUES (?,?,?)');
            masters.forEach(([name, unit, cat]) => stmt.run([name, unit, cat]));
            stmt.finalize();

            setTimeout(() => {
                const aliases = [
                    ['Chili Powder',        'મરચા પાવડર',   'gu'],
                    ['Chili Powder',        'mircha powder', 'en'],
                    ['Turmeric Powder',     'હળદર',          'gu'],
                    ['Turmeric Powder',     'હળદર પાવડર',   'gu'],
                    ['Turmeric Powder',     'haldhar powder','en'],
                    ['Coriander Powder',    'ઘાણા પાવડર',   'gu'],
                    ['Coriander Powder',    'dhana powder',  'en'],
                    ['Whole Red Chili',     'આખા મરચા',     'gu'],
                    ['Whole Coriander',     'આખા ઘાણા',     'gu'],
                    ['Cumin',               'જીરૂ',          'gu'],
                    ['Cumin',               'jeeru',         'en'],
                    ['Mustard Seeds',       'રાઈ',           'gu'],
                    ['Mustard Seeds',       'rai',           'en'],
                    ['Asafoetida',          'હિંગ',          'gu'],
                    ['Asafoetida',          'hing',          'en'],
                    ['Fenugreek Seeds',     'મેથી',          'gu'],
                    ['Fenugreek Seeds',     'methi',         'en'],
                    ['Kasuri Methi',        'કસૂરી મેથી',   'gu'],
                    ['Sugar',               'ખાંડ',          'gu'],
                    ['Sugar',               'khand',         'en'],
                    ['Jaggery',             'ગોળ',           'gu'],
                    ['Jaggery',             'gol',           'en'],
                    ['Tamarind',            'આમળી',          'gu'],
                    ['Tamarind',            'amli',          'en'],
                    ['Besan',               'બેસન',          'gu'],
                    ['Peanuts',             'શિંગદાણા',      'gu'],
                    ['Peanuts',             'singdana',      'en'],
                    ['Salt',               'મીઠું',          'gu'],
                    ['Salt',               'mithu',          'en'],
                    ['Cashew',              'કાજૂ કાણી',    'gu'],
                    ['Rice Papdi',          'ચોખાની પાપડી', 'gu'],
                    ['Fryums',              'ફ્રાઈમ્સ',      'gu'],
                    ['Tea',                 'ચા',            'gu'],
                    ['Tea Masala',          'ચા મસાલો',     'gu'],
                    ['Poha',                'પૌવા',          'gu'],
                    ['Mamra',               'મમરા',          'gu'],
                    ['Corn Poha',           'મકઈ પૌવા',     'gu'],
                    ['Cinnamon',            'તજ',            'gu'],
                    ['Kitchen King Masala', 'કિચન કિંગ મસાલા','gu'],
                    ['Pav Bhaji Masala',    'પાવભાજી મસાલા','gu'],
                    ['Biryani Masala',      'બિરયાની મસાલા','gu'],
                    ['Paneer Masala',       'પનીર મસાલા',   'gu'],
                    ['Sambhar Masala',      'કેરી સંભાર મસાલા','gu'],
                    ['Cotton Waste',        'ફીટ ઘી',        'gu'],
                ];
                const astmt = db.prepare(
                    'INSERT OR IGNORE INTO item_aliases (item_master_id, alias, language) SELECT id,?,? FROM item_master WHERE standard_name=?'
                );
                aliases.forEach(([master, alias, lang]) => astmt.run([alias, lang, master]));
                astmt.finalize();

                const skus = [
                    ['Chili Powder',        'MIRCHI POWDER KASHMIRI BULK', 'KG', 1.0],
                    ['Chili Powder',        'VS MIRCHI POWDER 1KG',        'KG', 1.0],
                    ['Turmeric Powder',     'HALDI SELLAM GREEN BULK',     'KG', 1.0],
                    ['Whole Red Chili',     'MIRCHI WHOLE RPK',            'KG', 1.0],
                    ['Whole Coriander',     'DHANI 7 STAR BULK',           'KG', 1.0],
                    ['Cumin',               'JEERA JANTA 1KG',             'KG', 1.0],
                    ['Mustard Seeds',       'RAI BULK',                    'KG', 1.0],
                    ['Asafoetida',          'DHANHAR HING NO.300 1KG',     'KG', 1.0],
                    ['Fenugreek Seeds',     'METHI PARI BULK',             'KG', 1.0],
                    ['Cinnamon',            'TAJ TUKDA BULK',              'KG', 1.0],
                    ['Kasuri Methi',        'KASURI METHI RPK',            'KG', 1.0],
                    ['Coriander Powder',    'VS DHANIYA POWDER 1KG',       'KG', 1.0],
                    ['Sugar',               'SUGAR BULK',                  'KG', 1.0],
                    ['Jaggery',             'GOL TAKA BULK',               'KG', 1.0],
                    ['Tamarind',            'AMBLI RPK',                   'KG', 1.0],
                    ['Besan',               'BESAN BULK',                  'KG', 1.0],
                    ['Peanuts',             'SINGDANA BULK',               'KG', 1.0],
                    ['Salt',                'NIRMA SALT 2KG',              'KG', 1.0],
                    ['Cashew',              'KAJU SWP KANI RPK',           'KG', 1.0],
                    ['Rice Papdi',          'RICE PAPADI 500GM',           'KG', 0.5],
                    ['Tea',                 'JIVVIJ SUREEN TEA NO.1 500GM','KG', 0.5],
                    ['Poha',                'POHA BULK',                   'KG', 1.0],
                    ['Mamra',               'PATEL MAMARA SADA 500GM',     'KG', 0.5],
                    ['Corn Poha',           'NATRAJ MAKAI PAUVA 400GM',    'KG', 0.4],
                    ['Tea Masala',          'SK TEA MASALA 1KG',           'KG', 1.0],
                    ['Kitchen King Masala', 'SK KITCHEN KING MASALA 1KG',  'KG', 1.0],
                    ['Paneer Masala',       'SK PANEER TIKKA MASALA 1KG',  'KG', 1.0],
                    ['Pav Bhaji Masala',    'SK MUMBAI PAV BHAJI MASALA 1KG','KG',1.0],
                    ['Biryani Masala',      'SK BIRYANI PULAV MASALA 1KG', 'KG', 1.0],
                    ['Sambhar Masala',      'SK ATHANA SAMBHAR MASALA 500GM','KG',0.5],
                    ['Cotton Waste',        'Cotton Waste Bale',           'BALE', 5.0],
                ];
                const sstmt = db.prepare(
                    'INSERT OR IGNORE INTO supplier_sku_map (item_master_id, sku_name, vendor_unit, conversion_factor) SELECT id,?,?,? FROM item_master WHERE standard_name=?'
                );
                skus.forEach(([master, sku, unit, factor]) => sstmt.run([sku, unit, factor, master]));
                sstmt.finalize();
                console.log('Seeded MDM item_master, item_aliases, supplier_sku_map');
            }, 500);
        });

        db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
            if (row && row.count === 0) {
                const cats = ['Vegetable', 'Grocery/Dry', 'Dairy', 'Fruit', 'Spice', 'Transport Support'];
                cats.forEach(name => db.run('INSERT INTO categories (name) VALUES (?)', [name]));
                console.log('Seeded default categories');
            }
        });
    });
}

initDB();

module.exports = db;
