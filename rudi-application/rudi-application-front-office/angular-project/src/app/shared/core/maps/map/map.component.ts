import {AfterViewInit, Component, Input, OnChanges, OnInit, SimpleChanges} from '@angular/core';
import {MatButton} from '@angular/material/button';
import {MatIcon, MatIconRegistry} from '@angular/material/icon';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {DomSanitizer} from '@angular/platform-browser';
import {FileTypes} from '@core/file-types';
import {DEFAULT_VIEW_PROJECTION, DisplayMapService, GPS_PROJECTION} from '@core/services/data-set/display-map.service';
import {LogService} from '@core/services/log.service';
import {MAP_PROTOCOLS} from '@core/services/map/map-protocols';
import {PropertiesMetierService} from '@core/services/properties-metier.service';
import {SnackBarService} from '@core/services/snack-bar.service';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import {Level} from '@shared/core/layout/notification-template/notification-template.component';
import {createWmtsBaseLayer, MapLayerFunction} from '@shared/core/maps/map/map.layer.function';
import {getDefaultCrs} from '@shared/core/maps/map/map.media.layer.function';
import {MapLayerState} from '@shared/core/maps/map/map-layer-state';
import {ADDRESS_STYLE, getHoveredStyle, LINE_STYLE, POINT_STYLE, POLYGON_STYLE} from '@shared/core/maps/map/map.style.function';
import {SearchAutocompleteItem} from '@shared/core/search/search-autocomplete/search-autocomplete-item.interface';
import {Media, MediaFile, Metadata} from 'micro_service_modules/api-kaccess';
import {Address} from 'micro_service_modules/api-rva';
import {LayerInformation} from 'micro_service_modules/konsult/konsult-model';
import {Feature, Overlay} from 'ol';
import {Attribution, ScaleLine} from 'ol/control';
import {boundingExtent, Extent, getCenter} from 'ol/extent';
import {Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon} from 'ol/geom';
import BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import olMap from 'ol/Map';
import {get, Projection} from 'ol/proj';
import {OSM} from 'ol/source';
import VectorSource from 'ol/source/Vector';
import {Style} from 'ol/style';
import View from 'ol/View';
import proj4 from 'proj4';
import {Observable, of} from 'rxjs';
import {tap} from 'rxjs/operators';
import {SearchAutocompleteComponent} from '../../search/search-autocomplete/search-autocomplete.component';
import {MapPopupComponent} from '../map-popup/map-popup.component';
import MediaTypeEnum = Media.MediaTypeEnum;

@Component({
    selector: 'app-map',
    templateUrl: './map.component.html',
    styleUrls: ['./map.component.scss'],
    imports: [SearchAutocompleteComponent, MatButton, MatIcon, MatMenuTrigger, MatMenu, MatMenuItem, MapPopupComponent, TranslatePipe]
})
export class MapComponent implements AfterViewInit, OnInit, OnChanges {

    /**
     * Coordonnées du point de centrage de la carte en WGS84 (Rennes par défaut)
     */
    mapCenter: number[] = [-1.662712, 48.114767];
    mapCenterTopleft: number[] = [-1.751289, 48.168261];
    mapCenterBottomRight: number[] = [-1.534996, 48.062135];

    /**
     * Le nombre de pixels de "padding" autour d'une extent de géoémtrie sur laquelle la vue se centre
     */
    paddingExtent: number = 40;

    /**
     * Niveau de zoom maximal quand on centre sur des géométries pour pas que ce soit trop zoomé
     */
    maxZoomExtent: number = 11;

    /**
     * Zoom par défaut sur arrivage de la carte
     */
    configDefaultZoom: number = 13;

