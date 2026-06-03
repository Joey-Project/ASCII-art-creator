import type { GlyphPack } from "./types";

export const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, index) =>
  String.fromCharCode(index + 32),
).join("");

const LATIN_EXTENDED =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
  "!?.,;:()[]{}<>/\\|_-+=*#%&@$^~`'\"";

const CJK_COMMON =
  "的一是在不了有人和国中大为上个民我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所";

const KANA =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのまみむめもやゆよらりるれろわをん" +
  "アイウエオカキクケコサシスセソタチツテトナニヌネノマミムメモヤユヨラリルレロワヲン";

const MATH_SYMBOLS = "∑∫√∞≈≠≤≥±×÷∂∇πθλμΩαβγδεζηκσφψ";

const GENERAL_SYMBOLS = "●○◆◇■□▲△▼▽★☆※→←↑↓↔↕✓✕✦✧";

const MUSIC_SYMBOLS = "♩♪♫♬♭♮♯𝄞𝄢𝄫𝄪";

const EMOJI = "😀😃😄😁😆🙂😉😍🤖🔥✨🌙⭐️❤️💡🎨🧩";

export const GLYPH_PACKS: GlyphPack[] = [
  {
    id: "ascii",
    label: "ASCII",
    description: "Printable ASCII characters. Enabled by default.",
    glyphs: ASCII_PRINTABLE,
    defaultEnabled: true,
    asciiOnly: true,
  },
  {
    id: "latin",
    label: "Latin",
    description: "Latin letters, digits, and common punctuation.",
    glyphs: LATIN_EXTENDED,
    defaultEnabled: false,
    asciiOnly: true,
  },
  {
    id: "cjk",
    label: "CJK",
    description: "Common Chinese glyphs. Enable explicitly for larger candidate sets.",
    glyphs: CJK_COMMON,
    defaultEnabled: false,
    asciiOnly: false,
  },
  {
    id: "kana",
    label: "Kana",
    description: "Japanese hiragana and katakana.",
    glyphs: KANA,
    defaultEnabled: false,
    asciiOnly: false,
  },
  {
    id: "math",
    label: "Math",
    description: "Mathematical operators and Greek symbols.",
    glyphs: MATH_SYMBOLS,
    defaultEnabled: false,
    asciiOnly: false,
  },
  {
    id: "symbols",
    label: "Symbols",
    description: "Geometric and directional symbols.",
    glyphs: GENERAL_SYMBOLS,
    defaultEnabled: false,
    asciiOnly: false,
  },
  {
    id: "music",
    label: "Music",
    description: "Music notation symbols.",
    glyphs: MUSIC_SYMBOLS,
    defaultEnabled: false,
    asciiOnly: false,
  },
  {
    id: "emoji",
    label: "Emoji",
    description: "Emoji graphemes. Rendering depends on browser and OS fonts.",
    glyphs: EMOJI,
    defaultEnabled: false,
    asciiOnly: false,
  },
];
