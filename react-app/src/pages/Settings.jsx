import { useState, useEffect } from 'react';
import { Button } from '@mui/material';
import API from '../api/client';
import { showToast, requestNotificationPermission } from '../utils/helpers';
import './Settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLoras, setFetchingLoras] = useState(false);

  // Form fields
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [imageRepoPath, setImageRepoPath] = useState('');
  const [defaultWidth, setDefaultWidth] = useState(640);
  const [defaultHeight, setDefaultHeight] = useState(640);
  const [defaultFps, setDefaultFps] = useState(16);
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState('');
  const [queueWaitTimeout, setQueueWaitTimeout] = useState(30);

  useEffect(() => {
    loadSettings();
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
        comfyui_url: comfyuiUrl || 'http://localhost:8188',
        image_repo_path: imageRepoPath,
        default_width: String(defaultWidth),
        default_height: String(defaultHeight),
        default_fps: String(defaultFps),
        default_negative_prompt: defaultNegativePrompt,
        queue_wait_timeout: String(queueWaitTimeout * 60) // Convert minutes to seconds
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

  function handleTestNotification() {
    console.log('[Settings] Testing notification...');

    if (!('Notification' in window)) {
      showToast('Your browser does not support notifications', 'error');
      return;
    }

    if (Notification.permission === 'denied') {
      showToast('Notifications are blocked. Please enable them in your browser settings.', 'error');
      return;
    }

    if (Notification.permission === 'default') {
      showToast('Requesting notification permission...', 'info');
      requestNotificationPermission();
      return;
    }

    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification('Test Notification', {
          body: 'Browser notifications are working correctly!',
          icon: '/favicon.ico',
          tag: 'test-notification'
        });

        notification.onclick = function() {
          window.focus();
          notification.close();
        };

        showToast('Test notification sent!', 'success');
      } catch (error) {
        console.error('[Settings] Failed to send test notification:', error);
        showToast('Failed to send notification: ' + error.message, 'error');
      }
    }
  }

  function getNotificationStatus() {
    if (!('Notification' in window)) {
      return { status: 'unsupported', color: 'red', text: 'Not Supported' };
    }

    switch (Notification.permission) {
      case 'granted':
        return { status: 'granted', color: 'green', text: 'Enabled' };
      case 'denied':
        return { status: 'denied', color: 'red', text: 'Blocked' };
      case 'default':
        return { status: 'default', color: 'orange', text: 'Not Requested' };
      default:
        return { status: 'unknown', color: 'gray', text: 'Unknown' };
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

        {/* LoRA Library */}
        <div className="card settings-section">
          <h2>LoRA Library</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Fetch and cache LoRA models from ComfyUI. Cached LoRAs can be managed in the LoRA Library page.
          </p>
          <Button
            variant="contained"
            onClick={handleFetchLoras}
            disabled={fetchingLoras}
          >
            {fetchingLoras ? 'Fetching...' : 'Fetch LoRAs from ComfyUI'}
          </Button>
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

      {/* Notifications Section */}
      <div className="card settings-section" style={{ marginTop: '24px' }}>
        <h2>Browser Notifications</h2>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontWeight: 500 }}>Status:</span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '4px',
                background: getNotificationStatus().color === 'green' ? '#d4edda' :
                           getNotificationStatus().color === 'red' ? '#f8d7da' :
                           getNotificationStatus().color === 'orange' ? '#fff3cd' : '#e2e3e5',
                color: getNotificationStatus().color === 'green' ? '#155724' :
                       getNotificationStatus().color === 'red' ? '#721c24' :
                       getNotificationStatus().color === 'orange' ? '#856404' : '#383d41',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              {getNotificationStatus().text}
            </span>
          </div>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            Enable browser notifications to receive alerts when jobs require prompt input.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              variant="contained"
              onClick={handleTestNotification}
              disabled={getNotificationStatus().status === 'unsupported'}
            >
              Test Notification
            </Button>
            {getNotificationStatus().status === 'denied' && (
              <Button
                variant="outlined"
                onClick={() => {
                  showToast('Please check your browser settings to enable notifications for this site', 'info');
                }}
              >
                How to Enable
              </Button>
            )}
            {getNotificationStatus().status === 'default' && (
              <Button
                variant="outlined"
                onClick={requestNotificationPermission}
              >
                Request Permission
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
