import {Component, ElementRef, ViewChild} from '@angular/core';
import {IFilterAngularComp} from 'ag-grid-angular';
import {IDoesFilterPassParams, IFilterParams} from 'ag-grid-community';

/** Modèle sérialisable du filtre, échangé via l'API de filtres d'ag-grid (getModel/setModel). */
export interface ColumnFilterModel {
    filterType: string;
    values: string[];
}

/** Type logique du filtre, remonté dans le modèle pour distinguer ce filtre des filtres natifs. */
export const COLUMN_FILTER_TYPE = 'columnFilter';

/** Libellé affiché pour les cellules sans valeur (null, undefined ou chaîne vide). */
const BLANK_LABEL = '(vides)';

/** Valeur normalisée d'une cellule vide, utilisée comme clé dans la liste des valeurs distinctes. */
const EMPTY_VALUE = '';

@Component({
    selector: 'app-column-filter',
    templateUrl: './column-filter.component.html',
    styleUrls: ['./column-filter.component.scss']
})
export class ColumnFilterComponent implements IFilterAngularComp {

    @ViewChild('searchInput')
    private readonly searchInput?: ElementRef<HTMLInputElement>;

    private params: IFilterParams;

    /** Valeurs distinctes de la colonne, calculées sur toutes les lignes du jeu de données (et non
     * sur les seules lignes déjà visibles après d'autres filtres). */
    distinctValues: string[] = [];

    /** Valeurs actuellement cochées, sous forme normalisée en chaîne de caractères. */
    checkedValues = new Set<string>();

    /** Texte du champ de recherche : ne filtre que les cases à cocher proposées, pas les lignes. */
    searchText = '';

    private static normalizeValue(value: unknown): string {
        if (value === null || value === undefined) {
            return EMPTY_VALUE;
        }
        return String(value);
    }

    private static displayLabel(value: string): string {
        return value === EMPTY_VALUE ? BLANK_LABEL : value;
    }

    /** Tri naturel : numérique quand les valeurs sont des nombres, alphabétique sinon, insensible à la casse. */
    private static compareValues(a: string, b: string): number {
        if (a === b) {
            return 0;
        }
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
    }

    agInit(params: IFilterParams): void {
        this.params = params;
        this.recomputeDistinctValues(true);
    }

    /**
     * Valeurs distinctes à proposer à l'utilisateur, restreintes au texte saisi dans la recherche
     * (sous-chaîne, insensible à la casse).
     */
    get displayedValues(): string[] {
        const term = this.searchText.trim().toLowerCase();
        if (!term) {
            return this.distinctValues;
        }
        return this.distinctValues.filter((value: string) => {
            return ColumnFilterComponent.displayLabel(value).toLowerCase().includes(term);
        });
    }

    /** Toutes les valeurs affichées par la recherche sont cochées. */
    get selectAllChecked(): boolean {
        const displayed = this.displayedValues;
        return displayed.length > 0 && displayed.every((value: string) => this.checkedValues.has(value));
    }

    /** Une partie seulement des valeurs affichées par la recherche est cochée. */
    get selectAllIndeterminate(): boolean {
        const displayed = this.displayedValues;
        return displayed.some((value: string) => this.checkedValues.has(value)) && !this.selectAllChecked;
    }

    /**
     * Le filtre est actif (et donc appliqué aux lignes) seulement quand au moins une case est cochée
     * sans couvrir la totalité des valeurs possibles : tout cocher équivaut à aucun filtre.
     */
    isFilterActive(): boolean {
        return this.checkedValues.size > 0 && this.checkedValues.size < this.distinctValues.length;
    }

    /** Une ligne passe le filtre si la valeur de sa cellule dans la colonne est parmi les valeurs cochées. */
    doesFilterPass(params: IDoesFilterPassParams): boolean {
        if (!this.isFilterActive()) {
            return true;
        }
        const value = ColumnFilterComponent.normalizeValue(this.params.getValue(params.node));
        return this.checkedValues.has(value);
    }

    getModel(): ColumnFilterModel | null {
        if (!this.isFilterActive()) {
            return null;
        }
        return {
            filterType: COLUMN_FILTER_TYPE,
            values: [...this.checkedValues]
        };
    }

    setModel(model: ColumnFilterModel | null): void {
        this.searchText = '';
        if (model && Array.isArray(model.values)) {
            const knownValues = new Set(this.distinctValues);
            this.checkedValues = new Set(model.values.filter((value: string) => knownValues.has(value)));
        } else {
            // Pas de modèle (réinitialisation) => tout est cochable => filtre inactif
            this.checkedValues = new Set(this.distinctValues);
        }
    }

    /** Appelé à chaque ouverture du popup : la recherche repart de zéro, les cases cochées sont conservées. */
    afterGuiAttached(): void {
        this.searchText = '';
        this.searchInput?.nativeElement.focus();
    }

    /** Appelé quand les données de la grille sont remplacées : les valeurs distinctes sont recalculées. */
    onNewRowsLoaded(): void {
        this.recomputeDistinctValues(false);
        this.params.filterChangedCallback();
    }

    onSearchChange(event: Event): void {
        this.searchText = (event.target as HTMLInputElement).value;
    }

    onSelectAllChange(event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        const displayed = this.displayedValues;
        if (checked) {
            displayed.forEach((value: string) => this.checkedValues.add(value));
        } else {
            displayed.forEach((value: string) => this.checkedValues.delete(value));
        }
        this.params.filterChangedCallback();
    }

    onValueChange(event: Event, value: string): void {
        const checked = (event.target as HTMLInputElement).checked;
        if (checked) {
            this.checkedValues.add(value);
        } else {
            this.checkedValues.delete(value);
        }
        this.params.filterChangedCallback();
    }

    /** Décoche toutes les valeurs et vide la recherche. */
    onClear(): void {
        this.checkedValues.clear();
        this.searchText = '';
        this.params.filterChangedCallback();
    }

    displayLabel(value: string): string {
        return ColumnFilterComponent.displayLabel(value);
    }

    /**
     * Recalcule la liste des valeurs distinctes de la colonne en parcourant toutes les lignes du jeu
     * de données. À la création du filtre (initial = true), toutes les valeurs sont cochées par défaut
     * (filtre inactif). Lors d'un rechargement des données (initial = false), les cases cochées sont
     * conservées, en retirant celles qui n'existent plus.
     */
    private recomputeDistinctValues(initial: boolean): void {
        const values = new Set<string>();
        this.params.rowModel.forEachNode((node) => {
            values.add(ColumnFilterComponent.normalizeValue(this.params.getValue(node)));
        });
        this.distinctValues = [...values].sort(ColumnFilterComponent.compareValues);
        if (initial) {
            this.checkedValues = new Set(this.distinctValues);
        } else {
            this.checkedValues = new Set([...this.checkedValues].filter((value: string) => values.has(value)));
        }
    }
}
