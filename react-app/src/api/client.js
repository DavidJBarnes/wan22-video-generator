/**
 * API Client for communicating with the backend
 */

const API_BASE_URL = '/api';

class APIClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
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

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const errorMsg = `API returned HTML instead of JSON. Make sure you're accessing the app via the FastAPI backend.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  // ============== Jobs ==============

  async getJobs(limit = 100, offset = 0) {
    return this.request(`/jobs?limit=${limit}&offset=${offset}`);
  }

  async getJob(jobId) {
    return this.request(`/jobs/${jobId}`);
  }

  async createJob(jobData) {
    return this.request('/jobs', {
      method: 'POST',
      body: jobData
    });
  }

  async updateJob(jobId, jobData) {
    return this.request(`/jobs/${jobId}`, {
      method: 'PUT',
      body: jobData
    });
  }

  async deleteJob(jobId) {
    return this.request(`/jobs/${jobId}`, {
      method: 'DELETE'
    });
  }

  async cancelJob(jobId) {
    return this.request(`/jobs/${jobId}/cancel`, {
      method: 'POST'
    });
  }

  async retryJob(jobId) {
    return this.request(`/jobs/${jobId}/retry`, {
      method: 'POST'
    });
  }

  async finalizeJob(jobId) {
    return this.request(`/jobs/${jobId}/finalize`, {
      method: 'POST'
    });
  }

  async reopenJob(jobId) {
    return this.request(`/jobs/${jobId}/reopen`, {
      method: 'POST'
    });
  }

  async moveJobUp(jobId) {
    return this.request(`/jobs/${jobId}/move-up`, {
      method: 'POST'
    });
  }

  async moveJobDown(jobId) {
    return this.request(`/jobs/${jobId}/move-down`, {
      method: 'POST'
    });
  }

  // ============== Settings ==============

  async getSettings() {
    return this.request('/settings');
  }

  async updateSettings(settings) {
    return this.request('/settings', {
      method: 'PUT',
      body: { settings }
    });
  }

  // ============== Queue Control ==============

  async getQueueStatus() {
    return this.request('/queue/status');
  }

  async startQueue() {
    return this.request('/queue/start', {
      method: 'POST'
    });
  }

  async stopQueue() {
    return this.request('/queue/stop', {
      method: 'POST'
    });
  }

  // ============== ComfyUI Info ==============

  async getComfyUIStatus() {
    return this.request('/comfyui/status');
  }

  async checkComfyStatus() {
    try {
      const status = await this.request('/comfyui/status');
      return { reachable: status.connected, ...status };
    } catch (error) {
      return { reachable: false, error: error.message };
    }
  }

  async getCheckpoints() {
    return this.request('/comfyui/checkpoints');
  }

  async getSamplers() {
    return this.request('/comfyui/samplers');
  }

  async getSchedulers() {
    return this.request('/comfyui/schedulers');
  }

  async getLoras() {
    return this.request('/comfyui/loras');
  }

  // ============== Job Segments & Frames ==============

  async getSegments(jobId) {
    try {
      return await this.request(`/jobs/${jobId}/segments`);
    } catch (error) {
      console.warn('Segments endpoint not available:', error);
      return [];
    }
  }

  getJobThumbnail(jobId) {
    return `${API_BASE_URL}/jobs/${jobId}/thumbnail`;
  }

  getSegmentFrame(jobId, segmentIndex) {
    return `${API_BASE_URL}/jobs/${jobId}/segments/${segmentIndex}/frame`;
  }

  getJobVideo(jobId) {
    return `${API_BASE_URL}/jobs/${jobId}/video`;
  }

  async submitSegmentPrompt(jobId, segmentIndex, prompt, loras = []) {
    const formData = new FormData();
    formData.append('prompt', prompt);

    // Send loras as JSON array: [{high_file, low_file}, ...]
    if (loras && loras.length > 0) {
      // Filter out empty entries and build the loras array
      const loraArray = loras
        .filter(l => l && (l.high_file || l.low_file))
        .map(l => ({ high_file: l.high_file || null, low_file: l.low_file || null }));

      if (loraArray.length > 0) {
        formData.append('loras', JSON.stringify(loraArray));
      }
    }

    return this.request(`/jobs/${jobId}/segments/${segmentIndex}/prompt`, {
      method: 'POST',
      body: formData
    });
  }

  async deleteSegment(jobId, segmentIndex) {
    return this.request(`/jobs/${jobId}/segments/${segmentIndex}`, {
      method: 'DELETE'
    });
  }

  // ============== Image Upload ==============

  async uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    return this.request('/upload/image', {
      method: 'POST',
      body: formData
    });
  }

  async uploadImageBase64(base64Data, filename) {
    const formData = new FormData();
    formData.append('image_data', base64Data);
    formData.append('filename', filename);

    return this.request('/upload/image/base64', {
      method: 'POST',
      body: formData
    });
  }

  // ============== Image Repository ==============

  async browseImageRepo(path = '') {
    return this.request(`/image-repo/browse?path=${encodeURIComponent(path)}`);
  }

  getRepoImage(path) {
    return `${API_BASE_URL}/image-repo/image?path=${encodeURIComponent(path)}`;
  }

  async selectImageFromRepo(imagePath) {
    const formData = new FormData();
    formData.append('image_path', imagePath);

    return this.request('/image-repo/select', {
      method: 'POST',
      body: formData
    });
  }

  async deleteRepoImage(imagePath) {
    const formData = new FormData();
    formData.append('image_path', imagePath);

    return this.request('/image-repo/delete', {
      method: 'POST',
      body: formData
    });
  }

  async getImageRating(imagePath) {
    return this.request(`/image-repo/rating?image_path=${encodeURIComponent(imagePath)}`);
  }

  async setImageRating(imagePath, rating) {
    const formData = new FormData();
    formData.append('image_path', imagePath);
    if (rating !== null) {
      formData.append('rating', rating);
    }

    return this.request('/image-repo/rating', {
      method: 'POST',
      body: formData
    });
  }

  // ============== ComfyUI View Proxy ==============

  getComfyUIImage(filename, subfolder = '', type = 'input') {
    return `${API_BASE_URL}/comfyui/view?filename=${encodeURIComponent(filename)}&subfolder=${subfolder}&type=${type}`;
  }

  // ============== LoRA Library ==============

  async getLoraLibrary() {
    return this.request('/loras/library');
  }

  async fetchAndCacheLoras() {
    return this.request('/loras/fetch', {
      method: 'POST'
    });
  }

  async getLora(loraId) {
    return this.request(`/loras/${loraId}`);
  }

  async updateLora(loraId, data) {
    return this.request(`/loras/${loraId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
  }

  async deleteLora(loraId) {
    return this.request(`/loras/${loraId}`, {
      method: 'DELETE'
    });
  }

  async refreshLoraPreview(loraId) {
    return this.request(`/loras/${loraId}/refresh-preview`, {
      method: 'POST'
    });
  }

  getLoraPreviewUrl(loraId) {
    return `${API_BASE_URL}/loras/${loraId}/preview`;
  }

  async getHiddenLoras() {
    return this.request('/loras/hidden');
  }

  async restoreHiddenLora(filename) {
    return this.request(`/loras/hidden/restore?filename=${encodeURIComponent(filename)}`, {
      method: 'POST'
    });
  }
}

export default new APIClient();
