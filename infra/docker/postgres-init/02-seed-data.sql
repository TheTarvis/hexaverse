-- PostgreSQL Test Database - Sample Data
-- This script populates tables with test data for Flywheel e2e testing

-- ============================================================
-- SALES SCHEMA - SAMPLE DATA
-- ============================================================

-- Insert products first (referenced by order_items)
INSERT INTO sales.products (product_name, sku, price, cost, category, description, stock_quantity, is_active) VALUES
    ('Widget Pro', 'WDG-001', 49.99, 25.00, 'Electronics', 'Professional grade widget with advanced features', 150, true),
    ('Gadget Max', 'GDG-002', 129.99, 65.00, 'Electronics', 'Maximum performance gadget for power users', 75, true),
    ('Tool Kit Standard', 'TLK-003', 79.99, 40.00, 'Tools', 'Complete toolkit for everyday repairs', 200, true),
    ('Premium Cable 6ft', 'CBL-004', 19.99, 8.00, 'Accessories', 'High-quality 6-foot cable with gold connectors', 500, true),
    ('Smart Sensor', 'SNS-005', 89.99, 45.00, 'Electronics', 'IoT-enabled sensor with WiFi connectivity', 100, true),
    ('Adapter Universal', 'ADP-006', 24.99, 12.00, 'Accessories', 'Universal adapter for multiple devices', 300, true),
    ('Mount Bracket', 'MNT-007', 15.99, 7.00, 'Accessories', 'Heavy-duty mounting bracket', 250, true),
    ('Display 24inch', 'DSP-008', 299.99, 150.00, 'Electronics', '24-inch HD display with IPS panel', 50, true),
    ('Keyboard Mechanical', 'KBD-009', 159.99, 80.00, 'Electronics', 'Mechanical keyboard with RGB lighting', 80, true),
    ('Mouse Wireless', 'MUS-010', 39.99, 20.00, 'Electronics', 'Ergonomic wireless mouse', 200, true),
    ('Webcam HD', 'WBC-011', 69.99, 35.00, 'Electronics', '1080p HD webcam with auto-focus', 120, true),
    ('Headset Noise-Cancel', 'HDS-012', 199.99, 100.00, 'Electronics', 'Active noise cancellation headset', 60, true),
    ('Battery Pack', 'BAT-013', 44.99, 22.00, 'Accessories', 'Portable battery pack 10000mAh', 180, true),
    ('Case Protective', 'CSE-014', 29.99, 15.00, 'Accessories', 'Shock-resistant protective case', 350, true),
    ('Stand Adjustable', 'STD-015', 54.99, 27.00, 'Accessories', 'Height-adjustable device stand', 140, true);

