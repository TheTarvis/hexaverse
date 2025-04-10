import React from 'react';

export type RoadmapItemProps = {
  title: string;
  description: string;
  status?: 'development' | 'upcoming' | 'vision';
  progress?: number;
  expectedDate?: string;
};

const RoadmapItem: React.FC<RoadmapItemProps> = ({ 
  title, 
  description, 
  status = 'vision',
  progress,
  expectedDate
}) => {
  // Determine the border color based on status
  const getBorderColor = () => {
    switch (status) {
      case 'development': return 'border-green-500';
      case 'upcoming': return 'border-blue-500';
      case 'vision': return 'border-purple-500';
      default: return 'border-gray-500';
    }
  };

  return (
    <div className={`border-l-4 ${getBorderColor()} pl-4 py-2`}>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-700 dark:text-gray-300">{description}</p>
      
      {progress !== undefined && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{progress}% Complete</div>
        </div>
      )}
      
      {expectedDate && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">Expected: {expectedDate}</div>
      )}
    </div>
  );
};

export default RoadmapItem; 