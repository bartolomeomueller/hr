Please assume `pnpm dev` is running and do not use `pnpm build`.

This is a greenfield project, feel free to make any breaking changes if you think them necessary.

This project has two services: `web-app` which is the main app and `video-service` which only holds an upload api for video files and transforms them to dash.

The `web-app` project uses streaming ssr. Do not make route loaders async just to await ensureQueryData; trigger ensureQueryData without awaiting/returning it, and do missing-data/notFound handling during render-time query consumption.

If you stumble upon something, that was not clear to you or I correct you on something about the project, please propose a change to this file to reflect that correction.
