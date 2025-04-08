'use client';

import React, { useEffect, useState } from 'react';
import { marked } from 'marked';

export default function ChangelogPage() {
  const [content, setContent] = useState<string>('Loading changelog...');

  useEffect(() => {
    fetch('/CHANGELOG.md')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load changelog');
        }
        return response.text();
      })
      .then(text => {
        // Configure marked with supported options
        marked.setOptions({
          gfm: true,
          breaks: true
        });
        
        // Parse the markdown to HTML
        const htmlContent = marked.parse(text);
        
        // Handle potential Promise result
        if (htmlContent instanceof Promise) {
          htmlContent.then(result => setContent(result));
        } else {
          setContent(htmlContent);
        }
      })
      .catch(error => {
        console.error('Error loading changelog:', error);
        setContent('Failed to load changelog. Please try again later.');
      });
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-900 dark:text-white">Changelog</h1>
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6">
        <div className="changelog-content" dangerouslySetInnerHTML={{ __html: content }} />
      </div>
      
      <style jsx global>{`
        .changelog-content h2 {
          font-size: 1.5rem;
          font-weight: bold;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
          color: #2563eb;
        }
        
        .dark .changelog-content h2 {
          color: #60a5fa;
          border-bottom-color: #374151;
        }
        
        .changelog-content h3 {
          font-size: 1.25rem;
          font-weight: bold;
          margin-top: 1rem;
          margin-bottom: 0.75rem;
          color: #1f2937;
        }
        
        .dark .changelog-content h3 {
          color: #e5e7eb;
        }
        
        .changelog-content ul {
          margin-left: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .changelog-content li {
          list-style-type: disc;
          margin-bottom: 0.25rem;
        }
        
        .dark .changelog-content {
          color: #d1d5db;
        }
      `}</style>
    </div>
  );
} 