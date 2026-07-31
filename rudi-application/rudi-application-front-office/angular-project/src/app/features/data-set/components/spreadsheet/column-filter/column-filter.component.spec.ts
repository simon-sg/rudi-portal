import {ComponentFixture, TestBed} from '@angular/core/testing';
import {IDoesFilterPassParams, IFilterParams} from 'ag-grid-community';
import {ColumnFilterComponent} from './column-filter.component';

interface MockRow {
    data: {col: unknown};
}

function passParams(row: MockRow): IDoesFilterPassParams {
    return {node: row, data: row.data} as unknown as IDoesFilterPassParams;
}

function mockChangeEvent(checked: boolean): Event {
    return {target: {checked}} as unknown as Event;
}

describe('ColumnFilterComponent', () => {
    let component: ColumnFilterComponent;
    let fixture: ComponentFixture<ColumnFilterComponent>;
    let filterChangedCallback: jasmine.Spy;

    const rows: MockRow[] = [
        {data: {col: 'A'}},
        {data: {col: 'b'}},
        {data: {col: 'A'}},
        {data: {col: '10'}},
        {data: {col: '2'}},
        {data: {col: null}},
        {data: {col: 3}}
    ];

    function buildParams(): IFilterParams {
        return {
            getValue: (node: MockRow): unknown => node.data.col,
            rowModel: {
                forEachNode: (callback: (node: MockRow) => void): void => {
                    rows.forEach(callback);
                }
            },
            filterChangedCallback,
            filterModifiedCallback: jasmine.createSpy('filterModifiedCallback')
        } as unknown as IFilterParams;
    }

    beforeEach(async () => {
        filterChangedCallback = jasmine.createSpy('filterChangedCallback');
        await TestBed.configureTestingModule({
            imports: [ColumnFilterComponent]
        })
            .compileComponents();
        fixture = TestBed.createComponent(ColumnFilterComponent);
        component = fixture.componentInstance;
        component.agInit(buildParams());
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('computes distinct values on all rows, sorted naturally', () => {
        expect(component.distinctValues).toEqual(['', '2', '3', '10', 'A', 'b']);
    });

    it('is inactive when all values are checked', () => {
        expect(component.checkedValues.size).toBe(component.distinctValues.length);
        expect(component.isFilterActive()).toBeFalse();
    });

    it('is active when only some values are checked', () => {
        component.onValueChange(mockChangeEvent(false), 'A');
        expect(component.isFilterActive()).toBeTrue();
        expect(filterChangedCallback).toHaveBeenCalled();
    });

    it('lets a row pass when its value is checked', () => {
        component.onValueChange(mockChangeEvent(false), 'b');
        expect(component.doesFilterPass(passParams(rows[0]))).toBeTrue();
        expect(component.doesFilterPass(passParams(rows[1]))).toBeFalse();
    });

    it('treats null, undefined and empty string as the same blank value', () => {
        component.checkedValues.clear();
        component.checkedValues.add('');
        expect(component.doesFilterPass(passParams(rows[5]))).toBeTrue();
        expect(component.doesFilterPass(passParams(rows[6]))).toBeFalse();
    });

    it('serializes and deserializes its model', () => {
        component.onValueChange(mockChangeEvent(false), 'A');
        component.onValueChange(mockChangeEvent(false), 'b');
        const model = component.getModel();
        expect(model?.filterType).toBe('columnFilter');
        expect(model?.values).toContain('10');
        expect(model?.values).not.toContain('A');

        component.setModel({filterType: 'columnFilter', values: ['10']});
        expect(component.checkedValues).toEqual(new Set(['10']));
        expect(component.isFilterActive()).toBeTrue();

        component.setModel(null);
        expect(component.isFilterActive()).toBeFalse();
    });

    it('filters the checkbox list with the search text, case-insensitively', () => {
        component.searchText = 'a';
        expect(component.displayedValues).toEqual(['A']);
        component.searchText = '  ';
        expect(component.displayedValues).toEqual(component.distinctValues);
    });

    it('tracks the select all checkbox against the displayed values only', () => {
        component.searchText = 'a';
        component.onSelectAllChange(mockChangeEvent(false));
        expect(component.checkedValues.has('A')).toBeFalse();
        expect(component.distinctValues.some((value: string) => value !== 'A' && component.checkedValues.has(value))).toBeTrue();
        expect(component.selectAllChecked).toBeFalse();

        component.searchText = '';
        expect(component.selectAllIndeterminate).toBeTrue();

        component.onSelectAllChange(mockChangeEvent(true));
        expect(component.checkedValues.size).toBe(component.distinctValues.length);
        expect(component.selectAllChecked).toBeTrue();
    });

    it('clears all values and the search text', () => {
        component.searchText = 'a';
        component.onClear();
        expect(component.checkedValues.size).toBe(0);
        expect(component.searchText).toBe('');
        expect(component.isFilterActive()).toBeFalse();
        expect(filterChangedCallback).toHaveBeenCalled();
    });

    it('recomputes distinct values and drops stale checks when rows are reloaded', () => {
        const reloadedRows: MockRow[] = [{data: {col: 'X'}}];
        const newParams = buildParams();
        newParams.getValue = (() => 'X') as typeof newParams.getValue;
        (newParams.rowModel as {forEachNode: (callback: (node: MockRow) => void) => void}).forEachNode =
            (callback: (node: MockRow) => void): void => {
                reloadedRows.forEach(callback);
            };
        component['params'] = newParams;
        component.checkedValues = new Set(['A', 'X']);
        component.onNewRowsLoaded();
        expect(component.distinctValues).toEqual(['X']);
        expect(component.checkedValues).toEqual(new Set(['X']));
        expect(filterChangedCallback).toHaveBeenCalled();
    });

    it('resets the search text when the popup reopens', () => {
        component.searchText = 'a';
        component.afterGuiAttached();
        expect(component.searchText).toBe('');
    });
});
