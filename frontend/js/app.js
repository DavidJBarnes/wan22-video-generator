/**
 * Main Application Module
 * Handles app initialization and navigation
 */

const App = {
    statusInterval: null,

    async init() {
        this.bindNavigation();
        this.startStatusPolling();
        
        // Preload settings before navigating so they're available for modals
        try {
            const resp = await API.getSettings();
            AppState.settings = resp.settings || resp;
        } catch (e) {
            console.error('Failed to preload settings:', e);
            AppState.settings = {};
        }
        
        // Navigate to dashboard on load
        navigate('dashboard');
    },

    bindNavigation() {
        // Bind sidebar navigation items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page) {
                    navigate(page);
                }
            });
        });
    },

    async updateStatus() {
        try {
            // Update ComfyUI status in header if element exists
            const comfyBadge = document.getElementById('comfyui-status');
            if (comfyBadge) {
                const comfyStatus = await API.checkComfyStatus();
                if (comfyStatus.reachable) {
                    comfyBadge.textContent = 'ComfyUI: Connected';
                    comfyBadge.className = 'status-badge connected';
                } else {
                    comfyBadge.textContent = 'ComfyUI: Disconnected';
                    comfyBadge.className = 'status-badge disconnected';
                }
            }

            // Update queue status if element exists
            const queueBadge = document.getElementById('queue-status');
            if (queueBadge) {
                const queueStatus = await API.getQueueStatus();
                if (queueStatus.is_running) {
                    queueBadge.textContent = `Queue: Running (${queueStatus.pending_count} pending)`;
                    queueBadge.className = 'status-badge running';
                } else {
                    queueBadge.textContent = 'Queue: Stopped';
                    queueBadge.className = 'status-badge disconnected';
                }
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    },

    startStatusPolling() {
        // Poll status every 10 seconds
        this.statusInterval = setInterval(() => {
            this.updateStatus();
        }, 10000);
    },

    stopStatusPolling() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
