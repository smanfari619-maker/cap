import { Palette, Eye } from 'lucide-react';
import SnappingSlider from './SnappingSlider';

interface AdjustTabProps {
  selectedClip: any;
  updateClip: (id: string, updates: any) => void;
  colorAdjustments: any;
  filterSettings: any;
  handleColorChange: (key: string, value: number) => void;
  handleFilterChange: (key: string, value: any) => void;
}

export default function AdjustTab({
  selectedClip,
  updateClip,
  colorAdjustments,
  filterSettings,
  handleColorChange,
  handleFilterChange
}: AdjustTabProps) {
  return (
    <div className="space-y-6">
      {/* Color adjustments */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
          <Palette className="w-3.5 h-3.5 text-violet-400" /> Color adjustments
        </h4>
        
        <div className="space-y-3.5">
          {/* Brightness */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Brightness</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.brightness}%</span>
            </div>
            <SnappingSlider
              min={50}
              max={150}
              defaultValue={100}
              value={colorAdjustments.brightness}
              onChange={(val) => handleColorChange('brightness', val)}
            />
          </div>

          {/* Contrast */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Contrast</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.contrast}%</span>
            </div>
            <SnappingSlider
              min={50}
              max={150}
              defaultValue={100}
              value={colorAdjustments.contrast}
              onChange={(val) => handleColorChange('contrast', val)}
            />
          </div>

          {/* Saturation */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Saturation</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.saturation}%</span>
            </div>
            <SnappingSlider
              min={0}
              max={200}
              defaultValue={100}
              value={colorAdjustments.saturation}
              onChange={(val) => handleColorChange('saturation', val)}
            />
          </div>

          {/* Temperature */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Temperature</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.temp > 0 ? `+${colorAdjustments.temp}` : colorAdjustments.temp}</span>
            </div>
            <SnappingSlider
              min={-50}
              max={50}
              defaultValue={0}
              value={colorAdjustments.temp}
              onChange={(val) => handleColorChange('temp', val)}
            />
          </div>

          {/* Vignette */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Vignette</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.vignette}%</span>
            </div>
            <SnappingSlider
              min={0}
              max={100}
              defaultValue={0}
              value={colorAdjustments.vignette}
              onChange={(val) => handleColorChange('vignette', val)}
            />
          </div>
        </div>
      </div>

      {/* Cinematic filters */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
          <Eye className="w-3.5 h-3.5 text-violet-400" /> Cinematic filters
        </h4>

        <div className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Preset Filter</label>
            <select
              value={filterSettings.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition"
            >
              <option value="none">None (No Filter)</option>
              <option value="cinematic">Cinematic Blue</option>
              <option value="bw">Noir B&W (Monochrome)</option>
              <option value="vintage">Vintage Retro</option>
              <option value="warm">Golden Warm</option>
              <option value="cool">Teal Cool</option>
              <option value="cyberpunk">Cyberpunk Neon</option>
              <option value="sepia">Rustic Sepia</option>
              <option value="pastel">Dreamy Pastel</option>
              <option value="forest">Forest Green</option>
              <option value="polaroid">Polaroid Film</option>
              <option value="vaporwave">Vaporwave</option>
            </select>
          </div>

          {filterSettings.type !== 'none' && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Filter Intensity</label>
                <span className="text-[10px] font-mono text-zinc-400 font-bold">{filterSettings.intensity}%</span>
              </div>
              <SnappingSlider
                min={10}
                max={100}
                defaultValue={100}
                value={filterSettings.intensity}
                onChange={(val) => handleFilterChange('intensity', val)}
              />
            </div>
          )}
        </div>
      </div>

      {/* HSL Adjustments */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">HSL Color Shift</h4>
        <div className="space-y-3.5">
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Hue Shift</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.hslAdjustments?.hue || 0}°</span>
            </div>
            <SnappingSlider
              min={-180}
              max={180}
              defaultValue={0}
              value={selectedClip.hslAdjustments?.hue || 0}
              onChange={(val) => {
                const current = selectedClip.hslAdjustments || { hue: 0, saturation: 0, lightness: 0 };
                updateClip(selectedClip.id, { hslAdjustments: { ...current, hue: val } });
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Saturation Shift</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.hslAdjustments?.saturation || 0}%</span>
            </div>
            <SnappingSlider
              min={-100}
              max={100}
              defaultValue={0}
              value={selectedClip.hslAdjustments?.saturation || 0}
              onChange={(val) => {
                const current = selectedClip.hslAdjustments || { hue: 0, saturation: 0, lightness: 0 };
                updateClip(selectedClip.id, { hslAdjustments: { ...current, saturation: val } });
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Lightness Shift</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.hslAdjustments?.lightness || 0}%</span>
            </div>
            <SnappingSlider
              min={-100}
              max={100}
              defaultValue={0}
              value={selectedClip.hslAdjustments?.lightness || 0}
              onChange={(val) => {
                const current = selectedClip.hslAdjustments || { hue: 0, saturation: 0, lightness: 0 };
                updateClip(selectedClip.id, { hslAdjustments: { ...current, lightness: val } });
              }}
            />
          </div>
        </div>
      </div>

      {/* Lift/Gamma/Gain Shadows+Mids+Highlights */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">Lift / Gamma / Gain</h4>
        <p className="text-[9px] text-zinc-600">Adjust shadows (Lift), midtones (Gamma) and highlights (Gain) per-channel.</p>
        {(['r','g','b'] as const).map(ch => {
          const labels: Record<string, string> = { r: 'Red', g: 'Green', b: 'Blue' };
          const colors: Record<string, string> = { r: 'accent-red-500', g: 'accent-green-500', b: 'accent-blue-500' };
          const cc = selectedClip.colorCorrection || {};
          const liftVal = (cc.lift as any)?.[ch] ?? 0;
          const gammaVal = (cc.gamma as any)?.[ch] ?? 0;
          const gainVal = (cc.gain as any)?.[ch] ?? 0;
          return (
            <div key={ch} className="space-y-2 p-2 bg-zinc-950/40 rounded-lg border border-zinc-800">
              <p className="text-[10px] font-bold text-zinc-300 uppercase">{labels[ch]} Channel</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[9px] text-zinc-500">Lift (Shadows)</label>
                  <span className="text-[9px] font-mono text-zinc-400">{liftVal}</span>
                </div>
                <SnappingSlider
                  min={-50}
                  max={50}
                  defaultValue={0}
                  value={liftVal}
                  onChange={(val) => {
                    updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, lift: { ...((selectedClip.colorCorrection?.lift) || {r:0,g:0,b:0}), [ch]: val } } });
                  }}
                  accentColor={colors[ch]}
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[9px] text-zinc-500">Gamma (Mids)</label>
                  <span className="text-[9px] font-mono text-zinc-400">{gammaVal}</span>
                </div>
                <SnappingSlider
                  min={-50}
                  max={50}
                  defaultValue={0}
                  value={gammaVal}
                  onChange={(val) => {
                    updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, gamma: { ...((selectedClip.colorCorrection?.gamma) || {r:0,g:0,b:0}), [ch]: val } } });
                  }}
                  accentColor={colors[ch]}
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[9px] text-zinc-500">Gain (Highlights)</label>
                  <span className="text-[9px] font-mono text-zinc-400">{gainVal}</span>
                </div>
                <SnappingSlider
                  min={-50}
                  max={50}
                  defaultValue={0}
                  value={gainVal}
                  onChange={(val) => {
                    updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, gain: { ...((selectedClip.colorCorrection?.gain) || {r:0,g:0,b:0}), [ch]: val } } });
                  }}
                  accentColor={colors[ch]}
                />
              </div>
            </div>
          );
        })}
      </div>


      {/* .cube LUT File Import */}
      <div className="space-y-2 pt-4 border-t border-zinc-800">
        <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">3D LUT Import (.cube)</h4>
        <p className="text-[9px] text-zinc-600">Import a professional .cube LUT file for cinematic color grading.</p>
        {selectedClip.colorCorrection?.lutContent ? (
          <div className="flex items-center gap-2 p-2 bg-violet-950/30 border border-violet-800 rounded-lg">
            <span className="text-[9px] text-violet-300 flex-1">✓ LUT loaded ({Math.round(selectedClip.colorCorrection.lutContent.length / 1024)}KB)</span>
            <button
              onClick={() => updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, lutContent: undefined } })}
              className="text-[9px] text-red-400 hover:text-red-300 transition"
            >Remove</button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-1.5 w-full py-2 bg-zinc-900 border border-dashed border-zinc-700 hover:border-violet-600 rounded-lg cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-200 transition">
            <input
              type="file"
              accept=".cube"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const text = ev.target?.result as string;
                  updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, lutContent: text } });
                };
                reader.readAsText(file);
              }}
            />
            ⊕ Import .cube LUT
          </label>
        )}
      </div>
    </div>
  );
}
