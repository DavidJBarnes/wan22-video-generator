/**
 * API Client for communicating with the backend
 */

const DEFAULT_API_URL = '/api';

class APIClient {
  constructor() {
    // Load custom API URL from localStorage if set
    this.baseUrl = localStorage.getItem('api_url') || DEFAULT_API_URL;
    // Load local server URL for faster video/image loading
    this.localServerUrl = localStorage.getItem('local_server_url') || '';
  }

  /**
   * Set a custom API base URL
   * @param {string} url - The new base URL (e.g., 'http://2070.zero:9090/api')
   */
  setBaseUrl(url) {
    if (url && url.trim()) {
      this.baseUrl = url.trim();
      localStorage.setItem('api_url', this.baseUrl);
    } else {
      this.baseUrl = DEFAULT_API_URL;
      localStorage.removeItem('api_url');
    }
  }

  /**
   * Get the current API base URL
   */
  getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Set a custom local server URL for faster video/image loading
   * @param {string} url - The local server URL (e.g., 'http://localhost:8765')
   */
  setLocalServerUrl(url) {
    if (url && url.trim()) {
      this.localServerUrl = url.trim().replace(/\/$/, ''); // Remove trailing slash
      localStorage.setItem('local_server_url', this.localServerUrl);
    } else {
      this.localServerUrl = '';
      localStorage.removeItem('local_server_url');
    }
  }

  /**
   * Get the current local server URL
   */
  getLocalServerUrl() {
    return this.localServerUrl;
  }

  /**
   * Get local URL for a segment video (if local server is configured)
   * @param {number} jobId - Job ID
   * @param {number} segmentIndex - Segment index
   * @returns {string|null} Local URL or null if not configured
   */
  getLocalSegmentVideo(jobId, segmentIndex) {
    if (!this.localServerUrl) return null;
    return `${this.localServerUrl}/job_output/job_${jobId}/segment_${segmentIndex}.webm`;
  }

  /**
   * Get local URL for a job's final video (if local server is configured)
   * @param {number} jobId - Job ID
   * @param {string} filePathOrName - Video filename or full path (from job.output_images)
   * @returns {string|null} Local URL or null if not configured
   */
  getLocalJobVideo(jobId, filePathOrName) {
    if (!this.localServerUrl || !filePathOrName) return null;
    // Extract just the filename if a full path was provided
    const filename = filePathOrName.split('/').pop();
    return `${this.localServerUrl}/job_output/job_${jobId}/${filename}`;
  }

  /**
   * Get local URL for a thumbnail (if local server is configured)
   * @param {number} jobId - Job ID
   * @returns {string|null} Local URL or null if not configured
   */
  getLocalThumbnail(jobId) {
    if (!this.localServerUrl) return null;
    return `${this.localServerUrl}/thumbnail_cache/job_${jobId}_thumb.jpg`;
  }

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

