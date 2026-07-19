import type { CategoryOption } from "./types";

/** Ordered by dashboard priority, with the most useful avatar groups first. */
export const CATEGORY_GROUPS = [
  "Accessories",
  "Hair",
  "Heads",
  "Bundles",
  "Animations",
  "Avatar Animations",
  "Audio",
  "Badges",
  "Bottoms",
  "Classic Clothing",
  "Decals",
  "Emotes",
  "Makeup",
  "Meshes",
  "Models & Packages",
  "Passes",
  "Places",
  "Plugins",
  "Private Servers",
  "Shoes",
  "Tops",
  "Video",
] as const;

export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

/** Numeric Roblox AssetType values accepted by the public legacy inventory API. */
export const LEGACY_ASSET_TYPE_ID_BY_NAME: Readonly<Record<string, number>> = {
  IMAGE: 1,
  CLASSIC_TSHIRT: 2,
  AUDIO: 3,
  MESH: 4,
  LUA: 5,
  HAT: 8,
  PLACE: 9,
  MODEL: 10,
  CLASSIC_SHIRT: 11,
  CLASSIC_PANTS: 12,
  DECAL: 13,
  CLASSIC_HEAD: 17,
  FACE: 18,
  GEAR: 19,
  ANIMATION: 24,
  TORSO: 27,
  RIGHT_ARM: 28,
  LEFT_ARM: 29,
  LEFT_LEG: 30,
  RIGHT_LEG: 31,
  PACKAGE: 32,
  PLUGIN: 38,
  MESH_PART: 40,
  HAIR_ACCESSORY: 41,
  FACE_ACCESSORY: 42,
  NECK_ACCESSORY: 43,
  SHOULDER_ACCESSORY: 44,
  FRONT_ACCESSORY: 45,
  BACK_ACCESSORY: 46,
  WAIST_ACCESSORY: 47,
  CLIMB_ANIMATION: 48,
  DEATH_ANIMATION: 49,
  FALL_ANIMATION: 50,
  IDLE_ANIMATION: 51,
  JUMP_ANIMATION: 52,
  RUN_ANIMATION: 53,
  SWIM_ANIMATION: 54,
  WALK_ANIMATION: 55,
  POSE_ANIMATION: 56,
  EAR_ACCESSORY: 57,
  EYE_ACCESSORY: 58,
  EMOTE_ANIMATION: 61,
  VIDEO: 62,
  TSHIRT_ACCESSORY: 64,
  SHIRT_ACCESSORY: 65,
  PANTS_ACCESSORY: 66,
  JACKET_ACCESSORY: 67,
  SWEATER_ACCESSORY: 68,
  SHORTS_ACCESSORY: 69,
  LEFT_SHOE_ACCESSORY: 70,
  RIGHT_SHOE_ACCESSORY: 71,
  DRESS_SKIRT_ACCESSORY: 72,
  FONT_FAMILY: 73,
  EYEBROW_ACCESSORY: 76,
  EYELASH_ACCESSORY: 77,
  MOOD_ANIMATION: 78,
  DYNAMIC_HEAD: 79,
  FACE_MAKEUP: 88,
  LIP_MAKEUP: 89,
  EYE_MAKEUP: 90,
  VOXEL_FRAGMENT: 91,
};

export const LEGACY_ASSET_TYPE_NAME_BY_ID: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(LEGACY_ASSET_TYPE_ID_BY_NAME).map(([name, id]) => [id, name]),
);

