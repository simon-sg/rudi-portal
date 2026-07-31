import {NgClass} from '@angular/common';
import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {SafeResourceUrl} from '@angular/platform-browser';
import {BreakpointObserverService, MediaSize, NgClassObject} from '@core/services/breakpoint-observer.service';
import {FiltersService} from '@core/services/filters.service';
import {KonsultMetierService, MAX_RESULTS_PER_PAGE} from '@core/services/konsult-metier.service';
import {LogService} from '@core/services/log.service';
import {ThemeCacheService} from '@core/services/theme-cache.service';
import {TranslatePipe} from '@ngx-translate/core';
import {LoaderComponent} from '@shared/core/common/loader/loader.component';
import {Filters} from '@shared/models/filters';
import {Metadata, MetadataList} from 'micro_service_modules/api-kaccess';
import {NgxPaginationModule} from 'ngx-pagination';
import {BehaviorSubject, Subject} from 'rxjs';
import {debounceTime, takeUntil, tap} from 'rxjs/operators';
import {DataSetCardComponent} from '../data-set-card/data-set-card.component';

const FIRST_PAGE = 1;
const EMPTY_METADATA_LIST: MetadataList = {
    total: 0,
    items: []
};

@Component({
    selector: 'app-dataset-list',
    templateUrl: './dataset-list.component.html',
    styleUrls: ['./dataset-list.component.scss'],
    imports: [LoaderComponent, NgClass, DataSetCardComponent, NgxPaginationModule, TranslatePipe],
})
export class DatasetListComponent implements OnInit, OnDestroy {
    // Indique si on affiche le loader pendant le chargement es JDD
    public isLoading = false;
    metadataList = EMPTY_METADATA_LIST;
    private currentPage = FIRST_PAGE;
    offset = 0;
    readonly maxPageDesktop = 9;
    /** minimum = 5 */
    readonly maxPageMobile = 5;
    private readonly isDestroyed$ = new Subject<void>();
    @Input() producerUuid?: string;
    @Input() limit = MAX_RESULTS_PER_PAGE;
    @Input() mediaSize: MediaSize;
    /** On peut sélectionner une carte dans la liste ? */
    @Input() isSelectable = false;
    @Input() accessStatusHiddenValues;
    @Input() forceRowView = false;
    @Output() selectMetadata = new EventEmitter<Metadata>();
    @Output() dbSelectMetadata = new EventEmitter<Metadata>();
    @Output() metadataListTotal = new EventEmitter<number>();

    metadatasSearcher = new BehaviorSubject<null>(null);

    constructor(private readonly themeCacheService: ThemeCacheService,
                private readonly breakpointObserver: BreakpointObserverService,
                private readonly konsultMetierService: KonsultMetierService,
                private readonly filtersService: FiltersService,
                private readonly logService: LogService
    ) {
        themeCacheService.init();
    }

    ngOnInit(): void {
        this.filtersService.currentFilters.producerUuids = [this.producerUuid];
        this.mediaSize = this.breakpointObserver.getMediaSize();
        this.filtersService.filter$.pipe(takeUntil(this.isDestroyed$)).subscribe(() => {
            this.page = FIRST_PAGE;
        });

        //on set le filter par défaut sur la date pour éviter un rechargement une fois celui-ci mis à jour
        this.filtersService.orderFilter.value = '-dataset_dates.updated';

        // Dans une liste de JDD on ne peut faire une recherche que toutes les demi secondes
        this.metadatasSearcher.pipe(
            debounceTime(500),
            tap(() => this.searchMetadatas())
        ).subscribe();

        // Déclenchement de la recherche à l'arrivée sur le composant
        this.metadatasSearcher.next(null);
    }

    /**
     * @return ne renvoie jamais null (obligatoire pour le pipe paginate)
     */
    get metadataListItems(): Metadata[] {
        return this.metadataList.items ?? [];
    }

    get page(): number {
        return this.currentPage;
    }

    set page(value: number) {
        if (value < FIRST_PAGE) {
            console.warn('Page number cannot be less than ' + FIRST_PAGE);
            value = FIRST_PAGE;
        }
        this.currentPage = value;
        this.offset = (this.currentPage - 1) * this.limit;

        this.metadatasSearcher.next(null);
    }

