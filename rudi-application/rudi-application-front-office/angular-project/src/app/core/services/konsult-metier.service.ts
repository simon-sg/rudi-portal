import {HttpClient, HttpHeaders, HttpParameterCodec, HttpParams, HttpResponse} from '@angular/common/http';
import {Inject, Injectable, Optional} from '@angular/core';
import {Filters} from '@shared/models/filters';
import {MetadataUtils} from '@shared/utils/metadata-utils';
import {PageResultUtils} from '@shared/utils/page-result-utils';
import {Media, MediaFile, Metadata, MetadataFacets, MetadataList} from 'micro_service_modules/api-kaccess';
import MediaTypeEnum = Media.MediaTypeEnum;
import {MAP_PROTOCOLS_SUPPORTED} from '@core/services/map/map-protocols';
import {BASE_PATH, Configuration, KonsultService} from 'micro_service_modules/konsult/konsult-api';
import {CustomHttpParameterCodec} from 'micro_service_modules/konsult/konsult-api/encoder';
import mime, {Mime} from 'mime';
import {Observable} from 'rxjs';
import {catchError, map, shareReplay} from 'rxjs/operators';
import customMimeDatabase from 'src/assets/mime-db/custom-mime-db';
import {AccessStatusFiltersType} from './filters/access-status-filters-type';
import {DEFAULT_VALUE as DEFAULT_ORDER_VALUE} from './filters/order-filter';

export const MAX_RESULTS_PER_PAGE = 36;
export const MAX_RESULTS_PER_REQUEST = 100;

const CRYPT_SUFFIX = '+crypt';
const UNKNOWN_EXTENSION = 'Extension inconnue du système';
const UNKNOWN_MEDIA_TYPE = 'AUTRE';

export type Order = 'title' | '-title' | 'updatedDate' | '-updatedDate' | 'code' | '-code' | 'order_';
export const ORDERS: Order[] = ['title', '-title', 'updatedDate', '-updatedDate'];
export const DEFAULT_PROJECT_ORDER: Order = '-updatedDate';

/** Un type de fichier proposé au filtre catalogue, avec le nombre de JDD qui l'exposent. */
export interface FileTypeCount {
    type: string;
    count: number;
}

@Injectable({
    providedIn: 'root'
})
export class KonsultMetierService {

    public defaultHeaders = new HttpHeaders();
    public configuration = new Configuration();
    public encoder: HttpParameterCodec;
    private static customMime = new Mime();

    constructor(
        private readonly konsultService: KonsultService,
        protected httpClient: HttpClient,
        @Optional() @Inject(BASE_PATH) basePath: string,
        @Optional() configuration: Configuration
    ) {
        KonsultMetierService.loadCustomMimeType();
        if (configuration) {
            this.configuration = configuration;
        }
        this.encoder = this.configuration.encoder || new CustomHttpParameterCodec();
    }

