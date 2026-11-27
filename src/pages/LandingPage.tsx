import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  X,
  Package,
  TrendingUp,
  Coins,
  Bell,
  CalendarClock,
  Sparkles,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';

export const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const primaryDestination = user ? '/dashboard' : '/login';
  const primaryLabel = user ? 'Go to dashboard' : 'Log in';

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page">
      {/* Sticky Top Navigation */}
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link
            to="/"
            style={{
              textDecoration: 'none',
              color: 'var(--color-on-surface)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <img
              src="/favicon.svg"
              alt="System logo"
              width={28}
              height={28}
              style={{ borderRadius: '6px', flexShrink: 0 }}
            />
            <span className="text-label-lg">
              Supermarket Stock &amp; Profit System
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="landing-nav-desktop" aria-label="Primary navigation">
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('features');
              }}
              className="ui-btn ui-btn--link text-label-lg"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('how-it-works');
              }}
              className="ui-btn ui-btn--link text-label-lg"
            >
              How it works
            </a>
            <Link to={primaryDestination} className="ui-btn ui-btn--primary">
              {primaryLabel}
            </Link>
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="landing-menu-toggle"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <nav className="landing-nav-mobile" aria-label="Mobile navigation">
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('features');
              }}
              className="ui-btn ui-btn--link text-label-lg"
              style={{ justifyContent: 'flex-start', padding: '6px 0' }}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('how-it-works');
              }}
              className="ui-btn ui-btn--link text-label-lg"
              style={{ justifyContent: 'flex-start', padding: '6px 0' }}
            >
              How it works
            </a>
            <Link
              to={primaryDestination}
              className="ui-btn ui-btn--primary"
              style={{ width: '100%' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {primaryLabel}
            </Link>
          </nav>
        )}
      </header>

      <main>
        {/* Hero Section */}
        <section className="landing-hero">
          <div className="landing-container landing-hero-grid">
            <div>
              <Chip variant="active">Rwanda Retail Inventory &amp; Forecasting</Chip>
              <h1
                className="landing-hero-title"
                style={{ marginTop: 'var(--space-sm)' }}
              >
                Know what to stock before your shelves run out.
              </h1>
              <p
                className="text-body-lg"
                style={{
                  color: 'var(--color-secondary)',
                  marginTop: 'var(--space-sm)',
                  maxWidth: '560px',
                }}
              >
                Track daily sales and perishable batches, predict 30-day unit
                demand and RWF profit with machine learning, and act on low-stock
                and expiry alerts before losses happen.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-sm)',
                  marginTop: 'var(--space-md)',
                }}
              >
                <Link to={primaryDestination} className="ui-btn ui-btn--primary">
                  {primaryLabel}
                </Link>
                <button
                  type="button"
                  className="ui-btn ui-btn--secondary"
                  onClick={() => scrollToSection('how-it-works')}
                >
                  See how it works
                </button>
              </div>
            </div>

            {/* Static Sample Dashboard Preview built with the app's Card and Chip components */}
            <Card
              aria-label="Sample dashboard preview"
              style={{
                padding: 'var(--space-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--space-xs)',
                  paddingBottom: 'var(--space-xs)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <div className="text-label-lg">
                    Supermarket Inventory Snapshot
                  </div>
                  <div
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    Preview of store metrics in Rwandan Francs (RWF)
                  </div>
                </div>
                <Chip variant="active">Sample data</Chip>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 'var(--space-xs)',
                }}
              >
                <Card>
                  <div
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    Sellable stock at cost
                  </div>
                  <div
                    className="text-label-lg"
                    style={{ marginTop: '4px', fontSize: '16px' }}
                  >
                    RWF 18,450,000
                  </div>
                  <div
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)', marginTop: '2px' }}
                  >
                    50 active products
                  </div>
                </Card>

                <Card>
                  <div
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    Predicted 30d profit
                  </div>
                  <div
                    className="text-label-lg"
                    style={{
                      marginTop: '4px',
                      fontSize: '16px',
                      color: 'var(--color-primary)',
                    }}
                  >
                    RWF 4,820,500
                  </div>
                  <div
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)', marginTop: '2px' }}
                  >
                    7d profit: RWF 1,140,000
                  </div>
                </Card>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    Urgent stock &amp; expiry alerts (sample)
                  </span>
                  <Chip>Sample data</Chip>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div className="text-label-md">
                      Inyange UHT Whole Milk 1L
                    </div>
                    <div
                      className="text-label-sm"
                      style={{ color: 'var(--color-secondary)' }}
                    >
                      DRY-001 · Stock: 42 units · Suggested reorder: 495 units
                    </div>
                  </div>
                  <Chip variant="error">Stock-out risk</Chip>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div className="text-label-md">
                      Whole Wheat Brown Bread 800g
                    </div>
                    <div
                      className="text-label-sm"
                      style={{ color: 'var(--color-secondary)' }}
                    >
                      BKR-002 · Stock: 18 units · Reorder level: 25 units
                    </div>
                  </div>
                  <Chip variant="error">Low stock</Chip>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div className="text-label-md">
                      Inyange Strawberry Yoghurt 400g
                    </div>
                    <div
                      className="text-label-sm"
                      style={{ color: 'var(--color-secondary)' }}
                    >
                      DRY-004 · Batch expires in 3 days · 45 units
                    </div>
                  </div>
                  <Chip variant="active">Expiring within 7 days</Chip>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="landing-section">
          <div className="landing-container">
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h2 className="text-headline-md">Core features</h2>
              <p
                className="text-body-md"
                style={{
                  color: 'var(--color-secondary)',
                  marginTop: 'var(--space-xs)',
                  maxWidth: '620px',
                }}
              >
                Built specifically for single-store supermarket operations in
                Rwanda, with all figures formatted in whole Rwandan Francs (RWF).
              </p>
            </div>

            <div className="landing-features-grid">
              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Package size={18} />
                  <h3
                    className="text-label-lg"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Stock tracking
                  </h3>
                </div>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Maintain product SKUs, categories, cost and selling prices in
                  RWF, reorder levels, and automatic stock ledger updates on
                  every sale or delivery.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--color-primary)',
                  }}
                >
                  <TrendingUp size={18} />
                  <h3
                    className="text-label-lg"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Demand forecast (machine learning)
                  </h3>
                </div>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Trains a Ridge Regression model on 180 days of daily sales
                  using trend, day-of-week, month-end, and payday features,
                  backtested over 28 days with WAPE accuracy.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Coins size={18} />
                  <h3
                    className="text-label-lg"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Profit prediction
                  </h3>
                </div>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Projects 7-day and 30-day revenue and gross profit in RWF for
                  every forecasted product and category based on verified unit
                  margins.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Bell size={18} />
                  <h3
                    className="text-label-lg"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Smart alerts
                  </h3>
                </div>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Flags stock-out risks with estimated stock-out dates, low
                  stock, overstocked products (&gt;45 days of demand), and slow
                  movers, with 14-day suggested reorder quantities.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--color-primary)',
                  }}
                >
                  <CalendarClock size={18} />
                  <h3
                    className="text-label-lg"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Expiry tracking
                  </h3>
                </div>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Tracks perishable deliveries by expiry batch, deducts sales
                  from earliest in-date batches first (FEFO), blocks expired
                  stock from being sold, and logs write-offs.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Sparkles size={18} />
                  <h3
                    className="text-label-lg"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    AI assistant
                  </h3>
                </div>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Produces plain-English restocking and clearance advice and
                  answers manager questions using only pre-computed database and
                  forecast numbers.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* How It Works Section (4 Steps) */}
        <section id="how-it-works" className="landing-section">
          <div className="landing-container">
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h2 className="text-headline-md">How it works</h2>
              <p
                className="text-body-md"
                style={{
                  color: 'var(--color-secondary)',
                  marginTop: 'var(--space-xs)',
                  maxWidth: '620px',
                }}
              >
                Four steps from daily counter transactions to demand predictions
                and restocking decisions.
              </p>
            </div>

            <div className="landing-steps-grid">
              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div>
                  <Chip variant="active">Step 1</Chip>
                </div>
                <h3 className="text-label-lg">Record sales and deliveries</h3>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Staff record customer sales and incoming supplier deliveries
                  (with expiry dates for perishable goods), or import historical
                  sales via CSV.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div>
                  <Chip variant="active">Step 2</Chip>
                </div>
                <h3 className="text-label-lg">Run the forecast</h3>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  The manager triggers the Ridge Regression forecast engine to
                  evaluate 28-day backtest accuracy and predict the next 30 days
                  of demand and profit.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div>
                  <Chip variant="active">Step 3</Chip>
                </div>
                <h3 className="text-label-lg">
                  Review alerts, expiry and profit
                </h3>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Check urgent stock-out dates, suggested reorder quantities,
                  batches expiring within 7 days, and top profit products on the
                  Dashboard.
                </p>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                }}
              >
                <div>
                  <Chip variant="active">Step 4</Chip>
                </div>
                <h3 className="text-label-lg">Ask the AI assistant</h3>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Read the saved executive insight or ask the AI Assistant what
                  to restock, discount, or slow down—backed strictly by verified
                  store figures.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Two Roles Section: Manager vs Clerk */}
        <section className="landing-section">
          <div className="landing-container">
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <h2 className="text-headline-md">Role-based access control</h2>
              <p
                className="text-body-md"
                style={{
                  color: 'var(--color-secondary)',
                  marginTop: 'var(--space-xs)',
                  maxWidth: '620px',
                }}
              >
                Enforced both in the user interface and at the PostgreSQL database
                layer through Supabase Row Level Security.
              </p>
            </div>

            <div className="landing-roles-grid">
              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <ShieldCheck size={18} color="var(--color-primary)" />
                    <h3 className="text-label-lg">What the Manager sees</h3>
                  </div>
                  <Chip variant="active">Full access</Chip>
                </div>
                <ul
                  className="text-body-sm"
                  style={{
                    color: 'var(--color-secondary)',
                    marginLeft: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <li>
                    Dashboard with total sellable stock value at cost, 7-day and
                    30-day predicted RWF profit, model accuracy, and AI summary.
                  </li>
                  <li>
                    Add new products and categories, view unit costs and profit
                    margins, and import historical sales CSV files.
                  </li>
                  <li>
                    Run the 30-day demand and profit forecast engine and inspect
                    60-day actual vs 30-day predicted charts.
                  </li>
                  <li>
                    All alert types (Stock-out risk, Low stock, Overstock, Slow
                    movers), expiry batch cost values, and the AI Assistant.
                  </li>
                </ul>
              </Card>

              <Card
                style={{
                  padding: 'var(--space-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <UserCheck size={18} color="var(--color-secondary)" />
                    <h3 className="text-label-lg">What the Clerk sees</h3>
                  </div>
                  <Chip>Operations only</Chip>
                </div>
                <ul
                  className="text-body-sm"
                  style={{
                    color: 'var(--color-secondary)',
                    marginLeft: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <li>
                    Dashboard showing their own sales count recorded today,
                    low-stock items, and expired or expiring unit counts.
                  </li>
                  <li>
                    Products list with selling prices and stock levels, and forms
                    to record daily customer sales and supplier deliveries.
                  </li>
                  <li>
                    Expiry page to check batch expiry dates and write off expired
                    batches from the shelf.
                  </li>
                  <li>
                    No access to unit cost prices, write-off loss amounts, profit
                    figures, demand forecasts, or AI insights.
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: 'var(--color-neutral)',
          borderTop: '1px solid var(--color-border-subtle)',
          padding: 'var(--space-md) 0',
        }}
      >
        <div
          className="landing-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-sm)',
          }}
        >
          <span
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)' }}
          >
            Supermarket Stock Demand and Profit Prediction System
          </span>

          <Link
            to={primaryDestination}
            className="ui-btn ui-btn--link text-label-lg"
            style={{ color: 'var(--color-primary)' }}
          >
            {primaryLabel}
          </Link>
        </div>
      </footer>
    </div>
  );
};

