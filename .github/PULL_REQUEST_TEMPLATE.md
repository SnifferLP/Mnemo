## Summary

<!-- What user-visible problem does this change solve? -->

## Changes

<!-- Keep this focused. Mention schema, packaging or privacy implications. -->

## Verification

<!-- List the checks you actually ran and any platform you could not test. -->

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] `cargo test --all-targets`

## Checklist

- [ ] No API keys, credentials, database files or personal data are included.
- [ ] No generated packages, build output or local tool configuration are included.
- [ ] New UI strings are present in both English usage and the German catalogue.
- [ ] Database changes use an append-only migration and preserve existing data.
- [ ] Documentation is updated where needed.
