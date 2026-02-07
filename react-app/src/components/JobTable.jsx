import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import FaceIcon from '@mui/icons-material/Face';
import API from '../api/client';
import { formatDate, showToast, hasFaceswap } from '../utils/helpers';
import StatusChip from './StatusChip';
import PaginationControl from './PaginationControl';
import { JobThumbnail } from './VideoPlayer';

/**
 * Reusable job table component used on Queue and Dashboard pages.
 *
 * Props:
 * - jobs: Array of job objects (already filtered/sorted by parent)
 * - showPriorityControls: Whether to show the queue position column with move buttons
 * - onRefresh: Callback to refresh jobs after priority changes
 * - storageKey: localStorage key prefix for pagination preferences
 * - emptyMessage: Message to show when no jobs match
 */
export default function JobTable({
  jobs,
  showPriorityControls = false,
  onRefresh,
  storageKey = 'jobTable',
  emptyMessage = 'No jobs match the filter'
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}_rowsPerPage`);
    return saved ? parseInt(saved, 10) : 10;
  });

  function handleChangePage(event, newPage) {
    setPage(newPage);
  }

  function handleChangeRowsPerPage(newPageSize) {
    setRowsPerPage(newPageSize);
    localStorage.setItem(`${storageKey}_rowsPerPage`, String(newPageSize));
    setPage(1);
  }

  function getQueuePosition(job) {
    if (job.status !== 'pending') return null;
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    const position = pendingJobs.findIndex(j => j.id === job.id);
    return position >= 0 ? position + 1 : null;
  }

  function formatWaitTime(seconds) {
    if (seconds == null || seconds <= 0) return null;
    seconds = Math.round(seconds);
    if (seconds < 60) return '<1m';
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `~${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `~${hours}h ${remainingMins}m`;
  }

  async function handleMoveUp(jobId, event) {
    event.stopPropagation();
    try {
      await API.moveJobUp(jobId);
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to move job up:', error);
      showToast('Failed to move job', 'error');
    }
  }

  async function handleMoveDown(jobId, event) {
    event.stopPropagation();
    try {
      await API.moveJobDown(jobId);
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to move job down:', error);
      showToast('Failed to move job', 'error');
    }
  }

  async function handleMoveToTop(jobId, event) {
    event.stopPropagation();
    try {
      await API.moveJobToTop(jobId);
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to move job to top:', error);
      showToast('Failed to move job', 'error');
    }
  }

  async function handleMoveToBottom(jobId, event) {
    event.stopPropagation();
    try {
      await API.moveJobToBottom(jobId);
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Failed to move job to bottom:', error);
      showToast('Failed to move job', 'error');
    }
  }

  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const columnCount = showPriorityControls ? 7 : 6;

  return (
    <>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {showPriorityControls && (
                <TableCell style={{ fontWeight: 'bold', width: '60px' }}>#</TableCell>
              )}
              <TableCell style={{ fontWeight: 'bold' }}></TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Job Name</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Faceswap</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Segment Run</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Duration</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={{ color: '#999' }}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              jobs
                .slice((page - 1) * rowsPerPage, page * rowsPerPage)
                .map(job => {
                  const position = showPriorityControls ? getQueuePosition(job) : null;
                  const isFirstPending = position === 1;
                  const isLastPending = position === pendingJobs.length;
                  return (
                    <TableRow
                      key={job.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/job/${job.id}`)}
                    >
                      {showPriorityControls && (
                        <TableCell sx={{ padding: '4px 8px' }}>
                          {position ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '50px' }}>
                                <span style={{ fontWeight: 'bold' }}>#{position}</span>
                                {job.estimated_wait_seconds && (
                                  <span style={{ fontSize: '11px', color: '#666' }}>
                                    {formatWaitTime(job.estimated_wait_seconds)}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleMoveToTop(job.id, e)}
                                  disabled={isFirstPending}
                                  sx={{ padding: '1px' }}
                                  title="Move to top"
                                >
                                  <KeyboardDoubleArrowUpIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleMoveUp(job.id, e)}
                                  disabled={isFirstPending}
                                  sx={{ padding: '1px' }}
                                  title="Move up"
                                >
                                  <KeyboardArrowUpIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleMoveDown(job.id, e)}
                                  disabled={isLastPending}
                                  sx={{ padding: '1px' }}
                                  title="Move down"
                                >
                                  <KeyboardArrowDownIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleMoveToBottom(job.id, e)}
                                  disabled={isLastPending}
                                  sx={{ padding: '1px' }}
                                  title="Move to bottom"
                                >
                                  <KeyboardDoubleArrowDownIcon fontSize="small" />
                                </IconButton>
                              </div>
                            </div>
                          ) : job.id}
                        </TableCell>
                      )}
                      <TableCell>
                        <JobThumbnail
                          jobId={job.id}
                          className="thumbnail"
                        />
                      </TableCell>
                      <TableCell>{job.name}</TableCell>
                      <TableCell sx={{ color: hasFaceswap(job) ? '#7b1fa2' : '#999' }}>
                        {hasFaceswap(job) ? <FaceIcon fontSize="small" /> : 'N/A'}
                      </TableCell>
                      <TableCell>{job.last_segment_run ? formatDate(job.last_segment_run) : '-'}</TableCell>
                      <TableCell>
                        <StatusChip status={job.status} />
                      </TableCell>
                      <TableCell>
                        {job.total_duration > 0 ? (
                          job.total_duration >= 60
                            ? `${Math.floor(job.total_duration / 60)}m ${Math.round(job.total_duration % 60)}s`
                            : `${Math.round(job.total_duration)}s`
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <PaginationControl
        count={jobs.length}
        page={page}
        pageSize={rowsPerPage}
        onPageChange={handleChangePage}
        onPageSizeChange={handleChangeRowsPerPage}
        showPageSize={true}
        itemLabel="jobs"
      />
    </>
  );
}
