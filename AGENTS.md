This is a monorepo consisting of three parts. The main part is the `web-app/` which is a tanstack app. The second part is the db which is always running and is defined in the root `docker-compose.yaml`. The third part is the `video-service/` which is a nginx server that serves videos and a hono server (behind the nginx) that accepts video uploads and transforms them to dash. 

Generally: This is a greenfield project, feel free to make any breaking changes if you think them necessary.

For the `web-app/`:
Please assume `pnpm dev` is running and do not use `pnpm build`.
The `web-app` project uses streaming ssr. Do not make route loaders async just to await ensureQueryData; trigger ensureQueryData without awaiting/returning it, and do missing-data/notFound handling during render-time query consumption.

For the `video-service/`: Please assume docker compose is running this service at all times.

Do not delete any comments you do not directly solve.
Do not fix other stuff you encounter on your task, that I did not told you to fix. Just propose that you could fix it now after you finished your task.

If you stumble upon something, that was not clear to you or I correct you on something about the project, please propose a change to this file to reflect that correction.
