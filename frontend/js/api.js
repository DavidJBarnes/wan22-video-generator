/**
 * API Helper Module
 * Handles all communication with the backend API
 */

const API = {
    baseUrl: '/api',

    /**
     * Make an API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
            config.body = JSON.stringify(config.body);
        }

        if (config.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);
            
            // Check if we got HTML instead of JSON (common when accessing from wrong port)
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                const errorMsg = `API returned HTML instead of JSON. Make sure you're accessing the app via the FastAPI backend (http://localhost:8000/), not a separate static file server.`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            }
            
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'API request failed');
            }

            return data;
        } catch (error) {
            // Add helpful message for common "wrong port" error
            if (error.message && error.message.includes('Unexpected token')) {
                console.error(`API Error (${endpoint}): Got HTML instead of JSON. Are you accessing the app at http://localhost:8000/ (FastAPI backend)?`);
            } else {
                console.error(`API Error (${endpoint}):`, error);
            }
            throw error;
        }
    },

    // ============== Jobs ==============

    async getJobs(limit = 100, offset = 0) {
        return this.request(`/jobs?limit=${limit}&offset=${offset}`);
    },

    async getJob(jobId) {
        return this.request(`/jobs/${jobId}`);
    },

    async createJob(jobData) {
        return this.request('/jobs', {
            method: 'POST',
            body: jobData
        });
    },

    async deleteJob(jobId) {
        return this.request(`/jobs/${jobId}`, {
            method: 'DELETE'
        });
    },

    async cancelJob(jobId) {
        return this.request(`/jobs/${jobId}/cancel`, {
            method: 'POST'
        });
    },

    async retryJob(jobId) {
        return this.request(`/jobs/${jobId}/retry`, {
            method: 'POST'
        });
    },

    async finalizeJob(jobId) {
        return this.request(`/jobs/${jobId}/finalize`, {
            method: 'POST'
        });
    },

    async reopenJob(jobId) {
        return this.request(`/jobs/${jobId}/reopen`, {
            method: 'POST'
        });
    },

    // ============== Settings ==============

    async getSettings() {
        return this.request('/settings');
    },

    async updateSettings(settings) {
        return this.request('/settings', {
            method: 'PUT',
            body: { settings }
        });
    },

    // ============== Queue Control ==============

    async getQueueStatus() {
        return this.request('/queue/status');
    },

    async startQueue() {
        return this.request('/queue/start', {
            method: 'POST'
        });
    },

    async stopQueue() {
        return this.request('/queue/stop', {
            method: 'POST'
        });
    },

    // ============== ComfyUI Info ==============

    async getComfyUIStatus() {
        return this.request('/comfyui/status');
    },

    async checkComfyStatus() {
        // Wrapper that returns { reachable: boolean } for pages.js compatibility
        try {
            const status = await this.request('/comfyui/status');
            return { reachable: status.connected, ...status };
        } catch (error) {
            return { reachable: false, error: error.message };
        }
    },

    async getCheckpoints() {
        return this.request('/comfyui/checkpoints');
    },

    async getSamplers() {
        return this.request('/comfyui/samplers');
    },

    async getSchedulers() {
        return this.request('/comfyui/schedulers');
    },

    async getLoras() {
        return this.request('/comfyui/loras');
    },

    // ============== Job Segments & Frames ==============

    async getSegments(jobId) {
        // Get segments for a job - returns empty array if endpoint doesn't exist
        try {
            return await this.request(`/jobs/${jobId}/segments`);
        } catch (error) {
            // Segments endpoint may not exist yet, return empty array
            console.warn('Segments endpoint not available:', error);
            return [];
        }
    },

    getJobThumbnail(jobId) {
        // Return URL for job thumbnail
        return `${this.baseUrl}/jobs/${jobId}/thumbnail`;
    },

    getSegmentFrame(jobId, segmentIndex) {
        // Return URL for segment end frame
        return `${this.baseUrl}/jobs/${jobId}/segments/${segmentIndex}/frame`;
    },

    getJobVideo(jobId) {
        // Return URL for job's final video
        return `${this.baseUrl}/jobs/${jobId}/video`;
    },

    async submitSegmentPrompt(jobId, segmentIndex, prompt, highLora = null, lowLora = null) {
        // Submit a prompt for a specific segment (used when job is awaiting_prompt)
        // Optionally includes LoRA selections for this segment
        const formData = new FormData();
        formData.append('prompt', prompt);
        if (highLora) {
            formData.append('high_lora', highLora);
        }
        if (lowLora) {
            formData.append('low_lora', lowLora);
        }
        
        return this.request(`/jobs/${jobId}/segments/${segmentIndex}/prompt`, {
            method: 'POST',
            body: formData
        });
    },

    // ============== Image Upload ==============

    async uploadImage(file) {
        const formData = new FormData();
        formData.append('file', file);

        return this.request('/upload/image', {
            method: 'POST',
            body: formData
        });
    },

    async uploadImageBase64(base64Data, filename) {
        const formData = new FormData();
        formData.append('image_data', base64Data);
        formData.append('filename', filename);

        return this.request('/upload/image/base64', {
            method: 'POST',
            body: formData
        });
    }
};

// Toast notification helper
const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = 3000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(message) {
        this.show(message, 'success');
    },

    error(message) {
        this.show(message, 'error', 5000);
    }
};
