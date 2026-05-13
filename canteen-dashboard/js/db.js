// Initialize Dexie
const db = new Dexie("CanteenDB");

// Define schema - Version 1
db.version(1).stores({
    vendors: '++id, name, status',
    categories: '++id, name, status',
    items: '++id, name, categoryId, defaultPrice, status',
    purchases: '++id, date, vendorId, itemId, categoryId, quantity, price, total, billNumber'
});

// Define schema - Version 2 (added gst, igst, finalAmount)
db.version(2).stores({
    vendors: '++id, name, status',
    categories: '++id, name, status',
    items: '++id, name, categoryId, defaultPrice, status',
    purchases: '++id, date, vendorId, itemId, categoryId, quantity, price, total, billNumber, gst, igst, finalAmount'
}).upgrade(tx => {
    return tx.purchases.toCollection().modify(p => {
        p.gst = p.gst || 0;
        p.igst = p.igst || 0;
        p.finalAmount = p.finalAmount || p.total;
    });
});

// Define schema - Version 3 (added unit to item seeds)
db.version(3).stores({
    vendors: '++id, name, status',
    categories: '++id, name, status',
    items: '++id, name, categoryId, defaultPrice, status', // non-indexed unit field added
    purchases: '++id, date, vendorId, itemId, categoryId, quantity, price, total, billNumber, gst, igst, finalAmount'
}).upgrade(tx => {
    return tx.items.toCollection().modify(item => {
        item.unit = item.unit || 'pcs';
    });
});

// Define schema - Version 4 (Added users and auth tracing)
db.version(4).stores({
    users: '++id, username, password, role, status',
    vendors: '++id, name, status',
    categories: '++id, name, status',
    items: '++id, name, categoryId, defaultPrice, status',
    purchases: '++id, date, vendorId, itemId, categoryId, quantity, price, total, billNumber, gst, igst, finalAmount, userId'
}).upgrade(tx => {
    return tx.purchases.toCollection().modify(p => {
        p.userId = p.userId || 1; // Default to admin for legacy
    });
});

// Define schema - Version 6 (extend purchases with denormalized fields for scanner/free-text entries)
db.version(6).stores({
    users: '++id, username, password, role, status',
    vendors: '++id, name, status',
    categories: '++id, name, status',
    items: '++id, name, categoryId, defaultPrice, status, [categoryId+status]',
    purchases: '++id, date, vendorId, itemId, categoryId, userId, supplierName, invoiceNo, item, item_orig, category, unit, quantity, price, total, gst, igst, finalAmount, billNumber, remarks, [date+vendorId+categoryId+itemId+userId]'
}).upgrade(async tx => {
    // Migrate old purchases: populate denormalized fields from foreign keys
    const allPurchases = await tx.purchases.toArray();
    const allVendors = await tx.vendors.toArray();
    const allCategories = await tx.categories.toArray();
    const allItems = await tx.items.toArray();

    const vendorMap = {};
    allVendors.forEach(v => vendorMap[v.id] = v.name);
    const categoryMap = {};
    allCategories.forEach(c => categoryMap[c.id] = c.name);
    const itemMap = {};
    allItems.forEach(i => itemMap[i.id] = { name: i.name, unit: i.unit || 'pcs', categoryId: i.categoryId });

    for (const p of allPurchases) {
        const updates = {};

        // supplierName: copy from vendor name if vendorId exists
        if (p.vendorId && !p.supplierName) {
            updates.supplierName = vendorMap[p.vendorId] || '';
        }

        // item: from items table
        if (p.itemId && !p.item) {
            const itemData = itemMap[p.itemId];
            if (itemData) {
                updates.item = itemData.name;
                updates.unit = itemData.unit;
            }
        }

        // category: from categories table
        if (p.categoryId && !p.category) {
            updates.category = categoryMap[p.categoryId] || '';
        }

        // invoiceNo alias for billNumber
        if (!p.invoiceNo && p.billNumber) {
            updates.invoiceNo = p.billNumber;
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
            await tx.purchases.update(p.id, updates);
        }
    }
});

// Define schema - Version 7 (added compound index for users)
db.version(7).stores({
    users: '++id, username, password, role, status, [username+status]',
    vendors: '++id, name, status',
    categories: '++id, name, status',
    items: '++id, name, categoryId, defaultPrice, status, [categoryId+status]',
    purchases: '++id, date, vendorId, itemId, categoryId, userId, supplierName, invoiceNo, item, item_orig, category, unit, quantity, price, total, gst, igst, finalAmount, billNumber, remarks, [date+vendorId+categoryId+itemId+userId]'
});

export default db;

