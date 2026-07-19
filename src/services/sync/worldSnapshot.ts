import { z } from "zod";
import type { InventoryCloudBinding, InventoryProfile } from "../../domain/inventory";

const optionalShortText = z.string().max(512).optional();

const ownedPalSchema = z.object({
  id: z.string().min(1).max(512),
  sourceInstanceId: z.string().min(1).max(512),
  speciesId: z.string().min(1).max(160),
  gender: z.enum(["F", "M"]),
  passiveIds: z.array(z.string().min(1).max(160)).max(8),
  location: z.enum(["party", "palbox", "base", "global-storage"]),
  worldId: optionalShortText,
  playerId: optionalShortText,
  nickname: z.string().max(160).optional(),
  level: z.number().int().min(0).max(999).optional(),
});

export const worldSnapshotPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: z.string().min(1).max(512),
  name: z.string().min(1).max(120),
  platform: z.enum(["xbox", "steam"]),
  worldId: optionalShortText,
  slotId: optionalShortText,
  accountId: optionalShortText,
  playerId: optionalShortText,
  playerName: z.string().max(160).optional(),
  playerLevel: z.number().int().min(0).max(999).optional(),
  importedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  localRevision: z.number().int().min(0),
  pals: z.array(ownedPalSchema).max(100_000),
});

export type WorldSnapshotPayload = z.infer<typeof worldSnapshotPayloadSchema>;

export function profileToWorldSnapshot(profile: InventoryProfile): WorldSnapshotPayload {
  return worldSnapshotPayloadSchema.parse({
    schemaVersion: 1,
    profileId: profile.id,
    name: profile.name,
    platform: profile.platform,
    worldId: profile.worldId,
    slotId: profile.slotId,
    accountId: profile.accountId,
    playerId: profile.playerId,
    playerName: profile.playerName,
    playerLevel: profile.playerLevel,
    importedAt: profile.importedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    localRevision: profile.revision,
    pals: profile.pals,
  });
}

export function worldSnapshotToProfile(
  value: unknown,
  accountId: string,
  cloudBinding: InventoryCloudBinding,
  existingBindings: readonly InventoryCloudBinding[] = [],
): InventoryProfile {
  const payload = worldSnapshotPayloadSchema.parse(value);
  return {
    id: payload.profileId,
    owner: { kind: "account", id: accountId },
    name: payload.name,
    gameVersion: "1.0",
    platform: payload.platform,
    worldId: payload.worldId,
    slotId: payload.slotId,
    accountId: payload.accountId,
    playerId: payload.playerId,
    playerName: payload.playerName,
    playerLevel: payload.playerLevel,
    importedAt: payload.importedAt,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    revision: payload.localRevision,
    cloudBindings: [
      ...existingBindings.filter(({ workspaceId }) => workspaceId !== cloudBinding.workspaceId),
      cloudBinding,
    ],
    pals: payload.pals,
  };
}

export function worldIdentityKey(profile: InventoryProfile) {
  const worldIdentity = profile.worldId ?? profile.slotId ?? profile.id;
  const accountIdentity = profile.accountId ?? "no-account";
  return [profile.platform, accountIdentity, worldIdentity].map(encodeURIComponent).join(":");
}
