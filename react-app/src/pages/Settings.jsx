import { useState, useEffect } from 'react';
import { Button, Chip, TextField, IconButton, CircularProgress } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './Settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLoras, setFetchingLoras] = useState(false);
  const [cleaningLoras, setCleaningLoras] = useState(false);
  const [hiddenLoras, setHiddenLoras] = useState([]);
  const [loadingHidden, setLoadingHidden] = useState(false);

  // Form fields
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [imageRepoPath, setImageRepoPath] = useState('');
  const [defaultWidth, setDefaultWidth] = useState(640);
  const [defaultHeight, setDefaultHeight] = useState(640);
  const [defaultFps, setDefaultFps] = useState(16);
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState('');
  const [queueWaitTimeout, setQueueWaitTimeout] = useState(30);
  const [segmentExecutionTimeout, setSegmentExecutionTimeout] = useState(20);
  const [namePrefixes, setNamePrefixes] = useState([]);
  const [nameDescriptions, setNameDescriptions] = useState([]);
  const [newPrefix, setNewPrefix] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [promptIdentity, setPromptIdentity] = useState('');
  const [slideshowDelay, setSlideshowDelay] = useState(5);

  useEffect(() => {
    loadSettings();
    loadHiddenLoras();
  }, []);

  async function loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings || data;
      setSettings(s);

      setComfyuiUrl(s.comfyui_url || 'http://localhost:8188');
      setImageRepoPath(s.image_repo_path || '');
      setDefaultWidth(parseInt(s.default_width) || 640);
      setDefaultHeight(parseInt(s.default_height) || 640);
      setDefaultFps(parseInt(s.default_fps) || 16);
      setDefaultNegativePrompt(s.default_negative_prompt || 'blurry, low quality, distorted');
      setQueueWaitTimeout(Math.round((parseInt(s.queue_wait_timeout) || 1800) / 60)); // Convert seconds to minutes
      setSegmentExecutionTimeout(Math.round((parseInt(s.segment_execution_timeout) || 1200) / 60)); // Convert seconds to minutes

      // Parse job naming presets
      try {
        const prefixes = JSON.parse(s.job_name_prefixes || '[]');
        setNamePrefixes(Array.isArray(prefixes) ? prefixes : []);
      } catch { setNamePrefixes([]); }
      try {
        const descriptions = JSON.parse(s.job_name_descriptions || '[]');
        setNameDescriptions(Array.isArray(descriptions) ? descriptions : []);
      } catch { setNameDescriptions([]); }

      setPromptIdentity(s.prompt_identity || '');
      setSlideshowDelay(parseInt(s.slideshow_delay) || 5);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      showToast('Failed to load settings', 'error');
      setLoading(false);
    }
  }

  async function loadHiddenLoras() {
    setLoadingHidden(true);
    try {
      const data = await API.getHiddenLoras();
      setHiddenLoras(data || []);
    } catch (error) {
      console.error('Failed to load hidden LoRAs:', error);
    } finally {
      setLoadingHidden(false);
    }
  }

  async function handleRestoreLora(filename) {
    try {
      await API.restoreHiddenLora(filename);
      showToast('LoRA restored. Refresh LoRA library to see it.', 'success');
      await loadHiddenLoras();
    } catch (error) {
      console.error('Failed to restore LoRA:', error);
      showToast('Failed to restore LoRA', 'error');
    }
  }

  function handleAddPrefix() {
    const trimmed = newPrefix.trim();
    if (trimmed && !namePrefixes.includes(trimmed)) {
      setNamePrefixes([...namePrefixes, trimmed]);
      setNewPrefix('');
    }
  }

  function handleRemovePrefix(prefix) {
    setNamePrefixes(namePrefixes.filter(p => p !== prefix));
  }

  function handleAddDescription() {
    const trimmed = newDescription.trim();
    if (trimmed && !nameDescriptions.includes(trimmed)) {
      setNameDescriptions([...nameDescriptions, trimmed]);
      setNewDescription('');
    }
  }

  function handleRemoveDescription(desc) {
    setNameDescriptions(nameDescriptions.filter(d => d !== desc));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const settingsPayload = {
        comfyui_url: comfyuiUrl || 'http://localhost:8188',
        image_repo_path: imageRepoPath,
        default_width: String(defaultWidth),
        default_height: String(defaultHeight),
        default_fps: String(defaultFps),
        default_negative_prompt: defaultNegativePrompt,
        queue_wait_timeout: String(queueWaitTimeout * 60), // Convert minutes to seconds
        segment_execution_timeout: String(segmentExecutionTimeout * 60), // Convert minutes to seconds
        job_name_prefixes: JSON.stringify(namePrefixes),
        job_name_descriptions: JSON.stringify(nameDescriptions),
        prompt_identity: promptIdentity,
        slideshow_delay: String(slideshowDelay)
      };

      await API.updateSettings(settingsPayload);
      showToast('Settings saved successfully', 'success');
      setSaving(false);

      // Reload settings to get any server-side changes
      await loadSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast('Failed to save settings', 'error');
      setSaving(false);
    }
  }

  async function handleFetchLoras() {
    setFetchingLoras(true);

    try {
      const result = await API.fetchAndCacheLoras();
      showToast(`Successfully cached ${result.count} LoRAs`, 'success');
      setFetchingLoras(false);
    } catch (error) {
      console.error('Failed to fetch LoRAs:', error);
      showToast('Failed to fetch LoRAs from ComfyUI', 'error');
      setFetchingLoras(false);
    }
  }

  async function handleCleanupLoras() {
    setCleaningLoras(true);

    try {
      const result = await API.cleanupDuplicateLoras();
      showToast(result.message, 'success');
      setCleaningLoras(false);
    } catch (error) {
      console.error('Failed to cleanup LoRAs:', error);
      showToast('Failed to cleanup duplicate LoRAs', 'error');
      setCleaningLoras(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Settings</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Settings</h1>

      <form onSubmit={handleSave}>
        {/* ComfyUI Configuration */}
        <div className="card settings-section">
          <h2>ComfyUI Configuration</h2>
          <div className="form-group">
            <label>Server URL</label>
            <input
              type="text"
              value={comfyuiUrl}
              onChange={(e) => setComfyuiUrl(e.target.value)}
              placeholder="http://localhost:8188"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              URL of your ComfyUI server
            </small>
          </div>
          <div className="form-group">
            <label>Queue Wait Timeout (minutes)</label>
            <input
              type="number"
              value={queueWaitTimeout}
              onChange={(e) => setQueueWaitTimeout(parseInt(e.target.value) || 30)}
              min="1"
              max="120"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              How long to wait for ComfyUI to finish existing jobs before timing out. Increase if you run manual jobs in ComfyUI.
            </small>
          </div>
          <div className="form-group">
            <label>Segment Execution Timeout (minutes)</label>
            <input
              type="number"
              value={segmentExecutionTimeout}
              onChange={(e) => setSegmentExecutionTimeout(parseInt(e.target.value) || 20)}
              min="5"
              max="60"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Max time for ComfyUI to generate a single video segment. Increase for high-resolution or high-FPS videos.
            </small>
          </div>
        </div>

        {/* Image Repository */}
        <div className="card settings-section">
          <h2>Image Repository</h2>
          <div className="form-group">
            <label>Local Image Repository Path</label>
            <input
              type="text"
              value={imageRepoPath}
              onChange={(e) => setImageRepoPath(e.target.value)}
              placeholder="/path/to/your/images"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Absolute path to a local directory containing your images
            </small>
          </div>
          <div className="form-group">
            <label>Slideshow Delay (seconds)</label>
            <input
              type="number"
              value={slideshowDelay}
              onChange={(e) => setSlideshowDelay(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              max="60"
              style={{ width: '100px' }}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Time between images in the random slideshow viewer (1-60 seconds)
            </small>
          </div>
        </div>

        {/* Job Naming Presets */}
        <div className="card settings-section">
          <h2>Job Naming Presets</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Quick-select options for naming jobs. Names are built as "Prefix - Description".
          </p>

          <div className="form-group">
            <label>Prefixes</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <TextField
                size="small"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
                placeholder="Add prefix..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPrefix())}
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" size="small" onClick={handleAddPrefix}>
                Add
              </Button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {namePrefixes.map((prefix) => (
                <Chip
                  key={prefix}
                  label={prefix}
                  onDelete={() => handleRemovePrefix(prefix)}
                  size="small"
                />
              ))}
              {namePrefixes.length === 0 && (
                <span style={{ color: '#999', fontStyle: 'italic', fontSize: '13px' }}>No prefixes added</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Descriptions</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <TextField
                size="small"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Add description..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDescription())}
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" size="small" onClick={handleAddDescription}>
                Add
              </Button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {nameDescriptions.map((desc) => (
                <Chip
                  key={desc}
                  label={desc}
                  onDelete={() => handleRemoveDescription(desc)}
                  size="small"
                />
              ))}
              {nameDescriptions.length === 0 && (
                <span style={{ color: '#999', fontStyle: 'italic', fontSize: '13px' }}>No descriptions added</span>
              )}
            </div>
          </div>
        </div>

        {/* LoRA Library */}
        <div className="card settings-section">
          <h2>LoRA Library</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Fetch and cache LoRA models from ComfyUI. Cached LoRAs can be managed in the LoRA Library page.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              variant="contained"
              onClick={handleFetchLoras}
              disabled={fetchingLoras}
            >
              {fetchingLoras ? 'Fetching...' : 'Fetch LoRAs from ComfyUI'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleCleanupLoras}
              disabled={cleaningLoras}
            >
              {cleaningLoras ? 'Cleaning...' : 'Cleanup Duplicates'}
            </Button>
          </div>
        </div>

        {/* Hidden LoRAs */}
        <div className="card settings-section">
          <h2>Hidden LoRAs</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            LoRAs you've deleted are hidden from future refreshes. Restore them here if needed.
          </p>
          {loadingHidden ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <CircularProgress size={24} />
            </div>
          ) : hiddenLoras.length === 0 ? (
            <p style={{ color: '#999', fontStyle: 'italic' }}>No hidden LoRAs</p>
          ) : (
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Filename</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hiddenLoras.map((item) => (
                    <tr key={item.id}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: '13px', wordBreak: 'break-all' }}>
                        {item.filename}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleRestoreLora(item.filename)}
                        >
                          Restore
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Default Parameters */}
        <div className="card settings-section">
          <h2>Default Parameters</h2>
          <div className="settings-grid">
            <div className="form-group">
              <label>Width</label>
              <input
                type="number"
                value={defaultWidth}
                onChange={(e) => setDefaultWidth(parseInt(e.target.value))}
                min="64"
                step="8"
              />
            </div>
            <div className="form-group">
              <label>Height</label>
              <input
                type="number"
                value={defaultHeight}
                onChange={(e) => setDefaultHeight(parseInt(e.target.value))}
                min="64"
                step="8"
              />
            </div>
            <div className="form-group">
              <label>FPS</label>
              <input
                type="number"
                value={defaultFps}
                onChange={(e) => setDefaultFps(parseInt(e.target.value))}
                min="1"
                max="60"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Default Negative Prompt</label>
            <textarea
              value={defaultNegativePrompt}
              onChange={(e) => setDefaultNegativePrompt(e.target.value)}
              rows="4"
              placeholder="blurry, low quality, distorted"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              This negative prompt will be used for all new jobs
            </small>
          </div>
        </div>

        {/* Prompting */}
        <div className="card settings-section">
          <h2>Prompting</h2>
          <div className="form-group">
            <label>Prompt Identity</label>
            <textarea
              value={promptIdentity}
              onChange={(e) => setPromptIdentity(e.target.value)}
              rows="4"
              placeholder="e.g., A woman with long brown hair, wearing a red dress"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              This text is automatically prepended to all prompts (job creation and segment prompts)
            </small>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ textAlign: 'right' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
