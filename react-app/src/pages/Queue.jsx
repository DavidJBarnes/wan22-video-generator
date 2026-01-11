import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  CircularProgress
} from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import API from '../api/client';
import { useJobs } from '../contexts/JobsContext';
import { formatDate, showToast, getFaceswapName } from '../utils/helpers';
import CreateJobModal from '../components/CreateJobModal';
import StatusChip from '../components/StatusChip';
import './Queue.css';

export default function Queue() {
  const navigate = useNavigate();
  // Use centralized jobs context instead of local polling
  const { jobs: allJobs, loading, refreshJobs } = useJobs();

  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('queueStatusFilter');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        // Migrate old 'cancelled' status to 'paused'
        parsed = parsed.map(s => s === 'cancelled' ? 'paused' : s);
        // Remove duplicates
        parsed = [...new Set(parsed)];
        return parsed;
      } catch { /* fall through */ }
    }
    return ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'paused'];
  });
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const allStatuses = ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'paused'];

  // Memoize filtered and sorted jobs
  const jobs = useMemo(() => {
    let filtered = statusFilter.length === 0
      ? allJobs
      : allJobs.filter(job => statusFilter.includes(job.status));

    // Sort: by status priority first, then by last_segment_run within each status group
    // Pending jobs keep their priority order, NULL last_segment_run values appear last
    filtered.sort((a, b) => {
      // Priority order for statuses
      const statusPriority = {
        'awaiting_prompt': 1,
        'running': 2,
        'pending': 3,
        'completed': 4,
        'failed': 4,  // Same priority as completed
        'paused': 4  // Same priority as completed
      };

      const priorityA = statusPriority[a.status] || 99;
      const priorityB = statusPriority[b.status] || 99;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // For pending, sort by priority (lower number = higher in queue)
      if (a.status === 'pending') {
        return (a.priority || 0) - (b.priority || 0);
      }

      // For other statuses, sort by last_segment_run (newest first, NULL last)
      const dateA = a.last_segment_run ? new Date(a.last_segment_run) : null;
      const dateB = b.last_segment_run ? new Date(b.last_segment_run) : null;

      // Handle NULL values - they go last
      if (dateA === null && dateB === null) return 0;
      if (dateA === null) return 1;  // A (null) goes after B
      if (dateB === null) return -1; // B (null) goes after A

      return dateB - dateA; // Descending (newest first)
    });

    return filtered;
  }, [statusFilter, allJobs]);

  function handleChangePage(event, newPage) {
    setPage(newPage);
  }

  function handleChangeRowsPerPage(event) {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }

  function getQueuePosition(job) {
    // Only show position for pending items
    if (job.status !== 'pending') return null;

    const pendingJobs = jobs.filter(j => j.status === 'pending');
    const position = pendingJobs.findIndex(j => j.id === job.id);
    return position >= 0 ? position + 1 : null;
  }

  function handleStatusFilterChange(event) {
    const value = event.target.value;
    // MUI Select returns an array for multiple selection
    setStatusFilter(value);
    localStorage.setItem('queueStatusFilter', JSON.stringify(value));
  }

  async function handleDeleteJob(jobId, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    try {
      await API.deleteJob(jobId);
      showToast('Job deleted', 'success');
      await refreshJobs();
    } catch (error) {
      console.error('Failed to delete job:', error);
      showToast('Failed to delete job', 'error');
    }
  }

  async function handleMoveUp(jobId, event) {
    event.stopPropagation();
    try {
      await API.moveJobUp(jobId);
      await refreshJobs();
    } catch (error) {
      console.error('Failed to move job up:', error);
      showToast('Failed to move job', 'error');
    }
  }

  async function handleMoveDown(jobId, event) {
    event.stopPropagation();
    try {
      await API.moveJobDown(jobId);
      await refreshJobs();
    } catch (error) {
      console.error('Failed to move job down:', error);
      showToast('Failed to move job', 'error');
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Job Queue</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0 }}>Job Queue</h1>
        <Button variant="contained" onClick={() => setShowModal(true)}>
          + New Job
        </Button>
      </div>

      <div className="filter-row">
        <FormControl sx={{ minWidth: 300 }} size="small">
          <InputLabel>Filter by Status</InputLabel>
          <Select
            multiple
            value={statusFilter}
            onChange={handleStatusFilterChange}
            label="Filter by Status"
            renderValue={(selected) =>
              selected.length === allStatuses.length
                ? 'All Statuses'
                : `${selected.length} status${selected.length !== 1 ? 'es' : ''} selected`
            }
          >
            {allStatuses.map((status) => (
              <MenuItem key={status} value={status}>
                <Checkbox checked={statusFilter.indexOf(status) > -1} />
                <ListItemText
                  primary={<StatusChip status={status} />}
                  sx={{ display: 'flex', alignItems: 'center' }}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{fontWeight:'bold', width: '60px'}}>#</TableCell>
              <TableCell style={{fontWeight:'bold'}}></TableCell>
              <TableCell style={{fontWeight:'bold'}}>Job Name</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Faceswap</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Segment Run</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Status</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Segments</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: '#999' }}>
                  No jobs match the filter
                </TableCell>
              </TableRow>
            ) : (
              jobs
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map(job => {
                  const position = getQueuePosition(job);
                  const pendingJobs = jobs.filter(j => j.status === 'pending');
                  const isFirstPending = position === 1;
                  const isLastPending = position === pendingJobs.length;
                  return (
                    <TableRow
                      key={job.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/job/${job.id}`)}
                    >
                      <TableCell sx={{ padding: '4px 8px' }}>
                        {position ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 'bold', minWidth: '20px' }}>{position}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <IconButton
                                size="small"
                                onClick={(e) => handleMoveUp(job.id, e)}
                                disabled={isFirstPending}
                                sx={{ padding: '2px' }}
                              >
                                <KeyboardArrowUpIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={(e) => handleMoveDown(job.id, e)}
                                disabled={isLastPending}
                                sx={{ padding: '2px' }}
                              >
                                <KeyboardArrowDownIcon fontSize="small" />
                              </IconButton>
                            </div>
                          </div>
                        ) : job.id}
                      </TableCell>
                      <TableCell>
                        <img
                          className="thumbnail"
                          src={API.getJobThumbnail(job.id)}
                          onError={(e) => e.target.style.display = 'none'}
                          alt=""
                        />
                      </TableCell>
                      <TableCell>
                        {job.name}
                      </TableCell>
                      <TableCell sx={{ color: getFaceswapName(job) ? 'inherit' : '#999' }}>
                        {getFaceswapName(job) || 'N/A'}
                      </TableCell>
                      <TableCell>{job.last_segment_run ? formatDate(job.last_segment_run) : '-'}</TableCell>
                      <TableCell>
                        <StatusChip status={job.status} />
                      </TableCell>
                      <TableCell>
                        {job.completed_segments ?? 0} completed
                        {(job.deleted_segments ?? 0) > 0 && (
                          <span style={{ color: '#d32f2f', marginLeft: '8px' }}>
                            + {job.deleted_segments} deleted
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={jobs.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>

      {showModal && (
        <CreateJobModal
          onClose={() => setShowModal(false)}
          onSuccess={(newJobId) => {
            setShowModal(false);
            refreshJobs();
          }}
        />
      )}
    </div>
  );
}
