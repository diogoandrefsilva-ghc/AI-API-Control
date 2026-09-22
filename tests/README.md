# tests

`node tests/ecras.js` — conduz os quatro ecrãs num Chromium a sério, com a
camada de RPC substituída por dados reais da base. Verifica 34 coisas: o
splash esconde-se, o euro medido aparece a "—" sem calibração e com número
depois dela, o 200 vazio é marcado a âmbar mesmo quando o estado é `erro`,
o filtro corta o que deve, a ficha explica o 200 vazio e traz o `detalhe`
em bruto, as janelas sem número são assinaladas, e quem não é o dono cai no
ecrã de sem-acesso.

**Não é dependência da app.** A app não tem build nem npm e isto não muda
isso: o teste é uma ferramenta de quem desenvolve, e o Playwright
instala-se à parte, fora do repo:

```
mkdir -p /tmp/t && cd /tmp/t && npm i playwright
node /caminho/para/tests/ecras.js
```

O caminho do Chromium está escrito no ficheiro — muda-o se o teu estiver
noutro sítio. Os screenshots saem para `/tmp/aic-*.png`.

**Porque é que os dados são falsos e as chamadas são reais.** Entrar a
sério exigia a password do dono, que um teste não pode ter. O que se
substitui é só a rede (`page.route`): o `app.js` que corre é o verdadeiro,
incluindo o `sbInit`, o `sbAposLogin` e os quatro renders. Se partires um
render, isto apanha.
