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

export function notifySegmentAwaitingPrompt(jobName, completedSegmentIndex, nextSegmentIndex) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`Segment ${completedSegmentIndex} Complete`, {
      body: `${jobName}: Segment ${completedSegmentIndex} completed. Please enter a prompt for Segment ${nextSegmentIndex}.`,
      icon: '/favicon.ico'
    });
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