-- Insert orders
INSERT INTO sales.orders (order_number, customer_name, customer_email, order_date, total_amount, status, payment_method, shipping_address, notes) VALUES
    ('ORD-2024-001', 'Acme Corporation', 'orders@acme.com', '2024-01-15 10:30:00-05', 1549.95, 'completed', 'credit_card', '123 Business Ave, New York, NY 10001', 'Rush delivery requested'),
    ('ORD-2024-002', 'Tech Solutions Inc', 'purchasing@techsolutions.com', '2024-01-16 14:22:00-05', 2389.90, 'completed', 'invoice', '456 Tech Park, San Francisco, CA 94105', 'Net 30 terms'),
    ('ORD-2024-003', 'Global Industries', 'procurement@globalind.com', '2024-01-17 09:15:00-05', 890.75, 'completed', 'credit_card', '789 Industrial Blvd, Chicago, IL 60601', NULL),
    ('ORD-2024-004', 'SmartHome Co', 'info@smarthome.com', '2024-01-18 16:45:00-05', 1299.88, 'pending', 'paypal', '321 Residential Dr, Austin, TX 78701', 'Gift wrapping requested'),
    ('ORD-2024-005', 'Enterprise Systems', 'orders@entsys.com', '2024-01-19 11:00:00-05', 3567.45, 'processing', 'wire_transfer', '654 Corporate Way, Boston, MA 02101', 'PO# ES-2024-789'),
    ('ORD-2024-006', 'Retail Dynamics', 'buy@retaildyn.com', '2024-01-20 13:30:00-05', 745.50, 'shipped', 'credit_card', '987 Commerce St, Seattle, WA 98101', 'Standard shipping'),
    ('ORD-2024-007', 'Digital Ventures', 'purchasing@digvent.com', '2024-01-21 15:10:00-05', 2145.75, 'completed', 'invoice', '147 Innovation Pkwy, Denver, CO 80201', 'Bulk order discount applied'),
    ('ORD-2024-008', 'Future Tech Labs', 'orders@futuretech.com', '2024-01-22 10:20:00-05', 1876.32, 'processing', 'credit_card', '258 Research Blvd, Portland, OR 97201', NULL),
    ('ORD-2024-009', 'Metro Solutions', 'procurement@metrosol.com', '2024-01-23 12:45:00-05', 624.85, 'pending', 'check', '369 Metro Plaza, Atlanta, GA 30301', 'Check in mail'),
    ('ORD-2024-010', 'Quantum Systems', 'orders@quantumsys.com', '2024-01-24 09:30:00-05', 4234.90, 'completed', 'wire_transfer', '741 Science Park, Raleigh, NC 27601', 'Large enterprise order'),
    ('ORD-2024-011', 'StartUp Hub', 'orders@startuphub.com', '2024-01-25 14:00:00-05', 889.95, 'shipped', 'credit_card', '852 Venture Ave, Miami, FL 33101', 'New customer'),
    ('ORD-2024-012', 'Innovation Labs', 'buy@innovlabs.com', '2024-01-26 11:15:00-05', 1567.40, 'processing', 'paypal', '963 Tech Center, Phoenix, AZ 85001', 'Express delivery'),
    ('ORD-2024-013', 'Cloud Services Co', 'orders@cloudserv.com', '2024-01-27 16:30:00-05', 3245.80, 'completed', 'invoice', '159 Data Dr, Dallas, TX 75201', 'Monthly subscription'),
    ('ORD-2024-014', 'DevOps Group', 'purchasing@devopsgrp.com', '2024-01-28 10:45:00-05', 1123.65, 'cancelled', 'credit_card', '357 Pipeline St, Minneapolis, MN 55401', 'Cancelled by customer'),
    ('ORD-2024-015', 'API Solutions', 'orders@apisol.com', '2024-01-29 13:20:00-05', 2678.90, 'pending', 'invoice', '486 Integration Way, Philadelphia, PA 19101', 'Awaiting approval');

-- Insert order items (linking orders and products)
INSERT INTO sales.order_items (order_id, product_id, quantity, unit_price, discount_amount) VALUES
    -- Order 1: Acme Corporation
    (1, 1, 10, 49.99, 0),      -- Widget Pro x10
    (1, 4, 25, 19.99, 50.00),  -- Premium Cable x25 with discount
    (1, 7, 30, 15.99, 0),      -- Mount Bracket x30
    -- Order 2: Tech Solutions Inc
    (2, 8, 5, 299.99, 0),      -- Display 24inch x5
    (2, 9, 5, 159.99, 0),      -- Keyboard Mechanical x5
    (2, 10, 5, 39.99, 0),      -- Mouse Wireless x5
    -- Order 3: Global Industries
    (3, 3, 10, 79.99, 0),      -- Tool Kit Standard x10
    (3, 6, 5, 24.99, 0),       -- Adapter Universal x5
    -- Order 4: SmartHome Co
    (4, 5, 12, 89.99, 0),      -- Smart Sensor x12
    (4, 13, 10, 44.99, 50.00), -- Battery Pack x10 with discount
    -- Order 5: Enterprise Systems
    (5, 8, 10, 299.99, 0),     -- Display 24inch x10
    (5, 12, 5, 199.99, 0),     -- Headset Noise-Cancel x5
    (5, 11, 8, 69.99, 0),      -- Webcam HD x8
    -- Order 6: Retail Dynamics
    (6, 14, 20, 29.99, 0),     -- Case Protective x20
    (6, 15, 5, 54.99, 25.00),  -- Stand Adjustable x5 with discount
    -- Order 7: Digital Ventures
    (7, 2, 15, 129.99, 0),     -- Gadget Max x15
    (7, 1, 10, 49.99, 0),      -- Widget Pro x10
    -- Order 8: Future Tech Labs
    (8, 9, 10, 159.99, 0),     -- Keyboard Mechanical x10
    (8, 10, 12, 39.99, 0),     -- Mouse Wireless x12
    (8, 11, 8, 69.99, 0),      -- Webcam HD x8
    -- Order 9: Metro Solutions
    (9, 3, 7, 79.99, 0),       -- Tool Kit Standard x7
    (9, 13, 5, 44.99, 0),      -- Battery Pack x5
    -- Order 10: Quantum Systems
    (10, 8, 12, 299.99, 0),    -- Display 24inch x12
    (10, 12, 8, 199.99, 0),    -- Headset Noise-Cancel x8
    -- Order 11: StartUp Hub
    (11, 1, 15, 49.99, 0),     -- Widget Pro x15
    (11, 4, 10, 19.99, 0),     -- Premium Cable x10
    -- Order 12: Innovation Labs
    (12, 5, 15, 89.99, 0),     -- Smart Sensor x15
    (12, 6, 10, 24.99, 0),     -- Adapter Universal x10
    -- Order 13: Cloud Services Co
    (13, 2, 20, 129.99, 0),    -- Gadget Max x20
    (13, 14, 25, 29.99, 0),    -- Case Protective x25
    -- Order 15: API Solutions (Order 14 cancelled, no items)
    (15, 8, 8, 299.99, 0),     -- Display 24inch x8
    (15, 9, 6, 159.99, 0);     -- Keyboard Mechanical x6

