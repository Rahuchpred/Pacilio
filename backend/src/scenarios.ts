// The businesses Pacioli can keep books for. One is active at a time (the
// `scenario` table); every simulated source draws its vendors, customers,
// sales and bank memos from it, and the agents' prompts name it. The sources
// themselves (bank, Stripe, QuickBooks) stay the same.
//
// Plain data with no imports: the frontend reads this file too, for the
// sidebar and the labels that change with the business.

export interface Vendor {
  name: string;
  // Nessie merchant category
  category: string;
  item: string;
  // Typical charge range in cents
  min: number;
  max: number;
}

// Who sends us money on an invoice (sponsors, customers, clients)
export interface Customer {
  name: string;
  item: string;
  min: number;
  max: number;
}

// One thing sold by card through Stripe, as "2x Latte - week of Oct 20"
export interface SaleItem {
  name: string;
  cents: number;
  weight: number;
  maxQty: number;
}

type Range = [min: number, max: number];

export interface Scenario {
  key: string;
  // Sidebar
  name: string;
  blurb: string;
  // "You are the Bookkeeper for <business> (<context>)"
  business: string;
  context: string;
  // Added to memos: "PA system rental - Oct 25 show"
  period: string;
  // Email detail label and value: "Show: Oct 25"
  periodLabel: string;
  periodValue: string;
  report: { title: string; subtitle: string };
  // What Stripe charges are for, in the Bookkeeper's words
  stripeSells: string;
  sales: { title: string; chart: string; unit: string; items: SaleItem[] };
  // Singular, lowercase: "sponsor", "customer"
  customerWord: string;
  customers: Customer[];
  vendors: Vendor[];
  // Our own money moving through the bank
  bank: {
    payout: Range;
    cashDeposit: { memo: string; range: Range };
    float: { memo: string; range: Range };
    payroll: { memo: string; range: Range };
  };
  // Short phrase for the prompt's "normal, not problems" list
  ownMoney: string;
  categories: string[];
}

const CONCERT: Scenario = {
  key: 'concert',
  name: 'Concert show',
  blurb: 'A promoter settling the Oct 25 show: tickets, sponsors, crew and gear.',
  business: 'a concert promoter',
  context: 'the Oct 25 show',
  period: 'Oct 25 show',
  periodLabel: 'Show',
  periodValue: 'Oct 25',
  report: { title: 'Show report', subtitle: 'Oct 25' },
  stripeSells: 'card payments for tickets',
  sales: {
    title: 'Tickets',
    chart: 'Tickets sold by type',
    unit: 'ticket',
    items: [
      { name: 'GA ticket', cents: 3_500, weight: 6, maxQty: 4 },
      { name: 'VIP package', cents: 15_000, weight: 1, maxQty: 1 },
      { name: 'Early bird ticket', cents: 2_500, weight: 2, maxQty: 4 },
    ],
  },
  customerWord: 'sponsor',
  customers: [
    { name: 'Bayline Energy Drinks', item: 'Stage sponsorship', min: 250_000, max: 750_000 },
    { name: 'Mission Street Brewing', item: 'Bar sponsorship', min: 150_000, max: 400_000 },
    { name: 'Fogtown Radio', item: 'Media partnership', min: 100_000, max: 300_000 },
  ],
  vendors: [
    { name: 'ACME Audio Visual', category: 'audio rentals', item: 'PA system rental', min: 80_000, max: 180_000 },
    { name: 'Bay Venue Security', category: 'security', item: 'Security staff', min: 30_000, max: 65_000 },
    { name: 'Brightline Lighting Co', category: 'lighting', item: 'Lighting rig rental', min: 60_000, max: 140_000 },
    { name: 'Golden Gate Catering', category: 'catering', item: 'Artist catering', min: 25_000, max: 90_000 },
    { name: 'Pier 39 Printing', category: 'printing', item: 'Posters and wristbands', min: 8_000, max: 30_000 },
    { name: 'SF Stagehands Local 16', category: 'labor', item: 'Load-in crew', min: 90_000, max: 220_000 },
  ],
  bank: {
    payout: [100_000, 800_000],
    cashDeposit: { memo: 'BOX OFFICE CASH DEPOSIT', range: [30_000, 150_000] },
    float: { memo: 'Cash for box office float', range: [20_000, 60_000] },
    payroll: { memo: 'Crew payroll - Oct 25 show', range: [150_000, 400_000] },
  },
  ownMoney: 'cash float withdrawals, crew payroll transfers, box office deposits, Stripe payouts',
  categories: [
    'Revenue · Tickets',
    'Revenue · Sponsorship',
    'Production · Audio & lighting',
    'Security',
    'Catering',
    'Labor & payroll',
    'Marketing & printing',
    'Permits & fees',
    'Processor fees & refunds',
    'Cash & transfers',
    'Other',
  ],
};

