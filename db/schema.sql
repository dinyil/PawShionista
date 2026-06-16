-- =====================================================================
-- PAWSHIONISTA LIVE SYSTEM - DATABASE MANAGEMENT SCRIPTS
-- =====================================================================
-- This file contains SQL commands to Reset (Clear/Remove) and Populated (Dump/Insert)
-- highly realistic test data for demonstration purposes.
-- Copy-paste these snippets to Supabase -> SQL Editor.


-- =====================================================================
-- PART 1: REMOVE / CLEAN SYSTEM DATA (RESET TABLE CONTENT)
-- =====================================================================
-- Run this if you want to wipe all records and start fresh.

TRUNCATE TABLE public.orders CASCADE;
TRUNCATE TABLE public.transactions CASCADE;
TRUNCATE TABLE public.products CASCADE;
TRUNCATE TABLE public.bales CASCADE;
TRUNCATE TABLE public.customers CASCADE;
TRUNCATE TABLE public.live_sessions CASCADE;

-- Reset standard settings template
INSERT INTO public.settings (id, logo_url, is_dark_mode, preset_prices, expense_categories)
VALUES (
  1, 
  NULL, 
  false, 
  '{10,50,80,130,150,160,170,180,190,200}'::integer[], 
  '{"Capital","Inventory Restock","Loan","Miscellaneous","Packaging","Personal Withdrawal","Rent","Salary","Shipping Fee","Utilities"}'::text[]
)
ON CONFLICT (id) DO UPDATE 
SET 
  logo_url = EXCLUDED.logo_url, 
  is_dark_mode = EXCLUDED.is_dark_mode, 
  preset_prices = EXCLUDED.preset_prices, 
  expense_categories = EXCLUDED.expense_categories;


-- =====================================================================
-- PART 2: DUMP / GENERATE REALISTIC LIVE DATA
-- =====================================================================
-- Run this to generate a complete business portfolio (Orders, Chart statistics,
-- Weekly / Monthly KPIs, Bales, Audit logs, and Bank/Wallet balances).

-- Clear first to avoid duplicate primary key collisions
TRUNCATE TABLE public.orders CASCADE;
TRUNCATE TABLE public.transactions CASCADE;
TRUNCATE TABLE public.products CASCADE;
TRUNCATE TABLE public.bales CASCADE;
TRUNCATE TABLE public.customers CASCADE;
TRUNCATE TABLE public.live_sessions CASCADE;

-- 1. Insert Bales (Bulto Stock batches)
INSERT INTO public.bales (id, name, status, cost, "itemCount") VALUES
('B001', 'Premium Korean Knitwear Selection Vol. 1', 'On Sale', 15000, 250),
('B002', 'Japanese Floral & Vintage Dresses', 'Arrived', 12000, 300),
('B003', 'Streetwear Bomber Jackets & Hoodies', 'Sold Out', 18000, 180);

-- 2. Insert Products extracted from these Bales
INSERT INTO public.products (id, name, brand, "baleBatch", "costPrice", "sellingPrice", stock) VALUES
('p1', 'Chunky Cable Knit Sweater (Cream)', 'Korean Style', 'B001', 60, 250, 12),
('p2', 'Cropped Cardigan (Lilac)', 'Spao', 'B001', 60, 180, 8),
('p3', 'Pastel Knit Vest', 'Zara Girl', 'B001', 60, 150, 15),
('p4', 'Retro Floral Dress (Navy)', 'Earth Music', 'B002', 40, 280, 19),
('p5', 'Lace Tiered Ribbon Dress', 'Axes Femme', 'B002', 40, 320, 5),
('p6', 'Casual Linen Midi Dress (Khaki)', 'MUJI', 'B002', 40, 220, 11),
('p7', 'Vintage Oversized Denim Jacket', 'Levis', 'B003', 100, 450, 0),
('p8', 'Tech-Wear Windbreaker (Black)', 'Nike Sport', 'B003', 100, 380, 0),
('p9', 'Pastel Hooded Sweatshirt', 'Champion', 'B003', 100, 290, 0);

-- 3. Insert Tik Tok Customers / Miners with varying reputations
INSERT INTO public.customers (id, username, "isVIP", "vipTickets", "isBlacklisted", "totalSpent", "orderCount") VALUES
('c1', 'thriftQueen_99', true, 3, false, 4850, 18),
('c2', 'korean_vibe_ph', true, 1, false, 2800, 12),
('c3', 'mine_grl_char', false, 0, false, 1250, 6),
('c4', 'bogus_joy_reserver_101', false, 0, true, 0, 0),
('c5', 'lucky_miner88', false, 0, false, 890, 4);

