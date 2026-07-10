import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Loader2, Sparkles, Sliders, Check, Music, Timer, Trash2 } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db } from '../../lib/db';
import type { ProjectVersion } from '../../lib/db';
import { EFFECTS_REGISTRY } from '../../lib/effects-registry';
import heroImg from '../../assets/hero.png';
import EffectsPanel from './sidebar/EffectsPanel';
import TransitionsPanel from './sidebar/TransitionsPanel';
import MediaPanel from './sidebar/MediaPanel';
import { saveFileToOPFS } from '../../lib/opfs';
import { generateAISoundtrack } from '../../lib/audio-synth-generator';

interface LeftSidebarProps {
  width: number;
  activeTab: string;
}

export default function LeftSidebar({ width, activeTab }: LeftSidebarProps) {
  const project = useEditorStore(state => state.project);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const updateClip = useEditorStore(state => state.updateClip);
  const addClip = useEditorStore(state => state.addClip);
  const addTrack = useEditorStore(state => state.addTrack);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const createSnapshot = useEditorStore(state => state.createSnapshot);
  const restoreSnapshot = useEditorStore(state => state.restoreSnapshot);
  const deleteSnapshot = useEditorStore(state => state.deleteSnapshot);

  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);

  const snapshots = useLiveQuery<ProjectVersion[]>(
    () => project
      ? db.projectVersions.where('projectId').equals(project.id).reverse().sortBy('createdAt') as Promise<ProjectVersion[]>
      : Promise.resolve([] as ProjectVersion[]),
    [project?.id]
  ) || [];

  const activeFilter = selectedClipId && project
    ? project.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)?.filterSettings?.type || 'none'
    : 'none';

  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [stickerMode, setStickerMode] = useState<'emoji' | 'shape'>('emoji');
  const [captionsProgress, setCaptionsProgress] = useState(0);
  const [captionsStage, setCaptionsStage] = useState('Generating audio transcript...');
  const [aiBpm, setAiBpm] = useState(110);
  const [aiMood, setAiMood] = useState<'chill' | 'tech' | 'epic'>('chill');
  const [aiDuration, setAiDuration] = useState(30);
  const [isGeneratingSoundtrack, setIsGeneratingSoundtrack] = useState(false);

  const handleAddTextPreset = async (styleType: string) => {
    const textTrack = project?.tracks.find(t => t.type === 'text');
    if (!textTrack || !project) return;

    const clipId = Math.random().toString(36).substring(2, 9);
    let name = 'Text Overlay';
    let fontSize = 24;
    let fontFamily = 'Inter';
    let content = 'Edit Text';
    let color = '#ffffff';
    let fontWeight = 'normal';
    let fontStyle = 'normal';

    if (styleType === 'tiktok') {
      name = 'TikTok Montserrat';
      fontFamily = 'Montserrat';
      fontSize = 36;
      content = 'TRENDING CLIPS';
      color = '#fcd34d';
      fontWeight = '900';
    } else if (styleType === 'bebas') {
      name = 'Bebas Neue Gold';
      fontFamily = 'Bebas Neue';
      fontSize = 44;
      content = 'CINEMATIC HEADER';
      color = '#fbbf24';
      fontWeight = '800';
    } else if (styleType === 'syne') {
      name = 'Syne Purple';
      fontFamily = 'Syne';
      fontSize = 32;
      content = 'CREATIVE LAB';
      color = '#c084fc';
      fontWeight = '800';
    } else if (styleType === 'cinematic') {
      name = 'Cinzel Luxury';
      fontFamily = 'Cinzel';
      fontSize = 32;
      content = 'THE CINEMATIC TITLE';
      color = '#ffffff';
      fontWeight = '700';
    } else if (styleType === 'playfair') {
      name = 'Playfair Coral';
      fontFamily = 'Playfair Display';
      fontSize = 30;
      content = 'Editorial Title Style';
      color = '#fca5a5';
      fontWeight = '600';
      fontStyle = 'italic';
    } else if (styleType === 'satisfy') {
      name = 'Satisfy Script';
      fontFamily = 'Satisfy';
      fontSize = 34;
      content = 'Handwritten Signature';
      color = '#fb7185';
    } else if (styleType === 'standard') {
      name = 'Standard Clean';
      fontFamily = 'Inter';
      fontSize = 24;
      content = 'Simple Text';
      color = '#ffffff';
      fontWeight = '500';
    } else if (styleType === 'sub') {
      name = 'Outfit Subtitle';
      fontFamily = 'Outfit';
      fontSize = 20;
      content = 'Dialogue text goes here...';
      color = '#10b981';
      fontWeight = '600';
    } else if (styleType === 'space') {
      name = 'Space Grotesk Tech';
      fontFamily = 'Space Grotesk';
      fontSize = 22;
      content = 'SYSTEM_ACTIVE_';
      color = '#38bdf8';
      fontWeight = '700';
    } else if (styleType === 'impact') {
      name = 'Impact Bold Red';
      fontFamily = 'Impact';
      fontSize = 42;
      content = 'CRITICAL ALERT';
      color = '#ef4444';
      fontWeight = '900';
    } else if (styleType === 'georgia') {
      name = 'Georgia Classic';
      fontFamily = 'Georgia';
      fontSize = 26;
      content = 'Classic warm serif...';
      color = '#fef08a';
    } else if (styleType === 'courier') {
      name = 'Courier Typewriter';
      fontFamily = 'Courier New';
      fontSize = 22;
      content = 'SYS_RUNNING_OK';
      color = '#22c55e';
      fontWeight = '700';
    }

    const newTextClip = {
      id: clipId,
      type: 'text' as const,
      name,
      durationMs: 4000,
      trimStartMs: 0,
      trimEndMs: 4000,
      positionMs: useEditorStore.getState().currentTime,
      trackId: textTrack.id,
      textSettings: {
        content,
        color,
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        x: 0.5,
        y: 0.5,
        scale: 1.0
      }
    };

    await addClip(textTrack.id, newTextClip);
    setSelectedClipId(clipId);
  };

  const handleAddSticker = async (emoji: string) => {
    const textTrack = project?.tracks.find(t => t.type === 'text');
    if (!textTrack || !project) return;

    const clipId = Math.random().toString(36).substring(2, 9);
    const newTextClip = {
      id: clipId,
      type: 'text' as const,
      name: `Sticker (${emoji})`,
      durationMs: 4000,
      trimStartMs: 0,
      trimEndMs: 4000,
      positionMs: useEditorStore.getState().currentTime,
      textSettings: {
        content: emoji,
        color: '#ffffff',
        fontSize: 48,
        fontFamily: 'Inter',
        x: 0.5,
        y: 0.5,
        scale: 1.0
      }
    };
    await addClip(textTrack.id, newTextClip);
    setSelectedClipId(clipId);
  };

  const handleAddShape = async (shapeType: 'circle' | 'rectangle' | 'triangle' | 'arrow' | 'star') => {
    let videoTrack = project?.tracks.find(t => t.type === 'video');
    if (!project) return;
    if (!videoTrack) {
      await addTrack('video');
      const updated = useEditorStore.getState().project;
      videoTrack = updated?.tracks.find(t => t.type === 'video');
    }
    if (!videoTrack) return;

    const clipId = Math.random().toString(36).substring(2, 9);
    const newShapeClip = {
      id: clipId,
      type: 'image' as const,
      name: `Shape (${shapeType})`,
      assetId: `shape_${shapeType}`,
      durationMs: 4000,
      trimStartMs: 0,
      trimEndMs: 4000,
      positionMs: useEditorStore.getState().currentTime,
      shapeSettings: {
        type: shapeType,
        color: '#8b5cf6', // default violet color
        strokeColor: '#ffffff',
        strokeWidth: 3,
        width: 300,
        height: 300
      },
      transform: {
        scale: 40,
        x: 0,
        y: 0,
        rotation: 0,
        uniformScale: true,
        blendMode: 'normal'
      }
    };
    await addClip(videoTrack.id, newShapeClip);
    setSelectedClipId(clipId);
  };

  const handleApplyTransition = (type: string) => {
    if (!selectedClipId) {
      alert('Please select a video clip on the timeline first to apply transition.');
      return;
    }
    if (type === 'clear') {
      updateClip(selectedClipId, { transitionType: 'none', fadeInMs: 0, transitionIn: undefined });
    } else {
      updateClip(selectedClipId, {
        transitionType: type,
        fadeInMs: 1000,
        transitionIn: { type, durationMs: 1000, easing: 'ease-in-out' }
      });
    }
  };

  const handleApplyEffect = async (effectId: string, intensity: number) => {
    if (!project) return;

    if (selectedClipId) {
      const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
      if (clip && clip.type !== 'audio') {
        const existing = clip.videoEffects || [];
        const alreadyApplied = existing.findIndex(e => e.id === effectId);
        let newEffects;
        if (alreadyApplied >= 0) {
          newEffects = existing.map((e, i) => i === alreadyApplied ? { ...e, intensity } : e);
        } else {
          newEffects = [...existing, { id: effectId, intensity }];
        }
        updateClip(selectedClipId, { videoEffects: newEffects });
        return;
      }
    }

    let effectTrack = project.tracks.find(t => t.type === 'effect');
    if (!effectTrack) {
      await addTrack('effect');
      effectTrack = useEditorStore.getState().project?.tracks.find(t => t.type === 'effect');
    }
    if (!effectTrack) return;

    const def = EFFECTS_REGISTRY[effectId];
    const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;
    const newEffectClip = {
      id: clipId,
      type: 'effect' as const,
      name: def?.name || 'Effect',
      durationMs: 3000,
      trimStartMs: 0,
      trimEndMs: 0,
      positionMs: useEditorStore.getState().currentTime,
      trackId: effectTrack.id,
      videoEffects: [{ id: effectId, intensity }]
    };
    await addClip(effectTrack.id, newEffectClip);
    useEditorStore.setState({ selectedClipId: clipId });
  };

  const handleRemoveEffect = (effectId: string) => {
    if (!selectedClipId) return;
    const clip = project?.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
    if (!clip) return;
    const newEffects = (clip.videoEffects || []).filter(e => e.id !== effectId);
    updateClip(selectedClipId, { videoEffects: newEffects });
  };

  const handleApplyFilter = async (type: string) => {
    if (!project) return;

    if (selectedClipId) {
      const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
      if (clip && clip.type !== 'audio') {
        updateClip(selectedClipId, {
          filterSettings: {
            type,
            intensity: 80
          }
        });
        return;
      }
    }

    let effectTrack = project.tracks.find(t => t.type === 'effect');
    if (!effectTrack) {
      await addTrack('effect');
      effectTrack = useEditorStore.getState().project?.tracks.find(t => t.type === 'effect');
    }
    if (!effectTrack) return;

    const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;
    const newFilterClip = {
      id: clipId,
      type: 'effect' as const,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      durationMs: 3000,
      trimStartMs: 0,
      trimEndMs: 0,
      positionMs: useEditorStore.getState().currentTime,
      trackId: effectTrack.id,
      filterSettings: {
        type,
        intensity: 80
      }
    };
    await addClip(effectTrack.id, newFilterClip);
    useEditorStore.setState({ selectedClipId: clipId });
  };



  return (
    <div 
      className="flex flex-col h-full bg-[#18181c] border-r border-[#2c2c32] text-gray-200 overflow-hidden select-none"
      style={{ 
        width: window.innerWidth < 1024 ? '100%' : width, 
        display: width === 0 ? 'none' : 'flex' 
      }}
    >
      
      {/* Tab Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Media Library Tab */}
        {activeTab === 'media' && (
          <MediaPanel
            activeTab={activeTab}
            selectedClipId={selectedClipId}
            setSelectedClipId={setSelectedClipId}
          />
        )}

        {/* Audio Soundtrack Tab */}
        {activeTab === 'audio' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32] flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">AI Background Audio</h3>
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
              
              {/* Custom Generator Form */}
              <div className="p-3 bg-[#121214] border border-[#2c2c32] rounded-lg space-y-3">
                <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">AI Custom Beat Maker</p>
                
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Music Mood Style</label>
                  <select
                    value={aiMood}
                    onChange={(e) => setAiMood(e.target.value as any)}
                    className="w-full rounded border border-[#2c2c32] bg-[#1e1e22] px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="chill">Lo-Fi Chill (Melodic & Ambient)</option>
                    <option value="tech">Techno Club Beat (Minimal & Bass)</option>
                    <option value="epic">Epic Synthwave (Retro & Uptempo)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Tempo (BPM)</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{aiBpm} BPM</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={180}
                    value={aiBpm}
                    onChange={(e) => setAiBpm(Number(e.target.value))}
                    className="w-full h-1 bg-[#1e1e22] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Length</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{aiDuration}s</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={aiDuration}
                    onChange={(e) => setAiDuration(Number(e.target.value))}
                    className="w-full h-1 bg-[#1e1e22] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                  />
                </div>

                <button
                  disabled={isGeneratingSoundtrack}
                  onClick={async () => {
                    if (!project) return;
                    setIsGeneratingSoundtrack(true);
                    try {
                      const soundBlob = await generateAISoundtrack(aiBpm, aiMood, aiDuration);
                      
                      const assetId = `ai-audio-${Math.random().toString(36).substr(2, 9)}`;
                      const opfsPath = `${project.id}/${assetId}.wav`;
                      await saveFileToOPFS(opfsPath, soundBlob);

                      const newAsset = {
                        id: assetId,
                        projectId: project.id,
                        name: `AI Beat (${aiMood.toUpperCase()} - ${aiBpm} BPM)`,
                        size: soundBlob.size,
                        type: 'audio',
                        durationMs: aiDuration * 1000,
                        opfsPath,
                        createdAt: new Date()
                      };

                      await db.assets.add(newAsset);

                      let audioTrack = project.tracks.find(t => t.type === 'audio');
                      if (!audioTrack) {
                        await addTrack('audio');
                        const updatedProj = useEditorStore.getState().project;
                        audioTrack = updatedProj?.tracks.find(t => t.type === 'audio');
                      }

                      if (audioTrack) {
                        const clipId = `clip-${Math.random().toString(36).substr(2, 9)}`;
                        await addClip(audioTrack.id, {
                          id: clipId,
                          type: 'audio',
                          name: newAsset.name,
                          durationMs: aiDuration * 1000,
                          trimStartMs: 0,
                          trimEndMs: aiDuration * 1000,
                          positionMs: useEditorStore.getState().currentTime,
                          volume: 75
                        });
                        alert("AI Soundtrack generated and successfully added to the timeline audio track!");
                      }
                    } catch (e: any) {
                      console.error(e);
                      alert("Failed to generate AI Soundtrack: " + e.message);
                    } finally {
                      setIsGeneratingSoundtrack(false);
                    }
                  }}
                  className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold rounded text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isGeneratingSoundtrack ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Synthesizing track...
                    </>
                  ) : (
                    <>
                      <Music className="w-3.5 h-3.5" />
                      Synthesize AI Music
                    </>
                  )}
                </button>
              </div>

              {/* Ready presets */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">AI Preset Beats</p>
                {[
                  { name: 'Vlog Beat (Upbeat)', mood: 'tech' as const, bpm: 125, dur: 45 },
                  { name: 'Synthwave Cruise (Retro)', mood: 'epic' as const, bpm: 110, dur: 60 },
                  { name: 'Lo-Fi Chill (Ambient)', mood: 'chill' as const, bpm: 80, dur: 45 },
                ].map((sound, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-[#121214] border border-[#2c2c32] rounded hover:border-[#38bdf8] transition text-xs"
                  >
                    <div>
                      <p className="font-semibold text-gray-200">{sound.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{sound.bpm} BPM • {sound.dur}s</p>
                    </div>
                    <button
                      disabled={isGeneratingSoundtrack}
                      onClick={async () => {
                        if (!project) return;
                        setIsGeneratingSoundtrack(true);
                        try {
                          const soundBlob = await generateAISoundtrack(sound.bpm, sound.mood, sound.dur);
                          
                          const assetId = `ai-preset-${Math.random().toString(36).substr(2, 9)}`;
                          const opfsPath = `${project.id}/${assetId}.wav`;
                          await saveFileToOPFS(opfsPath, soundBlob);

                          const newAsset = {
                            id: assetId,
                            projectId: project.id,
                            name: sound.name,
                            size: soundBlob.size,
                            type: 'audio',
                            durationMs: sound.dur * 1000,
                            opfsPath,
                            createdAt: new Date()
                          };

                          await db.assets.add(newAsset);

                          let audioTrack = project.tracks.find(t => t.type === 'audio');
                          if (!audioTrack) {
                            await addTrack('audio');
                            const updatedProj = useEditorStore.getState().project;
                            audioTrack = updatedProj?.tracks.find(t => t.type === 'audio');
                          }

                          if (audioTrack) {
                            const clipId = `clip-${Math.random().toString(36).substr(2, 9)}`;
                            await addClip(audioTrack.id, {
                              id: clipId,
                              type: 'audio',
                              name: newAsset.name,
                              durationMs: sound.dur * 1000,
                              trimStartMs: 0,
                              trimEndMs: sound.dur * 1000,
                              positionMs: useEditorStore.getState().currentTime,
                              volume: 70
                            });
                            alert(`Preset "${sound.name}" synthesized and added to timeline!`);
                          }
                        } catch (e: any) {
                          console.error(e);
                          alert("Failed to synthesize preset beat: " + e.message);
                        } finally {
                          setIsGeneratingSoundtrack(false);
                        }
                      }}
                      className="p-1 bg-[#1e1e22] border border-[#2c2c32] text-sky-400 hover:text-sky-300 rounded transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Text Layouts Tab */}
        {activeTab === 'text' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Typography Presets</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
              {[
                {
                  categoryName: 'High Energy & Display',
                  presets: [
                    { type: 'tiktok', title: 'TikTok Montserrat', desc: 'Bold uppercase title', previewText: 'TRENDING CLIPS', fontFamily: 'Montserrat', color: '#fcd34d', weight: '900', transform: 'uppercase', previewSize: '11px' },
                    { type: 'bebas', title: 'Bebas Cinematic', desc: 'Sleek headline title', previewText: 'CINEMATIC HEADER', fontFamily: 'Bebas Neue', color: '#fbbf24', previewSize: '15px' },
                    { type: 'syne', title: 'Creative Lab', desc: 'Artistic expanded text', previewText: 'CREATIVE LAB', fontFamily: 'Syne', color: '#c084fc', weight: '800', previewSize: '11px' },
                    { type: 'impact', title: 'Impact Alert', desc: 'Retro bold red header', previewText: 'CRITICAL ALERT', fontFamily: 'Impact', color: '#ef4444', previewSize: '11px' }
                  ]
                },
                {
                  categoryName: 'Classic & Elegant',
                  presets: [
                    { type: 'cinematic', title: 'Cinzel Serif', desc: 'Luxurious Roman text', previewText: 'THE CINEMATIC TITLE', fontFamily: 'Cinzel', color: '#ffffff', weight: '700', previewSize: '11px', spacing: '1px' },
                    { type: 'playfair', title: 'Playfair Coral', desc: 'Magazine layout style', previewText: 'Editorial Style', fontFamily: 'Playfair Display', color: '#fca5a5', weight: '600', previewSize: '12px' },
                    { type: 'satisfy', title: 'Satisfy Signature', desc: 'Fluid signature script', previewText: 'Signature style', fontFamily: 'Satisfy', color: '#fb7185', previewSize: '13px' },
                    { type: 'georgia', title: 'Georgia Classic', desc: 'Classic warm body serif', previewText: 'Warm Serif style', fontFamily: 'Georgia', color: '#fef08a', previewSize: '11px' }
                  ]
                },
                {
                  categoryName: 'Clean & Tech',
                  presets: [
                    { type: 'standard', title: 'Standard Clean', desc: 'Minimalist clean Inter', previewText: 'Simple Text', fontFamily: 'Inter', color: '#ffffff', weight: '500', previewSize: '12px' },
                    { type: 'sub', title: 'Outfit Subtitle', desc: 'Clean emerald captions', previewText: 'Dialogue caption...', fontFamily: 'Outfit', color: '#10b981', weight: '600', previewSize: '10px' },
                    { type: 'space', title: 'Space Tech', desc: 'Technical monospace', previewText: 'SYSTEM_ACTIVE_', fontFamily: 'Space Grotesk', color: '#38bdf8', weight: '700', previewSize: '11px', spacing: '-0.5px' },
                    { type: 'courier', title: 'Courier Typewriter', desc: 'Green console monospace', previewText: 'SYS_RUNNING_OK', fontFamily: 'Courier New', color: '#22c55e', weight: '700', previewSize: '11px' }
                  ]
                }
              ].map(category => (
                <div key={category.categoryName} className="space-y-2">
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider px-1">{category.categoryName}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {category.presets.map((preset: any) => (
                      <button
                        key={preset.type}
                        onClick={() => handleAddTextPreset(preset.type)}
                        className="w-full text-left p-2 bg-[#0e0e10]/60 border border-[#2c2c32] hover:border-sky-500 rounded-lg transition hover:bg-[#121214] flex flex-col justify-between"
                      >
                        <div>
                          <p className="text-[10px] font-semibold text-gray-200 truncate">{preset.title}</p>
                          <p className="text-[8px] text-gray-500 mt-0.5 truncate">{preset.desc}</p>
                        </div>
                        {/* Visual Styled Font Preview Card */}
                        <div className="h-9 w-full mt-1.5 bg-[#121214] rounded border border-[#2c2c32]/50 flex items-center justify-center overflow-hidden px-1">
                          <span style={{
                            fontFamily: preset.fontFamily,
                            color: preset.color,
                            fontSize: preset.previewSize,
                            fontWeight: preset.weight as any,
                            letterSpacing: preset.spacing || 'normal',
                            textTransform: preset.transform as any
                          }} className="truncate">
                            {preset.previewText}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stickers Tab */}
        {activeTab === 'stickers' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32] flex flex-col gap-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Stickers & Elements</h3>
              {/* Sub-tab switcher */}
              <div className="flex bg-[#121214] border border-[#2c2c32] rounded p-0.5 text-[9px] font-bold">
                <button
                  onClick={() => setStickerMode('emoji')}
                  className={`flex-1 py-1 rounded transition text-center cursor-pointer ${stickerMode === 'emoji' ? 'bg-zinc-800 text-sky-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Emojis
                </button>
                <button
                  onClick={() => setStickerMode('shape')}
                  className={`flex-1 py-1 rounded transition text-center cursor-pointer ${stickerMode === 'shape' ? 'bg-zinc-800 text-sky-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Shapes
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {stickerMode === 'emoji' ? (
                <div className="grid grid-cols-4 gap-2">
                  {['❤️', '🔥', '✨', '😂', '👍', '🎉', '🚀', '💡', '🎬', '📱', '❌', '✅', '💥', '👀', '⭐', '🎈', '❤️‍🔥', '🤯', '😭', '⚡'].map(emoji => (
                    <button
                      key={emoji}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/cap-emoji', emoji);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => handleAddSticker(emoji)}
                      className="flex items-center justify-center h-12 hover:scale-110 transition bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded text-2xl cursor-pointer"
                      title="Click or Drag to Timeline"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    {
                      type: 'circle' as const,
                      name: 'Circle',
                      svg: <svg viewBox="0 0 100 100" className="w-7 h-7 fill-sky-500"><circle cx="50" cy="50" r="38" /></svg>
                    },
                    {
                      type: 'rectangle' as const,
                      name: 'Rectangle',
                      svg: <svg viewBox="0 0 100 100" className="w-7 h-7 fill-sky-500"><rect x="15" y="25" width="70" height="50" rx="5" /></svg>
                    },
                    {
                      type: 'triangle' as const,
                      name: 'Triangle',
                      svg: <svg viewBox="0 0 100 100" className="w-7 h-7 fill-sky-500"><polygon points="50,15 15,82 85,82" /></svg>
                    },
                    {
                      type: 'arrow' as const,
                      name: 'Arrow',
                      svg: <svg viewBox="0 0 100 100" className="w-7 h-7 fill-sky-500"><polygon points="10,38 58,38 58,20 90,50 58,80 58,62 10,62" /></svg>
                    },
                    {
                      type: 'star' as const,
                      name: 'Star',
                      svg: <svg viewBox="0 0 100 100" className="w-7 h-7 fill-sky-500"><polygon points="50,10 63,38 93,38 69,56 78,86 50,68 22,86 31,56 7,38 37,38" /></svg>
                    }
                  ].map(shape => (
                    <button
                      key={shape.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/cap-shape', shape.type);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => handleAddShape(shape.type)}
                      className="flex flex-col gap-1.5 items-center justify-center p-3 hover:border-sky-500 bg-[#121214] border border-[#2c2c32] rounded transition cursor-pointer hover:bg-[#1a1a20]"
                      title="Click or Drag to Timeline"
                    >
                      {shape.svg}
                      <span className="text-[9px] text-gray-400 font-semibold">{shape.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Effects Tab - Full premium redesign */}
        {activeTab === 'effects' && (
          <EffectsPanel
            selectedClipId={selectedClipId}
            project={project}
            handleApplyEffect={handleApplyEffect}
            handleRemoveEffect={handleRemoveEffect}
            updateClip={updateClip}
          />
        )}

        {/* Transitions Tab - Full premium redesign */}
        {activeTab === 'transitions' && (
          <TransitionsPanel
            selectedClipId={selectedClipId}
            project={project}
            handleApplyTransition={handleApplyTransition}
            updateClip={updateClip}
          />
        )}

        {/* Captions Tab */}
        {activeTab === 'captions' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Auto-Captions</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase">Language</label>
                <select className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none transition">
                  <option value="en-US">English (United States)</option>
                  <option value="es-ES">Spanish (Spain)</option>
                  <option value="fr-FR">French (France)</option>
                </select>
              </div>

              {isGeneratingCaptions ? (
                <div className="space-y-2 text-center p-4 bg-[#121214] rounded-lg border border-[#2c2c32]">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                    <span className="text-xs text-zinc-300">{captionsStage}</span>
                  </div>
                  <div className="w-full bg-[#1e1e22] h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${captionsProgress}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">{captionsProgress}% complete</span>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    if (!project) return;
                    setIsGeneratingCaptions(true);
                    setCaptionsProgress(0);
                    setCaptionsStage('Preparing audio track...');

                    try {
                      const { generateAutoCaptions } = await import('../../lib/captions-generator');
                      const segments = await generateAutoCaptions(project, (stage, percent) => {
                        setCaptionsStage(stage);
                        setCaptionsProgress(percent);
                      });

                      let textTrack = project.tracks.find(t => t.type === 'text');
                      if (!textTrack) {
                        await addTrack('text');
                        const updatedProj = useEditorStore.getState().project;
                        textTrack = updatedProj?.tracks.find(t => t.type === 'text');
                      }

                      if (!textTrack) {
                        alert('Could not add a text track for subtitles.');
                        setIsGeneratingCaptions(false);
                        return;
                      }

                      for (const seg of segments) {
                        const clipId = Math.random().toString(36).substring(2, 9);
                        await addClip(textTrack.id, {
                          id: clipId,
                          type: 'text',
                          name: seg.text,
                          durationMs: seg.endMs - seg.startMs,
                          trimStartMs: 0,
                          trimEndMs: seg.endMs - seg.startMs,
                          positionMs: seg.startMs,
                          textSettings: {
                            content: seg.text,
                            color: '#ffffff',
                            fontSize: 22,
                            fontFamily: 'Inter',
                            x: 0.5,
                            y: 0.8,
                            scale: 1,
                            strokeColor: '#000000',
                            strokeWidth: 4,
                            shadowColor: 'rgba(0,0,0,0.6)',
                            shadowBlur: 4,
                            shadowOffsetX: 2,
                            shadowOffsetY: 2
                          }
                        });
                      }

                      setCaptionsProgress(100);
                      setTimeout(() => {
                        setIsGeneratingCaptions(false);
                        alert(`Successfully generated ${segments.length} subtitles directly on the Text Track!`);
                      }, 500);
                    } catch (err: any) {
                      console.error(err);
                      alert(err.message || 'Failed to generate captions.');
                      setIsGeneratingCaptions(false);
                    }
                  }}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs transition shadow-lg shadow-sky-600/10 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-200" />
                  Generate Captions
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters Tab */}
        {activeTab === 'filters' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Filters</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                {[
                  { id: 'none', name: 'None' },
                  { id: 'cinematic', name: 'Cinematic' },
                  { id: 'sunset', name: 'Sunset Glow' },
                  { id: 'nordic', name: 'Cold Nordic' },
                  { id: 'neon', name: 'Cyber Retro' },
                  { id: 'emerald', name: 'Emerald Film' },
                  { id: 'fade', name: 'Vintage Fade' },
                  { id: 'drama', name: 'High Drama' },
                  { id: 'bw', name: 'Noir B&W' },
                  { id: 'vintage', name: 'Vintage' },
                  { id: 'warm', name: 'Golden' },
                  { id: 'cool', name: 'Teal Cool' },
                  { id: 'cyberpunk', name: 'Cyberpunk' },
                  { id: 'sepia', name: 'Sepia' },
                  { id: 'pastel', name: 'Dreamy Pastel' },
                  { id: 'forest', name: 'Forest Green' },
                  { id: 'polaroid', name: 'Polaroid Film' },
                  { id: 'vaporwave', name: 'Vaporwave' }
                ].map(filter => {
                  const isApplied = activeFilter === filter.id;
                  return (
                    <div
                      key={filter.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/cap-filter-id', filter.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => handleApplyFilter(filter.id)}
                      className={`relative rounded-lg overflow-hidden cursor-pointer border text-left transition-all duration-200 ${isApplied ? 'border-sky-500 shadow-lg shadow-sky-500/20' : 'border-[#2c2c32] hover:border-sky-400/60'}`}
                    >
                      {/* Preview Thumbnail */}
                      <div className="h-14 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                        <div className="w-full h-full" style={getFilterPreviewStyle(filter.id)}>
                          <img src={heroImg} className="w-full h-full object-cover" alt={filter.name} />
                        </div>
                        {isApplied && (
                          <div className="absolute top-1 right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center shadow z-10">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      {/* Label */}
                      <div className="px-1.5 py-1 bg-[#121214]">
                        <p className="text-[10px] font-semibold text-gray-200 truncate">{filter.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Adjustment Tab */}
        {activeTab === 'adjustment' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Color Adjustment Presets</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {[
                { id: 'bright', name: 'High Brightness', desc: 'Boosts brightness for dark clips' },
                { id: 'high-contrast', name: 'Punchy Contrast', desc: 'Deepens contrast and shadows' },
                { id: 'saturated', name: 'Vibrant Colors', desc: 'Saturates primary colors' },
                { id: 'warm-look', name: 'Warm Sunset', desc: 'Shift temperature to warmer tones' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => {
                    if (!selectedClipId) {
                      alert('Please select a video clip on the timeline first.');
                      return;
                    }
                    if (preset.id === 'bright') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 130, contrast: 100, saturation: 100, temp: 0, vignette: 0 } });
                    } else if (preset.id === 'high-contrast') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 130, saturation: 105, temp: 0, vignette: 0 } });
                    } else if (preset.id === 'saturated') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 100, saturation: 140, temp: 0, vignette: 0 } });
                    } else if (preset.id === 'warm-look') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 100, saturation: 100, temp: 25, vignette: 0 } });
                    }
                  }}
                  className="w-full text-left p-2.5 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded-lg transition"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <div>
                      <p className="text-xs font-semibold text-gray-200">{preset.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{preset.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}



        {/* History / Version Control Tab */}
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32] flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Version History</h3>
              <Timer className="w-3.5 h-3.5 text-sky-400" />
            </div>

            <div className="p-3 bg-[#121214] border-b border-[#2c2c32] space-y-2.5">
              <p className="text-[10px] text-zinc-400 leading-normal">
                Take a local database snapshot of your timeline layout to easily roll back edits later.
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Snapshot label (e.g. Rough Cut)..."
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  className="flex-1 rounded border border-[#2c2c32] bg-[#1e1e22] px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
                <button
                  disabled={isTakingSnapshot || !snapshotLabel.trim()}
                  onClick={async () => {
                    setIsTakingSnapshot(true);
                    try {
                      await createSnapshot(snapshotLabel.trim());
                      setSnapshotLabel('');
                      alert("Snapshot saved successfully!");
                    } catch (e: any) {
                      alert("Error taking snapshot: " + e.message);
                    } finally {
                      setIsTakingSnapshot(false);
                    }
                  }}
                  className="px-3 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold rounded text-xs transition flex items-center justify-center cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-0.5">Saved Snapshots</p>
              {snapshots.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-[#2c2c32] rounded text-zinc-600 text-xs">
                  No saved snapshots yet.
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-2.5 bg-[#121214] border border-[#2c2c32] rounded-lg hover:border-[#3b82f6]/40 transition text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-200">{snap.label}</p>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                          {new Date(snap.createdAt).toLocaleTimeString()} - {new Date(snap.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm("Delete this snapshot permanently?")) {
                            await deleteSnapshot(snap.id);
                          }
                        }}
                        className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-950 transition cursor-pointer"
                        title="Delete snapshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm(`Are you sure you want to restore "${snap.label}"? Your current timeline will be replaced.`)) {
                          await restoreSnapshot(snap.id);
                          alert(`Restored to "${snap.label}"!`);
                        }
                      }}
                      className="w-full py-1 bg-[#1e1e22] hover:bg-sky-950 border border-[#2c2c32] hover:border-sky-800 text-sky-400 hover:text-sky-300 font-medium rounded text-[10px] transition cursor-pointer"
                    >
                      Restore Snapshot
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const getFilterPreviewStyle = (filterId: string) => {
  switch (filterId) {
    case 'sunset':
      return { filter: 'saturate(140%) brightness(105%) sepia(30%) hue-rotate(-10deg) contrast(105%)' };
    case 'nordic':
      return { filter: 'hue-rotate(185deg) saturate(75%) contrast(110%) brightness(95%)' };
    case 'neon':
      return { filter: 'hue-rotate(280deg) saturate(140%) contrast(115%)' };
    case 'emerald':
      return { filter: 'hue-rotate(85deg) saturate(85%) contrast(95%) sepia(20%)' };
    case 'fade':
      return { filter: 'contrast(75%) saturate(85%) brightness(110%) sepia(10%)' };
    case 'drama':
      return { filter: 'contrast(135%) saturate(60%) brightness(90%)' };
    case 'bw':
      return { filter: 'grayscale(100%)' };
    case 'sepia':
      return { filter: 'sepia(100%)' };
    case 'vintage':
      return { filter: 'sepia(40%) hue-rotate(30deg) contrast(80%)' };
    case 'warm':
      return { filter: 'sepia(30%) saturate(120%)' };
    case 'cool':
      return { filter: 'hue-rotate(190deg) saturate(110%)' };
    case 'cyberpunk':
      return { filter: 'hue-rotate(300deg) contrast(1.1) saturate(150%)' };
    case 'cinematic':
      return { filter: 'contrast(120%) saturate(90%)' };
    case 'pastel':
      return { filter: 'sepia(25%) saturate(130%) hue-rotate(-15deg) contrast(95%)' };
    case 'forest':
      return { filter: 'hue-rotate(60deg) saturate(110%) contrast(115%)' };
    case 'polaroid':
      return { filter: 'contrast(85%) saturate(85%) sepia(15%) brightness(105%)' };
    case 'vaporwave':
      return { filter: 'hue-rotate(270deg) saturate(160%) contrast(110%)' };
    default:
      return {};
  }
};
