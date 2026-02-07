/**
 * API Client for communicating with the backend
 */

/**
 * Simple MD5 implementation for thumbnail hash computation.
 * Based on the algorithm from RFC 1321.
 */
function md5(string) {
  function rotateLeft(x, n) {
    return (x << n) | (x >>> (32 - n));
  }

  function addUnsigned(x, y) {
    const x8 = x & 0x80000000;
    const y8 = y & 0x80000000;
    const x4 = x & 0x40000000;
    const y4 = y & 0x40000000;
    const result = (x & 0x3fffffff) + (y & 0x3fffffff);
    if (x4 & y4) return result ^ 0x80000000 ^ x8 ^ y8;
    if (x4 | y4) {
      if (result & 0x40000000) return result ^ 0xc0000000 ^ x8 ^ y8;
      return result ^ 0x40000000 ^ x8 ^ y8;
    }
    return result ^ x8 ^ y8;
  }

  function f(x, y, z) { return (x & y) | (~x & z); }
  function g(x, y, z) { return (x & z) | (y & ~z); }
  function h(x, y, z) { return x ^ y ^ z; }
  function i(x, y, z) { return y ^ (x | ~z); }

  function ff(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(f(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function gg(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(g(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function hh(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(h(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function ii(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(i(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }

  function convertToWordArray(string) {
    let messageLength = string.length;
    let numberOfWordsTemp1 = messageLength + 8;
    let numberOfWordsTemp2 = (numberOfWordsTemp1 - (numberOfWordsTemp1 % 64)) / 64;
    let numberOfWords = (numberOfWordsTemp2 + 1) * 16;
    let wordArray = new Array(numberOfWords - 1);
    let bytePosition = 0;
    let byteCount = 0;
    while (byteCount < messageLength) {
      let wordCount = (byteCount - (byteCount % 4)) / 4;
      bytePosition = (byteCount % 4) * 8;
      wordArray[wordCount] = wordArray[wordCount] | (string.charCodeAt(byteCount) << bytePosition);
      byteCount++;
    }
    let wordCount = (byteCount - (byteCount % 4)) / 4;
    bytePosition = (byteCount % 4) * 8;
    wordArray[wordCount] = wordArray[wordCount] | (0x80 << bytePosition);
    wordArray[numberOfWords - 2] = messageLength << 3;
    wordArray[numberOfWords - 1] = messageLength >>> 29;
    return wordArray;
  }

  function wordToHex(value) {
    let hex = '';
    for (let i = 0; i <= 3; i++) {
      let byte = (value >>> (i * 8)) & 255;
      hex += ('0' + byte.toString(16)).slice(-2);
    }
    return hex;
  }

  const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

  const x = convertToWordArray(string);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = ff(a, b, c, d, x[k], S11, 0xd76aa478);
    d = ff(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = ff(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = ff(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = ff(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = ff(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = ff(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = ff(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = ff(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = ff(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = ff(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = ff(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = ff(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = ff(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = ff(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = ff(b, c, d, a, x[k + 15], S14, 0x49b40821);
    a = gg(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = gg(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = gg(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = gg(b, c, d, a, x[k], S24, 0xe9b6c7aa);
    a = gg(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = gg(d, a, b, c, x[k + 10], S22, 0x2441453);
    c = gg(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = gg(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = gg(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = gg(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = gg(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = gg(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = gg(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = gg(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = gg(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = gg(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
    a = hh(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = hh(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = hh(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = hh(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = hh(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = hh(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = hh(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = hh(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = hh(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = hh(d, a, b, c, x[k], S32, 0xeaa127fa);
    c = hh(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = hh(b, c, d, a, x[k + 6], S34, 0x4881d05);
    a = hh(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = hh(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = hh(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = hh(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
    a = ii(a, b, c, d, x[k], S41, 0xf4292244);
    d = ii(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = ii(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = ii(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = ii(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = ii(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = ii(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = ii(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = ii(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = ii(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = ii(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = ii(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = ii(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = ii(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = ii(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = ii(b, c, d, a, x[k + 9], S44, 0xeb86d391);
    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }
  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}

const DEFAULT_API_URL = '/api';

class APIClient {
  constructor() {
    // Load custom API URL from localStorage if set
    this.baseUrl = localStorage.getItem('api_url') || DEFAULT_API_URL;
    // Load local server URL for faster video/image loading
    this.localServerUrl = localStorage.getItem('local_server_url') || '';
    // Track if local server is available (checked once on first use)
    this.localServerAvailable = null; // null = not checked, true/false = result
    this.localServerCheckPromise = null;
  }

  /**
   * Check if local server is available (cached after first check)
   */
  async checkLocalServerAvailable() {
    if (!this.localServerUrl) return false;
    if (this.localServerAvailable !== null) return this.localServerAvailable;

    // Prevent multiple simultaneous checks
    if (this.localServerCheckPromise) return this.localServerCheckPromise;

    this.localServerCheckPromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000); // 1s timeout
        const response = await fetch(this.localServerUrl, {
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeout);
        this.localServerAvailable = response.ok;
        console.log(`[API] Local server ${this.localServerAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
      } catch {
        this.localServerAvailable = false;
        console.log('[API] Local server UNAVAILABLE (connection failed)');
      }
      return this.localServerAvailable;
    })();

    return this.localServerCheckPromise;
  }

  /**
   * Get local URL only if local server is confirmed available
   */
  getLocalUrlIfAvailable(path) {
    // Return null if not configured or known to be unavailable
    if (!this.localServerUrl || this.localServerAvailable === false) return null;
    return `${this.localServerUrl}${path}`;
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
    // Reset availability check when URL changes
    this.localServerAvailable = null;
    this.localServerCheckPromise = null;
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
   * @param {number} segmentIndex - Segment index (used as fallback if videoPath not provided)
   * @param {string} videoPath - Optional video path from segment record to extract actual filename
   * @returns {string|null} Local URL or null if not configured
   */
  getLocalSegmentVideo(jobId, segmentIndex, videoPath) {
    if (!this.localServerUrl || this.localServerAvailable === false) return null;

    let url;
    // If videoPath is provided, extract the actual filename
    // Keep as .mp4 since that's what exists on disk - the local server serves raw files
    if (videoPath) {
      const filename = videoPath.split('/').pop();
      url = `${this.localServerUrl}/job_output/job_${jobId}/${filename}`;
    } else {
      // Fallback to index-based naming (legacy behavior) - try mp4 first
      url = `${this.localServerUrl}/job_output/job_${jobId}/segment_${segmentIndex}.mp4`;
    }

    // Add cache-buster to prevent 404 responses being cached
    return `${url}?t=${Date.now()}`;
  }

  /**
   * Get local URL for a job's final video (if local server is configured)
   * @param {number} jobId - Job ID
   * @param {string} filePathOrName - Video filename or full path (from job.output_images)
   * @returns {string|null} Local URL or null if not configured
   */
  getLocalJobVideo(jobId, filePathOrName) {
    if (!this.localServerUrl || !filePathOrName || this.localServerAvailable === false) return null;
    // Extract just the filename if a full path was provided
    const filename = filePathOrName.split('/').pop();
    return `${this.localServerUrl}/job_output/job_${jobId}/${filename}`;
  }

  /**
   * Get local URL for a job thumbnail (if local server is configured)
   * Uses segment_0_last_frame.png from the job output folder
   * @param {number} jobId - Job ID
   * @returns {string|null} Local URL or null if not configured
   */
  getLocalJobThumbnail(jobId) {
    if (!this.localServerUrl || this.localServerAvailable === false) return null;
    return `${this.localServerUrl}/job_output/job_${jobId}/segment_0_last_frame.png`;
  }

  /**
   * Compute the thumbnail cache hash for an image
   * Matches backend: md5(f"{path}:{size}:{mtime}")
   * @param {string} path - Image path
   * @param {number} size - Thumbnail size
   * @param {number} mtime - File modification time
   * @returns {string} MD5 hash
   */
  computeThumbnailHash(path, size, mtime) {
    return md5(`${path}:${size}:${mtime}`);
  }

  /**
   * Get local URL for an image repo thumbnail (if local server is configured)
   * @param {string} path - Image path
   * @param {number} size - Thumbnail size
   * @param {number} mtime - File modification time (from API response)
   * @returns {string|null} Local URL or null if not configured/no mtime
   */
  getLocalImageThumbnail(path, size, mtime) {
    if (!this.localServerUrl || !path || !mtime || this.localServerAvailable === false) return null;
    const hash = this.computeThumbnailHash(path, size, mtime);
    return `${this.localServerUrl}/thumbnail_cache/${hash}.jpg`;
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
