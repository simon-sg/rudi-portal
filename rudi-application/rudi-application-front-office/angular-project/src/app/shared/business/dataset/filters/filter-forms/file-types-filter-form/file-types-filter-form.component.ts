import {Component, Input} from '@angular/core';
import {FiltersService} from '@core/services/filters.service';
import {ArrayFilter} from '@core/services/filters/array-filter';
import {FileTypeCount} from '@core/services/konsult-metier.service';
import {ArrayFilterFormComponent} from '@shared/business/dataset/filters/filter-forms/array-filter-form.component';
import {Item} from '@shared/business/dataset/filters/filter-forms/item';

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatButton} from '@angular/material/button';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'app-file-types-filter-form',
    templateUrl: './file-types-filter-form.component.html',
    styleUrls: ['./file-types-filter-form.component.scss'],
    imports: [FormsModule, ReactiveFormsModule, MatCheckbox, MatButton, TranslatePipe]
})
export class FileTypesFilterFormComponent extends ArrayFilterFormComponent<FileTypeCount> {
    /** Nombre de JDD par type, affiché à côté de chaque case à cocher (pas exposé via {@link Item}, qui ne sert qu'au filtrage/aux chips). */
    counts: Record<string, number> = {};

    constructor(
        protected readonly filtersService: FiltersService
    ) {
        super(filtersService);
    }

    @Input() set values(values: FileTypeCount[] | undefined) {
        if (values) {
            this.counts = Object.fromEntries(values.map(fileTypeCount => [fileTypeCount.type, fileTypeCount.count]));
        }
        super.values = values;
    }

    get formArrayName(): string {
        return 'fileTypes';
    }

    protected get formGroupName(): string {
        return 'fileType';
    }

    protected getItemFromValue(value: FileTypeCount): Item {
        return {
            name: value.type,
            value: value.type
        };
    }

    protected getFilterFrom(filtersService: FiltersService): ArrayFilter {
        return filtersService.fileTypesFilter;
    }

}
