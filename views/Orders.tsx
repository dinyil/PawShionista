
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { Order, PaymentStatus, ShippingStatus, LiveSession, PaymentMethod } from '../types';
import { CartIcon, SearchIcon, PawIcon } from '../components/Icons';

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


const Orders: React.FC = () => {
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  const [orderFilter, setOrderFilter] = useState('All'); // Filter inside a session
  
  // -- Session List State --
  const [sessionSearch, setSessionSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'All' | 'Today' | 'Week' | 'Month' | 'Custom'>('All');
  const [customDate, setCustomDate] = useState('');

  const [selectedOrder, setSelectedOrder] = useState<GroupedOrder | null>(null);
  const [allOrders, setAllOrders] = useState(db.getOrders());
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
       
       // Helper to check same day
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
      const key = o.customerUsername;
      if (!groups[key]) {
        groups[key] = { 
            ...o, 
            ids: [o.id], 
            items: [o],
            isCustomerVIP: vipMap.get(o.customerUsername) || false
        };
      } else {
        groups[key].quantity += o.quantity;
        groups[key].totalPrice += o.totalPrice;
        groups[key].amountPaid += o.amountPaid;
        groups[key].ids.push(o.id);
        groups[key].items.push(o);
        // Combine logs if any
        if (o.logs) {
           groups[key].logs = [...(groups[key].logs || []), ...o.logs];
        }
      }
    });

    return Object.values(groups).filter(g => {
      if (orderFilter === 'Unpaid') return g.paymentStatus !== PaymentStatus.PAID; // Includes Unpaid and Partial
      if (orderFilter === 'Paid') return g.paymentStatus === PaymentStatus.PAID;
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [allOrders, selectedSession, orderFilter, customers]);

  const handleUpdate = (updated: GroupedOrder, newLog?: string) => {
    updated.ids.forEach(id => {
       const original = db.getOrders().find(o => o.id === id);
       if (original) {
          let newItemPaidAmount = 0;
          
          if (updated.paymentStatus === PaymentStatus.PAID) {
              // Exact match for full payment
              newItemPaidAmount = original.totalPrice;
          } else if (updated.paymentStatus === PaymentStatus.UNPAID) {
              newItemPaidAmount = 0;
          } else {
              // Distribute proportional amount for Partial
              const totalGroupPrice = updated.items.reduce((sum, i) => sum + i.totalPrice, 0);
              const inputAmount = updated.amountPaid;
              const ratio = totalGroupPrice > 0 ? (inputAmount / totalGroupPrice) : 0;
              newItemPaidAmount = original.totalPrice * ratio;
          }

          // Append Log
          const updatedLogs = original.logs ? [...original.logs] : [];
          if (newLog) updatedLogs.push(newLog);

          db.updateOrder({ 
              ...original, 
              paymentStatus: updated.paymentStatus, 
              shippingStatus: updated.shippingStatus, 
              paymentMethod: updated.paymentMethod,
              referenceNumber: updated.referenceNumber,
              amountPaid: newItemPaidAmount,
              logs: updatedLogs
          });
       }
    });
    setAllOrders(db.getOrders());
    setSelectedOrder(null);
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
             const sessionItems = sessionOrders.reduce((sum, o) => sum + o.quantity, 0); // Correctly sum quantity
             
             return (
               <button key={s.id} onClick={() => setSelectedSession(s)} className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-6 border-2 border-transparent hover:border-pawPink dark:hover:border-gray-600 transition-all shadow-sm hover:shadow-xl group text-left flex flex-col h-full relative overflow-hidden">
                  
                  {/* Decorative Background */}
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
    <div className="space-y-6 pb-24 px-1 animate-fadeIn">
      <button onClick={() => setSelectedSession(null)} className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:text-pawPinkDark hover:border-pawPink transition-all">
        <span>← Back to Sessions</span>
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-sm border-2 border-pawPink/20 dark:border-gray-700 mb-6 relative overflow-hidden transition-colors">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <span className="text-[10px] font-black bg-pawPinkDark text-white px-2 py-0.5 rounded uppercase tracking-wider">{selectedSession.date}</span>
               {selectedSession.isOpen && <span className="text-[10px] font-black bg-red-100 dark:bg-red-900/50 text-red-500 dark:text-red-300 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">Live</span>}
            </div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight leading-none">{selectedSession.name}</h1>
          </div>
          
          <div className="flex bg-gray-50 dark:bg-gray-700 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-600">
            {['All', 'Unpaid', 'Paid'].map(f => (
              <button key={f} onClick={() => setOrderFilter(f)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all tracking-wider ${orderFilter === f ? 'bg-pawPinkDark text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-100'}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-pawPink/20 dark:from-gray-700/30 to-transparent rounded-full -mr-20 -mt-20 pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.length === 0 ? (
           <div className="col-span-full text-center py-20 opacity-50">
             <div className="text-4xl mb-2">🔍</div>
             <p className="font-bold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-widest">No orders found for this filter</p>
           </div>
        ) : filteredOrders.map(group => (
          <div key={group.ids[0]} className="bg-white dark:bg-gray-800 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:border-pawPink transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-pawSoftBlue dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center font-black text-xs">
                      {group.customerUsername.charAt(0).toUpperCase()}
                    </div>
                    <h4 className="font-black text-gray-800 dark:text-white text-lg tracking-tight leading-none">@{group.customerUsername}</h4>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {group.isCustomerVIP && (
                      <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">VIP</span>
                    )}
                    <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase bg-gray-50 dark:bg-gray-700 px-2 py-0.5 rounded">{group.quantity} items</p>
                  </div>
               </div>
               <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${group.paymentStatus === 'Paid' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>{group.paymentStatus}</span>
            </div>
            
            {/* Warning for Pending Shipping */}
            {group.shippingStatus === ShippingStatus.PENDING && (
              <div className="mb-3 inline-flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-lg border border-orange-100 dark:border-orange-800">
                  <span className="text-xs">📦</span>
                  <span className="text-[10px] font-black text-orange-600 dark:text-orange-300 uppercase tracking-wider">To Ship</span>
              </div>
            )}
            
            <div className="flex justify-between items-end mb-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl">
               <span className="text-[10px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Total</span>
               <p className="text-2xl font-black text-gray-800 dark:text-white leading-none">₱{group.totalPrice.toLocaleString()}</p>
            </div>
            
            <button onClick={() => setSelectedOrder(group)} className="w-full py-4 bg-gray-900 dark:bg-black text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all group-hover:bg-pawPinkDark">Manage Order</button>
          </div>
        ))}
      </div>
      {selectedOrder && <StatusModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onSave={handleUpdate} />}
    </div>
  );
};

const StatusModal = ({ order, onClose, onSave }: any) => {
  // order is a GroupedOrder containing total values. 
  const [formData, setFormData] = useState({
      ...order,
      paymentMethod: order.paymentMethod || PaymentMethod.GCASH,
      referenceNumber: order.referenceNumber || '',
      amountPaid: order.amountPaid || 0 
  });

  // Calculate unique logs from the group
  const uniqueLogs = useMemo(() => {
     if (!order.items) return [];
     const allLogs: string[] = [];
     order.items.forEach((o: Order) => {
         if (o.logs) allLogs.push(...o.logs);
     });
     
     // Deduplicate based on string content
     const uniqueSet = Array.from(new Set(allLogs));
     
     // Sort by Date extracted from string "[Date] Content" (Newest first)
     return uniqueSet.sort((a, b) => {
         const getDate = (s: string) => {
            const match = s.match(/^\[(.*?)\]/);
            return match ? new Date(match[1]).getTime() : 0;
         };
         return getDate(b) - getDate(a);
     });
  }, [order]);

  const remainingBalance = Math.max(0, order.totalPrice - formData.amountPaid);

  const handleAmountChange = (val: string) => {
      const newAmount = val === '' ? 0 : parseFloat(val);
      let newStatus = PaymentStatus.UNPAID;
      
      if (newAmount <= 0) {
          newStatus = PaymentStatus.UNPAID;
      } else if (newAmount >= order.totalPrice) {
          newStatus = PaymentStatus.PAID;
      } else {
          newStatus = PaymentStatus.PARTIAL;
      }

      setFormData((prev: any) => ({
          ...prev,
          amountPaid: newAmount,
          paymentStatus: newStatus
      }));
  };

  const handleStatusChange = (newStatus: string) => {
      let newAmount = formData.amountPaid;

      if (newStatus === PaymentStatus.PAID) {
          newAmount = order.totalPrice;
      } else if (newStatus === PaymentStatus.UNPAID) {
          newAmount = 0;
      }

      setFormData((prev: any) => ({
          ...prev,
          paymentStatus: newStatus as PaymentStatus,
          amountPaid: newAmount
      }));
  };

  const handleFullPayment = () => {
      handleStatusChange(PaymentStatus.PAID);
  };

  const handleSaveClick = () => {
      // Generate Audit Log string
      const changes: string[] = [];
      const dateStr = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

      if (formData.paymentStatus !== order.paymentStatus) {
          changes.push(`Status: ${order.paymentStatus} -> ${formData.paymentStatus}`);
      }
      if (formData.amountPaid !== order.amountPaid) {
          changes.push(`Paid: ₱${order.amountPaid} -> ₱${formData.amountPaid}`);
      }
      if (formData.shippingStatus !== order.shippingStatus) {
          changes.push(`Shipping: ${order.shippingStatus} -> ${formData.shippingStatus}`);
      }
      if (formData.referenceNumber !== order.referenceNumber) {
          changes.push(`Ref: ${order.referenceNumber || 'None'} -> ${formData.referenceNumber}`);
      }
      
      const logString = changes.length > 0 ? `[${dateStr}] ${changes.join(', ')}` : undefined;
      
      onSave(formData, logString);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-4xl rounded-t-[3rem] md:rounded-[3rem] overflow-hidden shadow-2xl animate-scaleUp max-h-[90vh] flex flex-col md:flex-row border-4 border-transparent dark:border-gray-700">
        
        {/* Left: Form */}
        <div className="flex-1 flex flex-col">
            <div className="bg-pawPink dark:bg-gray-700 p-8 shrink-0">
                <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Order Update</h3>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-white font-black text-sm">@{order.customerUsername}</p>
                    {order.isCustomerVIP && <span className="text-[9px] font-black bg-white dark:bg-gray-600 text-pawPinkDark dark:text-pink-300 px-1.5 rounded uppercase">VIP</span>}
                </div>
            </div>
            <div className="p-8 space-y-4 overflow-y-auto custom-scrollbar flex-1">
            {/* Payment Status & Details */}
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-2 tracking-widest">Payment Status</label>
                    <select 
                        value={formData.paymentStatus} 
                        onChange={(e) => handleStatusChange(e.target.value)} 
                        className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-2xl font-black mt-1 text-gray-800 dark:text-white outline-none border-2 border-transparent focus:border-pawPinkDark"
                    >
                    {Object.values(PaymentStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                
                <div>
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-2 tracking-widest">Method</label>
                    <select value={formData.paymentMethod} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})} className="w-full bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 focus:border-pawPinkDark p-4 rounded-2xl font-bold mt-1 text-gray-800 dark:text-white outline-none appearance-none">
                    {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                <div>
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-2 tracking-widest">Ref No.</label>
                    <input 
                        type="text" 
                        placeholder="Optional" 
                        value={formData.referenceNumber} 
                        onChange={(e) => setFormData({...formData, referenceNumber: e.target.value})} 
                        className="w-full bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 focus:border-pawPinkDark p-4 rounded-2xl font-bold mt-1 text-gray-800 dark:text-white outline-none" 
                    />
                </div>

                <div className="col-span-2 bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl border border-gray-100 dark:border-gray-600">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Amount Paid</label>
                        <button onClick={handleFullPayment} className="text-[9px] font-black text-blue-600 dark:text-blue-300 uppercase bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded hover:bg-blue-100 transition-colors">Set Full</button>
                    </div>
                    <div className="flex items-center">
                        <span className="text-gray-400 dark:text-gray-500 font-black text-lg mr-2">₱</span>
                        <input 
                            type="number" 
                            value={formData.amountPaid === 0 ? '' : formData.amountPaid} 
                            placeholder="0"
                            onChange={(e) => handleAmountChange(e.target.value)} 
                            className="w-full bg-transparent font-black text-2xl text-gray-900 dark:text-white outline-none placeholder:text-gray-300" 
                        />
                    </div>
                    <div className="mt-2 text-right">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase">Total Due: ₱{order.totalPrice.toLocaleString()}</span>
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-2 tracking-widest">Shipping Status</label>
                    <select value={formData.shippingStatus} onChange={(e) => setFormData({...formData, shippingStatus: e.target.value})} className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-2xl font-black mt-1 text-gray-800 dark:text-white outline-none border-2 border-transparent focus:border-pawPinkDark">
                    {Object.values(ShippingStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex gap-4 pt-4 mt-auto">
                <button onClick={onClose} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 font-black rounded-2xl uppercase text-xs tracking-widest">Cancel</button>
                <button onClick={handleSaveClick} className="flex-1 py-4 bg-pawPinkDark text-white font-black rounded-2xl shadow-lg uppercase text-xs tracking-widest hover:bg-red-400">Save Changes</button>
            </div>
            </div>
        </div>

        {/* Right: Audit Log & Info */}
        <div className="w-full md:w-80 bg-gray-50 dark:bg-gray-900 border-l border-gray-100 dark:border-gray-700 p-6 flex flex-col">
            {/* Balance Card */}
            {remainingBalance > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 p-5 rounded-2xl border border-red-100 dark:border-red-900/50 mb-6 text-center animate-shake">
                    <p className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">Remaining Balance</p>
                    <p className="text-2xl font-black text-red-700 dark:text-red-300">₱{remainingBalance.toLocaleString()}</p>
                    <p className="text-[9px] font-bold text-red-400 mt-1">Needs Payment</p>
                </div>
            )}
            
            <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Audit Log</h4>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0 pr-1 pt-2">
                {uniqueLogs.length === 0 ? (
                    <div className="text-center py-10 opacity-40">
                        <span className="text-4xl grayscale">📜</span>
                        <p className="mt-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">No history recorded</p>
                    </div>
                ) : uniqueLogs.map((log, idx) => (
                    <LogItem key={idx} log={log} />
                ))}
            </div>
        </div>

      </div>
    </div>, document.body
  );
};

export default Orders;
