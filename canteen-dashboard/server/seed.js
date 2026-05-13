/**
 * Seed script — populates vendors, items with realistic Indian canteen data.
 * Run once: node server/seed.js
 * Safe to re-run: uses INSERT OR IGNORE to skip duplicates.
 */

const db = require('./db');

// Give db.js time to finish initDB()
setTimeout(() => {
    db.serialize(() => {
        // ── Vendors ──────────────────────────────────────────────────────────
        const vendors = [
            'Fresh Farms Pvt Ltd',
            'Sheetal Dairy Products',
            'National Foods & Provisions',
            'Spice Garden Traders',
            'Metro Cash & Carry',
            'Naveen Fruits & Vegetables',
            'Anand Provisions Store',
            'Royal Dairy Farm',
            'Green Valley Organics',
            'Sunrise Agro Traders',
        ];
        vendors.forEach(name => {
            db.run('INSERT OR IGNORE INTO vendors (name) VALUES (?)', [name]);
        });
        console.log(`✓ Vendors seeded (${vendors.length})`);

        // ── Categories (ensure all exist) ─────────────────────────────────────
        const categories = ['Vegetable', 'Dairy', 'Grocery/Dry', 'Fruit', 'Spice', 'Beverage', 'Transport Support'];
        categories.forEach(name => {
            db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
        });

        // ── Items — seeded after a short delay so category IDs are stable ────
        setTimeout(() => {
            db.all('SELECT id, name FROM categories', [], (err, cats) => {
                if (err) { console.error(err); return; }

                const catMap = {};
                cats.forEach(c => catMap[c.name] = c.id);

                const items = [
                    // Vegetables
                    { name: 'Tomato',          category: 'Vegetable',    unit: 'kg',    price: 60  },
                    { name: 'Potato',          category: 'Vegetable',    unit: 'kg',    price: 30  },
                    { name: 'Onion',           category: 'Vegetable',    unit: 'kg',    price: 40  },
                    { name: 'Green Chilli',    category: 'Vegetable',    unit: 'kg',    price: 80  },
                    { name: 'Coriander',       category: 'Vegetable',    unit: 'kg',    price: 120 },
                    { name: 'Ginger',          category: 'Vegetable',    unit: 'kg',    price: 160 },
                    { name: 'Garlic',          category: 'Vegetable',    unit: 'kg',    price: 180 },
                    { name: 'Capsicum',        category: 'Vegetable',    unit: 'kg',    price: 90  },
                    { name: 'Cauliflower',     category: 'Vegetable',    unit: 'pcs',   price: 40  },
                    { name: 'Cabbage',         category: 'Vegetable',    unit: 'pcs',   price: 30  },
                    { name: 'Spinach',         category: 'Vegetable',    unit: 'kg',    price: 50  },
                    { name: 'Brinjal',         category: 'Vegetable',    unit: 'kg',    price: 45  },
                    { name: 'Bitter Gourd',    category: 'Vegetable',    unit: 'kg',    price: 60  },
                    { name: 'Bottle Gourd',    category: 'Vegetable',    unit: 'kg',    price: 35  },
                    { name: 'Pumpkin',         category: 'Vegetable',    unit: 'kg',    price: 30  },
                    { name: 'Carrot',          category: 'Vegetable',    unit: 'kg',    price: 55  },
                    { name: 'Cucumber',        category: 'Vegetable',    unit: 'kg',    price: 40  },
                    { name: 'Lemon',           category: 'Vegetable',    unit: 'dozen', price: 60  },
                    { name: 'Peas',            category: 'Vegetable',    unit: 'kg',    price: 100 },
                    { name: 'Corn',            category: 'Vegetable',    unit: 'pcs',   price: 20  },
                    // Dairy
                    { name: 'Milk',            category: 'Dairy',        unit: 'litre', price: 65  },
                    { name: 'Paneer',          category: 'Dairy',        unit: 'kg',    price: 340 },
                    { name: 'Curd',            category: 'Dairy',        unit: 'kg',    price: 55  },
                    { name: 'Ghee',            category: 'Dairy',        unit: 'kg',    price: 520 },
                    { name: 'Butter',          category: 'Dairy',        unit: 'kg',    price: 480 },
                    { name: 'Cream',           category: 'Dairy',        unit: 'litre', price: 200 },
                    // Grocery / Dry
                    { name: 'Rice (Basmati)',  category: 'Grocery/Dry',  unit: 'kg',    price: 85  },
                    { name: 'Rice (Regular)',  category: 'Grocery/Dry',  unit: 'kg',    price: 55  },
                    { name: 'Wheat Flour',     category: 'Grocery/Dry',  unit: 'kg',    price: 42  },
                    { name: 'Sugar',           category: 'Grocery/Dry',  unit: 'kg',    price: 45  },
                    { name: 'Salt',            category: 'Grocery/Dry',  unit: 'kg',    price: 18  },
                    { name: 'Sunflower Oil',   category: 'Grocery/Dry',  unit: 'litre', price: 130 },
                    { name: 'Mustard Oil',     category: 'Grocery/Dry',  unit: 'litre', price: 145 },
                    { name: 'Besan',           category: 'Grocery/Dry',  unit: 'kg',    price: 65  },
                    { name: 'Maida',           category: 'Grocery/Dry',  unit: 'kg',    price: 38  },
                    { name: 'Toor Dal',        category: 'Grocery/Dry',  unit: 'kg',    price: 120 },
                    { name: 'Moong Dal',       category: 'Grocery/Dry',  unit: 'kg',    price: 110 },
                    { name: 'Chana Dal',       category: 'Grocery/Dry',  unit: 'kg',    price: 95  },
                    { name: 'Urad Dal',        category: 'Grocery/Dry',  unit: 'kg',    price: 130 },
                    { name: 'Rajma',           category: 'Grocery/Dry',  unit: 'kg',    price: 140 },
                    { name: 'Sooji',           category: 'Grocery/Dry',  unit: 'kg',    price: 40  },
                    { name: 'Poha',            category: 'Grocery/Dry',  unit: 'kg',    price: 55  },
                    { name: 'Vermicelli',      category: 'Grocery/Dry',  unit: 'pack',  price: 35  },
                    // Fruits
                    { name: 'Banana',          category: 'Fruit',        unit: 'dozen', price: 50  },
                    { name: 'Apple',           category: 'Fruit',        unit: 'kg',    price: 180 },
                    { name: 'Papaya',          category: 'Fruit',        unit: 'kg',    price: 40  },
                    { name: 'Watermelon',      category: 'Fruit',        unit: 'kg',    price: 25  },
                    { name: 'Orange',          category: 'Fruit',        unit: 'dozen', price: 80  },
                    { name: 'Guava',           category: 'Fruit',        unit: 'kg',    price: 60  },
                    // Spices
                    { name: 'Cumin (Jeera)',   category: 'Spice',        unit: 'kg',    price: 280 },
                    { name: 'Mustard Seeds',   category: 'Spice',        unit: 'kg',    price: 90  },
                    { name: 'Turmeric Powder', category: 'Spice',        unit: 'kg',    price: 140 },
                    { name: 'Red Chilli Pwd',  category: 'Spice',        unit: 'kg',    price: 200 },
                    { name: 'Coriander Pwd',   category: 'Spice',        unit: 'kg',    price: 120 },
                    { name: 'Garam Masala',    category: 'Spice',        unit: 'kg',    price: 350 },
                    { name: 'Kitchen King',    category: 'Spice',        unit: 'kg',    price: 320 },
                    { name: 'Black Pepper',    category: 'Spice',        unit: 'kg',    price: 600 },
                    { name: 'Cardamom',        category: 'Spice',        unit: 'kg',    price: 1400},
                    // Beverages
                    { name: 'Tea Powder',      category: 'Beverage',     unit: 'kg',    price: 380 },
                    { name: 'Coffee Powder',   category: 'Beverage',     unit: 'kg',    price: 480 },
                    { name: 'Sugar (Tea)',     category: 'Beverage',     unit: 'kg',    price: 45  },
                    { name: 'Mineral Water',   category: 'Beverage',     unit: 'pack',  price: 20  },
                ];

                let inserted = 0;
                items.forEach(item => {
                    const catId = catMap[item.category];
                    if (!catId) { console.warn(`Unknown category: ${item.category}`); return; }
                    db.run(
                        'INSERT OR IGNORE INTO items (name, categoryId, defaultPrice, unit) VALUES (?, ?, ?, ?)',
                        [item.name, catId, item.price, item.unit],
                        function() { if (this.changes > 0) inserted++; }
                    );
                });

                setTimeout(() => {
                    console.log(`✓ Items seeded (${items.length} attempted, new rows inserted: up to ${items.length})`);
                    console.log('\nSeed complete. Restart the backend to pick up changes if needed.');
                    db.close();
                    process.exit(0);
                }, 500);
            });
        }, 300);
    });
}, 500);
