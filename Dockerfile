# Lions-Game (Galgenmaennchen) - statische Webseite mit nginx ausliefern
FROM nginx:alpine

# Standard-Inhalt von nginx entfernen
RUN rm -rf /usr/share/nginx/html/*

# Dateien an die Pfade kopieren, die index.html erwartet
COPY index.html /usr/share/nginx/html/index.html
COPY style.css  /usr/share/nginx/html/css/style.css
COPY script.js  /usr/share/nginx/html/js/script.js

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
