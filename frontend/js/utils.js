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
  // Color coordination: green=success, blue=in progress, red=failure/error
  const map = {
    'completed': 'success',      // green
    'running': 'primary',        // blue
    'processing': 'primary',     // blue
    'queued': 'primary',         // blue (in progress)
    'pending': 'default',        // gray
    'awaiting_prompt': 'warning', // orange/yellow
    'error': 'error',            // red
    'failed': 'error',           // red
    'cancelled': 'error'         // red
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
// Browser notifications for segment completion
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('Browser does not support notifications');
    return;
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function notifySegmentAwaitingPrompt(jobName, segmentIndex) {
  if (!('Notification' in window)) return;
  
  // Only notify if tab is not focused
  if (!document.hidden) return;
  
  // Helper function to send the notification
  const sendNotification = () => {
    new Notification('Prompt input required!', {
      body: `${jobName}: Segment ${segmentIndex} completed. Enter the next prompt to continue.`,
      icon: '/static/favicon.ico',
      tag: `segment-${segmentIndex}` // Prevent duplicate notifications
    });
  };
  
  // Check permission status and request if needed (per MDN pattern)
  if (Notification.permission === 'granted') {
    sendNotification();
  } else if (Notification.permission === 'default') {
    // Request permission and send notification if granted
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        sendNotification();
      }
    });
  }
  // If permission is 'denied', do nothing
}

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
