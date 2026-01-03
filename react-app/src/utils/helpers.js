/**
 * Utility helper functions
 */

export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch {
    return dateString;
  }
}

export function getChipClass(status) {
  const statusMap = {
    pending: 'chip-pending',
    running: 'chip-running',
    completed: 'chip-completed',
    failed: 'chip-failed',
    cancelled: 'chip-cancelled',
    awaiting_prompt: 'chip-awaiting'
  };
  return statusMap[status] || '';
}

export function getFaceswapName(job) {
  const params = job.parameters || {};
  if (!params.faceswap_enabled || !params.faceswap_image) {
    return null;
  }
  // Extract name from filename like "Andrea_all.safetensors.png" or "gena.safetensors.png"
  let name = params.faceswap_image
    .replace('.safetensors.png', '')
    .replace('_all', '');
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function showToast(message, type = 'info') {
  // Create toast container if it doesn't exist
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, type === 'error' ? 5000 : 3000);
}

