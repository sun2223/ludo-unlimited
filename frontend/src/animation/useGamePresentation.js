import { useLayoutEffect, useRef, useState } from 'react';
import { PresentationController } from './PresentationController.js';
export function useGamePresentation(room, connected, onCue) {
  const [frame, setFrame] = useState({ game: room.game, phase: 'idle', moving: null });
  const cueRef = useRef(onCue);
  cueRef.current = onCue;
  const controller = useRef(null);
  if (!controller.current)
    controller.current = new PresentationController({
      onFrame: setFrame,
      onCue: (cue) => cueRef.current?.(cue),
    });
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reset = () => controller.current.receive(room, { live: false });
    controller.current.receive(room, {
      live: connected && !document.hidden,
      reducedMotion: media.matches,
    });
    document.addEventListener('visibilitychange', reset);
    media.addEventListener('change', reset);
    return () => {
      document.removeEventListener('visibilitychange', reset);
      media.removeEventListener('change', reset);
    };
  }, [room, connected]);
  useLayoutEffect(() => () => controller.current.dispose(), []);
  return { ...frame, locked: frame.phase !== 'idle', controller: controller.current };
}
