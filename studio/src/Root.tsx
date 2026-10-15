import React from 'react';
import {Composition, Folder, Still} from 'remotion';
import {CardMarca} from './biblioteca/CardMarca';
import {TesteCelular3D} from './composicoes/teste/TesteCelular3D';
import {TesteKit} from './composicoes/teste/TesteKit';
import {EstudoArquibancada} from './composicoes/apresentacao/EstudoArquibancada';
import {StyleframeProva} from './composicoes/apresentacao/StyleframeProva';
import {StyleframeCaixa} from './composicoes/apresentacao/StyleframeCaixa';
import {Apresentacao} from './composicoes/apresentacao/Apresentacao';
import {FORMATOS, FPS} from './formatos';
import {carregarFontes} from './marca/fontes';

carregarFontes();

/**
 * Registro de TODAS as composições. Peça nova: pasta em src/composicoes/<slug>/ e um <Folder> aqui,
 * com a principal e cada cena (connected compositions) para styleframe com `npx remotion still`.
 */
export const Root: React.FC = () => {
  const v = FORMATOS.vertical;
  return (
    <>
      <Folder name="Marca">
        {Object.values(FORMATOS).map((f) => (
          <Still
            key={f.id}
            id={`CardMarca-${f.id}`}
            component={CardMarca}
            defaultProps={{entrada: -40}}
            width={f.width}
            height={f.height}
          />
        ))}
      </Folder>
      <Folder name="Apresentacao">
        <Composition id="Apresentacao" component={Apresentacao} defaultProps={{audio: 'previa' as const}} durationInFrames={1350} fps={FPS} width={v.width} height={v.height} />
        <Composition id="EstudoArquibancada" component={EstudoArquibancada} durationInFrames={150} fps={FPS} width={v.width} height={v.height} />
        <Composition id="StyleframeCaixa" component={StyleframeCaixa} durationInFrames={90} fps={FPS} width={v.width} height={v.height} />
        <Composition id="StyleframeProva" component={StyleframeProva} durationInFrames={90} fps={FPS} width={v.width} height={v.height} />
      </Folder>
      <Folder name="Testes">
        <Composition id="TesteKit" component={TesteKit} durationInFrames={180} fps={FPS} width={v.width} height={v.height} />
        <Composition
          id="TesteCelular3D"
          component={TesteCelular3D}
          durationInFrames={60}
          fps={FPS}
          width={v.width}
          height={v.height}
        />
      </Folder>
    </>
  );
};
