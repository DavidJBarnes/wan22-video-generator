import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, CircularProgress, LinearProgress, Box, Typography, Checkbox, FormControlLabel, IconButton } from '@mui/material';
import SwitchVideoIcon from '@mui/icons-material/SwitchVideo';
import EditIcon from '@mui/icons-material/Edit';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import API from '../api/client';
import { useLoras } from '../contexts/LoraContext';
import { formatDate, showToast } from '../utils/helpers';
import SubmitPromptModal from '../components/SubmitPromptModal';
import CreateJobModal from '../components/CreateJobModal';
import EditJobModal from '../components/EditJobModal';
import LoraEditModal from '../components/LoraEditModal';
import SegmentNotesModal from '../components/SegmentNotesModal';
import MergeConfigModal from '../components/MergeConfigModal';
import StatusChip from '../components/StatusChip';
import './JobDetail.css';

// Helper functions moved to module level for memoization
function parseLoraArray(value) {
  if (!value) return [];
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(l => l) : [];
    } catch (e) {
      return [value];
    }
  }
  return [value];
}

function getLoraFile(loraData) {
  if (!loraData) return null;
  if (typeof loraData === 'string') return loraData;
  if (typeof loraData === 'object' && loraData.file) return loraData.file;
  return null;
}

function getLoraWeight(loraData) {
  if (!loraData) return 1;
  if (typeof loraData === 'object' && loraData.weight !== undefined) return loraData.weight;
  return 1;
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [editingSegment, setEditingSegment] = useState(null);  // Segment being edited
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [nextSegmentIndex, setNextSegmentIndex] = useState(0);
  const [lastJobStatus, setLastJobStatus] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [deletedSegmentsExpanded, setDeletedSegmentsExpanded] = useState(false);
  // Use cached LoRA library from context
  const { loras: loraLibrary } = useLoras();
  const [selectedLoraForEdit, setSelectedLoraForEdit] = useState(null);
  const [segmentVideoIndex, setSegmentVideoIndex] = useState(null);
  const [segmentVideoKey, setSegmentVideoKey] = useState(null);
  const [progress, setProgress] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [showMergeConfigModal, setShowMergeConfigModal] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [upscaledVideos, setUpscaledVideos] = useState([]);
  const [generatingVR, setGeneratingVR] = useState(false);
  const [vrVideos, setVrVideos] = useState([]);
  const [vrProgress, setVrProgress] = useState(null);
  const [vrSettings, setVrSettings] = useState({
    eyeSeparation: 0.015,
    depthStrength: 0.5,
    equirectangular: false,
    verticalFov: 90,
    depthSmoothing: 2.0,
    outputSharpening: 0.3,
    outputWidth: 4128,
    outputHeight: 2208,
    upscaleEnabled: false,
    upscaleFactor: 2,
    upscaleThreshold: 1500,
    depthModel: 'depth_anything_v2',
    encodingPreset: 'balanced'
  });
  const autoFinalizeTriggeredRef = useRef(false);

  // Memoize expensive segment calculations - must be before early returns
  const lastCompletedSegment = useMemo(() =>
    segments.filter(s => s.status === 'completed' && !s.deleted_at).pop(),
    [segments]
  );

  const totalExecutionTime = useMemo(() =>
    segments
      .filter(s => s.status === 'completed' && s.execution_time && !s.deleted_at)
      .reduce((sum, s) => sum + s.execution_time, 0),
    [segments]
  );

  // Memoize LoRA lookup function - depends on loraLibrary
  const getLoraByFilename = useCallback((filename) => {
    if (!filename) return null;
    const baseName = filename.split('/').pop();
    return loraLibrary.find(l =>
      l.high_file === filename || l.low_file === filename ||
      (l.high_file && l.high_file.split('/').pop() === baseName) ||
      (l.low_file && l.low_file.split('/').pop() === baseName)
    );
  }, [loraLibrary]);

  // Memoize friendly name lookup
  const getLoraFriendlyName = useCallback((filename) => {
    if (!filename) return null;
    const baseName = filename.split('/').pop();
    const match = getLoraByFilename(filename);
    if (match) {
      return match.friendly_name || match.base_name || baseName.replace('.safetensors', '');
    }
    return baseName.replace('.safetensors', '');
  }, [getLoraByFilename]);

  // Memoize LoRA display formatter
  const formatLorasDisplay = useCallback((highLora, lowLora) => {
    const highLoras = parseLoraArray(highLora);
    const lowLoras = parseLoraArray(lowLora);

    if (highLoras.length === 0 && lowLoras.length === 0) {
      return { display: 'N/A', count: 0 };
    }

    const maxLen = Math.max(highLoras.length, lowLoras.length);
    const pairs = [];
    for (let i = 0; i < maxLen; i++) {
      const hFile = getLoraFile(highLoras[i]);
      const lFile = getLoraFile(lowLoras[i]);
      const hWeight = getLoraWeight(highLoras[i]);
      const lWeight = getLoraWeight(lowLoras[i]);
      const h = hFile ? getLoraFriendlyName(hFile) : null;
      const l = lFile ? getLoraFriendlyName(lFile) : null;
      const hLora = hFile ? getLoraByFilename(hFile) : null;
      const lLora = lFile ? getLoraByFilename(lFile) : null;
      if (h || l) {
        pairs.push({
          high: h,
          highWeight: hWeight,
          highLora: hLora,
          low: l,
          lowWeight: lWeight,
          lowLora: lLora,
          index: i + 1
        });
      }
    }
    return { pairs, count: pairs.length };
  }, [getLoraByFilename, getLoraFriendlyName]);

  // Format time as "Xm Ys" or "Xs"
  const formatTime = (seconds) => {
    if (seconds == null || seconds < 0) return null;
    seconds = Math.round(seconds);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Legacy alias for formatTime
  const formatElapsedTime = formatTime;

  // Calculate ETA based on elapsed time and average run time
  const etaSeconds = useMemo(() => {
    if (elapsedTime == null || !progress?.avg_run_time) return null;
    const eta = progress.avg_run_time - elapsedTime;
    return Math.max(0, eta);
  }, [elapsedTime, progress?.avg_run_time]);

  // Poll for progress when job is running
  useEffect(() => {
    if (!job || job.status !== 'running') {
      setProgress(null);
      return;
    }

    const pollProgress = async () => {
      try {
        const progressData = await API.getJobProgress(id);
        setProgress(progressData);
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      }
    };

    pollProgress();
    const progressInterval = setInterval(pollProgress, 1000);

    return () => clearInterval(progressInterval);
  }, [id, job?.status]);

  // Update elapsed time ticker every second when running
  useEffect(() => {
    // Use Unix timestamp to avoid timezone issues
    if (!progress?.started_at_ts || job?.status !== 'running') {
      setElapsedTime(null);
      return;
    }

    const updateElapsed = () => {
      const nowSeconds = Date.now() / 1000;
      const diffSeconds = Math.floor(nowSeconds - progress.started_at_ts);
      setElapsedTime(Math.max(0, diffSeconds)); // Never show negative
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);

    return () => clearInterval(timer);
  }, [progress?.started_at_ts, job?.status]);

  useEffect(() => {
    // Reset auto-finalize tracking when job changes
    autoFinalizeTriggeredRef.current = false;
    loadJobDetail();

    // Auto-refresh based on job status
    const interval = setInterval(async () => {
      // Skip polling when merge config modal is open to prevent flickering
      if (showMergeConfigModal) return;

      try {
        const jobData = await API.getJob(id);

        if (jobData.status === 'running' || jobData.status === 'awaiting_prompt') {
          loadJobDetail();
        } else if (['completed', 'failed', 'cancelled'].includes(jobData.status)) {
          clearInterval(interval);
          loadJobDetail();
        }

        // Auto-finalize: when job transitions to awaiting_prompt and has auto_finalize enabled
        if (
          jobData.status === 'awaiting_prompt' &&
          lastJobStatus === 'running' &&
          !autoFinalizeTriggeredRef.current
        ) {
          const params = jobData.parameters || {};
          if (params.auto_finalize && jobData.completed_segments > 0) {
            autoFinalizeTriggeredRef.current = true;
            showToast('Auto-finalizing video...', 'info');
            try {
              await API.finalizeJob(id);
              showToast('Video finalized successfully', 'success');
            } catch (err) {
              console.error('Auto-finalize failed:', err);
              showToast('Auto-finalize failed', 'error');
              autoFinalizeTriggeredRef.current = false; // Allow retry
            }
          }
        }

        setLastJobStatus(jobData.status);
      } catch (error) {
        console.error('Failed to check job status:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, showMergeConfigModal]); // Re-run when job ID or modal state changes

  // Load VR settings from API
  useEffect(() => {
    async function loadVRSettings() {
      try {
        const data = await API.getSettings();
        const s = data.settings || data;
        setVrSettings({
          eyeSeparation: parseFloat(s.vr_eye_separation) || 0.015,
          depthStrength: parseFloat(s.vr_depth_strength) || 0.5,
          equirectangular: s.vr_equirectangular === 'true',
          verticalFov: parseInt(s.vr_vertical_fov) || 90,
          depthSmoothing: parseFloat(s.vr_depth_smoothing) || 2.0,
          outputSharpening: parseFloat(s.vr_output_sharpening) || 0.3,
          outputWidth: parseInt(s.vr_output_width) || 4128,
          outputHeight: parseInt(s.vr_output_height) || 2208,
          upscaleEnabled: s.vr_video_upscale_enabled === 'true',
          upscaleFactor: parseInt(s.vr_upscale_factor) || 2,
          upscaleThreshold: parseInt(s.vr_upscale_threshold) || 1500,
          depthModel: s.vr_depth_model || 'depth_anything_v2',
          encodingPreset: s.vr_encoding_preset || 'balanced'
        });
      } catch (error) {
        console.error('Failed to load VR settings:', error);
      }
    }
    loadVRSettings();
  }, []);

  async function loadJobDetail() {
    try {
      const [jobData, segmentsData, logsData] = await Promise.all([
        API.getJob(id),
        API.getSegments(id),
        API.getJobLogs(id)
      ]);

      setJob(jobData);
      setSegments(segmentsData);
      setLogs(logsData.logs || []);
      setLoading(false);

      // Calculate next segment index for prompt submission
      const segmentWithoutPrompt = segmentsData.find(s => !s.prompt && s.status === 'pending');
      setNextSegmentIndex(segmentWithoutPrompt ? segmentWithoutPrompt.segment_index : segmentsData.length);

      // Load upscaled videos list
      if (jobData.status === 'completed') {
        try {
          const upscaledData = await API.getUpscaledVideos(id);
          setUpscaledVideos(upscaledData.videos || []);
        } catch {
          setUpscaledVideos([]);
        }

        // Load VR videos list
        try {
          const vrData = await API.getVRVideosForJob(id);
          setVrVideos(vrData.vr_videos || []);
        } catch {
          setVrVideos([]);
        }
      }
    } catch (error) {
      console.error('Failed to load job detail:', error);
      setLoading(false);
    }
  }

  async function handlePauseJob() {
    try {
      await API.pauseJob(id);
      showToast('Job paused', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to pause job:', error);
      showToast('Failed to pause job', 'error');
    }
  }

  async function handleMoveToTop() {
    try {
      await API.moveJobToTop(id);
      showToast('Job moved to top of queue', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to move job to top:', error);
      showToast('Failed to move job', 'error');
    }
  }

  async function handleMoveToBottom() {
    try {
      await API.moveJobToBottom(id);
      showToast('Job moved to bottom of queue', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to move job to bottom:', error);
      showToast('Failed to move job', 'error');
    }
  }

  async function handleUnpauseJob() {
    try {
      await API.unpauseJob(id);
      showToast('Job resumed', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to resume job:', error);
      showToast('Failed to resume job', 'error');
    }
  }

  async function handleRetryJob() {
    try {
      await API.retryJob(id);
      showToast('Job queued for retry', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to retry job:', error);
      showToast('Failed to retry job', 'error');
    }
  }

  function handleFinalizeClick() {
    // For single segment jobs, skip the modal and finalize directly
    const completedSegments = segments.filter(s => s.status === 'completed' && !s.deleted_at);
    if (completedSegments.length <= 1) {
      handleFinalizeJob(null);
    } else {
      setShowMergeConfigModal(true);
    }
  }

  async function handleFinalizeJob(offsets) {
    setShowMergeConfigModal(false);
    setFinalizing(true);
    showToast('Finalizing video... You can navigate away.', 'info');

    // Run finalization in background - don't await
    API.finalizeJob(id, offsets)
      .then(() => {
        showToast('Video finalized successfully!', 'success');
        // Reload if still on this page
        loadJobDetail().catch(() => {});
      })
      .catch((error) => {
        console.error('Failed to finalize job:', error);
        showToast('Failed to finalize job', 'error');
      })
      .finally(() => {
        setFinalizing(false);
      });
  }

  async function handleReopenJob() {
    try {
      await API.reopenJob(id);
      showToast('Job reopened', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to reopen job:', error);
      showToast('Failed to reopen job', 'error');
    }
  }

  async function handleUpscaleVideo() {
    setUpscaling(true);
    showToast('Starting video upscale... This may take a few minutes.', 'info');

    try {
      const result = await API.upscaleJobVideo(id, 2, 'realesr-animevideov3');
      showToast(`Video upscaled successfully (${result.scale}x)`, 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to upscale video:', error);
      showToast(error.message || 'Failed to upscale video', 'error');
    } finally {
      setUpscaling(false);
    }
  }

  async function handleDeleteUpscaledVideo(videoId, filename) {
    if (!confirm(`Delete upscaled video "${filename}"?`)) return;

    try {
      await API.deleteUpscaledVideo(videoId);
      showToast('Upscaled video deleted', 'success');
      // Refresh the list
      const upscaledData = await API.getUpscaledVideos(id);
      setUpscaledVideos(upscaledData.videos || []);
    } catch (error) {
      console.error('Failed to delete upscaled video:', error);
      showToast(error.message || 'Failed to delete upscaled video', 'error');
    }
  }

  async function handleGenerateVRVideo() {
    setGeneratingVR(true);
    showToast('Starting VR video generation...', 'info');

    try {
      const result = await API.generateVRVideo(
        id,
        vrSettings.eyeSeparation,
        vrSettings.depthStrength,
        vrSettings.equirectangular,
        vrSettings.verticalFov,
        vrSettings.depthSmoothing,
        vrSettings.outputSharpening,
        vrSettings.outputWidth,
        vrSettings.outputHeight,
        vrSettings.upscaleEnabled,
        vrSettings.upscaleFactor,
        vrSettings.upscaleThreshold,
        vrSettings.depthModel,
        vrSettings.encodingPreset
      );
      const vrVideoId = result.vr_video_id;

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const status = await API.getVRVideoStatus(vrVideoId);
          setVrProgress({
            framesProcessed: status.frames_processed || 0,
            frameCount: status.frame_count || 0,
            stage: status.current_stage || 'processing'
          });

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setGeneratingVR(false);
            setVrProgress(null);
            showToast('VR video generated successfully!', 'success');
            // Refresh VR videos list
            const vrData = await API.getVRVideosForJob(id);
            setVrVideos(vrData.vr_videos || []);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setGeneratingVR(false);
            setVrProgress(null);
            showToast(`VR generation failed: ${status.error_message}`, 'error');
          }
        } catch (error) {
          console.error('Error polling VR video status:', error);
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to start VR video generation:', error);
      showToast(error.message || 'Failed to start VR video generation', 'error');
      setGeneratingVR(false);
    }
  }

  async function handleDeleteVRVideo(vrVideoId) {
    if (!confirm('Delete this VR video?')) return;

    try {
      await API.deleteVRVideo(vrVideoId);
      showToast('VR video deleted', 'success');
      // Refresh the list
      const vrData = await API.getVRVideosForJob(id);
      setVrVideos(vrData.vr_videos || []);
    } catch (error) {
      console.error('Failed to delete VR video:', error);
      showToast(error.message || 'Failed to delete VR video', 'error');
    }
  }

  async function handleDeleteJob() {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      await API.deleteJob(id);
      showToast('Job deleted', 'success');
      navigate('/queue');
    } catch (error) {
      console.error('Failed to delete job:', error);
      showToast('Failed to delete job', 'error');
    }
  }

  async function handleDeleteSegment(segmentIndex) {
    if (!confirm(`Are you sure you want to delete Segment ${segmentIndex + 1}? (Data will be preserved but excluded from final video)`)) return;

    try {
      await API.deleteSegment(id, segmentIndex);
      showToast('Segment deleted (data preserved)', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to delete segment:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to delete segment';
      showToast(errorMessage, 'error');
    }
  }

  async function handleRestoreSegment(segmentIndex) {
    try {
      await API.restoreSegment(id, segmentIndex);
      showToast('Segment restored', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to restore segment:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to restore segment';
      showToast(errorMessage, 'error');
    }
  }

  async function handleToggleFade(segmentIndex, currentValue) {
    try {
      await API.updateSegmentFade(id, segmentIndex, !currentValue);
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to update fade setting:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to update fade setting';
      showToast(errorMessage, 'error');
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Job Detail</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div>
        <h1>Job Not Found</h1>
        <Button variant="outlined" onClick={() => navigate('/queue')}>
          Back to Queue
        </Button>
      </div>
    );
  }

  const params = job.parameters || {};
  const completedSegments = job.completed_segments ?? 0;
  const width = job.width ?? params.width ?? 640;
  const height = job.height ?? params.height ?? 640;
  const segmentDuration = job.segment_duration ?? params.segment_duration ?? 5;

  // Calculate display fps: new jobs have target_fps, legacy jobs have fps + frame_interpolation
  const displayFps = params.target_fps
    ? `${params.target_fps} fps`
    : params.frame_interpolation === '2x'
      ? `${(params.fps || 16) * 2} fps (legacy)`
      : `${params.fps || 16} fps (legacy)`;

  // Format time as mm:ss or hh:mm:ss
  function formatExecutionTime(seconds) {
    const num = parseFloat(seconds);
    if (!Number.isFinite(num) || num <= 0) return null;
    const hrs = Math.floor(num / 3600);
    const mins = Math.floor((num % 3600) / 60);
    const secs = Math.round(num % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  // Build defaultLoras array for SubmitPromptModal
  function buildDefaultLoras(segment) {
    if (!segment) return [];
    const highLoras = parseLoraArray(segment.high_lora);
    const lowLoras = parseLoraArray(segment.low_lora);

    const result = [];
    const maxLen = Math.max(highLoras.length, lowLoras.length);
    for (let i = 0; i < maxLen; i++) {
      const h = highLoras[i] || null;
      const l = lowLoras[i] || null;
      if (h || l) {
        result.push({
          high_file: getLoraFile(h),
          high_weight: getLoraWeight(h),
          low_file: getLoraFile(l),
          low_weight: getLoraWeight(l)
        });
      }
    }
    return result;
  }

  // Build defaultFaceswap object for SubmitPromptModal (from previous segment or job params)
  function buildDefaultFaceswap(segment, jobParams) {
    // First try to get from segment (previous segment's settings)
    if (segment && segment.faceswap_enabled) {
      return {
        enabled: Boolean(segment.faceswap_enabled),
        image: segment.faceswap_image || '',
        facesOrder: segment.faceswap_faces_order || 'left-right',
        facesIndex: segment.faceswap_faces_index || '0',
        sourceImage: segment.faceswap_source_image || ''
      };
    }
    // Fall back to job parameters (initial job settings)
    if (jobParams && jobParams.faceswap_enabled) {
      return {
        enabled: Boolean(jobParams.faceswap_enabled),
        image: jobParams.faceswap_image || '',
        facesOrder: jobParams.faceswap_faces_order || 'left-right',
        facesIndex: jobParams.faceswap_faces_index || '0',
        sourceImage: jobParams.faceswap_source_image || ''
      };
    }
    return null;
  }

  // Get faceswap display name from image filename
  function getFaceswapDisplayName(faceswapImage) {
    if (!faceswapImage) return null;
    // Extract name from filename like "Andrea_all.safetensors.png"
    let name = faceswapImage
      .replace('.safetensors.png', '')
      .replace('_all', '')
      .replace('_young', ' (Young)')
      .replace('_20251124', ' (2025)');
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  return (
    <div>
      <div className="detail-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>{job.name}</h1>
          <Button variant="outlined" onClick={() => navigate('/queue')}>
            ← Back to Queue
          </Button>
        </div>
      </div>

      {/* Final Video Output */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0 }}>Final Output</h2>
        {job.status === 'completed' ? (
          <>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Left side: Video and buttons */}
            <div style={{ flex: '0 0 auto' }}>
              <video
                key={`video-${id}-${job.completed_at}`}
                controls
                style={{ width: '100%', maxWidth: width >= height ? '500px' : '300px', borderRadius: '4px' }}
                src={API.getJobVideo(id)}
              >
                Your browser does not support video playback.
              </video>
              <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  href={API.getJobVideo(id)}
                  download={`${job.name}.webm`}
                >
                  Download Video
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleUpscaleVideo}
                  disabled={upscaling}
                  sx={{ borderColor: '#7b1fa2', color: '#7b1fa2', '&:hover': { borderColor: '#6a1b9a', bgcolor: 'rgba(123, 31, 162, 0.04)' } }}
                >
                  {upscaling ? (
                    <>
                      <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                      Upscaling...
                    </>
                  ) : (
                    'Upscale 2x'
                  )}
                </Button>
              </div>
            </div>

            {/* Right side: Upscaled Videos List */}
            {upscaledVideos.length > 0 && (
              <div style={{ flex: '1 1 300px', minWidth: '300px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#666' }}>Upscaled Videos</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {upscaledVideos.map((video) => (
                    <div
                      key={video.filename}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 12px',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px'
                      }}
                    >
                      <span style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {video.filename}
                      </span>
                      <span style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>
                        {(video.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <Button
                        variant="contained"
                        size="small"
                        href={`/api/upscaled-videos/${encodeURIComponent(video.filename)}/download`}
                        download={video.filename}
                        sx={{ bgcolor: '#7b1fa2', '&:hover': { bgcolor: '#6a1b9a' }, minWidth: 'auto', px: 2 }}
                      >
                        Download
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => handleDeleteUpscaledVideo(video.id, video.filename)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* VR Video Section */}
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f8f8f8', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>VR 180 Stereo Video</h3>
              <Button
                variant="contained"
                onClick={handleGenerateVRVideo}
                disabled={generatingVR}
                sx={{ bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' } }}
              >
                {generatingVR ? 'Generating...' : 'Generate VR Video'}
              </Button>
            </div>

            {generatingVR && vrProgress && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Stage: {vrProgress.stage} - Frame {vrProgress.framesProcessed} / {vrProgress.frameCount}
                </Typography>
                <LinearProgress
                  variant={vrProgress.frameCount > 0 ? "determinate" : "indeterminate"}
                  value={vrProgress.frameCount > 0 ? (vrProgress.framesProcessed / vrProgress.frameCount) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            {vrVideos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {vrVideos.map((video) => (
                  <div
                    key={video.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      backgroundColor: '#fff',
                      borderRadius: '4px',
                      border: '1px solid #ddd'
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '14px' }}>
                      {video.status === 'completed' ? 'VR Video' : video.status === 'processing' ? 'Processing...' : video.status}
                    </span>
                    {video.status === 'completed' && (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          href={API.getVRVideoUrl(video.id)}
                          download
                          sx={{ bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' }, minWidth: 'auto', px: 2 }}
                        >
                          Download
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => handleDeleteVRVideo(video.id)}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                    {video.status === 'failed' && (
                      <span style={{ color: '#d32f2f', fontSize: '12px' }}>{video.error_message}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!generatingVR && vrVideos.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Convert this video to VR 180 stereoscopic format for viewing on VR headsets.
              </Typography>
            )}
          </div>
          </>
        ) : (
          <div className="placeholder-box">
            {job.status === 'running' ? (
              <Box sx={{ width: '100%', maxWidth: 400, mx: 'auto' }}>
                <Typography variant="body1" sx={{ mb: 2, textAlign: 'center' }}>
                  Generating...
                </Typography>
                {progress && progress.status === 'running' && progress.total_steps > 0 ? (
                  <>
                    <LinearProgress
                      variant="determinate"
                      value={progress.percent}
                      sx={{ height: 10, borderRadius: 5, mb: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                      {progress.current_step} / {progress.total_steps} nodes ({progress.percent}%)
                    </Typography>
                    {elapsedTime !== null && (
                      <Typography variant="body2" sx={{ textAlign: 'center', mt: 1, fontFamily: 'monospace', color: 'text.secondary' }}>
                        {formatElapsedTime(elapsedTime)} elapsed
                        {etaSeconds !== null && etaSeconds > 0 && ` · ~${formatTime(etaSeconds)} remaining`}
                      </Typography>
                    )}
                  </>
                ) : (
                  <>
                    <LinearProgress sx={{ height: 10, borderRadius: 5 }} />
                    {elapsedTime !== null && (
                      <Typography variant="body2" sx={{ textAlign: 'center', mt: 1, fontFamily: 'monospace', color: 'text.secondary' }}>
                        {formatElapsedTime(elapsedTime)} elapsed
                        {etaSeconds !== null && etaSeconds > 0 && ` · ~${formatTime(etaSeconds)} remaining`}
                      </Typography>
                    )}
                  </>
                )}
              </Box>
            ) : '📹 Video will appear here when complete'}
          </div>
        )}
      </div>

      {/* Job Details */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Job Details</h2>
        <div className="detail-meta">
          <div className="detail-meta-item">
            <label>Status</label>
            <div className="value">
              <StatusChip status={job.status} />
            </div>
          </div>
          {job.status === 'pending' && job.queue_position && (
            <div className="detail-meta-item">
              <label>Queue Position</label>
              <div className="value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>#{job.queue_position}</span>
                <IconButton
                  size="small"
                  onClick={handleMoveToTop}
                  title="Move to top of queue"
                  sx={{ padding: '4px' }}
                >
                  <KeyboardDoubleArrowUpIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={handleMoveToBottom}
                  title="Move to bottom of queue"
                  sx={{ padding: '4px' }}
                >
                  <KeyboardDoubleArrowDownIcon fontSize="small" />
                </IconButton>
              </div>
            </div>
          )}
          <div className="detail-meta-item">
            <label>Segments</label>
            <div className="value">{completedSegments} segments completed</div>
          </div>
          {totalExecutionTime > 0 && (
            <div className="detail-meta-item">
              <label>Total Run Time</label>
              <div className="value">{formatExecutionTime(totalExecutionTime)}</div>
            </div>
          )}
          <div className="detail-meta-item">
            <label>Dimensions</label>
            <div className="value">{width}x{height}</div>
          </div>
          <div className="detail-meta-item">
            <label>Segment Duration</label>
            <div className="value">{segmentDuration}s per segment</div>
          </div>
          <div className="detail-meta-item">
            <label>Output FPS</label>
            <div className="value">{displayFps}</div>
          </div>
          <div className="detail-meta-item">
            <label>Seed</label>
            <div className="value">
              {job.seed ?? 'N/A'}
            </div>
          </div>
          <div className="detail-meta-item">
            <label>Face Swap</label>
            <div className="value">
              {params.faceswap_enabled
                ? (params.faceswap_source_image
                    ? 'From Frame'
                    : params.faceswap_image?.replace('.safetensors.png', '') || 'Enabled')
                : 'N/A'}
            </div>
          </div>
          <div className="detail-meta-item">
            <label>Created</label>
            <div className="value">{formatDate(job.created_at)}</div>
          </div>
          {job.completed_at && (
            <div className="detail-meta-item">
              <label>Completed</label>
              <div className="value">{formatDate(job.completed_at)}</div>
            </div>
          )}
          {job.input_image && (
            <div className="detail-meta-item">
              <label>Starting Image</label>
              <div className="value">
                {job.input_image.split('/').slice(-3).join('/')}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {(job.status === 'pending' || job.status === 'awaiting_prompt' || job.status === 'failed') && (
            <Button
              variant="contained"
              onClick={() => setShowEditModal(true)}
              sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
            >
              Edit Settings
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={() => setShowCloneModal(true)}
            sx={{ borderColor: '#1976d2', color: '#1976d2', '&:hover': { borderColor: '#1565c0', bgcolor: 'rgba(25, 118, 210, 0.04)' } }}
          >
            Clone Job
          </Button>
          {(job.status === 'pending' || job.status === 'awaiting_prompt') && (
            <Button
              variant="outlined"
              onClick={handlePauseJob}
              sx={{ borderColor: '#9c27b0', color: '#9c27b0', '&:hover': { borderColor: '#7b1fa2', bgcolor: 'rgba(156, 39, 176, 0.04)' } }}
            >
              Pause Job
            </Button>
          )}
          {job.status === 'paused' && (
            <Button variant="contained" onClick={handleUnpauseJob}>
              Resume Job
            </Button>
          )}
          {job.status === 'failed' && (
            <Button variant="contained" onClick={handleRetryJob}>
              Retry Job
            </Button>
          )}
          {job.status === 'completed' && (
            <Button
              variant="contained"
              onClick={handleReopenJob}
              sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
            >
              Reopen Job & Continue
            </Button>
          )}
          {!['running'].includes(job.status) && (
            <Button
              variant="contained"
              onClick={handleDeleteJob}
              color="error"
            >
              Delete Job
            </Button>
          )}
        </div>
      </div>

      {/* Segments Timeline */}
      <div className="segments-timeline">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>Segments Timeline</h2>
          {segments.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowNotesModal(true)}
              sx={{ borderColor: '#7b1fa2', color: '#7b1fa2', '&:hover': { borderColor: '#6a1b9a', bgcolor: 'rgba(123, 31, 162, 0.04)' } }}
            >
              Segment Notes
            </Button>
          )}
        </div>

        {segments.length === 0 ? (
          <div className="alert info">No segments yet</div>
        ) : (() => {
          // Separate active and deleted segments
          const activeSegments = segments.filter(s => !s.deleted_at);
          const deletedSegments = segments.filter(s => !!s.deleted_at);

          // Helper function to render a segment
          const renderSegment = (seg, displayNumber, isDeleted) => {
            // Can delete any non-deleted segment when job is not finalized
            const canDelete = !isDeleted && job.status === 'awaiting_prompt';
            // Can restore deleted segments when job is not finalized
            const canRestore = isDeleted && job.status === 'awaiting_prompt';

            // Can toggle fade on completed, non-deleted segments when job is not finalized
            const canToggleFade = !isDeleted && seg.status === 'completed' && job.status === 'awaiting_prompt';

            // Can edit pending segments when job is not running or completed
            const canEdit = !isDeleted && seg.status === 'pending' && ['pending', 'awaiting_prompt', 'paused'].includes(job.status);

            return (
              <div key={seg.id}>
                <div
                  className="segment-item"
                  style={isDeleted ? { opacity: 0.5, backgroundColor: '#f5f5f5' } : {}}
                >
                <div className="segment-header">
                  <div>
                    <strong style={isDeleted ? { textDecoration: 'line-through', color: '#999' } : {}}>
                      Segment {displayNumber}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StatusChip status={isDeleted ? 'deleted' : seg.status} />
                    {canEdit && (
                      <Button
                        variant="outlined"
                        color="primary"
                        size="small"
                        onClick={() => setEditingSegment(seg)}
                        startIcon={<EditIcon />}
                        sx={{ minWidth: 'auto' }}
                      >
                        Edit
                      </Button>
                    )}
                    {canRestore && (
                      <Button
                        variant="outlined"
                        color="primary"
                        size="small"
                        onClick={() => handleRestoreSegment(seg.segment_index)}
                        startIcon={<span>↩️</span>}
                        sx={{ minWidth: 'auto' }}
                      >
                        Restore
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => handleDeleteSegment(seg.segment_index)}
                        startIcon={<span>🗑️</span>}
                        sx={{ minWidth: 'auto' }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {/* Timestamp Row */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 12px',
                  backgroundColor: '#fafafa',
                  borderBottom: '1px solid #eee',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  <span>
                    {seg.created_at ? formatDate(seg.created_at) : '--'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {seg.status === 'running' ? (
                      <CircularProgress size={12} />
                    ) : seg.execution_time ? (
                      formatExecutionTime(seg.execution_time)
                    ) : (
                      '--'
                    )}
                  </span>
                  <span>
                    {seg.completed_at ? formatDate(seg.completed_at) : '--'}
                  </span>
                </div>

              <div className="segment-content">
                {/* Start Image */}
                <div className="segment-image-container">
                  <div className="segment-image-label">
                    Start Image
                    {seg.custom_start_image && (
                      <span style={{ marginLeft: '6px', fontSize: '10px', color: '#1976d2', fontWeight: 'normal' }}>(custom)</span>
                    )}
                  </div>
                  {seg.custom_start_image ? (
                    <img
                      src={seg.custom_start_image.startsWith('comfyui:')
                        ? API.getComfyUIImage(seg.custom_start_image.slice(8))
                        : API.getRepoImage(seg.custom_start_image)}
                      alt="Custom start image"
                      className="segment-image start clickable"
                      style={{ border: '2px solid #1976d2' }}
                      onClick={() => setLightboxImage(
                        seg.custom_start_image.startsWith('comfyui:')
                          ? API.getComfyUIImage(seg.custom_start_image.slice(8))
                          : API.getRepoImage(seg.custom_start_image)
                      )}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  ) : seg.start_image_url ? (
                    <img
                      src={seg.start_image_url}
                      alt={seg.start_image_url}
                      className="segment-image start clickable"
                      onClick={() => setLightboxImage(seg.start_image_url)}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  ) : (
                    <div className="image-placeholder pending">
                      Pending
                    </div>
                  )}
                </div>

                {/* Prompt Section */}
                <div className="segment-prompt">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1 }}><strong>Prompt:</strong> {seg.prompt || 'TBD'}</div>
                    {seg.prompt && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(seg.prompt)
                            .then(() => showToast('Prompt copied', 'success'))
                            .catch(() => showToast('Failed to copy prompt', 'error'));
                        }}
                        sx={{ padding: '2px', opacity: 0.6, '&:hover': { opacity: 1 } }}
                        title="Copy prompt"
                      >
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </div>
                  {(() => {
                    const loraInfo = formatLorasDisplay(seg.high_lora, seg.low_lora);
                    if (loraInfo.count === 0) {
                      return <div><strong>LoRAs:</strong> N/A</div>;
                    }
                    return (
                      <div style={{ marginTop: '8px' }}>
                        <strong>LoRAs:</strong>
                        <table style={{
                          marginTop: '6px',
                          fontSize: '13px',
                          borderCollapse: 'collapse',
                          width: '100%'
                        }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #ddd' }}>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#666', width: '30px' }}>#</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#2e7d32' }}>High LoRA</th>
                              <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: '#2e7d32', width: '50px' }}>Wt</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#1565c0' }}>Low LoRA</th>
                              <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: '#1565c0', width: '50px' }}>Wt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loraInfo.pairs.map((pair, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '6px 12px', color: '#999' }}>{pair.index}</td>
                                <td style={{ padding: '6px 12px', color: '#2e7d32' }}>
                                  {pair.highLora ? (
                                    <span
                                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                      onClick={() => setSelectedLoraForEdit(pair.highLora)}
                                    >
                                      {pair.high}
                                    </span>
                                  ) : (pair.high || '-')}
                                </td>
                                <td style={{ padding: '6px 12px', textAlign: 'center', color: '#666' }}>
                                  {pair.high ? pair.highWeight : '-'}
                                </td>
                                <td style={{ padding: '6px 12px', color: '#1565c0' }}>
                                  {pair.lowLora ? (
                                    <span
                                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                      onClick={() => setSelectedLoraForEdit(pair.lowLora)}
                                    >
                                      {pair.low}
                                    </span>
                                  ) : (pair.low || '-')}
                                </td>
                                <td style={{ padding: '6px 12px', textAlign: 'center', color: '#666' }}>
                                  {pair.low ? pair.lowWeight : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                  {/* Per-segment Faceswap Info */}
                  <div style={{ marginTop: '8px' }}>
                    <strong>Face Swap:</strong>{' '}
                    {seg.faceswap_enabled ? (
                      <span style={{ color: '#7b1fa2' }}>
                        {seg.faceswap_source_image
                          ? 'From Frame'
                          : getFaceswapDisplayName(seg.faceswap_image) || 'Enabled'}
                      </span>
                    ) : (
                      <span style={{ color: '#999' }}>N/A</span>
                    )}
                  </div>
                </div>

                {/* End Image */}
                <div className="segment-image-container">
                  <div className="segment-image-label">End Image</div>
                  {seg.status === 'completed' && seg.end_frame_url ? (
                    <>
                      <img
                        src={seg.end_frame_url}
                        alt="End frame"
                        className="segment-image end clickable"
                        onClick={() => setLightboxImage(seg.end_frame_url)}
                        onError={(e) => e.target.style.display = 'none'}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSegmentVideoIndex(seg.segment_index);
                          setSegmentVideoKey(Date.now());
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#1976d2',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px 0',
                          textDecoration: 'underline',
                          marginTop: '4px',
                          display: 'block'
                        }}
                      >
                        View segment video
                      </button>
                    </>
                  ) : seg.status === 'running' ? (
                    <div className="image-placeholder running">
                      {progress && progress.status === 'running' && progress.total_steps > 0 ? (
                        <Box sx={{ width: '100%', p: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                            <CircularProgress size={20} sx={{ mr: 1 }} />
                            <Typography variant="body2" color="text.secondary">
                              {progress.percent}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={progress.percent}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
                            {progress.current_step} / {progress.total_steps} nodes
                          </Typography>
                          {elapsedTime !== null && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center', fontFamily: 'monospace' }}>
                              {formatElapsedTime(elapsedTime)}
                              {etaSeconds !== null && etaSeconds > 0 && ` · ~${formatTime(etaSeconds)} left`}
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <Box sx={{ textAlign: 'center' }}>
                          <CircularProgress size={24} />
                          {elapsedTime !== null && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontFamily: 'monospace' }}>
                              {formatElapsedTime(elapsedTime)}
                              {etaSeconds !== null && etaSeconds > 0 && ` · ~${formatTime(etaSeconds)} left`}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </div>
                  ) : (
                    <div className="image-placeholder pending">
                      Pending
                    </div>
                  )}
                </div>
              </div>
            </div>

                {/* Transition Row - editable for non-finalized */}
                {canToggleFade && (
                  <div
                    style={{
                      padding: '12px 16px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      marginBottom: '12px',
                      backgroundColor: '#fafafa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Checkbox
                      checked={Number(seg.fade_to_black) === 1}
                      onChange={() => handleToggleFade(seg.segment_index, Number(seg.fade_to_black) === 1)}
                      size="small"
                      sx={{ padding: '4px' }}
                    />
                    <SwitchVideoIcon sx={{ color: Number(seg.fade_to_black) === 1 ? '#ff9800' : '#999', fontSize: 20 }} />
                    <span style={{ fontSize: '13px', color: Number(seg.fade_to_black) === 1 ? '#e65100' : '#666' }}>
                      2 second fade transition
                    </span>
                  </div>
                )}
                {/* Read-only fade indicator for finalized jobs */}
                {!canToggleFade && seg.status === 'completed' && !isDeleted && job.status === 'completed' && Number(seg.fade_to_black) === 1 && (
                  <div
                    style={{
                      padding: '12px 16px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      marginBottom: '12px',
                      backgroundColor: '#fafafa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <SwitchVideoIcon sx={{ color: '#ff9800', fontSize: 20 }} />
                    <span style={{ fontSize: '13px', color: '#e65100' }}>
                      2 second fade transition
                    </span>
                  </div>
                )}
              </div>
            );
          };

          return (
            <>
              {/* Render active segments with sequential numbering */}
              {activeSegments.map((seg, idx) => renderSegment(seg, idx + 1, false))}

              {/* Deleted segments section - collapsible */}
              {deletedSegments.length > 0 && (
                <>
                  <div
                    onClick={() => setDeletedSegmentsExpanded(!deletedSegmentsExpanded)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#f5f5f5',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    {deletedSegmentsExpanded ? (
                      <ExpandLessIcon sx={{ color: '#666' }} />
                    ) : (
                      <ExpandMoreIcon sx={{ color: '#666' }} />
                    )}
                    <span style={{ color: '#666', fontWeight: 500 }}>
                      Deleted Segments ({deletedSegments.length})
                    </span>
                  </div>

                  {/* Render deleted segments when expanded */}
                  {deletedSegmentsExpanded && deletedSegments.map(seg =>
                    renderSegment(seg, seg.segment_index + 1, true)
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* Continue or Finalize */}
        {job.status === 'awaiting_prompt' && (
          <div className="next-segment-prompt">
            <h3>Next Step</h3>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
              <Button
                variant="contained"
                onClick={() => setShowPromptModal(true)}
                style={{ flex: lastCompletedSegment ? 1 : 'none' }}
              >
                {lastCompletedSegment ? 'Continue with Next Segment' : 'Submit First Segment'}
              </Button>
              {lastCompletedSegment && (
                <>
                  <div style={{ color: '#666', fontWeight: 500 }}>OR</div>
                  <Button
                    variant="contained"
                    onClick={handleFinalizeClick}
                    disabled={finalizing}
                    sx={{ flex: 1, bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
                  >
                    {finalizing ? (
                      <>
                        <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                        Finalizing...
                      </>
                    ) : (
                      'Finalize & Merge'
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer'
          }}
          onClick={() => setLogsExpanded(!logsExpanded)}
        >
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>
            Activity Log {logs.length > 0 && <span style={{ color: '#666', fontWeight: 'normal' }}>({logs.length})</span>}
          </h2>
          <span style={{ fontSize: '20px', color: '#666' }}>
            {logsExpanded ? '▼' : '▶'}
          </span>
        </div>

        {logsExpanded && (
          <div style={{ marginTop: '16px' }}>
            {logs.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No activity logs yet</p>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ textAlign: 'left', padding: '8px', width: '140px' }}>Time</th>
                      <th style={{ textAlign: 'left', padding: '8px', width: '60px' }}>Level</th>
                      <th style={{ textAlign: 'left', padding: '8px', width: '50px' }}>Seg</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const levelColors = {
                        INFO: { bg: '#e3f2fd', text: '#1565c0' },
                        WARN: { bg: '#fff3e0', text: '#ef6c00' },
                        ERROR: { bg: '#ffebee', text: '#c62828' }
                      };
                      const levelStyle = levelColors[log.level] || { bg: '#f5f5f5', text: '#666' };

                      return (
                        <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#666' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: levelStyle.bg,
                              color: levelStyle.text,
                              fontWeight: 500,
                              fontSize: '11px'
                            }}>
                              {log.level}
                            </span>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', color: '#666' }}>
                            {log.segment_index !== null ? log.segment_index + 1 : '-'}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div>{log.message}</div>
                            {log.details && (
                              <pre style={{
                                margin: '4px 0 0 0',
                                padding: '8px',
                                backgroundColor: '#f5f5f5',
                                borderRadius: '4px',
                                fontSize: '11px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: '100px',
                                overflow: 'auto'
                              }}>
                                {log.details}
                              </pre>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showPromptModal && (
        <SubmitPromptModal
          jobId={id}
          segmentIndex={nextSegmentIndex}
          defaultPrompt={lastCompletedSegment?.prompt || ''}
          defaultLoras={buildDefaultLoras(lastCompletedSegment)}
          defaultFaceswap={buildDefaultFaceswap(lastCompletedSegment, job?.parameters)}
          defaultStartImageUrl={lastCompletedSegment?.end_frame_url || null}
          jobInputImage={job?.input_image}
          segments={segments}
          onClose={() => setShowPromptModal(false)}
          onSuccess={() => {
            setShowPromptModal(false);
            loadJobDetail();
          }}
        />
      )}

      {editingSegment && (
        <SubmitPromptModal
          jobId={id}
          segmentIndex={editingSegment.segment_index}
          defaultPrompt={editingSegment.prompt || ''}
          defaultLoras={buildDefaultLoras(editingSegment)}
          defaultFaceswap={buildDefaultFaceswap(editingSegment, job?.parameters)}
          defaultStartImageUrl={editingSegment.start_image_url || null}
          defaultCustomStartImage={editingSegment.custom_start_image || null}
          isEditing={true}
          jobInputImage={job?.input_image}
          segments={segments}
          onClose={() => setEditingSegment(null)}
          onSuccess={() => {
            setEditingSegment(null);
            loadJobDetail();
          }}
        />
      )}

      {showCloneModal && (
        <CreateJobModal
          cloneData={job}
          onClose={() => setShowCloneModal(false)}
          onSuccess={(newJobId) => {
            setShowCloneModal(false);
            showToast('Job cloned successfully', 'success');
            navigate(`/job/${newJobId}`);
          }}
        />
      )}

      {showEditModal && (
        <EditJobModal
          job={job}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            loadJobDetail();
          }}
        />
      )}

      {selectedLoraForEdit && (
        <LoraEditModal
          lora={selectedLoraForEdit}
          onClose={() => setSelectedLoraForEdit(null)}
          onSave={() => {
            setSelectedLoraForEdit(null);
            loadJobDetail();
          }}
        />
      )}

      {showNotesModal && (
        <SegmentNotesModal
          jobId={id}
          segments={segments}
          onClose={() => setShowNotesModal(false)}
          onUpdate={() => loadJobDetail()}
        />
      )}

      {showMergeConfigModal && (
        <MergeConfigModal
          open={showMergeConfigModal}
          onClose={() => setShowMergeConfigModal(false)}
          jobId={id}
          segments={segments}
          onFinalize={handleFinalizeJob}
        />
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxImage(null)}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage} alt="Full size" />
            <button
              className="lightbox-close"
              onClick={() => setLightboxImage(null)}
            >
              ×
            </button>
            <div className="lightbox-info">
              Click outside or press × to close
            </div>
          </div>
        </div>
      )}

      {/* Segment Video Modal */}
      {segmentVideoIndex !== null && (
        <div
          className="lightbox-overlay"
          onClick={() => setSegmentVideoIndex(null)}
        >
          <div
            className="lightbox-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '800px' }}
          >
            <video
              src={`${API.getSegmentVideo(id, segmentVideoIndex)}?t=${segmentVideoKey}`}
              controls
              autoPlay
              playsInline
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '4px' }}
            />
            <button
              className="lightbox-close"
              onClick={() => setSegmentVideoIndex(null)}
            >
              ×
            </button>
            <div className="lightbox-info">
              Segment {segmentVideoIndex + 1} • Click outside or press × to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
