import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoraProvider } from './contexts/LoraContext';
import { JobsProvider } from './contexts/JobsContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Queue from './pages/Queue';
import Videos from './pages/Videos';
import JobDetail from './pages/JobDetail';
import ImageRepo from './pages/ImageRepo';
import LoraLibrary from './pages/LoraLibrary';
import Settings from './pages/Settings';

function App() {
  return (
    <JobsProvider>
      <LoraProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="queue" element={<Queue />} />
              <Route path="videos" element={<Videos />} />
              <Route path="job/:id" element={<JobDetail />} />
              <Route path="images" element={<ImageRepo />} />
              <Route path="loras" element={<LoraLibrary />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LoraProvider>
    </JobsProvider>
  );
}

export default App;
