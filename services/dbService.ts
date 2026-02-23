
import { Product, Order, Customer, LiveSession, Bale, Transaction, PaymentStatus, ShippingStatus } from '../types';
import { INITIAL_PRODUCTS, INITIAL_BALES, INITIAL_CUSTOMERS } from '../db/mockData';
import { supabase } from './supabaseClient';

const STORAGE_KEYS = {
  PRODUCTS: 'paw_products',
  ORDERS: 'paw_orders',
  CUSTOMERS: 'paw_customers',
  SESSIONS: 'paw_sessions',
  BALES: 'paw_bales',
  TRANSACTIONS: 'paw_transactions',
  CATEGORIES: 'paw_categories',
  SETTINGS: 'paw_settings',
};

// Default prices if none are set
const DEFAULT_PRICES = [10, 50, 80, 130, 150, 160, 170, 180, 190, 200];

class DBService {
  private get<T>(key: string, defaultValue: T): T {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  }

  private set<T>(key: string, data: T): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // --- SUPABASE SYNC ---
  async syncWithSupabase(): Promise<void> {
    try {
      // 1. Fetch all data from Supabase
      const { data: products } = await supabase.from('products').select('*');
      const { data: customers } = await supabase.from('customers').select('*');
      const { data: orders } = await supabase.from('orders').select('*');
      const { data: sessions } = await supabase.from('live_sessions').select('*');
      const { data: bales } = await supabase.from('bales').select('*');
      const { data: transactions } = await supabase.from('transactions').select('*');
      
      // Sync Settings (Single Row ID: 1)
      const { data: settings } = await supabase.from('settings').select('*').single();

      // 2. Update LocalStorage (Cache) if data exists remotely
      if (products) this.set(STORAGE_KEYS.PRODUCTS, products);
      if (customers) this.set(STORAGE_KEYS.CUSTOMERS, customers);
      if (orders) this.set(STORAGE_KEYS.ORDERS, orders);
      if (sessions) this.set(STORAGE_KEYS.SESSIONS, sessions);
      if (bales) this.set(STORAGE_KEYS.BALES, bales);
      if (transactions) this.set(STORAGE_KEYS.TRANSACTIONS, transactions);
      if (settings) {
         this.set(STORAGE_KEYS.SETTINGS, { 
             logoUrl: settings.logo_url, 
             isDarkMode: settings.is_dark_mode,
             presetPrices: settings.preset_prices || DEFAULT_PRICES
         });
         if (settings.expense_categories) {
             this.set(STORAGE_KEYS.CATEGORIES, settings.expense_categories);
         }
      }

      console.log('✅ Supabase Sync Complete');
    } catch (error) {
      console.error('❌ Supabase Sync Failed:', error);
      // Fallback to local storage is automatic since we didn't overwrite with null
    }
  }

  // --- Settings (Logo, Dark Mode, Prices) ---
  getSettings(): { logoUrl: string | null; isDarkMode: boolean; presetPrices: number[] } {
    return this.get(STORAGE_KEYS.SETTINGS, { logoUrl: null, isDarkMode: false, presetPrices: DEFAULT_PRICES });
  }

  updateSettings(settings: Partial<{ logoUrl: string | null; isDarkMode: boolean; presetPrices: number[] }>): void {
    const current = this.getSettings();
    const newSettings = { ...current, ...settings };
    this.set(STORAGE_KEYS.SETTINGS, newSettings);

    // Sync to Supabase Single Row Table
    const updatePayload: any = { id: 1 };
    if (newSettings.logoUrl !== undefined) updatePayload.logo_url = newSettings.logoUrl;
    if (newSettings.isDarkMode !== undefined) updatePayload.is_dark_mode = newSettings.isDarkMode;
    if (newSettings.presetPrices !== undefined) updatePayload.preset_prices = newSettings.presetPrices;

    supabase.from('settings').upsert(updatePayload).then(({ error }) => {
       if (error) console.error('Supabase Error (Settings):', error);
    });
  }

  // --- Products ---
  getProducts(): Product[] {
    return this.get(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  }
  updateProduct(product: Product): void {
    const products = this.getProducts();
    const index = products.findIndex(p => p.id === product.id);
    if (index > -1) {
      products[index] = product;
    } else {
      products.push(product);
    }
    this.set(STORAGE_KEYS.PRODUCTS, products);
    
    supabase.from('products').upsert(product).then(({ error }) => {
      if (error) console.error('Supabase Error (Product):', error);
    });
  }
  deleteProduct(id: string): void {
    const products = this.getProducts().filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PRODUCTS, products);
    
    supabase.from('products').delete().eq('id', id).then();
  }

