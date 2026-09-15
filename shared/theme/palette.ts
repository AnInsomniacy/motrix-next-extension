/**
 * @fileoverview OKLCH color engine.
 *
 * Every visual role is derived from one seed color in the OKLCH space so that
 * different accent hues keep the same perceived weight. Surfaces borrow a
 * faint amount of the seed hue, which is what makes the interface feel like
 * one material instead of grey panels with a colored button on top.
 *
 * This module depends only on culori and is safe to execute outside Vite.
 */
import { clampChroma, formatHex, formatHex8, oklch, parse, type Oklch } from 'culori';

export interface ThemeTokens {
  readonly dark: boolean;
  /** Layered surfaces: canvas sits lowest, overlay floats highest. */
  readonly canvas: string;
  readonly sidebar: string;
  readonly raised: string;
  readonly overlay: string;
  /** Sunken fill used by tracks, chips and quiet inputs. */
  readonly fill: string;
  readonly fillStrong: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textFaint: string;
  readonly hairline: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly hover: string;
  readonly pressed: string;
  readonly selected: string;
  readonly accent: string;
  readonly accentStrong: string;
  readonly accentBright: string;
  readonly accentText: string;
  readonly accentSoft: string;
  readonly onAccent: string;
  readonly glow: string;
  readonly success: string;
  readonly successSoft: string;
  readonly warning: string;
  readonly warningSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly info: string;
  readonly infoSoft: string;
  readonly inverse: string;
  readonly onInverse: string;
  readonly scrollbar: string;
}

export interface PaletteInput {
  readonly seed: string;
  readonly neutral?: boolean;
  readonly dark: boolean;
}

interface Tone {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha?: number;
}

const NEUTRAL_CHROMA_LIGHT = 0.008;
const NEUTRAL_CHROMA_DARK = 0.016;
const LOW_SATURATION_THRESHOLD = 0.04;

const SEMANTIC_HUES = { success: 152, warning: 72, danger: 22, info: 250 } as const;

function seedOklch(seed: string): Oklch {
  const parsed = parse(seed) ?? parse('#7B3ED1');
  const color = oklch(parsed);
  if (!color) throw new Error(`Unparseable seed color: ${seed}`);
  return { mode: 'oklch', l: color.l, c: color.c ?? 0, h: color.h ?? 0 };
}

function hex(tone: Tone): string {
  const color = clampChroma({ mode: 'oklch', l: tone.l, c: tone.c, h: tone.h }, 'oklch');
  if (tone.alpha !== undefined) return formatHex8({ ...color, alpha: tone.alpha });
  return formatHex(color);
}

/** Accent chroma follows a bell curve so very light and very dark tones stay in gamut. */
function accentChroma(base: number, l: number): number {
  if (base === 0) return 0;
  const peak = 1 - Math.abs(l - 0.56) / 0.44;
  return Math.max(0.02, base * Math.max(0.35, peak));
}

