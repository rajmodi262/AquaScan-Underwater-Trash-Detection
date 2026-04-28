import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/* ── Enhanced caustic water plane ─────────────────────── */
const causticVertex = `
  varying vec2 vUv;
  varying float vWave;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float wave = sin(pos.x * 2.0 + uTime * 0.8) * 0.35
               + sin(pos.y * 1.5 + uTime * 0.6) * 0.45
               + sin((pos.x + pos.y) * 1.0 + uTime * 1.2) * 0.25
               + sin(pos.x * 3.0 - uTime * 0.5) * 0.15;
    pos.z += wave;
    vWave = wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`
const causticFragment = `
  varying vec2 vUv;
  varying float vWave;
  uniform float uTime;
  void main() {
    vec2 uv = vUv;
    float c1 = sin(uv.x * 30.0 + uTime) * sin(uv.y * 30.0 + uTime * 0.7);
    float c2 = sin(uv.x * 20.0 - uTime * 0.5) * sin(uv.y * 25.0 + uTime * 0.3);
    float caustic = pow(abs(c1), 3.0) * 0.5 + pow(abs(c2), 4.0) * 0.3;
    vec3 deepBlue = vec3(0.008, 0.025, 0.07);
    vec3 midBlue = vec3(0.015, 0.08, 0.2);
    vec3 lightBlue = vec3(0.02, 0.14, 0.3);
    vec3 col = mix(deepBlue, midBlue, caustic + vWave * 0.12 + 0.25);
    col += lightBlue * caustic * 0.5;
    col += vec3(0.0, 0.06, 0.14) * pow(caustic, 2.0);
    gl_FragColor = vec4(col, 1.0);
  }
`

function WaterPlane() {
  const ref = useRef()
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), [])
  useFrame(({ clock }) => { uniforms.uTime.value = clock.getElapsedTime() })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -4, -5]}>
      <planeGeometry args={[80, 80, 128, 128]} />
      <shaderMaterial vertexShader={causticVertex} fragmentShader={causticFragment}
        uniforms={uniforms} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ── Enhanced floating bubbles ─────────────────────────── */
function Bubbles({ count = 80 }) {
  const ref = useRef()
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 50
      arr[i * 3 + 1] = Math.random() * 35 - 17
      arr[i * 3 + 2] = (Math.random() - 0.5) * 35 - 5
    }
    return arr
  }, [count])

  const sizes = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = Math.random() * 4 + 1
    return arr
  }, [count])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const pos = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += 0.01 + Math.sin(t + i) * 0.004
      pos[i * 3]     += Math.sin(t * 0.3 + i * 0.5) * 0.006
      if (pos[i * 3 + 1] > 18) pos[i * 3 + 1] = -17
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-size" array={sizes} count={count} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial size={0.15} color="#22d3ee" transparent opacity={0.4}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ── Floating dust/plankton particles ──────────────────── */
function Particles({ count = 120 }) {
  const ref = useRef()
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 60
      arr[i * 3 + 1] = Math.random() * 30 - 15
      arr[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5
    }
    return arr
  }, [count])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const pos = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += Math.sin(t * 0.2 + i) * 0.002
      pos[i * 3]     += Math.cos(t * 0.15 + i * 0.3) * 0.002
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#0ea5e9" transparent opacity={0.2}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ── God rays (4 light shafts) ─────────────────────────── */
function GodRay({ position, rotation, color = '#0ea5e9', width = 8, height = 30, baseOpacity = 0.06, speed = 0.15, offset = 0 }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.rotation.z = Math.sin(t * speed + offset) * 0.06
    ref.current.material.opacity = baseOpacity + Math.sin(t * (speed * 2.5) + offset) * 0.025
  })
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color={color} transparent opacity={baseOpacity}
        side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

/* ── Fish silhouette (simple geometry swimming horizontally) ── */
function FishSilhouette({ startX = -25, y = 0, z = -8, speed = 0.3, scale = 1 }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.position.x = startX + (t * speed) % 55 - 5
    ref.current.position.y = y + Math.sin(t * 0.5) * 0.5
    ref.current.rotation.z = Math.sin(t * 2) * 0.05
  })
  return (
    <group ref={ref} position={[startX, y, z]} scale={[scale, scale, scale]}>
      {/* Body */}
      <mesh>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshBasicMaterial color="#0c4a6e" transparent opacity={0.2} />
      </mesh>
      {/* Tail */}
      <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
        <coneGeometry args={[0.35, 0.5, 4]} />
        <meshBasicMaterial color="#0c4a6e" transparent opacity={0.15} />
      </mesh>
    </group>
  )
}

