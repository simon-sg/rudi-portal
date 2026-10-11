# Fix : traduction d'hôte optionnelle pour les URL de média (apigateway)

## Problème

Sur un déploiement où le storage Rudi tourne nativement sur l'hôte (hors Docker) et où
`apigateway` tourne dans un conteneur Docker séparé, le téléchargement d'un média via
`GET /medias/{globalId}/{mediaId}/dwnl` peut échouer systématiquement (redirection
inattendue, ou toute autre erreur de connexion côté gateway), alors que la ressource
existe bel et bien côté storage.

## Cause racine

Le champ `url` stocké dans `apigateway_data.api` (table lue par
`ApiPathRouteDefinitionLocator` pour construire les routes Spring Cloud Gateway, puis
utilisée telle quelle par `RerouteToRequestUrlFilter` comme hôte de la requête sortante)
est renseigné à la création/mise à jour d'une route avec la valeur de `connector.url`
telle que déclarée par le storage/catalogue.

Sur un nœud dont le storage expose cette URL en `http://localhost:4031/...`, deux
contraintes légitimes entrent en conflit sur ce même champ :

- **Côté Kalim** : le validateur d'URL (`org.apache.commons.validator.routines.UrlValidator`,
  `ALLOW_LOCAL_URLS`) accepte un hôte mono-label comme `localhost`, mais rejette tout
  hôte multi-label dont le TLD n'est pas dans la liste IANA — `host.docker.internal`
  (TLD `internal`) est donc rejeté. `localhost` est le seul choix qui passe cette
  validation.
- **Côté apigateway** : le conteneur ne peut pas atteindre le storage de l'hôte via
  `localhost` (qui, depuis l'intérieur du conteneur, désigne le conteneur lui-même, pas
  l'hôte) — il lui faut `host.docker.internal`.

Aucune des deux parties ne peut changer la valeur de `connector.url` sans casser l'autre.
Un contournement opérationnel (UPDATE SQL ponctuel sur `apigateway_data.api.url` +
redémarrage d'apigateway) corrige les routes déjà en base, mais **chaque nouvelle
création/mise à jour de route recrée le problème**, puisque la valeur d'origine reste
`localhost` par construction.

## Solution

Traduction d'hôte **optionnelle et désactivée par défaut**, appliquée uniquement au
moment où `apigateway` persiste sa propre table de routage — ni le storage, ni Kalim, ni
la valeur `connector.url` exposée aux autres clients ne sont modifiés.

Deux propriétés Spring (vides par défaut = aucun comportement changé) :

```properties
apigateway.url-host-rewrite.from=
apigateway.url-host-rewrite.to=
```

Implémentation : `ApiServiceImpl.rewriteApiUrlBeforeSave()` (appelée dans
`createSimpleApi`/`updateSimpleApi`, juste avant `apiDao.save(...)`), qui délègue à la
méthode pure `ApiServiceImpl.rewriteUrlHost(url, from, to)` (simple remplacement de
sous-chaîne, testée unitairement dans `ApiServiceImplUrlRewriteTU`).

## Activation sur un déploiement Docker Compose type `rudi-out-of-the-box`

Dans la configuration d'apigateway (fichier de propriétés monté, même mécanisme que
`kalim.properties`) :

```properties
apigateway.url-host-rewrite.from=localhost:4031
apigateway.url-host-rewrite.to=host.docker.internal:4031
```

À adapter si le port du storage diffère. Un redémarrage d'apigateway suffit (propriétés
lues au boot). Les routes déjà créées avec l'ancienne valeur ne sont pas corrigées
rétroactivement par ce fix — pour celles-ci, le contournement SQL ponctuel
(`UPDATE apigateway_data.api SET url = replace(url, 'localhost:4031', 'host.docker.internal:4031') WHERE url LIKE '%localhost:4031%';`
puis redémarrage) reste nécessaire une dernière fois après le déploiement de ce fix.

## Portée

Ce fix ne touche que `rudi-microservice-apigateway`. Ni Kalim, ni le storage, ni le
catalogue ne sont modifiés — `connector.url` continue de valoir `localhost` comme
attendu par le validateur Kalim.
