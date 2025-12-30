import { useState, useEffect } from 'react';
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

  useEffect(() => {
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

        setLastJobStatus(jobData.status);
      } catch (error) {
        console.error('Failed to check job status:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id]); // Only re-run when job ID changes

  async function loadJobDetail() {
    try {
      const [jobData, segmentsData] = await Promise.all([
        API.getJob(id),
        API.getSegments(id)
      ]);

      setJob(jobData);
      setSegments(segmentsData);
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
              <div className="value" style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                wordBreak: 'break-all'
              }}>
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
                  <div><strong>High lora:</strong> {seg.high_lora || 'N/A'}</div>
                  <div><strong>Low lora:</strong> {seg.low_lora || 'N/A'}</div>
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
                style={{ flex: 1 }}
              >
                Continue with Next Segment
              </Button>
              <div style={{ color: '#666', fontWeight: 500 }}>OR</div>
              <Button
                variant="contained"
                onClick={handleFinalizeJob}
                sx={{ flex: 1, bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
              >
                Finalize & Merge
              </Button>
            </div>
          </div>
        )}
      </div>

      {showPromptModal && (
        <SubmitPromptModal
          jobId={id}
          segmentIndex={nextSegmentIndex}
          defaultPrompt={lastCompletedSegment?.prompt || ''}
          defaultHighLora={lastCompletedSegment?.high_lora || ''}
          defaultLowLora={lastCompletedSegment?.low_lora || ''}
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
