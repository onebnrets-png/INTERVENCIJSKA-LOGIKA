const TextArea = ({ label, path, value, onUpdate, onGenerate, isLoading, placeholder, rows = 5, generateTitle, missingApiKey, className = "mb-5 w-full group" }) => {
    const enGen = TEXT.en.generating;
    const siGen = TEXT.si.generating;
    const fieldIsLoading = isLoading === `${enGen} ${String(path[path.length - 1])}...` || isLoading === `${siGen} ${String(path[path.length - 1])}...`;
    
    const textAreaRef = useRef(null);
    
    const adjustHeight = () => {
        const el = textAreaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        }
    };
    
    // Adjust on value change
    useEffect(() => {
        adjustHeight();
    }, [value]);

    // Adjust on mount AND after layout is complete
    // Uses requestAnimationFrame to ensure the browser has
    // finished calculating the element's width (especially
    // important inside CSS grid/flex containers) before
    // measuring scrollHeight.
    useEffect(() => {
        adjustHeight();
        // Double-pass: first paint may not have final width yet
        const rafId = requestAnimationFrame(() => {
            adjustHeight();
        });
        return () => cancelAnimationFrame(rafId);
    }, []);

    // Also re-adjust when the window is resized (responsive layout changes width)
    useEffect(() => {
        const handleResize = () => adjustHeight();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className={className}>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
            <div className="relative">
                <textarea
                    ref={textAreaRef}
                    data-path={path.join(',')}
                    value={value || ''}
                    onChange={(e) => onUpdate(path, e.target.value)}
                    onInput={adjustHeight}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 pr-10 resize-none overflow-hidden block text-base leading-relaxed shadow-sm transition-shadow hover:border-slate-400"
                    rows={rows}
                    placeholder={placeholder}
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                     <GenerateButton onClick={() => onGenerate(path)} isLoading={fieldIsLoading} isField title={generateTitle} missingApiKey={missingApiKey} />
                </div>
            </div>
        </div>
    );
};
