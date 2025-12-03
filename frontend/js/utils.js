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
  if (!total || total <= 0) return 0;
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

// Image lightbox for viewing full-size images
function openImageLightbox(url) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'image-lightbox';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    cursor: pointer;
  `;
  
  // Create image
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `;
  img.onerror = () => {
    overlay.innerHTML = '<div style="color: white; font-size: 18px;">Failed to load image</div>';
  };
  
  // Close button
  const closeBtn = document.createElement('div');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 30px;
    font-size: 40px;
    color: white;
    cursor: pointer;
  `;
  
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  
  // Close on click
  overlay.onclick = () => overlay.remove();
  
  document.body.appendChild(overlay);
}
