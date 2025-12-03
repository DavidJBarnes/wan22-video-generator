// Page rendering functions

// Use API_BASE from api.js
window.renderPage = function(page) {
  const content = document.getElementById('main-content');
  
  switch(page) {
    case 'dashboard':
      renderDashboard(content);
      break;
    case 'queue':
      renderQueue(content);
      break;
    case 'job-detail':
      renderJobDetail(content);
      break;
    case 'images':
      renderImageRepo(content);
      break;
    case 'settings':
      renderSettings(content);
      break;
  }
};

const renderDashboard = function(container) {
  container.innerHTML = `
    <h1>Dashboard</h1>
    
    <div class="card-grid">
      <div class="card">
        <div class="status-indicator">
          <div class="status-dot gray" id="comfy-status-dot"></div>
          <div>
            <h3>ComfyUI Status</h3>
            <div id="comfy-status-text">Checking...</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h3>Running Jobs</h3>
        <div class="value" id="running-jobs-count">0</div>
      </div>
      
      <div class="card">
        <h3>Queued Jobs</h3>
        <div class="value" id="queued-jobs-count">0</div>
      </div>
    </div>

    <h2>Recent Jobs</h2>
    <table>
      <thead>
        <tr>
          <th>Job Name</th>
          <th>Status</th>
          <th>Progress</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody id="recent-jobs-table">
        <tr>
          <td colspan="4" style="text-align: center; color: #999;">No jobs yet</td>
        </tr>
      </tbody>
    </table>
  `;
  
  updateDashboard();
};