    ngOnDestroy(): void {
        this.isDestroyed$.next();
    }

    /**
     * @returns Example : 'weather'
     */
    getThemePictoFor(metadata: Metadata): SafeResourceUrl {
        return this.themeCacheService.getThemePictoFor(metadata);
    }

    get paginationControlsNgClass(): NgClassObject {
        return this.breakpointObserver.getNgClassFromMediaSize('pagination-spacing');
    }

    get containerNgClass(): NgClassObject {
        if (this.forceRowView) {
            return {
                'data-set-container-sm': true,
                'data-set-container-lg': false,
                'data-set-container-xl': false,
                'data-set-container-xxl': false
            };
        }
        return {
            'data-set-container-sm': this.mediaSize.isXs || this.mediaSize.isSm || this.mediaSize.isMd,
            'data-set-container-lg': this.mediaSize.isLg,
            'data-set-container-xl': this.mediaSize.isXl,
            'data-set-container-xxl': this.mediaSize.isXxl
        };
    }

    getThemeLabelFor(metadata: Metadata): string {
        return this.themeCacheService.getThemeLabelFor(metadata);
    }

    /**
     * Appel du service
     */
    searchMetadatas(): void {
        this.isLoading = true;
        const fileTypes = this.filtersService.fileTypesFilter.value;
        if (fileTypes?.length) {
            this.searchMetadatasFilteredByFileType(fileTypes);
            return;
        }
        this.konsultMetierService
            .searchMetadatas(this.filtersService.currentFilters, this.accessStatusHiddenValues, this.offset, this.limit)
            .subscribe({
                next: (data) => {
                    this.metadataList = data ?? EMPTY_METADATA_LIST;
                    this.metadataListTotal.emit(data.total);
                    this.isLoading = false;
                },
                error: (error) => {
                    this.isLoading = false;
                    this.logService.error('getMetadatas failed', error.message);
                }
            });
    }

    private searchMetadatasFilteredByFileType(fileTypes: string[]): void {
        const currentFilters = this.filtersService.currentFilters;
        // Si le filtre type de fichier est le SEUL filtre actif, on peut utiliser l'instantané
        // complet du catalogue (mis en cache, quasi instantané) plutôt que de refaire un scan live
        // (~100s) par-dessus le scan déjà fait pour peupler les cases à cocher — c'est ce second
        // scan qui donnait l'impression que le filtre "moulinait sans résultat". Dès qu'un autre
        // filtre backend est actif en plus, on retombe sur le scan live (plus lent mais correct).
        const source$ = this.onlyFileTypeFilterActive(currentFilters)
            ? this.konsultMetierService.getCatalogSnapshot()
            : this.konsultMetierService.searchAllMetadatasMatchingFilters(currentFilters, this.accessStatusHiddenValues);

        source$.subscribe({
            next: (allMetadatas) => {
                const filtered = allMetadatas.filter(metadata =>
                    this.konsultMetierService.datasetMatchesFileTypes(metadata, fileTypes)
                );
                this.metadataList = {
                    total: filtered.length,
                    items: filtered.slice(this.offset, this.offset + this.limit)
                };
                this.metadataListTotal.emit(this.metadataList.total);
                this.isLoading = false;
            },
            error: (error) => {
                this.isLoading = false;
                this.logService.error('getMetadatas (file type filter) failed', error.message);
            }
        });
    }

    private onlyFileTypeFilterActive(filters: Filters): boolean {
        return !filters.search &&
            filters.themes.length === 0 &&
            filters.keywords.length === 0 &&
            filters.producerNames.length === 0 &&
            !filters.dates?.debut && !filters.dates?.fin &&
            filters.accessStatus === null &&
            // ngOnInit force toujours producerUuids à [this.producerUuid] (même undefined) : un
            // tableau de valeurs null/undefined signifie "aucun producteur imposé".
            (filters.producerUuids ?? []).every(id => id == null) &&
            (filters.globalIds ?? []).length === 0 &&
            !this.accessStatusHiddenValues?.length;
    }

    /**
     * Fonction permettant la gestion la pagination
     */
    handlePageChange(page: number): void {
        this.page = page;
        window.scroll(0, 0);
    }
}
