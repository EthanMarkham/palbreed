# Third-party notices

The production build generates `THIRD_PARTY_NOTICES.txt` and a separate license
file for every installed production package recorded by `package-lock.json`.
The build fails if a production package contains neither a license file nor a
declared license identifier.

Material non-npm inputs:

- PalCalc database v26: MIT, Copyright 2024 Tyler Camp. The generated breeding
  artifact records source attribution and checksums. Palworld game content
  remains the property of Pocketpair and the relevant rights holders.
- `uesave-rs` commit `11b2b4907ef6f34337135faed783fef2e450fcaf`:
  MIT. It is compiled into the local save-parser WASM artifact.
- `ooz-wasm` 2.0.0: GPL-3.0-or-later. The release build emits the GPL text
  from the exact installed package. Public distribution also requires complete
  corresponding source for the deployed object code and a verified rights
  chain for the underlying native `ooz` source.

This notice records engineering evidence; it is not a legal opinion or a grant
of rights in Palworld content.
