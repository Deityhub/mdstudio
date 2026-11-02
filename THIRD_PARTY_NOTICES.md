# Third-party notices

mdstudio is MIT licensed (see `LICENSE`). It depends on open-source packages, each under its
own license. `bun run licenses` audits every installed package against the policy in
`scripts/license-policy.ts`; CI runs it on every pull request. Permissive licenses (MIT, ISC, BSD,
Apache-2.0, 0BSD, BlueOak, CC0) pass automatically. The packages below needed a review.

| Package | License | Why it is acceptable |
| --- | --- | --- |
| [elkjs](https://github.com/kieler/elkjs) | EPL-2.0 | Pulled in by Mermaid for diagram layout and loaded unmodified in the browser. EPL-2.0 is weak copyleft: it applies to elkjs itself, not to mdstudio. Its source is available at the link. |
| [khroma](https://github.com/fabiospampinato/khroma) | MIT | Ships an MIT license file but omits the `license` field in `package.json`. |
| [KaTeX](https://github.com/KaTeX/KaTeX) and its fonts | MIT | Vendored in `public/katex` with their license files. The fonts are derived from MathJax's font generation, as KaTeX's font repository notes. |
| [lightningcss](https://github.com/parcel-bundler/lightningcss) | MPL-2.0 | Build-time CSS tooling used by Tailwind. Never shipped to users. |
| [argparse](https://github.com/nodeca/argparse) | Python-2.0 | Permissive PSF license; transitive development dependency. |
| [caniuse-lite](https://github.com/browserslist/caniuse-lite) | CC-BY-4.0 | Browser-support data used at build time. Data by [Alexis Deveria](https://github.com/Fyrd/caniuse), licensed CC-BY-4.0. |

To add an exception, edit `EXCEPTIONS` in `scripts/license-policy.ts` with the reason, and add a row
here in the same pull request.
