/**
 * Settings Page Module
 * Handles settings display and updates
 */

const SettingsPage = {
    init() {
        this.bindEvents();
        this.loadSettings();
    },

    bindEvents() {
        // Form submission
        document.getElementById('settings-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // Test connection button
        document.getElementById('btn-test-connection')?.addEventListener('click', () => {
            this.testConnection();
        });
    },

    async loadSettings() {
        try {
            // Load settings
            const data = await API.getSettings();
            const settings = data.settings;

            // Populate form fields
            if (settings.comfyui_url) {
                document.getElementById('comfyui-url').value = settings.comfyui_url;
            }
            if (settings.default_steps) {
                document.getElementById('default-steps').value = settings.default_steps;
            }
            if (settings.default_cfg) {
                document.getElementById('default-cfg').value = settings.default_cfg;
            }
            if (settings.default_width) {
                document.getElementById('default-width').value = settings.default_width;
            }
            if (settings.default_height) {
                document.getElementById('default-height').value = settings.default_height;
            }
            if (settings.auto_start_queue) {
                document.getElementById('auto-start-queue').checked = settings.auto_start_queue === 'true';
            }

            // Load and populate dropdowns
            await this.loadDropdowns(settings);

        } catch (error) {
            Toast.error('Failed to load settings');
        }
    },

    async loadDropdowns(settings) {
        // Load checkpoints
        try {
            const data = await API.getCheckpoints();
            const select = document.getElementById('default-checkpoint');
            if (data.checkpoints && data.checkpoints.length > 0) {
                select.innerHTML = data.checkpoints.map(cp =>
                    `<option value="${cp}" ${cp === settings.default_checkpoint ? 'selected' : ''}>${cp}</option>`
                ).join('');
            } else {
                select.innerHTML = '<option value="">No checkpoints found</option>';
            }
        } catch (error) {
            console.error('Failed to load checkpoints:', error);
        }

        // Load samplers
        try {
            const data = await API.getSamplers();
            const select = document.getElementById('default-sampler');
            if (data.samplers && data.samplers.length > 0) {
                select.innerHTML = data.samplers.map(s =>
                    `<option value="${s}" ${s === settings.default_sampler ? 'selected' : ''}>${s}</option>`
                ).join('');
            }
        } catch (error) {
            console.error('Failed to load samplers:', error);
        }

        // Load schedulers
        try {
            const data = await API.getSchedulers();
            const select = document.getElementById('default-scheduler');
            if (data.schedulers && data.schedulers.length > 0) {
                select.innerHTML = data.schedulers.map(s =>
                    `<option value="${s}" ${s === settings.default_scheduler ? 'selected' : ''}>${s}</option>`
                ).join('');
            }
        } catch (error) {
            console.error('Failed to load schedulers:', error);
        }
    },

    async saveSettings() {
        const form = document.getElementById('settings-form');
        const formData = new FormData(form);

        const settings = {
            comfyui_url: formData.get('comfyui_url') || 'http://127.0.0.1:8188',
            default_checkpoint: formData.get('default_checkpoint') || '',
            default_steps: formData.get('default_steps') || '20',
            default_cfg: formData.get('default_cfg') || '7',
            default_sampler: formData.get('default_sampler') || 'euler',
            default_scheduler: formData.get('default_scheduler') || 'normal',
            default_width: formData.get('default_width') || '512',
            default_height: formData.get('default_height') || '512',
            auto_start_queue: document.getElementById('auto-start-queue').checked ? 'true' : 'false'
        };

        try {
            await API.updateSettings(settings);
            Toast.success('Settings saved');

            // Refresh status
            App.updateStatus();

        } catch (error) {
            Toast.error('Failed to save settings');
        }
    },

    async testConnection() {
        const url = document.getElementById('comfyui-url').value;
        const btn = document.getElementById('btn-test-connection');

        btn.disabled = true;
        btn.textContent = 'Testing...';

        try {
            // Temporarily save the URL to test it
            await API.updateSettings({ comfyui_url: url });

            const status = await API.getComfyUIStatus();

            if (status.connected) {
                Toast.success('Connection successful!');
            } else {
                Toast.error(`Connection failed: ${status.message}`);
            }
        } catch (error) {
            Toast.error('Connection test failed');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Test Connection';
            App.updateStatus();
        }
    }
};