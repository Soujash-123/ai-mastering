"use client";

import { useEffect, useRef } from "react";

export function NeonWaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);
  const reqRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      const p = canvas.parentElement;
      if (!p) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = p.offsetWidth * dpr;
      canvas.height = p.offsetHeight * dpr;
      canvas.style.width = p.offsetWidth + "px";
      canvas.style.height = p.offsetHeight + "px";
      ctx?.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!canvas || !ctx) return;
      const p = canvas.parentElement;
      if (!p) return;
      
      const pw = p.offsetWidth;
      const ph = p.offsetHeight;
      ctx.clearRect(0, 0, pw, ph);
      const ph2 = phaseRef.current;

      // gradient wave
      ctx.beginPath();
      ctx.lineWidth = 2;
      const g = ctx.createLinearGradient(0, 0, pw, 0);
      g.addColorStop(0, "rgba(34,211,238,0)");
      g.addColorStop(0.15, "rgba(34,211,238,0.8)");
      g.addColorStop(0.5, "rgba(163,230,53,0.8)");
      g.addColorStop(0.85, "rgba(34,211,238,0.8)");
      g.addColorStop(1, "rgba(34,211,238,0)");
      ctx.strokeStyle = g;
      for (let x = 0; x <= pw; x += 1.5) {
        const p2 = x / pw;
        const env = Math.sin(p2 * Math.PI);
        const y =
          ph / 2 +
          Math.sin(p2 * 13 + ph2) * ph * 0.28 * env +
          Math.sin(p2 * 28 + ph2 * 1.5) * ph * 0.09 * env;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // mirror ghost
      ctx.beginPath();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(34,211,238,0.1)";
      for (let x = 0; x <= pw; x += 1.5) {
        const p2 = x / pw;
        const env = Math.sin(p2 * Math.PI);
        const y =
          ph / 2 -
          (Math.sin(p2 * 13 + ph2) * ph * 0.24 * env +
            Math.sin(p2 * 28 + ph2 * 1.5) * ph * 0.07 * env);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // fill glow
      const fg = ctx.createLinearGradient(0, 0, 0, ph);
      fg.addColorStop(0, "rgba(34,211,238,0.06)");
      fg.addColorStop(1, "rgba(34,211,238,0)");
      ctx.beginPath();
      for (let x = 0; x <= pw; x += 1.5) {
        const p2 = x / pw;
        const env = Math.sin(p2 * Math.PI);
        const y =
          ph / 2 +
          Math.sin(p2 * 13 + ph2) * ph * 0.28 * env +
          Math.sin(p2 * 28 + ph2 * 1.5) * ph * 0.09 * env;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(pw, ph);
      ctx.lineTo(0, ph);
      ctx.closePath();
      ctx.fillStyle = fg;
      ctx.fill();

      phaseRef.current += 0.018;
      reqRef.current = requestAnimationFrame(draw);
    }
    
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
