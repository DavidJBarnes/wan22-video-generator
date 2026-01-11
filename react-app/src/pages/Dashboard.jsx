import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
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
import MemoryIcon from '@mui/icons-material/Memory';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import EditIcon from '@mui/icons-material/Edit';
import TimerIcon from '@mui/icons-material/Timer';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import API from '../api/client';
import { useJobs } from '../contexts/JobsContext';
import { formatDate, getFaceswapName } from '../utils/helpers';
import StatusChip from '../components/StatusChip';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  // Use centralized jobs context instead of local polling
  const { jobs: allJobs, comfyStatus, loading, stats, avgRunTime } = useJobs();

  const [runningJobProgress, setRunningJobProgress] = useState(null);

  // Find the currently running job
  const runningJob = useMemo(() =>
    allJobs.find(job => job.status === 'running'),
    [allJobs]
  );

  // Poll progress for running job
  useEffect(() => {
    if (!runningJob) {
      setRunningJobProgress(null);
      return;
    }

    const fetchProgress = async () => {
      try {
        const progress = await API.getJobProgress(runningJob.id);
        setRunningJobProgress(progress);
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
  }, [runningJob?.id]);

  // Calculate ETA for next job completion
  const nextJobEta = useMemo(() => {
    if (!runningJob || !runningJobProgress?.started_at_ts || !avgRunTime) {
      return null;
    }
    const elapsed = (Date.now() / 1000) - runningJobProgress.started_at_ts;
    const remaining = Math.max(0, avgRunTime - elapsed);
    return Math.round(remaining);
  }, [runningJob, runningJobProgress?.started_at_ts, avgRunTime]);

  // Calculate total queue completion time (running job remaining + all pending jobs)
  const totalQueueTime = useMemo(() => {
    if (!avgRunTime) return null;

    // Time for pending jobs
    const pendingTime = stats.pendingCount * avgRunTime;

    // Add remaining time for currently running job
    const runningRemaining = nextJobEta || 0;

    return Math.round(pendingTime + runningRemaining);
  }, [stats.pendingCount, avgRunTime, nextJobEta]);

  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('dashboardStatusFilter');
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
    return ['running', 'pending', 'awaiting_prompt'];
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const allStatuses = ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'paused'];

  // Memoize filtered and sorted jobs
  const filteredJobs = useMemo(() => {
    let filtered = statusFilter.length === 0
      ? allJobs
      : allJobs.filter(job => statusFilter.includes(job.status));

    // Sort: by status priority first, then by last_segment_run within each status group
    // NULL last_segment_run values appear last within their status group
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

      // Within same status group, sort by last_segment_run (newest first, NULL last)
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

  function handleStatusFilterChange(event) {
    const value = event.target.value;
    setStatusFilter(value);
    localStorage.setItem('dashboardStatusFilter', JSON.stringify(value));
    setPage(0);
  }

  function handleChangePage(event, newPage) {
    setPage(newPage);
  }

  function handleChangeRowsPerPage(event) {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }

  function getComfyStatusClass() {
    if (!comfyStatus.reachable) return 'red';

    const queueRunning = comfyStatus.queue?.queue_running?.length || 0;
    const queuePending = comfyStatus.queue?.queue_pending?.length || 0;

    // Show blue (running) if ComfyUI queue has items OR our app has running jobs
    if (queueRunning > 0 || queuePending > 0 || stats.runningCount > 0) {
      return 'blue';
    }
    return 'green';
  }

  function getComfyStatusText() {
    if (!comfyStatus.reachable) return 'Not Connected';

    const queueRunning = comfyStatus.queue?.queue_running?.length || 0;
    const queuePending = comfyStatus.queue?.queue_pending?.length || 0;

    // Show "Running" if ComfyUI queue has items OR our app has running jobs
    if (queueRunning > 0 || queuePending > 0 || stats.runningCount > 0) {
      return 'Connected - Running...';
    }
    return 'Connected - Idle';
  }

  function formatRunTime(seconds) {
    if (seconds == null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  function formatEta(seconds) {
    if (seconds == null) return 'N/A';
    if (seconds <= 0) return '<1m';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `~${mins}m ${secs}s`;
  }

  function formatTotalQueueTime(seconds) {
    if (seconds == null) return 'N/A';
    if (seconds <= 0) return 'Done';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) {
      return mins === 0 ? '<1m' : `${mins}m`;
    }
    return `${hours}h ${mins}m`;
  }

  if (loading) {
    return (
      <div>
        <h1>Dashboard</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-card-header comfyui">
            <MemoryIcon />
            ComfyUI Status
          </div>
          <div className="stat-card-body">
            <div className="status-indicator">
              <div className={`status-dot ${getComfyStatusClass()}`}></div>
              <div className="value" style={{ fontSize: '18px' }}>{getComfyStatusText()}</div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header running">
            <PlayArrowIcon />
            Running Jobs
          </div>
          <div className="stat-card-body">
            <div className="value">{stats.runningCount}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header pending">
            <HourglassEmptyIcon />
            Pending Jobs
          </div>
          <div className="stat-card-body">
            <div className="value">{stats.pendingCount}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header awaiting">
            <EditIcon />
            Awaiting Prompt
          </div>
          <div className="stat-card-body">
            <div className="value">{stats.awaitingPromptCount}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header avgtime">
            <TimerIcon />
            Avg Run Time
          </div>
          <div className="stat-card-body">
            <div className="value">{formatRunTime(avgRunTime)}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header eta">
            <ScheduleIcon />
            Next Job Complete
          </div>
          <div className="stat-card-body">
            <div className="value">{runningJob ? formatEta(nextJobEta) : 'N/A'}</div>
            {runningJob && (
              <div className="subtitle">{runningJob.name}</div>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header totalqueue">
            <DoneAllIcon />
            Total Queue Complete
          </div>
          <div className="stat-card-body">
            <div className="value">{formatTotalQueueTime(totalQueueTime)}</div>
            {totalQueueTime > 0 && stats.pendingCount > 0 && (
              <div className="subtitle">{stats.pendingCount} job{stats.pendingCount !== 1 ? 's' : ''} remaining</div>
            )}
          </div>
        </div>
      </div>

      <h2>Recent Jobs</h2>

      <div className="filter-row" style={{ marginBottom: '16px' }}>
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
              <TableCell style={{fontWeight:'bold'}}></TableCell>
              <TableCell style={{fontWeight:'bold'}}>Job Name</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Faceswap</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Status</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Segments</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Segment Run</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ color: '#999' }}>
                  No jobs match the filter
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map(job => (
                  <TableRow
                    key={job.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/job/${job.id}`)}
                  >
                    <TableCell>
                      <img
                        className="thumbnail"
                        src={API.getJobThumbnail(job.id)}
                        onError={(e) => e.target.style.display = 'none'}
                        alt=""
                      />
                    </TableCell>
                    <TableCell>{job.name}</TableCell>
                    <TableCell sx={{ color: getFaceswapName(job) ? 'inherit' : '#999' }}>
                      {getFaceswapName(job) || 'N/A'}
                    </TableCell>
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
                    <TableCell>{job.last_segment_run ? formatDate(job.last_segment_run) : '-'}</TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredJobs.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>
    </div>
  );
}
