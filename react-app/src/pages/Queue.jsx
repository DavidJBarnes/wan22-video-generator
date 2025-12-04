import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, Button } from '@mui/material';
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
    ['pending', 'queued', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled']
  );
  const [showModal, setShowModal] = useState(false);

  const allStatuses = ['pending', 'queued', 'running', 'awaiting_prompt', 'completed', 'failed', 'cancelled'];

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
    if (statusFilter.length === 0) {
      setJobs(allJobs);
    } else {
      const filtered = allJobs.filter(job => statusFilter.includes(job.status));
      setJobs(filtered);
    }
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

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Job Name</th>
            <th>Created</th>
            <th>Status</th>
            <th>Segments</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>
                No jobs match the filter
              </td>
            </tr>
          ) : (
            jobs.map(job => (
              <tr
                key={job.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/job/${job.id}`)}
              >
                <td>
                  <img
                    className="thumbnail"
                    src={API.getJobThumbnail(job.id)}
                    onError={(e) => e.target.style.display = 'none'}
                    alt=""
                  />
                </td>
                <td>{job.name}</td>
                <td>{formatDate(job.created_at)}</td>
                <td>
                  <StatusChip status={job.status} />
                </td>
                <td>{job.completed_segments ?? 0} completed</td>
{/*                 <td className="action-buttons"> */}
{/*                   <button */}
{/*                     className="btn-icon" */}
{/*                     onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`); }} */}
{/*                     title="View Details" */}
{/*                   > */}
{/*                     👁️ */}
{/*                   </button> */}
{/*                   <button */}
{/*                     className="btn-icon delete" */}
{/*                     onClick={(e) => handleDeleteJob(job.id, e)} */}
{/*                     title="Delete Job" */}
{/*                   > */}
{/*                     🗑️ */}
{/*                   </button> */}
{/*                 </td> */}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showModal && (
        <CreateJobModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            loadJobs();
          }}
        />
      )}
    </div>
  );
}
