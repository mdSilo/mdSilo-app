import React, { useCallback, useEffect, useRef } from 'react';
import markmap  from './view';
import { parse, transform } from './parser';
import './mindmap.css';

type Props = {
  mdValue: string;
  className?: string;
};

export function Mindmap(props: Props) {
  const { mdValue, className = '' } = props;
  
  const svgRef = useRef<SVGSVGElement | null>(null);

  const renderSVG = useCallback(() => {
    if (!svgRef.current || !mdValue.trim()) {
      return;
    }

    const data = transform(parse(mdValue, {}));
    markmap(svgRef.current, data, {
      preset: 'colorful', // or default
      linkShape: 'diagonal' // or bracket
    });
  }, [mdValue]);

  useEffect(() => {
    if (!svgRef.current) { return; }

    renderSVG();
  }, [renderSVG]);

  return (
    <div className={`w-full h-full ${className}`}>
      <svg
        id= "mindmap"
        data-testid="mindmap-svg"
        ref={svgRef}
        className="w-full h-full bg-slate-100"
      />
    </div>
  );
}

