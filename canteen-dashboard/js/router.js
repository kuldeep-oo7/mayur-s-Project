import renderDashboard from './pages/dashboard.js';
import renderScanner from './pages/scanner.js';
import renderEntry from './pages/entry.js';
import renderRecords from './pages/records.js';
import renderTrends from './pages/trends.js';
import renderSuppliers from './pages/suppliers.js';
import renderMonthly from './pages/monthly.js';
import renderSpending from './pages/spending.js';
import renderExport from './pages/export.js';
import renderReports from './pages/reports.js';
import renderBudget from './pages/budget.js';
import renderMaster from './pages/master.js';
import renderAudit from './pages/audit.js';
import renderMDM   from './pages/mdm.js';

const routes = {
    '/':          { title: 'Dashboard',           render: renderDashboard },
    '/scanner':   { title: 'Scan Invoice',         render: renderScanner },
    '/entry':     { title: 'Daily Entry',           render: renderEntry },
    '/records':   { title: 'Purchase Records',      render: renderRecords },
    '/trends':    { title: 'Price Trends',          render: renderTrends },
    '/suppliers': { title: 'Supplier Comparison',   render: renderSuppliers },
    '/monthly':   { title: 'Monthly Report',        render: renderMonthly },
    '/spending':  { title: 'Spending Summary',      render: renderSpending },
    '/reports':   { title: 'Reports & Analytics',   render: renderReports },
    '/budget':    { title: 'Budget vs Actual',      render: renderBudget },
    '/export':    { title: 'Export Data',           render: renderExport },
    '/master':    { title: 'Master Data',           render: renderMaster },
    '/audit':     { title: 'Audit Log',             render: renderAudit },
    '/mdm':       { title: 'Item Master (MDM)',     render: renderMDM   },
};

function render404(container) {
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:50vh;gap:16px;text-align:center;">
            <i data-lucide="file-question" style="width:48px;height:48px;color:var(--text-muted);"></i>
            <h2 style="font-size:1.25rem;font-weight:600;">Page Not Found</h2>
            <p style="color:var(--text-muted);font-size:0.875rem;">The page you're looking for doesn't exist.</p>
            <a href="#/" class="btn btn-primary" style="margin-top:8px;">Go to Dashboard</a>
        </div>`;
    lucide.createIcons({ root: container });
}

export const initRouter = () => {
    const viewContainer = document.getElementById('view-container');
    const pageTitle     = document.getElementById('page-title');

    const handleRouteChange = async () => {
        const path = window.location.hash.slice(1) || '/';
        const route = routes[path];

        // Auth guard for admin-only routes
        if (path === '/master' || path === '/mdm') {
            const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (!user || user.role !== 'admin') {
                window.showToast?.('Admin access required', 'error');
                window.location.hash = '#/';
                return;
            }
        }

        window.updateNav?.(path);

        // Scroll to top on every navigation
        viewContainer.scrollTop = 0;

        if (!route) {
            pageTitle.textContent = 'Not Found';
            render404(viewContainer);
            return;
        }

        pageTitle.textContent = route.title;

        // Show skeleton while loading
        viewContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:16px;padding-top:8px;">
                <div class="skeleton skeleton-text" style="width:200px;height:28px;"></div>
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card" style="height:200px;"></div>
            </div>`;

        try {
            // Cleanup previous page (e.g. OCR workers)
            const prevPage = viewContainer.querySelector('[data-page-cleanup]');
            if (prevPage?._cleanup) prevPage._cleanup();

            const content = await route.render();
            viewContainer.innerHTML = '';

            const wrapper = document.createElement('div');
            wrapper.className = 'page-enter';
            wrapper.setAttribute('data-page-cleanup', '1');

            if (content instanceof HTMLElement) {
                // Transfer cleanup function from content element to wrapper
                if (content._cleanup) wrapper._cleanup = content._cleanup;
                wrapper.appendChild(content);
            } else {
                wrapper.innerHTML = content;
            }

            viewContainer.appendChild(wrapper);
            lucide.createIcons({ root: viewContainer });
        } catch (err) {
            console.error(`Route render error [${path}]:`, err);
            viewContainer.innerHTML = `
                <div class="card" style="border-left:4px solid var(--danger);">
                    <p style="color:var(--danger);font-weight:600;margin-bottom:4px;">Failed to load page</p>
                    <p style="color:var(--text-muted);font-size:0.875rem;">${window.escapeHtml?.(err.message) || 'Unknown error'}</p>
                </div>`;
        }
    };

    window.addEventListener('hashchange', handleRouteChange);
    handleRouteChange();
};
