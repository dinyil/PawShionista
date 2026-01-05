
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { deviceService } from '../services/deviceService';
import { Device } from '../types';
import { DevicePhoneIcon, DeviceDesktopIcon, SearchIcon, ShieldIcon } from '../components/Icons';

const DeviceManagement: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Delete State
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);

  const currentDeviceId = deviceService.getDeviceId();

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 10000); // Poll every 10s for new devices
    return () => clearInterval(interval);
  }, []);

  const loadDevices = async () => {
    const data = await deviceService.getAllDevices();
    if (data) setDevices(data);
    setLoading(false);
  };

  const handleStatusChange = async (device: Device, newStatus: 'approved' | 'blocked') => {
    // Double check safety (though UI hides button now)
    if (device.device_id === currentDeviceId && newStatus === 'blocked') {
        alert("You cannot block the device you are currently using.");
        return;
    }

    // Optimistic Update
    setDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: newStatus } : d));
    
    try {
        await deviceService.updateDeviceStatus(device.id, newStatus);
        loadDevices();
    } catch (error) {
        alert("Failed to update status.");
        loadDevices();
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await deviceService.renameDevice(id, editName);
    setEditingId(null);
    loadDevices();
  };

  const startEdit = (device: Device) => {
    setEditingId(device.id);
    setEditName(device.name);
  };

  const handleDeleteClick = (device: Device) => {
      if (device.device_id === currentDeviceId) {
          alert("You cannot delete the device you are currently using.");
          return;
      }
      setDeviceToDelete(device);
  };

  const confirmDelete = async () => {
      if (deviceToDelete) {
          // Optimistic update
          setDevices(prev => prev.filter(d => d.id !== deviceToDelete.id));
          setDeviceToDelete(null);
          
          try {
            await deviceService.deleteDevice(deviceToDelete.id);
          } catch (e) {
            loadDevices(); // Revert on error
          }
      }
  };

  const filtered = devices.filter(d => 
    d.name?.toLowerCase().includes(search.toLowerCase()) || 
    d.ip_address?.includes(search) || 
    d.location?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-32 px-1 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div>
           <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight flex items-center gap-3">
             <ShieldIcon className="w-8 h-8 text-pawPinkDark" />
             Device Security
           </h1>
           <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">Approve, block, or delete devices accessing your system.</p>
        </div>
        
        <div className="relative w-full md:w-64">
           <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
           <input 
             type="text" 
             placeholder="Search devices..." 
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             className="w-full bg-white dark:bg-gray-800 pl-10 pr-4 py-3 rounded-2xl font-bold text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-pawPink shadow-sm border-2 border-transparent focus:border-pawPink transition-all"
           />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-2">
        {loading ? (
           <p className="text-center text-gray-400 font-bold py-10">Loading devices...</p>
        ) : filtered.length === 0 ? (
           <div className="text-center py-20 opacity-50">
              <p className="text-4xl mb-2">📱</p>
              <p className="font-bold text-gray-400 text-sm uppercase tracking-widest">No devices found</p>
           </div>
        ) : filtered.map(device => {
            const isCurrent = device.device_id === currentDeviceId;
            
            return (
              <div key={device.id} className={`bg-white dark:bg-gray-800 rounded-[2rem] p-6 border-2 shadow-sm transition-all ${device.status === 'blocked' ? 'opacity-70 border-gray-200 dark:border-gray-700' : device.status === 'pending' ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10' : 'border-pawPink/30 dark:border-gray-700'}`}>
                 <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${device.type === 'Mobile' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-500'}`}>
                          {device.type === 'Mobile' ? <DevicePhoneIcon /> : <DeviceDesktopIcon />}
                       </div>
                       
                       <div className="flex-1 min-w-0">
                          {editingId === device.id ? (
                             <div className="flex flex-col sm:flex-row gap-2 mb-1">
                                <input 
                                  value={editName} 
                                  onChange={(e) => setEditName(e.target.value)} 
                                  className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-xl font-black text-gray-800 dark:text-white outline-none border-2 border-pawPink w-full sm:w-64 text-sm"
                                  autoFocus
                                  placeholder="Enter device name..."
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleRename(device.id)} className="text-[10px] bg-pawPinkDark text-white px-4 py-2 rounded-xl font-bold uppercase shadow-md hover:bg-red-400 transition-colors">Save</button>
                                  <button onClick={() => setEditingId(null)} className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-500 px-4 py-2 rounded-xl font-bold uppercase hover:bg-gray-300 transition-colors">Cancel</button>
                                </div>
                             </div>
                          ) : (
                             <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="text-lg font-black text-gray-800 dark:text-white leading-none truncate max-w-[200px]">{device.name}</h3>
                                
                                {isCurrent && <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[9px] font-black px-2 py-0.5 rounded uppercase">This Device</span>}
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${device.status === 'approved' ? 'bg-green-100 text-green-600' : device.status === 'blocked' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                   {device.status}
                                </span>
                             </div>
                          )}
                          
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-gray-400 dark:text-gray-500 mt-1">
                             <span className="flex items-center gap-1">🌐 {device.ip_address}</span>
                             <span className="flex items-center gap-1">📍 {device.location}</span>
                             <span className="flex items-center gap-1">💻 {device.os} • {device.browser}</span>
                          </div>
                          <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2 uppercase font-bold tracking-wider">
                              Last Active: {new Date(device.last_active).toLocaleString()}
                          </p>
                       </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto mt-2 lg:mt-0 justify-end">
                       {/* PENDING ACTIONS */}
                       {device.status === 'pending' && (
                          <div className="flex gap-2 w-full lg:w-auto">
                             <button onClick={() => handleDeleteClick(device)} className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-red-100 hover:text-red-500 rounded-2xl transition-all">🗑️</button>
                             <button onClick={() => handleStatusChange(device, 'blocked')} className="flex-1 lg:flex-none px-6 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-100 transition-colors">Block</button>
                             <button onClick={() => handleStatusChange(device, 'approved')} className="flex-1 lg:flex-none px-6 py-3 bg-green-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-green-600 transition-colors animate-pulse">Approve</button>
                          </div>
                       )}

                       {/* APPROVED ACTIONS */}
                       {device.status === 'approved' && (
                          <div className="flex gap-2 w-full lg:w-auto">
                             <button onClick={() => startEdit(device)} className="w-10 h-10 flex items-center justify-center bg-pawSoftBlue dark:bg-blue-900/30 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all shadow-sm" title="Edit Name">✏️</button>
                             
                             {!isCurrent && (
                                <button onClick={() => handleStatusChange(device, 'blocked')} className="flex-1 lg:flex-none px-5 py-3 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-300 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors">
                                    Block
                                </button>
                             )}

                             {!isCurrent && (
                                <button onClick={() => handleDeleteClick(device)} className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-red-100 hover:text-red-500 rounded-2xl transition-all" title="Delete Device">🗑️</button>
                             )}
                          </div>
                       )}

                       {/* BLOCKED ACTIONS */}
                       {device.status === 'blocked' && (
                          <div className="flex gap-2 w-full lg:w-auto">
                             {!isCurrent && (
                                <button onClick={() => handleDeleteClick(device)} className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-red-100 hover:text-red-500 rounded-2xl transition-all">🗑️</button>
                             )}
                             <button onClick={() => handleStatusChange(device, 'approved')} className="flex-1 lg:flex-none px-6 py-3 bg-white border-2 border-green-100 text-green-600 dark:bg-gray-700 dark:border-green-900 dark:text-green-400 hover:bg-green-50 hover:border-green-200 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors shadow-sm">
                                Unblock
                             </button>
                          </div>
                       )}
                    </div>
                 </div>
              </div>
            );
        })}
      </div>

      {deviceToDelete && (
          <DeleteConfirmationModal 
             deviceName={deviceToDelete.name} 
             onClose={() => setDeviceToDelete(null)} 
             onConfirm={confirmDelete} 
          />
      )}
    </div>
  );
};

const DeleteConfirmationModal: React.FC<{ deviceName: string; onClose: () => void; onConfirm: () => void }> = ({ deviceName, onClose, onConfirm }) => {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
        <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 text-center animate-scaleUp shadow-2xl border-4 border-red-500">
           <div className="bg-red-100 dark:bg-red-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-5xl">🗑️</span></div>
           <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
              Remove Device?
           </h3>
           <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8 leading-relaxed">
              Are you sure you want to permanently delete <span className="text-red-600 dark:text-red-400">"{deviceName}"</span>? They will need to request access again.
           </p>
           <div className="flex gap-3">
               <button onClick={onClose} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-black uppercase text-xs tracking-widest rounded-2xl active:scale-95 transition-all">Cancel</button>
               <button onClick={onConfirm} className="flex-1 py-4 bg-red-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-red-200 active:scale-95 transition-all">
                  Delete
               </button>
           </div>
        </div>
      </div>, document.body
    );
};

export default DeviceManagement;
