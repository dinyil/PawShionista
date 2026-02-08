
export enum PaymentStatus {
  UNPAID = 'Unpaid',
  PARTIAL = 'Partial',
  PAID = 'Paid'
}

export enum ShippingStatus {
  PENDING = 'Pending',
  SHIPPED = 'Shipped',
  RTS = 'RTS',
  CANCELLED = 'Cancelled'
}

export enum PaymentMethod {
  GCASH = 'GCash',
  MAYA = 'Maya',
  TIKTOK = 'TikTok Checkout',
  GOTYME = 'GoTyme',
  SEABANK = 'SeaBank',
  BPI = 'BPI',
  CASH = 'Cash'
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  baleBatch: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
}

export interface Customer {
  id: string;
  username: string; // TikTok Username
  isVIP: boolean;
  vipTickets: number; // Number of VIP tickets available
  isBlacklisted: boolean;
  totalSpent: number;
  orderCount: number;
}

export interface Order {
  id: string;
  sessionId: string;
  customerId: string;
  customerUsername: string;
  productId: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  isFreebie: boolean;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  amountPaid: number;
  createdAt: number;
  usedVipTicket?: boolean; // Track if ticket was used in this order batch
  logs?: string[]; // Audit trail for edits
}

export interface LiveSession {
  id: string;
  name: string;
  date: string;
  totalSales: number;
  totalOrders: number;
  isOpen: boolean;
}

export interface Bale {
  id: string;
  name: string;
  status: 'Ordered' | 'Arrived' | 'On Sale' | 'Sold Out';
  cost: number;
  itemCount: number;
}

export interface Transaction {
  id: string;
  type: 'Expense' | 'Withdrawal' | 'Loan';
  amount: number;
  wallet: string;
  category: string;
  note: string;
  createdAt: number;
}

export interface Device {
  id: string;
  device_id: string;
  name: string;
  type: string;
  os: string;
  browser: string;
  ip_address: string;
  location: string;
  status: 'pending' | 'approved' | 'blocked';
  last_active: string;
}
