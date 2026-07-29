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
  const applyUserId = createSessionApplier(async (userId) => {
    if (userId) await inventoryService.enableAccountSync(gateway, userId);
    else inventoryService.disableAccountSync();
  });
  const applySession = async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw new Error(`We couldn't read the account session. ${error.message}`);
    await applyUserId(data.session?.user.id);
  };
  const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    void applyUserId(session?.user.id);
  });
  unsubscribe = () => data.subscription.unsubscribe();
  await applySession();
}

const NO_SESSION = Symbol("no-session");

export function createSessionApplier(
  apply: (userId: string | undefined) => Promise<void> | void,
) {
  let appliedUserId: string | undefined | typeof NO_SESSION = NO_SESSION;
  let pendingUserId: string | undefined | typeof NO_SESSION = NO_SESSION;
  let queue = Promise.resolve();

  return (userId: string | undefined) => {
    if (
      pendingUserId === userId
      || (pendingUserId === NO_SESSION && appliedUserId === userId)
    ) {
      return queue;
    }
    pendingUserId = userId;
    const next = queue
      .catch(() => undefined)
      .then(() => apply(userId))
      .then(() => {
        appliedUserId = userId;
      })
      .finally(() => {
        if (pendingUserId === userId) pendingUserId = NO_SESSION;
      });
    queue = next;
    return next;
  };
}
