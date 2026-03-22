FROM nginx:1.29.6-trixie

# create self signed certificate for testing purposes
RUN apt-get update && apt-get install -y openssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/nginx.key -out /etc/ssl/certs/nginx.crt -subj "/CN=localhost" && \
    rm -rf /var/cache/apk/*

COPY configuration/nginx.conf /etc/nginx/nginx.conf
COPY configuration/conf.d/default.conf /etc/nginx/conf.d/default.conf
