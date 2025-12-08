import { useState, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraAutocomplete from './LoraAutocomplete';
import './CreateJobModal.css';

export default function SubmitPromptModal({
  jobId,
  segmentIndex,
  defaultPrompt = '',
  defaultHighLora = '',
  defaultLowLora = '',
  onClose,
  onSuccess
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [highLora, setHighLora] = useState(defaultHighLora);
  const [lowLora, setLowLora] = useState(defaultLowLora);
  const [loras, setLoras] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadLoras();
  }, []);

  async function loadLoras() {
    try {
      // Load from cached library instead of querying ComfyUI directly
      const data = await API.getLoraLibrary();
      const loraList = data.loras || [];
      // Sort by technical name for stable ordering
      loraList.sort((a, b) => a.name.localeCompare(b.name));
      setLoras(loraList);
    } catch (error) {
      console.error('Failed to load LoRAs:', error);
    }
  }

  // Helper function to build prompt text from LoRA metadata
  function buildPromptFromLora(loraName) {
    if (!loraName || !loras.length) return '';

    const lora = loras.find(l => l.name === loraName);
    if (!lora) return '';

    const parts = [];

    if (lora.prompt_text) {
      parts.push(lora.prompt_text);
    }

    if (lora.trigger_keywords) {
      parts.push(lora.trigger_keywords);
    }

    return parts.join(', ');
  }

  // Auto-populate prompt when LoRA is selected (only if prompt is empty)
  useEffect(() => {
    if (prompt.trim()) {
      // Don't overwrite existing prompt
      return;
    }

    // Try high LoRA first, then low LoRA
    const loraToUse = highLora || lowLora;
    if (!loraToUse) return;

    const generatedPrompt = buildPromptFromLora(loraToUse);
    if (generatedPrompt) {
      setPrompt(generatedPrompt);
    }
  }, [highLora, lowLora, loras]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!prompt.trim()) {
      showToast('Please enter a prompt', 'error');
      return;
    }

    setSubmitting(true);

    try {
      await API.submitSegmentPrompt(
        jobId,
        segmentIndex,
        prompt.trim(),
        highLora || null,
        lowLora || null
      );

      showToast('Prompt submitted successfully', 'success');
      onSuccess();
    } catch (error) {
      console.error('Failed to submit prompt:', error);
      showToast('Failed to submit prompt', 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Submit Prompt for Segment {segmentIndex}</h2>

        {defaultPrompt && (
          <div style={{ marginBottom: '16px', padding: '12px', background: '#e3f2fd', borderRadius: '4px', border: '1px solid #90caf9' }}>
            <span style={{ fontSize: '13px', color: '#1976d2' }}>
              ℹ️ Values pre-filled from previous segment. Modify as needed.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              rows={4}
              placeholder="Describe what happens in this segment..."
              autoFocus
              fullWidth
              variant="outlined"
            />
          </div>


        <div className="form-group">
          <LoraAutocomplete
            label="High Noise LoRA (optional)"
            value={highLora}
            onChange={setHighLora}
            loras={loras}
          />
        </div>
        <div className="form-group">
          <LoraAutocomplete
            label="Low Noise LoRA (optional)"
            value={lowLora}
            onChange={setLowLora}
            loras={loras}
          />
        </div>

          <div className="modal-actions">
            <Button
              type="button"
              variant="outlined"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Prompt'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
