import { useCallback, useEffect, useState } from "react";
import { shaders } from "./shaders";
import { ShaderVisualizer } from "./shader-visualizer";

const FLAVORS = ['nature', 'underwater', 'space', 'city', 'countryside'];

export const Background = () => {
  const [shaderIndex, setShaderIndex] = useState(0);
  const [_videoFlavor, setVideoFlavor] = useState(FLAVORS[0]);

  const cycleShader = useCallback(() => {
    setShaderIndex((prev) => (prev + 1) % shaders.length);
  }, []);

  const cycleVideo = useCallback(() => {
    setVideoFlavor((prev) => {
      const flavIndex = FLAVORS.findIndex(flavor => flavor === prev);

      if (flavIndex === (FLAVORS.length - 1)) {
        return FLAVORS[0];
      }

      return FLAVORS[flavIndex + 1];
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        cycleShader();
      }

      if (e.key === "f" || e.key === "F") {
        cycleVideo();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleShader]);

  return (
    <div className="fixed inset-0">
      <ShaderVisualizer shaderIndex={shaderIndex} />
    </div>
  );
}