  // --- Orders ---
  getOrders(): Order[] {
    return this.get(STORAGE_KEYS.ORDERS, []);
  }

  addOrder(order: Order): void {
    const orders = this.getOrders();
    orders.push(order);
    this.set(STORAGE_KEYS.ORDERS, orders);
    
    // Update product stock
    let baleIdToUpdate: string | null = null;

    if (!order.isFreebie) {
      const products = this.getProducts();
      const pIndex = products.findIndex(p => p.id === order.productId);
      if (pIndex > -1) {
        products[pIndex].stock -= order.quantity;
        this.set(STORAGE_KEYS.PRODUCTS, products);
        baleIdToUpdate = products[pIndex].baleBatch;
        
        supabase.from('products').update({ stock: products[pIndex].stock }).eq('id', products[pIndex].id).then();
      }
    } else {
       const products = this.getProducts();
       const product = products.find(p => p.id === order.productId);
       if (product) baleIdToUpdate = product.baleBatch;
    }

    // Update customer stats
    const customer = this.getOrCreateCustomer(order.customerUsername);
    customer.orderCount += order.quantity; // Increment by consolidated qty
    customer.totalSpent += order.totalPrice;
    this.updateCustomer(customer); // This handles Supabase sync for customer

    // Auto-update Bale Status
    if (baleIdToUpdate) {
      this.refreshBaleStatus(baleIdToUpdate);
    }

    supabase.from('orders').insert(order).then(({ error }) => {
       if (error) console.error('Supabase Error (Order):', error);
    });
  }

