
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { useSettings } from '../services/SettingsContext';
import { Product, Order, PaymentStatus, ShippingStatus, LiveSession, Bale, Customer, PaymentMethod } from '../types';
import { PlusIcon, PawIcon, CartIcon } from '../components/Icons';

const OFF_LIVE_ID = 'OFF_LIVE';
const STORAGE_KEY_STATE = 'paw_live_state';

// ... (Interfaces remain unchanged)
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
  const { logoUrl, presetPrices } = useSettings();
  
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

  // Transaction Payment State
  const [txPaymentMethod, setTxPaymentMethod] = useState<PaymentMethod | ''>('');
  const [txAmountPaid, setTxAmountPaid] = useState<number | ''>('');

  const [customPrice, setCustomPrice] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [showClearCartModal, setShowClearCartModal] = useState(false);
  
  // New State for Post-Session Summary
  const [finishedSessionData, setFinishedSessionData] = useState<SessionSummaryData | null>(null);

  const [oosModalData, setOosModalData] = useState<{ name: string; total: number; sold: number } | null>(null);
  const [todaysHistory, setTodaysHistory] = useState<LiveSession[]>([]);
  const [viewingHistory, setViewingHistory] = useState<LiveSession | null>(null);
  const [showSessionOrders, setShowSessionOrders] = useState(false);
  
  // Live Customer Data & Trigger for Updates
  const [dataTick, setDataTick] = useState(0); // Used to force refresh of inventory data
  const [allCustomers, setAllCustomers] = useState<Customer[]>(db.getCustomers());
  
  // Calculate Bale Availability for Button Grid (Filtered by 'On Sale')
  const baleAvailability = useMemo(() => {
    const currentBales = db.getBales();
    const currentOrders = db.getOrders();
    const currentProducts = db.getProducts();
    
    // FILTER: Only show 'On Sale' batches as requested
    return currentBales.filter(b => b.status === 'On Sale').map(b => {
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
  const totalItemsInCart = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const calculatedDiscount = useMemo(() => {
     if (!useVipTicket) return 0;
     if (vipDiscountType === 'NONE') return 0;
     if (vipDiscountType === 'FIXED') return Math.min(vipDiscount, cartTotal);
     if (vipDiscountType === 'PERCENTAGE') return cartTotal * (Math.min(vipDiscount, 100) / 100);
     return 0;
  }, [useVipTicket, vipDiscountType, vipDiscount, cartTotal]);

  const finalTotal = Math.max(0, cartTotal - calculatedDiscount);

  // Auto-fill Amount Paid when Payment Method is selected
  useEffect(() => {
    if (txPaymentMethod !== '') {
        setTxAmountPaid(finalTotal);
    } else {
        setTxAmountPaid('');
    }
  }, [txPaymentMethod, finalTotal]);

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
      setTxPaymentMethod('');
      setTxAmountPaid('');
  };

  const addToCart = (inputPrice: number, isFreebie: boolean = false) => {
    if (isRestricted) {
        setFeedback("🚫 Action Blocked");
        setTimeout(() => setFeedback(null), 1000);
        return;
    }

    if (!selectedBaleId) {
        setFeedback("Select Batch First");
        setTimeout(() => setFeedback(null), 1500);
        return;
    }

    const stats = getBaleStats(selectedBaleId);
    if (stats.remaining <= 0) {
      setOosModalData({ name: bales.find(b => b.id === selectedBaleId)?.name || '', total: stats.total, sold: stats.sold });
      return;
    }
    const price = isFreebie ? 0 : inputPrice;
    setCart(prev => {
      // Find exact item match (Price + Freebie status + Batch ID)
      const idx = prev.findIndex(i => 
          i.price === price && 
          i.isFreebie === isFreebie && 
          i.baleId === selectedBaleId
      );
      if (idx > -1) {
        const next = [...prev];
        const existingItem = next[idx];
        next.splice(idx, 1);
        return [{ ...existingItem, quantity: existingItem.quantity + 1 }, ...next];
      }
      return [{ 
          id: `c_${Date.now()}_${Math.random()}`, 
          price, 
          quantity: 1, 
          isFreebie, 
          baleId: selectedBaleId 
      }, ...prev];
    });
    setCustomPrice('');
  };
  
  const confirmClearCart = () => {
    setCart([]);
    setTxAmountPaid('');
    setUseVipTicket(false);
    setShowClearCartModal(false);
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    setShowClearCartModal(true);
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
    
    // Prepare Payment Data for the entire transaction
    const globalPaidInput = txAmountPaid === '' ? 0 : txAmountPaid;
    const isGlobalPaid = txPaymentMethod !== '';
    
    // Logic to distribute payment across items (if partial) or mark all paid
    let runningPaid = 0;

    cart.forEach((item, idx) => {
      // Calculate unit price after discount
      let finalItemTotal = item.price * item.quantity;
      let finalItemPrice = item.price;
      
      if (useVipTicket && totalDiscountAmount > 0 && !item.isFreebie) {
          finalItemPrice = item.price * (1 - discountRatio);
          finalItemTotal = finalItemPrice * item.quantity;
      }
      
      // Determine Payment Status for this item
      let itemPaymentStatus = PaymentStatus.UNPAID;
      let itemAmountPaid = 0;

      if (item.isFreebie) {
          itemPaymentStatus = PaymentStatus.PAID;
          itemAmountPaid = 0;
      } else {
          if (isGlobalPaid) {
             if (finalTotal > 0) {
                 // Distribute payment proportional to item's share of total
                 const share = finalItemTotal / finalTotal;
                 itemAmountPaid = share * globalPaidInput;
             } else {
                 itemAmountPaid = 0; // Total is 0?
             }
             
             // Check status based on item coverage (allow small floating point error)
             if (itemAmountPaid >= finalItemTotal - 0.01) {
                 itemPaymentStatus = PaymentStatus.PAID;
             } else if (itemAmountPaid > 0) {
                 itemPaymentStatus = PaymentStatus.PARTIAL;
             } else {
                 itemPaymentStatus = PaymentStatus.UNPAID;
             }
          }
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
        quantity: item.quantity, 
        totalPrice: finalItemTotal, 
        isFreebie: item.isFreebie, 
        paymentStatus: itemPaymentStatus, 
        shippingStatus: ShippingStatus.PENDING, 
        amountPaid: itemAmountPaid, 
        paymentMethod: txPaymentMethod || undefined, 
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
    setTxPaymentMethod(''); // Reset payment method
    setTxAmountPaid('');    // Reset amount
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
       
       newCartItems.push({
           id: `c_restored_${order.id}`,
           price: unitPrice, 
           quantity: order.quantity,
           isFreebie: order.isFreebie,
           baleId: baleId,
       });
    });
    
    // 1. Delete old orders immediately to prevent duplication on save
    sessionOrders.forEach(o => db.deleteOrder(o.id));
    
    // 2. Return VIP ticket momentarily (will be re-applied if ticketUsed is true)
    if (ticketUsed) {
      const cust = db.getOrCreateCustomer(targetUsername);
      cust.vipTickets += 1;
      db.updateCustomer(cust);
      setAllCustomers(db.getCustomers());
    }

    // 3. Update UI State
    setCart(newCartItems);
    setUsername(targetUsername);
    setTransactionNo(sessionOrders[0].referenceNumber || '');
    setUseVipTicket(ticketUsed);
    setVipDiscount(0);
    setVipDiscountType('NONE');
    setTxPaymentMethod(''); // Reset payment on edit, user must set again
    setTxAmountPaid('');
    
    // 4. Force refresh of data views
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

  // ... (Manual Entry and Schedule Modals - same code) ...
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

  // ... (Main LiveSell Return Structure) ...
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 pb-32 max-w-full">
      {/* ... Left Side Content (Inputs, Grid) ... */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-6">
        <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-[3rem] shadow-xl border-2 border-pawPink/40 relative transition-colors">
          {/* Header */}
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

          {/* Customer & Ref */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
             <div className="relative">
                <div className="flex justify-between items-center mb-2 ml-4 min-h-[1.5rem]">
                  <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase tracking-widest">Customer Username</label>
                  {username && (
                    <div className="flex items-center gap-2 animate-fadeIn">
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
                <div className="flex justify-between items-center mb-2 ml-4 min-h-[1.5rem]">
                    <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase tracking-widest block">Order Reference / Notes</label>
                </div>
                <input type="text" placeholder="Optional" value={transactionNo} onChange={(e) => setTransactionNo(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 focus:border-pawPinkDark p-5 rounded-[1.8rem] text-xl font-black text-gray-900 dark:text-white outline-none transition-all shadow-inner placeholder:text-gray-300" />
             </div>
          </div>

          {/* Batch Selection */}
          <div className={`mb-10 transition-opacity duration-300 ${isRestricted ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
            <label className="text-[11px] font-black text-gray-900 dark:text-gray-300 uppercase ml-4 tracking-widest block mb-2">
                {isRestricted ? 'Batch Selection (Locked)' : 'Active Batch Selection'}
            </label>
            
            {/* NEW BUTTON GRID for Batch Selection */}
            {baleAvailability.length === 0 ? (
                <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-2xl text-center border-2 border-dashed border-gray-200 dark:border-gray-600">
                   <p className="text-gray-400 dark:text-gray-500 font-bold text-xs uppercase">No active 'On Sale' batches found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {baleAvailability.map(b => (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBaleId(b.id)}
                          disabled={isRestricted}
                          className={`flex flex-col items-center justify-center p-4 rounded-[1.5rem] border-2 transition-all active:scale-95 shadow-sm ${
                             selectedBaleId === b.id 
                               ? 'bg-pawPinkDark text-white border-pawPinkDark shadow-lg scale-[1.02]' 
                               : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border-gray-100 dark:border-gray-600 hover:border-pawPinkDark dark:hover:border-pawPinkDark'
                          }`}
                        >
                            <span className="font-black text-sm uppercase leading-none text-center">{b.name}</span>
                            <span className={`text-[10px] mt-1 font-bold uppercase ${selectedBaleId === b.id ? 'text-white/80' : 'text-gray-400'}`}>
                                {b.remaining} Left
                            </span>
                        </button>
                    ))}
                </div>
            )}
          </div>

          {/* Pricing Panel */}
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
                   {presetPrices.map(price => (
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

      {/* ... Right Side Cart (Same as previous) ... */}
      <div className="lg:col-span-5 xl:col-span-4 space-y-6">
         <div className="bg-pawSoftBlue dark:bg-slate-800 p-5 rounded-[2.5rem] border-4 border-white dark:border-gray-700 shadow-2xl flex flex-col h-auto min-h-[500px] lg:h-[calc(100vh-6rem)] lg:sticky lg:top-4 transition-colors">
            
            {/* Header with Clear Button */}
            <div className="flex items-center justify-between mb-4 shrink-0 px-2">
               <h3 className="text-xl font-black text-blue-950 dark:text-blue-100 uppercase tracking-tight flex items-center gap-3">
                  <CartIcon className="w-6 h-6" /> Live Cart
               </h3>
               <div className="flex gap-2">
                 {cart.length > 0 && (
                    <button 
                      onClick={handleClearCart} 
                      className="bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm"
                    >
                      Clear
                    </button>
                 )}
                 <button 
                   onClick={() => setShowSessionOrders(true)} 
                   className="bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-700 text-blue-900 dark:text-blue-200 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm"
                 >
                   History
                 </button>
               </div>
            </div>

            {/* Cart List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-4 bg-white/80 dark:bg-gray-800/80 rounded-[2rem] p-4 shadow-inner border-2 border-white dark:border-gray-600">
               {cart.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center space-y-3 opacity-40">
                    <div className="text-5xl">🧺</div>
                    <p className="text-xs font-black uppercase tracking-widest text-blue-900 dark:text-blue-200">Cart is Empty</p>
                 </div>
               ) : cart.map((item) => (
                 <div key={item.id} className="bg-white dark:bg-gray-700 p-3 rounded-xl border border-blue-50 dark:border-gray-600 shadow-sm animate-slideIn">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="bg-pawPinkDark text-white w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{item.quantity}x</div>
                          <div>
                            {item.isFreebie ? (
                               <p className="font-black text-orange-500 dark:text-orange-400 text-sm flex items-center gap-1">
                                  FREEBIE 🎁
                               </p>
                            ) : (
                               <p className="font-black text-gray-950 dark:text-white text-sm">₱{item.price}</p>
                            )}
                            <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 px-1.5 rounded text-[8px] font-black uppercase tracking-wide">
                              {bales.find(b => b.id === item.baleId)?.name}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} className="w-6 h-6 flex items-center justify-center bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded-full hover:bg-red-600 hover:text-white transition-all font-black text-sm shadow-sm">×</button>
                    </div>
                 </div>
               ))}
            </div>
            
            {/* Summary */}
            <div className="bg-white dark:bg-gray-700 rounded-[2rem] p-5 mb-4 shadow-md border-2 border-blue-50 dark:border-gray-600 relative overflow-hidden group shrink-0 transition-colors">
               <div className="flex justify-between items-center mb-1 pb-2 border-b border-dashed border-gray-200 dark:border-gray-600">
                  <span className="text-[9px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Items</span>
                  <span className="text-sm font-black text-gray-800 dark:text-white">{totalItemsInCart} pcs</span>
               </div>
               
               <div className="flex justify-between items-end relative z-10 mb-3 pt-1">
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Total Bill</span>
                  <div className="text-right">
                     {useVipTicket && calculatedDiscount > 0 && <span className="text-xs text-gray-400 dark:text-gray-400 line-through font-bold mr-2">₱{cartTotal.toLocaleString()}</span>}
                     <span className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-white">₱{finalTotal.toLocaleString()}</span>
                  </div>
               </div>
               
               {currentCustomer && currentCustomer.vipTickets > 0 && (
                 <div className="mb-3 space-y-2 relative z-20">
                    <button 
                        onClick={() => setUseVipTicket(!useVipTicket)}
                        className={`w-full py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest border-2 transition-all flex justify-center items-center gap-2 ${
                           useVipTicket 
                             ? 'bg-yellow-400 border-yellow-400 text-white shadow-md' 
                             : 'bg-white dark:bg-gray-800 border-yellow-200 dark:border-yellow-600 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-gray-700'
                        }`}
                      >
                         {useVipTicket ? '★ VIP Ticket Applied (-1)' : 'Use VIP Ticket'}
                     </button>
                     
                     {useVipTicket && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 border border-yellow-100 dark:border-yellow-700 animate-scaleUp space-y-2">
                           <div className="grid grid-cols-3 gap-1">
                             {(['NONE', 'FIXED', 'PERCENTAGE'] as const).map(type => (
                                <button
                                  key={type}
                                  onClick={() => setVipDiscountType(type)}
                                  className={`py-1.5 rounded text-[8px] font-black uppercase tracking-wider transition-all border ${
                                     vipDiscountType === type 
                                       ? 'bg-yellow-400 text-white border-yellow-400' 
                                       : 'bg-white dark:bg-gray-800 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  {type === 'NONE' ? 'None' : type === 'FIXED' ? 'Val' : '%'}
                                </button>
                             ))}
                           </div>

                           {vipDiscountType !== 'NONE' && (
                             <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg px-3 py-1 border border-yellow-200 dark:border-yellow-700">
                                <span className="text-[9px] font-black text-yellow-700 dark:text-yellow-400 uppercase mr-2 shrink-0">
                                  {vipDiscountType === 'FIXED' ? 'Less: ₱' : 'Less: %'}
                                </span>
                                <input 
                                  type="number" 
                                  value={vipDiscount || ''} 
                                  onChange={(e) => setVipDiscount(Number(e.target.value))}
                                  placeholder="0"
                                  className="w-full bg-transparent font-black text-sm text-yellow-900 dark:text-yellow-100 outline-none placeholder:text-yellow-300"
                                />
                             </div>
                           )}
                        </div>
                     )}
                 </div>
               )}

               {/* Payment */}
               <div className="mt-3 bg-gray-50 dark:bg-gray-600 p-3 rounded-xl relative z-20 space-y-1.5">
                   <p className="text-[8px] font-black text-gray-400 dark:text-gray-300 uppercase tracking-widest">Transaction Payment</p>
                   <div className="flex gap-1.5">
                       <select 
                          value={txPaymentMethod} 
                          onChange={(e) => setTxPaymentMethod(e.target.value as PaymentMethod)}
                          className="flex-1 bg-white dark:bg-gray-700 text-xs font-bold p-2 rounded-lg border-none outline-none text-gray-700 dark:text-white"
                       >
                          <option value="">Unpaid (Later)</option>
                          {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                       </select>
                   </div>
                   {txPaymentMethod !== '' && (
                       <div className="flex items-center bg-white dark:bg-gray-700 px-3 py-1.5 rounded-lg">
                           <span className="text-gray-400 dark:text-gray-400 font-bold mr-2 text-[10px]">Amt Paid: ₱</span>
                           <input 
                              type="number" 
                              value={txAmountPaid}
                              onChange={(e) => setTxAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0"
                              className="w-full bg-transparent font-black text-sm text-green-600 dark:text-green-400 outline-none"
                           />
                       </div>
                   )}
               </div>
               <div className="absolute top-0 right-0 w-24 h-24 bg-pawPink/10 rounded-bl-full -mr-8 -mt-8 group-hover:scale-110 transition-transform"></div>
            </div>
            
            <div className="flex flex-col gap-2">
               <button 
                  onClick={handleCheckout} 
                  disabled={cart.length === 0 || !username || isRestricted} 
                  className={`w-full py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest transition-all shrink-0 ${
                      cart.length === 0 || !username || isRestricted 
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border-2 border-gray-100 dark:border-gray-600' 
                        : 'bg-pawPinkDark text-white hover:bg-red-400 shadow-xl shadow-pawPinkDark/40 active:scale-95'
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

      {showClearCartModal && (
        <ClearCartModal 
            onClose={() => setShowClearCartModal(false)}
            onConfirm={confirmClearCart}
        />
      )}
    </div>
  );
};

// ... (Existing Modals: SessionSummaryModal, SessionReview, EndSessionModal, ClearCartModal) ...

const SessionOrdersModal = ({ sessionId, onClose, onEdit }: { sessionId: string; onClose: () => void; onEdit: (username: string) => void }) => {
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<string | null>(null);
  // Forces a re-render when we modify DB directly via deletion
  const [tick, setTick] = useState(0); 
  
  const orders = useMemo(() => db.getOrders().filter(o => o.sessionId === sessionId), [sessionId, tick]);
  
  const groups = useMemo(() => {
     const g: Record<string, { username: string, count: number, total: number, lastTime: number, usedVip: boolean, items: string[], refNumber?: string }> = {};
     orders.forEach(o => {
        if (!g[o.customerUsername]) {
           g[o.customerUsername] = { username: o.customerUsername, count: 0, total: 0, lastTime: o.createdAt, usedVip: false, items: [] };
        }
        g[o.customerUsername].count += o.quantity;
        g[o.customerUsername].total += o.totalPrice;
        g[o.customerUsername].lastTime = Math.max(g[o.customerUsername].lastTime, o.createdAt);
        
        if(o.usedVipTicket) g[o.customerUsername].usedVip = true;
        
        // Capture reference number (take the latest one if multiple)
        if(o.referenceNumber) g[o.customerUsername].refNumber = o.referenceNumber;

        if (g[o.customerUsername].items.length < 5) { 
            g[o.customerUsername].items.push(o.productName.replace('Live Item ', ''));
        }
     });
     return Object.values(g).sort((a, b) => b.lastTime - a.lastTime);
  }, [orders]);

  const handleManualDelete = () => {
    if (!deleteTargetUser) return;
    const userOrders = db.getOrders().filter(o => o.sessionId === sessionId && o.customerUsername === deleteTargetUser);
    userOrders.forEach(o => db.deleteOrder(o.id));
    if (userOrders.some(o => o.usedVipTicket)) {
       const cust = db.getOrCreateCustomer(deleteTargetUser);
       cust.vipTickets += 1;
       db.updateCustomer(cust);
    }
    setTick(p => p + 1);
    setDeleteTargetUser(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
      {/* Increased height to h-[85vh] to ensure EditTransactionModal has enough space */}
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-[3.5rem] overflow-hidden shadow-2xl animate-scaleUp flex flex-col h-[85vh] relative">
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
               <div 
                 key={group.username} 
                 className="w-full bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 p-5 rounded-[2rem] flex justify-between items-center shadow-sm hover:border-pawPinkDark hover:bg-pawPink/10 dark:hover:bg-gray-600 transition-all group"
               >
                  <button 
                    onClick={() => setEditingUser(group.username)} 
                    className="flex items-center gap-4 text-left flex-1 min-w-0"
                  >
                     <div className="w-12 h-12 rounded-full bg-pawSoftBlue dark:bg-slate-600 text-blue-600 dark:text-blue-200 flex items-center justify-center font-black text-xl flex-shrink-0">
                        {group.username.charAt(0).toUpperCase()}
                     </div>
                     <div className="min-w-0">
                        <p className="font-black text-gray-800 dark:text-white text-lg group-hover:text-pawPinkDark transition-colors truncate">
                           @{group.username} 
                           {group.usedVip && <span className="ml-2 text-[8px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded uppercase align-middle">Used Ticket</span>}
                        </p>
                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase">{group.count} Items Encoded</p>
                        {group.refNumber && (
                           <p className="text-[10px] font-bold text-gray-500 dark:text-gray-300 italic truncate mt-0.5">"{group.refNumber}"</p>
                        )}
                        <div className="flex gap-1 mt-1 overflow-hidden">
                            {group.items.map((it, idx) => (
                                <span key={idx} className="text-[9px] bg-gray-100 dark:bg-gray-600 px-1.5 rounded text-gray-500 dark:text-gray-300 whitespace-nowrap">{it}</span>
                            ))}
                            {group.count > group.items.length && <span className="text-[9px] text-gray-400">...</span>}
                        </div>
                     </div>
                  </button>
                  <div className="flex items-center gap-4 pl-2 flex-shrink-0">
                     <div className="text-right">
                        <p className="font-black text-gray-950 dark:text-gray-100 text-xl">₱{group.total.toLocaleString()}</p>
                        <button 
                            onClick={() => setEditingUser(group.username)}
                            className="text-[9px] font-black text-pawPinkDark uppercase tracking-widest hover:underline"
                        >
                            Edit
                        </button>
                     </div>
                     <button 
                       onClick={() => setDeleteTargetUser(group.username)}
                       className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-600 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors flex items-center justify-center"
                     >
                        🗑️
                     </button>
                  </div>
               </div>
            ))}
         </div>
         
         {/* Render EditTransactionModal inline as an absolute overlay */}
         {editingUser && (
            <div className="absolute inset-0 z-50 bg-white dark:bg-gray-800 flex flex-col animate-slideIn">
               <EditTransactionModal 
                  sessionId={sessionId}
                  username={editingUser}
                  onClose={() => setEditingUser(null)}
                  onConvertToCart={() => {
                      onEdit(editingUser); // Calls parent to load cart
                      setEditingUser(null);
                  }}
                  onRefresh={() => setTick(t => t + 1)}
               />
            </div>
         )}
      </div>
      
      {deleteTargetUser && (
         <DeleteOrderConfirmationModal 
            username={deleteTargetUser} 
            onConfirm={handleManualDelete}
            onClose={() => setDeleteTargetUser(null)}
         />
      )}
    </div>, document.body
  );
};

const EditTransactionModal = ({ sessionId, username, onClose, onConvertToCart, onRefresh }: { sessionId: string, username: string, onClose: () => void, onConvertToCart: () => void, onRefresh: () => void }) => {
  const [tick, setTick] = useState(0);
  
  const orders = useMemo(() => {
     return db.getOrders().filter(o => o.sessionId === sessionId && o.customerUsername === username);
  }, [sessionId, username, tick]);

  const handleDeleteItem = (orderId: string) => {
     db.deleteOrder(orderId);
     setTick(t => t + 1);
     onRefresh(); // Refresh parent list
  };

  useEffect(() => {
     if (orders.length === 0 && tick > 0) {
        onClose();
     }
  }, [orders, tick, onClose]);

  // Render content directly (no createPortal)
  return (
    <>
       <div className="bg-pawPink dark:bg-gray-900 p-6 flex justify-between items-center shrink-0">
          <div>
             <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Edit Transaction</h3>
             <p className="text-xs font-bold text-gray-600 dark:text-gray-400">@{username}</p>
          </div>
          <button onClick={onClose} className="text-xs font-black uppercase text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white">Cancel</button>
       </div>
       
       <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50 dark:bg-gray-800">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Current Items</p>
          {orders.map(item => (
             <div key={item.id} className="bg-white dark:bg-gray-700 p-4 rounded-2xl flex justify-between items-center shadow-sm border border-gray-100 dark:border-gray-600">
                <div className="flex items-center gap-3">
                   <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">
                      {item.quantity}x
                   </div>
                   <div>
                      <p className="font-bold text-gray-800 dark:text-white text-sm leading-tight">{item.productName}</p>
                      {item.isFreebie && <span className="text-[9px] font-black text-orange-500 uppercase">Freebie</span>}
                   </div>
                </div>
                <div className="flex items-center gap-4">
                   <span className="font-black text-gray-800 dark:text-white">₱{item.totalPrice}</span>
                   <button 
                      onClick={() => handleDeleteItem(item.id)}
                      className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center shadow-sm"
                   >
                      🗑️
                   </button>
                </div>
             </div>
          ))}
       </div>

       <div className="p-6 bg-white dark:bg-gray-900 border-t dark:border-gray-700">
          <button 
             onClick={onConvertToCart}
             className="w-full py-4 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-red-400"
          >
             <PlusIcon className="w-4 h-4" /> Add Products / Edit in Cart
          </button>
          <p className="text-[9px] text-gray-400 text-center mt-3">This will move all items to the main cart for editing.</p>
       </div>
    </>
  );
};

// ... (Other Modals: DeleteOrderConfirmationModal, StartSessionModal, ScheduleModal, OutOfStockModal, ClearCartModal, EndSessionModal, SessionSummaryModal, SessionReview remain unchanged)
const DeleteOrderConfirmationModal = ({ username, onConfirm, onClose }: { username: string, onConfirm: () => void, onClose: () => void }) => (
    createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 text-center animate-scaleUp shadow-2xl border-4 border-red-500">
         <div className="bg-red-100 dark:bg-red-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-5xl">🗑️</span></div>
         <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
            Delete Transaction?
         </h3>
         <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8 leading-relaxed">
            Removing all orders for <span className="text-red-600 dark:text-red-400">@{username}</span> in this session. Stock will be returned.
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

const ClearCartModal = ({ onClose, onConfirm }: { onClose: () => void, onConfirm: () => void }) => (
  createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 text-center animate-scaleUp shadow-2xl border-4 border-red-500">
         <div className="bg-red-100 dark:bg-red-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-5xl">🗑️</span></div>
         <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
            Clear Cart?
         </h3>
         <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8 leading-relaxed">
            This will remove all items currently in your cart.
         </p>
         <div className="flex gap-3">
             <button onClick={onClose} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-black uppercase text-xs tracking-widest rounded-2xl active:scale-95 transition-all">Cancel</button>
             <button onClick={onConfirm} className="flex-1 py-4 bg-red-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-red-200 active:scale-95 transition-all">
                Clear
             </button>
         </div>
      </div>
    </div>, document.body
  )
);

const EndSessionModal = ({ onClose, onConfirm, isManual }: { onClose: () => void, onConfirm: () => void, isManual: boolean }) => (
  createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[3.5rem] p-10 text-center animate-scaleUp shadow-2xl border-4 border-pawPink">
         <div className="bg-pawPink/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-5xl">🏁</span></div>
         <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
            {isManual ? 'Exit Manual Mode?' : 'End Live Session?'}
         </h3>
         <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-8 leading-relaxed">
            This will generate a summary report and close the current session.
         </p>
         <div className="flex gap-3">
             <button onClick={onClose} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-black uppercase text-xs tracking-widest rounded-2xl active:scale-95 transition-all">Cancel</button>
             <button onClick={onConfirm} className="flex-1 py-4 bg-pawPinkDark text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all">
                Confirm
             </button>
         </div>
      </div>
    </div>, document.body
  )
);

const SessionSummaryModal = ({ data, onClose }: { data: SessionSummaryData, onClose: () => void }) => (
  createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-fadeIn">
       <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl animate-scaleUp flex flex-col max-h-[90vh]">
          <div className="bg-pawPinkDark p-10 text-center relative overflow-hidden shrink-0">
             <div className="absolute top-0 left-0 w-full h-full opacity-20">
                 <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-white rounded-full blur-3xl"></div>
             </div>
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter relative z-10 mb-2">Session Recap</h2>
             <p className="text-white/80 font-bold uppercase tracking-widest text-xs relative z-10">{data.date}</p>
          </div>
          
          <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl text-center">
                   <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">Total Sales</p>
                   <p className="text-2xl font-black text-gray-800 dark:text-white">₱{data.totalSales.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl text-center">
                   <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">Items Sold</p>
                   <p className="text-2xl font-black text-gray-800 dark:text-white">{data.totalItems}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-2xl text-center col-span-2">
                   <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">Customers</p>
                   <p className="text-2xl font-black text-gray-800 dark:text-white">{data.customerCount}</p>
                </div>
             </div>

             {data.topCustomer && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-100 dark:border-yellow-700 p-6 rounded-3xl text-center">
                   <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-2">🏆 Top Spender</p>
                   <p className="text-xl font-black text-gray-800 dark:text-white">@{data.topCustomer.username}</p>
                   <p className="text-yellow-600 dark:text-yellow-400 font-bold">₱{data.topCustomer.total.toLocaleString()}</p>
                </div>
             )}
          </div>
          
          <div className="p-8 pt-0 mt-auto">
             <button onClick={onClose} className="w-full py-5 bg-gray-900 dark:bg-black text-white font-black uppercase text-xs tracking-widest rounded-3xl shadow-lg active:scale-95 transition-all">
                Close Recap
             </button>
          </div>
       </div>
    </div>, document.body
  )
);

const SessionReview = ({ session, onBack }: { session: LiveSession, onBack: () => void }) => {
   const orders = useMemo(() => db.getOrders().filter(o => o.sessionId === session.id), [session.id]);
   
   return (
     <div className="animate-fadeIn pb-32">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:text-pawPinkDark hover:border-pawPink transition-all mb-6">
           <span>← Back to Menu</span>
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-8 border-2 border-pawPink dark:border-gray-700 shadow-lg mb-8">
           <div className="text-center mb-8">
              <h1 className="text-3xl font-black text-gray-800 dark:text-white tracking-tight">{session.name}</h1>
              <p className="text-gray-400 dark:text-gray-500 font-bold text-sm uppercase tracking-widest mt-1">{session.date}</p>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-[2rem] text-center">
                 <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">Sales</p>
                 <p className="text-2xl font-black text-gray-800 dark:text-white">₱{session.totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-[2rem] text-center">
                 <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">Orders</p>
                 <p className="text-2xl font-black text-gray-800 dark:text-white">{session.totalOrders}</p>
              </div>
              <div className="col-span-2 bg-gray-50 dark:bg-gray-700 p-6 rounded-[2rem] text-center flex flex-col justify-center">
                 <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">Status</p>
                 <p className={`text-lg font-black uppercase ${session.isOpen ? 'text-green-500' : 'text-gray-500 dark:text-gray-300'}`}>{session.isOpen ? 'Open / Active' : 'Closed'}</p>
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight px-4">Order Log</h3>
           {orders.length === 0 ? (
               <div className="text-center py-10 opacity-50">
                   <p className="font-bold text-gray-400 uppercase tracking-widest">No orders found</p>
               </div>
           ) : orders.map(order => (
               <div key={order.id} className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border border-gray-100 dark:border-gray-700 flex justify-between items-center shadow-sm">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-pawSoftBlue dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center font-black text-xs">
                          {order.customerUsername.charAt(0).toUpperCase()}
                      </div>
                      <div>
                          <p className="font-black text-gray-800 dark:text-white">@{order.customerUsername}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{order.productName}</p>
                          {order.referenceNumber && <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-0.5">"{order.referenceNumber}"</p>}
                      </div>
                   </div>
                   <div className="text-right">
                       <p className="font-black text-gray-800 dark:text-white">₱{order.totalPrice.toLocaleString()}</p>
                       <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                           {order.paymentStatus}
                       </span>
                   </div>
               </div>
           ))}
        </div>
     </div>
   );
};

export default LiveSell;
