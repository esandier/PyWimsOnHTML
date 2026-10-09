# Serveur local du compilateur, lancé par run-local.ps1 : le serveur de fichiers de Python, qui
# interdit en plus le cache du navigateur (SPECIFICATION.md, § 11.1).
# Pourquoi : http.server envoie la date de modification de chaque fichier, et le navigateur en déduit
# qu’il peut garder le fichier un moment sans le redemander. Après une modification du moteur, il
# servait donc d’anciennes versions de certains scripts, mélangées aux nouvelles : une nouveauté
# n’apparaissait pas, sans aucun message. Solution écartée : demander de recharger avec Ctrl+F5, qu’on
# oublie, et qui ne suffit pas pour les fichiers que le compilateur lit lui-même (fetch).
# Usage : python local-server.py PORT RACINE
import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port, root = int(sys.argv[1]), sys.argv[2]
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