  async getJobs(limit = 100, offset = 0, statuses = null) {
    let url = `/jobs?limit=${limit}&offset=${offset}`;
    if (statuses && statuses.length > 0) {
      url += `&status=${statuses.join(',')}`;
    }
    return this.request(url);
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

  async finalizeJob(jobId, offsets = null) {
    return this.request(`/jobs/${jobId}/finalize`, {
      method: 'POST',
      body: offsets ? { offsets } : {}
    });
  }

  async getMergeOffsets(jobId) {
    return this.request(`/jobs/${jobId}/merge-offsets`);
  }

  async saveMergeOffsets(jobId, offsets) {
    return this.request(`/jobs/${jobId}/merge-offsets`, {
      method: 'PUT',
      body: { offsets }
    });
  }

  async reopenJob(jobId) {
    return this.request(`/jobs/${jobId}/reopen`, {
      method: 'POST'
    });
  }

  async resetJobToAwaiting(jobId) {
    return this.request(`/jobs/${jobId}/reset-to-awaiting`, {
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

  // ============== Prompt Lists ==============

  async getPromptLists() {
    return this.request('/prompt-lists');
  }

  async getPromptListNames() {
    return this.request('/prompt-lists/names');
  }

  async getPromptList(listId) {
    return this.request(`/prompt-lists/${listId}`);
  }

  async createPromptList(name, items) {
    return this.request('/prompt-lists', {
      method: 'POST',
      body: { name, items }
    });
  }

  async updatePromptList(listId, data) {
    return this.request(`/prompt-lists/${listId}`, {
      method: 'PUT',
      body: data
    });
  }

  async deletePromptList(listId) {
    return this.request(`/prompt-lists/${listId}`, {
      method: 'DELETE'
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
    return `${this.baseUrl}/jobs/${jobId}/thumbnail`;
  }

  getSegmentFrame(jobId, segmentIndex, frame = 0) {
    return `${this.baseUrl}/jobs/${jobId}/segments/${segmentIndex}/frame?frame=${frame}`;
  }

  async getSegmentFrames(jobId) {
    return this.request(`/jobs/${jobId}/segment-frames`);
  }

  getJobVideo(jobId) {
    return `${this.baseUrl}/jobs/${jobId}/video`;
  }

  getSegmentVideo(jobId, segmentIndex) {
    return `${this.baseUrl}/jobs/${jobId}/segments/${segmentIndex}/video`;
  }

  async submitSegmentPrompt(jobId, segmentIndex, prompt, loras = [], autoFinalize = false, faceswapOptions = null, fadeToBlack = false, customStartImage = null, promptTemplate = null, segmentDuration = null) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    // Send the original template with tags intact (for prepopulating next segment)
    if (promptTemplate) {
      formData.append('prompt_template', promptTemplate);
    }

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
      formData.append('faceswap_method', faceswapOptions.method || 'reactor');
      formData.append('faceswap_image', faceswapOptions.image || '');
      formData.append('faceswap_faces_order', faceswapOptions.facesOrder || 'left-right');
      formData.append('faceswap_faces_index', faceswapOptions.facesIndex || '0');
      // Source image from segment frame (overrides faceswap_image)
      if (faceswapOptions.sourceImage) {
        formData.append('faceswap_source_image', faceswapOptions.sourceImage);
      }
      // FaceFusion preset settings
      if (faceswapOptions.preset) {
        formData.append('faceswap_preset', faceswapOptions.preset);
      }
      if (faceswapOptions.model) {
        formData.append('faceswap_model', faceswapOptions.model);
      }
      if (faceswapOptions.occluder) {
        formData.append('faceswap_occluder', faceswapOptions.occluder);
      }
      if (faceswapOptions.maskBlur !== undefined && faceswapOptions.maskBlur !== null) {
        formData.append('faceswap_mask_blur', faceswapOptions.maskBlur.toString());
      }
      if (faceswapOptions.regionMask !== undefined && faceswapOptions.regionMask !== null) {
        formData.append('faceswap_region_mask', faceswapOptions.regionMask.toString());
      }
      if (faceswapOptions.scoreThreshold !== undefined && faceswapOptions.scoreThreshold !== null) {
        formData.append('faceswap_score_threshold', faceswapOptions.scoreThreshold.toString());
      }
      if (faceswapOptions.pixelBoost) {
        formData.append('faceswap_pixel_boost', faceswapOptions.pixelBoost);
      }
      if (faceswapOptions.selectorMode) {
        formData.append('faceswap_selector_mode', faceswapOptions.selectorMode);
      }
      if (faceswapOptions.detectorModel) {
        formData.append('faceswap_detector_model', faceswapOptions.detectorModel);
      }
    }

    // Custom start image (overrides default previous segment's last frame)
    if (customStartImage) {
      formData.append('custom_start_image', customStartImage);
    }

    // Per-segment duration (overrides job-level setting)
    if (segmentDuration !== null && segmentDuration !== undefined) {
      formData.append('segment_duration', segmentDuration.toString());
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
    let url = `/image-repo/browse?path=${encodeURIComponent(path)}`;
    if (tag) {
      url += `&tag=${encodeURIComponent(tag)}`;
    }
    return this.request(url);
  }

  async getAllImages(path = '') {
    return this.request(`/image-repo/all-images?path=${encodeURIComponent(path)}`);
  }

  getRepoImage(path) {
    return `${this.baseUrl}/image-repo/image?path=${encodeURIComponent(path)}`;
  }

  getRepoThumbnail(path, size = 150) {
    return `${this.baseUrl}/image-repo/thumbnail?path=${encodeURIComponent(path)}&size=${size}`;
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

  async deleteRepoImagesBulk(imagePaths) {
    const formData = new FormData();
    imagePaths.forEach(path => formData.append('image_paths', path));

    return this.request('/image-repo/delete-bulk', {
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
    return `${this.baseUrl}/comfyui/view?filename=${encodeURIComponent(filename)}&subfolder=${subfolder}&type=${type}`;
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
    return `${this.baseUrl}/loras/${loraId}/preview`;
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

  async getUpscaledVideos(jobId) {
    return this.request(`/jobs/${jobId}/upscaled-videos`);
  }

  async deleteUpscaledVideo(videoId) {
    return this.request(`/upscaled-videos/${videoId}`, {
      method: 'DELETE'
    });
  }

  getUpscaledVideoUrl(filename) {
    return `${this.baseUrl}/upscaled-videos/${encodeURIComponent(filename)}/download`;
  }

  // ============== VR 180 Stereo Images ==============

  async generateVRImage(imagePath, eyeSeparation = 0.015, depthStrength = 0.5, equirectangular = false, verticalFov = 90, depthSmoothing = 2.0, outputSharpening = 0.3, outputWidth = 4128, outputHeight = 2208, upscaleEnabled = true, upscaleFactor = 2, upscaleThreshold = 1500, depthModel = 'depth_anything_v2') {
    const formData = new FormData();
    formData.append('image_path', imagePath);
    formData.append('eye_separation', eyeSeparation.toString());
    formData.append('depth_strength', depthStrength.toString());
    formData.append('equirectangular', equirectangular.toString());
    formData.append('vertical_fov', verticalFov.toString());
    formData.append('depth_smoothing', depthSmoothing.toString());
    formData.append('output_sharpening', outputSharpening.toString());
    formData.append('output_width', outputWidth.toString());
    formData.append('output_height', outputHeight.toString());
    formData.append('upscale_enabled', upscaleEnabled.toString());
    formData.append('upscale_factor', upscaleFactor.toString());
    formData.append('upscale_threshold', upscaleThreshold.toString());
    formData.append('depth_model', depthModel);

    return this.request('/vr/generate', {
      method: 'POST',
      body: formData
    });
  }

  async getVRImageStatus(vrId) {
    return this.request(`/vr/${vrId}`);
  }

  async getVRImagesForImage(imagePath) {
    return this.request(`/vr/for-image?image_path=${encodeURIComponent(imagePath)}`);
  }

  getVRImageUrl(vrId) {
    return `${this.baseUrl}/vr/${vrId}/download`;
  }

  async deleteVRImage(vrId) {
    return this.request(`/vr/${vrId}`, {
      method: 'DELETE'
    });
  }

  // ============== VR 180 Stereo Videos ==============

  async generateVRVideo(jobId, eyeSeparation = 0.015, depthStrength = 0.5, equirectangular = false, verticalFov = 90, depthSmoothing = 2.0, outputSharpening = 0.3, outputWidth = 4128, outputHeight = 2208, upscaleEnabled = false, upscaleFactor = 2, upscaleThreshold = 1500, depthModel = 'depth_anything_v2', encodingPreset = 'balanced') {
    const formData = new FormData();
    formData.append('job_id', jobId.toString());
    formData.append('eye_separation', eyeSeparation.toString());
    formData.append('depth_strength', depthStrength.toString());
    formData.append('equirectangular', equirectangular.toString());
    formData.append('vertical_fov', verticalFov.toString());
    formData.append('depth_smoothing', depthSmoothing.toString());
    formData.append('output_sharpening', outputSharpening.toString());
    formData.append('output_width', outputWidth.toString());
    formData.append('output_height', outputHeight.toString());
    formData.append('upscale_enabled', upscaleEnabled.toString());
    formData.append('upscale_factor', upscaleFactor.toString());
    formData.append('upscale_threshold', upscaleThreshold.toString());
    formData.append('depth_model', depthModel);
    formData.append('encoding_preset', encodingPreset);

    return this.request('/vr-video/generate', {
      method: 'POST',
      body: formData
    });
  }

  async getVRVideoStatus(vrVideoId) {
    return this.request(`/vr-video/${vrVideoId}`);
  }

  async getVRVideosForJob(jobId) {
    return this.request(`/vr-video/for-job/${jobId}`);
  }

  getVRVideoUrl(vrVideoId) {
    return `${this.baseUrl}/vr-video/${vrVideoId}/download`;
  }

  async deleteVRVideo(vrVideoId) {
    return this.request(`/vr-video/${vrVideoId}`, {
      method: 'DELETE'
    });
  }
}

export default new APIClient();
