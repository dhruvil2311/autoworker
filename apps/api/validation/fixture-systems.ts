export interface SupplierProduct {
  sku: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  stock: number;
}

export interface DestinationProduct {
  sku: string;
  name: string;
  stock: number;
}

export const supplierDatabase: SupplierProduct[] = [];
export const destinationDatabase: DestinationProduct[] = [];

// Seed the 50 products
export function resetFixtures() {
  supplierDatabase.length = 0;
  destinationDatabase.length = 0;

  // TEACHING SET (1-5)
  for (let i = 1; i <= 5; i++) {
    const sku = `SKU-00${i}`;
    supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 150 });
    destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 145 });
  }

  // UNSEEN VALIDATION SET (6-50)
  for (let i = 6; i <= 50; i++) {
    const sku = i < 10 ? `SKU-00${i}` : `SKU-0${i}`;
    
    if (i === 6) {
      // Normal
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 100 });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 90 });
    } else if (i === 7) {
      // Low stock -> 3 - 5 = -2 -> 0
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 3 });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 5 });
    } else if (i === 8) {
      // Zero stock
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 0 });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 10 });
    } else if (i === 9) {
      // Missing mapping (Not in destination database)
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 50 });
    } else if (i === 10) {
      // Large deviation: Proposed = 95, Current = 20. Diff = 75, > 20% of 20. (Requires HITL)
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 100 });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 20 });
    } else if (i === 11) {
      // Unchanged (Proposed = 45, Current = 45) -> No mutation needed
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 50 });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 45 });
    } else if (i === 12) {
      // Inactive
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "INACTIVE", stock: 100 });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 95 });
    } else {
      // Normal others
      supplierDatabase.push({ sku, name: `Widget ${i}`, status: "ACTIVE", stock: 50 + i });
      destinationDatabase.push({ sku, name: `Widget ${i}`, stock: 50 });
    }
  }
}

resetFixtures();

// API Capabilities (Mocks)
export const SystemA = {
  listActiveProducts: () => supplierDatabase.filter(p => p.status === "ACTIVE"),
  getProductStock: (sku: string) => {
    const p = supplierDatabase.find(p => p.sku === sku);
    if (!p) throw new Error("Product not found in Supplier System");
    return p.stock;
  }
};

export const SystemB = {
  getProductStock: (sku: string) => {
    const p = destinationDatabase.find(p => p.sku === sku);
    if (!p) return null; // Used to detect missing mappings
    return p.stock;
  },
  updateStock: (sku: string, newStock: number) => {
    const p = destinationDatabase.find(p => p.sku === sku);
    if (!p) throw new Error("Product not found in Destination System");
    p.stock = newStock;
    return true;
  }
};
