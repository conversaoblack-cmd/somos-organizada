import { useState, type ReactNode } from "react";
import { enviarRedefinicaoSenha } from "@/lib/emailsConta";
import { mensagemDeErro } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { cpfMascarado, mascaraCep, mascaraTelefone } from "@/lib/formatos";
import type { ComId, Sede, Socio, Torcida } from "@/lib/tipos";
import { useDocumento } from "@/hooks/dados";
import { Avatar, Botao, Cartao, Icone, type NomeIcone, useToast } from "@/ui";
import { useFotoSocio } from "./comum";

function Item({ icone, rotulo, children }: { icone: NomeIcone; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-linha last:border-0">
      <span className="size-9 shrink-0 rounded-xl bg-superficie-2 text-texto-2 grid place-items-center">
        <Icone nome={icone} className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-texto-3">{rotulo}</p>
        <div className="font-medium break-words">{children}</div>
      </div>
    </div>
  );
}

function nascimentoBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export default function AbaDados({ tid, torcida, ficha }: { tid: string; torcida: Torcida; ficha: ComId<Socio> }) {
  const avisar = useToast();
  const sede = useDocumento<Sede>(`torcidas/${tid}/sedes/${ficha.sedeId}`).dados;
  const foto = useFotoSocio(ficha.fotoPath);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const email = auth.currentUser?.email ?? ficha.email;
  const e = ficha.endereco;

  async function alterarSenha() {
    setEnviando(true);
    try {
      await enviarRedefinicaoSenha(email, `${location.origin}/${torcida.slug}/socio`);
      setEnviado(true);
      avisar("Enviamos o link para o seu e-mail.", "sucesso");
    } catch (erro) {
      // Sem internet ou muitas tentativas: dizer a verdade, não "enviamos"
      avisar(mensagemDeErro(erro), "erro");
    } finally {
      setEnviando(false);
    }
  }

  const contato = torcida.contato?.whatsapp ? `https://wa.me/${torcida.contato.whatsapp.replace(/\D/g, "")}` : torcida.contato?.email ? `mailto:${torcida.contato.email}` : null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <Cartao className="p-5 sm:p-6">
        <div className="flex items-center gap-4 pb-4 border-b border-linha">
          <Avatar nome={ficha.nome} url={foto} tamanho="size-16" className="text-lg" />
          <div className="min-w-0">
            <p className="font-bold text-lg leading-tight truncate">{ficha.nome}</p>
            <p className="text-sm text-texto-2">{ficha.matricula ? `Matrícula ${ficha.matricula}` : "Matrícula gerada após o pagamento"}</p>
          </div>
        </div>
        <div>
          <Item icone="usuario" rotulo="CPF">
            <span className="font-mono">{cpfMascarado(ficha.cpf)}</span>
          </Item>
          {ficha.nascimento && (
            <Item icone="calendario" rotulo="Nascimento">
              {nascimentoBR(ficha.nascimento)}
            </Item>
          )}
          <Item icone="enviar" rotulo="E-mail">
            {email}
          </Item>
          <Item icone="whatsapp" rotulo="Telefone">
            {mascaraTelefone(ficha.telefone)}
          </Item>
          {e && (
            <Item icone="local" rotulo="Endereço">
              {e.logradouro}, {e.numero}
              {e.complemento ? ` · ${e.complemento}` : ""}
              <span className="block text-sm text-texto-2">
                {e.bairro} · {e.cidade}/{e.uf} · CEP {mascaraCep(e.cep)}
              </span>
            </Item>
          )}
          <Item icone="casa" rotulo="Sede">
            {sede?.nome ?? "—"}
            {sede?.bairro && <span className="block text-sm text-texto-2">{sede.bairro}</span>}
          </Item>
        </div>
      </Cartao>

      <div className="space-y-5">
        <Cartao className="p-5">
          <div className="flex gap-3">
            <Icone nome="info" className="size-5 text-info shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Precisa corrigir algum dado?</p>
              <p className="text-sm text-texto-2 mt-1">Para alterar dados, fale com a diretoria. Assim mantemos sua carteirinha segura e conferida.</p>
              {contato && (
                <a href={contato} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primaria-texto hover:underline">
                  <Icone nome={torcida.contato?.whatsapp ? "whatsapp" : "enviar"} className="size-4" /> Falar com a diretoria
                </a>
              )}
            </div>
          </div>
        </Cartao>
        <Cartao className="p-5">
          <p className="font-semibold flex items-center gap-2">
            <Icone nome="cadeado" className="size-5 text-texto-2" /> Senha
          </p>
          <p className="text-sm text-texto-2 mt-1">Enviamos um link para {email} para você criar uma nova senha.</p>
          <Botao className="mt-4" largo variante="suave" icone="chave" carregando={enviando} disabled={enviado} onClick={alterarSenha}>
            {enviado ? "Link enviado — confira seu e-mail" : "Alterar senha"}
          </Botao>
        </Cartao>
      </div>
    </div>
  );
}
