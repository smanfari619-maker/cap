import type { DesignElement, DesignPage, Fill, TextStyle } from '../components/design/types';

// ─── AI Design Helper ─────────────────────────────────────────────────────────
// Uses window.ai (Gemini Nano built-in) with graceful fallback to local heuristics

const uid = () => Math.random().toString(36).substring(2, 10);

// ─── Color Palettes ───────────────────────────────────────────────────────────

export const CURATED_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Midnight Violet', colors: ['#0f0c29', '#302b63', '#24243e', '#a855f7', '#c084fc'] },
  { name: 'Ocean Breeze', colors: ['#0ea5e9', '#38bdf8', '#e0f2fe', '#0369a1', '#ffffff'] },
  { name: 'Sunset Glow', colors: ['#f97316', '#fb923c', '#fde68a', '#c2410c', '#1c1917'] },
  { name: 'Forest Mist', colors: ['#15803d', '#4ade80', '#dcfce7', '#166534', '#f0fdf4'] },
  { name: 'Rose Gold', colors: ['#e11d48', '#f43f5e', '#ffe4e6', '#9f1239', '#fff1f2'] },
  { name: 'Neon Tokyo', colors: ['#06b6d4', '#f0abfc', '#fbbf24', '#0f172a', '#1e293b'] },
  { name: 'Monochrome', colors: ['#111827', '#374151', '#9ca3af', '#e5e7eb', '#ffffff'] },
  { name: 'Golden Hour', colors: ['#d97706', '#fbbf24', '#fef3c7', '#92400e', '#fffbeb'] },
  { name: 'Lavender Dream', colors: ['#7c3aed', '#a78bfa', '#ede9fe', '#4c1d95', '#f5f3ff'] },
  { name: 'Coral Reef', colors: ['#f43f5e', '#fb7185', '#fecdd3', '#be123c', '#fff1f2'] },
];

// ─── Font Pairs ───────────────────────────────────────────────────────────────

export const FONT_PAIRS: { name: string; heading: string; body: string }[] = [
  { name: 'Modern Clarity', heading: 'Outfit', body: 'Inter' },
  { name: 'Editorial', heading: 'Playfair Display', body: 'Inter' },
  { name: 'Bold Impact', heading: 'Bebas Neue', body: 'Outfit' },
  { name: 'Tech Forward', heading: 'Space Grotesk', body: 'Inter' },
  { name: 'Cinematic', heading: 'Cinzel', body: 'Inter' },
  { name: 'Playful', heading: 'Syne', body: 'Outfit' },
  { name: 'Elegant Script', heading: 'Satisfy', body: 'Inter' },
  { name: 'Montserrat Pro', heading: 'Montserrat', body: 'Inter' },
];

// ─── Gemini AI Prompt Builder ──────────────────────────────────────────────────

async function askGemini(prompt: string): Promise<string | null> {
  try {
    if ('ai' in window && (window as any).ai?.languageModel) {
      const session = await (window as any).ai.languageModel.create({
        systemPrompt: 'You are a professional graphic designer. Respond ONLY with valid compact JSON, no explanation.',
      });
      const result = await session.prompt(prompt);
      session.destroy();
      return result;
    }
  } catch {
    // Gemini Nano unavailable — fall back silently
  }
  return null;
}

// ─── AI: Generate Color Palette ───────────────────────────────────────────────

export async function generateAIPalette(theme: string): Promise<string[]> {
  const raw = await askGemini(
    `Generate a 5-color harmonious design color palette for the theme: "${theme}".
     Return JSON array of 5 hex colors like: ["#1a1a2e","#16213e","#0f3460","#e94560","#f5f5f5"]`
  );
  if (raw) {
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed) && parsed.every(c => typeof c === 'string')) return parsed;
    } catch { /* fall through */ }
  }
  // Fallback: return a random curated palette
  const rnd = CURATED_PALETTES[Math.floor(Math.random() * CURATED_PALETTES.length)];
  return rnd.colors;
}

// ─── AI: Generate Text Copy ───────────────────────────────────────────────────

