import {Component, Input, OnDestroy, ViewChild} from '@angular/core';
import {AgGridAngular} from 'ag-grid-angular';
import {ColDef, GridOptions} from 'ag-grid-community';
import {SpreadsheetFilterService} from '@core/services/data-set/spreadsheet-filter.service';
import {ColumnFilterComponent} from './column-filter/column-filter.component';
import {SPREADSHEET_LOCALE_FR} from './spreadsheet-locale-fr';

export const SPREADSHEET_COLDEF_INDEX: ColDef = {
    field: '',
    width: 75,
    valueGetter: 'node.rowIndex + 1',
    cellClass: 'ag-first-cell-column',
    filter: false
};

@Component({
    selector: 'app-spreadsheet',
    templateUrl: './spreadsheet.component.html',
    styleUrls: ['./spreadsheet.component.scss'],
    imports: [AgGridAngular]
})
export class SpreadsheetComponent implements OnDestroy {

    constructor(private readonly spreadsheetFilterService: SpreadsheetFilterService) {
        this.defaultColDef = SpreadsheetComponent.createDefaultColDef();
    }

    @ViewChild(AgGridAngular) grid?: AgGridAngular;

    gridOptions: GridOptions = {
        localeText: SPREADSHEET_LOCALE_FR
    };

    @Input()
    public rowData: unknown[] = [];

    @Input()
    columnDefs: ColDef[];

    public defaultColDef: ColDef;

    /**
     * Méthode qui initialise le tri et le filtre par défaut de toutes les colonnes
     * @private
     */
    private static createDefaultColDef(): ColDef {
        return {
            sortable: true,
            resizable: true,
            filter: ColumnFilterComponent,
        };
    }

    autoSizeColumns(): void {
        this.grid?.api.autoSizeAllColumns();
    }

    /**
     * Déclenché sur l'événement ag-grid gridReady : autosize des colonnes puis
     * enregistrement de la GridApi auprès du service partagé.
     */
    onGridReady(): void {
        this.autoSizeColumns();
        this.spreadsheetFilterService.registerGridApi(this.grid?.api ?? null);
    }

    /**
     * Déclenché sur l'événement ag-grid filterChanged : autosize des colonnes puis
     * recalcul de l'état « au moins un filtre actif ».
     */
    onFilterChanged(): void {
        this.autoSizeColumns();
        this.spreadsheetFilterService.refreshFilterState();
    }

    ngOnDestroy(): void {
        this.spreadsheetFilterService.unregisterGridApi();
    }

}
