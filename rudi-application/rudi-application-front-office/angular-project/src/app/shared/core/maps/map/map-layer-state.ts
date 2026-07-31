import {Media} from 'micro_service_modules/api-kaccess';

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
}
