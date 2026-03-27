import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { shaders, vertexShader } from "./shaders";

interface Props {
  shaderIndex: number;
  isPlaying: boolean;
  customFragment?: string;
}

const ShaderQuad = ({ shaderIndex, isPlaying, customFragment }: Props) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const timeRef = useRef(0);

  const fragment = customFragment ?? shaders[shaderIndex].fragmentShader;
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [shaderIndex, customFragment]);

  useFrame((_, delta) => {
    if (isPlaying) {
      timeRef.current += delta;
    }
    materialRef.current.uniforms.uTime.value = timeRef.current;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        key={customFragment ? "custom" : shaderIndex}
        vertexShader={vertexShader}
        fragmentShader={fragment}
        uniforms={uniforms}
      />
    </mesh>
  );
};

export const ShaderVisualizer = ({ shaderIndex, isPlaying, customFragment }: Props) => {
  return (
    <div className="fixed inset-0">
      <Canvas flat dpr={1}>
        <ShaderQuad
          shaderIndex={shaderIndex}
          isPlaying={isPlaying}
          customFragment={customFragment}
        />
      </Canvas>
    </div>
  );
};