    constructor(
        private readonly matIconRegistry: MatIconRegistry,
        private readonly domSanitizer: DomSanitizer,
        private readonly displayMapService: DisplayMapService,
        private readonly logService: LogService,
        private readonly mapLayerFunction: MapLayerFunction,
        private readonly propertiesMetierService: PropertiesMetierService,
        private readonly snackBarService: SnackBarService,
        private readonly translateService: TranslateService
    ) {
        this.matIconRegistry.addSvgIcon(
            'icon_centrage',
            this.domSanitizer.bypassSecurityTrustResourceUrl('../assets/icons/icon_centrage.svg')
        );
    }

    @Input()
    mapId: string;

    @Input()
    defaultZoom = this.configDefaultZoom;

    @Input()
    boundingBox: Feature<Polygon>;

    @Input()
    centeredGeometry: Geometry;

    @Input()
    baseLayers: LayerInformation[];

    @Input()
    hasSearchAddress = false;

    @Input()
    metadata: Metadata;

    @Input()
    mediaLayers: MapLayerState[];

    /**
     * Les sources pour les différents layers
     */
    polygonSource: VectorSource<Polygon>;
    multiPolygonSource: VectorSource<MultiPolygon>;
    pointSource: VectorSource<Point>;
    multiPointSource: VectorSource<MultiPoint>;
    lineSource: VectorSource<LineString>;
    multiLineSource: VectorSource<MultiLineString>;
    addressSource: VectorSource<Point>;

    /**
     * Les layers pour la map
     */
    polygonLayer: VectorLayer<VectorSource<Polygon>>;
    multiPolygonLayer: VectorLayer<VectorSource<MultiPolygon>>;
    pointLayer: VectorLayer<VectorSource<Point>>;
    multiPointLayer: VectorLayer<VectorSource<MultiPoint>>;
    lineLayer: VectorLayer<VectorSource<LineString>>;
    multiLineLayer: VectorLayer<VectorSource<MultiLineString>>;
    addressLayer: VectorLayer<VectorSource<Point>>;

    /**
     * Map Openlayer
     */
    map: olMap;

    /**
     * Popup sur clic de feature
     */
    popup: Overlay;

    /**
     * la feature de la popup
     */
    popupFeature: Feature<Geometry>;

    /**
     * Le fond de carte OL actuel
     */
    currentBaseLayer: BaseLayer;

    /**
     * Les couches de données du JDD déjà créées (WMS/WMTS/WFS/GeoJSON), indexées par media_id. Une
     * couche n'est créée que la première fois qu'elle passe à visible (création paresseuse, voir
     * syncMediaLayers) puis n'est plus jamais retirée de la carte : décocher/re-cocher ne fait que
     * la masquer/la ré-afficher, sans re-télécharger WFS/GeoJSON.
     */
    private mediaDataLayers: Map<string, BaseLayer> = new Map();

    /**
     * media_id des couches dont la création asynchrone (enregistrement CRS proj4 et/ou
     * téléchargement GeoJSON) est en cours. syncMediaLayers() est rejouée à CHAQUE changement de
     * mediaLayers, y compris pour une couche encore en cours de création suite à un changement
     * précédent (par ex. cocher une 2e couche pendant que la création de la 1re est encore en vol) :
     * sans ce garde-fou, la couche pas encore enregistrée dans mediaDataLayers y déclencherait un
     * 2e createMediaLayer() concurrent, donc une 2e requête et une couche orpheline sur la carte.
     */
    private pendingMediaLayers: Set<string> = new Set();

    /**
     * Les couches interactives (cliquables pour la popup de feature) : toutes les couches WFS et
     * GeoJSON créées jusqu'ici, quel que soit leur état visible/masqué (forEachFeatureAtPixel
     * ignore de toute façon les couches masquées). Le listener de clic unique (voir
     * addFeatureInteraction, enregistré une seule fois dans initMap()) la consulte dynamiquement,
     * pour rester valide à l'ajout de nouvelles couches sans empiler un nouveau listener.
     */
    private interactiveMediaLayers: Set<BaseLayer> = new Set();

    /**
     * L'extent de la géométrie du JDD (bounding box ou geometric distribution)
     */
    centeredExtent;

