import {AsyncPipe, NgClass} from '@angular/common';
import {Component, OnDestroy, OnInit, Renderer2, ViewChild} from '@angular/core';
import {MatBadge} from '@angular/material/badge';
import {MatButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatSidenav, MatSidenavContainer, MatSidenavContent} from '@angular/material/sidenav';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {BreakpointObserverService, MediaSize} from '@core/services/breakpoint-observer.service';
import {FiltersService} from '@core/services/filters.service';
import {AccessStatusFiltersType} from '@core/services/filters/access-status-filters-type';
import {DEFAULT_VALUE as DEFAULT_ORDER_VALUE, OrderValue} from '@core/services/filters/order-filter';
import {KonsultMetierService, ProducerCount} from '@core/services/konsult-metier.service';
import {KosMetierService} from '@core/services/kos-metier.service';
import {ProvidersMetierService} from '@core/services/providers-metier.service';
import {SidenavOpeningsService} from '@core/services/sidenav-openings.service';
import {TranslatePipe} from '@ngx-translate/core';
import {
    AccessStatusFilterFormComponent,
    AccessStatusFilterItem
} from '@shared/business/dataset/filters/filter-forms/access-status-filter-form/access-status-filter-form.component';
import {DatesFilterFormComponent} from '@shared/business/dataset/filters/filter-forms/dates-filter-form/dates-filter-form.component';
import {Item} from '@shared/business/dataset/filters/filter-forms/item';
import {OrderFilterFormComponent} from '@shared/business/dataset/filters/filter-forms/order-filter-form/order-filter-form.component';
import {
    ProducerNamesFilterFormComponent
} from '@shared/business/dataset/filters/filter-forms/producer-names-filter-form/producer-names-filter-form.component';
import {ThemesFilterFormComponent} from '@shared/business/dataset/filters/filter-forms/themes-filter-form/themes-filter-form.component';
import {
    FilterSidenavContainerComponent
} from '@shared/business/dataset/filters/filter-sidenav-container/filter-sidenav-container.component';
import {ListContainerComponent} from '@shared/business/dataset/filters/list-container/list-container.component';
import {PageTitleComponent} from '@shared/core/layout/page-title/page-title.component';
import {Filters} from '@shared/models/filters';
import {SimpleSkosConcept} from 'micro_service_modules/kos/kos-model';
import {of, Subject} from 'rxjs';
import {switchMap, takeUntil} from 'rxjs/operators';

@Component({
    selector: 'app-list',
    templateUrl: './list.component.html',
    styleUrls: ['./list.component.scss'],
    imports: [MatSidenavContainer, MatSidenav, FilterSidenavContainerComponent, MatIcon, MatBadge, MatButton, OrderFilterFormComponent, ThemesFilterFormComponent, ProducerNamesFilterFormComponent, DatesFilterFormComponent, AccessStatusFilterFormComponent, MatSidenavContent, NgClass, PageTitleComponent, ListContainerComponent, AsyncPipe, TranslatePipe]
})
export class ListComponent implements OnInit, OnDestroy {
    @ViewChild('sidenav') sidenav: MatSidenav;
    accessStatusfilterForcedValue; // positionné à undefined en attendant le mode mobile de ../../components/list-container

    mediaSize: MediaSize;
    themes: SimpleSkosConcept[];
    orders: OrderValue[] = [
        'resource_title',
        '-resource_title',
        'dataset_dates.created',
        '-dataset_dates.created',
        'producer.organization_name',
        '-producer.organization_name',
    ];

    producerNames: ProducerCount[];
    selectedDatesItems: Item[] = [];
    selectedThemeItems: Item[] = [];
    selectedProducerItems: Item[] = [];

    selectedAccessStatusFilterItems: AccessStatusFilterItem[] = [];
    private readonly isDestroyed$: Subject<void> = new Subject<void>();

