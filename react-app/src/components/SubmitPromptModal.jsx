import { useState, useEffect, useRef } from 'react';
import { Button, TextField, FormControlLabel, Checkbox, FormHelperText, CircularProgress, FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import { useLoras } from '../contexts/LoraContext';
import LoraAutocomplete from './LoraAutocomplete';
import ImageRepoBrowserModal from './ImageRepoBrowserModal';
import './CreateJobModal.css';

// Available face swap images (in ComfyUI input folder)
// Configure these values to match your local face image files
const FACESWAP_FACES = [
  { value: 'Andrea_all.safetensors.png', label: 'Andrea' },
  { value: 'Chelsea_all.safetensors.png', label: 'Chelsea' },
  { value: 'gena.safetensors.png', label: 'Gena' },
  { value: 'Kelly__all.safetensors.png', label: 'Kelly (All)' },
  { value: 'Kelly_young.safetensors.png', label: 'Kelly (Young)' },
  { value: 'Kelly_teacher1.safetensors.png', label: 'Kelly (teacher1)' },
  { value: 'Kelly_20251124.safetensors.png', label: 'Kelly (2025)' },
  { value: 'Kerry_all.safetensors.png', label: 'Kerry' },
  { value: 'Me.safetensors.png', label: 'Me' },
  { value: 'Udycz_all.safetensors.png', label: 'Udycz' },
];

export default function SubmitPromptModal({
  jobId,
  segmentIndex,
  defaultPrompt = '',
  defaultLoras = [],  // Array of {high_file, high_weight, low_file, low_weight} pairs
  defaultFaceswap = null,  // {enabled, image, facesOrder, facesIndex} from previous segment or job
  defaultStartImageUrl = null,  // URL of previous segment's end frame (for display)
  defaultCustomStartImage = null,  // Path of custom start image if already set
  isEditing = false,  // Whether editing an existing segment
  onClose,
  onSuccess
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  // Three LoRA slots, each with lora object and weights
  const [selectedLoras, setSelectedLoras] = useState([
    { lora: null, highWeight: 1, lowWeight: 1 },
    { lora: null, highWeight: 1, lowWeight: 1 },
    { lora: null, highWeight: 1, lowWeight: 1 }
  ]);
  // Use cached LoRAs from context instead of fetching on every mount
  const { loras } = useLoras();
  const [submitting, setSubmitting] = useState(false);
  const [autoFinalize, setAutoFinalize] = useState(false);
  const defaultsAppliedRef = useRef(false);

  // Faceswap state (initialized from defaults)
  const [faceswapEnabled, setFaceswapEnabled] = useState(defaultFaceswap?.enabled || false);
  const [faceswapImage, setFaceswapImage] = useState(defaultFaceswap?.image || FACESWAP_FACES[0]?.value || '');
  const [faceswapFacesOrder, setFaceswapFacesOrder] = useState(defaultFaceswap?.facesOrder || 'left-right');
  const [faceswapFacesIndex, setFaceswapFacesIndex] = useState(defaultFaceswap?.facesIndex || '0');

  // Custom start image state (only for segments > 0)
  const [customStartImage, setCustomStartImage] = useState(defaultCustomStartImage);  // Path in image repo
  const [showImageBrowser, setShowImageBrowser] = useState(false);

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
        { lora: null, highWeight: 1, lowWeight: 1 },
        { lora: null, highWeight: 1, lowWeight: 1 }
      ];

      defaultLoras.slice(0, 3).forEach((defaultLora, idx) => {
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

      if (newSelectedLoras[0].lora || newSelectedLoras[1].lora || newSelectedLoras[2].lora) {
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

      // Build faceswap options
      const faceswapOptions = {
        enabled: faceswapEnabled,
        image: faceswapEnabled ? faceswapImage : '',
        facesOrder: faceswapEnabled ? faceswapFacesOrder : 'left-right',
        facesIndex: faceswapEnabled ? faceswapFacesIndex : '0'
      };

      await API.submitSegmentPrompt(
        jobId,
        segmentIndex,
        prompt.trim(),
        lorasArray,
        isEditing ? false : autoFinalize,  // Don't change auto-finalize when editing
        faceswapOptions,
        false,  // fadeToBlack - not used here
        customStartImage  // Custom start image path (or null for default)
      );

      showToast(isEditing ? 'Segment updated successfully' : 'Prompt submitted successfully', 'success');
      onSuccess();
    } catch (error) {
      console.error('Failed to submit prompt:', error);
      showToast('Failed to submit prompt', 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal-content" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{isEditing ? `Edit Segment ${segmentIndex + 1}` : `Submit Prompt for Segment ${segmentIndex}`}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Start Image Selection (only for segments > 0) */}
        {segmentIndex > 0 && defaultStartImageUrl && (
          <div style={{ marginBottom: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: '#666' }}>Start Image</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <img
                src={customStartImage ? API.getRepoImage(customStartImage) : defaultStartImageUrl}
                alt="Start frame"
                style={{
                  width: '120px',
                  height: '80px',
                  objectFit: 'cover',
                  borderRadius: '4px',
                  border: customStartImage ? '2px solid #1976d2' : '1px solid #ddd'
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: customStartImage ? '#1976d2' : '#666', marginBottom: '4px' }}>
                  {customStartImage ? 'Custom image selected' : 'Using previous segment\'s last frame'}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowImageBrowser(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1976d2',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    {customStartImage ? 'Change image' : 'Choose different image'}
                  </button>
                  {customStartImage && (
                    <Tooltip title="Revert to previous segment's last frame">
                      <IconButton
                        size="small"
                        onClick={() => setCustomStartImage(null)}
                        sx={{ padding: '2px' }}
                      >
                        <RestoreIcon sx={{ fontSize: 18, color: '#666' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


          <div className="form-group">
            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              rows={2}
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

          {/* LoRAs - 3 columns */}
          <div className="lora-grid">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="lora-slot">
                <div className="lora-slot-header">LoRA {idx + 1} (optional)</div>
                <LoraAutocomplete
                  label=""
                  value={selectedLoras[idx].lora}
                  onChange={(lora) => {
                    const newLoras = [...selectedLoras];
                    newLoras[idx] = {
                      lora,
                      highWeight: lora?.default_high_weight ?? 1,
                      lowWeight: lora?.default_low_weight ?? 1
                    };
                    setSelectedLoras(newLoras);
                    if (idx === 0) populatePromptFromLora(lora);
                  }}
                  loras={loras}
                />
                <div className="lora-weights">
                  <TextField
                    type="number"
                    label="High"
                    size="small"
                    value={selectedLoras[idx].highWeight}
                    onChange={(e) => {
                      const newLoras = [...selectedLoras];
                      newLoras[idx] = { ...newLoras[idx], highWeight: parseFloat(e.target.value) || 0 };
                      setSelectedLoras(newLoras);
                    }}
                    inputProps={{ min: 0, max: 2, step: 0.1 }}
                    disabled={!selectedLoras[idx].lora}
                  />
                  <TextField
                    type="number"
                    label="Low"
                    size="small"
                    value={selectedLoras[idx].lowWeight}
                    onChange={(e) => {
                      const newLoras = [...selectedLoras];
                      newLoras[idx] = { ...newLoras[idx], lowWeight: parseFloat(e.target.value) || 0 };
                      setSelectedLoras(newLoras);
                    }}
                    inputProps={{ min: 0, max: 2, step: 0.1 }}
                    disabled={!selectedLoras[idx].lora}
                  />
                </div>
                {selectedLoras[idx].lora && getLoraPromptText(selectedLoras[idx].lora) && (
                  <button
                    type="button"
                    onClick={() => appendLoraPrompt(selectedLoras[idx].lora)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1976d2',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '4px 0 0 0',
                      textDecoration: 'underline'
                    }}
                  >
                    + Add prompt
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Face Swap */}
          <div className="form-group" style={{
            marginTop: '16px',
            padding: '12px',
            background: '#f5f5f5',
            borderRadius: '8px',
            border: '1px solid #e0e0e0'
          }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={faceswapEnabled}
                  onChange={(e) => setFaceswapEnabled(e.target.checked)}
                />
              }
              label={<span style={{ fontWeight: 500 }}>Enable Face Swap (ReActor)</span>}
            />
            {faceswapEnabled && (
              <>
                <FormControl fullWidth variant="outlined" size="small" sx={{ mt: 1 }}>
                  <InputLabel>Face</InputLabel>
                  <Select
                    value={faceswapImage}
                    onChange={(e) => setFaceswapImage(e.target.value)}
                    label="Face"
                  >
                    {FACESWAP_FACES.map((face) => (
                      <MenuItem key={face.value} value={face.value}>
                        {face.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <FormControl variant="outlined" size="small" sx={{ flex: 1 }}>
                    <InputLabel>Faces Order</InputLabel>
                    <Select
                      value={faceswapFacesOrder}
                      onChange={(e) => setFaceswapFacesOrder(e.target.value)}
                      label="Faces Order"
                    >
                      <MenuItem value="left-right">Left to Right</MenuItem>
                      <MenuItem value="right-left">Right to Left</MenuItem>
                      <MenuItem value="top-bottom">Top to Bottom</MenuItem>
                      <MenuItem value="bottom-top">Bottom to Top</MenuItem>
                      <MenuItem value="small-large">Small to Large</MenuItem>
                      <MenuItem value="large-small">Large to Small</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="Faces Index"
                    value={faceswapFacesIndex}
                    onChange={(e) => setFaceswapFacesIndex(e.target.value)}
                    variant="outlined"
                    size="small"
                    sx={{ width: '120px' }}
                    helperText="e.g. 0 or 0,1"
                  />
                </div>
              </>
            )}
          </div>

          {/* Auto Finalize - hide when editing existing segment */}
          {!isEditing && (
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
          )}

        </div>

        <div className="modal-footer">
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : (isEditing ? 'Save Changes' : 'Submit Prompt')}
          </Button>
        </div>
      </form>

      {/* Image Browser Modal for custom start image selection */}
      {showImageBrowser && (
        <ImageRepoBrowserModal
          onSelect={(imagePath) => {
            setCustomStartImage(imagePath);
            setShowImageBrowser(false);
          }}
          onClose={() => setShowImageBrowser(false)}
        />
      )}
    </div>
  );
}
