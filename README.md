# Business Simulator

A deep, browser-based business simulation. Found a company, make decisions, advance time, and live with interconnected consequences. Then click any number to see *why* it moved.

Every number is computed by the simulation engine: prices drive demand through a customer-choice model, activity posts to a double-entry ledger, and the income statement, balance sheet and cash-flow statement all come from those postings.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (Vitest)
npm run lint
npm run build
```

No backend. Saves are stored in the browser (IndexedDB), with preferences and the leaderboard in localStorage. You can export and import save files as JSON.

## What you can do

- **Found a company**: pick from 20 industries (SaaS, AI, electronics, e-commerce, retail, manufacturing, food, restaurants, logistics, healthcare, fintech, education, gaming, media, automotive, fashion, real-estate services, energy, consulting, cybersecurity). Then choose a monetization model, go-to-market channel, audience, target segment, headquarters, difficulty and capital. Industries differ in margins, churn, capital intensity, regulation, cyclicality, fulfilment (digital, service, inventory, manufactured), network effects and more.
- **Products**: develop products with quality, scope, budget and speed trade-offs, and choose a launch strategy. Products move through a lifecycle (growth, maturity, decline). Ship updates, file patents and run platform programs.
- **Pricing & customers**: seven customer segments with different price, quality and brand sensitivity choose between you, competitors and not buying (multinomial logit). The funnel runs awareness → interest → visit → consideration → trial → purchase → activation, with referrals, expansion and churn.
- **Marketing & sales**: 14 channels with cost-per-reach, saturation, audience targeting and attribution (CAC by channel). A B2B sales pipeline is limited by SDR and account-executive capacity. Also brand, A/B tests and partnerships.
- **Operations**: inventory at weighted-average cost; suppliers with lead times, reliability, capacity and negotiable terms; purchase orders and payables; factories with lines, crews, machine condition and defects; offices, warehouses, stores and labs (rent or buy).
- **People**: individual employees with skill, morale, burnout, loyalty and productivity. Hiring works through candidates, interviews and salary negotiation, followed by notice periods and probation. Promotions, raises, terminations and layoffs, plus department budgets, management style, remote policy and culture.
- **Finance**: monthly, quarterly and annual statements, unit economics, taxes with loss carryforward, receivables and payables, deferred revenue, depreciation, and bank, venture, revolving and equipment debt with covenants and default.
- **Capital**: valuation, a real cap table, rounds from friends & family to growth equity, term-sheet negotiation, option pools, a board with priorities and approvals, IPO, a simulated stock, dividends and buybacks.
- **World**: a macro economy with expansions, booms, slowdowns and three kinds of recession, FX rates, 19 geographic markets, independent competitors, uncertain competitive intelligence, 23 kinds of random event and a news feed.
- **Growth & exits**: R&D projects, technology tracks, cybersecurity, legal cases, ESG, acquisitions, mergers, acquisition offers, private sale and founder buyout.
- **Insight**: KPI dashboard, health indicators, a risk register, automated insights, an alert center, a BI explorer, forecasts with ranges, what-if analysis and plan comparison.
- **Modes**: 8 scenarios, sandbox options, a tutorial, 20 achievements, a local leaderboard, and 5 difficulty levels (Sandbox → Brutal).

## Architecture

```
src/
  engine/            pure TypeScript simulation, no React
    types.ts         SimState and domain types
    data/            industries, segments, markets, channels, roles, events, investors…
    systems/         market, marketing, sales, products, employees, hiring, suppliers,
                     manufacturing, ledger, loans, capital, valuation, competitors,
                     macro, events, decisions, reports, insights, scenarios…
    step.ts          the daily loop and month-end close
    commands.ts      the only way the UI changes state (validated)
    explain.ts       "Why did this happen?" decompositions
    projection.ts    forecasts & what-if (runs the real engine on a copy)
    validate.ts      NaN / invalid-state detection and repair
  persistence/       versioned, checksummed saves; IndexedDB slots; leaderboard
  ui/                React: controller (clock, speed, autosave), shell, pages, charts
tests/               engine tests: accounting identities, demand, churn, inventory,
                     funding & dilution, loans, events, determinism, saves, what-if
```

- **Time**: the engine steps one day at a time. Operations (demand, sales, production, deliveries, hiring, collections, payroll accrual, events) run daily. Month-end closes the books and runs the slower systems (morale, brand, competitors, macro, valuation, reports).
- **Determinism**: all randomness comes from a seeded, serializable PRNG stored in the state. The same seed plus the same decisions reproduce the same game, and a loaded save continues identically.
- **Accounting**: every rupee goes through ledger primitives. Tests assert that assets = liabilities + equity every month, that statement lines add up, and that the cash-flow statement reconciles.
- **Performance**: customers are simulated as aggregated populations per product × market × segment. Employees, competitors, suppliers, contracts and loans are individual. Forecasts run in a Web Worker.

## Explainability

Most KPIs have a **?** button. Revenue is decomposed exactly into price/mix, new customers and churn, with the demand, awareness and competitive drivers behind acquisition. Profit and cash are exact bridges. Churn, morale, brand, PMF and valuation show their weighted drivers.

## Simplifications

Taxes are simplified (HQ corporate rate on monthly profit, loss carryforward, quarterly payment; no GST/VAT or transfer pricing), and the assumptions are listed in the Finance page. Customers are aggregated rather than individual. Competitors' finances are modelled more coarsely than yours. Financial parameters are plausible, not calibrated to any real company.
