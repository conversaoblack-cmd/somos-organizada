import { test } from "node:test";
import assert from "node:assert/strict";
import { domainToASCII } from "node:url";
import {
  apexDe,
  areaDoCaminhoInterno,
  caminhoNoDominio,
  EnderecoInvalido,
  normalizarHost,
  origemDaTorcida,
  situacaoDoHosting,
  urlDaTorcida,
  validarPainel,
  validarVitrine,
} from "../src/dominio/enderecos";
// Lógica pura do site (web): mesma regra de caminhos, testada aqui porque o web não tem executor de testes
import { hostDaPlataforma, paraInterno, paraVisivel, urlNoDominio, type HostProprio } from "../../web/src/lib/dominioProprio";

const invalido = (f: () => unknown, re?: RegExp) => assert.throws(f, (e) => e instanceof EnderecoInvalido && (!re || re.test(e.message)));

test("domínio: normaliza o que a equipe cola (maiúscula, https, barra, ponto final, acento)", () => {
  assert.equal(normalizarHost("  https://Furia.COM.br/ "), "furia.com.br");
  assert.equal(normalizarHost("furia.com.br."), "furia.com.br");
  assert.equal(normalizarHost("fúria.com.br", domainToASCII), "xn--fria-qra.com.br");
});

test("domínio: recusa porta, caminho, IP, usuário, domínio da plataforma e terminação de teste", () => {
  invalido(() => normalizarHost(""));
  invalido(() => normalizarHost("furia.com.br:8080"));
  invalido(() => normalizarHost("furia.com.br/site"));
  invalido(() => normalizarHost("user@furia.com.br"));
  invalido(() => normalizarHost("192.168.0.1"), /IP/);
  invalido(() => normalizarHost("localhost"));
  invalido(() => normalizarHost("furia"));
  invalido(() => normalizarHost("furia.test"));
  invalido(() => normalizarHost("-furia.com.br"));
  invalido(() => normalizarHost("fu_ria.com.br"));
  invalido(() => normalizarHost("somosorganizada.com.br"), /plataforma/);
  invalido(() => normalizarHost("furia.somosorganizada.com.br"), /plataforma/);
  invalido(() => normalizarHost("somos-organizada.web.app"));
  invalido(() => normalizarHost("fúria.com.br")); // sem conversor de IDN: recusa
  invalido(() => normalizarHost(`${"a".repeat(64)}.com.br`));
});

test("domínio: vitrine é o domínio raiz; painel é subdomínio (nunca o www)", () => {
  assert.equal(apexDe("painel.furia.com.br"), "furia.com.br");
  assert.equal(apexDe("loja.furia.com"), "furia.com");
  assert.equal(validarVitrine("furiaamapaense.com.br"), "furiaamapaense.com.br");
  assert.equal(validarVitrine("www.furia.com.br"), "furia.com.br");
  assert.equal(validarVitrine("furia.com"), "furia.com");
  invalido(() => validarVitrine("painel.furia.com.br"), /raiz/);
  invalido(() => validarVitrine("com.br"));
  assert.equal(validarPainel("painel.furia.com.br"), "painel.furia.com.br");
  invalido(() => validarPainel("furia.com.br"), /subdomínio/);
  invalido(() => validarPainel("www.furia.com.br"), /www/);
});

test("links de e-mail: domínio próprio quando está no ar; endereço padrão igual ao de antes sem ele", () => {
  const base = "https://somosorganizada.com.br";
  const sem = { slug: "furia" };
  assert.equal(urlDaTorcida(sem, "/socio/assinatura", base), "https://somosorganizada.com.br/furia/socio/assinatura");
  assert.equal(urlDaTorcida(sem, "/admin/plano", base + "/"), "https://somosorganizada.com.br/furia/admin/plano");
  assert.equal(urlDaTorcida(sem, "", base), "https://somosorganizada.com.br/furia");
  const com = { slug: "furia", dominio: { vitrine: "furia.com.br", painel: "painel.furia.com.br" } };
  assert.equal(urlDaTorcida(com, "/socio/assinatura", base), "https://furia.com.br/socio/assinatura");
  assert.equal(urlDaTorcida(com, "", base), "https://furia.com.br/");
  assert.equal(urlDaTorcida(com, "/ingressos/p1?k=abc", base), "https://furia.com.br/ingressos/p1?k=abc");
  assert.equal(urlDaTorcida(com, "/admin/plano", base), "https://painel.furia.com.br/plano");
  assert.equal(urlDaTorcida(com, "/admin", base), "https://painel.furia.com.br/");
  assert.equal(urlDaTorcida(com, "/portaria", base), "https://painel.furia.com.br/portaria");
  assert.equal(urlDaTorcida(com, "/admin/portaria", base), "https://painel.furia.com.br/admin/portaria");
  // só a vitrine no ar: o painel continua no endereço padrão
  assert.equal(urlDaTorcida({ slug: "furia", dominio: { vitrine: "furia.com.br" } }, "/admin", base), "https://somosorganizada.com.br/furia/admin");
  assert.equal(origemDaTorcida(com, "painel", base), "https://painel.furia.com.br");
  assert.equal(origemDaTorcida(sem, "painel", base + "/"), base);
  assert.equal(areaDoCaminhoInterno("/furia/admin/eventos"), "painel");
  assert.equal(areaDoCaminhoInterno("/furia/socio"), "vitrine");
  assert.equal(caminhoNoDominio("painel", "/admin/eventos?x=1"), "/eventos?x=1");
});

