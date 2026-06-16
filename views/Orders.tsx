
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { Order, PaymentStatus, ShippingStatus, LiveSession, PaymentMethod } from '../types';
import { SearchIcon } from '../components/Icons';

const OFF_LIVE_ID = 'OFF_LIVE';

interface GroupedOrder extends Order {
  ids: string[];
  items: Order[];
  isCustomerVIP?: boolean;
}

// Inline Calendar Icon for this view
const CalendarIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// --- Audit Log Components ---

const ChangeRow: React.FC<{ change: string }> = ({ change }) => {
   const parts = change.split(': ');
   if (parts.length < 2) return <p className="text-xs text-gray-600 dark:text-gray-300 pl-2">{change}</p>;

   const label = parts[0];
   const values = parts.slice(1).join(': ');
   const [oldVal, newVal] = values.split(' -> ');

   let icon = '📝';
   let colorClass = 'text-gray-500';
   let bgClass = 'bg-gray-50 dark:bg-gray-700';

   if (label === 'Status') { icon = '⚡'; colorClass = 'text-blue-500'; bgClass='bg-blue-50 dark:bg-blue-900/20'; }
   if (label === 'Paid') { icon = '💵'; colorClass = 'text-green-500'; bgClass='bg-green-50 dark:bg-green-900/20'; }
   if (label === 'Shipping') { icon = '🚚'; colorClass = 'text-orange-500'; bgClass='bg-orange-50 dark:bg-orange-900/20'; }
   if (label === 'Ref') { icon = '#️⃣'; colorClass = 'text-purple-500'; bgClass='bg-purple-50 dark:bg-purple-900/20'; }

   return (
     <div className={`p-2.5 rounded-xl ${bgClass} border border-transparent`}>
        <div className="flex items-center gap-2 mb-1.5">
           <span className="text-xs">{icon}</span>
           <span className={`text-[9px] font-black uppercase tracking-wider ${colorClass}`}>{label}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] pl-6 flex-wrap">
           <span className="text-gray-400 line-through decoration-red-400/50">{oldVal || 'None'}</span>
           <span className="text-gray-300">➜</span>
           <span className="font-bold text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-600 px-1.5 py-0.5 rounded shadow-sm">{newVal || 'None'}</span>
        </div>
     </div>
   );
};

