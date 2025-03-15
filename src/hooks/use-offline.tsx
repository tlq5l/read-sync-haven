
import { useState, useEffect } from 'react';
import { registerOfflineListeners } from '@/services/db';

export function useOffline() {
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    // Register listeners for online/offline events
    const cleanup = registerOfflineListeners((offline) => {
      setIsOffline(offline);
    });
    
    // Cleanup on unmount
    return cleanup;
  }, []);
  
  return isOffline;
}
