import { useState } from 'react';
import { Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import API from '../api/client';
import { showToast, formatDate } from '../utils/helpers';
import StatusChip from './StatusChip';
import './CreateJobModal.css';

// Extract LoRA display name from path
function getLoraDisplayName(loraPath) {
  if (!loraPath) return '';
  const filename = loraPath.split('/').pop();
  return filename.replace('.safetensors', '');
}

// Parse LoRA JSON and format for display
function formatLoras(loraJson) {
  if (!loraJson) return '-';
  try {
    const loras = typeof loraJson === 'string' ? JSON.parse(loraJson) : loraJson;
    if (!Array.isArray(loras) || loras.length === 0) return '-';
    return loras.map(l => {
      const name = getLoraDisplayName(l.file);
      const weight = l.weight !== undefined ? l.weight : 1;
      return `${name} (${weight})`;
    }).join(', ');
  } catch {
    return loraJson;
  }
}

// Truncate prompt for table display
function truncatePrompt(prompt, maxLength = 100) {
  if (!prompt) return '-';
  if (prompt.length <= maxLength) return prompt;
  return prompt.substring(0, maxLength) + '...';
}

export default function SegmentNotesModal({ jobId, segments, onClose, onUpdate }) {
  const [notes, setNotes] = useState(() => {
    const initial = {};
    segments.forEach(seg => {
      initial[seg.segment_index] = seg.note || '';
    });
    return initial;
  });
  const [saving, setSaving] = useState({});
  const [editingSegment, setEditingSegment] = useState(null);

  async function handleSaveNote(segmentIndex) {
    setSaving(prev => ({ ...prev, [segmentIndex]: true }));
    try {
      await API.updateSegmentNote(jobId, segmentIndex, notes[segmentIndex]);
      showToast('Note saved', 'success');
      setEditingSegment(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to save note:', error);
      showToast(error.message || 'Failed to save note', 'error');
    } finally {
      setSaving(prev => ({ ...prev, [segmentIndex]: false }));
    }
  }

  // Calculate display number (sequential among non-deleted)
  let activeCount = 0;
  const segmentsWithDisplayNum = segments.map(seg => {
    const isDeleted = !!seg.deleted_at;
    const displayNumber = isDeleted ? `${seg.segment_index + 1} (del)` : ++activeCount;
    return { ...seg, displayNumber };
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1400px', width: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <h2>Segment Notes</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
          Add notes to segments for testing and learning purposes. Click a note cell to edit.
        </p>

        <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: '70px', fontSize: '14px' }}>Seg</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '100px', fontSize: '14px', textAlign: 'right' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '150px', fontSize: '14px' }}>Segment Run</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '28%', fontSize: '14px' }}>Prompt</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '22%', fontSize: '14px' }}>LoRAs</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '28%', fontSize: '14px' }}>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {segmentsWithDisplayNum.map((seg) => {
                const isDeleted = !!seg.deleted_at;
                const isEditing = editingSegment === seg.segment_index;

                return (
                  <TableRow
                    key={seg.id}
                    sx={{
                      opacity: isDeleted ? 0.5 : 1,
                      backgroundColor: isDeleted ? '#f5f5f5' : 'inherit',
                      '&:hover': { backgroundColor: isDeleted ? '#f0f0f0' : '#fafafa' },
                      verticalAlign: 'top'
                    }}
                  >
                    <TableCell sx={{ fontWeight: 500, fontSize: '14px', pt: 2 }}>
                      {seg.displayNumber}
                    </TableCell>
                    <TableCell sx={{ pt: 2, textAlign: 'right' }}>
                      <StatusChip status={isDeleted ? 'deleted' : seg.status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '13px', color: '#666', pt: 2 }}>
                      {seg.completed_at ? formatDate(seg.completed_at) : '-'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '13px', pt: 2 }} title={seg.prompt}>
                      {truncatePrompt(seg.prompt)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '13px', pt: 2 }}>
                      <div><span style={{ color: '#2e7d32', fontWeight: 500 }}>High:</span> {formatLoras(seg.high_lora)}</div>
                      <div style={{ marginTop: '4px' }}><span style={{ color: '#1565c0', fontWeight: 500 }}>Low:</span> {formatLoras(seg.low_lora)}</div>
                    </TableCell>
                    <TableCell sx={{ pt: 1, pb: 1 }}>
                      {isEditing ? (
                        <div>
                          <TextField
                            value={notes[seg.segment_index] || ''}
                            onChange={(e) => setNotes(prev => ({
                              ...prev,
                              [seg.segment_index]: e.target.value
                            }))}
                            fullWidth
                            multiline
                            rows={4}
                            inputProps={{ maxLength: 255 }}
                            placeholder="Add a note about this segment..."
                            autoFocus
                            helperText={`${(notes[seg.segment_index] || '').length}/255`}
                            sx={{
                              '& .MuiInputBase-root': { fontSize: '14px' },
                              '& .MuiFormHelperText-root': { textAlign: 'right' }
                            }}
                          />
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setEditingSegment(null);
                                const originalNote = segments.find(s => s.segment_index === seg.segment_index)?.note || '';
                                setNotes(prev => ({ ...prev, [seg.segment_index]: originalNote }));
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handleSaveNote(seg.segment_index)}
                              disabled={saving[seg.segment_index]}
                            >
                              {saving[seg.segment_index] ? 'Saving...' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => setEditingSegment(seg.segment_index)}
                          style={{
                            cursor: 'pointer',
                            padding: '12px',
                            borderRadius: '4px',
                            minHeight: '80px',
                            backgroundColor: notes[seg.segment_index] ? '#fff9c4' : '#f5f5f5',
                            fontSize: '14px',
                            color: notes[seg.segment_index] ? '#333' : '#999',
                            border: '1px solid #e0e0e0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                          title="Click to edit"
                        >
                          {notes[seg.segment_index] || 'Click to add note...'}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <div className="modal-actions" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e0e0e0' }}>
          <Button variant="outlined" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
