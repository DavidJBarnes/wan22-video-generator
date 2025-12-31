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
  defaultLoras = [],  // Array of {high_file, low_file} pairs
  onClose,
  onSuccess
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [selectedLoras, setSelectedLoras] = useState([null, null]);  // Two LoRA slots
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

  // When loras are loaded, find matching LoRAs from default values
  useEffect(() => {
    if (loras.length > 0 && defaultLoras && defaultLoras.length > 0) {
      const newSelectedLoras = [null, null];

      defaultLoras.slice(0, 2).forEach((defaultLora, idx) => {
        if (defaultLora && (defaultLora.high_file || defaultLora.low_file)) {
          const matchingLora = loras.find(l =>
            l.high_file === defaultLora.high_file || l.low_file === defaultLora.high_file ||
            l.high_file === defaultLora.low_file || l.low_file === defaultLora.low_file
          );
          if (matchingLora) {
            newSelectedLoras[idx] = matchingLora;
          }
        }
      });

      if (newSelectedLoras[0] || newSelectedLoras[1]) {
        setSelectedLoras(newSelectedLoras);
      }
    }
  }, [loras, defaultLoras]);

  // Auto-populate prompt when first LoRA is selected (only if prompt is empty)
  useEffect(() => {
    const firstLora = selectedLoras[0];
    if (prompt.trim() || !firstLora) {
      return;
    }

    const parts = [];
    if (firstLora.prompt_text) {
      parts.push(firstLora.prompt_text);
    }
    if (firstLora.trigger_keywords) {
      parts.push(firstLora.trigger_keywords);
    }

    if (parts.length > 0) {
      setPrompt(parts.join(', '));
    }
  }, [selectedLoras]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!prompt.trim()) {
      showToast('Please enter a prompt', 'error');
      return;
    }

    setSubmitting(true);

    try {
      // Build loras array from selected LoRAs (filter out empty slots)
      const lorasArray = selectedLoras
        .filter(lora => lora && (lora.high_file || lora.low_file))
        .map(lora => ({
          high_file: lora.high_file || null,
          low_file: lora.low_file || null
        }));

      await API.submitSegmentPrompt(
        jobId,
        segmentIndex,
        prompt.trim(),
        lorasArray
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
            label="LoRA 1 (optional)"
            value={selectedLoras[0]}
            onChange={(lora) => setSelectedLoras([lora, selectedLoras[1]])}
            loras={loras}
          />
          {selectedLoras[0] && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#2e7d32', fontWeight: 500 }}>HIGH:</span>{' '}
                {selectedLoras[0].high_file ? selectedLoras[0].high_file.split('/').pop() : <span style={{ color: '#999' }}>Not available</span>}
              </div>
              <div>
                <span style={{ color: '#1565c0', fontWeight: 500 }}>LOW:</span>{' '}
                {selectedLoras[0].low_file ? selectedLoras[0].low_file.split('/').pop() : <span style={{ color: '#999' }}>Not available</span>}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <LoraAutocomplete
            label="LoRA 2 (optional)"
            value={selectedLoras[1]}
            onChange={(lora) => setSelectedLoras([selectedLoras[0], lora])}
            loras={loras}
          />
          {selectedLoras[1] && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#2e7d32', fontWeight: 500 }}>HIGH:</span>{' '}
                {selectedLoras[1].high_file ? selectedLoras[1].high_file.split('/').pop() : <span style={{ color: '#999' }}>Not available</span>}
              </div>
              <div>
                <span style={{ color: '#1565c0', fontWeight: 500 }}>LOW:</span>{' '}
                {selectedLoras[1].low_file ? selectedLoras[1].low_file.split('/').pop() : <span style={{ color: '#999' }}>Not available</span>}
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
