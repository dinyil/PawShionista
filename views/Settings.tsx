
import React, { useRef } from 'react';
import { useSettings } from '../services/SettingsContext';
import { PawIcon } from '../components/Icons';

const Settings: React.FC = () => {
  const { logoUrl, updateLogo, isDarkMode, toggleDarkMode } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6 pb-32 px-1 animate-fadeIn">
      <div className="flex flex-col gap-2 px-2">
        <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight">System Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">Customize your shop branding & preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-2">
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
  );
};

export default Settings;