-- ============================================================
-- MARKETING SCHEMA - SAMPLE DATA
-- ============================================================

-- Insert campaigns
INSERT INTO marketing.campaigns (campaign_name, start_date, end_date, budget, spent, status, target_audience, metrics) VALUES
    ('Q1 2024 Product Launch', '2024-01-01', '2024-03-31', 50000.00, 32450.75, 'active',
     '{"age_range": "25-45", "interests": ["technology", "gadgets"], "regions": ["US", "CA", "UK"]}'::jsonb,
     '{"impressions": 125000, "clicks": 8500, "conversions": 450}'::jsonb),
    ('Winter Sale 2024', '2024-01-15', '2024-02-15', 25000.00, 24800.50, 'completed',
     '{"age_range": "18-65", "interests": ["shopping", "deals"], "regions": ["US"]}'::jsonb,
     '{"impressions": 200000, "clicks": 15000, "conversions": 1200}'::jsonb),
    ('Spring Email Campaign', '2024-03-01', '2024-04-30', 15000.00, 8750.25, 'active',
     '{"segment": "existing_customers", "purchase_history": "active_last_6_months"}'::jsonb,
     '{"emails_sent": 50000, "opened": 12500, "clicked": 3750, "conversions": 285}'::jsonb),
    ('Social Media Awareness', '2024-01-01', '2024-12-31', 100000.00, 45623.80, 'active',
     '{"platforms": ["facebook", "instagram", "twitter"], "age_range": "18-55"}'::jsonb,
     '{"impressions": 500000, "engagements": 25000, "followers_gained": 2500}'::jsonb),
    ('Partner Co-Marketing', '2024-02-01', '2024-06-30', 35000.00, 18900.00, 'active',
     '{"partner": "TechPartner Inc", "audience": "enterprise_customers"}'::jsonb,
     '{"webinar_attendees": 450, "downloads": 780, "leads": 120}'::jsonb),
    ('Retargeting Campaign', '2024-01-10', '2024-03-10', 20000.00, 19875.00, 'completed',
     '{"segment": "cart_abandoners", "lookback_days": 30}'::jsonb,
     '{"impressions": 75000, "clicks": 4500, "conversions": 380, "recovered_carts": 280}'::jsonb);

