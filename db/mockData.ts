
import { Product, Bale, Customer } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Cotton Ribbon Dress (Blue)', brand: 'Belif', baleBatch: 'B001', costPrice: 45, sellingPrice: 150, stock: 12 },
  { id: 'p2', name: 'Summer Floral Shirt', brand: 'HD Crown', baleBatch: 'B001', costPrice: 35, sellingPrice: 120, stock: 8 },
  { id: 'p3', name: 'Puffy Sleeved Knit', brand: 'Korean Bale', baleBatch: 'B002', costPrice: 60, sellingPrice: 200, stock: 15 },
  { id: 'p4', name: 'Waterproof Rain Coat', brand: 'Handpick', baleBatch: 'B001', costPrice: 85, sellingPrice: 280, stock: 5 },
  { id: 'p5', name: 'Lace Pajamas (Pink)', brand: 'Belif', baleBatch: 'B002', costPrice: 50, sellingPrice: 180, stock: 10 },
];

export const INITIAL_BALES: Bale[] = [
  { id: 'B001', name: 'Spring/Summer Selection 2024', status: 'On Sale', cost: 12000, itemCount: 300 },
  { id: 'B002', name: 'Premium Korean Knit Bale', status: 'Arrived', cost: 15000, itemCount: 250 },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'c1', username: 'dogmom_ph', isVIP: true, vipTickets: 2, isBlacklisted: false, totalSpent: 2450, orderCount: 8 },
  { id: 'c2', username: 'pawlover_jen', isVIP: false, vipTickets: 0, isBlacklisted: false, totalSpent: 890, orderCount: 3 },
  { id: 'c3', username: 'joy_reserver_123', isVIP: false, vipTickets: 0, isBlacklisted: true, totalSpent: 0, orderCount: 0 },
];
