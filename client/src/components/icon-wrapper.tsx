import React from 'react';

interface IconWrapperProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  className?: string;
  size?: string | number;
}

/**
 * A wrapper component that correctly sizes Heroicons in Firebase emulator
 * Use this component to wrap any Heroicons that appear too large
 */
export function IconWrapper({ 
  icon: Icon, 
  className = '', 
  size = '1em',
  ...props 
}: IconWrapperProps & Omit<React.SVGProps<SVGSVGElement>, 'ref'>) {
  return (
    <Icon 
      className={`inline-block align-middle ${className}`}
      style={{ 
        width: size, 
        height: size, 
        flexShrink: 0,
        display: 'inline-block',
        verticalAlign: 'middle'
      }}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      {...props}
    />
  );
} 