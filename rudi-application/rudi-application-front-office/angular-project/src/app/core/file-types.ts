export enum FileTypes {
    TEXT_CSV = 'text/csv',
    GEO_JSON = 'application/geo+json',
    VND_MS_EXCEL = 'application/vnd.ms-excel',
    // XLSX moderne (Office Open XML) : rudi-node-write l'assigne correctement à tout
    // fichier .xlsx, mais il manquait ici, donc l'onglet "Données tabulaires" ne
    // s'affichait jamais pour ce type de fichier (silencieusement).
    VND_OPENXML_SPREADSHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
