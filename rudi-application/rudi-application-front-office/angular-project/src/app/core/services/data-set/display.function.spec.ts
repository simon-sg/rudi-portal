import {detecterLigneEnTete, typeCellule} from './display.function';

describe('typeCellule', () => {
    it('détecte une valeur vide, null ou undefined', () => {
        expect(typeCellule('')).toBe('vide');
        expect(typeCellule(null)).toBe('vide');
        expect(typeCellule(undefined)).toBe('vide');
    });

    it('détecte un nombre', () => {
        expect(typeCellule(42)).toBe('nombre');
        expect(typeCellule(0)).toBe('nombre');
    });

    it('détecte une date', () => {
        expect(typeCellule(new Date())).toBe('date');
    });

    it('détecte du texte', () => {
        expect(typeCellule('Rennes')).toBe('texte');
    });
});

describe('detecterLigneEnTete', () => {
    it('détecte un en-tête texte au-dessus de colonnes numériques', () => {
        const lignes = [
            ['Commune', 'Population', 'Code INSEE'],
            ['Rennes', 220000, 35238],
            ['Cesson-Sévigné', 18000, 35051],
            ['Bruz', 19000, 35047]
        ];
        expect(detecterLigneEnTete(lignes)).toBe(true);
    });

    it('détecte l\'absence d\'en-tête quand toutes les lignes sont du même type numérique', () => {
        const lignes = [
            [35238, 220000],
            [35051, 18000],
            [35047, 19000],
            [35099, 5000]
        ];
        expect(detecterLigneEnTete(lignes)).toBe(false);
    });

    it('détecte un en-tête au-dessus de colonnes de dates', () => {
        const lignes = [
            ['Nom', 'Date de mise à jour'],
            ['Rennes', new Date('2026-01-01')],
            ['Bruz', new Date('2026-02-01')]
        ];
        expect(detecterLigneEnTete(lignes)).toBe(true);
    });

    it('suppose un en-tête par défaut quand toutes les colonnes sont du texte', () => {
        const lignes = [
            ['Commune', 'Departement'],
            ['Rennes', 'Ille-et-Vilaine'],
            ['Bruz', 'Ille-et-Vilaine']
        ];
        expect(detecterLigneEnTete(lignes)).toBe(true);
    });

    it('suppose un en-tête par défaut sur un tableau à une seule ligne', () => {
        expect(detecterLigneEnTete([['Commune', 'Population']])).toBe(true);
    });

    it('suppose un en-tête par défaut sur un tableau vide', () => {
        expect(detecterLigneEnTete([])).toBe(true);
    });
});
