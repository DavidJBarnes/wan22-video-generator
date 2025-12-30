import { useState } from 'react';
import { Button, TextField, Rating, Box, Typography } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './CreateJobModal.css';

// Clean up base_name by removing {TYPE} placeholder
function cleanBaseName(baseName) {
  if (!baseName) return '';
  return baseName.replace(/\{type\}/gi, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function LoraEditModal({ lora, onClose, onSave }) {
  const [friendlyName, setFriendlyName] = useState(lora.friendly_name || '');
  const [url, setUrl] = useState(lora.url || '');
  const [promptText, setPromptText] = useState(lora.prompt_text || '');
  const [triggerKeywords, setTriggerKeywords] = useState(lora.trigger_keywords || '');
  const [rating, setRating] = useState(lora.rating || null);
  const [hasPreview, setHasPreview] = useState(!!lora.preview_image_url);
  const [previewCacheBust, setPreviewCacheBust] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);

  // Get the preview URL from the cached endpoint
  const previewUrl = hasPreview ? `${API.getLoraPreviewUrl(lora.id)}?t=${previewCacheBust}` : '';

  async function handleFetchPreview() {
    if (!url || !url.includes('civitai.com')) {
      showToast('Enter a CivitAI URL first', 'warning');
      return;
    }

    setFetchingPreview(true);
    try {
      await API.refreshLoraPreview(lora.id);
      setHasPreview(true);
      setPreviewCacheBust(Date.now()); // Force refresh the cached image
      showToast('Preview fetched and cached', 'success');
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      showToast('Failed to fetch preview from CivitAI', 'error');
    } finally {
      setFetchingPreview(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      await API.updateLora(lora.id, {
        friendly_name: friendlyName || null,
        url: url || null,
        prompt_text: promptText || null,
        trigger_keywords: triggerKeywords || null,
        rating: rating
        // preview_image_url is managed by the refresh-preview endpoint
      });

      showToast('LoRA metadata updated', 'success');
      setSaving(false);
      onSave();
    } catch (error) {
      console.error('Failed to update LoRA:', error);
      showToast('Failed to update LoRA metadata', 'error');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Edit LoRA Metadata</h2>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
          <strong style={{ fontSize: '12px', color: '#666' }}>Base Name:</strong>
          <div style={{ marginTop: '4px', marginBottom: '8px' }}>
            <code style={{ fontSize: '13px' }}>{cleanBaseName(lora.base_name)}</code>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#2e7d32', fontWeight: 500 }}>HIGH:</span>{' '}
              <code>{lora.high_file ? lora.high_file.split('/').pop() : '—'}</code>
            </div>
            <div>
              <span style={{ color: '#1565c0', fontWeight: 500 }}>LOW:</span>{' '}
              <code>{lora.low_file ? lora.low_file.split('/').pop() : '—'}</code>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <TextField
              label="Friendly Name"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="e.g., Realistic Portrait LoRA"
              fullWidth
              variant="outlined"
              size="small"
              helperText="A more readable name to display instead of the technical filename"
            />
          </div>

          <div className="form-group">
            <Box>
              <Typography component="legend" sx={{ fontSize: '14px', mb: 1, color: '#666' }}>
                Rating
              </Typography>
              <Rating
                value={rating}
                onChange={(event, newValue) => {
                  setRating(newValue);
                }}
                size="large"
              />
              <Typography variant="caption" display="block" sx={{ mt: 0.5, color: '#666' }}>
                Rate this LoRA for your own reference
              </Typography>
            </Box>
          </div>

          <div className="form-group">
            <TextField
              label="URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://civitai.com/models/..."
              fullWidth
              variant="outlined"
              size="small"
              helperText="Link to the LoRA's page (CivitAI, HuggingFace, etc.)"
            />
          </div>

          {/* Preview Image Section */}
          <div className="form-group">
            <Typography component="legend" sx={{ fontSize: '14px', mb: 1, color: '#666' }}>
              Preview Image
            </Typography>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{
                width: '100px',
                height: '100px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {previewUrl ? (
                  previewUrl.match(/\.(mp4|webm|mov)$/i) ? (
                    <video
                      src={previewUrl}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                      loop
                      autoPlay
                      playsInline
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999',
                    fontSize: '11px',
                    textAlign: 'center',
                    padding: '8px'
                  }}>
                    No preview
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleFetchPreview}
                  disabled={fetchingPreview || !url?.includes('civitai.com')}
                  sx={{ mb: 1 }}
                >
                  {fetchingPreview ? 'Fetching...' : 'Fetch from CivitAI'}
                </Button>
                <Typography variant="caption" display="block" sx={{ color: '#666' }}>
                  Automatically fetch preview image from CivitAI URL
                </Typography>
              </div>
            </div>
          </div>

          <div className="form-group">
            <TextField
              label="Trigger Keywords"
              value={triggerKeywords}
              onChange={(e) => setTriggerKeywords(e.target.value)}
              placeholder="e.g., anime style, detailed, high quality"
              fullWidth
              variant="outlined"
              size="small"
              helperText="Keywords that activate this LoRA's style"
            />
          </div>

          <div className="form-group">
            <TextField
              label="Prompt Description"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              multiline
              rows={2}
              placeholder="Describe what this LoRA does and how to use it..."
              fullWidth
              variant="outlined"
              helperText="Optional notes about the LoRA's effect and usage"
            />
          </div>

          <div className="modal-actions">
            <Button
              type="button"
              variant="outlined"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
