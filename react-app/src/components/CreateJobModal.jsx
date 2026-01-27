import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, TextField, Select, MenuItem, FormControl, InputLabel, FormHelperText, Autocomplete, FormControlLabel, Checkbox, CircularProgress } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import { useLoras } from '../contexts/LoraContext';
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
  { value: 'Kelly_teacher1.safetensors.png', label: 'Kelly (teacher1)' },
  { value: 'Kelly_20251124.safetensors.png', label: 'Kelly (2025)' },
  { value: 'Kerry_all.safetensors.png', label: 'Kerry' },
  { value: 'Me.safetensors.png', label: 'Me' },
  { value: 'Udycz_all.safetensors.png', label: 'Udycz' },
];

export default function CreateJobModal({ onClose, onSuccess, preUploadedImageUrl = null, preUploadedDimensions = null, cloneData = null }) {
  // Use cached LoRAs from context instead of fetching on every mount
  const { loras } = useLoras();

  const [settings, setSettings] = useState({});
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(640);
  const [targetFps, setTargetFps] = useState(30);
  const [segmentDuration, setSegmentDuration] = useState(5);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  // Three LoRA slots, each with lora object and weights
  const [selectedLoras, setSelectedLoras] = useState([
    { lora: null, highWeight: 1, lowWeight: 1 },
    { lora: null, highWeight: 1, lowWeight: 1 },
    { lora: null, highWeight: 1, lowWeight: 1 }
  ]);
  const [uploading, setUploading] = useState(false);
  const [namePrefixes, setNamePrefixes] = useState([]);
  const [nameDescriptions, setNameDescriptions] = useState([]);
  const [faceswapEnabled, setFaceswapEnabled] = useState(false);
  const [faceswapImage, setFaceswapImage] = useState(FACESWAP_FACES[0]?.value || '');
  const [faceswapFacesOrder, setFaceswapFacesOrder] = useState('left-right');
  const [faceswapFacesIndex, setFaceswapFacesIndex] = useState('0');
  const [faceswapSourceType, setFaceswapSourceType] = useState('preset');  // 'preset' or 'frame'
  const [selectedPrefix, setSelectedPrefix] = useState(null);
  const [selectedDescription, setSelectedDescription] = useState(null);
  const [autoFinalize, setAutoFinalize] = useState(false);

  // Round to nearest multiple of 8 (required by ComfyUI/Wan2.2)
  const roundTo8 = (n) => Math.round(n / 8) * 8;

  useEffect(() => {
    console.log('[CreateJobModal] useEffect running with:', { preUploadedImageUrl, preUploadedDimensions, cloneData });
    async function initialize() {
      // Load settings first, then override with specific dimensions if provided
      console.log('[CreateJobModal] Calling loadSettings...');
      await loadSettings();
      console.log('[CreateJobModal] loadSettings completed');

      if (preUploadedImageUrl) {
        setImagePreview(API.getComfyUIImage(preUploadedImageUrl));
        // Set dimensions based on image aspect ratio if provided
        // This must run AFTER loadSettings to override the defaults
        console.log('[CreateJobModal] preUploadedDimensions:', preUploadedDimensions);
        if (preUploadedDimensions) {
          const roundedWidth = roundTo8(preUploadedDimensions.width);
          const roundedHeight = roundTo8(preUploadedDimensions.height);
          console.log('[CreateJobModal] Setting width:', roundedWidth, 'height:', roundedHeight, '(rounded from', preUploadedDimensions.width, 'x', preUploadedDimensions.height, ')');
          setWidth(roundedWidth);
          setHeight(roundedHeight);
        }
      }

      // Pre-populate form if cloning
      if (cloneData) {
        setName(cloneData.name ? `${cloneData.name} (Copy)` : '');
        setPrompt(cloneData.prompt || '');
        setWidth(cloneData.width || cloneData.parameters?.width || 640);
        setHeight(cloneData.height || cloneData.parameters?.height || 640);
        setSegmentDuration(cloneData.segment_duration || cloneData.parameters?.segment_duration || 5);

        // Handle target_fps (new) or calculate from legacy fps + frame_interpolation
        if (cloneData.parameters?.target_fps) {
          setTargetFps(cloneData.parameters.target_fps);
        } else {
          // Legacy job: calculate effective output fps
          const legacyFps = cloneData.fps || cloneData.parameters?.fps || 16;
          const legacyInterp = cloneData.parameters?.frame_interpolation || '2x';
          const effectiveFps = legacyInterp === '2x' ? legacyFps * 2 : legacyFps;
          // Map to nearest supported target fps (30 or 60)
          setTargetFps(effectiveFps >= 45 ? 60 : 30);
        }

        // Copy faceswap settings
        if (cloneData.parameters?.faceswap_enabled) {
          setFaceswapEnabled(true);
          setFaceswapImage(cloneData.parameters.faceswap_image || FACESWAP_FACES[0]?.value || '');
          setFaceswapFacesOrder(cloneData.parameters.faceswap_faces_order || 'left-right');
          setFaceswapFacesIndex(cloneData.parameters.faceswap_faces_index || '0');
        }

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
        { lora: null, highWeight: 1, lowWeight: 1 },
        { lora: null, highWeight: 1, lowWeight: 1 }
      ];

      for (let idx = 0; idx < 3; idx++) {
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

      if (newSelectedLoras[0].lora || newSelectedLoras[1].lora || newSelectedLoras[2].lora) {
        setSelectedLoras(newSelectedLoras);
      }
    }
  }, [cloneData, loras]);

  async function loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings || data;
      setSettings(s);
      // Only load target FPS from settings - dimensions come from image
      const newTargetFps = parseInt(s.default_target_fps) || 30;
      setTargetFps(newTargetFps);

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
      console.error('[CreateJobModal] Failed to load settings:', error);
    }
  }

  // Try to parse prefix/description from cloned job name
  useEffect(() => {
    if (!cloneData?.name) return;
    if (namePrefixes.length === 0 && nameDescriptions.length === 0) return;

    // Remove " (Copy)" suffix if present, then parse
    const originalName = cloneData.name.replace(/ \(Copy\)$/, '');

    // Job name format: "prefix-description-5s-30fps" or "description-5s-30fps" or just "name"
    const parts = originalName.split('-');
    if (parts.length >= 3) {
      // Check if first part matches a known prefix
      const potentialPrefix = parts[0];
      if (namePrefixes.includes(potentialPrefix)) {
        setSelectedPrefix(potentialPrefix);
        // Check if second part matches a known description
        const potentialDesc = parts[1];
        if (nameDescriptions.includes(potentialDesc)) {
          setSelectedDescription(potentialDesc);
        }
      } else if (nameDescriptions.includes(potentialPrefix)) {
        // First part is actually a description (no prefix)
        setSelectedDescription(potentialPrefix);
      }
    }
  }, [namePrefixes, nameDescriptions, cloneData]);

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

  // Auto-build job name from prefix + description + duration + fps
  useEffect(() => {
    if (!selectedPrefix && !selectedDescription) return; // Don't clear manual name

    const parts = [];
    if (selectedPrefix) parts.push(selectedPrefix);
    if (selectedDescription) parts.push(selectedDescription);
    parts.push(`${segmentDuration}s`);
    parts.push(`${targetFps}fps`);

    setName(parts.join('-'));
  }, [selectedPrefix, selectedDescription, segmentDuration, targetFps]);

  // Generate filename preview (job name + job id)
  const filenamePreview = useMemo(() => {
    const sanitize = (str) => {
      if (!str) return '';
      let safe = str.replace(/[^a-zA-Z0-9\-_]/g, '_');
      while (safe.includes('__')) safe = safe.replace(/__/g, '_');
      return safe.replace(/^_+|_+$/g, '');
    };

    const safeName = sanitize(name);
    if (!safeName) return '';

    return `${safeName}-{id}.webm`;
  }, [name]);

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
        // Extract dimensions from the loaded image, rounded to multiple of 8
        const img = new Image();
        img.onload = () => {
          setWidth(roundTo8(img.width));
          setHeight(roundTo8(img.height));
        };
        img.src = e.target.result;
      };
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

      // Ensure dimensions are multiples of 8 (safety validation)
      const validWidth = roundTo8(width);
      const validHeight = roundTo8(height);

      const jobData = {
        name: name.trim(),
        prompt: prompt.trim(),
        workflow_type: 'i2v',
        negative_prompt: settings.default_negative_prompt || '',
        input_image: imageFilename,
        loras: lorasArray.length > 0 ? lorasArray : null,
        parameters: {
          width: validWidth,
          height: validHeight,
          target_fps: targetFps,
          segment_duration: segmentDuration,
          faceswap_enabled: faceswapEnabled,
          faceswap_image: faceswapEnabled && faceswapSourceType === 'preset' ? faceswapImage : null,
          faceswap_faces_order: faceswapEnabled ? faceswapFacesOrder : null,
          faceswap_faces_index: faceswapEnabled ? faceswapFacesIndex : null,
          // When 'frame' source type is selected, use the input image as faceswap source
          // Backend extracts filename from URLs containing 'filename=' parameter
          faceswap_source_image: faceswapEnabled && faceswapSourceType === 'frame'
            ? `${API.baseUrl}/comfyui/view?filename=${encodeURIComponent(imageFilename)}&subfolder=&type=input`
            : null,
          auto_finalize: autoFinalize
        }
      };

      const newJob = await API.createJob(jobData);
      showToast('Job created successfully', 'success');
      setUploading(false);
      onSuccess(newJob.id);
    } catch (error) {
      console.error('Failed to create job:', error);
      showToast(error.message || 'Failed to create job', 'error');
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal-content" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{cloneData ? 'Clone Job' : 'Create New Video Job'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Row 1: Job Name with optional prefix/description */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {namePrefixes.length > 0 && (
              <Autocomplete
                size="small"
                options={namePrefixes}
                value={selectedPrefix}
                onChange={(e, newValue) => setSelectedPrefix(newValue)}
                onInputChange={(e, newValue, reason) => {
                  if (reason === 'input') setSelectedPrefix(newValue);
                }}
                freeSolo
                sx={{ width: '120px' }}
                renderInput={(params) => (
                  <TextField {...params} label="Prefix" variant="outlined" />
                )}
              />
            )}
            {nameDescriptions.length > 0 && (
              <Autocomplete
                size="small"
                options={nameDescriptions}
                value={selectedDescription}
                onChange={(e, newValue) => setSelectedDescription(newValue)}
                onInputChange={(e, newValue, reason) => {
                  if (reason === 'input') setSelectedDescription(newValue);
                }}
                freeSolo
                sx={{ width: '180px' }}
                renderInput={(params) => (
                  <TextField {...params} label="Description" variant="outlined" />
                )}
              />
            )}
            <TextField
              label="Job Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Video Job"
              variant="outlined"
              size="small"
              sx={{ flex: 1 }}
            />
          </div>

          {/* Filename preview */}
          {name.trim() && (
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', marginTop: '-8px' }}>
              Output: <span style={{ fontFamily: 'monospace', color: '#666' }}>{filenamePreview}</span>
            </div>
          )}

          {/* Row 2: Dimensions + Duration + FPS + Interpolation */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <TextField
              label="Width"
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value))}
              variant="outlined"
              size="small"
              sx={{ width: '90px' }}
            />
            <button
              type="button"
              onClick={() => { setWidth(height); setHeight(width); }}
              style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', padding: '2px 5px', fontSize: '12px', color: '#666' }}
              title="Swap width and height"
            >↔</button>
            <TextField
              label="Height"
              type="number"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value))}
              variant="outlined"
              size="small"
              sx={{ width: '90px' }}
            />
            <FormControl variant="outlined" size="small" sx={{ width: '130px' }}>
              <InputLabel>Duration</InputLabel>
              <Select value={segmentDuration} onChange={(e) => setSegmentDuration(parseInt(e.target.value))} label="Duration">
                <MenuItem value={3}>3 sec</MenuItem>
                <MenuItem value={4}>4 sec</MenuItem>
                <MenuItem value={5}>5 sec</MenuItem>
                <MenuItem value={8}>8 sec</MenuItem>
                <MenuItem value={10}>10 sec</MenuItem>
              </Select>
            </FormControl>
            <FormControl variant="outlined" size="small" sx={{ width: '140px' }}>
              <InputLabel>Output FPS</InputLabel>
              <Select value={targetFps} onChange={(e) => setTargetFps(parseInt(e.target.value))} label="Output FPS">
                <MenuItem value={30}>30 fps</MenuItem>
                <MenuItem value={60}>60 fps</MenuItem>
                <MenuItem value={90}>90 fps</MenuItem>
              </Select>
            </FormControl>
          </div>

          {/* Row 3: Prompt */}
          <div style={{ marginBottom: '12px' }}>
            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              rows={4}
              placeholder="Describe the video scene and action..."
              fullWidth
              variant="outlined"
              size="small"
            />
            {prompt.trim() && (
              <button
                type="button"
                onClick={() => setPrompt('')}
                style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', fontSize: '11px', padding: '2px 0', textDecoration: 'underline' }}
              >Clear</button>
            )}
          </div>

          {/* Row 4: Start Image (compact) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#666' }}>Start Image:</span>
            {!preUploadedImageUrl && !imagePreview && (
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ fontSize: '13px' }} />
            )}
            {imagePreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src={imagePreview} alt="Preview" className="image-thumbnail-hover" />
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {preUploadedImageUrl ? preUploadedImageUrl : imageFile?.name}
                </span>
              </div>
            )}
          </div>

          {/* LoRAs - 3 columns */}
          <div className="modal-lora-grid">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="modal-lora-slot">
                <div className="modal-lora-slot-header">LoRA {idx + 1} (optional)</div>
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
                  }}
                  loras={loras}
                />
                <div className="modal-lora-weights">
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

          {/* Options row: Face Swap + Auto Finalize */}
          <div style={{ display: 'flex', gap: '16px', padding: '10px 12px', background: '#f9f9f9', borderRadius: '6px', border: '1px solid #e0e0e0', marginBottom: '8px', alignItems: 'flex-start' }}>
            {/* Face Swap */}
            <div style={{ flex: 1 }}>
              <FormControlLabel
                control={<Checkbox checked={faceswapEnabled} onChange={(e) => setFaceswapEnabled(e.target.checked)} size="small" />}
                label={<span style={{ fontSize: '13px', fontWeight: 500 }}>Face Swap</span>}
                sx={{ mb: faceswapEnabled ? 1 : 0 }}
              />
              {faceswapEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Source type selector */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                      variant={faceswapSourceType === 'preset' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setFaceswapSourceType('preset')}
                    >
                      Preset Face
                    </Button>
                    <Button
                      variant={faceswapSourceType === 'frame' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setFaceswapSourceType('frame')}
                      disabled={!imagePreview}
                    >
                      From Frame
                    </Button>
                  </div>

                  {/* Preset face selector */}
                  {faceswapSourceType === 'preset' && (
                    <FormControl variant="outlined" size="small" sx={{ width: '140px' }}>
                      <InputLabel>Face</InputLabel>
                      <Select value={faceswapImage} onChange={(e) => setFaceswapImage(e.target.value)} label="Face">
                        {FACESWAP_FACES.map((face) => (
                          <MenuItem key={face.value} value={face.value}>{face.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {/* Start image preview when using frame source */}
                  {faceswapSourceType === 'frame' && imagePreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img
                        src={imagePreview}
                        alt="Start image"
                        style={{
                          width: '50px',
                          height: '50px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '2px solid #1976d2'
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#666' }}>Using start image as face source</span>
                    </div>
                  )}

                  {/* Face detection order and index */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <FormControl variant="outlined" size="small" sx={{ width: '130px' }}>
                      <InputLabel>Order</InputLabel>
                      <Select value={faceswapFacesOrder} onChange={(e) => setFaceswapFacesOrder(e.target.value)} label="Order">
                        <MenuItem value="left-right">Left-Right</MenuItem>
                        <MenuItem value="right-left">Right-Left</MenuItem>
                        <MenuItem value="small-large">Small-Large</MenuItem>
                        <MenuItem value="large-small">Large-Small</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField label="Index" value={faceswapFacesIndex} onChange={(e) => setFaceswapFacesIndex(e.target.value)} variant="outlined" size="small" sx={{ width: '70px' }} />
                  </div>
                </div>
              )}
            </div>
            {/* Auto Finalize */}
            <FormControlLabel
              control={<Checkbox checked={autoFinalize} onChange={(e) => setAutoFinalize(e.target.checked)} size="small" />}
              label={<span style={{ fontSize: '13px' }}>Auto-finalize</span>}
            />
          </div>

        </div>

        <div className="modal-footer">
          <Button type="submit" variant="contained" disabled={uploading}>
            {uploading ? <CircularProgress size={20} color="inherit" /> : 'Create Job'}
          </Button>
        </div>
      </form>
    </div>
  );
}
