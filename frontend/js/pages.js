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
            // completedCount is the number of completed segments (0-indexed last completed = completedCount - 1)
            // Next segment needing prompt is at index completedCount
            notifySegmentAwaitingPrompt(job.name, completedCount, completedCount + 1);
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
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h1 style="margin-bottom: 0;">Image Repository</h1>
      <div style="display: flex; gap: 8px; align-items: center;">
        <label style="font-size: 14px; color: #666;">Sort:</label>
        <select id="image-repo-sort" onchange="setImageRepoSort(this.value)" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>
        <button class="btn btn-secondary" onclick="setImageRepoView('grid')" id="view-grid-btn">
          <span style="font-size: 18px;">▦</span> Grid
        </button>
        <button class="btn btn-secondary" onclick="setImageRepoView('list')" id="view-list-btn">
          <span style="font-size: 18px;">☰</span> List
        </button>
      </div>
    </div>

    <div id="image-repo-breadcrumb" class="breadcrumb"></div>

    <div id="image-repo-loading" class="alert info" style="display: none;">
      Loading...
    </div>

    <div id="image-repo-error" class="alert error" style="display: none;"></div>

    <div id="image-repo-content"></div>
  `;

  // Initialize view state
  if (!AppState.imageRepoView) {
    AppState.imageRepoView = 'grid';
  }
  if (!AppState.imageRepoPath) {
    AppState.imageRepoPath = '';
  }
  if (!AppState.imageRepoSort) {
    AppState.imageRepoSort = 'name-asc';
  }

  // Update view button states
  updateImageRepoViewButtons();

  // Update sort dropdown
  const sortSelect = document.getElementById('image-repo-sort');
  if (sortSelect) {
    sortSelect.value = AppState.imageRepoSort;
  }

  // Load initial directory
  loadImageRepoDirectory(AppState.imageRepoPath);
};

// Set the view type (grid or list)
window.setImageRepoView = function(view) {
  AppState.imageRepoView = view;
  updateImageRepoViewButtons();
  loadImageRepoDirectory(AppState.imageRepoPath);
};

// Set the sort order
window.setImageRepoSort = function(sortOrder) {
  AppState.imageRepoSort = sortOrder;
  loadImageRepoDirectory(AppState.imageRepoPath);
};

// Update the view button states
function updateImageRepoViewButtons() {
  const gridBtn = document.getElementById('view-grid-btn');
  const listBtn = document.getElementById('view-list-btn');

  if (gridBtn && listBtn) {
    if (AppState.imageRepoView === 'grid') {
      gridBtn.classList.add('active');
      listBtn.classList.remove('active');
    } else {
      gridBtn.classList.remove('active');
      listBtn.classList.add('active');
    }
  }
}

// Sort folders and images based on current sort preference
function sortRepoItems(items) {
  const sortOrder = AppState.imageRepoSort || 'name-asc';

  return items.sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    if (sortOrder === 'name-asc') {
      return nameA.localeCompare(nameB);
    } else if (sortOrder === 'name-desc') {
      return nameB.localeCompare(nameA);
    }
    return 0;
  });
}

// Load and display a directory from the image repo
async function loadImageRepoDirectory(path) {
  const loading = document.getElementById('image-repo-loading');
  const error = document.getElementById('image-repo-error');
  const content = document.getElementById('image-repo-content');
  const breadcrumb = document.getElementById('image-repo-breadcrumb');

  if (!loading || !error || !content || !breadcrumb) return;

  // Show loading state
  loading.style.display = 'block';
  error.style.display = 'none';
  content.innerHTML = '';

  try {
    // Fetch directory listing from backend
    const response = await fetch(`/api/image-repo/browse?path=${encodeURIComponent(path)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load directory');
    }

    // Update state
    AppState.imageRepoPath = path;

    // Render breadcrumb
    renderBreadcrumb(data.breadcrumbs || []);

    // Hide loading
    loading.style.display = 'none';

    // Sort folders and images
    const sortedFolders = sortRepoItems(data.folders || []);
    const sortedImages = sortRepoItems(data.images || []);

    // Render content based on view type
    if (AppState.imageRepoView === 'grid') {
      renderImageRepoGrid(sortedFolders, sortedImages);
    } else {
      renderImageRepoList(sortedFolders, sortedImages);
    }

  } catch (err) {
    console.error('Failed to load image repository:', err);
    loading.style.display = 'none';
    error.style.display = 'block';
    error.textContent = err.message || 'Failed to load directory. Please check that the Image Repository Path is set correctly in Settings.';
  }
}