test("Firebase Hosting: estados e registros viram o nosso resumo", () => {
  const desired = {
    requiredDnsUpdates: {
      desired: [
        {
          domainName: "furia.com.br",
          records: [
            { domainName: "furia.com.br.", type: "A", rdata: "199.36.158.100", requiredAction: "ADD" },
            { domainName: "furia.com.br", type: "A", rdata: "1.2.3.4", requiredAction: "REMOVE" },
            { domainName: "furia.com.br", type: "TXT", rdata: "hosting-site=somos", requiredAction: "NONE" },
            { domainName: "furia.com.br", type: "A", rdata: "199.36.158.100", requiredAction: "ADD" },
          ],
        },
      ],
    },
  };
  const p = situacaoDoHosting({ hostState: "HOST_UNHOSTED", ownershipState: "OWNERSHIP_MISSING", ...desired });
  assert.equal(p.estado, "pendente_dns");
  assert.deepEqual(p.registros, [
    { tipo: "A", nome: "furia.com.br", valor: "199.36.158.100", acao: "adicionar" },
    { tipo: "A", nome: "furia.com.br", valor: "1.2.3.4", acao: "remover" },
    { tipo: "TXT", nome: "furia.com.br", valor: "hosting-site=somos", acao: "ok" },
  ]);
  assert.equal(situacaoDoHosting({ hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_PROPAGATING" } }).estado, "emitindo_certificado");
  assert.equal(situacaoDoHosting({ hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", cert: { state: "CERT_ACTIVE" } }).estado, "ativo");
  assert.equal(situacaoDoHosting({ hostState: "HOST_CONFLICT" }).estado, "erro");
  assert.match(situacaoDoHosting({ ownershipState: "OWNERSHIP_MISMATCH" }).erro ?? "", /TXT/);
});

const VITRINE: HostProprio = { host: "furia.com.br", tid: "t1", slug: "furia", tipo: "vitrine", ativos: { vitrine: "furia.com.br", painel: "painel.furia.com.br" } };
const PAINEL: HostProprio = { ...VITRINE, host: "painel.furia.com.br", tipo: "painel" };

test("site: vitrine mostra caminhos curtos e aceita o formato antigo", () => {
  assert.equal(paraInterno(VITRINE, "/"), "/furia");
  assert.equal(paraInterno(VITRINE, "/app.html"), "/furia");
  assert.equal(paraInterno(VITRINE, "/e/abc234"), "/furia/e/abc234");
  assert.equal(paraInterno(VITRINE, "/socio/ingressos"), "/furia/socio/ingressos");
  assert.equal(paraInterno(VITRINE, "/furia/conta"), "/furia/conta"); // link antigo
  assert.equal(paraInterno(VITRINE, "/termos"), "/furia/termos");
  assert.equal(paraInterno(VITRINE, "/convite"), "/convite");
  assert.equal(paraInterno(VITRINE, "/redefinir-senha"), "/redefinir-senha");
  assert.deepEqual(paraVisivel(VITRINE, "/furia"), { host: "furia.com.br", caminho: "/", mesmo: true });
  assert.deepEqual(paraVisivel(VITRINE, "/furia/e/abc234"), { host: "furia.com.br", caminho: "/e/abc234", mesmo: true });
  assert.deepEqual(paraVisivel(VITRINE, "/furia/conta"), { host: "furia.com.br", caminho: "/conta", mesmo: true });
  // painel aberto na vitrine: vai para o domínio do painel
  assert.deepEqual(paraVisivel(VITRINE, paraInterno(VITRINE, "/admin/eventos")), { host: "painel.furia.com.br", caminho: "/eventos", mesmo: false });
  assert.deepEqual(paraVisivel(VITRINE, "/furia/portaria"), { host: "painel.furia.com.br", caminho: "/portaria", mesmo: false });
  // sem domínio do painel: endereço padrão
  const soVitrine = { ...VITRINE, ativos: { vitrine: "furia.com.br" } };
  assert.deepEqual(paraVisivel(soVitrine, "/furia/admin"), { host: null, caminho: "/furia/admin", mesmo: false });
  // páginas gerais e de outra torcida
  assert.deepEqual(paraVisivel(VITRINE, "/"), { host: null, caminho: "/", mesmo: false });
  assert.deepEqual(paraVisivel(VITRINE, "/cadastro"), { host: null, caminho: "/cadastro", mesmo: false });
  assert.deepEqual(paraVisivel(VITRINE, "/outra/e/x"), { host: null, caminho: "/outra/e/x", mesmo: false });
  assert.deepEqual(paraVisivel(VITRINE, "/verificar"), { host: "furia.com.br", caminho: "/verificar", mesmo: true });
});

test("site: painel no subdomínio (raiz = visão geral; /portaria = leitor; /admin/portaria = página Portaria)", () => {
  assert.equal(paraInterno(PAINEL, "/"), "/furia/admin");
  assert.equal(paraInterno(PAINEL, "/eventos"), "/furia/admin/eventos");
  assert.equal(paraInterno(PAINEL, "/eventos/ev1"), "/furia/admin/eventos/ev1");
  assert.equal(paraInterno(PAINEL, "/portaria"), "/furia/portaria");
  assert.equal(paraInterno(PAINEL, "/admin/portaria"), "/furia/admin/portaria");
  assert.equal(paraInterno(PAINEL, "/furia/admin/socios"), "/furia/admin/socios");
  assert.equal(paraInterno(PAINEL, "/termos"), "/termos"); // termos da plataforma (diretoria)
  assert.deepEqual(paraVisivel(PAINEL, "/furia/admin"), { host: "painel.furia.com.br", caminho: "/", mesmo: true });
  assert.deepEqual(paraVisivel(PAINEL, "/furia/admin/eventos"), { host: "painel.furia.com.br", caminho: "/eventos", mesmo: true });
  assert.deepEqual(paraVisivel(PAINEL, "/furia/admin/portaria"), { host: "painel.furia.com.br", caminho: "/admin/portaria", mesmo: true });
  assert.deepEqual(paraVisivel(PAINEL, "/furia/portaria"), { host: "painel.furia.com.br", caminho: "/portaria", mesmo: true });
  assert.deepEqual(paraVisivel(PAINEL, "/entrar"), { host: "painel.furia.com.br", caminho: "/", mesmo: true });
  // página pública aberta no painel: vai para a vitrine
  assert.deepEqual(paraVisivel(PAINEL, paraInterno(PAINEL, "/socio")), { host: "furia.com.br", caminho: "/socio", mesmo: false });
  assert.deepEqual(paraVisivel(PAINEL, "/furia"), { host: "furia.com.br", caminho: "/", mesmo: false });
  // ida e volta: todo caminho curto do painel volta igual
  for (const v of ["/", "/eventos", "/socios", "/admin/portaria", "/portaria", "/dominio"]) assert.equal(paraVisivel(PAINEL, paraInterno(PAINEL, v)).caminho, v);
  for (const v of ["/", "/e/abc234", "/evento/x1", "/associar/mensal", "/pedido/p1", "/ingressos/p1", "/conta", "/socio/assinatura", "/privacidade"]) {
    assert.equal(paraVisivel(VITRINE, paraInterno(VITRINE, v)).caminho, v);
  }
});

test("site: endereços da plataforma não consultam domínio; links para divulgar", () => {
  const conhecidos = ["somosorganizada.com.br", "plataforma.somosorganizada.com.br"];
  for (const h of ["somosorganizada.com.br", "www.somosorganizada.com.br", "plataforma.somosorganizada.com.br", "localhost", "127.0.0.1", "somos-organizada.web.app", "x.firebaseapp.com"]) {
    assert.equal(hostDaPlataforma(h, conhecidos), true, h);
  }
  assert.equal(hostDaPlataforma("furia.com.br", conhecidos), false);
  assert.equal(hostDaPlataforma("painel.vitrine.test", conhecidos), false);
  assert.equal(urlNoDominio(VITRINE.ativos, "/e/abc234"), "https://furia.com.br/e/abc234");
  assert.equal(urlNoDominio(VITRINE.ativos, "/admin"), "https://painel.furia.com.br/");
  assert.equal(urlNoDominio(VITRINE.ativos, "/ingressos/p1?k=z"), "https://furia.com.br/ingressos/p1?k=z");
  assert.equal(urlNoDominio({}, "/e/abc234"), null);
  assert.equal(urlNoDominio(undefined, ""), null);
});
