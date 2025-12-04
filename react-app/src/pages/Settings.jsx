import { useState, useEffect } from 'react';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './Settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [imageRepoPath, setImageRepoPath] = useState('');
  const [defaultWidth, setDefaultWidth] = useState(640);
  const [defaultHeight, setDefaultHeight] = useState(640);
  const [defaultFps, setDefaultFps] = useState(16);
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings || data;
      setSettings(s);

      setComfyuiUrl(s.comfyui_url || 'http://3090.zero:8188');
      setImageRepoPath(s.image_repo_path || '');
      setDefaultWidth(parseInt(s.default_width) || 640);
      setDefaultHeight(parseInt(s.default_height) || 640);
      setDefaultFps(parseInt(s.default_fps) || 16);
      setDefaultNegativePrompt(s.default_negative_prompt || 'blurry, low quality, distorted');

      setLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      showToast('Failed to load settings', 'error');
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const settingsPayload = {
        comfyui_url: comfyuiUrl || 'http://3090.zero:8188',
        image_repo_path: imageRepoPath,
        default_width: String(defaultWidth),
        default_height: String(defaultHeight),
        default_fps: String(defaultFps),
        default_negative_prompt: defaultNegativePrompt
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

  if (loading) {
    return (
      <div>
        <h1>Settings</h1>
        <p>Loading...</p>
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
              placeholder="http://3090.zero:8188"
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              URL of your ComfyUI server
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
