import { useState } from 'react';
import { Button, TextField, Rating, Box, Typography } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './CreateJobModal.css';

export default function LoraEditModal({ lora, onClose, onSave }) {
  const [friendlyName, setFriendlyName] = useState(lora.friendly_name || '');
  const [url, setUrl] = useState(lora.url || '');
  const [promptText, setPromptText] = useState(lora.prompt_text || '');
  const [triggerKeywords, setTriggerKeywords] = useState(lora.trigger_keywords || '');
  const [rating, setRating] = useState(lora.rating || null);
  const [saving, setSaving] = useState(false);

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
          <strong style={{ fontSize: '12px', color: '#666' }}>Technical Name:</strong>
          <div style={{ marginTop: '4px' }}>
            <code style={{ fontSize: '13px' }}>{lora.name}</code>
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
              rows={4}
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
