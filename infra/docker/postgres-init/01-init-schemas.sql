-- PostgreSQL Test Database Initialization Script
-- This script creates test schemas and tables for Flywheel e2e testing

-- ============================================================
-- SCHEMAS
-- ============================================================

CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS analytics;

COMMENT ON SCHEMA sales IS 'Sales-related tables for e2e testing';
COMMENT ON SCHEMA marketing IS 'Marketing-related tables for e2e testing';
COMMENT ON SCHEMA analytics IS 'Analytics-related tables for e2e testing';

-- ============================================================
-- SALES SCHEMA TABLES
-- ============================================================

-- Orders table - main test table for import flows
CREATE TABLE sales.orders (
    order_id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50),
    shipping_address TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON sales.orders(status);
CREATE INDEX idx_orders_customer_email ON sales.orders(customer_email);
CREATE INDEX idx_orders_order_date ON sales.orders(order_date);

COMMENT ON TABLE sales.orders IS 'Customer orders for testing import flows';
COMMENT ON COLUMN sales.orders.order_number IS 'Unique identifier for order tracking';

-- Products table - test relationships and joins
CREATE TABLE sales.products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    cost DECIMAL(10, 2),
    category VARCHAR(100),
    description TEXT,
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON sales.products(sku);
CREATE INDEX idx_products_category ON sales.products(category);
CREATE INDEX idx_products_is_active ON sales.products(is_active);

COMMENT ON TABLE sales.products IS 'Product catalog for testing';

-- Order items table - test composite keys and relationships
CREATE TABLE sales.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales.orders(order_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES sales.products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON sales.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON sales.order_items(product_id);

COMMENT ON TABLE sales.order_items IS 'Line items for orders';

-- ============================================================
-- MARKETING SCHEMA TABLES
-- ============================================================

-- Campaigns table - test different data types
CREATE TABLE marketing.campaigns (
    campaign_id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    budget DECIMAL(12, 2),
    spent DECIMAL(12, 2) DEFAULT 0,
    status VARCHAR(50) NOT NULL,
    target_audience JSONB,
    metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status ON marketing.campaigns(status);
CREATE INDEX idx_campaigns_dates ON marketing.campaigns(start_date, end_date);
CREATE INDEX idx_campaigns_target_audience ON marketing.campaigns USING GIN (target_audience);

COMMENT ON TABLE marketing.campaigns IS 'Marketing campaigns with JSON data for testing';

-- Leads table - test NULL handling and data quality
CREATE TABLE marketing.leads (
    lead_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    company VARCHAR(255),
    lead_source VARCHAR(100),
    lead_score INTEGER CHECK (lead_score BETWEEN 0 AND 100),
    status VARCHAR(50) DEFAULT 'new',
    campaign_id INTEGER REFERENCES marketing.campaigns(campaign_id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_leads_email ON marketing.leads(email);
CREATE INDEX idx_leads_status ON marketing.leads(status);
CREATE INDEX idx_leads_campaign_id ON marketing.leads(campaign_id);
CREATE INDEX idx_leads_lead_source ON marketing.leads(lead_source);

COMMENT ON TABLE marketing.leads IS 'Sales leads for testing NULL handling';

-- ============================================================
-- ANALYTICS SCHEMA TABLES
-- ============================================================

-- Page views table - test large datasets and pagination
CREATE TABLE analytics.page_views (
    view_id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id INTEGER,
    page_url TEXT NOT NULL,
    referrer_url TEXT,
    view_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_on_page INTEGER, -- seconds
    browser VARCHAR(100),
    device_type VARCHAR(50),
    ip_address INET,
    country VARCHAR(100),
    city VARCHAR(100)
);

CREATE INDEX idx_page_views_session_id ON analytics.page_views(session_id);
CREATE INDEX idx_page_views_user_id ON analytics.page_views(user_id);
CREATE INDEX idx_page_views_timestamp ON analytics.page_views(view_timestamp);
CREATE INDEX idx_page_views_country ON analytics.page_views(country);

COMMENT ON TABLE analytics.page_views IS 'Page view events for testing pagination';

-- Events table - test timestamp handling and time-based queries
CREATE TABLE analytics.events (
    event_id SERIAL PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    user_id INTEGER,
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_events_event_name ON analytics.events(event_name);
CREATE INDEX idx_events_event_type ON analytics.events(event_type);
CREATE INDEX idx_events_timestamp ON analytics.events(event_timestamp);
CREATE INDEX idx_events_user_id ON analytics.events(user_id);
CREATE INDEX idx_events_data ON analytics.events USING GIN (event_data);

COMMENT ON TABLE analytics.events IS 'Custom events for testing JSON and timestamp handling';

-- ============================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON sales.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON sales.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON marketing.campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON marketing.leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS FOR TESTING
-- ============================================================

-- Order summary view - test view queries
CREATE VIEW sales.order_summary AS
SELECT
    o.order_id,
    o.order_number,
    o.customer_name,
    o.order_date,
    o.status,
    COUNT(oi.order_item_id) as item_count,
    SUM(oi.subtotal) as calculated_total,
    o.total_amount
FROM sales.orders o
LEFT JOIN sales.order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.order_number, o.customer_name, o.order_date, o.status, o.total_amount;

COMMENT ON VIEW sales.order_summary IS 'Order summary for testing view queries';

-- Product performance view
CREATE VIEW sales.product_performance AS
SELECT
    p.product_id,
    p.product_name,
    p.sku,
    p.category,
    COUNT(DISTINCT oi.order_id) as times_ordered,
    SUM(oi.quantity) as total_quantity_sold,
    SUM(oi.subtotal) as total_revenue,
    AVG(oi.unit_price) as avg_selling_price
FROM sales.products p
LEFT JOIN sales.order_items oi ON p.product_id = oi.product_id
GROUP BY p.product_id, p.product_name, p.sku, p.category;

COMMENT ON VIEW sales.product_performance IS 'Product sales performance metrics';

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

-- Grant usage on schemas to testuser
GRANT USAGE ON SCHEMA sales TO testuser;
GRANT USAGE ON SCHEMA marketing TO testuser;
GRANT USAGE ON SCHEMA analytics TO testuser;

-- Grant all privileges on all tables to testuser
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sales TO testuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA marketing TO testuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA analytics TO testuser;

-- Grant all privileges on all sequences to testuser
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sales TO testuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA marketing TO testuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA analytics TO testuser;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT ALL ON SEQUENCES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA marketing GRANT ALL ON SEQUENCES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT ALL ON SEQUENCES TO testuser;