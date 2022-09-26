import React, { useCallback, useEffect, useRef, useState } from 'react';
import { writeFile } from 'file/write';
import { normalizeSlash } from 'file/util';
import { saveDilog } from 'file/open';
import markmap  from './view';
import { parse, transform } from './parser';
import './mindmap.css';

type Props = {
  title: string;
  mdValue: string;
  initDir?: string;
  className?: string;
};

export function Mindmap(props: Props) {
  const { title, mdValue, initDir, className = '' } = props;

  const [svgElement, setSvgElement] = useState<SVGAElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const renderSVG = useCallback(() => {
    if (!svgRef.current || !mdValue.trim()) {
      return;
    }

    const data = transform(parse(mdValue, {}));
    const svg: SVGAElement = markmap(svgRef.current, data, {
      preset: 'colorful', // or default
      linkShape: 'diagonal' // or bracket
    });
    setSvgElement(svg);
  }, [mdValue]);

  useEffect(() => {
    if (!svgRef.current) { return; }

    renderSVG();
  }, [renderSVG]);

  const saveSVG = useCallback(async () => {
    if (!svgElement || !initDir) return;
    const styleNode = document.createElement('style');
    styleNode.setAttribute('type', 'text/css');
    styleNode.innerHTML = `svg#mindmap {width: 100%; height: 100%;} .markmap-node-circle {fill: #fff; stroke-width: 1.5px;} .markmap-node-text {fill: #000; font: 10px sans-serif;} .markmap-link {fill: none;}`;
    svgElement.appendChild(styleNode);
    const dir = await saveDilog();
    const saveDir = normalizeSlash(dir);
    // `${initDir}/mindmap/${title.trim().replaceAll(' ', '-') || 'untitle'}.svg`, 
    await writeFile(saveDir, svgElement.outerHTML);
  }, [svgElement, initDir, title]);

  return (
    <div className={`w-full h-full bg-slate-100 ${className}`}>
      <svg
        id= "mindmap"
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
