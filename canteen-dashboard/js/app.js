import { createIcons, icons } from 'lucide';

// Expose on window so every page script can call lucide.createIcons() without passing icons
const _createIcons = (options = {}) => createIcons({ icons, ...options });
window.lucide = { createIcons: _createIcons };

import { migrateLocalToBackend } from './migration.js';
import { initRouter } from './router.js';
import { API_BASE, api } from './api.js';

// ── Utilities (exported for modules, also on window for legacy page scripts) ──

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle' };
    const colorMap = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)' };

    const icon = document.createElement('i');
    icon.dataset.lucide = iconMap[type] || 'info';
    icon.style.cssText = `color:${colorMap[type] || 'var(--primary)'};width:18px;height:18px;flex-shrink:0;`;

    const span = document.createElement('span');
    span.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(span);
    container.appendChild(toast);
    _createIcons({ root: toast });

    const dismiss = () => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, 3500);
}

export function updateNav(route) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.route === route);
    });
}

// Expose on window for legacy page scripts that call window.showToast etc.
window.escapeHtml = escapeHtml;
window.showToast  = showToast;
window.updateNav  = updateNav;

// ── Login throttle helpers ────────────────────────────────────────────────────

function getLoginAttempts() {
    return JSON.parse(localStorage.getItem('login_attempts') || '{}');
}

function recordLoginAttempt(username, success) {
    const attempts = getLoginAttempts();
    if (!attempts[username]) attempts[username] = { count: 0, lockedUntil: null };
    if (success) {
        attempts[username] = { count: 0, lockedUntil: null };
    } else {
        attempts[username].count++;
        if (attempts[username].count >= 5) {
            attempts[username].lockedUntil = Date.now() + 5 * 60 * 1000;
        }
    }
    localStorage.setItem('login_attempts', JSON.stringify(attempts));
}

function isUserLocked(username) {
    const record = getLoginAttempts()[username];
    if (!record?.lockedUntil) return false;
    if (Date.now() < record.lockedUntil) {
        const mins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
        return `Too many attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`;
    }
    return false;
}

// ── Theme (dark / light) ──────────────────────────────────────────────────────

function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.setAttribute('data-lucide', dark ? 'sun' : 'moon');
        _createIcons({ root: icon.parentElement });
    }
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    applyTheme(dark);

    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
        applyTheme(!isDark);
    });
}

// ── Mobile sidebar ────────────────────────────────────────────────────────────

function initMobileSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('btn-hamburger');

    const open = () => {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    };

    const close = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    };

    hamburger.addEventListener('click', () => {
        sidebar.classList.contains('open') ? close() : open();
    });

    overlay.addEventListener('click', close);

    // Close sidebar on nav link click (mobile)
    sidebar.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) close();
        });
    });
}

// ── App init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        _createIcons();

        const authOverlay = document.getElementById('auth-overlay');
        const appContainer = document.getElementById('app');
        const loginForm    = document.getElementById('login-form');
        const forgotForm   = document.getElementById('forgot-password-form');
        const forgotBtn    = document.getElementById('forgot-password-link');
        const backLoginBtn = document.getElementById('back-to-login-link');

        let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

        const initializeApp = () => {
            authOverlay.style.display = 'none';
            appContainer.style.display = 'flex';

            document.getElementById('active-username-text').textContent = currentUser.username;
            document.getElementById('avatar-initial').textContent = currentUser.username.charAt(0).toUpperCase();

            // Hide Master Data link for non-admins
            const masterLink = document.getElementById('nav-master');
            masterLink.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
            if (currentUser.role !== 'admin' && location.hash === '#/master') {
                location.hash = '#/';
            }

            initMobileSidebar();
            initTheme();
            migrateLocalToBackend().catch(err => console.error('Migration check failed:', err));
            initRouter();

            // MDM pending badge — admin only
            if (currentUser.role === 'admin') {
                const badge = document.getElementById('nav-mdm-badge');
                const mdmLink = document.getElementById('nav-mdm');
                if (mdmLink) mdmLink.style.display = 'flex';
                const refreshMdmBadge = () => {
                    api.getMdmPendingCount().then(({ count }) => {
                        if (badge) {
                            badge.textContent = count > 9 ? '9+' : count;
                            badge.style.display = count > 0 ? 'inline' : 'none';
                        }
                    }).catch(() => {});
                };
                refreshMdmBadge();
                setInterval(refreshMdmBadge, 5 * 60 * 1000);
                window._refreshMdmBadge = refreshMdmBadge;
            }
        };

        if (currentUser) {
            initializeApp();
        } else {
            authOverlay.style.display = 'flex';
            appContainer.style.display = 'none';
        }

        // Login
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;

            const lockedMsg = isUserLocked(username);
            if (lockedMsg) { showToast(lockedMsg, 'error'); return; }

            const submitBtn = loginForm.querySelector('button[type=submit]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in…';

            try {
                const response = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    recordLoginAttempt(username, true);
                    localStorage.setItem('currentUser', JSON.stringify(data.user));
                    localStorage.setItem('authToken', data.token);
                    currentUser = data.user;
                    loginForm.reset();
                    initializeApp();
                    showToast(`Welcome back, ${data.user.username}!`);
                } else {
                    recordLoginAttempt(username, false);
                    showToast(data.error || 'Invalid credentials', 'error');
                }
            } catch {
                showToast('Cannot connect to server. Ensure the backend is running.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
            }
        });

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('authToken');
            location.reload();
        });

        // Forgot password toggles
        forgotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            forgotForm.style.display = 'block';
        });

        backLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            forgotForm.style.display = 'none';
            loginForm.style.display = 'block';
        });

    } catch (err) {
        console.error('App initialization error:', err);
    }
});
