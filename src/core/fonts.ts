import type { FontChoice } from "../domain/types";

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

export const BUILTIN_FONTS: FontChoice[] = [
  {
    id: "builtin-monospace",
    family: "monospace",
    label: "Monospace",
    source: "builtin",
    selected: true,
    weights: [400, 700],
  },
  {
    id: "builtin-serif",
    family: "serif",
    label: "Serif",
    source: "builtin",
    selected: true,
    weights: [400],
  },
  {
    id: "builtin-sans",
    family: "sans-serif",
    label: "Sans Serif",
    source: "builtin",
    selected: true,
    weights: [400, 700],
  },
  {
    id: "builtin-courier",
    family: "Courier New",
    label: "Courier New",
    source: "builtin",
    selected: false,
    weights: [400, 700],
  },
  {
    id: "builtin-georgia",
    family: "Georgia",
    label: "Georgia",
    source: "builtin",
    selected: false,
    weights: [400, 700],
  },
  {
    id: "builtin-impact",
    family: "Impact",
    label: "Impact",
    source: "builtin",
    selected: false,
    weights: [400],
  },
];

export function localFontAccessAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.queryLocalFonts === "function";
}

export async function scanLocalFonts(limit = 80): Promise<FontChoice[]> {
  if (!localFontAccessAvailable()) {
    throw new Error("Local Font Access is not available in this browser");
  }

  const fonts = await window.queryLocalFonts!();
  const byFamily = new Map<string, LocalFontData>();
  for (const font of fonts) {
    if (!byFamily.has(font.family)) {
      byFamily.set(font.family, font);
    }
  }

  return Array.from(byFamily.values())
    .slice(0, limit)
    .map((font, index) => ({
      id: `local-${index}-${slug(font.family)}`,
      family: font.family,
      label: font.family,
      source: "local",
      selected: false,
      weights: [400],
    }));
}

export async function registerUploadedFonts(files: FileList | File[]): Promise<FontChoice[]> {
  const result: FontChoice[] = [];
  const list = Array.from(files);

  for (const [index, file] of list.entries()) {
    const family = `Uploaded ${slug(file.name)} ${Date.now()} ${index}`;
    const url = URL.createObjectURL(file);
    try {
      const face = new FontFace(family, `url(${url})`);
      await face.load();
      document.fonts.add(face);
      result.push({
        id: `uploaded-${slug(file.name)}-${Date.now()}-${index}`,
        family,
        label: file.name,
        source: "uploaded",
        selected: true,
        weights: [400, 700],
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return result;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "font"
  );
}
