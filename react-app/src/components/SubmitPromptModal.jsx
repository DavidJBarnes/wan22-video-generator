import { useState, useEffect, useRef } from 'react';
import { Button, TextField, FormControlLabel, Checkbox, FormHelperText, CircularProgress } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraAutocomplete from './LoraAutocomplete';
import './CreateJobModal.css';

export default function SubmitPromptModal({
  jobId,
  segmentIndex,
  defaultPrompt = '',
  defaultLoras = [],  // Array of {high_file, high_weight, low_file, low_weight} pairs
  onClose,
  onSuccess
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  // Two LoRA slots, each with lora object and weights
  const [selectedLoras, setSelectedLoras] = useState([
    { lora: null, highWeight: 1, lowWeight: 1 },
    { lora: null, highWeight: 1, lowWeight: 1 }
  ]);
  const [loras, setLoras] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [autoFinalize, setAutoFinalize] = useState(false);
  const defaultsAppliedRef = useRef(false);

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

  // When loras are loaded, find matching LoRAs from default values (only once)
  useEffect(() => {
    // Only apply defaults once to avoid resetting user changes
    if (defaultsAppliedRef.current) return;
    // Mark as applied immediately to prevent re-runs during async renders
    if (loras.length === 0) return; // Wait for loras to load

    defaultsAppliedRef.current = true;

    if (defaultLoras && defaultLoras.length > 0) {
      const newSelectedLoras = [
        { lora: null, highWeight: 1, lowWeight: 1 },
        { lora: null, highWeight: 1, lowWeight: 1 }
      ];

      defaultLoras.slice(0, 2).forEach((defaultLora, idx) => {
        if (defaultLora && (defaultLora.high_file || defaultLora.low_file)) {
          const matchingLora = loras.find(l =>
            l.high_file === defaultLora.high_file || l.low_file === defaultLora.high_file ||
            l.high_file === defaultLora.low_file || l.low_file === defaultLora.low_file
          );
          if (matchingLora) {
            newSelectedLoras[idx] = {
              lora: matchingLora,
              highWeight: defaultLora.high_weight || 1,
              lowWeight: defaultLora.low_weight || 1
            };
          }
        }
      });

      if (newSelectedLoras[0].lora || newSelectedLoras[1].lora) {
        setSelectedLoras(newSelectedLoras);
      }
    }
  }, [loras, defaultLoras]);

  // Helper to populate prompt from LoRA if prompt is empty
  function populatePromptFromLora(lora) {
    if (prompt.trim() || !lora) return;

    const parts = [];
    if (lora.prompt_text) parts.push(lora.prompt_text);
    if (lora.trigger_keywords) parts.push(lora.trigger_keywords);

    if (parts.length > 0) {
      setPrompt(parts.join(', '));
    }
  }

  // Helper to get prompt text from a LoRA
  function getLoraPromptText(lora) {
    if (!lora) return '';
    const parts = [];
    if (lora.prompt_text) parts.push(lora.prompt_text);
    if (lora.trigger_keywords) parts.push(lora.trigger_keywords);
    return parts.join(', ');
  }

  // Append LoRA prompt text to existing prompt
  function appendLoraPrompt(lora) {
    const loraPrompt = getLoraPromptText(lora);
    if (!loraPrompt) return;

    if (prompt.trim()) {
      setPrompt(prompt.trimEnd() + '\n' + loraPrompt);
    } else {
      setPrompt(loraPrompt);
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
      // Build loras array from selected LoRAs with weights (filter out empty slots)
      const lorasArray = selectedLoras
        .filter(slot => slot.lora && (slot.lora.high_file || slot.lora.low_file))
        .map(slot => ({
          high_file: slot.lora.high_file || null,
          high_weight: slot.highWeight,
          low_file: slot.lora.low_file || null,
          low_weight: slot.lowWeight
        }));

      await API.submitSegmentPrompt(
        jobId,
        segmentIndex,
        prompt.trim(),
        lorasArray,
        autoFinalize
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
              Values pre-filled from previous segment. Modify as needed.
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
            <button
              type="button"
              onClick={() => setPrompt('')}
              disabled={!prompt.trim()}
              style={{
                background: 'none',
                border: 'none',
                color: prompt.trim() ? '#1976d2' : '#ccc',
                cursor: prompt.trim() ? 'pointer' : 'default',
                fontSize: '12px',
                padding: '4px 0',
                textDecoration: 'underline'
              }}
            >
              Clear prompt
            </button>
          </div>

          {/* LoRA 1 */}
          <div className="form-group">
            <label style={{ marginBottom: '8px', display: 'block' }}>LoRA 1 (optional)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <LoraAutocomplete
                  label=""
                  value={selectedLoras[0].lora}
                  onChange={(lora) => {
                    setSelectedLoras(prev => [
                      {
                        lora,
                        highWeight: lora?.default_high_weight ?? 1,
                        lowWeight: lora?.default_low_weight ?? 1
                      },
                      prev[1]
                    ]);
                    populatePromptFromLora(lora);
                  }}
                  loras={loras}
                />
                <button
                  type="button"
                  onClick={() => appendLoraPrompt(selectedLoras[0].lora)}
                  disabled={!selectedLoras[0].lora || !getLoraPromptText(selectedLoras[0].lora)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: selectedLoras[0].lora && getLoraPromptText(selectedLoras[0].lora) ? '#1976d2' : '#ccc',
                    cursor: selectedLoras[0].lora && getLoraPromptText(selectedLoras[0].lora) ? 'pointer' : 'default',
                    fontSize: '12px',
                    padding: '4px 0',
                    textDecoration: 'underline'
                  }}
                >
                  + Add prompt
                </button>
              </div>
              <TextField
                type="number"
                label="High"
                size="small"
                value={selectedLoras[0].highWeight}
                onChange={(e) => setSelectedLoras(prev => [
                  { ...prev[0], highWeight: parseFloat(e.target.value) || 0 },
                  prev[1]
                ])}
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                sx={{ width: '80px' }}
                disabled={!selectedLoras[0].lora}
              />
              <TextField
                type="number"
                label="Low"
                size="small"
                value={selectedLoras[0].lowWeight}
                onChange={(e) => setSelectedLoras(prev => [
                  { ...prev[0], lowWeight: parseFloat(e.target.value) || 0 },
                  prev[1]
                ])}
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                sx={{ width: '80px' }}
                disabled={!selectedLoras[0].lora}
              />
            </div>
          </div>

          {/* LoRA 2 */}
          <div className="form-group">
            <label style={{ marginBottom: '8px', display: 'block' }}>LoRA 2 (optional)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <LoraAutocomplete
                  label=""
                  value={selectedLoras[1].lora}
                  onChange={(lora) => setSelectedLoras(prev => [
                    prev[0],
                    {
                      lora,
                      highWeight: lora?.default_high_weight ?? 1,
                      lowWeight: lora?.default_low_weight ?? 1
                    }
                  ])}
                  loras={loras}
                />
                <button
                  type="button"
                  onClick={() => appendLoraPrompt(selectedLoras[1].lora)}
                  disabled={!selectedLoras[1].lora || !getLoraPromptText(selectedLoras[1].lora)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: selectedLoras[1].lora && getLoraPromptText(selectedLoras[1].lora) ? '#1976d2' : '#ccc',
                    cursor: selectedLoras[1].lora && getLoraPromptText(selectedLoras[1].lora) ? 'pointer' : 'default',
                    fontSize: '12px',
                    padding: '4px 0',
                    textDecoration: 'underline'
                  }}
                >
                  + Add prompt
                </button>
              </div>
              <TextField
                type="number"
                label="High"
                size="small"
                value={selectedLoras[1].highWeight}
                onChange={(e) => setSelectedLoras(prev => [
                  prev[0],
                  { ...prev[1], highWeight: parseFloat(e.target.value) || 0 }
                ])}
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                sx={{ width: '80px' }}
                disabled={!selectedLoras[1].lora}
              />
              <TextField
                type="number"
                label="Low"
                size="small"
                value={selectedLoras[1].lowWeight}
                onChange={(e) => setSelectedLoras(prev => [
                  prev[0],
                  { ...prev[1], lowWeight: parseFloat(e.target.value) || 0 }
                ])}
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                sx={{ width: '80px' }}
                disabled={!selectedLoras[1].lora}
              />
            </div>
          </div>

          {/* Auto Finalize */}
          <div className="form-group">
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoFinalize}
                  onChange={(e) => setAutoFinalize(e.target.checked)}
                />
              }
              label="Auto-finalize after this segment"
            />
            <FormHelperText sx={{ ml: 4, mt: -1 }}>
              Automatically merge and finalize video when segment completes
            </FormHelperText>
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
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'Submit Prompt'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
