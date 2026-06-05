import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_FONTS, localFontAccessStatus, scanLocalFonts } from "../../src/core/fonts";

describe("font helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains unavailable Local Font Access states", () => {
    vi.stubGlobal("window", { isSecureContext: false });
    expect(localFontAccessStatus()).toEqual({
      available: false,
      reason: "Local Font Access needs HTTPS or localhost.",
    });

    vi.stubGlobal("window", { isSecureContext: true });
    expect(localFontAccessStatus()).toEqual({
      available: false,
      reason: "Local Font Access is only available in some Chromium desktop browsers.",
    });
  });

  it("defaults to one built-in font and one weight", () => {
    expect(BUILTIN_FONTS.filter((font) => font.selected)).toEqual([
      expect.objectContaining({ id: "builtin-monospace", weights: [400] }),
    ]);
  });

  it("deduplicates, sorts, and limits scanned local font families", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      queryLocalFonts: vi.fn(async () => [
        { family: "Zed", fullName: "Zed Regular", postscriptName: "Zed-Regular", style: "Regular" },
        {
          family: "Alpha",
          fullName: "Alpha Regular",
          postscriptName: "Alpha-Regular",
          style: "Regular",
        },
        { family: "Zed", fullName: "Zed Bold", postscriptName: "Zed-Bold", style: "Bold" },
        {
          family: "",
          fullName: "Fallback Full",
          postscriptName: "Fallback-Full",
          style: "Regular",
        },
      ]),
    });

    await expect(scanLocalFonts(2)).resolves.toMatchObject([
      { family: "Alpha", label: "Alpha", source: "local", selected: false, weights: [400] },
      {
        family: "Fallback Full",
        label: "Fallback Full",
        source: "local",
        selected: false,
        weights: [400],
      },
    ]);
  });
});