-- 4. Open and Closed Live Sessions
INSERT INTO public.live_sessions (id, name, date, "totalSales", "totalOrders", "isOpen") VALUES
('s_closed_1', 'Payday Midyear Clearance Sale 🎉', to_char(now() - interval '5 days', 'MM/DD/YYYY'), 8540, 34, false),
('s_active_2', 'Grand Premium Korean Knit Live Selling Stream 🔥', to_char(now(), 'MM/DD/YYYY'), 1350, 5, true);

-- 5. Insert Orders (Distributed to fill Daily charts and Weekly/Monthly KPIs)
-- Uses dynamic PostgreSQL intervals so stats are always fresh when you show it!
INSERT INTO public.orders (
  id, "sessionId", "customerId", "customerUsername", "productId", "productName", 
  quantity, "totalPrice", "isFreebie", "paymentStatus", "shippingStatus", 
  "paymentMethod", "referenceNumber", "amountPaid", "createdAt", "usedVipTicket"
) VALUES
-- Past Live Session: c1 buys regular clothes, fully paid
('o1', 's_closed_1', 'c1', 'thriftQueen_99', 'p1', 'Chunky Cable Knit Sweater (Cream)', 2, 500, false, 'Paid', 'Shipped', 'GCash', 'REF998811', 500, (extract(epoch from (now() - interval '5 days')) * 1000)::bigint, false),
('o2', 's_closed_1', 'c1', 'thriftQueen_99', 'p4', 'Retro Floral Dress (Navy)', 1, 280, false, 'Paid', 'Shipped', 'GCash', 'REF998811', 280, (extract(epoch from (now() - interval '5 days')) * 1000)::bigint, false),

-- Current Month: c2 buys multiple items, paid partially
('o3', 's_closed_1', 'c2', 'korean_vibe_ph', 'p5', 'Lace Tiered Ribbon Dress', 1, 320, false, 'Partial', 'Pending', 'Maya', 'REF726210', 150, (extract(epoch from (now() - interval '3 days')) * 1000)::bigint, false),
('o4', 's_closed_1', 'c2', 'korean_vibe_ph', 'p2', 'Cropped Cardigan (Lilac)', 1, 180, false, 'Partial', 'Pending', 'Maya', 'REF726210', 0, (extract(epoch from (now() - interval '3 days')) * 1000)::bigint, false),

-- Current Week: Unpaid order to display in outstanding logs
('o5', 's_closed_1', 'c3', 'mine_grl_char', 'p6', 'Casual Linen Midi Dress (Khaki)', 1, 220, false, 'Unpaid', 'Pending', NULL, NULL, 0, (extract(epoch from (now() - interval '2 days')) * 1000)::bigint, false),

-- Current Week: Freebie order
('o6', 's_closed_1', 'c1', 'thriftQueen_99', 'p3', 'Pastel Knit Vest', 1, 0, true, 'Paid', 'Shipped', 'Cash', 'FREE_DEAL', 0, (extract(epoch from (now() - interval '1 day')) * 1000)::bigint, false),

-- Active Stream: Real-time orders made today
('o7', 's_active_2', 'c1', 'thriftQueen_99', 'p1', 'Chunky Cable Knit Sweater (Cream)', 1, 250, false, 'Paid', 'Pending', 'GCash', 'REF837261', 250, (extract(epoch from now()) * 1000)::bigint, false),
('o8', 's_active_2', 'c5', 'lucky_miner88', 'p2', 'Cropped Cardigan (Lilac)', 2, 360, false, 'Unpaid', 'Pending', NULL, NULL, 0, (extract(epoch from now()) * 1000)::bigint, false);

-- 6. Accounting Transactions (Log helper payouts, load payments, capital investments)
INSERT INTO public.transactions (id, type, amount, wallet, category, note, "createdAt") VALUES
('tx1', 'Expense', 15000, 'Cash', 'Capital', 'Imported B001 Premium Korean Knit Bale', (extract(epoch from (now() - interval '15 days')) * 1000)::bigint),
('tx2', 'Expense', 350, 'GCash', 'Packaging', 'Ribbons and zip lock bags restock', (extract(epoch from (now() - interval '10 days')) * 1000)::bigint),
('tx3', 'Expense', 120, 'Cash', 'Shipping Fee', 'J&T drop-off fuel expense', (extract(epoch from (now() - interval '3 days')) * 1000)::bigint),
('tx4', 'Loan', 5000, 'Maya', 'Capital', 'Emergency inventory capital loan', (extract(epoch from (now() - interval '1 day')) * 1000)::bigint),
('tx5', 'Withdrawal', 1000, 'GCash', 'Personal Withdrawal', 'Weekly shop groceries & snacks', (extract(epoch from now()) * 1000)::bigint);