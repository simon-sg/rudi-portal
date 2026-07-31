import {Component, Input} from '@angular/core';
import {FiltersService} from '@core/services/filters.service';
import {ArrayFilter} from '@core/services/filters/array-filter';
import {ProducerCount} from '@core/services/konsult-metier.service';
import {ArrayFilterFormComponent} from '@shared/business/dataset/filters/filter-forms/array-filter-form.component';
import {Item} from '@shared/business/dataset/filters/filter-forms/item';

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatButton} from '@angular/material/button';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'app-producer-names-filter-form',
    templateUrl: './producer-names-filter-form.component.html',
    styleUrls: ['./producer-names-filter-form.component.scss'],
    imports: [FormsModule, ReactiveFormsModule, MatCheckbox, MatButton, TranslatePipe]
})
export class ProducerNamesFilterFormComponent extends ArrayFilterFormComponent<ProducerCount> {
    counts: Record<string, number> = {};

    constructor(
        protected readonly filtersService: FiltersService
    ) {
        super(filtersService);
    }

    @Input() set values(values: ProducerCount[] | undefined) {
        if (values) {
            this.counts = Object.fromEntries(values.map(pc => [pc.name, pc.count]));
        }
        super.values = values;
    }

    get formArrayName(): string {
        return 'prods';
    }

    protected get formGroupName(): string {
        return 'producer';
    }

    protected getItemFromValue(value: ProducerCount): Item {
        return {
            name: value.name,
            value: value.name
        };
    }

    protected getFilterFrom(filtersService: FiltersService): ArrayFilter {
        return filtersService.producerNamesFilter;
    }

}
