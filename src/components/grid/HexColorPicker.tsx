'use client'

import React, { useState, useCallback, useEffect } from 'react';

// Default color palette - extended with more color options
const DEFAULT_COLORS = [
  '#FF5252', // Red
  '#FFAB40', // Orange
  '#FFEB3B', // Yellow
  '#66BB6A', // Green
  '#29B6F6', // Blue
  '#7E57C2', // Purple
  '#F48FB1', // Pink
  '#90A4AE', // Gray
  '#FFFFFF', // White
  '#000000', // Black
  '#4DD0E1', // Cyan
  '#BCAAA4', // Brown
];

type HexColorPickerProps = {
  onColorSelect: (color: string) => void;
  initialColor?: string;
};

export function HexColorPicker({ onColorSelect, initialColor }: HexColorPickerProps) {
  const [selectedColor, setSelectedColor] = useState(initialColor || DEFAULT_COLORS[0]);
  const [paletteColors, setPaletteColors] = useState<string[]>([]);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState('');
  const [showColorInput, setShowColorInput] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);

  // Initialize palette with default colors and possibly recent ones
  useEffect(() => {
    // Try to load recent colors from localStorage
    try {
      const savedColors = localStorage.getItem('recentColors');
      if (savedColors) {
        setRecentColors(JSON.parse(savedColors));
      }
    } catch (e) {
      console.error('Failed to load recent colors:', e);
    }

    // Set initial palette - first 6 colors or less if there are fewer
    setPaletteColors(DEFAULT_COLORS.slice(0, 6));
  }, []);

  // Update initial color when prop changes
  useEffect(() => {
    if (initialColor) {
      setSelectedColor(initialColor);
    }
  }, [initialColor]);

  // Calculate positions for the hexagons
  const hexPositions = [
    { x: 0, y: 0 }, // Center
    { x: 0, y: -1 }, // Top
    { x: 0.866, y: -0.5 }, // Top right
    { x: 0.866, y: 0.5 }, // Bottom right
    { x: 0, y: 1 }, // Bottom
    { x: -0.866, y: 0.5 }, // Bottom left
    { x: -0.866, y: -0.5 }, // Top left
  ];

  const handleColorClick = useCallback((color: string) => {
    setSelectedColor(color);
    onColorSelect(color);
    
    // Save to recent colors
    const newRecentColors = [color, ...recentColors.filter(c => c !== color)].slice(0, 6);
    setRecentColors(newRecentColors);
    
    try {
      localStorage.setItem('recentColors', JSON.stringify(newRecentColors));
    } catch (e) {
      console.error('Failed to save recent colors:', e);
    }
  }, [onColorSelect, recentColors]);

  const handleMouseEnter = useCallback((color: string) => {
    setHoveredColor(color);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredColor(null);
  }, []);

  const handleCustomColorSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (customColor && /^#[0-9A-F]{6}$/i.test(customColor)) {
      handleColorClick(customColor);
      setShowColorInput(false);
      setCustomColor('');
      
      // Replace the last color in the palette with the new custom color
      setPaletteColors(prev => {
        const newPalette = [...prev];
        newPalette[newPalette.length - 1] = customColor;
        return newPalette;
      });
    }
  }, [customColor, handleColorClick]);

  const toggleColorInput = useCallback(() => {
    setShowColorInput(!showColorInput);
  }, [showColorInput]);

  // Rotate colors in the palette
  const rotateColors = useCallback((direction: 'left' | 'right') => {
    setPaletteColors(prev => {
      const allColors = [...DEFAULT_COLORS, ...recentColors.filter(c => !DEFAULT_COLORS.includes(c))];
      const currentFirstIndex = allColors.findIndex(c => c === prev[0]);
      const totalColors = allColors.length;
      
      let newStartIndex = direction === 'right' 
        ? (currentFirstIndex + 1) % totalColors
        : (currentFirstIndex - 1 + totalColors) % totalColors;
      
      // Get 6 colors starting from the new index, wrapping around if needed
      const newPalette = [];
      for (let i = 0; i < 6; i++) {
        newPalette.push(allColors[(newStartIndex + i) % totalColors]);
      }
      
      return newPalette;
    });
  }, [recentColors]);

  return (
    <div className="relative w-48 h-48 flex flex-col items-center justify-center">
      {/* Central hexagon (selected color) and surrounding hexagons */}
      <svg 
        className="w-full h-full" 
        viewBox="-3 -3 6 6" 
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Draw surrounding color hexagons */}
        {paletteColors.map((color, i) => {
          const pos = hexPositions[i + 1];
          const scale = 0.9; // Smaller than center
          
          return (
            <g 
              key={i} 
              transform={`translate(${pos.x * 2}, ${pos.y * 2})`}
              onClick={() => handleColorClick(color)}
              onMouseEnter={() => handleMouseEnter(color)}
              onMouseLeave={handleMouseLeave}
              className="cursor-pointer"
              style={{ transition: 'transform 0.2s ease' }}
            >
              <path 
                d={`M ${scale} 0 L ${scale * 0.5} ${scale * 0.866} L ${-scale * 0.5} ${scale * 0.866} L ${-scale} 0 L ${-scale * 0.5} ${-scale * 0.866} L ${scale * 0.5} ${-scale * 0.866} Z`}
                fill={color}
                stroke={hoveredColor === color ? "#FFFFFF" : "rgba(0,0,0,0.2)"}
                strokeWidth="0.15"
                style={{ 
                  transition: 'all 0.2s ease',
                  transform: hoveredColor === color ? 'scale(1.1)' : 'scale(1)'
                }}
              />
            </g>
          );
        })}
        
        {/* Center hexagon (selected color) */}
        <g>
          <path 
            d="M 1 0 L 0.5 0.866 L -0.5 0.866 L -1 0 L -0.5 -0.866 L 0.5 -0.866 Z"
            fill={selectedColor}
            stroke="#FFFFFF"
            strokeWidth="0.1"
            filter="drop-shadow(0 0 0.2px rgba(0,0,0,0.3))"
            style={{ transition: 'fill 0.3s ease' }}
          />
          <text
            fill={isColorDark(selectedColor) ? "#FFFFFF" : "#000000"}
            fontSize="0.4"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ transition: 'fill 0.3s ease' }}
          >
            {selectedColor.toUpperCase()}
          </text>
        </g>
      </svg>
      
      {/* Palette rotation controls */}
      <div className="flex justify-between w-full mt-2">
        <button 
          className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
          onClick={() => rotateColors('left')}
        >
          ◀
        </button>
        
        <button
          className="bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-xs px-2 py-1 rounded"
          onClick={toggleColorInput}
        >
          + Custom
        </button>
        
        <button 
          className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
          onClick={() => rotateColors('right')}
        >
          ▶
        </button>
      </div>
      
      {/* Custom color input */}
      {showColorInput && (
        <form onSubmit={handleCustomColorSubmit} className="mt-2 w-full">
          <div className="flex">
            <input
              type="text"
              placeholder="#FF5252"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border rounded-l border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"
              pattern="^#[0-9A-F]{6}$"
              required
            />
            <button
              type="submit"
              className="bg-blue-500 text-white px-2 py-1 rounded-r text-sm"
            >
              Add
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Helper function to determine if a color is dark
function isColorDark(hexColor: string): boolean {
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return true if the color is dark
  return luminance < 0.5;
} 