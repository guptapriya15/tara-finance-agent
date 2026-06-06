-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                 TEXT         PRIMARY KEY,
  transaction_date   DATE         NOT NULL,
  merchant           TEXT         NOT NULL,
  merchant_canonical TEXT         NOT NULL,
  category           TEXT         NOT NULL DEFAULT 'uncategorized',
  amount             NUMERIC(14,2) NOT NULL,
  currency           TEXT         NOT NULL DEFAULT 'INR',
  memo               TEXT
);

CREATE INDEX IF NOT EXISTS idx_txn_date
  ON transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_txn_category
  ON transactions(category);

CREATE INDEX IF NOT EXISTS idx_txn_merchant_canonical
  ON transactions(merchant_canonical);

CREATE INDEX IF NOT EXISTS idx_txn_cat_date
  ON transactions(category, transaction_date);

CREATE INDEX IF NOT EXISTS idx_txn_merchant_date
  ON transactions(merchant_canonical, transaction_date);

-- ============================================================
-- FUNDS  (market data — independent of who owns the fund)
-- ============================================================
CREATE TABLE IF NOT EXISTS funds (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funds_name
  ON funds(name);

-- ============================================================
-- FUND NAV HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS fund_navs (
  fund_id  TEXT         NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  nav_date DATE         NOT NULL,
  nav      NUMERIC(12,4) NOT NULL,
  PRIMARY KEY (fund_id, nav_date)
);

CREATE INDEX IF NOT EXISTS idx_fund_navs_lookup
  ON fund_navs(fund_id, nav_date DESC);

-- ============================================================
-- HOLDINGS  (what the user owns)
-- ============================================================
CREATE TABLE IF NOT EXISTS holdings (
  id           SERIAL        PRIMARY KEY,
  fund_id      TEXT          NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  fund_name    TEXT          NOT NULL,
  units        NUMERIC(14,4) NOT NULL,
  purchase_date DATE         NOT NULL,
  purchase_nav  NUMERIC(12,4) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holdings_fund
  ON holdings(fund_id);

-- ============================================================
-- REQUEST TRACES  (observability)
-- ============================================================
CREATE TABLE IF NOT EXISTS request_traces (
  request_id   TEXT        PRIMARY KEY,
  question     TEXT        NOT NULL,
  tools_called JSONB,
  tables_read  TEXT[],
  status       TEXT        NOT NULL DEFAULT 'pending',
  error_msg    TEXT,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);