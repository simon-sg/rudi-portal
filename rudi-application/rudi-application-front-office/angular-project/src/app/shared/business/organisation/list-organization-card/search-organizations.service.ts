import {Injectable} from '@angular/core';
import {ProjektMetierService} from '@core/services/asset/project/projekt-metier.service';
import {Order} from '@features/organization/components/order/type';
import {MetadataFacets} from 'micro_service_modules/api-kaccess';
import {KonsultService} from 'micro_service_modules/konsult/konsult-api';
import {ProjectByOrganization} from 'micro_service_modules/projekt/projekt-model';
import {
    OrganizationBean,
    OrganizationService,
    OrganizationStatus,
    PagedOrganizationBeanList
} from 'micro_service_modules/strukture/api-strukture';
import {BehaviorSubject, Subscription} from 'rxjs';
import {map, tap} from 'rxjs/operators';

export interface SearchOrganisationsRequest {
    isPersonalSpace?: boolean;
    orgnizationStatus?: OrganizationStatus;
    uuids?: string[],
    name?: string,
    excludedOrganizationUuids?: string[],
    full?: boolean,
    active?: boolean;
    offset?: number;
    itemPerPage?: number;
    sortOrder?: Order;
}

export const searchDefaultPageSize = 12;
const searchDefaultOrder: Order = '-openingDate';
const maxFetchAll = 9999;

@Injectable({
    providedIn: 'root'
})
export class SearchOrganizationsService {
    currentPage$: BehaviorSubject<number>;
    currentSortOrder$: BehaviorSubject<Order>;
    totalOrganizations$: BehaviorSubject<number>;
    organizations$: BehaviorSubject<OrganizationBean[]>;
    isLoadingCatalogue$: BehaviorSubject<boolean>;
    datasetCountLoading$: BehaviorSubject<boolean>;
    projectsCountLoading$: BehaviorSubject<boolean>;
    searchName$: BehaviorSubject<string>;
    private subscription: Subscription;
    private readonly currentRequest: SearchOrganisationsRequest;
    private allOrganizations: OrganizationBean[];
    private lastSearchName: string;

    constructor(
        private readonly organizationService: OrganizationService,
        private readonly projektMetierService: ProjektMetierService,
        private readonly konsultService: KonsultService
    ) {
        this.currentRequest = {
            orgnizationStatus: OrganizationStatus.Validated,
            itemPerPage: searchDefaultPageSize
        };

        this.currentPage$ = new BehaviorSubject(1);
        this.currentSortOrder$ = new BehaviorSubject(searchDefaultOrder);
        this.totalOrganizations$ = new BehaviorSubject(0);
        this.organizations$ = new BehaviorSubject([]);
        this.isLoadingCatalogue$ = new BehaviorSubject(true);
        this.datasetCountLoading$ = new BehaviorSubject(false);
        this.projectsCountLoading$ = new BehaviorSubject(false);
        this.searchName$ = new BehaviorSubject('');
        this.allOrganizations = [];
        this.lastSearchName = '';
    }

    initSubscriptions(isPersonalSpace: boolean = false, itemPerPage?: number) {
        this.currentRequest.isPersonalSpace = isPersonalSpace;
        this.currentRequest.itemPerPage = searchDefaultPageSize;

        if (itemPerPage) {
            this.currentRequest.itemPerPage = itemPerPage;
        }
        this.subscription = new Subscription();
        this.subscription.add(this.initCurrentSortOrderSubscription());
        this.subscription.add(this.initCurrentPageSubscription());
        this.subscription.add(this.initCurrentSearchNameSubscription());
    }

    complete(): void {
        this.subscription.unsubscribe();
    }

    private initCurrentSortOrderSubscription(): Subscription {
        return this.currentSortOrder$
            .pipe(
                tap((sortOrder: Order) => this.currentRequest.sortOrder = sortOrder),
                map((sortOrder: Order): SearchOrganisationsRequest => ({
                    ...this.currentRequest,
                    sortOrder
                }))
            )
            .subscribe((request: SearchOrganisationsRequest) => this.searchOrganisationBeans(request));
    }

    private initCurrentPageSubscription(): Subscription {
        return this.currentPage$
            .pipe(
                tap((page: number) => this.currentRequest.offset = (page - 1) * this.currentRequest.itemPerPage),
                map((page: number): SearchOrganisationsRequest => ({
                    ...this.currentRequest,
                    offset: (page - 1) * this.currentRequest.itemPerPage
                }))
            )
            .subscribe((request: SearchOrganisationsRequest) => this.searchOrganisationBeans(request));
    }

    private initCurrentSearchNameSubscription(): Subscription {
        return this.searchName$
            .subscribe((name: string) => {
                this.currentRequest.name = name || undefined;
                // currentPage$.next(1) triggers the fetch via initCurrentPageSubscription
                this.currentPage$.next(1);
            });
    }

    private isClientSideOrder(order: Order): boolean {
        return order === 'datasetCount' || order === '-datasetCount'
            || order === 'projectCount' || order === '-projectCount';
    }

    private searchOrganisationBeans(searchRequest: SearchOrganisationsRequest): void {
        if (this.isClientSideOrder(searchRequest.sortOrder)) {
            this.searchAllOrganisationsClientSide(searchRequest);
        } else {
            this.searchOrganisationsServerSide(searchRequest);
        }
    }

