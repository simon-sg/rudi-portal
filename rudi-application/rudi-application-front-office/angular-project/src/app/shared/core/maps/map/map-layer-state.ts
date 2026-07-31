import {Media} from 'micro_service_modules/api-kaccess';

/**
 * Palette catégorielle standard (10 couleurs) attribuée aux couches vectorielles (WFS/GeoJSON) du
 * panneau de couches, dans l'ordre où elles apparaissent : chaque candidat vectoriel se voit
 * attribuer LAYER_COLOR_PALETTE[i % LAYER_COLOR_PALETTE.length], les candidats raster (WMS/WMTS) et
 * non vectoriels n'en consommant pas.
 */
export const LAYER_COLOR_PALETTE: string[] = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
];

/**
 * État d'une couche cartographique d'un JDD affichable sur la carte (une entrée par candidat du
 * panneau de couches de l'onglet Carte). Piloté par MapTabComponent et appliqué à la carte par
 * MapComponent via son @Input() mediaLayers.
 */
export interface MapLayerState {
    media: Media;
    visible: boolean;
    opacity: number;
    hasError: boolean;
    /** Couleur hexadécimale de la couche sur la carte, null pour les couches raster (WMS/WMTS). */
    color: string | null;
}