export const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { id: "accessories.head", group: "Accessories", label: "Head", assetTypes: ["HAT"], avatar: true },
  { id: "accessories.face", group: "Accessories", label: "Face", assetTypes: ["FACE_ACCESSORY"], legacyAssetTypeIds: [42, 57, 58], avatar: true },
  { id: "accessories.neck", group: "Accessories", label: "Neck", assetTypes: ["NECK_ACCESSORY"], avatar: true },
  { id: "accessories.shoulder", group: "Accessories", label: "Shoulder", assetTypes: ["SHOULDER_ACCESSORY"], avatar: true },
  { id: "accessories.front", group: "Accessories", label: "Front", assetTypes: ["FRONT_ACCESSORY"], avatar: true },
  { id: "accessories.back", group: "Accessories", label: "Back", assetTypes: ["BACK_ACCESSORY"], avatar: true },
  { id: "accessories.waist", group: "Accessories", label: "Waist", assetTypes: ["WAIST_ACCESSORY"], avatar: true },
  { id: "accessories.gear", group: "Accessories", label: "Gear", assetTypes: ["GEAR"], avatar: true },

  { id: "animations.generic", group: "Animations", label: "Animations", assetTypes: ["ANIMATION"], avatar: false },
  { id: "audio", group: "Audio", label: "Audio", assetTypes: ["AUDIO"], avatar: false },

  { id: "avatarAnimations.climb", group: "Avatar Animations", label: "Climb", assetTypes: ["CLIMB_ANIMATION"], avatar: true },
  { id: "avatarAnimations.death", group: "Avatar Animations", label: "Death", assetTypes: ["DEATH_ANIMATION"], avatar: true },
  { id: "avatarAnimations.fall", group: "Avatar Animations", label: "Fall", assetTypes: ["FALL_ANIMATION"], avatar: true },
  { id: "avatarAnimations.idle", group: "Avatar Animations", label: "Idle", assetTypes: ["IDLE_ANIMATION"], avatar: true },
  { id: "avatarAnimations.jump", group: "Avatar Animations", label: "Jump", assetTypes: ["JUMP_ANIMATION"], avatar: true },
  { id: "avatarAnimations.run", group: "Avatar Animations", label: "Run", assetTypes: ["RUN_ANIMATION"], avatar: true },
  { id: "avatarAnimations.swim", group: "Avatar Animations", label: "Swim", assetTypes: ["SWIM_ANIMATION"], avatar: true },
  { id: "avatarAnimations.walk", group: "Avatar Animations", label: "Walk", assetTypes: ["WALK_ANIMATION"], avatar: true },
  { id: "avatarAnimations.pose", group: "Avatar Animations", label: "Pose", assetTypes: ["POSE_ANIMATION"], avatar: true },
  { id: "avatarAnimations.mood", group: "Avatar Animations", label: "Mood", assetTypes: ["MOOD_ANIMATION"], avatar: true },

  { id: "badges", group: "Badges", label: "Badges", special: "badges", avatar: false },
  { id: "bottoms.pants", group: "Bottoms", label: "Pants", assetTypes: ["PANTS_ACCESSORY"], avatar: true },
  { id: "bottoms.shorts", group: "Bottoms", label: "Shorts", assetTypes: ["SHORTS_ACCESSORY"], avatar: true },
  { id: "bottoms.dressSkirt", group: "Bottoms", label: "Dresses & skirts", assetTypes: ["DRESS_SKIRT_ACCESSORY"], avatar: true },
  { id: "bundles", group: "Bundles", label: "Bundles", special: "bundles", avatar: true },

  { id: "classicClothing.tshirts", group: "Classic Clothing", label: "T-shirts", assetTypes: ["CLASSIC_TSHIRT"], avatar: true, classicClothing: true },
  { id: "classicClothing.shirts", group: "Classic Clothing", label: "Shirts", assetTypes: ["CLASSIC_SHIRT"], avatar: true, classicClothing: true },
  { id: "classicClothing.pants", group: "Classic Clothing", label: "Pants", assetTypes: ["CLASSIC_PANTS"], avatar: true, classicClothing: true },

  { id: "decals", group: "Decals", label: "Decals", assetTypes: ["DECAL"], avatar: false },
  { id: "emotes", group: "Emotes", label: "Emotes", assetTypes: ["EMOTE_ANIMATION"], avatar: true },
  { id: "hair", group: "Hair", label: "Hair", assetTypes: ["HAIR_ACCESSORY"], avatar: true },

  { id: "heads.classic", group: "Heads", label: "Classic heads & faces", assetTypes: ["CLASSIC_HEAD", "FACE"], avatar: true },
  { id: "heads.dynamic", group: "Heads", label: "Dynamic heads", assetTypes: ["DYNAMIC_HEAD"], avatar: true },
  { id: "heads.bodyParts", group: "Heads", label: "Body parts", assetTypes: ["TORSO", "RIGHT_ARM", "LEFT_ARM", "LEFT_LEG", "RIGHT_LEG"], avatar: true },
  { id: "heads.eyebrows", group: "Heads", label: "Eyebrows", assetTypes: ["EYEBROW_ACCESSORY"], avatar: true },
  { id: "heads.eyelashes", group: "Heads", label: "Eyelashes", assetTypes: ["EYELASH_ACCESSORY"], avatar: true },

  // Compatibility IDs for newer makeup types in the numeric public inventory API.
  { id: "makeup.face", group: "Makeup", label: "Face makeup", legacyAssetTypeIds: [88], avatar: true },
  { id: "makeup.lip", group: "Makeup", label: "Lip makeup", legacyAssetTypeIds: [89], avatar: true },
  { id: "makeup.eye", group: "Makeup", label: "Eye makeup", legacyAssetTypeIds: [90], avatar: true },

  { id: "meshes", group: "Meshes", label: "Meshes & mesh parts", assetTypes: ["MESH_PART"], legacyAssetTypeIds: [4, 40], avatar: false },
  { id: "modelsPackages.models", group: "Models & Packages", label: "Models", assetTypes: ["MODEL"], avatar: false },
  { id: "modelsPackages.packages", group: "Models & Packages", label: "Packages", assetTypes: ["PACKAGE"], avatar: false },
  { id: "passes", group: "Passes", label: "Passes", special: "gamePasses", avatar: false },
  { id: "places.created", group: "Places", label: "Created places", assetTypes: ["CREATED_PLACE"], avatar: false },
  { id: "places.purchased", group: "Places", label: "Purchased places", assetTypes: ["PURCHASED_PLACE"], avatar: false },
  { id: "plugins", group: "Plugins", label: "Plugins", assetTypes: ["PLUGIN"], avatar: false },
  { id: "privateServers", group: "Private Servers", label: "Private servers", special: "privateServers", avatar: false },
  { id: "shoes.left", group: "Shoes", label: "Left shoes", assetTypes: ["LEFT_SHOE_ACCESSORY"], avatar: true },
  { id: "shoes.right", group: "Shoes", label: "Right shoes", assetTypes: ["RIGHT_SHOE_ACCESSORY"], avatar: true },
  { id: "tops.tshirts", group: "Tops", label: "T-shirts", assetTypes: ["TSHIRT_ACCESSORY"], avatar: true },
  { id: "tops.shirts", group: "Tops", label: "Shirts", assetTypes: ["SHIRT_ACCESSORY"], avatar: true },
  { id: "tops.jackets", group: "Tops", label: "Jackets", assetTypes: ["JACKET_ACCESSORY"], avatar: true },
  { id: "tops.sweaters", group: "Tops", label: "Sweaters", assetTypes: ["SWEATER_ACCESSORY"], avatar: true },
  { id: "video", group: "Video", label: "Video", assetTypes: ["VIDEO"], avatar: false },
] as const;

