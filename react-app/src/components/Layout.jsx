import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

export default function Layout() {
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
        <NavLink to="/images" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span>🖼️</span> Image Repo
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
