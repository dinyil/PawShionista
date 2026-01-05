
import React, { useMemo, useState, useEffect } from 'react';
import { db } from '../services/dbService';
import { PaymentStatus, ShippingStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend } from 'recharts';
import { BoxIcon, ChartIcon } from '../components/Icons';

type TimeFilter = 'Today' | 'Month' | 'Year';
type MetricMode = 'Combined' | 'Revenue' | 'Profit';

const Dashboard: React.FC = () => {
  const orders = db.getOrders();
  const products = db.getProducts();
  const bales = db.getBales();
  const transactions = db.getTransactions();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Filters
  const [chartFilter, setChartFilter] = useState<TimeFilter>('Month'); 
  const [metricMode, setMetricMode] = useState<MetricMode>('Combined');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- 1. Calculate Unit Costs for COGS (Cost of Goods Sold) ---
  const baleUnitCosts = useMemo(() => {
    const costs: Record<string, number> = {};
    bales.forEach(b => {
       if (b.itemCount > 0) {
         costs[b.id] = b.cost / b.itemCount;
       }
    });
    return costs;
  }, [bales]);

  // --- 2. Real-time "Today" Stats ---
  const stats = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-US');
    
    // Filter for today
    const todayOrders = orders.filter(o => new Date(o.createdAt).toLocaleDateString('en-US') === todayStr && o.shippingStatus !== ShippingStatus.CANCELLED);
    const todayExpenses = transactions.filter(t => t.type === 'Expense' && new Date(t.createdAt).toLocaleDateString('en-US') === todayStr);

    // Revenue
    const totalSalesToday = todayOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    
    // COGS (Cost of items sold today)
    const totalCOGS = todayOrders.reduce((sum, o) => {
        const product = products.find(p => p.id === o.productId);
        const baleId = product?.baleBatch || '';
        const unitCost = baleUnitCosts[baleId] || 0;
        return sum + (unitCost * o.quantity);
    }, 0);

    // Expenses
    const totalExpenses = todayExpenses.reduce((sum, t) => sum + t.amount, 0);

    // Net Profit = Sales - COGS - Expenses
    const netProfitToday = totalSalesToday - totalCOGS - totalExpenses;

    const pendingPayments = orders.filter(o => o.paymentStatus !== PaymentStatus.PAID && o.shippingStatus !== ShippingStatus.CANCELLED).length;
    const toShip = orders.filter(o => o.shippingStatus === ShippingStatus.PENDING).length;

    return { 
      salesToday: totalSalesToday, 
      profitToday: netProfitToday,
      ordersToday: todayOrders.length, 
      pendingPayments, 
      toShip 
    };
  }, [orders, products, baleUnitCosts, transactions]);

  // --- 3. Chart Data Generation ---
  const chartData = useMemo(() => {
    const now = new Date();
    let dataPoints: any[] = [];
    
    if (chartFilter === 'Today') {
       // Hourly breakdown (00 - 23)
       dataPoints = Array.from({ length: 24 }, (_, i) => ({
          name: i === 0 ? '12MN' : i === 12 ? '12NN' : i > 12 ? `${i-12}PM` : `${i}AM`,
          tooltipLabel: new Date(now.getFullYear(), now.getMonth(), now.getDate(), i).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'}),
          sales: 0,
          profit: 0,
          rawHour: i
       }));

       // Populate Orders
       orders.forEach(o => {
          const d = new Date(o.createdAt);
          if (d.toDateString() === now.toDateString() && o.shippingStatus !== ShippingStatus.CANCELLED) {
             const hour = d.getHours();
             const itemCOGS = (baleUnitCosts[products.find(p => p.id === o.productId)?.baleBatch || ''] || 0) * o.quantity;
             dataPoints[hour].sales += o.totalPrice;
             dataPoints[hour].profit += (o.totalPrice - itemCOGS);
          }
       });

       // Subtract Expenses
       transactions.filter(t => t.type === 'Expense').forEach(t => {
          const d = new Date(t.createdAt);
          if (d.toDateString() === now.toDateString()) {
             const hour = d.getHours();
             dataPoints[hour].profit -= t.amount;
          }
       });

    } else if (chartFilter === 'Month') {
       // Daily breakdown (1 - DaysInMonth)
       const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
       const monthName = now.toLocaleDateString('en-US', { month: 'long' });
       
       dataPoints = Array.from({ length: daysInMonth }, (_, i) => ({
          name: `${i + 1}`,
          tooltipLabel: `${monthName} ${i + 1}`,
          sales: 0,
          profit: 0,
          day: i + 1
       }));

       orders.forEach(o => {
          const d = new Date(o.createdAt);
          if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && o.shippingStatus !== ShippingStatus.CANCELLED) {
             const dayIdx = d.getDate() - 1;
             const itemCOGS = (baleUnitCosts[products.find(p => p.id === o.productId)?.baleBatch || ''] || 0) * o.quantity;
             if (dataPoints[dayIdx]) {
                dataPoints[dayIdx].sales += o.totalPrice;
                dataPoints[dayIdx].profit += (o.totalPrice - itemCOGS);
             }
          }
       });

       transactions.filter(t => t.type === 'Expense').forEach(t => {
          const d = new Date(t.createdAt);
          if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
             const dayIdx = d.getDate() - 1;
             if (dataPoints[dayIdx]) dataPoints[dayIdx].profit -= t.amount;
          }
       });

    } else if (chartFilter === 'Year') {
       // Monthly breakdown (Jan - Dec)
       const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
       dataPoints = months.map((m, i) => ({
          name: m,
          tooltipLabel: `${m} ${now.getFullYear()}`,
          sales: 0,
          profit: 0,
          monthIdx: i
       }));

       orders.forEach(o => {
          const d = new Date(o.createdAt);
          if (d.getFullYear() === now.getFullYear() && o.shippingStatus !== ShippingStatus.CANCELLED) {
             const mIdx = d.getMonth();
             const itemCOGS = (baleUnitCosts[products.find(p => p.id === o.productId)?.baleBatch || ''] || 0) * o.quantity;
             dataPoints[mIdx].sales += o.totalPrice;
             dataPoints[mIdx].profit += (o.totalPrice - itemCOGS);
          }
       });

       transactions.filter(t => t.type === 'Expense').forEach(t => {
          const d = new Date(t.createdAt);
          if (d.getFullYear() === now.getFullYear()) {
             const mIdx = d.getMonth();
             dataPoints[mIdx].profit -= t.amount;
          }
       });
    }

    return dataPoints;
  }, [chartFilter, orders, transactions, products, baleUnitCosts]);

  // --- 4. Stock Stats ---
  const activeBales = useMemo(() => {
    return bales.filter(b => b.status !== 'Sold Out').map(bale => {
        const baleProductIds = products.filter(p => p.baleBatch === bale.id).map(p => p.id);
        const soldCount = orders.filter(o => baleProductIds.includes(o.productId) && o.shippingStatus !== ShippingStatus.CANCELLED).reduce((sum, o) => sum + o.quantity, 0);
        const remaining = Math.max(0, bale.itemCount - soldCount);
        const percentSold = bale.itemCount > 0 ? (soldCount / bale.itemCount) * 100 : 0;
        return { ...bale, soldCount, remaining, percentSold };
      }).sort((a, b) => a.remaining - b.remaining);
  }, [bales, products, orders]);

  // Metric Toggle Logic
  const handleToggle = (metric: 'Revenue' | 'Profit') => {
    if (metricMode === 'Combined') {
      setMetricMode(metric); // Focus on this metric
    } else if (metricMode === metric) {
      setMetricMode('Combined'); // Unclick -> go back to Combined
    } else {
      setMetricMode(metric); // Switch directly
    }
  };

  return (
    <div className="space-y-6 pb-8 animate-fadeIn">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Shop Overview 🐾</h1>
          <p className="text-gray-500 dark:text-gray-400">Business performance metrics for today.</p>
        </div>
        <div className="bg-white/50 dark:bg-gray-800/50 px-4 py-2 rounded-2xl border border-white dark:border-gray-700 shadow-sm flex flex-col items-end">
            <p className="text-xl font-black text-gray-700 dark:text-gray-200 leading-none">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
            label="Sales Today" 
            value={`₱${stats.salesToday.toLocaleString()}`} 
            color="bg-pawPink dark:bg-pink-900/40" 
            textColor="text-red-600 dark:text-red-400" 
        />
        <StatCard 
            label="Net Profit Today" 
            value={`₱${stats.profitToday.toLocaleString()}`} 
            color="bg-purple-100 dark:bg-purple-900/40" 
            textColor="text-purple-700 dark:text-purple-300" 
            subValue={stats.profitToday < 0 ? "(Expense Heavy)" : "Clear Income"}
        />
        <StatCard 
            label="Pending Payment" 
            value={stats.pendingPayments} 
            color="bg-pawPeach dark:bg-orange-900/40" 
            textColor="text-orange-600 dark:text-orange-300" 
        />
        <StatCard 
            label="To Ship" 
            value={stats.toShip} 
            color="bg-pawSoftBlue dark:bg-blue-900/40" 
            textColor="text-blue-600 dark:text-blue-300" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart Section */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/40 dark:border-gray-700 flex flex-col h-[450px] transition-colors">
           <div className="flex flex-col xl:flex-row justify-between items-center mb-2 gap-4">
              <div className="flex items-center gap-2 mr-auto">
                 <div className="bg-pawLavender dark:bg-purple-900/30 p-2 rounded-xl text-purple-600 dark:text-purple-300"><ChartIcon className="w-5 h-5"/></div>
                 <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 tracking-tight">Financial Performance</h3>
              </div>
              
              <div className="flex bg-gray-50 dark:bg-gray-700 p-1 rounded-xl border border-gray-100 dark:border-gray-600">
                {(['Today', 'Month', 'Year'] as TimeFilter[]).map((f) => (
                  <button 
                    key={f} 
                    onClick={() => setChartFilter(f)}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                       chartFilter === f 
                         ? 'bg-pawPinkDark text-white shadow-md' 
                         : 'text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
           </div>
           
           <div className="flex-1 w-full min-h-0">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" className="dark:opacity-10" />
                 <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    // Changed to a darker gray so it's readable
                    tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} 
                    dy={10}
                    // For 'Today', show every 3rd hour to prevent crowding. Else show all.
                    interval={chartFilter === 'Today' ? 2 : 0} 
                 />
                 <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} 
                    tickFormatter={(val) => `₱${val/1000}k`}
                 />
                 <Tooltip 
                    cursor={{ fill: '#FAF5FF' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontWeight: 'bold', color: '#374151' }}
                    labelFormatter={(value, payload) => {
                      if (payload && payload.length > 0 && payload[0].payload.tooltipLabel) {
                        return payload[0].payload.tooltipLabel;
                      }
                      return value;
                    }}
                 />
                 
                 {(metricMode === 'Revenue' || metricMode === 'Combined') && (
                    <Bar dataKey="sales" name="Revenue" fill="#FFB7C5" radius={[4, 4, 0, 0]} barSize={20} />
                 )}
                 
                 {(metricMode === 'Profit' || metricMode === 'Combined') && (
                    <Bar dataKey="profit" name="Net Profit" fill="#A78BFA" radius={[4, 4, 0, 0]} barSize={20}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#8B5CF6' : '#F87171'} />
                        ))}
                    </Bar>
                 )}
               </BarChart>
             </ResponsiveContainer>
           </div>
           
           {/* Bottom Text Toggles (Legend) */}
           <div className="flex justify-center gap-8 mt-4 select-none">
              <button 
                onClick={() => handleToggle('Profit')}
                className={`flex items-center gap-2 transition-all group ${
                   (metricMode === 'Profit' || metricMode === 'Combined') ? 'opacity-100' : 'opacity-40 grayscale'
                }`}
              >
                 <span className="w-3 h-3 rounded-full bg-[#8B5CF6] shadow-sm"></span>
                 <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 group-hover:text-purple-600 transition-colors">
                    Net Profit
                 </span>
              </button>
              
              <button 
                onClick={() => handleToggle('Revenue')}
                className={`flex items-center gap-2 transition-all group ${
                   (metricMode === 'Revenue' || metricMode === 'Combined') ? 'opacity-100' : 'opacity-40 grayscale'
                }`}
              >
                 <span className="w-3 h-3 rounded-full bg-[#FFB7C5] shadow-sm"></span>
                 <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 group-hover:text-pink-500 transition-colors">
                    Revenue
                 </span>
              </button>
           </div>
        </div>

        {/* Stock Dispersal - Sidebar */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/40 dark:border-gray-700 transition-colors">
          <h3 className="text-lg font-black mb-4 text-gray-800 dark:text-gray-100 tracking-tight flex items-center gap-2">
             <BoxIcon className="w-5 h-5 text-gray-400"/>
             Stock Dispersal
          </h3>
          <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {activeBales.length > 0 ? activeBales.map(b => (
              <div key={b.id} className="p-4 bg-pawCream/50 dark:bg-gray-700/50 rounded-2xl relative overflow-hidden group border border-transparent hover:border-pawPink transition-all">
                <div className="flex justify-between items-center mb-2">
                   <div>
                     <span className="text-[9px] font-black uppercase bg-white dark:bg-gray-600 text-gray-500 dark:text-gray-300 px-2 py-0.5 rounded mr-2 border border-gray-100 dark:border-gray-500">{b.status}</span>
                     <h4 className="font-bold text-gray-800 dark:text-white text-sm inline-block">{b.name}</h4>
                   </div>
                   <div className="text-right">
                      <span className="block text-xl font-black text-gray-800 dark:text-white">{b.remaining}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">Left</span>
                   </div>
                </div>
                <div className="w-full h-2 bg-white dark:bg-gray-600 rounded-full overflow-hidden shadow-inner">
                   <div className="h-full bg-pawPinkDark rounded-full" style={{ width: `${b.percentSold}%` }}></div>
                </div>
              </div>
            )) : <p className="text-center text-gray-400 py-10 font-bold text-xs uppercase">No active batches found.</p>}
          </div>
        </div>

      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, textColor, subValue }: any) => (
  <div className={`${color} p-5 rounded-[2rem] shadow-sm transition-transform active:scale-95 flex flex-col justify-between h-full`}>
    <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 opacity-70">{label}</p>
    <div>
        <p className={`text-2xl font-black ${textColor} leading-none`}>{value}</p>
        {subValue && <p className={`text-[9px] font-bold mt-1 uppercase tracking-wide opacity-60 ${textColor}`}>{subValue}</p>}
    </div>
  </div>
);

export default Dashboard;
