'use client';

import React from 'react';
import { Divider } from '@/components/divider';
import { Heading, Subheading } from '@/components/heading';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { RoadmapItem } from '@/components/roadmap';
import { RoadmapProvider, useRoadmap } from '@/contexts/RoadmapContext';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { CalendarIcon, ClockIcon, ArrowPathIcon } from '@heroicons/react/20/solid';

function RoadmapContent() {
  const { isLoading: roadmapLoading, error, getRoadmapItemsByStatus, refreshRoadmapItems } = useRoadmap();
  const { isAdmin, isCheckingAdmin } = useAuth();

  if (roadmapLoading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span className="block sm:inline">{error.message}</span>
      </div>
    );
  }

  const developmentItems = getRoadmapItemsByStatus('development');
  const upcomingItems = getRoadmapItemsByStatus('upcoming');
  const visionItems = getRoadmapItemsByStatus('vision');

  // Admin link for roadmap management
  const AdminActions = () => {
    if (isCheckingAdmin || !isAdmin) return null;
    return (
      <Link href="/roadmap/admin">
        <Button>Manage Roadmap</Button>
      </Link>
    );
  };

  const RefreshButton = () => {
    return (
      <button 
        onClick={() => refreshRoadmapItems()} 
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        disabled={roadmapLoading}
      >
        <ArrowPathIcon className="h-4 w-4 mr-1" />
        Refresh
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="max-sm:w-full sm:flex-1">
          <Heading>Product Roadmap</Heading>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Track our development progress and upcoming features
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <RefreshButton />
          <AdminActions />
        </div>
      </div>

      {/* In Development Section */}
      <Subheading level={2} className="mb-4 text-green-600 dark:text-green-400">
        In Development
      </Subheading>
      <ul className="mb-10">
        {developmentItems.length > 0 ? (
          developmentItems.map((item, index) => (
            <li key={item.id}>
              <Divider soft={index > 0} />
              <div className="py-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-base/6 font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                    {item.progress !== undefined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">Progress</span>
                          <span className="font-medium">{item.progress}%</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2 dark:bg-zinc-700">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${item.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                  <Badge color="lime" className="ml-4">Development</Badge>
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="py-4 text-zinc-500 dark:text-zinc-400">No items currently in development.</li>
        )}
      </ul>

      {/* Upcoming Features Section */}
      <Subheading level={2} className="mb-4 text-blue-600 dark:text-blue-400">
        Upcoming Features
      </Subheading>
      <ul className="mb-10">
        {upcomingItems.length > 0 ? (
          upcomingItems.map((item, index) => (
            <li key={item.id}>
              <Divider soft={index > 0} />
              <div className="py-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-base/6 font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                    {item.expectedDate && (
                      <div className="mt-2 text-xs flex items-center text-zinc-500 dark:text-zinc-400">
                        <CalendarIcon className="h-4 w-4 mr-1" aria-hidden="true" />
                        Expected: {item.expectedDate}
                      </div>
                    )}
                  </div>
                  <Badge color="blue" className="ml-4">Upcoming</Badge>
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="py-4 text-zinc-500 dark:text-zinc-400">No upcoming features planned yet.</li>
        )}
      </ul>

      {/* Long-term Vision Section */}
      <Subheading level={2} className="mb-4 text-purple-600 dark:text-purple-400">
        Long-term Vision
      </Subheading>
      <ul>
        {visionItems.length > 0 ? (
          visionItems.map((item, index) => (
            <li key={item.id}>
              <Divider soft={index > 0} />
              <div className="py-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-base/6 font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                  </div>
                  <Badge color="purple" className="ml-4">Vision</Badge>
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="py-4 text-zinc-500 dark:text-zinc-400">No long-term vision items defined yet.</li>
        )}
      </ul>
    </>
  );
}

export default function RoadmapPage() {
  return (
    <RoadmapProvider>
      <RoadmapContent />
    </RoadmapProvider>
  );
} 