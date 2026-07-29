import { NgClass } from '@angular/common';
import {Component, Input, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatOption} from '@angular/material/core';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatIcon} from '@angular/material/icon';
import {MatSelect, MatSelectChange} from '@angular/material/select';
import {DataSetAccessService} from '@core/services/data-set/data-set-access.service';
import {DisplayTableDataInterface} from '@core/services/data-set/display-table-data.interface';
import {DisplayTableService} from '@core/services/data-set/display-table.service';
import {IconRegistryService} from '@core/services/icon-registry.service';
import {KonsultMetierService} from '@core/services/konsult-metier.service';
import {LogService} from '@core/services/log.service';
import {TranslatePipe} from '@ngx-translate/core';
import {ErrorBoxComponent} from '@shared/core/common/error-box/error-box.component';
import {LoaderComponent} from '@shared/core/common/loader/loader.component';
import {ErrorWithCause} from '@shared/models/error-with-cause';
import {ALL_TYPES} from '@shared/models/title-icon-type';
import {Media, MediaFile, Metadata} from 'micro_service_modules/api-kaccess';
import {catchError, switchMap} from 'rxjs/operators';
import {WorkBook} from 'xlsx';
import {SpreadsheetComponent} from '../spreadsheet/spreadsheet.component';

const EMPTY_SEARCH = '';

@Component({
    selector: 'app-spreadsheet-tab',
    templateUrl: './spreadsheet-tab.component.html',
    styleUrls: ['./spreadsheet-tab.component.scss'],
    imports: [LoaderComponent, FormsModule, MatIcon, NgClass, MatCheckbox, ErrorBoxComponent, SpreadsheetComponent, TranslatePipe, MatFormField, MatLabel, MatSelect, MatOption]
})
export class SpreadsheetTabComponent implements OnInit {

    @Input()
    metadata: Metadata;

    @Input()
    mediaToDisplay: Media;

    /**
     * Liste des médias tabulaires candidats (CSV/Excel) pour le sélecteur de fichier au-dessus du
     * tableau. Fournie par DetailComponent (DetailComponent.tableMediaCandidates). Si elle contient
     * 0 ou 1 élément, le sélecteur n'est pas affiché (comportement identique à avant ce lot).
     */
    @Input()
    candidates: MediaFile[] = [];

    /** Le média actuellement affiché, initialisé depuis mediaToDisplay puis piloté par le sélecteur. */
    selectedMedia: Media;

    searchTerms = '';
    displayTableLoading = false;
    displayTable = false;
    usesHeader = false;
    displayTableData: DisplayTableDataInterface;
    workbook: WorkBook;
    errorAccess = false;
    errorDownloading = false;
    businessErrorMessage: string;
    unFilteredRowData: unknown[] = [];
    displayResults = false;

    constructor(
        private readonly displayTableService: DisplayTableService,
        private readonly iconRegistryService: IconRegistryService,
        private readonly logService: LogService,
        private readonly datasetAccessService: DataSetAccessService,
        private readonly konsultMetierService: KonsultMetierService
    ) {
        iconRegistryService.addAllSvgIcons(ALL_TYPES);
    }

    switchHeader(): void {
        this.usesHeader = !this.usesHeader;
        this.displayTableData = this.displayTableService.convertToDisplayableData(this.workbook, this.usesHeader);
        this.unFilteredRowData = this.displayTableData.rowData;
        this.onReset();
    }

    ngOnInit(): void {
        if (this.metadata && this.mediaToDisplay) {
            this.selectedMedia = this.mediaToDisplay;
            this.loadTable(this.selectedMedia);
        }
    }

    /**
     * Déclenché par le sélecteur de fichier au-dessus du tableau, quand le JDD propose plusieurs
     * fichiers tabulaires. Recharge entièrement le tableau pour le fichier nouvellement choisi.
     */
    onMediaSelected(event: MatSelectChange): void {
        const media: Media = event.value;
        if (media === this.selectedMedia) {
            return;
        }
        this.selectedMedia = media;
        this.searchTerms = EMPTY_SEARCH;
        this.displayResults = false;
        this.loadTable(media);
    }

    /**
     * Fonction permettant de retourner l'extension du fichier, utilisée pour le libellé du
     * sélecteur de fichier quand le média candidat n'a pas de media_name.
     */
    getMediaFileExtension(media: Media): string {
        return this.konsultMetierService.getMediaFileExtension(media);
    }

    /**
     * Télécharge et convertit en tableau affichable le fichier correspondant au média donné.
     * Extrait de l'ancien corps de ngOnInit pour pouvoir être rejoué à chaque changement de
     * sélection dans le nouveau sélecteur de fichier.
     * @private
     */
    private loadTable(media: Media): void {
        this.displayTableLoading = true;
        this.errorAccess = false;
        this.errorDownloading = false;
        this.businessErrorMessage = undefined;
        this.datasetAccessService.hasAccess(this.metadata).pipe(
            switchMap((hasAccess: boolean) => {
                if (hasAccess) {
                    this.errorAccess = false;
                    return this.displayTableService.downloadTableFile(media.connector.url).pipe(
                        catchError((error) => {
                            // Cas erreur avec un message à afficher côté front
                            if (error instanceof ErrorWithCause && error.code != null) {
                                this.businessErrorMessage = error.functionalMessage;
                                throw error;
                            }

                            // Cas erreur générique => message générique
                            this.errorDownloading = true;
                            throw new ErrorWithCause('Erreur lors du téléchargement des données', error);
                        })
                    );
                } else {
                    this.errorAccess = true;
                    throw new Error('Accès à la fonctionnalité d\'affichage tabulaire interdit dans ce contexte');
                }
            })
        ).subscribe({
            next: (workbook: WorkBook) => {
                this.errorDownloading = false;
                this.displayTableLoading = false;
                this.displayTable = true;
                this.workbook = workbook;
                this.displayTableData = this.displayTableService.convertToDisplayableData(this.workbook, this.usesHeader);
                this.unFilteredRowData = this.displayTableData.rowData;
            },
            error: (e) => {
                this.logService.error(e);
                this.displayTableLoading = false;
                this.displayTable = false;
            }
        });
    }

    /**
     * Fonction permettant de vider le champ input de la recherche et l'initialisation de la liste
     */
    onReset(): void {
        this.searchTerms = EMPTY_SEARCH;
        this.displayTableData.rowData = this.unFilteredRowData;
        this.onChanges();
    }

    /**
     * Méthode liée au déclenchement de l'event "key.enter" du champ de recherche
     */
    onChanges(): void {
        if (this.searchTerms) {
            this.displayTableData.rowData = this.filteredRowData;
            this.displayResults = true;
        } else {
            this.displayTableData.rowData = this.unFilteredRowData;
            this.displayResults = false;
        }

    }

    get filteredRowData(): unknown[] {
        const filterText = this.searchTerms.toLowerCase();
        return this.displayTableData.rowData.filter((data: unknown) => {
            return Object.values(data).some((value: unknown) => {
                return String(value).toLowerCase().includes(filterText);
            });
        });
    }
}
