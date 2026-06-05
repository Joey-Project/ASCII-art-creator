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
    weights: [400],
  },
  {
    id: "builtin-serif",
    family: "serif",
    label: "Serif",
    source: "builtin",
    selected: false,
    weights: [400],
  },
  {
    id: "builtin-sans",
    family: "sans-serif",
    label: "Sans Serif",
    source: "builtin",
    selected: false,
    weights: [400],
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

export interface LocalFontAccessStatus {
  available: boolean;
  reason: string;
}

export function localFontAccessStatus(): LocalFontAccessStatus {
  if (typeof window === "undefined") {
    return {
      available: false,
      reason: "Local Font Access needs a browser runtime.",
    };
  }

  if (!window.isSecureContext) {
    return {
      available: false,
      reason: "Local Font Access needs HTTPS or localhost.",
    };
  }

  if (typeof window.queryLocalFonts !== "function") {
    return {
      available: false,
      reason: "Local Font Access is only available in some Chromium desktop browsers.",
    };
  }

  return {
    available: true,
    reason: "Local Font Access scan needs browser permission and may be empty if access is denied.",
  };
}

export function localFontAccessAvailable(): boolean {
  return localFontAccessStatus().available;
}

export async function scanLocalFonts(limit = 300): Promise<FontChoice[]> {
  if (!localFontAccessAvailable()) {
    throw new Error(localFontAccessStatus().reason);
  }

  const fonts = await window.queryLocalFonts!();
  const byFamily = new Map<string, LocalFontData>();
  for (const font of fonts) {
    const family = font.family.trim() || font.fullName.trim() || font.postscriptName.trim();
    if (family && !byFamily.has(family)) {
      byFamily.set(family, { ...font, family });
    }
  }

  return Array.from(byFamily.values())
    .sort((first, second) => first.family.localeCompare(second.family))
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
    const dataUrl = await fileToDataUrl(file);
    const face = new FontFace(family, `url(${dataUrl})`);
    await face.load();
    document.fonts.add(face);
    result.push({
      id: `uploaded-${slug(file.name)}-${Date.now()}-${index}`,
      family,
      label: file.name,
      source: "uploaded",
      selected: true,
      weights: [400],
      dataUrl,
    });
  }

  return result;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Font file could not be read"));
      }
    };
    reader.onerror = () => reject(new Error("Font file could not be read"));
    reader.readAsDataURL(file);
  });
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "font"
  );
}
