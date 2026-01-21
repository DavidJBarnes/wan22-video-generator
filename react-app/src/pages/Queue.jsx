import { useState, useMemo } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Button,
  CircularProgress
} from '@mui/material';
import { useJobs } from '../contexts/JobsContext';
import CreateJobModal from '../components/CreateJobModal';
import JobTable from '../components/JobTable';
import StatusChip from '../components/StatusChip';
import './Queue.css';

export default function Queue() {
  const { jobs: allJobs, loading, refreshJobs } = useJobs();

  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = localStorage.getItem('queueStatusFilter');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        parsed = parsed.map(s => s === 'cancelled' ? 'paused' : s);
        parsed = [...new Set(parsed)];
        return parsed;
      } catch { /* fall through */ }
    }
    return ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'paused'];
  });
  const [showModal, setShowModal] = useState(false);

  const allStatuses = ['pending', 'running', 'awaiting_prompt', 'completed', 'failed', 'paused'];

  // Memoize filtered and sorted jobs
  const jobs = useMemo(() => {
    let filtered = statusFilter.length === 0
      ? allJobs
      : allJobs.filter(job => statusFilter.includes(job.status));

    filtered.sort((a, b) => {
      const statusPriority = {
        'awaiting_prompt': 1,
        'running': 2,
        'pending': 3,
        'completed': 4,
        'failed': 4,
        'paused': 4
      };

      const priorityA = statusPriority[a.status] || 99;
      const priorityB = statusPriority[b.status] || 99;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      if (a.status === 'pending') {
        return (a.priority || 0) - (b.priority || 0);
      }

      const dateA = a.last_segment_run ? new Date(a.last_segment_run) : null;
      const dateB = b.last_segment_run ? new Date(b.last_segment_run) : null;

      if (dateA === null && dateB === null) return 0;
      if (dateA === null) return 1;
      if (dateB === null) return -1;

      return dateB - dateA;
    });

    return filtered;
  }, [statusFilter, allJobs]);

  function handleStatusFilterChange(event) {
    const value = event.target.value;
    setStatusFilter(value);
    localStorage.setItem('queueStatusFilter', JSON.stringify(value));
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

      <JobTable
        jobs={jobs}
        showPriorityControls={true}
        onRefresh={refreshJobs}
        storageKey="queueTable"
        emptyMessage="No jobs match the filter"
      />

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
