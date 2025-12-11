import { useState } from 'react';
import { Button, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import API from '../api/client';
import { showToast } from '../utils/helpers';
import './CreateJobModal.css';

export default function EditJobModal({ job, onClose, onSuccess }) {
  const params = job.parameters || {};

  // Check if job has started (has completed segments)
  const hasStarted = (job.completed_segments ?? 0) > 0;

  const [name, setName] = useState(job.name || '');
  const [prompt, setPrompt] = useState(job.prompt || '');
  const [width, setWidth] = useState(params.width || 640);
  const [height, setHeight] = useState(params.height || 640);
  const [fps, setFps] = useState(params.fps || 16);
  const [segmentDuration, setSegmentDuration] = useState(params.segment_duration || 5);
  const [saving, setSaving] = useState(false);

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
          fps,
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
      <div className="modal-content">
        <h2>Edit Job Settings</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <TextField
              label="Job Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                inputProps={{ min: 64, step: 8 }}
                disabled={hasStarted}
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
                inputProps={{ min: 64, step: 8 }}
                disabled={hasStarted}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <FormControl fullWidth variant="outlined" size="small" disabled={hasStarted}>
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
              </FormControl>
            </div>
            <div className="form-group">
              <FormControl fullWidth variant="outlined" size="small" disabled={hasStarted}>
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

          {hasStarted && (
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
              Dimensions, FPS, and segment duration cannot be changed after segments have been generated.
            </div>
          )}

          <div className="form-group">
            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              rows={3}
              fullWidth
              variant="outlined"
            />
          </div>

          <div className="modal-actions">
            <Button type="button" variant="outlined" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
