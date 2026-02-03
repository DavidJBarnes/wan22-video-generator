import { useState, useEffect } from 'react';
import { Button, Chip, TextField, IconButton, CircularProgress } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import { useLoras } from '../contexts/LoraContext';
import './Settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLoras, setFetchingLoras] = useState(false);
  const [cleaningLoras, setCleaningLoras] = useState(false);
  const [hiddenLoras, setHiddenLoras] = useState([]);
  const [loadingHidden, setLoadingHidden] = useState(false);
  const { refreshLoras } = useLoras();

  // Form fields
  const [apiUrl, setApiUrl] = useState('');
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [imageRepoPath, setImageRepoPath] = useState('');
  const [defaultTargetFps, setDefaultTargetFps] = useState(30);
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState('');
  const [queueWaitTimeout, setQueueWaitTimeout] = useState(30);
  const [segmentExecutionTimeout, setSegmentExecutionTimeout] = useState(20);
  const [namePrefixes, setNamePrefixes] = useState([]);
  const [nameDescriptions, setNameDescriptions] = useState([]);
  const [newPrefix, setNewPrefix] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [promptIdentity, setPromptIdentity] = useState('');
  const [slideshowDelay, setSlideshowDelay] = useState(5);

  // FaceFusion face swap settings
  const [faceswapModel, setFaceswapModel] = useState('hyperswap_1c_256');
  const [faceswapOccluder, setFaceswapOccluder] = useState('xseg_3');
  const [faceswapMaskBlur, setFaceswapMaskBlur] = useState(0.2);
  const [faceswapRegionMask, setFaceswapRegionMask] = useState(true);
  const [faceswapScoreThreshold, setFaceswapScoreThreshold] = useState(0.5);
  const [faceswapPixelBoost, setFaceswapPixelBoost] = useState('512x512');

  // VR 180 stereo settings (validated for Quest 3S)
  const [vrEyeSeparation, setVrEyeSeparation] = useState(0.015);
  const [vrDepthStrength, setVrDepthStrength] = useState(0.5);
  const [vrOutputWidth, setVrOutputWidth] = useState(4128);
  const [vrOutputHeight, setVrOutputHeight] = useState(2208);
  const [vrEquirectangular, setVrEquirectangular] = useState(false);
  const [vrVerticalFov, setVrVerticalFov] = useState(90);
  const [vrDepthSmoothing, setVrDepthSmoothing] = useState(2.0);
  const [vrOutputSharpening, setVrOutputSharpening] = useState(0.3);
  const [vrUpscaleEnabled, setVrUpscaleEnabled] = useState(true);
  const [vrUpscaleFactor, setVrUpscaleFactor] = useState(2);
  const [vrUpscaleThreshold, setVrUpscaleThreshold] = useState(1500);
  const [vrVideoUpscaleEnabled, setVrVideoUpscaleEnabled] = useState(false);
  const [vrDepthModel, setVrDepthModel] = useState('depth_anything_v2');
  const [vrEncodingPreset, setVrEncodingPreset] = useState('balanced');

  useEffect(() => {
    loadSettings();
    loadHiddenLoras();
  }, []);

  async function loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings || data;
      setSettings(s);

      // api_url is client-side only, stored in localStorage via API client
      setApiUrl(API.getBaseUrl() === '/api' ? '' : API.getBaseUrl());
      setComfyuiUrl(s.comfyui_url || 'http://localhost:8188');
      setImageRepoPath(s.image_repo_path || '');
      setDefaultTargetFps(parseInt(s.default_target_fps) || 30);
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

      // FaceFusion settings
      setFaceswapModel(s.faceswap_model || 'hyperswap_1c_256');
      setFaceswapOccluder(s.faceswap_occluder || 'xseg_3');
      setFaceswapMaskBlur(parseFloat(s.faceswap_mask_blur) || 0.2);
      setFaceswapRegionMask(s.faceswap_region_mask !== 'false');
      setFaceswapScoreThreshold(parseFloat(s.faceswap_score_threshold) || 0.5);
      setFaceswapPixelBoost(s.faceswap_pixel_boost || '512x512');

      // VR settings (validated for Quest 3S)
      setVrEyeSeparation(parseFloat(s.vr_eye_separation) || 0.015);
      setVrDepthStrength(parseFloat(s.vr_depth_strength) || 0.5);
      setVrOutputWidth(parseInt(s.vr_output_width) || 4128);
      setVrOutputHeight(parseInt(s.vr_output_height) || 2208);
      setVrEquirectangular(s.vr_equirectangular === 'true');
      setVrVerticalFov(parseInt(s.vr_vertical_fov) || 90);
      setVrDepthSmoothing(parseFloat(s.vr_depth_smoothing) || 2.0);
      setVrOutputSharpening(parseFloat(s.vr_output_sharpening) || 0.3);
      setVrUpscaleEnabled(s.vr_upscale_enabled !== 'false');
      setVrUpscaleFactor(parseInt(s.vr_upscale_factor) || 2);
      setVrUpscaleThreshold(parseInt(s.vr_upscale_threshold) || 1500);
      setVrVideoUpscaleEnabled(s.vr_video_upscale_enabled === 'true');
      setVrDepthModel(s.vr_depth_model || 'depth_anything_v2');
      setVrEncodingPreset(s.vr_encoding_preset || 'balanced');

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
        default_target_fps: String(defaultTargetFps),
        default_negative_prompt: defaultNegativePrompt,
        queue_wait_timeout: String(queueWaitTimeout * 60), // Convert minutes to seconds
        segment_execution_timeout: String(segmentExecutionTimeout * 60), // Convert minutes to seconds
        job_name_prefixes: JSON.stringify(namePrefixes),
        job_name_descriptions: JSON.stringify(nameDescriptions),
        prompt_identity: promptIdentity,
        slideshow_delay: String(slideshowDelay),
        // VR settings
        vr_eye_separation: String(vrEyeSeparation),
        vr_depth_strength: String(vrDepthStrength),
        vr_output_width: String(vrOutputWidth),
        vr_output_height: String(vrOutputHeight),
        vr_equirectangular: String(vrEquirectangular),
        vr_vertical_fov: String(vrVerticalFov),
        vr_depth_smoothing: String(vrDepthSmoothing),
        vr_output_sharpening: String(vrOutputSharpening),
        vr_upscale_enabled: String(vrUpscaleEnabled),
        vr_upscale_factor: String(vrUpscaleFactor),
        vr_upscale_threshold: String(vrUpscaleThreshold),
        vr_video_upscale_enabled: String(vrVideoUpscaleEnabled),
        vr_depth_model: vrDepthModel,
        vr_encoding_preset: vrEncodingPreset,
        // FaceFusion settings
        faceswap_model: faceswapModel,
        faceswap_occluder: faceswapOccluder,
        faceswap_mask_blur: String(faceswapMaskBlur),
        faceswap_region_mask: String(faceswapRegionMask),
        faceswap_score_threshold: String(faceswapScoreThreshold),
        faceswap_pixel_boost: faceswapPixelBoost
      };

      await API.updateSettings(settingsPayload);

      // Update client-side API URL after successful save
      API.setBaseUrl(apiUrl);

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
      showToast(result.message || `Fetched ${result.file_count} files, grouped into ${result.grouped_count} LoRAs`, 'success');
      // Refresh the LoRA context cache so new LoRAs appear immediately
      await refreshLoras();
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
      // Refresh the LoRA context cache after cleanup
      await refreshLoras();
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
        <div className="settings-container">
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

        {/* API Configuration */}
        <div className="card settings-section">
          <h2>API Configuration</h2>
          <div className="form-group">
            <label>API URL</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="Leave empty for default (relative URL)"
                style={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  API.setBaseUrl(apiUrl);
                  window.location.reload();
                }}
              >
                Apply & Reload
              </Button>
            </div>
            <small style={{ color: '#666', fontSize: '12px' }}>
              Backend API URL (e.g., http://2070.zero:9090/api). Click "Apply & Reload" to save and refresh.
            </small>
          </div>
        </div>

        {/* Image Repository */}
        <div className="card settings-section">
          <h2>Image Repository</h2>
          <div className="form-group">
            <label>Image Repository Path</label>
            <input
              type="text"
              value={imageRepoPath}
              onChange={(e) => setImageRepoPath(e.target.value)}
              placeholder="/path/to/images"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Local directory path containing source images for video generation.
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
        {/* Note: Image tags are now derived from prefixes and descriptions below */}
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
              <label>Output FPS</label>
              <select
                value={defaultTargetFps}
                onChange={(e) => setDefaultTargetFps(parseInt(e.target.value))}
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
                <option value={90}>90 fps (Quest 3S)</option>
              </select>
              <small style={{ color: '#666', fontSize: '12px' }}>
                Video dimensions are automatically set from the input image
              </small>
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

        {/* FaceFusion Face Swap Settings */}
        <div className="card settings-section">
          <h2>FaceFusion Face Swap</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Default parameters for face swapping with occlusion detection.
          </p>

          <div className="settings-grid">
            <div className="form-group">
              <label>Face Swapper Model</label>
              <select
                value={faceswapModel}
                onChange={(e) => setFaceswapModel(e.target.value)}
              >
                <option value="hyperswap_1c_256">HyperSwap 1C 256 (best quality)</option>
                <option value="hyperswap">HyperSwap Standard</option>
                <option value="inswapper_128_fp16">InSwapper 128 FP16 (faster)</option>
                <option value="inswapper_128">InSwapper 128</option>
              </select>
              <small style={{ color: '#666', fontSize: '12px' }}>
                Model used for face swapping. HyperSwap 1C 256 provides highest quality.
              </small>
            </div>

            <div className="form-group">
              <label>Occlusion Detection Model</label>
              <select
                value={faceswapOccluder}
                onChange={(e) => setFaceswapOccluder(e.target.value)}
              >
                <option value="xseg_3">XSeg 3 (best quality)</option>
                <option value="xseg_2">XSeg 2</option>
                <option value="xseg_1">XSeg 1 (faster)</option>
              </select>
              <small style={{ color: '#666', fontSize: '12px' }}>
                Model for detecting occlusions (hands, tongue, etc.) to protect them during face swap.
              </small>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>Face Mask Blur: {faceswapMaskBlur}</label>
            <input
              type="range"
              value={faceswapMaskBlur}
              onChange={(e) => setFaceswapMaskBlur(parseFloat(e.target.value))}
              min="0"
              max="1"
              step="0.05"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '11px' }}>
              <span>0 (sharp)</span>
              <span>1.0 (blurred)</span>
            </div>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Blur amount for face mask edges. Lower values create sharper transitions.
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={faceswapRegionMask}
                onChange={(e) => setFaceswapRegionMask(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Enable Region Masking
            </label>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Use region-specific masks (skin, nose, mouth, lips) for more precise face blending.
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>Face Detection Score: {faceswapScoreThreshold}</label>
            <input
              type="range"
              value={faceswapScoreThreshold}
              onChange={(e) => setFaceswapScoreThreshold(parseFloat(e.target.value))}
              min="0.1"
              max="0.9"
              step="0.05"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '11px' }}>
              <span>0.1 (lenient)</span>
              <span>0.9 (strict)</span>
            </div>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Minimum confidence score for face detection. Lower values detect more faces but may include false positives.
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>Pixel Boost (Face Resolution)</label>
            <select
              value={faceswapPixelBoost}
              onChange={(e) => setFaceswapPixelBoost(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="256x256">256x256 - Fast, lower quality</option>
              <option value="512x512">512x512 - Balanced (default)</option>
              <option value="768x768">768x768 - Higher quality, slower</option>
              <option value="1024x1024">1024x1024 - Best quality, slowest</option>
            </select>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Resolution at which face swapping is performed. Higher values produce sharper, more detailed faces but require more VRAM and processing time. Use 512x512 for most cases, 768x768+ for close-up shots where face detail matters.
            </small>
          </div>
        </div>

        {/* VR 180 Stereo Settings */}
        <div className="card settings-section">
          <h2>VR 180 Stereo</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Settings for generating VR 180° stereoscopic images and videos.
            Optimized for Meta Quest 3S.
          </p>

          {/* Depth Model Selection */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label>Depth Estimation Model</label>
            <select
              value={vrDepthModel}
              onChange={(e) => setVrDepthModel(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="depth_anything_v2">Depth Anything V2 Large (recommended)</option>
              <option value="midas">MiDaS DPT-Large (legacy)</option>
            </select>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Depth Anything V2 produces more accurate depth maps with better edge detection. MiDaS is the legacy option.
            </small>
          </div>

          {/* Video Encoding Preset */}
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label>Video Encoding Preset</label>
            <select
              value={vrEncodingPreset}
              onChange={(e) => setVrEncodingPreset(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="high_quality">High Quality (H.265 CRF 17)</option>
              <option value="balanced">Balanced (H.265 CRF 18) - recommended</option>
              <option value="fast">Fast Encode (H.265 CRF 20)</option>
              <option value="legacy_h264">Legacy H.264 (CRF 18)</option>
            </select>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              H.265/HEVC offers better quality at smaller file sizes. Use Legacy H.264 for maximum compatibility with older devices.
            </small>
          </div>

          <div className="settings-grid">
            <div className="form-group">
              <label>Eye Separation</label>
              <input
                type="number"
                value={vrEyeSeparation}
                onChange={(e) => setVrEyeSeparation(parseFloat(e.target.value) || 0.015)}
                min="0.01"
                max="0.1"
                step="0.005"
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Horizontal displacement factor (0.01-0.1). Higher = more 3D depth.
              </small>
            </div>
            <div className="form-group">
              <label>Depth Strength</label>
              <input
                type="number"
                value={vrDepthStrength}
                onChange={(e) => setVrDepthStrength(parseFloat(e.target.value) || 0.5)}
                min="0.1"
                max="3.0"
                step="0.1"
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Multiplier for depth-based displacement (0.1-3.0).
              </small>
            </div>
            <div className="form-group">
              <label>Output Width</label>
              <input
                type="number"
                value={vrOutputWidth}
                onChange={(e) => setVrOutputWidth(parseInt(e.target.value) || 4128)}
                min="1920"
                max="8192"
                step="8"
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Width of each eye view (total width = 2x). Default 4128 for Quest 3S.
              </small>
            </div>
            <div className="form-group">
              <label>Output Height</label>
              <input
                type="number"
                value={vrOutputHeight}
                onChange={(e) => setVrOutputHeight(parseInt(e.target.value) || 2208)}
                min="1080"
                max="4096"
                step="8"
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Height of output image. Default 2208 for Quest 3S.
              </small>
            </div>
          </div>

          {/* Equirectangular Projection Settings */}
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={vrEquirectangular}
                onChange={(e) => setVrEquirectangular(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Equirectangular Projection
            </label>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Apply equirectangular projection for proper VR 180° viewing. Enable for VR headsets (Quest, etc.), disable for flat SBS viewing.
            </small>
          </div>

          {vrEquirectangular && (
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Vertical FOV: {vrVerticalFov}°</label>
              <input
                type="range"
                value={vrVerticalFov}
                onChange={(e) => setVrVerticalFov(parseInt(e.target.value))}
                min="90"
                max="180"
                step="5"
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '11px' }}>
                <span>90° (less stretch)</span>
                <span>180° (full sphere)</span>
              </div>
              <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Vertical field of view for projection. Lower values reduce edge stretching. Recommended: 165°.
              </small>
            </div>
          )}

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>Depth Smoothing: {vrDepthSmoothing}</label>
            <input
              type="range"
              value={vrDepthSmoothing}
              onChange={(e) => setVrDepthSmoothing(parseFloat(e.target.value))}
              min="0"
              max="5"
              step="0.5"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '11px' }}>
              <span>0 (off)</span>
              <span>5 (max blur)</span>
            </div>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Gaussian blur applied to depth map to smooth harsh stereo transitions. Recommended: 2.0.
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>Output Sharpening: {vrOutputSharpening}</label>
            <input
              type="range"
              value={vrOutputSharpening}
              onChange={(e) => setVrOutputSharpening(parseFloat(e.target.value))}
              min="0"
              max="1"
              step="0.1"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '11px' }}>
              <span>0 (off)</span>
              <span>1.0 (strong)</span>
            </div>
            <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Unsharp mask applied to final output to restore crispness. Recommended: 0.3.
            </small>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #333' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>AI Upscaling (Real-ESRGAN)</h3>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vrUpscaleEnabled}
                  onChange={(e) => setVrUpscaleEnabled(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                Enable AI upscaling for VR image generation
              </label>
              <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Use Real-ESRGAN to enhance low-resolution source images before VR conversion.
              </small>
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vrVideoUpscaleEnabled}
                  onChange={(e) => setVrVideoUpscaleEnabled(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                Enable AI upscaling for VR video generation
              </label>
              <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Upscale each video frame before VR conversion. Warning: significantly increases processing time.
              </small>
            </div>

            {vrUpscaleEnabled && (
              <>
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label>Upscale Factor</label>
                  <select
                    value={vrUpscaleFactor}
                    onChange={(e) => setVrUpscaleFactor(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  >
                    <option value="2">2x (faster)</option>
                    <option value="4">4x (higher quality)</option>
                  </select>
                  <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    2x is faster with good quality. 4x produces sharper results but takes longer.
                  </small>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label>Width Threshold: {vrUpscaleThreshold}px</label>
                  <input
                    type="range"
                    value={vrUpscaleThreshold}
                    onChange={(e) => setVrUpscaleThreshold(parseInt(e.target.value))}
                    min="500"
                    max="3000"
                    step="100"
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '11px' }}>
                    <span>500px</span>
                    <span>3000px</span>
                  </div>
                  <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Only upscale images narrower than this threshold. Recommended: 1500px.
                  </small>
                </div>
              </>
            )}
          </div>
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
