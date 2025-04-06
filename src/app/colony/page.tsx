'use client'

import React from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ColonyProvider } from '@/contexts/ColonyContext';
import { ColonyManager } from '@/components/colony/ColonyManager';

export default function ColonyPage() {
  return (
    <AuthGuard>
      <ColonyProvider>
        <div className="py-10">
          <header className="mb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Colony Management</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                Create and manage your colony in the Hexaverse.
              </p>
            </div>
          </header>
          <main>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <ColonyManager />
            </div>
          </main>
        </div>
      </ColonyProvider>
    </AuthGuard>
  );
} 