    constructor(
        private readonly konsultMetierService: KonsultMetierService,
        private readonly kosMetierService: KosMetierService,
        private readonly router: Router,
        private readonly route: ActivatedRoute,
        private readonly filtersService: FiltersService,
        private readonly breakpointObserver: BreakpointObserverService,
        private readonly providersMetierService: ProvidersMetierService,
        private readonly sidenavOpeningsService: SidenavOpeningsService,
        private readonly renderer: Renderer2
    ) {
    }

    ngOnInit(): void {
        // Doit s'exécuter avant l'initialisation des enfants (ListContainerComponent /
        // DatasetListComponent), qui déclenchent la recherche dès leur ngOnInit : on veut que les
        // filtres restaurés depuis l'URL soient déjà en place au moment du tout premier appel réseau.
        this.hydrateFiltersFromUrl();
        this.filtersService.filter$.pipe(takeUntil(this.isDestroyed$)).subscribe(filters => {
            this.syncUrlFromFilters(filters);
        });

        this.mediaSize = this.breakpointObserver.getMediaSize();
        this.sidenavOpeningsService.sideNavOpening$.pipe(takeUntil(this.isDestroyed$)).subscribe(() => {
            this.sidenav.open();
        });
        this.konsultMetierService.getProducerNamesWithCounts().subscribe(
            producerNames => this.producerNames = producerNames
        );
        this.konsultMetierService.getThemeCodes().pipe(
            switchMap(themeCodes => themeCodes.length > 0 ? this.kosMetierService.getThemes(themeCodes) : of([]))
        ).subscribe(concepts => {
            this.themes = concepts;
        });
    }

    ngOnDestroy(): void {
        this.isDestroyed$.next();
        this.renderer.removeClass(document.body, 'menu');
    }

    submitFilters(): void {
        this.filtersService.deleteAllFilters();
        this.sidenav.close();
    }

    /**
     * Restaure les filtres depuis les query params de l'URL courante (partage/marque-page/édition
     * manuelle de l'URL, ou retour arrière du navigateur vers une URL de catalogue déjà filtrée).
     * Ne touche que les filtres réellement pilotés par l'UI du catalogue générique (voir spec).
     */
    private hydrateFiltersFromUrl(): void {
        const params = this.route.snapshot.queryParamMap;
        if (params.keys.length === 0) {
            return;
        }
        if (params.has('search')) {
            this.filtersService.searchFilter.value = params.get('search');
        }
        if (params.has('themes')) {
            this.filtersService.themesFilter.value = params.getAll('themes');
        }
        if (params.has('producerNames')) {
            this.filtersService.producerNamesFilter.value = params.getAll('producerNames');
        }
        if (params.has('debut') || params.has('fin')) {
            this.filtersService.datesFilter.value = {
                debut: params.get('debut'),
                fin: params.get('fin')
            };
        }
        if (params.has('order')) {
            this.filtersService.orderFilter.value = params.get('order') as OrderValue;
        }
        if (params.has('accessStatus')) {
            this.filtersService.accessStatusFilter.value = params.get('accessStatus') as AccessStatusFiltersType;
        }
        if (params.has('fileTypes')) {
            this.filtersService.fileTypesFilter.value = params.getAll('fileTypes');
        }
    }

    /**
     * Répercute l'état courant des filtres dans l'URL. `replaceUrl: true` : on ne veut pas empiler
     * une entrée d'historique à chaque frappe dans la barre de recherche, seulement refléter l'état
     * courant pour qu'il soit partageable/marque-pageable et retrouvé par un retour arrière venant
     * d'une autre page (ex. fiche détail).
     */
    private syncUrlFromFilters(filters: Filters): void {
        const queryParams: Params = {
            search: filters.search || null,
            themes: filters.themes?.length ? filters.themes : null,
            producerNames: filters.producerNames?.length ? filters.producerNames : null,
            debut: filters.dates?.debut || null,
            fin: filters.dates?.fin || null,
            order: filters.order !== DEFAULT_ORDER_VALUE ? filters.order : null,
            accessStatus: filters.accessStatus || null,
            fileTypes: filters.fileTypes?.length ? filters.fileTypes : null,
        };
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams,
            replaceUrl: true
        });
    }
}
