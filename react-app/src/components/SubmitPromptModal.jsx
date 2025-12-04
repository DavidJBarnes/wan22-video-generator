import { useState, useEffect } from 'react';
import { Button, TextField } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraAutocomplete from './LoraAutocomplete';
import './CreateJobModal.css';

export default function SubmitPromptModal({ jobId, segmentIndex, onClose, onSuccess }) {
  const [prompt, setPrompt] = useState('');
  const [highLora, setHighLora] = useState('');
  const [lowLora, setLowLora] = useState('');
  const [loras, setLoras] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadLoras();
  }, []);

  async function loadLoras() {
    try {
      const data = await API.getLoras();
      const loraList = data.loras || [];
      setLoras(loraList.sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      console.error('Failed to load LoRAs:', error);
    }
  }

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Submit Prompt for Segment {segmentIndex}</h2>

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

          <div className="form-row">
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