    /**
     * Tableau des fonds de plans affichables issus de la propriété baseLayersRudi
     */
    baseLayersMap: Map<LayerInformation, BaseLayer> = new Map();

    /**
     * feature en hover sur la map
     */
    hoveredFeature: Feature<Geometry>;

    isAutocompleteSearching = false;
    autocompleteItems: SearchAutocompleteItem<Address>[] = [];
    autocompletePin: Feature<Point>;

    currentHoverStyle: Style[];

    centeredPoint: number[];
    initExtent: Extent;
    viewProjectionString: string;


    ngOnInit(): void {
        this.propertiesMetierService.getNumbers('mapInfo.defaultCenter').subscribe(point => {
            this.mapCenter = point;
        });
        this.propertiesMetierService.getNumbers('mapInfo.defaultTopLeft').subscribe(point => {
            this.mapCenterTopleft = point;
        });
        this.propertiesMetierService.getNumbers('mapInfo.defaultBottomRight').subscribe(point => {
            this.mapCenterBottomRight = point;
        });
        this.propertiesMetierService.getNumber('mapInfo.paddingExtent').subscribe(num => {
            this.paddingExtent = num;
        });
        this.propertiesMetierService.getNumber('mapInfo.maxZoomExtent').subscribe(num => {
            this.maxZoomExtent = num;
        });
        this.propertiesMetierService.getNumber('mapInfo.defaultZoom').subscribe(num => {
            this.configDefaultZoom = num;
        });
    }

    /**
     * Réagit à chaque changement de référence de @Input() mediaLayers (voir MapTabComponent, qui
     * remplace le tableau à chaque case cochée/décochée ou slider bougé). syncMediaLayers est
     * idempotente et rejouable : pas de distinction firstChange. Si la carte n'est pas encore
     * initialisée (this.map == null), on ne fait rien : initMap() appelle de toute façon
     * syncMediaLayers() à la fin, avec la dernière valeur de mediaLayers.
     */
    ngOnChanges(changes: SimpleChanges): void {
        if (changes.mediaLayers && this.map != null) {
            this.syncMediaLayers();
        }
    }

    ngAfterViewInit(): void {
        if (this.map == null) {
            // La projection de la VUE (et du fond de plan) est TOUJOURS EPSG:3857, projection native
            // des fonds web-mercator. Le default_crs propre au connecteur d'un média n'est PAS la
            // projection de la carte entière : il est enregistré dans proj4 par couche, juste avant
            // la création de la couche concernée (voir createMediaLayer), pour qu'OpenLayers sache
            // reprojeter chaque couche WMS/WFS vers la vue (cf. map.layer.function.ts).
            const projection: Observable<Projection> = of(get(DEFAULT_VIEW_PROJECTION)).pipe(
                tap(() => {
                    this.centeredPoint = proj4(GPS_PROJECTION, DEFAULT_VIEW_PROJECTION, this.mapCenter);
                    const topLeft = proj4(GPS_PROJECTION, DEFAULT_VIEW_PROJECTION, this.mapCenterTopleft);
                    const bottomRight = proj4(GPS_PROJECTION, DEFAULT_VIEW_PROJECTION, this.mapCenterBottomRight);
                    this.initExtent = boundingExtent([topLeft, bottomRight]);
                })
            );

            projection.pipe(
                tap((usedProjection: Projection) => {
                    this.initMap(usedProjection);
                    this.initPopup();
                    this.map.updateSize();
                })
            ).subscribe({
                error: (err) => {
                    this.snackBarService.openSnackBar({
                        message: this.translateService.instant('metaData.mapDataTab.error'),
                        level: Level.ERROR
                    });
                    console.error(err);
                }
            });
        }
    }

