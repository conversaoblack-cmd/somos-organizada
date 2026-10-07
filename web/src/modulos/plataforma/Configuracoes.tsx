import { useEffect, useState, type FormEvent } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/api";
import { centavosDeTexto, moeda } from "@/lib/formatos";
import type { PlanoSaas } from "@/lib/tipos";
import { LIMITE_GIGANTE_PADRAO, ORDEM_PLANOS, usePlanosSaas } from "@/modulos/inicio/planos";
import { Aviso, Botao, CabecalhoPagina, Campo, Cartao, Carregando, useToast } from "@/ui";

const textoMoeda = (c: number) => (c ? moeda(c).replace(/^R\$\s?/, "").trim() : "");

/** plataforma/publico: Pix da Somos Organizada e valores dos planos (leitura pública, escrita da equipe). */
export default function Configuracoes() {
  const cfg = usePlanosSaas();
  const [chave, setChave] = useState("");
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [valores, setValores] = useState<Record<PlanoSaas, string>>({ pequena: "", grande: "", gigante: "" });
  const [limite, setLimite] = useState(String(LIMITE_GIGANTE_PADRAO));
  const [pronto, setPronto] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const avisar = useToast();

  useEffect(() => {
    if (cfg.carregando || pronto) return;
    setChave(cfg.pix.chave);
    setNome(cfg.pix.nome || "SOMOS ORGANIZADA");
    setCidade(cfg.pix.cidade || "SALVADOR");
    setValores({
      pequena: textoMoeda(cfg.planos.pequena.valor),
      grande: textoMoeda(cfg.planos.grande.valor),
      gigante: textoMoeda(cfg.planos.gigante.valor),
    });
    setLimite(String(cfg.limiteGigante));
    setPronto(true);
  }, [cfg, pronto]);

  const centavos = Object.fromEntries(ORDEM_PLANOS.map((k) => [k, centavosDeTexto(valores[k])])) as Record<PlanoSaas, number>;
  const lim = Number(limite);
  const erros = {
    pequena: centavos.pequena < 100 ? "Informe o valor." : null,
    grande: centavos.grande < 100 ? "Informe o valor." : null,
    gigante: centavos.gigante < 100 ? "Informe o valor." : null,
    limite: !Number.isInteger(lim) || lim < 1 ? "Informe um número de sócios." : null,
    // Pix BR Code: nome até 25 e cidade até 15 caracteres
    nome: nome.trim().length > 25 ? "Máximo de 25 caracteres." : null,
    cidade: cidade.trim().length > 15 ? "Máximo de 15 caracteres." : null,
  };
  const valido = !Object.values(erros).some(Boolean);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (!valido) return;
    setSalvando(true);
    try {
      await setDoc(
        doc(db, "plataforma/publico"),
        {
          pix: { chave: chave.trim(), nome: nome.trim().toUpperCase(), cidade: cidade.trim().toUpperCase() },
          planos: Object.fromEntries(ORDEM_PLANOS.map((k) => [k, { nome: cfg.planos[k].nome, valor: centavos[k] }])),
          limiteGigante: lim,
          atualizadoEm: serverTimestamp(),
        },
        { merge: true },
      );
      avisar("Configurações salvas.", "sucesso");
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    } finally {
      setSalvando(false);
    }
  }

  if (!pronto) return <Carregando />;

  return (
    <>
      <CabecalhoPagina titulo="Configurações" descricao="Pix de recebimento e preços da mensalidade Somos Organizada. Valem para as próximas faturas." />
      <form onSubmit={salvar} className="grid gap-6 xl:grid-cols-2 items-start" noValidate>
        <Cartao className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-bold">Pix da Somos Organizada</h2>
            <p className="text-sm text-texto-3">Usado para gerar o Pix copia e cola de cada fatura (Pix estático, sem multa nem juros).</p>
          </div>
          {!chave.trim() && <Aviso tom="alerta" titulo="Chave Pix vazia">As faturas sairão sem Pix copia e cola.</Aviso>}
          <Campo rotulo="Chave Pix" value={chave} onChange={setChave} placeholder="CNPJ, e-mail, telefone ou chave aleatória" icone="pix" />
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Campo rotulo="Nome do recebedor" value={nome} onChange={setNome} maxLength={25} erro={tentou && erros.nome} dica="Como aparece no app do banco (até 25)." />
            <Campo rotulo="Cidade" value={cidade} onChange={setCidade} maxLength={15} erro={tentou && erros.cidade} />
          </div>
        </Cartao>

        <Cartao className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-bold">Planos</h2>
            <p className="text-sm text-texto-3">A diretoria escolhe pequena ou grande ao publicar; o gigante entra sozinho acima do limite de sócios ativos.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {ORDEM_PLANOS.map((k) => (
              <Campo
                key={k}
                rotulo={cfg.planos[k].nome}
                mascara="moeda"
                value={valores[k]}
                onChange={(v) => setValores((x) => ({ ...x, [k]: v }))}
                erro={tentou && erros[k]}
              />
            ))}
          </div>
          <Campo
            rotulo="Limite de sócios ativos para o plano gigante"
            inputMode="numeric"
            value={limite}
            onChange={(v) => setLimite(v.replace(/\D/g, "").slice(0, 7))}
            erro={tentou && erros.limite}
            dica={`Acima de ${Number(limite || 0).toLocaleString("pt-BR")} sócios ativos a fatura sai como Torcida gigante.`}
          />
        </Cartao>

        <div className="xl:col-span-2 flex justify-end">
          <Botao type="submit" icone="check" carregando={salvando}>
            Salvar configurações
          </Botao>
        </div>
      </form>
    </>
  );
}