-- Insert leads
INSERT INTO marketing.leads (first_name, last_name, email, phone, company, lead_source, lead_score, status, campaign_id, notes) VALUES
    ('John', 'Smith', 'john.smith@acme.com', '555-0101', 'Acme Corporation', 'website', 85, 'qualified', 1, 'Interested in enterprise package'),
    ('Sarah', 'Johnson', 'sarah.j@techsol.com', '555-0102', 'Tech Solutions Inc', 'referral', 92, 'converted', 1, 'Closed deal - $50k annual contract'),
    ('Michael', 'Williams', 'mwilliams@globalind.com', '555-0103', 'Global Industries', 'trade_show', 75, 'nurturing', 2, 'Follow up after trade show'),
    ('Emily', 'Brown', 'emily.brown@smarthome.com', '555-0104', 'SmartHome Co', 'paid_ad', 68, 'qualified', 2, 'Demo scheduled for next week'),
    ('David', 'Jones', 'djones@entsys.com', '555-0105', 'Enterprise Systems', 'cold_call', 55, 'contacted', 3, 'Gatekeeper - need decision maker'),
    ('Jennifer', 'Davis', 'jennifer@retaildyn.com', '555-0106', 'Retail Dynamics', 'website', 88, 'converted', 2, 'Closed deal - multiple locations'),
    ('Robert', 'Miller', 'rmiller@digvent.com', '555-0107', 'Digital Ventures', 'email_campaign', 70, 'qualified', 3, 'Responded to email, wants quote'),
    ('Lisa', 'Wilson', 'lisa.w@futuretech.com', '555-0108', 'Future Tech Labs', 'partner', 95, 'qualified', 5, 'Hot lead from partner referral'),
    ('James', 'Moore', 'jmoore@metrosol.com', '555-0109', 'Metro Solutions', 'website', 45, 'new', 1, 'Downloaded whitepaper'),
    ('Patricia', 'Taylor', 'ptaylor@quantumsys.com', '555-0110', 'Quantum Systems', 'trade_show', 82, 'qualified', 1, 'Enterprise customer - high value'),
    ('Christopher', 'Anderson', 'canderson@startuphub.com', '555-0111', 'StartUp Hub', 'social_media', 60, 'nurturing', 4, 'Following on Twitter'),
    ('Jessica', 'Thomas', 'jthomas@innovlabs.com', '555-0112', 'Innovation Labs', 'paid_ad', 73, 'qualified', 1, 'Interested in pilot program'),
    ('Daniel', 'Jackson', 'djackson@cloudserv.com', NULL, 'Cloud Services Co', 'website', 90, 'converted', 3, 'Closed deal - recurring revenue'),
    ('Michelle', 'White', 'mwhite@devopsgrp.com', '555-0114', 'DevOps Group', 'referral', 65, 'qualified', 4, 'Referred by existing customer'),
    ('Kevin', 'Harris', 'kharris@apisol.com', '555-0115', 'API Solutions', 'cold_call', 50, 'contacted', NULL, 'Left voicemail - awaiting callback'),
    ('Laura', 'Martin', 'lmartin@example.com', '555-0116', NULL, 'website', 35, 'new', 2, 'Downloaded trial software'),
    ('Paul', 'Thompson', 'pthompson@testcorp.com', NULL, 'Test Corporation', 'trade_show', 72, 'nurturing', 1, 'Booth visit - collecting info'),
    ('Amanda', 'Garcia', 'agarcia@democo.com', '555-0118', 'Demo Company', 'email_campaign', 58, 'contacted', 3, 'Opened multiple emails'),
    ('Mark', 'Martinez', NULL, '555-0119', NULL, 'social_media', 40, 'new', 4, 'Engaged with social posts'),
    ('Karen', 'Robinson', 'krobinson@sampleinc.com', '555-0120', 'Sample Inc', 'partner', 87, 'qualified', 5, 'Partner introduction - warm lead');

-- ============================================================
-- ANALYTICS SCHEMA - SAMPLE DATA
-- ============================================================

