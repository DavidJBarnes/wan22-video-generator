import { useState, useEffect, useMemo } from 'react';
import { Button, TextField, Select, MenuItem, FormControl, InputLabel, Autocomplete } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './CreateJobModal.css';

export default function EditJobModal({ job, onClose, onSuccess }) {
  const params = job.parameters || {};

  // Check if job has active completed segments (not deleted)
  // Allow editing if: no segments completed, all segments deleted, or job failed
  const completedSegments = job.completed_segments ?? 0;
  const deletedSegments = job.deleted_segments ?? 0;
  const activeCompletedSegments = completedSegments - deletedSegments;
  const hasStarted = activeCompletedSegments > 0 && job.status !== 'failed';

  const [name, setName] = useState(job.name || '');
  const [prompt, setPrompt] = useState(job.prompt || '');
  const [width, setWidth] = useState(params.width || 640);
  const [height, setHeight] = useState(params.height || 640);
  const [segmentDuration, setSegmentDuration] = useState(params.segment_duration || 5);
  const [saving, setSaving] = useState(false);

  // New state for prefix/description and target FPS
  const [namePrefixes, setNamePrefixes] = useState([]);
  const [nameDescriptions, setNameDescriptions] = useState([]);
  const [selectedPrefix, setSelectedPrefix] = useState(null);
  const [selectedDescription, setSelectedDescription] = useState(null);

  // Handle target_fps (new) or calculate from legacy fps + frame_interpolation
  const getInitialTargetFps = () => {
    if (params.target_fps) {
      return params.target_fps;
    }
    // Legacy job: calculate effective output fps
    const legacyFps = params.fps || 16;
    const legacyInterp = params.frame_interpolation || '2x';
    const effectiveFps = legacyInterp === '2x' ? legacyFps * 2 : legacyFps;
    // Map to nearest supported target fps (30 or 60)
    return effectiveFps >= 45 ? 60 : 30;
  };
  const [targetFps, setTargetFps] = useState(getInitialTargetFps());

  // Load settings for prefixes and descriptions
  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await API.getSettings();
        const s = data.settings || data;

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
    loadSettings();
  }, []);

  // Try to parse prefix/description from existing job name
  useEffect(() => {
    if (namePrefixes.length === 0 && nameDescriptions.length === 0) return;
    if (!job.name) return;

    // Job name format: "prefix-description-5s-30fps" or "description-5s-30fps" or just "name"
    const parts = job.name.split('-');
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
  }, [namePrefixes, nameDescriptions, job.name]);

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

  // Generate filename preview
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

    setSaving(true);

    try {
      await API.updateJob(job.id, {
        name: name.trim(),
        prompt: prompt.trim(),
        parameters: {
          ...params,
          width,
          height,
          target_fps: targetFps,
          segment_duration: segmentDuration
        }
      });

      showToast('Job updated successfully', 'success');
      setSaving(false);
      onSuccess();
    } catch (error) {
      console.error('Failed to update job:', error);
      showToast(error.message || 'Failed to update job', 'error');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal-content" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>Edit Job Settings</h2>
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
                disabled={hasStarted}
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
                disabled={hasStarted}
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

          {/* Row 2: Dimensions + Duration + FPS */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <TextField
              label="Width"
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value))}
              variant="outlined"
              size="small"
              sx={{ width: '90px' }}
              inputProps={{ min: 64, step: 8 }}
              disabled={hasStarted}
            />
            <button
              type="button"
              onClick={() => { setWidth(height); setHeight(width); }}
              disabled={hasStarted}
              style={{
                background: 'none',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: hasStarted ? 'not-allowed' : 'pointer',
                padding: '2px 5px',
                fontSize: '12px',
                color: hasStarted ? '#ccc' : '#666',
                opacity: hasStarted ? 0.5 : 1
              }}
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
              inputProps={{ min: 64, step: 8 }}
              disabled={hasStarted}
            />
            <FormControl variant="outlined" size="small" sx={{ width: '130px' }} disabled={hasStarted}>
              <InputLabel>Duration</InputLabel>
              <Select value={segmentDuration} onChange={(e) => setSegmentDuration(parseInt(e.target.value))} label="Duration">
                <MenuItem value={3}>3 sec</MenuItem>
                <MenuItem value={4}>4 sec</MenuItem>
                <MenuItem value={5}>5 sec</MenuItem>
                <MenuItem value={8}>8 sec</MenuItem>
                <MenuItem value={10}>10 sec</MenuItem>
              </Select>
            </FormControl>
            <FormControl variant="outlined" size="small" sx={{ width: '140px' }} disabled={hasStarted}>
              <InputLabel>Output FPS</InputLabel>
              <Select value={targetFps} onChange={(e) => setTargetFps(parseInt(e.target.value))} label="Output FPS">
                <MenuItem value={30}>30 fps</MenuItem>
                <MenuItem value={60}>60 fps</MenuItem>
                <MenuItem value={90}>90 fps</MenuItem>
              </Select>
            </FormControl>
          </div>

          {hasStarted && (
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
              Dimensions, duration, and FPS cannot be changed after segments have been generated.
            </div>
          )}

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
        </div>

        <div className="modal-footer">
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
