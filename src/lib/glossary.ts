/**
 * Plain-English glossary for Kwanza ERP terms.
 * Used by the InfoTip component to show contextual help (i) icons throughout the UI.
 * Tone: professional but accessible — written for a warehouse manager in Uganda,
 * not a software engineer.
 */

export interface GlossaryTerm {
  term: string
  short: string
  long: string
  example?: string
}

export const glossary: Record<string, GlossaryTerm> = {
  storageLiability: {
    term: 'Storage Liability',
    short: 'The money a merchant owes us for keeping their stock in our warehouse, charged per unit per day.',
    long: 'Storage Liability is the running total of what a merchant owes us for occupying warehouse space. Every day a unit of their stock sits on our shelves, a small fee is added to their account. The fee stops the moment that unit is dispatched out, returned, or disposed. Think of it like rent — but charged per item, not per pallet or per square metre.',
    example: 'If a merchant delivers 100 units on Monday and our rate is UGX 50 per unit per day, by Friday they owe us 100 × 50 × 4 = UGX 20,000 in storage alone.',
  },
  storagePerUnitPerDay: {
    term: 'Storage Fee (per unit per day)',
    short: 'The daily fee charged for each unit of a merchant\'s stock held in our warehouse.',
    long: 'This is the per-unit, per-day rate we charge a merchant for storing their goods. It is set on the merchant\'s Rate Card and is frozen at the moment stock arrives — so even if we change the rate next month, the stock already on the shelf keeps the rate it arrived with. This protects the merchant from surprise price hikes and protects us from disputes.',
    example: 'A rate of UGX 50 per unit per day means 200 units stored for 30 days costs 200 × 50 × 30 = UGX 300,000.',
  },
  rateCard: {
    term: 'Rate Card',
    short: 'The agreed pricing schedule between us and a merchant — every fee we charge them, in one place.',
    long: 'A Rate Card is the contract price list for a specific merchant. It records the receiving fee (per unit when stock arrives), the storage fee (per unit per day), the pick fee (per unit when stock leaves), the pack fee (per order), the return processing fee, the commission we earn on their sales, and any COD remittance fees. Each merchant can have a different rate card because Jumia will negotiate different rates than a small Instagram seller.',
    example: 'KFC\'s rate card might say: pick fee UGX 200/unit, storage UGX 30/unit/day, commission 5%. A small seller\'s might say: pick fee UGX 500/unit, storage UGX 80/unit/day, commission 10%.',
  },
  codCollected: {
    term: 'COD Collected',
    short: 'Cash that a driver collected from a customer at the doorstep for a Cash-on-Delivery order.',
    long: 'When a customer pays cash on delivery, our driver collects the money at the doorstep. That cash belongs to the merchant (minus our fees). Until the driver banks that cash with us, the merchant has not actually been paid — the money is sitting in the driver\'s pocket or bag. We track COD Collected separately from COD Banked so we always know how much cash is floating in the field.',
    example: 'A driver delivers 10 orders at UGX 50,000 each = UGX 500,000 COD Collected. If they only bank UGX 480,000 the next morning, there is a UGX 20,000 shortfall that must be explained.',
  },
  codBanked: {
    term: 'COD Banked',
    short: 'Cash that a driver has physically deposited at our bank or agent against their COD Collected.',
    long: 'COD Banked is the money that has actually arrived in our bank account. The gap between COD Collected and COD Banked is the cash currently held by drivers — and that gap must close to zero every banking cycle (usually daily). If it doesn\'t, the difference is a Shortfall that gets charged to the driver or escalated.',
    example: 'Driver banks UGX 480,000 against UGX 500,000 collected = UGX 20,000 shortfall. Driver either covers it from salary or explains the discrepancy (e.g., customer refused to pay on a re-attempted order).',
  },
  runsheet: {
    term: 'Runsheet',
    short: 'A driver\'s daily delivery plan — the list of stops, in order, with the order numbers and addresses.',
    long: 'A Runsheet is the route plan handed to a driver at the start of their shift. It groups multiple outbound orders into one trip, with a stop sequence (1, 2, 3...) telling the driver which order to deliver first. All orders on the same runsheet share one driver, one vehicle, and one banking cycle at the end of the day.',
    example: 'Runsheet RS-2026-04-14-001 might contain 15 stops across Kampala, starting in Nakawa and ending in Entebbe. The driver is responsible for the COD from all 15 stops.',
  },
  rtv: {
    term: 'RTV (Return to Vendor)',
    short: 'When we send a merchant\'s stock back to them — usually because it\'s damaged, expired, or unsellable.',
    long: 'RTV stands for Return to Vendor. It is the process where we (the 3PL) return stock to the merchant or supplier because it cannot be sold. Common reasons: goods arrived damaged, expiry date passed, product discontinued, or the merchant recalled the stock. An RTV creates a new "RT-" order number so we can track the return movement separately from the original "DS-" dispatch.',
    example: 'A merchant sends us 200 bottles of juice. 12 are leaky on arrival. We raise an RTV for 12 units, the merchant approves, and we ship them back. The original DS-042 becomes RT-042 on the return journey.',
  },
  rma: {
    term: 'RMA (Return Merchandise Authorization)',
    short: 'When a customer returns a product to us — the After-Sales workflow that decides what happens to it.',
    long: 'RMA stands for Return Merchandise Authorization. It is the customer-facing return process. A customer buys something, decides they don\'t want it, and sends it back to us. We then decide what to do with the returned unit: restock it, send it back to the vendor (RTV), dispose of it, or liquidate it. This decision is called the Disposition.',
    example: 'A customer orders a phone in blue, gets it, decides they wanted black. They request a return. We receive the unit, inspect it, and choose Disposition = RESTOCK (put it back on the shelf).',
  },
  shrinkage: {
    term: 'Shrinkage',
    short: 'Stock that should be in the warehouse but isn\'t — lost, stolen, damaged, or unaccounted for.',
    long: 'Shrinkage is the gap between what our system says we have and what we actually have on the shelf when we count. It covers theft, breakage, misplacement, expired goods, and unrecorded damage. When shrinkage is identified, we create a Shrinkage Record. If the merchant is held responsible (their goods, their loss), the value is debited to their next statement.',
    example: 'System says 500 units of soap. Physical count says 487. 13 units are shrinkage. At UGX 2,000 per unit, UGX 26,000 is debited to the merchant on their next statement.',
  },
  disposition: {
    term: 'Disposition',
    short: 'The decision about what to do with a returned unit — restock, return to vendor, dispose, or liquidate.',
    long: 'When a customer returns a unit, we have to decide what to do with it. There are four options: RESTOCK (the unit is in good condition and goes back on the shelf for resale), RTV (return to the merchant/vendor because the unit is faulty or recalled), DISPOSE (the unit is destroyed because it is broken, expired, or unsafe), or LIQUIDATE (the unit is sold off cheaply to a clearance buyer). Each returned unit gets its own Disposition decision — they don\'t all have to go the same way.',
    example: 'A customer returns 5 units of a product. We inspect them: 3 are unopened (RESTOCK), 1 has damaged packaging (LIQUIDATE), 1 is faulty (RTV).',
  },
  commission: {
    term: 'Commission',
    short: 'The percentage of each sale that we earn as the 3PL handling the order.',
    long: 'Commission is our cut of the merchant\'s sale. When a customer buys a UGX 100,000 product and our commission rate is 8%, we earn UGX 8,000. The merchant gets the remaining UGX 92,000 minus any other fees (storage, pick, return processing). Commission is set on the merchant\'s Rate Card and varies by merchant — high-volume merchants like Jumia negotiate lower rates, small sellers pay higher rates.',
    example: 'Order total UGX 250,000. Commission rate 6%. Our commission = UGX 15,000. Merchant payout before other fees = UGX 235,000.',
  },
  statement: {
    term: 'Merchant Statement',
    short: 'The monthly report we send to a merchant showing every fee, every sale, every return, and what we owe them.',
    long: 'The Merchant Statement is the single most important document we produce for a merchant. Generated on the 1st of each month, it lists every transaction in the previous month: inbound received (with receiving fees), storage fees accrued, outbound orders fulfilled (with pick/pack fees and the sale value), returns processed (with return fees), shrinkage debited, COD collected and banked on their behalf, commissions earned, and finally the net amount payable to them. The merchant gets this as both an Excel file (for their accountant) and a PDF (for their records). They never log into our system — the statement IS their view of the relationship.',
    example: 'A merchant\'s April statement shows: Sales UGX 12,000,000, Commission UGX 600,000, Storage UGX 180,000, Pick/Pack UGX 240,000, Returns UGX 90,000, Shrinkage UGX 25,000, COD Banked UGX 8,500,000. Net payable = 12,000,000 - 600,000 - 180,000 - 240,000 - 90,000 - 25,000 + 8,500,000 = UGX 19,365,000.',
  },
  paymentBatch: {
    term: 'Payment Batch',
    short: 'A group of merchant payments processed together in one bank run.',
    long: 'A Payment Batch groups multiple merchant payouts into a single bank submission. Instead of doing 50 separate bank transfers (one per merchant), the finance team selects all statements due for payment, generates one batch, submits one bulk transfer instruction to the bank, and records one reference number. This keeps the bank reconciliation clean and makes auditing easy.',
    example: 'On the 5th of May, finance selects 23 unpaid April statements, generates Payment Batch PB-2025-05-001 for UGX 47,800,000 total, and submits it to Stanbic Bank with reference INV-2025-0501.',
  },
  deliveryType: {
    term: 'Delivery Type',
    short: 'How a merchant\'s goods move from supplier to customer — self-delivery, drop-ship, or consignment.',
    long: 'Delivery Type tells us who is responsible for moving the goods at each stage. SELF-DELIVERY means the merchant fulfils orders themselves using their own drivers and resources — we never touch the stock or the delivery, we just coordinate. DROP-SHIP means the supplier ships the product to our warehouse on demand when an order is placed — we receive it just-in-time and fulfil the order from that delivery. CONSIGNMENT means the supplier places stock in our warehouse upfront but retains ownership until the goods sell — we hold it, they own it. The type changes how we bill storage, how we handle returns, and how we structure the tracking number.',
    example: 'A small Instagram seller uses SELF-DELIVERY (their own rider drops off to the customer, we don\'t touch it). A KFC franchise uses DROP-SHIP (chicken arrives at our warehouse each morning based on the day\'s forecast orders, we dispatch). A Jumia vendor uses CONSIGNMENT (they place 1,000 units with us at the start of the month, we fulfil as orders come in, they own the stock until sold).',
  },
  trackingNumber: {
    term: 'Tracking Number',
    short: 'A code on every parcel that tells us where it came from and how it was fulfilled.',
    long: 'Every parcel that moves through our warehouse gets a tracking number. The format encodes meaning: it starts with SD (self-delivery — merchant fulfils themselves), DS (drop-ship — arrived on demand from supplier), CN (consignment — held in our warehouse on consignment), or RT (return), then the order number, then a unit sequence. So DS-DS-001-01 means: drop-ship fulfilled, order DS-001, unit 1 of that order. This lets anyone scan a parcel and instantly know its story without looking it up.',
    example: 'A driver scans DS-ORD-20260414-042-01 at delivery. We know instantly: this is a drop-ship order (the supplier delivered it to our warehouse on demand), it\'s order 042, and it\'s the first (and maybe only) unit on that order.',
  },
  shortfall: {
    term: 'Shortfall',
    short: 'The gap between what a driver collected in COD and what they actually banked.',
    long: 'A Shortfall happens when a driver banks less cash than they collected from customers. It might be innocent (a customer refused to pay on a re-delivery, a note was damaged, a trip was rescheduled) or it might be theft. Either way, the system flags it. The driver must explain the shortfall, and if it can\'t be resolved, the amount is deducted from their next salary or escalated to a supervisor. Persistent shortfalls lead to dismissal.',
    example: 'Driver collected UGX 500,000 in COD. Banked UGX 480,000. Shortfall = UGX 20,000. Driver explains: one customer refused delivery because the box was dented. The UGX 50,000 order is rescheduled, so the actual cash gap is UGX 20,000 = the dented-box customer who originally said yes but changed their mind.',
  },
  expectedPayment: {
    term: 'Expected Payment',
    short: 'The total amount we expect to pay the merchant based on sales, minus our fees — before they\'ve actually been paid.',
    long: 'Expected Payment is the running total of what we owe a merchant. It grows every time we fulfil an order on their behalf (sale amount minus our commission) and shrinks every time we charge them a fee (storage, pick, returns, shrinkage). It is the "what we owe them right now if we settled today" number. Once we actually pay them, the amount moves from Expected to Actual.',
    example: 'A merchant has UGX 4,200,000 in Expected Payment. We process a Payment Batch of UGX 4,000,000 to them. Expected drops to UGX 200,000 (carryover), Actual increases by UGX 4,000,000.',
  },
  actualPayment: {
    term: 'Actual Payment',
    short: 'The total amount we have actually paid out to the merchant — money that has left our bank account.',
    long: 'Actual Payment is the cumulative total of all money disbursed to the merchant. It only goes up when a Payment Batch is marked as disbursed. The gap between Expected Payment and Actual Payment is the Pending Payment — what we still owe them.',
    example: 'A merchant has UGX 4,000,000 in Actual Payment and UGX 4,200,000 in Expected Payment. Pending = UGX 200,000.',
  },
  pendingPayment: {
    term: 'Pending Payment',
    short: 'What we still owe the merchant — the gap between Expected and Actual payments.',
    long: 'Pending Payment = Expected Payment − Actual Payment. It is the open balance the merchant is waiting to receive. A healthy 3PL keeps Pending Payment low — ideally, merchants are paid on a predictable cycle (weekly or monthly) so they never have to chase us.',
    example: 'If Expected = UGX 4,200,000 and Actual = UGX 4,000,000, then Pending = UGX 200,000. This UGX 200,000 will be settled in the next Payment Batch.',
  },
}

/**
 * Helper to safely fetch a glossary term.
 */
export function getGlossaryTerm(key: string): GlossaryTerm | undefined {
  return glossary[key]
}
