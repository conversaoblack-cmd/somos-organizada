import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {random, useCurrentFrame} from 'remotion';
import * as THREE from 'three';
import {COR} from '../marca/tokens';
import {ENTRADA} from '../lib/movimento';

/**
 * O MOSAICO DA ARQUIBANCADA em 3D (território da marca): placas instanciadas em fileiras que sobem e somem no escuro,
 * como o bandeirão de cartões que a torcida levanta. Cada placa tem uma linha do tempo de estados (cor + frame) e VIRA
 * (rotação no eixo X, como o cartão erguido) ao mudar de estado.
 *
 * Determinístico: tudo vem do frame e da semente. Sem useFrame. Atualiza as instâncias em layout effect (antes do render
 * do ThreeCanvas no quadro).
 */
export type EstadoPlaca = {cor: string; de: number; virada?: number; pisca?: boolean};
export type LinhaDoTempoPlaca = (coluna: number, linha: number) => EstadoPlaca[];

export type Arquibancada3DProps = {
  colunas: number;
  linhas: number;
  placas: LinhaDoTempoPlaca;
  /** lado da placa (unidades 3D) */
  lado?: number;
  /** espaço entre placas */
  vao?: number;
  /** quanto cada fileira sobe e recua */
  subida?: number;
  recuo?: number;
  /** curvatura da arquibancada (as pontas vêm para a frente) */
  curva?: number;
  /** variação aleatória por placa (frames) no início da virada: torcida de verdade não vira em sincronia perfeita */
  jitter?: number;
  semente?: string;
  /** cor da placa apagada (o verso do cartão) */
  apagada?: string;
  /** tamanho do brilho atrás da placa acesa (× lado) e intensidade: contido, nunca "balada" */
  halo?: number;
  intensidadeHalo?: number;
};

const ESCURA = new THREE.Color(COR.superficie2);

/** Posição (no espaço da arquibancada) do centro da placa: útil para prender overlays 2D (projete com a câmera). */
export function posicaoDaPlaca(
  c: number,
  l: number,
  {colunas, lado = 1, vao = 0.16, subida = 0.62, recuo = 0.95, curva = 0.012}: Pick<Arquibancada3DProps, 'colunas' | 'lado' | 'vao' | 'subida' | 'recuo' | 'curva'>,
) {
  const passo = lado + vao;
  const x = (c - (colunas - 1) / 2) * passo;
  return new THREE.Vector3(x, l * (subida + lado * 0.55), -l * recuo + curva * x * x);
}

function geometriaPlaca(lado: number) {
  const r = lado * 0.18;
  const s = new THREE.Shape();
  const h = lado / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  const g = new THREE.ExtrudeGeometry(s, {depth: lado * 0.05, bevelEnabled: true, bevelThickness: lado * 0.02, bevelSize: lado * 0.02, bevelSegments: 2, curveSegments: 6});
  g.translate(0, 0, -lado * 0.025);
  return g;
}

