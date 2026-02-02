import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Copy,
  Undo,
  Redo,
  Settings,
  ChevronUp,
  ChevronDown,
  Check,
  GripVertical,
  Lock,
  Unlock
} from 'lucide-react';

// --- Utils & Constants ---

const POINT_COLORS = [
  '#ef4444', // red-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
];

const DEFAULT_SIZE = { width: 400, height: 400 };

// Helper to convert Hex + Opacity to RGBA string
const hexToRgba = (hex, alpha) => {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0,0,0,${alpha})`;

  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

// Generate a random polygon
const generatePolygon = (pointCount = 3) => {
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2 - Math.PI / 2;
    const r = 40;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    points.push({ x: Math.round(x), y: Math.round(y) });
  }
  return points;
};

// Convert points array to CSS string "50% 0%, 100% 100%..."
const pointsToCss = (points) => {
  return points.map(p => `${p.x}% ${p.y}%`).join(', ');
};

// Parse CSS string back to points array. Handles % and px (converts px to %)
const cssToPoints = (cssString, canvasWidth, canvasHeight) => {
  // Regex matches: number (group 1) + optional unit (group 2), whitespace, number (group 3) + optional unit (group 4)
  const regex = /(-?\d*\.?\d+)(%|px)?\s+(-?\d*\.?\d+)(%|px)?/gi;
  const points = [];
  let match;
  
  // Safety check for empty dimensions to avoid divide by zero
  const w = canvasWidth || 1;
  const h = canvasHeight || 1;

  while ((match = regex.exec(cssString)) !== null) {
    let xVal = parseFloat(match[1]);
    const xUnit = match[2] ? match[2].toLowerCase() : '%'; // Default to %
    
    let yVal = parseFloat(match[3]);
    const yUnit = match[4] ? match[4].toLowerCase() : '%'; // Default to %

    // Convert pixels to percentages
    if (xUnit === 'px') xVal = (xVal / w) * 100;
    if (yUnit === 'px') yVal = (yVal / h) * 100;

    points.push({
      x: parseFloat(xVal.toFixed(2)), 
      y: parseFloat(yVal.toFixed(2)) 
    });
  }
  return points;
};

// --- Components ---

export default function App() {
  // --- State ---
  const [layers, setLayers] = useState([
    { id: '1', name: 'Base Shape', visible: true, color: '#3b82f6', opacity: 1, points: generatePolygon(5) }
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState('1');
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const [canvasSize, setCanvasSize] = useState(DEFAULT_SIZE);
  const [bgColor, setBgColor] = useState('#e5e7eb');
  const [bgImage, setBgImage] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [lockShape, setLockShape] = useState(false);
  
  // Ref to access latest layers in callbacks without updating dependencies
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  
  // Code Editor States
  const [showAllCss, setShowAllCss] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [manualCode, setManualCode] = useState(null); // Local state for text editing
  const [isEditingCode, setIsEditingCode] = useState(false);

  const dragItem = useRef(null); // For dragging points on canvas
  const resizeItem = useRef(null); // For resizing canvas { type: 'x' | 'y' | 'xy', startX, startY, startWidth, startHeight }
  const canvasRef = useRef(null);
  
  // DnD for Layers
  const dragLayerItem = useRef(null);
  const dragOverLayerItem = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
             setCanvasSize({ width: img.naturalWidth, height: img.naturalHeight });
             setBgImage(reader.result);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleResizeMouseDown = (e, type) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection/native drag
    resizeItem.current = { 
        type, 
        startX: e.clientX, 
        startY: e.clientY, 
        startWidth: canvasSize.width, 
        startHeight: canvasSize.height,
        startLayers: layersRef.current // Capture current layers state
    };
    setIsDragging(true);
  };

  // --- Point Management ---
  const deletePoint = () => {
    if (selectedPointIndex === null || !activeLayer) return;
    if (activeLayer.points.length <= 3) return; // Minimum 3 points

    const newPoints = activeLayer.points.filter((_, i) => i !== selectedPointIndex);
    const newLayers = layers.map(l => l.id === activeLayer.id ? { ...l, points: newPoints } : l);
    updateLayers(newLayers, true);
    setSelectedPointIndex(null);
  };

  const addPointBefore = () => {
    if (selectedPointIndex === null || !activeLayer) return;
    const prevIndex = (selectedPointIndex - 1 + activeLayer.points.length) % activeLayer.points.length;
    const curr = activeLayer.points[selectedPointIndex];
    const prev = activeLayer.points[prevIndex];
    
    // Midpoint
    const newPoint = { x: parseFloat(((curr.x + prev.x) / 2).toFixed(2)), y: parseFloat(((curr.y + prev.y) / 2).toFixed(2)) };
    
    const newPoints = [...activeLayer.points];
    newPoints.splice(selectedPointIndex, 0, newPoint);
    
    const newLayers = layers.map(l => l.id === activeLayer.id ? { ...l, points: newPoints } : l);
    updateLayers(newLayers, true);
    setSelectedPointIndex(selectedPointIndex + 1); // Shift selection to keep it on the same physical node
  };

  const addPointAfter = () => {
    if (selectedPointIndex === null || !activeLayer) return;
    const nextIndex = (selectedPointIndex + 1) % activeLayer.points.length;
    const curr = activeLayer.points[selectedPointIndex];
    const next = activeLayer.points[nextIndex];
    
    // Midpoint
    const newPoint = { x: parseFloat(((curr.x + next.x) / 2).toFixed(2)), y: parseFloat(((curr.y + next.y) / 2).toFixed(2)) };
    
    const newPoints = [...activeLayer.points];
    newPoints.splice(selectedPointIndex + 1, 0, newPoint);
    
    const newLayers = layers.map(l => l.id === activeLayer.id ? { ...l, points: newPoints } : l);
    updateLayers(newLayers, true);
  };

  // --- History Management ---
  const addToHistory = useCallback((newLayers) => {
    const current = history.slice(0, historyIndex + 1);
    const snapshot = JSON.stringify(newLayers);
    if (current.length > 0 && JSON.stringify(current[current.length - 1]) === snapshot) return;

    const newHistory = [...current, newLayers];
    if (newHistory.length > 50) newHistory.shift();
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  useEffect(() => {
    if (history.length === 0) {
      addToHistory(layers);
    }
  }, []);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setLayers(history[newIndex]);
      setHistoryIndex(newIndex);
      setManualCode(null); // Reset manual code on undo
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setLayers(history[newIndex]);
      setHistoryIndex(newIndex);
      setManualCode(null); // Reset manual code on redo
    }
  };

  const updateLayers = (newLayers, saveToHistory = false) => {
    setLayers(newLayers);
    if (saveToHistory) addToHistory(newLayers);
  };

  // --- Layer Management ---
  const addLayer = () => {
    const newLayer = {
      id: Date.now().toString(),
      name: `Layer ${layers.length + 1}`,
      visible: true,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      opacity: 1,
      points: generatePolygon(3 + Math.floor(Math.random() * 3))
    };
    const newLayers = [...layers, newLayer];
    updateLayers(newLayers, true);
    setSelectedLayerId(newLayer.id);
  };

  const toggleLayerVisibility = (id) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    updateLayers(newLayers, true);
  };

  const deleteLayer = (id) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter(l => l.id !== id);
    updateLayers(newLayers, true);
    if (selectedLayerId === id) setSelectedLayerId(newLayers[0].id);
  };

  const moveLayer = (index, direction) => {
    if (direction === 'up' && index > 0) {
      const newLayers = [...layers];
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      updateLayers(newLayers, true);
    } else if (direction === 'down' && index < layers.length - 1) {
      const newLayers = [...layers];
      [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
      updateLayers(newLayers, true);
    }
  };

  const addPoint = () => {
    if (!activeLayer) return;

    // Default to adding a point between the first and last point (closing the loop visually)
    // or just offset from the first point.
    const p1 = activeLayer.points[0] || { x: 50, y: 50 };
    const p2 = activeLayer.points[1] || { x: 60, y: 60 };

    // Calculate midpoint
    const newPoint = {
      x: Math.round((p1.x + p2.x) / 2),
      y: Math.round((p1.y + p2.y) / 2)
    };

    const newPoints = [
      newPoint,
      ...activeLayer.points
    ];

    const newLayers = layers.map(l => 
      l.id === activeLayer.id ? { ...l, points: newPoints } : l
    );
    updateLayers(newLayers, true);
  };
  
  // Layer DnD Sorting
  const handleSort = () => {
    // Duplicate items
    let _layers = [...layers];

    // Remove and save the dragged item content
    const draggedItemContent = _layers.splice(dragLayerItem.current, 1)[0];

    // Switch the position
    _layers.splice(dragOverLayerItem.current, 0, draggedItemContent);

    // Reset references
    dragLayerItem.current = null;
    dragOverLayerItem.current = null;

    updateLayers(_layers, true);
  };

  // --- Canvas Interaction ---
  const handlePointMouseDown = (e, layerId, pointIndex) => {
    e.stopPropagation(); // Prevent canvas background click
    e.preventDefault(); // Prevent text selection
    dragItem.current = { layerId, pointIndex };
    setIsDragging(true);
    setSelectedLayerId(layerId);
    setSelectedPointIndex(pointIndex); // Select the point
    setManualCode(null);
  };

  const handleCanvasMouseDown = (e) => {
    // If clicking background, deselect
    setSelectedLayerId(null);
    setSelectedPointIndex(null); // Deselect point
    setManualCode(null);
  };
  
  const handleSidebarClick = (e) => {
    // Deselect if clicking whitespace in sidebar
    if (e.target === e.currentTarget) {
        setSelectedLayerId(null);
        setSelectedPointIndex(null);
        setManualCode(null);
    }
  };

  const handleMouseMove = useCallback((e) => {
    // Handle Canvas Resizing
    if (resizeItem.current) {
        const { type, startX, startY, startWidth, startHeight, startLayers } = resizeItem.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let isLeft = false;
        let isTop = false;

        // Determine resize direction
        const hasL = type.includes('l');
        const hasR = type.includes('r');
        const hasT = type.includes('t');
        const hasB = type.includes('b');

        if (hasL) {
            newWidth = Math.max(50, startWidth - dx);
            isLeft = true;
        } else if (hasR) {
            newWidth = Math.max(50, startWidth + dx);
        }

        if (hasT) {
            newHeight = Math.max(50, startHeight - dy);
            isTop = true;
        } else if (hasB) {
            newHeight = Math.max(50, startHeight + dy);
        }

        setCanvasSize({
            width: newWidth,
            height: newHeight
        });

        if (lockShape && startLayers) {
            const newLayers = startLayers.map(layer => ({
                ...layer,
                points: layer.points.map(p => {
                    // Convert % to pixels based on START dimension
                    let px = (p.x / 100) * startWidth;
                    let py = (p.y / 100) * startHeight;

                    // If growing/shrinking from Left/Top, we must shift the points
                    // by the delta to keep them in the same "World" position relative
                    // to the moving origin.
                    if (isLeft) {
                        px += (newWidth - startWidth);
                    }
                    if (isTop) {
                        py += (newHeight - startHeight);
                    }

                    // Convert back to % based on NEW dimension
                    return {
                        x: parseFloat(((px / newWidth) * 100).toFixed(2)),
                        y: parseFloat(((py / newHeight) * 100).toFixed(2))
                    };
                })
            }));
            setLayers(newLayers);
        }

        return;
    }

    if (!dragItem.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const xPerc = Math.round((x / rect.width) * 100);
    const yPerc = Math.round((y / rect.height) * 100);

    setLayers(prev => prev.map(l => {
      if (l.id === dragItem.current.layerId) {
        const newPoints = [...l.points];
        newPoints[dragItem.current.pointIndex] = { x: xPerc, y: yPerc };
        return { ...l, points: newPoints };
      }
      return l;
    }));
  }, [lockShape]);

  const handleMouseUp = useCallback(() => {
    if (resizeItem.current) {
        resizeItem.current = null;
        setIsDragging(false);
    }
    if (dragItem.current) {
      dragItem.current = null;
      setIsDragging(false);
      addToHistory(layersRef.current);
    }
  }, [addToHistory]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Changed: No default fallback. Can be null.
  const activeLayer = layers.find(l => l.id === selectedLayerId);

  // --- Code Logic ---

  // Generate CSS string based on state
  // Added `includePrefixes` flag
  const generateOutput = useCallback((includePrefixes = false) => {
    // Helper to format single layer
    const formatLayer = (layer) => {
        const path = `polygon(${pointsToCss(layer.points)})`;
        const color = hexToRgba(layer.color, layer.opacity !== undefined ? layer.opacity : 1);
        
        let output = `background-color: ${color};
