import {Injectable} from '@angular/core';
import {GridApi} from 'ag-grid-community';
import {BehaviorSubject, Observable} from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SpreadsheetFilterService {

    /**
     * État « au moins un filtre de colonne est actif » dans le tableau ag-grid actuellement affiché.
     */
    private readonly filterActiveSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

    /**
     * GridApi ag-grid actuellement enregistrée par le tableau visible (SpreadsheetComponent).
     */
    private gridApi: GridApi | null = null;

    get isFilterActive(): boolean {
        return this.filterActiveSubject.getValue();
    }

    get isFilterActive$(): Observable<boolean> {
        return this.filterActiveSubject.asObservable();
    }

    get currentGridApi(): GridApi | null {
        return this.gridApi;
    }

    /**
     * Enregistre la GridApi du tableau (à appeler sur l'événement gridReady) et recalcule
     * immédiatement l'état « filtre actif ».
     * @param gridApi la GridApi du tableau, ou null s'il n'y en a pas.
     */
    registerGridApi(gridApi: GridApi | null): void {
        this.gridApi = gridApi;
        this.refreshFilterState();
    }

    /**
     * Recalcule l'état « filtre actif » à partir de la GridApi enregistrée
     * (à appeler sur l'événement ag-grid filterChanged).
     */
    refreshFilterState(): void {
        this.filterActiveSubject.next(this.gridApi?.isAnyFilterPresent() ?? false);
    }

    /**
     * Désenregistre la GridApi du tableau (à appeler à la destruction du composant tableau)
     * et remet l'état « filtre actif » à false.
     */
    unregisterGridApi(): void {
        this.gridApi = null;
        this.filterActiveSubject.next(false);
    }
}