    private addToHttpParamsRecursive(httpParams: HttpParams, value?: any, key?: string): HttpParams {
        if (value == null) {
            return httpParams;
        }

        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                value.forEach(elem => httpParams = this.addToHttpParamsRecursive(httpParams, elem, key));
            } else if (value instanceof Date) {
                httpParams = httpParams.append(key,
                    value.toISOString().substring(0, 10));
            } else {
                Object.keys(value).forEach(k => httpParams = this.addToHttpParamsRecursive(
                    httpParams, value[k], key != null ? `${key}.${k}` : k));
            }
        } else if (key != null) {
            httpParams = httpParams.append(key, value);
        } else {
            throw Error('key may not be null if value is not object or array');
        }
        return httpParams;
    }

    private addToHttpParams(httpParams: HttpParams, value: any, key?: string): HttpParams {
        if (typeof value === 'object' && !(value instanceof Date)) {
            httpParams = this.addToHttpParamsRecursive(httpParams, value);
        } else {
            httpParams = this.addToHttpParamsRecursive(httpParams, value, key);
        }
        return httpParams;
    }


    private static loadCustomMimeType(): void {
        // Le fichier JSON est chargé dans notre objet sous la propriété default et est de type Module
        this.customMime.define(customMimeDatabase, true);
    }

    private static getFacetsValues(facets: MetadataFacets): string[] {
        return facets.items.length ? facets.items[0].values.map(facetValue => facetValue.value) : [];
    }

    /**
     * Recuperation de la liste de metadata depuis le server
     */
    searchMetadatas(filters?: Filters, accessStatusHiddenValues?: AccessStatusFiltersType[], offset?: number, limit?: number): Observable<MetadataList> {
        const accessStatus = MetadataUtils.getAccessStatus(filters);
        if (MetadataUtils.isSelfdataHidden(accessStatusHiddenValues)) {
            accessStatus.gdprSensitive = false;
        }
        return this.konsultService.searchMetadatas(
            filters.search,
            filters.themes,
            filters.keywords,
            filters.producerNames,
            filters.dates.debut,
            filters.dates.fin,
            accessStatus.restrictedAcces,
            accessStatus.gdprSensitive,
            filters.globalIds,
            filters.producerUuids,
            offset,
            limit,
            filters.order,
        );
    }

    /**
     * Permet de d'afficher le detail d'un jdd à partir de son uuid
     */
    getMetadataByUuid(uuid: string): Observable<Metadata> {
        return this.konsultService.getMetadataById(uuid);
    }

    /**
     * Permet de d'afficher le detail de plusieurs jdd à partir de leurs globalId
     */
    getMetadatasByUuids(globalIds: string[]): Observable<Metadata[]> {
        return PageResultUtils.fetchAllElementsUsing(offset =>
            this.searchMetadatas({
                search: '',
                themes: [],
                keywords: [],
                producerNames: [],
                dates: {
                    debut: '',
                    fin: ''
                },
                order: DEFAULT_ORDER_VALUE,
                accessStatus: null,
                globalIds,
                producerUuids: [],
                fileTypes: [],
            }, null, offset, MAX_RESULTS_PER_REQUEST)
        );
    }

    /**
     * Fonction qui permet de recuperer la methode downloadMetadataMedia du server
     */
    downloadMetadataMedia(mediaUrl: string, options?: {
        httpHeaderAccept?: 'application/octet-stream' | 'application/json'
    }): Observable<HttpResponse<Blob>> {
        let headers = this.defaultHeaders;
        let httpHeaderAcceptSelected: string | undefined = options?.httpHeaderAccept;
        if (httpHeaderAcceptSelected === undefined) {
            // to determine the Accept header
            const httpHeaderAccepts: string[] = [
                'application/octet-stream',
                'application/json'
            ];

            httpHeaderAcceptSelected = this.configuration.selectHeaderAccept(httpHeaderAccepts);
        }
        if (httpHeaderAcceptSelected !== undefined) {
            headers = headers.set('Accept', httpHeaderAcceptSelected);
        }
        return this.httpClient.get(`${String(mediaUrl)}`,
            {
                responseType: 'blob',
                withCredentials: this.configuration.withCredentials,
                headers,
                observe: 'response',
                reportProgress: true
            }
        );
    }

    /**
     *  Fonction qui permet de récupérer des métadonnés de type WMS/WFS d\&#39;un jeu de données.
     *  Récupère le flux WMS/WFS d\&#39;un média de type SERVICE
     */
    callServiceMetadataMedia(mediaUrl: string, parameters?: { [key: string]: string; }, options?: {
        httpHeaderAccept?: 'application/octet-stream' | 'application/json'
    }): Observable<any> {
        let queryParameters = new HttpParams({encoder: this.encoder});
        if (parameters !== undefined && parameters !== null) {
            queryParameters = this.addToHttpParams(queryParameters,
                <any> parameters, 'parameters');
        }

        let headers: HttpHeaders = this.defaultHeaders;
        let httpHeaderAcceptSelected: string | undefined = options?.httpHeaderAccept;
        if (httpHeaderAcceptSelected === undefined) {
            const httpHeaderAccepts: string[] = [
                'application/octet-stream',
                'application/json'
            ];

            httpHeaderAcceptSelected = this.configuration.selectHeaderAccept(httpHeaderAccepts);
        }
        if (httpHeaderAcceptSelected !== undefined) {
            headers = headers.set('Accept', httpHeaderAcceptSelected);
        }
        return this.httpClient.get(`${String(mediaUrl)}`,
            {
                params: queryParameters,
                responseType: 'blob',
                withCredentials: this.configuration.withCredentials,
                headers,
                observe: 'response'
            }
        );
    }

    private getMetadataProducersFacets(): Observable<MetadataFacets> {
        return this.konsultService.searchMetadataFacets(['producer_organization_name']);
    }


    private getMetadataThemesFacets(): Observable<MetadataFacets> {
        return this.konsultService.searchMetadataFacets(['theme']);
    }

    getProducerNames(): Observable<string[]> {
        return this.getMetadataProducersFacets().pipe(
            map(facets => KonsultMetierService.getFacetsValues(facets))
        );
    }

    getThemeCodes(): Observable<string[]> {
        return this.getMetadataThemesFacets().pipe(
            map(facets => KonsultMetierService.getFacetsValues(facets))
        );
    }

    getMetadatasWithSameTheme(globalId: string, limit: number): Observable<Metadata[]> {
        return this.konsultService.getMetadatasWithSameTheme(globalId, limit);
    }

    getNumberOfDatasetsOnTheSameTheme(globalId: string): Observable<number> {
        return this.konsultService.getNumberOfDatasetsOnTheSameTheme(globalId);
    }

    getMediaFileExtension(media: Media): string {
        const mediaFile = media as MediaFile;
        const originalFileType = mediaFile.file_type.replace(CRYPT_SUFFIX, '');

        // Récupération de l'extension du fichier
        return mime.getExtension(originalFileType)
            ??
            // Si rien n'est trouvé : utilisation d'un tableau custom
            KonsultMetierService.customMime.getExtension(originalFileType)
            ??
            // Si rien n'est trouvé renvoi "extension inconnue"
            UNKNOWN_EXTENSION;
    }

    getMediaTypeLabel(media: Media): string {
        if (media.media_type === MediaTypeEnum.File) {
            return this.getMediaFileExtension(media).toUpperCase();
        }
        if (media.media_type === MediaTypeEnum.Service) {
            const interfaceContract = media.connector?.interface_contract;
            // Seuls les protocoles cartographiques (wms/wmts/wfs) sont un vrai "type de fichier" pour
            // l'utilisateur ; les autres contrats (ex. 'dwnl', lien de téléchargement direct utilisé
            // aussi bien par des pointeurs vers la source que par certains médias FILE) ne le sont pas.
            if (interfaceContract && MAP_PROTOCOLS_SUPPORTED.includes(interfaceContract)) {
                return interfaceContract.toUpperCase();
            }
            return UNKNOWN_MEDIA_TYPE;
        }
        return UNKNOWN_MEDIA_TYPE;
    }

    getDatasetFileTypes(metadata: Metadata): string[] {
        const types = (metadata.available_formats ?? [])
            .map(media => this.getMediaTypeLabel(media))
            .filter(type => type !== UNKNOWN_MEDIA_TYPE);
        return Array.from(new Set(types));
    }

    datasetMatchesFileTypes(metadata: Metadata, selectedTypes: string[]): boolean {
        if (!selectedTypes?.length) {
            return true;
        }
        const datasetTypes = this.getDatasetFileTypes(metadata);
        return selectedTypes.some(type => datasetTypes.includes(type));
    }

    /**
     * Mémorisé pour la durée de vie du service (un onglet navigateur) : on ne veut interroger
     * qu'une seule fois, que ce soit l'asset statique ou (en repli) le scan live.
     */
    private availableFileTypes$: Observable<FileTypeCount[]>;

    /**
     * Idem : mémorisé par combinaison de filtres (hors fileTypes, qui n'est pas transmis au
     * backend), pour que cocher/décocher des types de fichiers sur la même recherche ne redéclenche
     * pas un scan complet à chaque clic.
     */
    private readonly allMetadatasMatchingFiltersCache = new Map<string, Observable<Metadata[]>>();

    /**
     * Liste des types de fichiers proposés au filtre catalogue "Type de fichier".
     *
     * Scanner tout le catalogue en direct pour calculer cette liste est trop coûteux sur ce nœud
     * (~0.2-0.3s par JDD, confirmé en test manuel — jusqu'à 100s pour ~350 JDD) pour être fait à
     * chaque visite par chaque utilisateur. À la place, on lit un asset statique
     * (`assets/file-types-cache.json`) pré-calculé et rafraîchi périodiquement par un script cron
     * partagé par tous les utilisateurs (voir
     * `rudi-application/rudi-application-front-office/scripts/refresh_file_types_cache.py`).
     *
     * Si l'asset est absent (ex. tout premier déploiement avant le premier passage du cron), on se
     * rabat sur le scan live pour ne jamais laisser le filtre silencieusement vide.
     */
    getAvailableFileTypes(): Observable<FileTypeCount[]> {
        if (!this.availableFileTypes$) {
            this.availableFileTypes$ = this.httpClient.get<FileTypeCount[]>('assets/file-types-cache.json').pipe(
                catchError(() => this.computeAvailableFileTypesFromLiveCatalog()),
                shareReplay(1)
            );
        }
        return this.availableFileTypes$;
    }

    private computeAvailableFileTypesFromLiveCatalog(): Observable<FileTypeCount[]> {
        return PageResultUtils.fetchAllElementsUsing<MetadataList, Metadata>(offset =>
            this.searchMetadatas({
                search: '',
                themes: [],
                keywords: [],
                producerNames: [],
                dates: {debut: '', fin: ''},
                order: DEFAULT_ORDER_VALUE,
                accessStatus: null,
                globalIds: [],
                producerUuids: [],
                fileTypes: [],
            }, null, offset, MAX_RESULTS_PER_REQUEST)
        ).pipe(
            map(metadatas => {
                const counts = new Map<string, number>();
                metadatas.forEach(metadata => {
                    this.getDatasetFileTypes(metadata).forEach(type => {
                        counts.set(type, (counts.get(type) ?? 0) + 1);
                    });
                });
                return Array.from(counts.entries())
                    .map(([type, count]) => ({type, count}))
                    .sort((a, b) => a.type.localeCompare(b.type));
            })
        );
    }

    private catalogSnapshot$: Observable<Metadata[]>;

    /**
     * Instantané complet du catalogue (mêmes JDD que la recherche), pour permettre à
     * `DatasetListComponent` de filtrer (type de fichier) et paginer **entièrement côté client,
     * instantanément** quand ce filtre est actif seul (aucun autre filtre backend actif) — sans
     * lui, appliquer le filtre type de fichier retombait sur un scan complet à chaque fois (~100s,
     * perçu comme un plantage). Même stratégie que `getAvailableFileTypes()` : asset statique
     * pré-calculé par le même script cron, repli sur un scan live si absent.
     */
    getCatalogSnapshot(): Observable<Metadata[]> {
        if (!this.catalogSnapshot$) {
            this.catalogSnapshot$ = this.httpClient.get<Metadata[]>('assets/catalog-snapshot.json').pipe(
                catchError(() => this.computeCatalogSnapshotFromLiveCatalog()),
                shareReplay(1)
            );
        }
        return this.catalogSnapshot$;
    }

    private computeCatalogSnapshotFromLiveCatalog(): Observable<Metadata[]> {
        return PageResultUtils.fetchAllElementsUsing<MetadataList, Metadata>(offset =>
            this.searchMetadatas({
                search: '',
                themes: [],
                keywords: [],
                producerNames: [],
                dates: {debut: '', fin: ''},
                order: DEFAULT_ORDER_VALUE,
                accessStatus: null,
                globalIds: [],
                producerUuids: [],
                fileTypes: [],
            }, null, offset, MAX_RESULTS_PER_REQUEST)
        );
    }

    searchAllMetadatasMatchingFilters(filters: Filters, accessStatusHiddenValues?: AccessStatusFiltersType[]): Observable<Metadata[]> {
        const cacheKey = JSON.stringify({
            search: filters.search,
            themes: filters.themes,
            keywords: filters.keywords,
            producerNames: filters.producerNames,
            dates: filters.dates,
            order: filters.order,
            accessStatus: filters.accessStatus,
            globalIds: filters.globalIds,
            producerUuids: filters.producerUuids,
            accessStatusHiddenValues,
        });
        let cached$ = this.allMetadatasMatchingFiltersCache.get(cacheKey);
        if (!cached$) {
            cached$ = PageResultUtils.fetchAllElementsUsing<MetadataList, Metadata>(offset =>
                this.searchMetadatas(filters, accessStatusHiddenValues, offset, MAX_RESULTS_PER_REQUEST)
            ).pipe(shareReplay(1));
            this.allMetadatasMatchingFiltersCache.set(cacheKey, cached$);
        }
        return cached$;
    }
}
