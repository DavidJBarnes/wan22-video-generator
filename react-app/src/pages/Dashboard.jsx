import { useState, useEffect } from 'react';
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
import API from '../api/client';
import { formatDate, getFaceswapName } from '../utils/helpers';
import StatusChip from '../components/StatusChip';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [comfyStatus, setComfyStatus] = useState({ reachable: false });
  const [runningJobsCount, setRunningJobsCount] = useState(0);
  const [pendingJobsCount, setPendingJobsCount] = useState(0);
  const [awaitingPromptJobsCount, setAwaitingPromptJobsCount] = useState(0);
  const [allJobs, setAllJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('dashboardStatusFilter');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { /* fall through */ }
    }
    return ['running', 'pending', 'awaiting_prompt'];
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const allStatuses = ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled'];

  useEffect(() => {
    loadDashboard();

    // Auto-refresh every 3 seconds
    const interval = setInterval(loadDashboard, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterJobs();
  }, [statusFilter, allJobs]);

  async function loadDashboard() {
    try {
      const [comfy, jobsData] = await Promise.all([
        API.checkComfyStatus(),
        API.getJobs()
      ]);

      setComfyStatus(comfy);

      const jobs = jobsData.jobs || jobsData || [];
      setRunningJobsCount(jobs.filter(j => j.status === 'running').length);
      setPendingJobsCount(jobs.filter(j => j.status === 'pending').length);
      setAwaitingPromptJobsCount(jobs.filter(j => j.status === 'awaiting_prompt').length);

      setAllJobs(jobs);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setLoading(false);
    }
  }

  function filterJobs() {
    let filtered = statusFilter.length === 0
      ? allJobs
      : allJobs.filter(job => statusFilter.includes(job.status));

    // Sort: awaiting_prompt, running, pending (oldest first), then completed/failed/cancelled (newest first)
    filtered.sort((a, b) => {
      // Priority order for statuses
      const statusPriority = {
        'awaiting_prompt': 1,
        'running': 2,
        'pending': 3,
        'completed': 4,
        'failed': 4,  // Same priority as completed
        'cancelled': 4  // Same priority as completed
      };

      const priorityA = statusPriority[a.status] || 99;
      const priorityB = statusPriority[b.status] || 99;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // For awaiting_prompt/running/pending, sort oldest first (by creation date)
      // For completed/failed/cancelled, sort newest first (by completed_at or created_at)
      if (['awaiting_prompt', 'running', 'pending'].includes(a.status)) {
        return new Date(a.created_at) - new Date(b.created_at);
      } else {
        // Use completed_at if available, otherwise created_at
        const dateA = a.completed_at ? new Date(a.completed_at) : new Date(a.created_at);
        const dateB = b.completed_at ? new Date(b.completed_at) : new Date(b.created_at);
        return dateB - dateA; // Descending (newest first)
      }
    });

    setFilteredJobs(filtered);
  }

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

    if (queueRunning > 0 || queuePending > 0) {
      return 'blue';
    }
    return 'green';
  }

  function getComfyStatusText() {
    if (!comfyStatus.reachable) return 'Not Connected';

    const queueRunning = comfyStatus.queue?.queue_running?.length || 0;
    const queuePending = comfyStatus.queue?.queue_pending?.length || 0;

    if (queueRunning > 0 || queuePending > 0) {
      return 'Connected - Running...';
    }
    return 'Connected - Idle';
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
        <div className="card">
          <div className="status-indicator">
            <div className={`status-dot ${getComfyStatusClass()}`}></div>
            <div>
              <h3>ComfyUI Status</h3>
              <div>{getComfyStatusText()}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Running Jobs</h3>
          <div className="value">{runningJobsCount}</div>
        </div>

        <div className="card">
          <h3>Pending Jobs</h3>
          <div className="value">{pendingJobsCount}</div>
        </div>

        <div className="card">
          <h3>Awaiting Prompt</h3>
          <div className="value">{awaitingPromptJobsCount}</div>
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
              <TableCell style={{fontWeight:'bold'}}>Created</TableCell>
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
                    <TableCell>{job.completed_segments ?? 0} completed</TableCell>
                    <TableCell>{formatDate(job.created_at)}</TableCell>
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
