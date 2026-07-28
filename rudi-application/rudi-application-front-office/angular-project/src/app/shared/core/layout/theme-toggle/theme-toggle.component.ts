import {AsyncPipe} from '@angular/common';
import {Component, inject} from '@angular/core';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslatePipe} from '@ngx-translate/core';
import {ThemeService} from '@core/services/theme.service';

@Component({
    selector: 'app-theme-toggle',
    templateUrl: './theme-toggle.component.html',
    styleUrls: ['./theme-toggle.component.scss'],
    imports: [MatIconButton, MatIcon, MatTooltip, TranslatePipe, AsyncPipe]
})
export class ThemeToggleComponent {

    private readonly themeService = inject(ThemeService);

    readonly theme$ = this.themeService.theme$;

    handleClickToggle(): void {
        this.themeService.toggleTheme();
    }
}