    /**
     * Initialisation des layers avec leurs sources
     */
    initLayers(): void {

        // Création des layers qui accueilleront les features
        this.polygonSource = new VectorSource<Polygon>();
        this.polygonLayer = new VectorLayer<VectorSource<Polygon>>({
            source: this.polygonSource,
            style: POLYGON_STYLE
        });

        this.multiPolygonSource = new VectorSource<MultiPolygon>();
        this.multiPolygonLayer = new VectorLayer<VectorSource<MultiPolygon>>({
            source: this.multiPolygonSource,
            style: POLYGON_STYLE
        });

        this.pointSource = new VectorSource<Point>();
        this.pointLayer = new VectorLayer<VectorSource<Point>>({
            source: this.pointSource,
            style: POINT_STYLE
        });

        this.multiPointSource = new VectorSource<MultiPoint>();
        this.multiPointLayer = new VectorLayer<VectorSource<MultiPoint>>({
            source: this.multiPointSource,
            style: POINT_STYLE
        });

        this.lineSource = new VectorSource<LineString>();
        this.lineLayer = new VectorLayer<VectorSource<LineString>>({
            source: this.lineSource,
            style: LINE_STYLE
        });

        this.multiLineSource = new VectorSource<MultiLineString>();
        this.multiLineLayer = new VectorLayer<VectorSource<MultiLineString>>({
            source: this.multiLineSource,
            style: LINE_STYLE
        });

        this.addressSource = new VectorSource<Point>();
        this.addressLayer = new VectorLayer<VectorSource<Point>>({
            source: this.addressSource
        });
        this.addressLayer.setZIndex(1001);
    }

    /**
     * Ajoue la géométrie reprojetée dans la source correspondante en fonction de son type
     * @param geometry la géométrie parsée et reprojetée mais on sait pas son type
     */
    addGeometryToCorrespondingSource(geometry: Geometry): void {
        // On va placer la feature dans la bonne source selon son type
        if (geometry.getType() === 'MultiPolygon') {
            this.multiPolygonSource.addFeature(
                new Feature<MultiPolygon>({
                    geometry: geometry as MultiPolygon
                })
            );
        } else if (geometry.getType() === 'MultiPoint') {
            this.multiPointSource.addFeature(
                new Feature<MultiPoint>({
                    geometry: geometry as MultiPoint
                })
            );
        } else if (geometry.getType() === 'MultiLineString') {
            this.multiLineSource.addFeature(
                new Feature<MultiLineString>({
                    geometry: geometry as MultiLineString
                })
            );
        } else if (geometry.getType() === 'Polygon') {
            this.polygonSource.addFeature(
                new Feature<Polygon>({
                    geometry: geometry as Polygon
                })
            );
        } else if (geometry.getType() === 'Point') {
            this.pointSource.addFeature(
                new Feature<Point>({
                    geometry: geometry as Point
                })
            );
        } else if (geometry.getType() === 'LineString') {
            this.lineSource.addFeature(
                new Feature<LineString>({
                    geometry: geometry as LineString
                })
            );
        }
    }

