import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/button';
import { Badge } from '@/components/badge';
import { Input, InputGroup } from '@/components/input';
import { Select } from '@/components/select';
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '@/components/dropdown';
import { EllipsisVerticalIcon } from '@heroicons/react/16/solid';
import { collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import logger from '@/utils/logger';

interface SupportRequest {
  id: string;
  category: 'idea' | 'problem' | 'other';
  title: string;
  description: string;
  userId: string;
  userEmail: string;
  createdAt: number;
  status: 'new' | 'in-review' | 'completed';
}

export default function SupportAdminControls() {
  const { isAdmin } = useAuth();
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupportRequest['status'] | 'all'>('all');

  const fetchSupportRequests = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'support_requests'));
      const requests = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportRequest[];
      setSupportRequests(requests);
    } catch (error) {
      logger.error('Error fetching support requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSupportRequests();
    }
  }, [isAdmin]);

  // Don't render anything if not an admin
  if (!isAdmin) return null;

  const handleStatusChange = async (requestId: string, newStatus: SupportRequest['status']) => {
    try {
      const requestRef = doc(db, 'support_requests', requestId);
      await updateDoc(requestRef, {
        status: newStatus
      });
      // Refresh the requests after update
      await fetchSupportRequests();
    } catch (error) {
      logger.error('Error updating request status:', error);
    }
  };

  const filteredRequests = supportRequests.filter((request: SupportRequest) => {
    const matchesSearch = 
      request.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeColor = (status: SupportRequest['status']) => {
    switch (status) {
      case 'new': return 'red';
      case 'in-review': return 'yellow';
      case 'completed': return 'lime';
      default: return 'zinc';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="max-sm:w-full sm:flex-1">
          <div className="flex max-w-xl gap-4">
            <div className="flex-1">
              <InputGroup>
                <Input 
                  placeholder="Search requests..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </div>
            <div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SupportRequest['status'] | 'all')}
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="in-review">In Review</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
          </div>
        </div>
        <Button onClick={fetchSupportRequests} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No support requests found.</div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold truncate">{request.title}</h3>
                    <Badge color={getStatusBadgeColor(request.status)}>
                      {request.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {request.category} • {request.userEmail} • {formatDate(request.createdAt)}
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {request.description}
                  </p>
                </div>
                <Dropdown>
                  <DropdownButton plain>
                    <EllipsisVerticalIcon className="h-5 w-5" />
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    <DropdownItem
                      onClick={() => handleStatusChange(request.id, 'new')}
                      disabled={request.status === 'new'}
                    >
                      Mark as New
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => handleStatusChange(request.id, 'in-review')}
                      disabled={request.status === 'in-review'}
                    >
                      Mark In Review
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => handleStatusChange(request.id, 'completed')}
                      disabled={request.status === 'completed'}
                    >
                      Mark as Completed
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 