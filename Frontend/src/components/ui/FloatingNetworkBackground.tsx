import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export function FloatingNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let frameId = 0;
    let animationTime = 0;

    const resize = () => {
      window.cancelAnimationFrame(frameId);
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width);
      const nextHeight = Math.max(1, bounds.height);
      const scaleX = width ? nextWidth / width : 1;
      const scaleY = height ? nextHeight / height : 1;

      if (width && height) {
        particles.forEach((particle) => {
          particle.x *= scaleX;
          particle.y *= scaleY;
        });
      }

      width = nextWidth;
      height = nextHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const desiredCount = Math.max(36, Math.min(180, Math.round((width * height) / 11000)));
      while (particles.length < desiredCount) {
        particles.push({
          x: randomBetween(0, width),
          y: randomBetween(0, height),
          vx: randomBetween(-0.12, 0.12),
          vy: randomBetween(-0.1, 0.1),
          radius: randomBetween(2.2, 3.5),
          phase: randomBetween(0, Math.PI * 2),
        });
      }
      particles.length = desiredCount;
      draw();
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const connectionDistance = Math.min(170, Math.max(115, Math.sqrt(width * height) / 7));

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (!motionPreference.matches) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -8 || particle.x > width + 8) particle.vx *= -1;
          if (particle.y < -8 || particle.y > height + 8) particle.vy *= -1;
        }

        for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex += 1) {
          const other = particles[otherIndex];
          const deltaX = particle.x - other.x;
          const deltaY = particle.y - other.y;
          const distance = Math.hypot(deltaX, deltaY);
          if (distance >= connectionDistance) continue;

          const opacity = (1 - distance / connectionDistance) * 0.24;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(other.x, other.y);
          context.strokeStyle = `rgba(79, 164, 105, ${opacity})`;
          context.lineWidth = 0.8;
          context.stroke();
        }

        const pulse = 0.7 + Math.sin(animationTime + particle.phase) * 0.12;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * pulse, 0, Math.PI * 2);
        context.fillStyle = "rgba(87, 177, 108, 0.62)";
        context.fill();
      }

      if (!motionPreference.matches && !document.hidden) {
        animationTime += 0.018;
        frameId = window.requestAnimationFrame(draw);
      }
    };

    const handleMotionPreference = () => {
      window.cancelAnimationFrame(frameId);
      draw();
    };
    const handleVisibilityChange = () => {
      window.cancelAnimationFrame(frameId);
      if (!document.hidden) draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    motionPreference.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    resize();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      motionPreference.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-screen w-screen"
    />
  );
}
