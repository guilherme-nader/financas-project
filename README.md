# Finanças G&D

App de finanças pessoais do Guilherme e da Débora. Substitui as planilhas: vocês sobem as faturas
e os extratos do mês e o sistema organiza o resto.

## Onde estamos

| Fase | O que entrega | Status |
|---|---|---|
| 1. Base | Login dos dois, contas (corrente, cartão, investimento), categorias, lançamento manual com parcelas e transferências, resumo do mês | ✅ pronta |
| 2. Histórico | Importar as planilhas "Planejamento oficial" e a planilha-modelo | próxima |
| 3. Projeção | Recorrências (financiamento, condomínio, salários) e a visão meses × contas | |
| 4. Importação | ✅ Faturas do cartão XP (CSV) · ✅ Extratos em PDF do Itaú (conta corrente) e do Santander (consolidado) · ✅ Regras, Revisar (um a um ou em grupo), transferências entre contas ligadas sozinhas · ⏳ conta XP (PDF em imagem, OCR), IA gratuita (Groq) | em andamento |
| 5. Orçamento e metas | Limites por categoria e metas com progresso | |

## Como o dinheiro é contado

- **Valores em centavos** (inteiros), com sinal: saída negativa, entrada positiva.
- **Duas datas por lançamento**:
  - `data`: quando a compra aconteceu. Usada em "onde foi o dinheiro" e no orçamento.
  - `dataCaixa`: quando o dinheiro sai de fato. Usada no saldo e na projeção. No cartão, é o vencimento da fatura.
- **Cartão**: compra no dia do fechamento ou depois cai na fatura seguinte. Parcelas vão uma para cada fatura.
  As parcelas futuras ficam como *previstas*.
- **Transferências não são gasto nem renda**: pagamento de fatura, aporte e resgate na XP, Pix entre contas.
  São duas linhas ligadas (uma sai, outra entra) e ficam fora dos totais.
- **Patrimônio** = saldo das contas + investimentos − o que se deve nos cartões.

## Importar uma fatura (cartão XP)

1. Cadastre o cartão em **Mais › Contas** com os dias de fechamento e vencimento.
2. Em **Importar**, escolha o CSV exportado pela XP (`Fatura2026-10-10.csv`). O vencimento vem do nome do arquivo.
3. O app:
   - categoriza pelas regras (`UBER` → Transporte › Uber e 99, `WELLHUB` → Saúde › Academia…);
   - lança as **parcelas futuras** como previstas e as confirma quando chega a fatura seguinte;
   - ignora o que já foi importado (reimportar o mesmo arquivo não duplica);
   - confere se o pagamento listado bate com o total da fatura anterior.
4. O que nenhuma regra conhece vai para **Revisar**. Ao confirmar com "lembrar", vira regra e é aplicado nos outros pendentes iguais.

## Importar extratos de conta (PDF)

Em **Importar › Extrato de conta**, escolha a conta e um ou vários PDFs (vários meses de uma vez).
O banco é reconhecido pelo conteúdo: Itaú ("Extrato conta corrente") e Santander ("Extrato Consolidado Inteligente").

- **Conferência:** saldo do dia anterior + movimentos = saldo informado pelo banco, dia a dia.
- **Pix e TED para vocês mesmos viram transferência.** O nome do titular de cada extrato é aprendido sozinho;
  outros nomes (como o do cônjuge) ficam em **Mais › Nomes nos bancos**. Abreviações ("FULANO B S SOUZA") e nomes cortados são reconhecidos.
- **Salário e rendimento** entram como receita. **Pagamento de fatura, aplicação e resgate** entram como transferência.
- **Transferências entre contas** importadas de arquivos diferentes (Pix que sai de uma e entra na outra, pagamento
  de fatura na conta e no cartão) são ligadas automaticamente.
- **Caixinha:** conta marcada como "Caixinha de terceiros" (futebol, vaquinha) aparece na lista, mas fica fora dos totais.
- PDF que é imagem (impressão de tela) não tem texto e é recusado com uma explicação.

## Rodar localmente

Requisitos: Node 20.9+ e um Postgres (local ou Supabase).

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha o `.env` (veja os comentários nele), depois crie as tabelas e os dados básicos:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Abra http://localhost:3000 e entre com o e-mail e a senha que estão no `.env`.

Para trocar a senha de alguém depois:

```bash
npm run usuario:senha -- email@exemplo.com
```

## Publicar (Vercel + Supabase, plano gratuito)

1. **Supabase**: crie um projeto. Em *Project Settings › Database*, copie a *connection string* do pooler.
2. **Banco**: com essa URL no `DATABASE_URL` do seu `.env`, rode `npm run db:migrate` e `npm run db:seed` uma vez.
3. **Vercel**: importe o repositório. Em *Environment Variables*, cadastre `DATABASE_URL` e `SESSION_SECRET`.
   O segredo deve ser **diferente** do usado localmente.
4. **Deploy**. O site exige login em todas as páginas e não é indexado por buscadores.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm test` | Testes (dinheiro, datas, ciclo da fatura, parcelas) |
| `npm run typecheck` / `npm run lint` | Checagem de tipos e lint |
| `npm run db:generate` | Gera migração depois de mudar `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migrações |
| `npm run db:seed` | Cria pessoas, categorias e usuários (pode rodar de novo) |

## Estrutura

```
src/
  app/
    login/             tela de login e ações de entrar/sair
    (app)/             telas autenticadas: início, lançamentos, contas, categorias…
  acoes/               server actions (gravam no banco)
  componentes/         peças de interface
  db/schema.ts         modelo de dados (Drizzle)
  lib/
    dinheiro.ts        centavos ⇄ "R$ 1.234,56", divisão em parcelas
    datas.ts           datas AAAA-MM-DD sem fuso
    cartao.ts          em qual fatura cai uma compra
    lancamento.ts      um lançamento digitado → linhas no banco
    consultas.ts       leituras (saldos, faturas, resumo do mês)
    dal.ts, sessao.ts  sessão e checagem de login
  proxy.ts             redireciona quem não está logado
scripts/               seed e troca de senha
drizzle/               migrações SQL
```

## Privacidade

- Extratos, faturas e planilhas (`*.ofx`, `*.csv`, `*.pdf`, `*.xlsx`) estão no `.gitignore` e **nunca** vão para o repositório.
- Senhas são guardadas só como hash (bcrypt). A sessão é um cookie assinado, `httpOnly`, válido por 30 dias.
