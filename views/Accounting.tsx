
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../services/dbService';
import { Transaction, PaymentMethod } from '../types';
import { PlusIcon } from '../components/Icons';

const Accounting: React.FC = () => {
  const orders = db.getOrders();
  const transactions = db.getTransactions();
  
  // State for Filters and Categories
  const [categories, setCategories] = useState(db.getExpenseCategories());
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showTxModal, setShowTxModal] = useState(false);

  const walletBalances = useMemo(() => {
    const balances: Record<string, number> = {
      'GCash': 0,
      'Maya': 0,
      'TikTok Checkout': 0,
      'GoTyme': 0,
      'SeaBank': 0,
      'BPI': 0,
      'Cash': 0
    };

    // Add paid orders
    orders.forEach(o => {
      if (o.walletPayments) {
        Object.entries(o.walletPayments).forEach(([wallet, amt]) => {
          if (balances[wallet] !== undefined) {
            balances[wallet] += amt;
          }
        });
      } else if (o.paymentMethod && balances[o.paymentMethod] !== undefined) {
        balances[o.paymentMethod] += o.amountPaid;
      }
    });

    // Subtract/Add transactions
    transactions.forEach(t => {
      if (balances[t.wallet] !== undefined) {
        if (t.type === 'Expense' || t.type === 'Withdrawal') {
          balances[t.wallet] -= t.amount;
        } else if (t.type === 'Loan' || t.type === 'Sale Live') {
          balances[t.wallet] += t.amount;
        }
      }
    });

    return balances;
  }, [orders, transactions]);

  const totalCashOnHand = Object.values(walletBalances).reduce((a: number, b: number) => a + b, 0);

  const profitStats = useMemo(() => {
    const revenueFromSaleLive = transactions.filter(t => t.type === 'Sale Live').reduce((sum, t) => sum + t.amount, 0);
    const revenue = orders.reduce((sum, o) => sum + o.amountPaid, 0) + revenueFromSaleLive;
    const expenses = transactions.filter(t => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);
    return { revenue, expenses, net: revenue - expenses };
  }, [orders, transactions]);

  const filteredTransactions = useMemo(() => {
    let txs = [...transactions].reverse();
    if (categoryFilter !== 'All') {
      txs = txs.filter(t => t.category === categoryFilter);
    }
    return txs;
  }, [transactions, categoryFilter]);

  const handleAddTx = (tx: Transaction | Transaction[]) => {
    if (Array.isArray(tx)) {
      tx.forEach(t => db.addTransaction(t));
      if (tx.length > 0) {
        db.addExpenseCategory(tx[0].category);
      }
    } else {
      db.addTransaction(tx);
      db.addExpenseCategory(tx.category); // Auto-save new category if it doesn't exist
    }
    setCategories(db.getExpenseCategories());
    setShowTxModal(false);
  };

  return (
    <div className="space-y-6 pb-32 px-1">
      <div className="flex items-center justify-between px-2">
        <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">Accounting</h1>
        <button 
          onClick={() => setShowTxModal(true)}
          className="bg-pawPeach dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 px-5 py-3 rounded-2xl font-black flex items-center gap-2 text-xs uppercase tracking-widest shadow-lg shadow-orange-100 dark:shadow-none active:scale-95 transition-all hover:bg-orange-200 dark:hover:bg-orange-800/60"
        >
          <PlusIcon className="w-4 h-4" /> New Log
        </button>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-2">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border-2 border-pawPink/30 dark:border-gray-700 shadow-sm transition-colors">
          <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-2">Total Cash on Hand</p>
          <p className="text-3xl font-black text-gray-800 dark:text-white">₱{totalCashOnHand.toLocaleString()}</p>
        </div>
        <div className="bg-pawLavender dark:bg-purple-900/30 p-6 rounded-[2.5rem] shadow-sm">
          <p className="text-[10px] font-black text-purple-700 dark:text-purple-300 uppercase tracking-widest mb-2">Total Revenue</p>
          <p className="text-3xl font-black text-purple-900 dark:text-purple-100">₱{profitStats.revenue.toLocaleString()}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-[2.5rem] border border-red-100 dark:border-red-900/50 shadow-sm">
          <p className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-2">Total Expenses</p>
          <p className="text-3xl font-black text-red-800 dark:text-red-200">₱{profitStats.expenses.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-2">
        {/* Wallet Breakdown */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] border-2 border-pawPink/20 dark:border-gray-700 shadow-lg transition-colors">
          <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight mb-6">Wallets</h3>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(walletBalances).map(([name, bal]) => (
              <div key={name} className="bg-pawCream dark:bg-gray-700 p-5 rounded-[2rem] hover:bg-yellow-50 dark:hover:bg-gray-600 transition-colors">
                <p className="text-[9px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">{name}</p>
                <p className="text-xl font-black text-gray-800 dark:text-white">₱{bal.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] border-2 border-pawPink/20 dark:border-gray-700 shadow-lg flex flex-col h-[500px] transition-colors">
          <div className="flex justify-between items-center mb-6 shrink-0">
             <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">History</h3>
             
             {/* Category Filter */}
             <select 
               value={categoryFilter}
               onChange={(e) => setCategoryFilter(e.target.value)}
               className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest py-2 px-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-pawPink"
             >
               <option value="All">All Categories</option>
               {categories.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1 pr-2 space-y-3">
            {filteredTransactions.map(t => (
              <div key={t.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-[2rem] border border-gray-100 dark:border-gray-600 hover:border-pawPink dark:hover:border-gray-500 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    t.type === 'Expense' || t.type === 'Withdrawal' 
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' 
                      : t.type === 'Sale Live'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300'
                  }`}>
                    {t.type.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-800 dark:text-white leading-tight">{t.category}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-400 uppercase font-bold tracking-wider">{t.wallet} • {new Date(t.createdAt).toLocaleDateString()}</p>
                    {t.note && <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-0.5">"{t.note}"</p>}
                  </div>
                </div>
                <p className={`font-black text-sm whitespace-nowrap ${
                  t.type === 'Expense' || t.type === 'Withdrawal' 
                    ? 'text-red-500 dark:text-red-400' 
                    : t.type === 'Sale Live'
                      ? 'text-emerald-500 dark:text-emerald-400'
                      : 'text-purple-500 dark:text-purple-300'
                }`}>
                  {t.type === 'Expense' || t.type === 'Withdrawal' ? '-' : '+'}₱{t.amount.toLocaleString()}
                </p>
              </div>
            ))}
            {filteredTransactions.length === 0 && (
              <div className="text-center py-20 opacity-50 flex flex-col items-center">
                 <div className="text-4xl mb-2">🧾</div>
                 <p className="font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-widest">No logs found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showTxModal && (
        <TransactionModal 
          categories={categories}
          onClose={() => setShowTxModal(false)} 
          onSave={handleAddTx} 
        />
      )}
    </div>
  );
};

interface ModalProps {
  categories: string[];
  onClose: () => void;
  onSave: (t: Transaction | Transaction[]) => void;
}

const TransactionModal: React.FC<ModalProps> = ({ categories, onClose, onSave }) => {
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [formData, setFormData] = useState<Transaction>({
    id: `tx_${Date.now()}`,
    type: 'Expense',
    amount: 0,
    wallet: 'GCash',
    category: categories[0] || 'Miscellaneous',
    note: '',
    createdAt: Date.now()
  });

  const [walletSplits, setWalletSplits] = useState<Record<string, number>>({
    'GCash': 0,
    'Maya': 0,
    'TikTok Checkout': 0,
    'GoTyme': 0,
    'SeaBank': 0,
    'BPI': 0,
    'Cash': 0
  });

  // Track if user has changed type to Sale Live to default category to SALE LIVE
  const handleTypeChange = (newType: 'Expense' | 'Withdrawal' | 'Loan' | 'Sale Live') => {
    setFormData(prev => ({
      ...prev,
      type: newType,
      category: newType === 'Sale Live' ? 'SALE LIVE' : (prev.category === 'SALE LIVE' ? categories[0] || 'Miscellaneous' : prev.category)
    }));
  };

  const totalSplitsAmount = Object.values(walletSplits).reduce((a, b) => a + b, 0);
  const isSaveDisabled = formData.type === 'Sale Live' ? totalSplitsAmount <= 0 : formData.amount <= 0;

  const handleSave = () => {
    if (formData.type === 'Sale Live') {
      const activeSplits = Object.entries(walletSplits).filter(([_, val]) => val > 0);
      if (activeSplits.length === 0) return;

      const transactionsList: Transaction[] = activeSplits.map(([wallet, amt], idx) => ({
        id: `tx_${Date.now()}_${idx}`,
        type: 'Sale Live',
        amount: amt,
        wallet: wallet,
        category: 'SALE LIVE',
        note: formData.note ? formData.note : 'SALE LIVE input split',
        createdAt: Date.now()
      }));
      onSave(transactionsList);
    } else {
      onSave(formData);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl animate-scaleUp border-4 border-transparent dark:border-gray-700">
        <div className="bg-pawPeach dark:bg-orange-900/40 p-8">
          <h3 className="text-2xl font-black text-orange-900 dark:text-orange-200 uppercase tracking-tight">New Log</h3>
          <p className="text-orange-700 dark:text-orange-300 font-bold text-xs uppercase mt-2 tracking-widest opacity-80 font-mono">Track expenses & income</p>
        </div>
        <div className="p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-3 tracking-widest block mb-2">Transaction Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-pawCream dark:bg-gray-700 p-2 rounded-[1.5rem]">
                 {['Expense', 'Withdrawal', 'Loan', 'Sale Live'].map((type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => handleTypeChange(type as any)}
                      className={`py-2 px-1 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all truncate ${
                         formData.type === type 
                           ? 'bg-white dark:bg-gray-600 shadow-md text-orange-600 dark:text-orange-300 animate-scaleUp' 
                           : 'text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      {type}
                    </button>
                 ))}
              </div>
            </div>

            {formData.type === 'Sale Live' ? (
              <div className="col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-3 tracking-widest block mb-1">
                  How much entered into each wallet?
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {Object.keys(walletSplits).map((walletName) => (
                    <div key={walletName} className="bg-pawCream dark:bg-gray-700 p-3 rounded-2xl border border-gray-100/30 dark:border-gray-800/30 flex flex-col hover:border-pawPink/40 transition-colors">
                      <span className="text-[9px] font-black uppercase text-gray-400 dark:text-gray-550 mb-0.5 truncate">{walletName}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-black text-gray-450">₱</span>
                        <input 
                          type="number"
                          placeholder="0"
                          min="0"
                          value={walletSplits[walletName] || ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            setWalletSplits(prev => ({ ...prev, [walletName]: val }));
                          }}
                          className="w-full bg-transparent font-black text-xs text-gray-800 dark:text-white outline-none border-none p-0 focus:ring-0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Visual indicator of Total Split */}
                <div className="p-4 bg-orange-100/30 dark:bg-orange-950/20 rounded-2xl flex justify-between items-center text-xs font-black uppercase text-orange-900 dark:text-orange-200">
                  <span className="tracking-wider">Total Sale:</span>
                  <span className="text-sm font-black text-orange-600 dark:text-orange-300">₱{totalSplitsAmount.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-3 tracking-widest block mb-1">Amount (₱)</label>
                  <input 
                    type="number"
                    value={formData.amount === 0 ? '' : formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value === '' ? 0 : Number(e.target.value)})}
                    className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-[1.5rem] border-2 border-transparent focus:border-pawPeach dark:focus:border-orange-500/50 font-bold text-gray-800 dark:text-white"
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-3 tracking-widest block mb-1">Wallet Source</label>
                  <select 
                    value={formData.wallet}
                    onChange={(e) => setFormData({...formData, wallet: e.target.value})}
                    className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-[1.5rem] border-2 border-transparent focus:border-pawPeach dark:focus:border-orange-500/50 font-bold text-gray-800 dark:text-white appearance-none outline-none animate-fadeIn"
                  >
                    {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-3 tracking-widest block mb-1">Category</label>
                  {!isCustomCategory ? (
                    <select 
                       value={formData.category}
                       onChange={(e) => {
                          if (e.target.value === '__NEW__') {
                            setIsCustomCategory(true);
                            setFormData({...formData, category: ''});
                          } else {
                            setFormData({...formData, category: e.target.value});
                          }
                       }}
                       className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-[1.5rem] border-2 border-transparent focus:border-pawPeach dark:focus:border-orange-500/50 font-bold text-gray-800 dark:text-white appearance-none outline-none"
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__NEW__" className="text-orange-500 font-black">+ Create New Category</option>
                    </select>
                  ) : (
                    <div className="flex gap-2 animate-fadeIn">
                       <input 
                         autoFocus
                         value={formData.category}
                         placeholder="New Category Name..."
                         onChange={(e) => setFormData({...formData, category: e.target.value})}
                         className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-[1.5rem] border-2 border-pawPeach dark:border-orange-500/50 font-bold text-gray-800 dark:text-white"
                       />
                       <button 
                         type="button"
                         onClick={() => { setIsCustomCategory(false); setFormData({...formData, category: categories[0]}); }}
                         className="px-4 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 rounded-2xl font-black text-xs uppercase"
                       >
                         Cancel
                       </button>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="col-span-2">
               <label className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase ml-3 tracking-widest block mb-1">Note (Optional)</label>
               <input 
                 value={formData.note}
                 placeholder={formData.type === 'Sale Live' ? "Group name, e.g. Sunday Morning Live stream" : "Details..."}
                 onChange={(e) => setFormData({...formData, note: e.target.value})}
                 className="w-full bg-pawCream dark:bg-gray-700 p-4 rounded-[1.5rem] border-2 border-transparent focus:border-pawPeach dark:focus:border-orange-500/50 font-bold text-gray-800 dark:text-white placeholder:text-gray-450"
               />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-5 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 font-black uppercase text-xs tracking-widest rounded-3xl active:scale-95 transition-all">Cancel</button>
            <button 
              type="button" 
              onClick={handleSave}
              disabled={isSaveDisabled}
              className={`flex-1 py-5 font-black uppercase text-xs tracking-widest rounded-3xl transition-all ${
                isSaveDisabled 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700/50 dark:text-gray-500' 
                  : 'bg-pawPeach dark:bg-orange-850 text-orange-905 dark:text-orange-100 shadow-xl shadow-orange-100 dark:shadow-none active:scale-95 hover:bg-orange-300 dark:hover:bg-orange-700'
              }`}
            >
              Save Log
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Accounting;
