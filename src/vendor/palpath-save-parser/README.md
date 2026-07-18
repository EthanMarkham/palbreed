# Palpath save parser

This crate builds the browser-only structured-save reader used by Palpath's
Palworld 1.0 inventory importer. It pins the MIT-licensed `palworld-v1` fork of
`uesave-rs`. Oodle decompression is isolated in the separately lazy-loaded
`ooz-wasm` package. Save bytes stay in the browser.

Build from the repository root:

```powershell
wasm-pack build tools/save-parser --target web --release --out-dir ../../src/vendor/palpath-save-parser
```

The generated package and `.wasm` binary are checked in so ordinary web builds
do not require Rust.