clip-path: ${path};`;
        if (includePrefixes) {
            output += `
-webkit-clip-path: ${path};`;
        }
        return output;
    };

    if (showAllCss) {
      return layers
        .filter(l => l.visible)
        .map(l => {
            const css = formatLayer(l);
            return `/* ${l.name} */
${css}`;
        })
        .join('\n\n');
    } else if (activeLayer) {
      return formatLayer(activeLayer);
    }
    return '';
  }, [layers, activeLayer, showAllCss]);

  // Sync manualCode with generated output if not editing
  useEffect(() => {
      if (!isEditingCode) {
          setManualCode(null);
      }
  }, [layers, selectedLayerId, isEditingCode]);

  const copyToClipboard = () => {
    // Always include vendor prefixes when copying
    const textToCopy = generateOutput(true);
    
    if (!textToCopy) return; // Nothing to copy

    const handleSuccess = () => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(handleSuccess)
        .catch(() => fallbackCopy(textToCopy, handleSuccess));
    } else {
      fallbackCopy(textToCopy, handleSuccess);
    }
  };

  const fallbackCopy = (text, callback) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) callback();
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
  };

  const handleCodeChange = (e) => {
    if (showAllCss) return; 
    
    const newVal = e.target.value;
    setManualCode(newVal); 

    const parsedPoints = cssToPoints(newVal, canvasSize.width, canvasSize.height);
    
    if (parsedPoints.length >= 3 && activeLayer) {
       setLayers(prev => prev.map(l => {
         if (l.id === selectedLayerId) {
           return { ...l, points: parsedPoints };
         }
         return l;
       }));
    }
  };

  const handleCodeBlur = () => {
      setIsEditingCode(false);
      setManualCode(null);
      addToHistory(layers);
  }

  const handleCodeFocus = () => {
      setIsEditingCode(true);
      // When focusing, prime with the CURRENT display value (no prefix)
      setManualCode(generateOutput(false)); 
  }

  // Calculate the value to display in the textarea
  const displayValue = (isEditingCode && manualCode !== null) ? manualCode : generateOutput(false);

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* --- Header --- */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <Settings size={18} />
          </div>
          <h1 className="font-bold text-lg tracking-tight">ClipPath Generator</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-md p-1 border border-gray-200">
             <button 
              onClick={handleUndo} 
              disabled={historyIndex <= 0}
              className="p-1.5 hover:bg-white rounded disabled:opacity-30 transition-colors"
              title="Undo"
            >
              <Undo size={16} />
            </button>
            <button 
              onClick={handleRedo} 
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 hover:bg-white rounded disabled:opacity-30 transition-colors"
              title="Redo"
            >
              <Redo size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200">
            <span className="text-gray-500 text-xs uppercase font-bold tracking-wider">Canvas</span>
            <input 
              type="number" 
              value={canvasSize.width}
              onChange={(e) => setCanvasSize(prev => ({ ...prev, width: Number(e.target.value) }))}
              className="w-12 bg-transparent text-center focus:outline-none border-b border-gray-300 focus:border-blue-500"
            />
            <span className="text-gray-400">x</span>
            <input 
              type="number" 
              value={canvasSize.height}
              onChange={(e) => setCanvasSize(prev => ({ ...prev, height: Number(e.target.value) }))}
              className="w-12 bg-transparent text-center focus:outline-none border-b border-gray-300 focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => setLockShape(!lockShape)}
            className={`p-1.5 rounded-md border transition-colors ${lockShape ? 'bg-blue-100 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'}`}
            title={lockShape ? "Unlock Shape Dimensions" : "Lock Shape Dimensions (Prevent distortion when resizing)"}
          >
            {lockShape ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
          
           <div className="flex items-center gap-2 text-sm bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200">
             <span className="text-gray-500 text-xs uppercase font-bold tracking-wider">BG</span>
             <input 
              type="color" 
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
             />
             <div className="w-px h-4 bg-gray-300 mx-1"></div>
             <label className="cursor-pointer hover:text-blue-600 relative group">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleImageUpload}
                />
                <span className="text-xs font-bold text-gray-500 group-hover:text-blue-600 uppercase">Img</span>
             </label>
             {bgImage && (
                <button 
                  onClick={() => setBgImage(null)}
                  className="ml-1 text-gray-400 hover:text-red-500"
                  title="Remove Image"
                >
                  <Trash2 size={12} />
                </button>
             )}
           </div>

          <button  
            onClick={copyToClipboard}
            className={`
                flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium min-w-[120px] justify-center
                ${copyFeedback 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-900 text-white hover:bg-black'}
            `}
          >
            {copyFeedback ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy CSS</>}
          </button>
        </div>
      </header>

      {/* --- Main Content --- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* --- Sidebar (Layers) --- */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2 text-gray-700">
              <Layers size={16} /> Layers
            </h2>
            <button onClick={addLayer} className="p-1 hover:bg-gray-100 rounded text-blue-600">
              <Plus size={18} />
            </button>
          </div>
          
          <div 
            className="flex-1 overflow-y-auto p-2 space-y-2"
            onClick={handleSidebarClick} // Click whitespace to deselect
          >
            {layers.map((layer, index) => (
              <div 
                key={layer.id}
                draggable
                onDragStart={(e) => {
                    dragLayerItem.current = index;
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnter={() => (dragOverLayerItem.current = index)}
                onDragEnd={handleSort}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }}
                onClick={(e) => {
                    e.stopPropagation(); // Stop propagation to allow whitespace deselect
                    setSelectedLayerId(layer.id);
                }}
                className={`
                  group flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all
                  ${selectedLayerId === layer.id 
                    ? 'bg-blue-50 border-blue-200 shadow-sm' 
                    : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'}
                `}
              >
                {/* Drag Handle */}
                <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                    <GripVertical size={14} />
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
                  className={`p-1 rounded ${layer.visible ? 'text-gray-600' : 'text-gray-300'}`}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                
                <div 
                  className="w-3 h-3 rounded-full border border-black/10 shadow-sm"
                  style={{ backgroundColor: hexToRgba(layer.color, layer.opacity !== undefined ? layer.opacity : 1) }}
                />

                <input 
                   className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
                   value={layer.name}
                   onChange={(e) => {
                     const newLayers = [...layers];
                     newLayers[index].name = e.target.value;
                     updateLayers(newLayers);
                   }}
                   onClick={(e) => e.stopPropagation()} 
                />

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                   <div className="flex flex-col">
                      <button onClick={(e) => {e.stopPropagation(); moveLayer(index, 'up')}} disabled={index === 0} className="hover:text-blue-600 disabled:opacity-20"><ChevronUp size={10} /></button>
                      <button onClick={(e) => {e.stopPropagation(); moveLayer(index, 'down')}} disabled={index === layers.length-1} className="hover:text-blue-600 disabled:opacity-20"><ChevronDown size={10} /></button>
                   </div>
                   <button 
                    onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                    className="p-1 hover:text-red-500 text-gray-400"
                    disabled={layers.length === 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-200 bg-gray-50 text-xs">
              {activeLayer ? (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-500">COLOR</span>
                    <input 
                        type="color" 
                        value={activeLayer.color} 
                        onChange={(e) => {
                            const newLayers = layers.map(l => l.id === activeLayer.id ? {...l, color: e.target.value} : l);
                            updateLayers(newLayers); 
                        }}
                        onBlur={() => addToHistory(layers)}
                        className="bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-500 min-w-[50px]">OPACITY</span>
                    <input 
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={activeLayer.opacity !== undefined ? activeLayer.opacity : 1}
                        onChange={(e) => {
                            const newLayers = layers.map(l => l.id === activeLayer.id ? {...l, opacity: parseFloat(e.target.value)} : l);
                            updateLayers(newLayers);
                        }}
                        onMouseUp={() => addToHistory(layers)}
                        className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-gray-400 w-8 text-right">
                        {Math.round((activeLayer.opacity !== undefined ? activeLayer.opacity : 1) * 100)}%
                    </span>
                  </div>
                  
                  {/* Selected Point Options */}
                  {selectedPointIndex !== null && (
                      <div className="pt-2 border-t border-gray-200 mt-1">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                              Selected Point ({selectedPointIndex + 1})
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                              <button 
                                  onClick={addPointBefore}
                                  className="px-2 py-1 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-600 text-[10px] flex items-center justify-center gap-1"
                                  title="Add point before selected"
                              >
                                  <Plus size={10} /> Before
                              </button>
                              <button 
                                  onClick={addPointAfter}
                                  className="px-2 py-1 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-600 text-[10px] flex items-center justify-center gap-1"
                                  title="Add point after selected"
                              >
                                  <Plus size={10} /> After
                              </button>
                          </div>
                          <button 
                              onClick={deletePoint}
                              disabled={activeLayer.points.length <= 3}
                              className="w-full flex items-center justify-center gap-2 py-1 bg-red-50 border border-red-100 rounded hover:bg-red-100 text-red-600 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              <Trash2 size={12} /> Delete Point
                          </button>
                      </div>
                  )}

                  <div className="pt-2 border-t border-gray-200 mt-1">
                    <button 
                        onClick={addPoint}
                        className="w-full flex items-center justify-center gap-2 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700 transition-colors shadow-sm"
                    >
                        <Plus size={14} /> Add Coordinate Point
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 italic text-center">
                  Select a layer to edit properties
                </div>
              )}
          </div>
        </aside>

        {/* --- Center Stage (Canvas) --- */}
        <main className="flex-1 flex items-center justify-center bg-dots overflow-auto relative p-8">
           <div 
            className="shadow-xl relative transition-all duration-300 ease-out bg-white bg-cover bg-center bg-no-repeat"
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            style={{ 
              width: canvasSize.width, 
              height: canvasSize.height,
              backgroundColor: bgColor,
              backgroundImage: bgImage ? `url(${bgImage})` : 'none',
              cursor: selectedLayerId ? 'default' : 'pointer'
            }}
                         title={selectedLayerId ? "Click background to deselect" : "Click to select background"}
                       >
                         {/* Resize Handles */}
                         {/* Sides */}
                         <div 
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/20 transition-colors z-20"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'r')}
                         />
                         <div 
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/20 transition-colors z-20"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'l')}
                         />
                         <div 
                            className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-blue-500/20 transition-colors z-20"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'b')}
                         />
                         <div 
                            className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize hover:bg-blue-500/20 transition-colors z-20"
                            onMouseDown={(e) => handleResizeMouseDown(e, 't')}
                         />

                         {/* Corners */}
                         <div 
                            className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize bg-gray-300 hover:bg-blue-500 z-30 rounded-tl shadow-sm"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'br')}
                         />
                         <div 
                            className="absolute left-0 bottom-0 w-4 h-4 cursor-nesw-resize bg-gray-400 hover:bg-blue-500 z-30 rounded-tr shadow-sm"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'bl')}
                         />
                         <div 
                            className="absolute left-0 top-0 w-4 h-4 cursor-nwse-resize bg-gray-300 hover:bg-blue-500 z-30 rounded-br shadow-sm"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'tl')}
                         />
                         <div 
                            className="absolute right-0 top-0 w-4 h-4 cursor-nesw-resize bg-gray-400 hover:bg-blue-500 z-30 rounded-bl shadow-sm"
                            onMouseDown={(e) => handleResizeMouseDown(e, 'tr')}
                         />
                         
                                      {layers.map(layer => {               if (!layer.visible) return null;
               const isSelected = layer.id === selectedLayerId;
               const path = `polygon(${pointsToCss(layer.points)})`;
               const rgbaColor = hexToRgba(layer.color, layer.opacity !== undefined ? layer.opacity : 1);

               return (
                 <div key={layer.id} className="absolute inset-0 pointer-events-none">
                   <div 
                    className="w-full h-full transition-opacity"
                    style={{ 
                      backgroundColor: rgbaColor,
                      clipPath: path,
                      WebkitClipPath: path,
                      // Removed opacity dimming to allow true transparency editing
                    }}
                   />

                   {isSelected && layer.points.map((p, i) => (
                     <div
                      key={i}
                      onMouseDown={(e) => handlePointMouseDown(e, layer.id, i)}
                      className={`
                        absolute w-5 h-5 rounded-full border-2 shadow-md cursor-move pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center hover:scale-110 transition-transform z-10
                        ${selectedPointIndex === i ? 'ring-2 ring-blue-500 scale-110 z-20' : 'border-white'}
                      `}
                      style={{ 
                        left: `${p.x}%`, 
                        top: `${p.y}%`,
                        backgroundColor: POINT_COLORS[i % POINT_COLORS.length]
                      }}
                     >
                       <div className="w-1.5 h-1.5 bg-white rounded-full" />
                     </div>
                   ))}

                    {isSelected && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
                        <polygon 
                          points={layer.points.map(p => `${(p.x/100)*canvasSize.width},${(p.y/100)*canvasSize.height}`).join(' ')}
                          fill="none"
                          stroke="black"
                          strokeDasharray="4 2"
                          strokeWidth="1"
                        />
                      </svg>
                    )}
                 </div>
               );
             })}
           </div>
        </main>
      </div>

      {/* --- Footer (CSS Editor) --- */}
      <div className="h-48 bg-white border-t border-gray-200 flex flex-col relative z-20">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div className="flex items-center gap-2">
              <span>CSS Output ({showAllCss ? 'All Layers' : (activeLayer ? activeLayer.name : 'No Selection')})</span>
              <label className="flex items-center gap-1.5 cursor-pointer ml-4 bg-white px-2 py-0.5 rounded border border-gray-300 hover:border-blue-400 select-none">
                  <input 
                      type="checkbox" 
                      checked={showAllCss} 
                      onChange={(e) => setShowAllCss(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 h-3 w-3"
                  />
                  <span className="text-[10px] text-gray-600">Show All Layers</span>
              </label>
          </div>
          <span className="text-gray-400">
              {showAllCss ? 'Read-only mode' : (activeLayer ? 'Edit or paste coordinates below' : 'Select a layer to edit')}
          </span>
        </div>
        
        <div className="relative flex-1 w-full overflow-hidden text-sm font-mono leading-relaxed">
           <div className="absolute inset-0 overflow-auto p-4">
              {/* 1. Syntax Highlighter (Background) */}
              {!showAllCss && !isEditingCode && activeLayer && (
                  <div 
                    aria-hidden="true" 
                    className="absolute top-4 left-4 right-4 bottom-4 pointer-events-none whitespace-pre-wrap break-all"
                    style={{ fontFamily: 'monospace' }}
                  >
                    <span className="text-gray-400 select-none">background-color: {hexToRgba(activeLayer.color, activeLayer.opacity)};</span>
                    <br />
                    <span className="text-gray-400 select-none">clip-path: </span>
                    <span className="text-purple-600 font-bold select-none">polygon</span>
                    <span className="text-gray-400 select-none">(</span>
                    {activeLayer.points.map((p, i) => (
                      <React.Fragment key={i}>
                        <span style={{ color: POINT_COLORS[i % POINT_COLORS.length], fontWeight: 'bold' }}>
                          {p.x}% {p.y}%
                        </span>
                        {i < activeLayer.points.length - 1 && <span className="text-gray-400 select-none">, </span>}
                      </React.Fragment>
                    ))}
                    <span className="text-gray-400 select-none">);</span>
                  </div>
              )}

              {/* 2. Actual Input/Display */}
              <textarea 
                className={`
                    absolute top-4 left-4 right-4 bottom-4 w-full h-full bg-transparent border-none p-0 resize-none outline-none whitespace-pre-wrap break-all caret-black
                    ${(showAllCss || isEditingCode || !activeLayer) ? 'text-gray-700' : 'text-transparent selection:bg-blue-100 selection:text-transparent'}
                    ${!activeLayer && !showAllCss ? 'text-gray-400 italic' : ''}
                `}
                style={{ fontFamily: 'monospace' }}
                value={!activeLayer && !showAllCss ? "Select a layer to view or edit CSS" : displayValue}
                readOnly={showAllCss || !activeLayer}
                onChange={handleCodeChange}
                onFocus={handleCodeFocus}
                onBlur={handleCodeBlur}
                spellCheck="false"
                placeholder={activeLayer ? "Paste clip-path code here..." : ""}
              />
           </div>
        </div>
      </div>

      <style>{`
        .bg-dots {
          background-image: radial-gradient(#d1d5db 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}
