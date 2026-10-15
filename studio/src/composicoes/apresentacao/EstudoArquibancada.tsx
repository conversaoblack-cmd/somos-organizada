import {ThreeCanvas} from '@remotion/three';
import React, {useCallback} from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {Arquibancada3D, CameraNoFrame, Estadio, posicaoDaPlaca, type EstadoPlaca} from '../../biblioteca/Arquibancada3D';
import {COR, MARCA} from '../../marca/tokens';
import {FIRME} from '../../lib/movimento';

/** Estudo de direção de arte (portão visual): o mosaico da arquibancada acendendo até formar a grade 2×2. */
const C = 40;
const L = 30;

// grade 2×2 da marca no centro do mosaico (cada quadrado = bloco de placas)
function corDaGrade(c: number, l: number): string | null {
  const bloco = 7;
  const vao = 1;
  const larg = bloco * 2 + vao;
  const c0 = Math.floor((C - larg) / 2);
  const l0 = Math.floor((L - larg) / 2) + 3;
  const x = c - c0;
  const y = l - l0;
  if (x < 0 || y < 0 || x >= larg || y >= larg) return null;
  if (x === bloco || y === bloco) return null;
  const col = x > bloco ? 1 : 0;
  const lin = y > bloco ? 0 : 1; // fileira 0 é a de baixo
  return MARCA.grade[lin * 2 + col];
}

export const EstudoArquibancada: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const placas = useCallback((c: number, l: number): EstadoPlaca[] => {
    const r = random(`p-${c}-${l}`);
    const estados: EstadoPlaca[] = [];
    // problema: algumas placas vermelhas piscando no começo
    if (r < 0.08) estados.push({cor: COR.perigo, de: 5 + r * 60, pisca: true});
    const g = corDaGrade(c, l);
    const dist = Math.hypot(c - C / 2, l - L / 2) / Math.hypot(C / 2, L / 2);
    if (g) estados.push({cor: g, de: 40 + dist * 20});
    else if (r < 0.55) estados.push({cor: r < 0.2 ? COR.amarelo : '#2A3550', de: 60 + dist * 50 + r * 10});
    return estados;
  }, []);
  const t = FIRME(interpolate(frame, [0, 150], [0, 1], {extrapolateRight: 'clamp'}));
  const camZ = interpolate(t, [0, 1], [21, 17.5]);
  const camY = interpolate(t, [0, 1], [1, 2]);
  const GEO = {colunas: C, lado: 0.62, vao: 0.12, subida: 0.42, recuo: 0.5, curva: 0.018};
  const topo = posicaoDaPlaca(C / 2, L - 1, GEO);
  return (
    <AbsoluteFill style={{backgroundColor: COR.fundo}}>
      <ThreeCanvas width={width} height={height} camera={{fov: 40, near: 4, far: 120}} gl={{antialias: true, preserveDrawingBuffer: true}}>
        <color attach="background" args={[COR.fundo]} />
        <fog attach="fog" args={[COR.fundo, 26, 60]} />
        <CameraNoFrame posicao={[0, camY, camZ]} alvo={[0, 8.6, -7]} fov={56} />
        <ambientLight intensity={0.18} />
        <directionalLight position={[0, 30, 25]} intensity={1.6} color="#E8EEFF" />
        <directionalLight position={[-20, 10, 10]} intensity={0.4} color={COR.azul} />
        <Arquibancada3D linhas={L} placas={placas} semente="estudo" {...GEO} />
        <Estadio largura={C * 0.74} alturaCobertura={topo.y + 2.2} fundoZ={topo.z} brilhoRefletores={1} torresX={11} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
