-- =========================================
-- TRANSACTIONS
-- =========================================

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,

    transaction_date DATE NOT NULL,

    merchant TEXT NOT NULL,

    merchant_canonical TEXT NOT NULL,

    category TEXT,

    amount NUMERIC(14,2) NOT NULL,

    currency TEXT NOT NULL,

    memo TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_date
ON transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_category
ON transactions(category);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant
ON transactions(merchant_canonical);

CREATE INDEX IF NOT EXISTS idx_transactions_category_date
ON transactions(category, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_date
ON transactions(merchant_canonical, transaction_date);


-- =========================================
-- FUNDS
-- =========================================

CREATE TABLE IF NOT EXISTS funds (
    id TEXT PRIMARY KEY,

    name TEXT NOT NULL,

    category TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funds_name
ON funds(name);

ALTER TABLE funds
ALTER COLUMN category SET NOT NULL;

-- =========================================
-- FUND NAV HISTORY
-- =========================================

CREATE TABLE IF NOT EXISTS fund_navs (
    fund_id TEXT NOT NULL
        REFERENCES funds(id)
        ON DELETE CASCADE,

    nav_date DATE NOT NULL,

    nav NUMERIC(12,4) NOT NULL,

    PRIMARY KEY (fund_id, nav_date)
);

CREATE INDEX IF NOT EXISTS idx_fund_navs_date
ON fund_navs(nav_date);

CREATE INDEX IF NOT EXISTS idx_fund_navs_lookup
ON fund_navs(fund_id, nav_date);


-- =========================================
-- HOLDINGS
-- =========================================

CREATE TABLE IF NOT EXISTS holdings (
    id SERIAL PRIMARY KEY,

    fund_id TEXT NOT NULL
        REFERENCES funds(id)
        ON DELETE CASCADE,

    fund_name TEXT NOT NULL,

    units NUMERIC(14,4) NOT NULL,

    purchase_date DATE NOT NULL,

    purchase_nav NUMERIC(12,4) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holdings_fund
ON holdings(fund_id);

CREATE INDEX IF NOT EXISTS idx_holdings_purchase_date
ON holdings(purchase_date);