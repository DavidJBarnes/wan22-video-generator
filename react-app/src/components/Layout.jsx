import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import API from '../api/client';
import './Layout.css';

export default function Layout() {
  const [comfyStatus, setComfyStatus] = useState({ reachable: false });
  const [runningJobsCount, setRunningJobsCount] = useState(0);

  // Poll ComfyUI status and jobs
  useEffect(() => {
    async function checkStatus() {
      const [status, jobsData] = await Promise.all([
        API.checkComfyStatus(),
        API.getJobs().catch(() => ({ jobs: [] }))
      ]);
      setComfyStatus(status);
      const jobs = jobsData.jobs || jobsData || [];
      setRunningJobsCount(jobs.filter(j => j.status === 'running').length);
    }

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Update page title based on ComfyUI status (matches Dashboard display)
  useEffect(() => {
    const baseTitle = 'Wan2.2 Video Gen';

    if (!comfyStatus.reachable) {
      document.title = `Not Connected | ${baseTitle}`;
      return;
    }

    const queueRunning = comfyStatus.queue?.queue_running?.length || 0;
    const queuePending = comfyStatus.queue?.queue_pending?.length || 0;

    // Show "Running" if ComfyUI queue has items OR our app has running jobs
    if (queueRunning > 0 || queuePending > 0 || runningJobsCount > 0) {
      document.title = `Running... | ${baseTitle}`;
    } else {
      document.title = `Idle | ${baseTitle}`;
    }
  }, [comfyStatus, runningJobsCount]);

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">Wan2.2 Video Gen</div>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>📊</span> Dashboard
        </NavLink>
        <NavLink to="/queue" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>📋</span> Job Queue
        </NavLink>
        <NavLink to="/videos" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>🎬</span> Videos
        </NavLink>
        <NavLink to="/images" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>🖼️</span> Image Repo
        </NavLink>
        <NavLink to="/loras" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>🎨</span> LoRA Library
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>⚙️</span> Settings
        </NavLink>
      </div>

      <div className="main-content">
        <Outlet />
      </div>

      <div id="toast-container" className="toast-container"></div>
    </div>
  );
}
