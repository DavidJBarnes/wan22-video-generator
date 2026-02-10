import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import API from '../api/client';

const JobsContext = createContext(null);

// Polling intervals based on activity
const ACTIVE_POLL_INTERVAL = 3000;   // 3s when jobs are running
const IDLE_POLL_INTERVAL = 10000;    // 10s when idle

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [avgRunTime, setAvgRunTime] = useState(null);
  const [comfyStatus, setComfyStatus] = useState({ reachable: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const intervalRef = useRef(null);
  const subscriberCountRef = useRef(0);

  // Determine if any jobs are actively running
  const hasActiveJobs = useMemo(() => {
    return jobs.some(j => j.status === 'running' || j.status === 'pending');
  }, [jobs]);

  // Computed stats
  const stats = useMemo(() => ({
    runningCount: jobs.filter(j => j.status === 'running').length,
    pendingCount: jobs.filter(j => j.status === 'pending').length,
    awaitingPromptCount: jobs.filter(j => j.status === 'awaiting_prompt').length,
    completedCount: jobs.filter(j => j.status === 'completed').length,
    failedCount: jobs.filter(j => j.status === 'failed').length,
  }), [jobs]);

  const fetchJobs = useCallback(async () => {
    try {
      const [jobsData, comfy] = await Promise.all([
        API.getJobs(100),
        API.checkComfyStatus()
      ]);

      const jobsList = jobsData.jobs || jobsData || [];
      setJobs(jobsList);
      setAvgRunTime(jobsData.avg_run_time ?? null);
      setComfyStatus(comfy);
      setLastFetched(Date.now());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Start polling - called by components that need jobs data
  const startPolling = useCallback(() => {
    subscriberCountRef.current += 1;

    // First subscriber triggers initial fetch and starts polling
    if (subscriberCountRef.current === 1) {
      fetchJobs();
      const pollInterval = hasActiveJobs ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
      intervalRef.current = setInterval(fetchJobs, pollInterval);
    }
  }, [fetchJobs, hasActiveJobs]);

  // Stop polling - called when component unmounts
  const stopPolling = useCallback(() => {
    subscriberCountRef.current = Math.max(0, subscriberCountRef.current - 1);

    // Last subscriber stops polling
    if (subscriberCountRef.current === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Update polling interval when activity changes (only if actively polling)
  useEffect(() => {
    if (subscriberCountRef.current > 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      const pollInterval = hasActiveJobs ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
      intervalRef.current = setInterval(fetchJobs, pollInterval);
    }
  }, [hasActiveJobs, fetchJobs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Force refresh (for after mutations)
  const refreshJobs = useCallback(() => {
    return fetchJobs();
  }, [fetchJobs]);

  // Memoize the context value
  const contextValue = useMemo(() => ({
    jobs,
    comfyStatus,
    loading,
    error,
    stats,
    avgRunTime,
    hasActiveJobs,
    lastFetched,
    refreshJobs,
    startPolling,
    stopPolling,
  }), [jobs, comfyStatus, loading, error, stats, avgRunTime, hasActiveJobs, lastFetched, refreshJobs, startPolling, stopPolling]);

  return (
    <JobsContext.Provider value={contextValue}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error('useJobs must be used within a JobsProvider');
  }
  return context;
}

export default JobsContext;