export function buildThemeTokens({ seed, neutral, dark }: PaletteInput): ThemeTokens {
  const source = seedOklch(seed);
  const achromatic = Boolean(neutral) || source.c <= LOW_SATURATION_THRESHOLD;
  const h = source.h ?? 0;
  const chroma = achromatic ? 0 : Math.min(0.32, Math.max(0.12, source.c));
  const tint = achromatic ? 0 : dark ? NEUTRAL_CHROMA_DARK : NEUTRAL_CHROMA_LIGHT;

  const n = (l: number, c = tint, alpha?: number): string => hex({ l, c, h, alpha });
  const a = (l: number, boost = 1, alpha?: number): string =>
    hex({ l, c: accentChroma(chroma, l) * boost, h, alpha });
  const s = (hue: number, l: number, c: number, alpha?: number): string =>
    hex({ l, c, h: hue, alpha });

  if (!dark) {
    const accentL = Math.min(0.6, Math.max(0.46, source.l));
    return {
      dark,
      canvas: n(0.985),
      sidebar: n(0.965, tint * 1.6),
      raised: n(0.999, tint * 0.4),
      overlay: n(0.999, tint * 0.4),
      fill: n(0.955, tint * 1.4),
      fillStrong: n(0.92, tint * 1.6),
      text: n(0.22, tint * 2),
      textMuted: n(0.5, tint * 2),
      textFaint: n(0.64, tint * 1.5),
      hairline: n(0.905, tint * 1.5),
      border: n(0.84, tint * 1.5),
      borderStrong: n(0.72, tint * 1.5),
      hover: n(0.2, tint, 0.045),
      pressed: n(0.2, tint, 0.08),
      selected: achromatic ? n(0.2, 0, 0.07) : a(0.55, 1, 0.1),
      accent: a(accentL),
      accentStrong: a(accentL - 0.07),
      accentBright: a(Math.min(0.74, accentL + 0.16), 1.05),
      accentText: a(Math.max(0.42, accentL - 0.06)),
      accentSoft: achromatic ? n(0.94, 0) : a(0.95, 0.45),
      onAccent: '#ffffff',
      glow: a(accentL, 1, 0.28),
      success: s(SEMANTIC_HUES.success, 0.56, 0.15),
      successSoft: s(SEMANTIC_HUES.success, 0.95, 0.05),
      warning: s(SEMANTIC_HUES.warning, 0.6, 0.15),
      warningSoft: s(SEMANTIC_HUES.warning, 0.95, 0.06),
      danger: s(SEMANTIC_HUES.danger, 0.56, 0.2),
      dangerSoft: s(SEMANTIC_HUES.danger, 0.95, 0.04),
      info: s(SEMANTIC_HUES.info, 0.55, 0.15),
      infoSoft: s(SEMANTIC_HUES.info, 0.95, 0.04),
      inverse: n(0.24, tint * 2),
      onInverse: n(0.97, tint),
      scrollbar: n(0.2, tint, 0.22),
    };
  }

  const accentL = 0.74;
  return {
    dark,
    canvas: n(0.17, tint * 1.2),
    sidebar: n(0.145, tint * 1.4),
    raised: n(0.215, tint * 1.1),
    overlay: n(0.255, tint),
    fill: n(0.26, tint),
    fillStrong: n(0.31, tint),
    text: n(0.94, tint * 0.6),
    textMuted: n(0.7, tint),
    textFaint: n(0.55, tint),
    hairline: n(0.27, tint * 1.2),
    border: n(0.34, tint * 1.2),
    borderStrong: n(0.46, tint * 1.2),
    hover: n(0.95, tint, 0.06),
    pressed: n(0.95, tint, 0.1),
    selected: achromatic ? n(0.95, 0, 0.1) : a(0.7, 1, 0.16),
    accent: a(accentL),
    accentStrong: a(accentL + 0.06),
    accentBright: a(0.81, 1.15),
    accentText: a(0.8),
    accentSoft: achromatic ? n(0.3, 0) : a(0.32, 0.6),
    onAccent: achromatic ? n(0.12, 0) : a(0.16, 0.5),
    glow: a(accentL, 1, 0.32),
    success: s(SEMANTIC_HUES.success, 0.78, 0.15),
    successSoft: s(SEMANTIC_HUES.success, 0.3, 0.06),
    warning: s(SEMANTIC_HUES.warning, 0.82, 0.15),
    warningSoft: s(SEMANTIC_HUES.warning, 0.3, 0.06),
    danger: s(SEMANTIC_HUES.danger, 0.76, 0.17),
    dangerSoft: s(SEMANTIC_HUES.danger, 0.3, 0.06),
    info: s(SEMANTIC_HUES.info, 0.78, 0.13),
    infoSoft: s(SEMANTIC_HUES.info, 0.3, 0.06),
    inverse: n(0.95, tint * 0.6),
    onInverse: n(0.2, tint),
    scrollbar: n(0.95, tint, 0.22),
  };
}

/** Convenience for canvas and inline consumers that need the token map as CSS custom properties. */
export function themeCssVariables(tokens: ThemeTokens): Record<string, string> {
  return {
    '--rb-canvas': tokens.canvas,
    '--rb-sidebar': tokens.sidebar,
    '--rb-raised': tokens.raised,
    '--rb-overlay': tokens.overlay,
    '--rb-fill': tokens.fill,
    '--rb-fill-strong': tokens.fillStrong,
    '--rb-text': tokens.text,
    '--rb-text-muted': tokens.textMuted,
    '--rb-text-faint': tokens.textFaint,
    '--rb-hairline': tokens.hairline,
    '--rb-border': tokens.border,
    '--rb-border-strong': tokens.borderStrong,
    '--rb-hover': tokens.hover,
    '--rb-pressed': tokens.pressed,
    '--rb-selected': tokens.selected,
    '--rb-accent': tokens.accent,
    '--rb-accent-strong': tokens.accentStrong,
    '--rb-accent-bright': tokens.accentBright,
    '--rb-accent-text': tokens.accentText,
    '--rb-accent-soft': tokens.accentSoft,
    '--rb-on-accent': tokens.onAccent,
    '--rb-glow': tokens.glow,
    '--rb-success': tokens.success,
    '--rb-success-soft': tokens.successSoft,
    '--rb-warning': tokens.warning,
    '--rb-warning-soft': tokens.warningSoft,
    '--rb-danger': tokens.danger,
    '--rb-danger-soft': tokens.dangerSoft,
    '--rb-info': tokens.info,
    '--rb-info-soft': tokens.infoSoft,
    '--rb-inverse': tokens.inverse,
    '--rb-on-inverse': tokens.onInverse,
    '--rb-scrollbar': tokens.scrollbar,
    '--rb-gradient': `linear-gradient(135deg, ${tokens.accentBright} 0%, ${tokens.accent} 100%)`,
  };
}
