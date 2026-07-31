import {Component, Input, OnInit} from '@angular/core';
import {MatCard} from '@angular/material/card';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatIcon} from '@angular/material/icon';
import {MatSlider, MatSliderThumb} from '@angular/material/slider';
import {MatTooltip} from '@angular/material/tooltip';
import {FileTypes} from '@core/file-types';
import {DataSetAccessService} from '@core/services/data-set/data-set-access.service';
import {DisplayMapService} from '@core/services/data-set/display-map.service';
import {KonsultMetierService} from '@core/services/konsult-metier.service';
import {LogService} from '@core/services/log.service';
import {MAP_CONNECTOR_PARAMETERS_REQUIRED} from '@core/services/map/map-connector-required-parameters';
import {TranslatePipe} from '@ngx-translate/core';
import {ErrorBoxComponent} from '@shared/core/common/error-box/error-box.component';
import {LoaderComponent} from '@shared/core/common/loader/loader.component';
import {MapComponent} from '@shared/core/maps/map/map.component';
import {MapLayerState} from '@shared/core/maps/map/map-layer-state';
import {ConnectorConnectorParameters, Media, MediaFile, Metadata} from 'micro_service_modules/api-kaccess';
import {LayerInformation} from 'micro_service_modules/konsult/konsult-model';
import {switchMap} from 'rxjs/operators';
import MediaTypeEnum = Media.MediaTypeEnum;

@Component({
    selector: 'app-map-tab',
    templateUrl: './map-tab.component.html',
    styleUrls: ['./map-tab.component.scss'],
    imports: [
        MatCard, LoaderComponent, MapComponent, ErrorBoxComponent, TranslatePipe,
        MatCheckbox, MatIcon, MatTooltip, MatSlider, MatSliderThumb
    ]
})
export class MapTabComponent implements OnInit {

    @Input()
    metadata: Metadata;

    @Input()
    mediaToDisplay: Media;

    /**
     * Liste des médias cartographiables candidats (GeoJSON FILE ou SERVICE WMS/WFS/WMTS) pour le
     * panneau de couches au-dessus de la carte. Fournie par DetailComponent
     * (DetailComponent.mapMediaCandidates). Si elle contient 0 ou 1 élément, le panneau n'est pas
     * affiché (comportement identique à avant ce lot).
     */
    @Input()
    candidates: Media[] = [];

    /** Utilisé par le template pour distinguer le libellé FILE (extension) du libellé SERVICE (contrat). */
    readonly mediaType = MediaTypeEnum;

    /**
     * États des couches cartographiables (un par candidat), transmis à app-map via
     * [mediaLayers]. Toute mutation (case cochée/décochée, opacité) remplace la référence du
     * tableau afin que ngOnChanges de MapComponent se déclenche (Angular ne détecte pas les
     * mutations internes d'un @Input() array).
     */
    layerStates: MapLayerState[] = [];

    isMapLoading: boolean;
    isErrorAccess: boolean;
    isErrorServer: boolean;

    baseLayers: LayerInformation[] = [];

    constructor(
        private readonly datasetAccessService: DataSetAccessService,
        private readonly displayMapService: DisplayMapService,
        private readonly konsultMetierService: KonsultMetierService,
        private readonly logService: LogService
    ) {
    }

    ngOnInit(): void {
        this.layerStates = this.buildInitialLayerStates();
        if (this.metadata && this.mediaToDisplay) {
            this.isMapLoading = true;
            this.datasetAccessService.hasAccess(this.metadata).pipe(
                switchMap((hasAccess: boolean) => {
                    this.isErrorAccess = !hasAccess;
                    return this.displayMapService.getDatasetBaseLayers();
                })
            ).subscribe({
                next: (baseLayers: LayerInformation[]) => {
                    this.baseLayers = baseLayers;
                    this.isMapLoading = false;
                },
                error: (e) => {
                    this.logService.error(e);
                    this.isMapLoading = false;
                }
            });
        }
    }

    /**
     * Vrai si la carte ne peut pas être affichée du tout : aucun candidat cartographiable, ou tous
     * les candidats en erreur (connector_parameters incomplets). Un seul candidat en erreur ne
     * bloque plus les autres couches (géré ligne par ligne dans le panneau de couches).
     */
    get hasMediaError(): boolean {
        return this.layerStates.length === 0 || this.layerStates.every(state => state.hasError);
    }

