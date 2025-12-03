/**
 * Main Application Module
 * Handles app initialization and navigation
 */

const App = {
    statusInterval: null,

    init() {
        this.bindNavigation();
        this.updateStatus();
        this.startStatusPolling();

        // Initialize page modules
        QueuePage.init();
        CreatePage.init();
        SettingsPage.init();
    },

    bindNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                this.showPage(page);
            });
        });
    },

    showPage(pageName) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        });

        // Update page visibility
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageName}`);
        });

        // Page-specific actions
        if (pageName === 'queue') {
            QueuePage.loadJobs();
        } else if (pageName === 'create') {
            CreatePage.loadOptions();
        } else if (pageName === 'settings') {
            SettingsPage.loadSettings();
        }
    },

    async updateStatus() {
        try {
            // Update ComfyUI status
            const comfyStatus = await API.getComfyUIStatus();
            const comfyBadge = document.getElementById('comfyui-status');

            if (comfyStatus.connected) {
                comfyBadge.textContent = 'ComfyUI: Connected';
                comfyBadge.className = 'status-badge connected';
            } else {
                comfyBadge.textContent = 'ComfyUI: Disconnected';
                comfyBadge.className = 'status-badge disconnected';
            }

            // Update queue status
            const queueStatus = await API.getQueueStatus();
            const queueBadge = document.getElementById('queue-status');
            const toggleBtn = document.getElementById('btn-toggle-queue');

            if (queueStatus.is_running) {
                queueBadge.textContent = `Queue: Running (${queueStatus.pending_count} pending)`;
                queueBadge.className = 'status-badge running';
                if (toggleBtn) toggleBtn.textContent = 'Stop Queue';
            } else {
                queueBadge.textContent = 'Queue: Stopped';
                queueBadge.className = 'status-badge disconnected';
                if (toggleBtn) toggleBtn.textContent = 'Start Queue';
            }

        } catch (error) {
            console.error('Failed to update status:', error);
        }
    },

    startStatusPolling() {
        // Poll status every 5 seconds
        this.statusInterval = setInterval(() => {
            this.updateStatus();
        }, 5000);
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