import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  TextField,
  CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import API from '../api/client';
import { showToast } from '../utils/helpers';

/**
 * Modal for configuring segment merge offsets before finalizing a job.
 * Shows transition cards with thumbnails and offset controls for each segment.
 */
export default function MergeConfigModal({ open, onClose, jobId, segments, onFinalize }) {
  const [offsets, setOffsets] = useState({});
  const [segmentInfo, setSegmentInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const debounceTimers = useRef({});

  // Filter to only completed, non-deleted segments
  const completedSegments = segments.filter(
    s => s.status === 'completed' && !s.deleted_at
  );

  // Load segment info (frame counts) and existing offsets
  useEffect(() => {
    if (!open || !jobId) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load existing offsets
        const offsetData = await API.getMergeOffsets(jobId);
        const existingOffsets = offsetData.offsets || {};

        // Initialize offsets for all segments
        // Default: 0 for first segment, 1 for others (to remove duplicate frame)
        const initialOffsets = {};
        completedSegments.forEach((seg, idx) => {
          const segIdx = seg.segment_index.toString();
          if (segIdx in existingOffsets) {
            initialOffsets[segIdx] = existingOffsets[segIdx];
          } else {
            initialOffsets[segIdx] = idx === 0 ? 0 : 1;
          }
        });
        setOffsets(initialOffsets);

        // Load segment info (we'll get frame counts from the API response)
        const infoMap = {};
        for (const seg of completedSegments) {
          // For now, estimate frame count from segment duration
          // Assuming 24 fps for wan2.2 segments
          const fps = 24;
          const duration = 5; // default segment duration
          infoMap[seg.segment_index] = {
            frameCount: fps * duration,
            fps
          };
        }
        setSegmentInfo(infoMap);
      } catch (error) {
        console.error('Failed to load merge config:', error);
        showToast('Failed to load merge configuration', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [open, jobId, segments]);

  // Debounced offset change handler
  const handleOffsetChange = useCallback((segmentIndex, newOffset) => {
    const segIdx = segmentIndex.toString();

    // Clear existing timer for this segment
    if (debounceTimers.current[segIdx]) {
      clearTimeout(debounceTimers.current[segIdx]);
    }

    // Update local state immediately
    setOffsets(prev => ({
      ...prev,
      [segIdx]: Math.max(0, newOffset)
    }));

    // Debounce the thumbnail refresh (300ms)
    debounceTimers.current[segIdx] = setTimeout(() => {
      // Thumbnail will update automatically via the key change
    }, 300);
  }, []);

  const handleIncrement = (segmentIndex) => {
    const segIdx = segmentIndex.toString();
    const info = segmentInfo[segmentIndex] || { frameCount: 120 };
    const maxOffset = Math.floor(info.frameCount * 0.5);
    const currentOffset = offsets[segIdx] || 0;
    if (currentOffset < maxOffset) {
      handleOffsetChange(segmentIndex, currentOffset + 1);
    }
  };

  const handleDecrement = (segmentIndex) => {
    const segIdx = segmentIndex.toString();
    const currentOffset = offsets[segIdx] || 0;
    if (currentOffset > 0) {
      handleOffsetChange(segmentIndex, currentOffset - 1);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await onFinalize(offsets);
      onClose();
    } catch (error) {
      console.error('Failed to finalize:', error);
      showToast('Failed to finalize job', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  // Calculate time impact of offset
  const formatTimeImpact = (offset, fps = 24) => {
    const seconds = offset / fps;
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    }
    return `${seconds.toFixed(2)}s`;
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogTitle>
        Configure Segment Transitions
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Adjust frame offsets to trim artifacts from segment starts. Higher offset = more frames trimmed.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : completedSegments.length === 1 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              Single segment job - no transitions to configure.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click "Finalize" to merge.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {completedSegments.map((segment, idx) => {
              const segIdx = segment.segment_index;
              const offset = offsets[segIdx.toString()] || 0;
              const info = segmentInfo[segIdx] || { frameCount: 120, fps: 24 };
              const maxOffset = Math.floor(info.frameCount * 0.5);
              const prevSegment = idx > 0 ? completedSegments[idx - 1] : null;

              return (
                <Box
                  key={segIdx}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 2
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Segment {segIdx} {idx === 0 ? '(First)' : ''}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {/* Previous segment end frame (if not first) */}
                    {prevSegment && (
                      <>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Seg {prevSegment.segment_index} End
                          </Typography>
                          <Box
                            component="img"
                            src={API.getSegmentFrame(jobId, prevSegment.segment_index, -1)}
                            alt={`Segment ${prevSegment.segment_index} end`}
                            sx={{
                              width: 160,
                              height: 90,
                              objectFit: 'cover',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider'
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </Box>

                        <Typography sx={{ mx: 1 }} color="text.secondary">
                          →
                        </Typography>
                      </>
                    )}

                    {/* Current segment start frame (with offset) */}
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        Seg {segIdx} Start {offset > 0 ? `(+${offset} frames)` : ''}
                      </Typography>
                      <Box
                        component="img"
                        key={`${segIdx}-${offset}`}
                        src={API.getSegmentFrame(jobId, segIdx, offset)}
                        alt={`Segment ${segIdx} start`}
                        sx={{
                          width: 160,
                          height: 90,
                          objectFit: 'cover',
                          borderRadius: 1,
                          border: '2px solid',
                          borderColor: offset > 0 ? 'primary.main' : 'divider'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </Box>

                    {/* Offset controls */}
                    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleDecrement(segIdx)}
                        disabled={offset <= 0}
                      >
                        <RemoveIcon />
                      </IconButton>

                      <TextField
                        type="number"
                        value={offset}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            handleOffsetChange(segIdx, Math.min(maxOffset, Math.max(0, val)));
                          }
                        }}
                        inputProps={{
                          min: 0,
                          max: maxOffset,
                          style: { textAlign: 'center', width: 60 }
                        }}
                        size="small"
                        sx={{ width: 80 }}
                      />

                      <IconButton
                        size="small"
                        onClick={() => handleIncrement(segIdx)}
                        disabled={offset >= maxOffset}
                      >
                        <AddIcon />
                      </IconButton>

                      <Typography variant="body2" color="text.secondary" sx={{ ml: 1, minWidth: 60 }}>
                        {formatTimeImpact(offset, info.fps)}
                      </Typography>
                    </Box>
                  </Box>

                  {idx === 0 && offset === 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      First segment typically doesn't need trimming
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={finalizing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleFinalize}
          disabled={finalizing || loading}
        >
          {finalizing ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
          Finalize & Merge
        </Button>
      </DialogActions>
    </Dialog>
  );
}
