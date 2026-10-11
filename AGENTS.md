# Claude Code marketplace 등록 및 설치본 업데이트

이 절차는 실행 승인이 아니다. 사용자 승인, 기존 CLAUDE.md, nearest instructions 및 실행 guard를 따른다.
source·설치·권한 변경은 각각 승인된 범위에서만 수행하고, 미충족 조건은 HOLD로 기록한다.

## 1. 대상과 artifact 확인

- `PROJECT_ROOT`는 승인된 작업 루트, `MARKETPLACE_SOURCE`는 실제 등록 source다.
- `SCOPE`는 확인된 승인 scope, `PLUGIN_ID`는 `<plugin-name>@<marketplace-name>`이다.
- `.claude-plugin/marketplace.json`의 metadata `name`과 해당 plugin `name`을 확인한다.
- 두 name이 context-mode인 경우 식별자는 `context-mode@context-mode`다.
- 등록 source(directory/GitHub)와 catalog의 plugin entry source는 별개다. fork push만으로 directory 설치본이 갱신되지 않는다.
- 기존 scope/version/install path, accepted commit과 exact inventory/hash, 독립 검증 결과를 확인한다.
- `plugin.json` version이 authoritative다. 기존 version-sync의 10 TARGETS/12 version fields lockstep과 승인된 artifact identity를 검증한다. `1.7.0`은 사용자 fork의 배포 identity이며 upstream 공식 release/npm 배포라고 표현하지 않는다.
- computed version이 같으면 cache skip 가능성이 있다. version만 올리거나 exit 0만 보고 새 bytes 배포를 PASS로 처리하지 않는다.
- accepted runtime/build commit과 documentation HEAD를 구분한다. 문서 변경만으로 bundle/version을 다시 올리지 않는다.

## 2. 승인·백업·보존 gate

- 실제 source/cache/dependency/registry 영향과 owner, type/parent containment, ACL/flags를 확인한다.
- exact 변경 파일의 expected-old identity/hash, 새 경로의 expected-absent, 승인된 metadata를 기록한다.
- 새 독립 위치에 narrow backup과 ABSENT tombstone을 확보한다. 전체 tree/cache/home 백업·교환으로 확대하지 않는다.
- 협력적 writer/read-free 구간을 확보한다. 다른 세션을 강제 종료하거나 half-published source를 실행하지 않는다.
- protected 파일은 정당한 owner가 원래 metadata를 보존해 exact 파일만 backup/replace한다. agent는 privileged script/command를 제공하거나 실행하지 않는다.
- 기존 scope/plugin entries, source dependencies, old cache payload와 extras를 보존한다. extras/loader/copy 영향이 미확인되면 HOLD다.
- blanket 삭제/chown/chmod, global safe.directory, 기존 cache patch, registry/settings 전체 재작성은 금지한다.
- settings 변경이나 dependency 권한 수정이 필요하면 별도 승인 또는 HOLD다. 백업은 변경 권한을 부여하지 않는다.

## 3. 등록·source 갱신·공식 update

현재 CLI의 read-only `--help`와 공식 문서를 확인한다. add도 dependency 설치를 유발할 수 있는 변경 작업이다.
신규 등록/설치에만, 동일 이름 충돌이 없고 source와 explicit scope가 승인된 경우 다음을 사용한다.

```sh
claude plugin marketplace add "$MARKETPLACE_SOURCE" --scope "$SCOPE"
claude plugin install "$PLUGIN_ID" --scope "$SCOPE"
```

- add/install 기본 user와 update 기본 auto-detect를 신뢰해 scope를 생략하지 않는다. managed는 관리 주체 승인 대상이다.
- 기본 공급 경로는 **검증된 fork remote exact commit → 별도 빈 위치의 fresh fetch/export → 전체 tracked paths/modes/hashes 일치 → 기존 directory marketplace 안의 새 relative plugin payload → 공식 설치**다. 로컬 export에서 version만 바꾼 것으로 remote 배포를 완료했다고 하지 않는다.
- 기존 directory 등록을 유지한다. 승인된 새 payload `plugins/context-mode-1.7.0`과 catalog plugin source `./plugins/context-mode-1.7.0`, entry.version `1.7.0`을 expected-absent/보존 gate 뒤 게시한다. 기존 root-owned .git/hooks/node_modules를 교체하거나 Git safe.directory/권한을 바꾸지 않는다.
- exact CLI binary를 사용해 catalog validate와 same-directory marketplace add의 실제 결과를 확인한다. user1 및 기존 local16은 각각 승인된 scope/실제 project cwd에서 context-mode만 공식 install/update한다. CLI gitCommitSha가 오래되거나 없을 수 있으므로 directory source/version/전체 payload hash를 content authority로 검증하며 registry SHA를 직접 수정하지 않는다.
- 아래 **GitHub immutable pin은 기본 local relative source와 다른 별도 대안**이다. directory 등록을 유지한 catalog source-only immutable pin은 **별도 actual 승인**이 있을 때만 선택한다.
- 해당 selected entry만 `source: { source: "github", repo: "<approved-owner/repo>", sha: "<accepted-40-hex-SHA>" }`로 변경한다.
- SHA는 검증·push·readback된 40자리 immutable commit이어야 한다. moving branch/현재 HEAD로 대체하지 않는다.
- catalog의 비대상 필드와 등록 directory를 보존하고 official validation을 확인한다. remote의 `plugin.json` version/hash를 최종 기준으로 검증한다.
- source-only pin은 directory 복원이나 native 준비를 대신하지 않는다. source 전환의 future update 영향도 승인 범위에 포함한다.
- 동일 이름 source 충돌을 remove/add로 우회하지 않는다. 마지막 declaration 제거는 cache/plugin/data 삭제를 유발할 수 있다.
- 등록 source·catalog 정합 및 모든 설치 gate가 통과하면 기존 승인 scope만 명시해 공식 update를 수행한다.

