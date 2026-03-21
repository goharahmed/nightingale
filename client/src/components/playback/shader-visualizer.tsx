import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { shaders, vertexShader } from "./shaders";

function ShaderQuad({ shaderIndex }: { shaderIndex: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 } }),
    [shaderIndex],
  );

  useFrame(({ clock }) => {
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        key={shaderIndex}
        vertexShader={vertexShader}
        fragmentShader={shaders[shaderIndex].fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export function ShaderVisualizer() {
  const [shaderIndex, setShaderIndex] = useState(0);

  const cycleShader = useCallback(() => {
    setShaderIndex((prev) => (prev + 1) % shaders.length);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        cycleShader();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleShader]);

  return (
    <div className="fixed inset-0">
      <Canvas flat>
        <ShaderQuad shaderIndex={shaderIndex} />
      </Canvas>
    </div>
  );
}
