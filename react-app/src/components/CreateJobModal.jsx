import { useState, useEffect } from 'react';
import { Button, TextField, Select, MenuItem, FormControl, InputLabel, FormHelperText } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import LoraAutocomplete from './LoraAutocomplete';
import './CreateJobModal.css';

export default function CreateJobModal({ onClose, onSuccess, preUploadedImageUrl = null, cloneData = null }) {
  const [settings, setSettings] = useState({});
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(640);
  const [fps, setFps] = useState(16);
  const [segmentDuration, setSegmentDuration] = useState(5);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedLoras, setSelectedLoras] = useState([null, null]); // Two LoRA slots
  const [loras, setLoras] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLoras();

    if (preUploadedImageUrl) {
      setImagePreview(API.getComfyUIImage(preUploadedImageUrl));
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
  }, [preUploadedImageUrl, cloneData]);

  // When loras are loaded and we have cloneData, find matching LoRAs
  useEffect(() => {
    if (cloneData && loras.length > 0) {
      // Parse high_lora - could be a JSON array or single string
      let highLoraFiles = [];
      const highLoraData = cloneData.high_lora || cloneData.parameters?.high_lora;
      if (highLoraData) {
        if (typeof highLoraData === 'string' && highLoraData.startsWith('[')) {
          try {
            highLoraFiles = JSON.parse(highLoraData);
          } catch (e) {
            highLoraFiles = [highLoraData];
          }
        } else if (Array.isArray(highLoraData)) {
          highLoraFiles = highLoraData;
        } else {
          highLoraFiles = [highLoraData];
        }
      }

      // Find matching LoRAs for each slot
      const newSelectedLoras = [null, null];
      highLoraFiles.slice(0, 2).forEach((highFile, idx) => {
        if (highFile) {
          const matchingLora = loras.find(l => l.high_file === highFile || l.low_file === highFile);
          if (matchingLora) {
            newSelectedLoras[idx] = matchingLora;
          }
        }
      });

      if (newSelectedLoras[0] || newSelectedLoras[1]) {
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

      // Build loras array from selected LoRAs (filter out empty slots)
      const lorasArray = selectedLoras
        .filter(lora => lora && (lora.high_file || lora.low_file))
        .map(lora => ({
          high_file: lora.high_file || null,
          low_file: lora.low_file || null
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
          segment_duration: segmentDuration
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
            <Button type="button" variant="outlined" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={uploading}>
              {uploading ? 'Creating...' : 'Create Job'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