```sh
claude plugin update "$PLUGIN_ID" --scope "$SCOPE" --json
```

`--yes`/`-y`는 사용하지 않는다. `--accept-command`는 exact 변경 command의 별도 승인 없이는 사용하지 않는다.
public GitHub source의 `Permission denied (publickey)`는 SSH 인증 실패이며 tool permission/guard denial과 다르다.
공식 지원 transport remedy가 승인된 동일 repo/SHA에 적용될 때만 해당 process에서 HTTPS preference를 사용한다.

```sh
CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin update "$PLUGIN_ID" --scope "$SCOPE" --json
```

credentials/SSH 설정/global Git 설정을 바꾸지 않는다. fresh expected-current를 확인한 제한 retry 뒤 새 실패는 STOP한다.

## 4. 설치 검증·native 준비·active reload

- **Filesystem:** 선택 registry의 scope/version/path/commit과 실제 manifest/hash를 accepted artifact에 대조한다.
- CLI의 정상 metadata bookkeeping도 exact diff로 기록한다. 선택 entry의 허용된 변화와 다른 항목/payload 보존을 구분한다.
- **Dependency:** actual loader path가 in-place인지 새 copied cache인지 먼저 확인한다. 자동 설치/lock 지원과 copy 영향은 실제 결과로 판정한다.
- lifecycle scripts 비활성 dependency 설치는 native better-sqlite3 binding 완성을 보장하지 않는다.
- native 준비는 별도 승인된 새 owned cache `Q` 및 독립 staging에서만 수행한다. accepted lock의 정확한 version/closure와 prebuild provenance 또는 declared native build를 확인한다.
- old source/node_modules/cache에는 쓰지 않는다. symlink/hardlink로 연결하지 않으며 ABI/code signing을 검증한다. 기존 protected dependency 쓰기가 필요하면 HOLD다.
- **Standalone:** HOME/config/storage뿐 아니라 launcher root·cacheParent·관련 plugin filesystem도 실제 설치/cache tree와 분리된 새 독립 owned fixture clone으로 구성한다. actual loader/root/cacheParent와 관련 경로가 fixture 경계 안이며 실제 local cache를 참조하지 않는지 실행 전에 확인한다. actual cache를 가리키는 symlink/hardlink는 금지하며 격리를 입증하지 못하면 smoke도 HOLD/중단한다. 격리된 MCP initialize/tools, runtime/FTS5/startup FOLLOW_CWD smoke 전후 synthetic old registry records와 sibling cache payload의 보존을 비교한다.
- raw prompt/token/사용자 DB/private config 내용은 접근·출력·기록하지 않는다. actual platform 결과는 수행한 경우에만 PASS다.
- **Reload:** 승인된 filesystem/dependency 검증과 격리 standalone의 old registry records/old cache payload 보존 및 smoke가 모두 PASS이고 보존 위반·새 regression·미충족 gate가 없을 때만 사용자가 해당 세션에서 `/reload-plugins`를 실행한다. FAIL/HOLD/unsafe이면 reload하지 않고 결과와 단계를 기록하여 중단한다. `--force`는 영향 검토와 별도 사용자 action이 필요하다.
- **Active:** 실제 새 MCP tools registry와 synthetic smoke/cwd/env를 확인해야 PASS다. filesystem/standalone 성공이나 reconnect만으로 active/env 갱신을 인증하지 않는다.
- startup FOLLOW_CWD와 같은 세션의 live-root 이동은 별개다. 미구현/미검증 기능 또는 marketplace 재누락 원인 해결을 단정하지 않는다.

## 5. 실패·rollback·근거

- guard denial은 원문과 단계를 기록하고 STOP한다. 명시된 plain/separate 안전 대안만 따르며 wrapper/다른 도구/다른 세션으로 우회하지 않는다.
- Git은 승인된 현재 cwd에서 plain separate 명령만 사용한다. `git stash`/`git stash pop`은 어디서도 사용하지 않는다. `_tasks`는 이동·삭제·비우기·symlink 변환하지 않는다.
- CLAUDE.md의 routing을 따른다. ctx 미노출만으로 임의 native fallback을 만들지 않는다. 해당 작업 정본의 명시 예외가 확인되지 않으면 HOLD다.
- rollback은 별도 승인과 writer-free 구간에서 expected-current 일치 시 exact 변경만 복원한다. 다른 writer drift를 덮어쓰지 않는다.
- source rollback과 설치 registry rollback은 별개다. 전체 registry/settings 복원, remove/uninstall, cache 삭제로 되돌리지 않는다.
- source publication / CLI update / filesystem / standalone / 사용자 reload / active 결과를 각각 PASS·HOLD·미실행으로 보고한다.

공식 근거: [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference), [install](https://code.claude.com/docs/en/plugins/install), [loading](https://code.claude.com/docs/en/plugins/loading), [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), [troubleshooting](https://code.claude.com/docs/en/plugins/troubleshooting).
실행별 accepted artifact·owner·preflight·transport·검증 보고서는 로컬 `_tasks`에 존재하는 경우 참고하며, 해당 세션 자료를 모든 미래 작업의 필수 파일로 요구하지 않는다.
