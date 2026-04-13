# nexus-core validate:conformance — upstream 제약 (v0.4.0 기준)

## 상황

nexus-core 0.4.0 CONSUMING.md와 MIGRATIONS/v0_3_to_v0_4.md는 consumer repo에 `bun run validate:conformance`를 CI 게이트로 추가할 것을 요구한다. 하지만 nexus-core 0.4.0 package.json `files` 배열은 다음만 포함:

```json
["agents", "skills", "vocabulary", "schema", "conformance", "docs", "manifest.json"]
```

`scripts/`가 누락되어 있어 `node_modules/@moreih29/nexus-core/scripts/conformance-coverage.ts`는 npm publish된 tarball에 없다. `bun run node_modules/@moreih29/nexus-core/scripts/conformance-coverage.ts` 실행 시 `Module not found` 에러.

`bin` 필드 미노출 + `scripts` 미publish → consumer는 validator를 직접 실행할 경로가 없음.

## claude-nexus 결정 (v0.4.0 업그레이드 사이클)

- `test/fixtures/`에 JSON fixture 없음 → validator 대상 부재
- validator 실행 불가 + 실익 제한적 → CI 게이트 추가 **skip**
- 향후 custom fixture 도입 시, nexus-core upstream에 다음 중 하나를 제안:
  1. `files` 배열에 `scripts` 추가 (+ `conformance-coverage.ts` publish)
  2. `bin` 필드로 CLI 엔트리 노출 (예: `nexus-validate-conformance`)
  3. consumer가 자체 validator 스크립트를 nexus-core schema를 읽어 구현

## 참고

- nexus-core 저장소: https://github.com/moreih29/nexus-core
- conformance-coverage.ts 소스: https://github.com/moreih29/nexus-core/blob/v0.4.0/scripts/conformance-coverage.ts
- CONSUMING.md upgrade protocol step 6: validator 실행 권고
