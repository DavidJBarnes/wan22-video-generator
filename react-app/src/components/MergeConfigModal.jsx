import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
 * Shows N-1 transition cards for N segments, with offset controls for each transition.
 * Segment 0 has no offset (nothing before it to trim).
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

  // Default segment duration and FPS
  const DEFAULT_FPS = 24;
  const DEFAULT_SEGMENT_DURATION = 5; // seconds

  // Load segment info (frame counts) and existing offsets
  useEffect(() => {
    if (!open || !jobId) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load existing offsets
        const offsetData = await API.getMergeOffsets(jobId);
        const existingOffsets = offsetData.offsets || {};

        // Initialize offsets for segments 1+ only (segment 0 has no offset)
        // Default: 1 frame offset to remove duplicate frame at transitions
        const initialOffsets = {};
        completedSegments.forEach((seg, idx) => {
          if (idx === 0) return; // Skip segment 0 - no offset needed
          const segIdx = seg.segment_index.toString();
          if (segIdx in existingOffsets) {
            initialOffsets[segIdx] = existingOffsets[segIdx];
          } else {
            initialOffsets[segIdx] = 1; // Default 1 frame to remove duplicate
          }
        });
        setOffsets(initialOffsets);

        // Load segment info
        const infoMap = {};
        for (const seg of completedSegments) {
          infoMap[seg.segment_index] = {
            frameCount: DEFAULT_FPS * DEFAULT_SEGMENT_DURATION,
            fps: DEFAULT_FPS
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

  // Calculate total duration based on offsets
  const durationInfo = useMemo(() => {
    if (completedSegments.length === 0) return null;

    const fps = DEFAULT_FPS;
    const originalDuration = completedSegments.length * DEFAULT_SEGMENT_DURATION;

    // Calculate total frames trimmed
    let totalFramesTrimmed = 0;
    completedSegments.forEach((seg, idx) => {
      if (idx === 0) return; // Segment 0 has no offset
      const segIdx = seg.segment_index.toString();
      totalFramesTrimmed += offsets[segIdx] || 0;
    });

    const secondsTrimmed = totalFramesTrimmed / fps;
    const finalDuration = originalDuration - secondsTrimmed;

    return {
      original: originalDuration,
      final: finalDuration,
      trimmed: secondsTrimmed
    };
  }, [completedSegments, offsets]);

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
    const maxOffset = info.frameCount - 1; // Allow up to all but 1 frame
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
      // Include segment 0 with offset 0 for completeness
      const allOffsets = { '0': 0, ...offsets };
      await onFinalize(allOffsets);
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

  // Thumbnail container style for aspect ratio preservation
  const thumbnailContainerStyle = {
    width: 160,
    height: 160,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 1,
    overflow: 'hidden'
  };

  const thumbnailImageStyle = {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain'
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
        {durationInfo && (
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
            Total duration: ~{durationInfo.final.toFixed(2)}s
            {durationInfo.trimmed > 0 && (
              <span style={{ color: '#888', fontWeight: 400 }}>
                {' '}(was {durationInfo.original.toFixed(2)}s)
              </span>
            )}
          </Typography>
        )}
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
            {/* Show N-1 transition cards for N segments (skip segment 0) */}
            {completedSegments.slice(1).map((segment, idx) => {
              const prevSegment = completedSegments[idx]; // Previous segment
              const segIdx = segment.segment_index;
              const offset = offsets[segIdx.toString()] || 0;
              const info = segmentInfo[segIdx] || { frameCount: 120, fps: 24 };
              const maxOffset = info.frameCount - 1; // Allow up to all but 1 frame

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
                    Transition: Segment {prevSegment.segment_index + 1} → Segment {segIdx + 1}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {/* Previous segment end frame */}
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        Seg {prevSegment.segment_index + 1} End
                      </Typography>
                      <Box sx={thumbnailContainerStyle}>
                        {prevSegment.end_frame_url ? (
                          <Box
                            component="img"
                            src={prevSegment.end_frame_url}
                            alt={`Segment ${prevSegment.segment_index + 1} end`}
                            sx={thumbnailImageStyle}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No preview
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    <Typography sx={{ mx: 1 }} color="text.secondary">
                      →
                    </Typography>

                    {/* Current segment start frame (with offset) */}
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        Seg {segIdx + 1} Start {offset > 0 ? `(+${offset} frames)` : ''}
                      </Typography>
                      <Box sx={thumbnailContainerStyle}>
                        <Box
                          component="img"
                          key={`${segIdx}-${offset}`}
                          src={API.getSegmentFrame(jobId, segIdx, offset)}
                          alt={`Segment ${segIdx + 1} start`}
                          sx={thumbnailImageStyle}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </Box>
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
