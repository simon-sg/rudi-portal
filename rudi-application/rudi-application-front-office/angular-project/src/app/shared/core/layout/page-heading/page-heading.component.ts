import { NgClass } from '@angular/common';
import {Component, Input} from '@angular/core';
import {MatIcon} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {BreakpointObserverService, MediaSize} from '@core/services/breakpoint-observer.service';
import {URIComponentCodec} from '@core/services/codecs/uri-component-codec';
import {TranslatePipe} from '@ngx-translate/core';
import {OrganizationLogoComponent} from '../../../business/organisation/organization-logo/organization-logo.component';

@Component({
    selector: 'app-page-heading',
    templateUrl: './page-heading.component.html',
    styleUrls: ['./page-heading.component.scss'],
    imports: [NgClass, OrganizationLogoComponent, MatIcon, RouterLink, TranslatePipe]
})
export class PageHeadingComponent {

    @Input()
    organizationId: string;

    @Input()
    organizationName: string;

    @Input()
    icon: string;

    @Input()
    resourceTitle: string;

    @Input()
    status: string;

    @Input()
    organizationClickable = true;

    mediaSize: MediaSize;

    constructor(
        private readonly breakpointObserverService: BreakpointObserverService,
        protected readonly uriComponentCodec: URIComponentCodec,
    ) {
        this.mediaSize = this.breakpointObserverService.getMediaSize();
    }
}