    /**
     *  Création de la map Openlayers
     *  @param usedProjection projection utilisée pour l'affichage
     */
    initMap(usedProjection: Projection): void {

        // On initialise les layers
        this.initLayers();

        // Layer par défaut si rien ne va
        this.currentBaseLayer = new TileLayer({
            source: new OSM()
        });

        // Normalement on regarde dans la conf le fond de carte à afficher par défaut (1er trouvé)
        if (this.baseLayers != null && this.baseLayers.length > 0) {
            this.baseLayers.forEach((layerInformation: LayerInformation) => {
                const baseLayer: BaseLayer = createWmtsBaseLayer(layerInformation);
                this.baseLayersMap.set(layerInformation, baseLayer);
            });

            this.currentBaseLayer = this.baseLayersMap.entries().next().value[1];
        }

        // Création de la map
        this.map = new olMap({
            target: this.mapId,
            layers: [
                // Fond de carte
                this.currentBaseLayer,
                // 1 layer par type de feature sur la carte
                this.polygonLayer, this.multiPolygonLayer,
                this.pointLayer, this.multiPointLayer,
                this.lineLayer, this.multiLineLayer,
                // layer addresse en dernier pour le pin au dessus de tout
                this.addressLayer
            ],
            view: new View({
                center: this.centeredPoint,
                projection: usedProjection,
                extent: usedProjection.getExtent() != undefined ? usedProjection.getExtent() : usedProjection.getWorldExtent(),
                zoom: 0
            }),
            controls: [
                new ScaleLine(),
                new Attribution()
            ]
        });

        // Si on a donné une feature à afficher alors on l'affiche
        if (this.centeredGeometry != null) {
            this.centeredExtent = this.centeredGeometry.getExtent();
            this.addGeometryToCorrespondingSource(this.centeredGeometry);
        }
        // Si on a donné une bounding box alors on se centre sur elle
        else if (this.boundingBox != null) {
            this.centeredExtent = this.boundingBox.getGeometry();
            this.polygonSource.addFeature(this.boundingBox);
        }

        // Centrage si succès des données fournies
        if (this.centeredExtent) {
            this.handleClickCentrage();
        }
        // Sinon on se centre pas

        // Chargement des dépendances
        this.syncMediaLayers();
        this.handleMapEvents();
        this.addFeatureInteraction();

        if (this.initExtent != null) {
            this.map.getView().fit(this.initExtent);
        }
    }

    /**
     * Synchronise la carte avec l'état courant des couches (@Input() mediaLayers). Idempotente et
     * rejouable à tout moment (initMap() puis ngOnChanges) :
     * - visible + couche non créée → la créer (création paresseuse, voir createMediaLayer), sauf si
     *   sa création est déjà en cours (voir pendingMediaLayers) suite à un appel précédent de cette
     *   même méthode
     * - visible + couche déjà créée → setVisible(true) + setOpacity (couvre slider bougé et
     *   ré-activation d'une couche précédemment masquée)
     * - masquée + couche déjà créée → setVisible(false) seulement (jamais retirée de la carte)
     * - masquée + non créée → ne rien faire
     * @private
     */
    private syncMediaLayers(): void {
        if (this.metadata == null || this.mediaLayers == null) {
            return;
        }
        for (const state of this.mediaLayers) {
            const mediaId = state.media.media_id;
            const layer = this.mediaDataLayers.get(mediaId);
            if (state.visible) {
                if (layer == null) {
                    if (!this.pendingMediaLayers.has(mediaId)) {
                        this.pendingMediaLayers.add(mediaId);
                        this.createMediaLayer(state.media);
                    }
                } else {
                    layer.setVisible(true);
                    layer.setOpacity(state.opacity);
                }
            } else if (layer != null) {
                layer.setVisible(false);
            }
        }
    }

    /**
     * Crée la couche OL pour le média donné (WMS/WMTS/WFS synchrones, GeoJSON asynchrone). Avant
     * la création, enregistre dans proj4 le CRS propre au connecteur s'il diffère de la projection
     * de la vue (EPSG:3857) — le même enchaînement asynchrone que l'ancien ngAfterViewInit, mais
     * déplacé au niveau de la couche : avec plusieurs couches potentiellement de CRS différents,
     * l'enregistrement se fait par couche, juste avant sa création.
     * @param media le média à afficher
     * @private
     */
    private createMediaLayer(media: Media): void {
        const mediaCrs = getDefaultCrs(media);
        const register$ = (mediaCrs != null && mediaCrs !== DEFAULT_VIEW_PROJECTION)
            ? this.displayMapService.registerAndGetProjection(mediaCrs)
            : of(null);

        register$.subscribe({
            next: () => this.buildMediaLayer(media),
            error: (err) => {
                this.pendingMediaLayers.delete(media.media_id);
                this.logService.error(err);
            }
        });
    }