-- Insert page views (more extensive dataset for pagination testing)
INSERT INTO analytics.page_views (session_id, user_id, page_url, referrer_url, view_timestamp, time_on_page, browser, device_type, ip_address, country, city)
SELECT
    'session_' || LPAD(gs::text, 6, '0'),
    CASE WHEN random() < 0.7 THEN (random() * 100)::integer ELSE NULL END,
    CASE (random() * 10)::integer
        WHEN 0 THEN '/home'
        WHEN 1 THEN '/products'
        WHEN 2 THEN '/products/widget-pro'
        WHEN 3 THEN '/products/gadget-max'
        WHEN 4 THEN '/about'
        WHEN 5 THEN '/contact'
        WHEN 6 THEN '/cart'
        WHEN 7 THEN '/checkout'
        WHEN 8 THEN '/blog'
        ELSE '/support'
    END,
    CASE (random() * 5)::integer
        WHEN 0 THEN 'https://google.com/search'
        WHEN 1 THEN 'https://facebook.com'
        WHEN 2 THEN NULL
        WHEN 3 THEN 'https://twitter.com'
        ELSE 'https://partner-site.com'
    END,
    TIMESTAMP '2024-01-01 00:00:00' + (random() * INTERVAL '30 days'),
    (random() * 300)::integer, -- 0-300 seconds
    CASE (random() * 5)::integer
        WHEN 0 THEN 'Chrome'
        WHEN 1 THEN 'Firefox'
        WHEN 2 THEN 'Safari'
        WHEN 3 THEN 'Edge'
        ELSE 'Mobile Safari'
    END,
    CASE (random() * 3)::integer
        WHEN 0 THEN 'desktop'
        WHEN 1 THEN 'mobile'
        ELSE 'tablet'
    END,
    ('192.168.' || (random() * 255)::integer || '.' || (random() * 255)::integer)::inet,
    CASE (random() * 5)::integer
        WHEN 0 THEN 'United States'
        WHEN 1 THEN 'United Kingdom'
        WHEN 2 THEN 'Canada'
        WHEN 3 THEN 'Germany'
        ELSE 'France'
    END,
    CASE (random() * 8)::integer
        WHEN 0 THEN 'New York'
        WHEN 1 THEN 'London'
        WHEN 2 THEN 'Toronto'
        WHEN 3 THEN 'San Francisco'
        WHEN 4 THEN 'Berlin'
        WHEN 5 THEN 'Paris'
        WHEN 6 THEN 'Chicago'
        ELSE 'Los Angeles'
    END
FROM generate_series(1, 1000) AS gs;

-- Insert events
INSERT INTO analytics.events (event_name, event_type, user_id, event_timestamp, event_data) VALUES
    ('product_viewed', 'engagement', 15, '2024-01-15 10:30:00', '{"product_id": "WDG-001", "category": "Electronics"}'::jsonb),
    ('add_to_cart', 'conversion', 15, '2024-01-15 10:32:00', '{"product_id": "WDG-001", "quantity": 2, "price": 49.99}'::jsonb),
    ('checkout_started', 'conversion', 15, '2024-01-15 10:35:00', '{"cart_total": 99.98, "item_count": 2}'::jsonb),
    ('purchase_completed', 'conversion', 15, '2024-01-15 10:38:00', '{"order_id": "ORD-2024-001", "total": 99.98}'::jsonb),
    ('newsletter_signup', 'engagement', 23, '2024-01-16 14:20:00', '{"source": "homepage", "list": "general"}'::jsonb),
    ('video_watched', 'engagement', 45, '2024-01-17 09:15:00', '{"video_id": "demo-2024", "duration": 180, "percent_watched": 85}'::jsonb),
    ('search_performed', 'engagement', 67, '2024-01-18 11:22:00', '{"query": "wireless mouse", "results": 12}'::jsonb),
    ('filter_applied', 'engagement', 67, '2024-01-18 11:23:00', '{"filter": "price", "range": "0-50"}'::jsonb),
    ('product_reviewed', 'engagement', 89, '2024-01-19 16:45:00', '{"product_id": "KBD-009", "rating": 5, "review_length": 250}'::jsonb),
    ('support_ticket_created', 'support', 34, '2024-01-20 10:10:00', '{"subject": "Shipping delay", "priority": "medium"}'::jsonb);

-- ============================================================
-- COMPLETION MESSAGE
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PostgreSQL Test Database Initialized';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Schemas created:';
    RAISE NOTICE '  - sales (orders, products, order_items)';
    RAISE NOTICE '  - marketing (campaigns, leads)';
    RAISE NOTICE '  - analytics (page_views, events)';
    RAISE NOTICE '';
    RAISE NOTICE 'Sample data summary:';
    RAISE NOTICE '  - Products: 15';
    RAISE NOTICE '  - Orders: 15';
    RAISE NOTICE '  - Order Items: 35';
    RAISE NOTICE '  - Campaigns: 6';
    RAISE NOTICE '  - Leads: 20';
    RAISE NOTICE '  - Page Views: 1000';
    RAISE NOTICE '  - Events: 10';
    RAISE NOTICE '';
    RAISE NOTICE 'Database ready for Flywheel e2e testing!';
    RAISE NOTICE '========================================';
END $$;