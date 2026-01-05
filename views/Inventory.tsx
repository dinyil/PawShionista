
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { Bale, PaymentStatus, ShippingStatus } from '../types';
import { PlusIcon, SearchIcon } from '../components/Icons';

const Inventory: React.FC = () => {
  const [bales, setBales] = useState(db.getBales());
  const [filterStatus, setFilterStatus] = useState<'Active' | 'Completed'>('Active');
  const [searchQuery, setSearchQuery] = useState('');
  
  const products = db.getProducts();
  const orders = db.getOrders();
  const [showModal, setShowModal] = useState(false);
  const [editingBale, setEditingBale] = useState<Bale | null>(null);

  const getBaleStats = (baleId: string, cost: number) => {
    const baleProductIds = products.filter(p => p.baleBatch === baleId).map(p => p.id);
    const baleOrders = orders.filter(o => baleProductIds.includes(o.productId));
    const soldCount = baleOrders.reduce((sum, o) => sum + o.quantity, 0);
    const revenue = baleOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    return { soldCount, revenue, isProfitable: revenue >= cost };
  };

  const handleSaveBale = (bale: Bale) => {
    db.updateBale(bale);
    setBales(db.getBales());
    setShowModal(false);
    setEditingBale(null);
  };

  const isBaleFullyPaid = (baleId: string) => {
    const baleProductIds = products.filter(p => p.baleBatch === baleId).map(p => p.id);
    const baleOrders = orders.filter(o => baleProductIds.includes(o.productId) && o.shippingStatus !== ShippingStatus.CANCELLED);
    
    // If no sales yet, it's technically "paid" (no debt), but status won't be Sold Out usually.
    if (baleOrders.length === 0) return true;
    
    return baleOrders.every(o => o.paymentStatus === PaymentStatus.PAID);
  };

  const filteredBales = bales.filter(b => {
    const fullyPaid = isBaleFullyPaid(b.id);
    let matchesStatus = false;

    if (filterStatus === 'Active') {
        // Show if NOT Sold Out OR (Sold Out but still has Unpaid orders)
        matchesStatus = b.status !== 'Sold Out' || !fullyPaid;
    } else {
        // Show only if Sold Out AND Fully Paid
        matchesStatus = b.status === 'Sold Out' && fullyPaid;
    }

    const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-32 px-1 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 px-2">
        <div>
          <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight">Bales & Stock</h1>
          <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">Monitor available items and dispersed stock.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3">
           {/* Search Bar */}
           <div className="relative w-full md:w-64">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search batch..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 pl-10 pr-4 py-3 rounded-2xl font-bold text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-pawPink shadow-sm border-2 border-transparent focus:border-pawPink transition-all"
              />
           </div>

           <div className="flex items-center gap-3">
             {/* Filter Toggle */}
             <div className="bg-gray-100 dark:bg-gray-700 p-1.5 rounded-2xl flex items-center shadow-inner flex-1 md:flex-none">
                <button 
                  onClick={() => setFilterStatus('Active')}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === 'Active' ? 'bg-white dark:bg-gray-600 text-pawPinkDark shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                >
                  Active
                </button>
                <button 
                  onClick={() => setFilterStatus('Completed')}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === 'Completed' ? 'bg-white dark:bg-gray-600 text-pawPinkDark shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                >
                  Completed
                </button>
             </div>

             <button onClick={() => { setEditingBale(null); setShowModal(true); }} className="bg-pawPinkDark text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-90 hover:bg-red-400 shrink-0">
               <PlusIcon className="w-6 h-6" />
             </button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-2">
        {filteredBales.length === 0 ? (
           <div className="col-span-full py-20 text-center opacity-50">
              <p className="text-4xl mb-2">📦</p>
              <p className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {searchQuery ? `No matches for "${searchQuery}"` : `No ${filterStatus.toLowerCase()} batches found`}
              </p>
           </div>
        ) : filteredBales.map(bale => {
          const stats = getBaleStats(bale.id, bale.cost);
          const remaining = Math.max(0, bale.itemCount - stats.soldCount);
          const percentSold = bale.itemCount > 0 ? (stats.soldCount / bale.itemCount) * 100 : 0;
          const unitCost = bale.itemCount > 0 ? (bale.cost / bale.itemCount) : 0;
          const fullyPaid = isBaleFullyPaid(bale.id);
          
          return (
            <button key={bale.id} onClick={() => { setEditingBale(bale); setShowModal(true); }} className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-7 border-2 border-pawPink/30 dark:border-gray-700 hover:border-pawPinkDark dark:hover:border-pawPinkDark shadow-sm hover:shadow-xl group text-left relative overflow-hidden transition-all active:scale-95 w-full">
              <div className="mb-4 relative z-10">
                <div className="flex justify-between items-start mb-2">
                   <span className="text-[10px] font-black uppercase text-pawPinkDark bg-pawPink/20 dark:bg-pink-900/30 px-3 py-1 rounded-full tracking-widest">{bale.id}</span>
                   {stats.isProfitable && (
                     <span className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-3 py-1 rounded-full tracking-widest shadow-sm">Profitable 💰</span>
                   )}
                </div>
                <h3 className="font-black text-gray-800 dark:text-white text-xl leading-none mb-1">{bale.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{bale.status}</p>
                  {bale.status === 'Sold Out' && !fullyPaid && (
                     <span className="text-[9px] font-black text-red-500 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded uppercase">Collecting Payment</span>
                  )}
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-3 rounded-2xl mb-4 border border-orange-100/50 dark:border-orange-800/30 flex justify-between items-center">
                 <p className="text-[9px] text-orange-600 dark:text-orange-300 font-black uppercase tracking-wider">Unit Cost (Capital)</p>
                 <p className="text-xl font-black text-orange-800 dark:text-orange-200">₱{unitCost.toFixed(2)}</p>
              </div>

              <div className="flex gap-4 relative z-10 mb-6">
                <div className="bg-pawSoftBlue dark:bg-blue-900/30 px-4 py-3 rounded-2xl flex-1 text-center">
                  <p className="text-[9px] text-blue-600 dark:text-blue-300 font-black uppercase mb-1">Dispersed</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{stats.soldCount}</p>
                </div>
                <div className="bg-pawLavender dark:bg-purple-900/30 px-4 py-3 rounded-2xl flex-1 text-center">
                  <p className="text-[9px] text-purple-700 dark:text-purple-300 font-black uppercase mb-1">Remaining</p>
                  <p className="text-2xl font-black text-gray-800 dark:text-white">{remaining}</p>
                </div>
              </div>
              
              <div className="relative z-10">
                 <div className="flex justify-between items-center mb-1 px-1">
                    <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Progress</span>
                    <span className={`text-[10px] font-black uppercase ${stats.isProfitable ? 'text-purple-600 dark:text-purple-400' : 'text-pawPinkDark'}`}>
                       {percentSold.toFixed(1)}% Sold
                    </span>
                 </div>
                 <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ${stats.isProfitable ? 'bg-purple-500' : 'bg-pawPinkDark'}`} style={{ width: `${percentSold}%` }}></div>
                 </div>
              </div>
            </button>
          );
        })}
      </div>

      {showModal && <BaleModal bale={editingBale} onClose={() => setShowModal(false)} onSave={handleSaveBale} />}
    </div>
  );
};

const BaleModal: React.FC<{ bale: Bale | null; onClose: () => void; onSave: (b: Bale) => void }> = ({ bale, onClose, onSave }) => {
  const generateId = () => {
    if (bale) return bale.id;
    const existing = db.getBales();
    const max = existing.reduce((acc, curr) => {
       if (curr.id.startsWith('B')) {
           const num = parseInt(curr.id.substring(1));
           return !isNaN(num) && num > acc ? num : acc;
       }
       return acc;
    }, 0);
    return `B${String(max + 1).padStart(3, '0')}`;
  };

  const [formData, setFormData] = useState<Bale>(bale || { 
      id: generateId(), 
      name: '', 
      status: 'Ordered', 
      cost: 0, 
      itemCount: 0 
  });
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  
  const unitCost = formData.itemCount > 0 ? (formData.cost / formData.itemCount) : 0;

  const statusOptions = [
    { value: 'Ordered', label: 'Ordered', icon: '📝', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-200' },
    { value: 'Arrived', label: 'Arrived', icon: '📦', color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-200' },
    { value: 'On Sale', label: 'On Sale', icon: '🔥', color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/50 dark:text-pink-200' },
    { value: 'Sold Out', label: 'Sold Out', icon: '💰', color: 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-200' },
  ];

  const currentStatus = statusOptions.find(s => s.value === formData.status) || statusOptions[0];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[2.5rem] overflow-visible shadow-2xl animate-scaleUp border-4 border-transparent dark:border-gray-700">
        <div className="pt-8 pb-4 px-8 text-center">
          <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">
            {bale ? 'Edit Batch' : 'New Batch'}
          </h3>
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">Stock Inventory Management</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Batch Name Input */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl px-4 py-2 border-2 border-transparent focus-within:border-pawPinkDark transition-all">
             <label className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-wider block">Batch Name</label>
             <input 
               autoFocus 
               value={formData.name} 
               placeholder="e.g. Summer Collection" 
               onChange={(e) => setFormData({...formData, name: e.target.value})} 
               className="w-full bg-transparent font-black text-gray-800 dark:text-white text-lg outline-none placeholder:text-gray-300" 
             />
          </div>

          <div className="flex gap-3">
             {/* Cost Input */}
             <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-2xl px-4 py-2 border-2 border-transparent focus-within:border-pawPinkDark transition-all">
                <label className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-wider block">Capital (₱)</label>
                <input 
                  type="number" 
                  value={formData.cost === 0 ? '' : formData.cost} 
                  placeholder="0" 
                  onChange={(e) => setFormData({...formData, cost: Number(e.target.value)})} 
                  className="w-full bg-transparent font-black text-gray-800 dark:text-white text-lg outline-none placeholder:text-gray-300" 
                />
             </div>

             {/* Count Input */}
             <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-2xl px-4 py-2 border-2 border-transparent focus-within:border-pawPinkDark transition-all">
                <label className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-wider block">Items</label>
                <input 
                  type="number" 
                  value={formData.itemCount === 0 ? '' : formData.itemCount} 
                  placeholder="0" 
                  onChange={(e) => setFormData({...formData, itemCount: Number(e.target.value)})} 
                  className="w-full bg-transparent font-black text-gray-800 dark:text-white text-lg outline-none placeholder:text-gray-300" 
                />
             </div>
          </div>

          {/* Unit Cost Display */}
          <div className="flex justify-between items-center px-4 py-3 bg-pawSoftBlue/30 dark:bg-blue-900/30 rounded-2xl border border-blue-100 dark:border-blue-900">
             <span className="text-[10px] font-black text-blue-800 dark:text-blue-300 uppercase tracking-widest">Est. Unit Cost</span>
             <span className="font-black text-blue-900 dark:text-blue-100 text-lg">₱{unitCost.toFixed(2)}</span>
          </div>
          
          {/* Status Selection Dropdown */}
          <div className="relative">
            <label className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-wider block mb-2">Batch Status</label>
            <button 
              onClick={() => setIsStatusOpen(!isStatusOpen)}
              className="w-full flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl border-2 border-transparent focus:border-pawPinkDark transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${currentStatus.color} shadow-sm`}>
                  {currentStatus.icon}
                </span>
                <div className="text-left">
                  <p className="text-xs font-black text-gray-800 dark:text-white uppercase tracking-wider">{currentStatus.label}</p>
                  <p className="text-[9px] font-bold text-gray-400">Current State</p>
                </div>
              </div>
              <span className="text-gray-400 text-xs">▼</span>
            </button>

            {isStatusOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-pawPink/20 overflow-hidden z-50 animate-scaleUp">
                {statusOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setFormData({...formData, status: opt.value as any});
                      setIsStatusOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-4 hover:bg-pawPink/10 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
                  >
                     <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${opt.color}`}>
                        {opt.icon}
                     </span>
                     <span className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">{opt.label}</span>
                     {formData.status === opt.value && <span className="ml-auto text-pawPinkDark font-black">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 py-4 bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 text-gray-400 dark:text-gray-300 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
              Cancel
            </button>
            <button onClick={() => onSave(formData)} className="flex-1 py-4 bg-pawPinkDark text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-pawPinkDark/30 active:scale-95 transition-all">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
};

export default Inventory;
