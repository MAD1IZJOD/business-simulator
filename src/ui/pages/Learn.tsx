import { Panel } from '../components/ui';

const CONCEPTS: { term: string; plain: string; here: string }[] = [
  { term: 'Revenue', plain: 'Money customers pay you for what you sell.', here: 'Customers × price × how often they buy (or monthly for subscriptions), converted from foreign currencies at today’s rate.' },
  { term: 'Costs', plain: 'Everything you spend to run the business.', here: 'Cost of sales (materials, hosting, delivery labour, shipping) plus operating expenses (salaries, marketing, rent, tools…).' },
  { term: 'Profit', plain: 'Revenue minus all costs.', here: 'Net income on the income statement: after cost of sales, operating costs, depreciation, interest and tax.' },
  { term: 'Cash flow', plain: 'Cash actually coming in and going out — not the same as profit.', here: 'Business customers pay later (receivables), inventory is paid before it sells, payroll goes out at month-end, loans bring cash in.' },
  { term: 'Margins', plain: 'How much of each rupee of revenue you keep.', here: 'Gross margin = (revenue − cost of sales) ÷ revenue. EBITDA margin also subtracts operating costs.' },
  { term: 'CAC', plain: 'Customer acquisition cost: what it costs to win one customer.', here: '(Marketing spend + sales & marketing salaries) ÷ new customers. Rises when channels saturate.' },
  { term: 'LTV', plain: 'Lifetime value: the gross profit a customer brings before leaving.', here: 'ARPU × gross margin ÷ monthly churn. Aim for LTV ≥ 3× CAC.' },
  { term: 'Churn', plain: 'The share of customers who leave each month.', here: 'Driven by satisfaction, price increases, better competitor offers, the economy, support speed and stockouts.' },
  { term: 'Runway', plain: 'How many months until the cash runs out.', here: 'Cash ÷ monthly burn (operating + investing outflows).' },
  { term: 'Valuation', plain: 'What investors think the company is worth.', here: 'Revenue run-rate × industry multiple, adjusted for growth, margins, interest rates, brand and product-market fit.' },
  { term: 'Dilution', plain: 'Selling shares shrinks everyone else’s percentage.', here: 'New shares are issued at pre-money ÷ shares outstanding. Option pools are carved out before the investor comes in.' },
  { term: 'Market share', plain: 'Your slice of the market’s total sales.', here: 'Your revenue ÷ (yours + competitors’) in the markets you operate in.' },
  { term: 'Price elasticity', plain: 'How much demand changes when price changes.', here: 'Each segment has its own sensitivity; brand lowers it; budget buyers are ~4× more sensitive than enterprises.' },
  { term: 'Product-market fit', plain: 'Whether people truly want what you make.', here: 'A blend of retention, satisfaction, organic growth, referrals, activation and willingness to pay.' },
];

export function Learn() {
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Learn</h1><p>Plain-language explanations, and how each idea is modelled in this simulation.</p></div></div>
      <div className="grid g2">
        {CONCEPTS.map((c) => (
          <Panel key={c.term} title={c.term}>
            <p>{c.plain}</p>
            <p className="small muted" style={{ marginTop: 6 }}><strong>In this simulator:</strong> {c.here}</p>
          </Panel>
        ))}
      </div>
      <Panel title="How the simulation works">
        <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Every day: marketing builds awareness, buyers move through the funnel and choose between you, competitors and not buying; customers churn; inventory, deliveries, production, hiring and cash collections happen.</li>
          <li>Every month-end: payroll, rent, depreciation, interest and tax are booked; morale, brand, culture and satisfaction update; competitors make their moves; the economy shifts; statements and KPIs are filed.</li>
          <li>Random events have probabilities that depend on your situation (e.g. breaches are likelier with weak security).</li>
          <li>The same seed and the same decisions always produce the same outcome.</li>
          <li>Click any “?” to see what moved a number.</li>
        </ol>
      </Panel>
    </div>
  );
}
