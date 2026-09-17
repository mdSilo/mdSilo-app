import React, { useCallback, useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { writeFile } from 'file/write';
import { normalizeSlash } from 'file/util';
import { saveDilog } from 'file/open';
import './mindmap.css';

type Props = {
  title: string;
  mdValue: string;
  initDir?: string;
  className?: string;
};

export function Mindmap(props: Props) {
  const { title, mdValue, initDir, className = '' } = props;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const markmapRef = useRef<Markmap | null>(null);

  const renderSVG = useCallback(() => {
    if (!svgRef.current || !mdValue.trim()) {
      return;
    }

    const transformer = new Transformer();
    const { root } = transformer.transform(mdValue);
    markmapRef.current?.destroy();
    markmapRef.current = Markmap.create(svgRef.current, {
      id: title,
      embedGlobalCSS: true,
    }, root);
  }, [mdValue, title]);

  useEffect(() => {
    if (!svgRef.current) { return; }

    renderSVG();
    return () => {
      markmapRef.current?.destroy();
      markmapRef.current = null;
    };
  }, [renderSVG]);

  const saveSVG = useCallback(async () => {
    const svgElement = svgRef.current;
    if (!svgElement || !initDir) return;
    const w = svgElement.clientWidth;
    const h = svgElement.clientHeight;
    if (w && h) {
      svgElement.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    svgElement.setAttribute('style', 'background-color:white');
    // prepare to save
    const fname = `${title.trim().replaceAll(' ', '-') || 'untitled'}-mindmap.svg`;
    const dir = await saveDilog(fname);
    const defaultDir = `${initDir}/mindmap/${fname}`;
    const saveDir = normalizeSlash(dir || defaultDir); 
    await writeFile(saveDir, svgElement.outerHTML);
  }, [initDir, title]);

  return (
    <div className={`w-full h-full bg-slate-100 ${className}`}>
      <svg
        id="mindmap"
        ref={svgRef}
        version="1.1" 
        xmlns="http://www.w3.org/2000/svg" 
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="100%" 
      />
      <div className="flex items-center justify-center mt-2">
        <button className="text-xs hover:bg-gray-300 dark:hover:bg-gray-700" onClick={saveSVG}>
          SAVE RAW SVG
        </button>
      </div>
    </div>
  );
}
