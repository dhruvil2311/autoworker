const fs = require('fs');
const path = require('path');

const template = (id, goal, industry, obstacle = null) => ({
  id,
  businessDescription: "Simulated retail operation",
  industry,
  goal,
  sop: "Standard Operating Procedure document mock",
  csv: [{"item": "123", "qty": "1"}],
  apiMetadata: {},
  browserDemonstrations: [
    {
      id: "demo-1",
      url: "https://example.com/demo1",
      events: [{"type": "click", "selector": "#btn"}],
      intentionalObstacle: obstacle
    }
  ],
  merchantClarificationAnswers: {
    "question_1": "Standard answer"
  },
  expectedBusinessProcessSpecification: {
    "steps": ["Step 1", "Step 2"]
  },
  expectedExecutionPlan: {
    "actions": ["click", "type"]
  },
  expectedRuntimeBehaviour: [
    "Navigate to correct page",
    "Handle exception if " + (obstacle || "none")
  ],
  expectedLearningAfterCorrection: "Ghost updates BPS to handle " + (obstacle || "normal flow")
});

const scenarios = [
  { domain: 'shopify', file: 'returns-processing.json', id: 'shp-ret-1', goal: 'Shopify Returns', obstacle: 'Contradictory demonstrations' },
  { domain: 'shopify', file: 'inventory-updates.json', id: 'shp-inv-1', goal: 'Shopify Inventory' },
  { domain: 'amazon', file: 'listing-creation.json', id: 'amz-list-1', goal: 'Amazon Listing', obstacle: 'Ambiguous terminology' },
  { domain: 'woocommerce', file: 'refunds.json', id: 'woo-ref-1', goal: 'WooCommerce Refunds', obstacle: 'Broken UI' },
  { domain: 'erp', file: 'purchase-orders.json', id: 'erp-po-1', goal: 'Purchase Orders', obstacle: 'Incorrect merchant answers' },
  { domain: 'erp', file: 'invoice-entry.json', id: 'erp-inv-1', goal: 'Invoice Entry', obstacle: 'Missing CSV values' },
  { domain: 'warehouse', file: 'picking.json', id: 'wh-pick-1', goal: 'Warehouse Picking' },
  { domain: 'erp', file: 'supplier-onboarding.json', id: 'erp-sup-1', goal: 'Supplier Onboarding' },
  { domain: 'retail', file: 'order-fulfilment.json', id: 'ret-ord-1', goal: 'Order Fulfilment' },
  { domain: 'crm', file: 'crm-updates.json', id: 'crm-upd-1', goal: 'CRM Updates' },
  { domain: 'retail', file: 'customer-support.json', id: 'ret-supp-1', goal: 'Customer Support' },
  { domain: 'finance', file: 'finance-approval.json', id: 'fin-app-1', goal: 'Finance Approval' },
  { domain: 'warehouse', file: 'inventory-transfer.json', id: 'wh-trans-1', goal: 'Inventory Transfer' },
  { domain: 'retail', file: 'returns-processing-v2.json', id: 'ret-ret-2', goal: 'Returns Processing' },
  { domain: 'shipping', file: 'shipping-labels.json', id: 'shp-lbl-1', goal: 'Shipping Labels' },
  { domain: 'erp', file: 'erp-posting.json', id: 'erp-post-1', goal: 'ERP Posting' },
  { domain: 'erp', file: 'vendor-management.json', id: 'erp-vend-1', goal: 'Vendor Management' },
  { domain: 'retail', file: 'order-cancellation.json', id: 'ret-canc-1', goal: 'Order Cancellation' },
  { domain: 'retail', file: 'price-updates.json', id: 'ret-price-1', goal: 'Price Updates' },
  { domain: 'retail', file: 'promotions.json', id: 'ret-promo-1', goal: 'Promotions' },
  { domain: 'retail', file: 'product-creation.json', id: 'ret-prod-1', goal: 'Product Creation' },
  { domain: 'warehouse', file: 'multi-warehouse-routing.json', id: 'wh-route-1', goal: 'Multi Warehouse Routing' },
  { domain: 'retail', file: 'backorders.json', id: 'ret-back-1', goal: 'Backorders' },
  { domain: 'b2b', file: 'b2b-orders.json', id: 'b2b-ord-1', goal: 'B2B Orders' },
  { domain: 'finance', file: 'stock-reconciliation.json', id: 'fin-stk-1', goal: 'Stock Reconciliation' }
];

scenarios.forEach(s => {
  const dir = path.join(__dirname, 'evaluation', s.domain);
  const filePath = path.join(dir, s.file);
  const data = template(s.id, s.goal, s.domain, s.obstacle);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log('Created:', filePath);
});
