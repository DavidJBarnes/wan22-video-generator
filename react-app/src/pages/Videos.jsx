import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  Typography,
  Grid,
  Box,
  IconButton,
  Tooltip,
  Modal,
  TextField,
  InputAdornment,
  Pagination
} from '@mui/material';
import API from '../api/client';
import { formatDate } from '../utils/helpers';
import './Videos.css';

const VIDEOS_PER_PAGE = 12;

export default function Videos() {
  const [allVideos, setAllVideos] = useState([]);
  const [videoLoras, setVideoLoras] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadVideos();
  }, []);

  async function loadVideos() {
    try {
      const data = await API.getJobs();
      const jobsList = data.jobs || data || [];
      const completedJobs = jobsList.filter(job => job.status === 'completed');
      completedJobs.sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at) : new Date(a.created_at);
        const dateB = b.completed_at ? new Date(b.completed_at) : new Date(b.created_at);
        return dateB - dateA;
      });
      setAllVideos(completedJobs);
      setLoading(false);

      // Fetch LoRA data for all videos in parallel
      const loraPromises = completedJobs.map(async (job) => {
        try {
          const segments = await API.getSegments(job.id);
          const loras = new Set();
          segments.forEach(seg => {
            if (seg.high_lora) loras.add(seg.high_lora);
            if (seg.low_lora) loras.add(seg.low_lora);
          });
          return { jobId: job.id, loras: Array.from(loras) };
        } catch {
          return { jobId: job.id, loras: [] };
        }
      });

      const loraResults = await Promise.all(loraPromises);
      const loraMap = {};
      loraResults.forEach(({ jobId, loras }) => {
        loraMap[jobId] = loras;
      });
      setVideoLoras(loraMap);
    } catch (error) {
      console.error('Failed to load videos:', error);
      setLoading(false);
    }
  }

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return allVideos;

    const query = searchQuery.toLowerCase();
    return allVideos.filter(job => {
      // Search by name
      if (job.name.toLowerCase().includes(query)) return true;

      // Search by LoRAs
      const loras = videoLoras[job.id] || [];
      return loras.some(lora => lora.toLowerCase().includes(query));
    });
  }, [allVideos, videoLoras, searchQuery]);

  const pageCount = Math.ceil(filteredVideos.length / VIDEOS_PER_PAGE);
  const paginatedVideos = filteredVideos.slice(
    (page - 1) * VIDEOS_PER_PAGE,
    page * VIDEOS_PER_PAGE
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  function handleDownload(jobId, jobName, event) {
    event.stopPropagation();
    const link = document.createElement('a');
    link.href = API.getJobVideo(jobId);
    link.download = `${jobName}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handlePageChange(event, value) {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <div className="videos-page">
        <div className="videos-header">
          <h1>Videos</h1>
        </div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="videos-page">
      <div className="videos-header">
        <h1>Videos</h1>
        <TextField
          className="videos-search"
          placeholder="Search by name or LoRA..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <span>🔍</span>
              </InputAdornment>
            ),
          }}
        />
      </div>

      {filteredVideos.length === 0 ? (
        <Typography color="textSecondary" sx={{ mt: 2 }}>
          {searchQuery ? 'No videos match your search.' : 'No completed videos yet. Complete a job to see it here.'}
        </Typography>
      ) : (
        <>
          <Grid container spacing={3}>
            {paginatedVideos.map(job => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={job.id}>
                <Card className="video-card">
                  <CardActionArea onClick={() => setSelectedVideo(job)}>
                    <CardMedia
                      component="video"
                      src={API.getJobVideo(job.id)}
                      poster={API.getJobThumbnail(job.id)}
                      className="video-preview"
                      muted
                      loop
                      onMouseEnter={(e) => e.target.play()}
                      onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                    />
                    <CardContent className="video-card-content">
                      <Typography variant="subtitle1" noWrap title={job.name}>
                        {job.name}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {formatDate(job.completed_at || job.created_at)}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {job.completed_segments || 0} segment{(job.completed_segments || 0) !== 1 ? 's' : ''}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                  <Box className="video-card-actions">
                    <Tooltip title="Download">
                      <IconButton
                        size="small"
                        onClick={(e) => handleDownload(job.id, job.name, e)}
                      >
                        <span style={{ fontSize: '16px' }}>⬇</span>
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          {pageCount > 1 && (
            <Box className="videos-pagination">
              <Pagination
                count={pageCount}
                page={page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}

      <Modal
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        className="video-modal"
      >
        <Box className="video-modal-content">
          {selectedVideo && (
            <>
              <Typography variant="h6" className="video-modal-title">
                {selectedVideo.name}
              </Typography>
              <video
                src={API.getJobVideo(selectedVideo.id)}
                controls
                autoPlay
                className="video-modal-player"
              />
              <Box className="video-modal-actions">
                <Tooltip title="Download">
                  <IconButton
                    onClick={(e) => handleDownload(selectedVideo.id, selectedVideo.name, e)}
                  >
                    <span style={{ fontSize: '20px' }}>⬇</span>
                  </IconButton>
                </Tooltip>
                <IconButton onClick={() => setSelectedVideo(null)}>
                  <span style={{ fontSize: '20px' }}>✕</span>
                </IconButton>
              </Box>
            </>
          )}
        </Box>
      </Modal>
    </div>
  );
}
