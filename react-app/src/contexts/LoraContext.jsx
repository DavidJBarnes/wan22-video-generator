import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import API from '../api/client';

const LoraContext = createContext(null);

export function LoraProvider({ children }) {
  const [loras, setLoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchLoras = useCallback(async (force = false) => {
    // Skip if recently fetched (within 30 seconds) unless forced
    if (!force && lastFetched && Date.now() - lastFetched < 30000) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await API.getLoraLibrary();
      // API returns {loras: [...]} object
      const library = response.loras || response || [];
      // Sort by friendly_name or base_name for consistent ordering
      const sortedLoras = [...library].sort((a, b) => {
        const nameA = (a.friendly_name || a.base_name || '').toLowerCase();
        const nameB = (b.friendly_name || b.base_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setLoras(sortedLoras);
      setLastFetched(Date.now());
    } catch (err) {
      console.error('Failed to fetch LoRA library:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [lastFetched]);

  // Fetch on mount
  useEffect(() => {
    fetchLoras();
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    loras,
    loading,
    error,
    refreshLoras: () => fetchLoras(true),
    lastFetched,
  }), [loras, loading, error, fetchLoras, lastFetched]);

  return (
    <LoraContext.Provider value={contextValue}>
      {children}
    </LoraContext.Provider>
  );
}

export function useLoras() {
  const context = useContext(LoraContext);
  if (!context) {
    throw new Error('useLoras must be used within a LoraProvider');
  }
  return context;
}

export default LoraContext;
