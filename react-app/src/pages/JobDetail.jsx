import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import API from '../api/client';
import { formatDate, showToast } from '../utils/helpers';
import SubmitPromptModal from '../components/SubmitPromptModal';
import CreateJobModal from '../components/CreateJobModal';
import EditJobModal from '../components/EditJobModal';
import StatusChip from '../components/StatusChip';
import './JobDetail.css';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [nextSegmentIndex, setNextSegmentIndex] = useState(0);
  const [lastJobStatus, setLastJobStatus] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [loraLibrary, setLoraLibrary] = useState([]);
  const autoFinalizeTriggeredRef = useRef(false);

  useEffect(() => {
    // Reset auto-finalize tracking when job changes
    autoFinalizeTriggeredRef.current = false;
    loadJobDetail();

    // Auto-refresh based on job status
    const interval = setInterval(async () => {
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
  }, [id]); // Only re-run when job ID changes

  async function loadJobDetail() {
    try {
      const [jobData, segmentsData, logsData, loraData] = await Promise.all([
        API.getJob(id),
        API.getSegments(id),
        API.getJobLogs(id),
        API.getLoraLibrary()
      ]);

      setJob(jobData);
      setSegments(segmentsData);
      setLogs(logsData.logs || []);
      setLoraLibrary(loraData.loras || []);
      setLoading(false);

      // Calculate next segment index for prompt submission
      const segmentWithoutPrompt = segmentsData.find(s => !s.prompt && s.status === 'pending');
      setNextSegmentIndex(segmentWithoutPrompt ? segmentWithoutPrompt.segment_index : segmentsData.length);
    } catch (error) {
      console.error('Failed to load job detail:', error);
      setLoading(false);
    }
  }

  async function handleCancelJob() {
    if (!confirm('Are you sure you want to cancel this job?')) return;

    try {
      await API.cancelJob(id);
      showToast('Job cancelled', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to cancel job:', error);
      showToast('Failed to cancel job', 'error');
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

  async function handleFinalizeJob() {
    try {
      await API.finalizeJob(id);
      showToast('Job finalization started', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to finalize job:', error);
      showToast('Failed to finalize job', 'error');
    }
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
    if (!confirm(`Are you sure you want to delete Segment ${segmentIndex + 1}?`)) return;

    try {
      await API.deleteSegment(id, segmentIndex);
      showToast('Segment deleted successfully', 'success');
      await loadJobDetail();
    } catch (error) {
      console.error('Failed to delete segment:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to delete segment';
      showToast(errorMessage, 'error');
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Job Detail</h1>
        <p>Loading...</p>
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
  const fps = job.fps ?? params.fps ?? 16;

  const lastCompletedSegment = segments.filter(s => s.status === 'completed').pop();

  // Helper to parse LoRA data from segment (could be JSON arrays or single strings)
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

  // Helper to extract file from lora data (handles both old string format and new object format)
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

  // Look up friendly name from LoRA library by filename
  function getLoraFriendlyName(filename) {
    if (!filename) return null;
    // Extract just the filename if it's a path
    const baseName = filename.split('/').pop();
    // Find matching LoRA in library (check both high_file and low_file)
    const match = loraLibrary.find(l =>
      l.high_file === filename || l.low_file === filename ||
      (l.high_file && l.high_file.split('/').pop() === baseName) ||
      (l.low_file && l.low_file.split('/').pop() === baseName)
    );
    if (match) {
      return match.friendly_name || match.base_name || baseName.replace('.safetensors', '');
    }
    // Fallback to cleaned filename
    return baseName.replace('.safetensors', '');
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

  // Format LoRAs for display (includes weights and friendly names)
  function formatLorasDisplay(highLora, lowLora) {
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
      // Use friendly name lookup instead of raw filename
      const h = hFile ? getLoraFriendlyName(hFile) : null;
      const l = lFile ? getLoraFriendlyName(lFile) : null;
      if (h || l) {
        pairs.push({
          high: h,
          highWeight: hWeight,
          low: l,
          lowWeight: lWeight,
          index: i + 1
        });
      }
    }
    return { pairs, count: pairs.length };
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
          <div>
            <video
              key={`video-${id}-${job.completed_at}`}
              controls
              style={{ width: '100%', maxWidth: width >= height ? '500px' : '300px', borderRadius: '4px' }}
              src={API.getJobVideo(id)}
            >
              Your browser does not support video playback.
            </video>
            <div style={{ marginTop: '12px' }}>
              <Button
                variant="contained"
                href={API.getJobVideo(id)}
                download={`${job.name}.webm`}
              >
                Download Video
              </Button>
            </div>
          </div>
        ) : (
          <div className="placeholder-box">
            {job.status === 'running' ? '⏳ Generating...' : '📹 Video will appear here when complete'}
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
          <div className="detail-meta-item">
            <label>Segments</label>
            <div className="value">{completedSegments} segments completed</div>
          </div>
          <div className="detail-meta-item">
            <label>Dimensions</label>
            <div className="value">{width}x{height}</div>
          </div>
          <div className="detail-meta-item">
            <label>Segment Duration</label>
            <div className="value">{segmentDuration}s per segment</div>
          </div>
          <div className="detail-meta-item">
            <label>FPS</label>
            <div className="value">{fps} fps</div>
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
                ? (params.faceswap_image?.replace('.safetensors.png', '') || 'Enabled')
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
          {(job.status === 'pending' || job.status === 'awaiting_prompt') && (
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
          {job.status === 'running' && (
            <Button variant="outlined" onClick={handleCancelJob}>
              Cancel Job
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
        <h2>Segments Timeline</h2>

        {segments.length === 0 ? (
          <div className="alert info">No segments yet</div>
        ) : (
          segments.map((seg, index) => {
            // Check if this is the last segment
            const isLastSegment = index === segments.length - 1;
            const canDelete = job.status === 'awaiting_prompt' && isLastSegment;

            return (
              <div key={seg.id} className="segment-item">
                <div className="segment-header">
                  <div>
                    <strong>Segment {seg.segment_index + 1}</strong>
                    {seg.status === 'running' && <span className="spinner"></span>}
                    {seg.execution_time && (
                      <span style={{ marginLeft: '8px', color: '#666', fontSize: '12px' }}>
                        ({Math.round(seg.execution_time)}s)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StatusChip status={seg.status} />
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

              <div className="segment-content">
                {/* Start Image */}
                <div className="segment-image-container">
                  <div className="segment-image-label">Start Image</div>
                  {seg.start_image_url ? (
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
                  <div><strong>Prompt:</strong> {seg.prompt || 'TBD'}</div>
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
                                  {pair.high || '-'}
                                </td>
                                <td style={{ padding: '6px 12px', textAlign: 'center', color: '#666' }}>
                                  {pair.high ? pair.highWeight : '-'}
                                </td>
                                <td style={{ padding: '6px 12px', color: '#1565c0' }}>
                                  {pair.low || '-'}
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
                </div>

                {/* End Image */}
                <div className="segment-image-container">
                  <div className="segment-image-label">End Image</div>
                  {seg.status === 'completed' && seg.end_frame_url ? (
                    <img
                      src={seg.end_frame_url}
                      alt="End frame"
                      className="segment-image end clickable"
                      onClick={() => setLightboxImage(seg.end_frame_url)}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  ) : seg.status === 'running' ? (
                    <div className="image-placeholder running">
                      <span className="spinner" style={{ margin: 0 }}></span>
                    </div>
                  ) : (
                    <div className="image-placeholder pending">
                      Pending
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}

        {/* Continue or Finalize */}
        {job.status === 'awaiting_prompt' && (
          <div className="next-segment-prompt">
            <h3>Next Step</h3>
            {lastCompletedSegment && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ color: '#666', marginBottom: '8px' }}>
                  Last completed frame (this will be the start of your next segment):
                </p>
                <img
                  src={API.getSegmentFrame(id, lastCompletedSegment.segment_index)}
                  alt="Last frame"
                  style={{ maxWidth: '300px', borderRadius: '4px', border: '1px solid #ddd' }}
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>
            )}

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
                    onClick={handleFinalizeJob}
                    sx={{ flex: 1, bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
                  >
                    Finalize & Merge
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
          onClose={() => setShowPromptModal(false)}
          onSuccess={() => {
            setShowPromptModal(false);
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
    </div>
  );
}