/* ── Jellyfish (semi-transparent floating) ──────────────── */
function Jellyfish({ position, speed = 0.2, scale = 1 }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.position.y = position[1] + Math.sin(t * speed) * 2
    ref.current.position.x = position[0] + Math.sin(t * speed * 0.3) * 0.5
    ref.current.scale.y = 1 + Math.sin(t * speed * 2) * 0.08
  })
  return (
    <group ref={ref} position={position} scale={[scale, scale, scale]}>
      {/* Bell */}
      <mesh>
        <sphereGeometry args={[0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.1}
          side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Tentacles */}
      {[0, 0.3, -0.3].map((x, i) => (
        <mesh key={i} position={[x, -0.4, 0]}>
          <cylinderGeometry args={[0.02, 0.01, 1.2, 4]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.08}
            blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Coral reef shapes at bottom ──────────────────────── */
function CoralReef() {
  const shapes = useMemo(() => {
    const items = []
    for (let i = 0; i < 12; i++) {
      items.push({
        pos: [(Math.random() - 0.5) * 40, -6 - Math.random() * 2, -10 - Math.random() * 8],
        scale: 0.3 + Math.random() * 0.6,
        color: ['#0c4a6e', '#134e4a', '#1e1b4b', '#3f3f46'][Math.floor(Math.random() * 4)],
        type: Math.random() > 0.5 ? 'cone' : 'sphere',
      })
    }
    return items
  }, [])

  return (
    <group>
      {shapes.map((s, i) => (
        <mesh key={i} position={s.pos} scale={[s.scale, s.scale * (0.8 + Math.random() * 0.8), s.scale]}>
          {s.type === 'cone'
            ? <coneGeometry args={[0.5, 1.5, 6]} />
            : <sphereGeometry args={[0.5, 6, 5]} />}
          <meshBasicMaterial color={s.color} transparent opacity={0.12} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Mouse-reactive camera ──────────────────────────── */
function CameraRig() {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handler = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * -2
    }
    window.addEventListener('mousemove', handler, { passive: true })
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  useFrame(() => {
    camera.position.x += (mouse.current.x * 2.0 - camera.position.x) * 0.015
    camera.position.y += (mouse.current.y * 1.0 + 1 - camera.position.y) * 0.015
    camera.lookAt(0, 0, -5)
  })

  return null
}

/* ── Main scene ─────────────────────────────────────── */
export default function OceanScene({ className = '' }) {
  return (
    <div className={`fixed inset-0 -z-10 ${className}`}>
      <Canvas
        camera={{ position: [0, 1, 8], fov: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ background: 'linear-gradient(180deg, #020a18 0%, #010510 40%, #000208 100%)' }}
      >
        <fog attach="fog" args={['#010510', 5, 45]} />
        <ambientLight intensity={0.18} color="#0ea5e9" />
        <pointLight position={[5, 10, -5]} intensity={0.5} color="#22d3ee" distance={35} />
        <pointLight position={[-8, 8, -8]} intensity={0.25} color="#0ea5e9" distance={30} />
        <pointLight position={[0, -5, -3]} intensity={0.15} color="#8b5cf6" distance={20} />

        <WaterPlane />
        <Bubbles count={80} />
        <Particles count={120} />

        {/* 4 God Rays */}
        <GodRay position={[6, 10, -12]} rotation={[0, 0, -0.3]} color="#0ea5e9" width={8} height={30} baseOpacity={0.07} speed={0.15} offset={0} />
        <GodRay position={[-5, 11, -14]} rotation={[0, 0, 0.2]} color="#22d3ee" width={6} height={28} baseOpacity={0.05} speed={0.12} offset={2} />
        <GodRay position={[12, 9, -16]} rotation={[0, 0, -0.15]} color="#0ea5e9" width={5} height={25} baseOpacity={0.04} speed={0.1} offset={4} />
        <GodRay position={[-10, 12, -18]} rotation={[0, 0, 0.25]} color="#14b8a6" width={7} height={26} baseOpacity={0.04} speed={0.13} offset={6} />

        {/* Fish silhouettes */}
        <FishSilhouette startX={-20} y={2} z={-10} speed={0.4} scale={0.8} />
        <FishSilhouette startX={-15} y={-1} z={-14} speed={0.25} scale={1.2} />
        <FishSilhouette startX={-25} y={4} z={-12} speed={0.35} scale={0.6} />

        {/* Jellyfish */}
        <Jellyfish position={[-8, 3, -10]} speed={0.2} scale={0.8} />
        <Jellyfish position={[10, 5, -15]} speed={0.15} scale={1.1} />
        <Jellyfish position={[3, 1, -12]} speed={0.18} scale={0.6} />

        {/* Coral reef */}
        <CoralReef />

        <CameraRig />
      </Canvas>
    </div>
  )
}
