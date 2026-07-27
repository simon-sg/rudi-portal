import {Component, OnInit} from '@angular/core';
import {NavigationEnd, Router, RouterOutlet} from '@angular/router';

import {BreakpointObserverService, MediaSize} from '@core/services/breakpoint-observer.service';
import {CustomizationService} from '@core/services/customization.service';
import {LogService} from '@core/services/log.service';
import {PageTitleService} from '@core/services/page-title.service';
import {PropertiesMetierService} from '@core/services/properties-metier.service';
import {RouteHistoryService} from '@core/services/route-history.service';
import {TranslateService} from '@ngx-translate/core';
import {FooterComponent} from '@shared/core/layout/footer/footer.component';
import {HeaderComponent} from '@shared/core/layout/header/header.component';
import {CustomizationDescription, KonsultService} from 'micro_service_modules/konsult/konsult-api';
import {Script} from 'micro_service_modules/konsult/konsult-model';
import {EMPTY} from 'rxjs';
import {filter, map, switchMap} from 'rxjs/operators';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    imports: [HeaderComponent, RouterOutlet, FooterComponent]
})
export class AppComponent implements OnInit {

    constructor(
        private readonly routeHistoryService: RouteHistoryService,
        private readonly breakpointObserver: BreakpointObserverService,
        private readonly translate: TranslateService,
        private readonly router: Router,
        private readonly pageTitleService: PageTitleService,
        private readonly propertiesService: PropertiesMetierService,
        private readonly customizationService: CustomizationService,
        private readonly konsultService: KonsultService,
        private readonly logger: LogService,
    ) {
        translate.setFallbackLang('fr');
        router.events.pipe(
            filter(event => event instanceof NavigationEnd),
            map(event => event as NavigationEnd),
            map(event => event.url)
        ).subscribe(url => {
            pageTitleService.setPageTitleFromUrl(url);
            this.loadScripts();
        });
    }

    mediaSize: MediaSize;

    /**
     * Méthode de chargement de scripts supplémentaires
     * @private
     */
    private static loadScript(script: Script): void {
        const scriptUrl = script.url;
        if (!scriptUrl) {
            return;
        }

        const existing = document.querySelector(`script[src="${CSS.escape(scriptUrl)}"]`);
        if (existing) {
            if (!script.reload) {
                return;
            }
            existing.remove();
        }

        const node = document.createElement('script');
        node.src = scriptUrl;
        node.type = 'text/javascript';
        node.async = true;
        document.head.appendChild(node);
    }

    ngOnInit(): void {
        this.mediaSize = this.breakpointObserver.getMediaSize();

        this.loadScripts();
        this.loadOverrideCss();
    }

    loadScripts(): void {
        // appel aux properties back + passer le résultat au loadscript
        this.propertiesService.getScripts('scripts').subscribe(scripts => scripts?.forEach(script => AppComponent.loadScript(script)));
    }

    /**
     * Charge et injecte le CSS de surcharge (customization.json > overrideCssFile), s'il est configuré.
     * Permet à un déploiement de personnaliser les couleurs (--primary-color, --accent-color, etc.)
     * sans reconstruire le bundle Angular.
     */
    loadOverrideCss(): void {
        this.customizationService.getCustomizationDescription().pipe(
            switchMap((description: CustomizationDescription) => {
                if (!description.override_css_file) {
                    return EMPTY;
                }
                return this.konsultService.downloadCustomizationResource(description.override_css_file);
            })
        ).subscribe({
            next: (blob: Blob) => {
                if (!blob || blob.size === 0) {
                    return;
                }
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = URL.createObjectURL(blob);
                document.head.appendChild(link);
            },
            error: (error) => this.logger.error(error)
        });
    }
}
