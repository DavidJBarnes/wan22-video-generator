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
  const [segmentDuration, setSegmentDuration] = useState(5);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [highLora, setHighLora] = useState('');
  const [lowLora, setLowLora] = useState('');
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
      setSegmentDuration(cloneData.segment_duration || cloneData.parameters?.segment_duration || 5);
      setHighLora(cloneData.high_lora || cloneData.parameters?.high_lora || '');
      setLowLora(cloneData.low_lora || cloneData.parameters?.low_lora || '');

      // Set the input image if available - use thumbnail endpoint for proper URL
      if (cloneData.input_image && cloneData.id) {
        setImagePreview(API.getJobThumbnail(cloneData.id));
      }
    }
  }, [preUploadedImageUrl, cloneData]);

  async function loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings || data;
      setSettings(s);
      setWidth(parseInt(s.default_width) || 640);
      setHeight(parseInt(s.default_height) || 640);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

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

      const jobData = {
        name: name.trim(),
        prompt: prompt.trim(),
        workflow_type: 'i2v',
        negative_prompt: settings.default_negative_prompt || '',
        input_image: imageFilename,
        high_lora: highLora || null,
        low_lora: lowLora || null,
        parameters: {
          width,
          height,
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

          <div className="form-row">
            <div className="form-group">
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
            <div className="form-group">
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
              </Select>
              <FormHelperText>Add segments one at a time. Click "Finalize & Merge" when done.</FormHelperText>
            </FormControl>
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
