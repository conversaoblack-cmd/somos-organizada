/**
 * Destino do botão "Confirmar meu e-mail" (somosorganizada.com.br/verificar?oobCode=...&continuar=/cadastro).
 * Confirma o código no Firebase e continua o cadastro nesta mesma aba, no passo em que a pessoa parou.
 * Se a aba original do cadastro ainda estiver aberta, ela também segue sozinha (aviso entre abas).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { applyActionCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { aplicarTema, TEMA_PAINEL } from "@/lib/tema";
import { avisarEmailConfirmado, enviarConfirmacaoEmail } from "@/lib/emailsConta";
import { ehErroDeConexao, mensagemDeErro } from "@/lib/api";
import { Botao, Cartao, Girando, Icone } from "@/ui";

type Estado = "confirmando" | "confirmado" | "expirado" | "invalido" | "sem_internet";

/** Só caminhos deste site: o link do e-mail nunca leva para fora. */
const caminhoSeguro = (v: string | null) => (v && /^\/[A-Za-z0-9/_?=&.-]{0,120}$/.test(v) && !v.startsWith("//") ? v : "/cadastro");

export default function Verificar() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const codigo = params.get("oobCode") ?? "";
  const continuar = caminhoSeguro(params.get("continuar"));
  const [estado, setEstado] = useState<Estado>("confirmando");
  const [reenvio, setReenvio] = useState<{ enviando: boolean; texto?: string }>({ enviando: false });
  const tentativa = useRef(0);

  useEffect(() => {
    aplicarTema(TEMA_PAINEL);
    document.title = "Confirmar e-mail · Somos Organizada";
  }, []);

  async function confirmar() {
    setEstado("confirmando");
    tentativa.current++;
    try {
      if (!codigo) throw Object.assign(new Error("sem código"), { code: "auth/invalid-action-code" });
      await applyActionCode(auth, codigo);
      await concluir();
    } catch (e) {
      const c = String((e as { code?: string })?.code ?? "");
      // Link já usado (ex.: o e-mail abriu duas vezes): se a conta deste navegador já está confirmada, segue normal
      await auth.currentUser?.reload().catch(() => undefined);
      if (auth.currentUser?.emailVerified) return concluir();
      if (ehErroDeConexao(e)) setEstado("sem_internet");
      else if (c === "auth/expired-action-code") setEstado("expirado");
      else setEstado("invalido");
    }
  }

  async function concluir() {
    if (auth.currentUser) {
      await auth.currentUser.reload().catch(() => undefined);
      await auth.currentUser.getIdToken(true).catch(() => undefined); // o servidor passa a ver o e-mail confirmado
    }
    avisarEmailConfirmado();
    setEstado("confirmado");
    if (auth.currentUser) setTimeout(() => navegar(continuar, { replace: true }), 1200);
  }

  useEffect(() => {
    // espera o login deste navegador ser restaurado antes de confirmar (para continuar já logado)
    const parar = auth.onAuthStateChanged(() => {
      parar();
      void confirmar();
    });
    return parar;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reenviar() {
    const u = auth.currentUser;
    if (!u) return navegar(continuar);
    setReenvio({ enviando: true });
    try {
      await enviarConfirmacaoEmail(u, `${location.origin}${continuar}`);
      setReenvio({ enviando: false, texto: `Enviamos um novo link para ${u.email}. Confira também o spam.` });
    } catch (e) {
      setReenvio({ enviando: false, texto: mensagemDeErro(e) });
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-10">
      <Link to="/" className="font-display uppercase tracking-tight text-sm text-texto-2 hover:text-texto mb-8">
        Somos Organizada
      </Link>
      <Cartao className="w-full max-w-md p-7 sm:p-8 text-center animate-surgir" aria-live="polite">
        {estado === "confirmando" && (
          <>
            <Girando className="size-8 mx-auto text-primaria-texto" />
            <h1 className="text-xl font-bold mt-5">Confirmando seu e-mail…</h1>
          </>
        )}
        {estado === "confirmado" && (
          <>
            <span className="mx-auto size-14 rounded-2xl bg-sucesso/15 text-sucesso grid place-items-center">
              <Icone nome="checkCirculo" className="size-8" />
            </span>
            <h1 className="text-2xl font-bold mt-5">E-mail confirmado!</h1>
            {auth.currentUser ? (
              <p className="text-texto-2 mt-2">Continuando de onde você parou…</p>
            ) : (
              <>
                <p className="text-texto-2 mt-2">Pode voltar para o aparelho onde começou: ele continua sozinho. Ou siga por aqui.</p>
                <Botao largo tamanho="lg" className="mt-6" iconeDireita="setaDireita" onClick={() => navegar(continuar)}>
                  Continuar aqui
                </Botao>
              </>
            )}
          </>
        )}
        {(estado === "expirado" || estado === "invalido") && (
          <>
            <span className="mx-auto size-14 rounded-2xl bg-alerta/15 text-alerta grid place-items-center">
              <Icone nome="alerta" className="size-8" />
            </span>
            <h1 className="text-2xl font-bold mt-5">{estado === "expirado" ? "Este link expirou" : "Este link não vale mais"}</h1>
            <p className="text-texto-2 mt-2">
              {estado === "expirado" ? "Por segurança, o link de confirmação vale por pouco tempo." : "Ele já foi usado ou foi trocado por um mais novo."} Peça um novo e use o
              último que chegar.
            </p>
            {reenvio.texto && <p className="text-sm text-texto mt-4">{reenvio.texto}</p>}
            <Botao largo tamanho="lg" className="mt-6" icone="enviar" carregando={reenvio.enviando} onClick={reenviar}>
              {auth.currentUser ? "Enviar novo link" : "Voltar ao cadastro"}
            </Botao>
          </>
        )}
        {estado === "sem_internet" && (
          <>
            <span className="mx-auto size-14 rounded-2xl bg-info/15 text-info grid place-items-center">
              <Icone nome="alerta" className="size-8" />
            </span>
            <h1 className="text-2xl font-bold mt-5">Sem internet</h1>
            <p className="text-texto-2 mt-2">Não conseguimos confirmar agora. Confira a conexão e toque de novo: o link continua valendo.</p>
            <Botao largo tamanho="lg" className="mt-6" icone="atualizar" onClick={() => void confirmar()}>
              Tentar de novo
            </Botao>
          </>
        )}
      </Cartao>
    </div>
  );
}
