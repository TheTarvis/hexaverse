'use client';

import React from 'react';
import { RoadmapAdminControls } from '@/components/roadmap';
import { RoadmapProvider } from '@/contexts/RoadmapContext';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { Heading } from '@/components/heading';
import { Button } from '@/components/button';
import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { useRoadmap } from '@/contexts/RoadmapContext';

function RoadmapAdminContent() {
  const { refreshRoadmapItems, isLoading } = useRoadmap();
  
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-sm:w-full sm:flex-1">
          <Heading>Roadmap Administration</Heading>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage roadmap items and track development progress
          </p>
        </div>
        <button 
          onClick={() => refreshRoadmapItems()} 
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          disabled={isLoading}
        >
          <ArrowPathIcon className="h-4 w-4 mr-1" />
          Refresh
        </button>
      </div>
      
      <div className="mt-8">
        <RoadmapAdminControls />
      </div>
    </>
  );
}

export default function RoadmapAdminPage() {
  return (
    <AdminRoute>
      <RoadmapProvider>
        <div className="container mx-auto py-8 px-4 max-w-6xl">
          <RoadmapAdminContent />
        </div>
      </RoadmapProvider>
    </AdminRoute>
  );
} 