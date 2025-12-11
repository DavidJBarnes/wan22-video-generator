import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper
} from '@mui/material';
import API from '../api/client';
import { formatDate, showToast } from '../utils/helpers';
import CreateJobModal from '../components/CreateJobModal';
import StatusChip from '../components/StatusChip';
import './Queue.css';

export default function Queue() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(
    ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled']
  );
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const allStatuses = ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled'];

  useEffect(() => {
    loadJobs();
    // Auto-refresh
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterJobs();
  }, [statusFilter, allJobs]);

  async function loadJobs() {
    try {
      const data = await API.getJobs();
      const jobsList = data.jobs || data || [];
      setAllJobs(jobsList);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load jobs:', error);
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

    setJobs(filtered);
  }

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
  }

  async function handleDeleteJob(jobId, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    try {
      await API.deleteJob(jobId);
      showToast('Job deleted', 'success');
      await loadJobs();
    } catch (error) {
      console.error('Failed to delete job:', error);
      showToast('Failed to delete job', 'error');
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Job Queue</h1>
        <p>Loading...</p>
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
              <TableCell style={{fontWeight:'bold'}}></TableCell>
              <TableCell style={{fontWeight:'bold'}}>Job Name</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Created</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Status</TableCell>
              <TableCell style={{fontWeight:'bold'}}>Segments</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: '#999' }}>
                  No jobs match the filter
                </TableCell>
              </TableRow>
            ) : (
              jobs
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map(job => {
                  const position = getQueuePosition(job);
                  return (
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
                      <TableCell>
                        {job.name}
                      </TableCell>
                      <TableCell>{formatDate(job.created_at)}</TableCell>
                      <TableCell>
                        <StatusChip status={job.status} queuePosition={position} />
                      </TableCell>
                      <TableCell>{job.completed_segments ?? 0} completed</TableCell>
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
            loadJobs();
          }}
        />
      )}
    </div>
  );
}
