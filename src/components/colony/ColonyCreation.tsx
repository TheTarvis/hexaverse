import React, { useState, useMemo } from 'react';
import { useColony } from '@/contexts/ColonyContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';

// Utility function to convert hex to HSL
const hexToHSL = (hex: string): { h: number; s: number; l: number } => {
  // Remove the # if present
  hex = hex.replace('#', '');
  
  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
};

// Utility function to convert HSL to hex
const hslToHex = (h: number, s: number, l: number): string => {
  h /= 360;
  s /= 100;
  l /= 100;
  
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Define base colony colors
const baseColonyColors = [
  { name: 'indigo', value: '#6366f1', textColor: 'white' },
  { name: 'blue', value: '#3b82f6', textColor: 'white' },
  { name: 'sky', value: '#0ea5e9', textColor: 'white' },
  { name: 'cyan', value: '#06b6d4', textColor: 'white' },
  { name: 'teal', value: '#14b8a6', textColor: 'white' },
  { name: 'emerald', value: '#10b981', textColor: 'white' },
  { name: 'green', value: '#22c55e', textColor: 'white' },
  { name: 'lime', value: '#84cc16', textColor: 'black' },
  { name: 'yellow', value: '#eab308', textColor: 'black' },
  { name: 'amber', value: '#f59e0b', textColor: 'black' },
  { name: 'orange', value: '#f97316', textColor: 'black' },
  { name: 'red', value: '#ef4444', textColor: 'white' },
  { name: 'pink', value: '#ec4899', textColor: 'white' },
  { name: 'purple', value: '#a855f7', textColor: 'white' },
  { name: 'violet', value: '#8b5cf6', textColor: 'white' },
];

// Function to generate color variations
const generateColorVariations = (baseColors: typeof baseColonyColors) => {
  const variations: typeof baseColonyColors = [];
  
  baseColors.forEach(baseColor => {
    // Get HSL values for the base color
    const hsl = hexToHSL(baseColor.value);
    
    // Create 3 variations of each color with slightly different hue and saturation
    for (let i = 0; i < 3; i++) {
      // Adjust hue by -10, 0, or +10 degrees
      const hueShift = (i - 1) * 10;
      // Adjust saturation by -5, 0, or +5 percent
      const satShift = (i - 1) * 5;
      
      const newHue = (hsl.h + hueShift + 360) % 360;
      const newSat = Math.max(0, Math.min(100, hsl.s + satShift));
      
      const newHex = hslToHex(newHue, newSat, hsl.l);
      variations.push({
        name: `${baseColor.name}-${i + 1}`,
        value: newHex,
        textColor: baseColor.textColor
      });
    }
  });
  
  // Shuffle the variations
  for (let i = variations.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [variations[i], variations[j]] = [variations[j], variations[i]];
  }
  
  // Return a subset of the variations to keep the UI manageable
  return variations.slice(0, 15);
};

export function ColonyCreation() {
  const router = useRouter();
  const { createNewColony, isLoadingColony, error, refreshColony } = useColony();
  const { showToast } = useToast();
  
  // Generate and memoize color variations
  const colonyColors = useMemo(() => generateColorVariations(baseColonyColors), []);
  
  const [colonyName, setColonyName] = useState('');
  const [colonyColor, setColonyColor] = useState(colonyColors[0].value);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!colonyName.trim()) {
      setLocalError('Colony name is required');
      return;
    }
    
    try {
      const colony = await createNewColony(colonyName.trim(), colonyColor);
      // Show success toast
      showToast(`Colony "${colony.name}" created successfully!`, 'success', 2000);
      
      // Refresh the page after a short delay
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (err) {
      // Error is already handled in the context
      console.error('Error in colony creation component:', err);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-zinc-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Create Your Colony</h2>
      
      <p className="mb-4 text-gray-700 dark:text-zinc-300">
        Welcome to Hexaverse! To begin your journey, create your first colony by giving it a name and choosing a color.
      </p>
      
      {(error || localError) && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error || localError}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="colony-name" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Colony Name
          </label>
          <input
            id="colony-name"
            type="text"
            value={colonyName}
            onChange={(e) => {
              setColonyName(e.target.value);
              setLocalError(null);
            }}
            disabled={isLoadingColony}
            className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-70"
            placeholder="Enter a name for your colony"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Colony Color
          </label>
          <div className="grid grid-cols-5 gap-2">
            {colonyColors.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => setColonyColor(color.value)}
                disabled={isLoadingColony}
                className={`w-full aspect-square rounded-md border ${
                  colonyColor === color.value 
                    ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-zinc-800' 
                    : 'border-gray-300 dark:border-zinc-700'
                } ${isLoadingColony ? 'opacity-70 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: color.value }}
                title={color.name}
                aria-label={`Select ${color.name} color`}
              >
                {colonyColor === color.value && (
                  <span style={{ color: color.textColor }} className="text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        <button
          type="submit"
          disabled={isLoadingColony}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoadingColony ? 'Creating...' : 'Create Colony'}
        </button>
      </form>
    </div>
  );
} 