import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useColony } from '@/contexts/ColonyContext';
import { Dialog, DialogTitle } from '@/components/dialog';
import { Button } from '@/components/button';

export function ColonyCheck() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { hasColony, isLoadingColony } = useColony();
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);

  // Check if user has a colony when authentication state changes
  useEffect(() => {
    if (!isLoadingAuth && !isLoadingColony && user && !hasColony) {
      setShowCreatePrompt(true);
    } else {
      setShowCreatePrompt(false);
    }
  }, [user, hasColony, isLoadingAuth, isLoadingColony]);

  // Navigate to colony creation page
  const handleCreateColony = () => {
    router.push('/colony');
  };

  if (isLoadingAuth || isLoadingColony || !user || hasColony) {
    return null; // Don't render anything if loading, no user, or user has colony
  }

  return (
    <Dialog open={showCreatePrompt} onClose={() => {}} size="md">
      <div className="w-full transform overflow-hidden p-6 text-left align-middle">
        <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
          Welcome to Hexaverse!
        </DialogTitle>
        <div className="mt-2">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            You need to create a colony to start your adventure in the Hexaverse. Would you like to create one now?
          </p>
        </div>

        <div className="mt-4 flex justify-end space-x-3">
          <Button
            color="indigo"
            onClick={handleCreateColony}
          >
            Create Colony
          </Button>
        </div>
      </div>
    </Dialog>
  );
} 