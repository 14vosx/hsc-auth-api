# Player Bunker Production Season Alignment — 2026-08-05

## Escopo

Registro da correção de configuração realizada em produção para o serviço `hsc-auth-api` no AWS Lightsail. Nenhuma alteração foi realizada em código de aplicação, contrato de API, schema de banco de dados ou contrato de ETL.

## Sintoma

As respostas autenticadas do Bunker (`GET /player/bunker/summary`) expunham a nota de fallback:
`season_artifact_slug_mismatch`

A Season ativa retornada pela Auth API era:
- slug: `s2-2026`
- name: `Season 02`
- status: `active`

A configuração persistente do Bunker ainda referenciava:
`s01-2026`

## Causa

A variável de ambiente `PLAYER_BUNKER_ACTIVE_SEASON_SLUG` divergia do slug da Season ativa no banco de dados (`activeSeason.slug`). Em razão disso, a rota retornava seu fallback defensivo antes de tentar ler o artifact de player da Season.

A ausência de partidas válidas na Season 02 não possuía qualquer relação com esse descasamento de configuração.

## Correção operacional

A configuração persistente no systemd e a configuração de ambiente da aplicação foram ambas atualizadas de:
`s01-2026`

para:
`s2-2026`

Backups das configurações foram criados antes das alterações, o daemon do systemd foi recarregado (`systemctl daemon-reload`) e apenas o serviço `hsc-auth-api` foi reiniciado. Caminhos exatos de backup e valores secretos de configuração foram omitidos deste registro.

## Validação

Resultados verificados em produção após a aplicação da correção:

- service state: `active`
- effective `PLAYER_BUNKER_ACTIVE_SEASON_SLUG`: `s2-2026`
- database readiness check: `passed`
- active Season slug: `s2-2026`
- `configuredMatchesActive`: `true`
- `artifactRootConfigured`: `true`
- `artifactResult.reason`: `not_found`
- `expectedRouteNote`: `not_found`

O resultado `not_found` é o comportamento esperado pois a Season 02 ainda não havia produzido um artifact de player materializado pelo ETL para o SteamID auditado. O SteamID real foi omitido por segurança.

## Resultado

- `season_artifact_slug_mismatch` resolvido;
- nenhuma correção de código-fonte foi necessária;
- nenhuma release de software foi necessária;
- a versão de software implantada permanece `v0.4.13`;
- o próximo ponto de validação ocorrerá após a primeira partida válida da Season 02 ser processada pelo ETL;
- estado futuro esperado: `season_player_artifact_connected`.

## Segurança

Nenhuma credencial, cookie, token, senha de banco de dados, IP de servidor ou SteamID real foi registrado neste documento.
