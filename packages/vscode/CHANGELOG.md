# Changelog

## 1.3.0

- Added `vault://` as a fully interchangeable alias of `obs://` — both schemes are accepted everywhere (URIs, markdown links, `@vault:` / `/vault:` mentions), the file system provider is registered under both schemes, and keybindings work in both. If another extension already owns `vault://`, the extension falls back to `obs://`-only.
- Copy Path now preserves the scheme of the document it is run from: `vault://` documents copy `vault://` URIs; `obs://` and `file://` documents copy canonical `obs://` URIs.
- Opened notes refresh correctly when watched through either scheme.
- Fixed a latent routing bug where uppercase `OBS://` URIs were misrouted in the CLI `inspect` command.