const BY_ID = new Map(CATEGORY_OPTIONS.map((category) => [category.id, category]));
const BY_ASSET_TYPE = new Map<string, CategoryOption>();
const BY_LEGACY_TYPE = new Map<number, CategoryOption>();

function legacyAssetTypeIdsForCategory(category: CategoryOption): number[] {
  return unique([
    ...(category.legacyAssetTypeIds ?? []),
    ...(category.assetTypes ?? []).flatMap((assetType) => {
      const id = LEGACY_ASSET_TYPE_ID_BY_NAME[assetType];
      return id === undefined ? [] : [id];
    }),
  ]);
}

for (const category of CATEGORY_OPTIONS) {
  for (const assetType of category.assetTypes ?? []) BY_ASSET_TYPE.set(assetType, category);
  for (const assetTypeId of legacyAssetTypeIdsForCategory(category)) BY_LEGACY_TYPE.set(assetTypeId, category);
}

export function getCategory(id: string): CategoryOption | undefined {
  return BY_ID.get(id);
}

export function categoryForAssetType(assetType: string): CategoryOption | undefined {
  return BY_ASSET_TYPE.get(assetType);
}

export function categoryForLegacyAssetType(assetTypeId: number): CategoryOption | undefined {
  return BY_LEGACY_TYPE.get(assetTypeId);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export const CATEGORY_PRESETS = {
  all: CATEGORY_OPTIONS.map(({ id }) => id),
  avatar: CATEGORY_OPTIONS.filter(({ avatar }) => avatar).map(({ id }) => id),
  noClassicClothing: CATEGORY_OPTIONS.filter(({ classicClothing }) => !classicClothing).map(({ id }) => id),
  clear: [] as string[],
} as const;

export function selectedCategories(categoryIds: readonly string[]): CategoryOption[] {
  return unique(categoryIds).flatMap((id) => {
    const category = getCategory(id);
    return category ? [category] : [];
  });
}

export function selectedLegacyAssetTypeIds(categoryIds: readonly string[]): number[] {
  return unique(selectedCategories(categoryIds).flatMap(legacyAssetTypeIdsForCategory));
}

export function legacyAssetTypeIdsForCategoryId(categoryId: string): number[] {
  const category = getCategory(categoryId);
  return category ? legacyAssetTypeIdsForCategory(category) : [];
}

export const UNSUPPORTED_PUBLIC_CATEGORY_IDS = [
  "badges",
  "passes",
  "places.purchased",
  "privateServers",
] as const;

const UNSUPPORTED_PUBLIC_CATEGORY_SET = new Set<string>(UNSUPPORTED_PUBLIC_CATEGORY_IDS);

export function selectedUnsupportedPublicCategoryIds(categoryIds: readonly string[]): string[] {
  return unique(categoryIds.filter((id) => UNSUPPORTED_PUBLIC_CATEGORY_SET.has(id)));
}

export function includesBundles(categoryIds: readonly string[]): boolean {
  return selectedCategories(categoryIds).some(({ special }) => special === "bundles");
}
