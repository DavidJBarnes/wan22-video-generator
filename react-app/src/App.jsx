import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Queue from './pages/Queue';
import JobDetail from './pages/JobDetail';
import ImageRepo from './pages/ImageRepo';
import LoraLibrary from './pages/LoraLibrary';
import Settings from './pages/Settings';
import { requestNotificationPermission } from './utils/helpers';

function App() {
  useEffect(() => {
    // Request notification permission when the app loads
    requestNotificationPermission();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="queue" element={<Queue />} />
          <Route path="job/:id" element={<JobDetail />} />
          <Route path="images" element={<ImageRepo />} />
          <Route path="loras" element={<LoraLibrary />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
