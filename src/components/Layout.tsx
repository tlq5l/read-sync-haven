
import * as React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineIndicator from './OfflineIndicator';
import { useOffline } from '@/hooks/use-offline';
import { ArticleProvider } from '@/context/ArticleContext';

export default function Layout() {
  const isOffline = useOffline();
  
  return (
    <ArticleProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <OfflineIndicator />
    </ArticleProvider>
  );
}