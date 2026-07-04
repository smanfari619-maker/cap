with open("src/components/dashboard/LipSyncTool.tsx", "r") as f:
    content = f.read()

# 1. State
content = content.replace(
    "const [progressStep, setProgressStep] = useState<number>(0);",
    "const [progressStep, setProgressStep] = useState<number>(0);\n  const [progressPercent, setProgressPercent] = useState<number>(0);"
)

# 2. Reset
content = content.replace(
    "setProgressStep(0);\n    const stepsList = getSteps();",
    "setProgressStep(0);\n    setProgressPercent(0);\n    const stepsList = getSteps();"
)

# 3. Interval
old_interval = """
    // Simulate stepping through progress phases to keep UX active
    const stepInterval = setInterval(() => {
      setProgressStep((prev) => {
        if (prev < stepsList.length - 1) {
          setStatusText(stepsList[prev + 1]);
          return prev + 1;
        }
        return prev;
      });
    }, 4500);
"""
new_interval = """
    // Simulate stepping through progress phases to keep UX active
    const stepInterval = setInterval(() => {
      setProgressStep((prev) => {
        if (prev < stepsList.length - 1) {
          setStatusText(stepsList[prev + 1]);
          return prev + 1;
        }
        return prev;
      });
    }, 7500);

    const percentInterval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 98) return 98;
        return prev + 1;
      });
    }, 550);
"""
content = content.replace(old_interval.strip('\n'), new_interval.strip('\n'))

# 4. Clear Interval
content = content.replace("clearInterval(stepInterval);", "clearInterval(stepInterval);\n      clearInterval(percentInterval);")
content = content.replace("setResultVideoUrl(videoUrl);\n      setStatus('success');", "setResultVideoUrl(videoUrl);\n      setProgressPercent(100);\n      setStatus('success');")

# 5. UI
old_ui = """
          {/* Progress Blocks */}
          <div className="flex gap-1 mt-4">
            {activeSteps.map((_, i) => (
              <div 
                key={i} 
                className={`w-3.5 h-1.5 rounded-full transition-all duration-300 ${
                  i < progressStep 
                    ? 'bg-violet-500' 
                    : i === progressStep 
                      ? 'bg-violet-400 animate-pulse' 
                      : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
"""
new_ui = """
          {/* Progress Bar */}
          <div className="w-full max-w-[240px] mt-4">
            <div className="flex justify-between items-center mb-1.5 px-1">
              <span className="text-[10px] text-zinc-400 font-medium">Processing Status</span>
              <span className="text-[10px] text-violet-400 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div 
                className="h-full bg-violet-500 rounded-full transition-all duration-300 ease-out relative"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/20 animate-pulse" />
              </div>
            </div>
          </div>
"""
content = content.replace(old_ui.strip('\n'), new_ui.strip('\n'))

with open("src/components/dashboard/LipSyncTool.tsx", "w") as f:
    f.write(content)
print("Patched completely!")
