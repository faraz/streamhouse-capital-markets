# Streamhouse exposure desk

A live Confluent Cloud demo for a seller talk. Start from `HANDOFF.md`.

- Before writing Flink SQL or driving the `confluent` CLI, read `docs/flink-dialect-traps.md`.
- Is the stack up: `scripts/verify.sh --quick`. Rebuild with `scripts/regenerate.sh`, clear with `scripts/clear.sh`.
- After a UI change, look at the render with `scripts/shoot.sh`, against the local Worker (`npm run build && npx wrangler dev --port 8787 --local`). Screenshots have caught bugs the tests passed.
- Spec and tickets: `.scratch/exposure-desk/`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.
- Ad-hoc commands run in zsh, which passes `$FLAGS` as one argument: write each flag out, or use an array with `"${FLAGS[@]}"`.
- A produced record reaches the served tables about 90 seconds later (two exactly-once commits). A gap that size is the pipeline working.
