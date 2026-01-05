
import React, { useState, useEffect } from 'react';
import { useSettings } from './services/SettingsContext';
import { db } from './services/dbService';
import { deviceService } from './services/deviceService';
import { supabase } from './services/supabaseClient';
import { Device } from './types';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import LiveSell from './views/LiveSell';
import Orders from './views/Orders';
import Inventory from './views/Inventory';
import Customers from './views/Customers';
import Accounting from './views/Accounting';
import Bales from './views/Bales';
import Settings from './views/Settings';
import Reports from './views/Reports';
import DeviceManagement from './views/DeviceManagement';
import { PawIcon, ShieldIcon } from './components/Icons';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [checkStatus, setCheckStatus] = useState<'checking' | 'approved' | 'pending' | 'blocked' | 'error'>('checking');
  const [justApproved, setJustApproved] = useState(false);

  // Use hook to get logo and refresh capabilities
  const { logoUrl, refreshSettings } = useSettings();
  const displayLogo = logoUrl || './logo.png';

  // 1. Initial Check
  useEffect(() => {
    const initApp = async () => {
      const device = await deviceService.registerOrCheckDevice();
      setCurrentDevice(device);
      
      if (device) {
          if (device.status === 'approved') {
              setCheckStatus('approved');
              // Sync and then refresh settings context
              await db.syncWithSupabase();
              refreshSettings();
          } else if (device.status === 'blocked') {
              setCheckStatus('blocked');
          } else {
              setCheckStatus('pending');
          }
      } else {
          setCheckStatus('error');
      }
      setIsLoading(false);
    };
    initApp();
  }, [refreshSettings]);

  // 2. Real-time Subscription for Instant Approval
  useEffect(() => {
    if (checkStatus !== 'pending' || !currentDevice?.id) return;

    console.log('🔌 Listening for instant approval on ID:', currentDevice.id);
    
    // Listen to ALL updates on 'devices' table to avoid filter syntax issues
    // Then filter client-side for our specific ID
    const channel = supabase
      .channel(`device_approval_watch`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
        },
        async (payload) => {
           // Client-side filter
           if (payload.new.id !== currentDevice.id) return;

           console.log('⚡ Realtime Status Update:', payload.new.status);
           const newStatus = payload.new.status;
           
           if (newStatus === 'approved') {
               await db.syncWithSupabase();
               refreshSettings();
               setJustApproved(true);
               setCheckStatus('approved');
           } else if (newStatus === 'blocked') {
               setCheckStatus('blocked');
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkStatus, currentDevice, refreshSettings]);

  // 3. Polling Fallback (Auto-Refresh when PENDING)
  // Reduced interval to 1.5s for faster fallback response
  useEffect(() => {
    let timeoutId: any;
    let isMounted = true;

    const checkApprovalLoop = async () => {
      // Perform check
      const device = await deviceService.registerOrCheckDevice();
      
      // If effect cleaned up, stop processing
      if (!isMounted) return;

      if (device) {
        // Update current device details to keep UI fresh
        setCurrentDevice(device);

        if (device.status === 'approved') {
          // Sync & Update UI
          await db.syncWithSupabase();
          if (!isMounted) return;

          refreshSettings();
          setJustApproved(true); 
          setCheckStatus('approved');
          // Loop ends naturally here
        } else if (device.status === 'blocked') {
          setCheckStatus('blocked');
          // Loop ends
        } else {
          // Still pending, schedule next check
          timeoutId = setTimeout(checkApprovalLoop, 1500);
        }
      } else {
        // Error, retry slightly slower
        timeoutId = setTimeout(checkApprovalLoop, 3000);
      }
    };
    
    if (checkStatus === 'pending') {
      timeoutId = setTimeout(checkApprovalLoop, 1500);
    }

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [checkStatus, refreshSettings]);

  // 4. Security Heartbeat (Ensure active users get blocked in real-time)
  useEffect(() => {
    let interval: any;
    
    if (checkStatus === 'approved') {
      interval = setInterval(async () => {
        // We use registerOrCheck to keep alive + check status
        const device = await deviceService.registerOrCheckDevice();
        if (device && device.status === 'blocked') {
           setCheckStatus('blocked');
           setJustApproved(false); // Close success modal if open
        }
      }, 5000); // Check every 5 seconds
    }

    return () => clearInterval(interval);
  }, [checkStatus]);

  // Manual Refresh Handler for Pending Screen
  const handleManualCheck = async () => {
      setIsLoading(true);
      const device = await deviceService.registerOrCheckDevice();
      if (device) {
          setCurrentDevice(device);
          if (device.status === 'approved') {
              await db.syncWithSupabase();
              refreshSettings();
              setJustApproved(true);
              setCheckStatus('approved');
          } else if (device.status === 'blocked') {
              setCheckStatus('blocked');
          }
      }
      setIsLoading(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'livesell': return <LiveSell />;
      case 'orders': return <Orders />;
      case 'inventory': return <Inventory />;
      case 'customers': return <Customers />;
      case 'accounting': return <Accounting />;
      case 'bales': return <Bales />;
      case 'reports': return <Reports />;
      case 'devices': return <DeviceManagement />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  // --- 1. ERROR STATE ---
  if (checkStatus === 'error') {
     return (
       <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
         <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-2xl animate-scaleUp max-w-sm border-4 border-red-200">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldIcon className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">System Error</h1>
            <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mt-2">Could not verify device security.</p>
            <button onClick={() => window.location.reload()} className="w-full mt-6 py-4 bg-pawPinkDark hover:bg-red-400 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-lg">
                Retry Connection
            </button>
         </div>
      </div>
     );
  }

  // --- 2. BLOCKED STATE ---
  if (checkStatus === 'blocked') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
         <div className="bg-white p-8 rounded-[3rem] shadow-2xl animate-scaleUp max-w-sm border-4 border-red-500">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">🚫</div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Access Denied</h1>
            <p className="text-gray-500 font-bold text-sm mt-2">This device has been blocked by the administrator.</p>
            <div className="mt-6 p-4 bg-gray-50 rounded-2xl text-xs font-mono break-all text-gray-400">
                ID: {currentDevice?.device_id}
            </div>
         </div>
      </div>
    );
  }

  // --- 3. PENDING STATE ---
  if (checkStatus === 'pending') {
    return (
      <div className="min-h-screen bg-pawPink dark:bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
         <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-2xl animate-scaleUp max-w-sm w-full border-4 border-orange-300 relative overflow-hidden">
            {/* Loading Pulse */}
            <div className="absolute top-0 left-0 w-full h-1 bg-orange-100">
               <div className="h-full bg-orange-400 animate-[loading_2s_ease-in-out_infinite]"></div>
            </div>

            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldIcon className="w-10 h-10 text-orange-500 animate-pulse" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Device Pending</h1>
            <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mt-2">Waiting for admin approval...</p>
            
            <button 
                onClick={handleManualCheck}
                className="mt-4 px-6 py-2 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-full font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mx-auto active:scale-95"
            >
                {isLoading ? 'Checking...' : 'Check Status ⚡'}
            </button>

            <div className="mt-8 space-y-2 text-left bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl">
                <div className="flex justify-between text-xs font-bold border-b border-gray-200 dark:border-gray-600 pb-2">
                    <span className="text-gray-400 uppercase">Device</span>
                    <span className="text-gray-800 dark:text-gray-200 truncate ml-2">{currentDevice?.name}</span>
                </div>
                <div className="flex justify-between text-xs font-bold border-b border-gray-200 dark:border-gray-600 pb-2 pt-2">
                    <span className="text-gray-400 uppercase">ID</span>
                    <span className="text-gray-800 dark:text-gray-200 font-mono text-[10px] truncate ml-2" title={currentDevice?.device_id}>{currentDevice?.device_id}</span>
                </div>
                <div className="flex justify-between text-xs font-bold pt-2">
                    <span className="text-gray-400 uppercase">Location</span>
                    <span className="text-gray-800 dark:text-gray-200">{currentDevice?.location}</span>
                </div>
            </div>
         </div>
      </div>
    );
  }

  // --- 4. LOADING STATE ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-pawPink dark:bg-gray-900 flex flex-col items-center justify-center p-4 space-y-4">
         <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-2xl animate-scaleUp flex flex-col items-center">
            <PawIcon className="w-20 h-20 text-pawPinkDark mb-4 animate-bounce" />
            <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">Pawshionista</h1>
            <p className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest text-xs mt-2">Verifying Device...</p>
         </div>
      </div>
    );
  }

  // --- 5. APPROVED SUCCESS OVERLAY (CUTE VERSION) ---
  if (justApproved) {
     return (
       <div className="fixed inset-0 z-[999] bg-pawPink/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 p-10 rounded-[3.5rem] shadow-2xl animate-scaleUp max-w-sm w-full border-4 border-white dark:border-gray-700 relative overflow-hidden">
             
             {/* Cute Background Blobs */}
             <div className="absolute -top-10 -right-10 w-32 h-32 bg-pawPink rounded-full opacity-50 blur-2xl animate-pulse"></div>
             <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-200 rounded-full opacity-50 blur-2xl animate-pulse"></div>

             <div className="relative z-10 flex flex-col items-center">
                <div className="w-28 h-28 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-md p-4">
                    <img 
                      src={displayLogo} 
                      alt="Logo" 
                      className="w-full h-full object-contain" 
                      onError={(e) => {
                         e.currentTarget.style.display='none'; 
                         if (e.currentTarget.parentElement) e.currentTarget.parentElement.innerHTML='<span class="text-5xl">🐾</span>';
                      }} 
                    />
                </div>
                
                <h1 className="text-3xl font-black text-gray-800 dark:text-white uppercase tracking-tight mb-2">You're In!</h1>
                <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8">Device successfully connected.</p>
                
                <button 
                  onClick={() => setJustApproved(false)}
                  className="w-full bg-pawPinkDark text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transform transition-transform hover:scale-105 active:scale-95 hover:bg-red-400"
                >
                    Let's Sell! ✨
                </button>
             </div>
          </div>
       </div>
     );
  }

  // --- 6. MAIN APP ---
  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