const renderQueue = function(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Job Queue</h1>
      <button class="btn btn-primary" onclick="openCreateJobModal()">+ New Job</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>Queue</th>
          <th>Thumbnail</th>
          <th>Job Name</th>
          <th>Created</th>
          <th>Status</th>
          <th>Segments</th>
          <th>Progress</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="jobs-table">
        <tr>
          <td colspan="8" style="text-align: center; color: #999;">Loading...</td>
        </tr>
      </tbody>
    </table>
  `;
  
  updateJobsTable();
};

const renderJobDetail = function(container) {
  const jobId = AppState.currentJobId;
  
  container.innerHTML = `
    <div style="margin-bottom: 16px;">
      <button class="btn btn-outlined" onclick="navigate('queue')">← Back to Queue</button>
    </div>

    <div class="detail-header">
      <h1 id="job-detail-name">Loading...</h1>
      <div class="detail-meta" id="job-detail-meta">
        <!-- Meta loaded dynamically -->
      </div>
    </div>

    <div class="segments-timeline">
      <h2>Segments Timeline</h2>
      <div id="segments-list">
        <p style="color: #999;">Loading segments...</p>
      </div>
    </div>
  `;
  
  updateJobDetail(jobId);
  
  // Auto-refresh every 3 seconds only if job is active
  if (AppState.jobDetailInterval) {
    clearInterval(AppState.jobDetailInterval);
  }
  AppState.jobDetailInterval = setInterval(async () => {
    if (AppState.currentPage === 'job-detail') {
      try {
        const job = await API.getJob(jobId);
        // Only refresh if job is active
        if (['running', 'queued', 'awaiting_prompt'].includes(job.status)) {
          updateJobDetail(jobId);
        } else {
          // Job completed/errored, stop auto-refresh
          clearInterval(AppState.jobDetailInterval);
          updateJobDetail(jobId); // One final update
        }
      } catch (err) {
        console.error('Failed to check job status:', err);
      }
    }
  }, 3000);
};

const renderImageRepo = function(container) {
  container.innerHTML = `
    <h1>Image Repository</h1>
    <div class="alert info">
      Coming soon...
    </div>
  `;
};

const renderSettings = function(container) {
  container.innerHTML = `
    <h1>Settings</h1>

    <div class="card settings-section">
      <h2>ComfyUI Configuration</h2>
      <div class="form-group">
        <label>Server URL</label>
        <input type="text" id="setting-server-url">
      </div>
    </div>

    <div class="card settings-section">
      <h2>Default Parameters</h2>
      <div class="settings-grid">
        <div class="form-group">
          <label>Width</label>
          <input type="number" id="setting-width">
        </div>
        <div class="form-group">
          <label>Height</label>
          <input type="number" id="setting-height">
        </div>
        <div class="form-group">
          <label>FPS</label>
          <input type="number" id="setting-fps">
        </div>
      </div>
      <div class="form-group">
        <label>Negative Prompt</label>
        <textarea id="setting-negative-prompt" rows="4"></textarea>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Advanced Configuration (JSON)</h2>
      <textarea class="json-editor" id="setting-json"></textarea>
    </div>

    <div style="text-align: right;">
      <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
    </div>
  `;
  
  loadSettings();
};

// Update functions
async function updateDashboard() {
  try {
    // Update ComfyUI status
    const status = await API.checkComfyStatus();
    const dot = document.getElementById('comfy-status-dot');
    const text = document.getElementById('comfy-status-text');
    
    // If we're not on the dashboard, these elements won't exist - bail out safely
    if (!dot || !text) {
      return;
    }
    
    if (status.reachable) {
      dot.className = 'status-dot green';
      text.textContent = 'Connected';
    } else {
      dot.className = 'status-dot red';
      text.textContent = 'Disconnected';
    }
    
    // Update jobs
    const jobs = await API.getJobs();
    AppState.jobs = jobs;
    
    document.getElementById('running-jobs-count').textContent = 
      jobs.filter(j => j.status === 'running').length;
    document.getElementById('queued-jobs-count').textContent = 
      jobs.filter(j => j.status === 'queued').length;
    
    const recentTable = document.getElementById('recent-jobs-table');
    if (jobs.length > 0) {
      recentTable.innerHTML = jobs.slice(0, 5).map(job => {
        const params = job.parameters || {};
        const totalSegments = job.total_segments ?? params.total_segments ?? 0;
        const currentSegment = job.current_segment ?? params.current_segment ?? 0;
        return `
        <tr onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
          <td>${job.name}</td>
          <td><span class="chip ${getChipClass(job.status)}">${job.status}</span></td>
          <td>${currentSegment}/${totalSegments}</td>
          <td>${formatDate(job.created_at)}</td>
        </tr>
      `}).join('');
    }
  } catch (err) {
    console.error('Dashboard update error:', err);
  }
}

async function updateJobsTable() {
  try {
    const jobs = await API.getJobs();
    AppState.jobs = jobs;
    
    const jobsTable = document.getElementById('jobs-table');
    if (jobs.length > 0) {
      jobsTable.innerHTML = jobs.map(job => {
        // Use computed segment fields from API
        const totalSegments = job.total_segments ?? 0;
        const completedSegments = job.completed_segments ?? 0;
        const progress = job.progress_percent ?? calculateProgress(completedSegments, totalSegments);
        
        return `
        <tr style="cursor: pointer;" onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
          <td>
            ${job.queue_position !== null && job.queue_position !== undefined ? 
              `<span style="font-weight: bold; color: ${job.queue_position === 0 ? '#1976d2' : '#666'};">#${job.queue_position === 0 ? 'Running' : job.queue_position}</span>` : 
              '-'}
          </td>
          <td><img class="thumbnail" src="${API.getJobThumbnail(job.id)}" onerror="this.style.display='none'"></td>
          <td>${job.name}</td>
          <td>${formatDate(job.created_at)}</td>
          <td><span class="chip ${getChipClass(job.status)}">${job.status}</span></td>
          <td>${completedSegments}/${totalSegments}</td>
          <td>
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
              </div>
              <span style="font-size: 12px;">${progress}%</span>
            </div>
          </td>
          <td class="action-buttons">
            <button class="btn-icon" onclick="event.stopPropagation(); navigate('job-detail', {currentJobId: '${job.id}'})" title="View Details">
              👁️
            </button>
            <button class="btn-icon delete" onclick="event.stopPropagation(); deleteJob('${job.id}')" title="Delete Job">
              🗑️
            </button>
          </td>
        </tr>
      `}).join('');
    } else {
      jobsTable.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #999;">No jobs yet</td></tr>';
    }
  } catch (err) {
    console.error('Jobs table update error:', err);
  }
}

async function updateJobDetail(jobId) {
  try {
    const job = await API.getJob(jobId);
    const segments = await API.getSegments(jobId);
    
    // Read parameters from job.parameters if not at top level
    const params = job.parameters || {};
    const totalSegments = job.total_segments ?? params.total_segments ?? 0;
    const completedSegments = job.completed_segments ?? 0;
    const progressPercent = job.progress_percent ?? calculateProgress(completedSegments, totalSegments);
    const width = job.width ?? params.width ?? 640;
    const height = job.height ?? params.height ?? 640;
    const totalDuration = job.total_duration ?? params.total_duration ?? 0;
    const segmentDuration = job.segment_duration ?? params.segment_duration ?? 5;
    
    document.getElementById('job-detail-name').textContent = job.name;
    
    // Show completed banner if job is completed
    let completedBanner = '';
    if (job.status === 'completed' && job.completed_at) {
      completedBanner = `
        <div style="background: #e8f5e9; border: 1px solid #4caf50; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <strong style="color: #2e7d32;">Completed</strong>
          <span style="color: #666; margin-left: 8px;">${formatDate(job.completed_at)}</span>
          <div style="margin-top: 16px;">
            <video controls style="width: 100%; max-width: 640px; border-radius: 8px;" poster="${API.getJobThumbnail(jobId)}">
              <source src="${API.getJobVideo(jobId)}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
            <div style="margin-top: 8px;">
              <a href="${API.getJobVideo(jobId)}" download="job_${jobId}_final.mp4" class="btn btn-secondary" style="display: inline-block;">Download Video</a>
            </div>
          </div>
        </div>
      `;
    } else if (job.status === 'failed') {
      completedBanner = `
        <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <strong style="color: #c62828;">Failed</strong>
          ${job.error_message ? `<span style="color: #666; margin-left: 8px;">${job.error_message}</span>` : ''}
        </div>
      `;
    }
    
    const metaContainer = document.getElementById('job-detail-meta');
    metaContainer.innerHTML = `
      ${completedBanner}
      <div class="detail-meta-item">
        <label>Status</label>
        <div class="value"><span class="chip ${getChipClass(job.status)}">${job.status}</span></div>
      </div>
      <div class="detail-meta-item">
        <label>Progress</label>
        <div class="value">${completedSegments}/${totalSegments} segments (${progressPercent}%)</div>
      </div>
      <div class="detail-meta-item">
        <label>Dimensions</label>
        <div class="value">${width}x${height}</div>
      </div>
      <div class="detail-meta-item">
        <label>Duration</label>
        <div class="value">${totalDuration}s (${segmentDuration}s/segment)</div>
      </div>
      <div class="detail-meta-item">
        <label>Created</label>
        <div class="value">${formatDate(job.created_at)}</div>
      </div>
    `;
    
    const segmentsList = document.getElementById('segments-list');
    
    // If no segments from API, create a stub segment from job data
    if (segments.length === 0 && totalSegments > 0) {
      // Create a placeholder showing the job's initial state
      segmentsList.innerHTML = `
        <div class="segment-item">
          <div class="segment-header">
            <div>
              <strong>Segment 1 of ${totalSegments}</strong>
              <span class="chip ${getChipClass(job.status)}" style="margin-left: 8px;">${job.status}</span>
            </div>
          </div>
          <div style="display: flex; gap: 16px; align-items: flex-start; margin-top: 12px;">
            <div>
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Start Image</div>
              ${job.input_image ? `<div style="padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">${job.input_image}</div>` : '<div style="color: #999;">No image</div>'}
            </div>
            <div style="flex: 1;">
              <div class="segment-prompt"><strong>Prompt:</strong> ${job.prompt || 'No prompt'}</div>
            </div>
          </div>
        </div>
      `;
    } else if (segments.length > 0) {
      segmentsList.innerHTML = segments.map(seg => `
        <div class="segment-item">
          <div class="segment-header">
            <div>
              <strong>Segment ${seg.segment_index + 1}</strong>
              <span class="chip ${getChipClass(seg.status)}" style="margin-left: 8px;">${seg.status}</span>
              ${seg.status === 'running' ? '<span class="spinner"></span>' : ''}
            </div>
          </div>
          <div style="display: flex; gap: 16px; align-items: flex-start; margin-top: 12px;">
            <div>
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Start Image</div>
              ${seg.start_image_url ? `<img src="${seg.start_image_url}" style="width: 120px; height: 120px; border-radius: 4px; object-fit: cover; border: 2px solid #e0e0e0; cursor: pointer;" onclick="openImageLightbox('${seg.start_image_url}')" onerror="this.style.display='none'" title="Click to view full size">` : '<div style="width: 120px; height: 120px; border-radius: 4px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #999; font-size: 11px;">Waiting...</div>'}
            </div>
            <div style="flex: 1;">
              <div class="segment-prompt"><strong>Prompt:</strong> ${seg.prompt || 'No prompt yet'}</div>
            </div>
            <div>
              ${seg.status === 'completed' && seg.end_frame_url ? `
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">End Frame</div>
                <img src="${seg.end_frame_url}" style="width: 120px; height: 120px; border-radius: 4px; object-fit: cover; border: 2px solid #4caf50; cursor: pointer;" onclick="openImageLightbox('${seg.end_frame_url}')" onerror="this.style.display='none'" title="Click to view full size">
              ` : seg.status === 'running' ? `
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Generating...</div>
                <div style="width: 120px; height: 120px; border-radius: 4px; border: 2px dashed #1976d2; display: flex; align-items: center; justify-content: center; background: #f5f5f5;">
                  <span class="spinner" style="margin: 0;"></span>
                </div>
              ` : `
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">End Frame</div>
                <div style="width: 120px; height: 120px; border-radius: 4px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #999; font-size: 11px;">Pending</div>
              `}
            </div>
          </div>
        </div>
      `).join('');
      
      // Check if waiting for prompt - find the first segment without a prompt
      if (job.status === 'awaiting_prompt') {
        const nextSegmentIndex = segments.findIndex(s => !s.prompt && s.status === 'pending');
        const lastCompletedSegment = segments.filter(s => s.status === 'completed').pop();
        
        if (nextSegmentIndex >= 0) {
          segmentsList.innerHTML += `
            <div class="segment-item" style="border: 2px solid #ff9800;">
              <div class="segment-header">
                <strong>Segment ${nextSegmentIndex + 1}</strong>
                <span class="chip warning">Awaiting Prompt</span>
              </div>
              ${lastCompletedSegment && lastCompletedSegment.end_frame_url ? `
                <div style="margin: 12px 0;">
                  <label style="font-size: 12px; color: #666;">Last frame from previous segment:</label>
                  <img src="${lastCompletedSegment.end_frame_url}" style="width: 100%; max-width: 400px; border-radius: 4px; margin-top: 8px; cursor: pointer;" onclick="openImageLightbox('${lastCompletedSegment.end_frame_url}')" title="Click to view full size">
                </div>
              ` : ''}
              <div class="form-group" style="margin-top: 12px;">
                <label>Enter prompt for this segment:</label>
                <textarea id="next-prompt-input" rows="3" placeholder="Describe what happens in this segment..."></textarea>
              </div>
              <button class="btn btn-primary" id="submit-next-prompt-btn" onclick="submitNextPrompt('${jobId}', ${nextSegmentIndex})">Submit Prompt</button>
            </div>
          `;
        }
      }
    } else {
      segmentsList.innerHTML = '<p style="color: #999;">No segments yet - job has not started processing</p>';
    }
  } catch (err) {
    console.error('Job detail update error:', err);
  }
}

async function loadSettings() {
  try {
    const response = await API.getSettings();
    const settings = response.settings || response;
    AppState.settings = settings;
    
    // Use comfyui_url (the actual key in the backend)
    document.getElementById('setting-server-url').value = settings.comfyui_url || 'http://3090.zero:8188';
    document.getElementById('setting-width').value = settings.default_width || 640;
    document.getElementById('setting-height').value = settings.default_height || 640;
    document.getElementById('setting-fps').value = settings.default_fps || 16;
    document.getElementById('setting-negative-prompt').value = settings.default_negative_prompt || 'blurry, low quality, distorted';
    
    const jsonConfig = {
      models: settings.models || {},
      generation_params: settings.generation_params || {}
    };
    document.getElementById('setting-json').value = JSON.stringify(jsonConfig, null, 2);
  } catch (err) {
    console.error('Failed to load settings:', err);
    showToast('Failed to load settings', 'error');
  }
}

// Save settings to backend
async function saveSettings() {
  try {
    const serverUrl = document.getElementById('setting-server-url').value.trim();
    const width = parseInt(document.getElementById('setting-width').value, 10) || 640;
    const height = parseInt(document.getElementById('setting-height').value, 10) || 640;
    const fps = parseInt(document.getElementById('setting-fps').value, 10) || 16;
    const negativePrompt = document.getElementById('setting-negative-prompt').value.trim();
    const jsonText = document.getElementById('setting-json').value;
    
    // Parse advanced JSON config
    let advanced;
    try {
      advanced = JSON.parse(jsonText || '{}');
    } catch (e) {
      showToast('Invalid JSON in advanced configuration', 'error');
      return;
    }
    
    const settingsPayload = {
      comfyui_url: serverUrl || 'http://3090.zero:8188',
      default_width: String(width),
      default_height: String(height),
      default_fps: String(fps),
      default_negative_prompt: negativePrompt
    };
    
    const updated = await API.updateSettings(settingsPayload);
    // Refresh AppState.settings with the updated values
    AppState.settings = updated.settings || settingsPayload;
    showToast('Settings saved successfully', 'success');
    
    // Refresh dashboard status (only if on dashboard page)
    if (typeof updateDashboard === 'function' && AppState.currentPage === 'dashboard') {
      updateDashboard();
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
    showToast('Failed to save settings', 'error');
  }
}

// Open create job modal
function openCreateJobModal() {
  const container = document.getElementById('modals-container');
  const settings = AppState.settings || {};
  const defaultWidth = settings.default_width || 640;
  const defaultHeight = settings.default_height || 640;
  
  container.innerHTML = `
    <div class="modal active" id="create-job-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div class="modal-content" style="background: white; padding: 24px; border-radius: 8px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <h2 style="margin-top: 0;">Create New Video Job</h2>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500;">Job Name</label>
          <input id="new-job-name" type="text" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" placeholder="My Video Job">
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Width</label>
            <input id="new-job-width" type="number" value="${defaultWidth}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Height</label>
            <input id="new-job-height" type="number" value="${defaultHeight}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Total Video Duration (seconds)</label>
            <input id="new-job-total-duration" type="number" value="30" min="3" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Segment Duration</label>
            <select id="new-job-segment-duration" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
              <option value="3">3 seconds</option>
              <option value="4">4 seconds</option>
              <option value="5" selected>5 seconds</option>
            </select>
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500;">Prompt</label>
          <textarea id="new-job-prompt" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" placeholder="Describe the video scene and action..."></textarea>
        </div>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500;">Start Image</label>
          <input id="new-job-image" type="file" accept="image/*" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          <div id="image-preview" style="margin-top: 8px;"></div>
        </div>
        
        <div id="job-summary" style="background: #f5f5f5; padding: 12px; border-radius: 4px; margin-bottom: 16px; font-size: 14px;">
          <strong>Summary:</strong> <span id="summary-text">30 second video = 6 segments of 5 seconds each</span>
        </div>
        
        <div style="text-align: right; margin-top: 24px;">
          <button class="btn btn-secondary" onclick="closeCreateJobModal()" style="padding: 8px 16px; margin-right: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button class="btn btn-primary" onclick="createJobFromModal()" style="padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">Create Job</button>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners for dynamic summary update
  const totalDurationInput = document.getElementById('new-job-total-duration');
  const segmentDurationSelect = document.getElementById('new-job-segment-duration');
  const imageInput = document.getElementById('new-job-image');
  
  const updateSummary = () => {
    const totalDuration = parseInt(totalDurationInput.value) || 30;
    const segmentDuration = parseInt(segmentDurationSelect.value) || 5;
    const numSegments = Math.ceil(totalDuration / segmentDuration);
    document.getElementById('summary-text').textContent = 
      `${totalDuration} second video = ${numSegments} segments of ${segmentDuration} seconds each`;
  };
  
  totalDurationInput.addEventListener('input', updateSummary);
  segmentDurationSelect.addEventListener('change', updateSummary);
  
  // Image preview
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        document.getElementById('image-preview').innerHTML = 
          `<img src="${e.target.result}" style="max-width: 200px; max-height: 150px; border-radius: 4px; border: 1px solid #ddd;">`;
      };
      reader.readAsDataURL(file);
    }
  });
}

