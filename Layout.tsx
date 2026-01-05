
import React, { useState } from 'react';
import { useSettings } from '../services/SettingsContext';
import { HomeIcon, CartIcon, PlusIcon, SearchIcon, UserIcon, PawIcon, CogIcon, MenuIcon, ChartIcon, BoxIcon, ReportIcon, ShieldIcon } from ',./Icons';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { logoUrl } = useSettings();
  const [logoError, setLogoError] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Fallback logo path
  const displayLogo = logoUrl || './logo.png';

  // Reset error state when logo changes so we try to load the new one
  useEffect(() => {
    setLogoError(false);
  }, [logoUrl]);

  // Handle mobile nav click
  const handleMobileNavClick = (tab: string) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex flex-col min-h-screen pb-24 lg:pb-0 lg:pl-64">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex flex-col w-64 fixed left-0 top-0 bottom-0 bg-white dark:bg-gray-900 border-r border-pawPink dark:border-gray-800 shadow-sm z-50 transition-colors">
        <div className="p-6 flex justify-center items-center min-h-[80px]">
          {!logoError ? (
            <img 
              src={displayLogo} 
              alt="Pawshionista" 
              className="w-40 h-auto object-contain transition-transform hover:scale-105 cursor-pointer"
              onClick={() => onTabChange('dashboard')}
              onError={() => setLogoError(true)} 
            />
          ) : (
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange('dashboard')}>
              <PawIcon className="w-8 h-8 text-pawPinkDark" />
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">Pawshionista</h1>
            </div>
          )}
        </div>
        
        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          <NavItem active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} icon={<HomeIcon />} label="Dashboard" />
          <NavItem active={activeTab === 'livesell'} onClick={() => onTabChange('livesell')} icon={<PlusIcon />} label="Live Mode" />
          <NavItem active={activeTab === 'orders'} onClick={() => onTabChange('orders')} icon={<CartIcon />} label="Orders" />
          
          <NavItem active={activeTab === 'inventory'} onClick={() => onTabChange('inventory')} icon={<BoxIcon />} label="Bales" />
          <NavItem active={activeTab === 'bales'} onClick={() => onTabChange('bales')} icon={<SearchIcon />} label="Inventory" />
          
          <NavItem active={activeTab === 'customers'} onClick={() => onTabChange('customers')} icon={<UserIcon />} label="Customers" />
          <NavItem active={activeTab === 'accounting'} onClick={() => onTabChange('accounting')} icon={<ChartIcon />} label="Accounting" />
          <NavItem active={activeTab === 'reports'} onClick={() => onTabChange('reports')} icon={<ReportIcon />} label="Reports" />
          
          <div className="my-2 border-t border-pawPink/20 dark:border-gray-800"></div>
          <NavItem active={activeTab === 'devices'} onClick={() => onTabChange('devices')} icon={<ShieldIcon />} label="Devices" />
        </nav>
        
        <div className="p-4 border-t border-pawPink/20 dark:border-gray-800">
           <NavItem active={activeTab === 'settings'} onClick={() => onTabChange('settings')} icon={<CogIcon />} label="Settings" />
        </div>
      </aside>

      {/* Mobile Header (Sticky Top) */}
      <header className="lg:hidden bg-white/90 dark:bg-gray-900/90 backdrop-blur-md sticky top-0 z-40 border-b border-pawPink/30 dark:border-gray-800 px-4 py-3 flex justify-center shadow-sm transition-colors">
         {!logoError ? (
            <img 
              src={displayLogo} 
              alt="Pawshionista" 
              className="h-8 w-auto object-contain cursor-pointer"
              onClick={() => handleMobileNavClick('dashboard')}
              onError={() => setLogoError(true)} 
            />
          ) : (
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleMobileNavClick('dashboard')}>
              <PawIcon className="w-6 h-6 text-pawPinkDark" />
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">Pawshionista</h1>
            </div>
          )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 pt-6 md:px-8">
        {children}
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div 
            className="absolute bottom-24 right-4 w-56 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-3 animate-scaleUp flex flex-col gap-1 border border-pawPink/30 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
          >
             <p className="px-4 py-2 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">More Options</p>
             <MobileMenuLink active={activeTab === 'customers'} onClick={() => handleMobileNavClick('customers')} icon={<UserIcon />} label="Customers" />
             
             {/* Bales tab (now Inventory in menu) */}
             <MobileMenuLink active={activeTab === 'bales'} onClick={() => handleMobileNavClick('bales')} icon={<SearchIcon />} label="Inventory" />
             
             <MobileMenuLink active={activeTab === 'accounting'} onClick={() => handleMobileNavClick('accounting')} icon={<ChartIcon />} label="Accounting" />
             <MobileMenuLink active={activeTab === 'reports'} onClick={() => handleMobileNavClick('reports')} icon={<ReportIcon />} label="Reports" />
             <MobileMenuLink active={activeTab === 'devices'} onClick={() => handleMobileNavClick('devices')} icon={<ShieldIcon />} label="Devices" />
             
             <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
             <MobileMenuLink active={activeTab === 'settings'} onClick={() => handleMobileNavClick('settings')} icon={<CogIcon />} label="Settings" />
          </div>
        </div>
      )}

      {/* Bottom Nav for Mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-pawPink dark:border-gray-800 shadow-[0_-4px_10px_rgba(255,183,197,0.1)] flex justify-around items-center py-3 px-4 z-50 rounded-t-3xl transition-colors">
        <MobileNavItem active={activeTab === 'dashboard'} onClick={() => handleMobileNavClick('dashboard')} icon={<HomeIcon />} />
        <MobileNavItem active={activeTab === 'orders'} onClick={() => handleMobileNavClick('orders')} icon={<CartIcon />} />
        
        {/* Central Plus Button */}
        <div className="relative -top-6">
           <button 
             onClick={() => handleMobileNavClick('livesell')}
             className="w-14 h-14 bg-pawPinkDark rounded-full shadow-lg shadow-pawPinkDark/40 flex items-center justify-center text-white active:scale-95 transition-transform border-4 border-white dark:border-gray-900"
           >
             <PlusIcon className="w-8 h-8" />
           </button>
        </div>

        {/* Inventory tab (now Bales in bottom nav) */}
        <MobileNavItem active={activeTab === 'inventory'} onClick={() => handleMobileNavClick('inventory')} icon={<BoxIcon />} />
        
        {/* More/Menu Button */}
        <MobileNavItem 
          active={['customers', 'bales', 'accounting', 'settings', 'reports', 'devices'].includes(activeTab) || isMobileMenuOpen} 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          icon={<MenuIcon />} 
        />
      </nav>
    </div>
  );
};

const NavItem = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active ? 'bg-pawPinkDark text-white font-bold shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-pawCream dark:hover:bg-gray-800'
    }`}
  >
    {React.cloneElement(icon, { className: `w-5 h-5 ${active ? 'text-white' : 'text-gray-400 dark:text-gray-500'}` })}
    <span>{label}</span>
  </button>
);

const MobileNavItem = ({ active, onClick, icon }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all active:scale-95 ${
      active ? 'bg-pawPink/30 dark:bg-gray-800 text-pawPinkDark' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`}
  >
    {React.cloneElement(icon, { className: "w-6 h-6" })}
  </button>
);

const MobileMenuLink = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
      active ? 'bg-pawPinkDark text-white font-bold shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
    }`}
  >
    {React.cloneElement(icon, { className: `w-5 h-5 ${active ? 'text-white' : 'text-gray-400 dark:text-gray-500'}` })}
    <span className="text-sm font-bold">{label}</span>
  </button>
);

import { useEffect } from 'react';
export default Layout;
