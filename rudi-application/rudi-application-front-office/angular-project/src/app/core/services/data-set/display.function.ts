import {Observable, Observer} from 'rxjs';

/**
 * Effectue le téléchargement du Blob pour récupérer son contenu en mémoire côté front
 * @param blob le blob a télécharger
 * @private
 */
export function readFile(blob: Blob): Observable<ArrayBuffer> {
    return new Observable<ArrayBuffer>((observer: Observer<ArrayBuffer>) => {
        const reader = new FileReader();

        reader.onload = (event: ProgressEvent<FileReader>) => {
            observer.next(event.target.result as ArrayBuffer);
            observer.complete();
        };

        reader.onerror = (event: ProgressEvent<FileReader>) => {
            observer.error(event);
        };

        reader.readAsArrayBuffer(blob);
    });
}

export type TypeCellule = 'vide' | 'nombre' | 'date' | 'texte';

/**
 * Type simplifié d'une valeur de cellule SheetJS, pour la détection d'en-tête.
 */
export function typeCellule(valeur: unknown): TypeCellule {
    if (valeur === undefined || valeur === null || valeur === '') {
        return 'vide';
    }
    if (valeur instanceof Date) {
        return 'date';
    }
    if (typeof valeur === 'number') {
        return 'nombre';
    }
    return 'texte';
}

/**
 * Détection heuristique d'une ligne d'en-tête dans un tableau de lignes brutes (issu de
 * `utils.sheet_to_json(worksheet, {header: 1})`) : compare, colonne par colonne, le type de la
 * première ligne à celui, s'il est homogène, des lignes suivantes. Inspirée de
 * `csv.Sniffer.has_header` (bibliothèque standard Python).
 *
 * En cas d'ambiguïté (aucune colonne typée de façon homogène en nombre/date), on suppose qu'il y a
 * un en-tête : c'est le cas de la grande majorité des jeux de données moissonnés par ce pipeline.
 */
export function detecterLigneEnTete(lignes: unknown[][], tailleEchantillon = 20): boolean {
    if (lignes.length < 2) {
        return true;
    }

    const premiereLigne = lignes[0];
    const lignesEchantillon = lignes.slice(1, 1 + tailleEchantillon);

    let votesPour = 0;
    let votesContre = 0;

    premiereLigne.forEach((valeurEnTete, colonne) => {
        const typesColonne = lignesEchantillon
            .map((ligne) => typeCellule(ligne[colonne]))
            .filter((type) => type !== 'vide');

        if (typesColonne.length === 0) {
            return;
        }

        const typeHomogene = typesColonne.every((type) => type === typesColonne[0]) ? typesColonne[0] : null;
        if (typeHomogene === null || typeHomogene === 'texte') {
            return;
        }

        const typeEnTete = typeCellule(valeurEnTete);
        if (typeEnTete === typeHomogene) {
            votesContre++;
        } else {
            votesPour += typeEnTete === 'texte' ? 2 : 1;
        }
    });

    if (votesPour === 0 && votesContre === 0) {
        return true;
    }
    return votesPour >= votesContre;
}
