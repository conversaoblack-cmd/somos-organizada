import {ThreeCanvas} from '@remotion/three';
import React from 'react';
import {useVideoConfig} from 'remotion';
import {Arquibancada3D, CameraNoFrame, Estadio, posicaoDaPlaca, type LinhaDoTempoPlaca} from '../../biblioteca/Arquibancada3D';
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
 * Palco 3D: noite de estádio, refletor de cima e da frente, mosaico e estrutura.
 * `desfoque` (px a 1080 de largura) = profundidade de campo do fundo quando há um objeto na frente (celular): o fundo é
 * desfocado em 2D, sem animar o desfoque (estático por cena: não cria raster dependente de tempo).
 */
export const Palco: React.FC<{placas: LinhaDoTempoPlaca; camera: CameraPalco; brilhoRefletores?: number; desfoque?: number; escurecer?: number; children?: React.ReactNode}> = ({
  placas,
  camera,
  brilhoRefletores = 1,
  desfoque = 0,
  escurecer = 0,
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
      <Estadio largura={C * 0.74} alturaCobertura={TOPO.y + 2.2} fundoZ={TOPO.z} brilhoRefletores={brilhoRefletores} torresX={11} />
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
