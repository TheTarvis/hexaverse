'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { Colony } from '@/types/colony';
import { fetchUserColony, createColony, hasColony, fetchColonyById } from '@/services/colony';

interface ColonyContextType {
  colony: Colony | null;
  isLoadingColony: boolean;
  hasColony: boolean;
  createNewColony: (name: string, color?: string) => Promise<Colony>;
  refreshColony: (options?: { silent?: boolean }) => Promise<void>;
  fetchColonyById: (colonyId: string) => Promise<Colony>;
  error: string | null;
}

const ColonyContext = createContext<ColonyContextType | undefined>(undefined);

export function ColonyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [colony, setColony] = useState<Colony | null>(null);
  const [isLoadingColony, setIsLoadingColony] = useState(false);
  const [hasExistingColony, setHasExistingColony] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load colony data when user changes
  useEffect(() => {
    async function loadUserColony() {
      if (!user) {
        setColony(null);
        setHasExistingColony(false);
        setIsLoadingColony(false);
        return;
      }

      setIsLoadingColony(true);
      setError(null);

      try {
        console.log("Checking if user has colony:", user.uid);
        // Check if user has a colony
        const userHasColony = await hasColony(user.uid);
        setHasExistingColony(userHasColony);

        if (userHasColony) {
          console.log("Fetching colony data for user:", user.uid);
          const colonyData = await fetchUserColony(user.uid);
          console.log('Colony data loaded:', colonyData);
          setColony(colonyData);
        } else {
          console.log("User has no colony yet");
          setColony(null);
        }
      } catch (err) {
        console.error('Error loading colony:', err);
        setError('Failed to load colony data');
        setColony(null);
      } finally {
        setIsLoadingColony(false);
      }
    }

    // Only attempt to load colony if we have a valid user
    if (user && user.uid) {
      loadUserColony();
    } else {
      setIsLoadingColony(false);
      setColony(null);
      setHasExistingColony(false);
    }
  }, [user]);

  const createNewColony = async (name: string, color?: string): Promise<Colony> => {
    if (!user) {
      throw new Error('User must be logged in to create a colony');
    }

    setIsLoadingColony(true);
    setError(null);

    try {
      // We still need to pass the UID for Firestore storage,
      // but the backend API will authenticate via token
      const newColony = await createColony({
        name,
        color,
        uid: user.uid
      });
      
      setColony(newColony);
      setHasExistingColony(true);
      return newColony;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error creating colony';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoadingColony(false);
    }
  };

  const getColonyById = async (colonyId: string): Promise<Colony> => {
    if (!user) {
      throw new Error('User must be logged in to fetch a colony');
    }

    try {
      return await fetchColonyById(colonyId);
    } catch (error) {
      console.error('Error fetching colony by ID:', error);
      throw error;
    }
  };

  const refreshColony = async (options?: { silent?: boolean }): Promise<void> => {
    if (!user) {
      return;
    }

    // If silent refresh is requested, don't set loading state
    if (!options?.silent) {
      setIsLoadingColony(true);
    }
    setError(null);

    try {
      const colonyData = await fetchUserColony(user.uid);
      setColony(prev => {
        // If this is a silent refresh and we have previous data, 
        // only update metadata like tileIds and territoryScore,
        // but keep the existing tiles array to prevent unnecessary reloads
        if (options?.silent && prev && prev.tiles && colonyData) {
          return {
            ...colonyData,
            tiles: prev.tiles
          };
        }
        return colonyData;
      });
      setHasExistingColony(colonyData !== null);
    } catch (err) {
      console.error('Error refreshing colony:', err);
      setError('Failed to refresh colony data');
    } finally {
      if (!options?.silent) {
        setIsLoadingColony(false);
      }
    }
  };

  const value = {
    colony,
    isLoadingColony,
    hasColony: hasExistingColony,
    createNewColony,
    refreshColony,
    fetchColonyById: getColonyById,
    error
  };

  return (
    <ColonyContext.Provider value={value}>
      {children}
    </ColonyContext.Provider>
  );
}

export function useColony() {
  const context = useContext(ColonyContext);
  if (context === undefined) {
    throw new Error('useColony must be used within a ColonyProvider');
  }
  return context;
} 