// Render breadcrumb navigation
function renderBreadcrumb(breadcrumbs) {
  const breadcrumb = document.getElementById('image-repo-breadcrumb');
  if (!breadcrumb) return;

  if (breadcrumbs.length === 0) {
    breadcrumb.innerHTML = '<span style="color: #999;">No repository path configured. Please set it in Settings.</span>';
    return;
  }

  breadcrumb.innerHTML = breadcrumbs.map((crumb, index) => {
    const isLast = index === breadcrumbs.length - 1;
    return `
      <span class="breadcrumb-item ${isLast ? 'active' : ''}"
            onclick="${isLast ? '' : `navigateToPath('${crumb.path}')`}"
            style="cursor: ${isLast ? 'default' : 'pointer'};">
        ${crumb.name}
      </span>
      ${isLast ? '' : '<span class="breadcrumb-separator">/</span>'}
    `;
  }).join('');
}

// Navigate to a specific path
window.navigateToPath = function(path) {
  loadImageRepoDirectory(path);
};

// Render grid view
function renderImageRepoGrid(folders, images) {
  const content = document.getElementById('image-repo-content');
  if (!content) return;

  if (folders.length === 0 && images.length === 0) {
    content.innerHTML = '<div class="alert info">This directory is empty.</div>';
    return;
  }

  content.innerHTML = `
    <div class="image-repo-grid">
      ${folders.map(folder => `
        <div class="repo-item folder" onclick="navigateToPath('${folder.path}')">
          <div class="repo-item-icon">📁</div>
          <div class="repo-item-name">${folder.name}</div>
        </div>
      `).join('')}

      ${images.map(image => `
        <div class="repo-item image" onclick="selectImageFromRepo('${image.path}')">
          <div class="repo-item-preview">
            <img src="/api/image-repo/image?path=${encodeURIComponent(image.path)}"
                 alt="${image.name}"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3E🖼️%3C/text%3E%3C/svg%3E'">
          </div>
          <div class="repo-item-name">${image.name}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Render list view
function renderImageRepoList(folders, images) {
  const content = document.getElementById('image-repo-content');
  if (!content) return;

  if (folders.length === 0 && images.length === 0) {
    content.innerHTML = '<div class="alert info">This directory is empty.</div>';
    return;
  }

  content.innerHTML = `
    <div class="image-repo-list">
      ${folders.map(folder => `
        <div class="repo-list-item folder" onclick="navigateToPath('${folder.path}')">
          <span class="repo-list-icon">📁</span>
          <span class="repo-list-name">${folder.name}</span>
          <span class="repo-list-type">Folder</span>
        </div>
      `).join('')}

      ${images.map(image => `
        <div class="repo-list-item image" onclick="selectImageFromRepo('${image.path}')">
          <span class="repo-list-icon">🖼️</span>
          <span class="repo-list-name">${image.name}</span>
          <span class="repo-list-type">${image.name.split('.').pop().toUpperCase()}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// Select an image from the repo
window.selectImageFromRepo = async function(imagePath) {
  try {
    // Show loading toast
    showToast('Uploading image...', 'info');

    // Upload the image to ComfyUI via backend
    const formData = new FormData();
    formData.append('image_path', imagePath);

    const response = await fetch('/api/image-repo/select', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to upload image');
    }

    showToast('Image uploaded successfully!', 'success');

    // Open create job modal with the uploaded image
    openCreateJobModal(data.image_url);

  } catch (err) {
    console.error('Failed to select image:', err);
    showToast(err.message || 'Failed to upload image', 'error');
  }
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
      <h2>Image Repository</h2>
      <div class="form-group">
        <label>Local Image Repository Path</label>
        <input type="text" id="setting-image-repo-path" placeholder="/path/to/your/images">
        <small style="color: #666; font-size: 12px;">Absolute path to a local directory containing your images</small>
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
        const completedSegments = job.completed_segments ?? 0;
        return `
        <tr onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
          <td>${job.name}</td>
          <td><span class="chip ${getChipClass(job.status)}">${job.status}</span></td>
          <td>${completedSegments} completed</td>
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
        const completedSegments = job.completed_segments ?? 0;
        const progress = job.progress_percent ?? 0;

        return `
        <tr style="cursor: pointer;" onclick="navigate('job-detail', {currentJobId: '${job.id}'})">
          <td><img class="thumbnail" src="${API.getJobThumbnail(job.id)}" onerror="this.style.display='none'"></td>
          <td>${job.name}</td>
          <td>${formatDate(job.created_at)}</td>
          <td><span class="chip ${getChipClass(job.status)}">${job.status}</span></td>
          <td>${completedSegments} completed</td>
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
    const completedSegments = job.completed_segments ?? 0;
    const progressPercent = job.progress_percent ?? 0;
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
          <div class="value">${completedSegments} segments completed</div>
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
      ${job.status === 'completed' ? `
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="reopenJob('${jobId}')" style="background: #ff9800; color: white; border: none;">
            Reopen Job & Continue
          </button>
          <p style="font-size: 12px; color: #666; margin-top: 8px;">Reopening allows you to add more segments to this completed job.</p>
        </div>
      ` : ''}
    `;

    const segmentsList = document.getElementById('segments-list');
    
    // If no segments from API, create a stub segment from job data
    if (segments.length === 0) {
      // Create a placeholder showing the job's initial state
      segmentsList.innerHTML = `
        <div class="segment-item">
          <div class="segment-header">
            <div>
              <strong>Segment 1</strong>
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
                <div><strong>Prompt:</strong> ${seg.prompt || 'TBD'}</div>
                <div><strong>High lora:</strong> ${seg.high_lora || 'N/A'}</div>
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
      
      // Check if waiting for prompt - show form for next segment
      if (job.status === 'awaiting_prompt') {
        // The next segment is either the first one without a prompt, or a new segment after all completed ones
        const segmentWithoutPrompt = segments.find(s => !s.prompt && s.status === 'pending');
        const nextSegmentIndex = segmentWithoutPrompt ? segmentWithoutPrompt.segment_index : segments.length;
        const lastCompletedSegment = segments.filter(s => s.status === 'completed').pop();

        // Always show the form when status is awaiting_prompt
        if (true) {
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
                  <div class="searchable-select" id="next-segment-high-lora-container">
                    <input type="text" id="next-segment-high-lora" placeholder="Search or select LoRA..." autocomplete="off" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                    <div class="searchable-select-dropdown" id="next-segment-high-lora-dropdown" style="display: none; position: absolute; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;"></div>
                  </div>
                </div>
                <div class="form-group">
                  <label style="font-size: 12px; color: #666;">Low Noise LoRA (optional)</label>
                  <div class="searchable-select" id="next-segment-low-lora-container">
                    <input type="text" id="next-segment-low-lora" placeholder="Search or select LoRA..." autocomplete="off" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                    <div class="searchable-select-dropdown" id="next-segment-low-lora-dropdown" style="display: none; position: absolute; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;"></div>
                  </div>
                </div>
              </div>
              <div style="display: flex; gap: 12px; align-items: center; margin-top: 12px;">
                <button class="btn btn-primary" id="submit-next-prompt-btn" onclick="submitNextPrompt('${jobId}', ${nextSegmentIndex})" style="flex: 1;">Continue with Next Segment</button>
                <div style="color: #666; font-weight: 500;">OR</div>
                <button class="btn btn-secondary" id="finalize-job-btn" onclick="finalizeJob('${jobId}')" style="flex: 1; background: #4caf50; color: white; border: none;">Finalize & Merge</button>
              </div>
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
    document.getElementById('setting-image-repo-path').value = settings.image_repo_path || '';
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
    const imageRepoPath = document.getElementById('setting-image-repo-path').value.trim();
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
      image_repo_path: imageRepoPath,
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

// Open create job modal (optionally with pre-uploaded image from repo)
function openCreateJobModal(preUploadedImageUrl = null) {
  const container = document.getElementById('modals-container');
  const settings = AppState.settings || {};
  const defaultWidth = settings.default_width || 640;
  const defaultHeight = settings.default_height || 640;

  // Store pre-uploaded image URL in app state if provided
  if (preUploadedImageUrl) {
    AppState.preUploadedImageUrl = preUploadedImageUrl;
  } else {
    AppState.preUploadedImageUrl = null;
  }

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
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500;">Segment Duration</label>
          <select id="new-job-segment-duration" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
            <option value="3">3 seconds</option>
            <option value="4">4 seconds</option>
            <option value="5" selected>5 seconds</option>
          </select>
          <small style="color: #666; font-size: 12px;">Add segments one at a time. Click "Finalize & Merge" when done.</small>
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
            <div class="searchable-select" id="new-job-high-lora-container">
              <input type="text" id="new-job-high-lora" placeholder="Search or select LoRA..." autocomplete="off" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
              <div class="searchable-select-dropdown" id="new-job-high-lora-dropdown" style="display: none; position: absolute; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;"></div>
            </div>
          </div>
          <div class="form-group">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Low Noise LoRA (optional)</label>
            <div class="searchable-select" id="new-job-low-lora-container">
              <input type="text" id="new-job-low-lora" placeholder="Search or select LoRA..." autocomplete="off" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
              <div class="searchable-select-dropdown" id="new-job-low-lora-dropdown" style="display: none; position: absolute; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;"></div>
            </div>
          </div>
        </div>

        <div style="text-align: right; margin-top: 24px;">
          <button class="btn btn-secondary" onclick="closeCreateJobModal()" style="padding: 8px 16px; margin-right: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button class="btn btn-primary" onclick="createJobFromModal()" style="padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">Create Job</button>
        </div>
      </div>
    </div>
  `;
  
  // Image preview
  const imageInput = document.getElementById('new-job-image');
  const imagePreview = document.getElementById('image-preview');

  // If we have a pre-uploaded image from repo, show it and hide the file input
  if (preUploadedImageUrl) {
    imagePreview.innerHTML = `
      <div style="margin-bottom: 8px;">
        <img src="/api/comfyui/view?filename=${encodeURIComponent(preUploadedImageUrl)}"
             style="max-width: 200px; max-height: 150px; border-radius: 4px; border: 1px solid #ddd;"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22150%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22150%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3EImage from Repo%3C/text%3E%3C/svg%3E'">
      </div>
      <div style="font-size: 12px; color: #666;">
        Image from repository: ${preUploadedImageUrl}
        <button onclick="clearPreUploadedImage()" class="btn btn-secondary" style="margin-left: 8px; padding: 4px 8px; font-size: 11px;">Choose Different Image</button>
      </div>
    `;
    imageInput.style.display = 'none';
  } else {
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          imagePreview.innerHTML =
            `<img src="${e.target.result}" style="max-width: 200px; max-height: 150px; border-radius: 4px; border: 1px solid #ddd;">`;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Load available LoRAs from ComfyUI
  loadLoraOptions();
}

// Clear pre-uploaded image and show file input
window.clearPreUploadedImage = function() {
  AppState.preUploadedImageUrl = null;
  const imageInput = document.getElementById('new-job-image');
  const imagePreview = document.getElementById('image-preview');
  imageInput.style.display = 'block';
  imagePreview.innerHTML = '';
};

// Helper function to create searchable dropdown for LoRAs
function createSearchableLoraDropdown(inputId, dropdownId, loras) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  if (!input || !dropdown) return;

  let selectedValue = '';

  // Render dropdown options
  function renderOptions(filter = '') {
    const filterLower = filter.toLowerCase();
    const filtered = loras.filter(lora =>
      lora.toLowerCase().includes(filterLower)
    );

    let html = '<div style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 13px; color: #666;" data-value="">-- Use Default --</div>';

    filtered.forEach(lora => {
      html += `<div style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 13px;" data-value="${lora}">${lora}</div>`;
    });

    if (filtered.length === 0 && filter) {
      html += '<div style="padding: 8px; color: #999; font-size: 13px;">No LoRAs found</div>';
    }

    dropdown.innerHTML = html;

    // Add click handlers to options
    dropdown.querySelectorAll('[data-value]').forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.background = '#f0f0f0';
      });
      option.addEventListener('mouseleave', () => {
        option.style.background = 'white';
      });
      option.addEventListener('click', () => {
        selectedValue = option.dataset.value;
        input.value = selectedValue;
        input.dataset.selectedValue = selectedValue;
        dropdown.style.display = 'none';
      });
    });
  }

  // Show dropdown on focus
  input.addEventListener('focus', () => {
    renderOptions(input.value);
    dropdown.style.display = 'block';
    // Match dropdown width to input
    dropdown.style.width = input.offsetWidth + 'px';
  });

  // Filter as user types
  input.addEventListener('input', () => {
    renderOptions(input.value);
    dropdown.style.display = 'block';
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Initial render
  renderOptions();
}

// Load LoRA options into dropdowns for job creation modal
async function loadLoraOptions() {
  try {
    const response = await API.getLoras();
    const loras = response.loras || [];

    // Sort LoRAs alphabetically
    loras.sort((a, b) => a.localeCompare(b));

    // Set up searchable dropdowns
    createSearchableLoraDropdown('new-job-high-lora', 'new-job-high-lora-dropdown', loras);
    createSearchableLoraDropdown('new-job-low-lora', 'new-job-low-lora-dropdown', loras);
  } catch (err) {
    console.error('Failed to load LoRAs:', err);
  }
}

// Load LoRA options into dropdowns for segment prompt form
async function loadSegmentLoraOptions() {
  try {
    const response = await API.getLoras();
    const loras = response.loras || [];

    // Sort LoRAs alphabetically
    loras.sort((a, b) => a.localeCompare(b));

    // Set up searchable dropdowns
    createSearchableLoraDropdown('next-segment-high-lora', 'next-segment-high-lora-dropdown', loras);
    createSearchableLoraDropdown('next-segment-low-lora', 'next-segment-low-lora-dropdown', loras);
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
  const segmentDuration = parseInt(document.getElementById('new-job-segment-duration').value) || 5;
  const prompt = document.getElementById('new-job-prompt').value.trim();
  const imageInput = document.getElementById('new-job-image');
  const imageFile = imageInput.files[0];
  const highLoraInput = document.getElementById('new-job-high-lora');
  const lowLoraInput = document.getElementById('new-job-low-lora');
  const highLora = (highLoraInput?.dataset.selectedValue || highLoraInput?.value || '').trim() || null;
  const lowLora = (lowLoraInput?.dataset.selectedValue || lowLoraInput?.value || '').trim() || null;

  if (!name) {
    showToast('Please enter a job name', 'error');
    return;
  }

  if (!prompt) {
    showToast('Please enter a prompt', 'error');
    return;
  }

  // Check if we have either a pre-uploaded image or a file upload
  const hasPreUploadedImage = AppState.preUploadedImageUrl;
  if (!hasPreUploadedImage && !imageFile) {
    showToast('Please select a start image', 'error');
    return;
  }

  try {
    let imageFilename;

    // Use pre-uploaded image from repo if available, otherwise upload the file
    if (hasPreUploadedImage) {
      imageFilename = AppState.preUploadedImageUrl;
    } else {
      // Upload the image to ComfyUI
      showToast('Uploading image...', 'info');
      const uploadResult = await API.uploadImage(imageFile);

      if (!uploadResult || !uploadResult.filename) {
        showToast('Failed to upload image', 'error');
        return;
      }
      imageFilename = uploadResult.filename;
    }

    const jobData = {
      name: name,
      prompt: prompt,
      workflow_type: 'i2v',
      negative_prompt: AppState.settings?.default_negative_prompt || '',
      input_image: imageFilename,
      high_lora: highLora || null,
      low_lora: lowLora || null,
      parameters: {
        width: width,
        height: height,
        segment_duration: segmentDuration
      }
    };

    await API.createJob(jobData);
    showToast('Job created successfully', 'success');
    closeCreateJobModal();

    // Clear pre-uploaded image state
    AppState.preUploadedImageUrl = null;

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

// Reopen a completed job to add more segments
async function reopenJob(jobId) {
  if (!confirm('Reopen this job to add more segments? The final video will remain available until you finalize again.')) {
    return;
  }

  try {
    showToast('Reopening job...', 'info');
    await API.reopenJob(jobId);
    showToast('Job reopened! You can now add more segments.', 'success');

    // Refresh the job detail view
    updateJobDetail(jobId);
  } catch (err) {
    console.error('Failed to reopen job:', err);
    showToast('Failed to reopen job: ' + err.message, 'error');
  }
}

// Finalize job and merge all completed segments
async function finalizeJob(jobId) {
  if (!confirm('Are you sure you want to finalize this job? This will merge all completed segments into a final video.')) {
    return;
  }

  try {
    showToast('Finalizing and merging segments...', 'info');
    await API.finalizeJob(jobId);
    showToast('Job finalized successfully! Final video is being generated.', 'success');

    // Refresh the job detail view
    updateJobDetail(jobId);
  } catch (err) {
    console.error('Failed to finalize job:', err);
    showToast('Failed to finalize job: ' + err.message, 'error');
  }
}

// Submit next prompt for a job segment
async function submitNextPrompt(jobId, segmentIndex) {
  const promptInput = document.getElementById('next-prompt-input');
  const prompt = promptInput?.value.trim();
  const highLoraInput = document.getElementById('next-segment-high-lora');
  const lowLoraInput = document.getElementById('next-segment-low-lora');
  const highLora = (highLoraInput?.dataset.selectedValue || highLoraInput?.value || '').trim() || null;
  const lowLora = (lowLoraInput?.dataset.selectedValue || lowLoraInput?.value || '').trim() || null;
  
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
