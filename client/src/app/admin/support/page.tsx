'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Heading } from '@/components/heading';
import SupportAdminControls from '@/components/support/SupportAdminControls';

export default function SupportAdminPage() {
  const { isAdmin } = useAuth();

  // Don't render anything if not an admin
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div className="max-sm:w-full sm:flex-1">
              <Heading>Support Admin</Heading>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-6">
            <p className="text-red-600">You do not have permission to view this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div className="max-sm:w-full sm:flex-1">
            <Heading>Support Admin</Heading>
          </div>
        </div>
        <SupportAdminControls />
      </div>
    </div>
  );
} 