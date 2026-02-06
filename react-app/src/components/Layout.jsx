import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QueueIcon from '@mui/icons-material/Queue';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import BrushIcon from '@mui/icons-material/Brush';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import SettingsIcon from '@mui/icons-material/Settings';
import SyncIcon from '@mui/icons-material/Sync';
import API from '../api/client';
import { useJobs } from '../contexts/JobsContext';
import { showToast } from '../utils/helpers';
import './Layout.css';

export default function Layout() {
  const [syncRunning, setSyncRunning] = useState(false);

  // Use shared jobs context instead of separate polling
  const { comfyStatus, stats } = useJobs();

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
    if (queueRunning > 0 || queuePending > 0 || stats.runningCount > 0) {
      document.title = `Running... | ${baseTitle}`;
    } else {
      document.title = `Idle | ${baseTitle}`;
    }
  }, [comfyStatus, stats.runningCount]);

  const handleSync = async () => {
    const localServerUrl = API.getLocalServerUrl();
    if (!localServerUrl) {
      showToast('Local server not configured. Set it in Settings.', 'error');
      return;
    }

    setSyncRunning(true);
    try {
      const response = await fetch(`${localServerUrl}/sync`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        showToast('Sync completed successfully', 'success');
      } else {
        showToast(`Sync failed: ${data.error || 'Unknown error'}`, 'error');
        console.error('Sync output:', data.stderr || data.stdout);
      }
    } catch (err) {
      showToast(`Sync error: ${err.message}`, 'error');
    } finally {
      setSyncRunning(false);
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">Wan2.2 Video Gen</div>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <DashboardIcon /> Dashboard
        </NavLink>
        <NavLink to="/queue" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <QueueIcon /> Job Queue
        </NavLink>
        <NavLink to="/videos" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <VideoLibraryIcon /> Videos
        </NavLink>
        <NavLink to="/images" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <PhotoLibraryIcon /> Image Repo
        </NavLink>
        <NavLink to="/loras" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <BrushIcon /> LoRA Library
        </NavLink>
        <NavLink to="/prompts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ShuffleIcon /> Prompts
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <SettingsIcon /> Settings
        </NavLink>
        <button
          className={`nav-item sync-button ${syncRunning ? 'syncing' : ''}`}
          onClick={handleSync}
          disabled={syncRunning}
        >
          <SyncIcon className={syncRunning ? 'spinning' : ''} />
          {syncRunning ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      <div className="main-content">
        <Outlet />
      </div>

      <div id="toast-container" className="toast-container"></div>
    </div>
  );
}
