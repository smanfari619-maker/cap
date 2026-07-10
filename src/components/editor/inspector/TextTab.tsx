import { useState } from 'react';
import { Type, Sliders, Square, Layers, AlignCenter } from 'lucide-react';
import { type TimelineClip } from '../../../lib/db';

interface TextTabProps {
  selectedClip: TimelineClip;
  handleTextSettingsChange: (key: string, value: any) => void;
}

export default function TextTab({ selectedClip, handleTextSettingsChange }: TextTabProps) {
  const settings = selectedClip.textSettings;

  // Local helper states to toggle groups
  const [enableOutline, setEnableOutline] = useState(settings ? (settings.strokeWidth !== undefined && settings.strokeWidth > 0) : false);
  const [enableShadow, setEnableShadow] = useState(settings ? !!settings.shadowColor : false);
  const [enableBackground, setEnableBackground] = useState(settings ? !!settings.backgroundColor : false);

  if (!settings) return null;

  const handleOutlineToggle = (checked: boolean) => {
    setEnableOutline(checked);
    if (checked) {
      handleTextSettingsChange('strokeColor', settings.strokeColor || '#000000');
      handleTextSettingsChange('strokeWidth', settings.strokeWidth || 4);
    } else {
      handleTextSettingsChange('strokeWidth', 0);
    }
  };

  const handleShadowToggle = (checked: boolean) => {
    setEnableShadow(checked);
    if (checked) {
      handleTextSettingsChange('shadowColor', settings.shadowColor || 'rgba(0,0,0,0.5)');
      handleTextSettingsChange('shadowBlur', settings.shadowBlur || 5);
      handleTextSettingsChange('shadowOffsetX', settings.shadowOffsetX || 2);
      handleTextSettingsChange('shadowOffsetY', settings.shadowOffsetY || 2);
    } else {
      handleTextSettingsChange('shadowColor', undefined);
    }
  };

  const handleBackgroundToggle = (checked: boolean) => {
    setEnableBackground(checked);
    if (checked) {
      handleTextSettingsChange('backgroundColor', settings.backgroundColor || '#000000');
      handleTextSettingsChange('backgroundAlpha', settings.backgroundAlpha || 70);
      handleTextSettingsChange('backgroundPadding', settings.backgroundPadding || 8);
      handleTextSettingsChange('backgroundBorderRadius', settings.backgroundBorderRadius || 4);
    } else {
      handleTextSettingsChange('backgroundColor', undefined);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Group 1: Content & Font Basics */}
      <div className="space-y-3.5 bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/40">
        <div className="flex items-center gap-1.5 border-b border-zinc-800/60 pb-1.5">
          <Type className="w-3.5 h-3.5 text-violet-400" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Typography</h4>
        </div>

        <div className="space-y-1">
          <label className="block text-[9px] font-semibold text-zinc-500 uppercase">Text Content</label>
          <textarea
            value={settings.content}
            onChange={(e) => handleTextSettingsChange('content', e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-violet-500 focus:outline-none transition resize-y h-20 placeholder-zinc-700"
            placeholder="Type your text here..."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[9px] font-semibold text-zinc-500 uppercase">Font Family</label>
            <select
              value={settings.fontFamily}
              onChange={(e) => handleTextSettingsChange('fontFamily', e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 focus:border-violet-500 focus:outline-none transition"
            >
              <option value="Inter">Inter (Sans)</option>
              <option value="Montserrat">Montserrat (Montserrat Bold)</option>
              <option value="Bebas Neue">Bebas Neue (Cinematic Header)</option>
              <option value="Outfit">Outfit (Modern Geometric)</option>
              <option value="Playfair Display">Playfair Display (Elegant Serif)</option>
              <option value="Cinzel">Cinzel (Luxurious Roman)</option>
              <option value="Syne">Syne (Artistic Display)</option>
              <option value="Space Grotesk">Space Grotesk (Tech/Modern)</option>
              <option value="Satisfy">Satisfy (Handwritten Script)</option>
              <option value="Impact">Impact (Retro Bold)</option>
              <option value="Courier New">Courier (Typewriter)</option>
              <option value="Georgia">Georgia (Serif)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-semibold text-zinc-500 uppercase">Text Color</label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={settings.color}
                onChange={(e) => handleTextSettingsChange('color', e.target.value)}
                className="w-7 h-7 rounded border border-zinc-800 bg-zinc-950 cursor-pointer p-0 overflow-hidden"
              />
              <input
                type="text"
                value={settings.color}
                onChange={(e) => handleTextSettingsChange('color', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-100 focus:border-violet-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="space-y-1 col-span-2">
            <label className="block text-[9px] font-semibold text-zinc-500 uppercase">Font Styling</label>
            <div className="flex gap-2">
              {/* Bold Toggle */}
              <button
                onClick={() => {
                  const isBold = settings.fontWeight === 'bold' || settings.fontWeight === '900';
                  handleTextSettingsChange('fontWeight', isBold ? 'normal' : 'bold');
                }}
                className={`flex-1 py-1 px-2 rounded border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${settings.fontWeight === 'bold' || settings.fontWeight === '900' ? 'bg-zinc-800 text-sky-400 border-sky-500/50' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'}`}
              >
                <span>B</span>
                <span className="text-[9px] font-semibold text-zinc-500">Bold</span>
              </button>

              {/* Italic Toggle */}
              <button
                onClick={() => {
                  const isItalic = settings.fontStyle === 'italic';
                  handleTextSettingsChange('fontStyle', isItalic ? 'normal' : 'italic');
                }}
                className={`flex-1 py-1 px-2 rounded border text-xs italic transition flex items-center justify-center gap-1.5 cursor-pointer ${settings.fontStyle === 'italic' ? 'bg-zinc-800 text-sky-400 border-sky-500/50' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'}`}
              >
                <span>I</span>
                <span className="text-[9px] font-semibold text-zinc-500 not-italic">Italic</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex justify-between text-[9px]">
            <label className="font-semibold text-zinc-500 uppercase">Font Size</label>
            <span className="font-mono text-zinc-400 font-bold">{settings.fontSize}px</span>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            value={settings.fontSize}
            onChange={(e) => handleTextSettingsChange('fontSize', Number(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Group 2: Spacing & Position */}
      <div className="space-y-3.5 bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/40">
        <div className="flex items-center gap-1.5 border-b border-zinc-800/60 pb-1.5">
          <AlignCenter className="w-3.5 h-3.5 text-violet-400" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Spacing & Layout</h4>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <label className="font-semibold text-zinc-500 uppercase">Letter Spacing</label>
              <span className="font-mono text-zinc-400">{settings.letterSpacing ?? 0}px</span>
            </div>
            <input
              type="range"
              min={-5}
              max={25}
              value={settings.letterSpacing ?? 0}
              onChange={(e) => handleTextSettingsChange('letterSpacing', Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <label className="font-semibold text-zinc-500 uppercase">Line Height</label>
              <span className="font-mono text-zinc-400">{(settings.lineHeight ?? 1.2).toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={2.5}
              step={0.1}
              value={settings.lineHeight ?? 1.2}
              onChange={(e) => handleTextSettingsChange('lineHeight', Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <label className="font-semibold text-zinc-500 uppercase">Horizontal (X)</label>
              <span className="font-mono text-zinc-400">{Math.round(settings.x * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={settings.x}
              onChange={(e) => handleTextSettingsChange('x', Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <label className="font-semibold text-zinc-500 uppercase">Vertical (Y)</label>
              <span className="font-mono text-zinc-400">{Math.round(settings.y * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={settings.y}
              onChange={(e) => handleTextSettingsChange('y', Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Group 3: Text Outline */}
      <div className="space-y-3.5 bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/40">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-violet-400" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Outline / Border</h4>
          </div>
          <input
            type="checkbox"
            checked={enableOutline}
            onChange={(e) => handleOutlineToggle(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-800 text-violet-500 cursor-pointer accent-violet-500"
          />
        </div>

        {enableOutline && (
          <div className="space-y-3 animate-fadeIn">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[9px] font-semibold text-zinc-500 uppercase">Stroke Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={settings.strokeColor || '#000000'}
                    onChange={(e) => handleTextSettingsChange('strokeColor', e.target.value)}
                    className="w-7 h-7 rounded border border-zinc-800 bg-zinc-950 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={settings.strokeColor || '#000000'}
                    onChange={(e) => handleTextSettingsChange('strokeColor', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-100 focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[9px]">
                  <label className="font-semibold text-zinc-500 uppercase">Width</label>
                  <span className="font-mono text-zinc-400 font-bold">{settings.strokeWidth ?? 4}px</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={settings.strokeWidth ?? 4}
                  onChange={(e) => handleTextSettingsChange('strokeWidth', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Group 4: Background Label Pill */}
      <div className="space-y-3.5 bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/40">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Square className="w-3.5 h-3.5 text-violet-400" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Background Label</h4>
          </div>
          <input
            type="checkbox"
            checked={enableBackground}
            onChange={(e) => handleBackgroundToggle(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-800 text-violet-500 cursor-pointer accent-violet-500"
          />
        </div>

        {enableBackground && (
          <div className="space-y-3 animate-fadeIn text-[9px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block font-semibold text-zinc-500 uppercase">BG Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={settings.backgroundColor || '#000000'}
                    onChange={(e) => handleTextSettingsChange('backgroundColor', e.target.value)}
                    className="w-7 h-7 rounded border border-zinc-800 bg-zinc-950 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={settings.backgroundColor || '#000000'}
                    onChange={(e) => handleTextSettingsChange('backgroundColor', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-100 focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="font-semibold text-zinc-500 uppercase">Opacity</label>
                  <span className="font-mono text-zinc-400 font-bold">{settings.backgroundAlpha ?? 70}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={settings.backgroundAlpha ?? 70}
                  onChange={(e) => handleTextSettingsChange('backgroundAlpha', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="font-semibold text-zinc-500 uppercase">Padding</label>
                  <span className="font-mono text-zinc-400 font-bold">{settings.backgroundPadding ?? 8}px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={30}
                  value={settings.backgroundPadding ?? 8}
                  onChange={(e) => handleTextSettingsChange('backgroundPadding', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="font-semibold text-zinc-500 uppercase">Corner Radius</label>
                  <span className="font-mono text-zinc-400 font-bold">{settings.backgroundBorderRadius ?? 4}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={settings.backgroundBorderRadius ?? 4}
                  onChange={(e) => handleTextSettingsChange('backgroundBorderRadius', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Group 5: Drop Shadow */}
      <div className="space-y-3.5 bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/40">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-violet-400" strokeWidth={2} />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Drop Shadow</h4>
          </div>
          <input
            type="checkbox"
            checked={enableShadow}
            onChange={(e) => handleShadowToggle(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-800 text-violet-500 cursor-pointer accent-violet-500"
          />
        </div>

        {enableShadow && (
          <div className="space-y-3 animate-fadeIn text-[9px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block font-semibold text-zinc-500 uppercase">Shadow Color</label>
                <input
                  type="color"
                  value={settings.shadowColor?.startsWith('rgba') ? '#000000' : (settings.shadowColor || '#000000')}
                  onChange={(e) => handleTextSettingsChange('shadowColor', e.target.value)}
                  className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="font-semibold text-zinc-500 uppercase">Blur</label>
                  <span className="font-mono text-zinc-400 font-bold">{settings.shadowBlur ?? 5}px</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={25}
                  value={settings.shadowBlur ?? 5}
                  onChange={(e) => handleTextSettingsChange('shadowBlur', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="font-semibold text-zinc-500 uppercase">Offset X</label>
                  <span className="font-mono text-zinc-400">{settings.shadowOffsetX ?? 2}px</span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  value={settings.shadowOffsetX ?? 2}
                  onChange={(e) => handleTextSettingsChange('shadowOffsetX', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="font-semibold text-zinc-500 uppercase">Offset Y</label>
                  <span className="font-mono text-zinc-400">{settings.shadowOffsetY ?? 2}px</span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  value={settings.shadowOffsetY ?? 2}
                  onChange={(e) => handleTextSettingsChange('shadowOffsetY', Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