    /**
     * Dispatche la construction de la couche selon le protocole/type du média (même dispatch que
     * l'ancien handleLoadLayers) puis l'ajoute à la carte.
     * @param media le média à afficher
     * @private
     */
    private buildMediaLayer(media: Media): void {
        const mediaId = media.media_id;
        if (media.connector.interface_contract === MAP_PROTOCOLS.WMS) {
            this.addMediaLayer(mediaId, this.mapLayerFunction.createWmsDataLayer(this.metadata.global_id, media));
        } else if (media.connector.interface_contract === MAP_PROTOCOLS.WMTS) {
            this.addMediaLayer(mediaId, this.mapLayerFunction.createWmtsDataLayer(this.metadata.global_id, media));
        } else if (media.connector.interface_contract === MAP_PROTOCOLS.WFS) {
            const layer = this.mapLayerFunction.createWfsDataLayer(this.metadata.global_id, media);
            this.interactiveMediaLayers.add(layer);
            this.addMediaLayer(mediaId, layer);
        } else if (media.media_type === MediaTypeEnum.File) {
            const mediaFile: MediaFile = media as MediaFile;
            if (mediaFile.file_type === FileTypes.GEO_JSON) {
                this.mapLayerFunction.createGeojsonDataLayer(media).subscribe({
                    next: (baseLayer: BaseLayer) => {
                        // Le téléchargement du GeoJSON est asynchrone : la couche est ajoutée même
                        // si l'utilisateur a décoché/re-coché entre-temps (les couches ne sont
                        // jamais retirées, seulement masquées), avec l'état visible/opacité courant.
                        this.interactiveMediaLayers.add(baseLayer);
                        this.addMediaLayer(mediaId, baseLayer);
                    },
                    error: (e) => {
                        this.pendingMediaLayers.delete(mediaId);
                        this.logService.error(e);
                    }
                });
            }
        }
    }

    /**
     * Enregistre la couche créée dans la Map interne (indexée par media_id), l'ajoute à la carte et
     * applique l'état visible/opacité courant — pas celui au moment du déclenchement de la
     * création, qui a pu changer pendant une création asynchrone (GeoJSON, enregistrement proj4).
     * @param mediaId media_id du média
     * @param layer la couche OpenLayers créée
     * @private
     */
    private addMediaLayer(mediaId: string, layer: BaseLayer): void {
        this.pendingMediaLayers.delete(mediaId);
        this.mediaDataLayers.set(mediaId, layer);
        this.map.getLayers().push(layer);
        const state = this.mediaLayers?.find(layerState => layerState.media.media_id === mediaId);
        layer.setVisible(state?.visible ?? true);
        layer.setOpacity(state?.opacity ?? 1);
    }

    private handleMapEvents(): void {
        // Gestion de l'evenement de mouvement de pointeur
        this.map.on('pointermove', (e) => {
            if (this.hoveredFeature != null) {
                this.hoveredFeature.setStyle(null);
                this.hoveredFeature = null;
            }

            if (this.popupFeature) {
                this.popupFeature.setStyle(this.currentHoverStyle);
            }

            this.map.forEachFeatureAtPixel(e.pixel, (f, l) => {
                if (l !== this.addressLayer) {
                    this.hoveredFeature = f as Feature<Geometry>;
                    this.hoveredFeature.setStyle(getHoveredStyle(f.getGeometry().getType()));
                    return true;
                }
                return false;
            });
        });
    }

    /**
     * Initialisation de l'objet popup Ol
     */
    initPopup(): void {
        this.popup = new Overlay({
            element: document.getElementById('map-popup'),
            positioning: 'bottom-center',
            stopEvent: true,
            offset: [0, -10]
        });
    }

    /**
     * Action zoom +
     */
    handleClickZoomIn(): void {
        this.map.getView().animate({
            zoom: this.map.getView().getZoom() + 1,
            duration: 250
        });
    }

    /**
     * Action zoom -
     */
    handleClickZoomOut(): void {
        this.map.getView().animate({
            zoom: this.map.getView().getZoom() - 1,
            duration: 250
        });
    }

