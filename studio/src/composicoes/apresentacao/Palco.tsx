import {ThreeCanvas} from '@remotion/three';
import React from 'react';
import {useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {staticFile} from 'remotion';
import {Arquibancada3D, CameraNoFrame, Estadio, posicaoDaPlaca, type LinhaDoTempoPlaca} from '../../biblioteca/Arquibancada3D';
import {Celular3D} from '../../biblioteca/Celular3D';
import {COR, MARCA} from '../../marca/tokens';

/** Geometria do mosaico da peça (uma só para todas as cenas: a arquibancada é a mesma do começo ao fim). */
export const C = 40;
export const L = 30;
export const GEO = {colunas: C, lado: 0.62, vao: 0.12, subida: 0.42, recuo: 0.5, curva: 0.018};
export const TOPO = posicaoDaPlaca(C / 2, L - 1, GEO);

/** A grade 2×2 da marca desenhada no mosaico (cada quadrado = bloco de 7×7 placas). */
export function corDaGrade(c: number, l: number): string | null {
  const bloco = 7;
  const larg = bloco * 2 + 1;
  const c0 = Math.floor((C - larg) / 2);
  const l0 = Math.floor((L - larg) / 2) + 3;
  const x = c - c0;
  const y = l - l0;
  if (x < 0 || y < 0 || x >= larg || y >= larg || x === bloco || y === bloco) return null;
  const col = x > bloco ? 1 : 0;
  const lin = y > bloco ? 0 : 1; // fileira 0 é a de baixo
  return MARCA.grade[lin * 2 + col];
}

export type CameraPalco = {posicao: [number, number, number]; alvo: [number, number, number]; fov?: number};

/**
 * O celular DENTRO da arquibancada (direção v2): erguido como mais uma placa, na base do quadro. A posição vem da
 * câmera: ponto da tela (x, y em px a 1080×1920) a `profundidade` unidades da câmera. A luz dele (cor semântica da
 * cena) fica atrás do aparelho, voltada para as placas, e uma contraluz colorida desenha o recorte da borda.
 */
export type CelularNaArquibancada = {
  tela: string;
  /** cor semântica da luz (azul = ação, amarelo = o que entra, vermelho = barrado) */
  cor: string;
  x?: number;
  y?: number;
  /** altura do aparelho na tela, em px */
  alturaPx?: number;
  profundidade?: number;
  /** giro leve (rad) para não ficar chapado */
  giro?: number;
  /** 0..1: entrada (sobe da arquibancada) */
  entrada?: number;
  intensidadeLuz?: number;
};

function pontoNaTela(cam: CameraPalco, xPx: number, yPx: number, d: number) {
  const P = new THREE.Vector3(...cam.posicao);
  const T = new THREE.Vector3(...cam.alvo);
  const f = T.clone().sub(P).normalize();
  const r = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const u = r.clone().cross(f).normalize();
  const h = d * Math.tan(((cam.fov ?? 56) * Math.PI) / 360);
  const aspecto = 1080 / 1920;
  const ny = 1 - (2 * yPx) / 1920;
  const nx = (2 * xPx) / 1080 - 1;
  return {ponto: P.clone().add(f.clone().multiplyScalar(d)).add(u.clone().multiplyScalar(ny * h)).add(r.clone().multiplyScalar(nx * h * aspecto)), h, f, u};
}

const CelularNoPalco: React.FC<{cel: CelularNaArquibancada; camera: CameraPalco}> = ({cel, camera}) => {
  const d = cel.profundidade ?? 7;
  const entrada = cel.entrada ?? 1;
  const {ponto, h, f, u} = pontoNaTela(camera, cel.x ?? 540, (cel.y ?? 1500) + (1 - entrada) * 260, d);
  const alturaMundo = ((cel.alturaPx ?? 460) / 1920) * 2 * h;
  const escala = alturaMundo / 4.18;
  // de frente para a câmera: o eixo +z do aparelho (a tela) aponta para a câmera (z = olho − alvo = −f)
  const m = new THREE.Matrix4().lookAt(ponto, ponto.clone().add(f), u);
  const rot = new THREE.Euler().setFromRotationMatrix(m);
  const luz = new THREE.Color(cel.cor);
  const atras = ponto.clone().add(f.clone().multiplyScalar(1.2)).add(u.clone().multiplyScalar(alturaMundo * 0.2));
  return (
    <group>
      <group position={ponto.toArray() as [number, number, number]} rotation={[rot.x, rot.y + (cel.giro ?? 0), rot.z]}>
        <Celular3D tela={staticFile(`apresentacao/telas/${cel.tela}`)} escala={escala} brilhoTela={0.35 + 0.65 * entrada} />
      </group>
      {/* a luz do aparelho espalhando nas placas (atrás dele, voltada para a arquibancada) */}
      <pointLight position={atras.toArray() as [number, number, number]} color={luz} intensity={(cel.intensidadeLuz ?? 60) * entrada} distance={22} decay={1.4} />
      {/* contraluz colorida: recorte na borda do aparelho */}
      <pointLight position={ponto.clone().add(f.clone().multiplyScalar(0.9)).add(u.clone().multiplyScalar(alturaMundo * 0.6)).toArray() as [number, number, number]} color={luz} intensity={10 * entrada} distance={3} decay={1} />
    </group>
  );
};

/**
 * Palco 3D: noite de estádio, refletor de cima e da frente, mosaico e estrutura.
 * `desfoque` (px a 1080 de largura) = profundidade de campo do fundo quando há um objeto na frente (celular): o fundo é
 * desfocado em 2D, sem animar o desfoque (estático por cena: não cria raster dependente de tempo).
 */
export const Palco: React.FC<{placas: LinhaDoTempoPlaca; camera: CameraPalco; brilhoRefletores?: number; desfoque?: number; escurecer?: number; celular?: CelularNaArquibancada | null; children?: React.ReactNode}> = ({
  placas,
  camera,
  brilhoRefletores = 1,
  desfoque = 0,
  escurecer = 0,
  celular = null,
  children,
}) => {
  const {width, height} = useVideoConfig();
  return (
    <div style={{position: 'absolute', inset: 0, filter: desfoque ? `blur(${(desfoque * width) / 1080}px) brightness(${1 - escurecer})` : escurecer ? `brightness(${1 - escurecer})` : undefined}}>
    <ThreeCanvas width={width} height={height} camera={{fov: 56, near: 4, far: 140}} gl={{antialias: true, preserveDrawingBuffer: true}}>
      <color attach="background" args={[COR.fundo]} />
      <fog attach="fog" args={[COR.fundo, 26, 62]} />
      <CameraNoFrame posicao={camera.posicao} alvo={camera.alvo} fov={camera.fov ?? 56} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[0, 30, 25]} intensity={1.6} color="#E8EEFF" />
      <directionalLight position={[-20, 10, 10]} intensity={0.4} color={COR.azul} />
      <Arquibancada3D {...GEO} linhas={L} placas={placas} semente="apresentacao" />
      <Estadio largura={C * 0.74} alturaCobertura={TOPO.y + 2.2} fundoZ={TOPO.z} brilhoRefletores={brilhoRefletores} torresX={8.2} alturaLampadas={1.6} />
      {celular && <CelularNoPalco cel={celular} camera={camera} />}
      {children}
    </ThreeCanvas>
    </div>
  );
};

/** Camada da frente (celular 3D) com fundo transparente, câmera própria e luz de recorte. */
export const Frente: React.FC<{children: React.ReactNode; fov?: number; distancia?: number}> = ({children, fov = 30, distancia = 12}) => {
  const {width, height} = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} style={{position: 'absolute', inset: 0}} camera={{fov, position: [0, 0, distancia], near: 4, far: 40}} gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}}>
      <ambientLight intensity={0.25} />
      <directionalLight position={[1.5, 6, 6]} intensity={2.2} color="#FFFFFF" />
      <pointLight position={[-2.5, 1.5, 3]} intensity={18} distance={10} color="#DDE6FF" />
      <directionalLight position={[-4, 2, -5]} intensity={2.6} color={COR.azul} />
      {children}
    </ThreeCanvas>
  );
};
