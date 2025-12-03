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
      recentTable.innerHTML = jobs.slice(0, 5).map(job => `
        <tr onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
          <td>${job.name}</td>
          <td><span class="chip ${getChipClass(job.status)}">${job.status}</span></td>
          <td>${job.current_segment || 0}/${job.total_segments}</td>
          <td>${formatDate(job.created_at)}</td>
        </tr>
      `).join('');
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
      jobsTable.innerHTML = jobs.map(job => `
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
          <td>${job.current_segment || 0}/${job.total_segments}</td>
          <td>
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${calculateProgress(job.current_segment || 0, job.total_segments)}%"></div>
              </div>
              <span style="font-size: 12px;">${calculateProgress(job.current_segment || 0, job.total_segments)}%</span>
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
      `).join('');
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
    
    document.getElementById('job-detail-name').textContent = job.name;
    
    const metaContainer = document.getElementById('job-detail-meta');
    metaContainer.innerHTML = `
      <div class="detail-meta-item">
        <label>Status</label>
        <div class="value"><span class="chip ${getChipClass(job.status)}">${job.status}</span></div>
      </div>
      <div class="detail-meta-item">
        <label>Progress</label>
        <div class="value">${job.current_segment || 0}/${job.total_segments} segments</div>
      </div>
      <div class="detail-meta-item">
        <label>Dimensions</label>
        <div class="value">${job.width}x${job.height}</div>
      </div>
      <div class="detail-meta-item">
        <label>Duration</label>
        <div class="value">${job.total_duration}s (${job.segment_duration}s/segment)</div>
      </div>
      <div class="detail-meta-item">
        <label>Created</label>
        <div class="value">${formatDate(job.created_at)}</div>
      </div>
    `;
    
    const segmentsList = document.getElementById('segments-list');
    if (segments.length > 0) {
      segmentsList.innerHTML = segments.map(seg => `
        <div class="segment-item">
          <div class="segment-header">
            <div>
              <strong>Segment ${seg.segment_index + 1}</strong>
              <span class="chip ${getChipClass(seg.status)}" style="margin-left: 8px;">${seg.status}</span>
              ${seg.status === 'processing' ? '<span class="spinner"></span>' : ''}
            </div>
          </div>
          <div style="display: flex; gap: 16px; align-items: flex-start; margin-top: 12px;">
            <div>
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Start Image</div>
              ${seg.start_frame_path ? `<img src="${API_BASE}/frames/${seg.start_frame_path.split('/').pop()}" style="width: 120px; height: 120px; border-radius: 4px; object-fit: cover; border: 2px solid #e0e0e0;" onerror="this.src='${API.getJobThumbnail(jobId)}'">` : ''}
            </div>
            <div style="flex: 1;">
              <div class="segment-prompt"><strong>Prompt:</strong> ${seg.prompt}</div>
            </div>
            <div>
              ${seg.status === 'completed' && seg.end_frame_path ? `
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">End Frame</div>
                <img src="${API.getSegmentFrame(jobId, seg.segment_index)}" style="width: 120px; height: 120px; border-radius: 4px; object-fit: cover; border: 2px solid #4caf50;" onerror="this.style.display='none'">
              ` : seg.status === 'processing' ? `
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Generating...</div>
                <div style="width: 120px; height: 120px; border-radius: 4px; border: 2px dashed #1976d2; display: flex; align-items: center; justify-content: center; background: #f5f5f5;">
                  <span class="spinner" style="margin: 0;"></span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('');
      
      // Check if waiting for prompt
      if (job.status === 'awaiting_prompt') {
        const nextSegmentIndex = job.current_segment;
        const lastSegment = segments[segments.length - 1];
        
        segmentsList.innerHTML += `
          <div class="segment-item" style="border: 2px solid #ff9800;">
            <div class="segment-header">
              <strong>Segment ${nextSegmentIndex + 1}</strong>
              <span class="chip warning">Awaiting Prompt</span>
            </div>
            ${lastSegment && lastSegment.end_frame_path ? `
              <div style="margin: 12px 0;">
                <label style="font-size: 12px; color: #666;">Last frame from previous segment:</label>
                <img src="${API.getSegmentFrame(jobId, nextSegmentIndex - 1)}" style="width: 100%; max-width: 400px; border-radius: 4px; margin-top: 8px;">
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
    } else {
      segmentsList.innerHTML = '<p style="color: #999;">No segments yet</p>';
    }
  } catch (err) {
    console.error('Job detail update error:', err);
  }
}

async function loadSettings() {
  try {
    const settings = await API.getSettings();
    AppState.settings = settings;
    
    document.getElementById('setting-server-url').value = settings.comfyui_server_url || 'http://3090.zero:8188';
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