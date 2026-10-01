/**
 * Utility to export an SVG element (Gantt Chart, Mindmap, etc.) directly to a high-resolution PNG image file
 */
export function exportSvgToPng(svgEl: SVGElement, filename: string): void {
  try {
    const comp = getComputedStyle(document.body);
    const bgColor = comp.getPropertyValue('--ptf-bg').trim() || '#ffffff';
    const textColor = comp.getPropertyValue('--ptf-text').trim() || '#1a202c';
    const mutedColor = comp.getPropertyValue('--ptf-text-muted').trim() || '#718096';

    const cloned = svgEl.cloneNode(true) as SVGElement;
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Convert any HTML <foreignObject> elements (used by Markmap) to native SVG <text> elements
    // to prevent browser SecurityError / tainted canvas during rasterization
    const foreignObjects = Array.from(cloned.querySelectorAll('foreignObject'));
    foreignObjects.forEach((fo) => {
      const foX = parseFloat(fo.getAttribute('x') || '0');
      const foY = parseFloat(fo.getAttribute('y') || '0');
      const foH = parseFloat(fo.getAttribute('height') || '20');
      const text = (fo.textContent || '').trim();

      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', String(foX));
      textEl.setAttribute('y', String(foY + Math.max(13, foH * 0.72)));
      textEl.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      textEl.setAttribute('font-size', '12px');
      textEl.setAttribute('font-weight', '500');
      textEl.setAttribute('fill', textColor);

      if (text.includes('[↳')) {
        const parts = text.split(/(\[↳[^\]]+\])/g);
        for (const part of parts) {
          if (!part) continue;
          const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.textContent = part;
          if (part.startsWith('[↳ Depends') || part.startsWith('[↳ Depended')) {
            tspan.setAttribute('fill', '#dd6b20');
            tspan.setAttribute('font-size', '11px');
            tspan.setAttribute('font-weight', '600');
          } else if (part.startsWith('[↳ Blocks')) {
            tspan.setAttribute('fill', '#3182ce');
            tspan.setAttribute('font-size', '11px');
            tspan.setAttribute('font-weight', '600');
          }
          textEl.appendChild(tspan);
        }
      } else {
        textEl.textContent = text;
      }

      fo.parentNode?.replaceChild(textEl, fo);
    });

    // Determine dimensions & coordinate bounds
    const rect = svgEl.getBoundingClientRect();
    const explicitW = parseFloat(svgEl.getAttribute('width') || '');
    const explicitH = parseFloat(svgEl.getAttribute('height') || '');

    let width = explicitW || Math.round(rect.width) || 1200;
    let height = explicitH || Math.round(rect.height) || 600;

    let hasViewBox = !!svgEl.getAttribute('viewBox');
    if (!hasViewBox) {
      try {
        const bbox = (svgEl as SVGGraphicsElement).getBBox?.();
        if (bbox && bbox.width > 20 && bbox.height > 20 && !explicitW) {
          const pad = 30;
          const vx = Math.round(bbox.x - pad);
          const vy = Math.round(bbox.y - pad);
          const vw = Math.round(bbox.width + pad * 2);
          const vh = Math.round(bbox.height + pad * 2);
          cloned.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
          width = vw;
          height = vh;
          hasViewBox = true;
        }
      } catch (e) {}
    }

    if (!hasViewBox) {
      cloned.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    cloned.setAttribute('width', String(width));
    cloned.setAttribute('height', String(height));

    // Embed standalone styling for theme colors, bars, arrows, and fonts
    const ptfVars = [
      '--ptf-bg',
      '--ptf-bg-secondary',
      '--ptf-bg-tertiary',
      '--ptf-text',
      '--ptf-text-muted',
      '--ptf-border',
      '--ptf-primary',
      '--ptf-primary-hover',
      '--ptf-success',
      '--ptf-warning',
      '--ptf-info',
      '--ptf-purple',
    ];
    let cssBlock = ':root {';
    for (const v of ptfVars) {
      const val = comp.getPropertyValue(v).trim();
      if (val) cssBlock += `${v}: ${val};`;
    }
    cssBlock += `
      background: ${bgColor};
    }
    text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .ptf-gantt-bar-todo .ptf-gantt-bar { fill: #3182ce !important; }
    .ptf-gantt-bar-doing .ptf-gantt-bar { fill: #dd6b20 !important; }
    .ptf-gantt-bar-waiting .ptf-gantt-bar { fill: #805ad5 !important; }
    .ptf-gantt-bar-done .ptf-gantt-bar { fill: #38a169 !important; opacity: 0.7 !important; }
    .ptf-gantt-bar-overdue .ptf-gantt-bar { stroke: #e53e3e !important; stroke-width: 2px !important; }
    .ptf-gantt-bar-late .ptf-gantt-bar { stroke: #dd6b20 !important; stroke-width: 1.8px !important; }
    .ptf-dep-arrow { fill: none !important; stroke: #dd6b20 !important; stroke-width: 1.8px !important; opacity: 0.85 !important; }
    .ptf-dep-dot { fill: #dd6b20 !important; }
    .markmap-link { fill: none !important; }
    `;

    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = cssBlock;
    cloned.insertBefore(styleEl, cloned.firstChild);

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(cloned);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const triggerDownload = (downloadUrl: string, ext: string) => {
      const a = document.createElement('a');
      a.href = downloadUrl;
      const base = filename.replace(/\.(png|svg)$/i, '');
      a.download = `${base}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2; // Crisp 2x export
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          triggerDownload(url, 'svg');
          return;
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            triggerDownload(URL.createObjectURL(blob), 'svg');
            return;
          }
          const pngUrl = URL.createObjectURL(pngBlob);
          triggerDownload(pngUrl, 'png');
          setTimeout(() => URL.revokeObjectURL(pngUrl), 5000);
        }, 'image/png');
      } catch (canvasErr) {
        console.warn('[ProjectTaskFlow] Canvas rasterization failed, falling back to SVG:', canvasErr);
        URL.revokeObjectURL(url);
        triggerDownload(URL.createObjectURL(blob), 'svg');
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      triggerDownload(URL.createObjectURL(blob), 'svg');
    };

    img.src = url;
  } catch (err) {
    console.error('[ProjectTaskFlow] Error exporting SVG:', err);
  }
}