const STARTUP: Scenario = {
  key: 'startup',
  name: 'Tech startup',
  blurb: 'A six-person software startup closing October: subscriptions, contracts, cloud and payroll.',
  business: 'a small software startup',
  context: 'closing the October books',
  period: 'October',
  periodLabel: 'Period',
  periodValue: 'October 2026',
  report: { title: 'Monthly report', subtitle: 'October' },
  stripeSells: 'card payments for subscriptions',
  sales: {
    title: 'Subscriptions',
    chart: 'Plans sold',
    unit: 'seat',
    items: [
      { name: 'Starter plan', cents: 2_900, weight: 5, maxQty: 1 },
      { name: 'Pro seat', cents: 4_900, weight: 4, maxQty: 5 },
      { name: 'Team plan', cents: 29_900, weight: 1, maxQty: 1 },
    ],
  },
  customerWord: 'customer',
  customers: [
    { name: 'Harborline Logistics', item: 'Annual license', min: 300_000, max: 1_200_000 },
    { name: 'Juniper Health Clinics', item: 'Pilot program', min: 150_000, max: 500_000 },
    { name: 'Copperleaf Schools', item: 'Onboarding and setup', min: 80_000, max: 250_000 },
  ],
  vendors: [
    { name: 'Nimbus Cloud Hosting', category: 'cloud hosting', item: 'Cloud hosting', min: 40_000, max: 180_000 },
    { name: 'Brightdesk Coworking', category: 'rent', item: 'Office desks', min: 120_000, max: 300_000 },
    { name: 'Northgate Legal LLP', category: 'legal', item: 'Contract review', min: 80_000, max: 350_000 },
    { name: 'Pixel and Pine Studio', category: 'design', item: 'Product design sprint', min: 100_000, max: 400_000 },
    { name: 'Signalbox Analytics', category: 'software', item: 'Analytics subscription', min: 15_000, max: 60_000 },
    { name: 'Fieldstone Recruiting', category: 'recruiting', item: 'Engineer placement fee', min: 300_000, max: 900_000 },
  ],
  bank: {
    payout: [50_000, 400_000],
    cashDeposit: { memo: 'TREASURY ACCOUNT INTEREST', range: [5_000, 30_000] },
    float: { memo: 'Petty cash for the office', range: [10_000, 40_000] },
    payroll: { memo: 'Team payroll - October', range: [800_000, 1_600_000] },
  },
  ownMoney: 'petty cash withdrawals, team payroll transfers, treasury interest, Stripe payouts',
  categories: [
    'Revenue · Subscriptions',
    'Revenue · Contracts',
    'Cloud & software',
    'Office & rent',
    'Legal & accounting',
    'Design & contractors',
    'Recruiting',
    'Payroll',
    'Processor fees & refunds',
    'Cash & transfers',
    'Other',
  ],
};

const COFFEE: Scenario = {
  key: 'coffee',
  name: 'Coffee shop',
  blurb: 'A neighborhood cafe closing its week: counter sales, catering, beans, milk and rent.',
  business: 'a neighborhood coffee shop',
  context: 'closing the week of Oct 20',
  period: 'week of Oct 20',
  periodLabel: 'Week',
  periodValue: 'Oct 20 to Oct 26',
  report: { title: 'Weekly report', subtitle: 'Week of Oct 20' },
  stripeSells: 'card payments at the counter',
  sales: {
    title: 'Counter sales',
    chart: 'Items sold',
    unit: 'item',
    items: [
      { name: 'Latte', cents: 550, weight: 5, maxQty: 3 },
      { name: 'Drip coffee', cents: 350, weight: 4, maxQty: 3 },
      { name: 'Croissant', cents: 450, weight: 3, maxQty: 2 },
      { name: 'Bag of beans', cents: 1_800, weight: 1, maxQty: 1 },
    ],
  },
  customerWord: 'customer',
  customers: [
    { name: 'Mission Bay Offices', item: 'Office coffee catering', min: 30_000, max: 120_000 },
    { name: 'Sunset Yoga Studio', item: 'Wholesale beans', min: 15_000, max: 50_000 },
    { name: 'Fogtown Film Festival', item: 'Event coffee cart', min: 50_000, max: 200_000 },
  ],
  vendors: [
    { name: 'Ridgeline Coffee Roasters', category: 'coffee beans', item: 'Roasted beans', min: 40_000, max: 160_000 },
    { name: 'Clover Valley Dairy', category: 'dairy', item: 'Milk and oat milk', min: 15_000, max: 60_000 },
    { name: 'Dough Bros Bakery', category: 'pastries', item: 'Pastry delivery', min: 20_000, max: 70_000 },
    { name: 'Bay Espresso Service', category: 'equipment', item: 'Espresso machine service', min: 25_000, max: 90_000 },
    { name: 'Greenleaf Packaging', category: 'supplies', item: 'Cups, lids and sleeves', min: 10_000, max: 40_000 },
    { name: 'Valencia Street Properties', category: 'rent', item: 'Monthly rent', min: 450_000, max: 650_000 },
  ],
  bank: {
    payout: [30_000, 200_000],
    cashDeposit: { memo: 'REGISTER CASH DEPOSIT', range: [20_000, 90_000] },
    float: { memo: 'Cash for the register float', range: [10_000, 30_000] },
    payroll: { memo: 'Barista payroll - week of Oct 20', range: [150_000, 350_000] },
  },
  ownMoney: 'register float withdrawals, barista payroll transfers, register cash deposits, Stripe payouts',
  categories: [
    'Revenue · Counter sales',
    'Revenue · Catering & wholesale',
    'Cost of goods · Coffee & milk',
    'Cost of goods · Pastries',
    'Rent',
    'Equipment & repairs',
    'Supplies & packaging',
    'Labor & payroll',
    'Processor fees & refunds',
    'Cash & transfers',
    'Other',
  ],
};

export const SCENARIOS: readonly Scenario[] = [CONCERT, STARTUP, COFFEE];
export const DEFAULT_SCENARIO = CONCERT;

export function scenarioByKey(key: string | undefined): Scenario {
  return SCENARIOS.find(s => s.key === key) ?? DEFAULT_SCENARIO;
}