const LogItem: React.FC<{ log: string }> = ({ log }) => {
  const [isOpen, setIsOpen] = useState(false);
  const match = log.match(/^\[(.*?)\] (.*)$/);

  if (!match) return (
     <div className="text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded mb-2 text-gray-500">{log}</div>
  );

  const timestamp = match[1];
  const content = match[2];
  
  // Robust split looking for known keys to separate multiple changes in one log line
  const changes = content.split(/, (?=(?:Status|Paid|Shipping|Ref):)/);

  return (
    <div className="relative pl-6 border-l-2 border-dashed border-gray-200 dark:border-gray-700 pb-6 last:pb-0 last:border-transparent">
       <div className="absolute -left-[4px] top-1.5 w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 ring-4 ring-white dark:ring-gray-900"></div>
       
       <div className="mb-2">
           <button 
             onClick={() => setIsOpen(!isOpen)}
             className="flex items-center gap-3 group w-full text-left"
           >
              <span className="text-[10px] font-black text-gray-400 dark:text-white uppercase tracking-widest">{timestamp}</span>
              <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold transition-all border ${isOpen ? 'bg-pawPink/20 text-pawPinkDark border-pawPinkDark' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-transparent group-hover:bg-gray-200 dark:group-hover:bg-gray-700'}`}>
                 {changes.length} Updates {isOpen ? '▲' : '▼'}
              </span>
           </button>
           
           {!isOpen && (
             <div className="mt-1 pl-1">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate opacity-70 font-medium">
                  {changes.map(c => c.split(':')[0]).join(', ')}...
                </p>
             </div>
           )}
       </div>

       {isOpen && (
          <div className="space-y-2 animate-scaleUp origin-top-left mt-3">
             {changes.map((c, i) => <ChangeRow key={i} change={c} />)}
          </div>
       )}
    </div>
  );
};

// --- Main Orders Component ---

const Orders: React.FC = () => {
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  const [orderFilter, setOrderFilter] = useState('All'); // Filter inside a session
  
  // -- Session List State --
  const [sessionSearch, setSessionSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'All' | 'Today' | 'Week' | 'Month' | 'Custom'>('All');
  const [customDate, setCustomDate] = useState('');

  const [allOrders, setAllOrders] = useState(db.getOrders());
  const [deleteTarget, setDeleteTarget] = useState<GroupedOrder | null>(null);
  const [logTarget, setLogTarget] = useState<GroupedOrder | null>(null);
  
  const customers = db.getCustomers();

  // Prepare Sessions List
  const sessions = useMemo(() => {
    const dbSessions = db.getSessions();
    const hasManual = allOrders.some(o => o.sessionId === OFF_LIVE_ID);
    let list = [...dbSessions];
    
    // Add Manual Session if exists
    if (hasManual) {
      const manual: LiveSession = { 
        id: OFF_LIVE_ID, 
        name: 'Manual Encoding', 
        date: new Date().toLocaleDateString('en-US'), // Treat as today for sorting
        totalSales: 0, 
        totalOrders: 0, 
        isOpen: true 
      };
      list = [manual, ...list];
    }
    
    // Filter Logic
    return list.filter(s => {
       // 1. Search Name
       if (sessionSearch && !s.name.toLowerCase().includes(sessionSearch.toLowerCase())) {
         return false;
       }

       // 2. Date Filter
       const sDate = new Date(s.date);
       const now = new Date();
       
       const isSameDay = (d1: Date, d2: Date) => 
         d1.getDate() === d2.getDate() && 
         d1.getMonth() === d2.getMonth() && 
         d1.getFullYear() === d2.getFullYear();

       if (dateFilter === 'Today') {
          return isSameDay(sDate, now);
       }
       if (dateFilter === 'Week') {
          const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          return sDate >= oneWeekAgo;
       }
       if (dateFilter === 'Month') {
          return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
       }
       if (dateFilter === 'Custom' && customDate) {
          const target = new Date(customDate);
          return isSameDay(sDate, target);
       }

       return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id.localeCompare(a.id));
  }, [allOrders, sessionSearch, dateFilter, customDate]);

  // Prepare Orders inside a selected session
  const filteredOrders = useMemo(() => {
    if (!selectedSession) return [];
    const base = allOrders.filter(o => o.sessionId === selectedSession.id);
    const groups: Record<string, GroupedOrder> = {};
    const vipMap = new Map(customers.map(c => [c.username, c.isVIP]));

    base.forEach(o => {
      // Group by productId (or fallback to id if missing) to separate by bale
      const key = o.productId || o.id;
      if (!groups[key]) {
        groups[key] = { 
            ...o, 
            ids: [o.id], 
            items: [o],
            isCustomerVIP: vipMap.get(o.customerUsername) || false,
            walletPayments: o.walletPayments ? { ...o.walletPayments } : undefined
        };
      } else {
        groups[key].quantity += o.quantity;
        groups[key].totalPrice += o.totalPrice;
        groups[key].amountPaid += o.amountPaid;
        groups[key].ids.push(o.id);
        groups[key].items.push(o);
        if (o.walletPayments) {
          if (!groups[key].walletPayments) {
            groups[key].walletPayments = {};
          }
          Object.entries(o.walletPayments).forEach(([wallet, amt]) => {
            groups[key].walletPayments![wallet] = (groups[key].walletPayments![wallet] || 0) + amt;
          });
        }
        if (o.logs) {
           groups[key].logs = [...(groups[key].logs || []), ...o.logs];
        }
      }
    });

    return Object.values(groups).filter(g => {
      if (orderFilter === 'Unpaid') return g.paymentStatus !== PaymentStatus.PAID; 
      if (orderFilter === 'Paid') return g.paymentStatus === PaymentStatus.PAID;
      return true;
    }).sort((a, b) => {
        // --- 1. SORT BY STATUS PRIORITY ---
        // Priority: Unpaid (0) -> Paid (1) -> Paid+Shipped (2)
        
        const getRank = (o: GroupedOrder) => {
            if (o.paymentStatus !== PaymentStatus.PAID) return 0; // Unpaid/Partial (Top)
            if (o.shippingStatus === ShippingStatus.SHIPPED) return 2; // Paid & Shipped (Bottom)
            return 1; // Paid Only (Middle)
        };

        const rankA = getRank(a);
        const rankB = getRank(b);

        if (rankA !== rankB) {
            return rankA - rankB; // Ascending: 0 -> 1 -> 2
        }

        // --- 2. SORT BY DATE (Secondary) ---
        // Newest first within same rank
        return b.createdAt - a.createdAt;
    });
  }, [allOrders, selectedSession, orderFilter, customers]);

  const handleUpdate = (updated: GroupedOrder, newLog?: string) => {
    updated.ids.forEach(id => {
       const original = db.getOrders().find(o => o.id === id);
       if (original) {
          let newItemPaidAmount = 0;
          
          if (updated.paymentStatus === PaymentStatus.PAID) {
              newItemPaidAmount = original.totalPrice;
          } else if (updated.paymentStatus === PaymentStatus.UNPAID) {
              newItemPaidAmount = 0;
          } else {
              const totalGroupPrice = updated.items.reduce((sum, i) => sum + i.totalPrice, 0);
              const inputAmount = updated.amountPaid;
              const ratio = totalGroupPrice > 0 ? (inputAmount / totalGroupPrice) : 0;
              newItemPaidAmount = original.totalPrice * ratio;
          }

          let itemWalletPayments: Record<string, number> | undefined = undefined;
          if (updated.walletPayments) {
             itemWalletPayments = {};
             const totalGroupPrice = updated.items.reduce((sum, i) => sum + i.totalPrice, 0);
             const ratio = totalGroupPrice > 0 ? (original.totalPrice / totalGroupPrice) : 0;
             Object.entries(updated.walletPayments).forEach(([wallet, amt]) => {
                itemWalletPayments![wallet] = Math.round(amt * ratio * 100) / 100;
             });
          }

          const updatedLogs = original.logs ? [...original.logs] : [];
          if (newLog) updatedLogs.push(newLog);

          db.updateOrder({ 
              ...original, 
              paymentStatus: updated.paymentStatus, 
              shippingStatus: updated.shippingStatus, 
              paymentMethod: updated.paymentMethod,
              referenceNumber: updated.referenceNumber,
              amountPaid: newItemPaidAmount,
              walletPayments: itemWalletPayments,
              logs: updatedLogs
          });
       }
    });
    setAllOrders(db.getOrders());
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTarget.ids.forEach(id => db.deleteOrder(id));
    setAllOrders(db.getOrders());
    setDeleteTarget(null);
  };

  // --- VIEW: SESSION SELECTION ---
  if (!selectedSession) {
    return (
      <div className="space-y-8 pb-32 px-2 animate-fadeIn">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight">Order Management</h1>
            <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">Select a live session to manage orders.</p>
          </div>
        </div>

        {/* Controls: Search & Date Filter */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/30 dark:border-gray-700 space-y-4 transition-colors">
           <div className="relative">
              <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Search session name..." 
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-700 pl-14 pr-5 py-4 rounded-2xl font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-pawPink transition-all"
              />
           </div>
           
           <div className="flex flex-wrap items-center gap-2">
              {['All', 'Today', 'Week', 'Month'].map(f => (
                <button 
                  key={f}
                  onClick={() => { setDateFilter(f as any); setCustomDate(''); }}
                  className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border ${
                    dateFilter === f 
                      ? 'bg-pawPinkDark text-white border-pawPinkDark shadow-md' 
                      : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {f}
                </button>
              ))}
              
              <div className="relative flex items-center">
                 <input 
                   type="date" 
                   value={customDate}
                   onChange={(e) => { setCustomDate(e.target.value); setDateFilter('Custom'); }}
                   className={`px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase outline-none border transition-all ${
                      dateFilter === 'Custom' 
                        ? 'bg-pawPink/20 dark:bg-pawPink/10 border-pawPinkDark text-pawPinkDark' 
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400'
                   }`}
                 />
              </div>
           </div>
        </div>

        {/* Session Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
           {sessions.length === 0 ? (
             <div className="col-span-full text-center py-20 opacity-50">
               <div className="text-4xl mb-2">📅</div>
               <p className="font-bold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-widest">No sessions found</p>
             </div>
           ) : sessions.map(s => {
             const sessionOrders = allOrders.filter(o => o.sessionId === s.id);
             const sessionTotal = sessionOrders.reduce((sum,o) => sum + o.totalPrice, 0);
             const sessionItems = sessionOrders.reduce((sum, o) => sum + o.quantity, 0);
             
             return (
               <button key={s.id} onClick={() => setSelectedSession(s)} className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-6 border-2 border-transparent hover:border-pawPink dark:hover:border-gray-600 transition-all shadow-sm hover:shadow-xl group text-left flex flex-col h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pawPink/10 dark:bg-gray-700 rounded-bl-[3rem] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="mb-6 relative z-10">
                    <div className="flex justify-between items-start mb-2">
                       <span className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-3 py-1 rounded-full tracking-widest">
                         <CalendarIcon /> {s.date}
                       </span>
                       {s.isOpen ? (
                         <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                       ) : (
                         <span className="text-[9px] font-black text-gray-300 dark:text-gray-600 uppercase">Closed</span>
                       )}
                    </div>
                    <h3 className="font-black text-gray-800 dark:text-white text-xl leading-tight group-hover:text-pawPinkDark transition-colors line-clamp-2">{s.name}</h3>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-3 relative z-10">
                     <div className="bg-pawSoftBlue/50 dark:bg-blue-900/30 p-3 rounded-2xl">
                        <p className="text-[9px] text-blue-600 dark:text-blue-300 font-black uppercase mb-0.5 tracking-wider">Items</p>
                        <p className="text-lg font-black text-blue-950 dark:text-blue-100">{sessionItems}</p>
                     </div>
                     <div className="bg-pawLavender/50 dark:bg-purple-900/30 p-3 rounded-2xl">
                        <p className="text-[9px] text-purple-700 dark:text-purple-300 font-black uppercase mb-0.5 tracking-wider">Sales</p>
                        <p className="text-lg font-black text-purple-950 dark:text-purple-100">₱{sessionTotal.toLocaleString()}</p>
                     </div>
                  </div>
               </button>
             );
           })}
        </div>
      </div>
    );
  }

  // --- VIEW: ORDER DETAILS (Inside a Session) ---
  return (
    <div className="space-y-4 pb-24 px-1 animate-fadeIn">
      <button onClick={() => setSelectedSession(null)} className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:text-pawPinkDark hover:border-pawPink transition-all">
        <span>← Back to Sessions</span>
      </button>

      {/* Header Info */}
      <div className="bg-white dark:bg-gray-800 rounded-[2rem] p-6 shadow-sm border border-pawPink/20 dark:border-gray-700 relative overflow-hidden transition-colors">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <span className="text-[10px] font-black bg-pawPinkDark text-white px-2 py-0.5 rounded uppercase tracking-wider">{selectedSession.date}</span>
               {selectedSession.isOpen && <span className="text-[10px] font-black bg-red-100 dark:bg-red-900/50 text-red-500 dark:text-red-300 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">Live</span>}
            </div>
            <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight leading-none">{selectedSession.name}</h1>
          </div>
          <div className="flex bg-gray-50 dark:bg-gray-700 p-1.5 rounded-xl border border-gray-100 dark:border-gray-600">
            {['All', 'Unpaid', 'Paid'].map(f => (
              <button key={f} onClick={() => setOrderFilter(f)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider ${orderFilter === f ? 'bg-pawPinkDark text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-100'}`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Summary */}
      {(() => {
         const sessionOrders = allOrders.filter(o => o.sessionId === selectedSession.id);
         const totalAmountSale = sessionOrders.reduce((sum, o) => sum + o.totalPrice, 0);
         const gcashPayments = sessionOrders.filter(o => o.paymentMethod === PaymentMethod.GCASH).reduce((sum, o) => sum + o.amountPaid, 0);
         const tiktokPayments = sessionOrders.filter(o => o.paymentMethod === PaymentMethod.TIKTOK).reduce((sum, o) => sum + o.amountPaid, 0);
         const gotymePayments = sessionOrders.filter(o => o.paymentMethod === PaymentMethod.GOTYME).reduce((sum, o) => sum + o.amountPaid, 0);
         const seabankPayments = sessionOrders.filter(o => o.paymentMethod === PaymentMethod.SEABANK).reduce((sum, o) => sum + o.amountPaid, 0);
         const bpiPayments = sessionOrders.filter(o => o.paymentMethod === PaymentMethod.BPI).reduce((sum, o) => sum + o.amountPaid, 0);

         return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pb-4 pt-2 px-1">
               <div className="bg-gray-900 dark:bg-black p-3.5 rounded-2xl flex flex-col justify-center items-start shadow-md border border-gray-800 relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-12 h-12 bg-white/10 rounded-full blur-xl group-hover:bg-pawPink/20 transition-all"></div>
                  <span className="text-[9px] font-black uppercase text-gray-400 mb-1 tracking-widest">Total Sales</span>
                  <span className="text-xl font-black text-white">₱{totalAmountSale.toLocaleString()}</span>
               </div>
               
               <div className="bg-blue-50 dark:bg-blue-900/20 p-3.5 rounded-2xl flex flex-col justify-center items-start border border-blue-100 dark:border-blue-800/50 shadow-sm transition-colors hover:border-blue-300">
                  <span className="text-[9px] font-black uppercase text-blue-500 dark:text-blue-400 mb-1 tracking-widest">GCash</span>
                  <span className="text-lg font-black text-blue-900 dark:text-blue-100">₱{gcashPayments.toLocaleString()}</span>
               </div>
               
               <div className="bg-fuchsia-50 dark:bg-fuchsia-900/20 p-3.5 rounded-2xl flex flex-col justify-center items-start border border-fuchsia-100 dark:border-fuchsia-800/50 shadow-sm transition-colors hover:border-fuchsia-300">
                  <span className="text-[9px] font-black uppercase text-fuchsia-500 dark:text-fuchsia-400 mb-1 tracking-widest">TikTok</span>
                  <span className="text-lg font-black text-fuchsia-900 dark:text-fuchsia-100">₱{tiktokPayments.toLocaleString()}</span>
               </div>
               
               <div className="bg-cyan-50 dark:bg-cyan-900/20 p-3.5 rounded-2xl flex flex-col justify-center items-start border border-cyan-100 dark:border-cyan-800/50 shadow-sm transition-colors hover:border-cyan-300">
                  <span className="text-[9px] font-black uppercase text-cyan-600 dark:text-cyan-400 mb-1 tracking-widest">GoTyme</span>
                  <span className="text-lg font-black text-cyan-900 dark:text-cyan-100">₱{gotymePayments.toLocaleString()}</span>
               </div>
               
               <div className="bg-orange-50 dark:bg-orange-900/20 p-3.5 rounded-2xl flex flex-col justify-center items-start border border-orange-100 dark:border-orange-800/50 shadow-sm transition-colors hover:border-orange-300">
                  <span className="text-[9px] font-black uppercase text-orange-500 dark:text-orange-400 mb-1 tracking-widest">SeaBank</span>
                  <span className="text-lg font-black text-orange-900 dark:text-orange-100">₱{seabankPayments.toLocaleString()}</span>
               </div>
               
               <div className="bg-red-50 dark:bg-red-900/20 p-3.5 rounded-2xl flex flex-col justify-center items-start border border-red-100 dark:border-red-800/50 shadow-sm transition-colors hover:border-red-300">
                  <span className="text-[9px] font-black uppercase text-red-500 dark:text-red-400 mb-1 tracking-widest">BPI</span>
                  <span className="text-lg font-black text-red-900 dark:text-red-100">₱{bpiPayments.toLocaleString()}</span>
               </div>
            </div>
         );
      })()}

      {/* HEADER ROW FOR LIST */}
      {filteredOrders.length > 0 && (
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[9px] font-black uppercase text-gray-400 dark:text-gray-500 tracking-widest text-center select-none">
           <div className="col-span-1">Date</div>
           <div className="col-span-3 text-left pl-2">Featured Bale / Item</div>
           <div className="col-span-2">Ref No.</div>
           <div className="col-span-2">Status</div>
           <div className="col-span-2">Mode</div>
           <div className="col-span-1">Ship</div>
           <div className="col-span-1">Actions</div>
        </div>
      )}

      {/* COMPACT ROWS */}
      <div className="space-y-1">
        {filteredOrders.length === 0 ? (
           <div className="text-center py-20 opacity-50">
             <div className="text-4xl mb-2">🔍</div>
             <p className="font-bold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-widest">No orders found for this filter</p>
           </div>
        ) : filteredOrders.map(group => (
          <OrderRow 
             key={group.ids[0]} 
             order={group} 
             onUpdate={handleUpdate} 
             onDelete={() => setDeleteTarget(group)}
             onViewLogs={() => setLogTarget(group)}
          />
        ))}
      </div>
      
      {logTarget && <HistoryModal order={logTarget} onClose={() => setLogTarget(null)} />}
      
      {deleteTarget && (
         <DeleteOrderConfirmationModal 
            customer={
               (() => {
                  const product = db.getProducts().find(p => p.id === deleteTarget.productId);
                  const baleObj = product ? db.getBales().find(b => b.id === product.baleBatch) : null;
                  return baleObj ? baleObj.name : (deleteTarget.customerUsername === 'Live-Summary' ? 'Consolidated Live Sale' : `@${deleteTarget.customerUsername}`);
               })()
            } 
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
         />
      )}
    </div>
  );
};

// --- New OrderRow Component (Ultra Compact) ---
interface OrderCardProps {
  order: GroupedOrder;
  onUpdate: (o: GroupedOrder, log: string) => void;
  onDelete: () => void;
  onViewLogs: () => void;
}

const OrderRow: React.FC<OrderCardProps> = ({ order, onUpdate, onDelete, onViewLogs }) => {
  const { displayName, isLiveSummary } = useMemo(() => {
    const product = db.getProducts().find(p => p.id === order.productId);
    const baleObj = product ? db.getBales().find(b => b.id === product.baleBatch) : null;
    const isLive = order.customerUsername === 'Live-Summary';
    return {
      displayName: baleObj ? baleObj.name : (isLive ? 'Consolidated Live Sale' : `@${order.customerUsername}`),
      isLiveSummary: isLive
    };
  }, [order.productId, order.customerUsername]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [localData, setLocalData] = useState({
      paymentStatus: order.paymentStatus,
      amountPaid: order.amountPaid,
      paymentMethod: order.paymentMethod || '',
      shippingStatus: order.shippingStatus,
      referenceNumber: order.referenceNumber || '',
      walletPayments: (order.walletPayments || {}) as Record<string, number>
  });

  useEffect(() => {
      setLocalData({
          paymentStatus: order.paymentStatus,
          amountPaid: order.amountPaid,
          paymentMethod: order.paymentMethod || '',
          shippingStatus: order.shippingStatus,
          referenceNumber: order.referenceNumber || '',
          walletPayments: (order.walletPayments || {}) as Record<string, number>
      });
  }, [order]);

  const totalPaidFromWallets = useMemo(() => {
     const payments = localData.walletPayments || {};
     return Object.values(payments).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [localData.walletPayments]);

  const handleWalletPaymentChange = (walletName: string, amountString: string) => {
     const cleanVal = amountString === '' ? 0 : Math.max(0, parseFloat(amountString) || 0);
     const newWallets = { ...localData.walletPayments, [walletName]: cleanVal };
     
     if (cleanVal === 0) {
        delete newWallets[walletName];
     }

     const newTotalPaid = Object.values(newWallets).reduce((sum, val) => sum + (Number(val) || 0), 0);
     
     let newStatus = localData.paymentStatus;
     if (newTotalPaid >= order.totalPrice - 0.01) {
        newStatus = PaymentStatus.PAID;
     } else if (newTotalPaid > 0) {
        newStatus = PaymentStatus.PARTIAL;
     } else {
        newStatus = PaymentStatus.UNPAID;
     }

     const activeWallets = Object.keys(newWallets);
     const primaryMethod = activeWallets.length === 1 ? activeWallets[0] as PaymentMethod : undefined;

     const dateStr = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
     const log = `[${dateStr}] Wallet split payment update total: ₱${newTotalPaid}`;

     setLocalData(prev => ({
        ...prev,
        walletPayments: newWallets,
        amountPaid: newTotalPaid,
        paymentStatus: newStatus,
        paymentMethod: primaryMethod || prev.paymentMethod
     }));

     onUpdate({
        ...order,
        walletPayments: newWallets,
        amountPaid: newTotalPaid,
        paymentStatus: newStatus,
        paymentMethod: primaryMethod as PaymentMethod | undefined,
        shippingStatus: localData.shippingStatus,
        referenceNumber: localData.referenceNumber
     }, log);
  };

  const handleSetFullWallet = (walletName: string) => {
     const otherWalletsSum = Object.entries(localData.walletPayments || {}).reduce((sum, [name, val]) => {
        if (name === walletName) return sum;
        return sum + (Number(val) || 0);
     }, 0);
     const remaining = Math.max(0, order.totalPrice - otherWalletsSum);
     handleWalletPaymentChange(walletName, remaining.toString());
  };

  const commitChange = (field: string, value: any) => {
      const oldVal = (order as any)[field];
      if (oldVal == value) return; 

      const newData = { ...order, ...localData, [field]: value };
      
      if (field === 'paymentStatus') {
          if (value === PaymentStatus.PAID) {
             newData.amountPaid = order.totalPrice;
             const method = localData.paymentMethod || 'Cash';
             newData.walletPayments = { [method]: order.totalPrice };
          }
          if (value === PaymentStatus.UNPAID) {
             newData.amountPaid = 0;
             newData.walletPayments = {};
          }
      }
      
      if (field === 'amountPaid') {
          const num = parseFloat(value) || 0;
          if (num >= order.totalPrice - 0.01) newData.paymentStatus = PaymentStatus.PAID;
          else if (num > 0) newData.paymentStatus = PaymentStatus.PARTIAL;
          else newData.paymentStatus = PaymentStatus.UNPAID;
          newData.amountPaid = num;
      }

      const dateStr = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const log = `[${dateStr}] ${field}: ${oldVal} -> ${value}`;
      
      setLocalData({
          paymentStatus: newData.paymentStatus,
          amountPaid: newData.amountPaid,
          paymentMethod: newData.paymentMethod || '',
          shippingStatus: newData.shippingStatus,
          referenceNumber: newData.referenceNumber || '',
          walletPayments: newData.walletPayments || {}
      });

      const payload: GroupedOrder = {
        ...newData,
        paymentMethod: (newData.paymentMethod === '' ? undefined : newData.paymentMethod) as PaymentMethod | undefined
      };

      onUpdate(payload, log);
  };

  // Determine Row Color Class based on Status Priority
  const getRowColorClass = () => {
      if (localData.paymentStatus === PaymentStatus.PAID && localData.shippingStatus === ShippingStatus.SHIPPED) {
          return 'bg-purple-50/50 dark:bg-purple-950/15 border-purple-200/80 dark:border-purple-800/60';
      }
      if (localData.paymentStatus === PaymentStatus.PAID) {
          return 'bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-200/80 dark:border-emerald-800/60';
      }
      if (localData.paymentStatus === PaymentStatus.PARTIAL) {
          return 'bg-amber-50/55 dark:bg-amber-950/15 border-amber-200/80 dark:border-amber-800/60';
      }
      return 'bg-rose-50/55 dark:bg-rose-950/15 border-rose-200/80 dark:border-rose-900/50';
  };

  const getStatusTextColor = () => {
      if (localData.paymentStatus === PaymentStatus.PAID) return 'text-emerald-600 dark:text-emerald-400';
      if (localData.paymentStatus === PaymentStatus.PARTIAL) return 'text-amber-600 dark:text-amber-400';
      return 'text-rose-600 dark:text-rose-400';
  };

  const getStatusDropdownClass = () => {
      if (localData.paymentStatus === PaymentStatus.PAID) {
          return 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/50 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400';
      }
      if (localData.paymentStatus === PaymentStatus.PARTIAL) {
          return 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/30 text-amber-600 dark:text-amber-400';
      }
      return 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-900/40 text-rose-600 dark:text-rose-400';
  };

  return (
    <div className="flex flex-col gap-1 w-full bg-white/45 dark:bg-gray-900/30 p-1.5 rounded-2.5xl border border-gray-100 dark:border-gray-800/50 shadow-xs transition-all hover:bg-white/60 dark:hover:bg-gray-900/50 hover:border-[#ff6b9a]/40">
      <div className={`grid grid-cols-12 gap-2 items-center p-2 rounded-2xl border ${getRowColorClass()} shadow-xs group text-xs transition-all`}>
         
         {/* 1. Date */}
         <div className="col-span-1 text-center">
            <p className="font-extrabold text-gray-500 dark:text-gray-400 leading-tight">
               {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric'})}
            </p>
            <p className="text-[8px] text-gray-400">{new Date(order.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
         </div>

         {/* 2. Featured Bale & Total */}
         <div className="col-span-3 flex items-center gap-2 overflow-hidden pl-1">
            <div className="w-6 h-6 rounded-full bg-[#ff6b9a]/10 dark:bg-[#ff6b9a]/20 text-[#ff6b9a] flex items-center justify-center font-black text-[10px] shrink-0">
               📦
            </div>
            <div className="min-w-0">
               <div className="font-extrabold text-gray-800 dark:text-white truncate leading-none" title={displayName}>
                 {displayName}
               </div>
               <div className="text-[9px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                  ₱{order.totalPrice.toLocaleString()} • {order.quantity} pcs
                  {!isLiveSummary && order.isCustomerVIP && (
                     <span className="bg-yellow-400 text-white px-1 rounded-[2px] text-[8px] leading-tight ml-1">VIP</span>
                  )}
               </div>
            </div>
         </div>

         {/* 3. Ref No (Input) */}
         <div className="col-span-2">
            <input 
               type="text"
               value={localData.referenceNumber}
               placeholder="Ref No."
               onBlur={(e) => commitChange('referenceNumber', e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
               onChange={(e) => setLocalData({...localData, referenceNumber: e.target.value})}
               className="w-full bg-white/70 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/60 focus:border-pawPink rounded-xl px-2.5 py-1.5 text-[10px] font-mono text-gray-900 dark:text-white outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors text-center"
            />
         </div>

         {/* 4. Payment Status (Dropdown) */}
         <div className="col-span-2 relative">
            <select 
               value={localData.paymentStatus}
               onChange={(e) => commitChange('paymentStatus', e.target.value)}
               className={`w-full border appearance-none text-center font-black text-[10px] uppercase py-1.5 rounded-xl cursor-pointer outline-none focus:border-pawPink transition-colors ${getStatusDropdownClass()}`}
            >
               {[PaymentStatus.UNPAID, PaymentStatus.PARTIAL, PaymentStatus.PAID].map(s => (
                   <option key={s} value={s} className="text-gray-950 bg-white dark:text-white dark:bg-gray-800 font-bold">
                      {s}
                   </option>
               ))}
            </select>
         </div>

         {/* 5. Payment Method (Interactive Split) */}
         <div className="col-span-2 flex flex-col items-center justify-center min-w-0 relative">
            {(() => {
               const activeEntries = Object.entries(localData.walletPayments || {}).filter(([_, amt]) => Number(amt) > 0);
               
               let displayNode;
               if (activeEntries.length === 1) {
                  // Only one wallet used
                  const [walletName, amt] = activeEntries[0];
                  displayNode = (
                     <button 
                       type="button"
                       onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                       className="px-2 py-1.5 rounded-xl bg-pink-50/70 dark:bg-pink-950/30 text-[#ff6b9a] dark:text-pink-400 border border-pink-200/50 dark:border-pink-900/30 text-[10px] font-black uppercase shrink-0 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1 w-full text-center"
                       title={`${walletName}: ₱${Number(amt).toLocaleString()}. Click to view detail break down.`}
                     >
                        <span className="truncate max-w-[70px] font-mono font-black">{walletName}</span>
                        <span className="text-[7px]">▼</span>
                     </button>
                  );
               } else if (activeEntries.length > 1) {
                  // Multiple wallets used
                  displayNode = (
                     <button 
                       type="button"
                       onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                       className="px-2 py-1.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border border-purple-200/40 dark:border-purple-800/30 text-[10px] font-black uppercase shrink-0 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1 w-full text-center"
                       title="Split Wallet Payments. Click to view breakdown."
                     >
                        <span className="truncate font-black">📊 SPLIT ({activeEntries.length})</span>
                        <span className="text-[7px]">▼</span>
                     </button>
                  );
               } else {
                  // No specific wallet payment
                  displayNode = (
                     <button
                       type="button"
                       onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                       className="px-2 py-1.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 text-[10px] font-extrabold uppercase shrink-0 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1 w-full text-center border border-gray-200/40 dark:border-gray-700/40"
                       title="Click to select or split payment"
                     >
                        <span className="truncate font-black">{localData.paymentMethod || 'Select/Split'}</span>
                        <span className="text-[7px]">▼</span>
                     </button>
                  );
               }

               return (
                  <>
                     {displayNode}
                     
                     {isDropdownOpen && (
                        <>
                           {/* Click backdrop to close dropdown */}
                           <div className="fixed inset-0 z-[60] bg-transparent" onClick={() => setIsDropdownOpen(false)} />
                           
                           {/* Beautiful interactive Dropdown content */}
                           <div className="absolute top-[34px] left-1/2 -translate-x-1/2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800/80 rounded-2xl shadow-xl p-3 z-[70] animate-fadeIn space-y-2 text-left">
                              <div className="flex justify-between items-center pb-1.5 border-b border-gray-100 dark:border-gray-800">
                                 <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Breaks summary
                                 </span>
                                 <span className="text-[8px] font-black text-pink-500 bg-pink-50 dark:bg-pink-950/40 px-1.5 py-0.5 rounded-md uppercase">
                                    {activeEntries.length} active
                                 </span>
                              </div>
                              
                              {activeEntries.length > 0 ? (
                                 <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                    {activeEntries.map(([wallet, amt]) => (
                                       <div key={wallet} className="flex justify-between items-center text-[9px] bg-gray-50/60 dark:bg-gray-900/50 p-1.5 rounded-lg border border-gray-100/40 dark:border-gray-800/30">
                                          <span className="font-extrabold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                             <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b9a] shrink-0"></span>
                                             {wallet}
                                          </span>
                                          <span className="font-black text-gray-800 dark:text-gray-200 font-mono">
                                             ₱{Number(amt).toLocaleString()}
                                          </span>
                                       </div>
                                    ))}
                                 </div>
                              ) : (
                                 <div className="text-center py-2 text-[9px] text-gray-400 dark:text-gray-500 font-bold uppercase">
                                    No wallets entered
                                 </div>
                              )}
                              
                              <div className="pt-1.5 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-[9px] font-extrabold uppercase">
                                 <span className="text-gray-400 dark:text-gray-500">Total Paid:</span>
                                 <span className="text-[#ff6b9a] font-mono font-black text-xs leading-none">
                                    ₱{totalPaidFromWallets.toLocaleString()}
                                 </span>
                              </div>
                              
                              <button
                                 type="button"
                                 onClick={() => {
                                    setIsDropdownOpen(false);
                                    setIsExpanded(true); // Expands editing panel below
                                 }}
                                 className="w-full text-center py-1.5 bg-[#ff6b9a]/10 hover:bg-[#ff6b9a]/25 dark:bg-pink-950/30 dark:hover:bg-pink-900/45 text-[#ff6b9a] border border-[#ff6b9a]/25 dark:border-pink-900/30 rounded-xl transition-all text-[8.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
                              >
                                 ✏️ Edit Splits
                              </button>
                           </div>
                        </>
                     )}
                  </>
               );
            })()}
            
            <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-tighter">
               ₱{totalPaidFromWallets > 0 ? totalPaidFromWallets.toLocaleString() : localData.amountPaid.toLocaleString()} paid
            </span>
         </div>

         {/* 6. Shipping (Icon/Dropdown Compact) */}
         <div className="col-span-1 flex justify-center">
             <select 
                value={localData.shippingStatus}
                onChange={(e) => commitChange('shippingStatus', e.target.value)}
                className={`w-full bg-white/70 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/60 text-center font-extrabold text-[9px] py-1.5 rounded-xl outline-none cursor-pointer ${localData.shippingStatus === 'Shipped' ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400'}`}
             >
                 <option value="Pending" className="text-gray-900 bg-white dark:text-white dark:bg-gray-800 font-bold">Wait</option>
                 <option value="Shipped" className="text-gray-900 bg-white dark:text-white dark:bg-gray-800 font-bold">Ship</option>
                 <option value="RTS" className="text-gray-900 bg-white dark:text-white dark:bg-gray-800 font-bold">RTS</option>
                 <option value="Cancelled" className="text-gray-900 bg-white dark:text-white dark:bg-gray-800 font-bold">Cancel</option>
             </select>
          </div>

          {/* 7. Actions */}
         <div className="col-span-1 flex justify-center gap-1">
            <button 
               onClick={onViewLogs}
               className="text-gray-400 hover:text-blue-500 transition-colors w-5 h-5 flex items-center justify-center"
               title="Logs"
            >
               📜
            </button>
            <button 
               onClick={onDelete}
               className="text-gray-400 hover:text-red-500 transition-colors w-5 h-5 flex items-center justify-center"
               title="Delete"
            >
               🗑️
            </button>
         </div>
      </div>

      {/* Expanded Split Payment Allocation Panel */}
      {isExpanded && (
         <div className="p-4 bg-gray-50/90 dark:bg-gray-800/90 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 mx-1 mt-1 space-y-4 animate-scaleUp shadow-lg">
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-700/80">
               <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-100 flex items-center gap-1">
                     💰 Wallet Splits (Receipt Entries)
                  </h4>
                  <p className="text-[9px] text-gray-400 dark:text-gray-400 font-bold uppercase mt-0.5">
                     Specify exact payment entry per wallet. Adjusts status automatically.
                  </p>
               </div>
               <button 
                  type="button" 
                  onClick={() => setIsExpanded(false)}
                  className="text-[9px] font-black text-[#ff6b9a] hover:text-[#ff6b9a]/90 uppercase bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/20 px-2.5 py-1.5 rounded-xl transition-all"
               >
                  Done ×
               </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
               {['GCash', 'Maya', 'TikTok Checkout', 'GoTyme', 'SeaBank', 'BPI', 'Cash'].map(walletName => {
                  const val = localData.walletPayments[walletName] || '';
                  return (
                     <div key={walletName} className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col justify-between">
                        <span className="text-[8.5px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 font-mono">
                           {walletName}
                        </span>
                        <div className="flex items-center gap-1">
                           <span className="text-[9px] font-black text-gray-400 dark:text-gray-500">₱</span>
                           <input 
                              type="number"
                              placeholder="0"
                              min="0"
                              value={val}
                              onChange={(e) => handleWalletPaymentChange(walletName, e.target.value)}
                              className="w-full bg-transparent py-0.5 font-black text-xs text-gray-900 dark:text-white outline-none"
                           />
                           <button 
                              type="button"
                              onClick={() => handleSetFullWallet(walletName)}
                              className="px-1.5 py-0.5 rounded-lg text-[8.5px] font-black uppercase tracking-wide bg-pink-100/15 hover:bg-pink-100 dark:bg-pink-950/40 text-[#ff6b9a] transition-all"
                              title="Set remaining balance to this wallet"
                           >
                              Full
                           </button>
                        </div>
                     </div>
                  );
               })}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2.5 border-t border-dotted border-gray-200 dark:border-gray-700/80 text-[10px]">
               <div className="flex flex-wrap gap-4 font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none">
                  <span>Total Due: <strong className="text-gray-800 dark:text-white">₱{order.totalPrice.toLocaleString()}</strong></span>
                  <span>Paid: <strong className="text-[#ff6b9a]">₱{totalPaidFromWallets.toLocaleString()}</strong></span>
                  <span>Remaining: <strong className={order.totalPrice - totalPaidFromWallets > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'}>
                     ₱{Math.max(0, order.totalPrice - totalPaidFromWallets).toLocaleString()}
                  </strong></span>
               </div>
               
               <div className="mt-2.5 sm:mt-0 flex gap-2 w-full sm:w-auto shrink-0">
                  <button 
                    type="button"
                    onClick={() => {
                       setLocalData(prev => ({ ...prev, walletPayments: {}, amountPaid: 0, paymentStatus: PaymentStatus.UNPAID }));
                       onUpdate({ ...order, walletPayments: undefined, amountPaid: 0, paymentStatus: PaymentStatus.UNPAID, shippingStatus: localData.shippingStatus, referenceNumber: localData.referenceNumber }, "Reset all wallet payments to 0");
                    }}
                    className="text-[8.5px] font-black uppercase tracking-wider text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 px-3 py-1.5 rounded-xl transition-all"
                  >
                     Reset All
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                       handleSetFullWallet('Cash');
                    }}
                    className="text-[8.5px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-[#10b980]/20 dark:text-[#34d399] px-3 py-1.5 rounded-xl transition-all"
                  >
                     Receive Full Cash
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

const HistoryModal = ({ order, onClose }: { order: GroupedOrder, onClose: () => void }) => {
  const displayName = useMemo(() => {
    const product = db.getProducts().find(p => p.id === order.productId);
    const baleObj = product ? db.getBales().find(b => b.id === product.baleBatch) : null;
    return baleObj ? baleObj.name : (order.customerUsername === 'Live-Summary' ? 'Consolidated Live Sale' : `@${order.customerUsername}`);
  }, [order.productId, order.customerUsername]);

  // Calculate logs based on grouped items
  const uniqueLogs = useMemo(() => {
     if (!order.items) return [];
     const allLogs: string[] = [];
     order.items.forEach((o: Order) => {
         if (o.logs) allLogs.push(...o.logs);
     });
     const uniqueSet = Array.from(new Set(allLogs));
     return uniqueSet.sort((a, b) => {
         const getDate = (s: string) => {
            const match = s.match(/^\[(.*?)\]/);
            return match ? new Date(match[1]).getTime() : 0;
         };
         return getDate(b) - getDate(a);
     });
  }, [order]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-fadeIn">
       <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleUp max-h-[80vh] flex flex-col">
          <div className="bg-pawSoftBlue dark:bg-slate-700 p-6 flex justify-between items-center shrink-0">
             <div>
                <h3 className="text-xl font-black text-blue-950 dark:text-blue-100 uppercase tracking-tight">Audit Log</h3>
                <p className="text-xs font-bold text-blue-500 dark:text-blue-300">{displayName}</p>
             </div>
             <button onClick={onClose} className="bg-white dark:bg-gray-600 text-blue-900 dark:text-blue-100 w-8 h-8 rounded-full font-black flex items-center justify-center shadow-sm">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-50 dark:bg-gray-900">
             {uniqueLogs.length === 0 ? (
                <p className="text-center text-gray-400 text-xs py-10 font-bold uppercase tracking-widest">No history available</p>
             ) : uniqueLogs.map((log: string, i: number) => (
                <LogItem key={i} log={log} />
             ))}
          </div>
       </div>
    </div>, document.body
  );
};

const DeleteOrderConfirmationModal = ({ customer, onConfirm, onClose }: { customer: string, onConfirm: () => void, onClose: () => void }) => (
    createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 text-center animate-scaleUp shadow-2xl border-4 border-red-500">
         <div className="bg-red-100 dark:bg-red-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-5xl">🗑️</span></div>
         <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
            Delete Orders?
         </h3>
         <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8 leading-relaxed">
            Removing all visible orders for <span className="text-red-600 dark:text-red-400">{customer}</span> in this session.
         </p>
         <div className="flex gap-3">
             <button onClick={onClose} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-black uppercase text-xs tracking-widest rounded-2xl active:scale-95 transition-all">Cancel</button>
             <button onClick={onConfirm} className="flex-1 py-4 bg-red-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-red-200 active:scale-95 transition-all">
                Delete
             </button>
         </div>
      </div>
    </div>, document.body
  )
);

export default Orders;