// Seed data function
export async function seedDatabaseIfEmpty() {
    const vendorCount = await db.vendors.count();
    let vendorIds = [];
    let categoryIds = [];
    let itemIds = [];

    if (vendorCount === 0) {
        // Mock Vendors (Sabzi-style)
        vendorIds = await Promise.all([
            db.vendors.add({ name: 'BHADBHADIYA SAGAR VALLABHBHAI', status: 'active' }),
            db.vendors.add({ name: 'HEDARAM P PRAJAPATI', status: 'active' }),
            db.vendors.add({ name: 'R.K MASALA PRODUETS', status: 'active' }),
            db.vendors.add({ name: 'SHUBH MANGAL TRADERS', status: 'active' }),
            db.vendors.add({ name: 'SHREEJI DAIRY & FAST FOOD', status: 'active' })
        ]);

        // Mock Categories (Sabzi core)
        categoryIds = await Promise.all([
            db.categories.add({ name: 'Vegetable', status: 'active' }),
            db.categories.add({ name: 'Grocery/Dry', status: 'active' }),
            db.categories.add({ name: 'Dairy', status: 'active' }),
            db.categories.add({ name: 'Fruit', status: 'active' }),
            db.categories.add({ name: 'Spice', status: 'active' })
        ]);

        // Mock Items (mixed)
        itemIds = await Promise.all([
            db.items.add({ name: 'Tomato', categoryId: categoryIds[0], defaultPrice: 26, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Potato', categoryId: categoryIds[0], defaultPrice: 18, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Onion', categoryId: categoryIds[0], defaultPrice: 22, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Green Chilli', categoryId: categoryIds[0], defaultPrice: 90, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Rice', categoryId: categoryIds[1], defaultPrice: 55, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Toor Dal', categoryId: categoryIds[1], defaultPrice: 100, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Sugar', categoryId: categoryIds[1], defaultPrice: 52, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Milk', categoryId: categoryIds[2], defaultPrice: 58, status: 'active', unit: 'L' }),
            db.items.add({ name: 'Paneer', categoryId: categoryIds[2], defaultPrice: 340, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Cumin', categoryId: categoryIds[4], defaultPrice: 320, status: 'active', unit: 'kg' }),
            db.items.add({ name: 'Turmeric Powder', categoryId: categoryIds[4], defaultPrice: 180, status: 'active', unit: 'kg' })
        ]);

        // Fetch all items and vendors for seeding purchases
        const allItems = await db.items.toArray();
        const allVendors = await db.vendors.toArray();
        const allCategories = await db.categories.toArray();

        // Mock Purchases (30 days of random buys)
        const purchases = [];
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(today.getDate() - Math.floor(Math.random() * 30));

            const vId = vendorIds[Math.floor(Math.random() * vendorIds.length)];
            const iId = itemIds[Math.floor(Math.random() * itemIds.length)];
            const item = allItems.find(it => it.id === iId);
            const catId = item ? item.categoryId : categoryIds[0];

            const qty = Math.floor(Math.random() * 10) + 1;
            const price = item ? item.defaultPrice : 50;
            const total = qty * price;

            const vendor = allVendors.find(v => v.id === vId);
            const category = allCategories.find(c => c.id === catId);

            purchases.push({
                date: date.toISOString().split('T')[0],
                vendorId: vId,
                supplierName: vendor ? vendor.name : 'Unknown',
                categoryId: catId,
                category: category ? category.name : 'Other',
                itemId: iId,
                item: item ? item.name : 'Unknown',
                item_orig: '',
                unit: item ? item.unit : 'kg',
                quantity: qty,
                price: price,
                total: total,
                amount: total,
                gst: 0,
                igst: 0,
                finalAmount: total,
                billNumber: `BILL-${Math.floor(1000 + Math.random() * 9000)}`,
                invoiceNo: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
                remarks: 'Auto-seeded',
                userId: 1
            });
        }
        await db.purchases.bulkAdd(purchases);
        console.log('Database seeded with Sabzi-style mock data.');
    }

    // Ensure Transport exist
    const hasTransportCat = await db.categories.where('name').equals('Transport Support').first();
    if (!hasTransportCat) {
        const transportCatId = await db.categories.add({ name: 'Transport Support', status: 'active' });
        await db.items.add({ name: 'Transport Fee', categoryId: transportCatId, defaultPrice: 0, status: 'active', unit: 'service' });
    }

    // Ensure Initial Users
    const userCount = await db.users.count();
    if (userCount === 0) {
        await db.users.bulkAdd([
            { username: 'admin', password: 'admin123', role: 'admin', status: 'active' },
            { username: 'staff', password: 'staff123', role: 'staff', status: 'active' }
        ]);
        console.log("Default users created.");
    }
}
