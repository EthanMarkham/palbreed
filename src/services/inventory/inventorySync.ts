import { runtimeConfig } from "../../config/runtimeConfig";
import { inventoryService } from "./inventoryService";

let started = false;
let unsubscribe = () => {};

export function startInventorySync() {
  if (started || !runtimeConfig.supabase) return () => undefined;
  started = true;
  void initializeInventorySync();
  return () => unsubscribe();
}

async function initializeInventorySync() {
  const [{ supabaseClient }, { SupabaseInventoryGateway }] = await Promise.all([
    import("../supabase/supabaseClient"),
    import("./supabaseInventoryGateway"),
  ]);
  if (!supabaseClient) return;
  const gateway = new SupabaseInventoryGateway(supabaseClient);
  const applySession = async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw new Error(`We couldn't read the account session. ${error.message}`);
    const userId = data.session?.user.id;
    if (userId) await inventoryService.enableAccountSync(gateway, userId);
    else inventoryService.disableAccountSync();
  };
  const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id) void inventoryService.enableAccountSync(gateway, session.user.id);
    else inventoryService.disableAccountSync();
  });
  unsubscribe = () => data.subscription.unsubscribe();
  await applySession();
}
