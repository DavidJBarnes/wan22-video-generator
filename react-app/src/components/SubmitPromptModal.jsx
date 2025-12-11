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
  const [selectedLora, setSelectedLora] = useState(null);
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
      // Sort by friendly name or base name
      loraList.sort((a, b) => {
        const nameA = a.friendly_name || a.base_name;
        const nameB = b.friendly_name || b.base_name;
        return nameA.localeCompare(nameB);
      });
      setLoras(loraList);
    } catch (error) {
      console.error('Failed to load LoRAs:', error);
    }
  }

  // When loras are loaded, find the matching LoRA from default values
  useEffect(() => {
    if (loras.length > 0 && (defaultHighLora || defaultLowLora)) {
      const matchingLora = loras.find(l =>
        l.high_file === defaultHighLora || l.low_file === defaultHighLora ||
        l.high_file === defaultLowLora || l.low_file === defaultLowLora
      );
      if (matchingLora) {
        setSelectedLora(matchingLora);
      }
    }
  }, [loras, defaultHighLora, defaultLowLora]);

  // Auto-populate prompt when LoRA is selected (only if prompt is empty)
  useEffect(() => {
    if (prompt.trim() || !selectedLora) {
      return;
    }

    const parts = [];
    if (selectedLora.prompt_text) {
      parts.push(selectedLora.prompt_text);
    }
    if (selectedLora.trigger_keywords) {
      parts.push(selectedLora.trigger_keywords);
    }

    if (parts.length > 0) {
      setPrompt(parts.join(', '));
    }
  }, [selectedLora]);

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
        selectedLora?.high_file || null,
        selectedLora?.low_file || null
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
            label="LoRA (optional)"
            value={selectedLora}
            onChange={setSelectedLora}
            loras={loras}
          />
          {selectedLora && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#2e7d32', fontWeight: 500 }}>HIGH:</span>{' '}
                {selectedLora.high_file ? selectedLora.high_file.split('/').pop() : <span style={{ color: '#999' }}>Not available</span>}
              </div>
              <div>
                <span style={{ color: '#1565c0', fontWeight: 500 }}>LOW:</span>{' '}
                {selectedLora.low_file ? selectedLora.low_file.split('/').pop() : <span style={{ color: '#999' }}>Not available</span>}
              </div>
            </div>
          )}
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
