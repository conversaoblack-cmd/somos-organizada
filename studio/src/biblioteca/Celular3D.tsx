import {useThree} from '@react-three/fiber';
import {Video} from '@remotion/media';
import {ThreeCanvas} from '@remotion/three';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {cancelRender, continueRender, delayRender, useRemotionEnvironment, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {COR} from '../marca/tokens';

/**
 * Celular 3D com bisel; a tela recebe captura (imagem) ou gravação (vídeo) do produto real.
 * Regras (seção 6.6):
 * - animação só por useCurrentFrame()/interpolate() vindos de fora (props); NADA de useFrame, timer ou aleatório;
 * - vídeo na tela: <Video headless> do @remotion/media + onVideoFrame + advance() no render
 *   (useOffthreadVideoTexture foi descontinuado no Remotion 4.0.387+; ver docs/decisoes.md);
 * - velocidade da gravação: calcule o frame na mão (<Sequence from>); playbackRate da textura é ignorado;
 * - z-fighting: câmera com near alto (≈4) e depthTest={false} nas luzes aditivas;
 * - objeto 3D no escuro precisa de luz própria (pointLight perto + directional de recorte) e MeshStandard.
 */

// Proporção da captura do produto: 390×844 a 3× = 1170×2532.
export const TELA_LARGURA_PX = 1170;
export const TELA_ALTURA_PX = 2532;

const CORPO_L = 2.0;
const CORPO_A = 4.18;
const CORPO_P = 0.16;
const TELA_L = 1.86;
const TELA_A = (TELA_L * TELA_ALTURA_PX) / TELA_LARGURA_PX;

function retanguloArredondado(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** ShapeGeometry com UV 0..1 (a padrão usa as coordenadas da forma, o que estica a textura). */
function geometriaTela(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(retanguloArredondado(w, h, r), 24);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + w / 2) / w;
    uv[i * 2 + 1] = (pos.getY(i) + h / 2) / h;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const TexturaImagem: React.FC<{src: string; children: (t: THREE.Texture) => React.ReactNode}> = ({src, children}) => {
  const [handle] = useState(() => delayRender(`textura ${src}`));
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const {advance} = useThree();
  const {isRendering} = useRemotionEnvironment();
  useEffect(() => {
    new THREE.TextureLoader().load(
      src,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTex(t);
      },
      undefined,
      (e) => cancelRender(e),
    );
  }, [src]);
  useEffect(() => {
    if (!tex) return;
    if (isRendering) advance(performance.now());
    continueRender(handle);
  }, [tex, handle, advance, isRendering]);
  return tex ? <>{children(tex)}</> : null;
};

const TexturaVideo: React.FC<{src: string; children: (t: THREE.Texture) => React.ReactNode}> = ({src, children}) => {
  const [c] = useState(() => {
    const canvas = new OffscreenCanvas(TELA_LARGURA_PX, TELA_ALTURA_PX);
    const context = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return {context, texture};
  });
  const {invalidate, advance} = useThree();
  const {isRendering} = useRemotionEnvironment();
  const aoQuadro = useCallback(
    (q: CanvasImageSource) => {
      c.context.drawImage(q, 0, 0, TELA_LARGURA_PX, TELA_ALTURA_PX);
      c.texture.needsUpdate = true;
      if (isRendering) advance(performance.now());
      else invalidate();
    },
    [c, advance, invalidate, isRendering],
  );
  return (
    <>
      <Video src={src} onVideoFrame={aoQuadro} muted headless />
      {children(c.texture)}
    </>
  );
};

export type Celular3DProps = {
  /** captura (staticFile) da tela, 1170×2532 */
  tela?: string;
  /** gravação (staticFile) da tela, 1170×2532 */
  video?: string;
  posicao?: [number, number, number];
  rotacao?: [number, number, number];
  escala?: number;
  /** 0..1: brilho da tela (acende o aparelho) */
  brilhoTela?: number;
};

/** O aparelho (objeto da cena). Use dentro de <PalcoCelular> ou de outro <ThreeCanvas>. */
export const Celular3D: React.FC<Celular3DProps> = ({
  tela,
  video,
  posicao = [0, 0, 0],
  rotacao = [0, 0, 0],
  escala = 1,
  brilhoTela = 1,
}) => {
  const corpo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(retanguloArredondado(CORPO_L - 0.08, CORPO_A - 0.08, 0.3), {
      depth: CORPO_P,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 6,
      curveSegments: 24,
    });
    g.translate(0, 0, -CORPO_P / 2);
    return g;
  }, []);
  const geoTela = useMemo(() => geometriaTela(TELA_L, TELA_A, 0.22), []);
  const geoMoldura = useMemo(() => geometriaTela(TELA_L + 0.05, TELA_A + 0.05, 0.24), []);
  const zTela = CORPO_P / 2 + 0.045;

  const materialTela = (t: THREE.Texture | null) => (
    <mesh geometry={geoTela} position={[0, 0, zTela + 0.002]}>
      <meshBasicMaterial
        key={t ? t.uuid : 'vazia'}
        map={t ?? undefined}
        color={new THREE.Color(brilhoTela, brilhoTela, brilhoTela)}
        toneMapped={false}
      />
    </mesh>
  );

  return (
    <group position={posicao} rotation={rotacao} scale={escala}>
      <mesh geometry={corpo}>
        <meshStandardMaterial color={COR.superficie2} metalness={0.65} roughness={0.32} />
      </mesh>
      <mesh geometry={geoMoldura} position={[0, 0, zTela]}>
        <meshStandardMaterial color="#05070C" metalness={0.1} roughness={0.15} />
      </mesh>
      {tela ? (
        <TexturaImagem src={tela}>{(t) => materialTela(t)}</TexturaImagem>
      ) : video ? (
        <TexturaVideo src={video}>{(t) => materialTela(t)}</TexturaVideo>
      ) : (
        materialTela(null)
      )}
    </group>
  );
};

/** Palco padrão: refletor de estádio vindo de cima e da frente, luz própria e recorte azul. */
export const PalcoCelular: React.FC<{children: React.ReactNode; fov?: number; distancia?: number}> = ({
  children,
  fov = 30,
  distancia = 12,
}) => {
  const {width, height} = useVideoConfig();
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{fov, position: [0, 0, distancia], near: 4, far: 40}}
      gl={{antialias: true, preserveDrawingBuffer: true}}
    >
      <ambientLight intensity={0.25} />
      {/* refletor: de cima e da frente */}
      <directionalLight position={[1.5, 6, 6]} intensity={2.2} color="#FFFFFF" />
      {/* luz própria perto do aparelho */}
      <pointLight position={[-2.5, 1.5, 3]} intensity={18} distance={10} color="#DDE6FF" />
      {/* recorte azul por trás (ação/produto) */}
      <directionalLight position={[-4, 2, -5]} intensity={2.6} color={COR.azul} />
      {children}
    </ThreeCanvas>
  );
};