  updateOrder(order: Order): void {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === order.id);
    if (index > -1) {
      const oldOrder = orders[index];
      let baleIdToUpdate: string | null = null;

      // Handle stock return on cancel/RTS
      if ((order.shippingStatus === ShippingStatus.CANCELLED || order.shippingStatus === ShippingStatus.RTS) && 
          (oldOrder.shippingStatus !== ShippingStatus.CANCELLED && oldOrder.shippingStatus !== ShippingStatus.RTS)) {
        const products = this.getProducts();
        const pIndex = products.findIndex(p => p.id === order.productId);
        if (pIndex > -1) {
          products[pIndex].stock += order.quantity;
          this.set(STORAGE_KEYS.PRODUCTS, products);
          baleIdToUpdate = products[pIndex].baleBatch;
          
          supabase.from('products').update({ stock: products[pIndex].stock }).eq('id', products[pIndex].id).then();
        }
      }

      orders[index] = order;
      this.set(STORAGE_KEYS.ORDERS, orders);

      if (baleIdToUpdate) {
        this.refreshBaleStatus(baleIdToUpdate);
      }

      supabase.from('orders').upsert(order).then();
    }
  }

  deleteOrder(id: string): void {
    const orders = this.getOrders();
    const order = orders.find(o => o.id === id);
    let baleIdToUpdate: string | null = null;

    if (order) {
       const products = this.getProducts();
       const product = products.find(p => p.id === order.productId);
       if (product) baleIdToUpdate = product.baleBatch;
    }

    const newOrders = orders.filter(o => o.id !== id);
    this.set(STORAGE_KEYS.ORDERS, newOrders);

    if (baleIdToUpdate) {
      this.refreshBaleStatus(baleIdToUpdate);
    }

    supabase.from('orders').delete().eq('id', id).then();
  }

  // --- Customers ---
  getCustomers(): Customer[] {
    return this.get(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  }
  updateCustomer(customer: Customer): void {
    const customers = this.getCustomers();
    const index = customers.findIndex(c => c.id === customer.id);
    if (index > -1) {
      customers[index] = customer;
    } else {
      customers.push(customer);
    }
    this.set(STORAGE_KEYS.CUSTOMERS, customers);
    
    supabase.from('customers').upsert(customer).then();
  }
  getOrCreateCustomer(username: string): Customer {
    const customers = this.getCustomers();
    let customer = customers.find(c => c.username === username);
    if (!customer) {
      customer = {
        id: `c_${Date.now()}`,
        username,
        isVIP: false,
        vipTickets: 0,
        isBlacklisted: false,
        totalSpent: 0,
        orderCount: 0
      };
      customers.push(customer);
      this.set(STORAGE_KEYS.CUSTOMERS, customers);
      
      supabase.from('customers').insert(customer).then();
    }
    // Ensure legacy customers have vipTickets field
    if (customer.vipTickets === undefined) {
        customer.vipTickets = 0;
        this.updateCustomer(customer);
    }
    return customer;
  }

  // --- Sessions ---
  getSessions(): LiveSession[] {
    return this.get(STORAGE_KEYS.SESSIONS, []);
  }
  createSession(name: string): LiveSession {
    const session: LiveSession = {
      id: `s_${Date.now()}`,
      name,
      date: new Date().toLocaleDateString('en-US'),
      totalSales: 0,
      totalOrders: 0,
      isOpen: true
    };
    const sessions = this.getSessions();
    sessions.push(session);
    this.set(STORAGE_KEYS.SESSIONS, sessions);
    
    supabase.from('live_sessions').insert(session).then();
    return session;
  }
  closeSession(id: string): void {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx > -1) {
      sessions[idx].isOpen = false;
      this.set(STORAGE_KEYS.SESSIONS, sessions);
      
      supabase.from('live_sessions').update({ isOpen: false }).eq('id', id).then();
    }
  }

  // --- Accounting ---
  getTransactions(): Transaction[] {
    return this.get(STORAGE_KEYS.TRANSACTIONS, []);
  }
  addTransaction(tx: Transaction): void {
    const txs = this.getTransactions();
    txs.push(tx);
    this.set(STORAGE_KEYS.TRANSACTIONS, txs);
    
    supabase.from('transactions').insert(tx).then();
  }
  
  // --- Categories ---
  getExpenseCategories(): string[] {
    return this.get(STORAGE_KEYS.CATEGORIES, [
      'Inventory Restock', 
      'Shipping Fee', 
      'Packaging', 
      'Rent', 
      'Utilities', 
      'Salary', 
      'Personal Withdrawal', 
      'Loan',
      'Capital',
      'Miscellaneous'
    ]).sort();
  }

  addExpenseCategory(category: string): void {
    const categories = this.getExpenseCategories();
    if (!categories.includes(category) && category.trim() !== '') {
      categories.push(category);
      this.setExpenseCategories(categories);
    }
  }

  setExpenseCategories(categories: string[]): void {
    const sorted = [...categories].sort();
    this.set(STORAGE_KEYS.CATEGORIES, sorted);
    
    // Sync to Supabase Settings table
    supabase.from('settings').upsert({ id: 1, expense_categories: sorted }).then(({ error }) => {
       if (error) console.error('Supabase Error (Settings Categories):', error);
    });
  }

  // --- Bales ---
  getBales(): Bale[] {
    return this.get(STORAGE_KEYS.BALES, INITIAL_BALES);
  }
  updateBale(bale: Bale): void {
    const bales = this.getBales();
    const index = bales.findIndex(b => b.id === bale.id);
    if (index > -1) {
      bales[index] = bale;
    } else {
      bales.push(bale);
    }
    this.set(STORAGE_KEYS.BALES, bales);
    
    supabase.from('bales').upsert(bale).then();
  }
  deleteBale(id: string): void {
    const bales = this.getBales().filter(b => b.id !== id);
    this.set(STORAGE_KEYS.BALES, bales);
    
    supabase.from('bales').delete().eq('id', id).then();
  }

  // --- Helper: Auto Status Update ---
  private refreshBaleStatus(baleId: string): void {
    const bales = this.getBales();
    const index = bales.findIndex(b => b.id === baleId);
    if (index === -1) return;

    const bale = bales[index];
    const products = this.getProducts();
    const baleProductIds = products.filter(p => p.baleBatch === baleId).map(p => p.id);
    const orders = this.getOrders();
    const soldCount = orders
      .filter(o => baleProductIds.includes(o.productId) && o.shippingStatus !== ShippingStatus.CANCELLED)
      .reduce((sum, o) => sum + o.quantity, 0);

    let newStatus = bale.status;

    if (soldCount >= bale.itemCount && bale.itemCount > 0) {
      newStatus = 'Sold Out';
    } else if (soldCount > 0 && soldCount < bale.itemCount) {
      if (bale.status === 'Ordered' || bale.status === 'Arrived' || bale.status === 'Sold Out') {
        newStatus = 'On Sale';
      }
    }

    if (newStatus !== bale.status) {
      bales[index].status = newStatus;
      this.set(STORAGE_KEYS.BALES, bales);
      
      supabase.from('bales').update({ status: newStatus }).eq('id', bale.id).then();
    }
  }
}

export const db = new DBService();
