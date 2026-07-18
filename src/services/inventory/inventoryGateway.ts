import type { InventoryDocument } from "../../domain/inventory";

/**
 * Persistence seam for inventory data. UI and solvers depend on this contract,
 * never on IndexedDB. A Supabase implementation can split the document into
 * profiles and pal_instances while preserving these account-ready identifiers.
 */
export interface InventoryGateway {
  load(ownerId: string): Promise<InventoryDocument | undefined>;
  save(ownerId: string, document: InventoryDocument): Promise<void>;
}
