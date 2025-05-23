import React, { useState } from 'react';
import { useRoadmap } from '@/contexts/RoadmapContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/button';
import { Badge } from '@/components/badge';
import { Divider } from '@/components/divider';
import { Input, InputGroup } from '@/components/input';
import { Select } from '@/components/select';
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '@/components/dropdown';
import { EllipsisVerticalIcon } from '@heroicons/react/16/solid';
import { Subheading } from '@/components/heading';
import logger from '@/utils/logger';

interface RoadmapFormData {
  title: string;
  description: string;
  status: 'development' | 'upcoming' | 'vision';
  progress?: number;
  expectedDate?: string;
}

interface RoadmapAdminControlsProps {
  onAction?: () => void;
}

export function RoadmapAdminControls({ onAction }: RoadmapAdminControlsProps) {
  const { isAdmin } = useAuth();
  const { addRoadmapItem, updateRoadmapItem, deleteRoadmapItem, roadmapItems, isLoading, refreshRoadmapItems } = useRoadmap();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const initialFormState: RoadmapFormData = {
    title: '',
    description: '',
    status: 'vision',
  };
  
  const [formData, setFormData] = useState<RoadmapFormData>(initialFormState);

  // Don't render anything if not an admin
  if (!isAdmin) return null;

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingItemId(null);
    setIsFormOpen(false);
    setFormError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'progress' ? Number(value) || undefined : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    try {
      if (editingItemId) {
        await updateRoadmapItem(editingItemId, formData);
      } else {
        await addRoadmapItem(formData);
      }
      
      resetForm();
      
      // Refresh data to get updated list from server
      await refreshRoadmapItems();
      
      // Call optional callback
      if (onAction) onAction();
    } catch (error) {
      logger.error('Error saving roadmap item:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to save roadmap item');
    }
  };

  const handleEdit = (id: string) => {
    const itemToEdit = roadmapItems.find(item => item.id === id);
    if (itemToEdit) {
      const { id: _, ...rest } = itemToEdit;
      setFormData(rest as RoadmapFormData);
      setEditingItemId(id);
      setIsFormOpen(true);
      setFormError(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this roadmap item?')) {
      try {
        await deleteRoadmapItem(id);
        
        // Refresh data to get updated list from server
        await refreshRoadmapItems();
        
        // Call optional callback
        if (onAction) onAction();
      } catch (error) {
        logger.error('Error deleting roadmap item:', error);
        alert('Error deleting roadmap item: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  };

  // Filter roadmap items based on search term
  const filteredItems = roadmapItems.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'development': return 'lime';
      case 'upcoming': return 'blue';
      case 'vision': return 'purple';
      default: return 'zinc';
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="max-sm:w-full sm:flex-1">
          <div className="flex max-w-xl gap-4">
            <div className="flex-1">
              <InputGroup>
                <Input 
                  placeholder="Search roadmap items..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </div>
            <div>
              <Select name="sort_by">
                <option value="title">Sort by title</option>
                <option value="status">Sort by status</option>
              </Select>
            </div>
          </div>
        </div>
        <Button onClick={() => setIsFormOpen(true)} disabled={isLoading || isFormOpen}>
          {isFormOpen ? 'Adding Item...' : 'Add New Item'}
        </Button>
      </div>

      {formError && (
        <div className="mb-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {formError}
        </div>
      )}

      {isFormOpen && (
        <div className="mb-8 bg-gray-50 dark:bg-zinc-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-700">
          <Subheading level={2} className="mb-4">
            {editingItemId ? 'Edit Roadmap Item' : 'Add New Roadmap Item'}
          </Subheading>
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <Select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                >
                  <option value="development">In Development</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="vision">Vision</option>
                </Select>
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                rows={3}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-zinc-800 dark:text-white"
              ></textarea>
            </div>

            {formData.status === 'development' && (
              <div className="mb-4">
                <label htmlFor="progress" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Progress (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    id="progress"
                    name="progress"
                    min="0"
                    max="100"
                    value={formData.progress || 0}
                    onChange={handleInputChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <span className="text-sm font-medium w-10 text-right">
                    {formData.progress || 0}%
                  </span>
                </div>
              </div>
            )}

            {formData.status === 'upcoming' && (
              <div className="mb-4">
                <label htmlFor="expectedDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expected Date
                </label>
                <Input
                  type="text"
                  id="expectedDate"
                  name="expectedDate"
                  placeholder="e.g. Q3 2023"
                  value={formData.expectedDate || ''}
                  onChange={handleInputChange}
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button 
                color="zinc" 
                onClick={resetForm} 
                type="button"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                color="green"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : (editingItemId ? 'Update Item' : 'Add Item')}
              </Button>
            </div>
          </form>
        </div>
      )}

      <ul className="mt-6">
        {filteredItems.length === 0 ? (
          <li className="py-6 text-center text-zinc-500 dark:text-zinc-400">
            No roadmap items found. Add some to get started.
          </li>
        ) : (
          filteredItems.map((item, index) => (
            <li key={item.id}>
              <Divider soft={index > 0} />
              <div className="flex items-center justify-between py-6">
                <div className="flex flex-1 gap-6">
                  <div className="space-y-1.5">
                    <div className="text-base/6 font-semibold">{item.title}</div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</div>
                    {item.status === 'development' && item.progress !== undefined && (
                      <div className="mt-2">
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
                    {item.status === 'upcoming' && item.expectedDate && (
                      <div className="text-xs/6 text-zinc-500">
                        Expected: {item.expectedDate}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge className="max-sm:hidden" color={getStatusBadgeColor(item.status || 'vision')}>
                    {item.status === 'development' ? 'Development' : 
                     item.status === 'upcoming' ? 'Upcoming' : 'Vision'}
                  </Badge>
                  <Dropdown>
                    <DropdownButton plain aria-label="More options">
                      <EllipsisVerticalIcon 
                        className="h-5 w-5" 
                        style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
                        aria-hidden="true" 
                      />
                    </DropdownButton>
                    <DropdownMenu anchor="bottom end">
                      <DropdownItem onClick={() => handleEdit(item.id)}>Edit</DropdownItem>
                      <DropdownItem onClick={() => handleDelete(item.id)}>Delete</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
} 