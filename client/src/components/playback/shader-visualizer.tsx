import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { shaders, vertexShader } from "./shaders";

interface Props {
  shaderIndex: number;
}

const ShaderQuad = ({ shaderIndex }: Props) => {
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

export const ShaderVisualizer = ({ shaderIndex }: Props) => {
  return (
    <div className="fixed inset-0">
      <Canvas flat dpr={1}>
        <ShaderQuad shaderIndex={shaderIndex} />
      </Canvas>
    </div>
  );
}
