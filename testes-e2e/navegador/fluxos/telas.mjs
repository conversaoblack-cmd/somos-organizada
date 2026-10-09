// Fluxo 9: todas as telas dos painéis (diretoria, subsede, portaria, sócio e plataforma), cada uma com o seu passo a passo.
// No celular, reprova se a página rolar para o lado, se um campo tiver fonte < 16 px (o iPhone dá zoom ao tocar) ou se
// o balão do tour (ou um botão dele) sair da tela. Em qualquer largura, reprova com erro no console.
// Usa a torcida de demonstração "brasil" (semear.mjs).
import { BASE, novoAparelho, fecharAparelho, novaPagina, conferir, entrar, fsConsultar } from "../lib.mjs";

const A = "/brasil/admin";

/** Balão do tour dentro da tela, em cada passo, até o fim. */
async function percorrerTour(ap, p, id) {
  const balao = p.locator('[aria-labelledby="tour-titulo"]');
  await balao.waitFor({ timeout: 20_000 });
  for (let passo = 1; passo <= 20; passo++) {
    await p.waitForTimeout(400);
    const fora = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const b = document.querySelector('[aria-labelledby="tour-titulo"]')?.getBoundingClientRect();
      if (!b) return null;
      const ruins = [];
      if (b.left < -1 || b.right > W + 1 || b.top < -1 || b.bottom > H + 1) ruins.push(`balão fora da tela (${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)})`);
      for (const bt of document.querySelectorAll('[aria-labelledby="tour-titulo"] button')) {
        const r = bt.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1)) ruins.push(`botão "${bt.textContent.trim()}" fora da tela`);
      }
      return ruins.length ? `${ruins.join("; ")} no passo "${document.getElementById("tour-titulo")?.textContent ?? ""}"` : null;
    });
    if (fora) throw new Error(`[${ap.rotulo}] tour ${id}: ${fora}`);
    const prox = p.locator("[data-tour-proximo]");
    if (!(await prox.count())) break;
    await prox.click();
    if (!(await balao.count())) return;
  }
  await balao.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
}

async function visitar(estado, email, entrada, telas) {
  // os outros fluxos fecham o tour sozinhos (Esc); aqui ele é o que está sendo testado
  const ap = await novoAparelho(estado, `telas-${email.split("@")[0]}`, { fecharTour: false });
  const p = await novaPagina(ap);
  await p.goto(`${BASE}${entrada}`);
  await entrar(p, email);
  await p.waitForLoadState("networkidle").catch(() => undefined);
  await p.waitForTimeout(2_000);
  for (const [rota, tour] of telas) {
    await p.goto(`${BASE}${rota}${tour ? `${rota.includes("?") ? "&" : "?"}tour=${tour}` : ""}`);
    if (tour) await percorrerTour(ap, p, tour);
    else {
      await p.waitForTimeout(2_000);
      if (await p.locator('[aria-labelledby="tour-titulo"]').count()) await p.keyboard.press("Escape");
    }
    await conferir(ap, p, `${email} em ${rota}`);
  }
  await fecharAparelho(ap);
}

export async function telas(estado) {
  const { tid } = estado;
  // outros fluxos encerram eventos (limite do plano): vale qualquer evento, de preferência publicado
  const eventos = (await fsConsultar(`torcidas/${tid}`, "eventos")).sort((a, b) => (b.status === "publicado") - (a.status === "publicado"));
  const sedeSub = (await fsConsultar(`torcidas/${tid}`, "membros", [["email", "==", "subsede4@brasil.test"]]))[0]?.sedeId;
  const ev = eventos[0]?._id;
  const evSub = eventos.find((e) => e.sedeId === sedeSub)?._id ?? ev;

  await visitar(estado, "diretoria@brasil.test", A, [
    [A, "admin-visao-geral"], [`${A}/primeiros-passos`, "admin-primeiros-passos"], [`${A}/eventos`, "admin-eventos"],
    [`${A}/eventos?novo=1`, "admin-eventos-criar"], [`${A}/eventos/${ev}`, "admin-evento-detalhe"], [`${A}/pedidos`, "admin-pedidos"],
    [`${A}/socios`, "admin-socios"], [`${A}/planos`, "admin-planos"], [`${A}/financeiro`, "admin-financeiro"], [`${A}/sedes`, "admin-sedes"],
    [`${A}/usuarios`, "admin-usuarios"], [`${A}/portaria`, "admin-portaria"], [`${A}/personalizacao`, "admin-personalizacao"],
    [`${A}/pagamentos`, "admin-pagamentos"], [`${A}/publicar`, "admin-publicado"], [`${A}/plano`, "admin-plano-somos"], [`${A}/dominio`, "admin-dominio"],
  ]);
  await visitar(estado, "subsede4@brasil.test", A, [
    [A, "subsede-visao-geral"], [`${A}/primeiros-passos`, "subsede-primeiros-passos"], [`${A}/eventos`, "subsede-eventos"],
    [`${A}/eventos?novo=1`, "subsede-eventos-criar"], [`${A}/eventos/${evSub}`, "subsede-evento-detalhe"], [`${A}/pedidos`, "subsede-pedidos"],
    [`${A}/financeiro`, "subsede-financeiro"], [`${A}/recebimentos`, "subsede-recebimentos"],
  ]);
  await visitar(estado, "portaria@brasil.test", A, [[A, "portaria-inicio"]]);
  await visitar(estado, "socio@brasil.test", "/brasil/socio", [
    ["/brasil/socio"], ["/brasil/socio/ingressos"], ["/brasil/socio/assinatura"], ["/brasil/socio/dados"],
  ]);
  await visitar(estado, "equipe@somos.test", "/plataforma", [
    ["/plataforma"], ["/plataforma/torcidas"], [`/plataforma/torcidas/${tid}`], ["/plataforma/solicitacoes"], ["/plataforma/mensalidades"],
    ["/plataforma/suporte"], ["/plataforma/faq"], ["/plataforma/depuracao"], ["/plataforma/configuracoes"],
  ]);
}
