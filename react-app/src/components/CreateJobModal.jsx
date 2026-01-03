import { useState, useEffect } from 'react';
import { Button, TextField, Select, MenuItem, FormControl, InputLabel, FormHelperText, Autocomplete, FormControlLabel, Checkbox, CircularProgress } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraAutocomplete from './LoraAutocomplete';
import './CreateJobModal.css';

// Available face swap images (in ComfyUI input folder)
// Configure these values to match your local face image files
const FACESWAP_FACES = [
  { value: 'Andrea_all.safetensors.png', label: 'Andrea' },
  { value: 'Chelsea_all.safetensors.png', label: 'Chelsea' },
  { value: 'gena.safetensors.png', label: 'Gena' },
  { value: 'Kelly__all.safetensors.png', label: 'Kelly (All)' },
  { value: 'Kelly_young.safetensors.png', label: 'Kelly (Young)' },
  { value: 'Kelly_20251124.safetensors.png', label: 'Kelly (2025)' },
  { value: 'Kerry_all.safetensors.png', label: 'Kerry' },
  { value: 'Me.safetensors.png', label: 'Me' },
  { value: 'Udycz_all.safetensors.png', label: 'Udycz' },
];

export default function CreateJobModal({ onClose, onSuccess, preUploadedImageUrl = null, preUploadedDimensions = null, cloneData = null }) {
  const [settings, setSettings] = useState({});
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(640);
  const [fps, setFps] = useState(16);
  const [segmentDuration, setSegmentDuration] = useState(5);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  // Two LoRA slots, each with lora object and weights
  const [selectedLoras, setSelectedLoras] = useState([
    { lora: null, highWeight: 1, lowWeight: 1 },
    { lora: null, highWeight: 1, lowWeight: 1 }
  ]);
  const [loras, setLoras] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [namePrefixes, setNamePrefixes] = useState([]);
  const [nameDescriptions, setNameDescriptions] = useState([]);
  const [faceswapEnabled, setFaceswapEnabled] = useState(false);
  const [faceswapImage, setFaceswapImage] = useState(FACESWAP_FACES[0]?.value || '');
  const [faceswapFacesOrder, setFaceswapFacesOrder] = useState('left-right');
  const [faceswapFacesIndex, setFaceswapFacesIndex] = useState('0');
  const [selectedPrefix, setSelectedPrefix] = useState(null);
  const [selectedDescription, setSelectedDescription] = useState(null);
  const [autoFinalize, setAutoFinalize] = useState(false);

  useEffect(() => {
    async function initialize() {
      // Load settings first, then override with specific dimensions if provided
      await loadSettings();
      loadLoras();

      if (preUploadedImageUrl) {
        setImagePreview(API.getComfyUIImage(preUploadedImageUrl));
        // Set dimensions based on image aspect ratio if provided
        // This must run AFTER loadSettings to override the defaults
        console.log('[CreateJobModal] preUploadedDimensions:', preUploadedDimensions);
        if (preUploadedDimensions) {
          console.log('[CreateJobModal] Setting width:', preUploadedDimensions.width, 'height:', preUploadedDimensions.height);
          setWidth(preUploadedDimensions.width);
          setHeight(preUploadedDimensions.height);
        }
      }

      // Pre-populate form if cloning
      if (cloneData) {
        setName(cloneData.name ? `${cloneData.name} (Copy)` : '');
        setPrompt(cloneData.prompt || '');
        setWidth(cloneData.width || cloneData.parameters?.width || 640);
        setHeight(cloneData.height || cloneData.parameters?.height || 640);
        setFps(cloneData.fps || cloneData.parameters?.fps || 16);
        setSegmentDuration(cloneData.segment_duration || cloneData.parameters?.segment_duration || 5);

        // Set the input image if available - use thumbnail endpoint for proper URL
        if (cloneData.input_image && cloneData.id) {
          setImagePreview(API.getJobThumbnail(cloneData.id));
        }
      }
    }
    initialize();
  }, [preUploadedImageUrl, preUploadedDimensions, cloneData]);

  // When loras are loaded and we have cloneData, find matching LoRAs
  useEffect(() => {
    if (cloneData && loras.length > 0) {
      // Parse high_lora - could be JSON array of objects/strings or single string
      let highLoraData = [];
      const rawHighLora = cloneData.high_lora || cloneData.parameters?.high_lora;
      if (rawHighLora) {
        if (typeof rawHighLora === 'string' && rawHighLora.startsWith('[')) {
          try {
            highLoraData = JSON.parse(rawHighLora);
          } catch (e) {
            highLoraData = [{ file: rawHighLora, weight: 1 }];
          }
        } else if (Array.isArray(rawHighLora)) {
          highLoraData = rawHighLora;
        } else {
          highLoraData = [{ file: rawHighLora, weight: 1 }];
        }
      }

      // Parse low_lora similarly for weights
      let lowLoraData = [];
      const rawLowLora = cloneData.low_lora || cloneData.parameters?.low_lora;
      if (rawLowLora) {
        if (typeof rawLowLora === 'string' && rawLowLora.startsWith('[')) {
          try {
            lowLoraData = JSON.parse(rawLowLora);
          } catch (e) {
            lowLoraData = [{ file: rawLowLora, weight: 1 }];
          }
        } else if (Array.isArray(rawLowLora)) {
          lowLoraData = rawLowLora;
        } else {
          lowLoraData = [{ file: rawLowLora, weight: 1 }];
        }
      }

      // Find matching LoRAs for each slot with weights
      const newSelectedLoras = [
        { lora: null, highWeight: 1, lowWeight: 1 },
        { lora: null, highWeight: 1, lowWeight: 1 }
      ];

      for (let idx = 0; idx < 2; idx++) {
        const highData = highLoraData[idx];
        const lowData = lowLoraData[idx];

        // Get file from either new format (object) or old format (string)
        const highFile = highData ? (typeof highData === 'string' ? highData : highData.file) : null;
        const highWeight = highData ? (typeof highData === 'object' ? highData.weight : 1) : 1;
        const lowWeight = lowData ? (typeof lowData === 'object' ? lowData.weight : 1) : 1;

        if (highFile) {
          const matchingLora = loras.find(l => l.high_file === highFile || l.low_file === highFile);
          if (matchingLora) {
            newSelectedLoras[idx] = {
              lora: matchingLora,
              highWeight: highWeight || 1,
              lowWeight: lowWeight || 1
            };
          }
        }
      }

      if (newSelectedLoras[0].lora || newSelectedLoras[1].lora) {
        setSelectedLoras(newSelectedLoras);
      }
    }
  }, [cloneData, loras]);

  async function loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings || data;
      setSettings(s);
      setWidth(parseInt(s.default_width) || 640);
      setHeight(parseInt(s.default_height) || 640);
      setFps(parseInt(s.default_fps) || 16);

      // Parse job naming presets
      try {
        const prefixes = JSON.parse(s.job_name_prefixes || '[]');
        const sortedPrefixes = Array.isArray(prefixes) ? [...prefixes].sort((a, b) => a.localeCompare(b)) : [];
        setNamePrefixes(sortedPrefixes);
      } catch { setNamePrefixes([]); }
      try {
        const descriptions = JSON.parse(s.job_name_descriptions || '[]');
        const sortedDescriptions = Array.isArray(descriptions) ? [...descriptions].sort((a, b) => a.localeCompare(b)) : [];
        setNameDescriptions(sortedDescriptions);
      } catch { setNameDescriptions([]); }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

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

  // Auto-populate prompt when first LoRA is selected (only if prompt is empty)
  useEffect(() => {
    const firstLora = selectedLoras[0].lora;
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

  // Auto-build job name from prefix + description
  useEffect(() => {
    if (cloneData) return; // Don't override cloned job names
    if (!selectedPrefix && !selectedDescription) return;

    const parts = [];
    if (selectedPrefix) parts.push(selectedPrefix);
    if (selectedDescription) parts.push(selectedDescription);
    setName(parts.join('-'));
  }, [selectedPrefix, selectedDescription]);

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Please enter a job name', 'error');
      return;
    }

    if (!prompt.trim()) {
      showToast('Please enter a prompt', 'error');
      return;
    }

    // Check if we have an image (from upload, pre-uploaded, or cloned job)
    const hasImage = preUploadedImageUrl || imageFile || (cloneData && cloneData.input_image);
    if (!hasImage) {
      showToast('Please select a start image', 'error');
      return;
    }

    setUploading(true);

    try {
      let imageFilename;

      if (preUploadedImageUrl) {
        imageFilename = preUploadedImageUrl;
      } else if (cloneData && cloneData.input_image && !imageFile) {
        // Use the cloned job's input image if no new image was selected
        imageFilename = cloneData.input_image;
      } else {
        showToast('Uploading image...', 'info');
        const uploadResult = await API.uploadImage(imageFile);
        if (!uploadResult || !uploadResult.filename) {
          showToast('Failed to upload image', 'error');
          setUploading(false);
          return;
        }
        imageFilename = uploadResult.filename;
      }

      // Build loras array from selected LoRAs with weights (filter out empty slots)
      const lorasArray = selectedLoras
        .filter(slot => slot.lora && (slot.lora.high_file || slot.lora.low_file))
        .map(slot => ({
          high_file: slot.lora.high_file || null,
          high_weight: slot.highWeight,
          low_file: slot.lora.low_file || null,
          low_weight: slot.lowWeight
        }));

      const jobData = {
        name: name.trim(),
        prompt: prompt.trim(),
        workflow_type: 'i2v',
        negative_prompt: settings.default_negative_prompt || '',
        input_image: imageFilename,
        loras: lorasArray.length > 0 ? lorasArray : null,
        parameters: {
          width,
          height,
          fps,
          segment_duration: segmentDuration,
          faceswap_enabled: faceswapEnabled,
          faceswap_image: faceswapEnabled ? faceswapImage : null,
          faceswap_faces_order: faceswapEnabled ? faceswapFacesOrder : null,
          faceswap_faces_index: faceswapEnabled ? faceswapFacesIndex : null,
          auto_finalize: autoFinalize
        }
      };

      const newJob = await API.createJob(jobData);
      showToast('Job created successfully', 'success');
      setUploading(false);
      onSuccess(newJob.id);
    } catch (error) {
      console.error('Failed to create job:', error);
      showToast('Failed to create job', 'error');
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{cloneData ? 'Clone Job' : 'Create New Video Job'}</h2>

        <form onSubmit={handleSubmit}>
          {(namePrefixes.length > 0 || nameDescriptions.length > 0) && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <Autocomplete
                size="small"
                options={namePrefixes}
                value={selectedPrefix}
                onChange={(e, newValue) => setSelectedPrefix(newValue)}
                freeSolo
                sx={{ flex: 1 }}
                renderInput={(params) => (
                  <TextField {...params} label="Prefix" placeholder="Select or type..." variant="outlined" />
                )}
              />
              <Autocomplete
                size="small"
                options={nameDescriptions}
                value={selectedDescription}
                onChange={(e, newValue) => setSelectedDescription(newValue)}
                freeSolo
                sx={{ flex: 2 }}
                renderInput={(params) => (
                  <TextField {...params} label="Description" placeholder="Select or type..." variant="outlined" />
                )}
              />
            </div>
          )}
          <div className="form-group">
            <TextField
              label="Job Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Video Job"
              fullWidth
              variant="outlined"
              size="small"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="Width"
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value))}
                fullWidth
                variant="outlined"
                size="small"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const temp = width;
                setWidth(height);
                setHeight(temp);
              }}
              style={{
                background: 'none',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '2px 5px',
                fontSize: '12px',
                color: '#666',
                lineHeight: 1
              }}
              title="Swap width and height"
            >
              ↔
            </button>
            <div style={{ flex: 1 }}>
              <TextField
                label="Height"
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value))}
                fullWidth
                variant="outlined"
                size="small"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <FormControl fullWidth variant="outlined" size="small">
                <InputLabel>Segment Duration</InputLabel>
                <Select
                  value={segmentDuration}
                  onChange={(e) => setSegmentDuration(parseInt(e.target.value))}
                  label="Segment Duration"
                >
                  <MenuItem value={3}>3 seconds</MenuItem>
                  <MenuItem value={4}>4 seconds</MenuItem>
                  <MenuItem value={5}>5 seconds</MenuItem>
                  <MenuItem value={8}>8 seconds</MenuItem>
                  <MenuItem value={10}>10 seconds</MenuItem>
                </Select>
              </FormControl>
            </div>
            <div className="form-group">
              <FormControl fullWidth variant="outlined" size="small">
                <InputLabel>FPS</InputLabel>
                <Select
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                  label="FPS"
                >
                  <MenuItem value={8}>8 fps</MenuItem>
                  <MenuItem value={12}>12 fps</MenuItem>
                  <MenuItem value={16}>16 fps</MenuItem>
                  <MenuItem value={20}>20 fps</MenuItem>
                  <MenuItem value={24}>24 fps</MenuItem>
                </Select>
              </FormControl>
            </div>
          </div>

          <div className="form-group">
            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              height={"100px"}
              placeholder="Describe the video scene and action..."
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

          <div className="form-group">
            <label>Start Image</label>
            {!preUploadedImageUrl && !imagePreview && (
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
            )}
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Preview" />
                {preUploadedImageUrl && (
                  <small>Image from repository: {preUploadedImageUrl}</small>
                )}
                {!preUploadedImageUrl && imageFile && (
                  <small>{imageFile.name}</small>
                )}
              </div>
            )}
          </div>

          {/* LoRA 1 */}
          <div className="form-group">
            <label style={{ marginBottom: '8px', display: 'block' }}>LoRA 1 (optional)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <LoraAutocomplete
                  label=""
                  value={selectedLoras[0].lora}
                  onChange={(lora) => setSelectedLoras([
                    {
                      lora,
                      highWeight: lora?.default_high_weight ?? 1,
                      lowWeight: lora?.default_low_weight ?? 1
                    },
                    selectedLoras[1]
                  ])}
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
                onChange={(e) => setSelectedLoras([
                  { ...selectedLoras[0], highWeight: parseFloat(e.target.value) || 0 },
                  selectedLoras[1]
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
                onChange={(e) => setSelectedLoras([
                  { ...selectedLoras[0], lowWeight: parseFloat(e.target.value) || 0 },
                  selectedLoras[1]
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
                  onChange={(lora) => setSelectedLoras([
                    selectedLoras[0],
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
                onChange={(e) => setSelectedLoras([
                  selectedLoras[0],
                  { ...selectedLoras[1], highWeight: parseFloat(e.target.value) || 0 }
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
                onChange={(e) => setSelectedLoras([
                  selectedLoras[0],
                  { ...selectedLoras[1], lowWeight: parseFloat(e.target.value) || 0 }
                ])}
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                sx={{ width: '80px' }}
                disabled={!selectedLoras[1].lora}
              />
            </div>
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

          {/* Auto Finalize */}
          <div className="form-group">
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoFinalize}
                  onChange={(e) => setAutoFinalize(e.target.checked)}
                />
              }
              label="Auto-finalize after first segment"
            />
            <FormHelperText sx={{ ml: 4, mt: -1 }}>
              Automatically merge and finalize video when segment completes
            </FormHelperText>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="outlined" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={uploading}>
              {uploading ? <CircularProgress size={20} color="inherit" /> : 'Create Job'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
