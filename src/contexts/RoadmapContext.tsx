'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RoadmapItemProps } from '@/components/roadmap';
import { 
  fetchRoadmapItems, 
  addRoadmapItem as addRoadmapItemToFirestore,
  updateRoadmapItem as updateRoadmapItemInFirestore,
  deleteRoadmapItem as deleteRoadmapItemFromFirestore,
  fetchRoadmapItemsByStatus
} from '@/services/roadmap';

// Define the roadmap item with an ID
export interface RoadmapItem extends RoadmapItemProps {
  id: string;
}

// Define the context interface
interface RoadmapContextType {
  roadmapItems: RoadmapItem[];
  isLoading: boolean;
  error: Error | null;
  addRoadmapItem: (item: Omit<RoadmapItem, 'id'>) => Promise<void>;
  updateRoadmapItem: (id: string, updates: Partial<RoadmapItemProps>) => Promise<void>;
  deleteRoadmapItem: (id: string) => Promise<void>;
  getRoadmapItemsByStatus: (status: RoadmapItemProps['status']) => RoadmapItem[];
  refreshRoadmapItems: () => Promise<void>;
}

// Create the context with a default value
const RoadmapContext = createContext<RoadmapContextType | undefined>(undefined);

// Provider component
export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to load data from Firestore
  const loadData = async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      // Fetch from Firestore
      const items = await fetchRoadmapItems({ forceRefresh });
      setRoadmapItems(items);
      setError(null);
    } catch (err) {
      console.error('Error loading roadmap items:', err);
      setError(err instanceof Error ? err : new Error('Failed to load roadmap items'));
    } finally {
      setIsLoading(false);
    }
  };

  // Function to refresh data
  const refreshRoadmapItems = async () => {
    await loadData(true);
  };

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Add a roadmap item
  const addRoadmapItem = async (item: Omit<RoadmapItem, 'id'>) => {
    try {
      setIsLoading(true);
      // Add via cloud function
      const newItem = await addRoadmapItemToFirestore(item);
      
      // Update local state
      setRoadmapItems((prevItems) => [...prevItems, newItem]);
      setError(null);
      return Promise.resolve();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to add roadmap item');
      setError(error);
      return Promise.reject(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update a roadmap item
  const updateRoadmapItem = async (id: string, updates: Partial<RoadmapItemProps>) => {
    try {
      setIsLoading(true);
      // Update via cloud function
      await updateRoadmapItemInFirestore(id, updates);
      
      // Update local state
      setRoadmapItems((prevItems) =>
        prevItems.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        )
      );
      setError(null);
      return Promise.resolve();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update roadmap item');
      setError(error);
      return Promise.reject(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a roadmap item
  const deleteRoadmapItem = async (id: string) => {
    try {
      setIsLoading(true);
      // Delete via cloud function
      await deleteRoadmapItemFromFirestore(id);
      
      // Update local state
      setRoadmapItems((prevItems) => prevItems.filter((item) => item.id !== id));
      setError(null);
      return Promise.resolve();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete roadmap item');
      setError(error);
      return Promise.reject(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get roadmap items by status
  const getRoadmapItemsByStatus = (status: RoadmapItemProps['status']) => {
    return roadmapItems.filter((item) => item.status === status);
  };

  // Context value
  const value: RoadmapContextType = {
    roadmapItems,
    isLoading,
    error,
    addRoadmapItem,
    updateRoadmapItem,
    deleteRoadmapItem,
    getRoadmapItemsByStatus,
    refreshRoadmapItems
  };

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}

// Custom hook for using the context
export function useRoadmap() {
  const context = useContext(RoadmapContext);
  if (context === undefined) {
    throw new Error('useRoadmap must be used within a RoadmapProvider');
  }
  return context;
} 