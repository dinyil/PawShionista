
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { Bale, Order, Product, LiveSession, PaymentStatus, ShippingStatus } from '../types';
import { PlusIcon, SearchIcon } from '../components/Icons';

const Bales: React.FC = () => {
  const [bales, setBales] = useState(db.getBales());
  const [filterStatus, setFilterStatus] = useState<'Active' | 'Completed'>('Active');
  const [listSearchQuery, setListSearchQuery] = useState(''); // Search for the bale list
  
  const [showModal, setShowModal] = useState(false);
  const [selectedBale, setSelectedBale] = useState<Bale | null>(null);
  const [viewingBale, setViewingBale] = useState<Bale | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); // Search inside detail view
  
  // Track expanded customer groups in the dispersal history
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const products = db.getProducts();
  const orders = db.getOrders();
  const sessions = db.getSessions();

  const getBaleStats = (baleId: string) => {
    const bale = bales.find(b => b.id === baleId);
    if (!bale) return { soldCount: 0, revenue: 0, targetPrice: 0, progress: 0, isProfitable: false, profit: 0, freebiesCount: 0 };
    
    const baleProductIds = products.filter(p => p.baleBatch === baleId).map(p => p.id);
    const baleOrders = orders.filter(o => baleProductIds.includes(o.productId));
    const soldCount = baleOrders.reduce((sum, o) => sum + o.quantity, 0);
    const revenue = baleOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const freebiesCount = baleOrders.filter(o => o.isFreebie).reduce((sum, o) => sum + o.quantity, 0);
    
    const remainingCount = Math.max(0, bale.itemCount - soldCount);
    const remainingToRecover = Math.max(0, bale.cost - revenue);
    const profit = revenue - bale.cost;
    
    // Suggest price for remaining items to recover all costs
    const targetPrice = remainingCount > 0 ? (remainingToRecover / remainingCount) : 0;
    const progress = Math.min(100, (revenue / bale.cost) * 100);
    
    return { soldCount, revenue, targetPrice, progress, isProfitable: revenue >= bale.cost, profit, freebiesCount };
  };

  const handleSaveBale = (bale: Bale) => {
    db.updateBale(bale);
    setBales(db.getBales());
    setShowModal(false);
  };

  const toggleGroup = (username: string) => {
    const next = new Set(expandedGroups);
    if (next.has(username)) {
      next.delete(username);
    } else {
      next.add(username);
    }
    setExpandedGroups(next);
  };

  const isBaleFullyPaid = (baleId: string) => {
    const baleProductIds = products.filter(p => p.baleBatch === baleId).map(p => p.id);
    const baleOrders = orders.filter(o => baleProductIds.includes(o.productId) && o.shippingStatus !== ShippingStatus.CANCELLED);
    
    if (baleOrders.length === 0) return true;
    
    return baleOrders.every(o => o.paymentStatus === PaymentStatus.PAID);
  };

  // Group orders by customer for the viewingBale
  const baleCustomerGroups = useMemo(() => {
    if (!viewingBale) return [];

    const baleProductIds = products.filter(p => p.baleBatch === viewingBale.id).map(p => p.id);
    const relevantOrders = orders.filter(o => baleProductIds.includes(o.productId));

    const groups: Record<string, { 
        username: string, 
        totalQty: number, 
        totalSpent: number, 
        paidCount: number,
        transactions: { id: string, sessionName: string, price: number, qty: number, date: string, isPaid: boolean, isFreebie: boolean }[] 
    }> = {};

    relevantOrders.forEach(order => {
       if (!groups[order.customerUsername]) {
          groups[order.customerUsername] = {
             username: order.customerUsername,
             totalQty: 0,
             totalSpent: 0,
             paidCount: 0,
             transactions: []
          };
       }
       
       const sessionName = sessions.find(s => s.id === order.sessionId)?.name || (order.sessionId === 'OFF_LIVE' ? 'Manual Encoding' : 'Unknown Session');
       const isPaid = order.paymentStatus === PaymentStatus.PAID;
       
       groups[order.customerUsername].totalQty += order.quantity;
       groups[order.customerUsername].totalSpent += order.totalPrice;
       if (isPaid) groups[order.customerUsername].paidCount += 1;

       groups[order.customerUsername].transactions.push({
          id: order.id,
          sessionName: sessionName,
          price: order.totalPrice,
          qty: order.quantity,
          date: new Date(order.createdAt).toLocaleDateString(),
          isPaid: isPaid,
          isFreebie: order.isFreebie
       });
    });

    return Object.values(groups)
      .filter(g => g.username.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.totalSpent - a.totalSpent);

  }, [viewingBale, products, orders, sessions, searchQuery]);

  const filteredBales = bales.filter(b => {
    const fullyPaid = isBaleFullyPaid(b.id);
    let matchesStatus = false;

    if (filterStatus === 'Active') {
        matchesStatus = b.status !== 'Sold Out' || !fullyPaid;
    } else {
        matchesStatus = b.status === 'Sold Out' && fullyPaid;
    }

    const matchesSearch = b.name.toLowerCase().includes(listSearchQuery.toLowerCase()) || 
                          b.id.toLowerCase().includes(listSearchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (viewingBale) {
    const stats = getBaleStats(viewingBale.id);
    return (
      <div className="space-y-6 pb-32 px-1 animate-fadeIn">
        <button onClick={() => { setViewingBale(null); setSearchQuery(''); }} className="text-[10px] font-black uppercase text-gray-400 dark:text-gray-400 mb-2 hover:text-pawPinkDark transition-colors">← Back to Batches</button>
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 border-2 border-pawPink dark:border-gray-700 shadow-lg space-y-8 transition-colors">
           
           {/* Header & Stats */}
           <div>
              <div className="flex justify-between items-start mb-6">
                 <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight leading-none">{viewingBale.name}</h1>
                 <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${stats.isProfitable ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'}`}>
                    {stats.isProfitable ? 'Profitable ✨' : 'Recovering Capital'}
                 </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-8 items-stretch">
                 <Metric label="Investment" value={`₱${viewingBale.cost.toLocaleString()}`} />
                 <Metric label="Revenue" value={`₱${stats.revenue.toLocaleString()}`} />
                 
                 {/* Profit Metric */}
                 <div className={`p-4 rounded-2xl border-2 flex flex-col justify-center ${stats.isProfitable ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 leading-none ${stats.isProfitable ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {stats.isProfitable ? 'Net Profit' : 'Deficit'}
                    </p>
                    <p className={`text-xl font-black leading-none ${stats.isProfitable ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}`}>
                        {stats.profit > 0 ? '+' : ''}₱{stats.profit.toLocaleString()}
                    </p>
                 </div>

                 <Metric label="ROI %" value={`${stats.progress.toFixed(1)}%`} />
                 
                 {/* Units Left / Freebies */}
                 <div className="p-4 rounded-2xl border-2 border-transparent flex flex-col justify-center">
                    <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1 leading-none">Stock / Freebies</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-xl font-black text-gray-800 dark:text-white leading-none">{viewingBale.itemCount - stats.soldCount}</p>
                        <span className="text-xs font-bold text-orange-500">({stats.freebiesCount} Free)</span>
                    </div>
                 </div>
              </div>
              
              <div className="bg-pawSoftBlue/30 dark:bg-blue-900/30 rounded-[2.5rem] p-7 border-2 border-white dark:border-gray-700 shadow-inner">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xs font-black text-blue-900 dark:text-blue-200 uppercase tracking-widest">Pricing Strategy (Dynamic)</h4>
                 </div>
                 <p className="text-sm text-blue-800 dark:text-blue-200 font-bold mb-3">
                   {stats.isProfitable 
                      ? "You have fully recovered your initial investment. Every remaining item is now 100% profit!" 
                      : `To break even, you still need to recover ₱${(viewingBale.cost - stats.revenue).toLocaleString()}.`}
                 </p>
                 {!stats.isProfitable && (
                   <div className="flex items-center gap-4 bg-white/60 dark:bg-gray-800/50 p-4 rounded-2xl border border-blue-100 dark:border-blue-900">
                      <div className="text-2xl">🎯</div>
                      <div>
                         <p className="text-[9px] font-black text-blue-400 dark:text-blue-300 uppercase tracking-widest leading-none mb-1">Target Price per Remaining Item</p>
                         <p className="text-xl font-black text-blue-950 dark:text-blue-100 leading-none">₱{stats.targetPrice.toFixed(0)} <span className="text-xs font-bold text-gray-400 dark:text-gray-500">or higher</span></p>
                      </div>
                   </div>
                 )}
              </div>
           </div>

           {/* Order Breakdown Section */}
           <div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Dispersal History</h3>
                <div className="relative w-full md:w-64">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="Search Customer..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-700 pl-10 pr-4 py-3 rounded-2xl font-bold text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-pawPink"
                    />
                </div>
              </div>

              <div className="space-y-4">
                 {baleCustomerGroups.length === 0 ? (
                    <div className="text-center py-10 opacity-50 bg-gray-50 dark:bg-gray-700 rounded-[2rem] border-2 border-dashed border-gray-200 dark:border-gray-600">
                       <p className="font-bold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-widest">No items sold yet</p>
                    </div>
                 ) : (
                    baleCustomerGroups.map(group => {
                       const isExpanded = expandedGroups.has(group.username);
                       const allPaid = group.paidCount === group.transactions.length;
                       
                       return (
                       <div key={group.username} className="bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 rounded-[2rem] shadow-sm hover:border-pawPink transition-all overflow-hidden">
                          {/* Customer Header - Clickable for Accordion */}
                          <div 
                             onClick={() => toggleGroup(group.username)}
                             className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          >
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-pawPink dark:bg-pink-900/30 text-pawPinkDark dark:text-pink-300 flex items-center justify-center font-black text-xs">
                                   {group.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                   <p className="font-black text-gray-800 dark:text-white text-lg leading-none">@{group.username}</p>
                                   <div className="flex gap-2 mt-1">
                                      <p className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">{group.transactions.length} items</p>
                                      {allPaid ? (
                                         <span className="text-[9px] font-black bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 rounded uppercase tracking-wider">Fully Paid</span>
                                      ) : group.paidCount > 0 ? (
                                         <span className="text-[9px] font-black bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 rounded uppercase tracking-wider">Partial</span>
                                      ) : (
                                         <span className="text-[9px] font-black bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 rounded uppercase tracking-wider">Unpaid</span>
                                      )}
                                   </div>
                                </div>
                             </div>
                             <div className="flex items-center gap-4">
                                <div className="text-right">
                                   <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest">Total</p>
                                   <p className="text-xl font-black text-gray-800 dark:text-white">₱{group.totalSpent.toLocaleString()}</p>
                                </div>
                                <span className={`text-gray-300 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                             </div>
                          </div>

                          {/* Transaction Details - Collapsible */}
                          {isExpanded && (
                            <div className="bg-gray-50 dark:bg-gray-800 border-t border-dashed border-gray-200 dark:border-gray-600 p-4 space-y-2 animate-fadeIn">
                               <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-2">Order Breakdown</p>
                               {group.transactions.map(tx => (
                                  <div key={tx.id} className="flex justify-between items-center text-xs font-bold text-gray-600 dark:text-gray-300 px-2 py-1 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors">
                                     <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${tx.isPaid ? 'bg-green-400' : 'bg-red-400'}`}></span>
                                        <span className="text-gray-800 dark:text-gray-200">{tx.qty}x {tx.isFreebie ? 'Gift (Free)' : 'Item'}</span>
                                        <span className="text-gray-400 font-normal">from</span>
                                        <span className="bg-white dark:bg-gray-600 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-500 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-300">{tx.sessionName}</span>
                                     </div>
                                     <div className="flex items-center gap-3">
                                        <span className={`text-[9px] uppercase font-black ${tx.isPaid ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                           {tx.isPaid ? 'Paid' : 'Unpaid'}
                                        </span>
                                        <span>₱{tx.price.toLocaleString()}</span>
                                     </div>
                                  </div>
                               ))}
                            </div>
                          )}
                       </div>
                       );
                    })
                 )}
              </div>
           </div>

        </div>
      </div>
    );
  }

  // Fallback View (List) is same as previous, just need to update imports
  return (
    <div className="space-y-6 pb-32 px-1 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 px-2">
        <div>
          <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight">Inventory & ROI</h1>
          <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">Monitor recovery progress for each sourcing batch.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3">
           {/* Search Bar */}
           <div className="relative w-full md:w-64">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search batch..." 
                value={listSearchQuery}
                onChange={(e) => setListSearchQuery(e.target.value)}
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

             <button onClick={() => { setSelectedBale(null); setShowModal(true); }} className="bg-pawPinkDark text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all hover:bg-red-400 shrink-0">
               <PlusIcon className="w-6 h-6" />
             </button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-2">
        {filteredBales.length === 0 ? (
           <div className="col-span-full py-20 text-center opacity-50">
              <p className="text-4xl mb-2">📊</p>
              <p className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {listSearchQuery ? `No matches for "${listSearchQuery}"` : `No ${filterStatus.toLowerCase()} batches found`}
              </p>
           </div>
        ) : filteredBales.map(bale => {
          const stats = getBaleStats(bale.id);
          const fullyPaid = isBaleFullyPaid(bale.id);
          
          return (
            <div key={bale.id} onClick={() => { setViewingBale(bale); setSearchQuery(''); }} className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 border-2 border-pawPink/20 dark:border-gray-700 shadow-xl relative cursor-pointer group active:scale-[0.98] transition-all hover:border-pawPinkDark">
              <div className="flex justify-between items-start mb-6">
                 <div>
                   <span className="text-[10px] font-black text-blue-500 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-md uppercase mb-2 inline-block tracking-widest">{bale.status}</span>
                   <h3 className="text-2xl font-black text-gray-800 dark:text-white tracking-tighter leading-none group-hover:text-pawPinkDark transition-colors">{bale.name}</h3>
                   {bale.status === 'Sold Out' && !fullyPaid && (
                      <div className="mt-1">
                         <span className="text-[9px] font-black text-red-500 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded uppercase">Collecting Payment</span>
                      </div>
                   )}
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest">ROI</p>
                    <p className={`text-xl font-black ${stats.isProfitable ? 'text-purple-500 dark:text-purple-400' : 'text-orange-500 dark:text-orange-400'}`}>{stats.progress.toFixed(0)}%</p>
                    <p className={`text-[10px] font-bold mt-1 ${stats.isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-400 dark:text-red-400'}`}>
                        {stats.profit > 0 ? '+' : ''}₱{stats.profit.toLocaleString()}
                    </p>
                 </div>
              </div>

              <div className="mb-6">
                 <div className="flex justify-between items-end mb-1 px-1">
                    <span className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest">Recovery</span>
                    <span className={`text-[10px] font-black ${stats.isProfitable ? 'text-purple-500 dark:text-purple-400' : 'text-orange-500 dark:text-orange-400'}`}>
                       {stats.progress.toFixed(0)}%
                    </span>
                 </div>
                 <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                    <div className={`h-full transition-all duration-1000 ${stats.isProfitable ? 'bg-purple-400' : 'bg-pawPinkDark'}`} style={{ width: `${stats.progress}%` }}></div>
                 </div>
              </div>

              <div className="flex justify-between items-end border-t border-dashed border-gray-100 dark:border-gray-600 pt-4">
                 <div>
                    <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest">Investment</p>
                    <p className="font-bold text-gray-700 dark:text-gray-300">₱{bale.cost.toLocaleString()}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest">Leftovers</p>
                    <p className="font-bold text-gray-700 dark:text-gray-300">{bale.itemCount - stats.soldCount} units</p>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
      {showModal && <BaleModal bale={selectedBale} onClose={() => setShowModal(false)} onSave={handleSaveBale} />}
    </div>
  );
};

const Metric = ({ label, value }: any) => (
  <div className="p-4 rounded-2xl border-2 border-transparent flex flex-col justify-center">
    <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1 leading-none">{label}</p>
    <p className="text-xl font-black text-gray-800 dark:text-white leading-none">{value}</p>
  </div>
);

const BaleModal = ({ onClose, onSave, bale }: any) => {
  // ... BaleModal implementation remains identical to previous, just needing to be present ...
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

          <div className="flex justify-between items-center px-4 py-3 bg-pawSoftBlue/30 dark:bg-blue-900/30 rounded-2xl border border-blue-100 dark:border-blue-900">
             <span className="text-[10px] font-black text-blue-800 dark:text-blue-300 uppercase tracking-widest">Est. Unit Cost</span>
             <span className="font-black text-blue-900 dark:text-blue-100 text-lg">₱{unitCost.toFixed(2)}</span>
          </div>

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
            <button onClick={onClose} className="flex-1 py-4 bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 text-gray-400 dark:text-gray-300 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            <button onClick={() => onSave(formData)} className="flex-1 py-4 bg-pawPinkDark text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-pawPinkDark/30 active:scale-95 transition-all">Save</button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
};

export default Bales;
