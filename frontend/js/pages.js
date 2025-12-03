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

  // Auto-refresh dashboard every 3 seconds for real-time status updates
  if (AppState.dashboardInterval) {
    clearInterval(AppState.dashboardInterval);
  }

  AppState.dashboardInterval = setInterval(() => {
    if (AppState.currentPage === 'dashboard') {
      updateDashboard();
    }
  }, 3000);
};

const renderQueue = function(container) {
  // Initialize status filter if not set (default: show all)
  if (!AppState.queueStatusFilter) {
    AppState.queueStatusFilter = new Set(['pending', 'queued', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled']);
  }
  
  container.innerHTML = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <h1>Job Queue</h1>
      <div style="display: flex; gap: 12px; align-items: center;">
        <div class="filter-dropdown" style="position: relative;">
          <button class="btn btn-outlined" onclick="toggleStatusFilter()" id="status-filter-btn">Status: All</button>
          <div id="status-filter-panel" class="filter-panel" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; border-radius: 8px; padding: 12px; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100;">
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="pending" onchange="onStatusFilterChange()" checked> Pending</label>
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="queued" onchange="onStatusFilterChange()" checked> Queued</label>
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="running" onchange="onStatusFilterChange()" checked> Running</label>
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="awaiting_prompt" onchange="onStatusFilterChange()" checked> Awaiting Prompt</label>
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="completed" onchange="onStatusFilterChange()" checked> Completed</label>
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="failed" onchange="onStatusFilterChange()" checked> Failed</label>
            <label style="display: block; padding: 4px 0; cursor: pointer;"><input type="checkbox" value="cancelled" onchange="onStatusFilterChange()" checked> Cancelled</label>
          </div>
        </div>
        <button class="btn btn-primary" onclick="openCreateJobModal()">+ New Job</button>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th></th>
          <th>Job Name</th>
          <th>Created</th>
          <th>Status</th>
          <th>Segments</th>
          <th>Progress</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="jobs-table">
        <tr>
          <td colspan="7" style="text-align: center; color: #999;">Loading...</td>
        </tr>
      </tbody>
    </table>
  `;
  
  // Restore checkbox states from AppState
  const panel = document.getElementById('status-filter-panel');
  if (panel) {
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = AppState.queueStatusFilter.has(cb.value);
    });
  }
  updateStatusFilterLabel();
  
  updateJobsTable();
  
  // Add polling for Job Queue - refresh every 3 seconds
  if (AppState.jobsInterval) {
    clearInterval(AppState.jobsInterval);
  }
  AppState.jobsInterval = setInterval(() => {
    if (AppState.currentPage === 'queue') {
      updateJobsTable();
    }
  }, 3000);
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
  
  // Auto-refresh every 3 seconds only if job is active (but NOT when awaiting_prompt to preserve textarea focus)
  if (AppState.jobDetailInterval) {
    clearInterval(AppState.jobDetailInterval);
  }
  
  // Define status categories
  const ACTIVE_STATUSES = ['pending', 'queued', 'running'];
  const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
  
  AppState.jobDetailInterval = setInterval(async () => {
    if (AppState.currentPage === 'job-detail') {
      try {
        const job = await API.getJob(jobId);
        
        if (ACTIVE_STATUSES.includes(job.status)) {
          // Job is active (pending/queued/running) - keep polling and updating UI
          updateJobDetail(jobId);
        } else if (job.status === 'awaiting_prompt') {
          // Don't refresh UI when awaiting prompt - user is typing
          // But check if status just changed to awaiting_prompt (to send notification)
          if (AppState.lastJobStatus !== 'awaiting_prompt') {
            updateJobDetail(jobId);
            // Send browser notification when segment completes and needs prompt
            const segments = await API.getSegments(jobId);
            const completedCount = segments.filter(s => s.status === 'completed').length;
            notifySegmentAwaitingPrompt(job.name, completedCount + 1);
          }
        } else if (TERMINAL_STATUSES.includes(job.status)) {
          // Job completed/failed/cancelled - stop auto-refresh
          clearInterval(AppState.jobDetailInterval);
          updateJobDetail(jobId); // One final update
        }
        AppState.lastJobStatus = job.status;
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
      // Check if ComfyUI is running a job or idle
      // queue_running and queue_pending are arrays, so check their length
      const queueRunning = status.queue?.queue_running?.length || 0;
      const queuePending = status.queue?.queue_pending?.length || 0;
      if (queueRunning > 0 || queuePending > 0) {
        dot.className = 'status-dot blue';
        text.textContent = 'Connected - Running...';
      } else {
        dot.className = 'status-dot green';
        text.textContent = 'Connected - Idle';
      }
    } else {
      dot.className = 'status-dot red';
      text.textContent = 'Not Connected';
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
        // Use completed_segments from API (computed from job_segments table)
        const totalSegments = job.total_segments ?? 0;
        const completedSegments = job.completed_segments ?? 0;
        return `
        <tr onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
          <td>${job.name}</td>
          <td><span class="chip ${getChipClass(job.status)}">${job.status}</span></td>
          <td>${completedSegments}/${totalSegments}</td>
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
    const allJobs = await API.getJobs();
    AppState.jobs = allJobs;
    
    // Filter jobs based on status filter
    const jobs = AppState.queueStatusFilter 
      ? allJobs.filter(job => AppState.queueStatusFilter.has(job.status))
      : allJobs;
    
    const jobsTable = document.getElementById('jobs-table');
    if (jobs.length > 0) {
      jobsTable.innerHTML = jobs.map(job => {
        // Use computed segment fields from API
        const totalSegments = job.total_segments ?? 0;
        const completedSegments = job.completed_segments ?? 0;
        const progress = job.progress_percent ?? calculateProgress(completedSegments, totalSegments);
        
        return `
        <tr style="cursor: pointer;" onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
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
      jobsTable.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No jobs yet</td></tr>';
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
    
    // Build Final Output section - dashed placeholder until video is ready
    let finalOutputSection = '';
    if (job.status === 'completed' && job.completed_at) {
      // Show completed video with download button
      finalOutputSection = `
        <div class="card" style="margin-bottom: 24px;">
          <h2 style="margin-top: 0; margin-bottom: 16px;">Final Output</h2>
          <video controls style="width: 100%; max-width: 640px; border-radius: 8px;" poster="${API.getJobThumbnail(jobId)}">
            <source src="${API.getJobVideo(jobId)}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <div style="margin-top: 12px;">
            <a href="${API.getJobVideo(jobId)}" download="job_${jobId}_final.mp4" class="btn btn-primary" style="display: inline-block;">Download Video</a>
          </div>
        </div>
      `;
    } else if (job.status === 'failed') {
      // Show error state with retry button
      finalOutputSection = `
        <div class="card" style="margin-bottom: 24px;">
          <h2 style="margin-top: 0; margin-bottom: 16px;">Final Output</h2>
          <div style="width: 100%; max-width: 640px; height: 360px; border: 2px dashed #f44336; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffebee;">
            <span style="color: #c62828; font-size: 16px; font-weight: 500;">Generation Failed</span>
            ${job.error_message ? `<span style="color: #666; font-size: 14px; margin-top: 8px; text-align: center; padding: 0 16px;">${job.error_message}</span>` : ''}
            <button class="btn btn-primary" style="margin-top: 16px;" onclick="retryJob('${jobId}')">Retry Job</button>
          </div>
        </div>
      `;
    } else {
      // Show dashed blue placeholder with spinner for pending/running/awaiting_prompt jobs
      finalOutputSection = `
        <div class="card" style="margin-bottom: 24px;">
          <h2 style="margin-top: 0; margin-bottom: 16px;">Final Output</h2>
          <div style="width: 100%; max-width: 640px; height: 360px; border: 2px dashed #1976d2; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f5f5f5;">
            <span class="spinner" style="margin-bottom: 12px;"></span>
            <span style="color: #666; font-size: 14px;">Processing...</span>
          </div>
        </div>
      `;
    }
    
    const metaContainer = document.getElementById('job-detail-meta');
    metaContainer.innerHTML = `
      <div class="card" style="margin-bottom: 24px;">
        <h2 style="margin-top: 0; margin-bottom: 16px;">Job Details</h2>
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
        <div class="detail-meta-item">
          <label>Completed</label>
          <div class="value">${job.completed_at ? formatDate(job.completed_at) : '--'}</div>
        </div>
      </div>
      ${finalOutputSection}
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
              ${seg.execution_time ? `<span style="margin-left: 8px; color: #666; font-size: 12px;">(${Math.round(seg.execution_time)}s)</span>` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 16px; align-items: flex-start; margin-top: 12px;">
            <div>
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Start Image</div>
              ${seg.start_image_url ? `<img src="${seg.start_image_url}" style="width: 120px; height: 120px; border-radius: 4px; object-fit: cover; border: 2px solid #e0e0e0; cursor: pointer;" onclick="openImageLightbox('${seg.start_image_url}')" onerror="this.style.display='none'" title="Click to view full size">` : '<div style="width: 120px; height: 120px; border-radius: 4px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #999; font-size: 11px;">Pending</div>'}
            </div>
            <div style="flex: 1;">
              <div class="segment-prompt">
                <div><strong>Prompt:</strong> ${seg.prompt || 'No prompt yet'}</div>
                <div style="margin-top: 8px;"><strong>High lora:</strong> ${seg.high_lora || 'N/A'}</div>
                <div><strong>Low lora:</strong> ${seg.low_lora || 'N/A'}</div>
              </div>
            </div>
            <div>
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">End Image</div>
              ${seg.status === 'completed' && seg.end_frame_url ? `
                <img src="${seg.end_frame_url}" style="width: 120px; height: 120px; border-radius: 4px; object-fit: cover; border: 2px solid #4caf50; cursor: pointer;" onclick="openImageLightbox('${seg.end_frame_url}')" onerror="this.style.display='none'" title="Click to view full size">
              ` : seg.status === 'running' ? `
                <div style="width: 120px; height: 120px; border-radius: 4px; border: 2px dashed #1976d2; display: flex; align-items: center; justify-content: center; background: #f5f5f5;">
                  <span class="spinner" style="margin: 0;"></span>
                </div>
              ` : `
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
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0;">
                <div class="form-group">
                  <label style="font-size: 12px; color: #666;">High Noise LoRA (optional)</label>
                  <select id="next-segment-high-lora" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="">-- Use Default --</option>
                  </select>
                </div>
                <div class="form-group">
                  <label style="font-size: 12px; color: #666;">Low Noise LoRA (optional)</label>
                  <select id="next-segment-low-lora" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="">-- Use Default --</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary" id="submit-next-prompt-btn" onclick="submitNextPrompt('${jobId}', ${nextSegmentIndex})">Submit Prompt</button>
            </div>
          `;
          // Load LoRA options for segment prompt form
          loadSegmentLoraOptions();
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
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">High Noise LoRA (optional)</label>
            <select id="new-job-high-lora" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
              <option value="">-- Use Default --</option>
            </select>
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Low Noise LoRA (optional)</label>
            <select id="new-job-low-lora" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
              <option value="">-- Use Default --</option>
            </select>
          </div>
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
  
  // Load available LoRAs from ComfyUI
  loadLoraOptions();
}

// Load LoRA options into dropdowns for job creation modal
async function loadLoraOptions() {
  try {
    const response = await API.getLoras();
    const loras = response.loras || [];
    
    const highLoraSelect = document.getElementById('new-job-high-lora');
    const lowLoraSelect = document.getElementById('new-job-low-lora');
    
    if (highLoraSelect && lowLoraSelect) {
      loras.forEach(lora => {
        highLoraSelect.innerHTML += `<option value="${lora}">${lora}</option>`;
        lowLoraSelect.innerHTML += `<option value="${lora}">${lora}</option>`;
      });
    }
  } catch (err) {
    console.error('Failed to load LoRAs:', err);
  }
}

// Load LoRA options into dropdowns for segment prompt form
async function loadSegmentLoraOptions() {
  try {
    const response = await API.getLoras();
    const loras = response.loras || [];
    
    const highLoraSelect = document.getElementById('next-segment-high-lora');
    const lowLoraSelect = document.getElementById('next-segment-low-lora');
    
    if (highLoraSelect && lowLoraSelect) {
      loras.forEach(lora => {
        highLoraSelect.innerHTML += `<option value="${lora}">${lora}</option>`;
        lowLoraSelect.innerHTML += `<option value="${lora}">${lora}</option>`;
      });
    }
  } catch (err) {
    console.error('Failed to load LoRAs for segment:', err);
  }
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
  const highLora = document.getElementById('new-job-high-lora')?.value || null;
  const lowLora = document.getElementById('new-job-low-lora')?.value || null;
  
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
      high_lora: highLora || null,
      low_lora: lowLora || null,
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
  const highLora = document.getElementById('next-segment-high-lora')?.value || null;
  const lowLora = document.getElementById('next-segment-low-lora')?.value || null;
  
  if (!prompt) {
    showToast('Please enter a prompt', 'error');
    return;
  }
  
  try {
    const result = await API.submitSegmentPrompt(jobId, segmentIndex, prompt, highLora, lowLora);
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

// Status filter dropdown functions
function toggleStatusFilter() {
  const panel = document.getElementById('status-filter-panel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

function onStatusFilterChange() {
  const panel = document.getElementById('status-filter-panel');
  if (!panel) return;
  
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
  AppState.queueStatusFilter = new Set();
  checkboxes.forEach(cb => {
    if (cb.checked) {
      AppState.queueStatusFilter.add(cb.value);
    }
  });
  
  updateStatusFilterLabel();
  updateJobsTable();
}

function updateStatusFilterLabel() {
  const btn = document.getElementById('status-filter-btn');
  if (!btn || !AppState.queueStatusFilter) return;
  
  const allStatuses = ['pending', 'queued', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled'];
  const selectedCount = AppState.queueStatusFilter.size;
  
  if (selectedCount === allStatuses.length) {
    btn.textContent = 'Status: All';
  } else if (selectedCount === 0) {
    btn.textContent = 'Status: None';
  } else if (selectedCount === 1) {
    btn.textContent = `Status: ${[...AppState.queueStatusFilter][0]}`;
  } else {
    btn.textContent = `Status: ${selectedCount} selected`;
  }
}

// Close filter dropdown when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('status-filter-panel');
  const btn = document.getElementById('status-filter-btn');
  if (panel && btn && !panel.contains(e.target) && e.target !== btn) {
    panel.style.display = 'none';
  }
});

// Retry job function
async function retryJob(jobId) {
  if (!confirm('Are you sure you want to retry this job? This will reset all segments and start from the beginning.')) {
    return;
  }
  
  try {
    await API.retryJob(jobId);
    showToast('Job has been reset and will restart processing.', 'success');
    updateJobDetail(jobId);
  } catch (err) {
    console.error('Failed to retry job:', err);
    showToast('Failed to retry job: ' + err.message, 'error');
  }
}
