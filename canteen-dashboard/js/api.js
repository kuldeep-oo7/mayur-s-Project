// Use relative path so nginx proxies correctly from any device on the network
export const API_BASE = '/api';

async function request(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        window.location.reload();
        throw new Error('Session expired');
    }

    if (!response.ok) {
        let errorMsg = 'API Request Failed';
        try {
            const error = await response.json();
            errorMsg = error.error || errorMsg;
        } catch {
            errorMsg = `HTTP ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
    }

    return response.json();
}

export const api = {
    getVendors: () => request('/vendors'),
    addVendor: (name) => request('/vendors', { method: 'POST', body: JSON.stringify({ name }) }),
    
    getCategories: () => request('/categories'),
    addCategory: (name) => request('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
    
    getItems: () => request('/items'),
    addItem: (item) => request('/items', { method: 'POST', body: JSON.stringify(item) }),

    getUsers: () => request('/users'),
    addUser: (user) => request('/users', { method: 'POST', body: JSON.stringify(user) }),

    toggleStatus: (type, id, status) => request(`/${type}/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    
    getPurchases: (filters = {}) => {
        const params = new URLSearchParams(filters).toString();
        const endpoint = params ? `/purchases?${params}` : '/purchases';
        return request(endpoint);
    },
    addPurchase: (purchase) => request('/purchases', { method: 'POST', body: JSON.stringify(purchase) }),
    addPurchasesBatch: (purchases) => request('/purchases/batch', { method: 'POST', body: JSON.stringify(purchases) }),
    deletePurchase: (id) => request(`/purchases/${id}`, { method: 'DELETE' }),
    backupDatabase: () => request('/admin/backup', { method: 'POST' }),

    // Budgets
    getBudgets: (month) => request(`/budgets?month=${month}`),
    setBudget: (month, category, amount) => request('/budgets', { method: 'POST', body: JSON.stringify({ month, category, amount }) }),
    deleteBudget: (id) => request(`/budgets/${id}`, { method: 'DELETE' }),

    // Analytics
    getStatsSummary: (month) => request(`/stats/summary${month ? `?month=${encodeURIComponent(month)}` : ''}`),
    getAvailableMonths: () => request('/stats/months'),
    getItemTrends: (itemName) => request(`/stats/trends/${encodeURIComponent(itemName)}`),
    getItemPriceHistory: (id) => request(`/items/${id}/price-history`),

    // MDM — Master Data Management
    mdmResolve:       (raw, vendor_id) => request('/mdm/resolve', { method: 'POST', body: JSON.stringify({ raw, vendor_id }) }),
    mdmResolveBatch:  (items) => request('/mdm/resolve/batch', { method: 'POST', body: JSON.stringify({ items }) }),

    getMdmMaster:     ()            => request('/mdm/master'),
    addMdmMaster:     (data)        => request('/mdm/master', { method: 'POST', body: JSON.stringify(data) }),
    updateMdmMaster:  (id, data)    => request(`/mdm/master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteMdmMaster:  (id)          => request(`/mdm/master/${id}`, { method: 'DELETE' }),

    getMdmAliases:    (master_id)   => request(`/mdm/aliases${master_id ? `?master_id=${master_id}` : ''}`),
    addMdmAlias:      (data)        => request('/mdm/aliases', { method: 'POST', body: JSON.stringify(data) }),
    deleteMdmAlias:   (id)          => request(`/mdm/aliases/${id}`, { method: 'DELETE' }),

    getMdmSkuMap:     (master_id)   => request(`/mdm/sku-map${master_id ? `?master_id=${master_id}` : ''}`),
    addMdmSku:        (data)        => request('/mdm/sku-map', { method: 'POST', body: JSON.stringify(data) }),
    deleteMdmSku:     (id)          => request(`/mdm/sku-map/${id}`, { method: 'DELETE' }),

    getMdmPending:    (status)      => request(`/mdm/pending${status ? `?status=${status}` : ''}`),
    getMdmPendingCount: ()          => request('/mdm/pending/count'),
    addMdmPending:    (data)        => request('/mdm/pending', { method: 'POST', body: JSON.stringify(data) }),
    approveMdmPending:(id, data)    => request(`/mdm/pending/${id}/approve`, { method: 'PUT', body: JSON.stringify(data) }),
    dismissMdmPending:(id)          => request(`/mdm/pending/${id}/dismiss`, { method: 'PUT', body: JSON.stringify({}) }),
};
