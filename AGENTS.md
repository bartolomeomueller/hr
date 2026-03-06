Please assume `pnpm dev` is running and do not use `pnpm build`.

This is a greenfield project, so feel free to make any breaking changes if you think them necessary.

This project uses streaming ssr. Do not make route loaders async just to await ensureQueryData; trigger ensureQueryData without awaiting/returning it, and do missing-data/notFound handling during render-time query consumption.

If you stumble upon something or I correct you on something about the project, please propose a change to this file to reflect that correction.
