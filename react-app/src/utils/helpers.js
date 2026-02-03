/**
 * Utility helper functions
 */

/**
 * Normalize a timestamp string to ensure it's interpreted as UTC.
 * SQLite CURRENT_TIMESTAMP produces "2024-01-15 10:30:00" (no timezone).
 * Our utc_now_iso() produces "2024-01-15T10:30:00Z".
 * Without 'Z', browsers interpret the timestamp as local time.
 */
export function normalizeUtcTimestamp(dateString) {
  if (!dateString) return null;
  // Already has timezone info (Z or +/-offset)
  if (/[Z+-]\d{0,4}:?\d{0,2}$/.test(dateString)) {
    return dateString;
  }
  // SQLite format "YYYY-MM-DD HH:MM:SS" - add Z to mark as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
    return dateString.replace(' ', 'T') + 'Z';
  }
  // ISO format without timezone "YYYY-MM-DDTHH:MM:SS" - add Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateString)) {
    return dateString + 'Z';
  }
  return dateString;
}

export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const normalized = normalizeUtcTimestamp(dateString);
    const date = new Date(normalized);
    return date.toLocaleString();
  } catch {
    return dateString;
  }
}

export function formatTime(isoString) {
  if (!isoString) return '--';
  try {
    const normalized = normalizeUtcTimestamp(isoString);
    const date = new Date(normalized);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '--';
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

export function hasFaceswap(job) {
  const params = job.parameters || {};
  return Boolean(params.faceswap_enabled);
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