// Close create job modal
function closeCreateJobModal() {
  document.getElementById('modals-container').innerHTML = '';
}

// Create job from modal form
async function createJobFromModal() {
  const name = document.getElementById('new-job-name').value.trim();
  const width = parseInt(document.getElementById('new-job-width').value) || 640;
  const height = parseInt(document.getElementById('new-job-height').value) || 640;
  const totalDuration = parseInt(document.getElementById('new-job-total-duration').value) || 30;
  const segmentDuration = parseInt(document.getElementById('new-job-segment-duration').value) || 5;
  const prompt = document.getElementById('new-job-prompt').value.trim();
  const imageInput = document.getElementById('new-job-image');
  const imageFile = imageInput.files[0];
  
  if (!name) {
    showToast('Please enter a job name', 'error');
    return;
  }
  
  if (!prompt) {
    showToast('Please enter a prompt', 'error');
    return;
  }
  
  if (!imageFile) {
    showToast('Please select a start image', 'error');
    return;
  }
  
  try {
    // First, upload the image to ComfyUI
    showToast('Uploading image...', 'info');
    const uploadResult = await API.uploadImage(imageFile);
    
    if (!uploadResult || !uploadResult.filename) {
      showToast('Failed to upload image', 'error');
      return;
    }
    
    // Calculate number of segments
    const totalSegments = Math.ceil(totalDuration / segmentDuration);
    
    const jobData = {
      name: name,
      prompt: prompt,
      workflow_type: 'i2v',
      negative_prompt: AppState.settings?.default_negative_prompt || '',
      input_image: uploadResult.filename,
      parameters: {
        width: width,
        height: height,
        total_duration: totalDuration,
        segment_duration: segmentDuration,
        total_segments: totalSegments
      }
    };
    
    await API.createJob(jobData);
    showToast('Job created successfully', 'success');
    closeCreateJobModal();
    
    // Refresh the jobs table
    if (typeof updateJobsTable === 'function') {
      updateJobsTable();
    }
  } catch (err) {
    console.error('Failed to create job:', err);
    showToast('Failed to create job', 'error');
  }
}

// Delete a job
async function deleteJob(jobId) {
  if (!confirm('Are you sure you want to delete this job?')) {
    return;
  }
  
  try {
    await API.deleteJob(jobId);
    showToast('Job deleted', 'success');
    
    // Refresh the jobs table
    if (typeof updateJobsTable === 'function') {
      updateJobsTable();
    }
  } catch (err) {
    console.error('Failed to delete job:', err);
    showToast('Failed to delete job', 'error');
  }
}

// Submit next prompt for a job segment
async function submitNextPrompt(jobId, segmentIndex) {
  const promptInput = document.getElementById('next-prompt-input');
  const prompt = promptInput?.value.trim();
  
  if (!prompt) {
    showToast('Please enter a prompt', 'error');
    return;
  }
  
  try {
    const result = await API.submitSegmentPrompt(jobId, segmentIndex, prompt);
    showToast(`Prompt submitted for segment ${segmentIndex + 1}. Job resuming...`, 'success');
    
    // Clear the input
    if (promptInput) promptInput.value = '';
    
    // Refresh the job detail view to show updated status
    updateJobDetail(jobId);
  } catch (err) {
    console.error('Failed to submit prompt:', err);
    showToast('Failed to submit prompt: ' + err.message, 'error');
  }
}
