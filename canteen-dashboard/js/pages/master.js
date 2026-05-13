import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

// Import hash function from app (reuse)
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function renderMaster() {
    const container = document.createElement('div');
    
    // HTML Structure
    container.innerHTML = `
        <div class="grid-3" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
            <!-- Systems Master Area (Users) -->
            <div class="card">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="mb-0">Users</h3>
                    <button class="btn btn-outline btn-sm" id="btn-backup-db"><i data-lucide="save"></i> Backup DB</button>
                </div>
                <form id="form-user" class="flex-col gap-4 mb-4">
                    <input type="text" id="user-name" class="form-control" placeholder="New Username" required>
                    <input type="password" id="user-password" class="form-control" placeholder="New Password" required>
                    <input type="password" id="user-password-confirm" class="form-control" placeholder="Confirm Password" required>
                    <select id="user-role" class="form-control" required>
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" class="btn btn-primary">Add User</button>
                </form>
                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody id="user-list"></tbody>
                    </table>
                </div>
            </div>

            <!-- Vendors Master -->
            <div class="card">
                <h3>Vendors</h3>
                <form id="form-vendor" class="flex gap-4 mt-4 mb-4">
                    <input type="text" id="vendor-name" class="form-control" placeholder="New Vendor Name" required>
                    <button type="submit" class="btn btn-primary">Add</button>
                </form>
                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Name</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody id="vendor-list"></tbody>
                    </table>
                </div>
            </div>

            <!-- Categories Master -->
            <div class="card">
                <h3>Categories</h3>
                <form id="form-category" class="flex gap-4 mt-4 mb-4">
                    <input type="text" id="category-name" class="form-control" placeholder="New Category Name" required>
                    <button type="submit" class="btn btn-primary">Add</button>
                </form>
                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Name</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody id="category-list"></tbody>
                    </table>
                </div>
            </div>
            
            <!-- Items Master -->
            <div class="card" style="grid-column: span 2;">
                <div class="flex justify-between items-center mb-4">
                    <h3>Items Catalog</h3>
                    <div class="flex gap-2">
                        <input type="text" id="item-search" class="form-control" placeholder="Search items..." style="width:200px; font-size:13px;">
                        <button class="btn btn-primary" id="btn-show-add-item">+ Add Item</button>
                    </div>
                </div>

                <!-- Add Item Form (Hidden by default) -->
                <div id="item-form-container" style="display:none; background:var(--bg-main); padding:16px; border-radius:var(--radius); margin-bottom:16px; border:1px solid var(--border-color);">
                    <form id="form-item" class="grid-4 gap-4">
                        <input type="text" id="item-name" class="form-control" placeholder="Item Name" required>
                        <select id="item-category" class="form-control" required>
                            <option value="">Select Category</option>
                        </select>
                        <input type="number" id="item-price" class="form-control" placeholder="Default Price" required>
                        <select id="item-unit" class="form-control" required>
                            <option value="">Select Unit</option>
                            <option value="pcs">pcs</option>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="L">L</option>
                            <option value="ml">ml</option>
                            <option value="pack">pack</option>
                            <option value="box">box</option>
                        </select>
                        <div style="grid-column: span 4; display:flex; gap:10px; justify-content:flex-end;">
                            <button type="button" class="btn btn-outline" id="btn-cancel-item">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Item</button>
                        </div>
                    </form>
                </div>

                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Unit</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody id="item-list"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Fetch and render data
    let allItems = [];

    const loadData = async () => {
        const searchQuery = container.querySelector('#item-search')?.value.toLowerCase() || '';
        try {
            const [vendors, categories, items, users] = await Promise.all([
                api.getVendors(),
                api.getCategories(),
                api.getItems(),
                api.getUsers().catch(() => [])
            ]);
            
            allItems = items;

            // Render Users
            const userList = container.querySelector('#user-list');
            if (userList) {
                userList.innerHTML = users.map(u => `
                    <tr>
                        <td>${escapeHtml(u.username)}</td>
                        <td><span class="badge" style="background:#e2e8f0; color:#475569;">${u.role.toUpperCase()}</span></td>
                        <td><span class="badge ${u.status === 'active' ? 'active' : 'inactive'}">${u.status.toUpperCase()}</span></td>
                        <td><button class="btn btn-outline btn-sm toggle-user" data-id="${u.id}" data-status="${u.status}">Toggle</button></td>
                    </tr>
                `).join('');
            }

            // Render Vendors
            const vendorList = container.querySelector('#vendor-list');
            if (vendorList) {
                vendorList.innerHTML = vendors.map(v => `
                    <tr>
                        <td>${escapeHtml(v.name)}</td>
                        <td><span class="badge ${v.status === 'active' ? 'active' : 'inactive'}">${v.status.toUpperCase()}</span></td>
                        <td><button class="btn btn-outline btn-sm toggle-vendor" data-id="${v.id}" data-status="${v.status}">Toggle</button></td>
                    </tr>
                `).join('');
            }

            // Render Categories
            const catList = container.querySelector('#category-list');
            if (catList) {
                catList.innerHTML = categories.map(c => `
                    <tr>
                        <td>${escapeHtml(c.name)}</td>
                        <td><span class="badge ${c.status === 'active' ? 'active' : 'inactive'}">${c.status.toUpperCase()}</span></td>
                        <td><button class="btn btn-outline btn-sm toggle-category" data-id="${c.id}" data-status="${c.status}">Toggle</button></td>
                    </tr>
                `).join('');
            }

            // Update Item Category Dropdown
            const itemCatSelect = container.querySelector('#item-category');
            if (itemCatSelect) {
                itemCatSelect.innerHTML = '<option value="">Select Category</option>' + categories.filter(c => c.status === 'active').map(c => `
                    <option value="${c.id}">${escapeHtml(c.name)}</option>
                `).join('');
            }

            // Render Items (with search)
            const itemList = container.querySelector('#item-list');
            if (itemList) {
                const filtered = items.filter(i => i.name.toLowerCase().includes(searchQuery));
                itemList.innerHTML = filtered.map(i => {
                    const cat = categories.find(c => c.id === i.categoryId);
                    return `
                    <tr>
                        <td><strong>${escapeHtml(i.name)}</strong></td>
                        <td><span class="badge" style="background:#f1f5f9; color:#64748b;">${cat ? escapeHtml(cat.name) : '—'}</span></td>
                        <td>₹${i.defaultPrice.toFixed(2)}</td>
                        <td>${i.unit || 'pcs'}</td>
                        <td><span class="badge ${i.status === 'active' ? 'active' : 'inactive'}">${i.status.toUpperCase()}</span></td>
                        <td><button class="btn btn-outline btn-sm toggle-item" data-id="${i.id}" data-status="${i.status}">Toggle</button></td>
                    </tr>
                `}).join('');
            }
        } catch (err) {
            console.error("Master data load failed:", err);
        }
    };

    // UI Toggle Events
    const formContainer = container.querySelector('#item-form-container');
    container.querySelector('#btn-show-add-item').addEventListener('click', () => {
        formContainer.style.display = 'block';
    });
    container.querySelector('#btn-cancel-item').addEventListener('click', () => {
        formContainer.style.display = 'none';
    });

    // Search Event
    container.querySelector('#item-search').addEventListener('input', loadData);

    // Backup Event
    container.querySelector('#btn-backup-db').addEventListener('click', async () => {
        try {
            const res = await api.backupDatabase();
            window.showToast(res.message);
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    });

    // Attach Toggle Events safely
    container.addEventListener('click', async (e) => {
        const toggleBtn = e.target.closest('button');
        if (!toggleBtn) return;

        const id = toggleBtn.dataset.id;
        const currentStatus = toggleBtn.dataset.status;
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        
        let type = '';
        if (toggleBtn.classList.contains('toggle-vendor')) type = 'vendors';
        if (toggleBtn.classList.contains('toggle-category')) type = 'categories';
        if (toggleBtn.classList.contains('toggle-item')) type = 'items';
        if (toggleBtn.classList.contains('toggle-user')) type = 'users';

        if (type && id) {
            try {
                await api.toggleStatus(type, id, newStatus);
                window.showToast(`${type.slice(0,-1)} status updated`);
                loadData();
            } catch (err) {
                window.showToast(err.message, 'error');
            }
        }
    });

    // Form Submits
    container.querySelector('#form-user').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = container.querySelector('#user-name').value.trim();
        const password = container.querySelector('#user-password').value;
        const confirm = container.querySelector('#user-password-confirm').value;
        const role = container.querySelector('#user-role').value;

        if (password !== confirm) return window.showToast('Passwords do not match', 'error');
        
        try {
            await api.addUser({ username, password, role });
            window.showToast('User Added');
            e.target.reset();
            loadData();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    });

    container.querySelector('#form-vendor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = container.querySelector('#vendor-name').value.trim();
        try {
            await api.addVendor(name);
            window.showToast('Vendor Added');
            e.target.reset();
            loadData();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    });

    container.querySelector('#form-category').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = container.querySelector('#category-name').value.trim();
        try {
            await api.addCategory(name);
            window.showToast('Category Added');
            e.target.reset();
            loadData();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    });

    container.querySelector('#form-item').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = container.querySelector('#item-name').value.trim();
        const categoryId = parseInt(container.querySelector('#item-category').value);
        const defaultPrice = parseFloat(container.querySelector('#item-price').value);
        const unit = container.querySelector('#item-unit').value;

        try {
            await api.addItem({ name, categoryId, defaultPrice, unit });
            window.showToast('Item Added');
            e.target.reset();
            formContainer.style.display = 'none';
            loadData();
        } catch (err) {
            window.showToast(err.message, 'error');
        }
    });

    // Initial Load
    await loadData();
    
    return container;
}
