This is a monorepo consisting of multiple parts. The main part is the `web-app/` which is a tanstack app. The second part is the `database/` which is always running. The third part is the `video-processing-service/` which reacts to messages of video uploads and transforms them to dash. For local development with s3 compatible storage, under `local-s3-compatible-storage/` there is a seaweedfs running.

Generally: This is a greenfield project, feel free to make any breaking changes if you think them necessary.

For the `web-app/`:
Please assume `pnpm dev` is running and do not use `pnpm build`.
The `web-app` project uses streaming ssr. Do not make route loaders async just to await ensureQueryData; trigger ensureQueryData without awaiting/returning it, and do missing-data/notFound handling during render-time query consumption.
For the design of the web app, please be minimalistic and elegant, use the defined colors in src/styles.css.

For the `video-processing-service/`: Please assume docker compose is running this service at all times.

If possible, please try to write top down functions. So the main function is at the top of the file and the called functions in the main function are defined below it.
If you only need a type at one place, do not introduce a new typescript type for it, just use an inline type definition.
Do not define functions that are only used once and consist of one line, just inline them. Only if they are used multiple times or are more complex and abstract real work, define a new function for them.
If you check any invariants, fail hard like in tiger style, if this bug should be fixed by the implementation and cannot happen by other external factors.

Do not delete any comments you do not directly solve. If you refactor take those comments with your refactor and adjust them if necessary.
Do not fix other stuff you encounter on your task, that I did not told you to fix. Just propose that you could fix it after you finished your task.
Ask questions if something is unclear to you.

If you stumble upon something, that was not clear to you or I correct you on something about the project, please propose a change to this file to reflect that correction.