export async function generateAITextCopy(context: string, type: 'headline' | 'tagline' | 'cta'): Promise<string> {
  const prompts: Record<string, string> = {
    headline: `Write a powerful 2-6 word design headline for: "${context}". Return only the text.`,
    tagline: `Write a compelling 8-12 word tagline for: "${context}". Return only the text.`,
    cta: `Write a strong 2-4 word call-to-action button text for: "${context}". Return only the text.`,
  };
  const raw = await askGemini(prompts[type]);
  if (raw) return raw.trim().replace(/^["']|["']$/g, '');
  // Fallback copy
  const fallbacks: Record<string, string[]> = {
    headline: ['Make an Impact', 'Stand Out Bold', 'Create Something Great', 'Design Without Limits'],
    tagline: ['Your brand deserves a design that speaks louder than words.', 'Elevate your presence with stunning visuals.'],
    cta: ['Get Started', 'Try Free', 'Learn More', 'Start Now'],
  };
  const list = fallbacks[type];
  return list[Math.floor(Math.random() * list.length)];
}

// ─── AI: Auto-Layout Suggestion ───────────────────────────────────────────────

export interface AILayoutSuggestion {
  name: string;
  description: string;
  elements: Partial<DesignElement>[];
}

export async function generateAILayout(
  prompt: string,
  artboardW: number,
  artboardH: number
): Promise<AILayoutSuggestion> {
  const raw = await askGemini(
    `Design a graphic layout for: "${prompt}". Artboard size: ${artboardW}x${artboardH}px.
     Return JSON: { "name": "...", "description": "...", "elements": [
       { "type": "rect"|"text"|"ellipse", "x": 0-${artboardW}, "y": 0-${artboardH},
         "width": ..., "height": ..., "fills": [{"type":"solid","color":"#hex","opacity":1}],
         "content": "text only if type=text", "textStyle": { "fontSize":..., "fontFamily":"Inter",
         "fontWeight":"700", "color":"#hex", "textAlign":"center","lineHeight":1.2,"letterSpacing":0,
         "fontStyle":"normal","textDecoration":"none","textTransform":"none" } }
     ] }`
  );

  if (raw) {
    try {
      const parsed = JSON.parse(raw.trim());
      return {
        name: parsed.name ?? 'AI Layout',
        description: parsed.description ?? 'AI-generated design',
        elements: parsed.elements ?? [],
      };
    } catch { /* fall through */ }
  }

  // Fallback static layout
  return getFallbackLayout(prompt, artboardW, artboardH);
}

function getFallbackLayout(prompt: string, w: number, h: number): AILayoutSuggestion {
  const palette = CURATED_PALETTES[Math.floor(Math.random() * CURATED_PALETTES.length)];
  return {
    name: 'Centered Layout',
    description: 'Clean centered composition with headline and subtext',
    elements: [
      {
        type: 'rect', x: 0, y: 0, width: w, height: h,
        fills: [{ type: 'solid', color: palette.colors[0], opacity: 1 }],
        strokes: [], effects: [], blendMode: 'normal',
        rotation: 0, opacity: 1, visible: true, locked: false,
        name: 'Background',
      },
      {
        type: 'rect', x: w * 0.1, y: h * 0.1, width: w * 0.8, height: h * 0.8,
        fills: [{ type: 'solid', color: palette.colors[1], opacity: 0.4 }],
        strokes: [], effects: [], blendMode: 'normal',
        rotation: 0, opacity: 1, visible: true, locked: false,
        name: 'Card',
        cornerRadius: 20,
      },
      {
        type: 'text',
        x: w * 0.15, y: h * 0.35, width: w * 0.7, height: 100,
        content: prompt || 'Your Headline Here',
        fills: [{ type: 'solid', color: palette.colors[4], opacity: 1 }],
        strokes: [], effects: [], blendMode: 'normal',
        rotation: 0, opacity: 1, visible: true, locked: false,
        name: 'Headline',
        textStyle: {
          fontFamily: 'Outfit', fontSize: Math.round(w / 12), fontWeight: '800',
          fontStyle: 'normal', letterSpacing: -0.02, lineHeight: 1.1,
          textAlign: 'center', textDecoration: 'none', textTransform: 'none',
          color: palette.colors[4],
        } as TextStyle,
        autoWidth: false, autoHeight: true,
      },
      {
        type: 'text',
        x: w * 0.2, y: h * 0.58, width: w * 0.6, height: 60,
        content: 'Designed with AI precision',
        fills: [{ type: 'solid', color: palette.colors[3], opacity: 1 }],
        strokes: [], effects: [], blendMode: 'normal',
        rotation: 0, opacity: 1, visible: true, locked: false,
        name: 'Subheading',
        textStyle: {
          fontFamily: 'Inter', fontSize: Math.round(w / 30), fontWeight: '400',
          fontStyle: 'normal', letterSpacing: 0.05, lineHeight: 1.5,
          textAlign: 'center', textDecoration: 'none', textTransform: 'none',
          color: palette.colors[3],
        } as TextStyle,
        autoWidth: false, autoHeight: true,
      },
    ] as Partial<DesignElement>[],
  };
}

// ─── AI: Design Feedback ──────────────────────────────────────────────────────

export async function getAIDesignFeedback(designDescription: string): Promise<string> {
  const raw = await askGemini(
    `As a professional graphic designer, give brief constructive feedback (2-3 sentences) on this design:
     "${designDescription}". Return plain text only.`
  );
  return raw?.trim() ?? 'Looking good! Consider adding more visual hierarchy by varying font sizes and using contrasting colors for key elements.';
}

export { uid };
