'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Select } from '@/components/select';
import { Input, InputGroup } from '@/components/input';
import { Button } from '@/components/button';
import { Heading } from '@/components/heading';
import { submitSupportRequest } from '@/services/support';
import { useToast } from '@/contexts/ToastContext';
import Link from 'next/link';

type SupportCategory = 'idea' | 'problem' | 'other';

export default function SupportPage() {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [category, setCategory] = useState<SupportCategory>('idea');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      showToast('You must be logged in to submit a support request', 'error');
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const response = await submitSupportRequest({
        category,
        title,
        description,
        userId: user.uid,
        userEmail: user.email || ''
      });

      if (response.success) {
        setSubmitSuccess(true);
        setTitle('');
        setDescription('');
        setCategory('idea');
        showToast('Your support request has been submitted successfully', 'success');
      }
    } catch (error) {
      console.error('Error submitting support request:', error);
      showToast(
        error instanceof Error ? error.message : 'An error occurred while submitting your request',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div className="max-sm:w-full sm:flex-1">
            <Heading>Support</Heading>
          </div>
          {isAdmin && (
            <Link href="/admin/support">
              <Button>Admin Dashboard</Button>
            </Link>
          )}
        </div>
        
        {submitSuccess && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            Thank you for your submission! We&apos;ll review it and get back to you soon.
          </div>
        )}

        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-6">
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                  Category
                </label>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportCategory)}
                >
                  <option value="idea">Feature Idea</option>
                  <option value="problem">Report a Problem</option>
                  <option value="other">Other</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                  Title
                </label>
                <InputGroup>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief summary of your idea or problem"
                    required
                  />
                </InputGroup>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                  Description
                </label>
                <InputGroup>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide more details..."
                    className="w-full px-3 py-2 min-h-[150px] rounded-lg bg-white dark:bg-zinc-700 border-zinc-950/10 dark:border-white/10 text-zinc-950 dark:text-white placeholder:text-zinc-500"
                    required
                  />
                </InputGroup>
              </div>

              <div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 