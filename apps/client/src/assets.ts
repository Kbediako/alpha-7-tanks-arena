export interface Alpha7AssetManifest {
  assetRoot?: string;
  ui?: {
    icons?: Partial<Record<"reticle" | "repair" | "shield", string>>;
  };
  tanks?: Partial<
    Record<
      "nova" | "atlas" | "quill" | "rook",
      {
        model?: string | null;
        texture?: string | null;
        fallback?: string;
      }
    >
  >;
  maps?: {
    wallConcrete?: {
      texture?: string | null;
      fallback?: string;
    };
    floorConcrete?: {
      texture?: string | null;
      fallback?: string;
    };
  };
  fx?: Partial<
    Record<
      "cannonMuzzle" | "smoke" | "zoneWarning",
      {
        sprite?: string | null;
        fallback?: string;
      }
    >
  >;
  audio?: {
    ambientMusic?: {
      wav?: string | null;
      fallback?: string;
    };
  };
}

export const loadAlpha7AssetManifest = async (): Promise<Alpha7AssetManifest | null> => {
  const response = await fetch("/assets/manifest.json", { cache: "no-cache" });
  if (!response.ok) return null;
  return (await response.json()) as Alpha7AssetManifest;
};
