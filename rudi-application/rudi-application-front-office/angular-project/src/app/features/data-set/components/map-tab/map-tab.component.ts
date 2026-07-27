import {Component, Input, OnInit} from '@angular/core';
import {MatCard} from '@angular/material/card';
import {MatOption} from '@angular/material/core';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatSelect, MatSelectChange} from '@angular/material/select';
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
import {ConnectorConnectorParameters, Media, MediaFile, Metadata} from 'micro_service_modules/api-kaccess';
import {LayerInformation} from 'micro_service_modules/konsult/konsult-model';
import {switchMap} from 'rxjs/operators';
import MediaTypeEnum = Media.MediaTypeEnum;

@Component({
    selector: 'app-map-tab',
    templateUrl: './map-tab.component.html',
    styleUrls: ['./map-tab.component.scss'],
    imports: [MatCard, LoaderComponent, MapComponent, ErrorBoxComponent, TranslatePipe, MatFormField, MatLabel, MatSelect, MatOption]
})
export class MapTabComponent implements OnInit {

    @Input()
    metadata: Metadata;

    @Input()
    mediaToDisplay: Media;

    /**
     * Liste des médias cartographiables candidats (GeoJSON FILE ou SERVICE WMS/WFS/WMTS) pour le
     * sélecteur de fichier au-dessus de la carte. Fournie par DetailComponent
     * (DetailComponent.mapMediaCandidates). Si elle contient 0 ou 1 élément, le sélecteur n'est pas
     * affiché (comportement identique à avant ce lot).
     */
    @Input()
    candidates: Media[] = [];

    /** Utilisé par le template pour distinguer le libellé FILE (extension) du libellé SERVICE (contrat). */
    readonly mediaType = MediaTypeEnum;

    /** Le média actuellement affiché, initialisé depuis mediaToDisplay puis piloté par le sélecteur. */
    selectedMedia: Media;

    isMapLoading: boolean;
    isErrorAccess: boolean;
    isErrorServer: boolean;

    /**
     * Vrai si le média sélectionne ne peut pas être affiché sur la carte (connector_parameters
     * manquants/incomplets pour un média SERVICE). Remplace l'ancien DetailComponent.mapHasError,
     * recalculé au chargement ET à chaque changement de sélection (voir computeMediaError).
     */
    hasMediaError = false;

    baseLayers: LayerInformation[] = [];

    constructor(
        private readonly datasetAccessService: DataSetAccessService,
        private readonly displayMapService: DisplayMapService,
        private readonly konsultMetierService: KonsultMetierService,
        private readonly logService: LogService
    ) {
    }

    ngOnInit(): void {
        if (this.metadata && this.mediaToDisplay) {
            this.selectedMedia = this.mediaToDisplay;
            this.hasMediaError = this.computeMediaError(this.selectedMedia);
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
     * Declenche par le selecteur de fichier au-dessus de la carte, quand le JDD propose plusieurs
     * medias cartographiables. app-map reagit tout seul au changement de son @Input() media (voir
     * MapComponent.ngOnChanges) : ici on met juste a jour la selection et on revalide les
     * connector_parameters du nouveau media.
     */
    onMediaSelected(event: MatSelectChange): void {
        const media: Media = event.value;
        if (media === this.selectedMedia) {
            return;
        }
        this.selectedMedia = media;
        this.hasMediaError = this.computeMediaError(media);
    }

    /**
     * Fonction permettant de retourner l'extension du fichier, utilisee pour le libelle du
     * selecteur de fichier pour les medias FILE sans media_name.
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