/** Textura de brilho radial (halo), gerada em canvas: sem arquivo externo. */
function texturaHalo() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const Arquibancada3D: React.FC<Arquibancada3DProps> = (props) => {
  const {colunas, linhas, placas, lado = 1, vao = 0.16, subida = 0.62, recuo = 0.95, curva = 0.012, jitter = 4, semente = 'arquibancada', apagada} = props;
  const frame = useCurrentFrame();
  const placasRef = useRef<THREE.InstancedMesh>(null);
  const halosRef = useRef<THREE.InstancedMesh>(null);
  const {invalidate} = useThree();
  const n = colunas * linhas;
  const geo = useMemo(() => geometriaPlaca(lado), [lado]);
  const halo = useMemo(() => texturaHalo(), []);
  const corApagada = useMemo(() => (apagada ? new THREE.Color(apagada) : ESCURA), [apagada]);

  // linhas do tempo e posições: calculadas uma vez
  const dados = useMemo(() => {
    const out: {pos: THREE.Vector3; estados: EstadoPlaca[]; j: number}[] = [];
    for (let l = 0; l < linhas; l++)
      for (let c = 0; c < colunas; c++) {
        out.push({
          pos: posicaoDaPlaca(c, l, {colunas, lado, vao, subida, recuo, curva}),
          estados: [...placas(c, l)].sort((a, b) => a.de - b.de),
          j: random(`${semente}-${c}-${l}`) * jitter,
        });
      }
    return out;
  }, [colunas, linhas, placas, lado, vao, subida, recuo, curva, jitter, semente]);

  useLayoutEffect(() => {
    const m = placasRef.current;
    const h = halosRef.current;
    if (!m || !h) return;
    const tmp = new THREE.Object3D();
    const cor = new THREE.Color();
    const anterior = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const d = dados[i];
      // estado atual e anterior
      let k = -1;
      for (let e = 0; e < d.estados.length; e++) if (frame >= d.estados[e].de + d.j) k = e;
      const atual = k >= 0 ? d.estados[k] : null;
      const antes = k >= 1 ? d.estados[k - 1] : null;
      const virada = atual?.virada ?? 9;
      const p = atual ? Math.min(1, Math.max(0, (frame - atual.de - d.j) / virada)) : 1;
      const e = ENTRADA(p);
      // rotação: de -π (verso) a 0 (frente); troca a cor na metade
      const ang = atual ? -Math.PI * (1 - e) : 0;
      const frente = !atual || e >= 0.5;
      if (antes) anterior.set(antes.cor);
      else anterior.copy(corApagada);
      if (atual && frente) cor.set(atual.cor);
      else cor.copy(atual ? anterior : corApagada);
      // pisca: placa vermelha que "falha" (problema), determinística
      let brilho = 1;
      if (atual?.pisca && frente) brilho = 0.55 + 0.45 * (random(`${semente}-p-${i}-${Math.floor(frame / 4)}`) > 0.35 ? 1 : 0.2);
      // flash ao acender
      if (atual && frente && p < 1) brilho *= 1 + 0.6 * (1 - p);
      tmp.position.copy(d.pos);
      tmp.rotation.set(ang, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, cor.clone().multiplyScalar(brilho));
      // halo atrás das placas acesas (não nas apagadas)
      const acesa = !!atual && frente && atual.cor.toLowerCase() !== COR.superficie2.toLowerCase();
      tmp.position.set(d.pos.x, d.pos.y, d.pos.z - lado * 0.08);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(acesa ? lado * (props.halo ?? 1.9) : 0.0001);
      tmp.updateMatrix();
      h.setMatrixAt(i, tmp.matrix);
      h.setColorAt(i, cor.clone().multiplyScalar(acesa ? (props.intensidadeHalo ?? 0.16) * brilho : 0));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
    invalidate();
  }, [frame, dados, n, corApagada, lado, semente, invalidate]);

  // degraus de concreto atrás de cada fileira
  const degraus = useMemo(() => {
    const largura = colunas * (lado + vao) + 4;
    return Array.from({length: linhas}, (_, l) => {
      const p = posicaoDaPlaca((colunas - 1) / 2, l, {colunas, lado, vao, subida, recuo, curva});
      return {y: p.y - lado * 0.62, z: p.z - lado * 0.35, largura};
    });
  }, [colunas, linhas, lado, vao, subida, recuo, curva]);

  return (
    <group>
      <instancedMesh ref={placasRef} args={[geo, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial color="#FFFFFF" roughness={0.45} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={halosRef} args={[undefined, undefined, n]} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={halo} transparent blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
      </instancedMesh>
      {degraus.map((d, i) => (
        <mesh key={i} position={[0, d.y, d.z]}>
          <boxGeometry args={[d.largura, lado * 0.18, recuo * 0.9]} />
          <meshStandardMaterial color="#0C1018" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
};

/** Refletor de estádio: ponto brilhante + clarão (sprite aditivo), sem pós-processamento. */
export const Refletor: React.FC<{posicao: [number, number, number]; intensidade?: number; escala?: number}> = ({posicao, intensidade = 1, escala = 6}) => {
  const tex = useMemo(() => texturaHalo(), []);
  return (
    <sprite position={posicao} scale={[escala, escala, 1]}>
      <spriteMaterial map={tex} color={new THREE.Color(1, 1, 1).multiplyScalar(intensidade)} transparent blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
    </sprite>
  );
};

/** Câmera controlada pelo frame (posição e alvo vêm de fora, já interpolados). */
export const CameraNoFrame: React.FC<{posicao: [number, number, number]; alvo: [number, number, number]; fov?: number}> = ({posicao, alvo, fov}) => {
  const {camera} = useThree();
  useLayoutEffect(() => {
    camera.position.set(...posicao);
    camera.lookAt(...alvo);
    if (fov && 'fov' in camera) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  }, [camera, posicao, alvo, fov]);
  return null;
};

/**
 * Estrutura do estádio em volta do mosaico: cobertura (silhueta no alto) e torres de refletores com a matriz de
 * lâmpadas. Lê como "arquibancada à noite" e dá o 1º plano de profundidade.
 */
export const Estadio: React.FC<{largura: number; alturaCobertura: number; fundoZ: number; brilhoRefletores?: number; torresX?: number}> = ({
  largura,
  alturaCobertura,
  fundoZ,
  brilhoRefletores = 1,
  torresX,
}) => {
  const tex = useMemo(() => texturaHalo(), []);
  const tx = torresX ?? largura / 2 + 3;
  const torres: [number, number][] = [
    [-tx, fundoZ + 2],
    [tx, fundoZ + 2],
  ];
  return (
    <group>
      {/* cobertura: laje inclinada sobre as últimas fileiras */}
      <mesh position={[0, alturaCobertura, fundoZ - 1]} rotation={[0.22, 0, 0]}>
        <boxGeometry args={[largura + 10, 0.5, 9]} />
        <meshStandardMaterial color="#05070C" roughness={1} />
      </mesh>
      {/* borda iluminada da cobertura (linha fina de luz) */}
      <mesh position={[0, alturaCobertura - 0.6, fundoZ + 3.4]}>
        <boxGeometry args={[largura + 10, 0.06, 0.06]} />
        <meshBasicMaterial color="#9FB4FF" toneMapped={false} />
      </mesh>
      {torres.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, alturaCobertura / 2 + 2, 0]}>
            <boxGeometry args={[0.35, alturaCobertura + 6, 0.35]} />
            <meshStandardMaterial color="#0A0D14" />
          </mesh>
          {/* matriz de lâmpadas 4×3 */}
          {Array.from({length: 12}, (_, k) => (
            <mesh key={k} position={[((k % 4) - 1.5) * 0.7, alturaCobertura + 4.6 + Math.floor(k / 4) * 0.7, 0.3]}>
              <planeGeometry args={[0.55, 0.55]} />
              <meshBasicMaterial color={new THREE.Color(1, 1, 1).multiplyScalar(1.4 * brilhoRefletores)} toneMapped={false} />
            </mesh>
          ))}
          <sprite position={[0, alturaCobertura + 5.3, 0.5]} scale={[9, 9, 1]}>
            <spriteMaterial map={tex} color={new THREE.Color(0.85, 0.9, 1).multiplyScalar(0.9 * brilhoRefletores)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
};
