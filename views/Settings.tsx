
import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useSettings } from '../services/SettingsContext';
import { PawIcon, PlusIcon, GripIcon } from '../components/Icons';

const Settings: React.FC = () => {
  const { logoUrl, updateLogo, isDarkMode, toggleDarkMode, presetPrices, updatePresetPrices, expenseCategories, updateExpenseCategories } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('');
  
  // Local state for smooth UI updates before saving to DB
  const [localPrices, setLocalPrices] = useState<number[]>(presetPrices);
  const [localCategories, setLocalCategories] = useState<string[]>(expenseCategories);
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs to track positions without triggering re-renders for the drag logic itself
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Animation Refs (FLIP Technique)
  const itemsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevRects = useRef<Map<number, DOMRect>>(new Map());

  // Sync local state when DB changes (initial load)
  useEffect(() => {
    setLocalPrices(presetPrices);
  }, [presetPrices]);

  useEffect(() => {
    setLocalCategories(expenseCategories);
  }, [expenseCategories]);

  // --- FLIP Animation Logic ---
  const snapshotPositions = () => {
    prevRects.current.clear();
    itemsRef.current.forEach((node, key) => {
      if (node) {
        prevRects.current.set(key, node.getBoundingClientRect());
      }
    });
  };

  useLayoutEffect(() => {
    // Play Animation
    itemsRef.current.forEach((node, key) => {
      const prev = prevRects.current.get(key);
      if (prev && node) {
        const current = node.getBoundingClientRect();
        const dx = prev.left - current.left;
        const dy = prev.top - current.top;
        
        if (dx !== 0 || dy !== 0) {
          // 1. Invert: Apply transform to put it back where it was
          node.style.transition = 'none';
          node.style.transform = `translate(${dx}px, ${dy}px)`;
          
          // 2. Play: Force reflow and remove transform to animate to new spot
          requestAnimationFrame(() => {
            // "Liquid" cubic-bezier for slick movement
            node.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'; 
            node.style.transform = '';
          });
        }
      }
    });
  }, [localPrices]); // Run every time list order changes

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        updateLogo(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReset = () => {
    if (confirm('Revert to default logo?')) {
      updateLogo(null);
    }
  };

  const handleAddPrice = () => {
    const val = parseInt(newPrice);
    if (!isNaN(val) && val > 0) {
      if (!localPrices.includes(val)) {
        snapshotPositions(); // Capture before adding
        const updated = [...localPrices, val];
        setLocalPrices(updated);
        updatePresetPrices(updated);
      }
      setNewPrice('');
    }
  };

  const handleRemovePrice = (priceToRemove: number) => {
    snapshotPositions(); // Capture before removing
    const updated = localPrices.filter(p => p !== priceToRemove);
    setLocalPrices(updated);
    updatePresetPrices(updated);
  };

  const [editingCategory, setEditingCategory] = useState<{old: string, new: string} | null>(null);

  const handleAddCategory = () => {
    const val = newCategory.trim();
    if (val !== '') {
      if (!localCategories.includes(val)) {
        const updated = [...localCategories, val].sort();
        setLocalCategories(updated);
        updateExpenseCategories(updated);
      }
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (categoryToRemove: string) => {
    const updated = localCategories.filter(c => c !== categoryToRemove);
    setLocalCategories(updated);
    updateExpenseCategories(updated);
  };

  const handleEditCategoryStart = (category: string) => {
    setEditingCategory({ old: category, new: category });
  };

  const handleEditCategorySave = () => {
    if (editingCategory) {
      const val = editingCategory.new.trim();
      if (val !== '' && val !== editingCategory.old) {
        // Only update if it's a new name and not empty
        const updated = localCategories.map(c => c === editingCategory.old ? val : c).sort();
        setLocalCategories(updated);
        updateExpenseCategories(updated);
      }
      setEditingCategory(null);
    }
  };

  const handleEditCategoryCancel = () => {
    setEditingCategory(null);
  };

  // --- Real-Time Sort Logic ---

  const handleDragStart = (e: React.DragEvent, position: number) => {
    dragItem.current = position;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    
    // Style the drag ghost if possible, or just the element
    // We keep the element visible but maybe dim it
    const target = e.target as HTMLDivElement;
    target.style.opacity = '0.4';
  };

  const handleDragEnter = (e: React.DragEvent, position: number) => {
    dragOverItem.current = position;

    // The "Gigilid" Magic with Animation
    if (dragItem.current !== null && dragItem.current !== position) {
        // 1. Capture positions BEFORE swap
        snapshotPositions();

        const _prices = [...localPrices];
        const draggedItemContent = _prices[dragItem.current];
        
        // Remove from old spot
        _prices.splice(dragItem.current, 1);
        // Insert at new spot
        _prices.splice(position, 0, draggedItemContent);
        
        // Update Ref to track new position
        dragItem.current = position;
        
        // 2. Update State (Triggers layout effect for animation)
        setLocalPrices(_prices);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    const target = e.target as HTMLDivElement;
    target.style.opacity = '1';
    
    // Commit changes to Database
    updatePresetPrices(localPrices);
    
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleResetPrices = () => {
    if(confirm("Reset to default price list?")) {
        const defaults = [10, 50, 80, 130, 150, 160, 170, 180, 190, 200];
        setLocalPrices(defaults);
        updatePresetPrices(defaults);
    }
  };

  const handleResetCategories = () => {
    if(confirm("Reset to default category list?")) {
        const defaults = [
          'Inventory Restock', 
          'Shipping Fee', 
          'Packaging', 
          'Rent', 
          'Utilities', 
          'Salary', 
          'Personal Withdrawal', 
          'Loan',
          'Capital',
          'Miscellaneous'
        ].sort();
        setLocalCategories(defaults);
        updateExpenseCategories(defaults);
    }
  };

  return (
    <div className="space-y-6 pb-32 px-1 animate-fadeIn">
      <div className="flex flex-col gap-2 px-2">
        <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight">System Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">Customize your shop branding & preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mx-2">
        {/* Logo Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 border-2 border-pawPink/30 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-pawPink p-3 rounded-2xl">
              <PawIcon className="w-8 h-8 text-pawPinkDark" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-800 dark:text-white tracking-tight">System Logo</h3>
              <p className="text-xs font-bold text-gray-400">Replaces all paw icons in the app.</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900 rounded-[2rem] border-2 border-dashed border-gray-300 dark:border-gray-700 gap-6">
            <div className="w-40 h-40 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center overflow-hidden border-4 border-white dark:border-gray-700 relative group">
              {logoUrl ? (
                <img src={logoUrl} alt="Custom Logo" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center">
                  <PawIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <span className="text-[10px] uppercase font-black text-gray-300 dark:text-gray-600">Default</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-lg shadow-pawPinkDark/30 active:scale-95 transition-all hover:bg-red-400"
              >
                Upload Logo
              </button>
              {logoUrl && (
                <button 
                  onClick={handleReset}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 font-black uppercase text-xs tracking-widest rounded-2xl active:scale-95 transition-all hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
            {/* Live Selling Config */}
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 border-2 border-pawPink/30 dark:border-gray-700 shadow-sm flex-1">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-2xl">
                        <span className="text-2xl">🏷️</span>
                        </div>
                        <div>
                        <h3 className="text-xl font-black text-gray-800 dark:text-white tracking-tight">Pricing Buttons</h3>
                        <p className="text-xs font-bold text-gray-400">Hold & Drag. Smooth liquid reordering.</p>
                        </div>
                    </div>
                    <button onClick={handleResetPrices} className="text-[10px] font-black uppercase text-gray-400 hover:text-pawPinkDark transition-colors">Reset Defaults</button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-[2rem] p-6 border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="number" 
                            placeholder="New Price..." 
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddPrice()}
                            className="w-full bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl font-black text-gray-800 dark:text-white outline-none border-2 border-transparent focus:border-pawPinkDark transition-all"
                        />
                        <button onClick={handleAddPrice} className="bg-pawPinkDark text-white px-4 rounded-2xl shadow-md active:scale-95 hover:bg-red-400 transition-colors">
                            <PlusIcon className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 min-h-[50px] items-start content-start relative">
                        <div className="px-4 py-2 bg-orange-100 text-orange-600 rounded-xl font-black text-xs uppercase border-2 border-orange-200 cursor-not-allowed opacity-70 flex items-center h-[42px] select-none">
                            Freebie (Fixed)
                        </div>
                        {localPrices.map((price, index) => (
                            <div 
                                key={price}
                                ref={(el) => {
                                  if (el) itemsRef.current.set(price, el);
                                  else itemsRef.current.delete(price);
                                }}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()} // Necessary to allow dropping
                                className={`group relative pl-2 pr-1 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-white rounded-xl font-black text-xs shadow-sm border border-gray-200 dark:border-gray-600 flex items-center gap-1 h-[42px] hover:border-pawPinkDark hover:shadow-md cursor-grab active:cursor-grabbing select-none transition-shadow ${
                                  isDragging && dragItem.current === index ? 'z-50 scale-105 shadow-xl ring-2 ring-pawPinkDark/50' : 'z-0'
                                }`}
                            >
                                {/* Grip Handle for Dragging */}
                                <div className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-100 p-1 cursor-grab">
                                    <GripIcon className="w-3 h-3" />
                                </div>
                                
                                <span className="mx-1">₱{price}</span>

                                <button 
                                    onClick={() => handleRemovePrice(price)}
                                    className="w-5 h-5 bg-gray-100 dark:bg-gray-600 rounded-full flex items-center justify-center text-[8px] text-gray-400 hover:bg-red-500 hover:text-white transition-colors ml-1"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Expense Categories Config */}
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 border-2 border-pawPink/30 dark:border-gray-700 shadow-sm flex-1">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-2xl">
                        <span className="text-2xl">🧾</span>
                        </div>
                        <div>
                        <h3 className="text-xl font-black text-gray-800 dark:text-white tracking-tight">Expense Categories</h3>
                        <p className="text-xs font-bold text-gray-400">Manage categories for accounting.</p>
                        </div>
                    </div>
                    <button onClick={handleResetCategories} className="text-[10px] font-black uppercase text-gray-400 hover:text-pawPinkDark transition-colors">Reset Defaults</button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-[2rem] p-6 border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            placeholder="New Category..." 
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                            className="w-full bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl font-black text-gray-800 dark:text-white outline-none border-2 border-transparent focus:border-pawPinkDark transition-all"
                        />
                        <button onClick={handleAddCategory} className="bg-pawPinkDark text-white px-4 rounded-2xl shadow-md active:scale-95 hover:bg-red-400 transition-colors">
                            <PlusIcon className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 min-h-[50px] items-start content-start relative">
                        {localCategories.map((category) => (
                            <div 
                                key={category}
                                className="group relative pl-3 pr-1 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-white rounded-xl font-black text-xs shadow-sm border border-gray-200 dark:border-gray-600 flex items-center gap-1 h-[42px] hover:border-pawPinkDark hover:shadow-md select-none transition-shadow"
                            >
                                {editingCategory?.old === category ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={editingCategory.new}
                                            onChange={(e) => setEditingCategory({ ...editingCategory, new: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleEditCategorySave();
                                                if (e.key === 'Escape') handleEditCategoryCancel();
                                            }}
                                            autoFocus
                                            className="bg-transparent outline-none w-24 text-xs font-black border-b border-pawPinkDark"
                                        />
                                        <button onClick={handleEditCategorySave} className="text-green-500 hover:text-green-600 ml-1">✓</button>
                                        <button onClick={handleEditCategoryCancel} className="text-gray-400 hover:text-gray-600">✕</button>
                                    </div>
                                ) : (
                                    <>
                                        <span 
                                            className="mx-1 cursor-pointer hover:text-pawPinkDark"
                                            onClick={() => handleEditCategoryStart(category)}
                                            title="Click to edit"
                                        >
                                            {category}
                                        </span>

                                        <button 
                                            onClick={() => handleRemoveCategory(category)}
                                            className="w-5 h-5 bg-gray-100 dark:bg-gray-600 rounded-full flex items-center justify-center text-[8px] text-gray-400 hover:bg-red-500 hover:text-white transition-colors ml-1"
                                        >
                                            ✕
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Display Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 border-2 border-pawPink/30 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                    <div className="bg-gray-200 dark:bg-gray-700 p-3 rounded-2xl">
                    <span className="text-2xl">🌙</span>
                    </div>
                    <div>
                    <h3 className="text-xl font-black text-gray-800 dark:text-white tracking-tight">Appearance</h3>
                    <p className="text-xs font-bold text-gray-400">Toggle light or dark interface.</p>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-[2rem] p-6 flex items-center justify-between border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <span className="font-black text-gray-800 dark:text-gray-200">Dark Mode</span>
                    <button 
                    onClick={toggleDarkMode}
                    className={`w-16 h-9 rounded-full p-1 transition-all duration-300 ${isDarkMode ? 'bg-pawPinkDark' : 'bg-gray-300'}`}
                    >
                        <div className={`w-7 h-7 bg-white rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center text-xs ${isDarkMode ? 'translate-x-7' : 'translate-x-0'}`}>
                        {isDarkMode ? '🌙' : '☀️'}
                        </div>
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
