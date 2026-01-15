
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { supabase } from '../services/supabaseClient';
import { Customer, Order, PaymentStatus } from '../types';

const Customers: React.FC = () => {
  const [customers, setCustomers] = useState(db.getCustomers());
  const [allOrders, setAllOrders] = useState(db.getOrders());
  const [search, setSearch] = useState('');
  const [viewingHistory, setViewingHistory] = useState<Customer | null>(null);

  // Real-time updates
  useEffect(() => {
    // Initial Load
    setCustomers(db.getCustomers());
    setAllOrders(db.getOrders());

    // 1. Subscribe to Customers
    const custChannel = supabase
      .channel('customers_list_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
             const updated = payload.new as Customer;
             
             // Update Local Storage
             const current = db.getCustomers();
             const index = current.findIndex(c => c.id === updated.id);
             if (index > -1) current[index] = updated;
             else current.push(updated);
             localStorage.setItem('paw_customers', JSON.stringify(current));

             // Update State
             setCustomers(prev => {
                const idx = prev.findIndex(c => c.id === updated.id);
                if (idx > -1) {
                   const next = [...prev];
                   next[idx] = updated;
                   return next;
                }
                return [updated, ...prev];
             });
          }
        }
      )
      .subscribe();

    // 2. Subscribe to Orders (to recalc stats dynamically)
    const orderChannel = supabase
      .channel('orders_list_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
           // Fetch latest orders to ensure stats are accurate
           supabase.from('orders').select('*').then(({ data }) => {
              if (data) {
                 const newOrders = data as Order[];
                 localStorage.setItem('paw_orders', JSON.stringify(newOrders));
                 setAllOrders(newOrders);
              }
           });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(custChannel);
      supabase.removeChannel(orderChannel);
    };
  }, []);

  // Calculate dynamic stats from actual orders
  // This ensures that "Total Spent" matches the "History" exactly
  const processedCustomers = useMemo(() => {
     // Map of normalized username -> stats
     const stats: Record<string, { spent: number, count: number }> = {};
     
     allOrders.forEach(o => {
        // Skip cancelled orders for stats
        if (o.shippingStatus === 'Cancelled') return;

        const u = o.customerUsername.toLowerCase().trim();
        if (!stats[u]) stats[u] = { spent: 0, count: 0 };
        stats[u].spent += o.totalPrice;
        stats[u].count += o.quantity;
     });

     return customers
       .map(c => {
          const u = c.username.toLowerCase().trim();
          const s = stats[u] || { spent: 0, count: 0 };
          // Override database aggregates with calculated values for display
          return {
             ...c,
             totalSpent: s.spent,
             orderCount: s.count
          };
       })
       .filter(c => c.username.toLowerCase().includes(search.toLowerCase()))
       .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customers, allOrders, search]);

  const toggleVIP = (customer: Customer) => {
    const updated = { ...customer, isVIP: !customer.isVIP };
    db.updateCustomer(updated);
    setCustomers(db.getCustomers());
  };

  const toggleBlacklist = (customer: Customer) => {
    const updated = { ...customer, isBlacklisted: !customer.isBlacklisted };
    db.updateCustomer(updated);
    setCustomers(db.getCustomers());
  };

  return (
    <div className="space-y-6 px-2 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Customer Profiles</h1>
      </div>

      <div className="relative">
        <input 
          type="text" 
          placeholder="Search by TikTok username..." 
          className="w-full bg-white dark:bg-gray-800 border-2 border-transparent focus:border-pawPinkDark rounded-[1.2rem] p-5 shadow-sm font-bold text-gray-600 dark:text-white placeholder:text-gray-300 outline-none transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-4 pb-20">
        {processedCustomers.map(c => (
          <div key={c.id} className={`rounded-[2rem] p-6 border-2 transition-all shadow-sm group hover:shadow-md ${
            c.isBlacklisted 
              ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50' 
              : 'bg-white dark:bg-gray-800 border-pawPink dark:border-gray-700'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center font-black text-2xl shadow-sm shrink-0 ${
                  c.isBlacklisted ? 'bg-red-200 dark:bg-red-800 text-red-600 dark:text-white' :
                  c.isVIP ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-white' : 
                  'bg-pawPink dark:bg-pink-900/50 text-pawPinkDark dark:text-pink-300'
                }`}>
                  {c.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-xl font-black text-gray-800 dark:text-white tracking-tight">@{c.username}</h3>
                    {c.isVIP && <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-black px-2 py-1 rounded-md uppercase tracking-wider">VIP</span>}
                    {c.isBlacklisted && <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-black px-2 py-1 rounded-md uppercase tracking-wider">Blacklisted</span>}
                  </div>
                  <div className="flex flex-col gap-1 text-xs font-bold text-gray-400 dark:text-gray-500">
                    <div className="flex gap-3">
                        <span>{c.orderCount} Orders</span>
                        <span>₱{c.totalSpent.toLocaleString()} Spent</span>
                    </div>
                    {c.isVIP && (
                        <span className="text-yellow-600 dark:text-yellow-500">🎟️ {c.vipTickets || 0} VIP Tickets Available</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end mt-2 lg:mt-0">
                <button 
                  onClick={() => setViewingHistory(c)}
                  className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 bg-pawSoftBlue dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex-1 lg:flex-none text-center"
                >
                  📜 History
                </button>
                <button 
                  onClick={() => toggleVIP(c)}
                  className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex-1 lg:flex-none text-center ${
                    c.isVIP 
                      ? 'bg-yellow-400 text-white shadow-lg shadow-yellow-100 dark:shadow-none hover:bg-yellow-500' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {c.isVIP ? 'Revoke VIP' : 'Make VIP'}
                </button>
                <button 
                  onClick={() => toggleBlacklist(c)}
                  className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex-1 lg:flex-none text-center ${
                    c.isBlacklisted 
                      ? 'bg-red-500 text-white shadow-lg shadow-red-100 dark:shadow-none hover:bg-red-600' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {c.isBlacklisted ? 'Whitelist' : 'Blacklist'}
                </button>
              </div>
            </div>
          </div>
        ))}
        {processedCustomers.length === 0 && (
           <div className="text-center py-12 opacity-50">
             <div className="text-4xl mb-2">👥</div>
             <p className="font-bold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-widest">No customers found</p>
           </div>
        )}
      </div>
      
      {viewingHistory && (
        <CustomerHistoryModal 
           customer={viewingHistory} 
           onClose={() => setViewingHistory(null)} 
        />
      )}
    </div>
  );
};

interface HistoryItem {
  name: string;
  qty: number;
  price: number;
  isFreebie: boolean;
}

interface HistoryGroup {
  sessionId: string;
  sessionName: string;
  date: number;
  totalItems: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  items: HistoryItem[];
}

const CustomerHistoryModal: React.FC<{ customer: Customer; onClose: () => void }> = ({ customer, onClose }) => {
  const sessions = db.getSessions();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  
  // Use DB data directly for initial state to avoid flicker
  const [localOrders, setLocalOrders] = useState<Order[]>(db.getOrders());

  useEffect(() => {
     const channel = supabase
      .channel(`orders_history_${customer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          supabase.from('orders').select('*').then(({ data }) => {
             if (data) {
                 const newOrders = data as Order[];
                 localStorage.setItem('paw_orders', JSON.stringify(newOrders));
                 setLocalOrders(newOrders);
             }
          });
      })
      .subscribe();
      
      return () => { supabase.removeChannel(channel); };
  }, [customer.id]);

  const history = useMemo(() => {
     const targetUsername = customer.username.toLowerCase().trim();
     
     const userOrders = localOrders.filter(o => {
        // Exclude cancelled orders from history view too
        if (o.shippingStatus === 'Cancelled') return false;
        return o.customerUsername.toLowerCase().trim() === targetUsername;
     });
     
     const groups: Record<string, HistoryGroup> = {};
     
     userOrders.forEach(order => {
        if (!groups[order.sessionId]) {
           const session = sessions.find(s => s.id === order.sessionId);
           const name = session ? session.name : (order.sessionId === 'OFF_LIVE' ? 'Manual Encoding' : 'Unknown Session');
           
           groups[order.sessionId] = {
              sessionId: order.sessionId,
              sessionName: name,
              date: order.createdAt,
              totalItems: 0,
              totalAmount: 0,
              paymentStatus: order.paymentStatus, 
              items: [] 
           };
        }
        groups[order.sessionId].totalItems += order.quantity;
        groups[order.sessionId].totalAmount += order.totalPrice;
        
        groups[order.sessionId].items.push({
           name: order.productName,
           qty: order.quantity,
           price: order.totalPrice,
           isFreebie: order.isFreebie
        });

        if (order.createdAt > groups[order.sessionId].date) {
            groups[order.sessionId].date = order.createdAt;
        }
     });

     return Object.values(groups).sort((a, b) => b.date - a.date);
  }, [customer, localOrders, sessions]);

  const toggleSession = (sessionId: string) => {
    const next = new Set(expandedSessions);
    if (next.has(sessionId)) next.delete(sessionId);
    else next.add(sessionId);
    setExpandedSessions(next);
  };

  // Re-calculate the customer total stats purely for display in the Modal header 
  // to ensure it matches the history list perfectly
  const modalStats = useMemo(() => {
      const totalSpent = history.reduce((sum, h) => sum + h.totalAmount, 0);
      const totalOrders = history.reduce((sum, h) => sum + h.totalItems, 0);
      return { totalSpent, totalOrders };
  }, [history]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleUp flex flex-col max-h-[85vh] border-4 border-transparent dark:border-gray-700">
        <div className="bg-pawSoftBlue dark:bg-slate-700 p-8 shrink-0 relative">
           <button onClick={onClose} className="absolute top-6 right-6 bg-white/50 dark:bg-gray-600/50 hover:bg-white dark:hover:bg-gray-600 text-blue-900 dark:text-blue-100 w-10 h-10 rounded-full font-black flex items-center justify-center transition-all">✕</button>
           
           <div className="flex items-center gap-4 mb-2">
             <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 flex items-center justify-center font-black text-xl shadow-sm">
                {customer.username.charAt(0).toUpperCase()}
             </div>
             <div>
                <h3 className="text-xl font-black text-blue-950 dark:text-blue-100 uppercase tracking-tight">Purchase History</h3>
                <p className="text-blue-800 dark:text-blue-300 font-bold">@{customer.username}</p>
             </div>
           </div>
           
           <div className="flex gap-4 mt-6">
              <div className="bg-white/60 dark:bg-gray-600/50 rounded-xl p-3 flex-1">
                 <p className="text-[9px] font-black text-blue-900 dark:text-blue-200 uppercase tracking-widest">Lifetime Spend</p>
                 <p className="text-lg font-black text-blue-950 dark:text-white">₱{modalStats.totalSpent.toLocaleString()}</p>
              </div>
              <div className="bg-white/60 dark:bg-gray-600/50 rounded-xl p-3 flex-1">
                 <p className="text-[9px] font-black text-blue-900 dark:text-blue-200 uppercase tracking-widest">Total Orders</p>
                 <p className="text-lg font-black text-blue-950 dark:text-white">{modalStats.totalOrders}</p>
              </div>
           </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-3">
           {history.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                 <p className="font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-widest">No history recorded</p>
              </div>
           ) : history.map((session) => {
              const isExpanded = expandedSessions.has(session.sessionId);
              return (
                <div key={session.sessionId} className="bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 rounded-[2rem] hover:border-pawPink dark:hover:border-pawPink transition-all group overflow-hidden">
                   <button 
                     onClick={() => toggleSession(session.sessionId)}
                     className="w-full text-left p-5 flex justify-between items-start"
                   >
                      <div>
                         <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">
                           {new Date(session.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                         </p>
                         <h4 className="font-black text-gray-800 dark:text-white text-lg leading-tight group-hover:text-pawPinkDark transition-colors">
                            {session.sessionName}
                         </h4>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-[10px] font-black px-2 py-1 rounded-lg uppercase mb-1">
                            {session.totalItems} Items
                         </span>
                         <span className={`text-gray-300 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                      </div>
                   </button>
                   
                   {/* Dropdown breakdown */}
                   {isExpanded && (
                      <div className="bg-gray-50 dark:bg-gray-800 border-t border-dashed border-gray-200 dark:border-gray-600 p-4 space-y-2 animate-fadeIn">
                        {session.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                             <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-800 dark:text-gray-200">{item.qty}x</span>
                                <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                                {item.isFreebie && <span className="text-[9px] bg-orange-100 text-orange-600 px-1 rounded uppercase font-black">Free</span>}
                             </div>
                             <span className="font-black text-gray-800 dark:text-gray-200">₱{item.price.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                   )}
                   
                   <div className="flex justify-between items-end p-5 pt-0 mt-2">
                      <span className="text-[10px] font-black text-gray-300 dark:text-gray-400 uppercase tracking-widest">Total Amount</span>
                      <span className="text-xl font-black text-gray-800 dark:text-white">₱{session.totalAmount.toLocaleString()}</span>
                   </div>
                </div>
              );
           })}
        </div>
      </div>
    </div>, document.body
  );
};

export default Customers;
