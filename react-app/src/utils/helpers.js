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
  console.log('[Notification] Attempting to send notification for:', jobName);
  console.log('[Notification] Permission status:', Notification.permission);

  if (!('Notification' in window)) {
    console.error('[Notification] Browser does not support notifications');
    showToast('Browser does not support notifications', 'error');
    return;
  }

  if (Notification.permission === 'denied') {
    console.warn('[Notification] Notification permission denied by user');
    showToast('Notifications are blocked. Please enable in browser settings.', 'warning');
    return;
  }

  if (Notification.permission === 'default') {
    console.warn('[Notification] Notification permission not yet requested');
    showToast('Please allow notifications to get alerts', 'warning');
    requestNotificationPermission();
    return;
  }

  if (Notification.permission === 'granted') {
    console.log('[Notification] Sending notification...');
    try {
      const notification = new Notification(`Segment ${completedSegmentIndex} Complete`, {
        body: `${jobName}: Segment ${completedSegmentIndex} completed. Please enter a prompt for Segment ${nextSegmentIndex}.`,
        icon: '/favicon.ico',
        tag: `job-${jobName}-segment-${nextSegmentIndex}`, // Prevents duplicate notifications
        requireInteraction: false
      });

      notification.onclick = function() {
        window.focus();
        notification.close();
      };

      console.log('[Notification] Notification sent successfully');
      showToast(`Job "${jobName}" is awaiting prompt`, 'info');
    } catch (error) {
      console.error('[Notification] Failed to create notification:', error);
      showToast('Failed to send notification: ' + error.message, 'error');
    }
  }
}

export function requestNotificationPermission() {
  console.log('[Notification] Requesting notification permission...');

  if (!('Notification' in window)) {
    console.error('[Notification] Browser does not support notifications');
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('[Notification] Permission result:', permission);
      if (permission === 'granted') {
        showToast('Notifications enabled!', 'success');
      } else if (permission === 'denied') {
        showToast('Notifications blocked. You can enable them in browser settings.', 'warning');
      }
    });
  } else {
    console.log('[Notification] Permission already set:', Notification.permission);
  }
}