    /**
     * Bascule la visibilité de la couche d'un candidat (par media_id). Produit un nouveau tableau
     * layerStates (remplacement de référence) pour que MapComponent.ngOnChanges réagisse.
     * @param mediaId media_id du candidat concerné
     */
    toggleLayerVisibility(mediaId: string): void {
        this.layerStates = this.layerStates.map(state =>
            state.media.media_id === mediaId
                ? {...state, visible: state.hasError ? false : !state.visible}
                : state
        );
    }

    /**
     * Change l'opacité de la couche d'un candidat (par media_id). Produit un nouveau tableau
     * layerStates (remplacement de référence) pour que MapComponent.ngOnChanges réagisse.
     * @param mediaId media_id du candidat concerné
     * @param opacity opacité en fraction 0 à 1
     */
    setLayerOpacity(mediaId: string, opacity: number): void {
        this.layerStates = this.layerStates.map(state =>
            state.media.media_id === mediaId
                ? {...state, opacity}
                : state
        );
    }

    /**
     * Construit l'état initial des couches depuis les candidats : toutes masquées à opacité 1, sauf
     * exactement une visible — celle qui correspond à mediaToDisplay si elle est affichable, sinon
     * la première sans erreur (un candidat en erreur ne peut pas être visible : sa case est forcée
     * décochée dans le panneau).
     * @private
     */
    private buildInitialLayerStates(): MapLayerState[] {
        const states: MapLayerState[] = this.candidates.map(candidate => ({
            media: candidate,
            visible: false,
            opacity: 1,
            hasError: this.computeMediaError(candidate)
        }));

        let defaultIndex = -1;
        if (this.mediaToDisplay != null) {
            defaultIndex = this.candidates.findIndex(candidate => candidate.media_id === this.mediaToDisplay.media_id);
        }
        const defaultState = defaultIndex >= 0 ? states[defaultIndex] : null;
        if (defaultState == null || defaultState.hasError) {
            defaultIndex = states.findIndex(state => !state.hasError);
        }
        if (defaultIndex >= 0) {
            states[defaultIndex].visible = true;
        }
        return states;
    }

    /**
     * Fonction permettant de retourner l'extension du fichier, utilisee pour le libelle du
     * panneau de couches pour les medias FILE sans media_name.
     */
    getMediaFileExtension(media: Media): string {
        return this.konsultMetierService.getMediaFileExtension(media);
    }

    /**
     * Verifie si le media donne peut etre affiche sur la carte.
     * - Un GeoJSON telecharge (media FILE) se rend directement depuis connector.url : il n'a jamais
     *   de connector_parameters et ne doit pas etre bloque.
     * - Un media SERVICE (WMS/WFS/WMTS...) a besoin des 4 cles MAP_CONNECTOR_PARAMETERS_REQUIRED pour
     *   construire sa requete GetMap/GetFeature.
     * Remplace l'ancien DetailComponent.handleMetadataProperties() (calcule une seule fois sur
     * available_formats[0] au chargement du JDD, cf. bug D4a de PLAN_PR_RUDI_TABLEAU_CARTE.md) : la
     * verification est maintenant portee par le composant qui affiche reellement le media, sur le
     * media reellement selectionne, et rejouee a chaque changement de selection.
     * @private
     */
    private computeMediaError(media: Media): boolean {
        const mediaFile = media as MediaFile;
        if (mediaFile.file_type === FileTypes.GEO_JSON) {
            return false;
        }
        const connectorParameters: ConnectorConnectorParameters[] = media.connector?.connector_parameters;
        return !connectorParameters || !this.hasAllRequiredKeys(connectorParameters, MAP_CONNECTOR_PARAMETERS_REQUIRED);
    }

    // Verification que toutes les cles obligatoires sont presentes et valides
    private hasAllRequiredKeys(connectorParameters: ConnectorConnectorParameters[], requiredKeys: string[]): boolean {
        return requiredKeys.every(requiredKey =>
            connectorParameters.some(obj => this.isValidObject(obj) && obj.key === requiredKey)
        );
    }

    // Validation d'un objet
    private isValidObject(obj: any): boolean {
        return typeof obj.key === 'string' && 'value' in obj;
    }
}