    private searchOrganisationsServerSide(searchRequest: SearchOrganisationsRequest): void {
        this.isLoadingCatalogue$.next(true);
        if (searchRequest.isPersonalSpace) {
            this.organizationService.searchMyOrganizationBeans(
                searchRequest.uuids,
                searchRequest.name,
                searchRequest.full ?? true,
                searchRequest.active,
                searchRequest.offset,
                searchRequest.itemPerPage,
                searchRequest.sortOrder
            ).subscribe((data: PagedOrganizationBeanList) => {
                this.totalOrganizations$.next(data.total);
                this.organizations$.next(data.elements);
                this.isLoadingCatalogue$.next(false);
            });
        } else {
            this.organizationService.searchPublicOrganizationsBeans(
                searchRequest.name,
                searchRequest.uuids,
                searchRequest.excludedOrganizationUuids,
                searchRequest.full ?? true,
                searchRequest.active,
                searchRequest.offset,
                searchRequest.itemPerPage,
                searchRequest.sortOrder
            ).subscribe((data: PagedOrganizationBeanList) => {
                this.totalOrganizations$.next(data.total);
                this.organizations$.next(data.elements);
                this.isLoadingCatalogue$.next(false);
            });
        }
    }

    private searchAllOrganisationsClientSide(searchRequest: SearchOrganisationsRequest): void {
        const needsFullFetch = !this.allOrganizations.length || this.lastSearchName !== (searchRequest.name || '');

        if (!needsFullFetch) {
            this.applyClientSidePagination(searchRequest);
            return;
        }

        this.isLoadingCatalogue$.next(true);

        const obs = searchRequest.isPersonalSpace
            ? this.organizationService.searchMyOrganizationBeans(
                searchRequest.uuids,
                searchRequest.name,
                searchRequest.full ?? true,
                searchRequest.active,
                0,
                maxFetchAll,
                undefined
            )
            : this.organizationService.searchPublicOrganizationsBeans(
                searchRequest.name,
                searchRequest.uuids,
                searchRequest.excludedOrganizationUuids,
                searchRequest.full ?? true,
                searchRequest.active,
                0,
                maxFetchAll,
                undefined
            );

        obs.subscribe({
            next: (data: PagedOrganizationBeanList) => {
                const allOrgs = data.elements || [];
                this.allOrganizations = allOrgs;
                this.lastSearchName = searchRequest.name || '';
                this.applyClientSidePagination(searchRequest);
            },
            error: () => {
                this.isLoadingCatalogue$.next(false);
            }
        });
    }

    private applyClientSidePagination(searchRequest: SearchOrganisationsRequest): void {
        const sortedOrgs = this.sortClientSide(this.allOrganizations, searchRequest.sortOrder);
        const total = sortedOrgs.length;
        const offset = searchRequest.offset || 0;
        const limit = searchRequest.itemPerPage || searchDefaultPageSize;
        const pagedOrgs = sortedOrgs.slice(offset, offset + limit);

        this.totalOrganizations$.next(total);
        this.organizations$.next(pagedOrgs);
        this.isLoadingCatalogue$.next(false);
    }

    private sortClientSide(orgs: OrganizationBean[], order: Order): OrganizationBean[] {
        const sorted = [...orgs];
        switch (order) {
            case 'datasetCount':
                sorted.sort((a, b) => (a.datasetCount ?? 0) - (b.datasetCount ?? 0));
                break;
            case '-datasetCount':
                sorted.sort((a, b) => (b.datasetCount ?? 0) - (a.datasetCount ?? 0));
                break;
            case 'projectCount':
                sorted.sort((a, b) => (a.projectCount ?? 0) - (b.projectCount ?? 0));
                break;
            case '-projectCount':
                sorted.sort((a, b) => (b.projectCount ?? 0) - (a.projectCount ?? 0));
                break;
        }
        return sorted;
    }

    private updateOrganizationsProjectCount(): void {
        this.projectsCountLoading$.next(true);
        const organizations: OrganizationBean[] = [...this.organizations$.value];

        this.projektMetierService.getNumberOfProjectsPerOwners({
            owner_uuids: organizations.map((e: OrganizationBean) => e.uuid)
        }).subscribe((projectByOrganizations: ProjectByOrganization[]): void => {

            projectByOrganizations.forEach((projectByOrganization: ProjectByOrganization) => {
                const orga = organizations.find(organisation => organisation.uuid === projectByOrganization.organization_uuid);
                if (orga) {
                    orga.projectCount = projectByOrganization.projectCount;
                }
            });

            this.projectsCountLoading$.next(false);
            this.organizations$.next(organizations);
        });
    }

    private updateOrganizationDatasetCount(): void {
        this.datasetCountLoading$.next(true);
        const organizations: OrganizationBean[] = [...this.organizations$.value];

        this.konsultService.searchMetadataFacets(['producer_organization_id']).subscribe(
            (metadataFacets: MetadataFacets) => {
                const targetedFacet = metadataFacets.items.find(i => i.propertyName === 'producer_organization_id');
                organizations.forEach((organization: OrganizationBean) => {
                    const datasetCount = targetedFacet.values.find(value => value.value == organization.uuid);
                    if (datasetCount) {
                        organization.datasetCount = datasetCount.count;
                    }
                });
                this.datasetCountLoading$.next(false);
                this.organizations$.next(organizations);
            });
    }
}
