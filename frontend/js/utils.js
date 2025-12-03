// Utility functions

function showToast(message, type = 'info', title = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getChipClass(status) {
  const map = {
    'completed': 'success',
    'running': 'primary',
    'error': 'error',
    'awaiting_prompt': 'warning',
    'queued': 'default',
    'processing': 'primary'
  };
  return map[status] || 'default';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  // Convert UTC to local time
  return date.toLocaleString();
}

function calculateProgress(current, total) {
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
}

// Global state
const AppState = {
  currentPage: 'dashboard',
  currentJobId: null,
  settings: null,
  jobs: []
};

// Router
function navigate(page, params = {}) {
  AppState.currentPage = page;
  Object.assign(AppState, params);
  
  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`[data-page="${page.split('-')[0]}"]`);
  if (navItem) navItem.classList.add('active');
  
  // Render page (defined in pages.js)
  if (typeof window.renderPage === 'function') {
    window.renderPage(page);
  }
}

function showModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}