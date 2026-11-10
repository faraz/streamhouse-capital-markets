# Streamhouse exposure desk

A live Confluent Cloud demo for a seller talk. Start from `HANDOFF.md`.

- Before writing Flink SQL or driving the `confluent` CLI, read `docs/flink-dialect-traps.md`.
- Is the stack up: `scripts/verify.sh --quick`. Rebuild with `scripts/regenerate.sh`, clear with `scripts/clear.sh`.
- After a UI change, look at the render with `scripts/shoot.sh`, against the local Worker (`npm run build && npx wrangler dev --port 8787 --local`). Screenshots have caught bugs the tests passed.
- Spec and tickets: `.scratch/exposure-desk/`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.
- Ad-hoc commands run in zsh, which passes `$FLAGS` as one argument: write each flag out, or use an array with `"${FLAGS[@]}"`.
- The presenter's events (fill, reset, verify's probe) reach `client_exposure` in one exactly-once commit, up to a minute: a 5,000-lot fill took 34 s on 2026-11-10. Feed records go through `positions` first and take two, about 90 s. A gap that size is the pipeline working.
- The stack stays up until the talk. Start a run over with the screen's Reset, not a rebuild; a rebuild is for a broken stack (ADR 0005).
