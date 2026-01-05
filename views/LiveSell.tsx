
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { useSettings } from '../services/SettingsContext';
import { Product, Order, PaymentStatus, ShippingStatus, LiveSession, Bale, Customer } from '../types';
import { PlusIcon, PawIcon, CartIcon } from '../components/Icons';

const OFF_LIVE_ID = 'OFF_LIVE';
const PRESET_PRICES = [10, 50, 80, 130, 150, 160, 170, 180, 190, 200];
const STORAGE_KEY_STATE = 'paw_live_state';

interface CartItem {
  id: string;
  price: number;
  quantity: number;
  isFreebie: boolean;
  baleId: string;
}

interface SessionSummaryData {
  name: string;
  date: string;
  totalSales: number;
  totalItems: number;
  customerCount: number;
  topCustomer: { username: string; total: number } | null;
}

type DiscountType = 'NONE' | 'FIXED' | 'PERCENTAGE';

const LiveSell: React.FC = () => {
  const { logoUrl } = useSettings();
  
  // -- Persistent State Initialization --
  const getSavedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STATE);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  };
  const savedState = getSavedState();

  const [session, setSession] = useState<LiveSession | null>(db.getSessions().find(s => s.isOpen) || null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  
  // Fields that persist across navigation
  const [username, setUsername] = useState(savedState?.username || '');
  const [transactionNo, setTransactionNo] = useState(savedState?.transactionNo || '');
  const [selectedBaleId, setSelectedBaleId] = useState<string>(savedState?.selectedBaleId || '');
  const [cart, setCart] = useState<CartItem[]>(savedState?.cart || []);
  const [useVipTicket, setUseVipTicket] = useState(savedState?.useVipTicket || false);
  const [vipDiscount, setVipDiscount] = useState<number>(savedState?.vipDiscount || 0);
  const [vipDiscountType, setVipDiscountType] = useState<DiscountType>(savedState?.vipDiscountType || 'NONE');

  const [customPrice, setCustomPrice] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  
  // New State for Post-Session Summary
  const [finishedSessionData, setFinishedSessionData] = useState<SessionSummaryData | null>(null);

  const [oosModalData, setOosModalData] = useState<{ name: string; total: number; sold: number } | null>(null);
  const [todaysHistory, setTodaysHistory] = useState<LiveSession[]>([]);
  const [viewingHistory, setViewingHistory] = useState<LiveSession | null>(null);
  const [showSessionOrders, setShowSessionOrders] = useState(false);
  
  // Live Customer Data & Trigger for Updates
  const [dataTick, setDataTick] = useState(0); // Used to force refresh of inventory data
  const [allCustomers, setAllCustomers] = useState<Customer[]>(db.getCustomers());
  
  // Calculate Bale Availability for Dropdown
  const baleAvailability = useMemo(() => {
    const currentBales = db.getBales();
    const currentOrders = db.getOrders();
    const currentProducts = db.getProducts();
    
    return currentBales.filter(b => b.status !== 'Sold Out').map(b => {
        const prodIds = currentProducts.filter(p => p.baleBatch === b.id).map(p => p.id);
        
        // 1. Sold items from DB (Finalized)
        const soldDB = currentOrders
            .filter(o => prodIds.includes(o.productId) && o.shippingStatus !== 'Cancelled')
            .reduce((sum, o) => sum + o.quantity, 0);
        
        // 2. Sold items in active Cart (Pending)
        const inCart = cart
            .filter(c => c.baleId === b.id)
            .reduce((sum, c) => sum + c.quantity, 0);

        return { 
            ...b,
            remaining: Math.max(0, b.itemCount - soldDB - inCart)
        };
    });
  }, [dataTick, cart]); 

  const bales = db.getBales(); 

  // -- Persistence Effect --
  useEffect(() => {
    const stateToSave = {
      username,
      transactionNo,
      selectedBaleId,
      cart,
      useVipTicket,
      vipDiscount,
      vipDiscountType
    };
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(stateToSave));
  }, [username, transactionNo, selectedBaleId, cart, useVipTicket, vipDiscount, vipDiscountType]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      if (scheduledTime && !session) {
        if (now >= scheduledTime) {
          handleCreateSession(`Live @ ${scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
          setScheduledTime(null);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduledTime, session]);

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-US');
    const allSessions = db.getSessions();
    const todayFinished = allSessions.filter(s => !s.isOpen && s.date === today).sort((a, b) => b.id.localeCompare(a.id));
    setTodaysHistory(todayFinished);
  }, [session]);

  const filteredCustomers = useMemo(() => {
    if (!username || allCustomers.some(c => c.username === username)) return [];
    return allCustomers.filter(c => c.username.toLowerCase().includes(username.toLowerCase())).slice(0, 3);
  }, [username, allCustomers]);

  const currentCustomer = useMemo(() => {
    return allCustomers.find(c => c.username === username);
  }, [username, allCustomers]);

  const isRestricted = useMemo(() => currentCustomer?.isBlacklisted || false, [currentCustomer]);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const calculatedDiscount = useMemo(() => {
     if (!useVipTicket) return 0;
     if (vipDiscountType === 'NONE') return 0;
     if (vipDiscountType === 'FIXED') return Math.min(vipDiscount, cartTotal);
     if (vipDiscountType === 'PERCENTAGE') return cartTotal * (Math.min(vipDiscount, 100) / 100);
     return 0;
  }, [useVipTicket, vipDiscountType, vipDiscount, cartTotal]);

  const finalTotal = Math.max(0, cartTotal - calculatedDiscount);

  const getBaleStats = (baleId: string) => {
    const bale = bales.find(b => b.id === baleId);
    if (!bale) return { remaining: 0, total: 0, sold: 0, revenue: 0, targetPrice: 0 };
    
    const allProducts = db.getProducts();
    const allOrders = db.getOrders();
    const baleProductIds = allProducts.filter(p => p.baleBatch === baleId).map(p => p.id);
    const baleOrders = allOrders.filter(o => baleProductIds.includes(o.productId) && o.shippingStatus !== 'Cancelled');
    
    const soldInDb = baleOrders.reduce((sum, o) => sum + o.quantity, 0);
    const revenueInDb = baleOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    
    const inCartCount = cart.filter(item => item.baleId === baleId).reduce((sum, item) => sum + item.quantity, 0);
    const inCartRevenue = cart.filter(item => item.baleId === baleId).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const totalSoldActual = soldInDb + inCartCount;
    const totalRevenueActual = revenueInDb + inCartRevenue;
    const remaining = Math.max(0, bale.itemCount - totalSoldActual);
    const remainingToRecover = Math.max(0, bale.cost - totalRevenueActual);
    const targetPrice = remaining > 0 ? (remainingToRecover / remaining) : 0;
    
    return { remaining, total: bale.itemCount, sold: totalSoldActual, revenue: totalRevenueActual, targetPrice };
  };

  const handleCreateSession = (name: string) => {
    const newSession = db.createSession(name);
    setSession(newSession);
    setShowStartModal(false);
  };

  const handleEndSessionClick = () => {
    setShowEndConfirmation(true);
  };

  const confirmEndSession = () => {
    if (session) {
      const sessionOrders = db.getOrders().filter(o => o.sessionId === session.id);
      const totalSales = sessionOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      const totalItems = sessionOrders.reduce((sum, o) => sum + o.quantity, 0);
      
      const customerTotals: Record<string, number> = {};
      sessionOrders.forEach(o => {
         customerTotals[o.customerUsername] = (customerTotals[o.customerUsername] || 0) + o.totalPrice;
      });
      let topCustomer = null;
      let maxSpent = 0;
      Object.entries(customerTotals).forEach(([name, spent]) => {
         if (spent > maxSpent) {
            maxSpent = spent;
            topCustomer = { username: name, total: spent };
         }
      });

      const summary: SessionSummaryData = {
        name: session.name,
        date: session.date,
        totalSales,
        totalItems,
        customerCount: Object.keys(customerTotals).length,
        topCustomer
      };

      if (session.id !== OFF_LIVE_ID) {
        db.closeSession(session.id);
      }
      
      setFinishedSessionData(summary);
      setShowEndConfirmation(false);
    }
  };

  const finalizeSessionClose = () => {
      setSession(null);
      setFinishedSessionData(null);
      localStorage.removeItem(STORAGE_KEY_STATE);
      setCart([]);
      setUsername('');
      setTransactionNo('');
      setUseVipTicket(false);
  };

  const addToCart = (inputPrice: number, isFreebie: boolean = false) => {
    if (isRestricted) {
        setFeedback("🚫 Action Blocked");
        setTimeout(() => setFeedback(null), 1000);
        return;
    }

    if (!selectedBaleId) return;
    const stats = getBaleStats(selectedBaleId);
    if (stats.remaining <= 0) {
      setOosModalData({ name: bales.find(b => b.id === selectedBaleId)?.name || '', total: stats.total, sold: stats.sold });
      return;
    }
    const price = isFreebie ? 0 : inputPrice;
    setCart(prev => {
      const idx = prev.findIndex(i => i.price === price && i.isFreebie === isFreebie && i.baleId === selectedBaleId);
      if (idx > -1) {
        const next = [...prev];
        const existingItem = next[idx];
        next.splice(idx, 1);
        return [{ ...existingItem, quantity: existingItem.quantity + 1 }, ...next];
      }
      return [{ id: `c_${Date.now()}_${Math.random()}`, price, quantity: 1, isFreebie, baleId: selectedBaleId }, ...prev];
    });
    setCustomPrice('');
  };

  const handleMakeVip = () => {
    if (!username) return alert('Enter a username first');
    const customer = db.getOrCreateCustomer(username);
    customer.isVIP = true;
    customer.vipTickets = (customer.vipTickets || 0) + 1;
    db.updateCustomer(customer);
    setAllCustomers(db.getCustomers());
    setFeedback(`VIP Ticket Added (+1)`);
    setTimeout(() => setFeedback(null), 1500);
  };

  const handleCheckout = () => {
    if (!session || !username) return alert('Username required!');
    
    const customer = db.getOrCreateCustomer(username);

    if (customer.isBlacklisted) {
       setFeedback("🚫 Customer Blacklisted");
       setTimeout(() => setFeedback(null), 2500);
       return;
    }

    const timestamp = Date.now();
    
    if (useVipTicket && vipDiscountType === 'FIXED' && vipDiscount > cartTotal) {
        return alert("Discount cannot be larger than the total amount.");
    }

    if (useVipTicket) {
      if (customer.vipTickets > 0) {
        customer.vipTickets -= 1;
        db.updateCustomer(customer);
        setAllCustomers(db.getCustomers()); 
      } else {
        alert('Error: Customer has no VIP tickets left!');
        setUseVipTicket(false);
        return; 
      }
    }

    const totalDiscountAmount = calculatedDiscount;
    const discountRatio = (useVipTicket && cartTotal > 0) ? (totalDiscountAmount / cartTotal) : 0;

    // CONSOLIDATED ORDER LOGIC (Save space!)
    cart.forEach((item, idx) => {
      // Calculate unit price after discount
      let finalItemPrice = item.price;
      if (useVipTicket && totalDiscountAmount > 0 && !item.isFreebie) {
          finalItemPrice = item.price * (1 - discountRatio);
      }
      
      // Create Reusable Product ID
      // Format: live_{baleId}_{price}_{isFreebie}
      const deterministicProdId = `live_${item.baleId}_${item.price}${item.isFreebie ? '_f' : ''}`;
      
      const prod: Product = { 
          id: deterministicProdId, 
          name: item.isFreebie ? 'Gift' : `Live Item ₱${item.price}`, 
          brand: 'Live', 
          baleBatch: item.baleId, 
          costPrice: 0, 
          sellingPrice: finalItemPrice, 
          stock: 0 
      };
      
      // Upsert Product (reuses existing row if ID matches)
      db.updateProduct(prod);
      
      // Create Single Order Row for total quantity
      db.addOrder({
        id: `o_${timestamp}_${idx}`, 
        sessionId: session.id, 
        customerId: customer.id, 
        customerUsername: username, 
        productId: deterministicProdId, 
        productName: prod.name, 
        quantity: item.quantity, // Consolidated Quantity
        totalPrice: finalItemPrice * item.quantity, // Total for this row
        isFreebie: item.isFreebie, 
        paymentStatus: item.isFreebie ? PaymentStatus.PAID : PaymentStatus.UNPAID, 
        shippingStatus: ShippingStatus.PENDING, 
        amountPaid: 0, 
        createdAt: timestamp, 
        referenceNumber: transactionNo || undefined,
        usedVipTicket: useVipTicket
      });
    });

    setCart([]);
    setUsername('');
    setTransactionNo('');
    setUseVipTicket(false);
    setVipDiscount(0);
    setVipDiscountType('NONE');
    setDataTick(prev => prev + 1);

    setFeedback(`Recorded for @${username}!`);
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleEditCustomer = (targetUsername: string) => {
    if (!session) return;
    const sessionOrders = db.getOrders().filter(o => o.sessionId === session.id && o.customerUsername === targetUsername);
    if (sessionOrders.length === 0) return;

    if (cart.length > 0 && username !== targetUsername) {
      if(!confirm("Your current cart is not empty. Replacing it will clear current unsaved items. Continue?")) return;
    }

    const products = db.getProducts();
    const newCartItems: CartItem[] = [];
    let ticketUsed = false;

    sessionOrders.forEach(order => {
       if (order.usedVipTicket) ticketUsed = true;
       const product = products.find(p => p.id === order.productId);
       const baleId = product?.baleBatch || ''; 
       
       // Calc unit price from total
       const unitPrice = order.quantity > 0 ? (order.totalPrice / order.quantity) : 0;
       
       const existingIdx = newCartItems.findIndex(ci => Math.abs(ci.price - unitPrice) < 0.1 && ci.isFreebie === order.isFreebie && ci.baleId === baleId);
       
       if (existingIdx > -1) {
         newCartItems[existingIdx].quantity += order.quantity;
       } else {
         newCartItems.push({
           id: `c_restored_${order.id}`,
           price: unitPrice, 
           quantity: order.quantity,
           isFreebie: order.isFreebie,
           baleId: baleId
         });
       }
    });

    setCart(newCartItems);
    setUsername(targetUsername);
    setTransactionNo(sessionOrders[0].referenceNumber || '');
    setUseVipTicket(ticketUsed);
    setVipDiscount(0);
    setVipDiscountType('NONE');

    if (ticketUsed) {
      const cust = db.getOrCreateCustomer(targetUsername);
      cust.vipTickets += 1;
      db.updateCustomer(cust);
      setAllCustomers(db.getCustomers());
    }

    sessionOrders.forEach(o => db.deleteOrder(o.id));
    setDataTick(prev => prev + 1);

    setShowSessionOrders(false);
    setFeedback(`Editing @${targetUsername}`);
    setTimeout(() => setFeedback(null), 2000);
  };
  
  const currentBaleStats = selectedBaleId ? getBaleStats(selectedBaleId) : null;
  const displayLogo = logoUrl || './logo.png';

  if (viewingHistory) {
    return <SessionReview session={viewingHistory} onBack={() => setViewingHistory(null)} />;
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 animate-fadeIn pb-32">
        <div className="w-full max-w-lg text-center space-y-8">
          
          <div className="flex justify-center animate-scaleUp">
             <img 
               src={displayLogo} 
               alt="Shop Logo" 
               className="h-28 w-auto object-contain drop-shadow-md hover:scale-105 transition-transform" 
             />
          </div>

          <div className="flex flex-col items-center animate-scaleUp">
             <h1 className="text-7xl font-black text-gray-900 dark:text-gray-100 tracking-tighter leading-none font-nunito">
               {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/\s(?:AM|PM)/, '')}
               <span className="text-xl text-pawPinkDark align-top ml-1">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).match(/(?:AM|PM)/)?.[0]}
               </span>
             </h1>
             <p className="text-[10px] font-black text-gray-900 dark:text-gray-400 uppercase tracking-[0.4em] mt-3">
               {currentTime.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
             </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] border-2 border-pawPink shadow-xl space-y-6 transition-colors">
            <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tight">Ready to Start?</h2>
            <div className="grid grid-cols-2 gap-3">
               <button onClick={() => setSession({ id: OFF_LIVE_ID, name: 'Manual Encoding', date: new Date().toLocaleDateString(), totalSales: 0, totalOrders: 0, isOpen: true })} className="bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white py-5 rounded-[2rem] font-black uppercase text-[10px] shadow-sm hover:border-pawPinkDark transition-all active:scale-95">Manual Entry</button>
               <button onClick={() => setShowScheduleModal(true)} className="bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white py-5 rounded-[2rem] font-black uppercase text-[10px] shadow-sm hover:border-pawPinkDark transition-all active:scale-95">Schedule</button>
               <button onClick={() => setShowStartModal(true)} className="col-span-2 bg-pawPinkDark text-white py-6 rounded-[2.5rem] font-black uppercase shadow-2xl text-xs tracking-widest active:scale-95 transition-all hover:bg-red-400">Start Live Selling</button>
            </div>
          </div>

          {todaysHistory.length > 0 && (
            <div className="w-full text-left space-y-4">
               <h3 className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] px-6">Completed Today</h3>
               <div className="space-y-3">
                  {todaysHistory.map(hist => (
                    <button key={hist.id} onClick={() => setViewingHistory(hist)} className="w-full bg-white/60 dark:bg-gray-800/60 p-6 rounded-[2.5rem] border border-pawPink/40 flex justify-between items-center group active:scale-98 transition-all hover:bg-white dark:hover:bg-gray-800 hover:border-pawPink">
                       <div className="text-left">
                          <p className="font-black text-gray-900 dark:text-gray-100 text-lg group-hover:text-pawPinkDark">{hist.name}</p>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{hist.date}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] font-black text-gray-400 uppercase">Review</p>
                          <p className="text-xs font-black text-gray-900 dark:text-gray-100">→</p>
                       </div>
                    </button>
                  ))}
               </div>
            </div>
          )}
        </div>
        {showStartModal && <StartSessionModal onClose={() => setShowStartModal(false)} onStart={handleCreateSession} />}
        {showScheduleModal && <ScheduleModal onClose={() => setShowScheduleModal(false)} onSet={setScheduledTime} />}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-32 max-w-full">
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-[3rem] shadow-xl border-2 border-pawPink/40 relative transition-colors">
          <div className="flex justify-between items-start mb-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full animate-pulse ${session.id === OFF_LIVE_ID ? 'bg-blue-600' : 'bg-red-600'}`}></span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${session.id === OFF_LIVE_ID ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                  {session.id === OFF_LIVE_ID ? 'Manual Mode' : 'LIVE • ON AIR'}
                </span>
              </div>
              <h3 className="text-3xl font-black text-gray-900 dark:text-white uppercase leading-none tracking-tight">{session.name}</h3>
            </div>
            <button className="text-[10px] font-black text-gray-900 dark:text-gray-200 uppercase bg-gray-100 dark:bg-gray-700 px-6 py-3 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm" onClick={handleEndSessionClick}>End Session</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
             <div className="relative">
                <div className="flex justify-between items-center mb-2 ml-4">
                  <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase tracking-widest">Customer Username</label>
                  {username && (
                    <div className="flex items-center gap-2">
                      {currentCustomer?.isBlacklisted && (
                         <span className="text-[10px] font-black bg-red-600 text-white px-3 py-1 rounded-full uppercase shadow-sm flex items-center gap-1 animate-pulse">
                            🚫 Restricted
                         </span>
                      )}
                      
                      <span className="text-[10px] font-black bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full uppercase shadow-sm flex items-center gap-1">
                        🎫 {currentCustomer?.vipTickets || 0}
                      </span>
                      <button 
                        onClick={handleMakeVip} 
                        className="bg-pawPinkDark text-white text-[10px] font-black px-3 py-1 rounded-full uppercase hover:bg-red-400 transition-all shadow-sm active:scale-90 flex items-center gap-1"
                      >
                         Make VIP
                      </button>
                    </div>
                  )}
                </div>
                <div className={`flex items-center bg-gray-50 dark:bg-gray-700 rounded-[1.8rem] px-6 border-2 transition-all shadow-inner ${isRestricted ? 'border-red-300 dark:border-red-900' : 'border-gray-100 dark:border-gray-600 focus-within:border-pawPinkDark'}`}>
                  <span className="text-xl font-black text-gray-400">@</span>
                  <input type="text" placeholder="TikTok ID" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-transparent p-5 text-xl font-black text-gray-900 dark:text-white placeholder:text-gray-300 border-none focus:ring-0" />
                </div>
                {filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 shadow-2xl rounded-[1.8rem] z-30 border-2 border-pawPink mt-3 p-2 overflow-hidden animate-scaleUp">
                    {filteredCustomers.map(c => (
                      <button key={c.id} onClick={() => setUsername(c.username)} className="w-full text-left p-5 hover:bg-pawPink/20 rounded-2xl font-black text-sm text-gray-900 dark:text-white flex justify-between">
                        <span>@{c.username}</span>
                        <div className="flex gap-2">
                            {c.isBlacklisted && <span className="text-[10px] bg-red-600 text-white px-3 py-1 rounded-full uppercase">BLK</span>}
                            {c.isVIP && <span className="text-[10px] bg-yellow-400 text-white px-3 py-1 rounded-full uppercase">VIP</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
             </div>
             <div>
                <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase ml-4 tracking-widest block mb-2">Order Reference / Notes</label>
                <input type="text" placeholder="Optional" value={transactionNo} onChange={(e) => setTransactionNo(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 focus:border-pawPinkDark p-5 rounded-[1.8rem] text-xl font-black text-gray-900 dark:text-white outline-none transition-all shadow-inner placeholder:text-gray-300" />
             </div>
          </div>

          <div className={`mb-10 transition-opacity duration-300 ${isRestricted ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
            <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase ml-4 tracking-widest block mb-2">
                {isRestricted ? 'Batch Selection (Locked)' : 'Active Batch Selection'}
            </label>
            <div className="relative">
              <select 
                disabled={isRestricted}
                value={selectedBaleId} 
                onChange={(e) => setSelectedBaleId(e.target.value)} 
                className="w-full bg-pawSoftBlue dark:bg-slate-700 p-5 rounded-[1.8rem] font-black text-lg text-blue-950 dark:text-white outline-none border-2 border-blue-100 dark:border-slate-600 appearance-none cursor-pointer shadow-sm disabled:cursor-not-allowed"
              >
                <option value="">Choose Inventory Source</option>
                {baleAvailability.map(b => (
                   <option key={b.id} value={b.id}>
                      {b.name} ({b.remaining} / {b.itemCount} Units Left)
                   </option>
                ))}
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-blue-900 dark:text-blue-300">▼</div>
            </div>
          </div>

          <div className="border-t-2 border-pawPink/20 pt-10">
            <div className="flex justify-between items-center mb-6 px-4">
              <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase tracking-widest">Pricing Panel</label>
              {!isRestricted && currentBaleStats && currentBaleStats.targetPrice > 0 && selectedBaleId && (
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-black px-5 py-2 rounded-full uppercase tracking-tighter shadow-md animate-pulse ${currentBaleStats.targetPrice > 100 ? 'bg-red-600 text-white' : 'bg-purple-500 text-white'}`}>
                    Target: ₱{currentBaleStats.targetPrice.toFixed(0)}
                  </span>
                </div>
              )}
            </div>

            {isRestricted ? (
               <div className="bg-red-50 dark:bg-red-900/20 rounded-[2rem] p-12 text-center border-2 border-red-200 dark:border-red-800 flex flex-col items-center justify-center gap-4 animate-shake">
                  <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-800 flex items-center justify-center text-3xl">🚫</div>
                  <div>
                      <h3 className="text-2xl font-black text-red-600 dark:text-red-400 uppercase tracking-tight">Access Denied</h3>
                      <p className="text-red-500 dark:text-red-300 font-bold text-sm mt-2">
                         Orders are disabled for @{username} (Blacklisted).
                      </p>
                  </div>
               </div>
            ) : !selectedBaleId ? (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-[2rem] p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-600 flex flex-col items-center justify-center gap-3">
                 <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xl animate-bounce">👆</div>
                 <p className="text-gray-400 dark:text-gray-300 font-black uppercase tracking-widest text-xs">Please select a Batch above to enable pricing</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 mb-8">
                   <button onClick={() => addToCart(0, true)} className="aspect-square rounded-[2rem] bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200 font-black text-xs flex flex-col items-center justify-center border-4 border-white dark:border-gray-700 shadow-lg hover:scale-105 active:scale-95 transition-all">🎁<br/>FREEBIE</button>
                   {PRESET_PRICES.map(price => (
                     <button key={price} onClick={() => addToCart(price)} className="aspect-square rounded-[2rem] bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 font-black text-2xl text-gray-900 dark:text-white hover:border-pawPinkDark hover:text-pawPinkDark hover:scale-105 active:scale-95 transition-all shadow-md">
                       {price}
                     </button>
                   ))}
                </div>
                <div className="flex gap-4">
                   <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-[1.8rem] p-1 border-2 border-gray-100 dark:border-gray-600 focus-within:border-pawPinkDark transition-all">
                      <input type="number" placeholder="Other Price..." value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && customPrice && addToCart(Number(customPrice))} className="w-full bg-transparent p-5 rounded-[1.5rem] font-black text-xl text-gray-900 dark:text-white outline-none" />
                   </div>
                   <button onClick={() => customPrice && addToCart(Number(customPrice))} className="bg-pawPinkDark text-white px-12 rounded-[1.8rem] font-black uppercase text-xs tracking-widest hover:bg-red-400 active:scale-95 transition-all shadow-lg">Add to Cart</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 space-y-6">
         <div className="bg-pawSoftBlue dark:bg-slate-800 p-8 rounded-[3rem] border-4 border-white dark:border-gray-700 shadow-2xl flex flex-col h-[750px] sticky top-4 transition-colors">
            <div className="flex items-center justify-between mb-8 shrink-0">
               <h3 className="text-2xl font-black text-blue-950 dark:text-blue-100 uppercase tracking-tight flex items-center gap-4"><CartIcon className="w-8 h-8" /> Live Cart</h3>
               <button 
                 onClick={() => setShowSessionOrders(true)} 
                 className="bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-700 text-blue-900 dark:text-blue-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
               >
                 📝 History / Edit
               </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-8 bg-white/80 dark:bg-gray-800/80 rounded-[2.5rem] p-6 shadow-inner border-2 border-white dark:border-gray-600">
               {cart.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-40">
                    <div className="text-6xl">🧺</div>
                    <p className="text-sm font-black uppercase tracking-widest text-blue-900 dark:text-blue-200">Cart is Empty</p>
                 </div>
               ) : cart.map((item) => (
                 <div key={item.id} className="flex justify-between items-center bg-white dark:bg-gray-700 p-4 rounded-2xl border border-blue-50 dark:border-gray-600 shadow-sm animate-slideIn">
                    <div className="flex items-center gap-4">
                      <div className="bg-pawPinkDark text-white w-10 h-10 rounded-full flex items-center justify-center text-xs font-black">{item.quantity}x</div>
                      <div>
                        {item.isFreebie ? (
                           <p className="font-black text-orange-500 dark:text-orange-400 text-lg flex items-center gap-1">
                              FREEBIE 🎁
                           </p>
                        ) : (
                           <p className="font-black text-gray-950 dark:text-white text-lg">₱{item.price}</p>
                        )}
                        <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide mt-1">
                          {bales.find(b => b.id === item.baleId)?.name}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} className="w-10 h-10 flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded-full hover:bg-red-600 hover:text-white transition-all font-black text-xl shadow-sm">×</button>
                 </div>
               ))}
            </div>
            
            <div className="bg-white dark:bg-gray-700 rounded-[2.5rem] p-8 mb-8 shadow-md border-2 border-blue-50 dark:border-gray-600 relative overflow-hidden group shrink-0 transition-colors">
               <div className="flex justify-between items-end relative z-10 mb-4">
                  <span className="text-[11px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Total Bill</span>
                  <div className="text-right">
                     {useVipTicket && calculatedDiscount > 0 && <span className="text-sm text-gray-400 dark:text-gray-400 line-through font-bold mr-2">₱{cartTotal.toLocaleString()}</span>}
                     <span className="text-5xl font-black text-gray-900 dark:text-white">₱{finalTotal.toLocaleString()}</span>
                  </div>
               </div>
               
               {currentCustomer && currentCustomer.vipTickets > 0 && (
                 <div className="mb-4 space-y-3 relative z-20">
                    <button 
                        onClick={() => setUseVipTicket(!useVipTicket)}
                        className={`w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest border-2 transition-all flex justify-center items-center gap-2 ${
                           useVipTicket 
                             ? 'bg-yellow-400 border-yellow-400 text-white shadow-lg' 
                             : 'bg-white dark:bg-gray-800 border-yellow-200 dark:border-yellow-600 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-gray-700'
                        }`}
                      >
                         {useVipTicket ? '★ VIP Ticket Applied (-1)' : 'Use VIP Ticket'}
                     </button>
                     
                     {useVipTicket && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3 border-2 border-yellow-100 dark:border-yellow-700 animate-scaleUp space-y-2">
                           <p className="text-[9px] font-black text-yellow-700 dark:text-yellow-400 uppercase tracking-widest mb-1">Select Discount Type</p>
                           <div className="grid grid-cols-3 gap-2">
                             {(['NONE', 'FIXED', 'PERCENTAGE'] as const).map(type => (
                                <button
                                  key={type}
                                  onClick={() => setVipDiscountType(type)}
                                  className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                     vipDiscountType === type 
                                       ? 'bg-yellow-400 text-white border-yellow-400' 
                                       : 'bg-white dark:bg-gray-800 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  {type === 'NONE' ? 'None' : type === 'FIXED' ? 'Value' : '%'}
                                </button>
                             ))}
                           </div>

                           {vipDiscountType !== 'NONE' && (
                             <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl px-4 py-2 border border-yellow-200 dark:border-yellow-700 mt-2">
                                <span className="text-[10px] font-black text-yellow-700 dark:text-yellow-400 uppercase mr-3 shrink-0">
                                  {vipDiscountType === 'FIXED' ? 'Less: ₱' : 'Less: %'}
                                </span>
                                <input 
                                  type="number" 
                                  value={vipDiscount || ''} 
                                  onChange={(e) => setVipDiscount(Number(e.target.value))}
                                  placeholder="0"
                                  className="w-full bg-transparent font-black text-lg text-yellow-900 dark:text-yellow-100 outline-none placeholder:text-yellow-300"
                                />
                             </div>
                           )}
                        </div>
                     )}
                 </div>
               )}
               
               <div className="absolute top-0 right-0 w-32 h-32 bg-pawPink/10 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
            </div>
            
            <div className="flex flex-col gap-3">
               <button 
                  onClick={handleCheckout} 
                  disabled={cart.length === 0 || !username || isRestricted} 
                  className={`w-full py-7 rounded-[2.5rem] font-black uppercase text-sm tracking-widest transition-all shrink-0 ${
                      cart.length === 0 || !username || isRestricted 
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border-2 border-gray-100 dark:border-gray-600' 
                        : 'bg-pawPinkDark text-white hover:bg-red-400 shadow-2xl shadow-pawPinkDark/40 active:scale-95'
                  }`}
               >
                  {feedback || (isRestricted ? '🚫 Restricted' : 'Finalize Transaction')}
               </button>
            </div>
         </div>
      </div>

      {showStartModal && <StartSessionModal onClose={() => setShowStartModal(false)} onStart={handleCreateSession} />}
      {showScheduleModal && <ScheduleModal onClose={() => setShowScheduleModal(false)} onSet={setScheduledTime} />}
      {oosModalData && <OutOfStockModal data={oosModalData} onClose={() => setOosModalData(null)} />}
      
      {showSessionOrders && (
        <SessionOrdersModal 
          sessionId={session.id} 
          onClose={() => setShowSessionOrders(false)} 
          onEdit={handleEditCustomer}
        />
      )}
      
      {showEndConfirmation && (
         <EndSessionModal 
            onClose={() => setShowEndConfirmation(false)} 
            onConfirm={confirmEndSession} 
            isManual={session.id === OFF_LIVE_ID}
         />
      )}
      
      {finishedSessionData && (
         <SessionSummaryModal 
            data={finishedSessionData}
            onClose={finalizeSessionClose}
         />
      )}
    </div>
  );
};

// ... (Sub-components like SessionSummaryModal, SessionReview etc. remain unchanged)
const SessionSummaryModal = ({ data, onClose }: { data: SessionSummaryData, onClose: () => void }) => {
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[3.5rem] p-0 overflow-hidden shadow-2xl animate-scaleUp border-4 border-pawPink relative">
         <div className="bg-pawSoftBlue dark:bg-slate-700 p-10 text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full opacity-20">
                <div className="absolute top-4 left-4 text-4xl animate-bounce">🎉</div>
                <div className="absolute bottom-4 right-4 text-4xl animate-bounce" style={{ animationDelay: '0.2s' }}>🐾</div>
             </div>
             <div className="relative z-10">
                <h3 className="text-3xl font-black text-blue-950 dark:text-blue-100 uppercase tracking-tight mb-2">Live Session Recap</h3>
                <p className="text-blue-600 dark:text-blue-300 font-bold uppercase tracking-widest text-xs">Great job today! Here are your stats.</p>
             </div>
         </div>
         
         <div className="p-8 space-y-6">
            <div className="text-center mb-6">
               <p className="text-[10px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest mb-1">{data.name}</p>
               <p className="text-xs font-bold text-gray-300 dark:text-gray-500 uppercase">{data.date}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="bg-purple-50 dark:bg-purple-900/30 p-5 rounded-[2rem] text-center border border-purple-100 dark:border-purple-800">
                  <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-1">Total Sales</p>
                  <p className="text-2xl font-black text-purple-900 dark:text-purple-200">₱{data.totalSales.toLocaleString()}</p>
               </div>
               <div className="bg-pink-50 dark:bg-pink-900/30 p-5 rounded-[2rem] text-center border border-pink-100 dark:border-pink-800">
                  <p className="text-[9px] font-black text-pink-400 uppercase tracking-widest mb-1">Items Sold</p>
                  <p className="text-2xl font-black text-pink-900 dark:text-pink-200">{data.totalItems}</p>
               </div>
            </div>

            {data.topCustomer && (
               <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-[2.5rem] border border-yellow-200 dark:border-yellow-800 flex items-center gap-4 shadow-sm">
                  <div className="w-12 h-12 bg-yellow-400 text-yellow-900 rounded-full flex items-center justify-center font-black text-xl shrink-0">👑</div>
                  <div className="flex-1">
                     <p className="text-[9px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-1">Top Spender</p>
                     <p className="text-lg font-black text-yellow-900 dark:text-yellow-200 leading-none">@{data.topCustomer.username}</p>
                     <p className="text-xs font-bold text-yellow-700 dark:text-yellow-500 mt-1">Spent ₱{data.topCustomer.total.toLocaleString()}</p>
                  </div>
               </div>
            )}
            
            <button 
               onClick={onClose} 
               className="w-full py-6 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-3xl shadow-xl hover:bg-red-400 active:scale-95 transition-all"
            >
               Finish & Close
            </button>
         </div>
      </div>
    </div>, document.body
  );
};

const SessionReview = ({ session, onBack }: { session: LiveSession, onBack: () => void }) => {
  const sessionOrders = useMemo(() => db.getOrders().filter(o => o.sessionId === session.id), [session.id]);
  const total = sessionOrders.reduce((sum, o) => sum + o.totalPrice, 0);

  const grouped = useMemo(() => {
    const g: Record<string, { username: string; total: number; count: number; orders: Order[] }> = {};
    sessionOrders.forEach(o => {
       if(!g[o.customerUsername]) {
          g[o.customerUsername] = { username: o.customerUsername, total: 0, count: 0, orders: [] };
       }
       g[o.customerUsername].total += o.totalPrice;
       g[o.customerUsername].count += o.quantity;
       g[o.customerUsername].orders.push(o);
    });
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [sessionOrders]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (username: string) => {
    const next = new Set(expanded);
    if(next.has(username)) next.delete(username);
    else next.add(username);
    setExpanded(next);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fadeIn pb-32">
        <button onClick={onBack} className="text-sm font-black text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 px-6 py-3 rounded-2xl border-2 border-pawPink dark:border-gray-700 shadow-sm">← Back to Dashboard</button>
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] border-2 border-pawPink dark:border-gray-700 shadow-lg transition-colors">
           <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-2 leading-none">{session.name}</h2>
           <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">{session.date}</p>
           
           <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-pawSoftBlue dark:bg-slate-700 p-6 rounded-[2rem]">
                 <p className="text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase tracking-widest mb-1">Total Sales</p>
                 <p className="text-2xl font-black text-blue-950 dark:text-blue-100">₱{total.toLocaleString()}</p>
              </div>
              <div className="bg-pawPink/20 dark:bg-gray-700 p-6 rounded-[2rem]">
                 <p className="text-[10px] font-black text-pawPinkDark uppercase tracking-widest mb-1">Items Sold</p>
                 <p className="text-2xl font-black text-pawPinkDark">{sessionOrders.reduce((sum, o) => sum + o.quantity, 0)}</p>
              </div>
           </div>

           <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-2">Customer Summary</h4>
              {grouped.length === 0 ? (
                 <p className="text-center text-gray-400 text-xs font-bold">No transactions found.</p>
              ) : grouped.map(group => (
                 <div key={group.username} className="bg-gray-50 dark:bg-gray-700 rounded-2xl border border-gray-100 dark:border-gray-600 overflow-hidden transition-all hover:border-pawPink/50">
                    <button 
                        onClick={() => toggle(group.username)}
                        className="w-full flex justify-between items-center p-4 text-left"
                    >
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center font-black text-xs border border-gray-200 dark:border-gray-500 shadow-sm">
                             {group.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                             <p className="font-bold text-gray-800 dark:text-white leading-none">@{group.username}</p>
                             <p className="text-[10px] text-gray-400 dark:text-gray-400 font-bold uppercase mt-1">{group.count} Items</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="font-black text-gray-950 dark:text-gray-100">₱{group.total.toLocaleString()}</span>
                          <span className={`text-[10px] text-gray-400 transform transition-transform duration-300 ${expanded.has(group.username) ? 'rotate-180' : ''}`}>▼</span>
                       </div>
                    </button>
                    
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded.has(group.username) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                       <div className="overflow-hidden">
                          <div className="bg-white dark:bg-gray-800 border-t border-dashed border-gray-200 dark:border-gray-600 p-3 space-y-2">
                              {group.orders.map((o, idx) => (
                                 <div key={o.id} className="flex justify-between items-center text-xs px-2 py-1 bg-gray-50/50 dark:bg-gray-700/50 rounded-lg">
                                    <span className="font-bold text-gray-600 dark:text-gray-300">{o.productName} ({o.quantity}x)</span>
                                    <span className="font-black text-gray-800 dark:text-gray-100">₱{o.totalPrice}</span>
                                 </div>
                              ))}
                          </div>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
        </div>
    </div>
  )
}

const EndSessionModal = ({ onClose, onConfirm, isManual }: any) => (
  createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 text-center animate-scaleUp shadow-2xl border-4 border-red-500">
         <div className="bg-red-100 dark:bg-red-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-5xl">⚠️</span></div>
         <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
            {isManual ? 'Exit Manual Mode?' : 'End Live Session?'}
         </h3>
         <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8 leading-relaxed">
            {isManual 
              ? 'Unsaved items in the cart will be cleared.' 
              : 'This will close the session and save all sales records. You cannot undo this.'}
         </p>
         <div className="flex gap-3">
             <button onClick={onClose} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-black uppercase text-xs tracking-widest rounded-2xl active:scale-95 transition-all">Cancel</button>
             <button onClick={onConfirm} className="flex-1 py-4 bg-red-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-red-200 active:scale-95 transition-all">
                {isManual ? 'Exit' : 'End Live'}
             </button>
         </div>
      </div>
    </div>, document.body
  )
);

const SessionOrdersModal = ({ sessionId, onClose, onEdit }: { sessionId: string; onClose: () => void; onEdit: (username: string) => void }) => {
  const orders = db.getOrders().filter(o => o.sessionId === sessionId);
  
  const groups = useMemo(() => {
     const g: Record<string, { username: string, count: number, total: number, lastTime: number, usedVip: boolean }> = {};
     orders.forEach(o => {
        if (!g[o.customerUsername]) {
           g[o.customerUsername] = { username: o.customerUsername, count: 0, total: 0, lastTime: o.createdAt, usedVip: false };
        }
        g[o.customerUsername].count += o.quantity;
        g[o.customerUsername].total += o.totalPrice;
        g[o.customerUsername].lastTime = Math.max(g[o.customerUsername].lastTime, o.createdAt);
        if(o.usedVipTicket) g[o.customerUsername].usedVip = true;
     });
     return Object.values(g).sort((a, b) => b.lastTime - a.lastTime);
  }, [orders]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3.5rem] overflow-hidden shadow-2xl animate-scaleUp flex flex-col max-h-[80vh]">
         <div className="bg-pawSoftBlue dark:bg-slate-700 p-8 flex justify-between items-center shrink-0">
            <div>
              <h3 className="text-2xl font-black text-blue-950 dark:text-blue-100 uppercase tracking-tight">Recent Activity</h3>
              <p className="text-xs font-black text-blue-400 dark:text-blue-300 uppercase tracking-wider">Tap to Edit Order</p>
            </div>
            <button onClick={onClose} className="bg-white dark:bg-gray-600 text-blue-900 dark:text-blue-100 w-10 h-10 rounded-full font-black flex items-center justify-center shadow-sm">✕</button>
         </div>
         <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {groups.length === 0 ? (
               <p className="text-center text-gray-400 font-black uppercase py-10">No orders recorded yet.</p>
            ) : groups.map(group => (
               <button 
                 key={group.username} 
                 onClick={() => onEdit(group.username)}
                 className="w-full bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 p-5 rounded-[2rem] flex justify-between items-center shadow-sm hover:border-pawPinkDark hover:bg-pawPink/10 dark:hover:bg-gray-600 transition-all group"
               >
                  <div className="flex items-center gap-4 text-left">
                     <div className="w-12 h-12 rounded-full bg-pawSoftBlue dark:bg-slate-600 text-blue-600 dark:text-blue-200 flex items-center justify-center font-black text-xl">
                        {group.username.charAt(0).toUpperCase()}
                     </div>
                     <div>
                        <p className="font-black text-gray-800 dark:text-white text-lg group-hover:text-pawPinkDark transition-colors">
                           @{group.username} 
                           {group.usedVip && <span className="ml-2 text-[8px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded uppercase align-middle">Used Ticket</span>}
                        </p>
                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase">{group.count} Items Encoded</p>
                     </div>
                  </div>
                  <div className="text-right">
                     <p className="font-black text-gray-950 dark:text-gray-100 text-xl">₱{group.total.toLocaleString()}</p>
                     <p className="text-[9px] font-black text-pawPinkDark uppercase tracking-widest">Edit &rarr;</p>
                  </div>
               </button>
            ))}
         </div>
      </div>
    </div>, document.body
  );
};

const StartSessionModal = ({ onClose, onStart }: any) => {
  const [name, setName] = useState('');
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[3.5rem] p-10 space-y-8 animate-scaleUp shadow-2xl border-4 border-pawPink">
         <div className="space-y-2 text-center">
            <h3 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Set Session Title</h3>
            <p className="text-xs font-black text-gray-400 dark:text-gray-400 uppercase tracking-[0.2em]">Morning Live / Clearance / New Arrival</p>
         </div>
         <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saturday Night Sale" className="w-full bg-gray-50 dark:bg-gray-700 p-6 rounded-[2rem] font-black text-2xl text-center text-gray-900 dark:text-white outline-none border-4 border-transparent focus:border-pawPinkDark transition-all shadow-inner" />
         <div className="flex gap-4">
            <button onClick={onClose} className="flex-1 py-6 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-300 font-black uppercase text-xs tracking-widest rounded-3xl">Cancel</button>
            <button onClick={() => name && onStart(name)} className="flex-1 py-6 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-3xl shadow-xl hover:bg-red-400">Go Live Now</button>
         </div>
      </div>
    </div>, document.body
  );
};

const ScheduleModal = ({ onClose, onSet }: any) => {
  const [time, setTime] = useState('');
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 space-y-8 animate-scaleUp text-center shadow-2xl border-4 border-pawPink">
         <h3 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Schedule Start</h3>
         <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="bg-pawCream dark:bg-gray-700 p-10 rounded-[2.5rem] text-6xl font-black w-full text-center outline-none border-4 border-transparent focus:border-pawPinkDark transition-all shadow-inner dark:text-white" />
         <div className="flex gap-4">
            <button onClick={onClose} className="flex-1 py-6 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-300 font-black uppercase text-xs tracking-widest rounded-3xl">Cancel</button>
            <button onClick={() => { if(!time) return; const [h, m] = time.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); onSet(d); onClose(); }} className="flex-1 py-6 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-3xl shadow-xl hover:bg-red-400">Confirm Time</button>
         </div>
      </div>
    </div>, document.body
  );
};

const OutOfStockModal: React.FC<{ data: { name: string; total: number; sold: number }; onClose: () => void }> = ({ data, onClose }) => (
  createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-12 text-center animate-scaleUp shadow-2xl border-4 border-red-500">
         <div className="bg-red-100 dark:bg-red-900/30 w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-10"><span className="text-6xl">🚫</span></div>
         <h3 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-4">Batch Empty</h3>
         <p className="text-gray-600 dark:text-gray-300 font-bold text-lg mb-10 leading-relaxed">The inventory for <span className="text-red-600 font-black">"{data.name}"</span> is fully dispersed.</p>
         <button onClick={onClose} className="w-full py-6 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-3xl active:scale-95 transition-all hover:bg-red-400">Understood</button>
      </div>
    </div>, document.body
  )
);

export default LiveSell;
