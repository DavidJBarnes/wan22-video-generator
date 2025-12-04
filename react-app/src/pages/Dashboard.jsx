import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/client';
import { formatDate } from '../utils/helpers';
import StatusChip from '../components/StatusChip';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [comfyStatus, setComfyStatus] = useState({ reachable: false });
  const [runningJobsCount, setRunningJobsCount] = useState(0);
  const [queuedJobsCount, setQueuedJobsCount] = useState(0);
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();

    // Auto-refresh every 3 seconds
    const interval = setInterval(loadDashboard, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadDashboard() {
    try {
      const [comfy, jobsData] = await Promise.all([
        API.checkComfyStatus(),
        API.getJobs()
      ]);

      setComfyStatus(comfy);

      const allJobs = jobsData.jobs || jobsData || [];
      setRunningJobsCount(allJobs.filter(j => j.status === 'running').length);
      setQueuedJobsCount(allJobs.filter(j => j.status === 'queued').length);
      setRecentJobs(allJobs.slice(0, 5));
      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setLoading(false);
    }
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
        <p>Loading...</p>
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
          <h3>Queued Jobs</h3>
          <div className="value">{queuedJobsCount}</div>
        </div>
      </div>

      <h2>Recent Jobs</h2>
      <table>
        <thead>
          <tr>
            <th>Job Name</th>
            <th>Status</th>
            <th>Segments</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {recentJobs.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ textAlign: 'center', color: '#999' }}>
                No jobs yet
              </td>
            </tr>
          ) : (
            recentJobs.map(job => (
              <tr
                key={job.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/job/${job.id}`)}
              >
                <td>{job.name}</td>
                <td>
                  <StatusChip status={job.status} />
                </td>
                <td>{job.completed_segments ?? 0} completed</td>
                <td>{formatDate(job.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