    /**
     * Intéraction clic du bouton de centrage sur la géométrie du JDD
     */
    handleClickCentrage(): void {
        let centeredElement = this.centeredExtent;
        centeredElement ??= this.initExtent;
        this.map.getView().fit(
            centeredElement,
            {
                padding: [this.paddingExtent, this.paddingExtent, this.paddingExtent, this.paddingExtent],
                maxZoom: this.maxZoomExtent,
                duration: 1000
            }
        );
    }

    /**
     * Changement du fond de plan affiché
     * @param baseLayer le fond de plan souhaité à partir de sa clé métier
     */
    switchLayer(baseLayer: LayerInformation): void {
        this.map.removeLayer(this.currentBaseLayer);
        this.currentBaseLayer = this.baseLayersMap.get(baseLayer);
        this.map.getLayers().insertAt(0, this.currentBaseLayer);
    }

    /**
     * Recherche d'addresse sur lesquelles se centrer
     * @param input texte de recherche
     */
    searchAddresses(input: string): void {
        this.isAutocompleteSearching = true;
        this.displayMapService.searchAddresses(input).subscribe({
            next: (items: SearchAutocompleteItem<Address>[]) => {
                this.autocompleteItems = items;
                this.isAutocompleteSearching = false;
            },
            error: (e) => {
                this.logService.error(e);
                this.isAutocompleteSearching = false;
            }
        });
    }

    /**
     * Centrage sur l'adresse RVA trouvée
     * @param item l'adresse trouvée
     */
    centerOnAddress(item: Address): void {
        if (this.autocompletePin != null) {
            this.addressSource.removeFeature(this.autocompletePin);
        }

        const destination = this.viewProjectionString ?? DEFAULT_VIEW_PROJECTION;

        const point = new Point([Number(item.x), Number(item.y)]).transform(GPS_PROJECTION, destination) as Point;
        this.autocompletePin = new Feature<Point>(point);
        this.autocompletePin.setStyle(ADDRESS_STYLE);
        this.map.getView().fit(
            point,
            {
                size: this.map.getSize(),
                minResolution: 1,
                duration: 1000
            }
        );
        this.addressSource.addFeature(this.autocompletePin);
    }

    /**
     * Fermeture de la popup ouverte des features
     */
    handleClosePopup(): void {
        if (this.popupFeature) {
            this.popupFeature.setStyle();
            this.popupFeature = null;
            this.map.removeOverlay(this.popup);
        }
    }

    /**
     * Enregistre (une seule fois, voir l'appel dans initMap()) le listener de clic gérant la popup
     * de feature. Consulte this.interactiveMediaLayers dynamiquement (mis à jour à chaque création
     * de couche WFS/GeoJSON, voir buildMediaLayer) plutôt que de capturer une couche par fermeture :
     * évite d'empiler un nouveau listener map.on('click', ...) à chaque ajout de couche.
     */
    addFeatureInteraction(): void {
        this.map.on('click', (event) => {
            if (this.interactiveMediaLayers.size === 0) {
                return;
            }

            if (this.popupFeature) {
                this.popupFeature.setStyle();
            }

            const feature = this.map.forEachFeatureAtPixel(event.pixel, (clickedFeature, clickedLayer) => {
                    return this.interactiveMediaLayers.has(clickedLayer) ? clickedFeature : null;
                }
            );

            if (feature) {
                const hoveredStyle = getHoveredStyle(feature.getGeometry().getType());
                this.currentHoverStyle = hoveredStyle;
                this.popupFeature = feature as Feature<Geometry>;
                this.popupFeature.setStyle(hoveredStyle);
                const coordinates = feature.getGeometry().getExtent();
                const center = getCenter(coordinates);
                this.popup.setPosition(center);
                this.map.addOverlay(this.popup);
            } else {
                this.popupFeature = null;
                this.map.removeOverlay(this.popup);
            }
        });
    }
}

