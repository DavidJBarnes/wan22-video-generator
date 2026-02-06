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
import { showToast } from '../utils/helpers';
import './Layout.css';

export default function Layout() {
  const [syncRunning, setSyncRunning] = useState(false);
  const [comfyStatus, setComfyStatus] = useState({ reachable: false });

  // Lightweight polling for just ComfyUI status (not full jobs list)
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await API.checkComfyStatus();
        setComfyStatus(status);
      } catch {
        setComfyStatus({ reachable: false });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000); // 5s is enough for status
    return () => clearInterval(interval);
  }, []);

  // Update page title based on ComfyUI status
  useEffect(() => {
    const baseTitle = 'Wan2.2 Video Gen';

    if (!comfyStatus.reachable) {
      document.title = `Not Connected | ${baseTitle}`;
      return;
    }

    const queueRunning = comfyStatus.queue?.queue_running?.length || 0;
    const queuePending = comfyStatus.queue?.queue_pending?.length || 0;

    if (queueRunning > 0 || queuePending > 0) {
      document.title = `Running... | ${baseTitle}`;
    } else {
      document.title = `Idle | ${baseTitle}`;
    }
  }, [comfyStatus]);

  const handleSync = async () => {
    const localServerUrl = API.getLocalServerUrl();
    if (!localServerUrl) {
      showToast('Local server not configured. Set it in Settings.', 'error');
      return;
    }

    setSyncRunning(true);
    try {
      // Start sync (non-blocking)
      const startResponse = await fetch(`${localServerUrl}/sync`, { method: 'POST' });
      const startData = await startResponse.json();

      if (!startData.success) {
        showToast(`Sync failed: ${startData.error}`, 'error');
        setSyncRunning(false);
        return;
      }

      if (startData.status === 'already_running') {
        showToast('Sync already in progress', 'info');
      } else {
        showToast('Sync started...', 'info');
      }

      // Poll for completion
      const pollStatus = async () => {
        const statusResponse = await fetch(`${localServerUrl}/sync`);
        const status = await statusResponse.json();

        if (status.status === 'running') {
          setTimeout(pollStatus, 1000);
        } else if (status.status === 'completed') {
          setSyncRunning(false);
          if (status.success) {
            showToast('Sync completed successfully', 'success');
          } else {
            const errorMsg = status.error || status.stderr || `Exit code ${status.returncode}`;
            showToast(`Sync failed: ${errorMsg}`, 'error');
            console.error('Sync output:', status.stdout, status.stderr);
          }
        } else {
          setSyncRunning(false);
        }
      };

      pollStatus();
    } catch (err) {
      showToast(`Sync error: ${err.message}`, 'error');
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
