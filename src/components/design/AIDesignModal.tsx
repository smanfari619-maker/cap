import { useState } from 'react';
import { Sparkles, X, Loader2, Wand2 } from 'lucide-react';
import { useDesignStore } from './useDesignStore';
import { generateAILayout, generateAIPalette } from '../../lib/design-ai';
import type { DesignElement } from './types';

const uid = () => Math.random().toString(36).substring(2, 10);

interface Props {
  onClose: () => void;
}

const PROMPT_EXAMPLES = [
  'Modern tech startup landing page',
  'Vibrant food delivery Instagram post',
  'Elegant luxury brand poster',
  'Bold music festival announcement',
  'Minimal business card layout',
  'Colorful children\'s book cover',
  'Dark cyberpunk game promo',
  'Warm bakery social media post',
];

export default function AIDesignModal({ onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const { getCurrentPage, addElement, snapshot, getPageElements, deleteElements } = useDesignStore();

  const handleGenerate = async () => {
    const page = getCurrentPage();
    if (!page || !prompt.trim()) return;

    setIsGenerating(true);
    setStatus('Thinking about your design...');

    try {
      setStatus('Generating layout...');
      const suggestion = await generateAILayout(prompt, page.width, page.height);

      setStatus('Applying elements...');
      snapshot();

      // Clear existing elements
      const existingEls = getPageElements();
      if (existingEls.length) deleteElements(existingEls.map(e => e.id));

      // Add new elements
      for (const partial of suggestion.elements) {
        const el: DesignElement = {
          id: uid(),
          name: (partial as any).name ?? 'AI Element',
          type: (partial.type ?? 'rect') as any,
          x: (partial as any).x ?? 0,
          y: (partial as any).y ?? 0,
          width: (partial as any).width ?? 200,
          height: (partial as any).height ?? 100,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          fills: (partial as any).fills ?? [{ type: 'solid', color: '#7c3aed', opacity: 1 }],
          strokes: [],
          effects: [],
          blendMode: 'normal',
          ...(partial.type === 'rect' ? { cornerRadius: (partial as any).cornerRadius ?? 0 } : {}),
          ...(partial.type === 'text' ? {
            content: (partial as any).content ?? 'Text',
            textStyle: (partial as any).textStyle ?? {
              fontFamily: 'Inter', fontSize: 24, fontWeight: '700', fontStyle: 'normal',
              letterSpacing: 0, lineHeight: 1.2, textAlign: 'center',
              textDecoration: 'none', textTransform: 'none', color: '#ffffff',
            },
            autoWidth: false, autoHeight: true,
          } : {}),
          ...(partial.type === 'ellipse' ? {} : {}),
        } as DesignElement;
        addElement(el);
      }

      setStatus(`✓ "${suggestion.name}" applied!`);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setStatus('Generation failed — try again');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          border: '1px solid rgba(124,58,237,0.3)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Purple glow */}
        <div
          className="absolute -top-20 -left-20 w-48 h-48 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }}
        />
        <div
          className="absolute -bottom-20 -right-20 w-48 h-48 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }}
        />

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                <Wand2 size={18} color="white" />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: '#f3f4f6' }}>AI Design Generator</h2>
                <p className="text-xs" style={{ color: '#9ca3af' }}>Powered by Gemini AI</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: '#9ca3af' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Prompt input */}
          <div className="mb-4">
            <label className="text-xs font-semibold mb-2 block" style={{ color: '#9ca3af' }}>
              DESCRIBE YOUR DESIGN
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Modern tech startup landing page with dark theme and purple accents..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#f3f4f6',
                border: '1px solid rgba(124,58,237,0.3)',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
            />
          </div>

          {/* Example prompts */}
          <div className="mb-5">
            <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Quick prompts:</p>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_EXAMPLES.slice(0, 4).map(ex => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="px-2.5 py-1 rounded-full text-xs transition-all hover:border-purple-500"
                  style={{
                    background: 'rgba(124,58,237,0.1)',
                    color: '#a78bfa',
                    border: '1px solid rgba(124,58,237,0.25)',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          {status && (
            <div
              className="mb-4 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.2)' }}
            >
              {status}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate Design
                <span className="text-xs opacity-70 ml-1">(⌘↵)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
