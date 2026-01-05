
import React, { useState, useMemo } from 'react';
import { db } from '../services/dbService';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, 
  PieChart, Pie, Cell, BarChart, Bar, Legend 
} from 'recharts';
import { ReportIcon, ChartIcon, BoxIcon, UserIcon, CartIcon } from '../components/Icons';

type ReportType = 'Sales' | 'Financial' | 'Inventory' | 'Customers';
type DateRange = 'Week' | 'Month' | 'Year' | 'All';

// Updated Palette: Removed Greens, added more Purples/Blues/Pinks
const COLORS = ['#F472B6', '#A78BFA', '#F87171', '#FBBF24', '#60A5FA', '#C084FC', '#9CA3AF'];

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>('Month');
  const [reportType, setReportType] = useState<ReportType>('Sales');

  const orders = db.getOrders();
  const transactions = db.getTransactions();
  const customers = db.getCustomers();
  const bales = db.getBales();
  const products = db.getProducts();

  // --- Date Filtering Logic ---
  const dateFilteredData = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    
    if (dateRange === 'Week') startDate.setDate(now.getDate() - 7);
    else if (dateRange === 'Month') startDate.setMonth(now.getMonth() - 1);
    else if (dateRange === 'Year') startDate.setFullYear(now.getFullYear() - 1);
    else startDate = new Date(0); 

    const relevantOrders = orders.filter(o => o.createdAt >= startDate.getTime());
    const relevantTxs = transactions.filter(t => t.createdAt >= startDate.getTime());
    
    // For inventory/customers, we usually look at current state, but for sales history we use the range
    return { orders: relevantOrders, transactions: relevantTxs, startDate };
  }, [dateRange, orders, transactions]);

  // --- ANALYTICS ENGINE ---
  const analytics = useMemo(() => {
    const { orders: filteredOrders, transactions: filteredTxs } = dateFilteredData;

    // 1. SALES ANALYTICS
    const salesTotal = filteredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const itemsSold = filteredOrders.reduce((sum, o) => sum + o.quantity, 0);
    const orderCount = filteredOrders.length;
    const aov = orderCount > 0 ? salesTotal / orderCount : 0;
    
    // Sales Trend (Chart)
    const salesTrendMap: Record<string, number> = {};
    filteredOrders.forEach(o => {
        const d = new Date(o.createdAt).toLocaleDateString();
        salesTrendMap[d] = (salesTrendMap[d] || 0) + o.totalPrice;
    });
    const salesTrendData = Object.entries(salesTrendMap).map(([date, amount]) => ({ date, amount })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Sales by Batch (Pie)
    const salesByBatchMap: Record<string, number> = {};
    filteredOrders.forEach(o => {
        const prod = products.find(p => p.id === o.productId);
        const batchName = bales.find(b => b.id === prod?.baleBatch)?.name || 'Unknown Batch';
        salesByBatchMap[batchName] = (salesByBatchMap[batchName] || 0) + o.totalPrice;
    });
    const salesByBatchData = Object.entries(salesByBatchMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 6);

    // 2. FINANCIAL ANALYTICS
    const income = salesTotal; // Simplified: Revenue is income
    const expenses = filteredTxs.filter(t => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);
    const netProfit = income - expenses;
    
    // Expense Breakdown (Pie)
    const expenseCatMap: Record<string, number> = {};
    filteredTxs.filter(t => t.type === 'Expense').forEach(t => {
        expenseCatMap[t.category] = (expenseCatMap[t.category] || 0) + t.amount;
    });
    const expenseData = Object.entries(expenseCatMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);

    // Cash Flow (Bar)
    const cashFlowMap: Record<string, { income: number, expense: number }> = {};
    // Merge dates from both orders and txs
    const allDates = new Set([...Object.keys(salesTrendMap), ...filteredTxs.map(t => new Date(t.createdAt).toLocaleDateString())]);
    Array.from(allDates).forEach(d => {
        cashFlowMap[d] = { income: salesTrendMap[d] || 0, expense: 0 };
    });
    filteredTxs.filter(t => t.type === 'Expense').forEach(t => {
        const d = new Date(t.createdAt).toLocaleDateString();
        if(!cashFlowMap[d]) cashFlowMap[d] = { income: 0, expense: 0 };
        cashFlowMap[d].expense += t.amount;
    });
    const cashFlowData = Object.entries(cashFlowMap).map(([date, val]) => ({ date, ...val })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 3. INVENTORY ANALYTICS
    // Calculate global sell-through
    const totalInventoryItems = bales.reduce((sum, b) => sum + b.itemCount, 0);
    const totalSoldItemsAllTime = orders.reduce((sum, o) => sum + o.quantity, 0); // All time for inventory health
    const globalSellThrough = totalInventoryItems > 0 ? (totalSoldItemsAllTime / totalInventoryItems) * 100 : 0;
    const totalInvestment = bales.reduce((sum, b) => sum + b.cost, 0);
    const totalRevenueAllTime = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const totalInventoryProfit = totalRevenueAllTime - totalInvestment;

    // Batch Performance (Bar)
    const batchPerformanceData = bales.map(b => {
        const baleProductIds = products.filter(p => p.baleBatch === b.id).map(p => p.id);
        const revenue = orders.filter(o => baleProductIds.includes(o.productId)).reduce((sum, o) => sum + o.totalPrice, 0);
        return { name: b.name, revenue, cost: b.cost, profit: revenue - b.cost };
    }).sort((a,b) => b.revenue - a.revenue);

    // 4. CUSTOMER ANALYTICS
    const totalCustomers = customers.length;
    const vipCount = customers.filter(c => c.isVIP).length;
    const avgSpendPerUser = totalCustomers > 0 ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / totalCustomers : 0;
    
    // Top Spenders (Bar)
    const topSpendersData = [...customers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10).map(c => ({
        name: c.username,
        spent: c.totalSpent
    }));

    return {
        sales: { total: salesTotal, items: itemsSold, count: orderCount, aov, trend: salesTrendData, byBatch: salesByBatchData },
        financial: { income, expenses, profit: netProfit, expenseBreakdown: expenseData, cashFlow: cashFlowData },
        inventory: { sellThrough: globalSellThrough, investment: totalInvestment, revenue: totalRevenueAllTime, profit: totalInventoryProfit, performance: batchPerformanceData },
        customers: { total: totalCustomers, vips: vipCount, avgSpend: avgSpendPerUser, topSpenders: topSpendersData }
    };
  }, [dateFilteredData, products, bales, customers]);

  // --- EXPORT ---
  const handleExport = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    let filename = `pawshionista_${reportType.toLowerCase()}_report_${new Date().toISOString().split('T')[0]}.csv`;
    let data: any[] = [];

    if (reportType === 'Sales') {
        csvContent += "Order ID,Date,Session,Customer,Item,Batch,Quantity,Price,Total,Payment Status,Shipping Status\n";
        data = dateFilteredData.orders.map(o => {
            const prod = products.find(p => p.id === o.productId);
            const batch = bales.find(b => b.id === prod?.baleBatch)?.name || 'N/A';
            return [
                o.id, new Date(o.createdAt).toLocaleDateString(), o.sessionId, o.customerUsername, o.productName.replace(/,/g, ' '),
                batch.replace(/,/g, ' '), o.quantity, o.totalPrice/o.quantity, o.totalPrice, o.paymentStatus, o.shippingStatus
            ];
        });
    } else if (reportType === 'Financial') {
        csvContent += "Transaction ID,Date,Type,Category,Wallet,Amount,Note\n";
        data = dateFilteredData.transactions.map(t => [
            t.id, new Date(t.createdAt).toLocaleDateString(), t.type, t.category, t.wallet, t.amount, (t.note || "").replace(/,/g, ' ')
        ]);
        // Also append sales as income rows
        dateFilteredData.orders.forEach(o => {
            data.push([o.id, new Date(o.createdAt).toLocaleDateString(), 'Income', 'Sales', o.paymentMethod || 'N/A', o.amountPaid, `Order for ${o.customerUsername}`]);
        });
    } else if (reportType === 'Inventory') {
        csvContent += "Batch ID,Batch Name,Status,Cost,Items (Initial),Items (Sold),Revenue,Net Profit,ROI %\n";
        data = bales.map(b => {
            const baleProductIds = products.filter(p => p.baleBatch === b.id).map(p => p.id);
            const baleOrders = orders.filter(o => baleProductIds.includes(o.productId));
            const sold = baleOrders.reduce((sum, o) => sum + o.quantity, 0);
            const rev = baleOrders.reduce((sum, o) => sum + o.totalPrice, 0);
            const profit = rev - b.cost;
            const roi = b.cost > 0 ? (rev / b.cost) * 100 : 0;
            return [b.id, b.name.replace(/,/g, ' '), b.status, b.cost, b.itemCount, sold, rev, profit, roi.toFixed(2) + '%'];
        });
    } else if (reportType === 'Customers') {
        csvContent += "Username,Is VIP,Total Orders,Total Spent,Average Order Value,Status\n";
        data = customers.map(c => [
            c.username, c.isVIP ? 'Yes' : 'No', c.orderCount, c.totalSpent, 
            c.orderCount > 0 ? (c.totalSpent/c.orderCount).toFixed(2) : 0, 
            c.isBlacklisted ? 'Blacklisted' : 'Active'
        ]);
    }

    data.forEach(row => csvContent += row.join(",") + "\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tooltipStyle = {
    borderRadius: '16px', 
    border: 'none', 
    boxShadow: '0 10px 20px rgba(0,0,0,0.1)', 
    fontWeight: 'bold', 
    backgroundColor: '#FFFFFF', // Explicit white background
    color: '#1F2937' // Explicit dark text
  };

  return (
    <div className="space-y-8 pb-32 px-2 animate-fadeIn">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-800 dark:text-white tracking-tight">Business Intelligence</h1>
          <p className="text-gray-500 dark:text-gray-400 font-bold text-sm mt-1">Deep dive analytics & reporting suite.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
           {/* Report Type Tabs */}
           <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-pawPink/30 dark:border-gray-700 flex shadow-sm overflow-x-auto">
              {(['Sales', 'Financial', 'Inventory', 'Customers'] as const).map(t => (
                 <button key={t} onClick={() => setReportType(t)} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${reportType === t ? 'bg-pawPinkDark text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                    {t === 'Sales' && <CartIcon className="w-4 h-4"/>}
                    {t === 'Financial' && <ChartIcon className="w-4 h-4"/>}
                    {t === 'Inventory' && <BoxIcon className="w-4 h-4"/>}
                    {t === 'Customers' && <UserIcon className="w-4 h-4"/>}
                    {t}
                 </button>
              ))}
           </div>

           {/* Date Range */}
           <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-pawPink/30 dark:border-gray-700 flex shadow-sm overflow-x-auto">
              {(['Week', 'Month', 'Year', 'All'] as const).map(r => (
                 <button key={r} onClick={() => setDateRange(r)} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${dateRange === r ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                    {r}
                 </button>
              ))}
           </div>
        </div>
      </div>

      {/* --- SALES DASHBOARD --- */}
      {reportType === 'Sales' && (
        <div className="space-y-6 animate-slideIn">
           {/* KPI Cards */}
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Sales" value={`₱${analytics.sales.total.toLocaleString()}`} color="bg-pink-100 dark:bg-pink-900/30" textColor="text-pink-700 dark:text-pink-200" />
              <StatCard label="Items Sold" value={analytics.sales.items} color="bg-purple-100 dark:bg-purple-900/30" textColor="text-purple-700 dark:text-purple-200" />
              <StatCard label="Total Orders" value={analytics.sales.count} color="bg-blue-100 dark:bg-blue-900/30" textColor="text-blue-700 dark:text-blue-200" />
              <StatCard label="Avg Order Value" value={`₱${analytics.sales.aov.toFixed(0)}`} color="bg-orange-100 dark:bg-orange-900/30" textColor="text-orange-700 dark:text-orange-200" />
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Trend Chart */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/20 dark:border-gray-700 h-[400px] flex flex-col">
                 <h3 className="text-lg font-black text-gray-800 dark:text-white mb-4 px-2">Sales Trend</h3>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={analytics.sales.trend} margin={{top:10, right:10, left:-20, bottom:0}}>
                          <defs>
                             <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F472B6" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#F472B6" stopOpacity={0}/>
                             </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" className="dark:opacity-10"/>
                          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill:'#9CA3AF', fontSize:10, fontWeight:700}} dy={10} />
                          <YAxis tickLine={false} axisLine={false} tick={{fill:'#9CA3AF', fontSize:10, fontWeight:700}} tickFormatter={(v)=>`₱${v/1000}k`} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(val:any)=>`₱${val.toLocaleString()}`} />
                          <Area type="monotone" dataKey="amount" stroke="#F472B6" strokeWidth={3} fill="url(#salesGradient)" />
                       </AreaChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              {/* Pie Chart */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/20 dark:border-gray-700 h-[400px] flex flex-col">
                 <h3 className="text-lg font-black text-gray-800 dark:text-white mb-4 px-2">Top Bales</h3>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                          <Pie data={analytics.sales.byBatch} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                             {analytics.sales.byBatch.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(val:any)=>`₱${val.toLocaleString()}`} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize:'10px', fontWeight:'700'}} />
                       </PieChart>
                    </ResponsiveContainer>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- FINANCIAL DASHBOARD --- */}
      {reportType === 'Financial' && (
        <div className="space-y-6 animate-slideIn">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Total Revenue (Income)" value={`₱${analytics.financial.income.toLocaleString()}`} color="bg-purple-100 dark:bg-purple-900/30" textColor="text-purple-700 dark:text-purple-200" />
              <StatCard label="Total Expenses" value={`₱${analytics.financial.expenses.toLocaleString()}`} color="bg-red-100 dark:bg-red-900/30" textColor="text-red-700 dark:text-red-200" />
              <div className={`p-6 rounded-[2.5rem] shadow-sm border-2 ${analytics.financial.profit >= 0 ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' : 'bg-orange-50 border-orange-100'}`}>
                 <p className={`text-[10px] font-black uppercase tracking-widest mb-1 opacity-70 ${analytics.financial.profit >= 0 ? 'text-blue-700 dark:text-blue-200' : 'text-orange-700 dark:text-orange-200'}`}>Net Profit</p>
                 <p className={`text-3xl font-black ${analytics.financial.profit >= 0 ? 'text-blue-900 dark:text-blue-100' : 'text-orange-900'}`}>₱{analytics.financial.profit.toLocaleString()}</p>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/20 dark:border-gray-700 h-[400px] flex flex-col">
                 <h3 className="text-lg font-black text-gray-800 dark:text-white mb-4 px-2">Cash Flow (In vs Out)</h3>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={analytics.financial.cashFlow} margin={{top:10, right:10, left:-20, bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" className="dark:opacity-10"/>
                          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill:'#9CA3AF', fontSize:10, fontWeight:700}} dy={10} />
                          <YAxis tickLine={false} axisLine={false} tick={{fill:'#9CA3AF', fontSize:10, fontWeight:700}} tickFormatter={(v)=>`₱${v/1000}k`} />
                          <Tooltip cursor={{fill:'#f3f4f6'}} contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{paddingTop:'20px', fontSize:'11px', fontWeight:'700'}}/>
                          <Bar dataKey="income" name="Income" fill="#A78BFA" radius={[4,4,0,0]} barSize={10} />
                          <Bar dataKey="expense" name="Expense" fill="#F87171" radius={[4,4,0,0]} barSize={10} />
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/20 dark:border-gray-700 h-[400px] flex flex-col">
                 <h3 className="text-lg font-black text-gray-800 dark:text-white mb-4 px-2">Expense Breakdown</h3>
                 <div className="flex-1 w-full min-h-0">
                    {analytics.financial.expenseBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                          <Pie data={analytics.financial.expenseBreakdown} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}>
                             {analytics.financial.expenseBreakdown.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(val:any)=>`₱${val.toLocaleString()}`} />
                       </PieChart>
                    </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 font-bold text-sm">No expenses recorded</div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- INVENTORY DASHBOARD --- */}
      {reportType === 'Inventory' && (
        <div className="space-y-6 animate-slideIn">
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Investment" value={`₱${analytics.inventory.investment.toLocaleString()}`} color="bg-gray-100 dark:bg-gray-700" textColor="text-gray-800 dark:text-white" />
              <StatCard label="Total Revenue" value={`₱${analytics.inventory.revenue.toLocaleString()}`} color="bg-blue-100 dark:bg-blue-900/30" textColor="text-blue-700 dark:text-blue-200" />
              {/* FIXED ROI PROFIT CARD */}
              <div className={`p-6 rounded-[2.5rem] shadow-sm border-2 ${analytics.inventory.profit >= 0 ? 'bg-purple-100 dark:bg-purple-900/50 border-purple-300 dark:border-purple-600' : 'bg-orange-100 border-orange-200'}`}>
                 <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${analytics.inventory.profit >= 0 ? 'text-purple-800 dark:text-purple-200' : 'text-orange-800'}`}>Total ROI Profit</p>
                 <p className={`text-3xl font-black ${analytics.inventory.profit >= 0 ? 'text-purple-950 dark:text-white' : 'text-orange-900'}`}>{analytics.inventory.profit >= 0 ? '+' : ''}₱{analytics.inventory.profit.toLocaleString()}</p>
              </div>
              <StatCard label="Global Sell-Through" value={`${analytics.inventory.sellThrough.toFixed(1)}%`} color="bg-pink-100 dark:bg-pink-900/30" textColor="text-pink-700 dark:text-pink-200" />
           </div>

           <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-pawPink/20 dark:border-gray-700">
              <h3 className="text-xl font-black text-gray-800 dark:text-white mb-6">Batch Performance ROI</h3>
              <div className="space-y-6">
                 {analytics.inventory.performance.map((batch, i) => {
                    const roi = batch.cost > 0 ? (batch.revenue / batch.cost) * 100 : 0;
                    return (
                        <div key={i} className="space-y-2">
                           <div className="flex justify-between items-end">
                              <span className="font-black text-gray-700 dark:text-gray-300 text-sm">{batch.name}</span>
                              <div className="text-right">
                                 <span className={`font-black text-sm ${roi >= 100 ? 'text-purple-600 dark:text-purple-300' : 'text-gray-500'}`}>{roi.toFixed(0)}% ROI</span>
                                 <span className="text-[10px] font-bold text-gray-400 block">Profit: ₱{batch.profit.toLocaleString()}</span>
                              </div>
                           </div>
                           <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${roi >= 100 ? 'bg-purple-500' : 'bg-pawPinkDark'}`} style={{width: `${Math.min(roi, 100)}%`}}></div>
                           </div>
                        </div>
                    )
                 })}
              </div>
           </div>
        </div>
      )}

      {/* --- CUSTOMER DASHBOARD --- */}
      {reportType === 'Customers' && (
        <div className="space-y-6 animate-slideIn">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Total Customers" value={analytics.customers.total} color="bg-white dark:bg-gray-800" textColor="text-gray-800 dark:text-white" />
              <StatCard label="VIP Members" value={analytics.customers.vips} color="bg-yellow-50 dark:bg-yellow-900/30" textColor="text-yellow-700 dark:text-yellow-400" />
              <StatCard label="Avg Lifetime Spend" value={`₱${analytics.customers.avgSpend.toFixed(0)}`} color="bg-blue-100 dark:bg-blue-900/30" textColor="text-blue-700 dark:text-blue-200" />
           </div>

           <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-pawPink/20 dark:border-gray-700 h-[500px] flex flex-col">
              <h3 className="text-lg font-black text-gray-800 dark:text-white mb-4 px-2">Top 10 Spenders</h3>
              <div className="flex-1 w-full min-h-0">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={analytics.customers.topSpenders} margin={{top:10, right:30, left:40, bottom:0}}>
                       <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" className="dark:opacity-10"/>
                       <XAxis type="number" hide />
                       <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{fill:'#6B7280', fontSize:11, fontWeight:700}} width={100} />
                       <Tooltip cursor={{fill:'#f3f4f6'}} contentStyle={tooltipStyle} formatter={(val:any)=>`₱${val.toLocaleString()}`} />
                       <Bar dataKey="spent" fill="#A78BFA" radius={[0,4,4,0]} barSize={20}>
                          {analytics.customers.topSpenders.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={index < 3 ? '#FBBF24' : '#A78BFA'} /> 
                          ))}
                       </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
           </div>
        </div>
      )}

      {/* --- EXPORT ACTION --- */}
      <div className="bg-gray-900 dark:bg-black rounded-[3rem] p-10 text-center relative overflow-hidden shadow-2xl">
         <div className="relative z-10">
            <h3 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Export Detailed {reportType} Data</h3>
            <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-8">Get the raw data in CSV format for Excel or Google Sheets</p>
            <button 
              onClick={handleExport}
              className="bg-white text-gray-900 px-12 py-5 rounded-3xl font-black uppercase text-sm tracking-widest hover:bg-pawPink hover:text-pawPinkDark transition-all active:scale-95 shadow-xl hover:shadow-2xl"
            >
               Download .CSV
            </button>
         </div>
         {/* Background Decor */}
         <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
            <div className="absolute top-[-50%] right-[-10%] w-96 h-96 bg-pawPink rounded-full blur-3xl"></div>
            <div className="absolute bottom-[-50%] left-[-10%] w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
         </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, textColor }: any) => (
  <div className={`${color} p-6 rounded-[2.5rem] shadow-sm transition-transform active:scale-95 flex flex-col justify-center h-full border border-transparent dark:border-white/5`}>
    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 opacity-70 ${textColor}`}>{label}</p>
    <p className={`text-3xl font-black leading-none ${textColor}`}>{value}</p>
  </div>
);

export default Reports;
