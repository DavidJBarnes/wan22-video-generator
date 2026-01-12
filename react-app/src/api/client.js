/**
 * API Client for communicating with the backend
 */

const API_BASE_URL = '/api';

class APIClient {
  constructor() {
    this.imageRepoUrl = null; // Remote image repo URL (if configured)
  }

  setImageRepoUrl(url) {
    this.imageRepoUrl = url || null;
  }

  getImageRepoUrl() {
    return this.imageRepoUrl;
  }

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

  async getJobLogs(jobId, limit = 100) {
    return this.request(`/jobs/${jobId}/logs?limit=${limit}`);
  }

  async getJobProgress(jobId) {
    return this.request(`/jobs/${jobId}/progress`);
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

  async pauseJob(jobId) {
    return this.request(`/jobs/${jobId}/pause`, {
      method: 'POST'
    });
  }

  async unpauseJob(jobId) {
    return this.request(`/jobs/${jobId}/unpause`, {
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

  async moveJobToTop(jobId) {
    return this.request(`/jobs/${jobId}/move-to-top`, {
      method: 'POST'
    });
  }

  async moveJobToBottom(jobId) {
    return this.request(`/jobs/${jobId}/move-to-bottom`, {
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

  getJobVideoUpscaled(jobId) {
    return `${API_BASE_URL}/jobs/${jobId}/video/upscaled`;
  }

  getSegmentVideo(jobId, segmentIndex) {
    return `${API_BASE_URL}/jobs/${jobId}/segments/${segmentIndex}/video`;
  }

  async submitSegmentPrompt(jobId, segmentIndex, prompt, loras = [], autoFinalize = false, faceswapOptions = null, fadeToBlack = false, customStartImage = null) {
    const formData = new FormData();
    formData.append('prompt', prompt);

    // Send loras as JSON array: [{high_file, high_weight, low_file, low_weight}, ...]
    if (loras && loras.length > 0) {
      // Filter out empty entries and build the loras array with weights
      const loraArray = loras
        .filter(l => l && (l.high_file || l.low_file))
        .map(l => ({
          high_file: l.high_file || null,
          high_weight: l.high_weight ?? 1,
          low_file: l.low_file || null,
          low_weight: l.low_weight ?? 1
        }));

      if (loraArray.length > 0) {
        formData.append('loras', JSON.stringify(loraArray));
      }
    }

    // Auto-finalize flag
    formData.append('auto_finalize', autoFinalize.toString());

    // Fade to black flag
    formData.append('fade_to_black', fadeToBlack.toString());

    // Faceswap options (per-segment)
    if (faceswapOptions) {
      formData.append('faceswap_enabled', (faceswapOptions.enabled || false).toString());
      formData.append('faceswap_image', faceswapOptions.image || '');
      formData.append('faceswap_faces_order', faceswapOptions.facesOrder || 'left-right');
      formData.append('faceswap_faces_index', faceswapOptions.facesIndex || '0');
    }

    // Custom start image (overrides default previous segment's last frame)
    if (customStartImage) {
      formData.append('custom_start_image', customStartImage);
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

  async restoreSegment(jobId, segmentIndex) {
    return this.request(`/jobs/${jobId}/segments/${segmentIndex}/restore`, {
      method: 'POST'
    });
  }

  async updateSegmentNote(jobId, segmentIndex, note) {
    const formData = new FormData();
    formData.append('note', note);
    return this.request(`/jobs/${jobId}/segments/${segmentIndex}/note`, {
      method: 'PUT',
      body: formData
    });
  }

  async updateSegmentFade(jobId, segmentIndex, fadeToBlack) {
    const formData = new FormData();
    formData.append('fade_to_black', fadeToBlack.toString());
    return this.request(`/jobs/${jobId}/segments/${segmentIndex}/fade`, {
      method: 'PUT',
      body: formData
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

  async browseImageRepo(path = '', tag = null) {
    if (this.imageRepoUrl) {
      // Fetch directory listing from URL and parse HTML
      const cleanBase = this.imageRepoUrl.endsWith('/') ? this.imageRepoUrl.slice(0, -1) : this.imageRepoUrl;
      const fullUrl = path ? `${cleanBase}/${path}/` : `${cleanBase}/`;

      try {
        const response = await fetch(fullUrl);
        const html = await response.text();

        // Parse HTML directory listing
        const { folders, images } = this._parseDirectoryListing(html, path);

        // Fetch preview images for each folder (in parallel, max 3 images each)
        await Promise.all(folders.map(async (folder) => {
          try {
            const folderUrl = `${cleanBase}/${folder.path}/`;
            const folderResponse = await fetch(folderUrl);
            const folderHtml = await folderResponse.text();
            const { images: folderImages } = this._parseDirectoryListing(folderHtml, folder.path);
            folder.preview_images = folderImages.slice(0, 3).map(img => img.path);
          } catch (e) {
            folder.preview_images = [];
          }
        }));

        // Build breadcrumbs
        const breadcrumbs = [{ name: 'Root', path: '' }];
        if (path) {
          const parts = path.split('/');
          let currentPath = '';
          for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            breadcrumbs.push({ name: part, path: currentPath });
          }
        }

        return { folders, images, breadcrumbs };
      } catch (error) {
        console.error('Failed to fetch directory listing:', error);
        throw error;
      }
    }

    // Fallback to local backend
    let url = `/image-repo/browse?path=${encodeURIComponent(path)}`;
    if (tag) {
      url += `&tag=${encodeURIComponent(tag)}`;
    }
    return this.request(url);
  }

  _parseDirectoryListing(html, basePath = '') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));

    const folders = [];
    const images = [];

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href === '../' || href.startsWith('?') || href.startsWith('/')) continue;

      const name = decodeURIComponent(href.replace(/\/$/, ''));
      const itemPath = basePath ? `${basePath}/${name}` : name;

      if (href.endsWith('/')) {
        folders.push({ name, path: itemPath, preview_images: [] });
      } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(href)) {
        images.push({ name, path: itemPath, rating: null });
      }
    }

    return { folders, images };
  }

  async getAllImages(path = '') {
    if (this.imageRepoUrl) {
      // For URL-based repo, just return empty - use browseImageRepo instead
      return [];
    }
    return this.request(`/image-repo/all-images?path=${encodeURIComponent(path)}`);
  }

  getRepoImage(path) {
    if (this.imageRepoUrl) {
      // Simple static file server - just append path
      const cleanBase = this.imageRepoUrl.endsWith('/') ? this.imageRepoUrl.slice(0, -1) : this.imageRepoUrl;
      return `${cleanBase}/${path}`;
    }
    return `${API_BASE_URL}/image-repo/image?path=${encodeURIComponent(path)}`;
  }

  getRepoThumbnail(path, size = 150) {
    if (this.imageRepoUrl) {
      // Simple static file server - no thumbnails, return full image
      const cleanBase = this.imageRepoUrl.endsWith('/') ? this.imageRepoUrl.slice(0, -1) : this.imageRepoUrl;
      return `${cleanBase}/${path}`;
    }
    return `${API_BASE_URL}/image-repo/thumbnail?path=${encodeURIComponent(path)}&size=${size}`;
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

  async getJobsForImage(filename) {
    return this.request(`/image-repo/jobs?filename=${encodeURIComponent(filename)}`);
  }

  // ============== Image Tags ==============
  // Tags are derived from job_name_prefixes and job_name_descriptions in settings

  async getImageTags() {
    // Returns available tags (from settings) with usage counts
    return this.request('/image-tags');
  }

  async getTagsForImage(imagePath) {
    return this.request(`/image-repo/image-tags?image_path=${encodeURIComponent(imagePath)}`);
  }

  async addTagToImage(imagePath, tagName) {
    const formData = new FormData();
    formData.append('image_path', imagePath);
    formData.append('tag_name', tagName);

    return this.request('/image-repo/image-tags', {
      method: 'POST',
      body: formData
    });
  }

  async removeTagFromImage(imagePath, tagName) {
    return this.request(`/image-repo/image-tags?image_path=${encodeURIComponent(imagePath)}&tag_name=${encodeURIComponent(tagName)}`, {
      method: 'DELETE'
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

  async cleanupDuplicateLoras() {
    return this.request('/loras/cleanup', {
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

  // ============== Video Upscaling ==============

  async getUpscaleModels() {
    return this.request('/upscale/models');
  }

  async upscaleJobVideo(jobId, scale = 2, model = 'realesr-animevideov3') {
    return this.request(`/jobs/${jobId}/upscale?scale=${scale}&model=${encodeURIComponent(model)}`, {
      method: 'POST'
    });
  }
}

export default new APIClient();
