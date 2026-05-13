import { api } from './api.js';

/**
 * One-time migration: checks if the backend already has data.
 * If backend is empty and IndexedDB (Dexie) has data, migrates it across.
 */
export async function migrateLocalToBackend() {
    console.log('Starting migration from local IndexedDB to Backend...');
    try {
        // Check if backend already has purchases
        const existing = await api.getPurchases({ limit: 1 });
        if (existing && existing.length > 0) {
            console.log('Backend already has data. Skipping auto-migration.');
            return;
        }

        // Try to open Dexie DB if it exists
        if (typeof Dexie === 'undefined') return;

        const dexieDb = new Dexie('CanteenDB');
        dexieDb.version(1).stores({
            vendors:    '++id, name',
            categories: '++id, name',
            items:      '++id, name, categoryId',
            purchases:  '++id, date, vendorId, itemId'
        });

        const [vendors, items, purchases] = await Promise.all([
            dexieDb.vendors.toArray().catch(() => []),
            dexieDb.items.toArray().catch(() => []),
            dexieDb.purchases.toArray().catch(() => [])
        ]);

        if (purchases.length === 0) {
            console.log('No local data to migrate.');
            return;
        }

        console.log(`Migrating ${purchases.length} local records to backend…`);

        // Migrate Vendors
        for (const v of vendors) {
            try { await api.addVendor(v.name); } catch { /* ignore duplicates */ }
        }

        // Migrate Items
        for (const i of items) {
            try { await api.addItem(i); } catch { /* ignore duplicates */ }
        }

        // Migrate Purchases in batches of 500
        const mappedPurchases = purchases.map(p => ({
            date:         p.date,
            vendorId:     p.vendorId,
            itemId:       p.itemId,
            categoryId:   p.categoryId,
            userId:       p.userId || 1,
            supplierName: p.supplierName,
            invoiceNo:    p.billNumber || p.invoiceNo,
            item:         p.item,
            category:     p.category,
            unit:         p.unit,
            quantity:     p.quantity,
            price:        p.rate || p.price,
            total:        p.total || p.amount,
            finalAmount:  p.finalAmount || p.total || p.amount,
            gst:          p.gst || 0,
            igst:         p.igst || 0,
            remarks:      p.remarks,
            alert:        p.alert
        }));

        for (let i = 0; i < mappedPurchases.length; i += 500) {
            await api.addPurchasesBatch(mappedPurchases.slice(i, i + 500));
            console.log(`Migrated batch ${Math.floor(i / 500) + 1} of ${Math.ceil(mappedPurchases.length / 500)}`);
        }

        window.showToast?.('Migration complete! All data is now on the server.', 'success');
    } catch (err) {
        console.error('Migration check failed:', err);
    }
}
