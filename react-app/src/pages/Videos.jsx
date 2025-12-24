import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  Typography,
  Grid,
  Box,
  IconButton,
  Tooltip
} from '@mui/material';
import API from '../api/client';
import { formatDate } from '../utils/helpers';
import './Videos.css';

export default function Videos() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVideos();
  }, []);

  async function loadVideos() {
    try {
      const data = await API.getJobs();
      const jobsList = data.jobs || data || [];
      // Filter to only completed jobs that have a final video
      const completedJobs = jobsList.filter(job => job.status === 'completed');
      // Sort by completion date, newest first
      completedJobs.sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at) : new Date(a.created_at);
        const dateB = b.completed_at ? new Date(b.completed_at) : new Date(b.created_at);
        return dateB - dateA;
      });
      setVideos(completedJobs);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load videos:', error);
      setLoading(false);
    }
  }

  function handleDownload(jobId, jobName, event) {
    event.stopPropagation();
    const link = document.createElement('a');
    link.href = API.getJobVideo(jobId);
    link.download = `${jobName}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) {
    return (
      <div>
        <h1>Videos</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Videos</h1>

      {videos.length === 0 ? (
        <Typography color="textSecondary" sx={{ mt: 2 }}>
          No completed videos yet. Complete a job to see it here.
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {videos.map(job => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={job.id}>
              <Card className="video-card">
                <CardActionArea onClick={() => navigate(`/job/${job.id}`)}>
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
      )}
    </div>
  );
}
