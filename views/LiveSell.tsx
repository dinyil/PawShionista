import React, { useState, useMemo } from 'react';
import { db } from '../services/dbService';
import { useSettings } from '../services/SettingsContext';
import { LiveSession, Bale, Order, PaymentStatus, ShippingStatus, Product } from '../types';
import { supabase } from '../services/supabaseClient';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  ShoppingBag, 
  DollarSign, 
  Check, 
  X, 
  AlertTriangle,
  Search,
  Sparkles,
  TrendingUp,
  Archive,
  Layers
} from 'lucide-react';

const DEBOUNCE_TIME = 1500;

const LiveSell: React.FC = () => {
  const { logoUrl } = useSettings();
  
  // Basic states
  const [dataTick, setDataTick] = useState(0); 
  const [sessionSearch, setSessionSearch] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'delete' | 'error'>('success');

  // Trigger feedback toasts
  const triggerToast = (msg: string, type: 'success' | 'delete' | 'error' = 'success') => {
    setFeedback(msg);
    setFeedbackType(type);
    setTimeout(() => {
      setFeedback(null);
    }, DEBOUNCE_TIME);
  };

  // Raw sessions from db
  const allSessions = useMemo(() => {
    return db.getSessions().sort((a, b) => b.id.localeCompare(a.id));
  }, [dataTick]);

  // Orders inside the system to analyze details or totals
  const allOrders = useMemo(() => {
    return db.getOrders();
  }, [dataTick]);

  // Bales list
  const allBales = useMemo(() => {
    return db.getBales();
  }, [dataTick]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return allSessions.filter(s => 
      s.name.toLowerCase().includes(sessionSearch.toLowerCase()) ||
      s.date.toLowerCase().includes(sessionSearch.toLowerCase())
    );
  }, [allSessions, sessionSearch]);

  // High-level KPI aggregates
  const totals = useMemo(() => {
    const totalRevenue = allSessions.reduce((sum, s) => sum + s.totalSales, 0);
    const totalItems = allSessions.reduce((sum, s) => sum + s.totalOrders, 0);
    return {
      sessionsCount: allSessions.length,
      revenue: totalRevenue,
      itemsSold: totalItems
    };
  }, [allSessions]);

  // Resolve which Bales are linked to a specific session (by looking up its orders and product-bale relation)
  const getSessionBales = (sessionId: string): string[] => {
    const sessionOrders = allOrders.filter(o => o.sessionId === sessionId);
    const baleIds = new Set<string>();
    sessionOrders.forEach(order => {
      const prod = db.getProducts().find(p => p.id === order.productId);
      if (prod && prod.baleBatch) {
        baleIds.add(prod.baleBatch);
      }
    });

    return Array.from(baleIds).map(bId => {
      const b = allBales.find(x => x.id === bId);
      return b ? b.name : bId;
    });
  };

  // --- SAVE OPERATION ---
  const handleSaveDirectSession = async (payload: {
    name: string;
    date: string;
    totalSales: number;
    totalQty: number;
    selectedBaleIds: string[];
    baleDetails?: { baleId: string; qty: number; sales: number }[];
  }) => {
    try {
      const timestamp = Date.now();
      const sessionId = `s_${timestamp}`;
      const sessionDate = new Date(payload.date).toLocaleDateString('en-US');

      // 1. Create closed LiveSession
      const newSession: LiveSession = {
        id: sessionId,
        name: payload.name.trim() || `Live Sale - ${sessionDate}`,
        date: sessionDate,
        totalSales: payload.totalSales,
        totalOrders: payload.totalQty,
        isOpen: false
      };

      // Push to LocalStorage session list
      const sessions = db.getSessions();
      sessions.push(newSession);
      localStorage.setItem('paw_sessions', JSON.stringify(sessions));

      // Sync LiveSession to Supabase
      await supabase.from('live_sessions').insert(newSession);

      // 2. Distribute based on precise per-bale breakdown
      if (payload.baleDetails && payload.baleDetails.length > 0) {
        const summaryCustomer = db.getOrCreateCustomer('Live-Summary');

        for (const detail of payload.baleDetails) {
          const { baleId, qty: qtyForBale, sales: salesForBale } = detail;

          if (qtyForBale > 0) {
            // Helper deterministic product ID for this specific live selling on this bale
            const prodId = `prod_live_bale_${baleId}`;
            const existingProd = db.getProducts().find(p => p.id === prodId);

            if (!existingProd) {
              const newProd: Product = {
                id: prodId,
                name: `Live Items Sold`,
                brand: 'Live',
                baleBatch: baleId,
                costPrice: 0,
                sellingPrice: qtyForBale > 0 ? (salesForBale / qtyForBale) : 0,
                stock: 9999
              };
              db.updateProduct(newProd);
            }

            // Create consolidate sale Order for this bale in the session
            const newOrder: Order = {
              id: `o_live_summary_${timestamp}_${baleId}`,
              sessionId: sessionId,
              customerId: summaryCustomer.id,
              customerUsername: 'Live-Summary',
              productId: prodId,
              productName: `Live Sale Consolidated Items`,
              quantity: qtyForBale,
              totalPrice: salesForBale,
              isFreebie: false,
              paymentStatus: PaymentStatus.PAID,
              shippingStatus: ShippingStatus.PENDING,
              amountPaid: salesForBale,
              createdAt: new Date(payload.date).getTime()
            };

            db.addOrder(newOrder); // This automatically handles stocks, customer values & updates bale progress!
          }
        }
      }

      // Refresh layout data
      setDataTick(prev => prev + 1);
      setShowInputModal(false);
      triggerToast(`Successfully encoded: "${newSession.name}"`, 'success');
    } catch (err: any) {
      console.error(err);
      triggerToast(`Error encoding: ${err.message || 'Check connection'}`, 'error');
    }
  };

  // --- DELETE/ROLLBACK OPERATION ---
  const handleDeleteSession = async (sessionId: string, sessionName: string) => {
    if (!confirm(`Are you sure you want to delete and rollback "${sessionName}"?\nThis will revert all associated sold stock and balances of featured bales!`)) {
      return;
    }

    try {
      // 1. Delete associated orders of this session first (restoring stock automatically)
      const sessionOrders = allOrders.filter(o => o.sessionId === sessionId);
      const affectedBaleIds = new Set<string>();

      for (const order of sessionOrders) {
         // Identify which bale is affected
         const prod = db.getProducts().find(p => p.id === order.productId);
         if (prod && prod.baleBatch) {
           affectedBaleIds.add(prod.baleBatch);
         }
         // Delete the order database reference (doing stock and stats rollback internally)
         db.deleteOrder(order.id);
      }

      // 2. Filter from Local Storage Sessions
      const updatedSessions = db.getSessions().filter(s => s.id !== sessionId);
      localStorage.setItem('paw_sessions', JSON.stringify(updatedSessions));

      // 3. Remove from Supabase
      await supabase.from('live_sessions').delete().eq('id', sessionId);

      // Force recalculate bale status for all rolled back Bales
      setDataTick(p => p + 1);
      triggerToast(`Removed "${sessionName}" and successfully restored stocks!`, 'delete');
    } catch (err: any) {
      console.error(err);
      triggerToast(`Failed to delete session: ${err?.message || 'Error'}`, 'error');
    }
  };

  const displayLogo = logoUrl || './logo.png';

  return (
    <div className="space-y-8 pb-32 animate-fadeIn relative">
      
      {/* Header Banner Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-pink-100 dark:bg-pink-900/30 text-[#ff6b9a] rounded-3xl flex items-center justify-center shadow-inner shrink-0">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-none uppercase">Live Sales Encoding</h1>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-1">Direct encoding for finished live/bulk sales</p>
          </div>
        </div>

        <button 
          onClick={() => setShowInputModal(true)}
          className="bg-[#ff6b9a] text-white px-8 py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl shadow-pink-200 dark:shadow-none hover:bg-pink-400 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 stroke-[3px]" />
          Encode Live Sale
        </button>
      </div>

      {/* KPI Stats Aggregates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        
        {/* Total Sessions */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border-2 border-pink-50 dark:border-gray-700/80 shadow-md flex items-center gap-4 transition-colors">
          <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Total Recorded</p>
            <p className="text-2xl font-black text-gray-800 dark:text-white mt-1.5 leading-none">{totals.sessionsCount} Live(s)</p>
          </div>
        </div>

        {/* Total Items Sold */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border-2 border-pink-50 dark:border-gray-700/80 shadow-md flex items-center gap-4 transition-colors">
          <div className="w-12 h-12 bg-teal-50 dark:bg-teal-950/40 text-teal-500 rounded-2xl flex items-center justify-center shrink-0">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Total Items Sold</p>
            <p className="text-2xl font-black text-gray-800 dark:text-white mt-1.5 leading-none">{totals.itemsSold} pcs</p>
          </div>
        </div>

        {/* Total Sales/Benta */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border-2 border-pink-50 dark:border-gray-700/80 shadow-md flex items-center gap-4 transition-colors">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 rounded-2xl flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Total Live Sales</p>
            <p className="text-2xl font-black text-gray-800 dark:text-white mt-1.5 leading-none">₱{totals.revenue.toLocaleString()}</p>
          </div>
        </div>

      </div>

      {/* Main List Management Container */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-[3rem] border-2 border-pink-100 dark:border-gray-700 shadow-xl space-y-6 transition-colors">
        
        {/* Search header & Filter bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-700">
           <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Encoded Live Sessions History</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Filter and review previous transactions</p>
           </div>

           <div className="relative max-w-sm w-full">
              <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search session name or date..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl py-3.5 pl-11 pr-5 text-xs font-black text-gray-800 dark:text-white outline-none focus:border-pink-300 dark:focus:border-pink-800 transition-colors placeholder:text-gray-400 placeholder:font-bold"
              />
           </div>
        </div>

        {/* Sessions list presentation */}
        {filteredSessions.length === 0 ? (
          <div className="text-center py-16 opacity-60 flex flex-col items-center justify-center space-y-4">
             <div className="text-5xl animate-bounce">📦</div>
             <p className="text-xs font-black uppercase tracking-widest text-gray-400">No matching live sale logs found.</p>
             <button 
               onClick={() => setShowInputModal(true)}
               className="text-xs font-black uppercase text-[#ff6b9a] hover:underline"
             >
               Add/Encode First Record now
             </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             {filteredSessions.map(session => {
                const featuredBales = getSessionBales(session.id);
                return (
                  <div 
                    key={session.id}
                    className="bg-gray-50/50 dark:bg-gray-900/20 p-6 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 flex flex-col justify-between hover:border-pink-300 dark:hover:border-pink-800 hover:shadow-md transition-all group animate-slideIn"
                  >
                     {/* Metadata Header */}
                     <div>
                        <div className="flex justify-between items-start gap-2 mb-3">
                           <div>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider bg-pink-50 text-[#ff6b9a] dark:bg-pink-950/40 dark:text-pink-400">
                                <Calendar className="w-2.5 h-2.5 stroke-[2.5px]" />
                                {session.date}
                              </span>
                              <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight mt-2">{session.name}</h3>
                           </div>
                           
                           <button 
                             onClick={() => handleDeleteSession(session.id, session.name)}
                             className="p-2.5 bg-rose-50 hover:bg-rose-500 hover:text-white dark:bg-rose-950/40 rounded-full text-rose-500 shadow-sm transition-all"
                             title="Rollback Live Session Record"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>

                        {/* Featured Bales Tag Display */}
                        <div className="mt-3 bg-gray-50/60 dark:bg-gray-950/40 p-3 rounded-2xl border border-gray-100 dark:border-gray-800/80">
                           <p className="text-[8px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Featured Bales</p>
                           {featuredBales.length === 0 ? (
                             <p className="text-[10px] text-gray-400 italic mt-0.5">No Bales selected</p>
                           ) : (
                             <div className="flex flex-wrap gap-1.5 mt-1.5">
                               {featuredBales.map((bName, i) => (
                                 <span key={i} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[9px] font-black uppercase px-2.5 py-1 rounded-lg">
                                   {bName}
                                 </span>
                               ))}
                             </div>
                           )}
                        </div>
                     </div>

                     {/* Visual Counts & Sales Portions */}
                     <div className="flex justify-between items-center gap-3 pt-5 mt-5 border-t border-dashed border-gray-100 dark:border-gray-700 font-sans">
                        <div>
                           <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Items Sold</p>
                           <p className="text-sm font-black text-gray-700 dark:text-white mt-1">{session.totalOrders} pcs</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Total Profit / Revenue</p>
                           <p className="text-lg font-black text-[#ff6b9a] dark:text-pink-400 mt-1">₱{session.totalSales.toLocaleString()}</p>
                        </div>
                     </div>

                  </div>
                );
             })}
          </div>
        )}

      </div>

      {/* SYSTEM UPDATE FLOATING TOASTS */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-[200] max-w-sm bg-gray-900 border border-gray-800 text-white rounded-[2rem] p-5 shadow-2xl flex items-center gap-4 animate-scaleUp">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${feedbackType === 'delete' ? 'bg-red-500' : 'bg-[#ff6b9a]'}`}>
            {feedbackType === 'delete' ? '🗑️' : '✨'}
          </div>
          <div>
            <p className="font-black text-sm uppercase tracking-tight">System Notification</p>
            <p className="text-xs text-gray-100">{feedback}</p>
          </div>
        </div>
      )}

      {/* INPUT / ENCODING MODAL */}
      {showInputModal && (
        <EncodeSessionModal 
          allBales={allBales}
          onClose={() => setShowInputModal(false)}
          onSave={handleSaveDirectSession}
        />
      )}

    </div>
  );
};

// =========================================================================
// SUBCOMPONENT: DIRECT LIVE SESSION ENCODING MODAL
// =========================================================================
interface EncodeSessionModalProps {
  allBales: Bale[];
  onClose: () => void;
  onSave: (payload: {
    name: string;
    date: string;
    totalSales: number;
    totalQty: number;
    selectedBaleIds: string[];
    baleDetails?: { baleId: string; qty: number; sales: number }[];
  }) => void;
}

const EncodeSessionModal: React.FC<EncodeSessionModalProps> = ({ allBales, onClose, onSave }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionName, setSessionName] = useState('');
  
  // High contrast selections with dynamic per-bale values
  const [selectedBaleIds, setSelectedBaleIds] = useState<string[]>([]);
  
  // List of price-point rows per selected bale
  // e.g. balePriceLevels = { "bale_1": [{ price: '60', qty: '10' }, { price: '100', qty: '2' }] }
  const [balePriceLevels, setBalePriceLevels] = useState<Record<string, { price: string; qty: string }[]>>({});

  const activeBales = useMemo(() => {
    return [...allBales].sort((a,b) => {
       if (a.status === 'On Sale' && b.status !== 'On Sale') return -1;
       if (a.status !== 'On Sale' && b.status === 'On Sale') return 1;
       return 0;
    });
  }, [allBales]);

  // Handle multi bale selection
  const handleToggleBale = (baleId: string) => {
    if (selectedBaleIds.includes(baleId)) {
      setSelectedBaleIds(selectedBaleIds.filter(id => id !== baleId));
    } else {
      setSelectedBaleIds([...selectedBaleIds, baleId]);
      if (!balePriceLevels[baleId] || balePriceLevels[baleId].length === 0) {
        setBalePriceLevels(prev => ({
          ...prev,
          [baleId]: [{ price: '', qty: '' }]
        }));
      }
    }
  };

  // Helpers to manage dynamic price rows
  const handleAddPriceLevel = (baleId: string) => {
    setBalePriceLevels(prev => ({
      ...prev,
      [baleId]: [...(prev[baleId] || []), { price: '', qty: '' }]
    }));
  };

  const handleUpdatePriceLevel = (baleId: string, idx: number, field: 'price' | 'qty', val: string) => {
    setBalePriceLevels(prev => {
      const list = [...(prev[baleId] || [])];
      if (list[idx]) {
        list[idx] = { ...list[idx], [field]: val };
      }
      return { ...prev, [baleId]: list };
    });
  };

  const handleRemovePriceLevel = (baleId: string, idx: number) => {
    setBalePriceLevels(prev => {
      const list = (prev[baleId] || []).filter((_, i) => i !== idx);
      // Ensure at least 1 empty row is kept or let it be empty
      return { ...prev, [baleId]: list.length === 0 ? [{ price: '', qty: '' }] : list };
    });
  };

  // Compute Grand totals directly by adding selected bales values
  const grandTotals = useMemo(() => {
    let salesSum = 0;
    let qtySum = 0;
    selectedBaleIds.forEach(id => {
      const levels = balePriceLevels[id] || [];
      levels.forEach(lvl => {
        const p = Number(lvl.price || 0);
        const q = Number(lvl.qty || 0);
        salesSum += p * q;
        qtySum += q;
      });
    });
    return {
      totalSales: salesSum,
      totalQty: qtySum,
      avgPrice: qtySum > 0 ? Math.round(salesSum / qtySum) : 0
    };
  }, [selectedBaleIds, balePriceLevels]);

  // Submit enabled only if at least 1 bale is checked and ALL selected have positive qty + sales values
  const submitEnabled = useMemo(() => {
    if (selectedBaleIds.length === 0) return false;
    return selectedBaleIds.every(id => {
       const levels = balePriceLevels[id] || [];
       if (levels.length === 0) return false;
       return levels.every(lvl => {
          const p = Number(lvl.price || 0);
          const q = Number(lvl.qty || 0);
          return p > 0 && q > 0;
       });
    });
  }, [selectedBaleIds, balePriceLevels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitEnabled) {
      alert('Pakisulat po ang total benta at items sold sa bawat napiling bale!');
      return;
    }

    const defaultTitle = `Live Sale • ${new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const breakdown = selectedBaleIds.map(baleId => {
      const levels = balePriceLevels[baleId] || [];
      let totalBaleQty = 0;
      let totalBaleSales = 0;
      levels.forEach(lvl => {
         totalBaleQty += Number(lvl.qty || 0);
         totalBaleSales += Number(lvl.price || 0) * Number(lvl.qty || 0);
      });
      return {
         baleId,
         qty: totalBaleQty,
         sales: totalBaleSales
      };
    });

    onSave({
      name: sessionName.trim() || defaultTitle,
      date,
      totalSales: grandTotals.totalSales,
      totalQty: grandTotals.totalQty,
      selectedBaleIds,
      baleDetails: breakdown
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[3rem] shadow-2xl animate-scaleUp overflow-hidden max-h-[92vh] border-2 border-pink-100 dark:border-gray-700 flex flex-col">
          
          {/* Modal Header */}
          <div className="bg-[#ff6b9a] p-8 text-white flex justify-between items-center shrink-0 rounded-t-[2.75rem]">
            <div>
               <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                 <Sparkles className="w-6 h-6" /> DIRECT ENCODE LIVE SALE
               </h3>
               <p className="text-xs font-semibold text-white/80 uppercase tracking-widest mt-0.5">
                  Input sales & items sold per selected bale
               </p>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="bg-white/20 text-white w-9 h-9 rounded-full font-black flex items-center justify-center hover:bg-white hover:text-[#ff6b9a] transition-all"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6 flex-1 text-gray-900 dark:text-white overflow-y-auto custom-scrollbar">
             
             {/* Date Picker & Title Input */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300 block mb-1.5">Date of Live Sale</label>
                   <input 
                     type="date"
                     required
                     value={date}
                     onChange={(e) => setDate(e.target.value)}
                     className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-xl text-xs font-black text-gray-900 dark:text-white outline-none shadow-inner"
                   />
                </div>
                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300 block mb-1.5">Live Title Reference (Optional)</label>
                   <input 
                     type="text"
                     placeholder="e.g. Flash Sale Clearance"
                     value={sessionName}
                     onChange={(e) => setSessionName(e.target.value)}
                     className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-xl text-xs font-black text-gray-900 dark:text-white outline-none shadow-inner"
                   />
                </div>
             </div>

             {/* Bale Checklist Selector with High-Visibility styling */}
             <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300">
                     Select featured Bales in this Live Sale <span className="text-red-500">*</span>
                   </label>
                   <span className="text-[9px] font-black uppercase tracking-wider bg-pink-100 dark:bg-pink-950 text-[#ff6b9a] px-3 py-1 rounded-full">
                     {selectedBaleIds.length} Selected
                   </span>
                </div>
                
                {allBales.length === 0 ? (
                  <div className="p-4 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300 text-xs font-bold rounded-xl text-center">
                     Walang bale na rehistrado sa system. Pumunta sa Bales tab para magdagdag!
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 max-h-[160px] overflow-y-auto custom-scrollbar p-1">
                     {activeBales.map(b => {
                        const isPicked = selectedBaleIds.includes(b.id);
                        return (
                          <button
                            type="button"
                            key={b.id}
                            onClick={() => handleToggleBale(b.id)}
                            className={`p-3.5 rounded-xl border-2 text-left font-black text-xs uppercase transition-all flex items-center justify-between ${
                              isPicked 
                                ? 'bg-pink-50 border-[#ff6b9a] text-[#ff6b9a] dark:bg-pink-900/30' 
                                : 'bg-gray-100 border-gray-200 text-gray-905 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                             <div className="truncate pr-2">
                                <p className="font-black text-xs truncate uppercase leading-none">{b.name}</p>
                                {b.status === 'On Sale' && (
                                   <span className="text-[7px] text-green-500 font-extrabold uppercase mt-1 block tracking-widest">Active On-Sale</span>
                                )}
                             </div>
                             {isPicked ? (
                               <div className="w-5 h-5 rounded-full bg-[#ff6b9a] text-white flex items-center justify-center font-bold text-[10px] shrink-0">✓</div>
                             ) : (
                               <div className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"></div>
                             )}
                          </button>
                        );
                     })}
                  </div>
                )}
             </div>

             {/* DYNAMIC BREAKDOWN PER SELECTED BALE */}
             {selectedBaleIds.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700 animate-fadeIn">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ff6b9a] dark:text-pink-400">
                     Breakdown per Selected Bale:
                   </h4>

                   <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                      {selectedBaleIds.map(bId => {
                         const baleObj = allBales.find(b => b.id === bId);
                         const levels = balePriceLevels[bId] || [];
                         
                         let totalBaleQty = 0;
                         let totalBaleSales = 0;
                         levels.forEach(l => {
                            totalBaleQty += Number(l.qty || 0);
                            totalBaleSales += Number(l.price || 0) * Number(l.qty || 0);
                         });
                         const baleAvgVal = totalBaleQty > 0 ? Math.round(totalBaleSales / totalBaleQty) : 0;

                         return (
                            <div 
                              key={bId}
                              className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-2.5xl p-4 space-y-3 animate-fadeIn"
                            >
                               <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-800">
                                  <span className="text-xs font-black text-gray-900 dark:text-white uppercase truncate max-w-[65%]">
                                     📦 {baleObj ? baleObj.name : 'Unknown Bale'}
                                  </span>
                                  {baleAvgVal > 0 && (
                                     <span className="text-[9px] font-black text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/25 px-2 py-0.5 rounded-lg shrink-0">
                                        ₱{baleAvgVal}/pc avg
                                     </span>
                                  )}
                               </div>

                               <div className="space-y-2">
                                  {levels.map((lvl, index) => {
                                     const priceNum = Number(lvl.price || 0);
                                     const qtyNum = Number(lvl.qty || 0);
                                     const itemSubtotal = priceNum * qtyNum;

                                     return (
                                        <div key={index} className="grid grid-cols-12 gap-2.5 items-end">
                                           {/* Price Input */}
                                           <div className="col-span-5">
                                              {index === 0 && (
                                                 <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300 block mb-1">Price per Pc</label>
                                              )}
                                              <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl px-2.5 border border-gray-200 dark:border-gray-700 shadow-inner">
                                                 <span className="text-[9px] font-black text-gray-400 shrink-0 mr-1">₱</span>
                                                 <input 
                                                   type="number"
                                                   placeholder="e.g. 60"
                                                   min="1"
                                                   required
                                                   value={lvl.price}
                                                   onChange={(e) => handleUpdatePriceLevel(bId, index, 'price', e.target.value)}
                                                   className="w-full bg-transparent py-2.5 font-bold text-xs text-gray-950 dark:text-white outline-none"
                                                 />
                                              </div>
                                           </div>

                                           {/* Times icon x */}
                                           <div className="col-span-1 flex justify-center items-center h-10 text-[10px] font-bold text-gray-400">
                                              ✕
                                           </div>

                                           {/* Qty Input */}
                                           <div className="col-span-4">
                                              {index === 0 && (
                                                 <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-300 block mb-1">Qty sold</label>
                                              )}
                                              <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl px-2.5 border border-gray-200 dark:border-gray-700 shadow-inner">
                                                 <input 
                                                   type="number"
                                                   placeholder="10"
                                                   min="1"
                                                   required
                                                   value={lvl.qty}
                                                   onChange={(e) => handleUpdatePriceLevel(bId, index, 'qty', e.target.value)}
                                                   className="w-full bg-transparent py-2.5 font-bold text-xs text-gray-950 dark:text-white outline-none"
                                                 />
                                                 <span className="text-[8px] font-extrabold text-gray-400 shrink-0 ml-1 uppercase">pcs</span>
                                              </div>
                                           </div>

                                           {/* Subtotal & Delete button */}
                                           <div className="col-span-2 flex items-center justify-end gap-1.5 h-10 pb-1">
                                              {itemSubtotal > 0 && (
                                                 <span className="text-[10px] font-black text-[#ff6b9a]">₱{itemSubtotal}</span>
                                              )}
                                              {levels.length > 1 && (
                                                 <button 
                                                    type="button"
                                                    onClick={() => handleRemovePriceLevel(bId, index)}
                                                    className="w-5 h-5 rounded bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors dark:bg-red-950/20 dark:hover:bg-red-900/30 shrink-0"
                                                    title="Remove price level"
                                                 >
                                                    <span className="text-xs">✕</span>
                                                 </button>
                                              )}
                                           </div>
                                        </div>
                                     );
                                  })}
                               </div>

                               {/* Add Price Level Button */}
                               <div className="pt-2 flex justify-between items-center border-t border-dotted border-gray-100 dark:border-gray-800">
                                  <button
                                     type="button"
                                     onClick={() => handleAddPriceLevel(bId)}
                                     className="text-[9px] font-extrabold uppercase tracking-wider text-[#ff6b9a] dark:text-pink-400 hover:text-pink-600 flex items-center gap-1 bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/30 dark:hover:bg-pink-900/40 px-3 py-1.5 rounded-lg transition-all"
                                  >
                                     <Sparkles className="w-3 h-3 text-[#ff6b9a] dark:text-pink-400" /> + Add Price Level
                                  </button>
                                  {totalBaleQty > 0 && (
                                     <span className="text-[9px] font-black text-gray-500 dark:text-gray-400">
                                        Total: <strong className="text-gray-800 dark:text-white">{totalBaleQty} pcs</strong> • <strong className="text-[#ff6b9a] dark:text-pink-400">₱{totalBaleSales}</strong>
                                     </span>
                                  )}
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </div>
             )}

             {/* Dynamic Grand Totals presentation summary */}
             {selectedBaleIds.length > 0 && (
                <div className="p-5 bg-gradient-to-r from-pink-500/10 to-[#ff6b9a]/5 border-2 border-pink-100/30 rounded-[2rem] flex flex-col gap-2.5 animate-fadeIn">
                    <div className="flex justify-between items-center">
                       <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400 dark:text-gray-300 leading-none">Grand Total Sales:</span>
                       <span className="font-black text-lg text-[#ff6b9a] dark:text-pink-400">₱{grandTotals.totalSales.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-dashed border-gray-200 dark:border-gray-700 pt-2 text-xs">
                       <span className="text-gray-400 dark:text-white/80 font-bold uppercase text-[9px] tracking-wider">Total Items Sold:</span>
                       <span className="font-extrabold text-[#ff6b9a] dark:text-white">{grandTotals.totalQty} pcs</span>
                    </div>
                    {grandTotals.avgPrice > 0 && (
                       <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right mt-1">
                          Consolidated average: <span className="text-[#ff6b9a]">₱{grandTotals.avgPrice} / pc</span>
                       </div>
                    )}
                </div>
             )}

             {/* Footer Cancel / Save buttons */}
             <div className="pt-4 flex justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-white py-4 rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!submitEnabled}
                  className={`w-2/3 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest text-center transition-all ${
                     submitEnabled 
                       ? 'bg-[#ff6b9a] text-white shadow-lg cursor-pointer hover:bg-pink-400 active:scale-95' 
                       : 'bg-gray-200 dark:bg-gray-900 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-300 dark:border-gray-700'
                  }`}
                >
                  Save Live Selling Entry
                </button>
             </div>

          </form>
      </div>
    </div>
  );
};

export default LiveSell;
